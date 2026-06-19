'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'
import UpgradeButton from '@/components/UpgradeButton'
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton'

const SP_CONTRIBUTIONS: Record<number, number> = {
  1: 2584.92, 2: 3012.36, 3: 3439.20, 4: 3866.04, 5: 4293.00,
  6: 4719.84, 7: 5146.68, 8: 5399.76, 9: 6024.24, 10: 6451.08,
  11: 6877.80, 12: 7304.64, 13: 7731.48, 14: 8585.16, 15: 9438.84,
}

const SECTIONS = [
  { id: 'profil',       icon: '🏢', label: 'Profil podjetja',    desc: 'Ime, naslov, davčna' },
  { id: 'ddv',          icon: '📊', label: 'DDV & prispevki',    desc: 'DDV status, razred' },
  { id: 'banka',        icon: '🏦', label: 'Bančni podatki',     desc: 'IBAN, BIC/SWIFT' },
  { id: 'blagajna',     icon: '🧾', label: 'Davčna blagajna',    desc: 'FURS, certifikat' },
  { id: 'ekipa',        icon: '👥', label: 'Ekipa',              desc: 'Uporabniki, dostop' },
  { id: 'geslo',        icon: '🔐', label: 'Geslo',              desc: 'Sprememba gesla' },
  { id: 'plan',         icon: '⭐', label: 'Naročnina',          desc: 'Plan, nadgradnja' },
  { id: 'racunovodja',  icon: '📒', label: 'Računovodja portal', desc: 'Dostop računovodje' },
  { id: 'api',          icon: '🔑', label: 'API ključi',         desc: 'Integracije, dostop' },
]

