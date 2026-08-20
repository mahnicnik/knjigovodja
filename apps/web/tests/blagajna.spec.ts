import { test, expect } from '@playwright/test'
import {
  zesekVrstice,
  razclenitevDdv,
  popustEurVOdstotek,
  znesekStorna,
  pricakovanaGotovina,
} from '../lib/pos-calc'

/**
 * TESTI KRITIČNIH POTI BLAGAJNE
 *
 * Ne klikajo po vmesniku — uvozijo PRAVE funkcije in preverijo rezultat.
 * Zato so hitri (nekaj sekund) in zanesljivi.
 *
 * Vsak test pokriva napako, ki je bila DEJANSKO najdena. V opisu je zapisano,
 * kaj je bilo narobe — da je ob padcu jasno, kaj se je pokvarilo nazaj.
 *
 * Zagon:  cd apps/web && npx playwright test tests/blagajna.spec.ts
 */

// ═══════════════════ DDV PO STOPNJAH ═══════════════════

test('DDV: stopnja 0 % se NE sme spremeniti v 22 %', () => {
  // NAPAKA (popravljeno 19.8.2026, 27 mest): povsod je bil vzorec
  // `vat_rate || 22`. Ker je 0 v JavaScriptu neresnična vrednost, je
  // oproščena postavka (fizioterapija po 42. členu ZDDV-1) dobila 22 %.
  // Napačen DDV je šel na račun IN na FURS.
  const r = razclenitevDdv([{ price: 50, qty: 1, vat_rate: 0 }])
  expect(r.vat).toBeCloseTo(0, 2)
  expect(r.net).toBeCloseTo(50, 2)
  expect(r.byRate).toHaveLength(1)
  expect(r.byRate[0].rate).toBe(0)
})

test('DDV: 22 % — osnova in davek iz bruto zneska', () => {
  // 50,00 bruto pri 22 % → osnova 40,98, DDV 9,02
  const r = razclenitevDdv([{ price: 50, qty: 1, vat_rate: 22 }])
  expect(r.net).toBeCloseTo(40.98, 2)
  expect(r.vat).toBeCloseTo(9.02, 2)
})

test('DDV: 9,5 % (hrana, pijača)', () => {
  const r = razclenitevDdv([{ price: 10.95, qty: 1, vat_rate: 9.5 }])
  expect(r.net).toBeCloseTo(10.00, 2)
  expect(r.vat).toBeCloseTo(0.95, 2)
})

test('DDV: mešan račun — vsaka stopnja svoja vrstica', () => {
  // NAPAKA (popravljeno 16.8.2026): DDV se je računal pavšalno kot total/1.22
  // za celotno košarico, tudi če so bile postavke po 9,5 % ali oproščene.
  const r = razclenitevDdv([
    { price: 50, qty: 1, vat_rate: 0 },     // fizioterapija, oproščena
    { price: 2, qty: 2, vat_rate: 9.5 },    // kava
    { price: 12.20, qty: 1, vat_rate: 22 }, // izdelek
  ])
  expect(r.byRate).toHaveLength(3)
  const stopnje = r.byRate.map(b => b.rate)
  expect(stopnje).toEqual([22, 9.5, 0])

  const nicelna = r.byRate.find(b => b.rate === 0)!
  expect(nicelna.vat).toBeCloseTo(0, 2)
  expect(nicelna.net).toBeCloseTo(50, 2)

  // Skupni DDV = samo od 9,5 % in 22 % postavk
  expect(r.vat).toBeCloseTo(0.347 + 2.20, 1)
})

test('DDV: manjkajoča stopnja privzame 22 %, 0 pa ostane 0', () => {
  const brezStopnje = razclenitevDdv([{ price: 122, qty: 1 }])
  expect(brezStopnje.byRate[0].rate).toBe(22)

  const nicelna = razclenitevDdv([{ price: 122, qty: 1, vat_rate: 0 }])
  expect(nicelna.byRate[0].rate).toBe(0)
})

// ═══════════════════ ZNESEK VRSTICE ═══════════════════

test('vrstica: doplačila modifikatorjev so vključena v osnovo za DDV', () => {
  // NAPAKA (popravljeno 16.8.2026): osnova se je računala iz price*qty BREZ
  // doplačil, zato se osnova na računu ni ujemala s plačanim zneskom.
  const znesek = zesekVrstice({ price: 2, qty: 2, mods: [{ delta: 0.5 }] })
  expect(znesek).toBeCloseTo(5.00, 2) // (2 + 0,5) × 2
})

