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

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()
  if (!org?.tax_number) return { success: false, error: 'Davcna stevilka ni nastavljena' }

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
    : await supabase.rpc('get_next_pos_invoice_number')
  if (seqError) {
    return { success: false, error: 'Napaka pri generiranju stevilke racuna: ' + seqError.message }
  }
  const sequenceNumber = seqData as number
  const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

  const fursData: FursInvoiceData = {
    invoiceNumber: sequenceNumber,
    issueDateTime: invoice.issue_date ? new Date(invoice.issue_date) : new Date(),
    amountTotal: Number(invoice.amount_total),
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

  return {
    success: false,
    error: result.errorMessage ?? undefined,
    offlineMode: !!(result.errorMessage?.includes('Timeout') || result.errorMessage?.includes('offline')),
    zoi: result.zoi,
    invoiceNumber: invoiceNumberFull,
  }
}
