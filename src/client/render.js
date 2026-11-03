// PPT 工作台浏览器端核心：deck.json 数据模型、版式元素与预览 HTML。
// 由旧 Trae 扩展的 model.ts / layouts.ts / render.ts 移植；jsonc-parser 依赖改用原生 JSON.parse。
define('render', function (React) {
  'use strict'

  const LAYOUT_IDS = [
    'cover',
    'section',
    'bullets',
    'two-col',
    'image-right',
    'image-full',
    'quote',
    'table',
    'imported'
  ]

  const LAYOUT_LABELS = {
    cover: '标题页',
    section: '章节页',
    bullets: '要点列表',
    'two-col': '双栏文字',
    'image-right': '左文右图',
    'image-full': '全图衬底',
    quote: '引用金句',
    table: '表格',
    imported: '原样排版'
  }

  const DEFAULT_THEME = {
    bg: '#FFFFFF',
    fg: '#1F2328',
    accent: '#2F6FED',
    font: 'Microsoft YaHei'
  }

  const DEFAULT_SIZE = { width: 13.333, height: 7.5 }

  const W = 13.333
  const H = 7.5
  const CANVAS = { width: W, height: H }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  const isStr = (v) => typeof v === 'string'
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

  function color(v, fallback) {
    return isStr(v) && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toUpperCase() : fallback
  }

  /**
   * A paint value for `background`/`box-shadow`: plain hex colours, rgba(), or a CSS gradient
   * (the PPTX importer keeps gradient fills and transparency this way).
   */
  function paint(v, fallback) {
    if (!isStr(v)) return fallback
    const text = v.trim()
    if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return text.toUpperCase()
    if (/^rgba?\([\d.,\s%]+\)$/i.test(text)) return text
    if (/^linear-gradient\([-\d.]+deg,\s*(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))(\s+\d+(\.\d+)?%)?(,\s*(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))(\s+\d+(\.\d+)?%)?)+\)$/i.test(text)) {
      return text
    }
    return fallback
  }

  function align(v, fallback) {
    return v === 'left' || v === 'center' || v === 'right' ? v : fallback
  }

  function valign(v, fallback) {
    return v === 'top' || v === 'middle' || v === 'bottom' ? v : fallback
  }

  function num(v, fallback) {
    return isNum(v) ? v : fallback
  }

  function newId(prefix = 'i') {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  }

  /** 校验 JSON.parse 后的对象；错误按路径描述，便于侧边栏定位 */
  function validateDeck(raw) {
    const errors = []
    if (!isObj(raw)) {
      return { ok: false, errors: ['根节点必须是对象 {}'] }
    }
    const sizeRaw = isObj(raw.size) ? raw.size : {}
    const size = {
      width: num(sizeRaw.width, DEFAULT_SIZE.width),
      height: num(sizeRaw.height, DEFAULT_SIZE.height)
    }
    if (size.width <= 0 || size.height <= 0) errors.push('size.width / size.height 必须为正数（英寸）')

    const themeRaw = isObj(raw.theme) ? raw.theme : {}
    const theme = {
      bg: color(themeRaw.bg, DEFAULT_THEME.bg),
      fg: color(themeRaw.fg, DEFAULT_THEME.fg),
      accent: color(themeRaw.accent, DEFAULT_THEME.accent),
      font: isStr(themeRaw.font) && themeRaw.font ? themeRaw.font : DEFAULT_THEME.font
    }

    const metaRaw = isObj(raw.meta) ? raw.meta : {}
    const meta = { title: isStr(metaRaw.title) && metaRaw.title ? metaRaw.title : '未命名文稿' }

    if (!Array.isArray(raw.slides)) {
      errors.push('slides 必须是数组')
      return { ok: false, errors }
    }
    if (raw.slides.length === 0) errors.push('slides 不能为空，至少需要 1 页')

    const slides = []
    raw.slides.forEach((s, si) => {
      const p = `slides[${si}]`
      if (!isObj(s)) {
        errors.push(`${p} 必须是对象`)
        return
      }
      if (!LAYOUT_IDS.includes(s.layout)) {
        errors.push(`${p}.layout 不合法：${JSON.stringify(s.layout)}，可选 ${LAYOUT_IDS.join(' / ')}`)
      }
      const layout = LAYOUT_IDS.includes(s.layout) ? s.layout : 'bullets'
      const slide = {
        id: isStr(s.id) && s.id ? s.id : `s${si + 1}`,
        layout,
        title: isStr(s.title) ? s.title : '',
        body: isStr(s.body) ? s.body : '',
        image: isStr(s.image) && s.image ? s.image : undefined,
        notes: isStr(s.notes) ? s.notes : undefined,
        elements: [],
        table: undefined
      }
      if (isObj(s.table)) {
        const cols = Array.isArray(s.table.columns) ? s.table.columns.filter(isStr) : []
        const rows = Array.isArray(s.table.rows)
          ? s.table.rows.filter(Array.isArray).map((r) => r.map((c) => String(c ?? '')))
          : []
        if (cols.length === 0) errors.push(`${p}.table.columns 不能为空`)
        slide.table = { columns: cols, rows }
      }
      if (Array.isArray(s.elements)) {
        s.elements.forEach((e, ei) => {
          const ep = `${p}.elements[${ei}]`
          if (!isObj(e)) {
            errors.push(`${ep} 必须是对象`)
            return
          }
          if (e.type === 'text') {
            if (!isStr(e.text)) errors.push(`${ep}.text 必须是字符串`)
            slide.elements.push({
              id: isStr(e.id) && e.id ? e.id : `e${si + 1}_${ei + 1}`,
              type: 'text',
              role: e.role === 'title' || e.role === 'caption' ? e.role : 'body',
              x: num(e.x, 0.8),
              y: num(e.y, 0.8),
              w: num(e.w, 8),
              h: num(e.h, 1),
              text: isStr(e.text) ? e.text : '',
              size: num(e.size, 18),
              color: paint(e.color, theme.fg),
              bold: !!e.bold,
              align: align(e.align, 'left'),
              valign: valign(e.valign, 'top'),
              bullet: !!e.bullet,
              // Optional per-element family, used by PPTX imports that mix faces.
              ...(isStr(e.font) && e.font ? { font: e.font } : {}),
              // Source boxes with wrap="none" stay on one line (PowerPoint semantics).
              ...(e.nowrap === true ? { nowrap: true } : {}),
              // Mixed run styles inside one text box: keep them so 「242.87 h」 keeps its small unit.
              ...(() => {
                if (!Array.isArray(e.spans) || e.spans.length === 0) return {}
                const spans = e.spans
                  .filter((s) => isObj(s) && isStr(s.t))
                  .map((s) => ({
                    t: s.t,
                    ...(isNum(s.size) ? { size: s.size } : {}),
                    ...(isStr(s.color) && paint(s.color, null) ? { color: paint(s.color, null) } : {}),
                    ...(s.bold === true ? { bold: true } : {})
                  }))
                return spans.length ? { spans } : {}
              })()
            })
          } else if (e.type === 'image') {
            if (!isStr(e.src) || !e.src) errors.push(`${ep}.src 必须是图片路径`)
            slide.elements.push({
              id: isStr(e.id) && e.id ? e.id : `e${si + 1}_${ei + 1}`,
              type: 'image',
              x: num(e.x, 0),
              y: num(e.y, 0),
              w: num(e.w, 4),
              h: num(e.h, 3),
              src: isStr(e.src) ? e.src : '',
              fit: e.fit === 'contain' ? 'contain' : 'cover'
            })
          } else if (e.type === 'shape') {
            slide.elements.push({
              id: isStr(e.id) && e.id ? e.id : `e${si + 1}_${ei + 1}`,
              type: 'shape',
              x: num(e.x, 0),
              y: num(e.y, 0),
              w: num(e.w, 1),
              h: num(e.h, 1),
              fill: paint(e.fill, theme.accent),
              line: isStr(e.line) ? paint(e.line, theme.accent) : undefined,
              radius: isNum(e.radius) ? e.radius : undefined,
              radiusPct: isNum(e.radiusPct) ? Math.max(0, Math.min(50, e.radiusPct)) : undefined
            })
          } else if (e.type === 'table') {
            const cols = Array.isArray(e.columns) ? e.columns.filter(isStr) : []
            const rows = Array.isArray(e.rows)
              ? e.rows.filter(Array.isArray).map((r) => r.map((c) => String(c ?? '')))
              : []
            if (cols.length === 0) errors.push(`${ep}.columns 不能为空`)
            slide.elements.push({
              id: isStr(e.id) && e.id ? e.id : `e${si + 1}_${ei + 1}`,
              type: 'table',
              x: num(e.x, 0.8),
              y: num(e.y, 1.6),
              w: num(e.w, 11.7),
              h: num(e.h, 4.8),
              columns: cols,
              rows,
              size: isNum(e.size) ? e.size : 14
            })
          } else {
            errors.push(`${ep}.type 不合法：${JSON.stringify(e.type)}，可选 text / image / shape / table`)
          }
        })
      }
      slides.push(slide)
    })

    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, deck: { version: 1, size, theme, meta, slides }, errors }
  }

  function offsetToLineCol(text, pos) {
    const p = Math.max(0, Math.min(pos, text.length))
    const before = text.slice(0, p)
    return { line: before.split('\n').length, col: p - before.lastIndexOf('\n') }
  }

  // jsonc-parser 原本负责给出精确的语法错误位置与错误码；浏览器端不引入依赖，
  // 因此先用原生 JSON.parse 消息里的 position，缺失时再用下面的严格扫描补位置。
  function locateJsonError(text) {
    const len = text.length
    let i = 0

    const isDigit = (ch) => ch >= '0' && ch <= '9'
    const fail = (code, offset) => ({ offset: offset === undefined ? i : offset, code })

    function skipWs() {
      while (i < len) {
        const ch = text[i]
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') i += 1
        else break
      }
    }

    function parseString() {
      const start = i
      i += 1
      while (i < len) {
        const ch = text[i]
        if (ch === '"') {
          i += 1
          return null
        }
        if (ch === '\\') {
          i += 1
          if (i >= len) return fail('UnexpectedEndOfString', start)
          const escaped = text[i]
          if (escaped === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) return fail('InvalidUnicode')
            i += 5
          } else if ('"\\/bfnrt'.includes(escaped)) {
            i += 1
          } else {
            return fail('InvalidEscapeCharacter')
          }
          continue
        }
        if (text.charCodeAt(i) < 0x20) return fail('InvalidCharacter')
        i += 1
      }
      return fail('UnexpectedEndOfString', start)
    }

    function parseNumber() {
      const start = i
      if (text[i] === '-') i += 1
      if (i >= len) return fail('InvalidNumberFormat', start)
      if (text[i] === '0') i += 1
      else if (text[i] >= '1' && text[i] <= '9') {
        i += 1
        while (i < len && isDigit(text[i])) i += 1
      } else return fail('InvalidNumberFormat', start)
      if (text[i] === '.') {
        i += 1
        if (i >= len || !isDigit(text[i])) return fail('InvalidNumberFormat', start)
        while (i < len && isDigit(text[i])) i += 1
      }
      if (text[i] === 'e' || text[i] === 'E') {
        i += 1
        if (text[i] === '+' || text[i] === '-') i += 1
        if (i >= len || !isDigit(text[i])) return fail('InvalidNumberFormat', start)
        while (i < len && isDigit(text[i])) i += 1
      }
      return null
    }

    function parseLiteral(word) {
      for (let k = 1; k < word.length; k += 1) {
        if (text[i + k] !== word[k]) return fail('InvalidSymbol', i + k)
      }
      i += word.length
      return null
    }

    function parseObject() {
      i += 1
      skipWs()
      if (text[i] === '}') {
        i += 1
        return null
      }
      for (;;) {
        if (i >= len) return fail('CloseBraceExpected')
        if (text[i] !== '"') return fail('PropertyNameExpected')
        const nameErr = parseString()
        if (nameErr) return nameErr
        skipWs()
        if (text[i] !== ':') return fail('ColonExpected')
        i += 1
        const valueErr = parseValue()
        if (valueErr) return valueErr
        skipWs()
        if (i >= len) return fail('CloseBraceExpected')
        if (text[i] === ',') {
          i += 1
          skipWs()
          continue
        }
        if (text[i] === '}') {
          i += 1
          return null
        }
        return fail('CommaExpected')
      }
    }

    function parseArray() {
      i += 1
      skipWs()
      if (text[i] === ']') {
        i += 1
        return null
      }
      for (;;) {
        const valueErr = parseValue()
        if (valueErr) return valueErr
        skipWs()
        if (i >= len) return fail('CloseBracketExpected')
        if (text[i] === ',') {
          i += 1
          skipWs()
          continue
        }
        if (text[i] === ']') {
          i += 1
          return null
        }
        return fail('CommaExpected')
      }
    }

    function parseValue() {
      skipWs()
      if (i >= len) return fail('ValueExpected')
      const ch = text[i]
      if (ch === '{') return parseObject()
      if (ch === '[') return parseArray()
      if (ch === '"') return parseString()
      if (ch === '-' || isDigit(ch)) return parseNumber()
      if (ch === 't') return parseLiteral('true')
      if (ch === 'f') return parseLiteral('false')
      if (ch === 'n') return parseLiteral('null')
      if (ch === '}' || ch === ']') return fail('ValueExpected')
      return fail('InvalidSymbol')
    }

    const valueErr = parseValue()
    if (valueErr) return valueErr
    skipWs()
    return i < len ? fail('EndOfFileExpected') : null
  }

  const NATIVE_JSON_CODES = [
    ['Expected double-quoted property name', 'PropertyNameExpected'],
    ['Expected property name', 'PropertyNameExpected'],
    ["Expected ':'", 'ColonExpected'],
    ["Expected ',' or '}'", 'CommaExpected'],
    ["Expected ',' or ']'", 'CommaExpected'],
    ['Unterminated string', 'UnexpectedEndOfString'],
    ['Bad escaped character', 'InvalidEscapeCharacter'],
    ['Bad Unicode escape', 'InvalidUnicode'],
    ['Bad control character', 'InvalidCharacter'],
    ['No number after minus sign', 'InvalidNumberFormat'],
    ['Exponent part is missing a number', 'InvalidNumberFormat'],
    ['Unexpected number', 'InvalidNumberFormat'],
    ['Unexpected non-whitespace character', 'EndOfFileExpected'],
    ['Unexpected token', 'InvalidSymbol'],
    ['Unexpected string', 'InvalidSymbol'],
    ['Unexpected identifier', 'InvalidSymbol'],
    ['Unexpected end of JSON input', 'ValueExpected']
  ]

  function nativeErrorCode(message) {
    for (const [pattern, code] of NATIVE_JSON_CODES) {
      if (message.includes(pattern)) return code
    }
    return 'InvalidSymbol'
  }

  function nativeErrorLocation(message) {
    const position = message.match(/position (\d+)/)
    if (position) return { offset: Number(position[1]) }
    const lineCol = message.match(/\(line (\d+) column (\d+)\)/)
    if (lineCol) return { line: Number(lineCol[1]), col: Number(lineCol[2]) }
    return null
  }

  /** 把 JSON 报错改写成“第 N 行第 M 列”+ 出错行内容 */
  function jsonErrorToLineCol(text, err) {
    const source = String(text ?? '')
    const message = (err && err.message) || ''
    const native = nativeErrorLocation(message)
    if (native) {
      const at = native.offset === undefined ? native : offsetToLineCol(source, native.offset)
      return formatJsonError(source, at.line, at.col, nativeErrorCode(message))
    }
    let located = null
    try {
      located = locateJsonError(source)
    } catch {
      located = null
    }
    if (located) {
      const at = offsetToLineCol(source, located.offset)
      return formatJsonError(source, at.line, at.col, located.code)
    }
    return `JSON 语法错误：${message}`
  }

  function formatJsonError(text, line, col, code) {
    const lineText = (text.split('\n')[line - 1] ?? '').replace(/\t/g, ' ')
    const start = Math.max(0, col - 30)
    const snippet =
      lineText.length > 90 ? (start > 0 ? '…' : '') + lineText.slice(start, start + 90) : lineText
    return `JSON 语法错误：第 ${line} 行第 ${col} 列（${code}）→ ${snippet.trim()}`
  }

  function parseDeckText(text) {
    const source = String(text ?? '').replace(/^\uFEFF/, '')
    let raw
    try {
      raw = JSON.parse(source)
    } catch (err) {
      return { ok: false, errors: [jsonErrorToLineCol(source, err)] }
    }
    return validateDeck(raw)
  }

  // 版式预设：根据 layout + title + body + image/table 生成绝对定位元素（英寸）
  const splitLines = (body) =>
    body
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-•*]\s*/, '').trimEnd())
      .filter((s) => s.trim().length > 0)

  function buildElements(slide, deck) {
    const t = deck.theme
    const title = slide.title || ' '
    const body = slide.body || ''

    const titleEl = (x, y, w, h, size, align = 'left', bold = true) => ({
      id: newId('t'),
      type: 'text',
      role: 'title',
      x,
      y,
      w,
      h,
      text: title,
      size,
      color: t.fg,
      bold,
      align,
      valign: 'middle'
    })

    const bodyEl = (x, y, w, h, size, bullet) => ({
      id: newId('b'),
      type: 'text',
      role: 'body',
      x,
      y,
      w,
      h,
      text: bullet ? splitLines(body).join('\n') : body,
      size,
      color: t.fg,
      align: 'left',
      valign: 'top',
      bullet
    })

    const accentBar = (x, y, w, h) => ({
      id: newId('s'),
      type: 'shape',
      x,
      y,
      w,
      h,
      fill: t.accent
    })

    const img = (x, y, w, h) =>
      slide.image ? { id: newId('m'), type: 'image', x, y, w, h, src: slide.image, fit: 'cover' } : null

    const tableEl = (x, y, w, h) =>
      slide.table && slide.table.columns.length > 0
        ? {
            id: newId('tb'),
            type: 'table',
            x,
            y,
            w,
            h,
            columns: slide.table.columns,
            rows: slide.table.rows,
            size: 13
          }
        : null

    const out = []
    const push = (e) => {
      if (e) out.push(e)
    }

    switch (slide.layout) {
      case 'cover':
        push(accentBar(0, 0, W, 0.18))
        push(titleEl(1.0, 2.2, W - 2.0, 1.6, 40, 'left'))
        push(accentBar(1.0, 3.95, 2.2, 0.06))
        push(bodyEl(1.0, 4.2, W - 2.0, 1.6, 16, false))
        break
      case 'section':
        push(accentBar(0, 0, 0.35, H))
        push(titleEl(1.2, 2.6, 10.5, 1.3, 36, 'left'))
        push(bodyEl(1.2, 3.9, 10.5, 1.0, 15, false))
        break
      case 'bullets':
      case 'imported':
        // 'imported' pages keep the elements the PPTX importer wrote; this fallback only runs
        // when such a page lost them, and then a plain bullet page is the sanest recovery.
        push(titleEl(0.8, 0.55, W - 1.6, 1.0, 28))
        push(accentBar(0.8, 1.62, 1.4, 0.05))
        push(bodyEl(0.9, 1.95, W - 1.8, 4.9, 18, true))
        break
      case 'two-col': {
        push(titleEl(0.8, 0.55, W - 1.6, 1.0, 28))
        const lines = splitLines(body)
        const half = Math.ceil(lines.length / 2) || 0
        const left = lines.slice(0, half).join('\n')
        const right = lines.slice(half).join('\n')
        out.push({ ...bodyEl(0.8, 1.8, 5.6, 4.9, 16, true), text: left })
        out.push({ ...bodyEl(7.5, 1.8, 5.0, 4.9, 16, true), text: right })
        push(accentBar(6.85, 2.0, 0.05, 4.2))
        break
      }
      case 'image-right':
        push(titleEl(0.8, 0.8, 5.8, 1.5, 26))
        push(accentBar(0.8, 2.45, 1.2, 0.05))
        push(bodyEl(0.8, 2.75, 5.6, 3.8, 15, false))
        push(img(6.9, 0.9, 5.9, 5.7))
        break
      case 'image-full':
        push(img(0, 0, W, H))
        push({
          id: newId('s'),
          type: 'shape',
          x: 0,
          y: H - 2.6,
          w: W,
          h: 2.6,
          fill: t.bg
        })
        push(titleEl(0.9, H - 2.3, W - 1.8, 1.0, 30))
        push(bodyEl(0.9, H - 1.35, W - 1.8, 1.0, 14, false))
        break
      case 'quote':
        push({
          id: newId('q'),
          type: 'text',
          role: 'title',
          x: 1.2,
          y: 1.9,
          w: W - 2.4,
          h: 2.6,
          text: title,
          size: 34,
          color: t.fg,
          bold: true,
          align: 'center',
          valign: 'middle'
        })
        push({
          id: newId('qa'),
          type: 'text',
          role: 'body',
          x: 1.2,
          y: 4.4,
          w: W - 2.4,
          h: 1.2,
          text: body,
          size: 15,
          color: t.fg,
          align: 'center',
          valign: 'top'
        })
        push(accentBar(6.17, 4.15, 1.0, 0.06))
        break
      case 'table':
      default: {
        push(titleEl(0.8, 0.5, W - 1.6, 0.9, 26))
        const tb = tableEl(0.8, 1.6, W - 1.6, 5.0)
        if (tb) push(tb)
        else push(bodyEl(0.8, 1.7, W - 1.6, 4.8, 15, true))
        break
      }
    }
    return out
  }

  /** 保证每一页都有元素；JSON 里省略 elements 时按 layout 自动生成 */
  function ensureElements(deck) {
    deck.slides.forEach((s) => {
      if (!s.elements || s.elements.length === 0) {
        s.elements = buildElements(s, deck)
      }
    })
    return deck
  }

  /** 切换版式时重建元素，但保留标题/正文内容 */
  function relayout(slide, deck, layout) {
    const next = { ...slide, layout }
    // Imported pages are the original PPTX layout: switching back to them must not rebuild.
    if (layout === 'imported' && Array.isArray(slide.elements) && slide.elements.length > 0) {
      next.elements = slide.elements.map((e) => ({ ...e }))
      return next
    }
    next.elements = buildElements(next, deck)
    return next
  }

  // 预览渲染：把 deck.json 渲染成 HTML（侧边栏缩略图 / 整页预览共用）
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const pct = (v, base) => `${(v / base) * 100}%`
  const fontCqw = (pt) => `${((pt / 72) / W) * 100}cqw`

  /** One <div> per line, each line built from runs that may differ in size/colour/weight. */
  function spansHtml(e) {
    const lines = []
    let current = []
    const spans = e.spans || []
    for (const span of spans) {
      const parts = String(span.t ?? '').split(/\r?\n/)
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        if (partIndex > 0) {
          lines.push(current)
          current = []
        }
        if (parts[partIndex]) current.push({ ...span, t: parts[partIndex] })
      }
    }
    lines.push(current)
    return lines
      .map((line) => {
        const inner = line
          .map((span) => {
            const size = isNum(span.size) ? span.size : e.size
            const color = span.color || e.color
            const weight = span.bold ? 700 : 400
            return `<span style="font-size:${fontCqw(size)};color:${color};font-weight:${weight}">${escapeHtml(span.t)}</span>`
          })
          .join('')
        return `<div>${inner || '&nbsp;'}</div>`
      })
      .join('')
  }

  function textHtml(e) {
    if (Array.isArray(e.spans) && e.spans.length) {
      const justify = e.align === 'center' ? 'center' : e.align === 'right' ? 'flex-end' : 'flex-start'
      const alignV = e.valign === 'middle' ? 'center' : e.valign === 'bottom' ? 'flex-end' : 'flex-start'
      const face = e.font ? `font-family:${escapeHtml(e.font)},inherit;` : ''
      const nowrap = e.nowrap ? 'white-space:nowrap;overflow:visible;' : ''
      return `<div class="el text" style="left:${pct(e.x, W)};top:${pct(e.y, H)};width:${pct(e.w, W)};height:${pct(
        e.h,
        H
      )};font-size:${fontCqw(e.size)};${face}${nowrap}color:${e.color};text-align:${e.align};justify-content:${justify};align-items:${alignV}"><div class="tx">${spansHtml(
        e
      )}</div></div>`
    }
    const lines = e.text.split(/\r?\n/)
    const content = e.bullet
      ? lines
          .filter((l) => l.trim())
          .map((l) => `<div class="li">${escapeHtml(l)}</div>`)
          .join('')
      : lines.map((l) => `<div>${escapeHtml(l) || '&nbsp;'}</div>`).join('')
    const justify = e.align === 'center' ? 'center' : e.align === 'right' ? 'flex-end' : 'flex-start'
    const alignText = e.align
    const alignV = e.valign === 'middle' ? 'center' : e.valign === 'bottom' ? 'flex-end' : 'flex-start'
    const face = e.font ? `font-family:${escapeHtml(e.font)},inherit;` : ''
    const nowrap = e.nowrap ? 'white-space:nowrap;overflow:visible;' : ''
    return `<div class="el text" style="left:${pct(e.x, W)};top:${pct(e.y, H)};width:${pct(e.w, W)};height:${pct(
      e.h,
      H
    )};font-size:${fontCqw(e.size)};${face}${nowrap}color:${e.color};font-weight:${e.bold ? 700 : 400};text-align:${alignText};justify-content:${justify};align-items:${alignV}"><div class="tx">${content}</div></div>`
  }

  function tableHtml(e) {
    const head = `<tr>${e.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`
    const rows = e.rows
      .map((r) => `<tr>${e.columns.map((_, i) => `<td>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`)
      .join('')
    return `<div class="el" style="left:${pct(e.x, W)};top:${pct(e.y, H)};width:${pct(e.w, W)};height:${pct(
      e.h,
      H
    )};font-size:${fontCqw(e.size ?? 13)}"><table class="tb">${head}${rows}</table></div>`
  }

  function elementHtml(e, resolveImage) {
    if (e.type === 'text') return textHtml(e)
    if (e.type === 'shape') {
      const radius = isNum(e.radiusPct) ? `${Math.max(0, Math.min(50, e.radiusPct))}%` : e.radius ? pct(e.radius, W) : '0'
      return `<div class="el" style="left:${pct(e.x, W)};top:${pct(e.y, H)};width:${pct(e.w, W)};height:${pct(
        e.h,
        H
      )};background:${e.fill};${e.line ? `box-shadow:inset 0 0 0 max(1px,0.1cqw) ${e.line};` : ''}border-radius:${radius}"></div>`
    }
    if (e.type === 'image') {
      const url = resolveImage(e.src)
      const inner = url
        ? `<div class="im" style="background-image:url('${escapeHtml(url)}');background-size:${
            e.fit === 'contain' ? 'contain' : 'cover'
          }"></div>`
        : `<div class="im ph"><span>缺图片<br>${escapeHtml(e.src)}</span></div>`
      return `<div class="el" style="left:${pct(e.x, W)};top:${pct(e.y, H)};width:${pct(e.w, W)};height:${pct(
        e.h,
        H
      )}">${inner}</div>`
    }
    return tableHtml(e)
  }

  function slideHtml(slide, theme, resolveImage) {
    const els = (slide.elements || []).map((e) => elementHtml(e, resolveImage)).join('')
    return `<div class="slide" style="background:${theme.bg};font-family:${escapeHtml(
      theme.font
    )},system-ui,sans-serif;color:${theme.fg}">${els}</div>`
  }

  const PREVIEW_CSS = `
.slide{position:relative;width:100%;aspect-ratio:13.333/7.5;overflow:hidden;container-type:inline-size;line-height:1.25}
.slide .el{position:absolute;box-sizing:border-box;overflow:hidden}
.slide .text{display:flex;flex-direction:column}
.slide .tx{width:100%}
.slide .li{position:relative;padding-left:1.1em}
.slide .li:before{content:"•";position:absolute;left:0.15em;color:inherit;opacity:.7}
.slide .im{position:absolute;inset:0;background-position:center;background-repeat:no-repeat}
.slide .im.ph{display:flex;align-items:center;justify-content:center;background:#EEF1F5;color:#8391A5;font-size:1.6cqw;text-align:center;border:1px dashed #B9C3D1}
.slide .tb{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
.slide .tb th,.slide .tb td{border:1px solid rgba(120,130,145,.35);padding:.35em .5em;text-align:left;vertical-align:top;overflow:hidden}
.slide .tb th{font-weight:700;background:rgba(47,111,237,.08)}
`

  function sampleDeck() {
    const slides = [
      {
        id: 'cover-1',
        layout: 'cover',
        title: '示例文稿',
        body: '在 PPT 工作台里直接编辑\n也可以让 AI 改写 deck.json'
      },
      {
        id: 'bullets-1',
        layout: 'bullets',
        title: '三步做出可编辑的幻灯片',
        body: '打开左侧栏的 PPT 工作台\n从示例文稿开始编辑文字与版式\n让会话里的 AI 直接改写 deck.json'
      },
      {
        id: 'table-1',
        layout: 'table',
        title: '文件与职责',
        body: '',
        table: {
          columns: ['文件', '职责'],
          rows: [
            ['.ppt-studio/deck.json', '幻灯片数据'],
            ['render.js', '模型、版式与预览渲染']
          ]
        }
      },
      {
        id: 'image-1',
        layout: 'image-full',
        title: '全图衬底页',
        body: '把 assets/banner.png 换成自己的图片',
        image: 'assets/banner.png'
      }
    ]
    const deck = {
      version: 1,
      size: { ...DEFAULT_SIZE },
      theme: { ...DEFAULT_THEME },
      meta: { title: '示例文稿' },
      slides
    }
    return ensureElements(deck)
  }

  return {
    LAYOUT_IDS,
    LAYOUT_LABELS,
    DEFAULT_THEME,
    DEFAULT_SIZE,
    CANVAS,
    newId,
    validateDeck,
    parseDeckText,
    jsonErrorToLineCol,
    buildElements,
    ensureElements,
    relayout,
    escapeHtml,
    elementHtml,
    slideHtml,
    PREVIEW_CSS,
    sampleDeck
  }
})

