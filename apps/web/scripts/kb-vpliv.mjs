#!/usr/bin/env node
/**
 * KATERE DOKUMENTE BAZE ZNANJA ZADEVA SPREMEMBA KODE?
 * ═══════════════════════════════════════════════════
 *
 * Za obseg commitov (npr. "abc123..HEAD") izpise:
 *   - spremenjene uporabniske datoteke (apps/web/app – brez app/api –, apps/web/components),
 *   - dokumente docs/knowledge-base, ki jih navajajo v glavi (polje "koda"),
 *   - datoteke, ki jih ne navaja noben dokument (morda nov modul),
 *   - ali je bila v obsegu spremenjena tudi baza znanja.
 *
 * Uporablja jo /update-kb (.claude/skills/update-kb) in GitHub Action
 * .github/workflows/baza-znanja.yml.
 *
 *   node apps/web/scripts/kb-vpliv.mjs <od>..<do> [--json]
 *   node apps/web/scripts/kb-vpliv.mjs --od-sinhronizacije [--json]   (od commita v docs/knowledge-base/.zadnja-sinhronizacija)
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const KOREN = join(tu, '..', '..', '..')
const MAPA = join(KOREN, 'docs', 'knowledge-base')
const OZNAKA = join(MAPA, '.zadnja-sinhronizacija')

const UPORABNISKO = /^apps\/web\/(app\/(?!api\/)|components\/)/
const IZVZETO = /(\.generated\.ts$|\/tests?\/|\.spec\.ts$|^apps\/web\/app\/zz-)/

function gitDiff(obseg) {
  const izhod = execFileSync('git', ['diff', '--name-only', obseg], { cwd: KOREN, encoding: 'utf8' })
  return izhod.split('\n').map(s => s.trim()).filter(Boolean)
}

/** Poti do kode iz glave vsakega dokumenta (polje "koda"). */
export function potiDokumentov() {
  const out = {}
  for (const f of readdirSync(MAPA).filter(x => x.endsWith('.md') && x !== '_index.md')) {
    const glava = readFileSync(join(MAPA, f), 'utf8').split('---')[1] || ''
    const koda = (glava.split(/^koda:/m)[1] || '').split(/^[a-z_]+:/m)[0]
    out[f] = [...koda.matchAll(/(apps\/web\/[\w\-./\[\]]+)/g)].map(m => m[1].replace(/[.,]$/, ''))
  }
  return out
}

export function analiziraj(spremenjene) {
  const poti = potiDokumentov()
  const uporabniske = spremenjene.filter(f => UPORABNISKO.test(f) && !IZVZETO.test(f))
  const dokumentiSpremenjeni = spremenjene.filter(f => f.startsWith('docs/knowledge-base/'))
  const prizadeti = {}
  const nepokrite = []
  for (const f of uporabniske) {
    const docs = Object.entries(poti).filter(([, ps]) => ps.some(p => f === p || f.startsWith(p.endsWith('/') ? p : p + '/'))).map(([d]) => d)
    if (docs.length === 0) nepokrite.push(f)
    for (const d of docs) (prizadeti[d] ||= []).push(f)
  }
  return { uporabniske, dokumentiSpremenjeni, prizadeti, nepokrite }
}

const jeGlavni = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (jeGlavni) {
  let obseg = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (process.argv.includes('--od-sinhronizacije')) {
    if (!existsSync(OZNAKA)) { console.error('Ni oznake docs/knowledge-base/.zadnja-sinhronizacija'); process.exit(1) }
    obseg = readFileSync(OZNAKA, 'utf8').trim().split(/\s+/)[0] + '..HEAD'
  }
  if (!obseg) { console.error('Uporaba: kb-vpliv.mjs <od>..<do> | --od-sinhronizacije [--json]'); process.exit(1) }
  const r = analiziraj(gitDiff(obseg))
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ obseg, ...r }, null, 2)); process.exit(0) }
  console.log(`Obseg: ${obseg}`)
  console.log(`Spremenjene uporabniške datoteke: ${r.uporabniske.length}`)
  console.log(`Spremenjeni dokumenti baze znanja: ${r.dokumentiSpremenjeni.length ? r.dokumentiSpremenjeni.join(', ') : '(nobeden)'}`)
  for (const [d, fs] of Object.entries(r.prizadeti)) console.log(`\n${d} – preveri zaradi:\n  ${fs.join('\n  ')}`)
  if (r.nepokrite.length) console.log(`\nDatoteke, ki jih ne navaja noben dokument (nov modul?):\n  ${r.nepokrite.join('\n  ')}`)
}
