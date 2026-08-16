import { test, expect } from '@playwright/test'

const EMAIL = 'mahnic.nik@gmail.com'
const PASSWORD = 'TestPassword123!' // POZOR: preveri, da je to pravo geslo - enako kot v obstojecih testih

/**
 * Test: Racunko sandbox (FURS demo nacin + Stripe simulacija)
 * Doda (11.8.2026) - preveri CELOTEN tok, ki ga ni mogoce testirati z
 * rocnim klikanjem po vmesniku (webhook simulacija znotraj aplikacije).
 *
 * Poganjaj z:
 *   npx playwright test tests/sandbox.spec.ts
 *
 * Ce zeliš videti brskalnik med testom (koristno za diagnostiko):
 *   npx playwright test tests/sandbox.spec.ts --headed
 */
test('Racunko sandbox - FURS demo + Stripe simulacija deluje', async ({ page }) => {
  // ── 1. Prijava (enak vzorec kot obstojeci testi) ────────────────────
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })

  // ── 2. Vklopi FURS demo nacin (ce se ni vklopljen) ──────────────────
  await page.goto('/nastavitve/blagajna')
  await page.waitForLoadState('networkidle')

  // Preveri trenutno stanje kljukice za demo nacin
  const demoCheckbox = page.locator('input[type="checkbox"]').filter({
    has: page.locator('xpath=../..').filter({ hasText: 'Demo način' })
  }).first()

  // Enostavnejsi pristop: poisci kljukico poleg besedila "Demo način"
  const demoToggle = page.getByText('Demo način').locator('xpath=preceding-sibling::input[@type="checkbox"]')

  const isChecked = await demoToggle.isChecked().catch(() => false)

  if (!isChecked) {
    // Pripravi obravnavo potrditvenega okna (confirm dialog), preden klikneš
    page.once('dialog', async (dialog) => {
      console.log(`Potrditveno okno: "${dialog.message()}"`)
      await dialog.accept()
    })
    await demoToggle.click()
    // Pocakaj, da se nastavitev shrani (kratek premor za async klic)
    await page.waitForTimeout(1500)
  }

  // Preveri, da je demo nacin zdaj vklopljen (rdec banner naj bo viden)
  await expect(page.getByText('DEMO način (brez FURS certifikata)')).toBeVisible()

  // ── 3. Pojdi na /stripe in simuliraj testno placilo ─────────────────
  await page.goto('/stripe')
  await page.waitForLoadState('networkidle')

  const simulateButton = page.getByRole('button', { name: /Simuliraj testno plačilo/i })
  await expect(simulateButton).toBeVisible()
  await simulateButton.click()

  // ── 4. Preveri uspesen rezultat (pocakaj do 15s - API klic + FURS) ──
  const successMessage = page.getByText(/Testni račun.*ustvarjen/i)
  await expect(successMessage).toBeVisible({ timeout: 15000 })

  // Preveri, da je fiskalizacija (demo) uspela
  const fursDemoMessage = page.getByText(/FURS demo fiskalizacija uspešna/i)
  await expect(fursDemoMessage).toBeVisible({ timeout: 5000 })

  console.log('✅ Sandbox test uspesen: racun ustvarjen IN demo fiskalizacija potrjena')
})

/**
 * Locen, hitrejsi test - SAMO preveri da gumb za simulacijo obstaja in je
 * klikljiv, brez preverjanja FURS demo nacina (ce ga ne zelis vklapljati).
 */
test('Stripe simulacija - gumb obstaja in je dostopen', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })

  await page.goto('/stripe')
  await page.waitForLoadState('networkidle')

  const simulateButton = page.getByRole('button', { name: /Simuliraj testno plačilo/i })
  await expect(simulateButton).toBeVisible()
  await expect(simulateButton).toBeEnabled()
})
