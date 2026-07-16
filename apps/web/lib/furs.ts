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
import { SignedXml } from 'xml-crypto'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const forgeForKeyInfo = require('node-forge')

/**
 * Zgradi obogaten KeyInfo z X509IssuerSerial (izdajatelj + serijska stevilka),
 * ne le golim X509Certificate. Dodano 16.7.2026 - FURS dosledno vraca S004
 * "Identifikator digitalnega potrdila ni ustrezen" ne glede na uporabljen
 * certifikat, kar kaze na strukturno manjkajoc del v KeyInfo, ne na napacen
 * certifikat. FURS SAM v svojih (podpisanih) odgovorih vedno vkljuci
 * X509IssuerSerial poleg X509Certificate - podpis nasih zahtevkov je prej
 * vseboval samo golo X509Certificate (privzeto vedenje xml-crypto knjiznice).
 */
function buildX509KeyInfoXml(certificatePem: string): string {
  const cert = forgeForKeyInfo.pki.certificateFromPem(certificatePem)
  // RFC2253-slog: najbolj specificen atribut (CN) najprej - obratno od
  // vrstnega reda, kot ga forge privzeto prebere iz certifikata.
  const issuerName = [...cert.issuer.attributes]
    .reverse()
    .map((a: any) => `${a.shortName || a.name}=${a.value}`)
    .join(',')
  const serialDecimal = BigInt('0x' + cert.serialNumber).toString()
  const certBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '')
  return `<X509Data><X509IssuerSerial><X509IssuerName>${issuerName}</X509IssuerName><X509SerialNumber>${serialDecimal}</X509SerialNumber></X509IssuerSerial><X509Certificate>${certBase64}</X509Certificate></X509Data>`
}

