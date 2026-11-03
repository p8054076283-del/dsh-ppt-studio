// Minimal ASAR reader: lists or extracts one file from an Electron asar archive.
//   node scripts/asar.mjs <archive> list [substring]
//   node scripts/asar.mjs <archive> get <internal/path> <outFile>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [archive, command, ...rest] = process.argv.slice(2)
const buffer = readFileSync(archive)

// Layout: [uint32=4][uint32 headerPickleSize][uint32 jsonSize][uint32 jsonSize][JSON][files...]
// Resolve the JSON window by probing the plausible offsets instead of trusting one formula.
function readHeader() {
  const candidates = []
  for (const jsonStart of [8, 12, 16]) {
    for (const lengthOffset of [jsonStart - 4, jsonStart - 8]) {
      if (lengthOffset < 0) continue
      const length = buffer.readUInt32LE(lengthOffset)
      if (length <= 0 || length > buffer.length) continue
      candidates.push({ jsonStart, length })
    }
  }
  for (const { jsonStart, length } of candidates) {
    const text = buffer.toString('utf8', jsonStart, jsonStart + length)
    if (!text.startsWith('{')) continue
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && parsed.files) {
        const dataStart = jsonStart + length
        return { header: parsed, dataStart, jsonStart }
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('could not locate the asar header JSON')
}

const { header, dataStart } = readHeader()

function* walk(node, prefix = '') {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name
    if (value.files) yield* walk(value, path)
    else yield { path, size: value.size, offset: value.offset, unpacked: value.unpacked }
  }
}

const entries = [...walk(header)]
const entry = (path) => entries.find((candidate) => candidate.path === path)

if (command === 'list') {
  const needle = rest[0]?.toLowerCase()
  const hits = entries.filter((item) => !needle || item.path.toLowerCase().includes(needle))
  for (const item of hits.slice(0, 200)) console.log(`${String(item.size).padStart(9)}  ${item.path}`)
  console.log(`-- ${hits.length} of ${entries.length} entries`)
} else if (command === 'get') {
  const [internal, out] = rest
  const found = entry(internal)
  if (!found) {
    console.error(`not found: ${internal}`)
    process.exit(1)
  }
  const start = dataStart + Number(found.offset)
  writeFileSync(out, buffer.subarray(start, start + Number(found.size)))
  mkdirSync(dirname(out), { recursive: true })
  console.log(`extracted ${found.size} bytes -> ${out}`)
} else {
  console.error('usage: asar.mjs <archive> list [needle] | get <path> <out>')
  process.exit(2)
}
