import { test, expect } from '@playwright/test'
import { predlagajVsebino, preracunaj, vsebinaIzNaziva, pretvoriEnoto, kljucPretvorbe } from '../lib/pakiranje'

/**
 * PAKIRANJE NA DOBAVNICI (7.10.2026) - brez baze in brskalnika.
 * Sod 20 L za 40 EUR mora v zalogo prinesti +20 L po 2,00 EUR/L, ne +1 po 40 EUR.
 */

test('sod 20 L za 40 EUR: +20 L po 2,00 EUR/L', () => {
  const pak = predlagajVsebino({ naziv: 'SOD LAŠKO ZLATOROG 20L', ai: { vsebina: 20, enota: 'L' }, ciljnaEnota: 'L' })
  expect(pak).toEqual({ vsebina: 20, vir: 'ai' })
  expect(preracunaj(1, 40, pak.vsebina)).toEqual({ zaloga: 20, cenaNaEnoto: 2 })
})

test('čaj 20 vrečk v paketu: +20 kos, cena na vrečko', () => {
  const pak = predlagajVsebino({ naziv: 'ČAJ META 20/1', ai: { vsebina: 20, enota: 'kos' }, ciljnaEnota: 'kos' })
  expect(pak.vsebina).toBe(20)
  expect(preracunaj(3, 2.4, pak.vsebina)).toEqual({ zaloga: 60, cenaNaEnoto: 0.12 })
})

test('AI vsebino pretvori v enoto zaloge (sod 20 L, surovina v dl)', () => {
  expect(predlagajVsebino({ ai: { vsebina: 20, enota: 'L' }, ciljnaEnota: 'dl' }).vsebina).toBe(200)
  expect(predlagajVsebino({ ai: { vsebina: 1, enota: 'kg' }, ciljnaEnota: 'g' }).vsebina).toBe(1000)
})

test('brez AI: razbere iz naziva glede na enoto zaloge', () => {
  expect(vsebinaIzNaziva('SOD UNION 30L', 'L')).toBe(30)
  expect(vsebinaIzNaziva('VINO REFOŠK 6x0,75L', 'L')).toBe(4.5)
  expect(vsebinaIzNaziva('VINO REFOŠK 6x0,75L', 'kos')).toBe(6)
  expect(vsebinaIzNaziva('ČAJ KAMILICA 20/1', 'kos')).toBe(20)
  expect(vsebinaIzNaziva('KAPSULE x20', 'kos')).toBe(20)
  expect(vsebinaIzNaziva('KAVA BARCAFFE 1 KG', 'g')).toBe(1000)
  expect(vsebinaIzNaziva('COCA COLA 0,25L', 'kos')).toBeNull()
  expect(vsebinaIzNaziva('MLEKO 1L', 'kg')).toBeNull()
})

test('AI "6 kos" pri surovini v L: uporabi naziv (6x0,75 = 4,5 L)', () => {
  const pak = predlagajVsebino({ naziv: 'VINO 6x0,75L', ai: { vsebina: 6, enota: 'kos' }, ciljnaEnota: 'L' })
  expect(pak).toEqual({ vsebina: 4.5, vir: 'naziv' })
})

test('shranjena pretvorba ima prednost, brez podatkov je 1', () => {
  expect(predlagajVsebino({ naziv: 'SOD 20L', ai: { vsebina: 20, enota: 'L' }, shranjeno: 30, ciljnaEnota: 'L' }))
    .toEqual({ vsebina: 30, vir: 'shranjeno' })
  expect(predlagajVsebino({ naziv: 'Corona 0,33', ciljnaEnota: 'kos' })).toEqual({ vsebina: 1, vir: 'privzeto' })
  expect(preracunaj(24, 1.05, 1)).toEqual({ zaloga: 24, cenaNaEnoto: 1.05 })
})

test('pretvorba enot in ključ', () => {
  expect(pretvoriEnoto(0.75, 'L', 'dl')).toBe(7.5)
  expect(pretvoriEnoto(1, 'L', 'kg')).toBeNull()
  expect(kljucPretvorbe({ ean: '3830000000017', naziv: 'Sod' }, 'Pivovarna')).toBe('koda:3830000000017')
  expect(kljucPretvorbe({ naziv: '  Sod  Laško 20L ' }, 'Pivovarna Laško')).toBe('naziv:pivovarna laško|sod laško 20l')
  expect(preracunaj(1, null, 20)).toEqual({ zaloga: 20, cenaNaEnoto: null })
})
