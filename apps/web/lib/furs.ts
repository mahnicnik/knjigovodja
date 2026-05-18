/**
 * RAČUNKO — FURS Davčno potrjevanje
 *
 * Implementacija ZDavPR zakona (Zakon o davčnem potrjevanju računov).
 * Vsak gotovinski račun mora biti potrjen pri FURS pred izročitvijo stranki.
 *
 * Proces:
 * 1. Izračunamo ZOI (zaščitna oznaka izdajatelja) — MD5 hash
 * 2. Podpišemo zahtevo z RSA certifikatom izdajatelja
 * 3. Pošljemo na FURS API
 * 4. FURS vrne EOR (enkratna oznaka računa) — GUID
 * 5. ZOI + EOR natisnemo na račun
 *
 * FURS API:
 * - Test:  https://blagajne-test.fu.gov.si:9002/v1/cash_register/invoices
 * - Prod:  https://blagajne.fu.gov.si:9002/v1/cash_register/invoices
 *
 * Dokumentacija: https://www.fu.gov.si/davki_in_druge_dajatve/podrocja/davcne_blagajne/
 */

import crypto from 'crypto'

// ===== TIPI =====

export interface FursConfig {
  /** Davčna številka zavezanca (brez SI predpone) */
  taxNumber: string
  /** Oznaka poslovnega prostora (npr. "SIRBFB01") */
  premiseId: string
  /** Oznaka elektronske naprave (npr. "RACUNKO01") */
  deviceId: string
  /** RSA zasebni ključ iz certifikata (PEM format) */
  privateKeyPem: string
  /** Certifikat (PEM format) za identifikacijo */
  certificatePem: string
  /** Ali je testno okolje */
  isTest: boolean
}

export interface FursInvoiceData {
  /** Zaporedna številka računa pri napravi (integer, narašča) */
  invoiceNumber: number
  /** Datum in čas izdaje računa */
  issueDateTime: Date
  /** Skupni znesek računa v EUR */
  amountTotal: number
  /** Način plačila */
  paymentType: 'cash' | 'card' | 'voucher' | 'other'
  /** Tip računa */
  invoiceType: 'invoice' | 'credit_note'
}

export interface FursResult {
  success: boolean
  zoi: string | null
  eor: string | null
  errorMessage: string | null
  responseTime: Date | null
}

// ===== ZOI IZRAČUN =====

/**
 * Izračuna ZOI (zaščitna oznaka izdajatelja).
 *
 * ZOI = RSA podpis MD5 hasha specifičnih polj.
 *
 * Formula po ZDavPR:
 * content = taxNumber + issueDateTime + invoiceNumber + premiseId + deviceId + amountTotal
 * md5 = MD5(content)
 * ZOI = RSA-SHA256(md5, privateKey) → hex → MD5 → hex (32 znakov)
 *
 * Opomba: FURS specifikacija zahteva specifičen format datuma in zneska.
 */
export function calculateZoi(
  config: FursConfig,
  data: FursInvoiceData,
): string {
  const { taxNumber, premiseId, deviceId, privateKeyPem } = config

  // Format datuma: DD.MM.YYYY HH:MM:SS
  const dt = data.issueDateTime
  const dateStr = [
    String(dt.getDate()).padStart(2, '0'),
    String(dt.getMonth() + 1).padStart(2, '0'),
    dt.getFullYear(),
  ].join('.') + ' ' + [
    String(dt.getHours()).padStart(2, '0'),
    String(dt.getMinutes()).padStart(2, '0'),
    String(dt.getSeconds()).padStart(2, '0'),
  ].join(':')

  // Format zneska: 2 decimalni mesti, pika kot decimalni ločnik
  const amountStr = data.amountTotal.toFixed(2)

  // Zaporedna številka računa (string)
  const invoiceNumStr = String(data.invoiceNumber)

  // Vsebina za podpis
  const content = [
    taxNumber,
    dateStr,
    invoiceNumStr,
    premiseId,
    deviceId,
    amountStr,
  ].join('')

  // RSA podpis vsebine (node-forge za kompatibilnost)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forge = require('node-forge')
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
  const md = forge.md.sha256.create()
  md.update(content, 'utf8')
  const signatureBytes = privateKey.sign(md)
  const signature = forge.util.bytesToHex(signatureBytes)

  // ZOI = MD5 od RSA podpisa
  const zoi = crypto.createHash('md5').update(signature).digest('hex')

  return zoi
}

// ===== FURS API ZAHTEVA =====

