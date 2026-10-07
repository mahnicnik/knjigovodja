import { test, expect } from '@playwright/test'
import { zgradiESlogXml, davcnaKategorija, r2, type ERacunPodatki } from '../lib/e-slog'

/**
 * E-RAČUN e-SLOG 2.0 – pravila EN 16931 (brez baze in brskalnika).
 *
 * Primerjano s podpisanim e-računom A1 Slovenija (7.10.2026), ki prestane
 * shemo eSLOG20_INVOIC_v200.xsd in ista pravila. Naši računi so shemo
 * prestali že prej, padli pa so na: BR-21 (prazen S_LIN), BR-26 (ni S_PRI),
 * BR-CO-10/11 (MOA 79 pred popustom + 260), zaokroževanju in kategoriji Z
 * namesto AE/K/G.
 */

const zav = { naziv: 'Test s.p.', naslov: 'Poljanska cesta 55', posta: '4224', kraj: 'Gorenja vas', davcna: '12345678', idZaDdv: 'SI12345678', iban: 'SI56 1234 5678 9012 345' }
const osnova: Omit<ERacunPodatki, 'postavke'> = {
  stevilka: '2026-0001', datumIzdaje: '2026-10-07', datumZapadlosti: '2026-10-21',
  izdajatelj: zav, kupec: { naziv: 'Kupec d.o.o.', naslov: 'Dunajska 1', idZaDdv: 'SI87654321' },
}

const vsi = (xml: string, re: RegExp) => [...xml.matchAll(re)].map(m => m[1])
const moaGlava = (xml: string, sifra: number) => {
  const m = new RegExp(`<G_SG50><S_MOA><C_C516><D_5025>${sifra}</D_5025><D_5004>([-0-9.]+)<`).exec(xml)
  return m ? Number(m[1]) : null
}
const postavke = (xml: string) => vsi(xml, /<G_SG26>(.*?)<\/G_SG26>/g)
const razclenitev = (xml: string) => vsi(xml, /<G_SG52>(.*?)<\/G_SG52>/g).map(b => ({
  kat: /<D_5305>(\w+)</.exec(b)![1],
  stopnja: Number(/<D_5278>([0-9.]+)</.exec(b)![1]),
  osnova: Number(/<D_5025>125<\/D_5025><D_5004>([-0-9.]+)</.exec(b)![1]),
  ddv: Number(/<D_5025>124<\/D_5025><D_5004>([-0-9.]+)</.exec(b)![1]),
}))

/** Glavna pravila EN 16931, ki jih preverjajo potrjevalniki. */
function preveri(xml: string) {
  const vrstice = postavke(xml)
  vrstice.forEach((v, i) => {
    expect(v, `BR-21 postavka ${i + 1}`).toContain(`<S_LIN><D_1082>${i + 1}</D_1082></S_LIN>`)
    expect(v, `BR-26 postavka ${i + 1}`).toMatch(/<G_SG29><S_PRI><C_C509><D_5125>AAA<\/D_5125><D_5118>[0-9.]+</)
  })
  const vsota203 = r2(vrstice.reduce((s, v) => s + Number(/<D_5025>203<\/D_5025><D_5004>([-0-9.]+)</.exec(v)![1]), 0))
  expect(moaGlava(xml, 79), 'BR-CO-10').toBe(vsota203)
  expect(moaGlava(xml, 260), 'BR-CO-11: brez popustov na ravni računa').toBeNull()
  expect(moaGlava(xml, 389), 'BR-CO-13').toBe(moaGlava(xml, 79))
  const r = razclenitev(xml)
  for (const b of r) expect(b.ddv, `BR-${b.kat}-09`).toBe(r2(b.osnova * b.stopnja / 100))
  expect(r2(r.reduce((s, b) => s + b.osnova, 0)), 'BR-CO-13 razčlenitev').toBe(moaGlava(xml, 389))
  expect(moaGlava(xml, 176), 'BR-CO-14').toBe(r2(r.reduce((s, b) => s + b.ddv, 0)))
  expect(moaGlava(xml, 388), 'BR-CO-15').toBe(r2(moaGlava(xml, 389)! + moaGlava(xml, 176)!))
  expect(moaGlava(xml, 9)).toBe(moaGlava(xml, 388))
  if (!xml.includes('<D_2005>13</D_2005>')) expect(xml, 'BR-CO-25').toContain('<D_4451>AAB</D_4451>')
}

