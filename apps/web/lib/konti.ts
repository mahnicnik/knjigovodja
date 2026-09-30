/**
 * PRELET 339: kategorije stroskov s konti po SIR enotnem kontnem nacrtu.
 *
 * Racunko vodi KPO (enostavno knjigovodstvo), ki kontov ne potrebuje. Racunovodja
 * pa vsak strosek ob popisu razvrsti na konto (razred 4) in presodi davcno
 * priznanost. Zato ima vsaka kategorija privzeti konto, davcno priznani delez in
 * pravilo za DDV - AI pri skeniranju izbere kategorijo, konto sledi iz nje, v
 * izvozu za racunovodjo pa sta konto in opomba ze izpolnjena.
 *
 * Viri: SIR Priporoceni enotni kontni nacrt 2024; ZDDPO-2 30./31./33. clen;
 * ZDDV-1 66. clen. Kjer praksa servisov ni enotna, je konto izbran po nazivu SIR.
 */

export type DdvPravilo = 'da' | 'ne' | 'osebni_avto' | 'oprosceno' | 'brez'

export type KategorijaStroska = {
  ime: string
  konto: string
  nazivKonta: string
  delez: number          // davcno priznani delez v %
  ddv: DdvPravilo
  zaAi: string           // kaj sodi sem (navodilo za AI in namig v vmesniku)
}

