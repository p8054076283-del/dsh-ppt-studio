// Host half of the PPT workbench bundle.
//
// The browser half needs capabilities the composed Host does not already expose to a Client
// plugin: reading and writing `.ppt-studio/deck.json` in a workspace, parking files the user
// pastes or drops into the chat next to that deck, and running the PPTX importer (python-pptx
// lives in the bundled runtime). All of them are loopback-only HTTP routes on the same Web
// server the page is loaded from.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTE = '/ppt-studio'
const DECK_DIR = '.ppt-studio'
const DECK_FILE = 'deck.json'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_UPLOAD_BODY_BYTES = 36 * 1024 * 1024
const UPLOAD_FILE_LIMIT = 24 * 1024 * 1024
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export const inject = ['webServer', 'clientModules']

/** Browser-half diagnostics pushed from the page; kept in memory for GET /report. */
const reports = []

function record(kind, detail) {
  reports.push({ time: new Date().toISOString(), kind, detail })
  if (reports.length > 80) reports.shift()
}

export function apply(ctx, config) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: (req, res) => handle(ctx, req, res) }),
    'ppt-studio routes'
  )
}

function reply(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/// The directory the panel works in: an explicit absolute path, else the most recent
/// registered workspace, else the Host default directory.
function resolveRoot(ctx, requested) {
  if (typeof requested === 'string' && requested.trim()) {
    if (!isAbsolute(requested)) throw Object.assign(new Error('dir 必须是绝对路径'), { status: 400 })
    return resolve(requested)
  }
  try {
    const registry = ctx.get && ctx.get('workspaceRegistry')
    const workspaces = registry && typeof registry.list === 'function' ? registry.list() : []
    for (const workspace of workspaces) {
      if (workspace && typeof workspace.path === 'string' && workspace.path.trim()) return resolve(workspace.path)
    }
  } catch {
    /* fall through to the default directory */
  }
  let fallback
  try {
    const workingDirectory = ctx.get && ctx.get('workingDirectory')
    fallback = workingDirectory && workingDirectory.defaultDirectory
  } catch {
    fallback = undefined
  }
  if (!fallback) throw Object.assign(new Error('无法确定工作区目录'), { status: 400 })
  return resolve(fallback)
}

function deckFolder(root, create) {
  let info
  try {
    info = statSync(root)
  } catch {
    throw Object.assign(new Error(`工作区目录不存在：${root}`), { status: 400 })
  }
  if (!info.isDirectory()) throw Object.assign(new Error(`工作区不是目录：${root}`), { status: 400 })
  const folder = join(root, DECK_DIR)
  if (create) mkdirSync(folder, { recursive: true })
  return folder
}

function readDeck(root) {
  const target = join(deckFolder(root, false), DECK_FILE)
  let text
  try {
    text = readFileSync(target, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false }
    throw error
  }
  const cleaned = text.replace(/^\uFEFF/, '')
  try {
    return { exists: true, deck: JSON.parse(cleaned), text }
  } catch (error) {
    return { exists: true, errorText: String(error && error.message ? error.message : error), text }
  }
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'])

/** A filesystem-safe name: no path segments, no reserved characters, extension kept. */
function safeFileName(raw, kind) {
  const fallback = kind === 'image' ? 'image.png' : 'attachment'
  let name = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
  name = name
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name || name === '.' || name === '..') name = fallback
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return `${stem.slice(0, 80) || 'attachment'}${ext.slice(0, 12)}`
}

/** Never overwrite a previous upload: add " (1)", " (2)" … before the extension. */
function uniqueTarget(folder, name) {
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  let target = join(folder, name)
  let counter = 1
  while (existsSync(target)) {
    target = join(folder, `${stem} (${counter})${ext}`)
    counter += 1
    if (counter > 999) throw Object.assign(new Error('同名文件过多'), { status: 409 })
  }
  return target
}

/* ------------------------------------------------------------------ PPTX 导入 */

/** Candidate interpreters, most specific first; the bundled runtime is the usual hit. */
function pythonCandidates() {
  const list = []
  if (process.env.DSH_PPT_PYTHON) list.push(process.env.DSH_PPT_PYTHON)
  try {
    list.push(join(dirname(process.execPath), 'resources', 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'))
  } catch {
    /* execPath is always there, but never let a guess break the route */
  }
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) {
    list.push(join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'))
    list.push(join(home, '.dsh', 'runtimes', 'primary-runtime', 'dependencies', 'python', 'python.exe'))
  }
  list.push('python', 'python3', 'py')
  return list
}

function runPython(interpreter, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      interpreter,
      args,
      { timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(Object.assign(new Error(`${stderr || error.message}`.trim().slice(0, 600) || 'python 执行失败'), { stderr }))
          return
        }
        resolvePromise({ stdout: String(stdout || ''), stderr: String(stderr || '') })
      }
    )
  })
}

