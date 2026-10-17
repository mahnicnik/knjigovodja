import { NextRequest, NextResponse } from 'next/server'
import { sejaZahteve } from '@/lib/seja-zahteve'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'
import { zahtevajPaket } from '@/lib/paket'
import {
  getCurrentSession, openSession, getSessionStats, closeSession, getLastCarryOver, izmenePoNapravi,
  type IzmenaKontekst,
} from '@/lib/cash-session'
import { knjiziPosDneve, dneviMed } from '@/lib/pos-kpo'

/**
 * IZMENA BLAGAJNE ZA ANDROID (trznice, 17.10.2026)
 *
 * Telefon nima spletne blagajne, ki odpre in zakljuci izmeno. Ta pot uporabi
 * ISTO logiko kot spletna blagajna (lib/cash-session.ts: izmena, vmesno
 * stanje, Z-porocilo; lib/pos-kpo.ts: prenos v KPO) - en sam izracun za
 * splet, Windows in telefon.
 *
 *   GET  ?device_id=…                         → stanje: { poNapravi, izmena, stats, prenos }
 *   POST { akcija:'odpri', device_id, gotovina, opomba?, staff_id? }
 *   POST { akcija:'zakljuci', device_id, izmena_id, presteta, opomba?, staff_id? }
 *
 * Pri locenih izmenah po napravi (organizations.izmene_po_napravi) vse velja
 * za izmeno naprave telefona; sicer za skupno izmeno podjetja.
 */
export const dynamic = 'force-dynamic'

async function kontekst(req: NextRequest, deviceId: string | null) {
  const { supabase, userId } = await sejaZahteve(req)
  if (!userId) return { napaka: NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 }) }
  const { orgId } = await resolveActiveOrgId(supabase, userId, getRequestedOrgId(req))
  if (!orgId) return { napaka: NextResponse.json({ error: 'Podjetje ni najdeno' }, { status: 404 }) }
  const zavrnjeno = await zahtevajPaket(supabase, orgId, 'pos', 'Blagajna')
  if (zavrnjeno) return { napaka: zavrnjeno }
  const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle()
  const businessId: string = org?.pos_business_id || orgId
  if (deviceId) {
    const { data: nap } = await supabase.from('electronic_devices').select('id')
      .eq('id', deviceId).eq('org_id', orgId).eq('is_active', true).maybeSingle()
    if (!nap) return { napaka: NextResponse.json({ error: 'Naprava ne pripada temu podjetju ali ni aktivna.' }, { status: 400 }) }
  }
  const ctx: IzmenaKontekst = { db: supabase, businessId, deviceId }
  return { supabase, userId, orgId, businessId, ctx }
}

function zaokrozi(st: any) {
  const r = (n: number) => Math.round(Number(n || 0) * 100) / 100
  const o: any = {}
  for (const [k, v] of Object.entries(st || {})) o[k] = typeof v === 'number' ? r(v) : v
  return o
}

export async function GET(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get('device_id') || null
    const k = await kontekst(req, deviceId)
    if ('napaka' in k && k.napaka) return k.napaka
    const { ctx, businessId, supabase } = k as any
    const poNapravi = await izmenePoNapravi(supabase, businessId)
    const izmena = await getCurrentSession(undefined, ctx)
    const stats = izmena ? zaokrozi(await getSessionStats(izmena, ctx)) : null
    const prenos = izmena ? null : await getLastCarryOver(ctx)
    return NextResponse.json({ poNapravi, izmena, stats, prenos }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const deviceId: string | null = typeof body.device_id === 'string' && body.device_id ? body.device_id : null
    const k = await kontekst(req, deviceId)
    if ('napaka' in k && k.napaka) return k.napaka
    const { ctx, businessId, supabase, userId, orgId } = k as any
    const staffId: string | undefined = typeof body.staff_id === 'string' && body.staff_id ? body.staff_id : undefined

    if (body.akcija === 'odpri') {
      const gotovina = Number(body.gotovina)
      if (!Number.isFinite(gotovina) || gotovina < 0) return NextResponse.json({ error: 'Vnesi veljavno začetno gotovino' }, { status: 400 })
      const { session, error } = await openSession({ cashOpening: Math.round(gotovina * 100) / 100, openedBy: userId, staffId, note: body.opomba || undefined }, ctx)
      if (error) return NextResponse.json({ error }, { status: 409 })
      return NextResponse.json({ izmena: session })
    }

    if (body.akcija === 'zakljuci') {
      const presteta = Number(body.presteta)
      if (!Number.isFinite(presteta) || presteta < 0) return NextResponse.json({ error: 'Vnesi prešteto gotovino' }, { status: 400 })
      const { data: izmena } = await supabase.from('cash_sessions').select('*')
        .eq('id', body.izmena_id).eq('business_id', businessId).eq('status', 'open').maybeSingle()
      if (!izmena) return NextResponse.json({ error: 'Izmena ni odprta ali ne obstaja (morda je že zaprta).' }, { status: 409 })
      // Izmeno naprave zakljuci samo ta naprava (pri skupni izmeni kdorkoli).
      if (izmena.device_id && izmena.device_id !== deviceId) {
        return NextResponse.json({ error: 'To je izmena druge naprave - zaključi jo na tisti napravi.' }, { status: 403 })
      }
      const stats = await getSessionStats(izmena, ctx)
      const casZakljucka = new Date().toISOString()
      const { zReportNumber, difference, error } = await closeSession({
        session: izmena, cashClosingDeclared: Math.round(presteta * 100) / 100, closedBy: staffId || userId, note: body.opomba || undefined,
      }, ctx)
      if (error) return NextResponse.json({ error, zReportNumber }, { status: 500 })
      // Prenos prometa v KPO - isto kot spletna blagajna (pomozni korak).
      try {
        await knjiziPosDneve(supabase, orgId, businessId, dneviMed(izmena.opened_at, casZakljucka))
        await supabase.from('z_reports').update({ sent_to_racunko: true }).eq('business_id', businessId).eq('report_number', zReportNumber)
      } catch (kpoErr: any) {
        console.warn('KPO prenos po zakljucku (Android) ni uspel:', kpoErr?.message)
      }
      return NextResponse.json({ zReportNumber, razlika: Math.round(difference * 100) / 100, stats: zaokrozi(stats), zakljuceno: casZakljucka })
    }

    return NextResponse.json({ error: 'Neznana akcija' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
