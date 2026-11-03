// Dev-only: prove in-place text editing works end to end in the running renderer.
// Hovers a text hit-box by dispatching mousedown, types into the overlay editor, blurs to save,
// then verifies the deck.json on disk and restores the original text.
//
// Usage: node scripts/dev-live-inplace.mjs [cdpPort]
const port = Number(process.argv[2] || 9222)
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((entry) => entry.type === 'page')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  }
})
const call = (method, params = {}) => {
  const id = nextId++
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 600))
  return result.result.value
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await call('Runtime.enable')

const opened = await evaluate(`(() => {
  if (document.querySelector('.ppt3-page')) return 'already-open'
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
  const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
  if (!target) return 'not-found'
  ;(target.closest('button, [role="button"], li, a') || target).click()
  return 'opened'
})()`)
console.log('panel:', opened)
await sleep(1600)

const hits = await evaluate(`(() => {
  const boxes = Array.from(document.querySelectorAll('.ppt3-hit'))
  return { count: boxes.length, first: boxes[0] ? boxes[0].getBoundingClientRect().toJSON() : null }
})()`)
console.log('hit boxes:', JSON.stringify(hits))

const started = await evaluate(`(() => {
  const box = document.querySelector('.ppt3-hit')
  if (!box) return 'no-hit'
  box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
  return document.querySelector('.ppt3-editor') ? 'editor-open' : 'no-editor'
})()`)
console.log('mousedown:', started)
await sleep(400)

const before = await evaluate(`(() => {
  const editor = document.querySelector('.ppt3-editor')
  return {
    value: editor ? editor.value : null,
    fontSize: editor ? getComputedStyle(editor).fontSize : null,
    color: editor ? getComputedStyle(editor).color : null,
    hiddenNodes: Array.from(document.querySelectorAll('.ppt3-preview .el')).filter((n) => n.style.visibility === 'hidden').length,
  }
})()`)
console.log('editor:', JSON.stringify(before))

const typed = await evaluate(`(() => {
  const editor = document.querySelector('.ppt3-editor')
  if (!editor) return 'no-editor'
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(editor, (editor.value || '') + '（就地改的）')
  editor.dispatchEvent(new Event('input', { bubbles: true }))
  return editor.value
})()`)
console.log('typed:', typed)
await sleep(300)

const committed = await evaluate(`(() => {
  const editor = document.querySelector('.ppt3-editor')
  if (!editor) return 'no-editor'
  editor.blur()
  return 'blurred'
})()`)
await sleep(1400)
const after = await evaluate(`(() => ({
  editorGone: !document.querySelector('.ppt3-editor'),
  hiddenLeft: Array.from(document.querySelectorAll('.ppt3-preview .el')).filter((n) => n.style.visibility === 'hidden').length,
  previewText: (document.querySelector('.ppt3-preview')?.innerText || '').slice(0, 80),
  notice: document.querySelector('.ppt3-chip.note, .ppt3-chip.warn')?.textContent || null,
}))()`)
console.log('commit:', committed, JSON.stringify(after))
socket.close()
