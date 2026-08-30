'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  steviloCakajocih, najstarejseUr, jeRokBlizu, shrambaNaVoljo,
} from '@/lib/offline-vrsta'

/**
 * STANJE POVEZAVE V BLAGAJNI (26.8.2026)
 *
 * Osebje mora ob vsakem trenutku vedeti, ali racun odhaja v bazo ali caka
 * na disku. Brez tega bi ob izpadu delalo naprej v prepricanju, da je vse
 * v redu - in bi ob koncu izmene ugotovilo, da polovice racunov ni nikjer.
 *
 * TRI STANJA:
 *   povezan, nic ne caka   -> nic ne pokazemo (vrstica bi le motila)
 *   povezan, nekaj caka    -> zeleno: posiljam
 *   ni povezave            -> rumeno: delam brez povezave, N racunov caka
 *
 * ROK: gotovinski racun je treba prijaviti FURS v DVEH DNEH. Ko se rok
 * bliza, barva postane rdeca in besedilo izrecno pove, koliko casa ostaja.
 */
export default function StanjePovezave({
  businessId,
  T,
  onSinhroniziraj,
}: {
  businessId: string
  T: any
  onSinhroniziraj?: () => Promise<void>
}) {
  const [povezan, setPovezan] = useState(true)
  const [caka, setCaka] = useState(0)
  const [ur, setUr] = useState<number | null>(null)
  const [sinhroniziram, setSinhroniziram] = useState(false)

  const osvezi = useCallback(async () => {
    if (!shrambaNaVoljo()) return
    setCaka(await steviloCakajocih(businessId))
    setUr(await najstarejseUr(businessId))
  }, [businessId])

  useEffect(() => {
    setPovezan(typeof navigator === 'undefined' ? true : navigator.onLine)
    osvezi()

    const gor = () => { setPovezan(true); osvezi() }
    const dol = () => { setPovezan(false); osvezi() }
    window.addEventListener('online', gor)
    window.addEventListener('offline', dol)

    // Stanje osvezujemo tudi sami: `navigator.onLine` pove le, ali je
    // omrezna kartica povezana, ne pa, ali strežnik odgovarja.
    const casovnik = setInterval(osvezi, 15_000)
    return () => {
      window.removeEventListener('online', gor)
      window.removeEventListener('offline', dol)
      clearInterval(casovnik)
    }
  }, [osvezi])

  async function posljiZdaj() {
    if (!onSinhroniziraj || sinhroniziram) return
    setSinhroniziram(true)
    try { await onSinhroniziraj() } finally {
      setSinhroniziram(false)
      osvezi()
    }
  }

  // Vse v redu in nic ne caka -> vrstica bi le motila.
  if (povezan && caka === 0) return null

  const nujnost = jeRokBlizu(ur)
  const barva = !povezan
    ? (nujnost === 'nujno' ? '#A83232' : '#b88c28')
    : '#1f6b3a'
  const ozadje = !povezan
    ? (nujnost === 'nujno' ? 'rgba(168,50,50,0.10)' : 'rgba(184,140,40,0.12)')
    : 'rgba(31,107,58,0.10)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', background: ozadje,
      borderBottom: '1px solid ' + barva + '40',
      fontSize: 12.5, color: barva, fontWeight: 600,
    }}>
      <span style={{ fontSize: 14 }}>{povezan ? '↑' : '⚠'}</span>

      <div style={{ flex: 1, lineHeight: 1.4 }}>
        {!povezan ? (
          <>
            Delam brez povezave — računi se shranjujejo na napravo
            {caka > 0 && <> · <strong>{caka} {caka === 1 ? 'čaka' : 'čaka'}</strong></>}
            {nujnost === 'nujno' && ur !== null && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                Najstarejši čaka {ur} h — FURS zahteva prijavo v 48 urah.
                Vzpostavite povezavo čim prej.
              </div>
            )}
            {nujnost === 'opozorilo' && ur !== null && (
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                Najstarejši čaka {ur} h. Rok za prijavo je 48 ur.
              </div>
            )}
          </>
        ) : (
          <>Povezava je znova vzpostavljena — <strong>{caka}</strong> {caka === 1 ? 'račun čaka' : 'računov čaka'} na prijavo</>
        )}
      </div>

      {povezan && caka > 0 && (
        <button onClick={posljiZdaj} disabled={sinhroniziram} style={{
          background: barva, color: '#fff', border: 0, borderRadius: 7,
          padding: '5px 12px', fontSize: 11.5, fontWeight: 700,
          cursor: sinhroniziram ? 'default' : 'pointer', fontFamily: 'inherit',
          opacity: sinhroniziram ? 0.6 : 1,
        }}>
          {sinhroniziram ? 'Pošiljam…' : 'Pošlji zdaj'}
        </button>
      )}
    </div>
  )
}
