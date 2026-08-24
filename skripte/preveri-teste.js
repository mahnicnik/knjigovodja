#!/usr/bin/env node
/**
 * PREVERI, ALI SE JE ŠTEVILO TESTOV ZMANJŠALO
 * Računko, 24. 8. 2026
 *
 * ZAKAJ OBSTAJA
 * ─────────────
 * Pri dodajanju testov 24. 8. 2026 sem podvojil ime funkcije. Playwright ni
 * javil napake — rekel je samo:
 *
 *     Error: No tests found.
 *
 * Če tega ne bi opazil, bi bilo videti, kot da vse dela, v resnici pa se
 * 115 testov iz tiste datoteke SPLOH NE BI izvedlo. To je ista vrsta tihe
 * odpovedi, ki jo lovimo po aplikaciji: nič ne pade, samo neha delati.
 *
 * KAKO DELUJE
 * ───────────
 * Prešteje teste (`--list`) in primerja z zadnjim znanim številom v
 * `skripte/stanje-testov.json`. Če jih je MANJ, opozori.
 *
 * Manj testov ni nujno napaka — teste včasih upravičeno odstranimo. Zato
 * skripta ne pade, ampak zahteva potrditev:
 *
 *     node skripte/preveri-teste.js            preveri
 *     node skripte/preveri-teste.js --posodobi zapiši novo stanje
 *
 * Skripta ne spreminja ne aplikacije ne testov.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const KOREN = path.join(__dirname, '..')
const WEB = path.join(KOREN, 'apps', 'web')
const STANJE = path.join(__dirname, 'stanje-testov.json')

const posodobi = process.argv.includes('--posodobi')

// ─── Preštej teste ─────────────────────────────────────────────────────
let izpis = ''
try {
  izpis = execSync('npx playwright test --list --reporter=list', {
    cwd: WEB, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180000,
  })
} catch (e) {
  izpis = ((e.stdout || '') + (e.stderr || '')).toString()
}

// Playwright izpiše "Total: N tests in M files"
const skupaj = izpis.match(/Total:\s*(\d+)\s*test/i)
const stTestov = skupaj ? Number(skupaj[1]) : null

// Po datotekah — da povemo, KJE so izginili
const poDatotekah = {}
for (const v of izpis.split('\n')) {
  const m = v.match(/([\w.\-\/]+\.spec\.ts):\d+/)
  if (m) poDatotekah[m[1]] = (poDatotekah[m[1]] || 0) + 1
}

console.log('\n═══ PREVERBA ŠTEVILA TESTOV ═══\n')

if (stTestov === null) {
  console.log('Števila testov ni bilo mogoče prebrati.')
  if (/No tests found/i.test(izpis)) {
    console.log('\n  ✗ Playwright javlja "No tests found".')
    console.log('    To se zgodi ob napaki v testni datoteki (npr. podvojeno')
    console.log('    ime funkcije) — testi se TIHO ne izvedejo.')
  }
  console.log('')
  process.exit(0)
}

// ─── Primerjaj z zadnjim znanim ────────────────────────────────────────
let prejsnje = null
try { prejsnje = JSON.parse(fs.readFileSync(STANJE, 'utf8')) } catch {}

console.log(`Najdenih testov: ${stTestov}`)
for (const [dat, n] of Object.entries(poDatotekah).sort()) {
  console.log(`  ${String(n).padStart(4)}  ${dat}`)
}

if (!prejsnje) {
  console.log('\nZadnje znano stanje še ni zapisano.')
} else {
  const razlika = stTestov - prejsnje.skupaj
  console.log(`\nZadnje znano: ${prejsnje.skupaj} (${prejsnje.datum})`)

  if (razlika < 0) {
    console.log(`\n  ✗ TESTOV JE MANJ za ${Math.abs(razlika)}.\n`)
    for (const [dat, prejN] of Object.entries(prejsnje.poDatotekah || {})) {
      const zdaj = poDatotekah[dat] || 0
      if (zdaj < prejN) {
        console.log(`    ${dat}: ${prejN} → ${zdaj}` + (zdaj === 0 ? '   ← datoteka se NE izvaja' : ''))
      }
    }
    console.log('\n  Če je to namerno, potrdite z: node skripte/preveri-teste.js --posodobi')
  } else if (razlika > 0) {
    console.log(`  ✓ Testov je več za ${razlika}.`)
  } else {
    console.log('  ✓ Enako število.')
  }
}

if (posodobi) {
  fs.writeFileSync(STANJE, JSON.stringify({
    skupaj: stTestov,
    poDatotekah,
    datum: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n')
  console.log(`\n✓ Zapisano novo stanje: ${stTestov} testov.`)
}

console.log('')
process.exit(0)
