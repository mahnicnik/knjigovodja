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

// ─── Koledar: prekrivajoči termini ──────────────────────────────────────

/**
 * Prekrivajoči termini so se risali eden ČEZ drugega (vsi polna širina),
 * zato sta bila dva termina ob isti uri videti kot en sam.
 */
function razporediVStolpce(termini: Array<{ id: string; start: number; trajanje: number }>) {
  const konec = (b: any) => b.start + b.trajanje
  const urejeni = [...termini].sort((a, b) => a.start - b.start)
  const skupine: any[][] = []
  for (const b of urejeni) {
    const g = skupine.find(g => g.some(x => b.start < konec(x) && konec(b) > x.start))
    if (g) g.push(b)
    else skupine.push([b])
  }
  const lega: Record<string, { stolpec: number; skupno: number }> = {}
  for (const g of skupine) g.forEach((b, i) => { lega[b.id] = { stolpec: i, skupno: g.length } })
  return lega
}

test('koledar: dva termina ob isti uri dobita vsak svoj stolpec', () => {
  const l = razporediVStolpce([
    { id: 'a', start: 540, trajanje: 60 },  // 9:00–10:00
    { id: 'b', start: 540, trajanje: 60 },  // 9:00–10:00
  ])
  expect(l.a.skupno).toBe(2)
  expect(l.b.skupno).toBe(2)
  expect(l.a.stolpec).not.toBe(l.b.stolpec)
})

test('koledar: termina, ki se ne prekrivata, ostaneta polna širina', () => {
  const l = razporediVStolpce([
    { id: 'a', start: 540, trajanje: 60 },   // 9:00–10:00
    { id: 'b', start: 660, trajanje: 60 },   // 11:00–12:00
  ])
  expect(l.a.skupno).toBe(1)
  expect(l.b.skupno).toBe(1)
})

test('koledar: delno prekrivanje šteje kot prekrivanje', () => {
  const l = razporediVStolpce([
    { id: 'a', start: 540, trajanje: 60 },   // 9:00–10:00
    { id: 'b', start: 570, trajanje: 60 },   // 9:30–10:30
  ])
  expect(l.a.skupno).toBe(2)
})

test('koledar: termin, ki se konča točno ob začetku naslednjega, se NE prekriva', () => {
  const l = razporediVStolpce([
    { id: 'a', start: 540, trajanje: 60 },   // 9:00–10:00
    { id: 'b', start: 600, trajanje: 60 },   // 10:00–11:00
  ])
  expect(l.a.skupno).toBe(1)
})

// ─── Časovni pas v obrazcu ──────────────────────────────────────────────

