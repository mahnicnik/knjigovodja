'use client'

import { useEffect, useState } from 'react'
import { escapeHtml } from '@/lib/html-escape'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import { LEGAL_DEFAULT_INTEREST_RATE, legalInterestRateOn , lokalniDatum} from '@/lib/tax-constants'
import AppLayout from '@/components/AppLayout'

// POPRAVLJENO (30.7.2026): prej trdo kodirana 11% - napacna za oba dela
// 2026 (10,15% / 10,40%). Zdaj iz lib/tax-constants.ts, kjer je jasno
// oznaceno, da se ta mera uskladi DVAKRAT LETNO.
const LEGAL_INTEREST_RATE = LEGAL_DEFAULT_INTEREST_RATE

function calcInterest(amount: number, dueDateStr: string): number {
  // POPRAVLJENO (16.8.2026): dva popravka.
  // 1) Prej ena sama obrestna mera za celotno zamudo. Mera se spremeni vsako
  //    polletje (10,15% do 30.6.2026, 10,40% od 1.7.2026), zato je treba vsak
  //    dan obracunati po meri, ki je veljala TISTI dan.
  // 2) Dodana omejitev po 376. clenu Obligacijskega zakonika (ultra alterum
  //    tantum): obresti nehajo teci, ko njihova vsota doseze glavnico. Prej
  //    so rasle neomejeno, kar bi pri dolgih zamudah pomenilo previsok zahtevek.
  const dueDate = new Date(dueDateStr)
  const today = new Date()
  if (today <= dueDate) return 0

  let obresti = 0
  const dan = new Date(dueDate)
  dan.setDate(dan.getDate() + 1) // obresti tecejo od PRVEGA dne po zapadlosti
  while (dan <= today) {
    obresti += amount * legalInterestRateOn(dan) / 365
    if (obresti >= amount) return Math.round(amount * 100) / 100
    dan.setDate(dan.getDate() + 1)
  }
  return Math.round(obresti * 100) / 100
}

function daysOverdue(dueDateStr: string): number {
  const dueDate = new Date(dueDateStr)
  const today = new Date()
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
}

