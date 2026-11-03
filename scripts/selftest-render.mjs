// 自测：用 define 桩在 Node 里求值 src/client/render.js，逐项断言渲染 API。
import { readFileSync } from 'node:fs'

const MODULE_URL = new URL('../src/client/render.js', import.meta.url)
const source = readFileSync(MODULE_URL, 'utf8')

let defined = null
function define(name, factory) {
  if (defined) throw new Error(`define 被重复调用：${name}`)
  defined = { name, api: factory(undefined) }
}
new Function('define', source)(define)

if (!defined || defined.name !== 'render') throw new Error("render.js 没有调用 define('render', ...)")
const api = defined.api

let passed = 0
const failures = []

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS  ${label}`)
  } catch (error) {
    failures.push(`${label}: ${error && error.message}`)
    console.error(`FAIL  ${label}\n      ${error && error.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

const REQUIRED_API = [
  'LAYOUT_IDS',
  'LAYOUT_LABELS',
  'DEFAULT_THEME',
  'DEFAULT_SIZE',
  'CANVAS',
  'newId',
  'validateDeck',
  'parseDeckText',
  'jsonErrorToLineCol',
  'buildElements',
  'ensureElements',
  'relayout',
  'escapeHtml',
  'elementHtml',
  'slideHtml',
  'PREVIEW_CSS',
  'sampleDeck'
]

check('导出 API 清单完整', () => {
  for (const key of REQUIRED_API) assert(key in api, `缺少导出 ${key}`)
  for (const key of ['newId', 'validateDeck', 'parseDeckText', 'jsonErrorToLineCol', 'buildElements', 'ensureElements', 'relayout', 'escapeHtml', 'elementHtml', 'slideHtml', 'sampleDeck']) {
    assertEqual(typeof api[key], 'function', `${key} 类型`)
  }
  assertEqual(typeof api.PREVIEW_CSS, 'string', 'PREVIEW_CSS 类型')
})

check('LAYOUT_IDS / LAYOUT_LABELS 与约定一致', () => {
  const expectedIds = ['cover', 'section', 'bullets', 'two-col', 'image-right', 'image-full', 'quote', 'table', 'imported']
  assertEqual(api.LAYOUT_IDS.join(','), expectedIds.join(','), 'LAYOUT_IDS')
  assertEqual(Object.keys(api.LAYOUT_LABELS).length, 9, 'LAYOUT_LABELS 数量')
  assertEqual(api.LAYOUT_LABELS.imported, '原样排版', 'imported 标签')
  assertEqual(api.LAYOUT_LABELS.cover, '标题页', 'cover 标签')
  assertEqual(api.LAYOUT_LABELS['image-right'], '左文右图', 'image-right 标签')
  assertEqual(api.LAYOUT_LABELS.table, '表格', 'table 标签')
})

check('默认主题与画布尺寸', () => {
  assertEqual(api.DEFAULT_THEME.bg, '#FFFFFF', 'DEFAULT_THEME.bg')
  assertEqual(api.DEFAULT_THEME.fg, '#1F2328', 'DEFAULT_THEME.fg')
  assertEqual(api.DEFAULT_THEME.accent, '#2F6FED', 'DEFAULT_THEME.accent')
  assertEqual(api.DEFAULT_THEME.font, 'Microsoft YaHei', 'DEFAULT_THEME.font')
  assertEqual(api.DEFAULT_SIZE.width, 13.333, 'DEFAULT_SIZE.width')
  assertEqual(api.DEFAULT_SIZE.height, 7.5, 'DEFAULT_SIZE.height')
  assertEqual(api.CANVAS.width, 13.333, 'CANVAS.width')
  assertEqual(api.CANVAS.height, 7.5, 'CANVAS.height')
})

check('validateDeck(sampleDeck()).ok === true', () => {
  const result = api.validateDeck(api.sampleDeck())
  assertEqual(result.ok, true, 'ok')
  assertEqual(result.errors.length, 0, 'errors')
  assertEqual(result.deck.meta.title, '示例文稿', 'meta.title')
  assertEqual(result.deck.slides.length, 4, '页数')
  assertEqual(result.deck.slides.map((s) => s.layout).join(','), 'cover,bullets,table,image-full', '版式顺序')
  assertEqual(result.deck.slides[2].table.columns.length > 0, true, 'table.columns')
  assertEqual(result.deck.slides[3].image, 'assets/banner.png', '全图页 image')
})

check('ensureElements 后 4 页 elements 均非空', () => {
  const bare = JSON.parse(JSON.stringify(api.sampleDeck()))
  bare.slides.forEach((slide) => {
    slide.elements = []
  })
  const validated = api.validateDeck(bare)
  assertEqual(validated.ok, true, 'bare deck 校验')
  const deck = api.ensureElements(validated.deck)
  assertEqual(deck.slides.length, 4, '页数')
  deck.slides.forEach((slide, index) => {
    assert(Array.isArray(slide.elements) && slide.elements.length > 0, `第 ${index + 1} 页 elements 为空`)
  })
})

check('slideHtml 每页输出非空且含 class="slide"', () => {
  const deck = api.validateDeck(api.sampleDeck()).deck
  const resolveImage = (src) => `data:image/png;base64,${Buffer.from(src, 'utf8').toString('base64')}`
  deck.slides.forEach((slide, index) => {
    const html = api.slideHtml(slide, deck.theme, resolveImage)
    assert(typeof html === 'string' && html.length > 0, `第 ${index + 1} 页渲染为空`)
    assert(html.includes('class="slide"'), `第 ${index + 1} 页缺少 class="slide"`)
    assert(!/\d+px/.test(html), `第 ${index + 1} 页出现固定像素尺寸`)
  })
})

check('parseDeckText 合法示例 JSON → ok === true', () => {
  const result = api.parseDeckText(JSON.stringify(api.sampleDeck(), null, 2))
  assertEqual(result.ok, true, 'ok')
  assertEqual(result.deck.slides.length, 4, '页数')
})

check('parseDeckText 语法错误 → ok false 且含「第 N 行第 M 列」', () => {
  const result = api.parseDeckText('{"slides": [}')
  assertEqual(result.ok, false, 'ok')
  const message = result.errors[0]
  assert(typeof message === 'string', 'errors[0] 不是字符串')
  assert(message.includes('第 '), `错误信息缺少「第 」：${message}`)
  assert(message.includes('行'), `错误信息缺少「行」：${message}`)
  assert(message.includes('第 1 行'), `错误信息行号不是第 1 行：${message}`)
  console.log(`      → ${message}`)
})

check('parseDeckText 多行语法错误定位到第 2 行', () => {
  const result = api.parseDeckText('{\n  "slides": [}\n')
  assertEqual(result.ok, false, 'ok')
  assert(result.errors[0].includes('第 2 行'), `行号定位错误：${result.errors[0]}`)
})

check('parseDeckText 去掉 BOM', () => {
  const result = api.parseDeckText(`\uFEFF${JSON.stringify(api.sampleDeck())}`)
  assertEqual(result.ok, true, 'ok')
})

check('validateDeck 错误路径与默认值', () => {
  assertEqual(api.validateDeck(null).errors[0], '根节点必须是对象 {}', '根节点错误')
  assertEqual(api.validateDeck({ slides: 'x' }).ok, false, 'slides 非数组')
  assertEqual(api.validateDeck({ slides: [] }).ok, false, '空 slides')
  const badLayout = api.validateDeck({ slides: [{ layout: 'nope' }] })
  assertEqual(badLayout.ok, false, '非法 layout')
  assert(badLayout.errors[0].includes('layout 不合法'), `layout 错误文本：${badLayout.errors[0]}`)
  const defaults = api.validateDeck({ slides: [{ layout: 'cover' }] })
  assertEqual(defaults.ok, true, '默认值补全')
  assertEqual(defaults.deck.theme.bg, '#FFFFFF', '默认主题')
  assertEqual(defaults.deck.meta.title, '未命名文稿', '默认标题')
  assertEqual(defaults.deck.slides[0].id, 's1', '默认 id')
})

check('渐变 / 透明填充能通过校验', () => {
  const deck = {
    version: 1,
    theme: { bg: '#FFFFFF', fg: '#1F2328', accent: '#2F6FED', font: 'Microsoft YaHei' },
    meta: { title: '渐变' },
    slides: [
      {
        id: 's1',
        layout: 'imported',
        title: '渐变页',
        elements: [
          { type: 'shape', x: 0, y: 0, w: 13.333, h: 7.5, fill: 'linear-gradient(90deg, #5E1216 0.0%, rgba(94,18,22,0.650) 48.0%, #8F1D22 100.0%)' },
          { type: 'text', x: 1, y: 1, w: 4, h: 1, text: '半透明字', size: 18, color: 'rgba(255,255,255,0.800)' }
        ]
      }
    ]
  }
  const result = api.validateDeck(deck)
  const shape = result.deck.slides[0].elements[0]
  const text = result.deck.slides[0].elements[1]
  assertEqual(shape.fill.startsWith('linear-gradient('), true, '渐变 fill')
  assertEqual(text.color.startsWith('rgba('), true, 'rgba 字色')
})

check('混排字号与圆角', () => {
  const deck = {
    version: 1,
    theme: { bg: '#FFFFFF', fg: '#1F2328', accent: '#2F6FED', font: 'Microsoft YaHei' },
    meta: { title: '混排' },
    slides: [
      {
        id: 's1',
        layout: 'imported',
        title: '混排',
        elements: [
          { type: 'shape', x: 0, y: 0, w: 2, h: 1, fill: '#F7F3ED', radiusPct: 14 },
          {
            type: 'text',
            x: 1,
            y: 2,
            w: 3,
            h: 1,
            text: '242.87 h',
            size: 33,
            color: '#8F1D22',
            spans: [
              { t: '242.87', size: 33, color: '#8F1D22' },
              { t: ' h', size: 15, color: '#6E6A63' }
            ]
          }
        ]
      }
    ]
  }
  const result = api.validateDeck(deck)
  const shape = result.deck.slides[0].elements[0]
  const text = result.deck.slides[0].elements[1]
  assertEqual(shape.radiusPct, 14, 'radiusPct 保留')
  assertEqual(Array.isArray(text.spans) && text.spans.length, 2, 'spans 保留')
  const html = api.slideHtml(result.deck.slides[0], result.deck.theme, (src) => src)
  assert(html.includes('border-radius:14%'), '圆角写进样式')
  assert(html.includes('font-size') && html.includes('<span'), 'span 渲染出来')
})

check('escapeHtml 转义 HTML 特殊字符', () => {
  const html = api.escapeHtml('<b>"a" & b</b>')
  assertEqual(html, '&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;', '转义结果')
})

check('elementHtml 缺图片时渲染占位', () => {
  const slide = {
    id: 'img',
    layout: 'image-full',
    title: '全图',
    body: '',
    image: 'assets/banner.png',
    elements: api.buildElements({ layout: 'image-full', title: '全图', body: '', image: 'assets/banner.png' }, api.sampleDeck())
  }
  const imageEl = slide.elements.find((element) => element.type === 'image')
  assert(imageEl, '没有生成 image 元素')
  const html = api.elementHtml(imageEl, () => null)
  assert(html.includes('缺图片'), '缺少图片占位文案')
  assert(html.includes('assets/banner.png'), '占位缺少图片路径')
})

check('relayout 保留内容并重建元素', () => {
  const deck = api.validateDeck(api.sampleDeck()).deck
  const next = api.relayout(deck.slides[0], deck, 'quote')
  assertEqual(next.layout, 'quote', 'layout')
  assertEqual(next.title, deck.slides[0].title, 'title 保留')
  assert(next.elements.length > 0, 'elements 未重建')
})

check('newId 使用前缀且不重复', () => {
  const a = api.newId('t')
  const b = api.newId('t')
  assert(a.startsWith('t'), `前缀错误：${a}`)
  assert(a !== b, '两次 newId 相同')
  assert(api.newId().startsWith('i'), '默认前缀应为 i')
})

const layoutDeck = api.validateDeck(api.sampleDeck()).deck
const layoutSlide = {
  id: 'probe',
  layout: 'cover',
  title: '版式探针',
  body: '第一行\n第二行',
  image: 'assets/banner.png',
  table: { columns: ['列 A', '列 B'], rows: [['1', '2'], ['3', '4']] },
  elements: []
}

for (const layout of api.LAYOUT_IDS) {
  check(`buildElements(${layout}) 坐标均为有限数字`, () => {
    const slide = { ...layoutSlide, layout }
    const elements = api.buildElements(slide, layoutDeck)
    assert(Array.isArray(elements), '未返回数组')
    assert(elements.length > 0, '没有生成元素')
    for (const element of elements) {
      for (const key of ['x', 'y', 'w', 'h']) {
        assert(Number.isFinite(element[key]), `${element.type}.${key} 不是有限数字：${element[key]}`)
      }
      assertEqual(typeof element.id, 'string', '元素 id')
      assert(['text', 'image', 'shape', 'table'].includes(element.type), `未知元素类型 ${element.type}`)
    }
  })
}

check('PREVIEW_CSS 关键规则齐全', () => {
  for (const rule of ['.slide{', 'aspect-ratio:13.333/7.5', 'container-type:inline-size', '.slide .tb', '.slide .im.ph']) {
    assert(api.PREVIEW_CSS.includes(rule), `PREVIEW_CSS 缺少 ${rule}`)
  }
})

console.log(`\n${passed} PASS, ${failures.length} FAIL`)
if (failures.length > 0) {
  console.error('\n失败项：')
  failures.forEach((failure) => console.error(`  - ${failure}`))
  process.exitCode = 1
}
