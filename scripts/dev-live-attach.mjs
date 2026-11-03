// Dev-only: exercise the chat's paste-attachment path in the running renderer over CDP.
// Creates a real File in the page, fires a paste event at the composer, then reads the UI
// state back (chips + upload result). Leaves the message unsent and removes the chip.
//
// Usage: node scripts/dev-live-attach.mjs <outDir> [cdpPort]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] || 'shots'
const port = Number(process.argv[3] || 9222)
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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 600))
  return result.result.value
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const shot = async (name) => {
  const result = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, name), Buffer.from(result.data, 'base64'))
  console.log('shot ->', join(outDir, name))
}

await call('Runtime.enable')
await call('Page.enable')

// 1. open the workbench if it is not already open
const opened = await evaluate(`(() => {
  if (document.querySelector('.ppt3-page')) return 'already-open'
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
  const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
  if (!target) return 'not-found'
  ;(target.closest('button, [role="button"], li, a') || target).click()
  return 'clicked'
})()`)
console.log('panel:', opened)
await sleep(1800)

// 2. a 1x1 PNG, pasted straight into the composer as a File
const paste = await evaluate(`(() => {
  const textarea = document.querySelector('.ppt4 textarea')
  if (!textarea) return 'no-composer'
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const file = new File([bytes], '测试图.png', { type: 'image/png' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
  textarea.focus()
  textarea.dispatchEvent(event)
  return 'pasted'
})()`)
console.log('paste:', paste)
await sleep(1800)

const before = await evaluate(`(() => {
  const chips = Array.from(document.querySelectorAll('.ppt4-file')).map((node) => ({
    name: node.querySelector('.ppt4-file-name')?.textContent || '',
    size: node.querySelector('.ppt4-file-size')?.textContent || '',
    title: node.getAttribute('title') || '',
    state: node.getAttribute('data-state') || 'ready',
    hasRemove: !!node.querySelector('.ppt4-file-x'),
  }))
  const send = document.querySelector('.ppt4-send')
  return {
    chips,
    attachButton: !!document.querySelector('.ppt4-attach'),
    picker: !!document.querySelector('input[type="file"]'),
    sendDisabled: send ? send.disabled : null,
    error: document.querySelector('.ppt4-error')?.textContent || '',
  }
})()`)
console.log('after paste:', JSON.stringify(before, null, 2))
await shot('70-attachment-chip.png')

// 3. clean up: drop the chip again so nothing is left armed in the real composer
const cleared = await evaluate(`(() => {
  const remove = document.querySelector('.ppt4-file-x')
  if (!remove) return 'no-chip'
  remove.click()
  return 'removed'
})()`)
await sleep(400)
const after = await evaluate(`document.querySelectorAll('.ppt4-file').length`)
console.log('cleanup:', cleared, 'chips now:', after)

// 3b. the drop path: a real DragEvent with a File, fired at the column root
await evaluate(`(() => {
  const root = document.querySelector('.ppt4')
  if (!root) return 'no-chat'
  window.__pptDropTransfer = new DataTransfer()
  window.__pptDropTransfer.items.add(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], '拖入测试.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }))
  root.dispatchEvent(new DragEvent('dragover', { dataTransfer: window.__pptDropTransfer, bubbles: true, cancelable: true }))
  return 'dragover'
})()`)
await sleep(500)
const overlay = await evaluate(`!!document.querySelector('.ppt4-drop')`)
await shot('71-attachment-drop-overlay.png')
const dropped = await evaluate(`(() => {
  const root = document.querySelector('.ppt4')
  root.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__pptDropTransfer, bubbles: true, cancelable: true }))
  return 'dropped'
})()`)
await sleep(1600)
const dropState = await evaluate(`(() => {
  const chips = Array.from(document.querySelectorAll('.ppt4-file')).map((node) => ({
    name: node.querySelector('.ppt4-file-name')?.textContent || '',
    title: node.getAttribute('title') || '',
    state: node.getAttribute('data-state') || 'ready',
  }))
  return { overlayAfterDrop: !!document.querySelector('.ppt4-drop'), chips, error: document.querySelector('.ppt4-error')?.textContent || '' }
})()`)
console.log('drop overlay shown:', overlay, '|', dropped, JSON.stringify(dropState, null, 2))
await shot('72-attachment-drop.png')
const clearedDrop = await evaluate(`(() => {
  const remove = document.querySelector('.ppt4-file-x')
  if (!remove) return 'no-chip'
  remove.click()
  return 'removed'
})()`)
await sleep(300)
console.log('drop cleanup:', clearedDrop, 'chips now:', await evaluate(`document.querySelectorAll('.ppt4-file').length`))

// 4. hand the main column back if we opened it ourselves
if (opened === 'clicked') {
  await evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
    const target = nodes.find((node) => (node.textContent || '').trim() === '回到对话')
    if (target) target.click()
  })()`)
  console.log('returned to conversation')
}

socket.close()