class FursKeyInfoProvider {
  certificatePem: string
  constructor(certificatePem: string) { this.certificatePem = certificatePem }
  getKeyInfo(): string { return buildX509KeyInfoXml(this.certificatePem) }
  getKey(): never { throw new Error('getKey ni implementiran - uporablja se samo za podpisovanje, ne preverjanje') }
}

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
  const { taxNumber, premiseId, deviceId, privateKeyPem, certificatePem } = config
  const dt = data.issueDateTime
  const pad = (n: number) => String(n).padStart(2, '0')
  const isoDate = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  const sendIso = new Date().toISOString().split('.')[0]

  // KLJUCNO (popravljeno 15.7.2026 po FURS kontroli, ErrorCode S001 "Sporocilo ni
  // v skladu s shemo XML"): elementi morajo biti tocno PascalCase (InvoiceRequest,
  // Header, Invoice - NE invoiceRequest/header/invoice), TaxesPerSeller ne sme biti
  // podvojeno gnezden in MORA vsebovati VAT razclenitev (obvezno, ce obstaja DDV),
  // in ne obstajata elementa PaymentType niti SignatureInfo/Certificate - to so bili
  // izmisljeni tagi, ki jih uradna shema (TehnicnaDokumentacijaVer3.1.pdf) ne pozna.
  // Davcna stevilka MORA biti samo 8 mest, brez "SI" predpone.
  const cleanTaxNumber = taxNumber.replace(/^SI/i, '').trim()
  const netAmount = Math.round((data.amountTotal / 1.22) * 100) / 100
  const vatAmount = Math.round((data.amountTotal - netAmount) * 100) / 100

  const invoiceXml = `<fu:InvoiceRequest xmlns:fu="http://www.fu.gov.si/" Id="data">
    <fu:Header>
      <fu:MessageID>${crypto.randomUUID()}</fu:MessageID>
      <fu:DateTime>${sendIso}</fu:DateTime>
    </fu:Header>
    <fu:Invoice>
      <fu:TaxNumber>${cleanTaxNumber}</fu:TaxNumber>
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
        <fu:VAT>
          <fu:TaxRate>22.00</fu:TaxRate>
          <fu:TaxableAmount>${netAmount.toFixed(2)}</fu:TaxableAmount>
          <fu:TaxAmount>${vatAmount.toFixed(2)}</fu:TaxAmount>
        </fu:VAT>
      </fu:TaxesPerSeller>
      <fu:OperatorTaxNumber>${cleanTaxNumber}</fu:OperatorTaxNumber>
      <fu:ProtectedID>${zoi}</fu:ProtectedID>
    </fu:Invoice>
  </fu:InvoiceRequest>`

  // Pravo XML-DSig podpisovanje (enveloped signature) - algoritmi so razvidni
  // iz PRAVEGA FURS odgovora (isti CanonicalizationMethod/SignatureMethod/DigestMethod,
  // ki jih FURS uporablja za podpis svojih odgovorov).
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  })
  sig.addReference({
    xpath: "//*[@Id='data']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
  })
  sig.computeSignature(invoiceXml, {
    location: { reference: "//*[local-name(.)='Invoice']", action: 'after' },
  })
  let signedInvoiceXml = sig.getSignedXml()
  // KLJUCNO (popravljeno 16.7.2026): xml-crypto keyInfoProvider mehanizem se ni
  // zanesljivo uveljavil, zato KeyInfo neposredno zamenjamo z nizovno zamenjavo PO
  // podpisu. To je varno, ker enveloped-signature transformacija pri izracunu
  // digesta izkljuci celoten <Signature> element (torej tudi <KeyInfo> znotraj
  // njega) - sprememba KeyInfo po podpisu NE pokvari veljavnosti podpisa.
  // FURS dosledno vraca S004 "Identifikator digitalnega potrdila ni ustrezen" z
  // golim <X509Certificate>, medtem ko FURS SAM v svojih odgovorih vedno vkljuci
  // <X509IssuerSerial> (izdajatelj+serijska) poleg certifikata.
  {
    const enrichedKeyInfo = buildX509KeyInfoXml(config.certificatePem)
    const bareKeyInfoPattern = /<KeyInfo><X509Data><X509Certificate>[^<]*<\/X509Certificate><\/X509Data><\/KeyInfo>/
    if (bareKeyInfoPattern.test(signedInvoiceXml)) {
      signedInvoiceXml = signedInvoiceXml.replace(bareKeyInfoPattern, `<KeyInfo>${enrichedKeyInfo}</KeyInfo>`)
    } else {
      console.warn('OPOZORILO: bare KeyInfo vzorec ni najden za zamenjavo - preveri obliko podpisanega XML')
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    ${signedInvoiceXml}
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
    console.log('FURS outgoing XML request:', xmlRequest)

    // 3. FURS endpoint — prek Supabase Edge Function proxy (Vercel blokira port 9002)
    const VPS_URL = 'http://152.89.232.145:8787'
    
    const endpoint = VPS_URL

    // 4. Pošlji prek Supabase proxy
    const proxyResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'racunko-furs-2026',
      },
      body: JSON.stringify({ soapBody: xmlRequest, isTest: config.isTest, clientCert: config.certificatePem, clientKey: config.privateKeyPem, soapAction: "/invoices" }),
      signal: AbortSignal.timeout(15000),
    })
    const proxyRaw = await proxyResp.text()
    console.log('FURS proxy raw:', proxyRaw)
    let proxyData: any = {}
    try { proxyData = JSON.parse(proxyRaw) } catch { proxyData = { error: proxyRaw } }
    console.log('FURS proxy data:', JSON.stringify(proxyData))
    if (proxyData.error) {
      const errMsg = String(proxyData.error)
      if (errMsg.includes('SSL') || errMsg.includes('ssl') || errMsg.includes('decryption') || errMsg.includes('record mac')) {
        throw new Error('SSL napaka pri FURS: Certifikat ni veljaven ali ni registriran pri FURS. Preverite ali imate pravi TaxCA certifikat in ali je blagajna registrirana pri FURS.')
      }
      throw new Error('Proxy napaka: ' + proxyData.error)
    }
    const response = { ok: (proxyData.status ?? 0) >= 200 && (proxyData.status ?? 0) < 300, status: proxyData.status ?? 0, text: async () => proxyData.body ?? '' }

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
    const fursError = extractFursError(responseText)
    if (fursError) {
      return {
        success: false,
        zoi,
        eor: null,
        errorMessage: `FURS je zavrnil racun [${fursError.code}]: ${fursError.message}`,
        responseTime: new Date(),
      }
    }
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
  // KLJUCNO (popravljeno 15.7.2026 po FURS kontroli): NIKOLI ne padati nazaj na
  // "katerikoli GUID v odgovoru" - to je prej napacno zajelo <fu:MessageID> iz
  // fu:Error odgovora in ga zamenjalo za pravi EOR, s cimer je aplikacija racune,
  // ki jih je FURS DEJANSKO ZAVRNIL (npr. ErrorCode S001), oznacila kot uspesno
  // potrjene. Ce pravega EOR taga ni v odgovoru, VRNI null - klicatelj (confirmWithFurs)
  // mora to obravnavati kot neuspeh, ne uganjevati.
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
  return null
}