async function importPptx(ctx, root, filePath) {
  const script = fileURLToPath(new URL('../scripts/import-pptx.py', import.meta.url))
  if (!existsSync(script)) throw Object.assign(new Error('缺少导入脚本 import-pptx.py'), { status: 500 })
  const candidates = pythonCandidates()
  let lastError
  for (const candidate of candidates) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (!existsSync(candidate)) continue
    }
    try {
      const result = await runPython(candidate, [script, filePath, root])
      const line = result.stdout.trim().split('\n').pop() || '{}'
      let stats = {}
      try {
        stats = JSON.parse(line)
      } catch {
        stats = { ok: false, error: line.slice(0, 300) }
      }
      record('import', `${basename(filePath)} ${JSON.stringify(stats).slice(0, 160)}`)
      return { interpreter: candidate, ...stats }
    } catch (error) {
      lastError = error
      const text = `${error?.message ?? error}`
      // A missing python-pptx just means "wrong interpreter, try the next one".
      if (!/No module named|ModuleNotFoundError|cannot import name/i.test(text)) throw Object.assign(error, { status: 500 })
    }
  }
  throw Object.assign(new Error(`找不到可用的 python（含 python-pptx）：${String(lastError?.message ?? '未知错误').slice(0, 200)}`), { status: 500 })
}

