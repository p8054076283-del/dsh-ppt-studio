# -*- coding: utf-8 -*-
"""把一份 .pptx 原样转成工作台的 deck.json（几何 / 文字 / 图片 / 表格都保留）。

用法：
    python import-pptx.py <pptx 路径> <工作区目录> [--out <deck.json 路径>]

产出：
    <工作区>/.ppt-studio/deck.json        每页 layout = "imported"，elements 保留原始绝对坐标
    <工作区>/.ppt-studio/assets/imported/ 从 pptx 里抽出的图片（按内容去重）

设计取舍：
    * pptx 的坐标本来就是英寸（EMU/914400），工作台画布 13.333 x 7.5 英寸，直接对应；
      非 16:9 的源文件按画布等比缩放，字号同步缩放。
    * 文本只保留「位置/字号/颜色/粗体/对齐/垂直对齐/字体名」，段落内多字形差异合并为
      首字形的样式——这是工作台元素模型的能力边界。
    * 渐变、阴影、旋转、图表、SmartArt 不还原；形状只取纯色填充。
"""
import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Emu

EMU_PER_INCH = 914400
CANVAS_W = 13.333
CANVAS_H = 7.5
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}
DEFAULT_FONT = "Microsoft YaHei"


def qn(tag):
    prefix, local = tag.split(":")
    return "{%s}%s" % (NS[prefix], local)


def inch(value):
    if value is None:
        return None
    return value / EMU_PER_INCH


def rgb(value):
    if not value:
        return None
    return "#" + value.upper()


def theme_info(prs):
    """主题调色板（accent1/dk1/lt1…）与字体方案（+mn-lt 这类别名）。"""
    mapping = {}
    fonts = {}
    master = prs.slide_masters[0]
    theme = None
    for rel in master.part.rels.values():
        if "theme" in rel.reltype:
            theme = rel.target_part
            break
    if theme is None:
        return mapping, fonts
    root = etree.fromstring(theme.blob)
    scheme_fonts = root.find(".//a:fontScheme", NS)
    if scheme_fonts is not None:
        for role, alias in (("majorFont", "mj"), ("minorFont", "mn")):
            node = scheme_fonts.find(f"a:{role}", NS)
            if node is None:
                continue
            for script, suffix in (("latin", "lt"), ("ea", "ea")):
                face = node.find(f"a:{script}", NS)
                if face is not None and face.get("typeface"):
                    fonts[f"+{alias}-{suffix}"] = face.get("typeface")
    scheme = root.find(".//a:clrScheme", NS)
    if scheme is None:
        return mapping
    for child in scheme:
        name = etree.QName(child).localname
        value = child[0]
        hex_value = value.get("val") or value.get("lastClr")
        if hex_value:
            mapping[name] = "#" + hex_value.upper()
    # tx1/bg1/tx2/bg2 是 dk1/lt1/dk2/lt2 的别名
    for alias, source in (("tx1", "dk1"), ("bg1", "lt1"), ("tx2", "dk2"), ("bg2", "lt2")):
        if source in mapping:
            mapping[alias] = mapping[source]
    return mapping, fonts


def resolve_color(color_format, palette, fallback=None):
    """ColorFormat → #RRGGBB（主题色查调色板，透明/继承则回退）。"""
    try:
        kind = color_format.type
    except Exception:
        return fallback
    if kind is None:
        return fallback
    try:
        if kind == 1:  # MSO_COLOR_TYPE.RGB
            value = color_format.rgb
            return rgb(str(value))
        if kind == 2:  # MSO_COLOR_TYPE.SCHEME
            scheme = str(color_format.theme_color).split(".")[0]
            key = scheme.lower()
            return palette.get(key) or palette.get(key.replace("accent", "accent")) or fallback
    except Exception:
        return fallback
    return fallback


def level1_run_props(shape):
    """占位符在版式里定义的「一级文本」默认样式：字号 / 粗体 / 颜色。"""
    out = {}
    try:
        tx = shape._element.find(".//p:txBody", NS)
    except Exception:
        return out
    if tx is None:
        return out
    node = tx.find("a:lstStyle/a:lvl1pPr/a:defRPr", NS)
    if node is None:
        return out
    if node.get("sz"):
        out["size"] = int(node.get("sz")) / 100.0
    if node.get("b") is not None:
        out["bold"] = node.get("b") in ("1", "true")
    face = node.find("a:latin", NS)
    if face is not None and face.get("typeface"):
        out["face"] = face.get("typeface")
    fill = node.find("a:solidFill", NS)
    if fill is not None and len(fill):
        child = fill[0]
        if etree.QName(child).localname == "srgbClr":
            out["color"] = rgb(child.get("val"))
        elif etree.QName(child).localname == "schemeClr":
            out["scheme"] = child.get("val")
    return out