/**
 * Zgradi XML zahtevo za FURS API.
 * Format: SOAP/XML po FURS specifikaciji ZDavPR.
 */
function buildFursRequest(
  config: FursConfig,
  data: FursInvoiceData,
  zoi: string,
): string {
  const { taxNumber, premiseId, deviceId, certificatePem } = config

  // Format za FURS: ISO 8601 z lokalno cono
  const dt = data.issueDateTime
  const pad = (n: number) => String(n).padStart(2, '0')
  const isoDate = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`

  // Tip plačila → FURS koda
  const paymentTypeCode: Record<string, string> = {
    cash: 'G',     // Gotovina
    card: 'KC',    // Kartica
    voucher: 'B',  // Bon
    other: 'DR',   // Drugo
  }
  const paymentCode = paymentTypeCode[data.paymentType] ?? 'DR'

  // Certifikat brez headers za vstavitev v XML
  const certBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\n/g, '')
    .trim()

  // Timestamp za podpis
  const timestamp = new Date().toISOString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fu="http://www.fu.gov.si/">
  <soapenv:Header/>
  <soapenv:Body>
    <fu:invoiceRequest>
      <fu:header>
        <fu:MessageID>${crypto.randomUUID()}</fu:MessageID>
        <fu:DateTime>${timestamp}</fu:DateTime>
      </fu:header>
      <fu:invoice>
        <fu:TaxNumber>${taxNumber}</fu:TaxNumber>
        <fu:IssueDateTime>${isoDate}</fu:IssueDateTime>
        <fu:NumberingStructure>B</fu:NumberingStructure>
        <fu:InvoiceIdentifier>
          <fu:BusinessPremiseID>${premiseId}</fu:BusinessPremiseID>
          <fu:ElectronicDeviceID>${deviceId}</fu:ElectronicDeviceID>
          <fu:InvoiceNumber>${data.invoiceNumber}</fu:InvoiceNumber>
        </fu:InvoiceIdentifier>
        <fu:InvoiceAmount>${data.amountTotal.toFixed(2)}</fu:InvoiceAmount>
        <fu:PaymentAmount>${data.amountTotal.toFixed(2)}</fu:PaymentAmount>
        <fu:TaxesPerSeller>
          <fu:TaxesPerSeller>
            <fu:SellerTaxNumber>${taxNumber}</fu:SellerTaxNumber>
          </fu:TaxesPerSeller>
        </fu:TaxesPerSeller>
        <fu:OperatorTaxNumber>${taxNumber}</fu:OperatorTaxNumber>
        <fu:ProtectedID>${zoi}</fu:ProtectedID>
        <fu:SignatureInfo>
          <fu:Certificate>${certBase64}</fu:Certificate>
          <fu:ProvidedSignatureInfo>
            <fu:Created>${timestamp}</fu:Created>
          </fu:ProvidedSignatureInfo>
        </fu:SignatureInfo>
        ${data.amountTotal > 0 ? `<fu:PaymentType>${paymentCode}</fu:PaymentType>` : ''}
      </fu:invoice>
    </fu:invoiceRequest>
  </soapenv:Body>
</soapenv:Envelope>`
}

// ===== FURS API KLIC =====

/**
 * Pošlje račun FURS in vrne EOR.
 *
 * V primeru napake NE ustavi procesa — račun se še vedno izda,
 * ampak označimo ga kot "FURS napaka" in ga pošljemo pozneje.
 *
 * Po zakonu imate 2 uri offline čas — po tem morate poslati.
 */
export async function confirmWithFurs(
  config: FursConfig,
  data: FursInvoiceData,
): Promise<FursResult> {
  const startTime = new Date()

  try {
    // 1. Izračunaj ZOI
    const zoi = calculateZoi(config, data)

    // 2. Zgradi XML zahtevo
    const xmlRequest = buildFursRequest(config, data, zoi)

    // 3. FURS endpoint — prek Supabase Edge Function proxy (Vercel blokira port 9002)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const endpoint = `${SUPABASE_URL}/functions/v1/furs-proxy`

    // 4. Pošlji prek Supabase proxy
    const proxyResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ soapBody: xmlRequest, isTest: config.isTest }),
      signal: AbortSignal.timeout(15000),
    })
    const proxyData = await proxyResp.json()
    const response = { ok: proxyData.status >= 200 && proxyData.status < 300, status: proxyData.status, text: async () => proxyData.body ?? '' }

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        zoi,
        eor: null,
        errorMessage: `FURS HTTP ${response.status}: ${errorText.substring(0, 200)}`,
        responseTime: new Date(),
      }
    }

    // 5. Razčleni odgovor
    const responseText = await response.text()
    const eor = extractEorFromResponse(responseText)

    if (!eor) {
      return {
        success: false,
        zoi,
        eor: null,
        errorMessage: `FURS: EOR ni v odgovoru. Response: ${responseText.substring(0, 200)}`,
        responseTime: new Date(),
      }
    }

    return {
      success: true,
      zoi,
      eor,
      errorMessage: null,
      responseTime: new Date(),
    }

  } catch (err: any) {
    // Timeout ali network napaka
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    return {
      success: false,
      zoi: null,
      eor: null,
      errorMessage: isTimeout
        ? 'FURS: Timeout (10s) — račun shranjen lokalno, poslati v 2 urah'
        : `FURS napaka: ${err.message}`,
      responseTime: new Date(),
    }
  }
}

