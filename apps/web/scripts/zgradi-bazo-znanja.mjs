#!/usr/bin/env node
/**
 * ZGRADI BAZO ZNANJA RAČUNKO ASISTENTA
 * ════════════════════════════════════
 *
 * Prebere vse docs/knowledge-base/*.md in jih zapiše v
 * apps/web/lib/kb/baza.generated.ts, ki ga bere /api/support-chat.
 *
 * ZAKAJ BREZ EMBEDDINGOV (odlocitev oktober 2026): baza ima ~25-30 tisoc
 * tokenov, zato gre CELA v sistemski poziv (s prompt cachingom). Iskanje po
 * odsekih (pgvector) bi lahko spregledalo pravi odsek, pri tej velikosti pa ne
 * prinese nicesar. Ko baza preraste ~150k tokenov, se doda kb_chunks + iskanje.
 *
 * ZAKAJ OB BUILDU: skripta tece kot "prebuild" (npm run build), zato ima vsak
 * deploy bazo, ki ustreza kodi v istem commitu - ni rocnega koraka, ki bi ga
 * lahko kdo pozabil, in ni posnetka, ki bi zastarel.
 *
 * Zagon rocno:   node scripts/zgradi-bazo-znanja.mjs          (zapise datoteko)
 *                node scripts/zgradi-bazo-znanja.mjs --preveri (le preveri, ali je ažurna)
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const MAPA = join(tu, '..', '..', '..', 'docs', 'knowledge-base')
const IZHOD = join(tu, '..', 'lib', 'kb', 'baza.generated.ts')
// Pogosta vprasanja posebej: uvozi jih brskalnik (bliznjice v klepetu), cela
// baza (~85 kB) pa ostane samo na strezniku.
const IZHOD_FAQ = join(tu, '..', 'lib', 'kb', 'faq.generated.ts')

/** Preprost razclenjevalnik glave (frontmatter): kljuc: vrednost, [a, b] in seznami "  - x". */
export function razcleniGlavo(besedilo) {
  const m = besedilo.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { glava: {}, telo: besedilo }
  const glava = {}
  let zadnji = null
  for (const vrstica of m[1].split('\n')) {
    const el = vrstica.match(/^\s+-\s+(.*)$/)
    if (el && zadnji) { (glava[zadnji] ||= []).push(el[1].trim()); continue }
    const kv = vrstica.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (!kv) continue
    zadnji = kv[1]
    const v = kv[2].trim()
    if (v.startsWith('[') && v.endsWith(']')) glava[zadnji] = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    else if (v === '') glava[zadnji] = []
    else glava[zadnji] = v
  }
  return { glava, telo: besedilo.slice(m[0].length).trim() }
}

