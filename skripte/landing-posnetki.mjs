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
  ['racun', '/invoices/new', 'namizni'],
  ['skener', '/scan', 'namizni'],
  ['skener-mobilni', '/scan', 'mobilni'],
  ['davki', '/prispevki', 'namizni'],
  ['blagajna', '/pos', 'namizni'],
  ['clani', '/pos', 'namizni', 'clani'],
  ['korak-nastavitve', '/nastavitve/blagajna', 'namizni'],
  ['korak-racuni', '/invoices', 'namizni'],
  ['korak-kpo', '/kpo', 'namizni'],
]

const NAPRAVE = {
  namizni: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobilni: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// Pomocni gumbi in pasica predstavitve na posnetku samo motijo.
const SKRIJ = `
  [data-demo-pasica], [aria-label="Pomoč"], [data-page-help], nextjs-portal { display: none !important; }
`

const brskalnik = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}

for (const [nacin, nastavitve] of Object.entries(NAPRAVE)) {
  const ctx = await brskalnik.newContext({ ...nastavitve, locale: 'sl-SI', reducedMotion: 'reduce' })
  const stran = await ctx.newPage()
  await stran.goto(`${BASE}/demo?kam=dashboard`, { waitUntil: 'networkidle' })
  if (!new URL(stran.url()).pathname.startsWith('/dashboard')) {
    throw new Error(`Prijava v /demo ni uspela (pristal na ${stran.url()}).`)
  }
  for (const [ime, pot, naprava, akcija] of POSNETKI) {
    if (naprava !== nacin) continue
    await stran.goto(`${BASE}${pot}`, { waitUntil: 'networkidle' })
    await stran.addStyleTag({ content: SKRIJ })
    if (akcija === 'clani') await stran.getByText(/Člani/).first().click().catch(() => {})
    await stran.waitForTimeout(1500)
    const png = await stran.screenshot()
    const cilj = `${MAPA}/${ime}.webp`
    const info = await sharp(png).webp({ quality: 82 }).toFile(cilj)
    manifest[ime] = { sirina: info.width, visina: info.height }
    console.log('posneto', ime, info.width, 'x', info.height)
  }
  await ctx.close()
}
await brskalnik.close()
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
