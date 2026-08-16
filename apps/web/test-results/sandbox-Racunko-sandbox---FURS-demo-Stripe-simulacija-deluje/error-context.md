# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox.spec.ts >> Racunko sandbox - FURS demo + Stripe simulacija deluje
- Location: tests/sandbox.spec.ts:17:5

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - textbox "••••••••" [active] [ref=e13]: knjigovodja
      - button "Prijavljam..." [disabled] [ref=e14]
    - generic [ref=e15]:
      - paragraph [ref=e16]:
        - link "Pozabljeno geslo?" [ref=e17] [cursor=pointer]:
          - /url: /forgot-password
      - paragraph [ref=e18]:
        - text: Nimate računa?
        - link "Registracija" [ref=e19] [cursor=pointer]:
          - /url: /register
  - button "?" [ref=e20] [cursor=pointer]
  - alert [ref=e21]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | const EMAIL = 'mahnic.nik@gmail.com'
  4  | const PASSWORD = 'TestPassword123!' // POZOR: preveri, da je to pravo geslo - enako kot v obstojecih testih
  5  | 
  6  | /**
  7  |  * Test: Racunko sandbox (FURS demo nacin + Stripe simulacija)
  8  |  * Doda (11.8.2026) - preveri CELOTEN tok, ki ga ni mogoce testirati z
  9  |  * rocnim klikanjem po vmesniku (webhook simulacija znotraj aplikacije).
  10 |  *
  11 |  * Poganjaj z:
  12 |  *   npx playwright test tests/sandbox.spec.ts
  13 |  *
  14 |  * Ce zeliš videti brskalnik med testom (koristno za diagnostiko):
  15 |  *   npx playwright test tests/sandbox.spec.ts --headed
  16 |  */
  17 | test('Racunko sandbox - FURS demo + Stripe simulacija deluje', async ({ page }) => {
  18 |   // ── 1. Prijava (enak vzorec kot obstojeci testi) ────────────────────
  19 |   await page.goto('/login')
  20 |   await page.fill('input[type="email"]', EMAIL)
  21 |   await page.fill('input[type="password"]', PASSWORD)
  22 |   await page.click('button[type="submit"]')
> 23 |   await page.waitForURL('**/dashboard**', { timeout: 10000 })
     |              ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  24 | 
  25 |   // ── 2. Vklopi FURS demo nacin (ce se ni vklopljen) ──────────────────
  26 |   await page.goto('/nastavitve/blagajna')
  27 |   await page.waitForLoadState('networkidle')
  28 | 
  29 |   // Preveri trenutno stanje kljukice za demo nacin
  30 |   const demoCheckbox = page.locator('input[type="checkbox"]').filter({
  31 |     has: page.locator('xpath=../..').filter({ hasText: 'Demo način' })
  32 |   }).first()
  33 | 
  34 |   // Enostavnejsi pristop: poisci kljukico poleg besedila "Demo način"
  35 |   const demoToggle = page.getByText('Demo način').locator('xpath=preceding-sibling::input[@type="checkbox"]')
  36 | 
  37 |   const isChecked = await demoToggle.isChecked().catch(() => false)
  38 | 
  39 |   if (!isChecked) {
  40 |     // Pripravi obravnavo potrditvenega okna (confirm dialog), preden klikneš
  41 |     page.once('dialog', async (dialog) => {
  42 |       console.log(`Potrditveno okno: "${dialog.message()}"`)
  43 |       await dialog.accept()
  44 |     })
  45 |     await demoToggle.click()
  46 |     // Pocakaj, da se nastavitev shrani (kratek premor za async klic)
  47 |     await page.waitForTimeout(1500)
  48 |   }
  49 | 
  50 |   // Preveri, da je demo nacin zdaj vklopljen (rdec banner naj bo viden)
  51 |   await expect(page.getByText('DEMO način (brez FURS certifikata)')).toBeVisible()
  52 | 
  53 |   // ── 3. Pojdi na /stripe in simuliraj testno placilo ─────────────────
  54 |   await page.goto('/stripe')
  55 |   await page.waitForLoadState('networkidle')
  56 | 
  57 |   const simulateButton = page.getByRole('button', { name: /Simuliraj testno plačilo/i })
  58 |   await expect(simulateButton).toBeVisible()
  59 |   await simulateButton.click()
  60 | 
  61 |   // ── 4. Preveri uspesen rezultat (pocakaj do 15s - API klic + FURS) ──
  62 |   const successMessage = page.getByText(/Testni račun.*ustvarjen/i)
  63 |   await expect(successMessage).toBeVisible({ timeout: 15000 })
  64 | 
  65 |   // Preveri, da je fiskalizacija (demo) uspela
  66 |   const fursDemoMessage = page.getByText(/FURS demo fiskalizacija uspešna/i)
  67 |   await expect(fursDemoMessage).toBeVisible({ timeout: 5000 })
  68 | 
  69 |   console.log('✅ Sandbox test uspesen: racun ustvarjen IN demo fiskalizacija potrjena')
  70 | })
  71 | 
  72 | /**
  73 |  * Locen, hitrejsi test - SAMO preveri da gumb za simulacijo obstaja in je
  74 |  * klikljiv, brez preverjanja FURS demo nacina (ce ga ne zelis vklapljati).
  75 |  */
  76 | test('Stripe simulacija - gumb obstaja in je dostopen', async ({ page }) => {
  77 |   await page.goto('/login')
  78 |   await page.fill('input[type="email"]', EMAIL)
  79 |   await page.fill('input[type="password"]', PASSWORD)
  80 |   await page.click('button[type="submit"]')
  81 |   await page.waitForURL('**/dashboard**', { timeout: 10000 })
  82 | 
  83 |   await page.goto('/stripe')
  84 |   await page.waitForLoadState('networkidle')
  85 | 
  86 |   const simulateButton = page.getByRole('button', { name: /Simuliraj testno plačilo/i })
  87 |   await expect(simulateButton).toBeVisible()
  88 |   await expect(simulateButton).toBeEnabled()
  89 | })
  90 | 
```