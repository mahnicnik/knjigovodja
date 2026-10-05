import { confirmWithFurs, extractFromP12, calculateZoi, type FursConfig, type FursInvoiceData } from './furs'

/**
 * PRELET 364 (H1): rezervacija davcne stevilke racuna. Ustvari se ENKRAT,
 * pred prvim klicem FURS, in se shrani na racun (issued_invoices.
 * furs_rezervacija). Ponovni poskusi (FURS ni odgovoril) posljejo ISTO
 * stevilko, ISTI ZOI in isti cas izdaje z oznako SubsequentSubmit - tako kot
 * blagajna (lib/pos-stripe.ts). Prej je vsak poskus porabil novo zaporedno
 * stevilko (luknje v zaporedju, en racun pod vec stevilkami).
 */
export type FursRezervacija = {
  premiseId: string
  deviceId: string
  sequence: number
  invoiceNumber: string
  zoi: string
  issuedAt: string
}

/**
 * PRELET 371 (M5): poslovni prostor za racune s portala - ENO pravilo za
 * davcno potrditev (tu) in za pogoje placil s kartico (preveriPogoje).
 * Prednost ima prostor s kanalom 'web', sicer 'both'; prostor samo za
 * blagajno ('pos') za portal ne velja.
 */
export function prostorZaPortal<T extends { channel?: string | null; is_active?: boolean | null }>(prostori: T[] | null | undefined): T | null {
  const aktivni = (prostori || []).filter(p => p.is_active !== false)
  return aktivni.find(p => p.channel === 'web') || aktivni.find(p => p.channel === 'both') || null
}