export default function OpomnikPage() {
  const [org, setOrg] = useState<any>(null)
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const today = lokalniDatum()
      const { data } = await supabase
        .from('issued_invoices')
        .select('*')
        .eq('org_id', o.id)
        .eq('status', 'sent')
        // DODANO (16.8.2026): brez tega bi lahko stranka prejela opomin za
        // racun iz peskovnika (DEMO fiskalizacija), ki ni pravi.
        .or('zoi.is.null,zoi.not.like.DEMO-%')
        .lt('due_date', today)
        .order('due_date', { ascending: true })
      setOverdueInvoices(data || [])
    }
    setLoading(false)
  }

  function generateOpomnik(inv: any, level: 1 | 2 | 3): string {
    const interest = calcInterest(Number(inv.amount_total), inv.due_date)
    const days = daysOverdue(inv.due_date)
    const total = Number(inv.amount_total) + interest

    const levels = {
      1: {
        title: 'PLAČILNI OPOMNIK',
        tone: 'Spoštovani,\n\nopažamo, da račun še ni bil poravnan. Morda je prišlo do pozabe ali tehničnih težav. Prosimo vas, da poravnate obveznost v najkrajšem možnem času.',
        urgency: 'Prosimo za plačilo v roku 8 dni.',
      },
      2: {
        title: 'DRUGI OPOMNIK — NEPLAČAN RAČUN',
        tone: 'Spoštovani,\n\nkljub prvemu opominu račun še vedno ni poravnan. Opozarjamo vas, da ste v zamudi in da zaračunavamo zakonske zamudne obresti.',
        urgency: 'Zahtevamo plačilo v roku 5 dni, sicer bomo primorani ukrepati pravno.',
      },
      3: {
        title: 'ZADNJI OPOMNIK PRED PRAVNIM UKREPANJEM',
        tone: 'Spoštovani,\n\nkljub večkratnim opominom račun ni bil poravnan. Obveznost bomo predali izterjavi oziroma vložili predlog za izvršbo pri pristojnem sodišču.',
        urgency: 'Zadnji rok za plačilo: 3 dni od prejema tega opomnika.',
      },
    }

    const l = levels[level]

    return `${l.title}

Izdajatelj: ${escapeHtml(org.name)}
Davčna številka: ${org.tax_number}
${org.address || ''}, ${org.post_code || ''} ${org.city || ''}

Prejemnik: ${inv.client_name}
${inv.client_email ? `E-pošta: ${inv.client_email}` : ''}

─────────────────────────────────────

Račun številka: ${inv.invoice_number}
Datum računa: ${new Date(inv.issue_date).toLocaleDateString('sl-SI')}
Rok plačila: ${(inv.due_date ? new Date(inv.due_date).toLocaleDateString('sl-SI') : '—')}
Dni v zamudi: ${days} dni

─────────────────────────────────────

ZNESEK RAČUNA:          €${Number(inv.amount_total).toFixed(2)}
Zamudne obresti (${(LEGAL_INTEREST_RATE * 100).toFixed(0)}%/leto, ${days} dni):  €${interest.toFixed(2)}
─────────────────────────────────────
SKUPAJ ZA PLAČILO:      €${total.toFixed(2)}

─────────────────────────────────────

${l.tone}

${l.urgency}

Plačilni podatki:
TRR: ${org.iban || ''}
Sklic: ${inv.reference || `SI00 ${inv.invoice_number}`}
Namen: Plačilo računa ${inv.invoice_number}
Znesek: €${total.toFixed(2)}

─────────────────────────────────────

V primeru že izvedenega plačila prosimo, da sporočilo prezrete.

S spoštovanjem,
${escapeHtml(org.name)}
${org.email || ''}
${org.phone || ''}`
  }

  function downloadOpomnik(inv: any, level: 1 | 2 | 3) {
    const text = generateOpomnik(inv, level)
    const interest = calcInterest(Number(inv.amount_total), inv.due_date)
    const days = daysOverdue(inv.due_date)
    const total = Number(inv.amount_total) + interest

    const html = `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 30px 40px; max-width: 600px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .company { font-size: 16px; font-weight: bold; }
  .company-info { font-size: 10px; color: #666; margin-top: 4px; line-height: 1.6; }
  .title { font-size: 18px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background: ${level === 3 ? '#fee2e2' : level === 2 ? '#fff7ed' : '#f9fafb'}; border-radius: 6px; color: ${level === 3 ? '#991b1b' : level === 2 ? '#9a3412' : '#111'}; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 12px 0; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
  .total { font-size: 14px; font-weight: bold; background: #111; color: white; padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; margin: 8px 0; }
  .payment { background: #f9fafb; padding: 12px; border-radius: 6px; margin: 12px 0; }
  .payment .label { font-size: 9px; color: #666; text-transform: uppercase; margin-bottom: 6px; }
  .warning { background: ${level === 3 ? '#fee2e2' : level === 2 ? '#fff7ed' : '#f0fdf4'}; padding: 10px 12px; border-radius: 6px; font-size: 10px; margin: 12px 0; line-height: 1.6; color: ${level === 3 ? '#7f1d1d' : level === 2 ? '#7c2d12' : '#14532d'}; }
  .footer { margin-top: 24px; font-size: 9px; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">${escapeHtml(org.name)}</div>
    <div class="company-info">
      ${org.address || ''}<br>
      ${org.post_code || ''} ${org.city || ''}<br>
      Davčna: ${org.tax_number}<br>
      ${org.iban ? `TRR: ${org.iban}` : ''}
    </div>
  </div>
  <div style="text-align:right;font-size:10px;color:#666">
    Datum: ${new Date().toLocaleDateString('sl-SI')}<br>
    Opomnik za: ${inv.client_name}
  </div>
</div>

<div class="title">${level === 1 ? '📄 PLAČILNI OPOMNIK' : level === 2 ? '⚠️ DRUGI OPOMNIK' : '🚨 ZADNJI OPOMNIK'}</div>

<div class="row"><span style="color:#666">Račun številka:</span><span><strong>${inv.invoice_number}</strong></span></div>
<div class="row"><span style="color:#666">Datum računa:</span><span>${new Date(inv.issue_date).toLocaleDateString('sl-SI')}</span></div>
<div class="row"><span style="color:#666">Rok plačila:</span><span style="color:#dc2626">${inv.due_date ? new Date(inv.due_date).toLocaleDateString('sl-SI') : '—'}</span></div>
<div class="row"><span style="color:#666">Dni v zamudi:</span><span style="color:#dc2626;font-weight:bold">${days} dni</span></div>
<hr>
<div class="row"><span>Znesek računa:</span><span>€${Number(inv.amount_total).toFixed(2)}</span></div>
<div class="row"><span>Zamudne obresti (${(LEGAL_INTEREST_RATE * 100).toFixed(0)}%/leto, ${days} dni):</span><span>€${interest.toFixed(2)}</span></div>
<div class="total"><span>SKUPAJ ZA PLAČILO:</span><span>€${total.toFixed(2)}</span></div>

<div class="warning">
  ${level === 1 ? '🟢 Opažamo, da račun še ni bil poravnan. Prosimo vas, da poravnate obveznost v roku 8 dni. V primeru že izvedenega plačila prosimo, da opomnik prezrete.' :
    level === 2 ? '🟠 Kljub prvemu opominu račun še vedno ni poravnan. Zahtevamo plačilo v roku 5 dni, sicer bomo primorani ukrepati pravno in predati terjatev izterjavi.' :
    '🔴 Kljub večkratnim opominom račun ni bil poravnan. Obveznost bomo v 3 dneh predali izterjavi oziroma vložili predlog za izvršbo pri pristojnem sodišču.'}
</div>

<div class="payment">
  <div class="label">Plačilni podatki</div>
  <div class="row"><span style="color:#666">TRR:</span><span style="font-family:monospace">${org.iban || ''}</span></div>
  <div class="row"><span style="color:#666">Sklic:</span><span style="font-family:monospace">${inv.reference || `SI00 ${inv.invoice_number}`}</span></div>
  <div class="row"><span style="color:#666">Namen:</span><span>Plačilo računa ${inv.invoice_number}</span></div>
  <div class="row"><span style="color:#666">Znesek:</span><span><strong>€${total.toFixed(2)}</strong></span></div>
</div>

<div class="footer">
  ${escapeHtml(org.name)} · ${org.email || ''} · ${org.phone || ''}<br>
  Zamudne obresti obračunane po zakonski stopnji TOM+8% (ZOR člen 277)
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  async function markAsPaid(invId: string) {
    // POPRAVLJENO (17.8.2026): prej brez preverbe - racun je ostal neplacan,
    // z zaslona pa je izginil, ker se seznam osvezi ne glede na izid.
    const { error: paidErr } = await supabase.from('issued_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invId)
    load()
  }

  const totalOverdue = overdueInvoices.reduce((s, i) => s + Number(i.amount_total), 0)
  const totalInterest = overdueInvoices.reduce((s, i) => s + calcInterest(Number(i.amount_total), i.due_date), 0)

  if (loading) return (
    <AppLayout>
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
    </AppLayout>
  )

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
        <h1 className="font-semibold text-gray-900 mt-0.5">Opomniki za zamude</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Povzetek */}
        {overdueInvoices.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 rounded-2xl border border-red-100 p-5">
              <div className="text-xs text-red-600 mb-1">Zamujenih računov</div>
              <div className="text-2xl font-semibold text-red-700">{overdueInvoices.length}</div>
            </div>
            <div className="bg-orange-50 rounded-2xl border border-orange-100 p-5">
              <div className="text-xs text-orange-600 mb-1">Skupaj dolg</div>
              <div className="text-2xl font-semibold text-orange-700">€{totalOverdue.toFixed(2)}</div>
            </div>
            <div className="bg-yellow-50 rounded-2xl border border-yellow-100 p-5">
              <div className="text-xs text-yellow-700 mb-1">Zamudne obresti ({(LEGAL_INTEREST_RATE*100).toFixed(0)}%/leto)</div>
              <div className="text-2xl font-semibold text-yellow-700">€{totalInterest.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-1">⚖️ Zakonske zamudne obresti</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            Po slovenskem pravu (ZOR člen 277) imate pravico zaračunati zamudne obresti po stopnji
            <strong> TOM + 8%</strong> letno (trenutno ~{(LEGAL_INTEREST_RATE*100).toFixed(0)}%) od dneva zapadlosti.
            Pošljite opomnik 1, 2 ali 3 — od 3. opomnika naprej je stranka formalno opozorjena pred tožbo.
          </div>
        </div>

        {overdueInvoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="font-semibold text-gray-900 mb-2">Vsi računi so plačani!</h3>
            <p className="text-gray-500 text-sm">Ni zamujenih računov — odlično!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {overdueInvoices.map(inv => {
              const days = daysOverdue(inv.due_date)
              const interest = calcInterest(Number(inv.amount_total), inv.due_date)
              const total = Number(inv.amount_total) + interest
              const level = days > 30 ? 3 : days > 14 ? 2 : 1

              return (
                <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{inv.client_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        #{inv.invoice_number} · Rok bil: {inv.due_date ? new Date(inv.due_date).toLocaleDateString('sl-SI') : '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        days > 30 ? 'bg-red-100 text-red-700' :
                        days > 14 ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {days} dni zamude
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">Znesek računa</div>
                      <div className="font-semibold">€{Number(inv.amount_total).toFixed(2)}</div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-orange-600 mb-1">Zamudne obresti</div>
                      <div className="font-semibold text-orange-700">€{interest.toFixed(2)}</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-red-600 mb-1">Skupaj za plačilo</div>
                      <div className="font-semibold text-red-700">€{total.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Opomnik gumbi */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => downloadOpomnik(inv, 1)}
                      className="flex-1 border border-gray-200 rounded-xl py-2 text-xs text-gray-600 hover:bg-gray-50">
                      📄 Opomnik 1
                    </button>
                    <button onClick={() => downloadOpomnik(inv, 2)}
                      className="flex-1 border border-orange-200 rounded-xl py-2 text-xs text-orange-600 hover:bg-orange-50">
                      ⚠️ Opomnik 2
                    </button>
                    <button onClick={() => downloadOpomnik(inv, 3)}
                      className="flex-1 border border-red-200 rounded-xl py-2 text-xs text-red-600 hover:bg-red-50">
                      🚨 Opomnik 3
                    </button>
                    <button onClick={() => markAsPaid(inv.id)}
                      className="flex-1 bg-green-600 text-white rounded-xl py-2 text-xs font-medium hover:bg-green-500">
                      ✓ Označim plačano
                    </button>
                  </div>

                  {days > 30 && (
                    <div className="mt-3 bg-red-50 rounded-xl p-3 text-xs text-red-700">
                      🚨 Račun je {days} dni v zamudi — priporočamo 3. opomnik in predajo izterjavi!
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}