def placeholder_style(shape, layout, master):
    """从版式/母版里同名占位符取继承样式（模板的标题字号往往写在这层）。"""
    try:
        ph = shape._element.find(".//p:nvSpPr/p:nvPr/p:ph", NS)
    except Exception:
        return {}
    if ph is None:
        return {}
    idx = ph.get("idx")
    typ = ph.get("type")
    for container in (layout, master):
        if container is None:
            continue
        for candidate in container.shapes:
            if not getattr(candidate, "is_placeholder", False):
                continue
            try:
                cph = candidate._element.find(".//p:nvSpPr/p:nvPr/p:ph", NS)
            except Exception:
                continue
            if cph is None:
                continue
            if (idx is not None and cph.get("idx") == idx) or (typ is not None and cph.get("type") == typ):
                found = level1_run_props(candidate)
                if found:
                    return found
    return {}


def resolve_face(name, fonts):
    """'+mn-lt' 这类主题字体别名换成真实字体名；解析不出来就交给主题默认。"""
    if not name:
        return None
    if not str(name).startswith("+"):
        return name
    return (fonts or {}).get(str(name))


def line_color(shape, palette, fallback=None):
    """轮廓色：只有边线的卡片/分隔条也要画出来。"""
    try:
        line = shape.line
        if line is None or line.fill.type is None:
            return fallback
        return resolve_color(line.color, palette, fallback)
    except Exception:
        return fallback


ALPHA_LIKE = ("alpha", "alphaMod", "alphaOff")


def _apply_color_mods(rgb, node):
    """lumMod / lumOff / shade / tint / alpha 等修饰：按 HSL 近似还原。"""
    import colorsys

    r, g, b = [v / 255.0 for v in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    for child in node:
        name = etree.QName(child).localname
        try:
            raw = child.get("val")
            value = int(raw) / 100000.0 if raw is not None else None
        except Exception:
            continue
        if value is None:
            continue
        if name == "lumMod":
            l *= value
        elif name == "lumOff":
            l = min(1.0, l + value)
        elif name == "shade":
            r, g, b = r * value, g * value, b * value
            continue
        elif name == "tint":
            r, g, b = r + (1 - r) * (1 - value), g + (1 - g) * (1 - value), b + (1 - b) * (1 - value)
            continue
    if "shade" in etree.tostring(node, encoding="unicode") or "tint" in etree.tostring(node, encoding="unicode"):
        return tuple(max(0, min(255, int(round(v * 255)))) for v in (r, g, b))
    h, l, s = colorsys.rgb_to_hls(max(0, min(1, r)), max(0, min(1, g)), max(0, min(1, b)))
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return tuple(max(0, min(255, int(round(v * 255)))) for v in (r, g, b))


def _alpha_of(node):
    alpha = node.find("a:alpha", NS)
    if alpha is None:
        return 1.0
    try:
        return max(0.0, min(1.0, int(alpha.get("val")) / 100000.0))
    except Exception:
        return 1.0


def css_from_color_node(node, palette):
    """一个颜色节点（srgbClr / schemeClr / sysClr）→ CSS 颜色，带 alpha。"""
    tag = etree.QName(node).localname
    if tag == "srgbClr":
        value = node.get("val")
        if not value:
            return None
        rgb = tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))
    elif tag == "sysClr":
        value = node.get("lastClr") or node.get("val")
        if not value or len(value) != 6:
            return None
        rgb = tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))
    elif tag == "schemeClr":
        base = palette.get(node.get("val"))
        if not base:
            return None
        base = base.lstrip("#")
        try:
            rgb = tuple(int(base[i : i + 2], 16) for i in (0, 2, 4))
        except Exception:
            return None
        rgb = _apply_color_mods(rgb, node)
    else:
        return None
    alpha = _alpha_of(node)
    if alpha >= 0.999:
        return "#%02X%02X%02X" % rgb
    return "rgba(%d,%d,%d,%.3f)" % (rgb[0], rgb[1], rgb[2], alpha)


def gradient_css(grad_fill, palette):
    """OOXML 线性渐变 → CSS linear-gradient（保留每个色标的透明度）。"""
    stops = grad_fill.find("a:gsLst", NS)
    if stops is None:
        return None
    parts = []
    for gs in stops:
        if not len(gs):
            continue
        color = css_from_color_node(gs[0], palette)
        if not color:
            continue
        try:
            pos = int(gs.get("pos")) / 1000.0
        except Exception:
            pos = 0.0
        parts.append("%s %.1f%%" % (color, pos))
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0].split(" ")[0]
    angle = 90.0
    lin = grad_fill.find("a:lin", NS)
    if lin is not None:
        try:
            angle = (int(lin.get("ang")) / 60000.0 + 90.0) % 360
        except Exception:
            angle = 90.0
    return "linear-gradient(%.1fdeg, %s)" % (angle, ", ".join(parts))


