'use client'

import { useState } from 'react'
import s from './landing.module.css'
import { IME_O } from './ime'
import { PAKETI } from './podatki'
import { izracunajPrihranek, izRaziskave } from '@/lib/landing-kalkulator'
import { fmtStevilo, ureBeseda } from '@/lib/landing-raziskava'

const PRO = PAKETI.find(p => p.id === 'pro')!
const eur = (n: number) => n.toLocaleString('sl-SI', { maximumFractionDigits: 0 }) + ' €'

export default function Kalkulator() {
  const [racuni, setRacuni] = useState(20)
  const [postavka, setPostavka] = useState(30)
  const minute = izRaziskave()
  const r = minute
    ? izracunajPrihranek({ racunovNaMesec: racuni, urnaPostavka: postavka, cenaPaketaNaMesec: PRO.mesecno, ...minute })
    : null

  return (
    <section className={s.sekcija} id="kalkulator" aria-labelledby="kalk-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="kalk-naslov" className={s.h2}>Koliko časa dobite nazaj?</h2>
          <p className={s.uvod}>Premaknite drsnika. Izračun temelji na času opravil iz naše raziskave in ceni paketa Pro.</p>
        </div>
        <div className={s.kalkulator} data-razkrij>
          <div className={s.kalkVhodi}>
            <div className={s.drsnik}>
              <div className={s.drsnikGlava}>
                <label htmlFor="kalk-racuni">Koliko računov izdate na mesec</label>
                <output htmlFor="kalk-racuni" className={`${s.drsnikVrednost} ${s.stevilke}`} data-testid="kalk-racuni-vrednost">{racuni}</output>
              </div>
              <input id="kalk-racuni" type="range" min={1} max={200} step={1} value={racuni}
                onChange={e => setRacuni(Number(e.target.value))} />
              <div className={s.drsnikMeje} aria-hidden="true"><span>1</span><span>200</span></div>
            </div>
            <div className={s.drsnik}>
              <div className={s.drsnikGlava}>
                <label htmlFor="kalk-postavka">Koliko je vredna vaša ura (€)</label>
                <output htmlFor="kalk-postavka" className={`${s.drsnikVrednost} ${s.stevilke}`} data-testid="kalk-postavka-vrednost">{postavka} €</output>
              </div>
              <input id="kalk-postavka" type="range" min={10} max={150} step={5} value={postavka}
                onChange={e => setPostavka(Number(e.target.value))} />
              <div className={s.drsnikMeje} aria-hidden="true"><span>10 €</span><span>150 €</span></div>
            </div>
          </div>
          <div className={s.kalkRezultat} aria-live="polite" data-testid="kalk-rezultat">
            {r ? (
              <>
                <div>
                  <p className={s.kalkOznaka}>Prihranjen čas z {IME_O}</p>
                  <p className={`${s.kalkUre} ${s.stevilke}`}>
                    <span className={s.marker} data-testid="kalk-ure">{fmtStevilo(r.urNaMesec)}</span>{' '}
                    <span className={s.kalkUreEnota}>{ureBeseda(r.urNaMesec)} na mesec</span>
                  </p>
                  <p className={s.kalkOznaka} style={{ marginTop: 8 }}>
                    <span className={s.stevilke} data-testid="kalk-ure-leto">{fmtStevilo(r.urNaLeto, 0)}</span> {ureBeseda(r.urNaLeto)} na leto
                  </p>
                </div>
                <div className={s.kalkEvri}>
                  <div>
                    <p className={s.kalkOznaka}>Na mesec</p>
                    <p className={`${s.kalkEvriZnesek} ${s.stevilke}`} data-testid="kalk-eur-mesec">{eur(r.evrovNaMesec)}</p>
                  </div>
                  <div>
                    <p className={s.kalkOznaka}>Na leto</p>
                    <p className={`${s.kalkEvriZnesek} ${s.stevilke}`} data-testid="kalk-eur-leto">{eur(r.evrovNaLeto)}</p>
                  </div>
                </div>
                <p className={s.kalkNapis}>Vrednost prihranjenega časa, zmanjšana za ceno paketa Pro ({PRO.mesecno.toLocaleString('sl-SI')} €/mes).</p>
              </>
            ) : (
              <>
                {/* TODO: podatek iz raziskave (izdaja racuna in mesecni zakljucek, prej -> zdaj).
                    Dokler ga ni, kalkulator ne pokaze stevilke. */}
                <p className={s.kalkOznaka}>Prihranjen čas z {IME_O}</p>
                <p className={s.kalkUre} data-testid="kalk-ure">—</p>
                <p className={s.kalkNapis}>Izračun objavimo, ko zaključimo meritve časa opravil.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
