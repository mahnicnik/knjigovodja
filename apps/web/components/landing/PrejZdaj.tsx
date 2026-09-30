import s from './landing.module.css'
import { IME, IME_O } from './ime'
import { RAZISKAVA, formatCas } from '@/lib/landing-raziskava'

/** Srce strani: opravilo za opravilom, rocno proti Racunku. */
export default function PrejZdaj() {
  return (
    <section className={`${s.sekcija} ${s.sekcijaSiva}`} id="prej-zdaj" aria-labelledby="prej-zdaj-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="prej-zdaj-naslov" className={s.h2}>Isto delo. Ročno ali z {IME_O}.</h2>
          <p className={s.uvod}>Pet opravil, ki jih s.p. dela vsak teden. Na levi, kako gredo ročno. Na desni, kaj ostane vam.</p>
        </div>
        <div className={s.tabela} role="table" aria-label={`Opravila ročno in z ${IME_O}`} data-razkrij>
          <div className={`${s.tabelaVrstica} ${s.tabelaGlava}`} role="row">
            <span role="columnheader">Opravilo</span>
            <span role="columnheader">Ročno</span>
            <span role="columnheader">Z {IME_O}</span>
          </div>
          {RAZISKAVA.opravila.map(o => (
            <div key={o.id} className={s.tabelaVrstica} role="row">
              <span className={s.opraviloIme} role="rowheader">{o.naziv}</span>
              <div className={s.celica} role="cell">
                <span className={s.celicaOznaka}>Ročno</span>
                {o.prejMin != null
                  ? <span className={`${s.casPrej} ${s.stevilke}`}>{formatCas(o.prejMin)}</span>
                  : null /* TODO: podatek iz raziskave (cas rocno) */}
                <span className={s.opisPrej}>{o.rocno}</span>
              </div>
              <div className={`${s.celica} ${s.celicaZdaj}`} role="cell">
                <span className={s.celicaOznaka}>Z {IME_O}</span>
                {o.zdajMin != null
                  ? <span className={`${s.casZdaj} ${s.stevilke}`}>{formatCas(o.zdajMin)}</span>
                  : null /* TODO: podatek iz raziskave (cas z Racunkom) */}
                <span className={s.opisZdaj}>{o.zRacunkom.replace('Računko', IME)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
