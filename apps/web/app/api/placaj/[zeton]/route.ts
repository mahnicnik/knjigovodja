export const dynamic = 'force-dynamic'
/**
 * PRELET 360: "Plačaj s kartico" na javni strani /placaj/[zeton].
 *
 * Obrazec (POST) brez prijave. Dokler zahtevek velja in ni placan, ustvari
 * (ali znova uporabi) Checkout Session na povezanem racunu podjetja in
 * preusmeri nanj (303). Sicer nazaj na stran zahtevka, ki pove, zakaj ne.
 * Zeton je edino "geslo" - brez njega zahtevka ni mogoce najti.
 */
import { NextResponse } from 'next/server'
import { adminSupabase, javniUrl } from '@/lib/stripe-connect'
import { jeVeljavenZeton } from '@/lib/zahtevki'
import { checkoutZaZahtevek, ZahtevekNeVelja } from '@/lib/zahtevki-streznik'

export const maxDuration = 30

export async function POST(req: Request, { params }: { params: Promise<{ zeton: string }> }) {
  const { zeton } = await params
  const osnova = javniUrl(req)
  const nazaj = (napaka?: string) => NextResponse.redirect(`${osnova}/placaj/${encodeURIComponent(zeton)}${napaka ? `?napaka=${encodeURIComponent(napaka)}` : ''}`, 303)
  if (!jeVeljavenZeton(zeton)) return nazaj()
  const admin = adminSupabase()
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('zeton', zeton).maybeSingle()
  if (!z) return nazaj()
  try {
    const url = await checkoutZaZahtevek(admin, z, osnova)
    return NextResponse.redirect(url, 303)
  } catch (e: any) {
    if (e instanceof ZahtevekNeVelja) return nazaj()
    console.error('Zahtevek - Checkout:', z.id, e?.message)
    return nazaj('Plačila trenutno ni mogoče začeti. Poskusite znova čez nekaj minut.')
  }
}