/**
 * Izvleče EOR iz FURS XML odgovora.
 * EOR je GUID v formatu: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
function extractEorFromResponse(xml: string): string | null {
  // FURS vrne EOR v tagu <UniqueInvoiceID> ali <EOR>
  const patterns = [
    /<UniqueInvoiceID>([^<]+)<\/UniqueInvoiceID>/,
    /<EOR>([^<]+)<\/EOR>/,
    /<fu:UniqueInvoiceID>([^<]+)<\/fu:UniqueInvoiceID>/,
  ]

  for (const pattern of patterns) {
    const match = xml.match(pattern)
    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  // Fallback: poiščemo GUID pattern
  const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const guidMatch = xml.match(guidPattern)
  return guidMatch?.[0] ?? null
}

// ===== CERTIFIKAT HANDLING =====

/**
 * Izvleče zasebni ključ in certifikat iz .p12 (PKCS#12) datoteke.
 *
 * Vrne PEM format ki ga rabimo za ZOI podpis.
 *
 * Opomba: Node.js 18+ podpira crypto.X509Certificate in PKCS12.
 * Za starejše verzije rabimo 'node-forge' paket.
 */
export function extractFromP12(
  p12Buffer: Buffer,
  password: string,
): { privateKeyPem: string; certificatePem: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forge = require('node-forge')
    const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'))
    const p12Asn1 = forge.asn1.fromDer(p12Der)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    if (!keyBag?.key) throw new Error('Zasebni ključ ni najden')
    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key)
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = certBags[forge.pki.oids.certBag]?.[0]
    const certificatePem = certBag?.cert ? forge.pki.certificateToPem(certBag.cert) : ''
    return { privateKeyPem, certificatePem }
  } catch (e: any) {
    throw new Error('Napaka pri branju certifikata: ' + e.message)
  }
}

/**
 * Preveri ali je certifikat še veljaven.
 */
export function isCertificateValid(validTo: Date | null): boolean {
  if (!validTo) return true // Ne vemo — predpostavimo da je OK
  return new Date() < validTo
}

// ===== POMOŽNE FUNKCIJE =====

/**
 * Generira naslednje zaporedno številko računa za napravo.
 * FURS zahteva naraščajočo številko za vsako napravo posebej.
 *
 * V Računko jo hranimo v DB in incrementiramo pri vsakem FURS klicu.
 */
export function formatFursInvoiceNumber(sequence: number): string {
  // Format: samo integer, brez presledkov
  return String(sequence)
}

/**
 * Formatira ZOI za tiskanje na račun.
 * FURS zahteva: 32 znakov hexadecimalnih, brez presledkov.
 */
export function formatZoiForPrint(zoi: string): string {
  return zoi.toLowerCase().replace(/[^a-f0-9]/g, '').substring(0, 32)
}

/**
 * Formatira EOR za tiskanje na račun.
 * FURS vrne GUID — tiskamo ga v celoti.
 */
export function formatEorForPrint(eor: string): string {
  return eor.toUpperCase()
}

/**
 * Vrne FURS URL za preverjanje računa (za QR kodo na računu).
 * Stranka lahko skenira in preveri ali je račun potrjen.
 */
export function getFursVerificationUrl(zoi: string, issueDate: Date): string {
  const dateStr = [
    String(issueDate.getDate()).padStart(2, '0'),
    String(issueDate.getMonth() + 1).padStart(2, '0'),
    issueDate.getFullYear(),
  ].join('.')

  return `https://www.fu.gov.si/sklep/index.php?zoi=${zoi}&dat=${dateStr}`
}