async function handle(ctx, req, res) {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) {
    reply(res, 403, { ok: false, error: 'only loopback clients may use the PPT workbench route' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname.slice(ROUTE.length) || '/'
  try {
    if (req.method === 'GET' && path === '/health') {
      reply(res, 200, { ok: true })
      return
    }
    if (req.method === 'GET' && path === '/state') {
      const root = resolveRoot(ctx, url.searchParams.get('dir') ?? '')
      const read = readDeck(root)
      reply(res, 200, { ok: true, dir: root, ...read })
      return
    }
    if (req.method === 'GET' && path === '/asset') {
      const root = resolveRoot(ctx, url.searchParams.get('dir') ?? '')
      const rel = url.searchParams.get('rel') ?? ''
      const target = resolve(root, DECK_DIR, rel)
      if (!target.startsWith(resolve(root, DECK_DIR))) {
        reply(res, 400, { ok: false, error: '图片路径越界' })
        return
      }
      let bytes
      try {
        bytes = readFileSync(target)
      } catch (error) {
        reply(res, 404, { ok: false, error: `图片不存在：${rel}` })
        return
      }
      const ext = target.toLowerCase().split('.').pop()
      const type =
        ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'svg'
                  ? 'image/svg+xml'
                  : 'application/octet-stream'
      res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'no-store' })
      res.end(bytes)
      return
    }
    if (req.method === 'POST' && path === '/cancel') {
      const payload = JSON.parse((await readBody(req)) || '{}')
      const controller = ctx.get && ctx.get('sessionController')
      if (!controller || typeof controller.cancel !== 'function') {
        reply(res, 500, { ok: false, error: '宿主未提供 sessionController' })
        return
      }
      const result = controller.cancel({ sessionId: payload.sessionId })
      record('cancelled', String(payload.sessionId))
      reply(res, 200, { ok: true, accepted: !!(result && result.accepted) })
      return
    }
    if (req.method === 'POST' && path === '/answer') {
      const payload = JSON.parse((await readBody(req)) || '{}')
      const controller = ctx.get && ctx.get('sessionController')
      const questions = ctx.get && ctx.get('userQuestions')
      if (!controller || !questions) {
        reply(res, 500, { ok: false, error: '宿主缺少会话/提问服务' })
        return
      }
      const resolved = await controller.resolveAgent(payload.sessionId)
      if (!resolved || !resolved.agent) {
        reply(res, 409, { ok: false, error: '会话当前不可作答（未在运行或已结束）' })
        return
      }
      let accepted = false
      try {
        accepted = questions.answer(resolved.agent, payload.callId, payload.answer) === true
      } catch (error) {
        reply(res, 409, { ok: false, error: String(error?.message ?? error) })
        return
      }
      record('answered', String(payload.callId))
      reply(res, 200, { ok: true, accepted })
      return
    }
    if (req.method === 'GET' && path === '/session') {
      const root = resolveRoot(ctx, url.searchParams.get('dir') ?? '')
      const controller = ctx.get && ctx.get('sessionController')
      if (!controller || typeof controller.create !== 'function') {
        reply(res, 500, { ok: false, error: '宿主未提供 sessionController' })
        return
      }
      const metaPath = join(root, DECK_DIR, 'session.json')
      let stored = null
      try {
        stored = JSON.parse(readFileSync(metaPath, 'utf8')).sessionId
      } catch {
        stored = null
      }
      let items = []
      try {
        const listed = await controller.list({}, AbortSignal.timeout(4000))
        items = (listed && listed.items) || []
      } catch {
        items = []
      }
      const relaxApprovals = async (sessionId) => {
        try {
          const approval = ctx.get && ctx.get('approval')
          if (!approval || typeof approval.setPolicy !== 'function') return
          const target = await controller.resolveAgent(sessionId)
          if (target && target.agent) approval.setPolicy(target.agent, 'never')
        } catch (error) {
          record('relax-approvals-failed', String(error?.message ?? error))
        }
      }
      const alive = stored && items.some((item) => item && item.sessionId === stored)
      if (alive) {
        await relaxApprovals(stored)
        reply(res, 200, { ok: true, sessionId: stored, created: false })
        return
      }
      const made = await controller.create({ cwd: root })
      const sessionId = made && made.sessionId
      if (!sessionId) {
        reply(res, 500, { ok: false, error: '创建会话失败' })
        return
      }
      mkdirSync(join(root, DECK_DIR), { recursive: true })
      writeFileSync(metaPath, `${JSON.stringify({ sessionId, createdAt: Date.now() }, null, 2)}\n`, 'utf8')
      await relaxApprovals(sessionId)
      record('session-created', String(sessionId))
      reply(res, 200, { ok: true, sessionId, created: true })
      return
    }
    if (req.method === 'GET' && path === '/sessions') {
      let items = []
      try {
        const controller = ctx.get && ctx.get('sessionController')
        if (controller && typeof controller.list === 'function') {
          const result = await controller.list({}, AbortSignal.timeout(4000))
          items = (result && result.items) || []
        }
      } catch (error) {
        record('sessions-failed', String(error?.message ?? error))
      }
      reply(res, 200, {
        ok: true,
        items: items.map((item) => ({
          sessionId: item.sessionId,
          cwd: item.cwd ?? null,
          running: item.running === true,
          updatedAt: item.updatedAt ?? null,
          blank: item.blank === true,
          title: (item.projections && item.projections.values && item.projections.values.title) || null,
        })),
      })
      return
    }
    if (req.method === 'POST' && path === '/report') {
      const payload = JSON.parse((await readBody(req)) || '{}')
      record(String(payload?.kind ?? 'unknown'), payload?.detail ?? null)
      reply(res, 200, { ok: true })
      return
    }
    if (req.method === 'GET' && path === '/report') {
      reply(res, 200, { ok: true, reports })
      return
    }
    if (req.method === 'GET' && path === '/diag') {
      let client = { available: false }
      try {
        const modules = ctx.clientModules
        const graph = modules.graph()
        const entries = Array.isArray(graph?.entries) ? graph.entries : []
        const needle = url.searchParams.get('needle')
        client = {
          available: true,
          clientPath: modules.clientPath('dsh-ppt-studio') ?? null,
          entryCount: entries.length,
          mine: entries.filter((entry) => JSON.stringify(entry).includes('ppt-studio')),
          needle: needle === null ? undefined : entries.filter((entry) => JSON.stringify(entry).includes(needle)),
          rebuilt: modules.rebuilt?.('dsh-ppt-studio') ?? null,
        }
      } catch (error) {
        client = { available: false, error: String(error?.stack ?? error?.message ?? error) }
      }
      reply(res, 200, { ok: true, client, reports })
      return
    }
    if (req.method === 'POST' && path === '/upload') {
      const payload = JSON.parse((await readBody(req, MAX_UPLOAD_BODY_BYTES)) || '{}')
      const root = resolveRoot(ctx, payload?.workspaceRoot ?? '')
      const rawName = typeof payload?.name === 'string' ? payload.name : ''
      const encoded = typeof payload?.data === 'string' ? payload.data : ''
      if (!encoded) throw Object.assign(new Error('缺少文件内容'), { status: 400 })
      const bytes = Buffer.from(encoded, 'base64')
      if (!bytes.length) throw Object.assign(new Error('文件内容为空'), { status: 400 })
      if (bytes.length > UPLOAD_FILE_LIMIT) throw Object.assign(new Error('文件超过 24 MB'), { status: 413 })
      const kind = /^image\//.test(String(payload?.mime ?? '')) || IMAGE_EXT.has(extname(rawName).toLowerCase()) ? 'image' : 'file'
      deckFolder(root, true)
      // Images land in the deck's asset folder so `image: "assets/…"` works immediately;
      // everything else goes to an inbox the agent can read from.
      const folderRel = kind === 'image' ? join(DECK_DIR, 'assets') : join(DECK_DIR, 'inbox')
      const folder = join(root, folderRel)
      mkdirSync(folder, { recursive: true })
      const name = safeFileName(rawName, kind)
      const target = uniqueTarget(folder, name)
      writeFileSync(target, bytes)
      const rel = join(folderRel, basename(target)).split('\\').join('/')
      record('upload', `${kind} ${rel} ${bytes.length}`)
      reply(res, 200, { ok: true, dir: root, kind, name: basename(target), rel, abs: target, bytes: bytes.length })
      return
    }
    if (req.method === 'POST' && path === '/import') {
      const payload = JSON.parse((await readBody(req)) || '{}')
      const root = resolveRoot(ctx, payload?.workspaceRoot ?? '')
      const requested = String(payload?.file ?? '').trim()
      if (!requested) throw Object.assign(new Error('缺少 file'), { status: 400 })
      const target = isAbsolute(requested) ? resolve(requested) : resolve(root, requested)
      const boundary = resolve(root)
      if (!target.startsWith(boundary)) throw Object.assign(new Error('文件必须位于工作区内'), { status: 400 })
      if (!existsSync(target)) throw Object.assign(new Error(`文件不存在：${requested}`), { status: 404 })
      const result = await importPptx(ctx, root, target)
      reply(res, 200, { ok: true, file: target, ...result })
      return
    }
    if (req.method === 'PUT' && path === '/deck') {
      const payload = JSON.parse(await readBody(req))
      const root = resolveRoot(ctx, payload?.workspaceRoot ?? '')
      if (!payload || typeof payload.deck !== 'object' || payload.deck === null) {
        throw Object.assign(new Error('缺少 deck 对象'), { status: 400 })
      }
      const folder = deckFolder(root, true)
      const json = `${JSON.stringify(payload.deck, null, 2)}\n`
      const target = join(folder, DECK_FILE)
      const temp = join(folder, `.${DECK_FILE}.${process.pid}.tmp`)
      writeFileSync(temp, json, 'utf8')
      try {
        renameSync(temp, target)
      } catch (error) {
        rmSync(temp, { force: true })
        throw error
      }
      reply(res, 200, { ok: true, path: target, bytes: Buffer.byteLength(json) })
      return
    }
    reply(res, 404, { ok: false, error: `未知路径 ${path}` })
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500
    ctx.logger?.warn?.(`ppt-studio route failed: ${error?.message ?? error}`)
    reply(res, status, { ok: false, error: String(error?.message ?? error) })
  }
}
