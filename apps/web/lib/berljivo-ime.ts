/**
 * BERLJIV ZAPIS URADNIH IMEN (FURS register, oktober 2026)
 *
 * Cista funkcija brez odvisnosti – uporabljata jo streznik (/api/company-lookup)
 * in odjemalec (components/nastavitve/UradnoIme.tsx).
 */

// FURS ima imena z VELIKIMI crkami ("HFP, IZOBRAŽEVANJE NA PODROČJU ŠPORTA,
// DOMEN KOCJAN S.P."). Za preverjanje imena (banke, VoP) velike crke niso
// pomembne (soUradnoIme jih ne loci), na racunu pa so grde. Zato ponudimo
// berljiv zapis: besede, ki jih uporabnik ze ima v svojem imenu, ohranijo
// njegov zapis; pravne oblike so male (s.p., d.o.o.); kratice brez samoglasnikov
// (HFP) ostanejo velike; pri s.p. ima ime in priimek podjetnika veliki
// zacetnici; ostalo je z malimi, prva crka imena velika.

const PRAVNE_OBLIKE: Record<string, string> = {
  'S.P.': 's.p.', 'D.O.O.': 'd.o.o.', 'D.D.': 'd.d.', 'D.N.O.': 'd.n.o.', 'K.D.': 'k.d.',
  'Z.O.O.': 'z.o.o.', 'SO.P.': 'so.p.', 'K.D.D.': 'k.d.d.', 'GMBH': 'GmbH',
}
const SAMOGLASNIKI = /[AEIOUÁÉÍÓÚÄÖÜ]/

function velikaZacetnica(beseda: string) {
  return beseda.charAt(0).toLocaleUpperCase('sl') + beseda.slice(1).toLocaleLowerCase('sl')
}

/**
 * Berljiv zapis uradnega imena. `trenutno` (npr. ime iz Nastavitev ali
 * stranke) doloci zapis besed, ki jih ze vsebuje.
 */
export function berljivoIme(uradno: string, trenutno = ''): string {
  const znane = new Map<string, string>()
  for (const b of String(trenutno).split(/[\s,]+/)) if (b) znane.set(b.toLocaleUpperCase('sl'), b)
  const osebno = osebnoIme(uradno)
  let prva = true
  return uradno.replace(/[^\s,]+/g, (beseda, mesto: number) => {
    const U = beseda.toLocaleUpperCase('sl')
    let out: string
    if (znane.has(U)) out = znane.get(U)!
    else if (PRAVNE_OBLIKE[U]) out = PRAVNE_OBLIKE[U]
    else if (beseda.length <= 4 && /^[A-ZČŠŽĆĐ]+$/.test(beseda) && !SAMOGLASNIKI.test(beseda)) out = beseda
    else if (prva || (osebno && mesto >= osebno[0] && mesto < osebno[1])) out = velikaZacetnica(beseda)
    else out = beseda.toLocaleLowerCase('sl')
    prva = false
    return out
  })
}

/**
 * Pri s.p. je ime in priimek podjetnika zadnji del pred "S.P." ("…, DOMEN
 * KOCJAN S.P.", "…, CVETKO KRIŽAN, S.P."). Vrne [zacetek, konec) tega dela.
 */
function osebnoIme(ime: string): [number, number] | null {
  const m = ime.match(/(?:^|,)\s*([^,]+?)\s*,?\s*S\.P\.\s*$/i)
  if (!m || m.index === undefined) return null
  const zacetek = ime.indexOf(m[1], m.index)
  return [zacetek, zacetek + m[1].length]
}

const MALE_V_NASLOVU = new Set(['ULICA', 'CESTA', 'TRG', 'POT', 'NABREŽJE', 'NASELJE', 'BREG', 'ULICE', 'CESTE', 'TRGA', 'OB', 'NA', 'V', 'PRI', 'POD', 'NAD', 'ZA', 'IN', 'DO', 'OD', 'S', 'Z'])

const MALE_V_KRAJU = new Set(['MESTO', 'VAS', 'TRG', 'SELO', 'PRI', 'NA', 'OB', 'V', 'POD', 'NAD', 'OD', 'DO'])

/**
 * Naslov: "KRAIGHERJEVA ULICA 5" -> "Kraigherjeva ulica 5".
 * Kraj (kraj=true): "NOVO MESTO" -> "Novo mesto", "NOVA GORICA" -> "Nova Gorica",
 * "ŠENTJUR PRI CELJU" -> "Šentjur pri Celju". Ni popolno (lastna imena), a berljivo.
 */
export function berljivNaslov(s: string | null, kraj = false): string | null {
  if (!s) return s
  let prva = true
  return s.replace(/[^\s,\-/]+/g, (beseda) => {
    const U = beseda.toLocaleUpperCase('sl')
    const out = /\d/.test(beseda) ? beseda
      : (!prva && !kraj && MALE_V_NASLOVU.has(U)) || (!prva && kraj && MALE_V_KRAJU.has(U)) ? beseda.toLocaleLowerCase('sl')
      : velikaZacetnica(beseda)
    prva = false
    return out
  })
}

