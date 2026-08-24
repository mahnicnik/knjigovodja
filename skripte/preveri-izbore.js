#!/usr/bin/env node
/**
 * PREVERI, ALI KODA BERE POLJA, KI JIH POIZVEDBA NI IZBRALA
 * Računko, 24. 8. 2026
 *
 * ZAKAJ OBSTAJA
 * ─────────────
 * Ta vrsta napake se je 24. 8. 2026 ponovila ŠESTKRAT v enem dnevu:
 *
 *   min_stock      koda je brala stolpec, ki ga tabela items nima
 *   created_at     orders nima tega stolpca — v zgodovini je pisalo "Invalid Date"
 *   package_id     brali smo customer_package_id, stolpec pa je package_id
 *   template_id    vgnezdeni izbor ga ni vseboval → predračun za 0,00 €
 *   cashier_id     izbor payments(...) ga ni vseboval → "Blagajnik: —"
 *   display_name   org_members tega stolpca SPLOH nima
 *
 * Nobena ni javila napake. Supabase vrne `undefined`, JavaScript to mirno
 * prenese, aplikacija pa tiho dela narobe — dokler nekdo ne opazi napačne
 * številke na dokumentu.
 *
 * KAJ PREVERJA
 * ────────────
 *   1. VGNEZDENI IZBORI — `.select('*, kartice(a, b)')` in nato `x.kartice.c`
 *      → `c` ni bil izbran
 *   2. OBSTOJ STOLPCA — polje, ki ga tabela po shemi sploh nima
 *
 * Preverba je HEVRISTIČNA: JavaScript je preveč dinamičen za popolno
 * analizo. Cilj ni ujeti vsega, ampak ujeti tisto, kar se je res dogajalo.
 *
 * UPORABA
 *   node skripte/preveri-izbore.js
 *
 * Skripta ničesar ne spreminja — samo bere in poroča.
 */

const fs = require('fs')
const path = require('path')

const KOREN = path.join(__dirname, '..')
const SHEMA_POT = path.join(__dirname, 'shema-baze.json')

// ─── Shema baze ────────────────────────────────────────────────────────
let shema = {}
try {
  const surovo = JSON.parse(fs.readFileSync(SHEMA_POT, 'utf8'))
  for (const [tabela, stolpci] of Object.entries(surovo)) {
    shema[tabela] = String(stolpci).split(',').map(s => s.trim()).filter(Boolean)
  }
} catch (e) {
  console.error('Sheme baze ni bilo mogoče prebrati:', e.message)
  console.error('Preverba obstoja stolpcev je preskočena.\n')
}

// ─── Poišči datoteke ───────────────────────────────────────────────────
function najdiDatoteke(mapa, zbirka = []) {
  for (const vnos of fs.readdirSync(mapa, { withFileTypes: true })) {
    if (vnos.name === 'node_modules' || vnos.name === '.next' || vnos.name.startsWith('.')) continue
    const pot = path.join(mapa, vnos.name)
    if (vnos.isDirectory()) najdiDatoteke(pot, zbirka)
    else if (/\.(ts|tsx)$/.test(vnos.name) && !/\.spec\.ts$/.test(vnos.name)) zbirka.push(pot)
  }
  return zbirka
}

/**
 * Iz niza izbora izlušči vgnezdene relacije.
 * "*, customers(name, email), kartice(id, ime)" →
 *   { customers: ['name','email'], kartice: ['id','ime'] }
 */
function vgnezdeneRelacije(izbor) {
  const rel = {}
  const rx = /(\w+)\s*\(([^()]*)\)/g
  let m
  while ((m = rx.exec(izbor)) !== null) {
    const ime = m[1]
    const polja = m[2].split(',').map(s => s.trim().split(':').pop().trim()).filter(Boolean)
    rel[ime] = polja
  }
  return rel
}

/** Ednina relacije: "customers" → "customer", "customer_packages" → "customer_package" */
function ednina(ime) {
  return ime.endsWith('s') ? ime.slice(0, -1) : ime
}

const napake = []
const opozorila = []

