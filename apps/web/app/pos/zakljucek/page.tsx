'use client'

import { useEffect, useState } from 'react'
import { escapeHtml } from '@/lib/html-escape'
import { lokalniDatum } from '@/lib/tax-constants'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

// POPRAVLJENO (17.8.2026): slovenski zapis zneska. Prej "€1234.56" - angleska
// oblika z valuto spredaj in piko kot decimalnim locilom. V isti aplikaciji sta
// obstajala oba zapisa, kar je zgledalo kot napaka.
function fmt(n: number) { return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }

interface DailyClosing {
  id: string
  closing_date: string
  cash_sales: number
  card_sales: number
  total_sales: number
  total_refunds: number
  transaction_count: number
  vat_22: number
  vat_95: number
  vat_0: number
  net_amount: number
  closed_by: string | null
  notes: string | null
  location_id: string | null
}

interface Location {
  id: string
  name: string
}

export default function PosZakljucekPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [org, setOrg] = useState<any>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [closings, setClosings] = useState<DailyClosing[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Forma za nov zaključek
  const [selectedDate, setSelectedDate] = useState(lokalniDatum())
  const [selectedLocation, setSelectedLocation] = useState('')
  const [closedBy, setClosedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Podatki iz POS za izbrani dan
  const [dayStats, setDayStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      setOrgId(member.org_id)

      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', member.org_id).single()
      setOrg(orgData)

      const [locRes, closRes] = await Promise.all([
        supabase.from('pos_locations').select('id, name').eq('org_id', member.org_id).order('name'),
        supabase.from('pos_daily_closings').select('*').eq('org_id', member.org_id).order('closing_date', { ascending: false }).limit(30),
      ])

      setLocations(locRes.data ?? [])
      setClosings(closRes.data ?? [])
      if (locRes.data?.[0]) setSelectedLocation(locRes.data[0]?.id)
      setLoading(false)
    }
    load()
  }, [router, supabase])

  // Ko se datum/lokacija spremeni, naloži statistike iz POS transakcij
  useEffect(() => {
    if (!orgId || !selectedDate) return
    loadDayStats()
  }, [orgId, selectedDate, selectedLocation])

  async function loadDayStats() {
    if (!orgId) return
    setLoadingStats(true)
    try {
      let query = supabase
        .from('pos_transactions')
        .select('*')
        .eq('org_id', orgId)
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)

      if (selectedLocation) query = query.eq('location_id', selectedLocation)

      const { data: transactions } = await query

      if (!transactions || transactions.length === 0) {
        setDayStats(null)
        setLoadingStats(false)
        return
      }

      const cashSales = transactions.filter(t => t.payment_method === 'cash').reduce((s, t) => s + Number(t.total), 0)
      const cardSales = transactions.filter(t => t.payment_method === 'card').reduce((s, t) => s + Number(t.total), 0)
      const totalSales = cashSales + cardSales
      const totalRefunds = transactions.filter(t => t.type === 'refund').reduce((s, t) => s + Number(t.total), 0)

      // DDV izračun
      const vat22Base = totalSales / 1.22 * 0.22
      const net = totalSales - vat22Base

      setDayStats({
        cashSales,
        cardSales,
        totalSales,
        totalRefunds,
        transactionCount: transactions.length,
        vat22: Math.round(vat22Base * 100) / 100,
        vat95: 0,
        vat0: 0,
        netAmount: Math.round(net * 100) / 100,
      })
    } catch (e) {
      setDayStats(null)
    }
    setLoadingStats(false)
  }

  async function saveClosing() {
    if (!orgId) return
    setGenerating(true)
    try {
      const stats = dayStats ?? {
        cashSales: 0, cardSales: 0, totalSales: 0,
        totalRefunds: 0, transactionCount: 0,
        vat22: 0, vat95: 0, vat0: 0, netAmount: 0,
      }

      const { data: closing } = await supabase.from('pos_daily_closings').insert({
        org_id: orgId,
        location_id: selectedLocation || null,
        closing_date: selectedDate,
        cash_sales: stats.cashSales,
        card_sales: stats.cardSales,
        total_sales: stats.totalSales,
        total_refunds: stats.totalRefunds,
        transaction_count: stats.transactionCount,
        vat_22: stats.vat22,
        vat_95: stats.vat95,
        vat_0: stats.vat0,
        net_amount: stats.netAmount,
        closed_by: closedBy.trim() || null,
        notes: notes.trim() || null,
      }).select().single()

      setClosings(prev => [closing!, ...prev])
      setShowForm(false)
      setNotes('')
      showToast('Zaključek shranjen')

      // Takoj generiraj PDF
      if (closing) generatePDF(closing)
    } catch (e: any) {
      showToast(e.message)
    }
    setGenerating(false)
  }

  function generatePDF(closing: DailyClosing) {
    const location = locations.find(l => l.id === closing.location_id)
    const html = buildPDFHtml(closing, org, location)

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => {
      setTimeout(() => {
        win.print()
      }, 500)
    }
  }

  function buildPDFHtml(closing: DailyClosing, orgData: any, location?: Location) {
    return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<title>Dnevni zaključek ${closing.closing_date}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; max-width: 400px; margin: 0 auto; padding: 20px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px solid #000; margin: 8px 0; }
  .dline { border-top: 3px double #000; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .big { font-size: 18px; font-weight: bold; }
  .section { margin: 10px 0; }
  h1 { font-size: 16px; font-weight: bold; margin: 6px 0; }
  h2 { font-size: 13px; font-weight: bold; margin: 6px 0; }
  @media print {
    body { max-width: 100%; }
    @page { margin: 10mm; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:14px">${orgData?.name ?? 'Podjetje'}</div>
    ${orgData?.address ? `<div>${escapeHtml(orgData.address)}</div>` : ''}
    ${orgData?.tax_number ? `<div>ID DDV: SI${orgData.tax_number}</div>` : ''}
  </div>

  <div class="line"></div>

  <div class="center">
    <h1>DNEVNI ZAKLJUČEK</h1>
    ${location ? `<div>${escapeHtml(location.name)}</div>` : ''}
    <div>Datum: ${fmtDate(closing.closing_date)}</div>
    <div>Izpis: ${new Date().toLocaleString('sl-SI')}</div>
  </div>

  <div class="dline"></div>

  <div class="section">
    <h2>PROMET PO NAČINU PLAČILA</h2>
    <div class="row"><span>Gotovina:</span><span class="bold">${fmt(closing.cash_sales)}</span></div>
    <div class="row"><span>Kartice:</span><span class="bold">${fmt(closing.card_sales)}</span></div>
    ${closing.total_refunds > 0 ? `<div class="row"><span>Vračila:</span><span>-${fmt(closing.total_refunds)}</span></div>` : ''}
  </div>

  <div class="line"></div>

  <div class="section">
    <div class="row">
      <span class="bold">SKUPAJ PROMET:</span>
      <span class="big">${fmt(closing.total_sales)}</span>
    </div>
    <div class="row"><span>Število računov:</span><span>${closing.transaction_count}</span></div>
    ${closing.transaction_count > 0 ? `<div class="row"><span>Povprečen račun:</span><span>${fmt(closing.total_sales / closing.transaction_count)}</span></div>` : ''}
  </div>

  <div class="dline"></div>

  <div class="section">
    <h2>DAVČNI OBRAČUN</h2>
    <div class="row"><span>Osnova (brez DDV):</span><span>${fmt(closing.net_amount)}</span></div>
    ${closing.vat_22 > 0 ? `<div class="row"><span>DDV 22%:</span><span>${fmt(closing.vat_22)}</span></div>` : ''}
    ${closing.vat_95 > 0 ? `<div class="row"><span>DDV 9,5%:</span><span>${fmt(closing.vat_95)}</span></div>` : ''}
    ${closing.vat_0 > 0 ? `<div class="row"><span>DDV 0%:</span><span>${fmt(closing.vat_0)}</span></div>` : ''}
    <div class="row"><span class="bold">DDV skupaj:</span><span class="bold">${fmt(closing.vat_22 + closing.vat_95 + closing.vat_0)}</span></div>
  </div>

  <div class="dline"></div>

  ${closing.notes ? `<div class="section"><div>Opomba: ${closing.notes}</div></div><div class="line"></div>` : ''}

  <div class="section">
    <div class="row"><span>Zaključil:</span><span>${closing.closed_by ?? '_______________'}</span></div>
    <div style="margin-top: 30px">
      <div class="row"><span>Podpis:</span><span>_______________</span></div>
    </div>
  </div>

  <div class="line"></div>
  <div class="center" style="font-size:10px; margin-top: 8px">
    Dokument je bil ustvarjen z Računko POS<br>
    računko.si
  </div>
</body>
</html>`
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO · POS</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Dnevni zaključki</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/pos/admin" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← POS Admin</Link>
            <button onClick={() => setShowForm(!showForm)} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Nov zaključek
            </button>
          </div>
        </div>

        {/* Stats */}
        {closings.length > 0 && (
          <div style={{ maxWidth: 900, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Zaključkov letos', value: closings.length, color: '#fff' },
              { label: 'Promet letos', value: fmt(closings.reduce((s, c) => s + Number(c.total_sales), 0)), color: '#6EE7B7' },
              { label: 'Gotovina letos', value: fmt(closings.reduce((s, c) => s + Number(c.cash_sales), 0)), color: '#FCD34D' },
              { label: 'Kartice letos', value: fmt(closings.reduce((s, c) => s + Number(c.card_sales), 0)), color: '#A78BFA' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* FORMA ZA NOV ZAKLJUČEK */}
        {showForm && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 18 }}>Nov dnevni zaključek</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum</label>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }} />
              </div>
              {locations.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Lokacija</label>
                  <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }}>
                    <option value="">Vse lokacije</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Zaključil</label>
                <input value={closedBy} onChange={e => setClosedBy(e.target.value)} placeholder="Ime blagajnika" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }} />
              </div>
            </div>

            {/* Statistike iz POS */}
            {loadingStats ? (
              <div style={{ background: '#F7F6F2', borderRadius: 10, padding: 20, textAlign: 'center', fontSize: 13, color: '#888' }}>Nalagam podatke...</div>
            ) : dayStats ? (
              <div style={{ background: '#F7F6F2', borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 12 }}>Podatki iz POS — {fmtDate(selectedDate)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Gotovina', value: fmt(dayStats.cashSales), color: '#FCD34D' },
                    { label: 'Kartice', value: fmt(dayStats.cardSales), color: '#A78BFA' },
                    { label: 'Skupaj', value: fmt(dayStats.totalSales), color: '#1D9E75' },
                    { label: 'Računov', value: dayStats.transactionCount, color: '#0D1F12' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: '#FEF3C7', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#D97706' }}>
                ⚠️ Ni POS transakcij za {fmtDate(selectedDate)}. Zaključek bo ustvarjen z ničelnimi vrednostmi.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Opombe</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Posebnosti, pojasnila..." style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Prekliči</button>
              <button onClick={saveClosing} disabled={generating} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: generating ? 0.6 : 1 }}>
                {generating ? 'Shranjujem...' : '✓ Shrani in natisni PDF'}
              </button>
            </div>
          </div>
        )}

        {/* LISTA ZAKLJUČKOV */}
        {closings.length === 0 && !showForm ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧾</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni dnevnih zaključkov</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Naredite prvi zaključek dneva za arhiv in PDF izpis</div>
            <button onClick={() => setShowForm(true)} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>+ Nov zaključek →</button>
          </div>
        ) : closings.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Datum', 'Lokacija', 'Gotovina', 'Kartice', 'Skupaj', 'Računov', 'DDV', 'Zaključil', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closings.map(c => {
                  const location = locations.find(l => l.id === c.location_id)
                  return (
                    <tr key={c.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{fmtDate(c.closing_date)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#666' }}>{location?.name ?? '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#FCD34D', fontWeight: 600 }}>{fmt(c.cash_sales)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#A78BFA', fontWeight: 600 }}>{fmt(c.card_sales)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: '#1D9E75' }}>{fmt(c.total_sales)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#666' }}>{c.transaction_count}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#888' }}>{fmt(c.vat_22 + c.vat_95 + c.vat_0)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#666' }}>{c.closed_by ?? '—'}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <button onClick={() => generatePDF(c)} style={{ fontSize: 11, fontWeight: 600, color: '#0D1F12', background: '#F7F6F2', border: 0, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🖨️ PDF
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
  )
}
