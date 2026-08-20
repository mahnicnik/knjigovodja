import { test, expect } from '@playwright/test'

/**
 * TESTI PRILAGOJENOSTI ZA TELEFON
 *
 * Preverijo, da vsebina ne uhaja čez rob zaslona. Ko se to zgodi, se da
 * vodoravno drseti po CELOTNI strani — glava in spodnja vrstica se premikata
 * z njo, postavitev pa razpade.
 *
 * Ti testi potrebujejo prijavo, zato se brez poverilnic preskočijo:
 *   RACUNKO_EMAIL=... RACUNKO_GESLO=... npx playwright test tests/mobilno.spec.ts
 *
 * Velikost: iPhone 14 (390 × 844).
 */

const EMAIL = process.env.RACUNKO_EMAIL
const GESLO = process.env.RACUNKO_GESLO

const STRANI = [
  '/dashboard',
  '/kpo',
  '/invoices',
  '/expenses',
  '/statistika',
  '/nastavitve',
  '/banka',
  '/zakljucki',
]

test.describe('mobilna postavitev', () => {
  test.skip(!EMAIL || !GESLO, 'Potrebni sta spremenljivki RACUNKO_EMAIL in RACUNKO_GESLO')

  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', EMAIL!)
    await page.fill('input[type="password"]', GESLO!)
    await page.click('button[type="submit"]')
    await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 })
  })

  for (const pot of STRANI) {
    test(`${pot} — vsebina ne uhaja čez rob zaslona`, async ({ page }) => {
      await page.goto(pot)
      await page.waitForTimeout(2500) // podatki se nalozijo

      const sirine = await page.evaluate(() => ({
        dokument: document.documentElement.scrollWidth,
        zaslon: window.innerWidth,
      }))

      // Dovolimo 2px razlike zaradi zaokrozevanja.
      expect(
        sirine.dokument,
        `stran je široka ${sirine.dokument}px, zaslon pa ${sirine.zaslon}px — vsebina uhaja čez rob`,
      ).toBeLessThanOrEqual(sirine.zaslon + 2)
    })
  }

  test('vnosna polja imajo vsaj 16px pisave (iOS sicer sam približa)', async ({ page }) => {
    await page.goto('/invoices/new')
    await page.waitForTimeout(2000)

    const premajhna = await page.evaluate(() => {
      const rezultat: string[] = []
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const velikost = parseFloat(getComputedStyle(el).fontSize)
        if (velikost < 16) rezultat.push(`${el.tagName} ${velikost}px`)
      })
      return rezultat
    })

    expect(premajhna, `polja s premajhno pisavo: ${premajhna.join(', ')}`).toHaveLength(0)
  })
})
