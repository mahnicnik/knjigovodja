import { test, expect } from '@playwright/test'
import {
  normalizirajNaziv,
  velikostPakiranja,
  podobnost,
  predlagajUjemanje,
} from '../lib/ujemanje-artiklov'

/**
 * TESTI UJEMANJA ARTIKLOV Z DOBAVNICE
 *
 * Podatki so RESNIČNI — nazivi z dobavnice Davidov Hram in imena artiklov iz
 * blagajne. Pri tej dobavnici ni bila ujeta nobena od 17 vrstic, zato se
 * zaloga sploh ni premaknila.
 */

// Artikli, kot so v blagajni (kratka imena, brez črtnih kod)
const ARTIKLI = [
  { id: 'a1', name: 'Radenska 0.5', barcode: null },
  { id: 'a2', name: 'Radenska immunity 0.5L', barcode: null },
  { id: 'a3', name: 'Radenska 0.25L', barcode: null },
  { id: 'a4', name: 'Radenska focus 0.5L', barcode: null },
  { id: 'a5', name: 'Corona', barcode: null },
  { id: 'a6', name: 'Radler Grenivka', barcode: null },
]

// ─── Normalizacija ──────────────────────────────────────────────────────

test('normalizacija: odstrani enote pakiranja in obliko embalaže', () => {
  expect(normalizirajNaziv('PIVO CORONA EXTRA 0,33L ST')).toBe('pivo corona extra')
  expect(normalizirajNaziv('VODA RADENSKA CLASSIC 1,5L PET')).toBe('voda radenska classic')
})

test('pakiranje: prepozna velikost in pretvori v litre', () => {
  expect(velikostPakiranja('PIVO CORONA EXTRA 0,33L ST')).toBeCloseTo(0.33, 3)
  expect(velikostPakiranja('VODA RADENSKA CLASSIC 1,5L PET')).toBeCloseTo(1.5, 3)
  expect(velikostPakiranja('Radenska 0.25L')).toBeCloseTo(0.25, 3)
  expect(velikostPakiranja('Kruh')).toBeNull()
})

// ─── Ujemanje po nazivu ─────────────────────────────────────────────────

test('ujemanje: Corona z dobavnice se ujame z artiklom "Corona"', () => {
  const p = predlagajUjemanje(
    { naziv: 'PIVO CORONA EXTRA 0,33L ST', ean: '3850131006337' },
    ARTIKLI,
  )
  expect(p.itemId).toBe('a5')
})

test('ujemanje: immunity se ujame s pravo različico, ne s katerokoli Radensko', () => {
  const p = predlagajUjemanje(
    { naziv: 'VODA RADENSKA FUNCT IMMUNITY 0,5L PET', ean: '3830065023075' },
    ARTIKLI,
  )
  expect(p.itemId).toBe('a2') // Radenska immunity 0.5L
})

test('ujemanje: različno pakiranje NE sme veljati za isti artikel', () => {
  // "Radenska 1,5L" se ne sme ujeti z "Radenska 0.25L" — to bi zalogo
  // pripisalo napačnemu artiklu, kar je huje kot da se ne pripiše nikamor.
  const p = predlagajUjemanje(
    { naziv: 'VODA RADENSKA CLASSIC 1,5L PET', ean: null },
    [{ id: 'a3', name: 'Radenska 0.25L', barcode: null }],
  )
  expect(p.zanesljivost).not.toBe('visoka')
})

test('ujemanje: 0,25L se ujame z Radensko 0.25L', () => {
  const p = predlagajUjemanje(
    { naziv: 'VODA RADENSKA CLASSIC 0,25L STV', ean: null },
    ARTIKLI,
  )
  expect(p.itemId).toBe('a3')
})

test('ujemanje: neznan artikel vrne null, ne ugiba', () => {
  const p = predlagajUjemanje(
    { naziv: 'MLEKO TRAJNO BERTI 3,5% 1L', ean: '3838800051314' },
    ARTIKLI,
  )
  expect(p.itemId).toBeNull()
  expect(p.zanesljivost).toBe('nizka')
})

// ─── Črtna koda ─────────────────────────────────────────────────────────

test('črtna koda: prevlada nad podobnostjo imena', () => {
  const artikli = [
    { id: 'x1', name: 'Nekaj čisto drugega', barcode: '3850131006337' },
    { id: 'x2', name: 'PIVO CORONA EXTRA', barcode: null },
  ]
  const p = predlagajUjemanje(
    { naziv: 'PIVO CORONA EXTRA 0,33L ST', ean: '3850131006337' },
    artikli,
  )
  expect(p.itemId).toBe('x1')
  expect(p.zanesljivost).toBe('visoka')
  expect(p.ocena).toBe(1)
})