def color_from_rpr(rpr, palette, fallback=None):
    """rPr / defRPr / endParaRPr 里的文字颜色：srgbClr 直接取，schemeClr 查调色板再套修饰。"""
    if rpr is None:
        return fallback
    fill = rpr.find("a:solidFill", NS)
    if fill is None or not len(fill):
        return fallback
    child = fill[0]
    tag = etree.QName(child).localname
    if tag == "srgbClr":
        value = child.get("val")
        return "#" + value.upper() if value else fallback
    if tag == "schemeClr":
        name = child.get("val")
        base = palette.get(name)
        if not base:
            return fallback
        base = base.lstrip("#")
        try:
            rgb = tuple(int(base[i : i + 2], 16) for i in (0, 2, 4))
        except Exception:
            return fallback
        r, g, b = _apply_color_mods(rgb, child)
        return "#%02X%02X%02X" % (r, g, b)
    if tag == "sysClr":
        value = child.get("lastClr") or child.get("val")
        return "#" + value.upper() if value else fallback
    return fallback


def theme_style_lists(prs):
    """主题里的 fillStyleLst / lnStyleLst —— p:style 的 fillRef/lnRef 指向这里。"""
    master = prs.slide_masters[0]
    theme = None
    for rel in master.part.rels.values():
        if "theme" in rel.reltype:
            theme = rel.target_part
            break
    if theme is None:
        return [], []
    root = etree.fromstring(theme.blob)
    scheme = root.find(".//a:fmtScheme", NS)
    if scheme is None:
        return [], []
    fills = scheme.find("a:fillStyleLst", NS)
    lines = scheme.find("a:lnStyleLst", NS)
    return list(fills) if fills is not None else [], list(lines) if lines is not None else []


def _substitute_phclr(template, color_node):
    """把模板里的 a:phClr 换成 ref 给的颜色节点。"""
    cloned = copy.deepcopy(template)
    if color_node is None:
        return cloned
    for holder in cloned.iter():
        for index, child in enumerate(list(holder)):
            if etree.QName(child).localname in ("phClr", "schemeClr", "srgbClr") and etree.QName(holder).localname in ("solidFill", "gradFill", "gs"):
                holder.replace(child, copy.deepcopy(color_node))
    for ph in list(cloned.iter("{%s}phClr" % NS["a"])):
        parent = ph.getparent()
        if parent is not None:
            parent.replace(ph, copy.deepcopy(color_node))
    return cloned


def style_ref_css(shape, ref_tag, palette, styles):
    """p:style/a:fillRef(或 lnRef) → CSS 填充；无显式 spPr 填充时的兜底。"""
    try:
        style = shape._element.find(".//p:style", NS)
        if style is None:
            return None
        ref = style.find("a:" + ref_tag, NS)
        if ref is None:
            return None
        try:
            index = int(ref.get("idx") or "0")
        except Exception:
            index = 0
        if index <= 0 or index > len(styles):
            return None
        color_node = ref[0] if len(ref) else None
        resolved = _substitute_phclr(styles[index - 1], color_node)
        solid = resolved.find("a:solidFill", NS)
        if solid is not None and len(solid):
            return css_from_color_node(solid[0], palette)
        grad = resolved.find("a:gradFill", NS)
        if grad is not None:
            return gradient_css(grad, palette)
    except Exception:
        return None
    return None


def fill_css(shape, palette, fallback=None):
    """形状填充 → CSS：渐变照抄，纯色带 alpha。"""
    try:
        sp_pr = shape._element.find(".//p:spPr", NS)
    except Exception:
        sp_pr = None
    if sp_pr is not None:
        grad = sp_pr.find("a:gradFill", NS)
        if grad is not None:
            css = gradient_css(grad, palette)
            if css:
                return css
        solid = sp_pr.find("a:solidFill", NS)
        if solid is not None and len(solid):
            css = css_from_color_node(solid[0], palette)
            if css:
                return css
    return fill_color(shape, palette, fallback)


def fill_color(shape, palette, fallback=None):
    """纯色填充 → #RRGGBB；渐变取第一个色标；其余返回 None。"""
    try:
        fill = shape.fill
        kind = fill.type
    except Exception:
        return fallback
    if kind is None:
        return fallback
    try:
        if kind == 1:  # solid
            return resolve_color(fill.fore_color, palette, fallback)
        if kind == 3:  # gradient
            stops = fill.gradient_stops
            if stops:
                return resolve_color(stops[0].color, palette, fallback)
    except Exception:
        return fallback
    return fallback


def text_spans(text_frame, palette, fonts, scale, fallback_color, fallback_size):
    """按 run 拆出 [{'t','size','color','bold'}]，仅在样式确实不一致时才用。"""
    spans = []
    for paragraph in text_frame.paragraphs:
        if spans:
            spans.append(dict(spans[-1], t="\n"))
        for run in paragraph.runs:
            text = run.text.replace("\x0b", "\n")
            if not text:
                continue
            rpr = run._r.find("a:rPr", NS)
            size = None
            if run.font.size is not None:
                size = run.font.size.pt
            elif rpr is not None and rpr.get("sz"):
                try:
                    size = int(rpr.get("sz")) / 100.0
                except Exception:
                    size = None
            color = color_from_rpr(rpr, palette)
            bold = bool(run.font.bold) if run.font.bold is not None else False
            face = run.font.name
            spans.append(
                {
                    "t": text,
                    "size": round((size or fallback_size) * scale, 2),
                    "color": color or fallback_color,
                    "bold": bold,
                    "face": resolve_face(face, fonts) if face else None,
                }
            )
    return spans


