export const dynamic = 'force-dynamic'
/**
 * PRELET 360: STORNO RACUNA IZ ZAHTEVKA (+ vracilo prek Stripe).
 *
 * Velja SAMO za racune, izdane iz zahtevka za placilo (external_reference
 * 'stripe-zahtevek-...'). Storno ostalih racunov v Racunih je nespremenjen.
 *
 * GET  ?invoice_id= → ali je racun iz zahtevka, placan s kartico, ze vrnjen
 * POST { invoice_id, vracilo } →
 *   1. storno: zapis <st>-S (enako kot gumb "Storniraj" v Racunih), izvirnik
 *      'cancelled'; ker je bil izvirnik davcno potrjen, se storno potrdi pri
 *      FURS po obstojecem postopku (confirmIssuedInvoiceWithFurs, kot dobropis
 *      Stripe placil) in vpise v knjigo prihodkov z negativnim zneskom,
 *   2. vracilo: celoten znesek prek Stripe na povezanem racunu (kot v
 *      blagajni), idempotentno (en kljuc na zahtevek).
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, stripeConnect } from '@/lib/stripe-connect'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { lokalniDatum } from '@/lib/tax-constants'
import { BREZ_PRAVIC, REF_PREDPONA } from '@/lib/zahtevki'

export const maxDuration = 60

async function najdi(admin: any, orgId: string, invoiceId: string) {
  const { data: inv } = await admin.from('issued_invoices').select('*').eq('id', invoiceId).eq('org_id', orgId).maybeSingle()
  if (!inv || !String(inv.external_reference || '').startsWith(REF_PREDPONA)) return null
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('invoice_id', invoiceId).eq('org_id', orgId).maybeSingle()
  return z ? { inv, z } : null
}

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('invoice_id')
  if (!id) return NextResponse.json({ zahtevek: false })
  const n = await najdi(adminSupabase(), s.orgId, id)
  if (!n) return NextResponse.json({ zahtevek: false })
  return NextResponse.json({
    zahtevek: true, stevilka: n.z.stevilka, znesek: Number(n.z.znesek),
    vrnjeno: !!(n.z.refund_id || n.z.vrnjeno_ob), lahkoVrne: !!n.z.payment_intent_id,
  })
}

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  if (BREZ_PRAVIC.includes(s.role)) return NextResponse.json({ error: 'Vaša vloga tega ne dovoli.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (!b.invoice_id) return NextResponse.json({ error: 'invoice_id je obvezen' }, { status: 400 })
  const admin = adminSupabase()
  const n = await najdi(admin, s.orgId, String(b.invoice_id))
  if (!n) return NextResponse.json({ error: 'Račun ni iz zahtevka za plačilo.' }, { status: 404 })
  const { inv, z } = n
  const izid: { storno: string | null; furs: boolean | null; vracilo: string | null; napaka: string | null } = { storno: null, furs: null, vracilo: null, napaka: null }

  // 1. STORNO (enkrat)
  if (inv.status !== 'cancelled') {
    const stornoSt = `${inv.invoice_number}-S`
    const danes = lokalniDatum()
    let { data: st } = await admin.from('issued_invoices').select('id').eq('org_id', inv.org_id).eq('related_invoice_id', inv.id).eq('invoice_type', 'credit_note').maybeSingle()
    if (!st) {
      const { data: nov, error } = await admin.from('issued_invoices').insert({
        org_id: inv.org_id,
        invoice_number: stornoSt,
        invoice_type: 'credit_note',
        related_invoice_id: inv.id,
        client_name: inv.client_name,
        client_email: inv.client_email,
        client_tax_number: inv.client_tax_number,
        client_address: inv.client_address,
        issue_date: danes,
        due_date: danes,
        line_items: (inv.line_items || []).map((it: any) => ({ ...it, unit_price: -Math.abs(Number(it.unit_price || 0)) })),
        amount_net: -Math.abs(Number(inv.amount_net)),
        vat_amount: -Math.abs(Number(inv.vat_amount)),
        amount_total: -Math.abs(Number(inv.amount_total)),
        status: 'cancelled',
        notes: `Storno računa ${inv.invoice_number}`,
        reference: `SI00 ${stornoSt}`,
        vat_exemption_code: inv.vat_exemption_code,
        vat_exemption_text: inv.vat_exemption_text,
        source: 'zahtevek',
      }).select('id').single()
      if (error || !nov) return NextResponse.json({ error: 'Storna ni bilo mogoče izvesti: ' + (error?.message || '') + ' Izvirni račun ostaja nespremenjen.' }, { status: 500 })
      st = nov
    }
    izid.storno = st!.id
    const { error: uErr } = await admin.from('issued_invoices').update({ status: 'cancelled' }).eq('id', inv.id)
    if (uErr) return NextResponse.json({ error: 'Storno je nastal, izvirnega računa pa ni bilo mogoče preklicati: ' + uErr.message }, { status: 500 })

    // Davcna potrditev storna - izvirnik je bil potrjen, zato mora biti tudi storno.
    try {
      const r = await confirmIssuedInvoiceWithFurs(admin, inv.org_id, st!.id, 'card')
      izid.furs = !!r.success
      if (!r.success) izid.napaka = `Storno ni davčno potrjen: ${r.error || 'FURS ni odgovoril'}.`
    } catch (e: any) {
      izid.furs = false
      izid.napaka = `Storno ni davčno potrjen: ${e?.message || e}.`
    }
    const { data: kpo } = await admin.from('kpo_entries').select('id').eq('invoice_id', st!.id).limit(1)
    if (!kpo || kpo.length === 0) {
      const { data: stR } = await admin.from('issued_invoices').select('invoice_number').eq('id', st!.id).single()
      await admin.from('kpo_entries').insert({
        org_id: inv.org_id, entry_date: danes, description: `Storno #${stR?.invoice_number ?? stornoSt} — ${inv.client_name}`,
        entry_type: 'income', income: -Math.abs(Number(inv.amount_net)), vat_out: -Math.abs(Number(inv.vat_amount)),
        invoice_id: st!.id, category: 'Storitev', notes: `Storno računa ${inv.invoice_number} (zahtevek ${z.stevilka || z.id})`,
      })
    }
  }

  else {
    // Ze storniran: ponovni klic dokonca davcno potrditev storna, ce je izostala.
    const { data: st } = await admin.from('issued_invoices').select('id, eor').eq('org_id', inv.org_id).eq('related_invoice_id', inv.id).eq('invoice_type', 'credit_note').maybeSingle()
    if (st) {
      izid.storno = st.id
      izid.furs = !!st.eor
      if (!st.eor) {
        const r = await confirmIssuedInvoiceWithFurs(admin, inv.org_id, st.id, 'card').catch((e: any) => ({ success: false, error: e?.message }))
        izid.furs = !!r.success
        if (!r.success) izid.napaka = `Storno ni davčno potrjen: ${(r as any).error || 'FURS ni odgovoril'}.`
      }
    }
  }

  // 2. VRACILO prek Stripe
  if (b.vracilo) {
    if (z.refund_id) {
      izid.vracilo = z.refund_id
    } else if (!z.payment_intent_id) {
      izid.napaka = (izid.napaka ? izid.napaka + ' ' : '') + 'Plačilu manjka oznaka pri Stripe — vračilo izvedite v Stripe nadzorni plošči.'
    } else {
      const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', z.org_id).single()
      if (!org?.stripe_account_id) {
        izid.napaka = (izid.napaka ? izid.napaka + ' ' : '') + 'Stripe ni več povezan — vračilo izvedite v Stripe nadzorni plošči.'
      } else {
        try {
          const refund = await stripeConnect().refunds.create(
            { payment_intent: z.payment_intent_id, reason: 'requested_by_customer', metadata: { vrsta: 'zahtevek', zahtevek_id: z.id, invoice_id: inv.id } },
            { stripeAccount: org.stripe_account_id, idempotencyKey: `zahtevek-vracilo-${z.id}` },
          )
          izid.vracilo = refund.id
          await admin.from('placilni_zahtevki').update({ refund_id: refund.id, vrnjeno_ob: new Date().toISOString() }).eq('id', z.id)
        } catch (e: any) {
          izid.napaka = (izid.napaka ? izid.napaka + ' ' : '') + 'Vračilo pri Stripe ni uspelo: ' + (e?.message || e)
        }
      }
    }
  }
  return NextResponse.json(izid, { status: izid.napaka && !izid.storno && !izid.vracilo ? 502 : 200 })
}
