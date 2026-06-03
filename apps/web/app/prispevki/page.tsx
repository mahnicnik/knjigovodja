'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import QRCode from 'qrcode'

// Prispevki se nalagajo iz Supabase tabele sp_contribution_rates

const MONTHS_FULL = ['Januar','Februar','Marec','April','Maj','Junij',
                     'Julij','Avgust','September','Oktober','November','December']

function buildUPN(params: {
  payerName: string
  payerAddress: string
  payerCity: string
  amount: number
  iban: string
  reference: string
  description: string
  dueDate: string
}): string {
  const amount = String(Math.round(params.amount * 100)).padStart(11, '0')
  const due = params.dueDate.replace(/-/g, '')
  return [
    'UPNQR', '', '', '',
    params.payerName,
    params.payerAddress,
    params.payerCity,
    amount, due, 'TAXS',
    params.description,
    params.iban.replace(/\s/g, ''),
    params.reference.replace(/\s/g, ''),
    'Ministrstvo za finance',
    'Župančičeva 3',
    '1000 Ljubljana',
  ].join('\n')
}

export default function PrispevkiPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [qrPIZ, setQrPIZ] = useState<string>('')
  const [qrZZZS, setQrZZZS] = useState<string>('')
  const [qrAkontacija, setQrAkontacija] = useState<string>('')
  const [akontacija, setAkontacija] = useState('')
  const [rates, setRates] = useState<any>(null)
  const [ratesLoading, setRatesLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
    if (member) setOrg((member as any).organizations)
    setLoading(false)
  }

  useEffect(() => {
    if (org) generateQRs()
  }, [org, selectedMonth, selectedYear, akontacija])

  async function generateQRs() {
    if (!org) return
    const cc = org.contribution_class || 8
    // Naloži aktualne prispevke iz Supabase
    const supabase = createClient()
    const { data: rateData } = await supabase
      .from('sp_contribution_rates')
      .select('*')
      .eq('year', selectedYear)
      .eq('contribution_class', cc)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    const contrib = rateData || rates || { piz: 0, zzzs: 0, zaposlovanje: 0, "starševo": 0 }
    const monthStr = String(selectedMonth + 1).padStart(2, '0')
    const yearShort = String(selectedYear).slice(-2)
    const dueDate = `${selectedYear}-${monthStr}-15`
    const taxNum = org.tax_number

    // PIZ
    const pizUPN = buildUPN({
      payerName: org.name,
      payerAddress: org.address || '',
      payerCity: `${org.post_code || ''} ${org.city || ''}`,
      amount: contrib.piz,
      iban: 'SI56 0110 0888 1000 030',
      reference: `SI19 ${taxNum} ZP${monthStr}${yearShort}`,
      description: `Prispevek ZPIZ s.p. ${MONTHS_FULL[selectedMonth]} ${selectedYear}`,
      dueDate,
    })

    // ZZZS
    const zzzsUPN = buildUPN({
      payerName: org.name,
      payerAddress: org.address || '',
      payerCity: `${org.post_code || ''} ${org.city || ''}`,
      amount: contrib.zzzs,
      iban: 'SI56 0110 0888 1000 030',
      reference: `SI19 ${taxNum} ZZ${monthStr}${yearShort}`,
      description: `Prispevek ZZZS s.p. ${MONTHS_FULL[selectedMonth]} ${selectedYear}`,
      dueDate,
    })

    const [qr1, qr2] = await Promise.all([
      QRCode.toDataURL(pizUPN, { width: 200, margin: 1 }),
      QRCode.toDataURL(zzzsUPN, { width: 200, margin: 1 }),
    ])
    setQrPIZ(qr1)
    setQrZZZS(qr2)

    // Akontacija (če je vnesena)
    if (akontacija && parseFloat(akontacija) > 0) {
      const akUPN = buildUPN({
        payerName: org.name,
        payerAddress: org.address || '',
        payerCity: `${org.post_code || ''} ${org.city || ''}`,
        amount: parseFloat(akontacija),
        iban: 'SI56 0110 0888 1000 030',
        reference: `SI19 ${taxNum} AK${monthStr}${yearShort}`,
        description: `Akontacija dohodnine ${MONTHS_FULL[selectedMonth]} ${selectedYear}`,
        dueDate,
      })
      const qr3 = await QRCode.toDataURL(akUPN, { width: 200, margin: 1 })
      setQrAkontacija(qr3)
    } else {
      setQrAkontacija('')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const cc = org?.contribution_class || 8
  const contrib = rates || { piz: 0, zzzs: 0, zaposlovanje: 0 }
  const monthStr = String(selectedMonth + 1).padStart(2, '0')
  const yearShort = String(selectedYear).slice(-2)
  const akAmt = parseFloat(akontacija) || 0
  const total = contrib.piz + contrib.zzzs + akAmt

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
        <h1 className="font-semibold text-gray-900 mt-0.5">Prispevki s.p. — UPN nalogi</h1>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Izbira meseca */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex gap-3 items-center">
            <select value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-28">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            ⚠️ Rok plačila: <strong>15. {MONTHS_FULL[selectedMonth]} {selectedYear}</strong>
            &nbsp;·&nbsp; Prispevni razred {cc}
            &nbsp;·&nbsp; <Link href="/nastavitve" className="text-blue-600 underline">Spremenite v nastavitvah</Link>
          </div>
        </div>

        {/* Skupni znesek */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-6 text-white">
          <div className="text-sm text-gray-400 mb-1">Skupaj za plačilo ta mesec</div>
          <div className="text-4xl font-semibold">€{total.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-2">
            ZPIZ €{contrib.piz.toFixed(2)} + ZZZS €{contrib.zzzs.toFixed(2)}
            {akAmt > 0 && ` + Akontacija €${akAmt.toFixed(2)}`}
          </div>
        </div>

        {/* QR nalogi */}
        <div className="grid grid-cols-2 gap-4 mb-6">

          {/* ZPIZ */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-medium text-gray-900 text-sm">ZPIZ</div>
                <div className="text-xs text-gray-500">Pokojninsko zavarovanje</div>
              </div>
              <div className="text-lg font-semibold text-gray-900">€{contrib.piz.toFixed(2)}</div>
            </div>
            {qrPIZ && <img src={qrPIZ} alt="QR ZPIZ" className="w-full rounded-xl" />}
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="font-mono">SI56 0110 0888 1000 030</div>
              <div className="font-mono">SI19 {org?.tax_number} ZP{monthStr}{yearShort}</div>
            </div>
          </div>

          {/* ZZZS */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-medium text-gray-900 text-sm">ZZZS</div>
                <div className="text-xs text-gray-500">Zdravstveno zavarovanje</div>
              </div>
              <div className="text-lg font-semibold text-gray-900">€{contrib.zzzs.toFixed(2)}</div>
            </div>
            {qrZZZS && <img src={qrZZZS} alt="QR ZZZS" className="w-full rounded-xl" />}
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="font-mono">SI56 0110 0888 1000 030</div>
              <div className="font-mono">SI19 {org?.tax_number} ZZ{monthStr}{yearShort}</div>
            </div>
          </div>
        </div>

        {/* Akontacija dohodnine */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="font-medium text-gray-900 text-sm">Akontacija dohodnine</div>
              <div className="text-xs text-gray-500">Opcijsko — samo če jo plačujete mesečno</div>
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <input
              type="number"
              value={akontacija}
              onChange={e => setAkontacija(e.target.value)}
              placeholder="0.00"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="flex items-center text-sm text-gray-500">€/mesec</span>
          </div>
          {qrAkontacija && akAmt > 0 && (
            <div>
              <img src={qrAkontacija} alt="QR Akontacija" className="w-40 rounded-xl mb-2" />
              <div className="space-y-1 text-xs text-gray-500">
                <div className="font-mono">SI56 0110 0888 1000 030</div>
                <div className="font-mono">SI19 {org?.tax_number} AK{monthStr}{yearShort}</div>
              </div>
            </div>
          )}
          {!akontacija && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
              💡 Preverite vašo FURS odločbo ali dohodninsko napoved — tam piše
              ali morate plačevati mesečno akontacijo in koliko.
            </div>
          )}
        </div>

        {/* Navodilo */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="font-medium text-blue-800 text-sm mb-2">Kako plačati s QR kodo</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            1. Odprite mobilno banko (NLB, SKB, Delavska hranilnica...)<br/>
            2. Izberite "Plačilo" → "Skeniraj QR"<br/>
            3. Skenirajte QR kodo — vsi podatki se samodejno izpolnijo<br/>
            4. Preverite znesek in potrdite plačilo<br/>
            5. Rok: do <strong>15. v mesecu</strong>
          </div>
        </div>

      </div>
    </div>
  )
}