/**
 * PRODAJA BREZ POVEZAVE — ORKESTRACIJA (prelet 158)
 * ═══════════════════════════════════════════════════
 *
 * KAJ ZAHTEVA ZAKON (preverjeno 30.8.2026 pri viru — ZDavPR in FURS FAQ):
 *
 *  · 9. člen ZDavPR: ob prekinjeni povezavi se račun izda BREZ EOR, podatke
 *    pa je treba FURS poslati "v dveh DELOVNIH dneh od dneva prekinitve".
 *    Ne v 48 urah — petek zvečer pomeni rok v torek.
 *  · Račun brez povezave MORA nositi ZOI. ZOI se podpiše z namenskim
 *    digitalnim potrdilom, zato mora biti potrdilo FIZIČNO NA NAPRAVI:
 *    FURS v pogostih vprašanjih izrecno pravi, da se ob potrdilu "v oblaku"
 *    izpad interneta šteje za NEDELOVANJE naprave in je edina zakonita pot
 *    vezana knjiga računov. Prenos potrdila na napravo ni udobje, je pogoj.
 *  · Številka računa mora slediti neprekinjenemu zaporedju. Brez povezave
 *    lahko naprava varno številči SAMO takrat, ko zaporedje pripada NJEJ —
 *    torej pri načinu številčenja "device" (po elektronski napravi, prelet
 *    157). Pri centralnem številčenju bi dve napravi brez povezave podelili
 *    isto številko, česar se naknadno NE DA popraviti.
 *
 * KAKO TO IZVEDEMO:
 *
 *  · KONTEKST: podatki, ki jih račun potrebuje, a jih brez povezave ni od
 *    kod vzeti (davčna, oznaki PE/naprave, način številčenja, glava računa),
 *    se ob vsakem zagonu blagajne S povezavo shranijo v localStorage.
 *  · ŠTEVEC: zadnja podeljena številka se zabeleži ob VSAKI uspešni spletni
 *    prodaji. Brez povezave je naslednja številka = zadnja + 1. Brez tega
 *    semena si številke NE izmišljamo — raje jasna napaka kot vrzel.
 *  · ZOI: izračuna ga namizna aplikacija (Electron IPC 'furs-zoi') z
 *    ISTIM algoritmom kot strežnik (apps/web/lib/furs.ts calculateZoi).
 *  · SINHRONIZACIJA: ob vrnitvi povezave se vsak čakajoč račun prijavi
 *    FURS-u z natisnjenim ZOI, natisnjeno številko in DEJANSKIM časom
 *    izdaje ter oznako SubsequentSubmit (naknadna prijava).
 */

import { createClient } from '@/lib/supabase'
import { getActiveMembership } from '@/lib/active-org'
import { preberiVrsto, odstraniIzVrste, zabeleziNapako } from './offline-vrsta'
import { pos } from './pos-client'

const KLJUC_KONTEKST = 'racunko-offline-kontekst'
const PREDPONA_STEVCA = 'racunko-offline-stevec'

export interface OfflineKontekst {
  businessId: string
  orgId: string
  taxNumber: string
  numberingMode: string
  premiseUuid: string
  premiseCode: string
  premiseAddress: string
  deviceUuid: string | null
  deviceCode: string
  orgName: string
  orgAddress: string
  orgPostCode: string
  orgCity: string
  vatRegistered: boolean
  posodobljeno: string
}

/** Ali blagajna teče v namizni aplikaciji (Electron). */
export function jeElektron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI
}

export function preberiKontekst(): OfflineKontekst | null {
  try { return JSON.parse(localStorage.getItem(KLJUC_KONTEKST) || 'null') } catch { return null }
}

export function shraniKontekst(k: OfflineKontekst): void {
  try { localStorage.setItem(KLJUC_KONTEKST, JSON.stringify(k)) } catch {}
}

// ── LOKALNI ŠTEVEC ŠTEVILK ──────────────────────────────────────────
// Zadnja PORABLJENA številka za (poslovni prostor, naprava, leto) — ista
// zrnatost kot pos_invoice_counters_scoped v bazi pri načinu "device".

function kljucStevca(premiseCode: string, deviceCode: string, leto: number): string {
  return `${PREDPONA_STEVCA}:${premiseCode}:${deviceCode}:${leto}`
}

export function zabeleziZadnjoStevilko(premiseCode: string, deviceCode: string, leto: number, stevilka: number): void {
  try {
    const k = kljucStevca(premiseCode, deviceCode, leto)
    const prej = Number(localStorage.getItem(k) || 0)
    if (stevilka > prej) localStorage.setItem(k, String(stevilka))
  } catch {}
}

