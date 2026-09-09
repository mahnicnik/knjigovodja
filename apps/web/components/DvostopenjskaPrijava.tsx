"use client"

/**
 * DVOSTOPENJSKA PRIJAVA (prelet 229)
 * ══════════════════════════════════
 *
 * Racunko hrani davcne podatke, izdane racune in dostop do blagajne. Doslej
 * je vse to varovalo eno samo geslo - ce ga kdo izve ali ugane, dobi vse.
 *
 * Uporabljamo VGRAJENI mehanizem Supabase (TOTP), ne lastnega. Razlog je
 * preprost: skrivnost se hrani na strezniku pri ponudniku, preverjanje pa
 * tece tam, kjer se seja ustvari. Lastna izvedba bi zahtevala hrambo
 * skrivnosti v nasi bazi - torej vec tveganja za nic koristi.
 *
 * KAKO DELUJE
 * Uporabnik skenira kodo v aplikacijo (Google Authenticator, 1Password,
 * Authy). Ta vsakih 30 sekund ustvari sestmestno stevilko. Ob prijavi jo
 * vpise poleg gesla.
 *
 * VAROVALKA: dokler koda ni PRVIC potrjena, prijava ostane brez druge
 * stopnje. Tako se ne more zgoditi, da bi si uporabnik zaklenil dostop z
 * napacno nastavljeno aplikacijo.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function DvostopenjskaPrijava() {
  const [nalaganje, setNalaganje] = useState(true)
  const [vklopljena, setVklopljena] = useState(false)
  const [faktorId, setFaktorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [skrivnost, setSkrivnost] = useState<string | null>(null)
  const [koda, setKoda] = useState('')
  const [napaka, setNapaka] = useState<string | null>(null)
  const [sporocilo, setSporocilo] = useState<string | null>(null)
  const [delam, setDelam] = useState(false)

  const sb = createClient()

  async function preberiStanje() {
    setNalaganje(true)
    try {
      const { data, error } = await sb.auth.mfa.listFactors()
      if (error) throw error
      const potrjen = (data?.totp || []).find((f: any) => f.status === 'verified')
      setVklopljena(!!potrjen)
      setFaktorId(potrjen?.id || null)
    } catch (e: any) {
      setNapaka(e?.message || 'Stanja ni bilo mogoče prebrati.')
    } finally {
      setNalaganje(false)
    }
  }

  useEffect(() => { preberiStanje() }, [])

  /** Pripravi novo kodo za skeniranje. */
  async function zacni() {
    setNapaka(null); setSporocilo(null); setDelam(true)
    try {
      // Nepotrjeni poskusi iz prejsnjih obiskov bi se nabirali, zato jih
      // pred novim vpisom odstranimo.
      const { data: obstojeci } = await sb.auth.mfa.listFactors()
      for (const f of ((obstojeci?.totp || []) as any[])) {
        if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id })
      }

      const { data, error } = await sb.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Računko ' + new Date().toLocaleDateString('sl-SI'),
      })
      if (error) throw error
      setFaktorId(data.id)
      setQr(data.totp.qr_code)
      setSkrivnost(data.totp.secret)
    } catch (e: any) {
      setNapaka(e?.message || 'Kode ni bilo mogoče pripraviti.')
    } finally { setDelam(false) }
  }

  /** Potrdi kodo iz aplikacije - sele s tem se druga stopnja vklopi. */
  async function potrdi() {
    if (!faktorId || koda.length < 6) return
    setNapaka(null); setDelam(true)
    try {
      const { data: izziv, error: e1 } = await sb.auth.mfa.challenge({ factorId: faktorId })
      if (e1) throw e1
      const { error: e2 } = await sb.auth.mfa.verify({
        factorId: faktorId, challengeId: izziv.id, code: koda.trim(),
      })
      if (e2) throw e2

      setQr(null); setSkrivnost(null); setKoda('')
      setSporocilo('Dvostopenjska prijava je vklopljena.')
      await preberiStanje()
    } catch (e: any) {
      setNapaka('Koda ni pravilna. Preverite, da je ura na telefonu točna, in poskusite z novo kodo.')
    } finally { setDelam(false) }
  }

  async function izklopi() {
    if (!faktorId) return
    if (!confirm('Ali res želite izklopiti dvostopenjsko prijavo? Račun bo varovalo samo geslo.')) return
    setNapaka(null); setDelam(true)
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId: faktorId })
      if (error) throw error
      setSporocilo('Dvostopenjska prijava je izklopljena.')
      await preberiStanje()
    } catch (e: any) {
      setNapaka(e?.message || 'Izklop ni uspel.')
    } finally { setDelam(false) }
  }

  const okvir = { background:'#fff', borderRadius:16, border:'1px solid #f0f0f0', padding:24, marginTop:16 }

  if (nalaganje) return <div style={okvir}>Nalaganje…</div>

  return (
    <div style={okvir}>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>🛡️ Dvostopenjska prijava</div>
      <div style={{ fontSize:13, color:'#888', marginBottom:20, lineHeight:1.6 }}>
        Poleg gesla boste ob prijavi vpisali še šestmestno kodo iz aplikacije na telefonu.
        Tudi če kdo izve vaše geslo, brez telefona ne pride do vaših podatkov.
      </div>

      {napaka && (
        <div style={{ padding:'10px 12px', borderRadius:8, background:'#fef2f2', color:'#b91c1c', fontSize:12.5, marginBottom:14 }}>{napaka}</div>
      )}
      {sporocilo && (
        <div style={{ padding:'10px 12px', borderRadius:8, background:'#f0fdf4', color:'#15803d', fontSize:12.5, marginBottom:14 }}>{sporocilo}</div>
      )}

      {vklopljena ? (
        <>
          <div style={{ padding:'12px 14px', borderRadius:10, background:'#f0fdf4', border:'1px solid #bbf7d0', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#15803d' }}>Vklopljena</div>
            <div style={{ fontSize:12, color:'#166534', marginTop:4, lineHeight:1.5 }}>
              Ob naslednji prijavi boste vpisali kodo iz aplikacije.
            </div>
          </div>
          <button onClick={izklopi} disabled={delam}
            style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff',
                     cursor:'pointer', fontFamily:'inherit', fontSize:13, color:'#b91c1c' }}>
            Izklopi dvostopenjsko prijavo
          </button>
        </>
      ) : qr ? (
        <>
          <div style={{ fontSize:13, marginBottom:12, lineHeight:1.6 }}>
            <b>1.</b> V aplikaciji za kode (Google Authenticator, 1Password, Authy) skenirajte to kodo.
          </div>
          {/* Supabase vrne QR kot SVG v obliki data: URI. */}
          <img src={qr} alt="Koda za skeniranje" width={200} height={200}
            style={{ display:'block', marginBottom:12, borderRadius:8, border:'1px solid #f0f0f0' }}/>
          <div style={{ fontSize:12, color:'#888', marginBottom:4 }}>
            Če skeniranje ne gre, kodo vpišite ročno:
          </div>
          <code style={{ display:'block', fontSize:12, background:'#f9fafb', padding:'8px 10px',
                         borderRadius:6, marginBottom:18, wordBreak:'break-all' }}>{skrivnost}</code>

          <div style={{ fontSize:13, marginBottom:8 }}><b>2.</b> Vpišite kodo, ki jo aplikacija prikaže.</div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input value={koda} onChange={e => setKoda(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter') potrdi() }}
              placeholder="000000" inputMode="numeric" autoFocus
              style={{ width:130, padding:'10px 12px', borderRadius:10, border:'1px solid #e5e7eb',
                       fontSize:18, letterSpacing:'0.18em', textAlign:'center', fontFamily:'inherit' }}/>
            <button onClick={potrdi} disabled={delam || koda.length < 6}
              style={{ padding:'11px 18px', borderRadius:10, border:'none',
                       background: koda.length < 6 ? '#e5e7eb' : '#0D1F12',
                       color: koda.length < 6 ? '#9ca3af' : '#fff',
                       cursor: koda.length < 6 ? 'default' : 'pointer', fontFamily:'inherit',
                       fontSize:13, fontWeight:600 }}>Potrdi in vklopi</button>
          </div>
          <div style={{ fontSize:11.5, color:'#888', marginTop:12, lineHeight:1.5 }}>
            Dokler kode ne potrdite, prijava ostane nespremenjena.
          </div>
        </>
      ) : (
        <button onClick={zacni} disabled={delam}
          style={{ padding:'11px 18px', borderRadius:10, border:'none', background:'#0D1F12',
                   color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600 }}>
          {delam ? 'Pripravljam…' : 'Vklopi dvostopenjsko prijavo'}
        </button>
      )}
    </div>
  )
}
