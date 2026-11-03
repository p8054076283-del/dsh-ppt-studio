// Dev-only: sweep viewport sizes in the running renderer and check the workbench split row
// never overflows and keeps both halves inside the page. Leaves the app on the conversation.
//
// Usage: node scripts/dev-live-sweep.mjs <outDir> [cdpPort]
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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400))
  return result.result.value
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const shot = async (name) => {
  const result = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, name), Buffer.from(result.data, 'base64'))
}

await call('Runtime.enable')
await call('Page.enable')

await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
  const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
  if (target) (target.closest('button, [role="button"], li, a') || target).click()
})()`)
await sleep(1800)

const MEASURE = `(() => {
  const box = (selector) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) } }
  const page = document.querySelector('.ppt3-page')
  const pageRect = page ? page.getBoundingClientRect() : null
  const chat = document.querySelector('.ppt3-chatcol')
  const chatRect = chat ? chat.getBoundingClientRect() : null
  const splitmain = document.querySelector('.ppt3-splitmain')
  const splitRect = splitmain ? splitmain.getBoundingClientRect() : null
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    page: box('.ppt3-page'),
    thumbs: box('.ppt3-thumbs'),
    splitmain: box('.ppt3-splitmain'),
    splitter: box('.ppt3-splitter'),
    preview: box('.ppt3-preview'),
    form: box('.ppt3-form'),
    chatcol: box('.ppt3-chatcol'),
    chatScrollbar: (() => { const node = document.querySelector('.ppt4-log'); return node ? node.scrollWidth - node.clientWidth : null })(),
    pageOverflowX: page ? Math.max(0, Math.round(pageRect.right - window.innerWidth)) : null,
    bodyOverflowX: Math.max(0, document.body.scrollWidth - window.innerWidth),
    chatEndsAtPage: chatRect && pageRect ? Math.round(pageRect.right - chatRect.right) : null,
    splitBeforeChat: splitRect && chatRect ? Math.round(chatRect.left - splitRect.right) : null,
    editorRightOfPreview: splitRect ? Math.round(splitRect.right - (document.querySelector('.ppt3-preview')?.getBoundingClientRect().right || 0)) : null,
    mainScrolls: (() => { const node = document.querySelector('.ppt3-main'); return node ? node.scrollHeight > node.clientHeight + 2 : null })(),
  }
})()`

const sizes = [
  [900, 700],
  [1100, 800],
  [1280, 820],
  [1600, 900],
  [1920, 1040],
]
const results = []
for (const [width, height] of sizes) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  const measured = await evaluate(MEASURE)
  results.push({ size: `${width}x${height}`, ...measured })
  if (width === 900 || width === 1920) {
    await shot(`20-sweep-${width}x${height}.png`)
  }
}
for (const row of results) {
  console.log(`${row.size}  page=${row.page.w}  thumbs=${row.thumbs.w}  editor=${row.splitmain.w}  preview=${row.preview.w}x${row.preview.h}  chat=${row.chatcol.w}  overflowX(page/body)=${row.pageOverflowX}/${row.bodyOverflowX}  chatEndsAtPage=${row.chatEndsAtPage}  splitBeforeChat=${row.splitBeforeChat}  upToPreviewEdge=${row.editorRightOfPreview}  scroll=${row.mainScrolls}`)
}

await call('Emulation.clearDeviceMetricsOverride')
await sleep(400)
await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
  const target = nodes.find((node) => (node.textContent || '').trim() === '回到对话')
  if (target) target.click()
})()`)
console.log('restored viewport + conversation')
socket.close()
