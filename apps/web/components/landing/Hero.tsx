import s from './landing.module.css'
import { IME, IME_R } from './ime'
import { Kljukica } from './Ikone'
import Posnetek from './Posnetek'

export default function Hero() {
  return (
    <section className={s.hero} aria-labelledby="hero-naslov">
      <div className={s.vsebina}>
        <h1 id="hero-naslov" className={s.h1}>
          Računi, davki in blagajna. <span className={s.h1Poudarek}>V minutah, ne v urah.</span>
        </h1>
        <p className={s.heroPodnaslov}>
          {IME} izda račun, prebere stroške s fotografije in izračuna prispevke ter DDV. Vi samo potrdite.
        </p>
        <div className={s.heroGumbi}>
          <a href="/register" className={`${s.gumbPrimarni} ${s.gumbVelik}`}>Začnite brezplačno</a>
          <a href="/demo" className={`${s.gumbSekundarni} ${s.gumbVelik}`}>Preizkusite brez registracije</a>
        </div>
        <p className={s.heroPodGumbi}>Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
        <ul className={s.zaupanje}>
          {['FURS certificirana blagajna', 'Podatki v EU', 'Brez vezave'].map(t => (
            <li key={t}><Kljukica className={s.kljukica} velikost={18} />{t}</li>
          ))}
        </ul>
      </div>
      <div className={s.vsebina}>
        <div className={s.heroOder}>
          <div className={s.heroOkvir}>
            <Posnetek
              ime="dashboard"
              pot="/dashboard"
              alt={`Nadzorna plošča ${IME_R}: prihodki, odprti računi, prispevki in davčni roki`}
              sizes="(max-width: 1200px) 94vw, 1080px"
              priority
            />
            <div className={s.heroTelefon}>
              <Posnetek
                ime="dashboard-mobilni"
                okvir="telefon"
                alt="Nadzorna plošča na mobilnem telefonu"
                sizes="(max-width: 640px) 34vw, 230px"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