for (const dat of najdiDatoteke(path.join(KOREN, 'apps', 'web'))) {
  const vsebina = fs.readFileSync(dat, 'utf8')
  const rel = dat.replace(KOREN + '/', '')

  // ─── 1. Vgnezdeni izbori ─────────────────────────────────────────────
  const izbori = [...vsebina.matchAll(/\.select\(\s*['"`]([^'"`]+)['"`]/g)]
  const vseRelacije = {}
  for (const iz of izbori) {
    const r = vgnezdeneRelacije(iz[1])
    for (const [ime, polja] of Object.entries(r)) {
      // Ce je ista relacija izbrana veckrat z razlicnimi polji, zdruzimo -
      // sicer bi javljali lazne napake pri datotekah z vec poizvedbami.
      vseRelacije[ime] = [...new Set([...(vseRelacije[ime] || []), ...polja])]
    }
  }

  for (const [relIme, polja] of Object.entries(vseRelacije)) {
    if (polja.includes('*')) continue
    // Iscemo uporabe: x.relIme?.polje  ali  x.relIme.polje
    // in tudi ednino (payment?.cashier_id pri izboru payments(...)).
    for (const oblika of [relIme, ednina(relIme)]) {
      const rx = new RegExp('\\b\\w+[?.]*\\.' + oblika + '\\??\\.(\\w+)', 'g')
      let u
      while ((u = rx.exec(vsebina)) !== null) {
        const polje = u[1]
        if (polja.includes(polje)) continue

        // KLIC FUNKCIJE ni branje polja. Brez tega skripta javi vsak
        // `pos.customers.list(...)` — to so imenski prostori kode, ne
        // rezultati poizvedb.
        const zaNjim = vsebina.slice(u.index + u[0].length).trimStart()[0]
        if (zaNjim === '(') continue

        // Javimo SAMO, ce je polje res stolpec te tabele. Tako izlocimo
        // spremenljivke, ki se le imenujejo enako kot relacija, obdrzimo pa
        // pravi vzorec: stolpec OBSTAJA, a ga izbor ni zajel (template_id,
        // cashier_id).
        const stolpciTabele = shema[relIme]
        if (!stolpciTabele || !stolpciTabele.includes(polje)) continue

        const vrstica = vsebina.slice(0, u.index).split('\n').length
        napake.push(
          `${rel}:${vrstica}  bere ".${oblika}.${polje}" — stolpec obstaja, izbor pa ga NE vsebuje (${polja.join(', ')})`
        )
      }
    }
  }

  // ─── 2. Obstoj stolpca po shemi ──────────────────────────────────────
  // Iscemo .from('tabela') ... .eq('stolpec', ...) / .order('stolpec')
  const rxFrom = /\.from\(\s*['"`](\w+)['"`]\s*\)([\s\S]{0,600})/g
  let f
  while ((f = rxFrom.exec(vsebina)) !== null) {
    const tabela = f[1]
    const stolpci = shema[tabela]
    if (!stolpci) continue
    // Okno KONCAMO pri naslednji poizvedbi - sicer se preliva v sosednjo in
    // javi stolpce, ki pripadajo drugi tabeli.
    let blok = f[2]
    const naslednja = blok.indexOf('.from(')
    if (naslednja > 0) blok = blok.slice(0, naslednja)
    const rxStolpec = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|order|is|in)\(\s*['"`](\w+)['"`]/g
    let c
    while ((c = rxStolpec.exec(blok)) !== null) {
      const stolpec = c[1]
      if (stolpci.includes(stolpec)) continue
      const vrstica = vsebina.slice(0, f.index + c.index).split('\n').length
      opozorila.push(
        `${rel}:${vrstica}  tabela "${tabela}" nima stolpca "${stolpec}"`
      )
    }
  }
}

// ─── Izpis ─────────────────────────────────────────────────────────────
console.log('\n═══ PREVERBA IZBOROV IN STOLPCEV ═══\n')

if (napake.length === 0) {
  console.log('✓ Vsa brana polja so v izborih.')
} else {
  console.log(`NAPAKE (${napake.length}) — koda bere polje, ki ga izbor ne vsebuje:\n`)
  for (const n of [...new Set(napake)]) console.log('  ✗ ' + n)
  console.log('\n  Supabase vrne undefined, JavaScript to prenese, aplikacija pa')
  console.log('  tiho dela narobe. Dodajte polje v .select() ali popravite branje.')
}

if (opozorila.length > 0) {
  console.log(`\nOPOZORILA (${[...new Set(opozorila)].length}) — stolpca po shemi ni:\n`)
  for (const o of [...new Set(opozorila)]) console.log('  ! ' + o)
  console.log('\n  Shema je lahko zastarela (skripte/shema-baze.json). Preverite,')
  console.log('  preden karkoli spremenite.')
}

console.log('')
// Skripta NE pade z napako - je pomoc pri pregledu, ne zapora objave.
process.exit(0)