def spans_are_uniform(spans):
    styles = set()
    for span in spans:
        if not span["t"].strip():
            continue
        styles.add((round(span["size"], 1), span["color"].upper(), span["bold"], span["face"] or ""))
        if len(styles) > 1:
            return False
    return True


def merge_spans(spans):
    """相邻同样式合并，去掉空段，输出紧凑结构。"""
    out = []
    for span in spans:
        if not span["t"]:
            continue
        last = out[-1] if out else None
        if last and (last.get("size"), last.get("color"), last.get("bold"), last.get("face")) == (
            span.get("size"),
            span.get("color"),
            span.get("bold"),
            span.get("face"),
        ):
            last["t"] += span["t"]
        else:
            entry = {"t": span["t"], "size": span["size"], "color": span["color"]}
            if span["bold"]:
                entry["bold"] = True
            if span.get("face"):
                entry["face"] = span["face"]
            out.append(entry)
    return out


def text_style(text_frame, palette, theme_fallback, fonts=None):
    """整段采用第一处显式样式：字号 / 粗体 / 颜色 / 字体 / 对齐 / 垂直对齐。"""
    size = None
    bold = False
    color = None
    face = None
    for paragraph in text_frame.paragraphs:
        if size is None and paragraph.font.size:
            size = paragraph.font.size.pt
        for run in paragraph.runs:
            if size is None and run.font.size:
                size = run.font.size.pt
            if not bold and run.font.bold:
                bold = True
            if color is None:
                color = color_from_rpr(run._r.find("a:rPr", NS), palette)
            if color is None:
                color = color_from_rpr(paragraph._p.find("a:pPr/a:defRPr", NS), palette)
            if face is None and run.font.name:
                face = resolve_face(run.font.name, fonts)
        if face is None and paragraph.font.name:
            face = resolve_face(paragraph.font.name, fonts)
    align = "left"
    for paragraph in text_frame.paragraphs:
        if paragraph.alignment is not None:
            value = str(paragraph.alignment).split(".")[0].split(" ")[0].upper()
            if "CENTER" in value:
                align = "center"
            elif "RIGHT" in value:
                align = "right"
            break
    valign = "top"
    anchor = getattr(text_frame, "vertical_anchor", None)
    if anchor is not None:
        name = str(anchor).upper()
        if "MIDDLE" in name:
            valign = "middle"
        elif "BOTTOM" in name:
            valign = "bottom"
    return {
        "size": round(size, 2) if size else None,
        "bold": bold,
        "color": color or theme_fallback,
        "font": face,
        "align": align,
        "valign": valign,
    }


def paragraph_text(text_frame):
    lines = []
    for paragraph in text_frame.paragraphs:
        raw = paragraph.text.replace("\x0b", "\n")
        if raw.strip():
            lines.append(raw)
    return "\n".join(lines)


CJK_RE = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
CJK_FACES = ("yahei", "simsun", "simhei", "song", "hei", "kai", "fang", "pingfang", "source han", "noto", "思源", "宋", "黑", "楷", "雅黑")


def face_fits(face, text):
    """西文字体（Arial/Times…）只用来排纯西文；含中文的文本交给主题的 CJK 字体。"""
    if not face:
        return False
    lowered = str(face).lower()
    if any(token in lowered for token in CJK_FACES):
        return True
    return not bool(CJK_RE.search(text or ""))


def text_no_wrap(shape):
    """pptx 里 wrap="none" 的文本框在 PowerPoint 里永远单行；照抄，别让它折行。"""
    try:
        body_pr = shape.text_frame._txBody.find("a:bodyPr", NS)
        if body_pr is not None and body_pr.get("wrap") == "none":
            return True
    except Exception:
        pass
    return False


def shape_radius_pct(shape, width_in, height_in):
    """roundRect 的圆角 / ellipse → 百分比（CSS border-radius 用）。"""
    try:
        sp_pr = shape._element.find(".//p:spPr", NS)
        geom = sp_pr.find("a:prstGeom", NS) if sp_pr is not None else None
        if geom is None:
            return None
        preset = geom.get("prst")
        if preset == "ellipse":
            return 50.0
        if preset == "roundRect":
            node = geom.find("a:avLst/a:gd", NS)
            adj = 0.16667
            if node is not None:
                formula = node.get("fmla") or ""
                try:
                    adj = int(formula.split()[-1]) / 100000.0
                except Exception:
                    adj = 0.16667
            smaller = min(width_in, height_in) or 0
            radius = adj * smaller
            if width_in:
                return round(min(50.0, (radius / width_in) * 100.0), 2)
    except Exception:
        return None
    return None


