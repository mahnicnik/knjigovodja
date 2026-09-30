/**
 * POSNETKI IZDELKA ZA ZACETNO STRAN (prelet 342)
 *
 * Prijavi se v predstavitev (/demo), posname zaslone in jih shrani v
 * apps/web/public/landing/*.webp (@2x). Mere zapise v
 * apps/web/components/landing/posnetki.json - komponenta Posnetek pokaze
 * samo tiste posnetke, ki so tam navedeni.
 *
 * Zagon (iz korena repozitorija):
 *   node skripte/landing-posnetki.mjs                       # produkcija
 *   LANDING_BASE=http://localhost:3000 node skripte/landing-posnetki.mjs
 */
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.LANDING_BASE || 'https://xn--raunko-j2a.si'
const MAPA = 'apps/web/public/landing'
const MANIFEST = 'apps/web/components/landing/posnetki.json'

// [ime, pot, naprava, kaj naredimo pred posnetkom]
const POSNETKI = [
  ['dashboard', '/dashboard', 'namizni'],
  ['dashboard-mobilni', '/dashboard', 'mobilni'],
  // Prelet 343: 'racun' je staticen PDF (public/landing/racun.webp), ne posnetek.
  // Skener: nalozi izmisljen blagajniski racun, pusti AI, da ga prebere,
  // in posname rezultat s kontom. NIC se ne shrani.
  ['skener-mobilni', '/scan', 'mobilni', 'skener'],
  // Pregled prihodkov, stroskov, neto in DDV na nadzorni plosci.
  ['davki', '/dashboard', 'namizni', 'stevilke'],
  ['blagajna', '/pos', 'namizni', 'pin'],
  ['koledar', '/pos', 'namizni', 'pin-koledar'],
  ['korak-nastavitve', '/nastavitve', 'namizni'],
  ['korak-racuni', '/invoices', 'namizni'],
  ['korak-kpo', '/kpo', 'namizni'],
]

const NAPRAVE = {
  namizni: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobilni: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// Pomocni gumbi in pasica predstavitve na posnetku samo motijo.
const SKRIJ = `
  [data-demo-pasica], [aria-label="Pomoč"], [data-page-help], nextjs-portal,
  .rk-onboard, div[style*="position: fixed"][style*="bottom: 0"] { display: none !important; }
`

const brskalnik = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}

for (const [nacin, nastavitve] of Object.entries(NAPRAVE)) {
  const ctx = await brskalnik.newContext({ ...nastavitve, locale: 'sl-SI', reducedMotion: 'reduce' })
  const stran = await ctx.newPage()
  await stran.goto(`${BASE}/demo?kam=dashboard`, { waitUntil: 'networkidle' })
  if (!new URL(stran.url()).pathname.startsWith('/dashboard')) {
    console.error(`Prijava v /demo ni uspela za ${nacin} (pristal na ${stran.url()}) - preskakujem.`)
    await ctx.close()
    continue
  }
  for (const [ime, pot, naprava, akcija] of POSNETKI) {
    if (naprava !== nacin) continue
    try {
    await stran.goto(`${BASE}${pot}`, { waitUntil: 'networkidle' })
    await stran.addStyleTag({ content: SKRIJ })
    // Prelet 347: blagajna je zaklenjena s PIN-om osebja. Demo vodja Marko ima 2222.
    if (akcija?.startsWith('pin')) {
      const tipka = stran.getByRole('button', { name: '2', exact: true }).first()
      if (await tipka.isVisible().catch(() => false)) {
        for (let i = 0; i < 4; i++) { await tipka.click(); await stran.waitForTimeout(150) }
        await stran.waitForTimeout(2000)
      }
    }
    if (akcija === 'pin-koledar') { await stran.getByText('Koledar', { exact: true }).first().click().catch(() => {}); await stran.waitForTimeout(1500) }
    // Stevilke (prihodki, odhodki, DDV) in napoved pretoka denarja na vrhu zaslona.
    if (akcija === 'stevilke') await stran.evaluate(() => document.querySelector('.rk-stat')?.scrollIntoView({ block: 'start' })).catch(() => {})
    if (akcija === 'skener') {
      await stran.locator('input[type=file][accept*="pdf"]').setInputFiles('skripte/landing-blok-primer.png')
      await stran.getByText('Skeniraj s AI').click()
      await stran.getByText(/^Konto /).first().waitFor({ timeout: 60000 })
      await stran.getByText(/^Konto /).first().scrollIntoViewIfNeeded()
      await stran.mouse.wheel(0, 120)
    }
    await stran.waitForTimeout(1500)
    const png = await stran.screenshot()
    const cilj = `${MAPA}/${ime}.webp`
    const info = await sharp(png).webp({ quality: 82 }).toFile(cilj)
    manifest[ime] = { sirina: info.width, visina: info.height }
    // Prelet 346: mere zapisemo po VSAKEM posnetku - ce se kasnejsi zatakne,
    // so ze narejeni vseeno vidni na strani.
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
    console.log('posneto', ime, info.width, 'x', info.height)
    } catch (e) {
      console.error('NI POSNETO', ime, '-', e.message.split('\n')[0])
    }
  }
  await ctx.close()
}
await brskalnik.close()
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
