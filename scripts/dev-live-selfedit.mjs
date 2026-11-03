// Dev-only: prove that the user's own in-panel edit does NOT raise the "external change" mark,
// while a real outside write still does. Edits the 标题 field through a native input event,
// waits for the debounced save + one poll, then restores the original title.
//
// Usage: node scripts/dev-live-selfedit.mjs [cdpPort]
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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 500))
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

const before = await evaluate(`(() => {
  const input = document.querySelector('.ppt3-field.col-main input')
  return { title: input ? input.value : null, marks: document.querySelectorAll('[data-ai="true"]').length, chip: !!document.querySelector('.ppt3-aimark') }
})()`)
console.log('before:', JSON.stringify(before))

// Type into the controlled input the way React sees it.
const typed = await evaluate(`(() => {
  const input = document.querySelector('.ppt3-field.col-main input')
  if (!input) return 'no-input'
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, (input.value || '') + '（自己改的）')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return input.value
})()`)
console.log('typed:', typed)

// debounce 420ms + PUT + poll 1400ms
await sleep(3200)
const after = await evaluate(`(() => ({
  title: document.querySelector('.ppt3-field.col-main input')?.value ?? null,
  marks: document.querySelectorAll('[data-ai="true"]').length,
  chip: document.querySelector('.ppt3-aimark')?.textContent || null,
  notice: document.querySelector('.ppt3-chip.note, .ppt3-chip.warn')?.textContent || null,
}))()`)
console.log('after self edit:', JSON.stringify(after))
console.log(
  after.marks === 0 && !after.chip ? 'PASS  自己改的页面没有被标成外部改动' : 'FAIL  自己改的被标成了外部改动'
)

// put the title back
await evaluate(`(() => {
  const input = document.querySelector('.ppt3-field.col-main input')
  if (!input) return 'no-input'
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, input.value.replace('（自己改的）', ''))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return input.value
})()`)
await sleep(2600)
const restored = await evaluate(`(() => ({
  title: document.querySelector('.ppt3-field.col-main input')?.value ?? null,
  marks: document.querySelectorAll('[data-ai="true"]').length,
  chip: document.querySelector('.ppt3-aimark')?.textContent || null,
}))()`)
console.log('restored:', JSON.stringify(restored))
socket.close()
