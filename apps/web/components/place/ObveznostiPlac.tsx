'use client'

/**
 * PRELET 333: obveznosti za place + "druzinski pogled".
 *
 * Za vsako placilno listo:
 *  - NETO -> zaposleni (rok: 18. dan naslednjega meseca; regres do 1. julija)
 *  - DRZAVI (FURS) = celoten strosek - neto: prispevki delojemalca in
 *    delodajalca ter akontacija dohodnine (placajo se hkrati z neto placo)
 *  - kljukici "Neto izplacano" / "FURS placano"
 *
 * V KPO se VEDNO knjizi celoten strosek (bruto II) - to je davcno priznan
 * odhodek in zmanjsa davek. Izbira "druzinski clan" pri zaposlenem vpliva
 * SAMO na prikaz: koliko denarja zares odide iz druzine (drzavi) in koliko
 * ga ostane v druzini (neto druzinskemu clanu).
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatEurNumber } from '@/lib/format'

const MESECI = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']

export function obracunPlace(p: any) {
  const neto = Number(p.net_salary || 0)
  const strosek = Number(p.employer_total_cost ?? p.total_cost ?? p.gross_salary ?? 0)
  const drzavi = Math.max(0, Math.round((strosek - neto) * 100) / 100)
  return { neto, strosek, drzavi }
}

/** Rok placila: mesecna placa do 18. naslednjega meseca (ZDR-1, 134. clen), regres do 1. julija. */
export function rokPlacila(p: any): string | null {
  if (!p.year) return null
  if (p.type === 'regres') return `${p.year}-07-01`
  if (!p.month) return null
  const d = new Date(Date.UTC(p.year, p.month, 18)) // month je 1..12 -> naslednji mesec
  return d.toISOString().slice(0, 10)
}

export default function ObveznostiPlac({ orgId, employees, leto, osvezi }: { orgId: string; employees: any[]; leto: number; osvezi: number }) {
  const supabase = createClient()
  const [liste, setListe] = useState<any[]>([])
  const [dela, setDela] = useState<string | null>(null)

  const nalozi = useCallback(async () => {
    const { data } = await supabase.from('payslips')
      .select('id, employee_id, employee_name_raw, type, month, year, gross_salary, net_salary, employer_total_cost, total_cost, neto_placano_at, furs_placano_at')
      .eq('org_id', orgId).eq('year', leto)
      .order('month', { ascending: false })
    setListe(data || [])
  }, [orgId, leto, supabase])

  useEffect(() => { nalozi() }, [nalozi, osvezi])

  const zap = new Map(employees.map(e => [e.id, e]))
  const danes = new Date().toISOString().slice(0, 10)

  async function oznaci(p: any, polje: 'neto_placano_at' | 'furs_placano_at') {
    setDela(p.id + polje)
    const nova = p[polje] ? null : new Date().toISOString()
    const { error } = await supabase.from('payslips').update({ [polje]: nova }).eq('id', p.id)
    setDela(null)
    if (error) { alert('Ni bilo mogoče shraniti: ' + error.message); return }
    setListe(prev => prev.map(x => x.id === p.id ? { ...x, [polje]: nova } : x))
  }

  if (liste.length === 0) return null

  let strosek = 0, drzavi = 0, neto = 0, netoDruzina = 0, odprtoNeto = 0, odprtoFurs = 0
  for (const p of liste) {
    const o = obracunPlace(p)
    strosek += o.strosek; drzavi += o.drzavi; neto += o.neto
    if (zap.get(p.employee_id)?.druzinski_clan) netoDruzina += o.neto
    if (!p.neto_placano_at) odprtoNeto += o.neto
    if (!p.furs_placano_at) odprtoFurs += o.drzavi
  }
  const imaDruzino = netoDruzina > 0
  const eur = (n: number) => `€${formatEurNumber(n)}`

  const kartica = (naslov: string, vrednost: string, opis: string, poudarek = false) => (
    <div style={{ flex: '1 1 160px', background: poudarek ? '#0D1F12' : '#fff', color: poudarek ? '#fff' : '#0D1F12', border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{naslov}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{vrednost}</div>
      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3, lineHeight: 1.4 }}>{opis}</div>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="font-semibold text-gray-900 mb-1">Plače {leto} — strošek in obveznosti</div>
      <div className="text-xs text-gray-500 mb-4">V knjigo (KPO) gre vedno celoten strošek — to je davčno priznan odhodek in vam zniža davek.{imaDruzino ? ' Spodaj ločeno vidite, koliko denarja zares odide iz družine.' : ''}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {kartica('Strošek v knjigi (KPO)', eur(strosek), 'bruto II — davčno priznan odhodek')}
        {kartica('Državi (FURS)', eur(drzavi), 'prispevki + akontacija dohodnine')}
        {kartica('Neto zaposlenim', eur(neto), imaDruzino ? `od tega ${eur(netoDruzina)} družinskim članom` : 'izplačano na TRR zaposlenih')}
        {imaDruzino && kartica('Dejanski strošek za družino', eur(strosek - netoDruzina), `${eur(netoDruzina)} neto ostane v družini`, true)}
      </div>

      {(odprtoNeto > 0.009 || odprtoFurs > 0.009) && (
        <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
          Še za plačilo: neto <strong>{eur(odprtoNeto)}</strong> · FURS <strong>{eur(odprtoFurs)}</strong>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Obdobje</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Zaposleni</th>
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Neto → zaposleni</th>
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Državi (FURS)</th>
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Strošek (KPO)</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Rok</th>
            </tr>
          </thead>
          <tbody>
            {liste.map(p => {
              const o = obracunPlace(p)
              const e = zap.get(p.employee_id)
              const rok = rokPlacila(p)
              const zamuda = rok && rok < danes
              const gumb = (polje: 'neto_placano_at' | 'furs_placano_at', znesek: number) => {
                const placano = !!p[polje]
                return (
                  <button type="button" disabled={dela === p.id + polje} onClick={() => oznaci(p, polje)}
                    title={placano ? `Plačano ${new Date(p[polje]).toLocaleDateString('sl-SI')} — klik za preklic` : 'Označi kot plačano'}
                    style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, color: placano ? '#0E5E3B' : (zamuda ? '#DC2626' : '#0D1F12') }}>
                    {placano ? '✓ ' : '○ '}{eur(znesek)}
                  </button>
                )
              }
              return (
                <tr key={p.id} style={{ borderTop: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '8px' }}>{p.type === 'regres' ? `Regres ${p.year}` : `${MESECI[(p.month || 1) - 1]} ${p.year}`}</td>
                  <td style={{ padding: '8px' }}>{e?.full_name || p.employee_name_raw || '—'}{e?.druzinski_clan ? ' 👪' : ''}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{gumb('neto_placano_at', o.neto)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{gumb('furs_placano_at', o.drzavi)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{eur(o.strosek)}</td>
                  <td style={{ padding: '8px', color: zamuda && (!p.neto_placano_at || !p.furs_placano_at) ? '#DC2626' : '#888' }}>{rok ? new Date(rok).toLocaleDateString('sl-SI') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400 mt-3">Kliknite znesek, da ga označite kot plačanega. 👪 = družinski član (nastavite pri urejanju zaposlenega). Prispevke in akontacijo plačate na dan izplačila plače, hkrati z oddajo REK-1.</div>
    </div>
  )
}
