'use client'

import { useState } from 'react'
import s from './landing.module.css'
import Znak from './Znak'
import { IME } from './ime'

const POVEZAVE: [string, string][] = [
  ['Funkcije', '/funkcije'],
  ['Cene', '#cene'],
  ['Za lokale', '/davcna-blagajna'],
  ['E-računi 2028', '/e-racun'],
]

export default function Navigacija() {
  const [odprt, setOdprt] = useState(false)
  return (
    <header className={s.nav}>
      <div className={s.navNotranje}>
        <a href="#vrh" className={s.logo} aria-label={`${IME} — na vrh strani`}>
          <Znak />
          {IME}
        </a>
        <nav className={s.navPovezave} aria-label="Glavna navigacija">
          {POVEZAVE.map(([n, h]) => <a key={h} href={h}>{n}</a>)}
        </nav>
        <div className={s.navDesno}>
          <a href="/login" className={s.navPrijava}>Prijava</a>
          <a href="/register" className={s.gumbPrimarni}>Začnite brezplačno</a>
        </div>
        <button
          type="button"
          className={s.hamburger}
          aria-expanded={odprt}
          aria-controls="mobilni-meni"
          aria-label={odprt ? 'Zapri meni' : 'Odpri meni'}
          onClick={() => setOdprt(o => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {odprt
              ? <path d="M5 5l12 12M17 5 5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      <div id="mobilni-meni" className={`${s.mobilniMeni} ${odprt ? s.mobilniMeniOdprt : ''}`} hidden={!odprt}>
        <nav aria-label="Mobilna navigacija">
          {POVEZAVE.map(([n, h]) => <a key={h} href={h} onClick={() => setOdprt(false)}>{n}</a>)}
        </nav>
        <div className={s.mobilniGumbi}>
          <a href="/register" className={s.gumbPrimarni}>Začnite brezplačno</a>
          <a href="/login" className={s.gumbSekundarni}>Prijava</a>
        </div>
      </div>
    </header>
  )
}
