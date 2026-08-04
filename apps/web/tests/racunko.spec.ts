import { test, expect } from '@playwright/test'

const EMAIL = 'mahnic.nik@gmail.com'
const PASSWORD = 'TestPassword123!'

// 1. LOGIN
test('login deluje', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveTitle(/Računko/)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })
  await expect(page).toHaveURL(/dashboard/)
})

// 2. RAČUN — ustvari nov
test('ustvari nov račun', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**')

  await page.goto('/invoices/new')
  await expect(page.locator('h1, h2').first()).toBeVisible()

  // Dodaj artikel
  await page.fill('input[placeholder*="naziv"], input[placeholder*="opis"]', 'Test storitev')
  
  // Preveri da stran deluje
  await expect(page.locator('form, button').first()).toBeVisible()
})

// 3. PRISPEVKI — QR kode se prikažejo
test('prispevki QR kode', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**')

  await page.goto('/prispevki')
  await expect(page.locator('text=PIZ')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('text=ZZZS')).toBeVisible()
  await expect(page.locator('img[alt*="QR"]').first()).toBeVisible({ timeout: 10000 })
})

// 4. NASTAVITVE — se naložijo
test('nastavitve se naložijo', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**')

  await page.goto('/nastavitve')
  await expect(page.locator('text=Profil, text=DDV').first()).toBeVisible({ timeout: 10000 })
  await expect(page.locator('button:has-text("Shrani"), button:has-text("Save")').first()).toBeVisible()
})

// 5. DASHBOARD — se naloži
test('dashboard se naloži', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10000 })
  await expect(page.locator('text=Dober dan, text=dashboard').first()).toBeVisible({ timeout: 10000 })
})
