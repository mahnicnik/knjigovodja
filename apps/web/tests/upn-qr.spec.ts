import { test, expect } from '@playwright/test'
import {
  sestaviUpnQr, upnSklic, upnBesedilo, upnDatum, veljavenIban, vBajteLatin2,
  soUradnoIme, upnBwipOpcije, type UpnQrVhod,
} from '../lib/upn-qr'
import { generateUpnQr } from '../lib/invoice-pdf'

/**
 * UPN QR na računih – hotfix 5.10.2026.
 *
 * Plačnik (Intesa Sanpaolo) je ob skeniranju računa dobil »NI UJEMANJA«:
 * banke od 9.10.2025 ime prejemnika iz QR kode primerjajo z uradnim imenom
 * imetnika računa. Računko je ime rezal na 33 znakov, kodi pa sta manjkala
 * oznaka ECI (ISO 8859-2) in LF za kontrolno vsoto (tehnični standard ZBS
 * UPN QR). Podatki v primerih so oblikovani po resničnih računih, ki so
 * napako razkrili.
 */

const OSNOVA: UpnQrVhod = {
  placnikIme: 'AZ Projekt d.o.o.',
  znesek: 210,
  namen: 'Plačilo računa 2026-137',
  rokPlacila: '2026-10-16',
  ibanPrejemnika: 'SI56 6100 0002 1055 652',
  sklic: 'SI00 2026-137',
  stevilkaRacuna: '2026-137',
  prejemnikIme: 'HFP, Domen Kocjan s.p.',
  prejemnikUlica: 'Kraigherjeva ulica 5',
  prejemnikKraj: '6230 Postojna',
}

function polja(v: Partial<UpnQrVhod> = {}) {
  const r = sestaviUpnQr({ ...OSNOVA, ...v })
  if ('razlog' in r) throw new Error(r.razlog)
  return { vsebina: r.vsebina, p: r.vsebina.split('\n') }
}

test('20 polj, za vsakim (tudi za kontrolno vsoto) je LF', () => {
  const { vsebina, p } = polja()
  expect(vsebina.endsWith('\n')).toBe(true)
  expect(p).toHaveLength(21)          // 20 polj + prazen niz za zadnjim LF
  expect(p[20]).toBe('')
  expect(p[0]).toBe('UPNQR')
  expect(p.slice(1, 5)).toEqual(['', '', '', ''])
})

test('kontrolna vsota = dolžine polj 1–19 z LF', () => {
  const { p } = polja()
  const vsota = p.slice(0, 19).reduce((s, x) => s + x.length + 1, 0)
  expect(p[19]).toBe(String(vsota).padStart(3, '0'))
})

test('polja na pravih mestih', () => {
  const { p } = polja()
  expect(p[5]).toBe('AZ Projekt d.o.o.')
  expect(p[8]).toBe('00000021000')
  expect(p[11]).toBe('OTHR')
  expect(p[12]).toBe('Plačilo računa 2026-137')
  expect(p[13]).toBe('16.10.2026')
  expect(p[14]).toBe('SI56610000021055652')
  expect(p[15]).toBe('SI002026-137')
  expect(p[16]).toBe('HFP, Domen Kocjan s.p.')
  expect(p[17]).toBe('Kraigherjeva ulica 5')
  expect(p[18]).toBe('6230 Postojna')
})

test('NAPAKA: dolgo uradno ime se NE reže na 33 znakov (sicer »Ni ujemanja«)', () => {
  const ime = 'Zdravstvene in druge storitve, Domen Eržen s.p.'
  expect(ime.length).toBeGreaterThan(33)
  const { p } = polja({ prejemnikIme: ime })
  expect(p[16]).toBe(ime)
  expect(p[16]).not.toBe('Zdravstvene in druge storitve, Do')
})

test('Finančna uprava Republike Slovenije ostane cela (prispevki)', () => {
  const { p } = polja({ prejemnikIme: 'Finančna uprava Republike Slovenije', sklic: 'SI1991390419-44008' })
  expect(p[16]).toBe('Finančna uprava Republike Slovenije')
  expect(p[15]).toBe('SI1991390419-44008')
})

test('predolgo ime se reže pri presledku, ne sredi besede', () => {
  const dolgo = 'Zelo dolgo ime podjetja za storitve svetovanja in posredovanja, Janez Novak s.p.'
  const { p } = polja({ prejemnikIme: dolgo })
  expect(p[16].length).toBeLessThanOrEqual(70)
  expect(dolgo.startsWith(p[16])).toBe(true)
  expect(dolgo[p[16].length]).toBe(' ')
})

test('prelom vrstice v naslovu ne zamakne polj', () => {
  const { p } = polja({ prejemnikUlica: 'Kraigherjeva ulica 5\nvhod B', placnikIme: '  Ana\r\n Novak  ' })
  expect(p).toHaveLength(21)
  expect(p[17]).toBe('Kraigherjeva ulica 5 vhod B')
  expect(p[5]).toBe('Ana Novak')
})

