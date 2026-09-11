import type { MetadataRoute } from 'next'

/**
 * PRAVILA ZA ISKALNIKE (prelet 257)
 * ═════════════════════════════════
 *
 * Javne strani so odprte, vse za prijavo pa zaprto: nadzorna plosca,
 * blagajna, nastavitve, portal racunovodje in poti API.
 *
 * ZAKAJ TO SPLOH ZAPIRAMO, ce je za njimi prijava: iskalnik jih sicer
 * poskusa odpreti, dobi preusmeritev na prijavo in si zapomni PRIJAVNO
 * stran pod desetimi razlicnimi naslovi. To razredci, kar o nas ve.
 *
 * Zemljevid je naveden izrecno, da ga najde takoj.
 */
export default function robots(): MetadataRoute.Robots {
  const osnova = 'https://xn--raunko-j2a.si'
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/dashboard', '/pos', '/nastavitve', '/racunovodja',
        '/invoices', '/expenses', '/kpo', '/ddv', '/place', '/zaloge',
        '/statistika', '/porocila', '/onboarding', '/dobrodosli',
        '/reset-password', '/forgot-password', '/invite', '/odjava',
      ],
    }],
    sitemap: `${osnova}/sitemap.xml`,
  }
}
