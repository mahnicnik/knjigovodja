'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  steviloCakajocih, stanjeRoka, jeRokBlizu, shrambaNaVoljo,
} from '@/lib/offline-vrsta'
import {
  osveziOfflineKontekst, zagotoviPotrdiloNaNapravi, sinhronizirajVrsto,
} from '@/lib/offline-prodaja'

/**
 * STANJE POVEZAVE V BLAGAJNI (26.8.2026, razširjeno v preletu 158)
 *
 * Osebje mora ob vsakem trenutku vedeti, ali racun odhaja v bazo ali caka
 * na napravi. Brez tega bi ob izpadu delalo naprej v prepricanju, da je vse
 * v redu - in bi ob koncu izmene ugotovilo, da polovice racunov ni nikjer.
 *
 * TRI STANJA:
 *   povezan, nic ne caka   -> nic ne pokazemo (vrstica bi le motila)
 *   povezan, nekaj caka    -> zeleno: posiljam
 *   ni povezave            -> rumeno: delam brez povezave, N racunov caka
 *
 * ROK — POPRAVLJENO (prelet 158): ZDavPR (9. clen) zahteva prijavo "v dveh
 * DELOVNIH dneh od dneva prekinitve", ne v 48 urah, kot je pisalo prej.
 * Izpad v petek zvecer pomeni rok v torek — 48-urni odstevalnik bi se takrat
 * po nepotrebnem alarmiral v nedeljo; izpad v sredo pa pomeni rok v petek,
 * kjer bi 48 ur pokazalo prevec casa. Rok zdaj racuna offline-vrsta.ts po
 * delovnih dnevih in tu prikazemo konkreten datum in uro izteka.
 *
 * TA KOMPONENTA JE TUDI DIRIGENT DELA BREZ POVEZAVE (prelet 158): ob zagonu
 * s povezavo osvezi offline kontekst (davcna, oznaki PE/naprave, nacin
 * stevilcenja, glava racuna), poskrbi, da ima namizna aplikacija namensko
 * potrdilo, in samodejno poslje cakajoce racune — ob zagonu in ob dogodku
 * 'online'. Sedi namrec edina ves cas v glavi blagajne.
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
  const [rok, setRok] = useState<{ rok: Date; urDoRoka: number } | null>(null)
  const [sinhroniziram, setSinhroniziram] = useState(false)
  const syncTece = useRef(false)

  const osvezi = useCallback(async () => {
    if (!shrambaNaVoljo()) return
    setCaka(await steviloCakajocih(businessId))
    setRok(await stanjeRoka(businessId))
  }, [businessId])

  const sinhroniziraj = useCallback(async () => {
    // En sam socasen tek: 'online' dogodek in rocni klik se lahko prekrijeta,
    // dva vzporedna teka pa bi isti racun poslala dvakrat.
    if (syncTece.current) return
    syncTece.current = true
    setSinhroniziram(true)
    try {
      if (onSinhroniziraj) await onSinhroniziraj()
      else await sinhronizirajVrsto(businessId)
    } catch (e) {
      console.warn('Sinhronizacija čakajočih računov:', e)
    } finally {
      syncTece.current = false
      setSinhroniziram(false)
      osvezi()
    }
  }, [businessId, onSinhroniziraj, osvezi])

  useEffect(() => {
    setPovezan(typeof navigator === 'undefined' ? true : navigator.onLine)
    osvezi()

    // Priprava naprave za delo brez povezave — mogoca je samo S povezavo,
    // zato ob vsakem zagonu blagajne: svez kontekst, potrdilo na napravi,
    // in ce kaj caka od prej, takojsnje posiljanje.
    if (typeof navigator === 'undefined' || navigator.onLine) {
      osveziOfflineKontekst(businessId)
        .then(() => zagotoviPotrdiloNaNapravi())
        .catch(() => {})
      steviloCakajocih(businessId)
        .then((n: number) => { if (n > 0) sinhroniziraj() })
        .catch(() => {})
    }

    const gor = () => { setPovezan(true); osvezi(); sinhroniziraj() }
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
  }, [osvezi, sinhroniziraj, businessId])

  // Vse v redu in nic ne caka -> vrstica bi le motila.
  if (povezan && caka === 0) return null

  const nujnost = jeRokBlizu(rok?.urDoRoka ?? null)
  const zamujeno = rok !== null && rok.urDoRoka < 0
  const barva = !povezan
    ? ((nujnost === 'nujno' || zamujeno) ? '#A83232' : '#b88c28')
    : '#1f6b3a'
  const ozadje = !povezan
    ? ((nujnost === 'nujno' || zamujeno) ? 'rgba(168,50,50,0.10)' : 'rgba(184,140,40,0.12)')
    : 'rgba(31,107,58,0.10)'

  const rokBesedilo = rok
    ? rok.rok.toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

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
            {zamujeno && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                Rok za prijavo FURS (2 delovna dneva) je POTEKEL {rokBesedilo}.
                Vzpostavite povezavo TAKOJ — zamudo je treba znati opravičiti.
              </div>
            )}
            {!zamujeno && nujnost === 'nujno' && rok && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                Rok za prijavo FURS se izteče {rokBesedilo} (čez {rok.urDoRoka} h).
                Vzpostavite povezavo čim prej.
              </div>
            )}
            {!zamujeno && nujnost === 'opozorilo' && rok && (
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                Zakonski rok za prijavo (2 delovna dneva) se izteče {rokBesedilo}.
              </div>
            )}
          </>
        ) : (
          <>Povezava je znova vzpostavljena — <strong>{caka}</strong> {caka === 1 ? 'račun čaka' : 'računov čaka'} na prijavo</>
        )}
      </div>

      {povezan && caka > 0 && (
        <button onClick={sinhroniziraj} disabled={sinhroniziram} style={{
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
