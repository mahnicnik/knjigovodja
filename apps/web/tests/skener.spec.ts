import { test, expect } from '@playwright/test'
import {
  resiSistem,
  homografija,
  preslikaj,
  urediKote,
  velikostIzKotov,
  obdelajDokument,
  type Tocka,
} from '../lib/skener'

/**
 * TESTI SKENIRANJA DOKUMENTOV
 *
 * Perspektivni popravek je matematika, ki jo je z gledanjem nemogoče
 * preveriti — če je matrika napačna, se dokument zvije in tega ni videti,
 * dokler ne pogledaš rezultata. Zato testi.
 */

// ─── Reševanje sistema ──────────────────────────────────────────────────

test('sistem: reši preprost sistem dveh enačb', () => {
  //  2x +  y = 5
  //   x + 3y = 10   ->  x = 1, y = 3
  const r = resiSistem([[2, 1], [1, 3]], [5, 10])!
  expect(r[0]).toBeCloseTo(1, 6)
  expect(r[1]).toBeCloseTo(3, 6)
})

test('sistem: singularen sistem vrne null namesto neveljavnih števil', () => {
  // Druga enačba je večkratnik prve — rešitev ni enolična.
  expect(resiSistem([[1, 2], [2, 4]], [3, 6])).toBeNull()
})

// ─── Homografija ────────────────────────────────────────────────────────

test('homografija: štirje koti se preslikajo TOČNO v cilj', () => {
  // Dokument, slikan pod kotom (trapez) -> pravokotnik 400×600.
  const izvor: Tocka[] = [
    { x: 120, y: 80 },   // zgoraj levo
    { x: 900, y: 140 },  // zgoraj desno
    { x: 860, y: 1180 }, // spodaj desno
    { x: 60, y: 1100 },  // spodaj levo
  ]
  const cilj: Tocka[] = [
    { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 600 }, { x: 0, y: 600 },
  ]

  const h = homografija(izvor, cilj)!
  expect(h).not.toBeNull()

  for (let i = 0; i < 4; i++) {
    const p = preslikaj(h, izvor[i])
    expect(p.x).toBeCloseTo(cilj[i].x, 4)
    expect(p.y).toBeCloseTo(cilj[i].y, 4)
  }
})

test('homografija: enotska preslikava pusti točke pri miru', () => {
  const kvadrat: Tocka[] = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ]
  const h = homografija(kvadrat, kvadrat)!
  const p = preslikaj(h, { x: 37, y: 62 })
  expect(p.x).toBeCloseTo(37, 4)
  expect(p.y).toBeCloseTo(62, 4)
})

test('homografija: koti na premici vrnejo null (ni preslikave)', () => {
  const naPremici: Tocka[] = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
  ]
  const cilj: Tocka[] = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ]
  expect(homografija(naPremici, cilj)).toBeNull()
})

// ─── Urejanje kotov ─────────────────────────────────────────────────────

test('koti: poljuben vrstni red se uredi v ZL, ZD, SD, SL', () => {
  // Uporabnik lahko povleče kote v katerem koli vrstnem redu.
  const zmedeni: Tocka[] = [
    { x: 10, y: 200 },  // spodaj levo
    { x: 190, y: 20 },  // zgoraj desno
    { x: 20, y: 15 },   // zgoraj levo
    { x: 200, y: 210 }, // spodaj desno
  ]
  const [zl, zd, sd, sl] = urediKote(zmedeni)
  expect(zl).toEqual({ x: 20, y: 15 })
  expect(zd).toEqual({ x: 190, y: 20 })
  expect(sd).toEqual({ x: 200, y: 210 })
  expect(sl).toEqual({ x: 10, y: 200 })
})

// ─── Velikost rezultata ─────────────────────────────────────────────────

test('velikost: dokument se ne raztegne — vzame povprečje nasprotnih stranic', () => {
  const koti: Tocka[] = [
    { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 600 }, { x: 0, y: 600 },
  ]
  const { sirina, visina } = velikostIzKotov(koti)
  expect(sirina).toBe(400)
  expect(visina).toBe(600)
})

test('velikost: pri trapezu vzame povprečje, ne najdaljše stranice', () => {
  // Zgornja stranica 300, spodnja 500 -> povprecje 400.
  const koti: Tocka[] = [
    { x: 100, y: 0 }, { x: 400, y: 0 }, { x: 500, y: 600 }, { x: 0, y: 600 },
  ]
  expect(velikostIzKotov(koti).sirina).toBe(400)
})

// ─── Obdelava dokumenta ─────────────────────────────────────────────────

test('obdelava: senca čez polovico ne potemni besedila', () => {
  // NAPAKA, ki jo to preprečuje: navaden prag čez celo sliko bi senčeno
  // polovico razglasil za besedilo — pol računa bi postalo črno.
  const S = 40, V = 40
  const podatki = new Uint8ClampedArray(S * V * 4)

  for (let y = 0; y < V; y++) {
    for (let x = 0; x < S; x++) {
      // Leva polovica svetla (200), desna v senci (90) — obe sta OZADJE.
      const osnova = x < S / 2 ? 200 : 90
      const p = (y * S + x) * 4
      podatki[p] = podatki[p + 1] = podatki[p + 2] = osnova
      podatki[p + 3] = 255
    }
  }

  obdelajDokument(podatki, S, V)

  // Obe polovici morata postati OZADJE (svetli), kljub različni osvetlitvi.
  const levo = podatki[(20 * S + 10) * 4]
  const desno = podatki[(20 * S + 30) * 4]
  expect(levo).toBeGreaterThan(200)
  expect(desno).toBeGreaterThan(200)
})

test('obdelava: temno besedilo na svetlem ozadju ostane temno', () => {
  const S = 40, V = 40
  const podatki = new Uint8ClampedArray(S * V * 4)

  for (let i = 0; i < S * V; i++) {
    const p = i * 4
    podatki[p] = podatki[p + 1] = podatki[p + 2] = 210 // ozadje
    podatki[p + 3] = 255
  }
  // Črta besedila na sredini
  for (let x = 5; x < 35; x++) {
    const p = (20 * S + x) * 4
    podatki[p] = podatki[p + 1] = podatki[p + 2] = 30
  }

  obdelajDokument(podatki, S, V)

  const naCrti = podatki[(20 * S + 20) * 4]
  const obCrti = podatki[(5 * S + 20) * 4]
  expect(naCrti).toBeLessThan(150)      // besedilo ostane temno
  expect(obCrti).toBeGreaterThan(200)   // ozadje postane belo
})

test('obdelava: rezultat je vedno sivinski in neprosojen', () => {
  const S = 20, V = 20
  const podatki = new Uint8ClampedArray(S * V * 4)
  for (let i = 0; i < S * V; i++) {
    const p = i * 4
    podatki[p] = 200; podatki[p + 1] = 50; podatki[p + 2] = 120
    podatki[p + 3] = 100
  }

  obdelajDokument(podatki, S, V)

  for (let i = 0; i < S * V; i++) {
    const p = i * 4
    expect(podatki[p]).toBe(podatki[p + 1])
    expect(podatki[p + 1]).toBe(podatki[p + 2])
    expect(podatki[p + 3]).toBe(255)
  }
})
