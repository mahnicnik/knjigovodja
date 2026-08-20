'use client'

import { useState, useEffect } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'
import { getActiveMembership } from '@/lib/active-org'
import { formatEurNumber } from '@/lib/format'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export default function NewDobavnicaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientTaxNumber, setClientTaxNumber] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientIban, setClientIban] = useState('')
  const [reference, setReference] = useState('')
  const [taxLookupLoading, setTaxLookupLoading] = useState(false)
  const [taxLookupError, setTaxLookupError] = useState('')
  const [issueDate, setIssueDate] = useState(lokalniDatum())
  const [dueDate, setDueDate] = useState(lokalniDatum(new Date(Date.now() + 30*24*60*60*1000)))
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unit_price: 0, vat_rate: 22 }])
  const [notes, setNotes] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [serviceDateTo, setServiceDateTo] = useState('')
  const [headerText, setHeaderText] = useState('')
  const [partners, setPartners] = useState<any[]>([])
  const [savingPartner, setSavingPartner] = useState(false)
  const [partnerSaved, setPartnerSaved] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (member) {
        const o = (member as any).organizations
        setOrg(o)
        const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', o.id)
        const num = String((count || 0) + 1).padStart(3, '0')
        setInvoiceNumber(`D-${new Date().getFullYear()}-${num}`)
        const { data: pts } = await supabase.from('invoice_partners').select('*').eq('org_id', o.id).order('name')
        setPartners(pts || [])
      }
    }
    load()
  }, [])

  async function lookupByTaxNumber(taxNum: string) {
    const clean = taxNum.replace('SI','').replace('si','').trim()
    if (clean.length < 7) return
    setTaxLookupLoading(true)
    setTaxLookupError('')
    try {
      const res = await fetch(`/api/company-lookup?tax=${clean}`)
      if (!res.ok) throw new Error('Ni najdeno')
      const data = await res.json()
      if (data?.dolgo_ime) {
        setClientName(data.dolgo_ime)
        if (data.naslov) setClientAddress(data.naslov + (data['pošta'] ? ', ' + data['pošta'] : ''))
        if (data.transakcijski_računi) setClientIban(data.transakcijski_računi)
      } else {
        setTaxLookupError('Podjetje ni najdeno')
      }
    } catch(e) {
      setTaxLookupError('Iskanje ni uspelo')
    }
    setTaxLookupLoading(false)
  }

  async function savePartner() {
    if (!clientName.trim() || !org) return
    setSavingPartner(true)
    const existing = partners.find(p => p.name === clientName)
    if (existing) {
      // POPRAVLJENO (16.8.2026): prej brez preverbe - partner se ni shranil,
      // uporabnik pa je videl potrditev in bi ga vnasal znova.
      const { error: pUpdErr } = await supabase.from('invoice_partners').update({
        email: clientEmail, tax_number: clientTaxNumber,
        address: clientAddress, iban: clientIban,
      }).eq('id', existing.id)
      if (pUpdErr) { alert('Partnerja ni bilo mogoče posodobiti: ' + pUpdErr.message); setSavingPartner(false); return }
    } else {
      const { error: pInsErr } = await supabase.from('invoice_partners').insert({
        org_id: org.id, name: clientName, email: clientEmail,
        tax_number: clientTaxNumber, address: clientAddress, iban: clientIban,
      })
      if (pInsErr) { alert('Partnerja ni bilo mogoče shraniti: ' + pInsErr.message); setSavingPartner(false); return }
    }
    const { data: pts } = await supabase.from('invoice_partners').select('*').eq('org_id', org.id).order('name')
    setPartners(pts || [])
    setSavingPartner(false)
    setPartnerSaved(true)
    setTimeout(() => setPartnerSaved(false), 2000)
  }

  function selectPartner(id: string) {
    const p = partners.find(p => p.id === id)
    if (p) {
      setClientName(p.name || '')
      setClientEmail(p.email || '')
      setClientTaxNumber(p.tax_number || '')
      setClientAddress(p.address || '')
      setClientIban(p.iban || '')
    }
  }

  function addItem() { setItems([...items, { description: '', quantity: 1, unit_price: 0, vat_rate: 22 }]) }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof LineItem, value: any) {
    const updated = [...items]; updated[i] = { ...updated[i], [field]: value }; setItems(updated)
  }

  const subtotal = items.reduce((s, item) => s + item.quantity * item.unit_price, 0)
  const vatAmount = items.reduce((s, item) => s + item.quantity * item.unit_price * (item.vat_rate / 100), 0)
  const total = subtotal + vatAmount

  async function handleSave(status: 'draft' | 'sent') {
    if (!org) return
    setLoading(true)
    const { error } = await supabase.from('issued_invoices').insert({
      org_id: org.id, invoice_number: invoiceNumber, invoice_type: 'delivery_note',
      client_name: clientName, client_email: clientEmail, client_tax_number: clientTaxNumber,
      client_address: clientAddress, client_iban: clientIban,
      issue_date: issueDate, due_date: dueDate, line_items: items,
      amount_net: subtotal, vat_amount: vatAmount, amount_total: total,
      status: 'draft', notes, reference: reference || `D-${invoiceNumber}`,
      service_date: serviceDate || null,
      service_date_to: serviceDateTo || null,
      header_text: headerText || null,
    })
    if (error) { alert('Napaka: ' + error.message); setLoading(false); return }
    posthog.capture(status === 'sent' ? 'invoice_created' : 'invoice_drafted', { invoice_number: invoiceNumber, amount_total: total })
    router.push('/dobavnice')
  }

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"

  // Partner sekcija — skupna za mobile in desktop
  const PartnerSection = (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {partners.length > 0 && (
        <div>
          <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Izberi obstoječo stranko</label>
          <select
            style={{ width:'100%', padding:'9px 12px', borderRadius:'9px', border:'1px solid #e5e7eb', fontSize:'13px', background:'#fff', color:'#111', outline:'none' }}
            onChange={e => selectPartner(e.target.value)}
            defaultValue=""
          >
            <option value="">-- Izberi stranko --</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Ime podjetja / stranke *</label>
        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Agencija Pixel d.o.o." className={inp} />
      </div>
      <div>
        <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Email stranke</label>
        <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="info@agencija.si" type="email" className={inp} />
      </div>
      <div>
        <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Davčna številka stranke</label>
        <div style={{display:'flex', gap:6}}>
          <input value={clientTaxNumber}
            onChange={e => {
              const val = e.target.value
              setClientTaxNumber(val)
              const digits = val.replace(/[^0-9]/g, '')
              if (digits.length === 8) lookupByTaxNumber(val)
            }}
            onKeyDown={e => e.key==='Enter' && lookupByTaxNumber(clientTaxNumber)}
            placeholder="SI12345678 ali 12345678" className={inp} style={{flex:1}} />
          <button onClick={() => lookupByTaxNumber(clientTaxNumber)} disabled={taxLookupLoading}
            style={{padding:'8px 14px',borderRadius:8,background:'#0d2818',color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
            {taxLookupLoading ? '...' : 'Poišči'}
          </button>
        </div>
        {taxLookupError && <div style={{fontSize:11,color:'#a83232',marginTop:4}}>{taxLookupError}</div>}
        <div style={{fontSize:11,color:'#1f6b3a',marginTop:4}}>Vnesi davčno številko za avtopolnitev podatkov o podjetju</div>
      </div>
      <div>
        <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Naslov stranke</label>
        <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Ulica 1, 1000 Ljubljana" className={inp} />
      </div>
      <div>
        <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>IBAN stranke</label>
        <input value={clientIban} onChange={e => setClientIban(e.target.value)} placeholder="SI56 1234 5678 9012 345" className={inp} />
      </div>
      {clientName && (
        <button
          type="button"
          onClick={savePartner}
          disabled={savingPartner}
          style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #0d2818', background: partnerSaved ? '#0d2818' : 'transparent', color: partnerSaved ? '#fff' : '#0d2818', fontSize:'12px', fontWeight:'600', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px', alignSelf:'flex-start' }}
        >
          {partnerSaved ? '✓ Shranjeno' : savingPartner ? '...' : '💾 Shrani stranko za prihodnjič'}
        </button>
      )}
    </div>
  )

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    return (
      <div style={{ minHeight:'100vh', background:'#F7F6F2', paddingBottom:'80px' }}>
        <div style={{ background:'#fff', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'12px 16px', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <Link href="/dobavnice" style={{ textDecoration:'none', fontSize:'13px', color:'#888' }}>← Računi</Link>
            <div style={{ fontSize:'15px', fontWeight:'500', color:'#0D1F12' }}>Nova dobavnica</div>
            <button onClick={() => handleSave('draft')} disabled={loading} style={{ fontSize:'12px', color:'#888', background:'none', border:'0.5px solid rgba(0,0,0,0.15)', borderRadius:'8px', padding:'6px 12px', cursor:'pointer' }}>Osnutek</button>
          </div>
        </div>
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
          <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Stranka</div>
            {PartnerSection}
          </div>
          <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Datumi</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              <div>
                <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Datum računa</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label style={{ fontSize:'11px', color:'#888', display:'block', marginBottom:'4px' }}>Rok plačila</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
              </div>
            </div>
          </div>
          <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Storitve in blago</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {items.map((item, i) => (
                <div key={i} style={{ background:'#F7F6F2', borderRadius:'10px', padding:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                    <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>Postavka {i+1}</div>
                    {items.length > 1 && <button onClick={() => removeItem(i)} style={{ background:'none', border:'none', color:'#E24B4A', fontSize:'18px', cursor:'pointer' }}>×</button>}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Opis storitve" className={inp} />
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                      <div>
                        <label style={{ fontSize:'10px', color:'#888', display:'block', marginBottom:'3px' }}>Količina</label>
                        <input type="number" onFocus={e => e.target.select()} value={item.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none text-center" />
                      </div>
                      <div>
                        <label style={{ fontSize:'10px', color:'#888', display:'block', marginBottom:'3px' }}>Cena (€)</label>
                        <input type="number" onFocus={e => e.target.select()} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none text-right" />
                      </div>
                      <div>
                        <label style={{ fontSize:'10px', color:'#888', display:'block', marginBottom:'3px' }}>DDV</label>
                        <select value={item.vat_rate} onChange={e => updateItem(i, 'vat_rate', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none">
                          <option value={22}>22%</option>
                          <option value={9.5}>9.5%</option>
                          <option value={0}>0%</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} style={{ width:'100%', marginTop:'10px', padding:'12px', border:'0.5px dashed rgba(0,0,0,0.2)', borderRadius:'10px', background:'none', fontSize:'13px', color:'#888', cursor:'pointer' }}>+ Dodaj postavko</button>
          </div>
          <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Opombe</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatne opombe..." rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none" />
          </div>
        </div>
        <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'0.5px solid rgba(0,0,0,0.08)', padding:'12px 16px', paddingBottom:'calc(12px + env(safe-area-inset-bottom))' }}>
          <button onClick={() => handleSave('sent')} disabled={loading || !clientName} style={{ width:'100%', padding:'14px', borderRadius:'12px', background: (!clientName || loading) ? '#ccc' : '#0D1F12', color:'#fff', border:'none', fontSize:'15px', fontWeight:'500', cursor: (!clientName || loading) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Shranjujem...' : '📄 Shrani dobavnico'}
          </button>
        </div>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ──
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dobavnice" className="text-sm text-gray-500 hover:text-gray-900">← Računi</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Nova dobavnica</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave('draft')} disabled={loading} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">Osnutek</button>
          <button onClick={() => handleSave('sent')} disabled={loading || !clientName} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
            {loading ? 'Shranjujem...' : 'Shrani dobavnico'}
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Podatki stranke</h3>
            {PartnerSection}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Datumi</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum računa</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rok plačila</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum opravljene storitve (od)</label>
                <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum opravljene storitve (do)</label>
                <input type="date" value={serviceDateTo} onChange={e => setServiceDateTo(e.target.value)} className={inp} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div style={{ marginBottom: 16 }}>
              <label className="text-xs text-gray-500 block mb-1">Besedilo nad tabelo (neobvezno)</label>
              <textarea value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Npr: Na podlagi pogodbe z dne 1.1.2026..." rows={2} className={inp} style={{ resize: 'vertical' as any }} />
            </div>
            <h3 className="font-medium text-gray-900 mb-4">Storitve in blago</h3>
            <div className="grid grid-cols-12 gap-2 mb-2 px-1">
              <div className="col-span-5 text-xs font-medium text-gray-400">Storitev</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-center">Količina</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-right">Cena (€)</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-center">DDV</div>
              <div className="col-span-1"></div>
            </div>
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5"><input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Opis storitve" className={inp} /></div>
                  <div className="col-span-2"><input type="number" onFocus={e => e.target.select()} value={item.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none text-center" /></div>
                  <div className="col-span-2"><input type="number" onFocus={e => e.target.select()} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none text-right" /></div>
                  <div className="col-span-2">
                    <select value={item.vat_rate} onChange={e => updateItem(i, 'vat_rate', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                      <option value={22}>22 %</option><option value={9.5}>9,5 %</option><option value={0}>0 %</option>
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-xl">×</button>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 rounded-xl px-4 py-2 w-full hover:border-gray-400 transition-colors">+ Dodaj postavko</button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Opombe</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatne opombe na računu..." rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-4">
            <h3 className="font-medium text-gray-900 mb-4">Povzetek</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Št. računa</span><span className="font-mono">{invoiceNumber}</span></div>
              <div className="flex justify-between text-gray-500"><span>Osnova</span><span>€{formatEurNumber(subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>DDV</span><span>€{formatEurNumber(vatAmount)}</span></div>
              <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-semibold text-gray-900"><span>Skupaj</span><span>€{formatEurNumber(total)}</span></div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500 mb-1">Sklic</div>
              <input
                className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2 w-full border border-gray-200 outline-none"
                value={reference || `SI00 ${invoiceNumber}`}
                onChange={e => {
                  setReference(e.target.value)
                  const match = e.target.value.match(/SI\d+\s+(.+)/)
                  if (match) setInvoiceNumber(match[1].trim())
                }}
                placeholder={`SI00 ${invoiceNumber}`}
              />
            </div>
            {org && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-2">Izdajatelj</div>
                <div className="text-xs text-gray-700 leading-relaxed">
                  <div className="font-medium">{org.name}</div>
                  <div>{org.address}</div>
                  <div>{org.post_code} {org.city}</div>
                  <div className="mt-1">Davčna: {org.tax_number}</div>
                  {org.iban && <div className="font-mono mt-1 text-xs">{org.iban}</div>}
                </div>
              </div>
            )}
            <button onClick={() => handleSave('sent')} disabled={loading || !clientName} className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium mt-6 disabled:opacity-40">
              {loading ? 'Shranjujem...' : '📄 Shrani dobavnico'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
