# -*- coding: utf-8 -*-
"""import-pptx.py 的自测：现造一份 pptx，验证坐标 / 组合 / 图片 / 表格 / 母版 / 继承样式。

用法：python scripts/selftest-import.py
"""
import json
import os
import shutil
import sys
import copy
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lxml import etree  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches, Pt, Emu  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE  # noqa: E402
from pptx.enum.dml import MSO_THEME_COLOR  # noqa: E402

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("import_pptx", os.path.join(HERE, "import-pptx.py"))
importer_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer_module)

NS = importer_module.NS

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000000020001e221bc330000000049454e44ae426082"
)

passed = 0
failures = []


def check(name, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print("PASS ", name)
    else:
        failures.append(name)
        print("FAIL ", name, detail)


def build_fixture(workspace):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    master = prs.slide_masters[0]

    def add_master_bar():
        """python-pptx 不支持往母版加形状：先在页上造一个，再把 XML 搬进母版 spTree。"""
        probe_slide = prs.slides.add_slide(prs.slide_layouts[6])
        shape = probe_slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.35))
        shape.name = "master-accent-bar"
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(0x8F, 0x1D, 0x22)
        shape.line.fill.background()
        element = copy.deepcopy(shape._element)
        c_nv_pr = element.find(".//p:nvSpPr/p:cNvPr", NS)
        if c_nv_pr is not None:
            c_nv_pr.set("id", "9001")
        probe_slide._element.spTree.remove(shape._element)
        sp_tree = master._element.find("p:cSld/p:spTree", NS)
        sp_tree.append(element)
        # 探针页用完即删，别影响页数断言
        sld_id = prs.slides._sldIdLst[-1]
        prs.part.drop_rel(sld_id.rId)
        del prs.slides._sldIdLst[-1]

    add_master_bar()

    # 版式背景：奶白色（模板底纹通常在版式上）
    layout = prs.slide_layouts[1] if len(prs.slide_layouts) > 1 else prs.slide_layouts[0]  # 标题+内容，带占位符
    layout.background.fill.solid()
    layout.background.fill.fore_color.rgb = RGBColor(0xF7, 0xF3, 0xED)

    # 版式标题占位符：把字号写在版式里（继承来源）
    title_ph = None
    for shape in layout.placeholders:
        if shape.placeholder_format.idx == 0:
            title_ph = shape
            break
    if title_ph is not None:
        tx = title_ph._element.find(".//p:txBody", NS)
        if tx is None:
            tx = etree.SubElement(title_ph._element, "{%s}txBody" % NS["p"])
            etree.SubElement(tx, "{%s}bodyPr" % NS["a"])
        if tx is not None:
            lst = tx.find("a:lstStyle", NS)
            if lst is None:
                lst = etree.Element("{%s}lstStyle" % NS["a"])
                body_pr = tx.find("a:bodyPr", NS)
                if body_pr is not None:
                    body_pr.addnext(lst)
                else:
                    tx.insert(0, lst)
            lvl = etree.SubElement(lst, "{%s}lvl1pPr" % NS["a"])
            rpr = etree.SubElement(lvl, "{%s}defRPr" % NS["a"])
            rpr.set("sz", "4000")  # 40pt
            rpr.set("b", "1")
            fill = etree.SubElement(rpr, "{%s}solidFill" % NS["a"])
            clr = etree.SubElement(fill, "{%s}srgbClr" % NS["a"])
            clr.set("val", "1F497D")

    slide = prs.slides.add_slide(layout)
    # 继承样式：占位符标题只写字，不给字号
    if title_ph is not None and slide.shapes.title is not None:
        slide.shapes.title.text = "继承来的标题"

    # 普通文字框：显式坐标 + 字号 + 颜色
    box = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(4.0), Inches(1.0))
    frame = box.text_frame
    frame.text = "第一行"
    frame.add_paragraph().text = "第二行"
    run = frame.paragraphs[0].runs[0]
    run.font.size = Pt(24)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x11, 0x66, 0xCC)
    # 单独一个文本框用主题色，验证 schemeClr 解析
    theme_box = slide.shapes.add_textbox(Inches(1.0), Inches(3.2), Inches(4.0), Inches(0.6))
    theme_para = theme_box.text_frame.paragraphs[0]
    theme_para.text = '主题色标题'
    if theme_para.runs:
        theme_para.runs[0].font.size = Pt(18)
        theme_para.runs[0].font.color.theme_color = MSO_THEME_COLOR.ACCENT_2

    # 图片
    temp_png = os.path.join(workspace, "tmp-picture.png")
    with open(temp_png, "wb") as handle:
        handle.write(TINY_PNG)
    slide.shapes.add_picture(temp_png, Inches(9.0), Inches(1.0), Inches(2.0), Inches(1.5))

    # 表格
    table = slide.shapes.add_table(2, 2, Inches(1.0), Inches(4.0), Inches(5.0), Inches(1.2)).table
    table.cell(0, 0).text = "列 A"
    table.cell(0, 1).text = "列 B"
    table.cell(1, 0).text = "1"
    table.cell(1, 1).text = "2"

    # 混排字号：一个文本框里「大号数字 + 小号单位」
    mixed = slide.shapes.add_textbox(Inches(4.0), Inches(6.0), Inches(3.0), Inches(0.8))
    mixed_frame = mixed.text_frame
    mixed_frame.text = "242.87"
    mixed_frame.paragraphs[0].runs[0].font.size = Pt(33)
    unit = mixed_frame.paragraphs[0].add_run()
    unit.text = " h"
    unit.font.size = Pt(15)

    # 圆角矩形 / 圆形：模板里的卡片与圆点
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.6), Inches(5.6), Inches(2.0), Inches(1.2))
    card.fill.solid(); card.fill.fore_color.rgb = RGBColor(0xF7, 0xF3, 0xED); card.line.fill.background()
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(11.9), Inches(3.2), Inches(0.6), Inches(0.6))
    dot.fill.solid(); dot.fill.fore_color.rgb = RGBColor(0xC8, 0xA0, 0x63); dot.line.fill.background()

    # 渐变 + 透明度：封面这类叠层往往靠它压住照片
    grad = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(6.0), Inches(5.6), Inches(2.0), Inches(1.0))
    grad.fill.gradient()
    grad.fill.gradient_stops[0].color.rgb = RGBColor(0x5E, 0x12, 0x16)
    grad.fill.gradient_stops[1].color.rgb = RGBColor(0x8F, 0x1D, 0x22)
    try:
        grad.fill.gradient_stops[0].transparency = 0.35
    except Exception:
        pass
    grad.line.fill.background()

    # 组合：两个色块，验证 group 坐标展开
    group = slide.shapes.add_group_shape()
    a = group.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(7.0), Inches(4.0), Inches(1.0), Inches(0.6))
    a.fill.solid()
    a.fill.fore_color.rgb = RGBColor(0xC8, 0xA0, 0x63)
    a.line.fill.background()
    b = group.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(8.5), Inches(4.0), Inches(1.0), Inches(0.6))
    b.fill.solid()
    b.fill.fore_color.rgb = RGBColor(0x6E, 0x6A, 0x63)
    b.line.fill.background()

    path = os.path.join(workspace, "fixture.pptx")
    prs.save(path)
    return path


