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
  if (!url) return null
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
