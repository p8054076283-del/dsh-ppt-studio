// Self-test for src/bundle/markdown.js — the chat Markdown renderer.
// Runs headless: the module is plain browser JS, so a tiny `h` stub stands in for React.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/bundle/markdown.js', import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const load = new Function('h', `${source}\nreturn { mdInline, mdBlocks, Md }`)
const { mdInline, mdBlocks, Md } = load(h)

let passed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) passed += 1
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function types(blocks) {
  return blocks.map((block) => block.type).join(',')
}

// 1. paragraphs split on blank lines, single newlines kept inside one paragraph
const sample = mdBlocks('第一段第一行\n第一段第二行\n\n第二段')
check('paragraph split', types(sample) === 'p,p', types(sample))
check('soft line break kept', sample[0].text === '第一段第一行\n第一段第二行', JSON.stringify(sample[0].text))

// 2. bold-only line, then a list (the shape the PPT agent actually answers in)
check('bold para + list', types(mdBlocks('**这一版改了什么**\n\n- 全篇主色换成官方红\n- 封面改用官方校徽图')) === 'p,list')
const listBlock = mdBlocks('- a\n- b\n- c')[0]
check('list items', listBlock && listBlock.items.length === 3, JSON.stringify(listBlock))
check('ordered list', mdBlocks('1. 一\n2. 二')[0].ordered === true)

// 3. GFM table with divider row
const tableText = '| # | id | layout | 内容 |\n|---|---|---|---|\n| 1 | xjtu-cover | cover | 西安交通大学 |\n| 2 | xjtu-section-1 | section | 从哪里来 |'
const tableBlocks = mdBlocks(tableText)
check('table detected', types(tableBlocks) === 'table', types(tableBlocks))
check('table head cells', tableBlocks[0] && tableBlocks[0].head.length === 4, JSON.stringify(tableBlocks[0] && tableBlocks[0].head))
check('table rows', tableBlocks[0] && tableBlocks[0].rows.length === 2, JSON.stringify(tableBlocks[0] && tableBlocks[0].rows))

// 4. heading, quote, fence, hr
check('heading', types(mdBlocks('## 页面清单')) === 'h')
check('quote', types(mdBlocks('> 按「西交大=西安交通大学」做的\n> 第二行')) === 'quote')
const quote = mdBlocks('> 按「西交大=西安交通大学」做的\n> 第二行')[0]
check('quote text', quote && quote.text === '按「西交大=西安交通大学」做的\n第二行', JSON.stringify(quote && quote.text))
const fenced = mdBlocks('```json\n{"version":1}\n```')
check('fence', types(fenced) === 'code', types(fenced))
check('fence text', fenced[0] && fenced[0].text === '{"version":1}', JSON.stringify(fenced[0] && fenced[0].text))
check('hr', types(mdBlocks('---')) === 'hr')

// 5. inline tokens
const inline = mdInline('全篇主色从错误的 `#9D1B32` 换成官方 **`#C8161E`**，配色统一')
check('inline code', inline.some((t) => t.t === 'code' && t.v === '#9D1B32'), JSON.stringify(inline))
check('bold wraps code', inline.some((t) => t.t === 'bold' && t.v === '`#C8161E`'), JSON.stringify(inline))
check('bare url', mdInline('见 https://vi.sjtu.edu.cn/index.html 说明').some((t) => t.t === 'link'), JSON.stringify(mdInline('https://a.b/c')))
check('markdown link', mdInline('[官网](https://vi.sjtu.edu.cn/)').some((t) => t.t === 'link' && t.href === 'https://vi.sjtu.edu.cn/'))
check('italic', mdInline('这是 *斜体* 文本').some((t) => t.t === 'italic' && t.v === '斜体'))

// 6. the rendered tree: one child per block, no innerHTML anywhere
const tree = Md({ text: tableText })
check('Md root', tree && tree.type === 'div' && tree.props.className === 'ppt4-md', JSON.stringify(tree && tree.type))
check('Md children', tree && tree.children.length === 1, String(tree && tree.children.length))
check('Md no innerHTML', !JSON.stringify(tree).includes('dangerouslySetInnerHTML'))
const tableNode = tree.children[0]
check('table node', tableNode.type === 'div' && tableNode.props.className === 'ppt4-md-table')

// 7. hostile input stays inert text (no element injection, no hang)
const hostile = Md({ text: '<img src=x onerror=alert(1)> **粗** <script>alert(1)</script>' })
const hostileJson = JSON.stringify(hostile)
check('html is text', !hostileJson.includes('"type":"img"') && hostileJson.includes('<img'), hostileJson.slice(0, 200))
check('empty text', Md({ text: '' }) === null)
check('null text', Md({}) === null)

// 8. a realistic agent answer parses without throwing and keeps its structure
const agentAnswer = [
  '已写入工作台的唯一数据源 `D:\\origin\\.ppt-studio\\deck.json`，**7 页**，JSON 已回读校验。',
  '',
  '> 按「西交大 = 西安交通大学」做的。',
  '',
  '**页面清单（全部在允许的 8 种版式内，无 elements）**',
  '',
  '| # | id | layout | 内容 |',
  '|---|---|---|---|',
  '| 1 | xjtu-cover | cover | 西安交通大学 / 1896 创办于上海 |',
  '| 2 | xjtu-section-1 | section | 从哪里来 |',
  '',
  '**两件事要跟你说清楚**',
  '',
  '1. 原 4 页布局被替换了，但没丢：备份在 `.ppt-studio/deck.backup.json`',
  '2. 想要蓝色版跟我说一声，我改一个字段。',
  '',
  '配色来源：https://vi.sjtu.edu.cn/index.html',
].join('\n')
let agentBlocks = []
try {
  agentBlocks = mdBlocks(agentAnswer)
} catch (error) {
  failures.push('agent answer threw: ' + error.message)
}
check('agent answer blocks', types(agentBlocks) === 'p,quote,p,table,p,list,p', types(agentBlocks))

console.log(`markdown self-test: ${passed}/${passed + failures.length} passed`)
if (failures.length) {
  for (const failure of failures) console.error('FAIL ' + failure)
  process.exitCode = 1
}
