import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizirajAiDdv, zneskiZaShranjevanje, razcleniPrejetRacun, NAVODILO_DDV } from '../lib/prejeti-ddv'
import { izracunajDdvIzPodatkov, type DdvPodatki } from '../lib/ddv'

/**
 * REVIZIJA V6 (oktober 2026): DDV prejetih racunov po stopnjah.
 *
 * Prej: AI je vrnil eno stopnjo, vse poti shranjevanja so DDV preracunale kot
 * osnova × stopnja. SIRM, Davidov Hram 3920-301-5649 (29.9.2026): AI je
 * prebral DDV 67,58 (22 % + 9,5 %), shranjeno 73,52 = 334,20 × 22 %.
 */

// Racun z rekapitulacijo 22 % in 9,5 % z zneski glave 3920-301-5649
// (334,20 + 67,58 = 401,78); delitev po stopnjah izracunana iz glave
// (9,5 %: DDV 4,52 kot na dobavnici).
const ai5649 = {
  vendor: 'Davidov Hram d.o.o.', amount_net: 334.2, vat_rate: 22, vat_amount: 67.58, amount_total: 401.78,
  vat_breakdown: [{ rate: 22, net: 286.65, vat: 63.06 }, { rate: 9.5, net: 47.55, vat: 4.52 }],
  flat_rate_compensation: null,
}

