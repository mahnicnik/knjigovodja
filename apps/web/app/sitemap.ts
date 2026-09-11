import type { MetadataRoute } from 'next'

/**
 * ZEMLJEVID STRANI (prelet 257)
 * ═════════════════════════════
 *
 * ZAKAJ: iskalnik podstrani odkrije prek povezav, kar traja - ali pa jih ne
 * odkrije, ce nanje kaze malo clenov. Zemljevid mu pove, katere strani
 * obstajajo, takoj.
 *
 * `priority` ni ukaz, ampak namig o razmerju med nasimi stranmi. `/e-racun`
 * ima visoko vrednost, ker bo do 2028 iskan pogosto in imamo tam vsebino,
 * ki je drugod ni.
 *
 * `lastModified` postavimo na cas gradnje. Pri statiсnih straneh je to
 * dovolj natancno; lazno pogosto spreminjanje datuma iskalniku ne koristi.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const osnova = 'https://xn--raunko-j2a.si'
  const zdaj = new Date()

  return [
    { url: osnova,                      lastModified: zdaj, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${osnova}/funkcije`,        lastModified: zdaj, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${osnova}/davcna-blagajna`, lastModified: zdaj, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${osnova}/e-racun`,         lastModified: zdaj, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${osnova}/za-racunovodje`,  lastModified: zdaj, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${osnova}/prenosi`,         lastModified: zdaj, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${osnova}/vodic`,           lastModified: zdaj, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${osnova}/register`,        lastModified: zdaj, changeFrequency: 'yearly',  priority: 0.6 },
    { url: `${osnova}/terms`,           lastModified: zdaj, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${osnova}/privacy`,         lastModified: zdaj, changeFrequency: 'yearly',  priority: 0.2 },
  ]
}
