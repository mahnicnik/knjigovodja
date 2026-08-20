import { test, expect } from '@playwright/test'
import {
  poPravilih,
  napovejKategorijo,
  podobnaOpisa,
  kljucOpisa,
  opisIzVrstice,
} from '../lib/kategorizacija'

/**
 * TESTI SAMODEJNEGA RAZVRŠČANJA
 *
 * Ob uvozu bančnega izpiska so vse transakcije dobile kategorijo "Drugo" —
 * pri enem uporabniku 151 od 254 vnosov (27.316 € odhodkov). Razdelitve po
 * kategorijah v statistiki in poročilih so bile zato prazne.
 */

// ─── Pravila ────────────────────────────────────────────────────────────

test('pravila: znani slovenski ponudniki', () => {
  expect(poPravilih('PETROL, SLOVENSKA ENERGETSKA DRUŽBA, D.D.', 'expense')?.kategorija).toBe('Transport')
  expect(poPravilih('Telekom Slovenije d.d.', 'expense')?.kategorija).toBe('Komunikacije')
  expect(poPravilih('MERCATOR d.d. Ljubljana', 'expense')?.kategorija).toBe('Prehrana')
  expect(poPravilih('ECE, energetska družba, d.o.o.', 'expense')?.kategorija).toBe('Režijski stroški')
  expect(poPravilih('ZZZS prispevki', 'expense')?.kategorija).toBe('Prispevki')
  expect(poPravilih('FURS akontacija dohodnine', 'expense')?.kategorija).toBe('Davki')
})

test('pravila: tuji ponudniki programske opreme', () => {
  expect(poPravilih('GOOGLE CLOUD EMEA', 'expense')?.kategorija).toBe('Programska oprema')
  expect(poPravilih('Vercel Inc.', 'expense')?.kategorija).toBe('Programska oprema')
  expect(poPravilih('NEOSERV domena', 'expense')?.kategorija).toBe('Programska oprema')
})

test('pravila: nekatera veljajo samo za prihodke', () => {
  // Kartično poslovanje je PRIHODEK (izplačilo ponudnika), ne strošek.
  expect(poPravilih('BANKART kartično poslovanje', 'income')?.kategorija).toBe('Kartično poslovanje')
  expect(poPravilih('BANKART kartično poslovanje', 'expense')?.kategorija).not.toBe('Kartično poslovanje')
})

test('pravila: neprepoznano ostane brez napovedi', () => {
  expect(poPravilih('XYZ 12345', 'expense')).toBeNull()
  expect(poPravilih('', 'expense')).toBeNull()
})

// ─── Učenje iz zgodovine ────────────────────────────────────────────────

test('zgodovina: uporabnikova pretekla odločitev prevlada nad pravili', () => {
  // Uporabnik je Petrol razvrstil pod "Gorivo", ne pod privzeti "Transport".
  // Njegova odločitev mora prevladati — pozna svoje poslovanje.
  const n = napovejKategorijo('PETROL d.d. Ljubljana', 'expense', [
    { description: 'Petrol, Slovenska energetska družba, d.d.', category: 'Gorivo' },
  ])
  expect(n.kategorija).toBe('Gorivo')
  expect(n.zanesljivost).toBe('visoka')
})

test('zgodovina: "Drugo" ni odločitev in se ne upošteva', () => {
  // "Drugo" je privzeta vrednost, ne izbira uporabnika — sicer bi se napaka
  // razmnoževala: enkrat "Drugo" pomeni vedno "Drugo".
  const n = napovejKategorijo('Telekom Slovenije', 'expense', [
    { description: 'Telekom Slovenije d.d.', category: 'Drugo' },
  ])
  expect(n.kategorija).toBe('Komunikacije') // iz pravil, ne iz zgodovine
})

test('zgodovina: brez ujemanja pade na pravila, nato na Drugo', () => {
  expect(napovejKategorijo('Neznani dobavitelj 999', 'expense', []).kategorija).toBe('Drugo')
  expect(napovejKategorijo('Neznani dobavitelj 999', 'expense', []).zanesljivost).toBe('nizka')
})

// ─── Primerjava opisov ──────────────────────────────────────────────────

test('opisi: isti prejemnik v različnih zapisih se ujame', () => {
  expect(podobnaOpisa(
    'PETROL, SLOVENSKA ENERGETSKA DRUŽBA, D.D.',
    'Petrol d.d. — račun 12345',
  )).toBe(true)
})

test('opisi: različna prejemnika se NE ujameta', () => {
  expect(podobnaOpisa('Telekom Slovenije', 'Mercator d.d.')).toBe(false)
})

test('opisi: ključ odstrani številke, sklice in pravne oblike', () => {
  const k = kljucOpisa('MERCATOR D.D. RAČUN 2026-00123 SI56')
  expect(k).not.toContain('2026')
  expect(k).not.toContain('d.d')
  expect(k).toContain('mercator')
})

// ─── Rezervni opis iz vrstice ───────────────────────────────────────────

test('opis iz vrstice: pobere ime prejemnika, ne zneska ali datuma', () => {
  // NAPAKA (popravljeno 19.8.2026): pri banki, kjer je stolpec z opisom
  // drugje, kot predvideva oblika, je opis ostal PRAZEN — 127 vnosov je bilo
  // zapisanih kot "Bančni odliv" brez imena prejemnika (26.730 €).
  const opis = opisIzVrstice(['19.08.2026', '', 'PETROL SLOVENSKA ENERGETSKA DRUZBA DD', '-122,50', 'SI56 1234'])
  expect(opis).toContain('PETROL')
})

test('opis iz vrstice: prazna vrstica ne vrne smeti', () => {
  expect(opisIzVrstice(['19.08.2026', '-122,50', '', '   '])).toBe('')
  expect(opisIzVrstice([])).toBe('')
})

test('opis iz vrstice: ne vrne samih številk ali sklica', () => {
  const opis = opisIzVrstice(['19.08.2026', '1234567890123', '-50,00'])
  expect(opis).toBe('')
})
