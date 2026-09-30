'use client'

import { useState } from 'react'
import s from './landing.module.css'
import { Kljukica, Ura } from './Ikone'
import { PAKETI, fmtEur } from './podatki'
import { RAZISKAVA, fmtStevilo, ureBeseda } from '@/lib/landing-raziskava'

export default function Cene() {
  const [letno, setLetno] = useState(false)
  return (
    <section className={`${s.sekcija} ${s.sekcijaSiva}`} id="cene" aria-labelledby="cene-naslov">
      <div className={s.vsebina}>
        <div className={s.glavaSredina} data-razkrij>
          <h2 id="cene-naslov" className={s.h2}>Preprosti paketi. Brez vezave.</h2>
          <p className={s.uvod}>Začnete brezplačno. Nadgradite, ko vam začne zmanjkovati časa.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className={s.preklop} role="group" aria-label="Obdobje plačila">
            <button type="button" aria-pressed={!letno} onClick={() => setLetno(false)}>Mesečno</button>
            <button type="button" aria-pressed={letno} onClick={() => setLetno(true)}>
              Letno<span className={s.preklopPopust}>2 meseca brezplačno</span>
            </button>
          </div>
        </div>
        <div className={s.paketi}>
          {PAKETI.map(p => {
            const ure = RAZISKAVA.urNaMesecPoPaketu[p.id]
            const cena = letno ? p.letno : p.mesecno
            return (
              <article key={p.id} className={p.poudarjen ? s.paketPoudarjen : s.paket} data-razkrij>
                <h3 className={s.paketIme}>
                  {p.ime}
                  {p.poudarjen && <span className={s.paketOznaka}>Priporočamo</span>}
                </h3>
                <div>
                  <p className={`${s.paketCena} ${s.stevilke}`}>
                    {fmtEur(cena)} <span className={s.paketNa}>{p.mesecno === 0 ? 'za vedno' : letno ? '/ leto' : '/ mesec'}</span>
                  </p>
                  <p className={`${s.paketDodatno} ${s.stevilke}`}>
                    {p.mesecno > 0 && (letno
                      ? `${fmtEur(Math.round(p.letno / 12 * 100) / 100)} na mesec, plačano letno`
                      : `ali ${fmtEur(p.letno)} na leto`)}
                  </p>
                </div>
                <p className={s.paketOpis}>{p.opis}</p>
                {ure != null ? (
                  <p className={`${s.paketUre} ${s.prihranek}`}><Ura />Prihrani približno {fmtStevilo(ure)} {ureBeseda(ure)} na mesec</p>
                ) : null /* TODO: podatek iz raziskave (prihranek ur na mesec za ta paket) */}
                <a href="/register" className={`${p.poudarjen ? s.gumbSvetli : p.id === 'pos' ? s.gumbPrimarni : s.gumbSekundarni} ${s.celaSirina}`}>
                  Začnite brezplačno
                </a>
                <ul className={s.paketSeznam}>
                  {p.funkcije.map(f => f.startsWith('Brez ')
                    ? <li key={f} className={s.paketManjka}><span aria-hidden="true" className={s.paketManjkaZnak}>–</span>{f}</li>
                    : <li key={f}><Kljukica />{f}</li>)}
                </ul>
              </article>
            )
          })}
        </div>
        <p className={s.ceneNoga}>Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
      </div>
    </section>
  )
}