function zaVnos(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

test('obrazec: polje kaže LOKALNI čas, ne UTC', () => {
  // NAPAKA (popravljeno 21.8.2026): uporabljen `toISOString()`, ki vrne UTC.
  // Termin ob 9:00 se je v obrazcu pokazal kot 7:00 — in če je uporabnik
  // karkoli spremenil, se je premaknil za dve uri nazaj.
  //
  // Test mora delovati v VSAKEM časovnem pasu (na strežniku je pogosto UTC,
  // pri uporabniku pa CEST), zato ne primerjamo s trdo zapisanim nizom,
  // ampak z uro, ki jo pokaže sam datum.
  const d = new Date(2026, 7, 22, 9, 0)  // 22.8.2026 ob 9:00 po lokalnem času
  const rezultat = zaVnos(d)

  expect(rezultat.slice(11, 13)).toBe(String(d.getHours()).padStart(2, '0'))
  expect(rezultat.slice(0, 10)).toBe('2026-08-22')
})

test('obrazec: pretvorba v UTC bi uro premaknila (v pasu z odmikom)', () => {
  // Dokumentira, ZAKAJ ne smemo uporabiti toISOString(): v pasu z odmikom
  // se ura razlikuje. V UTC okolju sta zapisa enaka, zato test preverja
  // le, da naša pretvorba sledi LOKALNI uri, ne glede na okolje.
  const d = new Date(2026, 7, 22, 9, 0)
  const odmikMin = d.getTimezoneOffset()
  const utcUra = d.toISOString().slice(11, 13)
  const nasaUra = zaVnos(d).slice(11, 13)

  if (odmikMin !== 0) {
    expect(nasaUra).not.toBe(utcUra)   // pas z odmikom: zapisa se RAZLIKUJETA
  } else {
    expect(nasaUra).toBe(utcUra)       // UTC okolje: enaka sta upravičeno
  }
})

// ─── Z-poročilo: DDV po stopnjah ────────────────────────────────────────

/**
 * Z-poročilo je davčni dokument dnevnega zaključka. Doslej razčlenitve DDV
 * sploh ni imelo — ne v prikazu ne v bazi, čeprav stolpci obstajajo.
 */
function ddvPoStopnjah(
  narocila: Array<{ postavke: Array<{ total: number; vat_rate: number; voided?: boolean }> }>,
) {
  const m = new Map<number, { osnova: number; ddv: number }>()
  for (const o of narocila) {
    for (const l of o.postavke) {
      if (l.voided) continue
      const stopnja = Number(l.vat_rate ?? 22)
      const osnova = stopnja > 0 ? l.total / (1 + stopnja / 100) : l.total
      const v = m.get(stopnja) || { osnova: 0, ddv: 0 }
      v.osnova += osnova
      v.ddv += l.total - osnova
      m.set(stopnja, v)
    }
  }
  const z = (n: number) => Math.round(n * 100) / 100
  return Array.from(m.entries())
    .map(([stopnja, v]) => ({ stopnja, osnova: z(v.osnova), ddv: z(v.ddv) }))
    .sort((a, b) => b.stopnja - a.stopnja)
}

test('Z-poročilo: oproščen in obdavčen promet sta ločena', () => {
  const r = ddvPoStopnjah([
    { postavke: [
      { total: 50, vat_rate: 0 },      // fizioterapija, oproščena
      { total: 30, vat_rate: 22 },     // masaža
    ]},
  ])
  expect(r).toHaveLength(2)

  const nicelna = r.find(v => v.stopnja === 0)!
  expect(nicelna.osnova).toBeCloseTo(50, 2)
  expect(nicelna.ddv).toBeCloseTo(0, 2)

  const splosna = r.find(v => v.stopnja === 22)!
  expect(splosna.osnova).toBeCloseTo(24.59, 2)
  expect(splosna.ddv).toBeCloseTo(5.41, 2)
})

test('Z-poročilo: stornirane postavke se ne štejejo', () => {
  const r = ddvPoStopnjah([
    { postavke: [
      { total: 100, vat_rate: 22 },
      { total: 70, vat_rate: 22, voided: true },
    ]},
  ])
  expect(r[0].osnova).toBeCloseTo(81.97, 2)   // samo 100, ne 170
})

test('Z-poročilo: ista stopnja iz več računov se sešteje', () => {
  const r = ddvPoStopnjah([
    { postavke: [{ total: 61, vat_rate: 22 }] },
    { postavke: [{ total: 61, vat_rate: 22 }] },
  ])
  expect(r).toHaveLength(1)
  expect(r[0].ddv).toBeCloseTo(22, 1)
})

test('Z-poročilo: 9,5 % se ne zaokroži na 22 %', () => {
  const r = ddvPoStopnjah([{ postavke: [{ total: 10.95, vat_rate: 9.5 }] }])
  expect(r[0].stopnja).toBe(9.5)
  expect(r[0].osnova).toBeCloseTo(10, 2)
  expect(r[0].ddv).toBeCloseTo(0.95, 2)
})

// ─── Unovčenje karte obiskov na blagajni ────────────────────────────────

/**
 * Storitev je bila plačana ŽE ob nakupu kartice. Ob unovčenju se zato odšteje
 * obisk, znesek pa se NE zaračuna znova — sicer bi se prihodek štel dvakrat.
 */
function unovciKarto(
  kartica: { remaining: number; frozen_at?: string | null; active: boolean },
  znesekStoritve: number,
) {
  if (!kartica.active) return { napaka: 'kartica ni aktivna' }
  if (kartica.frozen_at) return { napaka: 'kartica je zamrznjena' }
  if (!(kartica.remaining > 0)) return { napaka: 'ni več obiskov' }
  return {
    preostalo: kartica.remaining - 1,
    zaracunano: 0,                       // NE znesekStoritve
    aktivna: kartica.remaining - 1 > 0,
  }
}

test('kartica: unovčenje odšteje obisk in NE zaračuna znova', () => {
  // NAPAKA (popravljeno 21.8.2026): poti za unovčenje na blagajni ni bilo.
  // Uporabniki so uporabljali "Bone", ki izdajo navaden račun in ne odštejejo
  // ničesar — stranka je bila zaračunana dvakrat, kartica pa nedotaknjena.
  const r: any = unovciKarto({ remaining: 8, active: true }, 40)
  expect(r.preostalo).toBe(7)
  expect(r.zaracunano).toBe(0)
})

test('kartica: zadnji obisk kartico zapre', () => {
  const r: any = unovciKarto({ remaining: 1, active: true }, 40)
  expect(r.preostalo).toBe(0)
  expect(r.aktivna).toBe(false)
})

test('kartica: zamrznjene ni mogoče unovčiti', () => {
  const r: any = unovciKarto({ remaining: 5, active: true, frozen_at: '2026-08-01' }, 40)
  expect(r.napaka).toBeTruthy()
  expect(r.preostalo).toBeUndefined()
})

test('kartica: prazne kartice ni mogoče unovčiti', () => {
  const r: any = unovciKarto({ remaining: 0, active: true }, 40)
  expect(r.napaka).toBeTruthy()
})

test('kartica: prihodek se ne sme šteti dvakrat', () => {
  // Prodaja kartice: 400 € prihodka. Deset obiskov po 40 € = 0 € dodatno.
  const prodaja = 400
  let dodatniPrihodek = 0
  let k = { remaining: 10, active: true }
  for (let i = 0; i < 10; i++) {
    const r: any = unovciKarto(k, 40)
    dodatniPrihodek += r.zaracunano
    k = { remaining: r.preostalo, active: r.aktivna }
  }
  expect(dodatniPrihodek).toBe(0)
  expect(prodaja + dodatniPrihodek).toBe(400)   // NE 800
})

// ─── Z-poročilo: obseg izmene ───────────────────────────────────────────

/**
 * Z-poročilo je zajemalo CEL DAN. Če si blagajno zaključil dvakrat v istem
 * dnevu, je drugo poročilo ponovilo ves promet prvega — podvojen davčni
 * dokument. Izmena mora teči od zadnjega zaključka naprej.
 */
function obsegIzmene(
  zadnjiZaključek: string | null,
  danes: Date,
): { od: Date; do: Date } {
  const od = zadnjiZaključek
    ? new Date(zadnjiZaključek)
    : new Date(danes.getFullYear(), danes.getMonth(), danes.getDate())
  const doKdaj = new Date(danes.getFullYear(), danes.getMonth(), danes.getDate(), 23, 59, 59)
  return { od, do: doKdaj }
}

function prometVObsegu(
  narocila: Array<{ closed_at: string; total: number }>,
  obseg: { od: Date; do: Date },
): number {
  return narocila
    .filter(o => {
      const t = new Date(o.closed_at).getTime()
      return t >= obseg.od.getTime() && t <= obseg.do.getTime()
    })
    .reduce((s, o) => s + o.total, 0)
}

test('Z-poročilo: druga izmena ne ponovi prometa prve', () => {
  const danes = new Date(2026, 7, 21, 20, 0)
  const narocila = [
    { closed_at: '2026-08-21T09:00:00', total: 100 },   // prva izmena
    { closed_at: '2026-08-21T11:00:00', total: 200 },   // prva izmena
    { closed_at: '2026-08-21T15:00:00', total: 50 },    // druga izmena
  ]

  const prva = obsegIzmene(null, danes)
  expect(prometVObsegu(narocila, prva)).toBe(350)  // pred zaključkom: vse

  // Prva izmena zaključena ob 13:00.
  const druga = obsegIzmene('2026-08-21T13:00:00', danes)
  expect(prometVObsegu(narocila, druga)).toBe(50)  // NE 350
})

test('Z-poročilo: prva izmena dneva teče od polnoči', () => {
  const danes = new Date(2026, 7, 21, 20, 0)
  const o = obsegIzmene(null, danes)
  expect(o.od.getHours()).toBe(0)
  expect(o.od.getDate()).toBe(21)
})

test('Z-poročilo: prenos gotovine se predlaga kot začetno stanje', () => {
  // Prej je vedno pisalo 0,00, čeprav je prejšnje poročilo prenos priporočilo.
  const zadnjeZ = { cash_closing: 545 }
  const prenos = Number(zadnjeZ?.cash_closing ?? 0)
  expect(prenos).toBe(545)

  const brezPrejsnje = Number((null as any)?.cash_closing ?? 0)
  expect(brezPrejsnje).toBe(0)
})

// ─── Nabavna cena surovine ──────────────────────────────────────────────

test('surovina: cena je NA ENOTO, ne na pakiranje', () => {
  // NAPAKA (popravljeno 21.8.2026): oznaka ni povedala enote. Uporabnik je
  // pri kavi v gramih vpisal 18 (mišljeno 18 €/kg), program pa je to razumel
  // kot 18 € NA GRAM — vrednost zaloge 18.000 € namesto 18.
  const vrednost = (zaloga: number, cenaNaEnoto: number) => zaloga * cenaNaEnoto

  expect(vrednost(1000, 18)).toBe(18000)      // kar se je zgodilo
  expect(vrednost(1000, 0.018)).toBeCloseTo(18, 2)  // kar je pravilno
})

// ─── Prekrivanje terminov ───────────────────────────────────────────────

function najdiTrke(
  nov: { start: number; trajanje: number; staff: string },
  obstojeci: Array<{ id: string; start: number; trajanje: number; staff: string }>,
) {
  const konec = nov.start + nov.trajanje
  return obstojeci.filter(b => {
    if (b.staff !== nov.staff) return false          // drug izvajalec ni trk
    const bKonec = b.start + b.trajanje
    return nov.start < bKonec && konec > b.start
  })
}

test('termin: trk pri ISTEM izvajalcu se zazna', () => {
  const trki = najdiTrke(
    { start: 600, trajanje: 60, staff: 'nik' },
    [{ id: 'a', start: 600, trajanje: 60, staff: 'nik' }],
  )
  expect(trki).toHaveLength(1)
})

test('termin: isti čas pri DRUGEM izvajalcu ni trk', () => {
  const trki = najdiTrke(
    { start: 600, trajanje: 60, staff: 'nik' },
    [{ id: 'a', start: 600, trajanje: 60, staff: 'ana' }],
  )
  expect(trki).toHaveLength(0)
})

test('termin: zaporedna termina brez presledka nista trk', () => {
  const trki = najdiTrke(
    { start: 660, trajanje: 60, staff: 'nik' },      // 11:00–12:00
    [{ id: 'a', start: 600, trajanje: 60, staff: 'nik' }],  // 10:00–11:00
  )
  expect(trki).toHaveLength(0)
})

// ─── Obročni načrt v profilu stranke ────────────────────────────────────

/**
 * Kartica paketa ni povedala, da gre za obroke — "Plačano: 45 €" je bilo od
 * navadne članarine za 45 € nerazločljivo. Skupna vrednost, število obrokov
 * in zapadlosti niso bili vidni nikjer.
 */
function povzetekObrokov(obroki: Array<{ installment_number: number; amount: number; status: string; due_date: string }>) {
  const urejeni = [...obroki].sort((a, b) => a.installment_number - b.installment_number)
  const placani = urejeni.filter(o => o.status === 'paid')
  const naslednji = urejeni.find(o => o.status !== 'paid')
  const skupaj = urejeni.reduce((s, o) => s + o.amount, 0)
  const placano = placani.reduce((s, o) => s + o.amount, 0)
  return { placanih: placani.length, vseh: urejeni.length, skupaj, placano, preostane: skupaj - placano, naslednji }
}

const OBROKI = [
  { installment_number: 1, amount: 45, status: 'paid', due_date: '2026-08-21' },
  { installment_number: 2, amount: 45, status: 'pending', due_date: '2026-09-21' },
  { installment_number: 3, amount: 45, status: 'pending', due_date: '2026-10-21' },
  { installment_number: 4, amount: 45, status: 'pending', due_date: '2026-11-21' },
  { installment_number: 5, amount: 45, status: 'pending', due_date: '2026-12-21' },
  { installment_number: 6, amount: 45, status: 'pending', due_date: '2027-01-21' },
]

test('obroki: povzetek pokaže plačane, skupno in preostanek', () => {
  const p = povzetekObrokov(OBROKI)
  expect(p.placanih).toBe(1)
  expect(p.vseh).toBe(6)
  expect(p.skupaj).toBe(270)      // NE 45
  expect(p.placano).toBe(45)
  expect(p.preostane).toBe(225)
})

test('obroki: naslednji zapadli je prvi neplačan', () => {
  const p = povzetekObrokov(OBROKI)
  expect(p.naslednji?.installment_number).toBe(2)
  expect(p.naslednji?.due_date).toBe('2026-09-21')
})

test('obroki: ko so vsi plačani, naslednjega ni', () => {
  const vsi = OBROKI.map(o => ({ ...o, status: 'paid' }))
  const p = povzetekObrokov(vsi)
  expect(p.naslednji).toBeUndefined()
  expect(p.preostane).toBe(0)
})

// ─── Izbira prejemnikov e-pošte ─────────────────────────────────────────

function prejemniki(
  kandidati: Array<{ id: string; email: string | null }>,
  izkljuceni: Set<string>,
) {
  const zEposto = kandidati.filter(c => c.email)
  return izkljuceni.size > 0 ? zEposto.filter(c => !izkljuceni.has(c.id)) : zEposto
}

test('e-pošta: brez izbire veljajo vsi iz skupine', () => {
  const r = prejemniki([{ id: 'a', email: 'a@x.si' }, { id: 'b', email: 'b@x.si' }], new Set())
  expect(r).toHaveLength(2)
})

test('e-pošta: izključeni prejemnik odpade', () => {
  // Prej sta bili na voljo samo dve skupini — poslati dvema izbranima
  // strankama ni bilo mogoče.
  const r = prejemniki(
    [{ id: 'a', email: 'a@x.si' }, { id: 'b', email: 'b@x.si' }, { id: 'c', email: 'c@x.si' }],
    new Set(['b']),
  )
  expect(r.map(c => c.id)).toEqual(['a', 'c'])
})

test('e-pošta: stranka brez naslova ni prejemnik', () => {
  const r = prejemniki([{ id: 'a', email: null }, { id: 'b', email: 'b@x.si' }], new Set())
  expect(r.map(c => c.id)).toEqual(['b'])
})

// ─── UPN QR koda in IBAN ────────────────────────────────────────────────

/**
 * Brez IBAN-a koda nima prejemnikovega računa in banka plačila NE izvede.
 * Bolje je, da kode ni, kot da obljubi nekaj, česar ne more izpolniti.
 */
function nariseQr(iban: string | null | undefined): boolean {
  return !!(iban || '').replace(/\s/g, '')
}

test('QR: brez IBAN se koda ne izriše', () => {
  // NAPAKA (popravljeno 22.8.2026): koda se je izrisala s praznim poljem
  // prejemnikovega računa — videti je bila veljavna, banka pa je javila napako.
  expect(nariseQr('')).toBe(false)
  expect(nariseQr(null)).toBe(false)
  expect(nariseQr('   ')).toBe(false)
})

test('QR: z IBAN se koda izriše', () => {
  expect(nariseQr('SI56 6100 0002 8361 595')).toBe(true)
})

// ─── Rok plačila v e-pošti ──────────────────────────────────────────────

function rokBesedilo(dni: number): string {
  return dni < 0 ? `zapadlo pred ${Math.abs(dni)} ${Math.abs(dni) === 1 ? 'dnem' : 'dnevi'}`
    : dni === 0 ? 'danes'
    : dni === 1 ? 'jutri'
    : `čez ${dni} dni`
}

test('rok: "čez 0 dni" se bere kot napaka — mora biti "danes"', () => {
  expect(rokBesedilo(0)).toBe('danes')
  expect(rokBesedilo(1)).toBe('jutri')
  expect(rokBesedilo(5)).toBe('čez 5 dni')
  expect(rokBesedilo(-2)).toBe('zapadlo pred 2 dnevi')
  expect(rokBesedilo(-1)).toBe('zapadlo pred 1 dnem')
})

// ─── Beleženje poslane pošte ────────────────────────────────────────────

function zapisPosiljanja(napaka: string | null, resendId: string | null) {
  return {
    status: napaka ? 'failed' : 'sent',
    resend_email_id: resendId,
    error_message: napaka,
    sent_at: napaka ? null : 'zdaj',
  }
}

test('e-pošta: neuspeh se zabeleži, ne izgubi', () => {
  // Prej se je beležil samo `last_email_sent_at` — to pomeni "poskusili smo",
  // ne "prišlo je". Če je Resend pošto zavrnil, tega ni bilo mogoče ugotoviti
  // nikjer.
  const z = zapisPosiljanja('Domain not verified', null)
  expect(z.status).toBe('failed')
  expect(z.error_message).toBe('Domain not verified')
  expect(z.sent_at).toBeNull()
})

test('e-pošta: uspeh shrani Resend ID za sledenje', () => {
  const z = zapisPosiljanja(null, 're_abc123')
  expect(z.status).toBe('sent')
  expect(z.resend_email_id).toBe('re_abc123')
})

// ─── Obročni račun: datumi ──────────────────────────────────────────────

function datumiObroka(zapadlost: string, danes: Date) {
  const cez8 = new Date(danes)
  cez8.setDate(cez8.getDate() + 8)
  const p = (n: number) => String(n).padStart(2, '0')
  const privzeti = `${cez8.getFullYear()}-${p(cez8.getMonth() + 1)}-${p(cez8.getDate())}`
  return {
    service_date: zapadlost,                                    // C8
    due_date: zapadlost > privzeti ? zapadlost : privzeti,      // B6
  }
}

test('obrok: datum opravljene storitve je izpolnjen', () => {
  // C8 (22.8.2026): datum opravljene storitve je OBVEZNA sestavina računa po
  // ZDDV-1, na obročnem računu pa ga sploh ni bilo.
  const d = datumiObroka('2026-08-22', new Date(2026, 7, 22))
  expect(d.service_date).toBe('2026-08-22')
})

test('obrok: rok plačila ni enak datumu izdaje', () => {
  // B6: prej je bil rok = datum izdaje, zato je račun zapadel takoj in v
  // e-pošti je pisalo "čez 0 dni".
  const d = datumiObroka('2026-08-22', new Date(2026, 7, 22))
  expect(d.due_date).toBe('2026-08-30')   // +8 dni
  expect(d.due_date).not.toBe('2026-08-22')
})

test('obrok: kasnejša zapadlost se ohrani', () => {
  // Obrok, ki zapade čez mesec dni, ne sme dobiti krajšega roka.
  const d = datumiObroka('2026-09-22', new Date(2026, 7, 22))
  expect(d.due_date).toBe('2026-09-22')
})

// ─── QR koda v telesu e-pošte ───────────────────────────────────────────

function priloge(pdf: boolean, qrDataUrl: string | null) {
  const a: any[] = []
  if (pdf) a.push({ filename: 'racun.pdf' })
  if (qrDataUrl) a.push({ filename: 'upnqr.png', content_id: 'upnqr' })
  return a
}

test('e-pošta: QR gre kot VGRAJENA priloga, ne kot zunanja slika', () => {
  // C15 (22.8.2026): Gmail in Outlook zunanje slike privzeto blokirata —
  // brez `content_id` bi stranka videla prazen kvadrat.
  const a = priloge(true, 'data:image/png;base64,iVBOR')
  expect(a).toHaveLength(2)
  expect(a[1].content_id).toBe('upnqr')
})

test('e-pošta: brez QR ostane samo PDF', () => {
  const a = priloge(true, null)
  expect(a).toHaveLength(1)
  expect(a[0].filename).toBe('racun.pdf')
})
