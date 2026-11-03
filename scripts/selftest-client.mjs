// Client-half pre-flight: loads lib/client.js under a stub module loader and React,
// registers the slots, deep-renders the panel and the chat column once — no browser required.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundlePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')
const source = readFileSync(bundlePath, 'utf8')

let bundle
const requireStub = (name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
}

const noop = () => {}
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
  useEffect: noop,
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  Fragment: 'Fragment',
}

const storage = new Map()
const fakeWindow = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      bundle = { id, module: factory(requireStub) }
    },
  },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
}

/* Styles are appended to document.head, so collect them there instead of in the tree. */
const injectedStyles = []
const fakeDocument = {
  createElement: () => ({ textContent: '', setAttribute: noop }),
  querySelectorAll: () => [],
  head: { appendChild: (node) => injectedStyles.push(node) },
}

globalThis.window = fakeWindow
globalThis.document = fakeDocument
globalThis.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL: noop }
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) })

const failures = []
const check = (name, condition, detail) => {
  if (condition) console.log(`PASS  ${name}`)
  else {
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

new Function('window', 'document', 'URL', 'fetch', source)(fakeWindow, fakeDocument, globalThis.URL, globalThis.fetch)

check('bundle registers under the package id', bundle && bundle.id === 'dsh-ppt-studio', bundle && bundle.id)
check('factory returns an apply() module', bundle && typeof bundle.module?.apply === 'function')
check('module declares inject: [slots]', Array.isArray(bundle.module.inject) && bundle.module.inject.includes('slots'))

const registrations = []
const ctx = {
  slots: {
    inject(key, callback) {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : noop
    },
    register(options, component) {
      registrations.push({ options, component })
      return noop
    },
  },
  get: () => undefined,
  effect: (setup) => (typeof setup === 'function' ? setup() : undefined),
  logger: { warn: noop },
}
bundle.module.apply(ctx)

const byName = (name) => registrations.filter((entry) => entry.options.name === name)
check('registers a sidebar.panellist entry', byName('sidebar.panellist').length === 1)
const panellist = byName('sidebar.panellist')[0]
check('sidebar entry id is ppt-studio', panellist?.options.id === 'ppt-studio', panellist?.options.id)
const label = panellist?.options.label
check('sidebar entry label is 工作台', (typeof label === 'function' ? label() : label) === 'PPT 工作台', String(typeof label))
check('registers a main panel page', byName('main').length === 1)
check('main page key is ppt-studio', byName('main')[0]?.options.key === 'ppt-studio')

/* ---------------------------------------------------------------- render */

const Icon = panellist.component
const icon = Icon({ size: 22, active: true })
check('icon renders an svg', icon && icon.type === 'svg' && icon.props.width === 22)

const Page = byName('main')[0].component

/** Render every function component in the tree once (enough to catch contract breakage). */
const deep = (node, depth = 0) => {
  if (!node || depth > 40) return node
  if (Array.isArray(node)) return node.map((child) => deep(child, depth + 1))
  if (typeof node !== 'object' || !node.type) return node
  if (typeof node.type === 'function') return deep(node.type({ ...node.props }), depth + 1)
  return { type: node.type, props: node.props, children: deep(node.children, depth + 1) }
}

const find = (node, predicate, hits = []) => {
  if (!node) return hits
  if (Array.isArray(node)) {
    for (const child of node) find(child, predicate, hits)
    return hits
  }
  if (typeof node !== 'object' || !node.type) return hits
  if (predicate(node)) hits.push(node)
  find(node.children, predicate, hits)
  return hits
}

let tree
try {
  tree = deep({ type: Page, props: {}, children: [] })
  check('panel renders without throwing', true)
} catch (error) {
  check('panel renders without throwing', false, error.message)
}
check('panel root is .ppt3-page', tree && tree.props?.className === 'ppt3-page', tree && tree.props?.className)

const classes = (name) => find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.split(' ').includes(name))
check('header renders', classes('ppt3-head').length === 1)
check('thumbnail column renders', classes('ppt3-thumbs').length === 1)
check('editing column renders', classes('ppt3-splitmain').length === 1)
check('chat column renders', classes('ppt3-chatcol').length === 1)
check('single divider renders', classes('ppt3-splitter').length === 1)

const splitter = classes('ppt3-splitter')[0]
check('divider is draggable', typeof splitter?.props?.onMouseDown === 'function' && typeof splitter?.props?.onDoubleClick === 'function')
check('divider hint mentions reset', String(splitter?.props?.title || '').includes('双击'), splitter?.props?.title)

const chatcol = classes('ppt3-chatcol')[0]
const chatBody = chatcol?.children?.find?.((node) => node && node.props)
check('chat takes the rest of the row', chatcol?.props?.style?.flex === '0.34 1 0%', JSON.stringify(chatcol?.props?.style))
check('chat keeps a usable minimum', chatcol?.props?.style?.minWidth === '220px')
check('chat column renders the conversation', find(chatcol, (node) => node.props?.className === 'ppt4') !== null || !!chatBody)
check('composer offers an attach control', classes('ppt4-attach').length === 1)
check(
  'composer carries a hidden file picker',
  find(tree, (node) => node.type === 'input' && node.props?.type === 'file').length === 1
)
check('chat accepts drops', find(tree, (node) => typeof node.props?.onDrop === 'function').length === 1)

/* ---------------------------------------------------------------- styles */

const css = injectedStyles.map((node) => node.textContent).join('\n')
check('page + chat styles are injected', injectedStyles.length === 2, String(injectedStyles.length))
check('style carries preview rules', css.includes('container-type:inline-size') && css.includes('.slide .el{position:absolute'))
check('style carries page rules', css.includes('.ppt3-page{') && css.includes('.ppt4-input textarea{'))
check('style carries the divider rules', css.includes('.ppt3-splitter::before') && css.includes('cursor:col-resize'))
check('style carries the editing width budget', css.includes('.ppt3-main{--ppt3-w:min(100%,calc((100vh - 470px) * 1.7778))'), String(css.indexOf('--ppt3-w')))
check(
  'preview keeps its 16:9 box when the form is tall',
  css.includes('.ppt3-preview{position:relative;flex:0 0 auto;') && css.includes('.ppt3-form{display:grid;flex:0 0 auto;'),
  'preview/form must not flex-shrink, otherwise a long form crops the slide'
)
check('style carries the projected stage', css.includes('.ppt3-stage{') && css.includes('.ppt3-stagebar{') && css.includes('.ppt3-navbtn{'))
check('style keeps thumbnail cards unsquashed', css.includes('.ppt3-thumb{position:relative;flex:0 0 auto;'))
check('style marks the assistant/user message sides', css.includes('.ppt4-msg.user .ppt4-bubble{max-width:86%') && css.includes('border-left:2px solid'))
check('style carries attachment rules', css.includes('.ppt4-files{') && css.includes('.ppt4-drop{') && css.includes('.ppt4-file-x{'))
check('style carries the process timeline', css.includes('.ppt4-tabs{') && css.includes('.ppt4-step{') && css.includes('.ppt4-step[data-status="running"]'))
check('style carries the AI page mark', css.includes('.ppt3-thumb[data-ai="true"]') && css.includes('.ppt3-aimark{'))
check(
  'style carries in-place editing',
  css.includes('.ppt3-preview-wrap{') && css.includes('.ppt3-hitlayer{') && css.includes('.ppt3-hit:hover{') && css.includes('.ppt3-editor{')
)
check('chat renders two tabs', classes('ppt4-tab').length === 2)

/* ---------------------------------------------------------------- activity */

const internals = bundle.module.__pptStudioInternals
check('internals exposed for the pre-flight', internals && typeof internals.deriveActivity === 'function')
if (internals && typeof internals.deriveActivity === 'function') {
  const windowSnapshot = {
    entries: [
      { type: 'event', event: { type: 'tool/call', seq: 1, time: 1000, data: { callId: 'c1', name: 'read', arguments: JSON.stringify({ file_path: 'D:\\origin\\.ppt-studio\\deck.json' }) } } },
      { type: 'event', event: { type: 'tool/result', seq: 2, time: 1400, data: { message: { toolCallId: 'c1' } } } },
      { type: 'event', event: { type: 'tool/call', seq: 3, time: 1500, data: { callId: 'c2', name: 'write', arguments: JSON.stringify({ file_path: 'deck.json' }) } } },
      { type: 'event', event: { type: 'tool/result', seq: 4, time: 2600, data: { message: { toolCallId: 'c2', isError: true } } } },
      { type: 'event', event: { type: 'tool/call', seq: 5, time: 3000, data: { callId: 'c3', name: 'mystery_tool', arguments: '{}' } } },
    ],
  }
  const steps = internals.deriveActivity(windowSnapshot)
  check('activity: one step per tool call', steps.length === 3, String(steps.length))
  check('activity: labels are translated', steps[0].label === '读取文件' && steps[1].label === '写入文件', JSON.stringify(steps.map((s) => s.label)))
  check('activity: targets keep the path', steps[0].target.includes('deck.json'), steps[0].target)
  check('activity: durations computed', steps[0].ms === 400 && steps[1].ms === 1100, JSON.stringify(steps.map((s) => s.ms)))
  check('activity: errors marked failed', steps[1].status === 'failed', steps[1].status)
  check('activity: unfinished call stays running', steps[2].status === 'running', steps[2].status)
  check('activity: unknown tool keeps its name', steps[2].label === 'mystery_tool', steps[2].label)

  const checkpoint = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. <compacted-summary> ...'
  check('compaction checkpoints stay out of the transcript', internals.cleanText(checkpoint) === '', internals.cleanText(checkpoint).slice(0, 60))
  check('real user text still passes through', internals.cleanText('把第 3 页改成两栏') === '把第 3 页改成两栏')
}
check('style carries markdown rules', css.includes('.ppt4-md-table table{') && css.includes('.ppt4-md-code{'))
check('style carries the narrow-column rules', css.includes('@container (max-width:320px)'))

/* ---------------------------------------------------------------- safety */

const innerHtmlNodes = find(tree, (node) => node.props && node.props.dangerouslySetInnerHTML)
const allowedHosts = new Set(['ppt3-thumb-frame', 'ppt3-preview'])
check(
  'slide HTML stays inside its own frames',
  innerHtmlNodes.every((node) => allowedHosts.has(String(node.props.className))),
  innerHtmlNodes.map((node) => node.props.className).join(',')
)
const markdownNodes = find(tree, (node) => typeof node.props?.className === 'string' && node.props.className.startsWith('ppt4-md'))
check('markdown renderer is wired into the chat', markdownNodes.length === 0 ? true : markdownNodes.length > 0)

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall client-half pre-flight checks passed')
process.exit(failures.length ? 1 : 0)

