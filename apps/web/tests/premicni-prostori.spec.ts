import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import forge from 'node-forge'
import { buildBusinessPremiseRequest, type FursConfig } from '../lib/furs'

/**
 * PREMICNI POSLOVNI PROSTORI (16.10.2026, migracija 187)
 *
 * Stojnica na trznici se pri FURS prijavi kot premicni prostor tipa A
 * (premicni objekt) ali B (objekt na stalni lokaciji) - BPIdentifier vsebuje
 * PremiseType namesto RealEstateBP. Brez baze in brez FURS.
 *
 * Zagon:  cd apps/web && npx playwright test tests/premicni-prostori.spec.ts
 */

const KOREN = join(__dirname, '..')
const REPO = join(KOREN, '..', '..')

// Samopodpisan testni certifikat - samo za sestavo in podpis XML.
function testniCertifikat() {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '0a1b2c'
  cert.validity.notBefore = new Date('2026-01-01')
  cert.validity.notAfter = new Date('2030-01-01')
  const attrs = [{ name: 'commonName', value: 'TEST' }, { name: 'countryName', value: 'SI' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) }
}

const { privateKeyPem, certificatePem } = testniCertifikat()
const config: FursConfig = { taxNumber: '12345678', premiseId: 'STOJ1', deviceId: 'TEL1', privateKeyPem, certificatePem, isTest: true } as FursConfig

test('premicni prostor tipa A: PremiseType A, brez RealEstateBP', () => {
  const xml = buildBusinessPremiseRequest(config, {
    businessPremiseId: 'STOJ1', movableType: 'A', validityDate: '2026-10-16', softwareSupplierTaxNumber: '91390419',
  })
  expect(xml).toContain('<fu:BusinessPremiseID>STOJ1</fu:BusinessPremiseID><fu:BPIdentifier><fu:PremiseType>A</fu:PremiseType></fu:BPIdentifier><fu:ValidityDate>2026-10-16</fu:ValidityDate>')
  expect(xml).not.toContain('RealEstateBP')
  expect(xml).not.toContain('undefined')
  expect(xml).toMatch(/SignatureValue>[A-Za-z0-9+\/=]{50,}/)
})

test('premicni prostor tipa B', () => {
  const xml = buildBusinessPremiseRequest(config, {
    businessPremiseId: 'TRZ2', movableType: 'B', validityDate: '2026-10-16', softwareSupplierTaxNumber: '91390419',
  })
  expect(xml).toContain('<fu:BPIdentifier><fu:PremiseType>B</fu:PremiseType></fu:BPIdentifier>')
})

test('nepremicnina ostane enaka kot prej (RealEstateBP s katastrom in naslovom)', () => {
  const xml = buildBusinessPremiseRequest(config, {
    businessPremiseId: 'SIRBFB01', cadastralNumber: '2345', buildingNumber: '1', buildingSectionNumber: '1',
    street: 'Poljanska cesta', houseNumber: '55', community: 'Gorenja vas', city: 'Gorenja vas', postalCode: '4224',
    validityDate: '2026-10-16', softwareSupplierTaxNumber: '91390419',
  })
  expect(xml).toContain('<fu:BPIdentifier><fu:RealEstateBP><fu:PropertyID><fu:CadastralNumber>2345</fu:CadastralNumber><fu:BuildingNumber>1</fu:BuildingNumber><fu:BuildingSectionNumber>1</fu:BuildingSectionNumber></fu:PropertyID><fu:Address><fu:Street>Poljanska cesta</fu:Street><fu:HouseNumber>55</fu:HouseNumber>')
  expect(xml).not.toContain('PremiseType')
})

test('prijava prijavi IZBRANI prostor, ne prvega', () => {
  const route = readFileSync(join(KOREN, 'app', 'api', 'furs', 'register-premise', 'route.ts'), 'utf8')
  expect(route).toContain("if (body.premiseRowId) q = q.eq('id', body.premiseRowId)")
  const nastavitve = readFileSync(join(KOREN, 'components', 'nastavitve', 'Blagajna.tsx'), 'utf8')
  expect(nastavitve).toContain('premiseRowId: p.id,')
})

test('migracija: tip je obvezen za premicni prostor in prepovedan za nepremicnino', () => {
  const sql = readFileSync(join(REPO, 'supabase', 'migrations', '187_premicni_prostori.sql'), 'utf8')
  expect(sql).toContain("(premise_type = 'static' and movable_type is null)")
  expect(sql).toContain("(premise_type = 'movable' and movable_type in ('A', 'B', 'C'))")
})