// ─── Podobnost ──────────────────────────────────────────────────────────

test('podobnost: enak naziv da 1, nepovezana pa blizu 0', () => {
  expect(podobnost('Corona', 'Corona')).toBe(1)
  expect(podobnost('PIVO CORONA EXTRA 0,33L ST', 'Kruh polnozrnat')).toBeLessThan(0.2)
})

test('podobnost: prazna naziva ne povzročita napake', () => {
  expect(podobnost('', 'Corona')).toBe(0)
  expect(podobnost('Corona', '')).toBe(0)
})

// ─── Brisanje dobavnice: razveljavitev zaloge ───────────────────────────

/**
 * Dobavnica ob uvozu POVEČA zalogo. Če se izbriše brez razveljavitve, zaloga
 * ostane napihnjena in inventura se ne ujema.
 */
function zalogaPoBrisanju(
  zacetna: Record<string, number>,
  vrstice: Array<{ item_id: string | null; quantity: number }>,
): Record<string, number> {
  const r = { ...zacetna }
  for (const v of vrstice) {
    if (!v.item_id) continue          // ni bila poknjižena — ni kaj vračati
    r[v.item_id] = (r[v.item_id] ?? 0) - Number(v.quantity || 0)
  }
  return r
}

test('brisanje dobavnice: zaloga se zmanjša nazaj za uvožene količine', () => {
  const po = zalogaPoBrisanju(
    { a1: 30, a2: 50 },
    [{ item_id: 'a1', quantity: 18 }, { item_id: 'a2', quantity: 24 }],
  )
  expect(po.a1).toBe(12)
  expect(po.a2).toBe(26)
})

test('brisanje dobavnice: nepoknjižene vrstice ne spremenijo zaloge', () => {
  // Vrstica brez item_id ob uvozu ni povečala zaloge — zato je tudi ne
  // sme zmanjšati. Sicer bi brisanje zalogo pokvarilo v drugo smer.
  const po = zalogaPoBrisanju(
    { a1: 30 },
    [{ item_id: null, quantity: 100 }, { item_id: 'a1', quantity: 5 }],
  )
  expect(po.a1).toBe(25)
  expect(Object.keys(po)).toHaveLength(1)
})

test('brisanje dobavnice: dvakratno brisanje ni mogoče (zaloga bi šla v minus)', () => {
  // Prvo brisanje odstrani dobavnico, zato drugega ni. Test dokumentira,
  // kaj bi se zgodilo, če bi se brisanje ponovilo — zato je pomembno, da se
  // zapis izbriše ŠELE po uspešni razveljavitvi zaloge.
  const prvo = zalogaPoBrisanju({ a1: 18 }, [{ item_id: 'a1', quantity: 18 }])
  expect(prvo.a1).toBe(0)
  const drugo = zalogaPoBrisanju(prvo, [{ item_id: 'a1', quantity: 18 }])
  expect(drugo.a1).toBe(-18) // zato vrstni red: najprej zaloga, nato brisanje
})

// ─── Uvoz z ujemanji: kaj se dejansko zgodi ─────────────────────────────

/**
 * Povzetek pred uvozom mora povedati resnico: koliko artiklom se bo zaloga
 * povečala, koliko jih bo nastalo na novo in koliko vrstic bo preskočenih.
 */
function povzetekUvoza(
  vrstice: Array<{ izbrana: boolean; itemId: string | null }>,
) {
  const izbrane = vrstice.filter(v => v.izbrana)
  return {
    zaloga: izbrane.filter(v => v.itemId && v.itemId !== 'NOV').length,
    novi: izbrane.filter(v => v.itemId === 'NOV').length,
    brez: izbrane.filter(v => !v.itemId).length,
  }
}

test('uvoz: povzetek loči knjižene, nove in preskočene', () => {
  const p = povzetekUvoza([
    { izbrana: true, itemId: 'a1' },
    { izbrana: true, itemId: 'a2' },
    { izbrana: true, itemId: 'NOV' },
    { izbrana: true, itemId: null },
    { izbrana: false, itemId: 'a3' }, // neizbrana se ne šteje
  ])
  expect(p.zaloga).toBe(2)
  expect(p.novi).toBe(1)
  expect(p.brez).toBe(1)
})

