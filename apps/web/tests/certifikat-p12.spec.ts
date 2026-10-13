import { test, expect } from '@playwright/test'
import { extractFromP12, readCertificateInfo, parseP12, razlogNapakeP12, calculateZoi } from '../lib/furs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const forge = require('node-forge')
const { pki, asn1 } = forge

/**
 * Branje FURS .p12 certifikata (13.10.2026, primer Peresuti).
 *
 * Certifikat, ki je deloval v Cebelci in v OpenSSL (MAC verified OK), je
 * Racunko zavrnil z "najverjetneje je geslo napacno". Vzrok: odvecni bajti
 * za koncem PKCS#12 strukture - node-forge jih privzeto ne dovoli.
 */

const GESLO = 'Test-geslo-123'

function ustvariCert(subject: { name?: string; shortName?: string; value: string }[], key: any, signer: any, ca = false) {
  const c = pki.createCertificate()
  c.publicKey = key.publicKey
  c.serialNumber = String(Math.floor(Math.random() * 1e8) + 1)
  c.validity.notBefore = new Date('2026-01-01T00:00:00Z')
  c.validity.notAfter = new Date('2031-01-01T00:00:00Z')
  c.setSubject(subject)
  c.setIssuer([{ name: 'countryName', value: 'SI' }, { name: 'commonName', value: 'TaxCA' }])
  c.setExtensions([{ name: 'basicConstraints', cA: ca }])
  c.sign(signer.privateKey, forge.md.sha256.create())
  return c
}

const uporabnik = pki.rsa.generateKeyPair(1024)
const izdajatelj = pki.rsa.generateKeyPair(1024)
const caCert = ustvariCert([{ name: 'countryName', value: 'SI' }, { name: 'commonName', value: 'TaxCA' }], izdajatelj, izdajatelj, true)
const pravnaOseba = ustvariCert([
  { name: 'countryName', value: 'SI' },
  { name: 'organizationName', value: 'state-institutions' },
  { shortName: 'OU', value: 'DavPotRac' },
  { shortName: 'OU', value: '55284396' },
  { name: 'commonName', value: 'PODJETJE D.O.O.' },
], uporabnik, izdajatelj)
const sp = ustvariCert([
  { name: 'countryName', value: 'SI' },
  { name: 'commonName', value: '12345678-1' },
], uporabnik, izdajatelj)

function p12(certs: any[]): Buffer {
  const der = asn1.toDer(forge.pkcs12.toPkcs12Asn1(uporabnik.privateKey, certs, GESLO, { algorithm: '3des' })).getBytes()
  return Buffer.from(der, 'binary')
}

const odvecniBajti = (b: Buffer) => Buffer.concat([b, Buffer.from('\r\n\x00\x00padding', 'binary')])

test('obicajen .p12 se prebere kot doslej', () => {
  const info = readCertificateInfo(p12([sp, caCert]), GESLO)
  expect(info.napaka).toBeNull()
  expect(info.taxNumber).toBe('12345678')
  expect(info.subject).toBe('12345678-1')
})

test('.p12 z odvecnimi bajti na koncu: forge ga strogo zavrne, Racunko ga prebere', () => {
  const datoteka = odvecniBajti(p12([pravnaOseba, caCert]))

  // Dokaz, da je to res tisti primer: strogo branje pade z isto napako kot pri stranki.
  expect(() => forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(datoteka.toString('binary')), GESLO))
    .toThrow(/Unparsed DER bytes/)

  const info = readCertificateInfo(datoteka, GESLO)
  expect(info.napaka).toBeNull()
  expect(info.subject).toBe('PODJETJE D.O.O.')

  const { privateKeyPem, certificatePem } = extractFromP12(datoteka, GESLO)
  expect(privateKeyPem).toBe(pki.privateKeyToPem(uporabnik.privateKey))
  expect(certificatePem).toBe(pki.certificateToPem(pravnaOseba))
})

test('popustljivo branje ne ostane vklopljeno za druge klice forge', () => {
  parseP12(odvecniBajti(p12([sp])), GESLO)
  expect(() => asn1.fromDer(odvecniBajti(p12([sp])).toString('binary'))).toThrow(/Unparsed DER bytes/)
})

test('pravna oseba: davcna stevilka iz OU, ko je v CN ime podjetja', () => {
  const info = readCertificateInfo(p12([pravnaOseba, caCert]), GESLO)
  expect(info.taxNumber).toBe('55284396')
})

test('vzame se certifikat, ki pripada kljucu, tudi ce je izdajatelj prvi', () => {
  const datoteka = p12([caCert, sp])
  expect(readCertificateInfo(datoteka, GESLO).subject).toBe('12345678-1')
  expect(extractFromP12(datoteka, GESLO).certificatePem).toBe(pki.certificateToPem(sp))
})

test('napacno geslo se loci od neberljive datoteke', () => {
  const napacno = readCertificateInfo(odvecniBajti(p12([sp])), 'napacno-geslo')
  expect(napacno.napaka).toBe('geslo')

  const smeti = readCertificateInfo(Buffer.from('to ni certifikat'), GESLO)
  expect(smeti.napaka).toBe('format')

  let razlog: string | undefined
  try { extractFromP12(p12([sp]), 'napacno-geslo') } catch (e: any) { razlog = e.razlog }
  expect(razlog).toBe('geslo')
  expect(razlogNapakeP12(new Error('Too few bytes to read ASN.1 value.'))).toBe('format')
})

test('ZOI je enak ne glede na predpono SI pri davcni stevilki', () => {
  const privateKeyPem = pki.privateKeyToPem(uporabnik.privateKey)
  const osnova = { premiseId: 'PP1', deviceId: 'N1', privateKeyPem, certificatePem: '', isTest: true }
  const racun = {
    invoiceNumber: 7, issueDateTime: new Date('2026-10-13T10:00:00Z'), amountTotal: 12.5,
    paymentType: 'cash' as const, invoiceType: 'invoice' as const,
  }
  expect(calculateZoi({ ...osnova, taxNumber: 'Si55284396' }, racun))
    .toBe(calculateZoi({ ...osnova, taxNumber: '55284396' }, racun))
})
