import type { Metadata } from 'next'
import s from '@/components/landing/landing.module.css'
import { pisavaBesedilo, pisavaNaslovi } from '@/components/landing/pisave'
import { IME } from '@/components/landing/ime'
import Navigacija from '@/components/landing/Navigacija'
import Hero from '@/components/landing/Hero'
import PasStevilka from '@/components/landing/PasStevilka'
import PrejZdaj from '@/components/landing/PrejZdaj'
import KakoDeluje from '@/components/landing/KakoDeluje'
import Funkcije from '@/components/landing/Funkcije'
import ZaKoga from '@/components/landing/ZaKoga'
import ZaRacunovodje from '@/components/landing/ZaRacunovodje'
import Kalkulator from '@/components/landing/Kalkulator'
import Mnenja from '@/components/landing/Mnenja'
import Cene from '@/components/landing/Cene'
import Vprasanja from '@/components/landing/Vprasanja'
import ZakljucniPoziv from '@/components/landing/ZakljucniPoziv'
import Noga from '@/components/landing/Noga'
import StrukturiraniPodatki from '@/components/landing/StrukturiraniPodatki'
import Animacije from '@/components/landing/Animacije'

/**
 * ZACETNA STRAN (prelet 342)
 * Glavno sporocilo je prihranek casa; prihranek denarja je drugotno.
 * Stevilke pridejo samo iz lib/landing-raziskava.ts.
 */

const OPIS = `${IME} izda račun, prebere stroške s fotografije in izračuna prispevke ter DDV. Papirologija za s.p. v minutah namesto v urah. FURS davčna blagajna, podatki v EU.`

export const metadata: Metadata = {
  title: { absolute: `${IME} — računi, davki in blagajna za s.p. v minutah` },
  description: OPIS,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'sl_SI',
    siteName: IME,
    title: `${IME} — računi, davki in blagajna v minutah`,
    description: OPIS,
  },
}

export default function ZacetnaStran() {
  return (
    <div id="vrh" data-landing className={`${s.stran} ${pisavaNaslovi.variable} ${pisavaBesedilo.variable}`}>
      <Navigacija />
      <main>
        <Hero />
        <PasStevilka />
        <PrejZdaj />
        <KakoDeluje />
        <Funkcije />
        <ZaKoga />
        <ZaRacunovodje />
        <Kalkulator />
        <Mnenja />
        <Cene />
        <Vprasanja />
        <ZakljucniPoziv />
      </main>
      <Noga />
      <StrukturiraniPodatki />
      <Animacije />
    </div>
  )
}