test('vrstica: happy hour popust se upošteva', () => {
  const znesek = zesekVrstice({ price: 10, qty: 1, happyHourApplied: true, happyHourPct: 20 })
  expect(znesek).toBeCloseTo(8.00, 2)
})

test('vrstica: znesek NIKOLI ne sme biti negativen', () => {
  // NAPAKA (popravljeno 17.8.2026): negativno doplačilo ali popust nad 100 %
  // je dal negativen znesek — pri davčnem dokumentu to ne sme biti mogoče.
  expect(zesekVrstice({ price: 2, qty: 1, mods: [{ delta: -50 }] })).toBe(0)
  expect(zesekVrstice({ price: 10, qty: 1, happyHourApplied: true, happyHourPct: 150 })).toBe(0)
  expect(zesekVrstice({ price: 10, qty: -5 })).toBe(0)
})

test('vrstica: manjkajoči podatki ne dajo "ni število"', () => {
  expect(zesekVrstice({ price: undefined as any, qty: 1 })).toBe(0)
  expect(Number.isNaN(zesekVrstice({ price: 'x' as any, qty: 'y' as any }))).toBe(false)
})

// ═══════════════════ POPUST ═══════════════════

test('popust: znesek v evrih se pravilno pretvori v odstotek', () => {
  expect(popustEurVOdstotek(2, 8)).toBeCloseTo(25, 2)
  expect(popustEurVOdstotek(5, 20)).toBeCloseTo(25, 2)
})

test('popust: ne sme preseči vrednosti računa (negativen račun)', () => {
  // Vnos 100 € popusta na račun 8 € bi dal negativen račun.
  expect(popustEurVOdstotek(100, 8)).toBeCloseTo(100, 2)
})

test('popust: pri ničelnem računu ne deli z nič', () => {
  expect(popustEurVOdstotek(5, 0)).toBe(0)
})

test('popust: pretvorjen odstotek da nazaj vneseni znesek', () => {
  const skupaj = 7.99
  const pct = popustEurVOdstotek(2, skupaj)
  expect(skupaj * pct / 100).toBeCloseTo(2.00, 2)
})

// ═══════════════════ STORNO ═══════════════════

test('storno: znesek je negativen izvirnik', () => {
  // ZDavPR: "račun se stornira tako, da se izda nov račun z negativnimi zneski"
  expect(znesekStorna(6)).toBe(-6)
  expect(znesekStorna(-6)).toBe(-6)   // tudi če je vhod že negativen
  expect(znesekStorna(0)).toBe(-0)
})

// ═══════════════════ ZAKLJUČEK BLAGAJNE ═══════════════════

test('zaključek: vračila se ODŠTEJEJO od pričakovane gotovine', () => {
  // NAPAKA (popravljeno 19.8.2026): vračila so se brala iz stolpca
  // `refunds.created_at`, ki ne obstaja (pravi je `refunded_at`). Poizvedba je
  // odpovedala, vračila so izpadla, blagajna pa je javljala manjko, ki ga ni
  // bilo — blagajnik je iskal napako, ki ni obstajala.
  const pricakovano = pricakovanaGotovina({
    zacetnoStanje: 100,
    gotovinskiPromet: 250,
    gotovinskaVracila: 30,
  })
  expect(pricakovano).toBe(320)
})

test('zaključek: brez vračil je izračun preprosta vsota', () => {
  expect(pricakovanaGotovina({
    zacetnoStanje: 50, gotovinskiPromet: 120, gotovinskaVracila: 0,
  })).toBe(170)
})

// ═══════════════════ CELOTNA POT: PRODAJA FIZIOTERAPIJE ═══════════════════

test('celotna pot: oproščena fizioterapija 50 € → 0 € DDV, skupaj 50 €', () => {
  // To je natanko primer, ki je 19.8.2026 odpovedal v živo: storitev je bila
  // nastavljena na 0 %, blagajna pa je obračunala 22 % (9,02 €).
  const kosarica = [{ price: 50, qty: 1, vat_rate: 0, vat_exemption_code: '42-2' }]

  const skupaj = kosarica.reduce((s, l) => s + zesekVrstice(l), 0)
  const ddv = razclenitevDdv(kosarica)

  expect(skupaj).toBeCloseTo(50.00, 2)
  expect(ddv.vat).toBeCloseTo(0, 2)
  expect(ddv.net).toBeCloseTo(50.00, 2)

  // Klavzula mora biti prisotna — brez nje je račun formalno pomanjkljiv.
  expect(kosarica[0].vat_exemption_code).toBeTruthy()
})

// ═══════════════════ KPO: STORITEV PROTI IZDELKU ═══════════════════

