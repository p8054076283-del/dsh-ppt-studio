// Dev-only: open the workbench on a given page index and dump preview geometry + computed styles.
// Usage: node scripts/dev-live-diag.mjs <pageIndex 1-based> <outDir> [cdpPort]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pageIndex = Number(process.argv[2] || 1)
const outDir = process.argv[3] || 'shots'
const port = Number(process.argv[4] || 9222)
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

await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], li, a, div, span'))
  const target = nodes.find((node) => (node.textContent || '').trim() === 'PPT 工作台')
  if (target) (target.closest('button, [role="button"], li, a') || target).click()
})()`)
await sleep(1600)

const picked = await evaluate(`(() => {
  const thumbs = Array.from(document.querySelectorAll('.ppt3-thumb'))
  const target = thumbs[${pageIndex - 1}]
  if (!target) return 'missing ' + thumbs.length
  target.click()
  return 'picked ' + thumbs.length
})()`)
console.log(picked)
await sleep(900)

const info = await evaluate(`(() => {
  const rect = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), ratio: +(r.width / r.height).toFixed(3) } }
  const style = (node, props) => { if (!node) return null; const computed = getComputedStyle(node); const out = {}; for (const prop of props) out[prop] = computed[prop]; return out }
  const preview = document.querySelector('.ppt3-preview')
  const slide = document.querySelector('.ppt3-preview .slide, .slide')
  const main = document.querySelector('.ppt3-main')
  const els = Array.from(document.querySelectorAll('.ppt3-preview .el')).map((node, index) => ({
    index,
    rect: rect(node),
    inline: node.getAttribute('style'),
    className: node.className,
  }))
  const table = document.querySelector('.ppt3-preview .tb')
  const rows = table ? Array.from(table.querySelectorAll('tr')).map((tr) => +tr.getBoundingClientRect().height.toFixed(1)) : []
  return {
    viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, clientWidth: document.documentElement.clientWidth, dpr: window.devicePixelRatio },
    previewRect: rect(preview),
    previewStyle: style(preview, ['aspectRatio', 'height', 'maxHeight', 'overflow', 'flex', 'alignSelf', 'boxSizing']),
    slideRect: rect(slide),
    slideStyle: style(slide, ['aspectRatio', 'height', 'overflow', 'width']),
    main: main ? { rect: rect(main), scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, scrollTop: main.scrollTop } : null,
    elCount: els.length,
    els,
    tableRows: rows,
    thumbStrip: (() => {
      const strip = document.querySelector('.ppt3-thumbs')
      if (!strip) return null
      const cards = Array.from(document.querySelectorAll('.ppt3-thumb')).map((card, index) => {
        const frame = card.querySelector('.ppt3-thumb-frame')
        const frameRect = frame ? frame.getBoundingClientRect() : null
        return {
          index: index + 1,
          cardH: Math.round(card.getBoundingClientRect().height),
          frameW: frameRect ? Math.round(frameRect.width) : null,
          frameH: frameRect ? Math.round(frameRect.height) : null,
          frameRatio: frameRect ? +(frameRect.width / frameRect.height).toFixed(3) : null,
        }
      })
      return { scrollHeight: strip.scrollHeight, clientHeight: strip.clientHeight, scrollTop: strip.scrollTop, scrolls: strip.scrollHeight > strip.clientHeight + 1, cards }
    })(),
    selected: document.querySelector('.ppt3-thumb[data-selected="true"] .ppt3-thumb-num')?.textContent,
    layoutText: document.querySelector('.ppt3-field select')?.value,
  }
})()`)
console.log(JSON.stringify(info, null, 2))
await shot(`30-diag-page${pageIndex}.png`)

await evaluate(`(() => {
  const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
  const target = nodes.find((node) => (node.textContent || '').trim() === '回到对话')
  if (target) target.click()
})()`)
socket.close()

