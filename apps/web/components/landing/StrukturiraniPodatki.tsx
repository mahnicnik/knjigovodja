import { IME } from './ime'
import { PAKETI, VPRASANJA } from './podatki'

/**
 * Strukturirani podatki (JSON-LD). Iskalnik in AI pomocnik iz njih razbereta,
 * kaj izdelek je, koliko stane in na katera vprasanja odgovarja.
 * Cene in vprasanja pridejo iz istih seznamov kot na strani - ne morejo se razhajati.
 */
export default function StrukturiraniPodatki() {
  const podatki = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: IME,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Windows, Android',
        inLanguage: 'sl',
        description: `${IME} izda račun, prebere stroške s fotografije in izračuna prispevke ter DDV za slovenski s.p. Davčna blagajna s FURS potrjevanjem in delom brez povezave, izvoz za računovodski program.`,
        offers: PAKETI.map(p => p.mesecno === 0
          ? { '@type': 'Offer', name: p.ime, price: '0', priceCurrency: 'EUR' }
          : {
              '@type': 'Offer', name: p.ime, price: p.mesecno.toFixed(2), priceCurrency: 'EUR',
              priceSpecification: { '@type': 'UnitPriceSpecification', price: p.mesecno.toFixed(2), priceCurrency: 'EUR', billingDuration: 1, billingIncrement: 1, unitCode: 'MON' },
            }),
        featureList: [
          'Davčno potrjevanje računov (FURS)',
          'Branje prejetih računov s fotografije',
          'POS blagajna za gostinstvo — mize, delitev računa, kuhinjski zaslon',
          'Delo brez povezave do dveh delovnih dni',
          'e-račun v obliki e-SLOG 2.0',
          'KPO knjiga in evidence DDV',
          'Izvoz za Vasco, Pantheon in Opal',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: VPRASANJA.map(([q, a]) => ({
          '@type': 'Question', name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(podatki).replace(/</g, '\\u003c') }}
    />
  )
}