test('dve stopnji DDV', () => {
  const xml = zgradiESlogXml({ ...osnova, postavke: [
    { opis: 'Vadba', kolicina: 1, cenaBrezDdv: 100, stopnjaDdv: 22 },
    { opis: 'Napitek', kolicina: 2, cenaBrezDdv: 2.5, stopnjaDdv: 9.5 },
  ] })
  preveri(xml)
  expect(moaGlava(xml, 9)).toBe(127.48)
})

test('popust postavke: 79 je PO popustu, 260 ni izpisan', () => {
  const xml = zgradiESlogXml({ ...osnova, postavke: [{ opis: 'Paket', kolicina: 1, cenaBrezDdv: 100, stopnjaDdv: 22, popustOdstotek: 10 }] })
  preveri(xml)
  expect(moaGlava(xml, 79)).toBe(90)
  expect(xml).toContain('<D_5025>204</D_5025><D_5004>10.00<')
  expect(xml).toContain('<D_5118>100.00<')
})

test('zaokroževanje: vsote iz zaokroženih postavk, 1,005 -> 1,01', () => {
  const xml = zgradiESlogXml({ ...osnova, postavke: [
    { opis: 'A', kolicina: 3, cenaBrezDdv: 0.335, stopnjaDdv: 22 },
    { opis: 'B', kolicina: 3, cenaBrezDdv: 0.335, stopnjaDdv: 22 },
    { opis: 'C', kolicina: 1, cenaBrezDdv: 12.345, stopnjaDdv: 22, popustOdstotek: 7 },
    { opis: 'D', kolicina: 1, cenaBrezDdv: 1.005, stopnjaDdv: 9.5 },
  ] })
  preveri(xml)
  expect(xml).toContain('<D_5118>0.335<')
  expect(r2(1.005)).toBe(1.01)
})

test('brez roka plačila so navedeni plačilni pogoji (BR-CO-25)', () => {
  const xml = zgradiESlogXml({ ...osnova, datumZapadlosti: null, postavke: [{ opis: 'X', kolicina: 1, cenaBrezDdv: 10, stopnjaDdv: 22 }] })
  preveri(xml)
  expect(xml).not.toContain('<G_SG8>')
})

test('kategorija DDV po razlogu oprostitve', () => {
  expect(davcnaKategorija(22, true)).toBe('S')
  expect(davcnaKategorija(0, false)).toBe('E')
  expect(davcnaKategorija(0, true, '76a')).toBe('AE')
  expect(davcnaKategorija(0, true, '25')).toBe('AE')
  expect(davcnaKategorija(0, true, '46')).toBe('K')
  expect(davcnaKategorija(0, true, '52')).toBe('G')
  expect(davcnaKategorija(0, true, '42-1')).toBe('E')
  expect(davcnaKategorija(0, true, '44-3')).toBe('E')
  expect(davcnaKategorija(0, true, 'custom')).toBe('E')
  expect(davcnaKategorija(0, true, null)).toBe('Z')
})

test('dobava v EU: kategorija K, država kupca iz ID za DDV', () => {
  const xml = zgradiESlogXml({ ...osnova, kodaOprostitve: '46',
    kupec: { naziv: 'Kunde GmbH', naslov: 'Hauptstr. 1', idZaDdv: 'DE123456789' },
    postavke: [{ opis: 'Blago', kolicina: 2, cenaBrezDdv: 40, stopnjaDdv: 0 }] })
  preveri(xml)
  expect(razclenitev(xml)).toEqual([{ kat: 'K', stopnja: 0, osnova: 80, ddv: 0 }])
  expect(xml).toMatch(/<D_3035>BY<\/D_3035>.*?<D_3207>DE<\/D_3207>/)
  expect(xml).toMatch(/<D_3035>SE<\/D_3035>.*?<D_3207>SI<\/D_3207>/)
})

test('nezavezanec: kategorija E, samo AHP brez predpone', () => {
  const xml = zgradiESlogXml({ ...osnova, izdajatelj: { ...zav, idZaDdv: null },
    postavke: [{ opis: 'Vadba', kolicina: 1, cenaBrezDdv: 50, stopnjaDdv: 0 }] })
  preveri(xml)
  expect(razclenitev(xml)).toEqual([{ kat: 'E', stopnja: 0, osnova: 50, ddv: 0 }])
  const prodajalec = /<D_3035>SE<\/D_3035>(.*?)<\/G_SG2>/.exec(xml)![1]
  expect(prodajalec).toContain('<D_1153>AHP</D_1153><D_1154>12345678<')
  expect(prodajalec).not.toContain('<D_1153>VA<')
})