test.describe('V6: DDV prejetih racunov po stopnjah', () => {
  test('mesane stopnje: shrani se DDV z racuna, ne osnova × 22 %', () => {
    const d = normalizirajAiDdv(ai5649)
    expect(d.vat_amount).toBe(67.58)
    expect(d.vat_rate).toBe(22) // glavna stopnja (najvecja osnova)
    const z = zneskiZaShranjevanje({ jeZavezanec: true, osnova: d.amount_net, stopnja: d.vat_rate, bruto: d.amount_total, razclenitev: d.vat_breakdown })
    expect(z).toMatchObject({ amount_net: 334.2, vat_amount: 67.58, amount_total: 401.78 })
    expect(z.vat_breakdown).toHaveLength(2)
    // prej: 334,20 × 22 % = 73,52 → 5,94 EUR prevec vstopnega DDV
    expect(Math.round(334.2 * 0.22 * 100) / 100 - z.vat_amount).toBeCloseTo(5.94, 2)
  })

  test('uporabnik spremeni stopnjo ali osnovo → razclenitev ne velja vec', () => {
    const d = normalizirajAiDdv(ai5649)
    const drugaStopnja = zneskiZaShranjevanje({ jeZavezanec: true, osnova: 334.2, stopnja: 9.5, razclenitev: d.vat_breakdown })
    expect(drugaStopnja).toMatchObject({ vat_amount: 31.75, vat_breakdown: null })
    const drugaOsnova = zneskiZaShranjevanje({ jeZavezanec: true, osnova: 300, stopnja: 22, razclenitev: d.vat_breakdown })
    expect(drugaOsnova).toMatchObject({ vat_amount: 66, vat_breakdown: null })
  })

  test('nezavezanec: bruto je strosek, brez DDV in razclenitve', () => {
    const d = normalizirajAiDdv(ai5649)
    expect(zneskiZaShranjevanje({ jeZavezanec: false, osnova: d.amount_net, stopnja: 22, bruto: d.amount_total, razclenitev: d.vat_breakdown }))
      .toEqual({ amount_net: 401.78, vat_rate: 0, vat_amount: 0, amount_total: 401.78, vat_breakdown: null })
  })

  test('5 % stopnja', () => {
    const d = normalizirajAiDdv({ amount_net: 20, vat_rate: 5, vat_amount: 1, amount_total: 21, vat_breakdown: [{ rate: 5, net: 20, vat: 1 }] })
    expect(zneskiZaShranjevanje({ jeZavezanec: true, osnova: 20, stopnja: d.vat_rate, razclenitev: d.vat_breakdown }).vat_amount).toBe(1)
  })

  test('Cernigoj: pavsalno nadomestilo 8 % je odbitek, ne 0 %', () => {
    // Racun kmeta pavsalista: 172,22 + 8 % pavsalnega nadomestila 13,78 = 186,00.
    // Prej shranjeno: osnova 172,22, DDV 0.
    const d = normalizirajAiDdv({ vendor: 'Černigoj Jožef', amount_net: 172.22, vat_rate: 0, vat_amount: 0, amount_total: 186,
      vat_breakdown: [], flat_rate_compensation: { base: 172.22, amount: 13.78 } })
    expect(d.vat_breakdown).toEqual([{ stopnja: 8, osnova: 172.22, ddv: 13.78, vrsta: 'pavsalno_nadomestilo' }])
    expect(d.vat_amount).toBe(13.78)
    expect(d._ddv_opozorilo).toBeUndefined()
    const z = zneskiZaShranjevanje({ jeZavezanec: true, osnova: d.amount_net, stopnja: d.vat_rate, razclenitev: d.vat_breakdown })
    expect(z).toMatchObject({ amount_net: 172.22, vat_amount: 13.78, amount_total: 186 })
  })

  test('razclenitev, ki se ne sesteje v racun → opozorilo za uporabnika', () => {
    const d = normalizirajAiDdv({ amount_net: 100, vat_amount: 22, amount_total: 150, vat_breakdown: [{ rate: 22, net: 100, vat: 22 }] })
    expect(d._ddv_opozorilo).toContain('ne ujema')
  })

  test('izracunajDdv: vstopni DDV po stopnjah iz razclenitve, pavsalno nadomestilo loceno', () => {
    const d = normalizirajAiDdv(ai5649)
    const p: DdvPodatki = { racuni: [], kpo: [], narocila: [], vracila: [], imaBlagajno: false, prejeti: [
      { receipt_date: '2026-09-29', amount_net: 334.2, vat_amount: 67.58, vat_rate: 22, vat_breakdown: d.vat_breakdown },
      { receipt_date: '2026-09-08', amount_net: 172.22, vat_amount: 13.78, vat_rate: 0, vat_breakdown: [{ stopnja: 8, osnova: 172.22, ddv: 13.78, vrsta: 'pavsalno_nadomestilo' }] },
      { receipt_date: '2026-09-10', amount_net: 100, vat_amount: 22, vat_rate: 22 }, // star zapis brez razclenitve
    ] }
    const r = izracunajDdvIzPodatkov(p, { leto: 2026, cetrtletje: 3 })
    expect(r.vstopniDdv.poStopnjah['22']).toEqual({ osnova: 386.65, ddv: 85.06 })
    expect(r.vstopniDdv.poStopnjah['9.5']).toEqual({ osnova: 47.55, ddv: 4.52 })
    expect(r.vstopniDdv.pavsalnoNadomestilo).toEqual({ osnova: 172.22, ddv: 13.78 })
    expect(r.vstopniDdv.skupaj).toBe(103.36) // 67,58 + 13,78 + 22
  })

  test('razclenitev, ki se ne ujema z zapisom (rocno spremenjen znesek), se ne uporabi', () => {
    expect(razcleniPrejetRacun({ amount_net: 200, vat_amount: 44, vat_rate: 22, vat_breakdown: [{ stopnja: 9.5, osnova: 100, ddv: 9.5 }] }))
      .toEqual([{ stopnja: 22, osnova: 200, ddv: 44 }])
  })

  test('obe AI poti uporabljata isto navodilo (tudi 5 % in pavsalno nadomestilo)', () => {
    expect(NAVODILO_DDV).toMatch(/9\.5, 5 ali 0/)
    expect(NAVODILO_DDV).toMatch(/PAVSALNIM NADOMESTILOM 8 %/)
    for (const f of ['app/api/scan-receipt/route.ts', 'lib/email-scan.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).toContain('${NAVODILO_DDV}')
      expect(src, f).toContain('normalizirajAiDdv(')
      expect(src, f).not.toMatch(/vat_rate: stopnja DDV \(22, 9\.5, ali 0\)/)
    }
  })

  test('nobena pot shranjevanja ne preracunava DDV kot osnova × stopnja', () => {
    for (const f of ['app/scan/page.tsx', 'app/expenses/page.tsx', 'components/nastavitve/EmailSkeniranje.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/const vatAmount = amountNet \* \(vatRate \/ 100\)/)
      expect(src, f).toContain('zneskiZaShranjevanje(')
      expect(src, f).toContain('vat_breakdown')
    }
  })
})