/** Zamenljivi zunanji klici (testi). */
export type FursOdvisnosti = {
  posli?: typeof confirmWithFurs
  kljuc?: (cert: any) => { privateKeyPem: string; certificatePem: string }
}

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
  deps: FursOdvisnosti = {},
): Promise<ConfirmIssuedInvoiceResult> {
  const posli = deps.posli ?? confirmWithFurs
  const kljuc = deps.kljuc ?? ((c: any) => extractFromP12(Buffer.from(c.certificate_data, 'base64'), c.certificate_password ?? ''))
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

  const sprosti = () => supabase.from('issued_invoices').update({ furs_confirming_at: null }).eq('id', invoiceId)

  // PRELET 364: obstojeca rezervacija ima prednost - ista stevilka, isti ZOI.
  const obstojeca: FursRezervacija | null = invoice.furs_rezervacija?.sequence ? invoice.furs_rezervacija : null
  async function novaStevilka(): Promise<{ premiseId: string; deviceId: string; sequence: number } | ConfirmIssuedInvoiceResult> {
    // POPRAVLJENO 21.7.2026: prednostno uporabi prostor/napravo oznaceno za
    // 'web' kanal (locena od POS-a). Ce nic ni oznaceno kot 'web', pade nazaj
    // na 'both' - IDENTICNO obnasanje kot prej (deli napravo s POS-om).
    let premise: any = null
    if (requestedPremiseId) {
      const { data } = await supabase.from('business_premises').select('*')
        .eq('org_id', orgId).eq('is_active', true).eq('id', requestedPremiseId).maybeSingle()
      premise = data
    } else {
      const { data: prostori } = await supabase.from('business_premises').select('*')
        .eq('org_id', orgId).eq('is_active', true)
      premise = prostorZaPortal(prostori)
    }
    if (!premise) { await sprosti(); return { success: false, error: 'Poslovni prostor ni dodan' } }

    const { data: webDevice } = await supabase.from('electronic_devices').select('*')
      .eq('premise_id', premise.id).eq('is_active', true).eq('channel', 'web').limit(1).maybeSingle()
    let device: any = webDevice
    if (!device) {
      const { data: bothDevice } = await supabase.from('electronic_devices').select('*')
        .eq('premise_id', premise.id).eq('is_active', true).eq('channel', 'both').limit(1).maybeSingle()
      device = bothDevice
    }
    const deviceIdCode = device?.device_id ?? 'RACUNKO01'

    // POPRAVLJENO (revizija K4, oktober 2026): EN vir stevilk - next_invoice_number,
    // isti kot blagajna (api/furs/invoice, lib/pos-stripe) in storno. Prej je portal
    // klical get_next_pos_invoice_number (star, LOCEN stevec) oziroma za napravo s
    // kanalom 'web' globalno zaporedje web_invoice_seq (skupno VSEM organizacijam).
    // Pri nacinu "device" je zato ista stevilka nastala dvakrat (test s.p.:
    // SIRBFB01-RACUNKO01-2 in -3, POS + Stripe). next_invoice_number upošteva
    // organizations.numbering_mode in rabi prostor ter napravo.
    // Stevilka se dodeli PO PODJETJU (16.8.2026); organizacija brez blagajne
    // uporablja svoj id.
    const { data: orgRow } = await supabase
      .from('organizations').select('pos_business_id').eq('id', orgId).maybeSingle()
    const { data: seqData, error: seqError } = await supabase.rpc('next_invoice_number', {
      p_business_id: orgRow?.pos_business_id ?? orgId,
      p_premise_id: premise.id,
      p_device_id: device?.id ?? null,
      p_leto: null,
    })
    if (seqError) {
      await sprosti()
      return { success: false, error: 'Napaka pri generiranju stevilke racuna: ' + seqError.message }
    }
    return { premiseId: premise.premise_id as string, deviceId: deviceIdCode as string, sequence: seqData as number }
  }

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
    // PRELET 326: dobropisi imajo postavke lahko z negativno ALI pozitivno
    // ceno (skupni znesek je vedno negativen). Prej je negativna vsota
    // postavk skupaj z negativnim predznakom dala POZITIVEN DDV za dobropis.
    // Zdaj postavke najprej normaliziramo na pozitivno smer, predznak pa
    // doloci izkljucno skupni znesek racuna.
    const smerPostavk = vsotaPostavk < 0 ? -1 : 1
    const vsotaAbs = Math.abs(vsotaPostavk)
    const faktor = vsotaAbs > 0 ? Math.abs(znesekSkupaj) / vsotaAbs : 1
    const predznak = znesekSkupaj < 0 ? -1 : 1
    vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
      const b = bruto * smerPostavk * faktor
      const net = rate > 0 ? b / (1 + rate / 100) : b
      return {
        rate,
        net: predznak * Math.round(net * 100) / 100,
        vat: predznak * Math.round((b - net) * 100) / 100,
      }
    }).sort((a, b) => b.rate - a.rate)
  }

  // Certifikat PRED rezervacijo stevilke (napacno geslo ne porabi stevilke).
  let kljuci: { privateKeyPem: string; certificatePem: string }
  try { kljuci = kljuc(cert) } catch (e: any) {
    await sprosti()
    return { success: false, error: 'FURS certifikata ni mogoče odpreti (geslo?): ' + (e?.message || e) }
  }
  const { privateKeyPem, certificatePem } = kljuci
  let rez: FursRezervacija
  if (obstojeca) {
    rez = obstojeca
  } else {
    const st = await novaStevilka()
    if (!('sequence' in st)) return st
    const issued = invoice.issue_date ? new Date(invoice.issue_date) : new Date()
    const zoi = calculateZoi(
      { taxNumber: org.tax_number, premiseId: st.premiseId, deviceId: st.deviceId, privateKeyPem, certificatePem, isTest: org?.furs_test_mode ?? true },
      { invoiceNumber: st.sequence, issueDateTime: issued, amountTotal: znesekSkupaj, paymentType, invoiceType: invoice.invoice_type === 'credit_note' ? 'credit_note' : 'invoice' },
    )
    rez = { ...st, invoiceNumber: `${st.premiseId}-${st.deviceId}-${st.sequence}`, zoi, issuedAt: issued.toISOString() }
    // Rezervacija na racun PRED klicem FURS. Ce je ni mogoce shraniti, FURS
    // NE klicemo (stevilka bi se izgubila brez sledi).
    const { error: rezErr } = await supabase.from('issued_invoices').update({ furs_rezervacija: rez }).eq('id', invoiceId)
    if (rezErr) { await sprosti(); return { success: false, error: 'Davčne številke ni bilo mogoče shraniti: ' + rezErr.message } }
  }
  const sequenceNumber = rez.sequence
  const invoiceNumberFull = rez.invoiceNumber

  const fursData: FursInvoiceData = {
    invoiceNumber: sequenceNumber,
    issueDateTime: new Date(rez.issuedAt),
    amountTotal: znesekSkupaj,
    vatBreakdown,
    paymentType,
    invoiceType: invoice.invoice_type === 'credit_note' ? 'credit_note' : 'invoice',
    presetZoi: rez.zoi,
    ...(obstojeca ? { subsequentSubmit: true } : {}),
  }

  const config: FursConfig = {
    taxNumber: org.tax_number,
    premiseId: rez.premiseId,
    deviceId: rez.deviceId,
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
        premiseId: rez.premiseId,
        deviceId: rez.deviceId,
        paymentType,
        naknadno: !!obstojeca,
      },
    })
    .select('id')
    .single()

  let result: Awaited<ReturnType<typeof confirmWithFurs>>
  try {
    result = await posli(config, fursData)
  } catch (e: any) {
    result = { success: false, zoi: rez.zoi, eor: null, errorMessage: e?.message || 'Povezava s FURS ni uspela', responseTime: null } as any
  }

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
  await sprosti()

  return {
    success: false,
    error: result.errorMessage ?? undefined,
    offlineMode: !!(result.errorMessage?.includes('Timeout') || result.errorMessage?.includes('offline')),
    zoi: result.zoi,
    invoiceNumber: invoiceNumberFull,
  }
}
