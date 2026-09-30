import s from './landing.module.css'
import { IME_O } from './ime'
import { RAZISKAVA, ureBeseda } from '@/lib/landing-raziskava'
import Opomba from './Opomba'

export default function PasStevilka() {
  const ure = RAZISKAVA.urNaMesec
  return (
    <section className={`${s.sekcija} ${s.pas}`} aria-label="Prihranek časa">
      <div className={s.vsebina} data-razkrij>
        {ure != null ? (
          <>
            <p className={s.pasStevilka}>
              <span className={`${s.marker} ${s.stevilke}`} data-stej={ure}>{ure.toLocaleString('sl-SI')}</span>{' '}
              <span className={s.pasEnota}>{ureBeseda(ure)} na mesec</span>
            </p>
            <p className={s.pasBesedilo}>Toliko časa povprečen s.p. prihrani z {IME_O}.</p>
          </>
        ) : (
          <>
            {/* TODO: podatek iz raziskave (prihranek casa na mesec, povprecen s.p.) */}
            <p className={s.pasBrezStevilke}>Ure, ki jih zdaj porabite za papirologijo, <span className={s.marker}>ostanejo vam.</span></p>
            <p className={s.pasBesedilo}>Računi, stroški in mesečni zaključek se naredijo sproti, med delom.</p>
          </>
        )}
        <Opomba />
      </div>
    </section>
  )
}
