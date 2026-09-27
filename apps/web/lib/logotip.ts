/**
 * PRELET 330: logotip organizacije - skupno za PDF racun in e-posto z racunom.
 *
 * Uporabi se SAMO slika iz nasega vedra 'logotipi' (nalozena prek
 * /api/nastavitve/logotip). organizations.logo_url, vpisan mimo streznika,
 * bi sicer streznik prisilil v prenos poljubnega URL.
 */
export function logotipUrl(org: any): string | null {
  const url = typeof org?.logo_url === 'string' ? org.logo_url : ''
  const baza = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  if (!url || !baza) return null
  return url.startsWith(`${baza}/storage/v1/object/public/logotipi/`) ? url : null
}

export const LOGOTIP_CID = 'logotip'

/**
 * Logotip kot VGRAJENA priloga e-poste (cid:), enako kot UPN QR koda -
 * Gmail in Outlook zunanje slike privzeto blokirata, vgrajene pa pokazeta.
 * Ce slike ni mogoce prenesti, vrne null in e-posta gre brez logotipa.
 */
export async function logotipZaEmail(org: any): Promise<{ cid: string; priloga: { filename: string; content: Buffer; contentId: string } } | null> {
  const url = logotipUrl(org)
  // PRELET 331: uporabnik lahko logotip v e-posti izklopi.
  if (!url || !logoNastavitve(org).vEposti) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > 2 * 1024 * 1024) return null
    const png = buf[0] === 0x89 && buf[1] === 0x50
    return { cid: LOGOTIP_CID, priloga: { filename: png ? 'logotip.png' : 'logotip.jpg', content: buf, contentId: LOGOTIP_CID } }
  } catch {
    return null
  }
}

/**
 * PRELET 331: kje in kako velik je logotip (organizations.logo_nastavitve).
 * Neznane/manjkajoce vrednosti -> privzeto (levo, srednji, tudi v e-posti).
 */
export type LogoPolozaj = 'levo' | 'sredina' | 'desno'
export type LogoVelikost = 'majhen' | 'srednji' | 'velik'
export type LogoNastavitve = { polozaj: LogoPolozaj; velikost: LogoVelikost; vEposti: boolean }

export const LOGO_PRIVZETO: LogoNastavitve = { polozaj: 'levo', velikost: 'srednji', vEposti: true }
/** Najvecja visina (PDF v pt, e-posta v px) in sirina. */
export const LOGO_MERE: Record<LogoVelikost, { pdfVisina: number; pdfSirina: number; emailVisina: number; emailSirina: number }> = {
  majhen:  { pdfVisina: 36, pdfSirina: 120, emailVisina: 40, emailSirina: 140 },
  srednji: { pdfVisina: 56, pdfSirina: 170, emailVisina: 64, emailSirina: 200 },
  velik:   { pdfVisina: 80, pdfSirina: 240, emailVisina: 90, emailSirina: 280 },
}

export function logoNastavitve(org: any): LogoNastavitve {
  const n = (org?.logo_nastavitve && typeof org.logo_nastavitve === 'object') ? org.logo_nastavitve : {}
  return {
    polozaj: (['levo', 'sredina', 'desno'] as const).includes(n.polozaj) ? n.polozaj : LOGO_PRIVZETO.polozaj,
    velikost: (['majhen', 'srednji', 'velik'] as const).includes(n.velikost) ? n.velikost : LOGO_PRIVZETO.velikost,
    vEposti: typeof n.vEposti === 'boolean' ? n.vEposti : LOGO_PRIVZETO.vEposti,
  }
}