/** Pogosta vprasanja iz _index.md: "- vprasanje | dokument.md | pos|portal". */
export function izlusciFaq(indeks) {
  const del = indeks.split(/^## Pogosta vprašanja\s*$/m)[1] || ''
  return del.split('\n')
    .map(v => v.match(/^-\s+(.+?)\s*\|\s*([\w-]+)\.md\s*\|\s*(pos|portal|vse)\s*$/))
    .filter(Boolean)
    .map(([, vprasanje, modul, kontekst]) => ({ vprasanje, modul, kontekst }))
}

export function zgradi() {
  if (!existsSync(MAPA)) throw new Error('Mape baze znanja ni: ' + MAPA)
  const datoteke = readdirSync(MAPA).filter(f => f.endsWith('.md')).sort()
  const dokumenti = []
  let indeks = ''
  for (const f of datoteke) {
    const surovo = readFileSync(join(MAPA, f), 'utf8').replace(/\r\n/g, '\n')
    if (f === '_index.md') { indeks = surovo; continue }
    const { glava, telo } = razcleniGlavo(surovo)
    if (!glava.modul) throw new Error(`${f}: v glavi manjka "modul"`)
    if (glava.modul + '.md' !== f) throw new Error(`${f}: "modul" (${glava.modul}) se ne ujema z imenom datoteke`)
    dokumenti.push({
      modul: glava.modul,
      naslov: glava.naslov || glava.modul,
      poti: Array.isArray(glava.poti) ? glava.poti : [],
      vloge: Array.isArray(glava.vloge) ? glava.vloge : [],
      posodobljeno: glava.posodobljeno || '',
      // Glava (vkljucno s potmi do kode) ostane v .md za razvijalce;
      // modelu posljemo le vsebino za uporabnika.
      vsebina: telo,
    })
  }
  if (!indeks) throw new Error('Manjka _index.md')
  const faq = izlusciFaq(indeks)
  const moduli = new Set(dokumenti.map(d => d.modul))
  for (const q of faq) if (!moduli.has(q.modul)) throw new Error(`_index.md: pogosto vprasanje kaze na neobstojec modul ${q.modul}`)
  const kazalo = razcleniGlavo(indeks).telo
  const verzija = createHash('sha256').update(JSON.stringify({ kazalo, dokumenti, faq })).digest('hex').slice(0, 12)
  return { verzija, kazalo, dokumenti, faq }
}

export function vsebinaDatoteke(baza) {
  return `// SAMODEJNO GENERIRANO - NE UREJAJ ROCNO.
// Vir: docs/knowledge-base/*.md · skripta: apps/web/scripts/zgradi-bazo-znanja.mjs
// Spremeni .md dokument in pozeni "node scripts/zgradi-bazo-znanja.mjs" (ali npm run build).

export interface KbDokument { modul: string; naslov: string; poti: string[]; vloge: string[]; posodobljeno: string; vsebina: string }
export interface KbFaq { vprasanje: string; modul: string; kontekst: 'pos' | 'portal' | 'vse' }

export const BAZA_ZNANJA: { verzija: string; kazalo: string; dokumenti: KbDokument[]; faq: KbFaq[] } = ${JSON.stringify(baza, null, 2)}
`
}

export function vsebinaFaq(baza) {
  return `// SAMODEJNO GENERIRANO iz docs/knowledge-base/_index.md - NE UREJAJ ROCNO.
// Skripta: apps/web/scripts/zgradi-bazo-znanja.mjs

export const KB_FAQ: { vprasanje: string; modul: string; kontekst: 'pos' | 'portal' | 'vse' }[] = ${JSON.stringify(baza.faq, null, 2)}
`
}

const jeGlavni = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (jeGlavni) {
  // Kot "prebuild" skripta NE sme podreti deploya: ce mape z dokumenti ob buildu
  // ni (npr. drugacna korenska mapa na Vercelu), ostane commitana datoteka.
  if (!existsSync(MAPA) && !process.argv.includes('--preveri')) {
    console.warn('OPOZORILO: docs/knowledge-base ni dosegljiv - uporabljena je commitana lib/kb/baza.generated.ts.')
    process.exit(0)
  }
  let baza
  try {
    baza = zgradi()
  } catch (e) {
    if (process.argv.includes('--preveri')) throw e
    // Napaka v dokumentu ne ustavi deploya - ujame jo test (tests/asistent.spec.ts).
    console.warn('OPOZORILO: baze znanja ni bilo mogoče zgraditi (' + e.message + ') - uporabljena je commitana datoteka.')
    process.exit(0)
  }
  const nova = vsebinaDatoteke(baza)
  const novaFaq = vsebinaFaq(baza)
  if (process.argv.includes('--preveri')) {
    const stara = existsSync(IZHOD) ? readFileSync(IZHOD, 'utf8') : ''
    const staraFaq = existsSync(IZHOD_FAQ) ? readFileSync(IZHOD_FAQ, 'utf8') : ''
    if (stara !== nova || staraFaq !== novaFaq) {
      console.error('Baza znanja ni ažurna. Poženi: node apps/web/scripts/zgradi-bazo-znanja.mjs')
      process.exit(1)
    }
    console.log(`Baza znanja je ažurna (verzija ${baza.verzija}).`)
  } else {
    mkdirSync(dirname(IZHOD), { recursive: true })
    writeFileSync(IZHOD, nova)
    writeFileSync(IZHOD_FAQ, novaFaq)
    console.log(`Baza znanja: ${baza.dokumenti.length} dokumentov, ${baza.faq.length} pogostih vprašanj, verzija ${baza.verzija}.`)
  }
}
