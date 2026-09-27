import { test, expect } from '@playwright/test'
import { kontoZa, normalizirajKategorijo, dopolniRazvrstitev, izbireKategorij, IMENA_KATEGORIJ } from '../lib/konti'

/** PRELET 339: kategorije stroskov s konti (SIR). */

test('konti: glavne kategorije', () => {
  expect(kontoZa('Gorivo').konto).toBe('402')
  expect(kontoZa('Pisarniški material').konto).toBe('406')
  expect(kontoZa('Reprezentanca')).toEqual({ konto: '417', delez: 50 })
  expect(kontoZa('Kazni').delez).toBe(0)
  expect(kontoZa('Plače').konto).toBe('470')
  expect(kontoZa('Prispevki').konto).toBe('484')
})

test('konti: AI zapis brez sumnikov se prepozna', () => {
  expect(normalizirajKategorijo('Pisarniski material')).toBe('Pisarniški material')
  expect(normalizirajKategorijo('izobrazevanje')).toBe('Izobraževanje')
  expect(normalizirajKategorijo('')).toBe('Drugo')
})

test('konti: pretekla odlocitev uporabnika ima prednost', () => {
  const d = dopolniRazvrstitev({ category: 'Storitve', amount_net: 40 }, { category: 'Računovodstvo in svetovanje' })
  expect(d.category).toBe('Računovodstvo in svetovanje')
  expect(d.konto).toBe('416')
  // stara kategorija iz zgodovine se ne uporabi
  expect(dopolniRazvrstitev({ category: 'Gorivo' }, { category: 'Transport' }).category).toBe('Gorivo')
})

test('konti: drobni inventar nad 500 EUR dobi opombo', () => {
  const d = dopolniRazvrstitev({ category: 'Drobni inventar', amount_net: 899, accountant_note: null })
  expect(d.accountant_note).toContain('500')
})

test('konti: izbira ohrani staro kategorijo', () => {
  expect(izbireKategorij('Prehrana')).toContain('Prehrana')
  expect(izbireKategorij('Gorivo')).toEqual(IMENA_KATEGORIJ)
})
