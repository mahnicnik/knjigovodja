import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from './furs'

/**
 * Skupna logika za davcno potrjevanje 'issued_invoices' pri FURS.
 * Izlusceno iz api/furs/confirm/route.ts (21.7.2026), da jo lahko klice tudi
 * Stripe webhook (brez uporabniske seje - service role klic preko cron/
 * webhook konteksta), ne samo avtenticiran uporabnik iz UI-ja.
 *
 * POMEMBNO: ta funkcija NE preverja avtentikacije ali Pro-paketa - to mora
 * narediti klicatelj (glej api/furs/confirm/route.ts za primer wrapperja).
 */
export interface ConfirmIssuedInvoiceResult {
  success: boolean
  zoi?: string | null
  eor?: string | null
  error?: string
  invoiceNumber?: string
  alreadyConfirmed?: boolean
  offlineMode?: boolean
}

export async function confirmIssuedInvoiceWithFurs(
  supabase: any,
  orgId: string,
  invoiceId: string,
  paymentType: 'cash' | 'card' = 'cash',
  requestedPremiseId?: string,
): Promise<ConfirmIssuedInvoiceResult> {
  const { data: invoice } = await supabase
    .from('issued_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .single()
  if (!invoice) return { success: false, error: 'Racun ni najden' }

  // Ze potrjen? (idempotentno - varno klicati veckrat)
  if (invoice.eor) {
    return {
      success: true,
      zoi: invoice.zoi,
      eor: invoice.eor,
      invoiceNumber: invoice.invoice_number,
      alreadyConfirmed: true,
    }
  }

  // ATOMARNA KLJUCAVNICA (patch 2, 21.7.2026): Stripe zna webhook dostaviti
  // veckrat HKRATI - dva vzporedna klica bi oba presla zgornjo preverbo,
  // oba porabila zaporedno stevilko in oba poslala FURS-u (dvojna
  // fiskalizacija iste transakcije). UPDATE spodaj uspe samo enemu:
  // pogoj "eor is null AND (lock prost ALI starejsi od 2 min)" + .select()
  // vrne posodobljene vrstice - prazno = drug klic ze obdeluje.
  const lockCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: lockRows } = await supabase
    .from('issued_invoices')
    .update({ furs_confirming_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .is('eor', null)
    .or(`furs_confirming_at.is.null,furs_confirming_at.lt.${lockCutoff}`)
    .select('id')
  if (!lockRows || lockRows.length === 0) {
    // Bodisi vzporedna obdelava bodisi je racun medtem ze potrjen - preveri.
    const { data: recheck } = await supabase
      .from('issued_invoices').select('zoi, eor, invoice_number')
      .eq('id', invoiceId).single()
    if (recheck?.eor) {
      return { success: true, zoi: recheck.zoi, eor: recheck.eor, invoiceNumber: recheck.invoice_number, alreadyConfirmed: true }
    }
    return { success: false, error: 'Fiskalizacija tega racuna ze poteka (vzporeden klic) - poskusite znova cez minuto' }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()
  if (!org?.tax_number) return { success: false, error: 'Davcna stevilka ni nastavljena' }

  // DODANO (11.8.2026): DEMO nacin - fiskalizacija BREZ pravega FURS
  // certifikata/komunikacije. Namenjeno testiranju/predstavitvi aplikacije,
  // NE za dejansko poslovanje. ZOI/EOR sta VEDNO jasno oznacena s predpono
  // "DEMO-" - nikoli ju ni mogoce zamenjati za prave FURS kode.
  if (org?.furs_demo_mode) {
    const demoCode = `DEMO-${invoiceId.replace(/-/g, '').slice(0, 12).toUpperCase()}`
    await supabase
      .from('issued_invoices')
      .update({
        zoi: demoCode,
        eor: demoCode,
        furs_confirmed_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
    return { success: true, zoi: demoCode, eor: demoCode, invoiceNumber: invoice.invoice_number }
  }

  const { data: cert } = await supabase
    .from('furs_certificates')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle()
  if (!cert) return { success: false, error: 'FURS certifikat ni nalozen' }

  // POPRAVLJENO 21.7.2026: prednostno uporabi prostor/napravo oznaceno za
  // 'web' kanal (locena od POS-a). Ce nic ni oznaceno kot 'web', pade nazaj
  // na 'both' - IDENTICNO obnasanje kot prej (deli napravo s POS-om).
  let premise: any = null
  if (requestedPremiseId) {
    const { data } = await supabase.from('business_premises').select('*')
      .eq('org_id', orgId).eq('is_active', true).eq('id', requestedPremiseId).maybeSingle()
    premise = data
  } else {
    const { data: webPremise } = await supabase.from('business_premises').select('*')
      .eq('org_id', orgId).eq('is_active', true).eq('channel', 'web').limit(1).maybeSingle()
    premise = webPremise
    if (!premise) {
      const { data: bothPremise } = await supabase.from('business_premises').select('*')
        .eq('org_id', orgId).eq('is_active', true).eq('channel', 'both').limit(1).maybeSingle()
      premise = bothPremise
    }
  }
  if (!premise) return { success: false, error: 'Poslovni prostor ni dodan' }

  const { data: webDevice } = await supabase.from('electronic_devices').select('*')
    .eq('premise_id', premise.id).eq('is_active', true).eq('channel', 'web').limit(1).maybeSingle()
  let device: any = webDevice
  if (!device) {
    const { data: bothDevice } = await supabase.from('electronic_devices').select('*')
      .eq('premise_id', premise.id).eq('is_active', true).eq('channel', 'both').limit(1).maybeSingle()
    device = bothDevice
  }
  const deviceIdCode = device?.device_id ?? 'RACUNKO01'
  const usesWebSequence = device?.channel === 'web'

  // POPRAVLJENO 21.7.2026 (revizija): prejsnji izracun je stel potrjene
  // issued_invoices (lastno zaporedje od 1) z neatomarnim count+1 vzorcem.
  // Ker POS in issued_invoices posiljata pod ISTIM prostorom+napravo
  // (SIRBFB01-RACUNKO01), bi to povzrocilo trcenje z ze zasedenimi POS
  // stevilkami pri FURS. Po ZDavPR je zaporedje ENO na prostor+napravo -
  // zato uporabimo isti atomaren RPC kot POS in storno.
  const { data: seqData, error: seqError } = usesWebSequence
    ? await supabase.rpc('get_next_web_invoice_number')
    : await (async () => {
        // POPRAVLJENO (16.8.2026): stevilka se dodeli PO PODJETJU. Racuni iz
        // portala niso vezani na POS blagajno, zato jo poiscemo prek organizacije.
        const { data: orgRow } = await supabase
          .from('organizations').select('pos_business_id').eq('id', orgId).maybeSingle()
        return supabase.rpc('get_next_pos_invoice_number', {
          p_business_id: orgRow?.pos_business_id ?? orgId,
        })
      })()
  if (seqError) {
    return { success: false, error: 'Napaka pri generiranju stevilke racuna: ' + seqError.message }
  }
  const sequenceNumber = seqData as number
  const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

  // DODANO (16.8.2026): razclenitev po stopnjah DDV iz postavk racuna. Prej se
  // je celoten racun prijavil FURS-u po 22%, tudi ce so postavke po 9,5% ali
  // oproscene. Postavke stopnjo ZE nosijo (line_items[].vat_rate).
  const znesekSkupaj = Number(invoice.amount_total)
  const postavke: any[] = Array.isArray(invoice.line_items) ? invoice.line_items : []
  let vatBreakdown: { rate: number; net: number; vat: number }[] | undefined
  if (postavke.length > 0) {
    const poStopnji = new Map<number, number>()
    let vsotaPostavk = 0
    for (const pz of postavke) {
      const kolicina = Number(pz.quantity ?? 1)
      const cena = Number(pz.unit_price ?? 0)
      const popust = Number(pz.discount_pct ?? 0)
      const neto = kolicina * cena * (1 - popust / 100)
      const stopnja = Number(pz.vat_rate ?? 22)
      const bruto = neto * (1 + stopnja / 100)
      poStopnji.set(stopnja, (poStopnji.get(stopnja) || 0) + bruto)
      vsotaPostavk += bruto
    }
    // Sorazmerna uskladitev, ce se vsota postavk ne ujema s skupnim zneskom
    // (zaokrozevanje, popust na celoten racun).
    const faktor = vsotaPostavk > 0 ? Math.abs(znesekSkupaj) / vsotaPostavk : 1
    const predznak = znesekSkupaj < 0 ? -1 : 1
    vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
      const b = bruto * faktor
      const net = rate > 0 ? b / (1 + rate / 100) : b
      return {
        rate,
        net: predznak * Math.round(net * 100) / 100,
        vat: predznak * Math.round((b - net) * 100) / 100,
      }
    }).sort((a, b) => b.rate - a.rate)
  }

  const fursData: FursInvoiceData = {
    invoiceNumber: sequenceNumber,
    issueDateTime: invoice.issue_date ? new Date(invoice.issue_date) : new Date(),
    amountTotal: znesekSkupaj,
    vatBreakdown,
    paymentType,
    invoiceType: invoice.invoice_type === 'credit_note' ? 'credit_note' : 'invoice',
  }

  const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
  const { privateKeyPem, certificatePem } = extractFromP12(p12Buffer, cert.certificate_password ?? '')

  const config: FursConfig = {
    taxNumber: org.tax_number,
    premiseId: premise.premise_id,
    deviceId: deviceIdCode,
    privateKeyPem,
    certificatePem,
    isTest: org?.furs_test_mode ?? true,
  }

  const { data: logEntry } = await supabase
    .from('furs_log')
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      status: 'pending',
      raw_request: {
        source: 'issued_invoice',
        invoiceNumber: sequenceNumber,
        invoiceNumberFull,
        premiseId: premise.premise_id,
        deviceId: deviceIdCode,
        paymentType,
      },
    })
    .select('id')
    .single()

  const result = await confirmWithFurs(config, fursData)

  await supabase
    .from('furs_log')
    .update({
      zoi: result.zoi,
      eor: result.eor,
      status: result.success ? 'success' : 'error',
      error_message: result.errorMessage,
      response_at: result.responseTime?.toISOString(),
    })
    .eq('id', logEntry?.id)

  if (result.success && result.zoi && result.eor) {
    await supabase
      .from('issued_invoices')
      .update({
        invoice_number: invoiceNumberFull,
        zoi: result.zoi,
        eor: result.eor,
        furs_confirmed_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
    return { success: true, zoi: result.zoi, eor: result.eor, invoiceNumber: invoiceNumberFull }
  }

  // Sprosti kljucavnico ob neuspehu, da je takojsnji rocni retry mozen
  // (ob uspehu sproscanje ni potrebno - eor blokira ze na vrhu funkcije).
  await supabase
    .from('issued_invoices')
    .update({ furs_confirming_at: null })
    .eq('id', invoiceId)

  return {
    success: false,
    error: result.errorMessage ?? undefined,
    offlineMode: !!(result.errorMessage?.includes('Timeout') || result.errorMessage?.includes('offline')),
    zoi: result.zoi,
    invoiceNumber: invoiceNumberFull,
  }
}