test('uvoz: vrstica brez ujemanja NE poveča zaloge nobenemu artiklu', () => {
  // Ključno: raje ne poknjižimo nikamor, kot da poknjižimo napačno —
  // napačne zaloge se ne opazi, dokler se ne razide inventura.
  const p = povzetekUvoza([{ izbrana: true, itemId: null }])
  expect(p.zaloga).toBe(0)
  expect(p.brez).toBe(1)
})

test('uvoz: "NOV" se ne šteje med povečanje zaloge obstoječih', () => {
  const p = povzetekUvoza([{ izbrana: true, itemId: 'NOV' }])
  expect(p.zaloga).toBe(0)
  expect(p.novi).toBe(1)
})

// ─── Surovine iz dobavnice ──────────────────────────────────────────────

/**
 * Surovine (kava, vino, moka) so v LOČENI tabeli od artiklov. Uvoz mora
 * znati polniti obe — sicer je treba surovine ob vsaki dobavi vnašati ročno.
 */
function razporediPoTabelah(
  vrstice: Array<{ izbrana: boolean; itemId: string | null; vrsta?: string; vir?: string }>,
) {
  const izbrane = vrstice.filter(v => v.izbrana)
  const jeNov = (v: any) => v.vir === 'nov' || v.vir === 'nova_surovina'
  return {
    artikli: izbrane.filter(v => v.itemId && v.vrsta !== 'ingredient' && !jeNov(v)).length,
    surovine: izbrane.filter(v => v.itemId && v.vrsta === 'ingredient' && !jeNov(v)).length,
    novi: izbrane.filter(jeNov).length,
    brez: izbrane.filter(v => !v.itemId && !jeNov(v)).length,
  }
}

test('surovine: uvoz loči artikle od surovin', () => {
  const r = razporediPoTabelah([
    { izbrana: true, itemId: 'i1', vrsta: 'item' },
    { izbrana: true, itemId: 'g1', vrsta: 'ingredient' },
    { izbrana: true, itemId: 'g2', vrsta: 'ingredient' },
  ])
  expect(r.artikli).toBe(1)
  expect(r.surovine).toBe(2)
})

test('surovine: nova surovina se ne šteje med obstoječe', () => {
  const r = razporediPoTabelah([
    { izbrana: true, itemId: null, vir: 'nova_surovina' },
  ])
  expect(r.surovine).toBe(0)
  expect(r.novi).toBe(1)
  expect(r.brez).toBe(0)   // NI preskočena — nastala bo
})

/**
 * Brisanje dobavnice mora zalogo vrniti v PRAVO tabelo. Če bi surovino
 * poskušali vrniti prek funkcije za artikle, bi se zaloga surovine ne
 * popravila in bi ostala napihnjena.
 */
function katereFunkcijeZaVrnitev(
  vrstice: Array<{ item_id: string | null; ingredient_id: string | null }>,
) {
  return vrstice.map(v => v.ingredient_id ? 'increment_ingredient_stock' : 'increment_stock')
}

test('brisanje: surovina se vrne prek svoje funkcije', () => {
  const f = katereFunkcijeZaVrnitev([
    { item_id: 'i1', ingredient_id: null },
    { item_id: null, ingredient_id: 'g1' },
  ])
  expect(f).toEqual(['increment_stock', 'increment_ingredient_stock'])
})

test('normativ ni fizična stvar in ne sme biti med kandidati za polnjenje', () => {
  // Espresso na dobavnici ne pride — polnijo se njegove sestavine.
  const katalog = [
    { id: 'i1', name: 'Corona', item_type: 'simple' },
    { id: 'i2', name: 'Espresso', item_type: 'recipe' },
    { id: 'i3', name: 'Kava zrna', item_type: 'ingredient' },
  ]
  const kandidati = katalog.filter(k => k.item_type !== 'recipe' && k.item_type !== 'ingredient')
  expect(kandidati.map(k => k.name)).toEqual(['Corona'])
})

// ─── Normativi ob prodaji ───────────────────────────────────────────────

/**
 * Ob prodaji recepta se NE odšteje recept sam, ampak njegove sestavine.
 * Vrstica v košarici mora zato nositi `item_type` — brez tega filter ne
 * najde nobenega recepta in normativi se ne odštejejo NIKOLI, brez sledi.
 */
function porabaSurovin(
  kosarica: Array<{ id: string; qty: number; item_type?: string }>,
  normativi: Array<{ item_id: string; ingredient_id: string; qty_used: number }>,
): Record<string, number> {
  const recepti = kosarica.filter(l => l.item_type === 'recipe')
  const poSurovini: Record<string, number> = {}
  for (const l of recepti) {
    for (const n of normativi.filter(n => n.item_id === l.id)) {
      poSurovini[n.ingredient_id] = (poSurovini[n.ingredient_id] || 0) + n.qty_used * l.qty
    }
  }
  return poSurovini
}

