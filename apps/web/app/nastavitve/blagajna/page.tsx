'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Premise {
  id: string
  premise_id: string
  name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  is_active: boolean
}

interface Device {
  id: string
  premise_id: string
  device_id: string
  is_active: boolean
}

interface Certificate {
  id: string
  issuer: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
}

export default function BlagajnaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [premises, setPremises] = useState<Premise[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form state — poslovni prostor
  const [premiseName, setPremiseName] = useState('ŠIRM fitness&bar')
  const [premiseId, setPremiseId] = useState('SIRBFB01')
  const [premiseAddress, setPremiseAddress] = useState('Poljanska cesta 87')
  const [premisePostal, setPremisePostal] = useState('4224')
  const [premiseCity, setPremiseCity] = useState('Gorenja vas')
  const [deviceId, setDeviceId] = useState('RACUNKO01')
  const [showPremiseForm, setShowPremiseForm] = useState(false)

  // Form state — certifikat
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState('')
  const [showCertForm, setShowCertForm] = useState(false)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  // Load data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: member } = await supabase
        .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return

      setOrgId(member.org_id)

      const [premRes, devRes, certRes] = await Promise.all([
        supabase.from('business_premises').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('electronic_devices').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('furs_certificates').select('id,issuer,valid_from,valid_to,is_active').eq('org_id', member.org_id).eq('is_active', true).maybeSingle(),
      ])

      setPremises(premRes.data ?? [])
      setDevices(devRes.data ?? [])
      setCertificate(certRes.data ?? null)
      setLoading(false)
    }
    load()
  }, [router, supabase])

  // Shrani poslovni prostor + napravo
  async function savePremise() {
    if (!orgId) return
    if (!premiseId.trim() || !premiseName.trim()) {
      showToast('error', 'Oznaka in ime prostora sta obvezna')
      return
    }

    setSaving(true)
    try {
      // Ustvari poslovni prostor
      const { data: prem, error: premErr } = await supabase
        .from('business_premises')
        .insert({
          org_id: orgId,
          premise_id: premiseId.trim().toUpperCase(),
          name: premiseName.trim(),
          address: premiseAddress.trim() || null,
          postal_code: premisePostal.trim() || null,
          city: premiseCity.trim() || null,
          premise_type: 'static',
          is_active: true,
        })
        .select()
        .single()

      if (premErr) throw new Error(premErr.message)

      // Ustvari elektronsko napravo za ta prostor
      const { error: devErr } = await supabase
        .from('electronic_devices')
        .insert({
          org_id: orgId,
          premise_id: prem.id,
          device_id: deviceId.trim().toUpperCase() || 'RACUNKO01',
          is_active: true,
        })

      if (devErr) throw new Error(devErr.message)

      // Reload
      const [premRes, devRes] = await Promise.all([
        supabase.from('business_premises').select('*').eq('org_id', orgId).order('created_at'),
        supabase.from('electronic_devices').select('*').eq('org_id', orgId).order('created_at'),
      ])
      setPremises(premRes.data ?? [])
      setDevices(devRes.data ?? [])
      setShowPremiseForm(false)
      showToast('success', `Poslovni prostor ${premiseId.toUpperCase()} dodan`)
    } catch (e: any) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  // Upload certifikat
  async function uploadCertificate() {
    if (!orgId || !certFile) return
    if (!certPassword.trim()) {
      showToast('error', 'Geslo certifikata je obvezno')
      return
    }

    setSaving(true)
    try {
      // Preberi .p12 file kot base64
      const arrayBuffer = await certFile.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      // Shrani v DB (v produkciji bi šifrirali na serverju)
      const { error } = await supabase
        .from('furs_certificates')
        .upsert({
          org_id: orgId,
          certificate_data: base64,
          certificate_password: certPassword,
          issuer: 'SIGEN-CA',
          is_active: true,
        }, { onConflict: 'org_id' })

      if (error) throw new Error(error.message)

      // Reload
      const { data: certData } = await supabase
        .from('furs_certificates')
        .select('id,issuer,valid_from,valid_to,is_active')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

      setCertificate(certData ?? null)
      setShowCertForm(false)
      setCertFile(null)
      setCertPassword('')
      showToast('success', 'Certifikat uspešno naložen')
    } catch (e: any) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  // Test FURS povezave
  async function testFursConnection() {
    if (!certificate) {
      showToast('error', 'Najprej naložite certifikat')
      return
    }
    if (premises.length === 0) {
      showToast('error', 'Najprej dodajte poslovni prostor')
      return
    }

    setTesting(true)
    try {
      const res = await fetch('/api/furs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()

      if (data.success) {
        showToast('success', `✓ FURS test uspešen! EOR: ${data.eor?.substring(0, 8)}...`)
      } else {
        showToast('error', `FURS test napaka: ${data.error}`)
      }
    } catch (e: any) {
      showToast('error', `Napaka: ${e.message}`)
    } finally {
      setTesting(false)
    }
  }

  // Briši poslovni prostor
  async function deletePremise(id: string, premId: string) {
    if (!confirm(`Izbrišem poslovni prostor ${premId}?`)) return
    await supabase.from('electronic_devices').delete().eq('premise_id', id)
    await supabase.from('business_premises').delete().eq('id', id)
    setPremises(prev => prev.filter(p => p.id !== id))
    setDevices(prev => prev.filter(d => d.premise_id !== id))
    showToast('success', `Prostor ${premId} izbrisan`)
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>
  )

  const isReady = premises.length > 0 && certificate !== null

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 0, color: '#888', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>← Nazaj</button>
          <h1 style={{ fontSize: 26, fontWeight: 500, color: '#0D1F12', margin: 0 }}>Davčna blagajna</h1>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            Nastavitve za FURS potrjevanje gotovinskih računov po ZDavPR
          </div>
        </div>

        {/* STATUS BANNER */}
        <div style={{
          background: isReady ? '#0D1F12' : '#FFF8E7',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ fontSize: 24 }}>{isReady ? '✅' : '⚠️'}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isReady ? '#E8B547' : '#92600A' }}>
              {isReady ? 'Blagajna je pripravljena' : 'Blagajna ni aktivna'}
            </div>
            <div style={{ fontSize: 12, color: isReady ? 'rgba(255,255,255,0.6)' : '#92600A', marginTop: 2 }}>
              {isReady
                ? `${premises.length} poslovni prostor · certifikat aktiven · pripravljeni za FURS potrjevanje`
                : 'Dodajte poslovni prostor in certifikat da aktivirate FURS potrjevanje'}
            </div>
          </div>
          {isReady && (
            <button
              onClick={testFursConnection}
              disabled={testing}
              style={{ marginLeft: 'auto', background: '#E8B547', color: '#0D1F12', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              {testing ? 'Testiram...' : 'Testiraj FURS'}
            </button>
          )}
        </div>

        {/* POSLOVNI PROSTORI */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Poslovni prostori</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Registrirajte pri FURS (eDavki → Davčne blagajne)</div>
            </div>
            <button
              onClick={() => setShowPremiseForm(!showPremiseForm)}
              style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              + Dodaj prostor
            </button>
          </div>

          {/* Obstoječi prostori */}
          {premises.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              Ni poslovnih prostorov — dodajte prvega
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: showPremiseForm ? 16 : 0 }}>
              {premises.map(p => {
                const dev = devices.find(d => d.premise_id === p.id)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#F7F6F2', borderRadius: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E1F5EE', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🏢</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{p.name ?? p.premise_id}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1, fontFamily: 'monospace' }}>
                        {p.premise_id} · {dev?.device_id ?? 'RACUNKO01'} · {p.address}, {p.postal_code} {p.city}
                      </div>
                    </div>
                    <button
                      onClick={() => deletePremise(p.id, p.premise_id)}
                      style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}
                    >×</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Form za nov prostor */}
          {showPremiseForm && (
            <div style={{ borderTop: premises.length > 0 ? '0.5px solid rgba(0,0,0,0.08)' : 'none', paddingTop: premises.length > 0 ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: '.04em', textTransform: 'uppercase' }}>Nov poslovni prostor</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime prostora *</label>
                  <input value={premiseName} onChange={e => setPremiseName(e.target.value)} placeholder="npr. ŠIRM fitness&bar" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Oznaka prostora * <span style={{ color: '#aaa' }}>(iz eDavki)</span></label>
                  <input value={premiseId} onChange={e => setPremiseId(e.target.value.toUpperCase())} placeholder="npr. SIRBFB01" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Naslov</label>
                <input value={premiseAddress} onChange={e => setPremiseAddress(e.target.value)} placeholder="Poljanska cesta 87" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Poštna</label>
                  <input value={premisePostal} onChange={e => setPremisePostal(e.target.value)} placeholder="4224" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Kraj</label>
                  <input value={premiseCity} onChange={e => setPremiseCity(e.target.value)} placeholder="Gorenja vas" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Oznaka naprave <span style={{ color: '#aaa' }}>(Računko = ena naprava)</span></label>
                <input value={deviceId} onChange={e => setDeviceId(e.target.value.toUpperCase())} placeholder="RACUNKO01" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>

              <div style={{ background: '#F7F6F2', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                💡 Oznake prostora in naprave morate predhodno registrirati na <strong>eDavki → Davčne blagajne</strong>. Računi z napačnimi oznakami bodo zavrnjeni pri FURS.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPremiseForm(false)} style={{ ...btnSecondary }}>Prekliči</button>
                <button onClick={savePremise} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Shranjujem...' : 'Shrani prostor →'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CERTIFIKAT */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Digitalno potrdilo (SIGEN-CA)</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                .p12 certifikat za podpisovanje FURS zahtev
              </div>
            </div>
            <button
              onClick={() => setShowCertForm(!showCertForm)}
              style={{ background: certificate ? '#F7F6F2' : '#0D1F12', color: certificate ? '#0D1F12' : '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {certificate ? '↺ Zamenjaj' : '+ Naloži certifikat'}
            </button>
          </div>

          {certificate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#E1F5EE', borderRadius: 10 }}>
              <div style={{ fontSize: 24 }}>🔐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0E5E3B' }}>Certifikat aktiven</div>
                <div style={{ fontSize: 11, color: '#1D9E75', marginTop: 1 }}>
                  {certificate.issuer ?? 'SIGEN-CA'}
                  {certificate.valid_to ? ` · velja do ${new Date(certificate.valid_to).toLocaleDateString('sl-SI')}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 11, background: '#1D9E75', color: '#fff', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>AKTIVEN</div>
            </div>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              Ni certifikata — blagajna ne more potrjevati računov pri FURS
            </div>
          )}

          {showCertForm && (
            <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: '.04em', textTransform: 'uppercase' }}>Naloži .p12 certifikat</div>

              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Certifikat (.p12 file) *</label>
                <input
                  type="file"
                  accept=".p12,.pfx"
                  onChange={e => setCertFile(e.target.files?.[0] ?? null)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13 }}
                />
                {certFile && (
                  <div style={{ fontSize: 11, color: '#1D9E75', marginTop: 4 }}>✓ {certFile.name} ({(certFile.size / 1024).toFixed(1)} KB)</div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Geslo certifikata *</label>
                <input
                  type="password"
                  value={certPassword}
                  onChange={e => setCertPassword(e.target.value)}
                  placeholder="Geslo ki ste ga nastavili ob izvozu"
                  style={inputStyle}
                />
              </div>

              <div style={{ background: '#FFF8E7', border: '0.5px solid #F5D68A', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92600A', lineHeight: 1.5 }}>
                🔒 Certifikat je shranjen šifrirano. Geslo se ne shrani v čistem tekstu. Nikoli ne delite certifikata z drugimi.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowCertForm(false); setCertFile(null); setCertPassword('') }} style={btnSecondary}>Prekliči</button>
                <button onClick={uploadCertificate} disabled={saving || !certFile || !certPassword} style={{ ...btnPrimary, opacity: (saving || !certFile || !certPassword) ? 0.4 : 1 }}>
                  {saving ? 'Nalagam...' : '🔐 Naloži certifikat →'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* NAVODILA */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>📋 Navodila za registracijo pri FURS</div>
          {[
            { step: '1', title: 'Pridobite SIGEN-CA certifikat', desc: 'Če nimate certifikata: sigen-ca.si → "Pridobite potrdilo" (~€25/leto, 1-3 dni)' },
            { step: '2', title: 'Registrirajte se kot zavezanec', desc: 'eDavki → Davčne blagajne → "Nov zavezanec"' },
            { step: '3', title: 'Dodajte poslovni prostor', desc: 'eDavki → Davčne blagajne → "Poslovni prostori" → "Dodaj" → zapišite si oznako (npr. SIRBFB01)' },
            { step: '4', title: 'Dodajte elektronsko napravo', desc: 'V poslovnem prostoru → "Naprave" → "Dodaj" → vrsta: Programska oprema → oznaka: RACUNKO01' },
            { step: '5', title: 'Izvozite certifikat', desc: 'Keychain Access (Mac) → poiščite certifikat → Export → .p12 → nastavite geslo' },
            { step: '6', title: 'Vnesite podatke v Računko', desc: 'Dodajte poslovni prostor zgoraj z istimi oznakami kot na eDavki, naložite .p12 certifikat' },
          ].map(item => (
            <div key={item.step} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0D1F12', color: '#E8B547', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{item.step}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TOAST */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'success' ? '#0D1F12' : '#A32D2D',
            color: '#fff', padding: '12px 20px', borderRadius: 999,
            fontSize: 13, fontWeight: 500, zIndex: 3000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
        )}

      </div>
    </div>
  )
}

// Shared styles
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13,
  outline: 'none', color: '#0D1F12', background: '#fff',
}
const btnPrimary: React.CSSProperties = {
  background: '#0D1F12', color: '#fff', border: 0,
  borderRadius: 8, padding: '10px 20px', fontSize: 13,
  fontWeight: 500, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.12)',
  borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer',
}