/**
 * Seme števca iz polne številke ("PE1-BLAG2-417" → PE1/BLAG2/417).
 * Oznaki poslovnega prostora in naprave po FURS specifikaciji ne vsebujeta
 * vezaja, zato je delitev po vezajih nedvoumna.
 */
export function zabeleziIzPolneStevilke(polna: string): void {
  const deli = String(polna || '').split('-')
  if (deli.length !== 3) return
  const n = parseInt(deli[2], 10)
  if (!Number.isInteger(n) || n <= 0) return
  zabeleziZadnjoStevilko(deli[0], deli[1], new Date().getFullYear(), n)
}

/**
 * Naslednja številka za račun brez povezave — ali null, če seme ne obstaja.
 * Številka se ob klicu takoj PORABI (števec napreduje), da dve hitri prodaji
 * ne dobita iste.
 */
export function naslednjaLokalnaStevilka(premiseCode: string, deviceCode: string, leto: number): number | null {
  try {
    const k = kljucStevca(premiseCode, deviceCode, leto)
    const prej = Number(localStorage.getItem(k) || 0)
    if (!prej || !Number.isInteger(prej)) return null
    const nova = prej + 1
    localStorage.setItem(k, String(nova))
    return nova
  } catch { return null }
}

// ── ZAZNAVA POVEZAVE ────────────────────────────────────────────────

/**
 * `navigator.onLine === false` zanesljivo pomeni "ni omrežja". Obratno NE
 * velja: router lahko deluje, internet za njim pa ne. Zato ob dvomu
 * povprašamo lasten strežnik — HEAD na manifest.json je poceni in ga ne
 * streže noben tuj CDN.
 */
export async function zaznanaPovezava(timeoutMs = 2500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch('/manifest.json?ping=' + Date.now(), {
      method: 'HEAD', cache: 'no-store', signal: ctrl.signal,
    })
    clearTimeout(t)
    return res.ok
  } catch { return false }
}

// ── OSVEŽITEV KONTEKSTA (samo s povezavo) ───────────────────────────

/**
 * Prebere aktivni poslovni prostor in napravo iz ISTIH localStorage ključev
 * kot blagajna (racunko_active_premise / racunko_active_device); če izbire
 * ni, vzame prvi aktivni zapis iz baze.
 */
