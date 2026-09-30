import s from './landing.module.css'
import { formatCas, opravilo } from '@/lib/landing-raziskava'

export default function ZakljucniPoziv() {
  const z = opravilo('zakljucek')
  return (
    <section className={s.zakljucek} aria-labelledby="zakljucek-naslov">
      <div className={s.vsebina}>
        <h2 id="zakljucek-naslov" className={s.h2}>
          {z.zdajMin != null
            ? <>Naslednji mesečni zaključek naj traja <span className={s.stevilke}>{formatCas(z.zdajMin)}</span>.</>
            : /* TODO: podatek iz raziskave (mesecni zakljucek z Racunkom) */
              <>Naslednji mesečni zaključek naj bo samo še potrditev.</>}
        </h2>
        <div className={s.zakljucekGumbi}>
          <a href="/register" className={`${s.gumbSvetli} ${s.gumbVelik}`}>Začnite brezplačno</a>
          <a href="/demo" className={`${s.gumbTemni} ${s.gumbVelik}`}>Preizkusite brez registracije</a>
        </div>
        <p className={s.heroPodGumbi}>Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
      </div>
    </section>
  )
}
