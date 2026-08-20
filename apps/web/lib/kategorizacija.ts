/**
 * SAMODEJNO RAZVRŠČANJE V KATEGORIJE (19.8.2026)
 *
 * Zakaj obstaja: ob uvozu bančnega izpiska so vse transakcije dobile
 * kategorijo "Drugo". Pri Niku je bilo tako razvrščenih 151 od 254 vnosov —
 * 27.316 € odhodkov in 13.071 € prihodkov brez prave kategorije. Zaradi tega
 * so bile razdelitve po kategorijah v statistiki, poročilih in letnem
 * pregledu v resnici prazne.
 *
 * Deluje v dveh korakih:
 *   1. UČENJE IZ ZGODOVINE — če je uporabnik podoben opis že kdaj razvrstil,
 *      uporabi isto kategorijo. To je močnejše od pravil, ker pozna njegove
 *      dobavitelje.
 *   2. PRAVILA — nabor znanih slovenskih ponudnikov in ključnih besed.
 *
 * Vedno vrne tudi zanesljivost, da vmesnik lahko označi ugibanja.
 */

export interface Napoved {
  kategorija: string
  zanesljivost: 'visoka' | 'srednja' | 'nizka'
  razlog: string
}

/** Pravila: ključna beseda (male črke) -> kategorija. */
const PRAVILA: Array<{ vzorci: string[]; kategorija: string; tip?: 'income' | 'expense' }> = [
  // Gorivo in prevoz
  { vzorci: ['petrol', 'omv', 'shell', 'mol ', 'bencin', 'gorivo', 'avtocest', 'dars', 'vignette'], kategorija: 'Transport' },
  { vzorci: ['lpp', 'arriva', 'slovenske železnice', 'taxi', 'uber', 'bolt'], kategorija: 'Transport' },

  // Komunikacije
  { vzorci: ['telekom', 'a1 ', 'a1,', 'telemach', 't-2', 't2 ', 'hot ', 'simobil', 'internet', 'mobitel'], kategorija: 'Komunikacije' },

  // Energija in režija
  { vzorci: ['elektro', 'ece,', 'petrol energ', 'energetika', 'plin', 'toplotna', 'komunala', 'vodovod', 'odpadki', 'snaga'], kategorija: 'Režijski stroški' },

  // Prehrana in trgovina
  { vzorci: ['mercator', 'spar', 'hofer', 'lidl', 'tuš', 'tus ', 'jager', 'e.leclerc', 'leclerc', 'metro'], kategorija: 'Prehrana' },
  { vzorci: ['gostilna', 'restavracija', 'pizzeria', 'picerija', 'kavarna', 'bar '], kategorija: 'Prehrana' },

  // Bančno
  { vzorci: ['provizij', 'stroški vodenja', 'nadomestilo za', 'bančn', 'banka stro'], kategorija: 'Bančne provizije' },

  // Davki in prispevki
  { vzorci: ['furs', 'finančna uprava', 'davčni urad', 'akontacij', 'dohodnin', 'ddv obračun'], kategorija: 'Davki' },
  { vzorci: ['zpiz', 'zzzs', 'prispevk', 'socialn'], kategorija: 'Prispevki' },

  // Programska oprema in storitve
  { vzorci: ['google', 'microsoft', 'apple', 'adobe', 'openai', 'anthropic', 'canva', 'figma',
             'vercel', 'supabase', 'github', 'aws', 'amazon web', 'dropbox', 'zoom', 'slack',
             'domena', 'gostovanje', 'hosting', 'neoserv'], kategorija: 'Programska oprema' },
  { vzorci: ['stripe', 'paypal', 'revolut'], kategorija: 'Bančne provizije' },

  // Marketing
  { vzorci: ['facebook', 'meta platforms', 'instagram', 'linkedin', 'tiktok', 'oglaš', 'marketing', 'reklam'], kategorija: 'Marketing' },

  // Zavarovanja in najem
  { vzorci: ['zavarovaln', 'triglav', 'sava re', 'generali', 'vzajemna', 'adriatic'], kategorija: 'Zavarovanja' },
  { vzorci: ['najemnin', 'najem prostor', 'zakupnin'], kategorija: 'Najemnina' },

  // Plače
  { vzorci: ['plača', 'placa ', 'osebni dohodek', 'regres', 'potni stroški', 'malica'], kategorija: 'Plače' },

  // Prihodki
  { vzorci: ['kartičn', 'bankart', 'nexi', 'visa', 'mastercard', 'pos promet'], kategorija: 'Kartično poslovanje', tip: 'income' },
]

