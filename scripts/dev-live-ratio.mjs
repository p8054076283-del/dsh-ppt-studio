// Dev-only: put the divider ratio back to a caller-supplied value (the live window is the user's).
// Usage: node scripts/dev-live-ratio.mjs 0.624 [cdpPort]
const ratio = process.argv[2] || '0.66'
const port = Number(process.argv[3] || 9222)

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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400))
  return result.result.value
}

await call('Runtime.enable')
console.log(
  await evaluate(`(() => {
    try {
      window.localStorage.setItem('pptStudio.splitRatio.v2', ${JSON.stringify(ratio)})
      return 'stored ' + window.localStorage.getItem('pptStudio.splitRatio.v2')
    } catch (error) {
      return 'failed: ' + error.message
    }
  })()`)
)
socket.close()
