export const dynamic = 'force-dynamic'
/**
 * PRELET 360: zahtevek po e-posti stranki. Ce je bil ze poslan, gre kot
 * OPOMNIK (opomnik_ob). Samo za zahtevek, ki se caka na placilo.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, javniUrl } from '@/lib/stripe-connect'
import { BREZ_PRAVIC, prikazanoStanje } from '@/lib/zahtevki'
import { posljiZahtevek } from '@/lib/zahtevki-posta'
import { zaPortal } from '@/lib/zahtevki-streznik'

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  if (BREZ_PRAVIC.includes(s.role)) return NextResponse.json({ error: 'Vaša vloga tega ne dovoli.' }, { status: 403 })
  const admin = adminSupabase()
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('id', id).eq('org_id', s.orgId).maybeSingle()
  if (!z) return NextResponse.json({ error: 'Zahtevek ni najden' }, { status: 404 })
  const stanje = prikazanoStanje(z)
  if (stanje !== 'poslan') {
    const kaj = stanje === 'placan' ? 'že plačan' : stanje === 'potekel' ? 'potekel' : 'preklican'
    return NextResponse.json({ error: `Zahtevek je ${kaj} — pošiljanje ni več mogoče.` }, { status: 409 })
  }
  const osnova = javniUrl(req)
  try {
    await posljiZahtevek(admin, id, osnova, { opomnik: !!z.poslano_ob })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'E-pošta ni bila poslana.' }, { status: 502 })
  }
  const { data: sveza } = await admin.from('placilni_zahtevki').select('*').eq('id', id).single()
  return NextResponse.json({ zahtevek: zaPortal(sveza, osnova), opomnik: !!z.poslano_ob })
}