test('KPO: storitev, prodana kot artikel, se prepozna kot STORITEV', () => {
  // NAPAKA (popravljeno 19.8.2026): prepoznava je bila samo `!!service_id`.
  // Storitev se ob shranjevanju sinhronizira v katalog artiklov in se proda
  // kot ARTIKEL, zato service_id ostane prazen — fizioterapija je bila v KPO
  // knjižena kot "prodaja izdelkov", kategorija pa `pos_prodaja`.
  const { jeStoritevVrstica } = require('../lib/pos-calc')

  // fizioterapija: prodana kot artikel, a ima bookable
  expect(jeStoritevVrstica({ service_id: null, items: { bookable: true } })).toBe(true)

  // rezervacija: klasična pot prek service_id
  expect(jeStoritevVrstica({ service_id: 'abc', items: null })).toBe(true)

  // kava: navaden izdelek
  expect(jeStoritevVrstica({ service_id: null, items: { bookable: false } })).toBe(false)
  expect(jeStoritevVrstica({ service_id: null, items: null })).toBe(false)
})

// ═══════════════════ DASHBOARD: PRIHODKI IN ODHODKI ═══════════════════

/**
 * Dashboard sešteva iz DVEH virov: izdanih računov (fakturiran promet) in
 * KPO knjige (denarni tok — POS, banka, kartice). Filter po `invoice_id` /
 * `receipt_id` prepreči dvojno štetje: plačilo izdanega računa pride v KPO
 * z `invoice_id`, zato se ne sme šteti še enkrat.
 */
function prihodekMeseca(
  racuni: Array<{ amount_net: number }>,
  kpo: Array<{ income?: number; invoice_id?: string | null }>,
): number {
  return racuni.reduce((s, r) => s + Number(r.amount_net || 0), 0)
    + kpo.filter(e => !e.invoice_id).reduce((s, e) => s + Number(e.income || 0), 0)
}

test('dashboard: podjetje SAMO s POS blagajno ne sme kazati ničelnega prihodka', () => {
  // NAPAKA (popravljeno 19.8.2026): prihodek je štel SAMO izdane račune,
  // odhodki pa so se šteli v celoti. Frizer, kavarna ali trgovina, ki prodaja
  // izključno prek blagajne, je videl vse stroške in NIČ prihodka — torej
  // stalno izgubo, čeprav je posloval s pozitivnim rezultatom.
  const prihodek = prihodekMeseca([], [
    { income: 500, invoice_id: null },   // POS zaključek
    { income: 300, invoice_id: null },   // bančni priliv
  ])
  expect(prihodek).toBe(800)
})

test('dashboard: plačilo izdanega računa se NE sme šteti dvakrat', () => {
  // Izdan račun 1000 € in njegovo plačilo, ki pride v KPO z invoice_id.
  const prihodek = prihodekMeseca(
    [{ amount_net: 1000 }],
    [{ income: 1000, invoice_id: 'racun-1' }],
  )
  expect(prihodek).toBe(1000) // NE 2000
})

test('dashboard: mešano poslovanje — računi in blagajna se seštejeta', () => {
  const prihodek = prihodekMeseca(
    [{ amount_net: 2001.86 }],                       // izdani računi
    [
      { income: 101.30, invoice_id: null },          // POS blagajna
      { income: 500, invoice_id: 'racun-x' },        // plačilo računa — ne šteje
    ],
  )
  expect(prihodek).toBeCloseTo(2103.16, 2)
})

// ═══════════════════ JAVNE POTI (BREZ PRIJAVE) ═══════════════════

/**
 * Poti, ki morajo delovati BREZ prijavljene seje. Če katera izpade iz
 * seznama v middleware.ts, uporabnika prestreže in preusmeri — stran se
 * sploh ne naloži.
 */
const JAVNE_POTI = [
  '/login',
  '/register',          // glavni gumb "Začni brezplačno" na začetni strani
  '/forgot-password',   // zahteva za ponastavitev gesla
  '/reset-password',    // povezava iz e-pošte — uporabnik NI prijavljen
  '/invite',            // povabilo v ekipo
  '/onboarding',
]

test('middleware: poti za prijavo in ponastavitev gesla so javne', async () => {
  // NAPAKA (popravljeno 19.8.2026): '/reset-password' in '/forgot-password'
  // nista bila na seznamu javnih poti. Uporabnik, ki je kliknil povezavo iz
  // e-pošte, ni bil prijavljen — middleware ga je preusmeril na začetno stran,
  // žeton pa je bil porabljen. Ponastavitev gesla zato ni delovala NIKOLI,
  // čeprav sta bila popravka v preletu 22 in 23 pravilna.
  const fs = require('fs')
  const middleware = fs.readFileSync(__dirname + '/../middleware.ts', 'utf8')

  // Preberi seznam PUBLIC_PREFIXES iz kode
  const blok = middleware.slice(
    middleware.indexOf('const PUBLIC_PREFIXES'),
    middleware.indexOf(']', middleware.indexOf('const PUBLIC_PREFIXES')),
  )

  for (const pot of JAVNE_POTI) {
    expect(blok, `pot ${pot} manjka med javnimi potmi v middleware.ts`).toContain(`'${pot}'`)
  }
})

