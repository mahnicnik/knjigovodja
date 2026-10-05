import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ddvZPorocila, type PosNarocilo } from '../lib/pos-kpo'

/**
 * REVIZIJA V3 (oktober 2026): DDV na Z-porocilu.
 *
 * Prej: DDV iz NEZAOKROZENIH vrstic, BREZ popusta na racunu. SIRM Z#30
 * (16.9.2026) je imel racun 50,00 EUR za postavko 100,00 EUR (50 % popust) -
 * porocilo je obracunalo DDV od 100 EUR: 103,75 EUR namesto 94,75. Z#16
 * (1.9.2026): racun 0,80 za postavko 1,60 - 0,29 namesto 0,14.
 *
 * Zdaj: ddvZPorocila (lib/pos-kpo) - DDV po stopnji ZAOKROZEN PO RACUNU (kot
 * FURS razclenitev na racunu), popust razdeljen sorazmerno na vrstice, nato
 * sestevek. Isto funkcijo uporabljata zakljucek izmene in Z-porocilo.
 */

type Zapis = [number, string, Array<[number, number]>]
const f = JSON.parse(readFileSync(join(__dirname, 'fiksture/sirm-z16-z30.json'), 'utf8'))
const vNarocila = (zapisi: Zapis[]): PosNarocilo[] => zapisi.map(([total, method, vrstice], i) => ({
  id: `n${i}`, total, tip_amount: 0, invoice_number: `R-${i}`, payments: [{ method, amount: total }],
  order_lines: vrstice.map(([t, vat_rate]) => ({ qty: 1, unit_price: t, total: t, vat_rate, voided: false })),
} as any))
const vsotaDdv = (r: Array<{ ddv: number }>) => Math.round(r.reduce((s, x) => s + x.ddv, 0) * 100) / 100

test.describe('V3: DDV na Z-porocilu', () => {
  test('SIRM Z#30: 94,75 EUR (prej 103,75)', () => {
    const r = ddvZPorocila(vNarocila(f.z30))
    expect(vsotaDdv(r)).toBe(94.75)
    const promet = Math.round(r.reduce((s, x) => s + x.osnova + x.ddv, 0) * 100) / 100
    expect(promet).toBe(534.9) // = total_revenue porocila (popust upostevan)
  })

  test('SIRM Z#16: 0,14 EUR (prej 0,29)', () => {
    expect(vsotaDdv(ddvZPorocila(vNarocila(f.z16)))).toBe(0.14)
  })

  test('zaokrozitev po racunu, ne po vsoti vrstic', () => {
    // 0,10 EUR po 22 %: na racunu DDV 0,02 (0,018 → 0,02). 10 racunov = 0,20;
    // sestevek nezaokrozenih vrstic bi dal 0,18 - Z-porocilo se ne bi ujemalo z racuni.
    const r = ddvZPorocila(vNarocila(Array.from({ length: 10 }, () => [0.1, 'cash', [[0.1, 22]]] as Zapis)))
    expect(r).toEqual([{ stopnja: 22, osnova: 0.8, ddv: 0.2 }])
  })

  test('mesane stopnje s popustom: popust sorazmerno na obe stopnji', () => {
    // 10,00 (22 %) + 10,00 (9,5 %), racun 10,00 → 5,00 + 5,00
    const r = ddvZPorocila(vNarocila([[10, 'card', [[10, 22], [10, 9.5]]]]))
    expect(r).toEqual([{ stopnja: 22, osnova: 4.1, ddv: 0.9 }, { stopnja: 9.5, osnova: 4.57, ddv: 0.43 }])
  })

  test('karta obiskov (pkg) ni promet', () => {
    expect(ddvZPorocila(vNarocila([[0, 'pkg', [[50, 22]]]]))).toEqual([])
  })
})
