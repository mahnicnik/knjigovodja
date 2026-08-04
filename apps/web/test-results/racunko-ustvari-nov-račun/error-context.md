# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: racunko.spec.ts >> ustvari nov račun
- Location: tests/racunko.spec.ts:18:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Računko" [level=1] [ref=e5]
      - paragraph [ref=e6]: AI računovodja za slovenskega s.p.
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: Email
        - textbox "vas@email.com" [ref=e10]: mahnic.nik@gmail.com
      - generic [ref=e11]:
        - generic [ref=e12]: Geslo
        - textbox "••••••••" [ref=e13]: TestPassword123!
      - paragraph [ref=e14]: Napačen email ali geslo.
      - button "Prijava" [ref=e15]
    - generic [ref=e16]:
      - paragraph [ref=e17]:
        - link "Pozabljeno geslo?" [ref=e18] [cursor=pointer]:
          - /url: /forgot-password
      - paragraph [ref=e19]:
        - text: Nimate računa?
        - link "Registracija" [ref=e20] [cursor=pointer]:
          - /url: /register
  - alert [ref=e21]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | const EMAIL = 'mahnic.nik@gmail.com'
  4  | const PASSWORD = 'TestPassword123!'
  5  | 
  6  | // 1. LOGIN
  7  | test('login deluje', async ({ page }) => {
  8  |   await page.goto('/login')
  9  |   await expect(page).toHaveTitle(/Računko/)
  10 |   await page.fill('input[type="email"]', EMAIL)
  11 |   await page.fill('input[type="password"]', PASSWORD)
  12 |   await page.click('button[type="submit"]')
  13 |   await page.waitForURL('**/dashboard**', { timeout: 10000 })
  14 |   await expect(page).toHaveURL(/dashboard/)
  15 | })
  16 | 
  17 | // 2. RAČUN — ustvari nov
  18 | test('ustvari nov račun', async ({ page }) => {
  19 |   await page.goto('/login')
  20 |   await page.fill('input[type="email"]', EMAIL)
  21 |   await page.fill('input[type="password"]', PASSWORD)
  22 |   await page.click('button[type="submit"]')
> 23 |   await page.waitForURL('**/dashboard**')
     |              ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  24 | 
  25 |   await page.goto('/invoices/new')
  26 |   await expect(page.locator('h1, h2').first()).toBeVisible()
  27 | 
  28 |   // Dodaj artikel
  29 |   await page.fill('input[placeholder*="naziv"], input[placeholder*="opis"]', 'Test storitev')
  30 |   
  31 |   // Preveri da stran deluje
  32 |   await expect(page.locator('form, button').first()).toBeVisible()
  33 | })
  34 | 
  35 | // 3. PRISPEVKI — QR kode se prikažejo
  36 | test('prispevki QR kode', async ({ page }) => {
  37 |   await page.goto('/login')
  38 |   await page.fill('input[type="email"]', EMAIL)
  39 |   await page.fill('input[type="password"]', PASSWORD)
  40 |   await page.click('button[type="submit"]')
  41 |   await page.waitForURL('**/dashboard**')
  42 | 
  43 |   await page.goto('/prispevki')
  44 |   await expect(page.locator('text=PIZ')).toBeVisible({ timeout: 10000 })
  45 |   await expect(page.locator('text=ZZZS')).toBeVisible()
  46 |   await expect(page.locator('img[alt*="QR"]').first()).toBeVisible({ timeout: 10000 })
  47 | })
  48 | 
  49 | // 4. NASTAVITVE — se naložijo
  50 | test('nastavitve se naložijo', async ({ page }) => {
  51 |   await page.goto('/login')
  52 |   await page.fill('input[type="email"]', EMAIL)
  53 |   await page.fill('input[type="password"]', PASSWORD)
  54 |   await page.click('button[type="submit"]')
  55 |   await page.waitForURL('**/dashboard**')
  56 | 
  57 |   await page.goto('/nastavitve')
  58 |   await expect(page.locator('text=Profil, text=DDV').first()).toBeVisible({ timeout: 10000 })
  59 |   await expect(page.locator('button:has-text("Shrani"), button:has-text("Save")').first()).toBeVisible()
  60 | })
  61 | 
  62 | // 5. DASHBOARD — se naloži
  63 | test('dashboard se naloži', async ({ page }) => {
  64 |   await page.goto('/login')
  65 |   await page.fill('input[type="email"]', EMAIL)
  66 |   await page.fill('input[type="password"]', PASSWORD)
  67 |   await page.click('button[type="submit"]')
  68 |   await page.waitForURL('**/dashboard**', { timeout: 10000 })
  69 |   await expect(page.locator('text=Dober dan, text=dashboard').first()).toBeVisible({ timeout: 10000 })
  70 | })
  71 | 
```