'use client'
/**
 * Klici poti /api/pos/stripe/* iz brskalnika (prelet 357). Pošlje izbrano
 * aktivno organizacijo (glava x-active-org), strežnik jo preveri s članstvom.
 */
import { getStoredOrgId } from '@/lib/active-org'

export async function klicStripe<T = any>(pot: string, telo?: any, metoda?: string): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const glave: Record<string, string> = { 'Content-Type': 'application/json' }
  const org = getStoredOrgId()
  if (org) glave['x-active-org'] = org
  const res = await fetch(pot, {
    method: metoda || (telo === undefined ? 'GET' : 'POST'),
    headers: glave,
    cache: 'no-store',
    ...(telo !== undefined ? { body: JSON.stringify(telo) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export type StripePogoji = {
  kmalu?: boolean
  nastavljeno: boolean
  stripePovezan: boolean
  stripeAktiven: boolean
  fursOk: boolean
  fursRazlog: string | null
  fursOkPortal?: boolean
  fursRazlogPortal?: string | null
  demo: boolean
  paketPos: boolean
  paketPortal: boolean
}

/**
 * PRELET 373: vracilo prek Stripe. Ce streznik zahteva potrditev (uporabnik
 * seje ni lastnik/admin), vprasa za PIN osebja s pravico "Storno racuna" in
 * poskusi znova - streznik PIN preveri enako kot prijavo v blagajno.
 */
export async function vrniPrekStripe(telo: { order_id?: string; id?: string }) {
  let r = await klicStripe<any>('/api/pos/stripe/vracilo', telo)
  if (!r.ok && r.data?.potrebenPin) {
    const pin = typeof window !== 'undefined' ? window.prompt('Vračilo potrdi oseba s pravico »Storno računa«.\n\nVpišite PIN:') : null
    if (!pin) return r
    r = await klicStripe<any>('/api/pos/stripe/vracilo', { ...telo, pin: pin.trim() })
  }
  return r
}
