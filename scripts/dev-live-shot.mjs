// Dev-only: attach to the running DSH desktop renderer over CDP (the app is started with
// --remote-debugging-port=9222), measure the PPT workbench layout and save a screenshot.
// Read-only: it never dispatches input, so the user's live window is left untouched.
//
// Usage: node scripts/dev-live-shot.mjs <out.png> [cdpPort]
import { writeFileSync } from 'node:fs'

const out = process.argv[2] || 'live.png'
const port = Number(process.argv[3] || 9222)

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
for (const entry of list) console.log(entry.type, '|', entry.url, '|', entry.title)

const page = list.find((entry) => entry.type === 'page' && /127\.0\.0\.1:\d+|dsh-app:/.test(entry.url))
if (!page) throw new Error('no renderer target: ' + list.map((entry) => entry.type).join(','))

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
await call('Page.enable')

const info = await evaluate(`(() => {
  const box = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const page = document.querySelector('.ppt3-page')
  const out = {
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hasPanel: !!page,
    page: box(page),
    head: box(document.querySelector('.ppt3-head')),
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
    stored: (() => { try { return window.localStorage.getItem('pptStudio.splitRatio.v2') } catch (error) { return 'n/a' } })(),
    thumbStrip: (() => {
      const strip = document.querySelector('.ppt3-thumbs')
      if (!strip) return null
      const cards = Array.from(document.querySelectorAll('.ppt3-thumb')).map((card, index) => {
        const frame = card.querySelector('.ppt3-thumb-frame')
        const cardRect = card.getBoundingClientRect()
        const frameRect = frame ? frame.getBoundingClientRect() : null
        return {
          index: index + 1,
          cardH: Math.round(cardRect.height),
          frameW: frameRect ? Math.round(frameRect.width) : null,
          frameH: frameRect ? Math.round(frameRect.height) : null,
          frameRatio: frameRect ? +(frameRect.width / frameRect.height).toFixed(3) : null,
          slideH: frame ? Math.round((frame.querySelector('.slide')?.getBoundingClientRect().height || 0)) : null,
        }
      })
      return { scrollHeight: strip.scrollHeight, clientHeight: strip.clientHeight, scrolls: strip.scrollHeight > strip.clientHeight + 1, cards }
    })(),
  }
  return out
})()`)
console.log(JSON.stringify(info, null, 2))

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('saved:', out)

socket.close()
