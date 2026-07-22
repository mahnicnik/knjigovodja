// apps/web/app/nastavitve/blagajna/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()

// ================================================================
// TYPES
// ================================================================
interface FursConfig {
  certPassword?: string
  certExpiry?: string
  certSubject?: string
  testMode: boolean
  premises: FursPremise[]
  devices: FursDevice[]
}

interface FursPremise {
  id: string
  businessPremiseId: string
  address: string
  postalCode: string
  city: string
  cadastralNumber?: string
  buildingNumber?: string
  buildingSectionNumber?: string
  channel?: 'pos' | 'web' | 'both'
}

interface FursDevice {
  id: string
  electronicDeviceId: string
  premiseId: string
  channel?: 'pos' | 'web' | 'both'
}

// ================================================================
// MAIN PAGE
// ================================================================
export default function BlagajnaPage() {
  const [tab, setTab] = useState<'certifikat' | 'prostori' | 'naprave' | 'test'>('certifikat')
  const [config, setConfig] = useState<FursConfig>({ testMode: true, premises: [], devices: [], certPassword: undefined, certExpiry: undefined, certSubject: undefined })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{msg: string, ok: boolean} | null>(null)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState('')
  const [uploadingCert, setUploadingCert] = useState(false)
  const [premiseModal, setPremiseModal] = useState<Partial<FursPremise> | null>(null)
  const [deviceModal, setDeviceModal] = useState<Partial<FursDevice> | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [registeringPremiseId, setRegisteringPremiseId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Pridobi org_id
      const { data: member } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (member) {
        // Naloži certifikat
        const { data: cert } = await supabase
          .from('furs_certificates')
          .select('issuer, certificate_password, valid_to')
          .eq('org_id', member.org_id)
          .eq('is_active', true)
          .maybeSingle()

        // Naloži poslovne prostore
        const { data: premises } = await supabase
          .from('business_premises')
          .select('*')
          .eq('org_id', member.org_id)
          .eq('is_active', true)

        // Naloži naprave
        const { data: devices } = await supabase
          .from('electronic_devices')
          .select('*')
          .eq('org_id', member.org_id)
          .eq('is_active', true)

        const { data: orgTestMode } = await supabase.from('organizations').select('furs_test_mode').eq('id', member.org_id).single()
        setConfig({
          testMode: orgTestMode?.furs_test_mode ?? (process.env.NEXT_PUBLIC_FURS_TEST_MODE === 'true'),
          premises: (premises || []).map(p => ({
            id: p.id,
            businessPremiseId: p.premise_id,
            address: p.address || '',
            postalCode: p.postal_code || '',
            city: p.city || '',
            cadastralNumber: p.cadastral_number || '',
            buildingNumber: p.building_number || '',
            buildingSectionNumber: p.building_section_number || '',
            channel: p.channel || 'both',
          })),
          devices: (devices || []).map(d => ({
            id: d.id,
            electronicDeviceId: d.device_id,
            premiseId: d.premise_id,
            channel: d.channel || 'both',
          })),
          certSubject: cert?.issuer,
          certPassword: cert?.certificate_password,
          certExpiry: cert?.valid_to,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function saveConfig(updated: FursConfig) {
    setConfig(updated)
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) return
      const { data: member } = await createClient().from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      await createClient().from('organizations').update({ furs_test_mode: updated.testMode }).eq('id', member.org_id)
    } catch (e) {
      console.error('Napaka pri shranjevanju test načina:', e)
    }
  }

  async function uploadCert() {
    if (!certFile) { showToast('Izberite .p12 datoteko', false); return }
    if (!certPassword) { showToast('Vnesite geslo certifikata', false); return }

    setUploadingCert(true)
    try {
      const formData = new FormData()
      formData.append('cert', certFile)
      formData.append('password', certPassword)

      const res = await fetch('/api/furs/upload-cert', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Napaka pri nalaganju')
      }

      const data = await res.json()
      const updated = {
        ...config,
        certPassword,
        certExpiry: data.expiry,
        certSubject: data.subject,
      }
      await saveConfig(updated)
      setCertFile(null)
      setCertPassword('')
      showToast('Certifikat uspešno naložen ✓')
    } catch (e: any) {
      showToast(e.message, false)
    }
    setUploadingCert(false)
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/furs/test', { method: 'POST' })
      const data = await res.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ success: false, error: e.message })
    }
    setTesting(false)
  }

  async function addPremise() {
    if (!premiseModal?.businessPremiseId || !premiseModal?.address) {
      showToast('ID prostora in naslov sta obvezna', false)
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Ni avtentikacije')

      const { data: member } = await supabase
        .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) throw new Error('Org ni najdena')

      if (premiseModal.id) {
        // Update obstoječega
        await supabase.from('business_premises').update({
          premise_id: premiseModal.businessPremiseId,
          address: premiseModal.address,
          postal_code: premiseModal.postalCode || '',
          city: premiseModal.city || '',
          cadastral_number: premiseModal.cadastralNumber || null,
          building_number: premiseModal.buildingNumber || null,
          building_section_number: premiseModal.buildingSectionNumber || null,
          channel: premiseModal.channel || 'both',
        }).eq('id', premiseModal.id)
      } else {
        // Vstavi novega
        await supabase.from('business_premises').insert({
          org_id: member.org_id,
          premise_id: premiseModal.businessPremiseId,
          premise_type: 'static',
          address: premiseModal.address,
          postal_code: premiseModal.postalCode || '',
          city: premiseModal.city || '',
          cadastral_number: premiseModal.cadastralNumber || null,
          building_number: premiseModal.buildingNumber || null,
          building_section_number: premiseModal.buildingSectionNumber || null,
          is_active: true,
          channel: premiseModal.channel || 'both',
        })
      }

      showToast('Poslovni prostor shranjen')
      setPremiseModal(null)
      // Reload
      window.location.reload()
    } catch(e: any) {
      showToast(e.message, false)
    }
  }

  async function deletePremise(id: string) {
    if (!confirm('Izbrišem ta poslovni prostor?')) return
    await supabase.from('business_premises').update({ is_active: false }).eq('id', id)
    showToast('Poslovni prostor izbrisan')
    window.location.reload()
  }

  async function registerPremiseWithFurs(p: FursPremise) {
    setRegisteringPremiseId(p.id)
    try {
      const match = (p.address || '').match(/^(.*?)\s+(\S+)$/)
      const street = match ? match[1].trim() : (p.address || '')
      const houseNumber = match ? match[2].trim() : ''
      const res = await fetch('/api/furs/register-premise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadastralNumber: p.cadastralNumber,
          buildingNumber: p.buildingNumber,
          buildingSectionNumber: p.buildingSectionNumber,
          street,
          houseNumber,
          community: p.city,
          city: p.city,
          postalCode: p.postalCode,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setToast({ msg: '✓ Poslovni prostor uspešno prijavljen pri FURS', ok: true })
      } else {
        setToast({ msg: data.error || 'Napaka pri prijavi poslovnega prostora', ok: false })
      }
    } catch (e: any) {
      setToast({ msg: e.message, ok: false })
    }
    setRegisteringPremiseId(null)
  }

  async function addDevice() {
    if (!deviceModal?.electronicDeviceId || !deviceModal?.premiseId) {
      showToast('ID naprave in prostor sta obvezna', false)
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Ni avtentikacije')

      const { data: member } = await supabase
        .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) throw new Error('Org ni najdena')

      // VAROVALKA (21.7.2026): naprave z obstojeco FURS zgodovino NE smejo
      // preklopiti na 'web' kanal - web kanal uporablja LOCENO zaporedje
      // (web_invoice_seq, zacne pri 1), zato bi naprava, ki je ze izdala
      // racune pod pos_invoice_seq, FURS-u poslala ZE ZASEDENE stevilke.
      // Za web kanal je treba ustvariti NOVO napravo z novim ID-jem.
      if (deviceModal.channel === 'web' && deviceModal.electronicDeviceId) {
        const { count: fursHistory } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .like('invoice_number', `%-${deviceModal.electronicDeviceId}-%`)
        if ((fursHistory ?? 0) > 0) {
          setToast({ msg: `Naprava ${deviceModal.electronicDeviceId} ima ze ${fursHistory} FURS-potrjenih racunov in NE more preklopiti na "Samo Stripe/PDF" kanal (locena stevilcenja bi trcila z obstojecimi). Ustvarite NOVO napravo z novim ID-jem (npr. WEB01).`, ok: false })
          setSaving(false)
          return
        }
      }
      if (deviceModal.id) {
        await supabase.from('electronic_devices').update({
          device_id: deviceModal.electronicDeviceId,
          premise_id: deviceModal.premiseId,
          channel: deviceModal.channel || 'both',
        }).eq('id', deviceModal.id)
      } else {
        await supabase.from('electronic_devices').insert({
          org_id: member.org_id,
          premise_id: deviceModal.premiseId,
          device_id: deviceModal.electronicDeviceId,
          is_active: true,
          channel: deviceModal.channel || 'both',
        })
      }

      showToast('Naprava shranjena')
      setDeviceModal(null)
      window.location.reload()
    } catch(e: any) {
      showToast(e.message, false)
    }
  }

  async function deleteDevice(id: string) {
    if (!confirm('Izbrišem to napravo?')) return
    await supabase.from('electronic_devices').update({ is_active: false }).eq('id', id)
    showToast('Naprava izbrisana')
    window.location.reload()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#666' }}>
      Nalagam nastavitve...
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <a href="/nastavitve" style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, color:"var(--rk-ink-3)", textDecoration:"none", marginBottom:8, fontFamily:"var(--rk-font-mono)" }}>← Nastavitve</a>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#0d2818' }}>Davčna blagajna</h1>
        <p style={{ fontSize: 14, color: '#666', marginTop: 6 }}>FURS certifikat, poslovni prostori in naprave</p>
      </div>

      {/* Test mode banner */}
      <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 20, background: config.testMode ? 'rgba(184,140,40,0.12)' : 'rgba(31,107,58,0.1)', border: `1px solid ${config.testMode ? '#b88c28' : '#1f6b3a'}40`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: config.testMode ? '#b88c28' : '#1f6b3a' }}>
            {config.testMode ? '🧪 TEST način (FURS Playground)' : '✅ PRODUKCIJSKI način (blagajne.fu.gov.si)'}
          </span>
          <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
            {config.testMode ? 'Računi se pošiljajo na testni FURS strežnik — NE na pravo FURS!' : 'Računi se davčno potrjujejo pri FURS'}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={config.testMode}
            onChange={e => saveConfig({ ...config, testMode: e.target.checked })}
            style={{ accentColor: '#1f6b3a', width: 16, height: 16 }} />
          Test način
        </label>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: '#f0ede8', padding: 4, borderRadius: 10, marginBottom: 24, width: 'fit-content' }}>
        {([['certifikat', '🔐 Certifikat'], ['prostori', '🏢 Poslovni prostori'], ['naprave', '🖨️ Naprave'], ['test', '🧪 Test povezave']] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: tab === id ? '#0d2818' : 'transparent', color: tab === id ? '#f6f1e8' : '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── CERTIFIKAT ── */}
      {tab === 'certifikat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {config.certSubject && (
            <div style={{ padding: 16, background: 'rgba(31,107,58,0.08)', borderRadius: 12, border: '1px solid rgba(31,107,58,0.2)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1f6b3a', marginBottom: 8 }}>✅ Certifikat naložen</div>
              <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7 }}>
                <div><b>Naziv:</b> {config.certSubject}</div>
                {config.certExpiry && <div><b>Velja do:</b> {config.certExpiry}</div>}
              </div>
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e1d8', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
              {config.certSubject ? 'Zamenjaj certifikat' : 'Naloži FURS certifikat (.p12)'}
            </div>

            {/* File drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${certFile ? '#1f6b3a' : '#d0ccc5'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: certFile ? 'rgba(31,107,58,0.05)' : '#fafaf7', marginBottom: 16 }}>
              <input ref={fileRef} type="file" accept=".p12,.pfx" onChange={e => setCertFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>{certFile ? '📄' : '📁'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: certFile ? '#1f6b3a' : '#666' }}>
                {certFile ? certFile.name : 'Kliknite za izbiro .p12 datoteke'}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {certFile ? `${(certFile.size / 1024).toFixed(1)} KB` : 'ali povlecite in spustite sem'}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Geslo certifikata *</label>
              <input
                type="password"
                value={certPassword}
                onChange={e => setCertPassword(e.target.value)}
                placeholder="Geslo .p12 datoteke"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d0ccc5', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <button onClick={uploadCert} disabled={uploadingCert || !certFile}
              style={{ padding: '10px 24px', borderRadius: 9, background: certFile ? '#0d2818' : '#ccc', color: '#fff', border: 'none', cursor: certFile ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
              {uploadingCert ? '⏳ Nalagam...' : '⬆️ Naloži certifikat'}
            </button>

            <div style={{ marginTop: 16, padding: '12px 14px', background: '#f4efe5', borderRadius: 9, fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              <b>Kje dobiti certifikat?</b><br />
              FURS digitalno potrdilo dobite na <a href="https://edavki.durs.si" target="_blank" style={{ color: '#1f6b3a' }}>eDavki.durs.si</a> → Davčna blagajna → Registracija certifikata.<br />
              Datoteka ima končnico <b>.p12</b> ali <b>.pfx</b>.
            </div>
            <div style={{marginTop:20,border:'1px solid #e5e1d8',borderRadius:12,overflow:'hidden'}}>
              <button onClick={()=>setOpenFaq(openFaq===0?null:0)} style={{width:'100%',padding:'16px 20px',background:openFaq===0?'#f4efe5':'#fff',border:'none',cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'inherit'}}>
                <span style={{fontWeight:700,fontSize:14,color:'#0d2818',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{color:'#e9b949',fontSize:18}}>?</span> Kako nastavim certifikat?
                </span>
                <span style={{color:'#1f6b3a'}}>{openFaq===0?'▲':'▼'}</span>
              </button>
              {openFaq===0&&(
                <div style={{padding:'4px 20px 20px',background:'#fff',borderTop:'1px solid #e5e1d8'}}>
                  {[
                    {num:1,icon:'🖥',title:'Pridobite certifikat',desc:'Pojdite na eDavki.durs.si → Davčna blagajna → Registracija certifikata. SIGEN-CA ga izda brezplačno.'},
                    {num:2,icon:'⬆',title:'Naložite v Računko',desc:'Kliknite na polje zgoraj, izberite .p12 datoteko in vnesite geslo. En certifikat pokriva VSE lokacije.'},
                    {num:3,icon:'🏢',title:'Dodajte poslovni prostor',desc:'V tabu Poslovni prostori dodajte vsako lokacijo z ID-jem ki ste ga registrirali pri FURS (npr. SIRBFB01).'},
                    {num:4,icon:'🧪',title:'Testirajte povezavo',desc:'V tabu Test povezave preverite da certifikat deluje. Prikazati se mora EOR in ZOI koda.'},
                  ].map(step=>(
                    <div key={step.num} style={{display:'flex',gap:14,padding:'14px 0',borderBottom:'1px solid #f0ede8'}}>
                      <div style={{width:36,height:36,borderRadius:999,background:'#0d2818',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:15,flexShrink:0}}>{step.num}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:'#0d2818',marginBottom:4}}>{step.icon} {step.title}</div>
                        <div style={{fontSize:12,color:'#666',lineHeight:1.6}}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:12,padding:'10px 14px',background:'rgba(31,107,58,0.08)',borderRadius:9,fontSize:12,color:'#1f6b3a'}}>
                    En certifikat pokriva VSE poslovne prostore istega davčnega zavezanca.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── POSLOVNI PROSTORI ── */}
      {tab === 'prostori' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Poslovni prostori</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>Vsak lokal/poslovni prostor mora biti registriran pri FURS</div>
            </div>
            <button onClick={() => setPremiseModal({})}
              style={{ padding: '9px 16px', background: '#0d2818', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
              + Dodaj prostor
            </button>
          </div>

          {config.premises.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 12, border: '1px solid #e5e1d8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
              Ni dodanih poslovnih prostorov
            </div>
          ) : config.premises.map(p => (
            <div key={p.id} style={{ padding: 16, background: '#fff', borderRadius: 11, border: '1px solid #e5e1d8', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace', color: '#1f6b3a' }}>{p.businessPremiseId}</div>
                  <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>{p.address}, {p.postalCode} {p.city}</div>
                  {p.cadastralNumber && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Kat. občina: {p.cadastralNumber}, stavba: {p.buildingNumber}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => registerPremiseWithFurs(p)} disabled={registeringPremiseId === p.id || !p.cadastralNumber}
                    title={!p.cadastralNumber ? 'Najprej vnesi katastrske podatke (uredi prostor)' : ''}
                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #1f6b3a', background: registeringPremiseId === p.id ? '#e5e1d8' : 'rgba(31,107,58,0.08)', cursor: p.cadastralNumber ? 'pointer' : 'not-allowed', fontSize: 12, color: '#1f6b3a', fontWeight: 600, fontFamily: 'inherit', opacity: p.cadastralNumber ? 1 : 0.5 }}>
                    {registeringPremiseId === p.id ? '⏳ Prijavljam...' : '📤 Prijavi pri FURS'}
                  </button>
                  <button onClick={() => setPremiseModal(p)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #d0ccc5', background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>✏️ Uredi</button>
                  <button onClick={() => deletePremise(p.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(168,50,50,0.3)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#a83232', fontFamily: 'inherit' }}>Briši</button>
                </div>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 16, padding: '12px 14px', background: '#f4efe5', borderRadius: 9, fontSize: 12, color: '#666', lineHeight: 1.6 }}>
            <b>ID poslovnega prostora</b> je identifikator ki ste ga registrirali pri FURS (npr. <code>SIRBFB01</code>).<br />
            Za registracijo pojdite na eDavki → Davčna blagajna → Poslovni prostori.
          </div>

          <div style={{marginTop:16,border:'1px solid #e5e1d8',borderRadius:12,overflow:'hidden'}}>   <button onClick={()=>setOpenFaq(openFaq===1?null:1)} style={{width:'100%',padding:'16px 20px',background:openFaq===1?'#f4efe5':'#fff',border:'none',cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'inherit'}}>
              <span style={{fontWeight:700,fontSize:14,color:'#0d2818',display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:'#e9b949',fontSize:18}}>?</span> Imam več lokacij — kako nastavim?
              </span>
              <span style={{color:'#1f6b3a'}}>{openFaq===1?'▲':'▼'}</span>
            </button>
            {openFaq===1&&(
              <div style={{padding:'4px 20px 20px',background:'#fff',borderTop:'1px solid #e5e1d8'}}>
                {[1,2,3,4].map(i => {
                  const steps = [
                    {num:1,icon:"🖥",title:"Registrirajte vsak prostor pri FURS",desc:"eDavki.durs.si - Davčnlagajna - Poslovni prostori - Dodaj."},
                    {num:2,icon:"🖨",title:"Registrirajte vsako napravo",desc:"Za vsako blagajno dodajte napravo z evidenčno številko (npr. RACUNK001)."},
                    {num:3,icon:"⚙",title:"Dodajte v Računko",desc:"Dodajte vse prostore in naprave z istimi ID-ji kot pri FURS."},
                    {num:4,icon:"🔑",title:"Ob prijavi izberite blagajno",desc:"Ko se zaposleni prijavi s PIN-om, izbere katero lokacijo odpre."},
                  ];
                  const step = steps[i-1];
                  return (
                    <div key={step.num} style={{display:"flex",gap:14,padding:"14px 0",borderBottom:"1px solid #f0ede8"}}>
                      <div style={{width:36,height:36,borderRadius:999,background:"#0d2818",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,flexShrink:0}}>{step.num}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#0d2818",marginBottom:4}}>{step.icon} {step.title}</div>
                        <div style={{fontSize:12,color:"#666",lineHeight:1.6}}>{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop:12,padding:'10px 14px',background:'rgba(31,107,58,0.08)',borderRadius:9,fontSize:12,color:'#1f6b3a'}}>
                En certifikat pokriva VSE lokacije istega davčnega zavezanca — ni potreben ločen certifikat za vsako tržnico.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NAPRAVE ── */}
      {tab === 'naprave' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Elektronske naprave</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>Vsaka blagajna/naprava ima svojo evidenčno številko</div>
            </div>
            <button onClick={() => setDeviceModal({})} disabled={config.premises.length === 0}
              style={{ padding: '9px 16px', background: config.premises.length > 0 ? '#0d2818' : '#ccc', color: '#fff', border: 'none', borderRadius: 9, cursor: config.premises.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
              + Dodaj napravo
            </button>
          </div>

          {config.premises.length === 0 && (
            <div style={{ padding: '12px 14px', background: 'rgba(184,140,40,0.1)', borderRadius: 9, fontSize: 13, color: '#b88c28', marginBottom: 16 }}>
              ⚠️ Najprej dodaj poslovni prostor
            </div>
          )}

          {config.devices.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 12, border: '1px solid #e5e1d8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖨️</div>
              Ni dodanih naprav
            </div>
          ) : config.devices.map(d => {
            const premise = config.premises.find(p => p.id === d.premiseId)
            return (
              <div key={d.id} style={{ padding: 16, background: '#fff', borderRadius: 11, border: '1px solid #e5e1d8', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace', color: '#1f6b3a' }}>{d.electronicDeviceId}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>Prostor: {premise?.businessPremiseId || '?'} · {premise?.address}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setDeviceModal(d)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #d0ccc5', background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>✏️</button>
                  <button onClick={() => deleteDevice(d.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(168,50,50,0.3)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#a83232', fontFamily: 'inherit' }}>Briši</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── TEST ── */}
      {tab === 'test' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e1d8', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Test FURS povezave</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
              Pošlje testni račun na {config.testMode ? 'FURS testni strežnik' : 'pravi FURS strežnik'} in preveri odgovor.<br />
              Testni račun se <b>ne</b> šteje kot davčno potrjeni račun.
            </div>
            <button onClick={testConnection} disabled={testing}
              style={{ padding: '11px 24px', borderRadius: 9, background: '#0d2818', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: testing ? 0.7 : 1 }}>
              {testing ? '⏳ Testiram...' : '🧪 Zaženi test'}
            </button>

            {testResult && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: testResult.success ? 'rgba(31,107,58,0.08)' : 'rgba(168,50,50,0.08)', border: `1px solid ${testResult.success ? 'rgba(31,107,58,0.2)' : 'rgba(168,50,50,0.2)'}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: testResult.success ? '#1f6b3a' : '#a83232', marginBottom: 10 }}>
                  {testResult.success ? '✅ Povezava uspešna' : '❌ Napaka pri povezavi'}
                </div>
                {testResult.success ? (
                  <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>
                    {testResult.eor && <div><b>EOR:</b> <code style={{ background: '#f0ede8', padding: '1px 6px', borderRadius: 4 }}>{testResult.eor}</code></div>}
                    {testResult.zoi && <div><b>ZOI:</b> <code style={{ background: '#f0ede8', padding: '1px 6px', borderRadius: 4 }}>{testResult.zoi}</code></div>}
                    {testResult.datetime && <div><b>Čas:</b> {testResult.datetime}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: '#a83232' }}>
                    {testResult.error || 'Neznana napaka'}
                    {testResult.details && <div style={{ marginTop: 8, fontSize: 11, color: '#666', fontFamily: 'monospace', background: '#f0ede8', padding: 8, borderRadius: 6 }}>{JSON.stringify(testResult.details, null, 2)}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e1d8', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Konfiguracija</div>
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.8 }}>
              <div>🔐 Certifikat: {config.certSubject ? <span style={{ color: '#1f6b3a', fontWeight: 600 }}>✓ Naložen</span> : <span style={{ color: '#a83232' }}>❌ Ni naložen</span>}</div>
              <div>🏢 Poslovni prostori: <b>{config.premises.length}</b></div>
              <div>🖨️ Naprave: <b>{config.devices.length}</b></div>
              <div>🌐 Način: <b>{config.testMode ? 'TEST' : 'PRODUKCIJA'}</b></div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALI ── */}

      {/* Premise modal */}
      {premiseModal !== null && premiseModal !== undefined && (
        <div onClick={() => setPremiseModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{premiseModal.id ? 'Uredi poslovni prostor' : 'Nov poslovni prostor'}</h3>
              <button onClick={() => setPremiseModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#666' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="ID poslovnega prostora * (npr. SIRBFB01)">
                <input value={premiseModal.businessPremiseId || ''} onChange={e => setPremiseModal(p => ({ ...p, businessPremiseId: e.target.value.toUpperCase() }))}
                  placeholder="SIRBFB01" style={{ ...inputStyle, fontFamily: 'monospace' }} autoFocus />
              </FormField>
              <FormField label="Naslov *">
                <input value={premiseModal.address || ''} onChange={e => setPremiseModal(p => ({ ...p, address: e.target.value }))}
                  placeholder="Poljanska cesta 87" style={inputStyle} />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                <FormField label="Poštna št.">
                  <input value={premiseModal.postalCode || ''} onChange={e => setPremiseModal(p => ({ ...p, postalCode: e.target.value }))}
                    placeholder="4224" style={inputStyle} />
                </FormField>
                <FormField label="Kraj">
                  <input value={premiseModal.city || ''} onChange={e => setPremiseModal(p => ({ ...p, city: e.target.value }))}
                    placeholder="Gorenja vas" style={inputStyle} />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <FormField label="Kat. občina">
                  <input value={premiseModal.cadastralNumber || ''} onChange={e => setPremiseModal(p => ({ ...p, cadastralNumber: e.target.value }))}
                    placeholder="2345" style={inputStyle} />
                </FormField>
                <FormField label="Št. stavbe">
                  <input value={premiseModal.buildingNumber || ''} onChange={e => setPremiseModal(p => ({ ...p, buildingNumber: e.target.value }))}
                    placeholder="1" style={inputStyle} />
                </FormField>
                <FormField label="Št. dela stavbe">
                  <input value={premiseModal.buildingSectionNumber || ''} onChange={e => setPremiseModal(p => ({ ...p, buildingSectionNumber: e.target.value }))}
                    placeholder="1" style={inputStyle} />
                </FormField>
              </div>
              <FormField label="Namen (kanal)">
                <select value={premiseModal.channel || 'both'} onChange={e => setPremiseModal(p => ({ ...p, channel: e.target.value as any }))} style={inputStyle}>
                  <option value="both">Oboje (POS in Stripe/PDF) — privzeto</option>
                  <option value="pos">Samo POS terminal</option>
                  <option value="web">Samo Stripe/PDF računi</option>
                </select>
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setPremiseModal(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d0ccc5', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>Prekliči</button>
              <button onClick={addPremise} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d2818', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>Shrani</button>
            </div>
          </div>
        </div>
      )}

      {/* Device modal */}
      {deviceModal !== null && deviceModal !== undefined && (
        <div onClick={() => setDeviceModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{deviceModal.id ? 'Uredi napravo' : 'Nova naprava'}</h3>
              <button onClick={() => setDeviceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#666' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="ID elektronske naprave * (npr. RACUNK001)">
                <input value={deviceModal.electronicDeviceId || ''} onChange={e => setDeviceModal(p => ({ ...p, electronicDeviceId: e.target.value.toUpperCase() }))}
                  placeholder="RACUNK001" style={{ ...inputStyle, fontFamily: 'monospace' }} autoFocus />
              </FormField>
              <FormField label="Poslovni prostor *">
                <select value={deviceModal.premiseId || ''} onChange={e => setDeviceModal(p => ({ ...p, premiseId: e.target.value }))} style={inputStyle}>
                  <option value="">— Izberi prostor —</option>
                  {config.premises.map(p => (
                    <option key={p.id} value={p.id}>{p.businessPremiseId} · {p.address}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Namen (kanal)">
                <select value={deviceModal.channel || 'both'} onChange={e => setDeviceModal(p => ({ ...p, channel: e.target.value as any }))} style={inputStyle}>
                  <option value="both">Oboje (POS in Stripe/PDF) — privzeto</option>
                  <option value="pos">Samo POS terminal</option>
                  <option value="web">Samo Stripe/PDF računi (locena zaporedna številčenja)</option>
                </select>
              </FormField>
              {deviceModal.channel === 'web' && (
                <div style={{ fontSize: 12, color: '#a83232', background: 'rgba(168,50,50,0.07)', border: '1px solid rgba(168,50,50,0.2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
                  ⚠️ "Samo Stripe/PDF" kanal uporablja LOČENO zaporedje številk (začne pri 1). Uporabite ga SAMO za novo napravo, ki še nima izdanih računov — obstoječe naprave (npr. RACUNKO01) NE preklapljajte, ker bi številke trčile z že potrjenimi računi pri FURS.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setDeviceModal(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d0ccc5', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>Prekliči</button>
              <button onClick={addDevice} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d2818', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>Shrani</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#1f6b3a' : '#a83232', color: '#fff', padding: '11px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Helpers ──
function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d0ccc5',
  fontSize: 13,
  outline: 'none',
  background: '#fafaf7',
  boxSizing: 'border-box',
}
