import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'
import { getFursCertificate } from '@/lib/furs-cert'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    // Pridobi org_id
    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Beri certifikat iz furs_certificates tabele - UJEMAJOC test/prod nacinu
    const { cert, isTest } = await getFursCertificate(supabase, member.org_id)
    if (!cert) return NextResponse.json({ error: `${isTest ? 'Testni' : 'Produkcijski'} certifikat ni naložen` }, { status: 400 })

    // Pridobi poslovni prostor
    const { data: premise } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    // Pridobi napravo
    const { data: device } = premise ? await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle() : { data: null }

    // Pridobi davčno številko
    const { data: org } = await supabase
      .from('organizations')
      .select('tax_number, furs_test_mode')
      .eq('id', member.org_id)
      .single()

    const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
    let privateKeyPem: string, certificatePem: string
    try {
      const extracted = extractFromP12(p12Buffer, cert.certificate_password ?? '')
      privateKeyPem = extracted.privateKeyPem
      certificatePem = extracted.certificatePem
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: 'Napačno geslo certifikata ali neveljavna .p12 datoteka. Preverite geslo in ponovno naložite certifikat.'
      }, { status: 400 })
    }

    // VAROVALKA (17.8.2026): ce ni ne certifikatne ne organizacijske davcne
    // stevilke, taxNumber spodaj pristane kot prazen niz in bi se tak (napacen)
    // zahtevek vseeno poslal na FURS. Zavrni prej, z jasno razlago.
    const resolvedTaxNumber = cert.tax_number || org?.tax_number || ''
    if (!resolvedTaxNumber) {
      return NextResponse.json({
        success: false,
        error: 'Davčna številka ni nastavljena (ne na certifikatu ne na organizaciji) — preizkus FURS zavrnjen.'
      }, { status: 400 })
    }

    const config: FursConfig = {
      // POPRAVLJENO (17.8.2026): tu je bila kot rezervna vrednost TUJA DAVCNA
      // STEVILKA. Ce podjetje nima svoje, bi svoj racun prijavilo pri FURS
      // pod tujo. Bolje je zavrniti z razlago kot prijaviti napacno.
      taxNumber: resolvedTaxNumber, // POPRAVLJENO 29.7.2026
      premiseId: premise?.premise_id ?? '',
      deviceId: device?.device_id ?? 'RACUNKO01',
      privateKeyPem,
      certificatePem,
      isTest: org?.furs_test_mode ?? true,
    }

    // RAZSIRJENO (16.8.2026): poleg osnovne povezave preizkusimo tudi RAZCLENITEV
    // PO STOPNJAH DDV. Ta oblika sporocila je bila danes spremenjena (prej se je
    // celoten racun prijavil po 22%, tudi ce je vseboval hrano po 9,5%), zato je
    // treba potrditi, da jo shema FURS sprejme.
    //
    // Nic od tega NE nastane v bazi: ne narocilo, ne placilo, ne zaporedna
    // stevilka. Poslje se samo sporocilo na FURS in prebere odgovor.
    // VAROVALKA (16.8.2026): ta preizkus poslje TRI sporocila na FURS. V testnem
    // okolju je to neskodljivo - gre na locen streznik (blagajne-test.fu.gov.si)
    // in NE v uradno davcno evidenco. V produkciji pa bi pomenil tri lazne
    // prijave na pravi streznik, zato ga tam zavrnemo.
    if (!config.isTest) {
      return NextResponse.json({
        success: false,
        error: 'Razširjeni preizkus je dovoljen SAMO v testnem načinu FURS. ' +
               'V produkciji bi ustvaril lažne prijave v uradni davčni evidenci. ' +
               'V nastavitvah blagajne vklopite testni način in poskusite znova.',
      }, { status: 400 })
    }

    const preizkusi: { opis: string; data: FursInvoiceData }[] = [
      {
        opis: 'Osnovna povezava (0,01 EUR, ena stopnja)',
        data: {
          invoiceNumber: 1,
          issueDateTime: new Date(),
          amountTotal: 0.01,
          paymentType: 'cash',
          invoiceType: 'invoice',
        },
      },
      {
        opis: 'Mesan racun (22% + 9,5%)',
        data: {
          invoiceNumber: 2,
          issueDateTime: new Date(),
          amountTotal: 9.50,
          vatBreakdown: [
            { rate: 22, net: 3.28, vat: 0.72 },
            { rate: 9.5, net: 5.02, vat: 0.48 },
          ],
          paymentType: 'cash',
          invoiceType: 'invoice',
        },
      },
      {
        opis: 'Storno mesanega racuna (negativni zneski)',
        data: {
          invoiceNumber: 3,
          issueDateTime: new Date(),
          amountTotal: -9.50,
          vatBreakdown: [
            { rate: 22, net: -3.28, vat: -0.72 },
            { rate: 9.5, net: -5.02, vat: -0.48 },
          ],
          paymentType: 'cash',
          invoiceType: 'credit_note',
        },
      },
    ]

    const rezultati: any[] = []
    for (const t of preizkusi) {
      const r = await confirmWithFurs(config, t.data)
      rezultati.push({
        opis: t.opis,
        uspeh: r.success,
        eor: r.eor ?? null,
        zoi: r.zoi ?? null,
        napaka: r.success ? null : r.errorMessage,
      })
      // Med preizkusi kratek premor, da FURS ne zavrne zaradi hitrosti.
      if (t !== preizkusi[preizkusi.length - 1]) {
        await new Promise(res => setTimeout(res, 500))
      }
    }

    const vsiUspeli = rezultati.every(r => r.uspeh)
    return NextResponse.json({
      success: vsiUspeli,
      testMode: config.isTest,
      preizkusi: rezultati,
      datetime: new Date().toLocaleString('sl-SI'),
      // Zdruzljivost s starim vmesnikom (prikaz prvega rezultata)
      eor: rezultati[0]?.eor ?? null,
      zoi: rezultati[0]?.zoi ?? null,
      error: vsiUspeli ? null : rezultati.find(r => !r.uspeh)?.napaka,
    }, { status: vsiUspeli ? 200 : 500 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
