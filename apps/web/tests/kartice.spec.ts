import { test, expect } from '@playwright/test'
import { stanjeKartice, jeNaVoljo, jeUporabnaZaObisk, razvrstiKartice, jePokrita, stanjeStranke } from '../lib/kartice'

/**
 * VELJAVNOST KARTIC (7.10.2026) - brez baze in brskalnika.
 * Potekla kartica ostane `active`, ko stranka dobi novo (kupljeno ali rocno
 * dodano). Blagajna mora brati NOVO, veljavno kartico.
 */

const DANES = '2026-10-07'
const stara = { id: 'a', active: true, expires: '2026-10-01', remaining: null, name: 'Karta seniorji (stara)' }
const nova = { id: 'b', active: true, expires: '2026-11-01', remaining: null, name: 'Karta seniorji (ročno)', notes: '[ROCNO BREZ RACUNA] ...' }

test('stanje posamezne kartice', () => {
  expect(stanjeKartice(stara, DANES)).toBe('potekla')
  expect(stanjeKartice(nova, DANES)).toBe('veljavna')
  expect(stanjeKartice({ active: true, expires: DANES }, DANES)).toBe('veljavna')          // velja do vkljucno danes
  expect(stanjeKartice({ active: true, remaining: 0 }, DANES)).toBe('porabljena')
  expect(stanjeKartice({ active: true, frozen_at: '2026-10-01' }, DANES)).toBe('zamrznjena')
  expect(stanjeKartice({ active: true, activated_at: '2026-10-21T00:00:00Z' }, DANES)).toBe('se_ni_zacela')
  expect(stanjeKartice({ active: false, expires: '2027-01-01' }, DANES)).toBe('neaktivna')
})

test('stara potekla + nova ročna: blagajna bere NOVO', () => {
  const r = razvrstiKartice([stara, nova], DANES)
  expect(r[0].id).toBe('b')
  expect(jePokrita(stara, [stara, nova], DANES)).toBe(true)
  expect(stanjeStranke([stara, nova], DANES)).toEqual({ status: 'active', remainingVisits: null, daysToExpiry: 25 })
})

test('nova kartica BREZ datuma poteka (neomejena) pokrije staro', () => {
  const neomejena = { id: 'c', active: true, expires: null, remaining: null }
  expect(jePokrita(stara, [stara, neomejena], DANES)).toBe(true)
  expect(stanjeStranke([stara, neomejena], DANES).status).toBe('active')
})

test('samo potekla kartica: stranka je "expired", brez kartic "none"', () => {
  expect(stanjeStranke([stara], DANES).status).toBe('expired')
  expect(stanjeStranke([], DANES).status).toBe('none')
  expect(stanjeStranke([{ ...nova, active: false }], DANES).status).toBe('none')
  expect(jePokrita(stara, [stara], DANES)).toBe(false)
})

test('pokritost: šteje NAJKASNEJŠI potek veljavnih kartic', () => {
  const kmalu = { id: 'k', active: true, expires: '2026-10-09', remaining: null }
  expect(stanjeStranke([kmalu], DANES).status).toBe('critical')
  expect(stanjeStranke([kmalu, nova], DANES)).toMatchObject({ status: 'active', daysToExpiry: 25 })
})

test('kartice z obiski: unovčljive so samo veljavne z obiski', () => {
  const potekla5 = { id: 'p', active: true, expires: '2026-09-30', remaining: 5 }
  const veljavna3 = { id: 'v', active: true, expires: '2026-12-01', remaining: 3 }
  expect(jeUporabnaZaObisk(potekla5, DANES)).toBe(false)
  expect(jeUporabnaZaObisk(veljavna3, DANES)).toBe(true)
  expect(jeNaVoljo(potekla5, DANES)).toBe(false)
  expect(stanjeStranke([potekla5, veljavna3], DANES)).toMatchObject({ status: 'active', remainingVisits: 3 })
  expect(stanjeStranke([{ ...veljavna3, remaining: 1 }], DANES).status).toBe('critical')
})

test('razvrščanje: veljavne (prej poteče) > prihodnje > zamrznjene > potekle (najnovejša)', () => {
  const r = razvrstiKartice([
    { id: 'potekla-stara', active: true, expires: '2026-08-01' },
    { id: 'zamrznjena', active: true, expires: '2026-12-01', frozen_at: 'x' },
    { id: 'velja-dlje', active: true, expires: '2026-12-31' },
    { id: 'potekla-nova', active: true, expires: '2026-10-01' },
    { id: 'velja-prej', active: true, expires: '2026-11-15' },
    { id: 'prihodnja', active: true, activated_at: '2026-10-21', expires: '2026-11-21' },
  ], DANES).map(k => k.id)
  expect(r).toEqual(['velja-prej', 'velja-dlje', 'prihodnja', 'zamrznjena', 'potekla-nova', 'potekla-stara'])
})
