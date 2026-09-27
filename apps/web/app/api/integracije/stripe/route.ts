import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId } from '@/lib/active-org-server'
import { encryptToken } from '@/lib/token-crypto'
import {
  stripeZaKljuc, stripeZaOrg, preveriNastavitev, uskladiOrg,
  normalizirajPrekoApi, jePreskok, obdelajPlacilo, KljucNeDeluje,
} from '@/lib/stripe-placila'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * PRELET 326: upravljanje Stripe povezave za organizacijo.
 *
 * akcija:
 *  - 'shrani-kljuc'  { kljuc }   kljuc za branje (rk_...) preveri in shrani SIFRIRAN
 *  - 'odstrani-kljuc'
 *  - 'preveri'                   preverba dovoljenj kljuca in nastavitve webhooka
 *  - 'uskladi'       { dni }     obdela vsa placila zadnjih N dni (najvec 90)
 *  - 'ponovi'        { kljuc }   ponovno obdela eno placilo iz knjige
 *  - 'izdaj'         { kljuc }   uporabnik potrdi izdajo racuna za placilo v pregledu
 *                                (pred zacetkom samodejne izdaje, izven Stripa ...)
 *  - 'nadomesti'     { kljuc, racunId }  placilo je bilo zaracunano ROCNO brez
 *                                davcne potrditve: nov, davcno potrjen racun z ISTIM
 *                                kupcem in postavkami, rocni se stornira (prelet 327)
 *
 * Sprejme SAMO omejen kljuc (rk_) - Racunko Stripa uporabnika nikoli ne more
 * spreminjati. Testni kljuc le v testnem/demo nacinu FURS (sicer bi testna
 * placila dobila prave, FURS potrjene racune).
 *
 * Kljuc nikoli ne gre nazaj v brskalnik (le zadnji 4 znaki).
 */
