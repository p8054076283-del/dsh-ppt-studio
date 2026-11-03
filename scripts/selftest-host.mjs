// Host-half smoke test: exercises the loopback-only deck route without installing the bundle.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

let route
const ctx = {
  webServer: { register(value) { route = value; return () => {} } },
  effect(setup) { return setup() },
  logger: { warn() {} },
}
apply(ctx, {})

function fakeReq(method, url, body, address) {
  return {
    method,
    url,
    socket: { remoteAddress: address ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body, 'utf8')
    },
  }
}

function fakeRes() {
  const state = { status: 0, headers: {}, body: '' }
  return {
    state,
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(text) { state.body = text },
  }
}

const call = async (method, url, body, address) => {
  const req = fakeReq(method, url, body, address)
  const res = fakeRes()
  await route.handler(req, res)
  return { status: res.state.status, json: JSON.parse(res.state.body || '{}') }
}

const failures = []
const check = (name, condition, detail) => {
  if (condition) console.log(`PASS  ${name}`)
  else {
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'ppt-studio-'))
try {
  check('route prefix registered', route.kind === 'prefix' && route.path === '/ppt-studio')

  const health = await call('GET', '/ppt-studio/health')
  check('health returns ok', health.status === 200 && health.json.ok === true, JSON.stringify(health))

  const denied = await call('PUT', '/ppt-studio/deck', '{}', '10.0.0.7')
  check('non-loopback is refused', denied.status === 403, JSON.stringify(denied))

  const deck = { version: 1, meta: { title: '冒烟测试' }, slides: [{ id: 's1', layout: 'cover', title: '你好', body: '世界' }] }
  const written = await call('PUT', '/ppt-studio/deck', JSON.stringify({ workspaceRoot: workspace, deck }))
  const target = join(workspace, '.ppt-studio', 'deck.json')
  check('deck write returns ok', written.status === 200 && written.json.ok === true, JSON.stringify(written))
  check('deck file exists', existsSync(target))
  const roundTrip = JSON.parse(readFileSync(target, 'utf8'))
  check('deck round-trips', roundTrip.meta.title === '冒烟测试' && roundTrip.slides.length === 1)
  check('no temp file left behind', !existsSync(join(workspace, '.ppt-studio', `deck.json.${process.pid}.tmp`)))

  const relative = await call('PUT', '/ppt-studio/deck', JSON.stringify({ workspaceRoot: 'relative/dir', deck }))
  check('relative workspaceRoot rejected', relative.status === 400, JSON.stringify(relative))

  const missingRoot = await call('PUT', '/ppt-studio/deck', JSON.stringify({ workspaceRoot: join(workspace, 'nope'), deck }))
  check('missing workspace rejected', missingRoot.status === 400, JSON.stringify(missingRoot))

  /* ---- attachments: pasted / dropped files parked next to the deck ---- */
  const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const image = await call(
    'POST',
    '/ppt-studio/upload',
    JSON.stringify({ workspaceRoot: workspace, name: '粘贴-20261103-2230.png', mime: 'image/png', data: pngBytes.toString('base64') })
  )
  check('image upload returns ok', image.status === 200 && image.json.ok === true, JSON.stringify(image).slice(0, 200))
  check('image goes to the deck asset folder', image.json.kind === 'image' && String(image.json.rel).startsWith('.ppt-studio/assets/'), image.json.rel)
  check('image bytes written', existsSync(join(workspace, image.json.rel)) && readFileSync(join(workspace, image.json.rel)).length === pngBytes.length)

  const doc = await call(
    'POST',
    '/ppt-studio/upload',
    JSON.stringify({ workspaceRoot: workspace, name: '需求.docx', data: Buffer.from('hello').toString('base64') })
  )
  check('non-image goes to the inbox', doc.json.kind === 'file' && String(doc.json.rel).startsWith('.ppt-studio/inbox/'), doc.json.rel)

  const again = await call(
    'POST',
    '/ppt-studio/upload',
    JSON.stringify({ workspaceRoot: workspace, name: '需求.docx', data: Buffer.from('hello again').toString('base64') })
  )
  check('same name never overwrites', again.json.name === '需求 (1).docx', again.json.name)

  const traversal = await call(
    'POST',
    '/ppt-studio/upload',
    JSON.stringify({ workspaceRoot: workspace, name: '../../../evil.txt', data: Buffer.from('x').toString('base64') })
  )
  check('path traversal is flattened', traversal.json.name === 'evil.txt' && !existsSync(join(workspace, '..', '..', '..', 'evil.txt')), traversal.json.name)

  const empty = await call('POST', '/ppt-studio/upload', JSON.stringify({ workspaceRoot: workspace, name: 'a.txt', data: '' }))
  check('empty upload rejected', empty.status === 400, JSON.stringify(empty))

  const unknown = await call('GET', '/ppt-studio/nope')
  check('unknown path 404', unknown.status === 404, JSON.stringify(unknown))
} finally {
  rmSync(workspace, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall host-half checks passed')
process.exit(failures.length ? 1 : 0)

