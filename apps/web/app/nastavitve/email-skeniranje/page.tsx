'use client'
import { useState, useEffect, Suspense } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

function EmailSkeniranjeContent() {
  const [org, setOrg] = useState<any>(null)
  const [connections, setConnections] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrg((member as any).organizations)
      const { data: conns } = await supabase.from('email_connections').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false })
      setConnections(conns || [])
      const { data: pend } = await supabase.from('email_scan_pending').select('*').eq('org_id', member.org_id).eq('status', 'pending').order('created_at', { ascending: false })
      setPending(pend || [])
      setLoading(false)
    }
    load()
  }, [])

  async function updateConnection(id: string, updates: any) {
    setSavingId(id)
    const { error: connErr } = await supabase.from('email_connections').update(updates).eq('id', id)
    if (connErr) { alert('Nastavitve ni bilo mogoče shraniti: ' + connErr.message); return }
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    setSavingId(null)
  }

  async function disconnectEmail(id: string) {
    if (!confirm('Prekiniti povezavo s tem e-mail racunom?')) return
    const { error: disErr } = await supabase.from('email_connections').delete().eq('id', id)
    if (disErr) { alert('Povezave ni bilo mogoče odstraniti: ' + disErr.message); return }
    setConnections(prev => prev.filter(c => c.id !== id))
  }

  async function runScanNow(range?: { from: string; to: string }) {
    setScanning(true)
    try {
      const res = await fetch('/api/email-scan/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(range ? { from: range.from, to: range.to } : {}),
      })
      const data = await res.json()
      if (!res.ok) { alert('Napaka: ' + data.error); return }
      // POPRAVLJENO (30.7.2026): opozori, ce paginacijska meja (100
      // sporocil) ni zajela vsega - uporabnik naj pozene se enkrat.
      const cappedMsg = data.capped
        ? '\n\n⚠️ V tem obdobju je bilo VEC kot 100 e-mailov s prilogo - ta tek jih ni zajel vseh. Poženite skeniranje še enkrat za isto obdobje, da zajamete preostale.'
        : ''
      alert(`Skeniranje koncano. Pregledanih ${data.scanned || 0} e-mailov, najdenih ${data.found || 0} novih stroskov v pregled.${cappedMsg}`)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
        if (member) {
          const { data: pend } = await supabase.from('email_scan_pending').select('*').eq('org_id', member.org_id).eq('status', 'pending').order('created_at', { ascending: false })
          setPending(pend || [])
        }
      }
    } catch (e: any) {
      alert('Napaka: ' + e.message)
    }
    setScanning(false)
  }

  async function confirmPending(item: any) {
    const d = item.extracted
    const amountNet = Number(d.amount_net || 0)
    const vatRate = Number(d.vat_rate || 0)
    const vatAmount = amountNet * (vatRate / 100)
    const amountTotal = amountNet + vatAmount
    // POPRAVLJENO (16.8.2026): prej brez preverbe - potrjen racun iz e-poste se
    // ni shranil, predlog pa se je oznacil kot obdelan, zato bi bil izgubljen.
    const { error: rcpErr } = await supabase.from('receipts').insert({
      org_id: org.id,
      vendor: d.vendor || '',
      receipt_date: d.date || lokalniDatum(),
      amount_net: amountNet,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      amount_total: amountTotal,
      description: d.description || '',
      category: d.category || 'Drugo',
      status: 'confirmed',
      is_deductible: true,
      attachment_base64: item.pdf_base64 || null,
      attachment_type: 'pdf',
    })
    if (rcpErr) { alert('Računa ni bilo mogoče shraniti: ' + rcpErr.message); return }
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: d.date || lokalniDatum(),
      description: `${d.vendor || ''} — ${d.category || 'Drugo'}`,
      entry_type: 'expense',
      income: 0,
      expense: amountNet,
      vat_in: vatAmount,
      vat_out: 0,
      category: d.category || 'Drugo',
    })
    if (kpoErr) { alert('Vnosa v knjigo ni bilo mogoče shraniti: ' + kpoErr.message); return }
    await supabase.from('email_scan_pending').update({ status: 'confirmed', reviewed_at: new Date().toISOString() }).eq('id', item.id)
    setPending(prev => prev.filter(p => p.id !== item.id))
  }

  async function rejectPending(id: string) {
    const { error: rejErr } = await supabase.from('email_scan_pending').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    // POPRAVLJENO (16.8.2026): prej brez preverbe - predlog je izginil s
    // seznama, v bazi pa ostal, zato bi se ob osvezitvi znova pojavil.
    if (rejErr) { alert('Predloga ni bilo mogoče zavrniti: ' + rejErr.message); return }
    setPending(prev => prev.filter(p => p.id !== id))
  }

  function previewPdf(item: any) {
    if (!item.pdf_base64) { alert('PDF ni na voljo za predogled'); return }
    const byteChars = atob(item.pdf_base64)
    const byteNumbers = new Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const scheduleLabels: Record<string, string> = { daily: 'Dnevno', weekly: 'Tedensko', monthly: 'Mesecno', custom: 'Po meri (cron)' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3', padding: '24px 32px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href="/nastavitve" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Nazaj na Nastavitve</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 24 }}>📧 E-mail skeniranje stroškov</h1>

        {searchParams.get('email_connected') && (
          <div style={{ background: '#f0fdf4', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            ✓ E-mail racun uspesno povezan
          </div>
        )}
        {searchParams.get('email_error') && (
          <div style={{ background: '#fef2f2', color: '#991b1b', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            ⚠ Napaka pri povezovanju e-maila. Poskusite znova.
          </div>
        )}

        {/* POVEZANI RACUNI */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Povezani e-mail racuni</div>
            <a href="/api/auth/gmail/connect" style={{ background: '#0D1F12', color: '#fff', padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              + Poveži Gmail
            </a>
          </div>
          {connections.length === 0 ? (
            <div style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '20px 0' }}>Ni povezanih e-mail racunov</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {connections.map(c => (
                <div key={c.id} style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.email_address}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{c.provider === 'gmail' ? 'Gmail' : 'Outlook'} · Zadnje skeniranje: {c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleString('sl-SI') : 'še ni bilo'}</div>
                    </div>
                    <button onClick={() => disconnectEmail(c.id)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Prekini povezavo</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Urnik skeniranja</label>
                      <select value={c.scan_schedule} onChange={e => updateConnection(c.id, { scan_schedule: e.target.value })} disabled={savingId === c.id}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }}>
                        {Object.entries(scheduleLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Specificni posiljatelji (neobvezno)</label>
                      <input
                        defaultValue={(c.sender_filters || []).join(', ')}
                        onBlur={e => updateConnection(c.id, { sender_filters: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                        placeholder="npr. racuni@dobavitelj.si"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                    </div>
                  </div>
                  {c.scan_schedule === 'custom' && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>
                        Po meri urnik (cron izraz) — npr. "0 6 1 * *" = 1. v mesecu ob 6h, "0 6 1 1,4,7,10 *" = zacetek vsakega trimesecja
                      </label>
                      <input
                        defaultValue={c.custom_cron || ''}
                        onBlur={e => updateConnection(c.id, { custom_cron: e.target.value.trim() })}
                        placeholder="0 6 1 1,4,7,10 *"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                        Format: minuta ura dan-v-mesecu mesec dan-v-tednu. Priporocljivo za konec trimesecja (DDV zavezanci) ali konec leta.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {connections.length > 0 && (
            <>
              <button onClick={() => runScanNow()} disabled={scanning} style={{ marginTop: 16, width: '100%', padding: '11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                {scanning ? 'Skeniram...' : '🔍 Preveri zdaj (od zadnjega skena)'}
              </button>
              <div style={{ marginTop: 12, padding: 14, background: '#faf9f7', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Ali preveri dolocen datumski razpon</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#999', display: 'block', marginBottom: 4 }}>Od</label>
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#999', display: 'block', marginBottom: 4 }}>Do</label>
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </div>
                  <button
                    onClick={() => rangeFrom && rangeTo && runScanNow({ from: rangeFrom, to: rangeTo })}
                    disabled={scanning || !rangeFrom || !rangeTo}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D1F12', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, opacity: (!rangeFrom || !rangeTo) ? 0.5 : 1 }}>
                    Skeniraj
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CAKALNA VRSTA ZA POTRDITEV */}
        {pending.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Najdeni strosti — cakajo na potrditev ({pending.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pending.map(item => (
                <div key={item.id} style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    Iz e-maila: {item.email_from} · {item.email_subject}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><span style={{ fontSize: 10, color: '#999' }}>Dobavitelj</span><div style={{ fontSize: 13, fontWeight: 600 }}>{item.extracted.vendor}</div></div>
                    <div><span style={{ fontSize: 10, color: '#999' }}>Datum</span><div style={{ fontSize: 13, fontWeight: 600 }}>{item.extracted.date}</div></div>
                    <div><span style={{ fontSize: 10, color: '#999' }}>Skupaj</span><div style={{ fontSize: 13, fontWeight: 700 }}>€{Number(item.extracted.amount_total || 0).toFixed(2)}</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => previewPdf(item)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>📄 Predogled</button>
                    <button onClick={() => rejectPending(item.id)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Zavrni</button>
                    <button onClick={() => confirmPending(item)} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#0D1F12', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Potrdi in dodaj med stroske</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmailSkeniranjePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nalagam...</div>}>
      <EmailSkeniranjeContent />
    </Suspense>
  )
}
