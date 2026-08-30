/**
 * DELOVANJE BREZ POVEZAVE — SHRAMBA NAROČIL (26.8.2026)
 * ═════════════════════════════════════════════════════
 *
 * ZAKAJ OBSTAJA
 * ─────────────
 * Ko pade internet, se blagajna ne more povezati s Supabase in racuna ni
 * mogoce niti ustvariti - osebje pri pultu obstane. To je najpogostejsi
 * ocitek pri vseh blagajnah te vrste.
 *
 * FURS to PREDVIDEVA: racun je mogoce izdati brez povezave in ga naknadno
 * prijaviti v DVEH DNEH, z oznako `SubsequentSubmit`. Racun mora takrat
 * namesto EOR nositi ZOI, ki ga izracunamo lokalno.
 *
 * KAJ HRANIMO IN KAJ NE
 * ─────────────────────
 * Samo PRODAJO in IZDAJO RACUNA. Koledar, stranke in zaloga zahtevajo
 * podatke, ki jih brez povezave ni mogoce preveriti - polovicna resitev bi
 * bila slabsa od nobene.
 *
 * ZAKAJ IndexedDB IN NE localStorage
 * ──────────────────────────────────
 * `localStorage` je omejen na priblizno 5 MB in pise SINHRONO - ob vsakem
 * zapisu zamrzne vmesnik. Pri blagajni, kjer se racuni izdajajo drug za
 * drugim, bi se to poznalo. IndexedDB je asinhron in bistveno vecji.
 *
 * KAJ SE ZGODI OB VRNITVI POVEZAVE
 * ────────────────────────────────
 * Naročila se posljejo po vrsti, od najstarejsega. Vsako, ki uspe, se
 * odstrani iz vrste. Tisto, ki spodleti, OSTANE - nikoli ne izgine tiho.
 */

const BAZA = 'racunko-blagajna'
const RAZLICICA = 1
const VRSTA = 'cakajoca-narocila'

export interface CakajocеNarocilo {
  /** Lokalna oznaka — do prave številke pride ob prijavi na FURS. */
  lokalniId: string
  businessId: string
  ustvarjeno: string
  /** Celotno naročilo, tako kot bi šlo v bazo. */
  narocilo: any
  postavke: any[]
  placilo: any
  /** ZOI, izračunan lokalno — račun ga mora nositi tudi brez povezave. */
  zoi: string | null
  /** Koliko poskusov pošiljanja je že bilo. */
  poskusov: number
  zadnjaNapaka: string | null
}

function odpri(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const zahtevek = indexedDB.open(BAZA, RAZLICICA)
    zahtevek.onupgradeneeded = () => {
      const db = zahtevek.result
      if (!db.objectStoreNames.contains(VRSTA)) {
        const shramba = db.createObjectStore(VRSTA, { keyPath: 'lokalniId' })
        shramba.createIndex('ustvarjeno', 'ustvarjeno')
        shramba.createIndex('businessId', 'businessId')
      }
    }
    zahtevek.onsuccess = () => res(zahtevek.result)
    zahtevek.onerror = () => rej(zahtevek.error)
  })
}

/** Ali brskalnik shrambo sploh podpira. */
export function shrambaNaVoljo(): boolean {
  return typeof indexedDB !== 'undefined'
}

/** Doda naročilo v vrsto čakajočih. */
export async function dodajVVrsto(n: Omit<CakajocеNarocilo, 'poskusov' | 'zadnjaNapaka'>): Promise<void> {
  const db = await odpri()
  return new Promise((res, rej) => {
    const t = db.transaction(VRSTA, 'readwrite')
    t.objectStore(VRSTA).put({ ...n, poskusov: 0, zadnjaNapaka: null })
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

/** Vsa čakajoča naročila, urejena od najstarejšega. */
export async function preberiVrsto(businessId?: string): Promise<CakajocеNarocilo[]> {
  const db = await odpri()
  return new Promise((res, rej) => {
    const t = db.transaction(VRSTA, 'readonly')
    const zahtevek = t.objectStore(VRSTA).getAll()
    zahtevek.onsuccess = () => {
      let v = (zahtevek.result || []) as CakajocеNarocilo[]
      if (businessId) v = v.filter(x => x.businessId === businessId)
      v.sort((a, b) => a.ustvarjeno.localeCompare(b.ustvarjeno))
      res(v)
    }
    zahtevek.onerror = () => rej(zahtevek.error)
  })
}

/** Koliko naročil čaka. */
export async function steviloCakajocih(businessId?: string): Promise<number> {
  try { return (await preberiVrsto(businessId)).length } catch { return 0 }
}

/** Odstrani naročilo iz vrste — kliče se ŠELE po potrjenem zapisu v bazo. */
export async function odstraniIzVrste(lokalniId: string): Promise<void> {
  const db = await odpri()
  return new Promise((res, rej) => {
    const t = db.transaction(VRSTA, 'readwrite')
    t.objectStore(VRSTA).delete(lokalniId)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

/**
 * Zabeleži neuspel poskus. Naročilo OSTANE v vrsti — tiho izginotje računa
 * bi bilo hujše od podvojenega poskusa.
 */
export async function zabeleziNapako(lokalniId: string, napaka: string): Promise<void> {
  const db = await odpri()
  const vsi = await preberiVrsto()
  const n = vsi.find(x => x.lokalniId === lokalniId)
  if (!n) return
  return new Promise((res, rej) => {
    const t = db.transaction(VRSTA, 'readwrite')
    t.objectStore(VRSTA).put({ ...n, poskusov: n.poskusov + 1, zadnjaNapaka: napaka.slice(0, 300) })
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

/**
 * Najstarejše čakajoče naročilo v urah.
 *
 * ZAKAJ TO ŠTEJEMO: gotovinski račun je treba prijaviti FURS v DVEH DNEH.
 * Če povezave ni dlje, mora uporabnik to vedeti in ukrepati — sicer bi
 * rok zamudil, ne da bi opazil.
 */
export async function najstarejseUr(businessId?: string): Promise<number | null> {
  const v = await preberiVrsto(businessId)
  if (v.length === 0) return null
  const najstarejse = new Date(v[0].ustvarjeno).getTime()
  return Math.floor((Date.now() - najstarejse) / 3_600_000)
}

/** Ali smo blizu zakonskega roka (48 ur). */
export function jeRokBlizu(ur: number | null): 'ni' | 'opozorilo' | 'nujno' {
  if (ur === null) return 'ni'
  if (ur >= 40) return 'nujno'      // manj kot 8 ur do roka
  if (ur >= 24) return 'opozorilo'
  return 'ni'
}
