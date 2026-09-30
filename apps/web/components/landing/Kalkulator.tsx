'use client'

import { useState } from 'react'
import s from './landing.module.css'
import { IME, IME_O } from './ime'
import { PAKETI } from './podatki'
import { izracunajPrihranek, privzetiCasi, prihranjeneMinute, type Casi } from '@/lib/landing-kalkulator'
import { fmtStevilo, ureBeseda } from '@/lib/landing-raziskava'

const PRO = PAKETI.find(p => p.id === 'pro')!
const eur = (n: number) => n.toLocaleString('sl-SI', { maximumFractionDigits: 0 }) + ' €'
const ZACETNO = privzetiCasi()

type Drsnik = { id: string; oznaka: string; min: number; max: number; korak: number; enota?: string }

function Drsnik({ d, vrednost, nastavi }: { d: Drsnik; vrednost: number; nastavi: (n: number) => void }) {
  return (
    <div className={s.drsnik}>
      <div className={s.drsnikGlava}>
        <label htmlFor={d.id}>{d.oznaka}</label>
        <output htmlFor={d.id} className={`${s.drsnikVrednost} ${s.stevilke}`} data-testid={`${d.id}-vrednost`}>
          {vrednost}{d.enota ? ` ${d.enota}` : ''}
        </output>
      </div>
      <input id={d.id} type="range" min={d.min} max={d.max} step={d.korak} value={vrednost}
        onChange={e => nastavi(Number(e.target.value))} />
      <div className={s.drsnikMeje} aria-hidden="true">
        <span>{d.min}{d.enota ? ` ${d.enota}` : ''}</span><span>{d.max}{d.enota ? ` ${d.enota}` : ''}</span>
      </div>
    </div>
  )
}

const VRSTICE: { naziv: string; prej: keyof Casi; zdaj: keyof Casi }[] = [
  { naziv: 'Izdaja enega računa', prej: 'racunPrej', zdaj: 'racunZdaj' },
  { naziv: 'Vnos enega prejetega računa', prej: 'strosekPrej', zdaj: 'strosekZdaj' },
  { naziv: 'Mesečni zaključek (KPO, DDV, prispevki)', prej: 'zakljucekPrej', zdaj: 'zakljucekZdaj' },
]

export default function Kalkulator() {
  const [racuni, setRacuni] = useState(20)
  const [stroski, setStroski] = useState(15)
  const [postavka, setPostavka] = useState(30)
  const [casi, setCasi] = useState<Casi>(ZACETNO.casi)

  const r = izracunajPrihranek({
    racunovNaMesec: racuni,
    stroskovNaMesec: stroski,
    urnaPostavka: postavka,
    cenaPaketaNaMesec: PRO.mesecno,
    ...prihranjeneMinute(casi),
  })

  const nastaviCas = (k: keyof Casi, v: string) => {
    const n = Number(v.replace(',', '.'))
    setCasi(c => ({ ...c, [k]: Number.isFinite(n) && n >= 0 ? n : 0 }))
  }

  return (
    <section className={s.sekcija} id="kalkulator" aria-labelledby="kalk-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="kalk-naslov" className={s.h2}>Koliko časa dobite nazaj?</h2>
          <p className={s.uvod}>
            Premaknite drsnike. Pod izračunom lahko vpišete, koliko vam posamezno opravilo vzame danes, in izračun se prilagodi vam.
          </p>
        </div>
        <div className={s.kalkulator} data-razkrij>
          <div className={s.kalkVhodi}>
            <Drsnik d={{ id: 'kalk-racuni', oznaka: 'Izdani računi na mesec', min: 0, max: 200, korak: 1 }} vrednost={racuni} nastavi={setRacuni} />
            <Drsnik d={{ id: 'kalk-stroski', oznaka: 'Prejeti računi (stroški) na mesec', min: 0, max: 200, korak: 1 }} vrednost={stroski} nastavi={setStroski} />
            <Drsnik d={{ id: 'kalk-postavka', oznaka: 'Koliko je vredna vaša ura', min: 10, max: 150, korak: 5, enota: '€' }} vrednost={postavka} nastavi={setPostavka} />
          </div>
          <div className={s.kalkRezultat} aria-live="polite" data-testid="kalk-rezultat">
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
                <p className={s.kalkOznaka}>Vrednost na mesec</p>
                <p className={`${s.kalkEvriZnesek} ${s.stevilke}`} data-testid="kalk-eur-mesec">{eur(r.evrovNaMesec)}</p>
              </div>
              <div>
                <p className={s.kalkOznaka}>Vrednost na leto</p>
                <p className={`${s.kalkEvriZnesek} ${s.stevilke}`} data-testid="kalk-eur-leto">{eur(r.evrovNaLeto)}</p>
              </div>
            </div>
            <p className={s.kalkNapis}>
              Vrednost prihranjenega časa po vaši urni postavki, zmanjšana za ceno paketa Pro ({PRO.mesecno.toLocaleString('sl-SI')} €/mes).
            </p>
          </div>
        </div>

        <details className={s.kalkPredpostavke} data-razkrij>
          <summary>
            {ZACETNO.izRaziskave ? 'Časi opravil iz naše raziskave' : 'Predpostavke izračuna'} — prilagodite jih svojim
          </summary>
          <p className={s.kalkPredpostavkeUvod}>
            {ZACETNO.izRaziskave
              ? 'Privzeti časi so povprečja iz naše raziskave. Vpišite svoje, če se razlikujejo.'
              : `Privzeti časi so okvirna ocena, ne meritev. Vpišite, koliko vam opravilo vzame danes in koliko pričakujete z ${IME_O}.`}
          </p>
          <div className={s.kalkTabela} role="table" aria-label="Časi opravil v minutah">
            <div className={s.kalkTabelaGlava} role="row">
              <span role="columnheader">Opravilo</span>
              <span role="columnheader">Danes (min)</span>
              <span role="columnheader">Z {IME_O} (min)</span>
            </div>
            {VRSTICE.map(v => (
              <div className={s.kalkTabelaVrstica} role="row" key={v.prej}>
                <span role="cell">{v.naziv}</span>
                <span role="cell">
                  <input type="number" inputMode="decimal" min={0} step="any" value={casi[v.prej]}
                    aria-label={`${v.naziv}, danes v minutah`} data-testid={`kalk-${v.prej}`}
                    onChange={e => nastaviCas(v.prej, e.target.value)} />
                </span>
                <span role="cell">
                  <input type="number" inputMode="decimal" min={0} step="any" value={casi[v.zdaj]}
                    aria-label={`${v.naziv}, z ${IME} v minutah`} data-testid={`kalk-${v.zdaj}`}
                    onChange={e => nastaviCas(v.zdaj, e.target.value)} />
                </span>
              </div>
            ))}
          </div>
          <button type="button" className={s.kalkPonastavi} onClick={() => setCasi(ZACETNO.casi)}>Ponastavi čase</button>
        </details>
      </div>
    </section>
  )
}
