'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getActiveMembership } from '@/lib/active-org'
import { formatEurNumber } from '@/lib/format'
import AppLayout from '@/components/AppLayout'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  discount_pct: number
  amount_net: number
  vat_amount: number
}

export default function NewQuotePage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [saving, setSaving] = useState(false)

  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientTax, setClientTax] = useState('')
  const [issueDate, setIssueDate] = useState(lokalniDatum())
  const [validUntil, setValidUntil] = useState(lokalniDatum(new Date(Date.now() + 30 * 864e5)))
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, vat_rate: 0, discount_pct: 0, amount_net: 0, vat_amount: 0 }
  ])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)
      const { data: org } = await supabase.from('organizations').select('vat_registered').eq('id', member.org_id).single()
      setIsVatRegistered(org?.vat_registered ?? false)
      // POPRAVLJENO (30.7.2026): ne prepisuj CELOTNEGA items polja - to je
      // brisalo uporabnikov vnos, ce je zacel tipkati PREDEN se je ta
      // pocasnejsa veriga (3 zaporedni klici) zakljucila. Zdaj samo
      // POSODOBI vat_rate na obstojecih vrsticah, ohrani vse ostalo.
      if (org?.vat_registered) {
        setItems(prev => prev.map(item =>
          item.quantity === 1 && item.unit_price === 0 && item.description === ''
            ? { ...item, vat_rate: 22 }
            : item
        ))
      }
    }
    load()
  }, [router, supabase])

  function updateItem(i: number, field: keyof LineItem, val: any) {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: val }
      const net = updated.quantity * updated.unit_price * (1 - (updated.discount_pct || 0) / 100)
      const vat = net * (updated.vat_rate / 100)
      return { ...updated, amount_net: Math.round(net * 100) / 100, vat_amount: Math.round(vat * 100) / 100 }
    }))
  }

  function addItem() {
    setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, vat_rate: isVatRegistered ? 22 : 0, discount_pct: 0, amount_net: 0, vat_amount: 0 }])
  }

  function removeItem(i: number) {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const amountNet = items.reduce((s, i) => s + i.amount_net, 0)
  const vatAmount = items.reduce((s, i) => s + i.vat_amount, 0)
  const amountTotal = amountNet + vatAmount

  async function save() {
    if (!orgId || !clientName.trim()) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const year = new Date().getFullYear()
      const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('org_id', orgId).like('quote_number', `PRE-${year}-%`)
      const seq = String((count ?? 0) + 1).padStart(4, '0')
      const quoteNumber = `PRE-${year}-${seq}`

      // POPRAVLJENO (16.8.2026): prej brez preverbe - predracun se ni shranil,
    // uporabnik pa je bil preusmerjen, kot da je uspelo.
    const { error: quoteErr } = await supabase.from('quotes').insert({
        org_id: orgId,
        quote_number: quoteNumber,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        client_address: clientAddress.trim() || null,
        client_tax_number: clientTax.trim() || null,
        issue_date: issueDate,
        valid_until: validUntil,
        line_items: items,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        notes: notes.trim() || null,
        status: 'draft',
      })
      if (quoteErr) throw new Error('Predračuna ni bilo mogoče shraniti: ' + quoteErr.message)
      router.push('/predracuni')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }

  return (
    <AppLayout>
    {/* DODANO (25.8.2026): stran je imela LASTNO postavitev cez cel zaslon,
        brez menija. Do nje prides iz seznama, torej se je navigacija izgubila
        sredi dela - enako, kot je bilo pri integracijah. */}

    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => router.push('/predracuni')} style={{ background: 'none', border: 0, color: '#888', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>← Nazaj</button>
          <h1 style={{ fontSize: 24, fontWeight: 500, color: '#0D1F12', margin: 0 }}>Nov predračun</h1>
        </div>

        {/* Stranka */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 }}>Stranka</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime stranke *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Podjetje d.o.o." style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="info@podjetje.si" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Naslov</label>
              <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Ulica 1, 1000 Ljubljana" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Davčna številka</label>
              <input value={clientTax} onChange={e => setClientTax(e.target.value)} placeholder="SI12345678" style={inp} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum predračuna</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Veljavno do</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* Postavke */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 }}>Postavke</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px 70px 70px 90px 32px', gap: 8, alignItems: 'center' }}>
                <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Opis storitve" style={{ ...inp, fontSize: 12 }} />
                <input type="number" onFocus={e => e.target.select()} value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} style={{ ...inp, fontSize: 12, textAlign: 'right' }} />
                <input type="number" onFocus={e => e.target.select()} step="0.01" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} placeholder="0.00" style={{ ...inp, fontSize: 12, textAlign: 'right' }} />
                <input type="number" onFocus={e => e.target.select()} min={0} max={100} value={item.discount_pct || 0} onChange={e => updateItem(i, 'discount_pct', Number(e.target.value))} placeholder="0%" style={{ ...inp, fontSize: 12, textAlign: 'right' }} title="Popust %" />
                <select value={item.vat_rate} onChange={e => updateItem(i, 'vat_rate', Number(e.target.value))} style={{ ...inp, fontSize: 12 }}>
                  <option value={0}>0%</option>
                  <option value={9.5}>9.5%</option>
                  <option value={22}>22%</option>
                </select>
                <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: '#0D1F12' }}>€{formatEurNumber((item.amount_net + item.vat_amount))}</div>
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 18, padding: 4 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, fontSize: 11, color: '#888', marginBottom: 4 }}>
            <span style={{ flex: 2 }}>Opis</span>
            <span style={{ width: 80, textAlign: 'right' }}>Kol.</span>
            <span style={{ width: 100, textAlign: 'right' }}>Cena/enoto</span>
            <span style={{ width: 80, textAlign: 'right' }}>DDV</span>
            <span style={{ width: 100, textAlign: 'right' }}>Skupaj</span>
            <span style={{ width: 32 }} />
          </div>
          <button onClick={addItem} style={{ marginTop: 12, background: '#F7F6F2', border: '0.5px dashed rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: '#666' }}>+ Dodaj postavko</button>

          {/* Skupaj */}
          <div style={{ marginTop: 20, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16 }}>
            {isVatRegistered && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 4 }}>
                  <span>Neto</span><span>€{formatEurNumber(amountNet)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 8 }}>
                  <span>DDV</span><span>€{formatEurNumber(vatAmount)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>
              <span>SKUPAJ</span><span>€{formatEurNumber(amountTotal)}</span>
            </div>
          </div>
        </div>

        {/* Opombe */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 6 }}>Opombe (neobvezno)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Pogoji, rok izvedbe, posebna navodila..." style={{ ...inp, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />
        </div>

        {/* Shrani */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => router.push('/predracuni')} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '11px 20px', fontSize: 13, cursor: 'pointer' }}>Prekliči</button>
          <button onClick={save} disabled={saving || !clientName.trim()} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (saving || !clientName.trim()) ? 0.5 : 1 }}>
            {saving ? 'Shranjujem...' : '✓ Shrani predračun'}
          </button>
        </div>
      </div>
    </div>
    </AppLayout>
  )
}
