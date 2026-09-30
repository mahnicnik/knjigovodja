import s from './landing.module.css'
import { Kljukica } from './Ikone'
import { PAKETI, PERSONE, fmtEur } from './podatki'

export default function ZaKoga() {
  return (
    <section className={`${s.sekcija} ${s.sekcijaSiva}`} id="za-koga" aria-labelledby="za-koga-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="za-koga-naslov" className={s.h2}>Narejeno za vaše delo</h2>
        </div>
        <div className={s.kartice}>
          {PERSONE.map(p => {
            const paket = PAKETI.find(x => x.id === p.paket)!
            return (
              <article key={p.naslov} className={s.kartica} data-razkrij>
                <h3 className={s.h3}>{p.naslov}</h3>
                <p className={s.karticaKdo}>{p.kdo}</p>
                <ul className={s.seznam}>
                  {p.opravila.map(t => <li key={t}><Kljukica className={s.kljukica} />{t}</li>)}
                </ul>
                <p className={s.karticaPaket}>
                  <span>Priporočamo</span>
                  <strong className={s.stevilke}>{paket.ime} · {fmtEur(paket.mesecno)}/mes</strong>
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
