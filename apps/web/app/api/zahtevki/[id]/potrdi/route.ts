export const dynamic = 'force-dynamic'
/**
 * PRELET 360: "Potrdi zdaj" - ponovna davcna potrditev racuna iz zahtevka,
 * ki ga FURS ob placilu ni potrdil (in posiljanje racuna, ce ni odslo).
 * Ista pot kot ob placilu (obdelajPlacanZahtevek, idempotentno).
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, javniUrl } from '@/lib/stripe-connect'
import { BREZ_PRAVIC, dokoncajZahtevek } from '@/lib/zahtevki'
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
  const izid = await dokoncajZahtevek(admin, z)
  const { data: sveza } = await admin.from('placilni_zahtevki').select('*').eq('id', id).single()
  const { data: racun } = sveza.invoice_id
    ? await admin.from('issued_invoices').select('id, invoice_number, eor, zoi, status').eq('id', sveza.invoice_id).maybeSingle()
    : { data: null }
  return NextResponse.json({ zahtevek: zaPortal(sveza, javniUrl(req), racun), izid })
}