export const KATEGORIJE_STROSKOV: KategorijaStroska[] = [
  { ime: 'Material za storitve', konto: '400', nazivKonta: 'Stroški materiala', delez: 100, ddv: 'da', zaAi: 'material, ki se porabi pri izvajanju dejavnosti (surovine, sestavine, gradbeni material, barve, material za frizerja/kozmetiko)' },
  { ime: 'Blago za prodajo', konto: '660', nazivKonta: 'Zaloga blaga (strošek ob prodaji, 702)', delez: 100, ddv: 'da', zaAi: 'blago, kupljeno za nadaljnjo prodajo nespremenjeno (pijača in hrana za lokal, trgovsko blago)' },
  { ime: 'Gorivo', konto: '402', nazivKonta: 'Stroški energije', delez: 100, ddv: 'osebni_avto', zaAi: 'bencin, dizel, polnjenje električnega avta' },
  { ime: 'Energija', konto: '402', nazivKonta: 'Stroški energije', delez: 100, ddv: 'da', zaAi: 'elektrika, plin, ogrevanje, toplota' },
  { ime: 'Komunala in voda', konto: '419', nazivKonta: 'Stroški drugih storitev', delez: 100, ddv: 'da', zaAi: 'voda, odvoz odpadkov, komunalne storitve, upravnik stavbe' },
  { ime: 'Pisarniški material', konto: '406', nazivKonta: 'Pisarniški material in strokovna literatura', delez: 100, ddv: 'da', zaAi: 'papir, tonerji, pisala, mape, strokovne knjige in revije' },
  { ime: 'Čistila in drug material', konto: '407', nazivKonta: 'Drugi stroški materiala', delez: 100, ddv: 'da', zaAi: 'čistila, higienski material, embalaža, drobni potrošni material' },
  { ime: 'Drobni inventar', konto: '404', nazivKonta: 'Odpis drobnega inventarja', delez: 100, ddv: 'da', zaAi: 'stvari, ki trajajo več kot leto, a stanejo do 500 € na kos (miška, tipkovnica, stol, orodje, cenejši telefon)' },
  { ime: 'Osnovno sredstvo', konto: '040', nazivKonta: 'Oprema (amortizacija 432)', delez: 100, ddv: 'da', zaAi: 'oprema nad 500 € na kos, ki traja več kot leto (računalnik, stroj, pohištvo, vozilo) - ni takojšen strošek, ampak amortizacija' },
  { ime: 'Komunikacije', konto: '411', nazivKonta: 'Stroški transportnih storitev (telefon, internet, pošta)', delez: 100, ddv: 'da', zaAi: 'mobilni in stacionarni telefon, internet, poštnina, kurirji, dostava' },
  { ime: 'Programska oprema', konto: '419', nazivKonta: 'Stroški drugih storitev', delez: 100, ddv: 'da', zaAi: 'naročnine na programe in spletne storitve (SaaS), gostovanje, domene, oblak' },
  { ime: 'Vzdrževanje in popravila', konto: '412', nazivKonta: 'Stroški storitev v zvezi z vzdrževanjem', delez: 100, ddv: 'da', zaAi: 'servis, popravila opreme, prostorov, vozila; rezervni deli' },
  { ime: 'Najemnina', konto: '413', nazivKonta: 'Najemnine', delez: 100, ddv: 'da', zaAi: 'najem poslovnega prostora, opreme, operativni leasing' },
  { ime: 'Potni stroški', konto: '414', nazivKonta: 'Povračila stroškov v zvezi z delom', delez: 100, ddv: 'da', zaAi: 'parkirnina, cestnina, vinjeta, javni prevoz, taksi, letalo, nočitev na službeni poti' },
  { ime: 'Zavarovanja', konto: '415', nazivKonta: 'Stroški bančnih storitev in zavarovalnih premij', delez: 100, ddv: 'oprosceno', zaAi: 'zavarovalne premije (odgovornost, premoženje, vozilo)' },
  { ime: 'Bančne provizije', konto: '415', nazivKonta: 'Stroški plačilnega prometa in bančnih storitev', delez: 100, ddv: 'oprosceno', zaAi: 'vodenje računa, provizije bank, kartic, Stripe, PayPal' },
  { ime: 'Računovodstvo in svetovanje', konto: '416', nazivKonta: 'Stroški intelektualnih in osebnih storitev', delez: 100, ddv: 'da', zaAi: 'računovodstvo, odvetnik, notar, davčno in poslovno svetovanje' },
  { ime: 'Izobraževanje', konto: '416', nazivKonta: 'Stroški intelektualnih in osebnih storitev', delez: 100, ddv: 'da', zaAi: 'tečaji, seminarji, konference, šolnine za delo' },
  { ime: 'Marketing', konto: '417', nazivKonta: 'Stroški sejmov, reklame in reprezentance', delez: 100, ddv: 'da', zaAi: 'oglaševanje (Meta, Google Ads), tisk, sponzorstvo, sejmi, promocijski material' },
  { ime: 'Reprezentanca', konto: '417', nazivKonta: 'Stroški sejmov, reklame in reprezentance', delez: 50, ddv: 'ne', zaAi: 'poslovna kosila in večerje, pogostitve poslovnih partnerjev, poslovna darila' },
  { ime: 'Podjemno in študentsko delo', konto: '418', nazivKonta: 'Stroški storitev fizičnih oseb', delez: 100, ddv: 'brez', zaAi: 'študentski servis, podjemna ali avtorska pogodba' },
  { ime: 'Članarine', konto: '419', nazivKonta: 'Stroški drugih storitev', delez: 100, ddv: 'da', zaAi: 'članarina zbornici, združenju, strokovnemu društvu' },
  { ime: 'Takse in dajatve', konto: '489', nazivKonta: 'Drugi stroški (NUSZ 480)', delez: 100, ddv: 'brez', zaAi: 'upravne in sodne takse, NUSZ, turistična taksa, pristojbine' },
  { ime: 'Storitve', konto: '419', nazivKonta: 'Stroški drugih storitev', delez: 100, ddv: 'da', zaAi: 'druge storitve zunanjih izvajalcev, ki ne sodijo drugam (podizvajalci, prevodi, grafično oblikovanje)' },
  { ime: 'Kazni', konto: '752', nazivKonta: 'Drugi odhodki - kazni', delez: 0, ddv: 'brez', zaAi: 'globe, kazni, zamudne obresti državi' },
  { ime: 'Drugo', konto: '489', nazivKonta: 'Drugi stroški', delez: 100, ddv: 'da', zaAi: 'samo, če res ne sodi nikamor drugam' },
]

