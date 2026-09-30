import s from './landing.module.css'
import { IME } from './ime'

const KONTAKT = 'podpora@xn--raunko-j2a.si'
const KONTAKT_PRIKAZ = 'podpora@računko.si'

export default function Noga() {
  return (
    <footer className={s.noga}>
      <div className={s.vsebina}>
        <div className={s.nogaMreza}>
          <div>
            <a href="#vrh" className={s.logo}><span className={s.logoTocka} aria-hidden="true" />{IME}</a>
            <p className={s.nogaOpis}>Računi, stroški, davki in blagajna za slovenski s.p. in majhna podjetja.</p>
          </div>
          <div>
            <h3>Izdelek</h3>
            <ul>
              <li><a href="/funkcije">Funkcije</a></li>
              <li><a href="#cene">Cene</a></li>
              <li><a href="/davcna-blagajna">Blagajna za lokale</a></li>
              <li><a href="/e-racun">E-računi 2028</a></li>
              <li><a href="/demo">Preizkusite brez registracije</a></li>
            </ul>
          </div>
          <div>
            <h3>Kontakt</h3>
            <ul>
              <li><a href={`mailto:${KONTAKT}`}>{KONTAKT_PRIKAZ}</a></li>
              {/* TODO: lasten naslov ustanovitelja, ce ga zelite lociti od podpore */}
              <li><a href={`mailto:${KONTAKT}?subject=${encodeURIComponent('Za ustanovitelja')}`}>Pišite ustanovitelju</a></li>
              <li><a href="/za-racunovodje">Za računovodje</a></li>
            </ul>
          </div>
          <div>
            <h3>Pravno</h3>
            <ul>
              <li><a href="/privacy">Zasebnost</a></li>
              <li><a href="/terms">Pogoji uporabe</a></li>
            </ul>
          </div>
        </div>
        <div className={s.nogaSpodaj}>
          <span>© {new Date().getFullYear()} {IME}</span>
          <span>Podatki na strežnikih v EU</span>
        </div>
      </div>
    </footer>
  )
}
