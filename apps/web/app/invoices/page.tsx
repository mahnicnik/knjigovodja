'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import SendInvoiceModal from '@/components/SendInvoiceModal'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { formatEurNumber } from '@/lib/format'
import PeriodFilter from '@/components/PeriodFilter'
import { type PeriodMode, getPeriodRange } from '@/lib/period-filter'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  // DODANO (11.8.2026): arhiviranje - storno racunov ni mogoce izbrisati
  // (zakonska hramba), a jih je mogoce skriti iz privzetega pogleda.
  const [showArchived, setShowArchived] = useState(false)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionInv, setActionInv] = useState<any>(null)

  // C12 (22.8.2026): meni "Vec" se ni zapiral na Esc, njegove vrstice pa so
  // segale cez sirino kartice - naslednji klik je zadel napacno moznost.
  // Med preizkusom je tako nenamerno nastal podvojen racun.
  useEffect(() => {
    if (!actionInv) return
    const naEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActionInv(null) }
    document.addEventListener('keydown', naEsc)
    return () => document.removeEventListener('keydown', naEsc)
  }, [actionInv])
  const [actionLoading, setActionLoading] = useState('')
  const [sendModalInv, setSendModalInv] = useState<any>(null)
  const [sendSuccess, setSendSuccess] = useState('')
  const [canCreate, setCanCreate] = useState(true)
  const supabase = createClient()

  // DODANO (Prelet 17, 17.8.2026): izbirnik obdobja za hitrejsi pregled,
  // ko racunov postane veliko. Glej lib/period-filter.ts.
  // POMEMBNO: privzeto 'all' (kot doslej) - NE 'month'. Zgornji seznam
  // sesteva "Neplacano" iz vseh racunov s statusom sent/overdue; ce bi bil
  // privzet ozji filter, bi stari neplacan racun tiho izginil iz pogleda
  // in bi ostal brez opomina. Filter je na voljo za hiter pregled, a ga
  // mora oseba izbrati sama.
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => { load() }, [periodMode, customFrom, customTo])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      // DODANO (17.8.2026): racunovodja ima vpogled v racune, ne pa pravice
      // ustvarjanja - brez tega bi videl gumb "+ Nov racun", ki bi ga
      // middleware zavrnil in vrgel nazaj (videti kot pokvarjen gumb).
      setCanCreate(!['accountant', 'viewer', 'cashier'].includes((member as any).role))
      const o = (member as any).organizations
      setOrg(o)
      const { from, to } = getPeriodRange(periodMode, customFrom, customTo)
      let query = supabase.from('issued_invoices').select('*').eq('org_id', o.id)
      if (from) query = query.gte('issue_date', from)
      if (to) query = query.lte('issue_date', to)
      const { data: inv } = await query.order('issue_date', { ascending: false })
      setInvoices(inv || [])
    }
    setLoading(false)
  }

  async function markPaid(inv: any) {
    setActionLoading('paid_' + inv.id)
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - racun je ostal
    // neplacan, uporabnik pa je videl, da je oznacen kot placan.
    const { error: paidErr } = await supabase.from('issued_invoices').update({ status: 'paid' }).eq('id', inv.id)
    if (paidErr) { alert('Računa ni bilo mogoče označiti kot plačanega: ' + paidErr.message); setActionLoading(''); return }
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function markSent(inv: any) {
    setActionLoading('sent_' + inv.id)
    const { error: sentErr } = await supabase.from('issued_invoices').update({ status: 'sent' }).eq('id', inv.id)
    if (sentErr) { alert('Računa ni bilo mogoče označiti kot poslanega: ' + sentErr.message); setActionLoading(''); return }
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function toggleArchive(inv: any, archive: boolean) {
    const { error: arcErr } = await supabase.from('issued_invoices').update({ archived: archive }).eq('id', inv.id)
    if (arcErr) { alert('Računa ni bilo mogoče arhivirati: ' + arcErr.message); return }
    await load()
  }

  async function storno(inv: any) {
    setActionLoading('storno_' + inv.id)
    const stornoNumber = `${inv.invoice_number}-S`
    const lineItems = (inv.line_items || []).map((item: any) => ({
      ...item,
      unit_price: -Math.abs(item.unit_price),
    }))
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - ce vstavljanje
    // kreditnega zapisa spodleti, se je izvirni racun VSEENO preklical, kar
    // pusti davcno evidenco v neskladju (preklican racun brez dobropisa).
    const { error: stornoInsErr } = await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: stornoNumber,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: lokalniDatum(),
      due_date: lokalniDatum(),
      line_items: lineItems,
      amount_net: -Math.abs(inv.amount_net),
      vat_amount: -Math.abs(inv.vat_amount),
      amount_total: -Math.abs(inv.amount_total),
      // POPRAVLJENO 11.8.2026: status 'storno' namesto 'sent' - ta
      // kreditni zapis ne cakа na placilo, mora biti izkljucen iz
      // totalSent/totalUnpaid izracunov (isti status kot original).
      status: 'cancelled', // POPRAVLJENO 11.8.2026 (NUJNO): 'storno' NI veljavna vrednost v bazi (CHECK constraint)!
      notes: `Storno računa ${inv.invoice_number}`,
      reference: `SI00 ${stornoNumber}`,
    })
    if (stornoInsErr) {
      alert('Storna ni bilo mogoče izvesti: ' + stornoInsErr.message + '\n\nIzvirni račun ostaja nespremenjen.')
      setActionLoading(''); return
    }
    const { error: stornoUpdErr } = await supabase.from('issued_invoices').update({ status: 'cancelled' }).eq('id', inv.id) // POPRAVLJENO 11.8.2026 (NUJNO)
    if (stornoUpdErr) alert('Kreditni zapis je nastal, izvirnega računa pa ni bilo mogoče preklicati: ' + stornoUpdErr.message)
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function dobropis(inv: any) {
    setActionLoading('dobropis_' + inv.id)
    const dobNumber = `${inv.invoice_number}-D`
    const { error: dobErr } = await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: dobNumber,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: lokalniDatum(),
      due_date: lokalniDatum(),
      line_items: inv.line_items || [],
      amount_net: -Math.abs(inv.amount_net),
      vat_amount: -Math.abs(inv.vat_amount),
      amount_total: -Math.abs(inv.amount_total),
      // POPRAVLJENO 11.8.2026: 'sent' bi (kot pri storno prej) vleklo
      // Neplacano v minus zaradi negativnega zneska - 'cancelled' izkljuci
      // iz totalSent/totalUnpaid izracunov, dosledno s storno logiko.
      status: 'cancelled',
      notes: `Dobropis za račun ${inv.invoice_number}`,
      reference: `SI00 ${dobNumber}`,
    })
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake.
    if (dobErr) { alert('Dobropisa ni bilo mogoče izdati: ' + dobErr.message); setActionLoading(''); return }
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function podvoji(inv: any) {
    // C10 (22.8.2026): podvajanje je bilo BREZ POTRDITVE, meni pa se ni zapiral
    // na Esc in je segal cez sirino kartice - en zgresen klik je ustvaril
    // osnutek z naslednjo zaporedno stevilko racuna. Tako je med preizkusom
    // nenamerno nastal racun 2026-003.
    if (!confirm(
      `Podvojim račun ${inv.invoice_number}?\n\n`
      + 'Nastal bo NOV osnutek z istimi postavkami in naslednjo zaporedno številko.'
    )) return
    setActionLoading('podvoji_' + inv.id)
    // POPRAVLJENO (30.7.2026, audit A4): prej parseInt('2026-015') -> 2026
    // (ustavi se pri pomisljaju), Math.max+1 -> podvojen racun je dobil
    // neveljavno stevilko "2027". Zdaj atomarna RPC, enaka kot /invoices/new.
    const { data: nextNumber } = await supabase.rpc('get_next_manual_invoice_number', {
      p_org_id: inv.org_id, p_year: new Date().getFullYear(),
    })
    const newNum = nextNumber || `${new Date().getFullYear()}-001`
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - podvojen racun ni
    // nastal, uporabnik pa je videl, da je operacija uspela.
    const { error: podvErr } = await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: newNum,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: lokalniDatum(),
      due_date: lokalniDatum(new Date(Date.now() + 30*24*60*60*1000)),
      line_items: inv.line_items || [],
      amount_net: inv.amount_net,
      vat_amount: inv.vat_amount,
      amount_total: inv.amount_total,
      status: 'draft',
      notes: inv.notes,
      reference: `SI00 ${newNum}`,
    })
    if (podvErr) { alert('Računa ni bilo mogoče podvojiti: ' + podvErr.message); setActionLoading(''); return }
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function downloadPDF(inv: any) {
    try {
      const res = await fetch(`/api/racunovodja/invoice-pdf?id=${inv.id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Napaka pri generiranju racuna')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Napaka pri prenosu racuna: ' + e.message)
    }
  }

  // POPRAVLJENO (24.7.2026): "sent" v bazi pomeni samo "izdan zapis" - e-mail
  // je dejansko poslan sele, ko je last_email_sent_at izpolnjen (locen korak
  // prek SendInvoiceModal). Prikaz zdaj loci ta dva primera, da ne zavaja.
  function statusLabel(status: string, lastEmailSentAt?: string | null) {
    switch(status) {
      case 'paid': return { label: 'Plačano', color: '#27500A', bg: '#EAF3DE' }
      case 'sent':
        return lastEmailSentAt
          ? { label: 'Poslano', color: '#854F0B', bg: '#FAEEDA' }
          : { label: 'Izdano', color: '#1E4E8C', bg: '#E6EEF7' }
      case 'overdue': return { label: 'Zamuda', color: '#A32D2D', bg: '#FCEBEB' }
      case 'cancelled': return { label: 'Storno', color: '#555', bg: '#eee' } // POPRAVLJENO 11.8.2026: 'storno' -> 'cancelled' (prava vrednost baze)
      case 'draft': return { label: 'Osnutek', color: '#888', bg: '#F7F6F2' }
      default: return { label: status, color: '#888', bg: '#F7F6F2' }
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const totalSent = invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount_total), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount_total), 0)
  const isFree = !['pro', 'pro_pos'].includes(org?.subscription_status)
  const invoiceCount = invoices.length
  const atLimit = isFree && invoiceCount >= 5
  const totalUnpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount_total), 0)

  // DODANO (16.8.2026): zaznavanje VRZELI v zaporedju stevilk racunov.
  // Stevilcenje mora biti zaporedno in brez vrzeli; manjkajoca stevilka je
  // lahko posledica izbrisanega osnutka ali neuspesne izdaje. Vrzel sama po
  // sebi ni prekrsek, a jo je treba znati pojasniti - zato naj bo vidna
  // TAKOJ, ne sele ob davcnem pregledu.
  const vrzeli = (() => {
    const leto = new Date().getFullYear()
    const stevilke = invoices
      .map(i => String(i.invoice_number || ''))
      .filter(s => new RegExp(`^${leto}-[0-9]+$`).test(s))
      .map(s => parseInt(s.split('-')[1], 10))
      .sort((a, b) => a - b)
    if (stevilke.length < 2) return []
    const manjka: number[] = []
    for (let x = stevilke[0]; x <= stevilke[stevilke.length - 1]; x++) {
      if (!stevilke.includes(x)) manjka.push(x)
    }
    return manjka
  })()

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="font-semibold text-gray-900 mt-0.5">Izdani računi</h1>
          {vrzeli.length > 0 && (
            <div style={{ fontSize: 12, color: '#8a6d1f', background: '#FDF6E3', border: '0.5px solid #E8D9A8', borderRadius: 8, padding: '6px 10px', marginTop: 6, lineHeight: 1.5 }}>
              V zaporedju številk manjka {vrzeli.length === 1 ? 'številka' : 'jih'}: <b>{vrzeli.map(v => `${new Date().getFullYear()}-${String(v).padStart(3, '0')}`).join(', ')}</b>
              {' · '}Vrzel je običajno posledica izbrisanega osnutka. Za davčni pregled jo je dobro znati pojasniti.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isFree && (
            <div style={{ fontSize: 12, color: atLimit ? '#dc2626' : '#888', background: atLimit ? '#fef2f2' : '#f3f4f6', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
              {invoiceCount}/5 računov
            </div>
          )}
          {atLimit ? (
            <a href="/nastavitve#narocnina" style={{ background: '#1D9E75', color: '#fff', padding: '8px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              Nadgradi →
            </a>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/invoices/import" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium">
                Uvozi iz PDF
              </Link>
              {canCreate && (
                <Link href="/invoices/new" className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
                  + Nov račun
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <PeriodFilter
            mode={periodMode}
            onModeChange={setPeriodMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupaj fakturirano</div>
            <div className="text-xl font-semibold">€{formatEurNumber(totalSent)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Plačano</div>
            <div className="text-xl font-semibold text-green-600">€{formatEurNumber(totalPaid)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Neplačano</div>
            <div className="text-xl font-semibold text-orange-500">€{formatEurNumber(totalUnpaid)}</div>
          </div>
        </div>

        {invoices.some(inv => inv.archived) && (
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <button onClick={() => setShowArchived(s => !s)} style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {showArchived ? 'Skrij arhivirane' : `Prikazi arhivirane (${invoices.filter(inv => inv.archived).length})`}
            </button>
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni računov</h3>
            <p className="text-gray-500 text-sm mb-6">{canCreate ? 'Ustvarite prvi račun in ga pošljite stranki' : 'V izbranem obdobju ni računov'}</p>
            {canCreate && (
              <Link href="/invoices/new" className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
                + Ustvari prvi račun
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {invoices.filter(inv => showArchived || !inv.archived).map((inv, i) => {
              const s = statusLabel(inv.status, inv.last_email_sent_at)
              return (
                <div key={inv.id} className={`flex items-center flex-wrap gap-4 px-6 py-4 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-[100px]">
                    <div className="font-medium text-sm text-gray-900 truncate">{inv.client_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      #{inv.invoice_number} · {new Date(inv.issue_date).toLocaleDateString('sl-SI')}
                    </div>
                  </div>
                  <div className="text-right mr-2 flex-shrink-0">
                    <div className="font-semibold text-sm">€{formatEurNumber(Number(inv.amount_total))}</div>
                    <div style={{ fontSize: '10px', marginTop: '2px', padding: '2px 8px', borderRadius: '20px', background: s.bg, color: s.color, display: 'inline-block', fontWeight: '500' }}>
                      {s.label}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => downloadPDF(inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ⬇ PDF
                    </button>
                    {inv.status !== 'cancelled' && (
                      isFree ? (
                        <a href="/nastavitve#narocnina" style={{ border: '1px solid #d1d5db', background: '#f9fafb', color: '#9ca3af', borderRadius: 12, padding: '6px 12px', fontSize: 12, textDecoration: 'none', cursor: 'pointer' }} title="Nadgradi na Pro za email pošiljanje">
                          🔒 Pošlji
                        </a>
                      ) : (
                        <button
                          onClick={() => setSendModalInv(inv)}
                          className="border border-gray-900 bg-gray-900 text-white rounded-xl px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors"
                        >
                          📧 Pošlji
                        </button>
                      )
                    )}
                    {/* UJP gumb ODSTRANJEN (24.7.2026): po pregledu uradne UJP
                        dokumentacije portal UJPeRacun ne sprejema nalozenih/generiranih
                        XML datotek - edina pot je rocni vnos prek spletnega obrazca na
                        eracuni.ujp.gov.si s pravim kvalificiranim potrdilom (TaxCA ni
                        veljaven za prijavo). Koda v api/invoices/[id]/ujp ostaja kot
                        referenca za morebitno kasnejso pravilno implementacijo. */}
                    <button
                      onClick={() => setActionInv(actionInv?.id === inv.id ? null : inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ··· Več
                    </button>
                  </div>

                  {actionInv?.id === inv.id && (
                    <div style={{
                      position: 'absolute', right: '24px', marginTop: '80px',
                      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                      borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      zIndex: 100, minWidth: '180px', overflow: 'hidden',
                    }}>
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                        <button
                          onClick={() => markPaid(inv)}
                          disabled={actionLoading === 'paid_' + inv.id}
                          style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                          className="hover:bg-gray-50"
                        >
                          ✅ Označi kot plačano
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <button
                          onClick={() => markSent(inv)}
                          style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                          className="hover:bg-gray-50"
                        >
                          ↩ Razveljavi plačilo
                        </button>
                      )}
                      <button
                        onClick={() => window.location.href = '/invoices/edit/' + inv.id}
                        style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="hover:bg-gray-50"
                      >
                        ✏️ Uredi račun
                      </button>
                      <button
                        onClick={() => podvoji(inv)}
                        disabled={actionLoading === 'podvoji_' + inv.id}
                        style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="hover:bg-gray-50"
                      >
                        📋 Podvoji račun
                      </button>
                      {inv.status !== 'cancelled' && !inv.invoice_number?.includes('-S') && !inv.invoice_number?.includes('-D') && (
                        <>
                          <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                          <button
                            onClick={() => dobropis(inv)}
                            disabled={actionLoading === 'dobropis_' + inv.id}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-gray-50"
                          >
                            📝 Izdaj dobropis
                          </button>
                          <button
                            onClick={() => storno(inv)}
                            disabled={actionLoading === 'storno_' + inv.id}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-red-50"
                          >
                            🚫 Storniraj račun
                          </button>
                        </>
                      )}
                      {/* DODANO (11.8.2026): arhiviranje - za storno racune
                          in njihove -S/-D zapise, ki jih ni mogoce izbrisati. */}
                      {(inv.status === 'cancelled' || inv.invoice_number?.includes('-S') || inv.invoice_number?.includes('-D')) && (
                        <>
                          <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                          <button
                            onClick={() => toggleArchive(inv, !inv.archived)}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-gray-50"
                          >
                            {inv.archived ? '📤 Obnovi iz arhiva' : '📥 Arhiviraj'}
                          </button>
                        </>
                      )}
                      {/* POPRAVLJENO (13.8.2026): brisanje je dovoljeno za
                          osnutke IN storno racune, ki NISO bili dejansko
                          davcno potrjeni (brez zoi/eor, ali DEMO- koda iz
                          sandbox nacina). Po ZDDV-1/ZDavP-2 velja 10-letna
                          hramba SAMO za DEJANSKO fiskalizirane racune - ce
                          racun nikoli ni bil resnicno potrjen pri FURS,
                          hramba se ne uporablja. */}
                      {(() => {
                        const neverFiscalized = !inv.zoi || inv.zoi.startsWith('DEMO-')
                        const canDelete = neverFiscalized && (inv.status === 'draft' || inv.status === 'cancelled')
                        if (!canDelete) {
                          return (
                            <>
                              <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                              <div style={{ padding: '8px 16px', fontSize: '11px', color: '#888', lineHeight: 1.5 }}>
                                🔒 Izdanega računa ni dovoljeno izbrisati (zakonska hramba 10 let).
                                {inv.status !== 'cancelled' ? ' Za popravek uporabite Storniraj račun.' : ''}
                              </div>
                            </>
                          )
                        }
                        return (
                          <>
                            <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                            <button
                              onClick={async () => {
                                const label = inv.status === 'cancelled' ? 'ta storniran račun (in pripadajoč kreditni zapis)' : 'ta osnutek'
                                if (!confirm(`Resnično izbrišem ${label}? To dejanje je nepovrnjivo.`)) return
                                // Pocisti tudi povezan par (-S/-D <-> original), ce obstaja
                                const base = inv.invoice_number?.replace(/-S$|-D$/, '')
                                if (!base) { alert('Računa brez številke ni mogoče izbrisati.'); return }
                                // POPRAVLJENO (16.8.2026, PRAVNO): brisanje je odstranilo VSE
                                // tri zapise (izvirnik + -S + -D) na podlagi preverbe SAMO
                                // kliknjenega. Ce si kliknil kreditni zapis (nikoli
                                // fiskaliziran), se je izbrisal tudi IZVIRNIK, ki je lahko
                                // DAVCNO POTRJEN - te po zakonu ni dovoljeno brisati (hramba
                                // 10 let). Zdaj preverimo vsak zapis posebej.
                                const { data: povezani, error: fetchErr } = await supabase
                                  .from('issued_invoices')
                                  .select('id, invoice_number, zoi')
                                  .eq('org_id', inv.org_id)
                                  .or(`invoice_number.eq.${base},invoice_number.eq.${base}-S,invoice_number.eq.${base}-D`)
                                if (fetchErr) { alert('Napaka pri branju povezanih računov: ' + fetchErr.message); return }
                                const fiskalizirani = (povezani || []).filter((r: any) => r.zoi && !String(r.zoi).startsWith('DEMO-'))
                                if (fiskalizirani.length > 0) {
                                  alert(`Brisanje ni mogoče: račun ${fiskalizirani.map((r: any) => r.invoice_number).join(', ')} je davčno potrjen pri FURS (zakonska hramba 10 let).`)
                                  return
                                }
                                const { error: delErr } = await supabase
                                  .from('issued_invoices')
                                  .delete()
                                  .in('id', (povezani || []).map((r: any) => r.id))
                                if (delErr) { alert('Računa ni bilo mogoče izbrisati: ' + delErr.message); return }
                                setActionInv(null)
                                load()
                              }}
                              style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                              className="hover:bg-red-50"
                            >
                              🗑️ {inv.status === 'cancelled' ? 'Izbriši storniran račun' : 'Izbriši osnutek'}
                            </button>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {actionInv && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setActionInv(null)}
        />
      )}

      {sendModalInv && (
        <SendInvoiceModal
          invoice={sendModalInv}
          orgName={org?.name || ''}
          onClose={() => setSendModalInv(null)}
          onSent={() => {
            setSendModalInv(null)
            setSendSuccess(`Račun #${sendModalInv.invoice_number} uspešno poslan na ${sendModalInv.client_email || 'stranko'}`)
            load()
            setTimeout(() => setSendSuccess(''), 5000)
          }}
        />
      )}

      {sendSuccess && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#0D1F12', color: '#fff', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', zIndex: 1001, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: '360px' }}>
          ✅ {sendSuccess}
        </div>
      )}
    </div>
    </AppLayout>
  )
}