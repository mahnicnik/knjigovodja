'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * ODJAVA OD OBVEŠČANJA (26.8.2026)
 *
 * Javna stran - stranka ni prijavljena in tudi ne more biti. Do nje pride
 * prek povezave v nogi trzenjskega sporocila.
 *
 * Odjava se izvede TAKOJ ob odprtju, brez dodatnega klika. Razlog: ce bi
 * zahtevali potrditev, bi del ljudi obtical na vmesnem koraku in bi sporocila
 * se naprej prejemal - odjava mora biti lazja od prejemanja, ne tezja.
 *
 * Sprememba je omejena na privolitev: funkcija `odjavi_od_obvescanja` v bazi
 * ne izpostavi nobenega drugega podatka o stranki.
 */
export default function OdjavaPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const [stanje, setStanje] = useState<'nalagam' | 'odjavljen' | 'neveljaven' | 'napaka'>('nalagam')
  const [ime, setIme] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      if (!token) { setStanje('neveljaven'); return }
      try {
        const { data, error } = await createClient()
          .rpc('odjavi_od_obvescanja', { p_token: token })
        if (error) { setStanje('napaka'); return }
        const r = Array.isArray(data) ? data[0] : data
        if (r?.uspelo) { setIme(r.ime ?? null); setStanje('odjavljen') }
        else setStanje('neveljaven')
      } catch {
        setStanje('napaka')
      }
    })()
  }, [token])

  const okvir: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F5F3EF', padding: 24,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  }
  const kartica: React.CSSProperties = {
    maxWidth: 460, width: '100%', background: '#fff', borderRadius: 14, padding: 32,
    border: '1px solid rgba(0,0,0,0.06)', textAlign: 'center',
  }

  return (
    <div style={okvir}>
      <div style={kartica}>
        {stanje === 'nalagam' && (
          <div style={{ fontSize: 14, color: '#666' }}>Odjavljam…</div>
        )}

        {stanje === 'odjavljen' && (
          <>
            <div style={{ fontSize: 30, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12', marginBottom: 10 }}>
              Odjava je opravljena
            </div>
            <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.65 }}>
              {ime ? `${ime}, od` : 'Od'}slej vam ne bomo več pošiljali čestitk in
              drugih obvestil o ponudbi.
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.65, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              Račune in obvestila o vaši kartici boste še naprej prejemali —
              to so sporočila o storitvi, ki jo uporabljate, in niso oglasna.
              Če želite obveščanje znova vklopiti, nam to povejte ob naslednjem obisku.
            </div>
          </>
        )}

        {stanje === 'neveljaven' && (
          <>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🔗</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F12', marginBottom: 10 }}>
              Povezava ni veljavna
            </div>
            <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.65 }}>
              Morda je bila skrajšana ali že uporabljena. Če želite odjavo,
              nam odgovorite na prejeto sporočilo in vas bomo odstranili.
            </div>
          </>
        )}

        {stanje === 'napaka' && (
          <>
            <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F12', marginBottom: 10 }}>
              Odjave ni bilo mogoče izvesti
            </div>
            <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.65 }}>
              Poskusite čez nekaj minut. Če ne uspe, nam odgovorite na prejeto
              sporočilo — odjavo bomo opravili sami.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
