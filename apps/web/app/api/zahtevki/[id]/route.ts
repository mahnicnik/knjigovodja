export const dynamic = 'force-dynamic'
/**
 * PRELET 360: stanje enega zahtevka za zaslon s QR kodo (rezerva za
 * Realtime, vsake 3 s). Ce se caka, vprasa se Stripe - tako se racun izda
 * tudi, ce webhook zamudi ali ne pride.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, javniUrl } from '@/lib/stripe-connect'
import { preveriPriStripe, zaPortal } from '@/lib/zahtevki-streznik'

export const maxDuration = 60

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const admin = adminSupabase()
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('id', id).eq('org_id', s.orgId).maybeSingle()
  if (!z) return NextResponse.json({ error: 'Zahtevek ni najden' }, { status: 404 })
  await preveriPriStripe(admin, z)
  const { data: sveza } = await admin.from('placilni_zahtevki').select('*').eq('id', id).single()
  const { data: racun } = sveza.invoice_id
    ? await admin.from('issued_invoices').select('id, invoice_number, eor, zoi, status').eq('id', sveza.invoice_id).maybeSingle()
    : { data: null }
  return NextResponse.json({ zahtevek: zaPortal(sveza, javniUrl(req), racun) })
}
