#!/usr/bin/env node
// Vérification de l'extraction PDF dans le VRAI Electron (jamais ELECTRON_RUN_AS_NODE, qui ne fait que du Node).
// Lance une mini-app Electron temporaire qui démarre `out/main/pdfWorker.js` (et celui de l'asar empaqueté
// s'il existe) sur un PDF généré. L'app écrit ses résultats dans un fichier (synchrone) puis quitte d'elle-même :
// la sortie standard d'Electron serait perdue en cas de plantage.
// Usage : npm run build && (npx electron-builder --linux dir) && npm run smoke:pdf
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const electron = join(root, 'node_modules', '.bin', 'electron')
const EXPECT = 'Binary name: smoke_bin'

/** PDF d'une page, police Helvetica, xref exacte. */
function makePdf(lines) {
  const stream = lines.map((l, k) => `BT /F1 12 Tf 20 ${780 - k * 20} Td (${l}) Tj ET`).join('\n')
  const objs = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const MAIN = `
const fs = require('node:fs')
const { Worker } = require('node:worker_threads')
const { app } = require('electron')
const out = process.env.SMOKE_OUT
const log = (s) => fs.appendFileSync(out, s + '\\n')
const quit = (code) => { try { app.exit(code) } finally { process.exit(code) } }
log('electron ' + process.versions.electron + ' node ' + process.versions.node + ' runAsNode=' + (process.env.ELECTRON_RUN_AS_NODE ? 'yes' : 'no') + ' type=' + process.type)
const targets = JSON.parse(process.env.SMOKE_TARGETS)
const pdf = fs.readFileSync(process.env.SMOKE_PDF)
function run(path) {
  return new Promise((done) => {
    let w
    const t = setTimeout(() => { void w.terminate(); done('FAIL délai dépassé') }, 30000)
    const end = (r) => { clearTimeout(t); void w.terminate(); done(r) }
    try { w = new Worker(path, { resourceLimits: { maxOldGenerationSizeMb: 512 } }) } catch (e) { clearTimeout(t); return done('FAIL ' + e.message) }
    w.once('message', (m) => end(m && typeof m.text === 'string' && m.text.includes(${JSON.stringify(EXPECT)}) ? 'OK' : 'FAIL ' + JSON.stringify(m && m.error)))
    w.once('error', (e) => end('FAIL erreur ' + e.message))
    w.once('exit', (c) => end('FAIL sortie ' + c))
    const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength)
    w.postMessage(ab, [ab])
  })
}
// Comme dans l'app : l'import a lieu après app.whenReady().
app.whenReady().then(async () => {
  let fail = false
  for (const [label, path] of targets) {
    log('START ' + label)
    const r = await run(path)
    if (r !== 'OK') fail = true
    log('RESULT ' + label + ' ' + r)
  }
  log('END')
  quit(fail ? 1 : 0)
}).catch((e) => { log('FAIL ' + e.message); quit(1) })
`

const targets = [['dev out/main/pdfWorker.js', join(root, 'out', 'main', 'pdfWorker.js')]]
const asar = join(root, 'dist', 'linux-unpacked', 'resources', 'app.asar')
if (existsSync(asar)) targets.push(['asar dist/linux-unpacked/resources/app.asar/out/main/pdfWorker.js', join(asar, 'out', 'main', 'pdfWorker.js')])
if (!existsSync(targets[0][1])) {
  console.error('FAIL : out/main/pdfWorker.js absent — lancer `npm run build` d’abord')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'epihub-smoke-pdf-'))
const outFile = join(tmp, 'results.txt')
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'epihub-smoke-pdf', version: '0.0.0', main: 'main.js' }))
writeFileSync(join(tmp, 'main.js'), MAIN)
writeFileSync(join(tmp, 'subject.pdf'), makePdf([EXPECT, 'Language: C']))
writeFileSync(outFile, '')

const env = { ...process.env, SMOKE_OUT: outFile, SMOKE_PDF: join(tmp, 'subject.pdf'), SMOKE_TARGETS: JSON.stringify(targets) }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [tmp, `--user-data-dir=${join(tmp, 'user-data')}`], { env, stdio: 'ignore' })
const killer = setTimeout(() => child.kill('SIGKILL'), 90_000)
child.on('exit', (code, signal) => {
  clearTimeout(killer)
  const lines = readFileSync(outFile, 'utf8').split('\n').filter(Boolean)
  for (const l of lines) console.log(l)
  console.log(`electron exit code=${code} signal=${signal}`)
  const results = lines.filter((l) => l.startsWith('RESULT '))
  const ok = code === 0 && signal === null && lines.includes('END') && results.length === targets.length && results.every((l) => l.endsWith(' OK'))
  if (!targets.some((t) => t[0].startsWith('asar'))) console.log('(asar absent : lancer `npx electron-builder --linux dir` pour le vérifier aussi)')
  console.log(ok ? 'SMOKE PDF OK' : 'SMOKE PDF FAIL')
  rmSync(tmp, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
})