def build_chart_fixture(workspace):
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    slide1 = prs.slides.add_slide(prs.slide_layouts[6])
    box = slide1.shapes.add_textbox(Inches(0.8), Inches(0.6), Inches(8), Inches(1))
    box.text_frame.text = "普通文字页"
    slide2 = prs.slides.add_slide(prs.slide_layouts[6])
    data = CategoryChartData()
    data.categories = ["一月", "二月", "三月"]
    data.add_series("系列", (1, 2, 3))
    slide2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(1.5), Inches(7), Inches(4), data)
    path = os.path.join(workspace, "chart-fixture.pptx")
    prs.save(path)
    return path


def main():
    workspace = tempfile.mkdtemp(prefix="ppt-import-test-")
    try:
        pptx = build_fixture(workspace)
        deck_dir = os.path.join(workspace, ".ppt-studio")
        out = os.path.join(deck_dir, "deck.json")
        importer = importer_module.Importer(pptx, workspace, out)
        deck, stats = importer.run()

        check("产出 deck.json", os.path.isfile(out))
        check("页数正确", len(deck["slides"]) == 1, str(len(deck["slides"])))
        check("页面布局为 imported", deck["slides"][0]["layout"] == "imported")
        check("素材已落盘", stats["assets"] >= 1, str(stats))

        elements = deck["slides"][0]["elements"]
        by_type = {}
        for element in elements:
            by_type.setdefault(element["type"], []).append(element)

        # 母版装饰
        master_bar = [e for e in by_type.get("shape", []) if e.get("fill", "").upper() == "#8F1D22"]
        check("母版装饰被导入", bool(master_bar), json.dumps(by_type.get("shape", [])[:3]))
        if master_bar:
            check("母版装饰坐标正确", abs(master_bar[0]["x"]) < 0.02 and abs(master_bar[0]["y"]) < 0.02 and master_bar[0]["w"] > 13, json.dumps(master_bar[0]))

        # 版式背景
        background = deck["slides"][0]["elements"][0]
        check("版式背景被继承", background.get("fill", "").upper() == "#F7F3ED", json.dumps(background))

        # 文字：显式样式
        texts = by_type.get("text", [])
        body = [t for t in texts if t["text"].startswith("第一行")]
        check("文字框被导入", bool(body), json.dumps([t.get("text") for t in texts]))
        if body:
            check("文字坐标正确", abs(body[0]["x"] - 1.0) < 0.02 and abs(body[0]["y"] - 2.0) < 0.02, json.dumps(body[0]))
            check("多段落保留", body[0]["text"].startswith("第一行\n第二行"), repr(body[0]["text"]))
            check("字号保留", abs(body[0]["size"] - 24) < 0.1, str(body[0]["size"]))
            check("粗体保留", body[0]["bold"] is True)
            check("字色保留", body[0]["color"].upper() == "#1166CC", body[0]["color"])

        # 主题色（schemeClr）必须解析成具体色值，否则红底白字会变成黑字
        themed = [t for t in texts if t["text"].strip() == "主题色标题"]
        accent2 = importer_module.theme_info(Presentation())[0].get("accent2")
        check(
            "主题色解析成具体色值",
            bool(themed) and accent2 is not None and themed[0]["color"].upper() == accent2.upper(),
            json.dumps(themed[:1], ensure_ascii=False) + " vs " + str(accent2),
        )

        # 占位符继承样式（版式里 40pt / 粗体 / 深蓝）
        inherited = [t for t in texts if "继承来的标题" in t["text"]]
        check("占位符文字被导入", bool(inherited), json.dumps([t.get("text") for t in texts]))
        if inherited:
            check("字号从版式继承", abs(inherited[0]["size"] - 40) < 0.1, str(inherited[0]["size"]))
            check("粗体从版式继承", inherited[0]["bold"] is True)
            check("字色从版式继承", inherited[0]["color"].upper() == "#1F497D", inherited[0]["color"])

        # 图片
        images = by_type.get("image", [])
        check("图片被导入", len(images) == 1, str(len(images)))
        if images:
            check("图片坐标正确", abs(images[0]["x"] - 9.0) < 0.02 and abs(images[0]["w"] - 2.0) < 0.02, json.dumps(images[0]))
            check("图片文件存在", os.path.isfile(os.path.join(workspace, ".ppt-studio", images[0]["src"])), images[0]["src"])

        # 表格
        tables = by_type.get("table", [])
        check("表格被导入", len(tables) == 1, str(len(tables)))
        if tables:
            check("表格内容正确", tables[0]["columns"] == ["列 A", "列 B"] and tables[0]["rows"] == [["1", "2"]], json.dumps(tables[0], ensure_ascii=False))

        # 组合展开
        group_colors = {e.get("fill", "").upper() for e in by_type.get("shape", [])}
        check("组合内形状展开", "#C8A063" in group_colors and "#6E6A63" in group_colors, json.dumps(sorted(group_colors)))
        grouped = [e for e in by_type.get("shape", []) if e.get("fill", "").upper() == "#6E6A63"]
        if grouped:
            check("组合坐标是绝对坐标", abs(grouped[0]["x"] - 8.5) < 0.05, json.dumps(grouped[0]))

        # 渐变填充（封面叠层常见）必须原样保留成 CSS 渐变
        gradients = [e for e in by_type.get("shape", []) if isinstance(e.get("fill"), str) and e["fill"].startswith("linear-gradient(")]
        check("渐变填充被保留", len(gradients) >= 1, json.dumps([e.get("fill") for e in by_type.get("shape", [])][:4], ensure_ascii=False))

        # 混排字号：同一文本框里「242.87」33pt + 「 h」15pt
        mixed_el = [t for t in texts if t["text"].strip().startswith("242.87")]
        check("混排字号被保留", bool(mixed_el) and bool(mixed_el[0].get("spans")), json.dumps(mixed_el[:1], ensure_ascii=False)[:200])
        if mixed_el and mixed_el[0].get("spans"):
            sizes = sorted({round(span.get("size", 0), 1) for span in mixed_el[0]["spans"] if span["t"].strip()})
            check("大小字号都在", sizes == [15.0, 33.0], json.dumps(sizes))

        # 圆角矩形 / 圆形
        rounded = [e for e in by_type.get("shape", []) if e.get("radiusPct")]
        check("圆角/圆形被保留", len(rounded) >= 2, json.dumps([e.get("radiusPct") for e in rounded]))
        if rounded:
            check("圆形圆角为 50%", any(abs(e["radiusPct"] - 50) < 0.1 for e in rounded), json.dumps([e["radiusPct"] for e in rounded]))
        # 图表 / SmartArt 页：整页转成图片（需要 LibreOffice + poppler，没有就跳过）
        if importer_module.find_soffice() and importer_module.find_pdftoppm():
            chart_pptx = build_chart_fixture(workspace)
            chart_out = os.path.join(workspace, ".ppt-studio-chart", "deck.json")
            chart_importer = importer_module.Importer(chart_pptx, workspace, chart_out)
            chart_deck, chart_stats = chart_importer.run()
            check("含图表的页被整页转图", chart_stats.get("rasterized") == 1, json.dumps(chart_stats))
            rastered = [s for s in chart_deck["slides"] if s.get("rasterized")]
            if rastered:
                src_rel = rastered[0]["elements"][0]["src"]
                check("转图页只有一张整页图片", len(rastered[0]["elements"]) == 1 and rastered[0]["elements"][0]["type"] == "image")
                check("转图文件存在", os.path.isfile(os.path.join(workspace, ".ppt-studio", src_rel)), src_rel)
            plain = [s for s in chart_deck["slides"] if not s.get("rasterized")]
            check("普通页仍是可编辑元素", bool(plain) and any(e["type"] == "text" for e in plain[0]["elements"]))
        else:
            print("PASS  图表转图（本机缺 LibreOffice/poppler，跳过）")
    finally:
        shutil.rmtree(workspace, ignore_errors=True)

    print()
    if failures:
        print(f"{len(failures)} FAILED")
        for name in failures:
            print(" -", name)
        return 1
    print(f"all {passed} importer checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