/**
 * Izvleci FURS napako (fu:Error/ErrorCode/ErrorMessage) iz odgovora, ce obstaja.
 * Dodano 15.7.2026 - prej je bila taka napaka tiho prezrta, kar je povzrocilo,
 * da so bili zavrnjeni racuni napacno oznaceni kot potrjeni.
 */
function extractFursError(xml: string): { code: string; message: string } | null {
  const codeMatch = xml.match(/<fu:ErrorCode>([^<]+)<\/fu:ErrorCode>/) || xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/)
  const msgMatch = xml.match(/<fu:ErrorMessage>([^<]+)<\/fu:ErrorMessage>/) || xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)
  if (codeMatch?.[1]) {
    return { code: codeMatch[1].trim(), message: msgMatch?.[1]?.trim() || 'Neznana FURS napaka' }
  }
  return null
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


// ===== PRIJAVA POSLOVNEGA PROSTORA (BusinessPremiseRequest) =====
// Dodano 15.7.2026 po FURS kontroli - ErrorCode S006 "Podatki o poslovnem
// prostoru niso posredovani". Poslovni prostor MORA biti prijavljen prek tega
// sporocila PREDEN se lahko zanj potrjujejo racuni (locen korak od InvoiceRequest).
// Struktura po uradni FURS specifikaciji (TehnicnaDokumentacijaVer1.0.pdf, 3.2.1-3.2.3).

export interface FursPremiseData {
  businessPremiseId: string
  cadastralNumber: string
  buildingNumber: string
  buildingSectionNumber: string
  street: string
  houseNumber: string
  houseNumberAdditional?: string
  community: string
  city: string
  postalCode: string
  validityDate: string // YYYY-MM-DD
  softwareSupplierTaxNumber: string
  specialNotes?: string
}