const DOVOLJENE_VLOGE_ZAPIS = new Set(['owner', 'admin'])

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const uporabniski = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() } } }
    )
    const { data: { user } } = await uporabniski.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const zahtevanaOrg: string | null = body.orgId ?? request.headers.get('x-active-org')
    if (!zahtevanaOrg) return NextResponse.json({ error: 'Manjka organizacija' }, { status: 400 })
    const { orgId, role } = await resolveActiveOrgId(uporabniski, user.id, zahtevanaOrg)
    // resolveActiveOrgId ob neujemanju vrne PRVO organizacijo - zato preverimo.
    if (!orgId || orgId !== zahtevanaOrg) return NextResponse.json({ error: 'Nimate dostopa do te organizacije' }, { status: 403 })
    if (!role || !DOVOLJENE_VLOGE_ZAPIS.has(role)) {
      return NextResponse.json({ error: 'Stripe povezavo lahko ureja le lastnik ali skrbnik' }, { status: 403 })
    }

    const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: integracija } = await sb.from('integrations').select('id').eq('org_id', orgId).eq('type', 'stripe').maybeSingle()
    if (!integracija) return NextResponse.json({ error: 'Najprej povežite Stripe webhook (Signing secret).' }, { status: 400 })

    const akcija = String(body.akcija || '')

    if (akcija === 'shrani-kljuc') {
      const kljuc = String(body.kljuc || '').trim()
      if (/^sk_/.test(kljuc)) {
        return NextResponse.json({ error: 'Vpišite omejen ključ (rk_live_...), ne skrivnega (sk_). Skrivni ključ omogoča tudi spreminjanje in vračila — Računko potrebuje samo branje.' }, { status: 400 })
      }
      if (!/^rk_(live|test)_[A-Za-z0-9]+$/.test(kljuc)) {
        return NextResponse.json({ error: 'Ključ se mora začeti z rk_live_ (Stripe → Developers → API keys → Create restricted key).' }, { status: 400 })
      }
      if (kljuc.startsWith('rk_test_')) {
        const { data: o } = await sb.from('organizations').select('furs_test_mode, furs_demo_mode').eq('id', orgId).single()
        if (!o?.furs_test_mode && !o?.furs_demo_mode) {
          return NextResponse.json({ error: 'Testni ključ (rk_test_) je dovoljen le v testnem načinu FURS. Za pravo poslovanje vpišite rk_live_.' }, { status: 400 })
        }
      }
      // Preden ga shranimo: kljuc mora brati VSE, kar obdelava potrebuje.
      const preverbe = await preveriNastavitev(stripeZaKljuc(kljuc), orgId)
      const obvezne = preverbe.filter(p => !p.naslov.startsWith('Webhook'))
      const manjka = obvezne.filter(p => !p.ok)
      if (manjka.length === obvezne.length && manjka.some(p => !/dovoljenja/.test(p.opis))) {
        return NextResponse.json({ error: `Stripe ključa ni sprejel: ${manjka[0].opis}` }, { status: 400 })
      }
      if (manjka.length) {
        return NextResponse.json({ error: 'Ključu manjkajo dovoljenja: ' + manjka.map(p => p.opis).join(' '), preverbe }, { status: 400 })
      }
      const { data: obst } = await sb.from('integrations').select('api_key_enc, samodejno_od').eq('id', integracija.id).single()
      const upd: Record<string, any> = { api_key_enc: encryptToken(kljuc), api_key_zadnji4: kljuc.slice(-4) }
      // Samodejna izdaja velja od PRVE povezave kljuca; placila pred tem gredo v pregled.
      if (!obst?.samodejno_od) upd.samodejno_od = new Date().toISOString()
      const { error } = await sb.from('integrations').update(upd).eq('id', integracija.id)
      if (error) return NextResponse.json({ error: 'Ključa ni bilo mogoče shraniti: ' + error.message }, { status: 500 })
      return NextResponse.json({ success: true, zadnji4: kljuc.slice(-4), testni: kljuc.includes('_test_'), preverbe })
    }

    if (akcija === 'odstrani-kljuc') {
      await sb.from('integrations').update({ api_key_enc: null, api_key_zadnji4: null }).eq('id', integracija.id)
      return NextResponse.json({ success: true })
    }

    let povezava: Awaited<ReturnType<typeof stripeZaOrg>>
    try {
      povezava = await stripeZaOrg(sb, orgId)
    } catch (e: any) {
      if (e instanceof KljucNeDeluje) return NextResponse.json({ error: 'Shranjenega ključa ni mogoče uporabiti — odstranite ga in vpišite znova.' }, { status: 400 })
      throw e
    }
    if (!povezava) return NextResponse.json({ error: 'Ključ za branje ni vpisan.' }, { status: 400 })
    const stripe = povezava.stripe

    if (akcija === 'preveri') {
      return NextResponse.json({ success: true, preverbe: await preveriNastavitev(stripe, orgId) })
    }

    const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single()
    if (!org) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    if (akcija === 'uskladi') {
      const dni = Math.max(1, Math.min(90, Number(body.dni) || 30))
      const izid = await uskladiOrg(sb, org, stripe, dni, 50_000)
      return NextResponse.json({ success: true, dni, ...izid })
    }

    if (akcija === 'nadomesti') {
      const kljuc = String(body.kljuc || '')
      const racunId = String(body.racunId || '')
      if (!kljuc.startsWith('pi_') && !kljuc.startsWith('in_') && !kljuc.startsWith('ch_')) return NextResponse.json({ error: 'Neznan ključ plačila' }, { status: 400 })
      const { data: vrsta } = await sb.from('stripe_placila').select('stanje, racun_id').eq('org_id', orgId).eq('kljuc', kljuc).maybeSingle()
      if (!vrsta) return NextResponse.json({ error: 'Plačilo ni v knjigi — najprej kliknite Uskladi.' }, { status: 400 })
      if (vrsta.racun_id) return NextResponse.json({ error: 'To plačilo že ima račun v Računku.' }, { status: 400 })
      const { data: predloga } = await sb.from('issued_invoices').select('*').eq('id', racunId).eq('org_id', orgId).maybeSingle()
      if (!predloga) return NextResponse.json({ error: 'Račun ni najden.' }, { status: 404 })
      if (predloga.eor) return NextResponse.json({ error: `Račun ${predloga.invoice_number} je že davčno potrjen — nadomeščanje ni potrebno.` }, { status: 400 })
      // Ze storniran rocni racun je dovoljen (uporabnik ga je storniral pred nadomestitvijo) -
      // storno zapis (<st>-S) sam pa ni racun za nadomestitev.
      if (predloga.status === 'draft' || /-S$/.test(String(predloga.invoice_number))) return NextResponse.json({ error: `Račun ${predloga.invoice_number} je osnutek ali storno zapis.` }, { status: 400 })
      const { data: zeNadomescen } = await sb.from('issued_invoices').select('invoice_number').eq('org_id', orgId).like('notes', `Nadomešča račun ${predloga.invoice_number},%`).limit(1)
      if (zeNadomescen?.length) return NextResponse.json({ error: `Račun ${predloga.invoice_number} je že nadomeščen z računom ${zeNadomescen[0].invoice_number}.` }, { status: 400 })
      if (Number(predloga.amount_total) <= 0) return NextResponse.json({ error: 'Nadomestiti je mogoče samo račun s pozitivnim zneskom.' }, { status: 400 })
      if (String(predloga.external_reference || '').startsWith('stripe-')) return NextResponse.json({ error: 'Račun je že vezan na Stripe plačilo.' }, { status: 400 })

      const ref = kljuc.startsWith('pi_') ? { paymentIntentId: kljuc } : kljuc.startsWith('in_') ? { stripeInvoiceId: kljuc } : { chargeId: kljuc }
      const p = await normalizirajPrekoApi(stripe, ref)
      if (jePreskok(p)) return NextResponse.json({ error: `Plačila ni mogoče obdelati: ${p.preskok}` }, { status: 400 })
      // Zneska se morata ujemati - sicer racun ni za to placilo.
      if (Math.abs(Number(predloga.amount_total) * 100 - p.znesekCenti) > 1) {
        return NextResponse.json({ error: `Znesek računa ${predloga.invoice_number} (${Number(predloga.amount_total).toFixed(2)} €) se ne ujema s plačilom (${(p.znesekCenti / 100).toFixed(2)} €).` }, { status: 400 })
      }
      const izid = await obdelajPlacilo(sb, org, p, 'nadomestni_racun', { prisili: true, predloga })
      let stevilka: string | null = null
      if (izid.racunId) {
        const { data: nov } = await sb.from('issued_invoices').select('invoice_number').eq('id', izid.racunId).maybeSingle()
        stevilka = nov?.invoice_number ?? null
      }
      return NextResponse.json({ success: true, ...izid, stevilka, nadomescen: predloga.invoice_number })
    }

    if (akcija === 'ponovi' || akcija === 'izdaj') {
      const kljuc = String(body.kljuc || '')
      const ref = kljuc.startsWith('pi_') ? { paymentIntentId: kljuc }
        : kljuc.startsWith('in_') ? { stripeInvoiceId: kljuc }
        : kljuc.startsWith('ch_') ? { chargeId: kljuc }
        : kljuc.startsWith('cs_') ? { checkoutSessionId: kljuc }
        : null
      if (!ref) return NextResponse.json({ error: 'Neznan ključ plačila' }, { status: 400 })
      const p = await normalizirajPrekoApi(stripe, ref)
      if (jePreskok(p)) return NextResponse.json({ success: true, stanje: 'preskoceno', razlog: p.preskok })
      // 'izdaj' = uporabnik je placilo pregledal in potrdil, da racun se ni bil izdan.
      // Neobvezno { kupec }: racun na drugega kupca kot v Stripu (npr. podjetje).
      let predloga: Record<string, any> | undefined
      if (akcija === 'izdaj' && body.kupec && typeof body.kupec === 'object') {
        const k = body.kupec
        const naziv = String(k.naziv || '').trim().slice(0, 200)
        if (!naziv) return NextResponse.json({ error: 'Vpišite naziv kupca.' }, { status: 400 })
        predloga = {
          client_name: naziv,
          client_address: String(k.naslov || '').trim().slice(0, 300) || null,
          client_tax_number: String(k.davcna || '').trim().slice(0, 30) || null,
          client_email: String(k.email || '').trim().slice(0, 200) || null,
        }
      }
      const izid = await obdelajPlacilo(sb, org, p, akcija === 'izdaj' ? 'rocna_potrditev' : 'rocno', { prisili: akcija === 'izdaj', predloga })
      return NextResponse.json({ success: true, ...izid })
    }

    return NextResponse.json({ error: 'Neznana akcija' }, { status: 400 })
  } catch (e: any) {
    console.error('api/integracije/stripe:', e)
    return NextResponse.json({ error: e?.message || 'Napaka' }, { status: 500 })
  }
}
