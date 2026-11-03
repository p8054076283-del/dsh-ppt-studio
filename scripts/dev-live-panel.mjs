// Dev-only: open/close the workbench, switch the chat tab, take a screenshot — over CDP.
// Usage: node scripts/dev-live-panel.mjs <outDir> <open|close|tab-chat|tab-process|shot> [shotName]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] || 'shots'
const action = process.argv[3] || 'shot'
const shotName = process.argv[4] || `${action}.png`
const port = Number(process.env.CDP_PORT || 9222)
mkdirSync(outDir, { recursive: true })

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await call('Runtime.enable')
await call('Page.enable')

if (action === 'open') {
  const opened = await evaluate(`(() => {
    if (document.querySelector('.ppt3-page')) return 'already-open'
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
    const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
    if (!target) return 'not-found'
    ;(target.closest('button, [role="button"], li, a') || target).click()
    return 'opened'
  })()`)
  console.log('panel:', opened)
  await sleep(1500)
} else if (action === 'close') {
  const closed = await evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
    const target = nodes.find((node) => (node.textContent || '').trim() === '回到对话')
    if (!target) return 'not-found'
    target.click()
    return 'closed'
  })()`)
  console.log('panel:', closed)
  await sleep(800)
} else if (action === 'tab-process' || action === 'tab-chat') {
  const wanted = action === 'tab-process' ? '过程' : '对话'
  const result = await evaluate(`(() => {
    const tabs = Array.from(document.querySelectorAll('.ppt4-tab'))
    const target = tabs.find((node) => (node.textContent || '').startsWith(${JSON.stringify(wanted)}))
    if (!target) return 'no-tab:' + tabs.length
    target.click()
    return 'switched'
  })()`)
  console.log('tab:', result)
  await sleep(500)
}

if (action !== 'close' && (action === 'shot' || action === 'open' || action === 'tab-process' || action === 'tab-chat')) {
  const result = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, shotName), Buffer.from(result.data, 'base64'))
  console.log('shot ->', join(outDir, shotName))
}

socket.close()