/** Kategorije, ki jih Racunko knjizi sam (place, prispevki ...) ali so iz starejsih verzij. */
const DRUGE_KATEGORIJE: Record<string, { konto: string; delez?: number }> = {
  'plače': { konto: '470' },           // bruto + prispevki delodajalca (471/472) + povracila (473)
  'regres': { konto: '474' },
  'prispevki': { konto: '484' },       // prispevki s.p. za lastno socialno varnost
  'amortizacija': { konto: '432' },
  'kilometrina': { konto: '414' },
  'potni stroški s.p.': { konto: '486' },
  'davki': { konto: '' },              // placilo DDV / akontacije ni strosek
  // starejse kategorije (pred preletom 339)
  'transport': { konto: '402' },
  'prehrana': { konto: '417', delez: 50 },
  'oprema': { konto: '404' },
  'režijski stroški': { konto: '402' },
}

const brezSumnikov = (s: string) => String(s || '').toLowerCase()
  .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'd').trim()

const PO_IMENU = new Map(KATEGORIJE_STROSKOV.map(k => [brezSumnikov(k.ime), k]))

/** Imena kategorij za izbirne sezname. */
export const IMENA_KATEGORIJ = KATEGORIJE_STROSKOV.map(k => k.ime)

/** Izbira v vmesniku: vse kategorije + trenutna vrednost, ce je starejsa. */
export function izbireKategorij(trenutna?: string | null): string[] {
  const t = String(trenutna || '').trim()
  return t && !IMENA_KATEGORIJ.includes(t) ? [...IMENA_KATEGORIJ, t] : IMENA_KATEGORIJ
}

/** Poisce kategorijo iz nasega seznama (tudi zapisano brez sumnikov). */
export function najdiKategorijo(ime?: string | null): KategorijaStroska | null {
  const kljuc = brezSumnikov(String(ime || ''))
  const tocno = PO_IMENU.get(kljuc)
  if (tocno) return tocno
  // PRELET 353: AI vcasih vrne ime skupaj s kontom iz navodila, npr.
  // "Drobni inventar (konto 404)" ali "Blago za prodajo - konto 660".
  // Tak zapis je prej padel na 489 (Drugi stroski).
  const ocisceno = kljuc
    .replace(/\(.*?\)/g, ' ')
    .replace(/[-–:,]?\s*konto\s*\d+.*$/, ' ')
    .replace(/\s+/g, ' ').trim()
  return PO_IMENU.get(ocisceno) || null
}

/** Pretvori AI-jev ali star zapis v ime iz seznama (ce ga prepozna). */
export function normalizirajKategorijo(ime?: string | null): string {
  const k = najdiKategorijo(ime)
  return k ? k.ime : (String(ime || '').trim() || 'Drugo')
}

/** Konto in davcno priznani delez za poljubno kategorijo (tudi Place, Prispevki ...). */
export function kontoZa(kategorija?: string | null): { konto: string; delez: number } {
  const k = najdiKategorijo(kategorija)
  if (k) return { konto: k.konto, delez: k.delez }
  const d = DRUGE_KATEGORIJE[String(kategorija || '').toLowerCase().trim()]
    || DRUGE_KATEGORIJE[brezSumnikov(String(kategorija || ''))]
  if (d) return { konto: d.konto, delez: d.delez ?? 100 }
  return { konto: '489', delez: 100 }
}

/** Del navodila za AI: seznam kategorij z opisi in pravila razvrscanja. */
export function navodiloRazvrscanja(kontekst?: string | null): string {
  const seznam = KATEGORIJE_STROSKOV.map(k => `  * ${k.ime} (konto ${k.konto}): ${k.zaAi}`).join('\n')
  return `- category: TOCNO eno ime s tega seznama (kot ga razvrsti slovenski racunovodja):
${seznam}
  Pravila: gostinski racun (restavracija, kavarna, catering) je Reprezentanca, razen ce podjetje samo opravlja gostinsko dejavnost in gre za nabavo blaga. Trgovina z zivili (Mercator, Spar, Hofer, Lidl) je Blago za prodajo ali Material za storitve, ce to ustreza dejavnosti, sicer Drugo z opombo. Stvar, ki traja vec kot leto: do 500 EUR na kos Drobni inventar, nad 500 EUR na kos Osnovno sredstvo. Gorivo in parkirnina nista Transport, ampak Gorivo oziroma Potni stroski.
- category_reason: zelo kratko (do 8 besed), zakaj ta kategorija
- accountant_note: kratka opomba za racunovodjo ali null. Napisi jo, ko: je lahko zasebni strosek; je nakup nad 500 EUR (morda osnovno sredstvo); gre za osebni avto (DDV ni odbiten); je racun iz tujine (obrnjena davcna obveznost); je reprezentanca (50 % davcno priznano); je predplacilo ali naročnina za vec mesecev.${kontekst ? `\nPodjetje, za katerega razvrscas: ${kontekst}` : ''}`
}

