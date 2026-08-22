'use client'

import { useEffect, useState } from 'react'

/**
 * ZAZNAVA NOVE RAZLIČICE PO OBJAVI (22.8.2026)
 *
 * Zavihek, ki je odprt med objavo, tece naprej na STARI kodi in tega ne pove.
 * Za blagajno, ki je odprta ves dan, to pomeni, da natakar po posodobitvi se
 * naprej dela s staro razlicico - popravki ne veljajo, napake, ki so ze
 * odpravljene, se ponavljajo, in nihce ne ve, zakaj.
 *
 * Pri preizkusu se je to zgodilo dobesedno: funkcije, ki je bila objavljena,
 * v odprtem zavihku ni bilo, in sele primerjava paketov je razkrila, da tece
 * stara koda.
 *
 * Deluje tako, da vsakih nekaj minut primerja identifikator gradnje s tistim,
 * ki ga vraca streznik. Ob spremembi pokaze NEVSILJIV poziv - nikoli ne
 * osvezi sam, ker bi to sredi placila pomenilo izgubljeno kosarico.
 */
export default function ZaznavaNoveRazlicice() {
  const [naVoljo, setNaVoljo] = useState(false)

  useEffect(() => {
    const trenutna = process.env.NEXT_PUBLIC_BUILD_ID
    if (!trenutna) return   // v razvoju ne preverjamo

    let ustavljeno = false

    async function preveri() {
      try {
        // `cache: 'no-store'` je nujen — sicer bi brskalnik vracal
        // predpomnjen odgovor in nova razlicica ne bi bila nikoli zaznana.
        const res = await fetch('/api/verzija', { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (!ustavljeno && buildId && buildId !== trenutna) setNaVoljo(true)
      } catch {
        // Brez omrezja ali ob napaki tiho preskocimo — to ni razlog za opozorilo.
      }
    }

    const t = setInterval(preveri, 5 * 60 * 1000)
    // Preverimo tudi, ko se uporabnik vrne v zavihek.
    const obVrnitvi = () => { if (document.visibilityState === 'visible') preveri() }
    document.addEventListener('visibilitychange', obVrnitvi)
    preveri()

    return () => {
      ustavljeno = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', obVrnitvi)
    }
  }, [])

  if (!naVoljo) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#0D1F12', color: '#fff',
      padding: '11px 14px', borderRadius: 12, display: 'flex', alignItems: 'center',
      gap: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.25)', fontSize: 13,
      fontFamily: 'inherit', maxWidth: 'calc(100vw - 32px)',
    }}>
      <span>Na voljo je nova različica.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#fff', color: '#0D1F12', border: 0, borderRadius: 8,
          padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
        Osveži
      </button>
      <button
        onClick={() => setNaVoljo(false)}
        title="Skrij za zdaj"
        style={{
          background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 0,
          fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px',
        }}>
        ×
      </button>
    </div>
  )
}