test('sklic: veljaven ostane, iz številke računa SI00, s črkami SI99', () => {
  expect(upnSklic('SI00 2026-137')).toBe('SI002026-137')
  expect(upnSklic(null, '012-2026')).toBe('SI00012-2026')
  expect(upnSklic(null, 'HFP1-RACUNKO01-3')).toBe('SI99')   // banka bi sklic s črkami zavrnila
  expect(upnSklic('SI00 1-2-3-4', '2026-5')).toBe('SI002026-5') // več kot 3 deli
  expect(upnSklic('RF18 5390 0754 7034')).toBe('RF18539007547034')
  expect(upnSklic('RF19 5390 0754 7034', '7')).toBe('SI007') // napačna kontrolna števka RF
})

test('IBAN: brez ali neveljaven -> kode ni', () => {
  expect(veljavenIban('SI56 6100 0002 1055 652')).toBe(true)
  expect(veljavenIban('SI56 0700 0000 4396 615')).toBe(true)
  expect(veljavenIban('SI56 6100 0002 1055 653')).toBe(false)
  expect(sestaviUpnQr({ ...OSNOVA, ibanPrejemnika: '' }).ok).toBe(false)
  expect(sestaviUpnQr({ ...OSNOVA, ibanPrejemnika: 'SI56610000021055653' }).ok).toBe(false)
})

test('znesek: v centih na 11 mest; nič ali negativno -> kode ni', () => {
  expect(polja({ znesek: 1268.74 }).p[8]).toBe('00000126874')
  expect(polja({ znesek: 0.1 + 0.2 }).p[8]).toBe('00000000030')
  expect(sestaviUpnQr({ ...OSNOVA, znesek: 0 }).ok).toBe(false)
  expect(sestaviUpnQr({ ...OSNOVA, znesek: -289 }).ok).toBe(false)
})

test('datum brez premika časovnega pasu', () => {
  expect(upnDatum('2026-10-16')).toBe('16.10.2026')
  expect(upnDatum('2026-11-01T00:00:00+02:00')).toBe('01.11.2026')
  expect(upnDatum(null)).toBe('')
})

test('ISO 8859-2: šumniki so en bajt, tuji znaki nadomeščeni', () => {
  expect(Array.from(vBajteLatin2('čČšŠžŽćĆđĐ'))).toEqual([0xE8, 0xC8, 0xB9, 0xA9, 0xBE, 0xAE, 0xE6, 0xC6, 0xF0, 0xD0])
  expect(upnBesedilo('Cena 10 € – „akcija“', 42)).toBe('Cena 10 EUR - "akcija"')
  expect(upnBesedilo('Crème brûlée', 42)).toBe('Creme brulée') // è in û nista v ISO 8859-2, é je
  for (const b of vBajteLatin2(polja().vsebina)) expect(b).toBeLessThanOrEqual(0xFF)
})

test('slika: verzija 15, ECC M, ECI 000004, znak ^ zapisan kot ^^', () => {
  const o = upnBwipOpcije('UPNQR\nA^B\n')
  expect(o).toMatchObject({ bcid: 'qrcode', version: '15', eclevel: 'M', fixedeclevel: true, binarytext: true, parsefnc: true })
  expect(o.text.startsWith('^ECI000004UPNQR')).toBe(true)
  expect(o.text).toContain('A^^B')
})

test('generateUpnQr: PNG za veljaven račun, nič brez IBAN-a', async () => {
  const racun = { amount_total: 210, reference: 'SI00 2026-137', invoice_number: '2026-137', client_name: 'AZ Projekt d.o.o.', due_date: '2026-10-16' }
  const org = { name: 'HFP, Domen Kocjan s.p.', iban: 'SI56 6100 0002 1055 652', address: 'Kraigherjeva ulica 5', post_code: '6230', city: 'Postojna' }
  expect(await generateUpnQr(racun, org)).toMatch(/^data:image\/png;base64,iVBORw0KGgo/)
  expect(await generateUpnQr(racun, { ...org, iban: '' })).toBe('')
  expect(await generateUpnQr({ ...racun, client_name: null }, org)).toMatch(/^data:image\/png/) // prej: padec na .slice
})

test('ime v Nastavitvah proti uradnemu imenu (opozorilo »Ni ujemanja«)', () => {
  expect(soUradnoIme('Domen Kocjan s.p.', 'HFP, Domen Kocjan s.p.')).toBe(false)
  expect(soUradnoIme('DOMEN KOCJAN S.P.', 'Domen Kocjan s.p.')).toBe(true)
  expect(soUradnoIme('Zdravstvene in druge storitve, Domen Eržen s.p.', 'ZDRAVSTVENE IN DRUGE STORITVE, DOMEN ERŽEN S.P.')).toBe(true)
})
