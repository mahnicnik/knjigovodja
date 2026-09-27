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
import { obracunPlace, rokPlacila } from '@/lib/place'

const MESECI = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']

export default function ObveznostiPlac({ orgId, employees, leto, osvezi }: { orgId: string; employees: any[]; leto: number; osvezi: number }) {
  const supabase = createClient()
  const [liste, setListe] = useState<any[]>([])
  const [dela, setDela] = useState<string | null>(null)

  const nalozi = useCallback(async () => {
    const { data } = await supabase.from('payslips')
      .select('id, employee_id, employee_name_raw, type, month, year, gross_salary, net_salary, income_tax, ee_total, er_total, meal_allowance, travel_expenses, other_allowances, total_furs, employer_total_cost, total_cost, paid_at, neto_placano_at, furs_placano_at')
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

  // PRELET 335: izbris placilne liste izbrise tudi njen vnos v KPO (povezava payslip_id).
  async function izbrisi(p: any) {
    const ime = zap.get(p.employee_id)?.full_name || p.employee_name_raw || 'zaposleni'
    if (!confirm(`Izbrišem plačilno listo (${ime}, ${p.type === 'regres' ? 'regres' : MESECI[(p.month || 1) - 1]} ${p.year})? Izbriše se tudi strošek v knjigi (KPO).`)) return
    setDela(p.id + 'x')
    const { error: kErr } = await supabase.from('kpo_entries').delete().eq('payslip_id', p.id)
    const { error } = kErr ? { error: kErr } : await supabase.from('payslips').delete().eq('id', p.id)
    setDela(null)
    if (error) { alert('Ni bilo mogoče izbrisati: ' + error.message); return }
    setListe(prev => prev.filter(x => x.id !== p.id))
  }

  // PRELET 335: manjkajoce placilne liste (brez njih strosek plac ni v knjigi).
  const danesD = new Date()
  const zadnjiMesec = leto < danesD.getFullYear() ? 12 : leto === danesD.getFullYear() ? danesD.getMonth() : 0 // zakljuceni meseci
  const manjka: string[] = []
  for (const e of employees) {
    const zacetek = e.start_date ? new Date(e.start_date) : null
    for (let m = 1; m <= zadnjiMesec; m++) {
      const konecMeseca = new Date(leto, m, 0)
      if (zacetek && zacetek > konecMeseca) continue
      if (!liste.some(p => p.type === 'monthly' && p.month === m && (p.employee_id === e.id))) manjka.push(`${e.full_name}: ${MESECI[m - 1]}`)
    }
  }
  const opozoriloManjka = manjka.length > 0 && (
    <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
      ⚠️ <strong>Manjkajo plačilne liste ({leto}):</strong> {manjka.slice(0, 12).join(', ')}{manjka.length > 12 ? ` … (+${manjka.length - 12})` : ''}. Brez njih strošek plač ni v knjigi (KPO) — naložite jih z gumbom „Naloži plačilno listo“.
    </div>
  )

  if (liste.length === 0) return opozoriloManjka ? <div className="mb-6">{opozoriloManjka}</div> : null

  let strosek = 0, drzavi = 0, neto = 0, netoDruzina = 0, odprtoNeto = 0, odprtoFurs = 0
  for (const p of liste) {
    const o = obracunPlace(p)
    strosek += o.strosek; drzavi += o.furs; neto += o.naTrr
    if (zap.get(p.employee_id)?.druzinski_clan) netoDruzina += o.naTrr
    if (!p.neto_placano_at) odprtoNeto += o.naTrr
    if (!p.furs_placano_at) odprtoFurs += o.furs
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
        {kartica('Zaposlenim na TRR', eur(neto), imaDruzino ? `neto + povračila; od tega ${eur(netoDruzina)} družinskim članom` : 'neto + povračila (prehrana, prevoz)')}
        {imaDruzino && kartica('Dejanski strošek za družino', eur(strosek - netoDruzina), `${eur(netoDruzina)} ostane v družini`, true)}
      </div>

      {opozoriloManjka}
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
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Na TRR zaposlenemu</th>
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Državi (FURS)</th>
              <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Strošek (KPO)</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Rok</th>
              <th style={{ padding: '6px 8px' }} />
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
                  <td style={{ padding: '8px', textAlign: 'right' }}>{gumb('neto_placano_at', o.naTrr)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{gumb('furs_placano_at', o.furs)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{eur(o.strosek)}</td>
                  <td style={{ padding: '8px', color: zamuda && (!p.neto_placano_at || !p.furs_placano_at) ? '#DC2626' : '#888' }}>{rok ? new Date(rok).toLocaleDateString('sl-SI') : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button type="button" disabled={dela === p.id + 'x'} onClick={() => izbrisi(p)} title="Izbriši plačilno listo in njen strošek v knjigi" style={{ border: 0, background: 'none', cursor: 'pointer', color: '#bbb', fontSize: 13 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400 mt-3">Kliknite znesek, da ga označite kot plačanega. 👪 = družinski član (nastavite pri urejanju zaposlenega). Plačila na TRR in FURS iz bančnega uvoza se samodejno označijo kot plačana in NE gredo še enkrat med stroške. Prispevke in akontacijo plačate na dan izplačila plače.</div>
    </div>
  )
}
