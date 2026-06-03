'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import QRCode from 'qrcode'

const MONTHS_FULL = ['Januar','Februar','Marec','April','Maj','Junij',
                     'Julij','Avgust','September','Oktober','November','December']

function buildUPN(p: {
  payerName: string; payerAddress: string; payerCity: string;
  amount: number; iban: string; reference: string; description: string; dueDate: string;
}) {
  const amt = Math.round(p.amount * 100).toString().padStart(11, '0')
  const [y, m, d] = p.dueDate.split('-')
  const due = d + '.' + m + '.' + y
  const iban = p.iban.replace(/\s/g, '')
  const ref = p.reference.replace(/\s/g, '')
  return [
    'UPNQR',
    '',
    '',
    '',
    p.payerName,
    p.payerAddress,
    p.payerCity,
    amt,
    due,
    'OTHR',
    p.description,
    iban,
    ref,
    '',
    '',
    '',
  ].join('\n')
}) {
  const fmt = (s: string, len: number) => s.substring(0, len).padEnd(len, ' ')
  const amt = Math.round(p.amount * 100).toString().padStart(11, '0')
  return [
    'UPNQR',
    fmt('', 33), // payer IBAN (blank)
    'NaN',
    'NaN',
    fmt(p.payerName, 33),
    fmt(p.payerAddress, 33),
    fmt(p.payerCity, 33),
    amt,
    p.dueDate.replace(/-/g, ''),
    '',
    fmt(p.iban.replace(/\s/g, ''), 34),
    fmt(p.reference.replace(/\s/g, ''), 26),
    fmt(p.description, 42),
    '',
    '',
    '',
  ].join('\n')
}

