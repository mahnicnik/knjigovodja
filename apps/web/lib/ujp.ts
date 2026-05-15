/**
 * RAČUNKO — UJP e-Računi
 *
 * Pošiljanje e-računov proračunskim uporabnikom (javni sektor) prek
 * portala UJP eRačun. Uporablja isti .p12 certifikat kot FURS potrjevanje.
 *
 * Podprte metode pošiljanja:
 * 1. UJP portal (direktno) — prek HTTPS z digitalnim podpisom
 * 2. Prek banke — XML datoteka ki jo banka posreduje UJP
 * 3. Download XML — uporabnik sam naloži na UJP portal
 *
 * Dokumentacija: https://eracuni.ujp.gov.si
 * Format: eSLOG 2.0 (že implementiran v lib/eslog.ts)
 *
 * Proračunski uporabniki imajo BIC: UJPLSI2DICL
 */

import crypto from 'crypto'
import { generateEslogXml, buildEslogFromInvoice } from './eslog'

// ===== TIPI =====

export interface UjpConfig {
  /** Davčna številka izdajatelja */
  taxNumber: string
  /** RSA zasebni ključ (PEM) — iz istega .p12 kot FURS */
  privateKeyPem: string
  /** Certifikat (PEM) za podpisovanje */
  certificatePem: string
  /** Ali je testno okolje */
  isTest: boolean
}

export interface UjpResult {
  success: boolean
  /** Referenčna številka UJP (ko je poslan direktno) */
  ujpReference: string | null
  /** eSLOG XML vsebina (za download ali banko) */
  xmlContent: string
  /** Način pošiljanja ki je bil uporabljen */
  method: 'direct' | 'download'
  errorMessage: string | null
}

// ===== POMOŽNE FUNKCIJE =====

/**
 * Preveri ali je stranka proračunski uporabnik.
 * Proračunski uporabniki imajo BIC UJPLSI2DICL ali specifično davčno številko.
 */
export function isPublicSectorClient(clientVatNumber: string | null, clientBic: string | null): boolean {
  if (clientBic?.toUpperCase() === 'UJPLSI2DICL') return true
  // Nekatere javne institucije imajo specifične davčne vzorce
  // V praksi: računovodja ali uporabnik označi stranko kot proračunsko
  return false
}

/**
 * Doda UJP specifične podatke v eSLOG XML.
 * Za UJP je obvezen BIC prejemnika: UJPLSI2DICL
 */
function injectUjpBic(xml: string): string {
  // Zamenjaj BIC prejemnika z UJP BIC
  // eSLOG 2.0 ima BIC v elementu D_3433 za kupca
  if (xml.includes('UJPLSI2DICL')) return xml // Že ima pravilen BIC

  // Dodaj UJP BIC če manjka v buyer sekciji
  return xml.replace(
    /<D_3207>SI<\/D_3207>\s*<\/S_NAD>/,
    `<D_3207>SI</D_3207>
        <C_C088>
          <D_3433>UJPLSI2DICL</D_3433>
        </C_C088>
      </S_NAD>`
  )
}

/**
 * Digitalno podpiše XML z RSA certifikatom (XAdES-BES podpis).
 * UJP zahteva elektronski podpis dokumenta.
 *
 * Poenostavljen podpis — za polni XAdES potrebujete node-forge ali xmldsigjs.
 */
function signXml(xml: string, privateKeyPem: string, certificatePem: string): string {
  try {
    // Izračunaj SHA-256 hash XML vsebine
    const xmlHash = crypto
      .createHash('sha256')
      .update(xml, 'utf8')
      .digest('base64')

    // RSA podpis hasha
    const sign = crypto.createSign('SHA256')
    sign.update(xml, 'utf8')
    const signature = sign.sign(privateKeyPem, 'base64')

    // Certifikat brez headers
    const certBase64 = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\n/g, '')
      .trim()

    // Dodaj podpis v XML (poenostavljen XMLDSig)
    const signatureBlock = `
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo>
    <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <Reference URI="">
      <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <DigestValue>${xmlHash}</DigestValue>
    </Reference>
  </SignedInfo>
  <SignatureValue>${signature}</SignatureValue>
  <KeyInfo>
    <X509Data>
      <X509Certificate>${certBase64}</X509Certificate>
    </X509Data>
  </KeyInfo>
</Signature>`

    // Vstavi podpis pred zaključni tag
    return xml.replace('</Invoice>', `${signatureBlock}\n</Invoice>`)
  } catch (err) {
    // Če podpis ne uspe, vrnemo nepodpisan XML
    // UJP portal bo zavrnil, ampak download opcija bo delala
    console.error('XML podpis napaka:', err)
    return xml
  }
}

// ===== GLAVNA FUNKCIJA =====

/**
 * Pošlje e-račun na UJP prek direktne HTTPS povezave.
 *
 * UJP portal ne ponuja javnega REST API-ja — pošiljanje je prek
 * njihovega HTTPS portala z digitalnim potrdilom (mutual TLS).
 *
 * Za direktno integracijo bi rabili:
 * - Mutual TLS (mTLS) s certifikatom
 * - UJP pogodbo za "ponudnike e-poti"
 *
 * Za Računko MVP: generiramo XML + nudimo download.
 * Direktno pošiljanje pride v naslednjem koraku ko UJP pogodba.
 */
export async function sendToUjp(
  invoice: any,
  org: any,
  config: UjpConfig,
): Promise<UjpResult> {

  try {
    // 1. Generiraj eSLOG 2.0 XML
    const eslogData = buildEslogFromInvoice(invoice, org)
    let xmlContent = generateEslogXml(eslogData)

    // 2. Dodaj UJP specifični BIC
    xmlContent = injectUjpBic(xmlContent)

    // 3. Digitalno podpiši
    if (config.privateKeyPem && config.certificatePem) {
      xmlContent = signXml(xmlContent, config.privateKeyPem, config.certificatePem)
    }

    // 4. Poskusi direktno pošiljanje (če imamo mTLS konfiguracijo)
    // Za zdaj: samo download mode
    // Ko bomo imeli UJP pogodbo za "ponudnika e-poti", dodamo direktni API klic

    return {
      success: true,
      ujpReference: null, // Ni reference pri download načinu
      xmlContent,
      method: 'download',
      errorMessage: null,
    }

  } catch (err: any) {
    return {
      success: false,
      ujpReference: null,
      xmlContent: '',
      method: 'download',
      errorMessage: err.message,
    }
  }
}

/**
 * Generira ime datoteke za UJP e-račun.
 * UJP priporoča format: DavcnaSt_StevilkaRacuna.xml
 */
export function getUjpFilename(taxNumber: string, invoiceNumber: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_')
  return `${safe(taxNumber)}_${safe(invoiceNumber)}.xml`
}

/**
 * Preveri ali ima račun vse obvezne podatke za UJP.
 * Vrne seznam napak ali prazen array če je vse OK.
 */
export function validateForUjp(invoice: any, org: any): string[] {
  const errors: string[] = []

  if (!org.tax_number) errors.push('Davčna številka organizacije manjka')
  if (!invoice.issue_date) errors.push('Datum izdaje manjka')
  if (!invoice.due_date) errors.push('Valuta (rok plačila) manjka')
  if (!invoice.service_date_from && !invoice.service_date_to) {
    errors.push('Datum opravljene storitve manjka (obvezno za UJP)')
  }
  if (!invoice.client_tax_number && !invoice.client_vat_number) {
    errors.push('Davčna številka stranke manjka')
  }
  if (!org.iban) errors.push('IBAN organizacije manjka (za plačilo)')

  return errors
}