function buildBusinessPremiseRequest(
  config: FursConfig,
  premise: FursPremiseData,
): string {
  const cleanTaxNumber = config.taxNumber.replace(/^SI/i, '').trim()

  const premiseXml = `<fu:BusinessPremiseRequest xmlns:fu="http://www.fu.gov.si/" Id="data">
    <fu:Header>
      <fu:MessageID>${crypto.randomUUID()}</fu:MessageID>
      <fu:DateTime>${new Date().toISOString().split('.')[0]}</fu:DateTime>
    </fu:Header>
    <fu:BusinessPremise>
      <fu:TaxNumber>${cleanTaxNumber}</fu:TaxNumber>
      <fu:BusinessPremiseID>${premise.businessPremiseId}</fu:BusinessPremiseID>
      <fu:BPIdentifier>
        <fu:RealEstateBP>
          <fu:PropertyID>
            <fu:CadastralNumber>${premise.cadastralNumber}</fu:CadastralNumber>
            <fu:BuildingNumber>${premise.buildingNumber}</fu:BuildingNumber>
            <fu:BuildingSectionNumber>${premise.buildingSectionNumber}</fu:BuildingSectionNumber>
          </fu:PropertyID>
          <fu:Address>
            <fu:Street>${premise.street}</fu:Street>
            <fu:HouseNumber>${premise.houseNumber}</fu:HouseNumber>
            ${premise.houseNumberAdditional ? `<fu:HouseNumberAdditional>${premise.houseNumberAdditional}</fu:HouseNumberAdditional>` : ''}
            <fu:Community>${premise.community}</fu:Community>
            <fu:City>${premise.city}</fu:City>
            <fu:PostalCode>${premise.postalCode}</fu:PostalCode>
          </fu:Address>
        </fu:RealEstateBP>
      </fu:BPIdentifier>
      <fu:ValidityDate>${premise.validityDate}</fu:ValidityDate>
      <fu:SoftwareSupplier>
        <fu:TaxNumber>${premise.softwareSupplierTaxNumber.replace(/^SI/i, '').trim()}</fu:TaxNumber>
      </fu:SoftwareSupplier>
      ${premise.specialNotes ? `<fu:SpecialNotes>${premise.specialNotes}</fu:SpecialNotes>` : ''}
    </fu:BusinessPremise>
  </fu:BusinessPremiseRequest>`

  const sig = new SignedXml({
    privateKey: config.privateKeyPem,
    publicCert: config.certificatePem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  })
  sig.addReference({
    xpath: "//*[@Id='data']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
  })
  sig.computeSignature(premiseXml, {
    location: { reference: "//*[local-name(.)='BusinessPremise']", action: 'after' },
  })
  let signedPremiseXml = sig.getSignedXml()
  // Enak popravek kot pri buildFursRequest - glej obrazlozitev tam.
  {
    const enrichedKeyInfo = buildX509KeyInfoXml(config.certificatePem)
    const bareKeyInfoPattern = /<KeyInfo><X509Data><X509Certificate>[^<]*<\/X509Certificate><\/X509Data><\/KeyInfo>/
    if (bareKeyInfoPattern.test(signedPremiseXml)) {
      signedPremiseXml = signedPremiseXml.replace(bareKeyInfoPattern, `<KeyInfo>${enrichedKeyInfo}</KeyInfo>`)
    } else {
      console.warn('OPOZORILO: bare KeyInfo vzorec ni najden v premise XML za zamenjavo')
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    ${signedPremiseXml}
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Prijavi poslovni prostor pri FURS. Klice se ENKRAT (ali ob spremembi podatkov
 * o prostoru) - ne ob vsakem racunu. Uporablja isti proxy in isti nacin podpisovanja
 * kot confirmWithFurs.
 *
 * OPOMBA: soapAction '/premises' je najboljsa ocena poti na proxy strezniku
 * (po analogiji z '/invoices') - ce proxy uporablja drugacno pot za prijavo
 * poslovnega prostora, jo bo treba preveriti/prilagoditi neposredno na VPS-u.
 */
export async function confirmBusinessPremiseWithFurs(
  config: FursConfig,
  premise: FursPremiseData,
): Promise<FursResult> {
  try {
    const xmlRequest = buildBusinessPremiseRequest(config, premise)
    console.log('FURS outgoing BusinessPremiseRequest XML:', xmlRequest)

    const VPS_URL = 'http://152.89.232.145:8787'
    const proxyResp = await fetch(VPS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'racunko-furs-2026',
      },
      body: JSON.stringify({
        soapBody: xmlRequest,
        isTest: config.isTest,
        clientCert: config.certificatePem,
        clientKey: config.privateKeyPem,
        soapAction: '/invoices/register', // pravilna vrednost iz uradnega FURS WSDL (FiscalVerification.wsdl)
      }),
      signal: AbortSignal.timeout(15000),
    })
    const proxyRaw = await proxyResp.text()
    console.log('FURS proxy raw (premise):', proxyRaw)
    let proxyData: any = {}
    try { proxyData = JSON.parse(proxyRaw) } catch { proxyData = { error: proxyRaw } }

    if (proxyData.error) {
      return {
        success: false,
        zoi: null,
        eor: null,
        errorMessage: 'Proxy napaka: ' + proxyData.error,
        responseTime: new Date(),
      }
    }
    // KLJUCNO (popravljeno po napacni "lazno pozitivni" prijavi prostora): preveri
    // ok/status PREDEN sklepamo o uspehu - proxy lahko vrne HTTP napako (npr. 404
    // "Napacni parametri vnosa") ki ni FURS <fu:Error>, ampak pomeni da sporocilo
    // sploh ni doseglo FURS.
    if (proxyData.ok === false || (proxyData.status && (proxyData.status < 200 || proxyData.status >= 300))) {
      return {
        success: false,
        zoi: null,
        eor: null,
        errorMessage: `Proxy je zavrnil zahtevo (status ${proxyData.status}): ${proxyData.body}`,
        responseTime: new Date(),
      }
    }

    const responseText: string = proxyData.body ?? ''
    const fursError = extractFursError(responseText)
    if (fursError) {
      return {
        success: false,
        zoi: null,
        eor: null,
        errorMessage: `FURS je zavrnil prijavo prostora [${fursError.code}]: ${fursError.message}`,
        responseTime: new Date(),
      }
    }

    // Uspesen odgovor na BusinessPremiseRequest nima EOR/ZOI - samo potrditev brez napake.
    return {
      success: true,
      zoi: null,
      eor: null,
      errorMessage: null,
      responseTime: new Date(),
    }
  } catch (err: any) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    return {
      success: false,
      zoi: null,
      eor: null,
      errorMessage: isTimeout ? 'FURS: Timeout (15s)' : `Napaka: ${err.message}`,
      responseTime: new Date(),
    }
  }
}