/**
 * Po branju AI: ime kategorije iz seznama, uporabnikova pretekla odlocitev za
 * istega dobavitelja ima prednost, dodan konto in dodatne opombe.
 */
export function dopolniRazvrstitev(d: any, prej?: { category: string; vendor?: string } | null): any {
  if (!d || typeof d !== 'object') return d
  const izAi = normalizirajKategorijo(d.category)
  let category = izAi
  let razlog = d.category_reason || null
  // Le kategorije iz novega seznama (starejse, npr. "Prehrana", niso dovolj natancne).
  const prejK = najdiKategorijo(prej?.category)
  if (prejK && prejK.ime !== 'Drugo') {
    category = prejK.ime
    if (category !== izAi) razlog = 'tako ste tega dobavitelja razvrstili prej'
  }
  const { konto, delez } = kontoZa(category)
  const opombe: string[] = []
  if (d.accountant_note && String(d.accountant_note).toLowerCase() !== 'null') opombe.push(String(d.accountant_note))
  const neto = Number(d.amount_net ?? d.amount_total ?? 0)
  if (category === 'Drobni inventar' && neto > 500 && !opombe.some(o => /500/.test(o))) {
    opombe.push('Znesek nad 500 € — če je posamezen kos dražji od 500 €, gre med osnovna sredstva (amortizacija).')
  }
  if (category === 'Osnovno sredstvo') opombe.push('Vpišite v register osnovnih sredstev (Amortizacija) — v knjigo gre letna amortizacija.')
  return {
    ...d,
    category,
    category_reason: razlog,
    konto,
    davcni_delez: delez,
    accountant_note: opombe.length ? Array.from(new Set(opombe)).join(' ') : null,
  }
}

/**
 * Zadnja kategorija, ki jo je uporabnik potrdil za istega dobavitelja
 * (po davcni stevilki, sicer po imenu). To je "ucenje" - ko uporabnik enkrat
 * popravi kategorijo, jo naslednjic AI-jev predlog prevzame.
 */
export async function prejsnjaRazvrstitev(
  supabase: any, orgId: string, d: { vendor?: string; vendor_tax_number?: string },
): Promise<{ category: string; vendor?: string } | null> {
  try {
    const davcna = String(d?.vendor_tax_number || '').replace(/\D/g, '')
    if (davcna.length >= 8) {
      const { data } = await supabase.from('receipts').select('category, vendor')
        .eq('org_id', orgId).eq('status', 'confirmed').ilike('vendor_tax_num', `%${davcna.slice(-8)}%`)
        .neq('category', 'Drugo').order('created_at', { ascending: false }).limit(1)
      if (data?.[0]?.category) return data[0]
    }
    const beseda = brezSumnikov(String(d?.vendor || '')).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).find(w => w.length >= 4)
    if (beseda) {
      const { data } = await supabase.from('receipts').select('category, vendor')
        .eq('org_id', orgId).eq('status', 'confirmed').ilike('vendor', `%${beseda}%`)
        .neq('category', 'Drugo').order('created_at', { ascending: false }).limit(1)
      if (data?.[0]?.category) return data[0]
    }
  } catch { /* ni kljucno */ }
  return null
}

/** Kratek opis podjetja za AI (dejavnost vpliva na razvrstitev, npr. lokal vs. IT). */
export function kontekstPodjetja(org: any): string | null {
  if (!org) return null
  const deli: string[] = []
  if (org.name) deli.push(String(org.name))
  if (org.pos_profile) deli.push(`dejavnost/profil blagajne: ${org.pos_profile}`)
  deli.push(org.vat_registered ? 'zavezanec za DDV' : 'ni zavezanec za DDV')
  return deli.join('; ')
}
