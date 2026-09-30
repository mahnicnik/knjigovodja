import s from './landing.module.css'
import { MNENJA } from '@/lib/landing-mnenja'

/** Prikaze se sele, ko so v lib/landing-mnenja.ts preverljiva mnenja. */
export default function Mnenja() {
  if (MNENJA.length === 0) return null
  return (
    <section className={s.sekcija} id="mnenja" aria-labelledby="mnenja-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="mnenja-naslov" className={s.h2}>Kaj pravijo uporabniki</h2>
        </div>
        <div className={s.mnenja}>
          {MNENJA.map(m => (
            <figure key={m.ime + m.citat} className={s.mnenje} data-razkrij>
              <blockquote>{m.citat}</blockquote>
              <figcaption><strong>{m.ime}</strong>{m.vloga}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