export async function osveziOfflineKontekst(businessId: string): Promise<void> {
  try {
    const sb = createClient()
    const m = await getActiveMembership()
    if (!m?.org_id) return

    const { data: o } = await sb.from('organizations')
      .select('id, name, address, post_code, city, tax_number, vat_registered, numbering_mode')
      .eq('id', m.org_id).single()
    if (!o?.tax_number) return

    let aktivnaPe: any = null
    let aktivnaNaprava: any = null
    try { aktivnaPe = JSON.parse(localStorage.getItem('racunko_active_premise') || 'null') } catch {}
    try { aktivnaNaprava = JSON.parse(localStorage.getItem('racunko_active_device') || 'null') } catch {}

    let pq = sb.from('business_premises').select('*').eq('org_id', m.org_id).eq('is_active', true)
    if (aktivnaPe?.id) pq = pq.eq('id', aktivnaPe.id)
    const { data: p } = await pq.limit(1).maybeSingle()
    if (!p) return

    let dq = sb.from('electronic_devices').select('*').eq('premise_id', p.id).eq('is_active', true)
    if (aktivnaNaprava?.id) dq = dq.eq('id', aktivnaNaprava.id)
    const { data: d } = await dq.limit(1).maybeSingle()

    shraniKontekst({
      businessId,
      orgId: o.id,
      taxNumber: String(o.tax_number),
      numberingMode: o.numbering_mode || 'central',
      premiseUuid: p.id,
      premiseCode: p.premise_id,
      premiseAddress: [p.address, [p.post_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      deviceUuid: d?.id ?? null,
      deviceCode: d?.device_id ?? 'RACUNKO01',
      orgName: o.name || '',
      orgAddress: o.address || '',
      orgPostCode: o.post_code || '',
      orgCity: o.city || '',
      vatRegistered: !!o.vat_registered,
      posodobljeno: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('Offline kontekst ni bil osvežen:', e)
  }
}

// ── POTRDILO NA NAPRAVI ─────────────────────────────────────────────

/**
 * Namizni aplikaciji preda namensko digitalno potrdilo, če ga še nima.
 * Strežnik ga izda SAMO lastniku (/api/furs/cert-for-device) — lastnik se
 * mora torej na vsaki blagajniški napravi enkrat prijaviti. Za blagajnike
 * klic tiho odgovori 403 in naprava ostane brez potrdila.
 */
export async function zagotoviPotrdiloNaNapravi(): Promise<void> {
  if (!jeElektron()) return
  const api = (window as any).electronAPI
  if (!api.fursPotrdiloStanje || !api.fursShraniPotrdilo) return // stara verzija namizne aplikacije

  try {
    const ctx = preberiKontekst()
    const stanje = await api.fursPotrdiloStanje()
    if (stanje?.nalozeno && (!ctx?.taxNumber || stanje?.taxNumber === ctx.taxNumber)) return

    const res = await fetch('/api/furs/cert-for-device')
    if (!res.ok) return // 403 za blagajnike je pričakovan in tih
    const { p12, password, taxNumber } = await res.json()
    if (!p12) return

    const r = await api.fursShraniPotrdilo({ p12Base64: p12, geslo: password ?? '', taxNumber: taxNumber ?? ctx?.taxNumber ?? '' })
    if (r?.ok) console.info('FURS potrdilo preneseno na napravo (šifrirano: ' + (r.sifrirano ? 'da' : 'ne') + ')')
  } catch (e) {
    console.warn('Prenos FURS potrdila na napravo ni uspel:', e)
  }
}

// ── SINHRONIZACIJA VRSTE ────────────────────────────────────────────

/**
 * Vsak čakajoč račun po vrsti (od najstarejšega): ustvari naročilo, FURS-u
 * prijavi NATANKO tisto, kar je kupec dobil na papir (ZOI, številka, čas —
 * SubsequentSubmit), nato zabeleži plačilo. Kar spodleti, OSTANE v vrsti z
 * zabeleženo napako — nikoli ne izgine tiho.
 *
 * ZNANA OMEJITEV: časi naročila v bazi (created/closed) so čas
 * sinhronizacije, ne čas prodaje. FURS dobi pravi čas izdaje; interna
 * poročila za tisti dan pa prodajo prikažejo na dan sinhronizacije.
 */
export async function sinhronizirajVrsto(businessId?: string): Promise<{ poslanih: number; napak: number }> {
  let poslanih = 0
  let napak = 0
  if (!(await zaznanaPovezava())) return { poslanih, napak }

  const vrsta = await preberiVrsto(businessId)
  for (const n of vrsta) {
    try {
      const nar = n.narocilo || {}
      const orderId = await pos.orders.openOrder({
        tableId: nar.tableId ?? undefined,
        customerId: nar.customerId ?? undefined,
        cashierId: nar.cashierId ?? null,
      })
      await pos.orders.replaceLines(orderId, n.postavke || [])

      const sb = createClient()
      const upd: any = {}
      if (Number(nar.tip) > 0) upd.tip_amount = Number(nar.tip)
      if (Number(nar.discount) > 0) upd.discount_amount = Number(nar.discount)
      if (Array.isArray(nar.klavzule) && nar.klavzule.length > 0) upd.vat_exemption_text = nar.klavzule.join('\n')
      if (Object.keys(upd).length > 0) {
        await sb.from('orders').update(upd).eq('id', orderId)
      }

      let eor: string | null = null
      let zoi: string | null = n.zoi
      if (nar.furs) {
        const res = await fetch('/api/furs/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            total: nar.total,
            premise_id: nar.premiseUuid || null,
            offline: {
              zoi: n.zoi,
              issued_at: nar.issuedAt,
              sequence_number: nar.seq,
              invoice_number_full: nar.stevilkaFull,
              leto: nar.leto,
            },
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.eor) {
          throw new Error(data.error || 'FURS ni potrdil naknadno poslanega računa.')
        }
        eor = data.eor
        if (data.zoi) zoi = data.zoi
      }

      await pos.orders.pay({
        orderId,
        method: n.placilo?.method,
        amount: Number(n.placilo?.amount ?? nar.total ?? 0),
        received: n.placilo?.received ?? null,
        furs: !!nar.furs,
        cashierId: nar.cashierId ?? null,
        fursZoi: zoi ?? undefined,
        fursEor: eor ?? undefined,
      })

      await odstraniIzVrste(n.lokalniId)
      poslanih++
    } catch (e: any) {
      await zabeleziNapako(n.lokalniId, e?.message || String(e))
      napak++
    }
  }
  return { poslanih, napak }
}
