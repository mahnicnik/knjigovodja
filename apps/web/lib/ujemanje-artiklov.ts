/**
 * UJEMANJE ARTIKLOV Z DOBAVNICE (20.8.2026)
 *
 * Zakaj obstaja: pri uvozu dobavnice se zaloga posodobi SAMO za artikle, ki
 * jih AI poveže z obstoječimi. Pri Niku ni bila povezana nobena od 17 vrstic —
 * dobavnica se je shranila, zaloga pa se ni premaknila.
 *
 * Vzrok: v blagajni so imena kratka ("Corona", "Radenska 0.25L"), na
 * dobavnici pa so nazivi dobavitelja ("PIVO CORONA EXTRA 0,33L ST"), črtnih
 * kod pa artikli nimajo. AI se pri tako različnih zapisih ne odloči.
 *
 * Tu so izračuni za predlaganje ujemanja — uporabnik nato potrdi ali popravi.
 */

/**
 * Normalizira naziv za primerjavo: male črke, brez ločil in enot pakiranja.
 * "PIVO CORONA EXTRA 0,33L ST" -> "pivo corona extra"
 */
export function normalizirajNaziv(naziv: string): string {
  return (naziv || '')
    .toLowerCase()
    // POPRAVLJENO (20.8.2026): locila so se odstranila PRED enotami, zato je
    // "0,33L" razpadlo na "0" in "33L" - vzorec za enote ni vec ujel nicesar
    // in v nazivu je ostala osamljena "0". Zdaj gredo enote prve.
    .replace(/\b\d+([.,]\d+)?\s*(l|dl|cl|ml|kg|g|kos|kom)\b/g, ' ')
    // odstotki (npr. "3,5%") in oblike embalaze
    .replace(/\b\d+([.,]\d+)?\s*%/g, ' ')
    .replace(/\b(pet|stv|st|plc|ploc|steklenica|konzerva|karton|zaboj)\b/g, ' ')
    // preostala locila in osamljene stevilke
    .replace(/[^a-zčšžćđ0-9\s]/g, ' ')
    .replace(/\b\d+([.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Izlušči količino embalaže: "0,33L" -> 0.33, "1,5L" -> 1.5 */
export function velikostPakiranja(naziv: string): number | null {
  const m = (naziv || '').toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(l|dl|cl|ml)\b/)
  if (!m) return null
  const st = parseFloat(m[1].replace(',', '.'))
  switch (m[2]) {
    case 'l': return st
    case 'dl': return st / 10
    case 'cl': return st / 100
    case 'ml': return st / 1000
    default: return null
  }
}

/**
 * Podobnost dveh nazivov med 0 in 1.
 *
 * Šteje deljene besede, daljše besede pa štejejo več — "corona" pove veliko
 * več kot "pivo". Če se velikosti pakiranja razlikujeta, se ocena zniža:
 * "Radenska 0,25L" in "Radenska 1,5L" nista isti artikel.
 */
export function podobnost(a: string, b: string): number {
  const na = normalizirajNaziv(a)
  const nb = normalizirajNaziv(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const besedeA = na.split(' ').filter(w => w.length >= 3)
  const besedeB = nb.split(' ').filter(w => w.length >= 3)
  if (besedeA.length === 0 || besedeB.length === 0) return 0

  let tocke = 0, mozne = 0
  for (const w of besedeA) {
    mozne += w.length
    if (besedeB.some(v => v === w || v.startsWith(w) || w.startsWith(v))) tocke += w.length
  }
  let ocena = mozne > 0 ? tocke / mozne : 0

  // Pakiranje: UJEMANJE je prednost, razlika je kazen (20.8.2026).
  // Prej je bila samo kazen za razliko - artikel BREZ prepoznane enote
  // (npr. "Radenska 0.5" brez "L") kazni ni dobil in se je izenacil s
  // pravim ujemanjem "Radenska 0.25L".
  const pa = velikostPakiranja(a)
  const pb = velikostPakiranja(b)
  if (pa !== null && pb !== null) {
    ocena *= Math.abs(pa - pb) <= 0.01 ? 1.25 : 0.45
  } else if (pa !== null || pb !== null) {
    // Eden ima velikost, drugi ne - ne moremo potrditi, rahlo znizamo.
    ocena *= 0.85
  }

  return Math.min(1, ocena)
}

export interface PredlogUjemanja {
  itemId: string | null
  naziv: string | null
  ocena: number
  zanesljivost: 'visoka' | 'srednja' | 'nizka'
}

/**
 * Predlaga najbolj podoben artikel za vrstico dobavnice.
 * Črtna koda je vedno močnejša od imena.
 */
export function predlagajUjemanje(
  vrstica: { naziv: string; ean?: string | null },
  artikli: Array<{ id: string; name: string; barcode?: string | null }>,
): PredlogUjemanja {
  // 1. Črtna koda — zanesljivo ujemanje.
  if (vrstica.ean) {
    const poEan = artikli.find(a => a.barcode && a.barcode === vrstica.ean)
    if (poEan) {
      return { itemId: poEan.id, naziv: poEan.name, ocena: 1, zanesljivost: 'visoka' }
    }
  }

  // 2. Podobnost naziva.
  let najboljsi: { id: string; name: string } | null = null
  let najvisja = 0
  for (const a of artikli) {
    const o = podobnost(vrstica.naziv, a.name)
    if (o > najvisja) { najvisja = o; najboljsi = a }
  }

  if (!najboljsi || najvisja < 0.3) {
    return { itemId: null, naziv: null, ocena: najvisja, zanesljivost: 'nizka' }
  }

  return {
    itemId: najboljsi.id,
    naziv: najboljsi.name,
    ocena: najvisja,
    // Pod 0,6 je ugibanje — uporabnik mora potrditi, sicer bi se zaloga
    // pripisala napačnemu artiklu, kar je huje kot da se ne pripiše nikamor.
    zanesljivost: najvisja >= 0.75 ? 'visoka' : najvisja >= 0.5 ? 'srednja' : 'nizka',
  }
}