export default function PrispevkiPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [akontacija, setAkontacija] = useState('')
  const [rates, setRates] = useState<any>(null)
  const [qrPIZ, setQrPIZ] = useState('')
  const [qrZZZS, setQrZZZS] = useState('')
  const [qrZaposlovanje, setQrZaposlovanje] = useState('')
  const [qrStarsevstvo, setQrStarsevstvo] = useState('')
  const [qrAkontacija, setQrAkontacija] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('organizations(*)').eq('user_id', user.id).single()
      if (member) {
        const o = (member as any).organizations
        setOrg(o)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!org) return
    setRates({
      piz: org.contrib_piz || 0,
      zzzs: org.contrib_zzzs || 0,
      zaposlovanje: org.contrib_zaposlovanje || 3.04,
      'starševo': org.contrib_starsevstvo || 3.04,
    })
    if (org.contrib_akontacija > 0) setAkontacija(String(org.contrib_akontacija))
  }, [org])

  useEffect(() => {
    if (org) generateQRs()
  }, [org, rates, selectedMonth, selectedYear, akontacija])

  async function generateQRs() {
    if (!org) return
    const contrib = rates || { piz: 0, zzzs: 0, zaposlovanje: 3.04, 'starševo': 3.04 }
    const monthStr = String(selectedMonth + 1).padStart(2, '0')
    const dueDate = `${selectedYear}-${monthStr}-15`
    const taxNum = (org.tax_number || '').replace('SI', '')
    const monthLabel = `${MONTHS_FULL[selectedMonth]} ${selectedYear}`
    const payer = {
      payerName: org.name || '',
      payerAddress: org.address || '',
      payerCity: `${org.post_code || ''} ${org.city || ''}`,
    }

    const pizUPN = buildUPN({ ...payer, amount: Number(contrib.piz),
      iban: 'SI56011008882000003', reference: `SI19${taxNum}-44008`,
      description: `Prispevki za PIZ ${monthLabel}`, dueDate })

    const zzzsUPN = buildUPN({ ...payer, amount: Number(contrib.zzzs),
      iban: 'SI56011008883000073', reference: `SI19${taxNum}-45004`,
      description: `Prispevki za zdravstvo ${monthLabel}`, dueDate })

    const zapoUPN = buildUPN({ ...payer, amount: Number(contrib.zaposlovanje || 3.04),
      iban: 'SI56011008881000030', reference: `SI19${taxNum}-42005`,
      description: `Prispevki za zaposlovanje ${monthLabel}`, dueDate })

    const starUPN = buildUPN({ ...payer, amount: Number((contrib as any)['starševo'] || 3.04),
      iban: 'SI56011008881000030', reference: `SI19${taxNum}-43001`,
      description: `Prispevki za staršev. varstvo ${monthLabel}`, dueDate })

    const [qr1, qr2, qr3, qr4] = await Promise.all([
      QRCode.toDataURL(pizUPN, { width: 200, margin: 1 }),
      QRCode.toDataURL(zzzsUPN, { width: 200, margin: 1 }),
      QRCode.toDataURL(zapoUPN, { width: 200, margin: 1 }),
      QRCode.toDataURL(starUPN, { width: 200, margin: 1 }),
    ])
    setQrPIZ(qr1); setQrZZZS(qr2); setQrZaposlovanje(qr3); setQrStarsevstvo(qr4)

    if (akontacija && parseFloat(akontacija) > 0) {
      const akUPN = buildUPN({ ...payer, amount: parseFloat(akontacija),
        iban: 'SI56011008881000030', reference: `SI19${taxNum}-40002`,
        description: `Akontacija dohodnine ${monthLabel}`, dueDate })
      const qr5 = await QRCode.toDataURL(akUPN, { width: 200, margin: 1 })
      setQrAkontacija(qr5)
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
  const contrib = rates || { piz: 0, zzzs: 0, zaposlovanje: 3.04, 'starševo': 3.04 }
  const monthStr = String(selectedMonth + 1).padStart(2, '0')
  const yearShort = String(selectedYear).slice(-2)
  const akAmt = parseFloat(akontacija) || 0
  const total = Number(contrib.piz) + Number(contrib.zzzs) + Number(contrib.zaposlovanje || 3.04) + Number((contrib as any)['starševo'] || 3.04) + akAmt

  const QRCard = ({ title, subtitle, amount, qr, iban, reference }: any) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-medium text-gray-900 text-sm">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
        </div>
        <div className="text-lg font-semibold text-gray-900">€{Number(amount).toFixed(2)}</div>
      </div>
      {qr && <img src={qr} alt={`QR ${title}`} className="w-full rounded-xl" />}
      {!qr && <div className="h-32 bg-gray-50 rounded-xl flex items-center justify-center text-xs text-gray-400">Generiranje...</div>}
      <div className="mt-3 space-y-1 text-xs text-gray-500">
        <div className="font-mono">{iban}</div>
        <div className="font-mono">{reference}</div>
      </div>
    </div>
  )

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
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-28">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            ⚠️ Rok plačila: <strong>15. {MONTHS_FULL[selectedMonth]} {selectedYear}</strong>
            &nbsp;·&nbsp; Prispevni razred {cc}
            &nbsp;·&nbsp; <Link href="/nastavitve" className="text-blue-600 underline">Spremenite v nastavitvah</Link>
          </div>
          {!rates && (
            <div className="mt-3 text-xs text-orange-600 bg-orange-50 rounded-xl p-3">
              ⚠️ Zneski za {selectedYear} niso nastavljeni. <Link href="/nastavitve" className="underline">Dodajte v nastavitvah</Link> ali kontaktirajte računovodjo.
            </div>
          )}
        </div>

        {/* Skupni znesek */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-6 text-white">
          <div className="text-sm text-gray-400 mb-1">Skupaj za plačilo ta mesec</div>
          <div className="text-4xl font-semibold">€{total.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-2">
            PIZ €{Number(contrib.piz).toFixed(2)} + ZZZS €{Number(contrib.zzzs).toFixed(2)} + Zaposl. €{Number(contrib.zaposlovanje || 3.04).toFixed(2)} + Starš. €{Number((contrib as any)['starševo'] || 3.04).toFixed(2)}
            {akAmt > 0 && ` + Akontacija €${akAmt.toFixed(2)}`}
          </div>
        </div>

        {/* QR nalogi */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <QRCard title="PIZ" subtitle="Pokojninsko zavarovanje"
            amount={contrib.piz} qr={qrPIZ}
            iban="SI56 0110 0888 2000 003"
            reference={`SI19 ${org?.tax_number?.replace('SI','')}-44008`} />
          <QRCard title="ZZZS" subtitle="Zdravstveno zavarovanje"
            amount={contrib.zzzs} qr={qrZZZS}
            iban="SI56 0110 0888 3000 073"
            reference={`SI19 ${org?.tax_number?.replace('SI','')}-45004`} />
          <QRCard title="Zaposlovanje" subtitle="Prispevek za zaposlovanje"
            amount={contrib.zaposlovanje || 3.04} qr={qrZaposlovanje}
            iban="SI56 0110 0888 1000 030"
            reference={`SI19 ${org?.tax_number?.replace('SI','')}-42005`} />
          <QRCard title="Starševsko varstvo" subtitle="Prispevek za starševstvo"
            amount={(contrib as any)['starševo'] || 3.04} qr={qrStarsevstvo}
            iban="SI56 0110 0888 1000 030"
            reference={`SI19 ${org?.tax_number?.replace('SI','')}-43001`} />
        </div>

        {/* Akontacija */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="font-medium text-gray-900 text-sm mb-1">Akontacija dohodnine</div>
          <div className="text-xs text-gray-500 mb-3">Opcijsko — samo če jo plačujete mesečno</div>
          <div className="flex gap-3 mb-3">
            <input type="number" value={akontacija} onChange={e => setAkontacija(e.target.value)}
              placeholder="0.00"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <span className="flex items-center text-sm text-gray-500">€/mesec</span>
          </div>
          {qrAkontacija && akAmt > 0 && (
            <div>
              <img src={qrAkontacija} alt="QR Akontacija" className="w-40 rounded-xl mb-2" />
              <div className="space-y-1 text-xs text-gray-500">
                <div className="font-mono">SI56 0110 0888 1000 030</div>
                <div className="font-mono">SI19 {org?.tax_number?.replace('SI','')}-40002</div>
              </div>
            </div>
          )}
          {!akontacija && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
              💡 Preverite vašo FURS odločbo — tam piše ali morate plačevati mesečno akontacijo in koliko.
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
