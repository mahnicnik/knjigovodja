import Image from 'next/image'
import s from './landing.module.css'
import { DOMENA } from './ime'
import posnetki from './posnetki.json'

/**
 * PRAVI POSNETEK IZDELKA v okvirju brskalnika ali telefona (okvir je CSS).
 *
 * Posnetke naredi `skripte/landing-posnetki.mjs` iz predstavitve (/demo) in
 * zapise njihove mere v posnetki.json. Ce posnetka se ni, se namesto njega
 * pokaze prazno mesto z imenom datoteke - nikoli izmisljen vmesnik.
 */

type Mere = { sirina: number; visina: number }
const MERE = posnetki as Record<string, Mere>

type Props = {
  ime: string
  alt: string
  okvir?: 'brskalnik' | 'telefon'
  pot?: string
  sizes: string
  priority?: boolean
}

export default function Posnetek({ ime, alt, okvir = 'brskalnik', pot, sizes, priority }: Props) {
  const mere = MERE[ime]
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
  ) : (
    // TODO: posnetek iz /demo se manjka (public/landing/{ime}.webp)
    <div className={s.brezPosnetka} role="img" aria-label={alt}>/landing/{ime}.webp</div>
  )

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
