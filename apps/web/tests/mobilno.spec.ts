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

// POPRAVLJENO (19.8.2026): "..." je bilo videti kot veljavna vrednost, zato
// se testi niso preskocili - vsak je 15 sekund cakal na prijavo in padel.
const jeVeljavna = (v?: string) => !!v && v.trim() !== '' && !/^\.+$/.test(v.trim())
const EMAIL = jeVeljavna(process.env.RACUNKO_EMAIL) ? process.env.RACUNKO_EMAIL : undefined
const GESLO = jeVeljavna(process.env.RACUNKO_GESLO) ? process.env.RACUNKO_GESLO : undefined

// Vse glavne strani - da en zagon najde vse tezave naenkrat.
const STRANI = [
  '/dashboard',
  '/kpo',
  '/invoices',
  '/invoices/new',
  '/expenses',
  '/scan',
  '/statistika',
  '/porocila',
  '/letni-pregled',
  '/nastavitve',
  '/banka',
  '/kartice',
  '/zakljucki',
  '/zaloge',
  '/place',
  '/regres',
  '/potni-nalogi',
  '/kilometrina',
  '/predracuni',
  '/dobavnice',
  '/avansni-racuni',
  '/ponavljajoci-racuni',
  '/rokovnik',
  '/opomniki',
  '/vodic',
  '/izvoz',
  '/integracije',
  '/cas',
  '/ddv/evidenca',
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

      const sirine = await page.evaluate(() => {
        const zaslon = window.innerWidth
        // DODANO (19.8.2026): poisci KRIVCA, ne le dejstva, da stran uhaja -
        // sicer je treba element rocno iskati po celi strani.
        const krivci: string[] = []
        document.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect()
          if (r.width > zaslon + 2 && r.width > 0) {
            const e = el as HTMLElement
            const oznaka = [
              el.tagName.toLowerCase(),
              e.id ? '#' + e.id : '',
              e.className && typeof e.className === 'string'
                ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.')
                : '',
            ].join('')
            const besedilo = (e.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ')
            krivci.push(`${oznaka} (${Math.round(r.width)}px) "${besedilo}"`)
          }
        })
        // Obdrzi samo NAJGLOBLJE elemente - starsi so siroki zaradi otrok.
        return {
          dokument: document.documentElement.scrollWidth,
          zaslon,
          krivci: krivci.slice(-6),
        }
      })

      // Dovolimo 2px razlike zaradi zaokrozevanja.
      expect(
        sirine.dokument,
        `stran je široka ${sirine.dokument}px, zaslon pa ${sirine.zaslon}px — vsebina uhaja čez rob.\n`
        + `Najverjetnejši krivci:\n  ${sirine.krivci.join('\n  ') || '(ni bilo mogoče določiti)'}`,
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
