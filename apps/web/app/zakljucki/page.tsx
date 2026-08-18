'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import PeriodFilter from '@/components/PeriodFilter'
import { type PeriodMode, getPeriodRange } from '@/lib/period-filter'
import { formatEurNumber } from '@/lib/format'

/**
 * DNEVNI ZAKLJUCKI BLAGAJNE — lastnikov pregled (18.8.2026).
 *
 * Zakaj obstaja: Z-porocila so se ves cas zbirala, a jih je bilo mogoce
 * videti SAMO znotraj blagajne. Statistika bere KPO knjigo, kjer je dnevni
 * promet ena sama vrstica brez razclenitve po DDV stopnjah. Racunovodja je
 * zakljucke dobil v svojem portalu (prelet 28), lastnik pa nikjer.
 */
export default function ZakljuckiPage() {
  const [org, setOrg] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const supabase = createClient()

  useEffect(() => { load() }, [periodMode, customFrom, customTo])

  async function load() {
    setLoading(true)
    const member = await getActiveMembership()
    if (!member) { setLoading(false); return }
    const o = (member as any).organizations
    setOrg(o)

    if (!o?.pos_business_id) { setReports([]); setLoading(false); return }

    const { from, to } = getPeriodRange(periodMode, customFrom, customTo)
    let q = supabase.from('z_reports').select('*').eq('business_id', o.pos_business_id)
    if (from) q = q.gte('closed_at', `${from}T00:00:00`)
    if (to) q = q.lte('closed_at', `${to}T23:59:59`)
    const { data } = await q.order('report_number', { ascending: false })
    setReports(data ?? [])
    setLoading(false)
  }

  const vsota = (f: (z: any) => any) => reports.reduce((s, z) => s + Number(f(z) ?? 0), 0)

  function prenesiCsv() {
    const glava = ['Stevilka_Z', 'Datum', 'Racunov', 'Promet', 'Gotovina', 'Kartica', 'Vracila', 'DDV_22', 'DDV_95'].join(';')
    const st = (n: any) => Number(n ?? 0).toFixed(2).replace('.', ',')
    const vrstice = [...reports].reverse().map(z => [
      z.report_number,
      (z.closed_at ?? z.opened_at ?? '').slice(0, 10),
      z.order_count ?? 0,
      st(z.total_revenue), st(z.total_cash), st(z.total_card),
      st(z.total_refunds), st(z.total_vat_22), st(z.total_vat_95),
    ].join(';'))
    const csv = '\ufeff' + [glava, ...vrstice].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dnevni_zakljucki_${getPeriodRange(periodMode, customFrom, customTo).from ?? 'vse'}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <AppLayout org={org}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1F12', margin: 0 }}>Dnevni zaključki blagajne</h1>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Z-poročila z razčlenitvijo DDV po stopnjah</div>
          </div>
          {reports.length > 0 && (
            <button onClick={prenesiCsv} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              Prenesi CSV
            </button>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <PeriodFilter
            mode={periodMode}
            onModeChange={setPeriodMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Nalagam…</div>
        ) : !org?.pos_business_id ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
            Ta organizacija nima povezane blagajne, zato dnevnih zaključkov ni.
          </div>
        ) : reports.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
            V izbranem obdobju ni dnevnih zaključkov.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Promet skupaj', value: `€${formatEurNumber(vsota(z => z.total_revenue))}` },
                { label: 'Gotovina', value: `€${formatEurNumber(vsota(z => z.total_cash))}` },
                { label: 'Kartica', value: `€${formatEurNumber(vsota(z => z.total_card))}` },
                { label: 'DDV 22 %', value: `€${formatEurNumber(vsota(z => z.total_vat_22))}` },
                { label: 'DDV 9,5 %', value: `€${formatEurNumber(vsota(z => z.total_vat_95))}` },
                { label: 'Računov', value: String(vsota(z => z.order_count)) },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12', marginTop: 4 }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                      {['Št. Z', 'Datum', 'Rač.', 'Promet', 'Gotovina', 'Kartica', 'Vračila', 'DDV 22 %', 'DDV 9,5 %'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map(z => (
                      <tr key={z.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>#{z.report_number}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13 }}>{(z.closed_at ?? z.opened_at ?? '').slice(0, 10)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>{z.order_count ?? 0}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>€{formatEurNumber(z.total_revenue)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>€{formatEurNumber(z.total_cash)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>€{formatEurNumber(z.total_card)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>€{formatEurNumber(z.total_refunds)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>€{formatEurNumber(z.total_vat_22)}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: '#555' }}>€{formatEurNumber(z.total_vat_95)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
