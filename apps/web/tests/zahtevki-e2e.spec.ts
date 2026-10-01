import { test, expect, type Page } from '@playwright/test'

/**
 * E2E: ZAHTEVEK ZA PLACILO V PREDSTAVITVI (prelet 361)
 *
 * Tece na PRODUKCIJI v /demo (furs_demo_mode -> DEMO- kode, nic ne gre FURS).
 * Pogoj: predstavitveno podjetje ima povezan Stripe v TESTNEM nacinu
 * (Nastavitve -> Placila s kartico), sicer je moznost onemogocena.
 *
 * Zagon (posnetki gredo v test-results/zahtevki/):
 *   cd apps/web && E2E_ZAHTEVKI=1 npx playwright test tests/zahtevki-e2e.spec.ts --reporter=list
 */
test.skip(!process.env.E2E_ZAHTEVKI, 'E2E zahtevkov: nastavi E2E_ZAHTEVKI=1')
test.setTimeout(180_000)

const ZASLONI = [
  { ime: 'telefon', width: 390, height: 844 },
  { ime: 'namizje', width: 1280, height: 800 },
]
const posnetek = (page: Page, ime: string) => page.screenshot({ path: `test-results/zahtevki/${ime}.png`, fullPage: false })

async function novZahtevek(page: Page, z: string) {
  await page.goto('/demo?kam=invoices')
  await page.goto('/invoices/new?vrsta=zahtevek')
  await expect(page.getByTestId('vrsta-zahtevek')).toBeEnabled({ timeout: 20_000 })
  await page.getByTestId('vrsta-zahtevek').click()
  await page.getByPlaceholder('Agencija Pixel d.o.o.').fill('Ana Testna')
  await page.getByPlaceholder('info@agencija.si').fill(process.env.E2E_EMAIL || 'delivered@resend.dev')
  await page.getByPlaceholder('Opis storitve').first().fill('Osebni trening')
  // Prva vrstica: kolicina, cena, popust (oba razporeda). Demo je zavezanec
  // za DDV: 10 × 32,79 € + 22 % = 400,04 € (najblizje 400 € pri cenah na cent).
  const stevila = page.locator('input[type=number]')
  await stevila.nth(0).fill('10')
  await stevila.nth(1).fill('32.79')
  await posnetek(page, `${z}-1-obrazec`)
  await page.getByTestId('glavni-gumb').click()
  await expect(page.getByTestId('zahtevek-shranjen')).toBeVisible({ timeout: 20_000 })
  await posnetek(page, `${z}-2-shranjen`)
  return (await page.getByTestId('zahtevek-povezava').getAttribute('href'))!
}

async function placajSKartico(page: Page, url: string, z: string) {
  await page.goto(url)
  await expect(page.getByTestId('placaj-zahtevek')).toBeVisible()
  await posnetek(page, `${z}-placaj-stran`)
  await page.getByTestId('placaj-s-kartico').click()
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  await page.locator('#cardNumber').fill('4242 4242 4242 4242')
  await page.locator('#cardExpiry').fill('12 / 34')
  await page.locator('#cardCvc').fill('123')
  const ime = page.locator('#billingName')
  if (await ime.isVisible().catch(() => false)) await ime.fill('Ana Testna')
  const drzava = page.locator('#billingCountry')
  if (await drzava.isVisible().catch(() => false)) await drzava.selectOption('SI').catch(() => {})
  await posnetek(page, `${z}-stripe`)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/\/placaj\/.+\/hvala/, { timeout: 60_000 })
  await expect(page.getByTestId('placaj-hvala')).toContainText('Hvala')
  await posnetek(page, `${z}-hvala`)
}

for (const zaslon of ZASLONI) {
  test.describe(zaslon.ime, () => {
    test.use({ viewport: { width: zaslon.width, height: zaslon.height } })

    test('a) Pokaži QR zdaj → plačilo → Plačano — račun izdan (DEMO-)', async ({ page, browser }) => {
      const z = `a-${zaslon.ime}`
      const url = await novZahtevek(page, z)
      await page.getByTestId('zahtevek-pokazi-qr').click()
      await expect(page.getByTestId('zahtevek-qr')).toBeVisible()
      await posnetek(page, `${z}-3-qr`)
      const kupec = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
      await placajSKartico(kupec, url, z)
      await expect(page.getByTestId('zahtevek-placano')).toContainText('Plačano — račun izdan', { timeout: 60_000 })
      await posnetek(page, `${z}-4-placano`)
      await page.goto('/invoices')
      await expect(page.getByText('Ana Testna').first()).toBeVisible()
      await posnetek(page, `${z}-5-racuni`)
      await page.goto('/kpo')
      await expect(page.getByText(/Ana Testna/).first()).toBeVisible({ timeout: 20_000 })
      await posnetek(page, `${z}-6-knjiga`)
      await page.goto('/invoices/zahtevki')
      await expect(page.getByTestId('zahtevek-racun').first()).toBeVisible()
      await expect(page.getByText('davčno potrjen (predstavitev)').first()).toBeVisible()
      await posnetek(page, `${z}-7-zahtevki`)
    })

    test('b) Pošlji po e-pošti → plačilo → račun izdan in poslan', async ({ page, browser }) => {
      const z = `b-${zaslon.ime}`
      const url = await novZahtevek(page, z)
      await page.getByTestId('zahtevek-poslji').click()
      await expect(page.getByTestId('zahtevek-poslano')).toBeVisible({ timeout: 30_000 })
      console.log('Povezava iz e-pošte:', url)
      await posnetek(page, `${z}-3-poslano`)
      const kupec = await (await browser.newContext()).newPage()
      await placajSKartico(kupec, url, z)
      await page.goto('/invoices/zahtevki')
      await expect.poll(async () => {
        await page.reload()
        return page.getByText('poslan stranki').first().isVisible()
      }, { timeout: 60_000 }).toBe(true)
      await posnetek(page, `${z}-4-zahtevki`)
    })

    test('c) Preklic zahtevka; storno računa z vračilom prek Stripe', async ({ page, browser }) => {
      const z = `c-${zaslon.ime}`
      // Preklic
      const url1 = await novZahtevek(page, z + '-preklic')
      await page.goto('/invoices/zahtevki')
      page.once('dialog', d => d.accept())
      await page.getByTestId('zahtevek-akcija-preklic').first().click()
      await expect(page.getByTestId('zahtevki-obvestilo')).toContainText('preklican')
      await posnetek(page, `${z}-1-preklican`)
      const kupec = await (await browser.newContext()).newPage()
      await kupec.goto(url1)
      await expect(kupec.getByTestId('placaj-stanje')).toContainText('preklican')
      await posnetek(kupec, `${z}-2-placaj-preklican`)
      // Storno + vracilo
      const url2 = await novZahtevek(page, z + '-vracilo')
      await placajSKartico(kupec, url2, z + '-vracilo')
      await page.goto('/invoices')
      const vrstica = page.getByText('Ana Testna').first()
      await vrstica.click()
      page.on('dialog', d => d.accept())
      await page.getByText('Več').first().click().catch(() => {})
      await page.getByText('Storniraj račun').first().click()
      await expect(page.getByText(/Storno/).first()).toBeVisible({ timeout: 30_000 })
      await posnetek(page, `${z}-3-storno`)
      await page.goto('/invoices/zahtevki')
      await expect(page.getByText('Vrnjeno').first()).toBeVisible({ timeout: 30_000 })
      await posnetek(page, `${z}-4-vrnjeno`)
    })
  })
}