const SI_BANKS: Record<string, string> = {
  '01': 'BSLJSI2X', // Banka Slovenije
  '02': 'LJBASI2X', // NLB
  '03': 'SKBASI2X', // SKB
  '04': 'KBMASI2X', // Nova KBM
  '05': 'ABANSI2X', // Abanka
  '06': 'BACXSI22', // Banka Sparkasse
  '10': 'HDELSI22', // Delavska hranilnica
  '12': 'GORESI2X', // Gorenjska banka
  '14': 'SZKBSI2X', // Sberbank
  '17': 'CMBSSI22', // Banka Celje
  '19': 'HBPGSI22', // Hranilnica Bank Vipava
  '24': 'KSPISI22', // Hranilnica Lon
  '25': 'AHASI22',  // Addiko Bank
  '26': 'PBSISI22', // Primorska banka
  '29': 'KZBLSI2X', // Karantanija banka
  '30': 'KSPISI22', // Sparkasse
  '33': 'SABRSI22', // SID banka
  '34': 'RACASI22', // Raiffeisen
  '35': 'UJBASI22', // Unicredit
  '60': 'SSAVSI22', // SKB
  '61': 'SDBASI22', // Delta banka
  '65': 'JADISI22', // Banka Intesa Sanpaolo
}
function detectBIC(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  if (!clean.startsWith('SI56') || clean.length < 8) return ''
  const bankCode = clean.substring(4, 6)
  return SI_BANKS[bankCode] || ''
}
export default function NastavitevPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState('profil')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{text:string, ok:boolean} | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [form, setForm] = useState({
    name: '', tax_number: '', vat_number: '', vat_registered: false,
    iban: '', bic: '', address: '', post_code: '', city: '',
    phone: '', email: '', contribution_class: 8, contrib_piz: 0, contrib_zzzs: 0, contrib_zaposlovanje: 0, contrib_starsevstvo: 0, contrib_akontacija: 0,
  })
  const supabase = createClient()

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setShowSuccess(true)
      posthog.capture('subscription_upgrade_success')
      window.history.replaceState({}, '', '/nastavitve')
      setTimeout(() => load(), 2500)
    }
    const sec = params.get('tab')
    if (sec) setActiveSection(sec)
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      setForm({
        name: o.name || '', tax_number: o.tax_number || '',
        vat_number: o.vat_number || '', vat_registered: o.vat_registered || false,
        iban: o.iban || '', bic: o.bic || '', address: o.address || '',
        post_code: o.post_code || '', city: o.city || '',
        phone: o.phone || '', email: o.email || '',
        contribution_class: o.contribution_class || 8, contrib_piz: o.contrib_piz || 0, contrib_zzzs: o.contrib_zzzs || 0, contrib_zaposlovanje: o.contrib_zaposlovanje || 0, contrib_starsevstvo: o.contrib_starsevstvo || 0, contrib_akontacija: o.contrib_akontacija || 0,
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    const { error } = await supabase.from('organizations').update({
      name: form.name, tax_number: form.tax_number, vat_number: form.vat_number,
      vat_registered: form.vat_registered, iban: form.iban, bic: form.bic,
      address: form.address, post_code: form.post_code, city: form.city,
      phone: form.phone, email: form.email, contribution_class: form.contribution_class, contrib_piz: form.contrib_piz, contrib_zzzs: form.contrib_zzzs, contrib_zaposlovanje: form.contrib_zaposlovanje, contrib_starsevstvo: form.contrib_starsevstvo, contrib_akontacija: form.contrib_akontacija,
    }).eq('id', org.id)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    setSaving(false)
  }

  async function handlePasswordChange() {
    if (!pwNew || !pwConfirm) { setPwMsg({text:'Vnesi novo geslo', ok:false}); return }
    if (pwNew !== pwConfirm) { setPwMsg({text:'Gesli se ne ujemata', ok:false}); return }
    if (pwNew.length < 8) { setPwMsg({text:'Geslo mora imeti vsaj 8 znakov', ok:false}); return }
    setPwSaving(true); setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    if (error) { setPwMsg({text: error.message, ok: false}) }
    else {
      setPwMsg({text: '✓ Geslo uspešno spremenjeno', ok: true})
      setPwNew(''); setPwConfirm('')
      setTimeout(() => setPwMsg(null), 4000)
    }
    setPwSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const isPro = org?.subscription_status === 'pro' || org?.subscription_status === 'pro_pos'
  const isProPos = org?.subscription_status === 'pro_pos'
  const inp = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link href="/dashboard" style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>← Domov</Link>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12', marginTop: 2 }}>Nastavitve</div>
        </div>
        {['profil','ddv','banka'].includes(activeSection) && (
          <button onClick={handleSave} disabled={saving}
            style={{ background: '#0D1F12', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saved ? '✓ Shranjeno!' : saving ? 'Shranjujem...' : 'Shrani'}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>

        {showSuccess && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>🎉 Dobrodošli v Pro planu!</div>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>Vaš plan je aktiven. Hvala za zaupanje!</div>
            </div>
            <button onClick={() => setShowSuccess(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 18 }}>✕</button>
          </div>
        )}

        {/* Hub kartic */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 28 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{
                background: activeSection === s.id ? '#0D1F12' : '#fff',
                color: activeSection === s.id ? '#fff' : '#333',
                border: `1.5px solid ${activeSection === s.id ? '#0D1F12' : '#e5e7eb'}`,
                borderRadius: 14, padding: '14px 10px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{s.label}</span>
              <span style={{ fontSize: 10, opacity: 0.6, textAlign: 'center', lineHeight: 1.3 }}>{s.desc}</span>
            </button>
          ))}
        </div>

        {/* PROFIL */}
        {activeSection === 'profil' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🏢 Profil podjetja</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Ime s.p. *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inp}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Davčna številka *</label>
                  <input value={form.tax_number} onChange={e => setForm({...form, tax_number: e.target.value})} className={inp}/>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Telefon</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="041 123 456" className={inp}/>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Ulica in hišna številka</label>
                <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Dunajska cesta 5" className={inp}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Poštna številka</label>
                  <input value={form.post_code} onChange={e => setForm({...form, post_code: e.target.value})} placeholder="1000" className={inp}/>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Kraj</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="Ljubljana" className={inp}/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DDV */}
        {activeSection === 'ddv' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>📊 DDV & prispevki</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>DDV status</div>
                <div onClick={() => setForm({...form, vat_registered: !form.vat_registered})}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 12, cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${form.vat_registered ? '#0D1F12' : '#d1d5db'}`, background: form.vat_registered ? '#0D1F12' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {form.vat_registered && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>DDV zavezanec</div>
                    <div style={{ fontSize: 11, color: '#888' }}>Imam ID za DDV (SI...)</div>
                  </div>
                </div>
                {form.vat_registered && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>ID za DDV</label>
                    <input value={form.vat_number} onChange={e => setForm({...form, vat_number: e.target.value})} placeholder="SI12345678" className={inp}/>
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Mesečni prispevki</div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
                  <strong>Kje najdem svoje zneski?</strong><br/>
                  <strong>Možnost 1:</strong> Vprašajte vašo računovodkinjo — ona vam pošlje UPN naloge z zneski.<br/>
                  <strong>Možnost 2:</strong> Prijavite se v <a href="https://edavki.durs.si" target="_blank" style={{textDecoration:'underline'}}>eDavki portal</a> → Obračuni → Prispevki za socialno varnost → tam vidite predizpolnjene zneski za vsak mesec.<br/>
                  <strong>Možnost 3:</strong> FURS vam vsako leto pošlje odločbo z zneski prispevkov.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>PIZ — pokojninsko (€/mes)</label>
                    <input type="number" step="0.01" value={form.contrib_piz || ''} onChange={e => setForm({...form, contrib_piz: parseFloat(e.target.value) || 0})} placeholder="370.51" className={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>ZZZS — zdravstveno (€/mes)</label>
                    <input type="number" step="0.01" value={form.contrib_zzzs || ''} onChange={e => setForm({...form, contrib_zzzs: parseFloat(e.target.value) || 0})} placeholder="274.45" className={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Zaposlovanje (€/mes)</label>
                    <input type="number" step="0.01" value={form.contrib_zaposlovanje || ''} onChange={e => setForm({...form, contrib_zaposlovanje: parseFloat(e.target.value) || 0})} placeholder="3.04" className={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Starševsko varstvo (€/mes)</label>
                    <input type="number" step="0.01" value={form.contrib_starsevstvo || ''} onChange={e => setForm({...form, contrib_starsevstvo: parseFloat(e.target.value) || 0})} placeholder="3.04" className={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Akontacija dohodnine (€/mes)</label>
                    <input type="number" step="0.01" value={form.contrib_akontacija || ''} onChange={e => setForm({...form, contrib_akontacija: parseFloat(e.target.value) || 0})} placeholder="105.70" className={inp} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                    <div style={{ fontSize: 12, color: '#555' }}>
                      Skupaj: <strong>€{(Number(form.contrib_piz || 0) + Number(form.contrib_zzzs || 0) + Number(form.contrib_zaposlovanje || 0) + Number(form.contrib_starsevstvo || 0) + Number(form.contrib_akontacija || 0)).toFixed(2)}/mes</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BANKA */}
        {activeSection === 'banka' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>🏦 Bančni podatki</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>IBAN (TRR)</label>
                <input
                  value={form.iban}
                  onFocus={e => { if (!form.iban) setForm({...form, iban: 'SI56'}) }}
                  onChange={e => {
                    const val = e.target.value
                    setForm({...form, iban: val})
                    const detectedBic = detectBIC(val)
                    if (detectedBic && !form.bic) setForm(prev => ({...prev, iban: val, bic: detectedBic}))
                  }}
                  placeholder="SI56 6100 0001 2345 678" className={inp} style={{ fontFamily: 'monospace' }}/>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>BIC / SWIFT</label>
                <input value={form.bic} onChange={e => setForm({...form, bic: e.target.value})} placeholder="HDELSI22" className={inp} style={{ fontFamily: 'monospace' }}/>
              </div>
            </div>
          </div>
        )}

        {/* BLAGAJNA */}
        {activeSection === 'blagajna' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🧾 Davčna blagajna (FURS)</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Nastavitve za FURS potrjevanje gotovinskih računov po ZDavPR</div>
            <a href="/nastavitve/blagajna" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0D1F12', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              ⚙️ Odpri nastavitve blagajne →
            </a>
          </div>
        )}

        {/* EKIPA */}
        {activeSection === 'ekipa' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>👥 Ekipa</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Upravljanje članov ekipe in dostopov</div>
            <a href="/nastavitve/ekipa" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0D1F12', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              👥 Upravljaj ekipo →
            </a>
          </div>
        )}

        {/* GESLO */}
        {activeSection === 'geslo' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🔐 Sprememba gesla</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Nastavite novo geslo za vaš račun</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Novo geslo</label>
                <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="Vsaj 8 znakov" className={inp}/>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Potrdi novo geslo</label>
                <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Ponovi geslo" className={inp}/>
              </div>
              {pwMsg && (
                <div style={{ padding: '9px 12px', borderRadius: 8, background: pwMsg.ok ? 'rgba(31,107,58,0.08)' : 'rgba(168,50,50,0.08)', color: pwMsg.ok ? '#1f6b3a' : '#a83232', fontSize: 12, fontWeight: 600 }}>
                  {pwMsg.text}
                </div>
              )}
              <button onClick={handlePasswordChange} disabled={pwSaving || !pwNew || !pwConfirm}
                style={{ padding: '11px 20px', borderRadius: 10, background: '#0D1F12', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (pwSaving || !pwNew || !pwConfirm) ? 0.5 : 1 }}>
                {pwSaving ? 'Shranjujem...' : 'Spremeni geslo'}
              </button>
            </div>
          </div>
        )}

        {/* RAČUNOVODJA */}
        {activeSection === 'racunovodja' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📒 Računovodja portal</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Vaš računovodja dobi vpogled v vaše poslovanje brez XLSX emailov</div>
            <a href="/racunovodja" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0D1F12', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              📒 Odpri računovodja portal →
            </a>
          </div>
        )}

        {/* API KLJUČI */}
        {activeSection === 'api' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🔑 API ključi</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>API dostop za integracije z zunanjimi sistemi</div>
            <a href="/api-kljuci" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0D1F12', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              🔑 Upravljaj API ključe →
            </a>
          </div>
        )}

        {/* PLAN */}
        {activeSection === 'plan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Trenutni plan */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>⭐ Naročnina</div>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: isProPos ? '#0a3d2b' : isPro ? '#0D1F12' : '#f3f4f6',
                  color: isPro ? '#fff' : '#6b7280' }}>
                  {isProPos ? 'PRO + POS' : isPro ? 'PRO' : 'FREE'}
                </span>
              </div>
              {org.plan_expires_at && (
                <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
                  Naslednje plačilo: <strong>{new Date(org.plan_expires_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                </p>
              )}
              {!isPro && (
                <p style={{ fontSize: 12, color: '#888' }}>Brezplačni plan — do 5 računov/mesec.</p>
              )}
              {isPro && !isProPos && (
                <p style={{ fontSize: 12, color: '#888' }}>Pro plan — neomejeni računi, email, FURS.</p>
              )}
              {isProPos && (
                <p style={{ fontSize: 12, color: '#888' }}>Pro + POS — vse funkcije vključno z blagajno.</p>
              )}
              {isPro && (
                <ManageSubscriptionButton />
              )}
            </div>

            {/* Paketi */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {/* Free */}
              <div style={{ background: '#fff', borderRadius: 16, border: '2px solid ' + (!isPro ? '#0D1F12' : '#f0f0f0'), padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🆓 Free</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>€0</div>
                {['Do 5 računov/mesec', 'PDF download', 'Prispevki / UPN QR'].map(f => (
                  <div key={f} style={{ fontSize: 12, color: '#555', marginBottom: 6, display: 'flex', gap: 6 }}>
                    <span style={{ color: '#16a34a' }}>✓</span> {f}
                  </div>
                ))}
              </div>

              {/* Pro */}
              <div style={{ background: '#fff', borderRadius: 16, border: '2px solid ' + (isPro && !isProPos ? '#1D9E75' : '#f0f0f0'), padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>💼 Pro</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>€9.99<span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>/mes</span></div>
                {['Neomejeni računi', 'Email pošiljanje', 'FURS fiskalizacija', 'Dobavnice', 'Prispevki / UPN QR'].map(f => (
                  <div key={f} style={{ fontSize: 12, color: '#555', marginBottom: 6, display: 'flex', gap: 6 }}>
                    <span style={{ color: '#16a34a' }}>✓</span> {f}
                  </div>
                ))}
                {!isPro && (
                  <div style={{ marginTop: 16 }}>
                    <UpgradeButton subscriptionStatus={org?.subscription_status || 'free'} targetPlan="pro" />
                  </div>
                )}
              </div>

              {/* Pro + POS */}
              <div style={{ background: '#fff', borderRadius: 16, border: '2px solid ' + (isProPos ? '#1D9E75' : '#f0f0f0'), padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🖥️ Pro + POS</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>€24.99<span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>/mes</span></div>
                {['Vse iz Pro paketa', 'POS blagajna', 'Koledar & termini', 'Člani & paketi', 'Inventar', 'Upravljanje ekipe'].map(f => (
                  <div key={f} style={{ fontSize: 12, color: '#555', marginBottom: 6, display: 'flex', gap: 6 }}>
                    <span style={{ color: '#16a34a' }}>✓</span> {f}
                  </div>
                ))}
                {!isProPos && (
                  <div style={{ marginTop: 16 }}>
                    <UpgradeButton subscriptionStatus={org?.subscription_status || 'free'} targetPlan="pro_pos" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
