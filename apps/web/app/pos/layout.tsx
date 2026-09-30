import type { Viewport } from 'next'

/**
 * BLAGAJNA NA TELEFONU (prelet 355)
 *
 * `viewport-fit=cover` razsiri stran pod zarezo in domaco vrstico iPhona.
 * Sele takrat `env(safe-area-inset-*)` vrne prave vrednosti - blagajna jih
 * uporabi za spodnjo navigacijo in kosarico, da gumbi ne padejo pod domaco
 * vrstico (tudi ko je dodana na zacetni zaslon).
 *
 * Velja SAMO za /pos. Na napravah brez zareze so vrednosti 0, zato se na
 * tablicah in racunalnikih nic ne spremeni.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return children
}
