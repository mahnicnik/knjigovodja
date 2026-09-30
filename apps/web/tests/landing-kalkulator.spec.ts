import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { izracunajPrihranek, prihranjeneMinute, PREDPOSTAVKE } from '../lib/landing-kalkulator'

/**
 * KALKULATOR PRIHRANKA (prelet 342)
 * Formula je cista funkcija - testiramo jo s poljubnimi minutami, neodvisno
 * od tega, ali je raziskava ze vpisana v lib/landing-raziskava.ts.
 */

// V oblacnem okolju je Chromium ze namescen na tej poti.
test.use({ launchOptions: existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {} })

const osnova = { racunovNaMesec: 20, urnaPostavka: 30, cenaPaketaNaMesec: 12.99, minutNaRacun: 12, stalnihMinutNaMesec: 120 }

test.describe('kalkulator prihranka', () => {
  test('ure: racuni * minute na racun + stalne minute', () => {
    // 20 * 12 + 120 = 360 min = 6 ur
    const r = izracunajPrihranek(osnova)
    expect(r.urNaMesec).toBe(6)
    expect(r.urNaLeto).toBe(72)
  })

  test('evri: ure * urna postavka - cena paketa', () => {
    // 6 * 30 - 12.99 = 167.01 -> 167
    const r = izracunajPrihranek(osnova)
    expect(r.evrovNaMesec).toBe(167)
    expect(r.evrovNaLeto).toBe(2004)
  })

  test('ure rastejo s stevilom racunov', () => {
    const malo = izracunajPrihranek({ ...osnova, racunovNaMesec: 5 })
    const veliko = izracunajPrihranek({ ...osnova, racunovNaMesec: 100 })
    expect(veliko.urNaMesec).toBeGreaterThan(malo.urNaMesec)
  })

  test('majhen prihranek pri nizki postavki je lahko negativen v evrih, ure pa ne', () => {
    const r = izracunajPrihranek({ ...osnova, racunovNaMesec: 0, stalnihMinutNaMesec: 0, urnaPostavka: 10 })
    expect(r.urNaMesec).toBe(0)
    expect(r.evrovNaMesec).toBe(-13)
  })

  test('stroski se pristejejo: stroski * minute na strosek', () => {
    // 360 min + 10 * 3 = 390 min = 6,5 ure
    const r = izracunajPrihranek({ ...osnova, stroskovNaMesec: 10, minutNaStrosek: 3 })
    expect(r.urNaMesec).toBe(6.5)
  })

  test('prihranjene minute iz casov opravil', () => {
    const m = prihranjeneMinute({ racunPrej: 10, racunZdaj: 1, strosekPrej: 4, strosekZdaj: 0.5, zakljucekPrej: 120, zakljucekZdaj: 20 })
    expect(m).toEqual({ minutNaRacun: 9, minutNaStrosek: 3.5, stalnihMinutNaMesec: 100 })
    // z Racunkom pocasneje kot rocno ne da negativnega prihranka
    expect(prihranjeneMinute({ ...PREDPOSTAVKE, racunZdaj: 99 }).minutNaRacun).toBe(0)
  })

  test('negativni vhodi se ne stejejo', () => {
    const r = izracunajPrihranek({ ...osnova, racunovNaMesec: -5, minutNaRacun: -3, stalnihMinutNaMesec: 60 })
    expect(r.urNaMesec).toBe(1)
  })
})

// Preverjanje na strani - samo ko je nastavljen LANDING_URL (npr. lokalni streznik),
// ker privzeti baseURL v playwright.config.ts kaze na produkcijo.
test.describe('kalkulator na strani', () => {
  test.skip(!process.env.LANDING_URL, 'LANDING_URL ni nastavljen')

  test('drsnika spreminjata vrednosti', async ({ page }) => {
    await page.goto(process.env.LANDING_URL!)
    // Drsnik se odzove sele po hidraciji - poskusamo, dokler se vrednost ne spremeni.
    await expect(async () => {
      await page.locator('#kalk-racuni').fill('49')
      await page.locator('#kalk-racuni').fill('50')
      await expect(page.getByTestId('kalk-racuni-vrednost')).toHaveText('50', { timeout: 500 })
    }).toPass({ timeout: 15000 })
    await page.locator('#kalk-postavka').fill('60')
    await expect(page.getByTestId('kalk-postavka-vrednost')).toHaveText('60 €')
    await expect(page.getByTestId('kalk-ure')).toBeVisible()
    await expect(page.getByTestId('kalk-ure')).not.toHaveText('—')
  })

  test('spremenjen cas opravila spremeni rezultat', async ({ page }) => {
    await page.goto(process.env.LANDING_URL!)
    const pred = await page.getByTestId('kalk-ure').textContent()
    await page.locator('#kalkulator summary').click()
    await expect(async () => {
      await page.getByTestId('kalk-zakljucekPrej').fill('600')
      await expect(page.getByTestId('kalk-ure')).not.toHaveText(pred!, { timeout: 500 })
    }).toPass({ timeout: 15000 })
  })

  test('ni vodoravnega drsenja na 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(process.env.LANDING_URL!)
    const [sirina, okno] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(sirina).toBeLessThanOrEqual(okno)
  })
})
