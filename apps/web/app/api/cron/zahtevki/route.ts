import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/stripe-connect'
import { dokoncajZahtevek } from '@/lib/zahtevki'
import { oznaciPotekle } from '@/lib/zahtevki-streznik'

export const maxDuration = 120

/**
 * PRELET 360: dnevno vzdrzevanje zahtevkov za placilo (klice ga cron/daily).
 *  1. poslani zahtevki s pretekim rokom -> 'potekel',
 *  2. placani zahtevki brez davcno potrjenega ali poslanega racuna ->
 *     naknadna potrditev pri FURS in posiljanje (dokoncajZahtevek).
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = adminSupabase()
  await oznaciPotekle(admin)
  const { data: odprti } = await admin.from('placilni_zahtevki')
    .select('*').eq('status', 'placan').or('invoice_id.is.null,racun_poslan_ob.is.null')
    .order('placano_ob', { ascending: true }).limit(40)
  const izidi: any[] = []
  const zacetek = Date.now()
  for (const z of odprti || []) {
    if (Date.now() - zacetek > 90_000) break
    try { izidi.push({ id: z.id, ...(await dokoncajZahtevek(admin, z)) }) } catch (e: any) { izidi.push({ id: z.id, napaka: e?.message }) }
  }
  return NextResponse.json({ obdelanih: izidi.length, izidi })
}