const NORMATIVI = [
  { item_id: 'vino1dl', ingredient_id: 'sauvignon', qty_used: 0.1 },
]

test('normativ: prodaja 7 kozarcev odšteje 0,7 L vina', () => {
  // RESNIČEN primer (21.8.2026): prodanih 7 × "Belo vino 1dl", zaloga
  // surovine se ni premaknila, ker vrstica ni nosila item_type.
  const p = porabaSurovin([{ id: 'vino1dl', qty: 7, item_type: 'recipe' }], NORMATIVI)
  expect(p.sauvignon).toBeCloseTo(0.7, 4)
})

test('normativ: BREZ item_type se ne odšteje nič — to je bila napaka', () => {
  const p = porabaSurovin([{ id: 'vino1dl', qty: 7 }], NORMATIVI)
  expect(Object.keys(p)).toHaveLength(0)
})

test('normativ: ista surovina iz več receptov se sešteje', () => {
  const normativi = [
    { item_id: 'vino1dl', ingredient_id: 'sauvignon', qty_used: 0.1 },
    { item_id: 'vino2dl', ingredient_id: 'sauvignon', qty_used: 0.2 },
  ]
  const p = porabaSurovin([
    { id: 'vino1dl', qty: 3, item_type: 'recipe' },
    { id: 'vino2dl', qty: 2, item_type: 'recipe' },
  ], normativi)
  expect(p.sauvignon).toBeCloseTo(0.7, 4) // 0,3 + 0,4
})

test('normativ: enostaven artikel v isti košarici ne sproži normativov', () => {
  const p = porabaSurovin([
    { id: 'corona', qty: 5, item_type: 'simple' },
    { id: 'vino1dl', qty: 1, item_type: 'recipe' },
  ], NORMATIVI)
  expect(p.sauvignon).toBeCloseTo(0.1, 4)
})

// ─── Filtri v zalogi ────────────────────────────────────────────────────

const st = (v: any) => v === null || v === undefined || v === '' ? null : Number(v)
const jePodMinimumom = (zaloga: any, minimum: any) => {
  const z = st(zaloga), m = st(minimum)
  return z !== null && m !== null && m > 0 && z <= m
}
const jeRazprodano = (zaloga: any) => {
  const z = st(zaloga)
  return z !== null && z === 0
}

test('zaloga: "Pod minimum" ujame artikel na meji in pod njo', () => {
  expect(jePodMinimumom(3, 5)).toBe(true)   // pod
  expect(jePodMinimumom(5, 5)).toBe(true)   // na meji
  expect(jePodMinimumom(8, 5)).toBe(false)  // nad
})

test('zaloga: brez določenega minimuma artikel ne velja za nizkega', () => {
  // Sicer bi bilo "pod minimum" vse, kar ima zalogo 0 — tudi tisto, česar
  // sploh ne naročamo.
  expect(jePodMinimumom(0, 0)).toBe(false)
  expect(jePodMinimumom(0, null)).toBe(false)
  expect(jePodMinimumom(0, undefined)).toBe(false)
})

test('zaloga: številke v obliki niza se pravilno primerjajo', () => {
  // NAPAKA (popravljeno 21.8.2026): številčni stolpci se iz baze vrnejo kot
  // NIZ ("0.00"), zato `stock === 0` ni držal in primerjava `<=` je delovala
  // po abecedi — "10" <= "5" je res, ker je "1" pred "5".
  expect(jeRazprodano('0.00')).toBe(true)
  expect(jePodMinimumom('3.00', '5.00')).toBe(true)
  expect(jePodMinimumom('10.00', '5.00')).toBe(false)  // po abecedi bi bilo true
})

test('zaloga: artikel brez vodene zaloge ni razprodan', () => {
  // stock = null pomeni "zaloge ne vodimo" (npr. storitev), ne "je ni".
  expect(jeRazprodano(null)).toBe(false)
  expect(jeRazprodano(undefined)).toBe(false)
  expect(jeRazprodano(0)).toBe(true)
})

// ─── Storno: vračanje zaloge ────────────────────────────────────────────

/**
 * Storno mora zalogo vrniti v isto stanje, kot je bila pred prodajo:
 * navadnim artiklom količino, receptom pa porabo surovin.
 */