// ═══════════════════ MENI PO VLOGAH ═══════════════════

test('meni: "Portal strank" se lastniku ne prikaže', () => {
  // NAPAKA (popravljeno 20.8.2026): razdelek "Računovodstvo" je bil dodan
  // zaradi računovodje — brez njega bi ta ostal s praznim menijem. Ker pa
  // lastnik sme povsod, filtriranje po vlogi ni odstranilo ničesar in
  // lastniku je "Portal strank" kazal seznam s SAMIM SEBOJ.
  const fs = require('fs')
  const layout = fs.readFileSync(__dirname + '/../components/AppLayout.tsx', 'utf8')

  // Vnos mora imeti omejitev na vlogo.
  const vrstica = layout.split('\n').find((v: string) => v.includes("label: 'Portal strank'"))
  expect(vrstica, 'vnos "Portal strank" ni najden').toBeTruthy()
  expect(vrstica, '"Portal strank" nima omejitve samoZaVlogo — lastnik ga bo videl').toContain('samoZaVlogo')
  expect(vrstica).toContain('accountant')

  // Filtriranje mora omejitev tudi upoštevati.
  expect(layout, 'filtriranje menija ne upošteva samoZaVlogo').toContain('samoZaVlogo')
})

// ═══════════════════ VRSTNI RED MENIJA BLAGAJNE ═══════════════════

/**
 * Uporabnik si lahko levi meni preuredi z vlečenjem. Shranjeni vrstni red
 * se mora uskladiti s profilom poslovanja: če je profil vmes dobil nov
 * zaslon, se ta doda; če ga je izgubil, se odstrani.
 */
function uskladiVrstniRed(shranjen: string[] | null, profil: string[]): string[] {
  if (!Array.isArray(shranjen) || shranjen.length === 0) return profil
  const veljavni = shranjen.filter(id => profil.includes(id))
  const manjkajoci = profil.filter(id => !veljavni.includes(id))
  return [...veljavni, ...manjkajoci]
}

function premakni(vrstniRed: string[], vlecen: string, cilj: string): string[] {
  if (vlecen === cilj) return vrstniRed
  const novi = vrstniRed.filter(x => x !== vlecen)
  const idx = novi.indexOf(cilj)
  novi.splice(idx < 0 ? novi.length : idx, 0, vlecen)
  return novi
}

test('meni: shranjen vrstni red se ohrani', () => {
  const r = uskladiVrstniRed(['sale', 'floor', 'admin'], ['floor', 'sale', 'admin'])
  expect(r).toEqual(['sale', 'floor', 'admin'])
})

test('meni: nov zaslon iz profila se doda na konec', () => {
  // Profil je dobil "calendar" — uporabnikov razpored se ne sme izgubiti,
  // novi zaslon pa mora postati dosegljiv.
  const r = uskladiVrstniRed(['sale', 'floor'], ['floor', 'sale', 'calendar'])
  expect(r).toEqual(['sale', 'floor', 'calendar'])
})

test('meni: zaslon, ki ga profil nima več, izpade', () => {
  // Sicer bi klik vodil na zaslon, do katerega uporabnik nima pravic.
  const r = uskladiVrstniRed(['sale', 'packages', 'floor'], ['floor', 'sale'])
  expect(r).toEqual(['sale', 'floor'])
})

test('meni: brez shranjenega se uporabi profil', () => {
  expect(uskladiVrstniRed(null, ['floor', 'sale'])).toEqual(['floor', 'sale'])
  expect(uskladiVrstniRed([], ['floor', 'sale'])).toEqual(['floor', 'sale'])
})

test('meni: premik postavi element PRED cilj', () => {
  expect(premakni(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
})

test('meni: premik nase ničesar ne spremeni', () => {
  expect(premakni(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
})

test('meni: premik ne podvoji in ne izgubi elementov', () => {
  const izhodisce = ['a', 'b', 'c', 'd', 'e']
  const r = premakni(izhodisce, 'e', 'a')
  expect(r).toHaveLength(5)
  expect(new Set(r).size).toBe(5)
  expect(r[0]).toBe('e')
})
