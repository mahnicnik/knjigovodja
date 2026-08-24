'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * JAVNA STRAN ZA PODALJŠANJE KARTICE (22.8.2026)
 *
 * Stranka pride sem iz opomnika — BREZ racuna v aplikaciji. Stran samo
 * POKAZE, kaj se podaljsuje; predracun nastane sele ob kliku na gumb.
 *
 * Locitev je namerna: Gmail in protivirusni programi vsako povezavo iz
 * e-poste predhodno odprejo, da preverijo varnost. Ce bi predracun nastal ze
 * ob odprtju, bi ti nastajali sami od sebe, brez vednosti stranke.
 */
export default function ObnovaKartice() {
  const params = useParams()
  const token = String(params?.token || '')

  const [stanje, setStanje] = useState<'nalagam' | 'ponudba' | 'ustvarjen' | 'napaka'>('nalagam')
  const [podatki, setPodatki] = useState<any>(null)
  const [rezultat, setRezultat] = useState<any>(null)
  const [napaka, setNapaka] = useState('')
  const [posiljam, setPosiljam] = useState(false)

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`/api/obnova/${token}`)
        const d = await res.json()
        if (!res.ok) {
          setNapaka(
            d.napaka === 'potekla_povezava'
              ? 'Ta povezava je potekla. Pokličite nas in z veseljem uredimo podaljšanje.'
              : 'Povezava ni veljavna. Preverite, ali ste jo odprli v celoti.'
          )
          setStanje('napaka')
          return
        }
        setPodatki(d)
        // POPRAVLJENO (24.8.2026): ob osvezitvi so podatki za placilo izginili
        // - stran je pokazala le "predracun je ze izdan". Zdaj jih GET vrne.
        if (d.placilo) setRezultat(d.placilo)
        setStanje(d.status === 'quoted' || d.status === 'paid' ? 'ustvarjen' : 'ponudba')
      } catch {
        setNapaka('Strani ni bilo mogoče naložiti. Poskusite znova.')
        setStanje('napaka')
      }
    })()
  }, [token])

  async function ustvariPredracun() {
    setPosiljam(true)
    setNapaka('')
    try {
      const res = await fetch(`/api/obnova/${token}`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setNapaka(
          d.napaka === 'manjka_iban'
            ? 'Predračuna trenutno ni mogoče izdati. Pokličite nas in uredimo drugače.'
            : 'Predračuna ni bilo mogoče ustvariti. Poskusite znova ali nas pokličite.'
        )
        setPosiljam(false)
        return
      }
      setRezultat(d)
      setStanje('ustvarjen')
    } catch {
      setNapaka('Povezave ni bilo mogoče vzpostaviti. Poskusite znova.')
    }
    setPosiljam(false)
  }

  const eur = (n: number) => Number(n || 0).toFixed(2).replace('.', ',') + ' €'
  const datum = (d: string) => d ? new Date(d).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div style={{ minHeight: '100vh', background: '#F4EFE5', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>

        <div style={{ background: '#0D1F12', color: '#fff', borderRadius: '14px 14px 0 0', padding: '20px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{podatki?.podjetje?.naziv || 'Podaljšanje kartice'}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>

          {stanje === 'nalagam' && (
            <div style={{ color: '#888', fontSize: 14 }}>Nalagam…</div>
          )}

          {stanje === 'napaka' && (
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#A32D2D' }}>{napaka}</div>
          )}

          {stanje === 'ponudba' && podatki && (
            <>
              <div style={{ fontSize: 15, marginBottom: 4 }}>Pozdravljeni, {podatki.stranka}.</div>
              <div style={{ fontSize: 13, color: '#6b6962', lineHeight: 1.6, marginBottom: 20 }}>
                Vaša kartica poteče {datum(podatki.trenutnoPotece)}. Spodaj lahko
                naročite podaljšanje — predračun vam pošljemo takoj.
              </div>

              <div style={{ background: '#F7F6F2', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{podatki.paket}</div>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    {podatki.veljavnostDni && (
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Veljavnost:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{podatki.veljavnostDni} dni</td></tr>
                    )}
                    {podatki.obiski && (
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Obiskov:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{podatki.obiski}</td></tr>
                    )}
                    <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Cena:</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{eur(podatki.cena)}</td></tr>
                  </tbody>
                </table>
              </div>

              {napaka && <div style={{ fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{napaka}</div>}

              <button onClick={ustvariPredracun} disabled={posiljam}
                style={{ width: '100%', padding: '14px', borderRadius: 10, border: 0, background: posiljam ? '#8AA396' : '#1f6b3a', color: '#fff', fontWeight: 700, fontSize: 15, cursor: posiljam ? 'wait' : 'pointer' }}>
                {posiljam ? 'Pripravljam…' : 'Naroči podaljšanje'}
              </button>

              <div style={{ fontSize: 11, color: '#8a8880', marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
                S klikom naročite predračun. Kartica se podaljša, ko je plačilo prejeto.
              </div>
            </>
          )}

          {stanje === 'ustvarjen' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Predračun je pripravljen</div>
              <div style={{ fontSize: 13, color: '#6b6962', lineHeight: 1.6, marginBottom: 18 }}>
                {rezultat
                  ? 'Podatke za plačilo najdete spodaj. Kartico podaljšamo takoj, ko je plačilo prejeto.'
                  : 'Za to kartico je predračun že izdan. Če ga niste prejeli, nas pokličite.'}
              </div>

              {rezultat && (
                <div style={{ background: '#F7F6F2', borderRadius: 10, padding: 16, marginBottom: 18, fontSize: 13 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Predračun:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{rezultat.stevilka}</td></tr>
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Znesek:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{eur(rezultat.znesek)}</td></tr>
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>IBAN:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{rezultat.iban}</td></tr>
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Sklic:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{rezultat.sklic}</td></tr>
                      <tr><td style={{ color: '#6b6962', padding: '3px 0' }}>Plačajte do:</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{datum(rezultat.veljaDo)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {podatki?.podjetje && (podatki.podjetje.telefon || podatki.podjetje.email) && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 12, color: '#8a8880', textAlign: 'center', lineHeight: 1.6 }}>
              Vprašanja?{' '}
              {podatki.podjetje.telefon && <a href={`tel:${String(podatki.podjetje.telefon).replace(/\s/g, '')}`} style={{ color: '#1f6b3a' }}>{podatki.podjetje.telefon}</a>}
              {podatki.podjetje.telefon && podatki.podjetje.email && ' · '}
              {podatki.podjetje.email && <a href={`mailto:${podatki.podjetje.email}`} style={{ color: '#1f6b3a' }}>{podatki.podjetje.email}</a>}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#a8a49b', marginTop: 16 }}>
          Računko · davčna blagajna za storitve
        </div>
      </div>
    </div>
  )
}