def shape_text(shape):
    if not getattr(shape, "has_text_frame", False):
        return ""
    try:
        return paragraph_text(shape.text_frame)
    except Exception:
        return ""


def has_unrenderable(slide):
    """图表 / SmartArt / OLE 这类我们画不出来的东西：整页转为图片最稳。"""
    def walk(shapes):
        for shape in shapes:
            try:
                if getattr(shape, "has_chart", False) and shape.has_chart:
                    return True
            except Exception:
                pass
            try:
                graphic = shape._element.find(".//a:graphicData", NS)
                if graphic is not None:
                    uri = (graphic.get("uri") or "").lower()
                    if "chart" in uri or "diagram" in uri:
                        return True
            except Exception:
                pass
            try:
                if shape.shape_type == MSO_SHAPE_TYPE.GROUP and walk(shape.shapes):
                    return True
            except Exception:
                pass
        return False

    return walk(slide.shapes)


def find_soffice():
    candidates = [
        os.environ.get("DSH_SOFFICE"),
        "soffice",
        "soffice.exe",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/usr/bin/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
        if os.path.isfile(candidate):
            return candidate
    return None


def find_pdftoppm():
    for candidate in (os.environ.get("DSH_PDFTOPPM"), "pdftoppm", "pdftoppm.exe", "pdftocairo"):
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
    return None


def rasterize_slides(pptx_path, pages, out_dir):
    """pptx → pdf（LibreOffice）→ PNG（poppler）。返回 {页码: png 路径}。"""
    soffice = find_soffice()
    poppler = find_pdftoppm()
    if not soffice or not poppler:
        return {}, "缺少 LibreOffice 或 pdftoppm"
    tmp = tempfile.mkdtemp(prefix="ppt-raster-")
    try:
        subprocess.run(
            [soffice, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, pptx_path],
            check=True,
            capture_output=True,
            timeout=300,
        )
        stem = os.path.splitext(os.path.basename(pptx_path))[0]
        pdf = os.path.join(tmp, stem + ".pdf")
        if not os.path.isfile(pdf):
            found = [f for f in os.listdir(tmp) if f.lower().endswith(".pdf")]
            if not found:
                return {}, "LibreOffice 没产出 PDF"
            pdf = os.path.join(tmp, found[0])
        os.makedirs(out_dir, exist_ok=True)
        result = {}
        for page in pages:
            prefix = os.path.join(tmp, f"page-{page:03d}")
            subprocess.run(
                [poppler, "-f", str(page), "-l", str(page), "-r", "150", "-png", pdf, prefix],
                check=True,
                capture_output=True,
                timeout=180,
            )
            produced = sorted(
                os.path.join(tmp, name) for name in os.listdir(tmp) if name.startswith(os.path.basename(prefix)) and name.endswith(".png")
            )
            if not produced:
                continue
            with open(produced[0], "rb") as handle:
                blob = handle.read()
            digest = hashlib.sha1(blob).hexdigest()[:10]
            target = os.path.join(out_dir, f"slide-{page:02d}-{digest}.png")
            with open(target, "wb") as handle:
                handle.write(blob)
            result[page] = target
        return result, None
    except Exception as error:
        return {}, str(error)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def ext_of(image):
    ext = (image.ext or "png").lower()
    if ext == "jpeg":
        ext = "jpg"
    return ext


class Importer:
    def __init__(self, pptx_path, workspace, out_path=None, rasterize=True):
        self.pptx_path = pptx_path
        self.use_raster = rasterize
        self.prs = Presentation(pptx_path)
        self.workspace = workspace
        self.deck_dir = os.path.join(workspace, ".ppt-studio")
        self.asset_dir = os.path.join(self.deck_dir, "assets", "imported")
        self.out_path = out_path or os.path.join(self.deck_dir, "deck.json")
        self.palette, self.theme_fonts = theme_info(self.prs)
        self.fill_styles, self.line_styles = theme_style_lists(self.prs)
        self.canvas_bg = self.palette.get("bg1") or "#FFFFFF"
        self.current_layout = None
        self.current_master = None
        self.src_w = inch(self.prs.slide_width) or CANVAS_W
        self.src_h = inch(self.prs.slide_height) or CANVAS_H
        self.sx = CANVAS_W / self.src_w if self.src_w else 1.0
        self.sy = CANVAS_H / self.src_h if self.src_h else 1.0
        self.written = {}
        self.stats = {"slides": 0, "text": 0, "image": 0, "shape": 0, "table": 0, "skipped": 0, "rasterized": 0}
        self.raster_map = {}
        self.raster_note = None
        self.faces = {}

    # ---------------- 图片落盘 ----------------
    def save_image(self, image):
        blob = image.blob
        digest = hashlib.sha1(blob).hexdigest()[:10]
        ext = ext_of(image)
        name = f"{digest}.{ext}"
        if name in self.written:
            return self.written[name]
        os.makedirs(self.asset_dir, exist_ok=True)
        with open(os.path.join(self.asset_dir, name), "wb") as handle:
            handle.write(blob)
        rel = f"assets/imported/{name}"
        self.written[name] = rel
        return rel

    # ---------------- 坐标 ----------------
    # 变换用仿射对表示：(ax, tx, ay, ty) 满足 x' = ax*x + tx（单位：父空间英寸）。
    # group 会把子坐标从 chOff 空间映射回父空间，再叠加父变换——嵌套也能正确展开。
    IDENTITY = (1.0, 0.0, 1.0, 0.0)

    def mapped(self, shape, transform):
        ax, tx, ay, ty = transform
        left = inch(shape.left) or 0
        top = inch(shape.top) or 0
        width = inch(shape.width) or 0
        height = inch(shape.height) or 0
        x = ax * left + tx
        y = ay * top + ty
        w = width * abs(ax)
        h = height * abs(ay)
        return (round(x * self.sx, 3), round(y * self.sy, 3), round(w * self.sx, 3), round(h * self.sy, 3))

    def group_transform(self, group, transform):
        xfrm = group._element.find(".//a:xfrm", NS)
        if xfrm is None:
            return transform
        off = xfrm.find("a:off", NS)
        ext = xfrm.find("a:ext", NS)
        ch_off = xfrm.find("a:chOff", NS)
        ch_ext = xfrm.find("a:chExt", NS)
        if off is None or ext is None:
            return transform
        off_x = int(off.get("x")) / EMU_PER_INCH
        off_y = int(off.get("y")) / EMU_PER_INCH
        ext_w = int(ext.get("cx")) / EMU_PER_INCH
        ext_h = int(ext.get("cy")) / EMU_PER_INCH
        ch_x = (int(ch_off.get("x")) if ch_off is not None else int(off.get("x"))) / EMU_PER_INCH
        ch_y = (int(ch_off.get("y")) if ch_off is not None else int(off.get("y"))) / EMU_PER_INCH
        ch_w = (int(ch_ext.get("cx")) if ch_ext is not None else int(ext.get("cx"))) / EMU_PER_INCH
        ch_h = (int(ch_ext.get("cy")) if ch_ext is not None else int(ext.get("cy"))) / EMU_PER_INCH
        kx = ext_w / ch_w if ch_w else 1.0
        ky = ext_h / ch_h if ch_h else 1.0
        # 子坐标 → 父坐标：x_p = off_x + (x_c - ch_x) * kx
        local_tx = off_x - ch_x * kx
        local_ty = off_y - ch_y * ky
        ax, tx, ay, ty = transform
        return (ax * kx, ax * local_tx + tx, ay * ky, ay * local_ty + ty)

    def font_scale(self):
        return min(self.sx, self.sy)

    # ---------------- 形状遍历 ----------------
    def walk(self, shapes, elements, transform=None):
        """transform = (ax, tx, ay, ty)：子坐标 → 父坐标的仿射对（英寸）。"""
        current = transform or self.IDENTITY
        for shape in shapes:
            try:
                self.emit(shape, elements, current)
            except Exception as error:  # 单个形状失败不该毁掉整页
                self.stats["skipped"] += 1
                sys.stderr.write(f"[skip] {shape.shape_type} {shape.name}: {error}\n")

    def emit(self, shape, elements, transform=None):
        current = transform or self.IDENTITY
        kind = shape.shape_type
        if kind == MSO_SHAPE_TYPE.GROUP:
            self.walk(shape.shapes, elements, self.group_transform(shape, current))
            return
        if kind == MSO_SHAPE_TYPE.PICTURE:
            self.emit_picture(shape, elements, current)
            return
        if getattr(shape, "has_table", False) and shape.has_table:
            self.emit_table(shape, elements, current)
            return
        text = shape_text(shape)
        nowrap = text_no_wrap(shape)
        fill = fill_css(shape, self.palette) or style_ref_css(shape, "fillRef", self.palette, self.fill_styles)
        stroke = line_color(shape, self.palette) or style_ref_css(shape, "lnRef", self.palette, self.line_styles)
        x, y, w, h = self.mapped(shape, current)
        if (kind == MSO_SHAPE_TYPE.AUTO_SHAPE or kind == MSO_SHAPE_TYPE.TEXT_BOX) and w > 0 and h > 0 and (fill or stroke):
            element = {
                "id": self.next_id("s"),
                "type": "shape",
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "fill": fill or self.canvas_bg,
            }
            if stroke:
                element["line"] = stroke
            radius = shape_radius_pct(shape, w, h)
            if radius:
                element["radiusPct"] = radius
            elements.append(element)
            self.stats["shape"] += 1
        elif kind == MSO_SHAPE_TYPE.FREEFORM:
            # 直线/装饰线：用极薄的填充块表示
            line = fill
            try:
                if line is None and shape.line.color and shape.line.color.type is not None:
                    line = resolve_color(shape.line.color, self.palette)
            except Exception:
                line = None
            if line and w > 0 and h >= 0:
                elements.append({"id": self.next_id("s"), "type": "shape", "x": x, "y": y, "w": max(w, 0.01), "h": max(h, 0.01), "fill": line})
                self.stats["shape"] += 1
        if text.strip():
            style = text_style(shape.text_frame, self.palette, "#2B2B2B", self.theme_fonts)
            inherited = placeholder_style(shape, self.current_layout, self.current_master)
            if style["size"] is None and inherited.get("size"):
                style["size"] = inherited["size"]
            if not style["bold"] and inherited.get("bold"):
                style["bold"] = True
            if style["color"] in (None, "#2B2B2B") and inherited.get("color"):
                style["color"] = inherited["color"]
            if style["font"] is None and inherited.get("face"):
                style["font"] = resolve_face(inherited["face"], self.theme_fonts)
            size = style["size"] or 18
            size = round(size * self.font_scale(), 2)
            if style["font"]:
                self.faces[style["font"]] = self.faces.get(style["font"], 0) + 1
            element = {
                "id": self.next_id("t"),
                "type": "text",
                "role": "title" if (style["size"] or 0) >= 24 else "body",
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "text": text,
                "size": size,
                "color": style["color"],
                "bold": style["bold"],
                "align": style["align"],
                "valign": style["valign"],
            }
            if style["font"] and face_fits(style["font"], text):
                element["font"] = style["font"]
            if nowrap:
                element["nowrap"] = True
            # 同一文本框里字号/颜色/粗细不一致时，把 runs 一起带上（「242.87 h」的 h 要更小）
            try:
                runs = text_spans(shape.text_frame, self.palette, self.theme_fonts, self.font_scale(), style["color"], size)
                if runs and not spans_are_uniform(runs):
                    merged = merge_spans(runs)
                    if merged:
                        element["spans"] = merged
                        element["size"] = max((span.get("size") or size) for span in merged)
            except Exception as error:
                sys.stderr.write(f"[spans] {shape.name}: {error}\n")
            elements.append(element)
            self.stats["text"] += 1

    def emit_picture(self, shape, elements, transform):
        x, y, w, h = self.mapped(shape, transform or self.IDENTITY)
        try:
            rel = self.save_image(shape.image)
        except Exception:
            self.stats["skipped"] += 1
            return
        elements.append({"id": self.next_id("m"), "type": "image", "x": x, "y": y, "w": w, "h": h, "src": rel, "fit": "cover"})
        self.stats["image"] += 1

    def emit_table(self, shape, elements, transform):
        x, y, w, h = self.mapped(shape, transform or self.IDENTITY)
        table = shape.table
        rows = []
        for row in table.rows:
            rows.append([cell.text.replace("\x0b", "\n") for cell in row.cells])
        if not rows:
            return
        columns = rows[0] if rows else []
        body = rows[1:] if len(rows) > 1 else [[] for _ in columns]
        elements.append({"id": self.next_id("tb"), "type": "table", "x": x, "y": y, "w": w, "h": h, "columns": columns, "rows": body, "size": 14})
        self.stats["table"] += 1

    def next_id(self, prefix):
        self.seq += 1
        return f"{prefix}{self.seq}"

    # ---------------- 单页 ----------------
    def fill_of(self, node):
        """slides 的背景只看它自己的 p:bg（没写就是继承），支持纯色 / 渐变 / bgRef。"""
        try:
            bg = node._element.find(".//p:cSld/p:bg", NS)
        except Exception:
            return None
        if bg is None:
            return None
        bg_pr = bg.find("p:bgPr", NS)
        if bg_pr is not None:
            grad = bg_pr.find("a:gradFill", NS)
            if grad is not None:
                css = gradient_css(grad, self.palette)
                if css:
                    return css
            solid = bg_pr.find("a:solidFill", NS)
            if solid is not None and len(solid):
                return css_from_color_node(solid[0], self.palette)
        ref = bg.find("p:bgRef", NS)
        if ref is not None:
            clr = ref.find("a:schemeClr", NS)
            if clr is not None:
                return css_from_color_node(clr, self.palette)
        return None

    def effective_background(self, slide):
        """模板常把底纹放在版式/母版上：逐级往上找。"""
        for node in (slide, slide.slide_layout, slide.slide_layout.slide_master):
            if node is None:
                continue
            value = self.fill_of(node)
            if value:
                return value
        return None

    def inherited_shapes(self, slide):
        """母版 → 版式 上的可见装饰（跳过占位符里的提示文字占位）。"""
        out = []
        master = slide.slide_layout.slide_master
        if master is not None:
            out.append((master, master.shapes))
        out.append((slide.slide_layout, slide.slide_layout.shapes))
        return out

    def include_inherited(self, container, shapes, elements):
        for shape in shapes:
            try:
                if shape.is_placeholder:
                    # 占位符的文字由本页自己的形状提供；只有它自带填充/边框时才保留成色块
                    if fill_css(shape, self.palette) or line_color(shape, self.palette):
                        self.emit_shape_only(shape, elements)
                    continue
                self.emit(shape, elements, self.IDENTITY)
            except Exception as error:
                self.stats["skipped"] += 1
                sys.stderr.write(f"[skip master] {shape.name}: {error}\n")

    def emit_shape_only(self, shape, elements):
        x, y, w, h = self.mapped(shape, self.IDENTITY)
        if w <= 0 or h <= 0:
            return
        fill = fill_css(shape, self.palette) or self.canvas_bg
        stroke = line_color(shape, self.palette)
        element = {"id": self.next_id("s"), "type": "shape", "x": x, "y": y, "w": w, "h": h, "fill": fill}
        if stroke:
            element["line"] = stroke
        elements.append(element)
        self.stats["shape"] += 1

    def import_slide(self, slide, index):
        self.seq = 0
        raster_png = self.raster_map.get(index)
        if raster_png:
            rel = os.path.relpath(raster_png, self.deck_dir).split("\\")
            rel_path = "/".join(rel)
            title = ""
            try:
                if slide.shapes.title is not None and slide.shapes.title.text:
                    title = slide.shapes.title.text.strip().split("\n")[0]
            except Exception:
                title = ""
            self.stats["rasterized"] += 1
            return {
                "id": f"p{index:02d}",
                "layout": "imported",
                "title": title or f"第 {index} 页",
                "body": "",
                "rasterized": True,
                "elements": [
                    {"id": "raster", "type": "image", "x": 0, "y": 0, "w": CANVAS_W, "h": CANVAS_H, "src": rel_path, "fit": "contain"}
                ],
            }
        self.current_layout = slide.slide_layout
        self.current_master = slide.slide_layout.slide_master
        elements = []
        bg = self.effective_background(slide)
        if bg:
            elements.append({"id": "bg", "type": "shape", "x": 0, "y": 0, "w": CANVAS_W, "h": CANVAS_H, "fill": bg})
        for container, shapes in self.inherited_shapes(slide):
            self.include_inherited(container, shapes, elements)
        self.walk(slide.shapes, elements)
        title = ""
        for element in elements:
            if element["type"] == "text" and element.get("role") == "title" and element["text"].strip():
                title = element["text"].strip().split("\n")[0]
                break
        return {
            "id": f"p{index:02d}",
            "layout": "imported",
            "title": title or f"第 {index} 页",
            "body": "",
            "elements": elements,
        }

    def run(self):
        if self.use_raster:
            pages = [i + 1 for i, slide in enumerate(self.prs.slides) if has_unrenderable(slide)]
            if pages:
                produced, note = rasterize_slides(self.pptx_path, pages, self.asset_dir)
                self.raster_map = produced
                self.raster_note = note
                if note:
                    sys.stderr.write(f"[raster] {note}\n")
        slides = [self.import_slide(slide, i + 1) for i, slide in enumerate(self.prs.slides)]
        self.stats["slides"] = len(slides)
        background = None
        for slide in self.prs.slides:
            candidate = self.effective_background(slide)
            if candidate:
                background = candidate
                break
        face = self.theme_fonts.get("+mn-ea") or self.theme_fonts.get("+mj-ea")
        if not face and self.faces:
            face = sorted(self.faces.items(), key=lambda item: -item[1])[0][0]
        title = ""
        if slides and slides[0]["title"]:
            title = slides[0]["title"]
        deck = {
            "version": 1,
            "size": {"width": CANVAS_W, "height": CANVAS_H},
            "theme": {
                "bg": background or self.palette.get("bg1") or "#FFFFFF",
                "fg": self.palette.get("tx1") or "#2B2B2B",
                "accent": self.palette.get("accent1") or "#8F1D22",
                "font": face or DEFAULT_FONT,
            },
            "meta": {"title": title or os.path.splitext(os.path.basename(self.out_path))[0], "source": "pptx-import"},
            "slides": slides,
        }
        os.makedirs(os.path.dirname(self.out_path), exist_ok=True)
        with open(self.out_path, "w", encoding="utf-8") as handle:
            json.dump(deck, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        self.stats["bytes"] = os.path.getsize(self.out_path)
        self.stats["assets"] = len(self.written)
        return deck, self.stats


def main(argv):
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    pptx_path = argv[1]
    workspace = argv[2]
    out_path = None
    if "--out" in argv:
        out_path = argv[argv.index("--out") + 1]
    if not os.path.isfile(pptx_path):
        sys.stderr.write(f"找不到文件：{pptx_path}\n")
        return 2
    if not os.path.isdir(workspace):
        sys.stderr.write(f"工作区不存在：{workspace}\n")
        return 2
    importer = Importer(pptx_path, workspace, out_path, rasterize="--no-rasterize" not in argv)
    _, stats = importer.run()
    sys.stdout.write(json.dumps({"ok": True, **stats}, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))


