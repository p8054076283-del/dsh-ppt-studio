// Dev-only: open the PPT workbench in the running desktop renderer over CDP, measure the
// split row, exercise the divider, screenshot, then hand the main column back to the
// conversation. Attaches read-mostly (DOM clicks + one drag), never reloads the app.
//
// Usage: node scripts/dev-live-open.mjs <outDir> [cdpPort]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] || 'shots'
const port = Number(process.argv[3] || 9222)
mkdirSync(outDir, { recursive: true })

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((entry) => entry.type === 'page')
if (!page) throw new Error('no renderer target')
console.log('target:', page.url, '|', page.title)

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
const shot = async (name) => {
  const result = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, name), Buffer.from(result.data, 'base64'))
  console.log('shot ->', join(outDir, name))
}

const MEASURE = `(() => {
  const box = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hasPanel: !!document.querySelector('.ppt3-page'),
    page: box(document.querySelector('.ppt3-page')),
    thumbs: box(document.querySelector('.ppt3-thumbs')),
    splitmain: box(document.querySelector('.ppt3-splitmain')),
    preview: box(document.querySelector('.ppt3-preview')),
    toolbar: box(document.querySelector('.ppt3-toolbar')),
    form: box(document.querySelector('.ppt3-form')),
    titleInput: box(document.querySelector('.ppt3-field.full input')),
    splitter: box(document.querySelector('.ppt3-splitter')),
    chatcol: box(document.querySelector('.ppt3-chatcol')),
    chatLog: box(document.querySelector('.ppt4-log')),
    bubble: box(document.querySelector('.ppt4-bubble')),
    bubbles: document.querySelectorAll('.ppt4-bubble').length,
    mdTables: document.querySelectorAll('.ppt4-md-table table').length,
    mdCode: document.querySelectorAll('.ppt4-md-code').length,
    mdStrong: document.querySelectorAll('.ppt4-bubble strong').length,
    mdLists: document.querySelectorAll('.ppt4-md-list').length,
    rawAsterisks: (document.body.innerText.match(/\\*\\*/g) || []).length,
    splitFlex: document.querySelector('.ppt3-splitmain')?.style?.flex || null,
    chatFlex: document.querySelector('.ppt3-chatcol')?.style?.flex || null,
    splitterVisible: (() => { const node = document.querySelector('.ppt3-splitter'); if (!node) return null; const style = getComputedStyle(node, '::before'); return { width: style.width, height: style.height, background: style.backgroundColor } })(),
    mainScrolls: (() => { const node = document.querySelector('.ppt3-main'); return node ? node.scrollHeight > node.clientHeight + 2 : null })(),
    stored: (() => { try { return window.localStorage.getItem('pptStudio.splitRatio.v2') } catch (error) { return 'n/a' } })(),
  }
})()`

await call('Runtime.enable')
await call('Page.enable')

// 1. open the workbench from the left sidebar
const opened = await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
  const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
  if (!target) return 'not-found'
  const clickable = target.closest('button, [role="button"], li, a') || target
  clickable.click()
  return 'clicked'
})()`)
console.log('open panel:', opened)
await sleep(2000)
console.log('initial:', JSON.stringify(await evaluate(MEASURE), null, 2))
await shot('10-panel-default.png')

// 2. drag the divider ~180px to the left
const before = await evaluate(MEASURE)
if (before.splitter) {
  const startX = before.splitter.x + Math.round(before.splitter.w / 2)
  const y = before.splitter.y + Math.round(before.splitter.h / 2)
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y, button: 'left', buttons: 1, clickCount: 1 })
  for (let step = 1; step <= 9; step += 1) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX - step * 20, y, button: 'left', buttons: 1 })
    await sleep(40)
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX - 180, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(700)
  console.log('after drag:', JSON.stringify(await evaluate(MEASURE), null, 2))
  await shot('11-panel-dragged.png')

  // 3. double-click resets
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX - 180, y, button: 'left', buttons: 1, clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX - 180, y, button: 'left', buttons: 0, clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX - 180, y, button: 'left', buttons: 1, clickCount: 2 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX - 180, y, button: 'left', buttons: 0, clickCount: 2 })
  await sleep(700)
  console.log('after reset:', JSON.stringify(await evaluate(MEASURE), null, 2))
  await shot('12-panel-reset.png')
}

// 4. hand the main column back to the conversation
const back = await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
  const target = nodes.find((node) => (node.textContent || '').trim() === '回到对话')
  if (!target) return 'not-found'
  target.click()
  return 'clicked'
})()`)
console.log('back to conversation:', back)
await sleep(1200)
console.log('restored:', JSON.stringify(await evaluate(MEASURE)))

socket.close()
