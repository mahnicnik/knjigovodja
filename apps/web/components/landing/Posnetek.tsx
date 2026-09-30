import Image from 'next/image'
import s from './landing.module.css'
import { DOMENA } from './ime'
import posnetki from './posnetki.json'
import fs from 'node:fs'
import path from 'node:path'

/**
 * PRAVI POSNETEK IZDELKA v okvirju brskalnika ali telefona (okvir je CSS).
 *
 * Posnetke naredi `skripte/landing-posnetki.mjs` iz predstavitve (/demo) in
 * zapise njihove mere v posnetki.json. Ce posnetka se ni, se namesto njega
 * pokaze prazno mesto z imenom datoteke - nikoli izmisljen vmesnik.
 */

type Mere = { sirina: number; visina: number }
const MERE = posnetki as Record<string, Mere>

/**
 * PRELET 347: slika se pokaze, ce DATOTEKA obstaja v public/landing - ne vec
 * samo, ce je vpisana v posnetki.json. Prej je stran kazala prazna polja,
 * ceprav so bile slike ze nalozene, ker skripta mer ni zapisala.
 * Stran se izrise ob gradnji (staticno), zato je branje diska tu poceni.
 */
function obstaja(ime: string): boolean {
  for (const koren of [process.cwd(), path.join(process.cwd(), 'apps', 'web')]) {
    try { if (fs.existsSync(path.join(koren, 'public', 'landing', `${ime}.webp`))) return true } catch {}
  }
  return false
}
// Privzete mere posnetkov iz skripte (1440x900 in 390x844 pri @2x).
const PRIVZETO: Record<'brskalnik' | 'telefon' | 'brez', Mere> = {
  brskalnik: { sirina: 2880, visina: 1800 },
  telefon: { sirina: 780, visina: 1688 },
  brez: { sirina: 1200, visina: 1500 },
}

type Props = {
  ime: string
  alt: string
  okvir?: 'brskalnik' | 'telefon' | 'brez'
  pot?: string
  sizes: string
  priority?: boolean
}

export default function Posnetek({ ime, alt, okvir = 'brskalnik', pot, sizes, priority }: Props) {
  const mere = MERE[ime] ?? (obstaja(ime) ? PRIVZETO[okvir] : undefined)
  const slika = mere ? (
    <Image
      src={`/landing/${ime}.webp`}
      alt={alt}
      width={mere.sirina}
      height={mere.visina}
      sizes={sizes}
      priority={priority}
      quality={80}
    />
  ) : process.env.VERCEL_ENV === 'production' ? null : (
    // TODO: posnetek iz /demo se manjka (public/landing/{ime}.webp).
    // V produkciji mesto skrijemo (null) - obiskovalec ne sme videti praznega polja.
    <div className={s.brezPosnetka} role="img" aria-label={alt}>/landing/{ime}.webp</div>
  )

  if (!slika) return null

  if (okvir === 'brez') return slika
  if (okvir === 'telefon') {
    return (
      <div className={s.telefon}>
        <div className={s.telefonZaslon}>{slika}</div>
      </div>
    )
  }
  return (
    <div className={s.brskalnik}>
      <div className={s.brskalnikVrstica} aria-hidden="true">
        <span /><span /><span />
        <span className={s.naslov}>{DOMENA}{pot ?? ''}</span>
      </div>
      {slika}
    </div>
  )
}