function vrnjenoObStornu(
  vrstice: Array<{ item_id: string; qty: number }>,
  vrsta: Record<string, string>,
  normativi: Array<{ item_id: string; ingredient_id: string; qty_used: number }>,
) {
  const artikli: Record<string, number> = {}
  const surovine: Record<string, number> = {}

  for (const l of vrstice) {
    if (vrsta[l.item_id] === 'recipe') {
      for (const n of normativi.filter(n => n.item_id === l.item_id)) {
        surovine[n.ingredient_id] = (surovine[n.ingredient_id] || 0) + n.qty_used * l.qty
      }
    } else {
      artikli[l.item_id] = (artikli[l.item_id] || 0) + l.qty
    }
  }
  return { artikli, surovine }
}

test('storno: recept vrne porabo surovine, ne sebe', () => {
  // RESNIČEN primer (21.8.2026): storniranih 7 × "Belo vino 1dl". Zaloga
  // surovine je ostala 59,3 L namesto 60 L — storno je zalogo ignoriral.
  const r = vrnjenoObStornu(
    [{ item_id: 'vino1dl', qty: 7 }],
    { vino1dl: 'recipe' },
    [{ item_id: 'vino1dl', ingredient_id: 'sauvignon', qty_used: 0.1 }],
  )
  expect(r.surovine.sauvignon).toBeCloseTo(0.7, 4)
  expect(r.artikli.vino1dl).toBeUndefined()   // recept sam se NE vrača
})

test('storno: navaden artikel vrne svojo količino', () => {
  const r = vrnjenoObStornu([{ item_id: 'corona', qty: 3 }], { corona: 'simple' }, [])
  expect(r.artikli.corona).toBe(3)
  expect(Object.keys(r.surovine)).toHaveLength(0)
})

test('storno: mešan račun vrne oboje', () => {
  const r = vrnjenoObStornu(
    [{ item_id: 'corona', qty: 2 }, { item_id: 'vino1dl', qty: 4 }],
    { corona: 'simple', vino1dl: 'recipe' },
    [{ item_id: 'vino1dl', ingredient_id: 'sauvignon', qty_used: 0.1 }],
  )
  expect(r.artikli.corona).toBe(2)
  expect(r.surovine.sauvignon).toBeCloseTo(0.4, 4)
})

test('storno: brez podatka o vrsti bi se surovine NE vrnile', () => {
  // Zakaj je vrsto treba poiskati v katalogu: `order_lines` je ne hrani.
  const r = vrnjenoObStornu([{ item_id: 'vino1dl', qty: 7 }], {}, [
    { item_id: 'vino1dl', ingredient_id: 'sauvignon', qty_used: 0.1 },
  ])
  expect(Object.keys(r.surovine)).toHaveLength(0)
  expect(r.artikli.vino1dl).toBe(7)  // napačno — zato iščemo vrsto v katalogu
})

// ─── Paketi: stopnja DDV ────────────────────────────────────────────────

/** Vrstica za plačilo, ki nastane ob prodaji paketa. */
function vrsticaPaketa(template: { name: string; price: number; vat_rate?: number | null }) {
  return {
    name: template.name,
    price: Number(template.price || 0),
    qty: 1,
    vat_rate: Number(template.vat_rate ?? 22),
  }
}

test('paket: oproščen paket NE sme dobiti 22 %', () => {
  // NAPAKA (popravljeno 21.8.2026): stopnja je bila trdo zapisana na 22.
  // Paket "10× fizioterapija" z 0 % je na računu dobil 81,15 € DDV —
  // napačen davčni dokument, poslan tudi FURS.
  const v = vrsticaPaketa({ name: '10× fizioterapija', price: 450, vat_rate: 0 })
  expect(v.vat_rate).toBe(0)

  const ddv = v.price - v.price / (1 + v.vat_rate / 100)
  expect(ddv).toBeCloseTo(0, 2)   // NE 81,15
})

test('paket: članarina po 22 % ostane 22 %', () => {
  const v = vrsticaPaketa({ name: 'Mesečna vadba', price: 45, vat_rate: 22 })
  expect(v.vat_rate).toBe(22)
  expect(v.price - v.price / 1.22).toBeCloseTo(8.11, 2)
})

test('paket: brez določene stopnje privzame 22 %, 0 pa ostane 0', () => {
  expect(vrsticaPaketa({ name: 'x', price: 10 }).vat_rate).toBe(22)
  expect(vrsticaPaketa({ name: 'x', price: 10, vat_rate: null }).vat_rate).toBe(22)
  expect(vrsticaPaketa({ name: 'x', price: 10, vat_rate: 0 }).vat_rate).toBe(0)
})
