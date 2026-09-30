import s from './landing.module.css'
import { VPRASANJA } from './podatki'

/** Pogosta vprasanja - <details>, brez JS. Isti seznam gre v JSON-LD. */
export default function Vprasanja() {
  return (
    <section className={s.sekcija} id="vprasanja" aria-labelledby="vprasanja-naslov">
      <div className={s.vsebina}>
        <div className={s.glavaSredina}>
          <h2 id="vprasanja-naslov" className={s.h2}>Pogosta vprašanja</h2>
        </div>
        <div className={s.faq}>
          {VPRASANJA.map(([v, o]) => (
            <details key={v}>
              <summary>{v}</summary>
              <p>{o}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
