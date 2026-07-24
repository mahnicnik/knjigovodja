/**
 * RAČUNKO — eSLOG 2.0 XML Generator
 *
 * Generira XML e-račun po standardu eSLOG 2.0, ki je skladen z
 * evropskim standardom EN 16931-1 in slovenskimi zahtevami GZS.
 *
 * Standard: e-SLOG 2.0 Elektronski račun (GZS / ROSE projekt)
 * Sintaksa: UN/EDIFACT INVOIC D01B → XML po ISO/TS 20625:2002
 *
 * Pokriva:
 * - Navadni račun (tip 380)
 * - Predračun / proforma (tip 386)
 * - Dobropis / storno (tip 381)
 *
 * Obvezni elementi (M) so vedno prisotni.
 * Pogojni elementi (C/R) se dodajo glede na podatke.
 *
 * Opomba: Elektronski podpis (xmldsig) je priporočljiv ampak
 * ni obvezen za pošiljanje B2B. Za javni sektor (UJP) ga nekateri zahtevajo.
 */

export interface EslogOrg {
    name: string
    taxNumber: string | null      // Davčna številka (brez SI predpone)
    vatNumber: string | null      // DDV ID (z SI predpono, npr SI12345678)
    address: string | null        // Ulica in hišna številka
    postalCode: string | null
    city: string | null
    country: string               // ISO 3166-1 alpha-2, npr 'SI'
    iban: string | null           // TRR za plačilo
    bic: string | null            // BIC/SWIFT banke
  }
  
  export interface EslogLineItem {
    lineNumber: number
    description: string
    quantity: number
    unitCode: string              // UN/ECE rec 20: C62=kos, HUR=ura, MTQ=m3, KGM=kg, MTR=m
    unitPrice: number             // Cena brez DDV
    amountNet: number             // Znesek brez DDV (quantity × unitPrice)
    vatRate: number               // DDV stopnja v % (22, 9.5, 0)
    vatAmount: number             // DDV znesek
    amountGross: number           // Znesek z DDV
  }
  
  export interface EslogInvoice {
    // Identifikacija
    invoiceNumber: string
    invoiceType: 'invoice' | 'proforma' | 'credit_note'
    issueDate: string             // 'YYYY-MM-DD'
    dueDate: string | null        // 'YYYY-MM-DD'
    serviceDate: string | null    // Datum opravljene storitve 'YYYY-MM-DD'
    serviceDateFrom: string | null
    serviceDateTo: string | null
    reference: string | null      // Sklic / referenca
  
    // Stranki
    seller: EslogOrg
    buyer: EslogOrg
  
    // Postavke
    lineItems: EslogLineItem[]
  
    // Skupaj
    amountNet: number             // Skupaj brez DDV
    vatAmount: number             // DDV skupaj
    amountTotal: number           // Skupaj z DDV
  
    // DDV razčlenitev po stopnjah
    vatBreakdown: Array<{
      rate: number                // Stopnja v %
      taxableAmount: number       // Osnova
      vatAmount: number           // DDV znesek
    }>
  
    // Opombe
    notes: string | null
  
    // FURS (za davčno potrjevanje — opcijsko)
    zoi: string | null
    eor: string | null
  }
  
  // ===== POMOŽNE FUNKCIJE =====
  
  function formatDate(d: string | null): string {
    if (!d) return ''
    return d.replace(/-/g, '')   // CCYYMMDD format (102)
  }
  
  function formatAmount(n: number): string {
    return n.toFixed(2)
  }
  
  function formatQty(n: number): string {
    // Do 6 decimal places for quantities
    return n % 1 === 0 ? n.toString() : n.toFixed(6).replace(/\.?0+$/, '')
  }
  
  function escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
  
  function invoiceTypeCode(t: EslogInvoice['invoiceType']): string {
    switch (t) {
      case 'invoice':     return '380'
      case 'proforma':    return '386'
      case 'credit_note': return '381'
      default:            return '380'
    }
  }
  
  function buildNAD(role: 'SE' | 'BY', org: EslogOrg): string {
    const taxRef = org.taxNumber
      ? `\n      <G_SG3>
          <S_RFF>
            <C_C506>
              <D_1153>FC</D_1153>
              <D_1154>${escapeXml(org.taxNumber)}</D_1154>
            </C_C506>
          </S_RFF>
        </G_SG3>` : ''
  
    const vatRef = org.vatNumber
      ? `\n      <G_SG3>
          <S_RFF>
            <C_C506>
              <D_1153>VA</D_1153>
              <D_1154>${escapeXml(org.vatNumber)}</D_1154>
            </C_C506>
          </S_RFF>
        </G_SG3>` : ''
  
    return `    <G_SG2>
        <S_NAD>
          <D_3035>${role}</D_3035>
          <C_C080>
            <D_3036>${escapeXml(org.name)}</D_3036>
          </C_C080>${org.address ? `
          <C_C059>
            <D_3042>${escapeXml(org.address)}</D_3042>
          </C_C059>` : ''}${org.city ? `
          <D_3164>${escapeXml(org.city)}</D_3164>` : ''}${org.postalCode ? `
          <D_3251>${escapeXml(org.postalCode)}</D_3251>` : ''}
          <D_3207>${org.country}</D_3207>
        </S_NAD>${taxRef}${vatRef}
      </G_SG2>`
  }
  
  function buildLineItem(item: EslogLineItem): string {
    // VAT category code
    const vatCat = item.vatRate === 0 ? 'Z' : 'S'
  
    return `    <G_SG26>
        <S_LIN>
          <D_1082>${item.lineNumber}</D_1082>
        </S_LIN>
        <S_IMD>
          <D_7077>F</D_7077>
          <C_C273>
            <D_7008>${escapeXml(item.description)}</D_7008>
          </C_C273>
        </S_IMD>
        <S_QTY>
          <C_C186>
            <D_6063>47</D_6063>
            <D_6060>${formatQty(item.quantity)}</D_6060>
            <D_6411>${item.unitCode}</D_6411>
          </C_C186>
        </S_QTY>
        <G_SG30>
          <S_PRI>
            <C_C509>
              <D_5125>AAA</D_5125>
              <D_5118>${formatAmount(item.unitPrice)}</D_5118>
              <D_5387>CAL</D_5387>
            </C_C509>
          </S_PRI>
        </G_SG30>
        <G_SG34>
          <S_MOA>
            <C_C516>
              <D_5025>203</D_5025>
              <D_5004>${formatAmount(item.amountNet)}</D_5004>
              <D_6345>EUR</D_6345>
            </C_C516>
          </S_MOA>
        </G_SG34>
        <G_SG37>
          <S_TAX>
            <D_5283>7</D_5283>
            <C_C241>
              <D_5153>VAT</D_5153>
            </C_C241>
            <C_C243>
              <D_5278>${formatAmount(item.vatRate)}</D_5278>
            </C_C243>
            <D_5305>${vatCat}</D_5305>
          </S_TAX>
          <S_MOA>
            <C_C516>
              <D_5025>124</D_5025>
              <D_5004>${formatAmount(item.vatAmount)}</D_5004>
              <D_6345>EUR</D_6345>
            </C_C516>
          </S_MOA>
        </G_SG37>
      </G_SG26>`
  }
  
  // ===== GLAVNA FUNKCIJA =====
  
  /**
   * Generira eSLOG 2.0 XML string za podan račun.
   *
   * Vrnjena vrednost je UTF-8 XML string ki ga pošljemo kot priponko
   * z imenom "{invoice_number}.xml"
   */
  export function generateEslogXml(inv: EslogInvoice): string {
    const typeCode = invoiceTypeCode(inv.invoiceType)
    const msgRef = inv.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '').substring(0, 14)
  
    // Payment terms — due date
    const paymentSection = inv.dueDate ? `
      <G_SG8>
        <S_PAT>
          <D_4279>1</D_4279>
          <C_C110>
            <D_4277>5</D_4277>
          </C_C110>
        </S_PAT>
        <S_DTM>
          <C_C507>
            <D_2005>13</D_2005>
            <D_2380>${formatDate(inv.dueDate)}</D_2380>
            <D_2379>102</D_2379>
          </C_C507>
        </S_DTM>
      </G_SG8>` : ''
  
    // Currency
    const currencySection = `
      <G_SG10>
        <S_CUX>
          <C_C504>
            <D_6347>2</D_6347>
            <D_6345>EUR</D_6345>
            <D_6343>4</D_6343>
          </C_C504>
        </S_CUX>
      </G_SG10>`
  
    // Bank account (payment instructions)
    const paymentInstructionSection = inv.seller.iban ? `
      <G_SG18>
        <S_FII>
          <D_3035>RB</D_3035>
          <C_C078>
            <D_3194>${escapeXml(inv.seller.iban)}</D_3194>
          </C_C078>${inv.seller.bic ? `
          <C_C088>
            <D_3433>${escapeXml(inv.seller.bic)}</D_3433>
          </C_C088>` : ''}
        </S_FII>
      </G_SG18>` : ''
  
    // Service date
    let serviceDateSection = ''
    if (inv.serviceDateFrom && inv.serviceDateTo) {
      serviceDateSection = `
      <S_DTM>
        <C_C507>
          <D_2005>194</D_2005>
          <D_2380>${formatDate(inv.serviceDateFrom)}</D_2380>
          <D_2379>102</D_2379>
        </C_C507>
      </S_DTM>
      <S_DTM>
        <C_C507>
          <D_2005>206</D_2005>
          <D_2380>${formatDate(inv.serviceDateTo)}</D_2380>
          <D_2379>102</D_2379>
        </C_C507>
      </S_DTM>`
    } else if (inv.serviceDate) {
      serviceDateSection = `
      <S_DTM>
        <C_C507>
          <D_2005>35</D_2005>
          <D_2380>${formatDate(inv.serviceDate)}</D_2380>
          <D_2379>102</D_2379>
        </C_C507>
      </S_DTM>`
    }
  
    // Notes / free text
    const notesSection = inv.notes ? `
      <S_FTX>
        <D_4451>AAI</D_4451>
        <C_C108>
          <D_4440>${escapeXml(inv.notes.substring(0, 512))}</D_4440>
        </C_C108>
      </S_FTX>` : ''
  
    // FURS reference (ZOI/EOR)
    const fursSection = inv.zoi ? `
      <G_SG1>
        <S_RFF>
          <C_C506>
            <D_1153>ZZZ</D_1153>
            <D_1154>${escapeXml(inv.zoi)}</D_1154>
          </C_C506>
        </S_RFF>
      </G_SG1>${inv.eor ? `
      <G_SG1>
        <S_RFF>
          <C_C506>
            <D_1153>ZZZ</D_1153>
            <D_1154>EOR:${escapeXml(inv.eor)}</D_1154>
          </C_C506>
        </S_RFF>
      </G_SG1>` : ''}` : ''
  
    // Line items
    const lineItemsXml = inv.lineItems.map(buildLineItem).join('\n')
  
    // VAT breakdown summary
    const vatBreakdownXml = inv.vatBreakdown.map(vb => {
      const vatCat = vb.rate === 0 ? 'Z' : 'S'
      return `    <G_SG52>
        <S_TAX>
          <D_5283>7</D_5283>
          <C_C241>
            <D_5153>VAT</D_5153>
          </C_C241>
          <C_C243>
            <D_5278>${formatAmount(vb.rate)}</D_5278>
          </C_C243>
          <D_5305>${vatCat}</D_5305>
        </S_TAX>
        <G_SG53>
          <S_MOA>
            <C_C516>
              <D_5025>58</D_5025>
              <D_5004>${formatAmount(vb.taxableAmount)}</D_5004>
              <D_6345>EUR</D_6345>
            </C_C516>
          </S_MOA>
          <S_MOA>
            <C_C516>
              <D_5025>124</D_5025>
              <D_5004>${formatAmount(vb.vatAmount)}</D_5004>
              <D_6345>EUR</D_6345>
            </C_C516>
          </S_MOA>
        </G_SG53>
      </G_SG52>`
    }).join('\n')
  
    // Reference (payment reference / sklic)
    const referenceSection = inv.reference ? `
      <G_SG1>
        <S_RFF>
          <C_C506>
            <D_1153>PQ</D_1153>
            <D_1154>${escapeXml(inv.reference)}</D_1154>
          </C_C506>
        </S_RFF>
      </G_SG1>` : ''
  
    return `<?xml version="1.0" encoding="UTF-8"?>
  <Invoice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <M_INVOIC>
      <S_UNH>
        <D_0062>1</D_0062>
        <C_S009>
          <D_0065>INVOIC</D_0065>
          <D_0052>D</D_0052>
          <D_0054>01B</D_0054>
          <D_0051>UN</D_0051>
          <D_0057>EAN010</D_0057>
        </C_S009>
      </S_UNH>
      <S_BGM>
        <C_C002>
          <D_1001>${typeCode}</D_1001>
        </C_C002>
        <C_C106>
          <D_1004>${escapeXml(inv.invoiceNumber)}</D_1004>
        </C_C106>
        <D_1225>9</D_1225>
      </S_BGM>
      <S_DTM>
        <C_C507>
          <D_2005>137</D_2005>
          <D_2380>${formatDate(inv.issueDate)}</D_2380>
          <D_2379>102</D_2379>
        </C_C507>
      </S_DTM>${serviceDateSection}${notesSection}${referenceSection}${fursSection}
  ${buildNAD('SE', inv.seller)}
  ${buildNAD('BY', inv.buyer)}${paymentInstructionSection}${paymentSection}${currencySection}
  ${lineItemsXml}
      <S_UNS>
        <D_0081>S</D_0081>
      </S_UNS>
      <G_SG48>
        <S_MOA>
          <C_C516>
            <D_5025>79</D_5025>
            <D_5004>${formatAmount(inv.amountTotal)}</D_5004>
            <D_6345>EUR</D_6345>
          </C_C516>
        </S_MOA>
        <S_MOA>
          <C_C516>
            <D_5025>125</D_5025>
            <D_5004>${formatAmount(inv.vatAmount)}</D_5004>
            <D_6345>EUR</D_6345>
          </C_C516>
        </S_MOA>
        <S_MOA>
          <C_C516>
            <D_5025>9</D_5025>
            <D_5004>${formatAmount(inv.amountNet)}</D_5004>
            <D_6345>EUR</D_6345>
          </C_C516>
        </S_MOA>
      </G_SG48>
  ${vatBreakdownXml}
      <S_UNZ>
        <D_0036>1</D_0036>
        <D_0020>${msgRef}</D_0020>
      </S_UNZ>
    </M_INVOIC>
  </Invoice>`
  }
  
  // ===== HELPER: Pripravi EslogInvoice iz Supabase podatkov =====
  
  export function buildEslogFromInvoice(
    invoice: any,
    org: any,
  ): EslogInvoice {
    const lineItems: EslogLineItem[] = (invoice.line_items ?? []).map((item: any, idx: number) => {
      const qty = Number(item.quantity ?? 1)
      const unitPrice = Number(item.unit_price ?? item.price ?? 0)
      const amountNet = Number(item.amount_net ?? unitPrice * qty)
      const vatRate = Number(item.vat_rate ?? invoice.vat_rate ?? 22)
      const vatAmount = Number(item.vat_amount ?? amountNet * vatRate / 100)
      return {
        lineNumber: idx + 1,
        description: item.description || item.name || `Postavka ${idx + 1}`,
        quantity: qty,
        unitCode: item.unit_code ?? 'C62',
        unitPrice,
        amountNet,
        vatRate,
        vatAmount,
        amountGross: amountNet + vatAmount,
      }
    })
  
    // Fallback: če ni line_items, naredi eno postavko iz totals
    if (lineItems.length === 0) {
      const amountNet = Number(invoice.amount_net ?? 0)
      const vatAmount = Number(invoice.vat_amount ?? 0)
      const vatRate = vatAmount > 0 ? Math.round(vatAmount / amountNet * 100) : 0
      lineItems.push({
        lineNumber: 1,
        description: invoice.notes || 'Storitve',
        quantity: 1,
        unitCode: 'C62',
        unitPrice: amountNet,
        amountNet,
        vatRate,
        vatAmount,
        amountGross: amountNet + vatAmount,
      })
    }
  
    // VAT breakdown po stopnjah
    const vatMap = new Map<number, { taxableAmount: number; vatAmount: number }>()
    for (const item of lineItems) {
      const existing = vatMap.get(item.vatRate) ?? { taxableAmount: 0, vatAmount: 0 }
      vatMap.set(item.vatRate, {
        taxableAmount: existing.taxableAmount + item.amountNet,
        vatAmount: existing.vatAmount + item.vatAmount,
      })
    }
    const vatBreakdown = Array.from(vatMap.entries()).map(([rate, v]) => ({
      rate, ...v,
    }))
  
    const seller: EslogOrg = {
      name: org.name,
      taxNumber: org.tax_number ?? null,
      // POPRAVLJENO (24.7.2026): org.tax_number je pogosto ZE shranjen s
      // predpono "SI" (npr. "SI91390419") - brezpogojno dodajanje se ene je
      // proizvedlo "SISI91390419" na UJP XML in PDF racunih. Zdaj odstrani
      // morebitno obstojeco predpono pred dodajanjem ene same.
      vatNumber: org.vat_registered && org.tax_number
        ? `SI${org.tax_number.replace(/^SI/i, '')}`
        : null,
      address: org.address ?? null,
      postalCode: org.postal_code ?? null,
      city: org.city ?? null,
      country: org.country ?? 'SI',
      iban: org.iban ?? null,
      bic: org.bic ?? null,
    }
  
    // Razčleni naslov stranke
    const buyerAddressParts = (invoice.client_address ?? '').split(',').map((s: string) => s.trim())
  
    const buyer: EslogOrg = {
      name: invoice.client_name,
      taxNumber: invoice.client_tax_number
        ? invoice.client_tax_number.replace(/^SI/, '')
        : null,
      vatNumber: invoice.client_vat_number ?? invoice.client_tax_number ?? null,
      address: buyerAddressParts[0] ?? null,
      postalCode: null,
      city: buyerAddressParts[1] ?? null,
      country: 'SI',
      iban: null,
      bic: null,
    }
  
    return {
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type === 'credit_note' ? 'credit_note'
        : invoice.invoice_type === 'proforma' ? 'proforma' : 'invoice',
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date ?? null,
      serviceDate: null,
      serviceDateFrom: invoice.service_date_from ?? null,
      serviceDateTo: invoice.service_date_to ?? null,
      reference: invoice.reference ?? null,
      seller,
      buyer,
      lineItems,
      amountNet: Number(invoice.amount_net),
      vatAmount: Number(invoice.vat_amount ?? 0),
      amountTotal: Number(invoice.amount_total),
      vatBreakdown,
      notes: invoice.notes ?? null,
      zoi: invoice.zoi ?? null,
      eor: invoice.eor ?? null,
    }
  }