/** Poišče kategorijo po pravilih. */
export function poPravilih(opis: string, tip: 'income' | 'expense'): Napoved | null {
  const besedilo = (opis || '').toLowerCase()
  if (!besedilo.trim()) return null

  for (const p of PRAVILA) {
    if (p.tip && p.tip !== tip) continue
    for (const v of p.vzorci) {
      if (besedilo.includes(v)) {
        return { kategorija: p.kategorija, zanesljivost: 'srednja', razlog: `prepoznano "${v.trim()}"` }
      }
    }
  }
  return null
}

/**
 * Normalizira opis za primerjavo z zgodovino: male črke, brez številk,
 * sklicev, datumov in ločil. "PETROL D.D. RAČUN 12345" in
 * "Petrol, Slovenska energetska družba, d.d." dobita podobno obliko.
 */
export function kljucOpisa(opis: string): string {
  return (opis || '')
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[.,;:\/\-_()]/g, ' ')
    .replace(/\b(d\.?o\.?o|d\.?d|s\.?p|racun|račun|placilo|plačilo|si\d*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ali sta opisa dovolj podobna, da gre za istega prejemnika?
 * Zadošča, da si delita prvo pomembno besedo (običajno ime podjetja).
 */
export function podobnaOpisa(a: string, b: string): boolean {
  const ka = kljucOpisa(a), kb = kljucOpisa(b)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const prvaA = ka.split(' ').find(w => w.length >= 4)
  const prvaB = kb.split(' ').find(w => w.length >= 4)
  return !!prvaA && prvaA === prvaB
}

/**
 * Glavna funkcija: najprej zgodovina uporabnika, nato pravila.
 *
 * `zgodovina` so pretekli KPO vnosi z opisom in kategorijo (brez "Drugo",
 * ker to ni odločitev uporabnika, ampak privzeta vrednost).
 */
export function napovejKategorijo(
  opis: string,
  tip: 'income' | 'expense',
  zgodovina: Array<{ description: string; category: string }>,
): Napoved {
  // 1. Uporabnikova pretekla odločitev je najmočnejši signal.
  for (const z of (zgodovina || [])) {
    if (!z.category || z.category === 'Drugo') continue
    if (podobnaOpisa(opis, z.description)) {
      return { kategorija: z.category, zanesljivost: 'visoka', razlog: 'tako ste razvrstili že prej' }
    }
  }

  // 2. Pravila.
  const p = poPravilih(opis, tip)
  if (p) return p

  // 3. Ne vemo.
  return { kategorija: 'Drugo', zanesljivost: 'nizka', razlog: 'ni prepoznano' }
}

/**
 * Rezervni opis, kadar razčlenjevalnik izpiska ne najde besedila.
 *
 * Pri Niku je bilo 127 vnosov zapisanih kot "Bančni odliv" brez imena
 * prejemnika — stolpec z opisom je bil pri njegovi banki drugje, kot
 * predvideva oblika. Tu iz vrstice poberemo najdaljše besedilno polje, kar
 * je skoraj vedno naziv prejemnika.
 */
export function opisIzVrstice(stolpci: string[]): string {
  const kandidati = (stolpci || [])
    .map(c => (c || '').trim())
    .filter(c => c.length >= 4)
    // izloči zneske, datume in same številke/sklice
    .filter(c => !/^[\d\s.,+-]+$/.test(c))
    .filter(c => !/^\d{2}[.\/]\d{2}[.\/]\d{4}$/.test(c))
    .filter(c => /[a-zžšččćđA-ZŽŠČĆĐ]{3}/.test(c))
  if (kandidati.length === 0) return ''
  return kandidati.sort((a, b) => b.length - a.length)[0]
}
