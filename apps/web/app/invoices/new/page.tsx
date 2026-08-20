'use client'

import UpgradeModal from '@/components/UpgradeModal'
import { lokalniDatum } from '@/lib/tax-constants'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { VAT_EXEMPTIONS, VAT_EXEMPTION_GROUPS, vatExemptionText, findVatExemption } from '@/lib/vat-exemptions'
import { formatEurNumber } from '@/lib/format'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  discount_pct?: number
}

export default function NewInvoicePage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [unknownPayer, setUnknownPayer] = useState(false)
  useEffect(() => {
    if (unknownPayer) setClientName('Neznan plačnik')
    else if (clientName === 'Neznan plačnik') setClientName('')
  }, [unknownPayer])
  const [clientEmail, setClientEmail] = useState('')
  const [clientTaxNumber, setClientTaxNumber] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientIban, setClientIban] = useState('')
  const [reference, setReference] = useState('')
  const [taxLookupLoading, setTaxLookupLoading] = useState(false)
  const [taxLookupError, setTaxLookupError] = useState('')
  const [issueDate, setIssueDate] = useState(lokalniDatum())
  const [dueDate, setDueDate] = useState(lokalniDatum(new Date(Date.now() + 14*24*60*60*1000)))
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unit_price: 0, vat_rate: 22, discount_pct: 0 }])
  const [notes, setNotes] = useState('')
  // DODANO (19.8.2026): klavzula o neobracunanem DDV. ZDDV-1 zahteva navedbo
  // razloga na racunu brez DDV; prej se je dalo izbrati 0 %, razloga pa ni bilo.
  const [vatExemptionCode, setVatExemptionCode] = useState('')
  const [vatExemptionCustom, setVatExemptionCustom] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [serviceDateTo, setServiceDateTo] = useState('')
  const [headerText, setHeaderText] = useState('')
  const [partners, setPartners] = useState<any[]>([])
  const [savingPartner, setSavingPartner] = useState(false)
  const [partnerSaved, setPartnerSaved] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
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
        // Privzeta klavzula organizacije (npr. mali zavezanec: 94. clen) -
        // da uporabniku ni treba izbirati pri vsakem racunu posebej.
        if (o?.vat_exemption_code) {
          setVatExemptionCode(o.vat_exemption_code)
          if (o.vat_exemption_custom_text) setVatExemptionCustom(o.vat_exemption_custom_text)
        }
        if (!o.vat_registered) {
          setItems(prev => prev.map(item => ({ ...item, vat_rate: 0 })))
        }
        const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', o.id)
        setInvoiceCount(count || 0)
        // POPRAVLJENO (24.7.2026): atomarna RPC namesto count(*)+1, ki se
        // je pokvaril ob vrzelih v obstojecih stevilkah (samodejno se
        // "zaceli" na dejansko najvisjo obstojeco stevilko).
        const { data: nextNum } = await supabase.rpc('get_next_manual_invoice_number', {
          p_org_id: o.id, p_year: new Date().getFullYear(),
        })
        setInvoiceNumber(nextNum || `${new Date().getFullYear()}-001`)
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

  function addItem() { setItems([...items, { description: '', quantity: 1, unit_price: 0, vat_rate: org?.vat_registered ? 22 : 0, discount_pct: 0 }]) }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof LineItem, value: any) {
    const updated = [...items]; updated[i] = { ...updated[i], [field]: value }; setItems(updated)
  }

  const lineNet = (item: LineItem) => item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100)
  const subtotal = items.reduce((s, item) => s + lineNet(item), 0)
  const vatAmount = items.reduce((s, item) => s + lineNet(item) * (item.vat_rate / 100), 0)
  const total = subtotal + vatAmount

  async function handleSave(status: 'draft' | 'sent', overrideNumber?: string) {
    if (!org) return
    // Free plan limit: max 5 računov
    const isFree = !['pro', 'pro_pos'].includes(org.subscription_status)
    if (isFree && invoiceCount >= 5) {
      setShowUpgradeModal(true)
      setLoading(false)
      return
    }
    setLoading(true)
    // overrideNumber uporabljen pri samodejnem retry (glej spodaj) - NE
    // zanasamo se na React state (invoiceNumber), ker se ta znotraj istega
    // zaprtja ne posodobi sinhrono po setInvoiceNumber() klicu.
    const numberToUse = overrideNumber || invoiceNumber
    const { error } = await supabase.from('issued_invoices').insert({
      org_id: org.id, invoice_number: numberToUse, invoice_type: 'invoice',
      client_name: clientName, client_email: clientEmail, client_tax_number: clientTaxNumber,
      client_address: clientAddress, client_iban: clientIban,
      issue_date: issueDate, due_date: dueDate, line_items: items,
      amount_net: subtotal, vat_amount: vatAmount, amount_total: total,
      status, notes, reference: reference || `SI00 ${numberToUse}`,
      service_date: serviceDate || null,
      service_date_to: serviceDateTo || null,
      header_text: headerText || null,
      // Shranimo KODO in BESEDILO. Besedilo zato, da sprememba zakonodaje
      // ne spremeni ze izdanih racunov (zakonska hramba).
      vat_exemption_code: vatExemptionCode || null,
      vat_exemption_text: vatExemptionText(vatExemptionCode, vatExemptionCustom),
    })
    if (error) {
      const isDuplicate = error.message.includes('issued_invoices_org_id_invoice_number_key') || error.message.includes('duplicate key')
      // Samodejni ponovni poskus ob trku stevilke - uporabi atomarno RPC
      // (get_next_manual_invoice_number), ki vedno pravilno "zaceli" na
      // dejansko najvisjo obstojeco stevilko, tudi ob vrzelih. Samo EN
      // samodejen poskus (overrideNumber se ne sme se enkrat ponoviti).
      if (isDuplicate && !overrideNumber) {
        const { data: nextNum } = await supabase.rpc('get_next_manual_invoice_number', {
          p_org_id: org.id, p_year: new Date().getFullYear(),
        })
        const freshNumber = nextNum || `${new Date().getFullYear()}-001`
        setInvoiceNumber(freshNumber)
        return handleSave(status, freshNumber)
      }
      if (isDuplicate) {
        alert(`Račun s številko "${numberToUse}" že obstaja. Spremenite številko računa in poskusite znova.`)
      } else {
        alert('Napaka: ' + error.message)
      }
      setLoading(false)
      return
    }
    posthog.capture(status === 'sent' ? 'invoice_created' : 'invoice_drafted', { invoice_number: numberToUse, amount_total: total })
    router.push('/invoices')
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
        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Agencija Pixel d.o.o." className={inp} disabled={unknownPayer} style={unknownPayer ? { opacity: 0.5 } : undefined} />
        <label style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'6px', fontSize:'12px', color:'#666', cursor:'pointer' }}>
          <input type="checkbox" checked={unknownPayer} onChange={e => setUnknownPayer(e.target.checked)} />
          Plačnik neznan
        </label>
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
            <Link href="/invoices" style={{ textDecoration:'none', fontSize:'13px', color:'#888' }}>← Računi</Link>
            <div style={{ fontSize:'15px', fontWeight:'500', color:'#0D1F12' }}>Nov račun</div>
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
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 0.8fr', gap:'8px' }}>
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
                          <option value={22}>22 %</option>
                          <option value={9.5}>9,5 %</option>
                          <option value={0}>0 %</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:'10px', color:'#888', display:'block', marginBottom:'3px' }}>Popust %</label>
                        <input type="number" onFocus={e => e.target.select()} min={0} max={100} value={item.discount_pct || 0} onChange={e => updateItem(i, 'discount_pct', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none text-center" />
                      </div>
                    </div>
                    {/* Znesek vrstice (20.8.2026) - da je vidno, koliko posamezna
                        postavka nanese, ne le skupna vsota racuna. */}
                    <div style={{ display:'flex', justifyContent:'flex-end', fontSize:'13px', color:'#0D1F12', fontWeight:500 }}>
                      €{formatEurNumber(Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - Number(item.discount_pct || 0) / 100))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} style={{ width:'100%', marginTop:'10px', padding:'12px', border:'0.5px dashed rgba(0,0,0,0.2)', borderRadius:'10px', background:'none', fontSize:'13px', color:'#888', cursor:'pointer' }}>+ Dodaj postavko</button>
          </div>
          {/* KLAVZULA O NEOBRACUNANEM DDV — DODANO 19.8.2026.
              Prikaze se SAMO, kadar je dejansko potrebna: ce je katera postavka
              po 0 % ali ce izdajatelj ni zavezanec za DDV. Drugace bi po
              nepotrebnem obremenjevala vsak racun. */}
          {(items.some(it => Number(it.vat_rate) === 0) || org?.vat_registered === false) && (
            <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
              <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'4px' }}>Razlog za neobračunan DDV</div>
              <div style={{ fontSize:'11px', color:'#888', marginBottom:'12px', lineHeight:1.5 }}>
                Zakon zahteva, da račun brez DDV navaja razlog. Če niste prepričani, katera možnost je prava, vprašajte računovodjo.
              </div>
              <select
                value={vatExemptionCode}
                onChange={e => setVatExemptionCode(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background:'#fff' }}
              >
                <option value="">— izberite razlog —</option>
                {VAT_EXEMPTION_GROUPS.map(g => (
                  <optgroup key={g} label={g}>
                    {VAT_EXEMPTIONS.filter(e => e.group === g).map(e => (
                      <option key={e.code} value={e.code}>{e.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {vatExemptionCode && vatExemptionCode !== 'custom' && (
                <div style={{ marginTop:'10px', padding:'10px', background:'#F7F6F2', borderRadius:'8px', fontSize:'12px', color:'#444', lineHeight:1.5 }}>
                  <div style={{ marginBottom:'6px' }}>{findVatExemption(vatExemptionCode)?.text}</div>
                  <div style={{ fontSize:'11px', color:'#888' }}>{findVatExemption(vatExemptionCode)?.hint}</div>
                  {findVatExemption(vatExemptionCode)?.priglasitev && (
                    <div style={{ marginTop:'8px', padding:'8px', background:'#FFF6E5', borderRadius:'6px', fontSize:'11px', color:'#8A5A00', lineHeight:1.5 }}>
                      Za to oprostitev je potrebna <strong>predhodna priglasitev pri FURS</strong> (43. člen ZDDV-1, prek eDavkov). Navedba člena na računu sama po sebi ne zadošča.
                    </div>
                  )}
                </div>
              )}
              {vatExemptionCode === 'custom' && (
                <textarea
                  value={vatExemptionCustom}
                  onChange={e => setVatExemptionCustom(e.target.value)}
                  placeholder="Vpišite besedilo, ki vam ga je svetoval računovodja..."
                  rows={2}
                  style={{ marginTop:'10px' }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
                />
              )}
            </div>
          )}

          <div style={{ background:'#fff', borderRadius:'12px', border:'0.5px solid rgba(0,0,0,0.08)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Opombe</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatne opombe..." rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none" />
          </div>
        </div>
        <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'0.5px solid rgba(0,0,0,0.08)', padding:'12px 16px', paddingBottom:'calc(12px + env(safe-area-inset-bottom))' }}>
          <button onClick={() => handleSave('sent')} disabled={loading || !clientName} style={{ width:'100%', padding:'14px', borderRadius:'12px', background: (!clientName || loading) ? '#ccc' : '#0D1F12', color:'#fff', border:'none', fontSize:'15px', fontWeight:'500', cursor: (!clientName || loading) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Shranjujem...' : '📄 Izdaj račun'}
          </button>
        </div>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ──
  return (
    <AppLayout org={org}>
    <>
    <UpgradeModal
      open={showUpgradeModal}
      onClose={() => setShowUpgradeModal(false)}
      feature="Ustvarjanje računov"
      requiredPlan="pro"
    />
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-900">← Računi</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Nov račun</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave('draft')} disabled={loading} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">Shrani osnutek</button>
          <button onClick={() => handleSave('sent')} disabled={loading || !clientName} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
            {loading ? 'Shranjujem...' : 'Izdaj račun'}
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
            {/* POPRAVLJENO (20.8.2026): izbirnik DDV je imel col-span-1 od 12 -
                pri tej sirini se "22%" ni prileglo in videti je bilo samo
                puscico. Stolpci so prerazporejeni: kolicina je ozja (stevila
                so kratka), DDV pa siroka dovolj za besedilo. Dodan je tudi
                znesek vrstice, da je vidno, koliko posamezna postavka nanese. */}
            <div className="grid grid-cols-12 gap-2 mb-2 px-1">
              <div className="col-span-4 text-xs font-medium text-gray-400">Storitev</div>
              <div className="col-span-1 text-xs font-medium text-gray-400 text-center">Kol.</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-right">Cena (€)</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-center">DDV</div>
              <div className="col-span-1 text-xs font-medium text-gray-400 text-center">Pop. %</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-right">Skupaj</div>
            </div>
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4"><input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Opis storitve" className={inp} /></div>
                  <div className="col-span-1"><input type="number" onFocus={e => e.target.select()} value={item.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none text-center" /></div>
                  <div className="col-span-2"><input type="number" onFocus={e => e.target.select()} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none text-right" /></div>
                  <div className="col-span-2">
                    <select value={item.vat_rate} onChange={e => updateItem(i, 'vat_rate', +e.target.value)} className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none bg-white">
                      <option value={22}>22 %</option><option value={9.5}>9,5 %</option><option value={0}>0 %</option>
                    </select>
                  </div>
                  <div className="col-span-1"><input type="number" onFocus={e => e.target.select()} min={0} max={100} value={item.discount_pct || 0} onChange={e => updateItem(i, 'discount_pct', +e.target.value)} style={{ MozAppearance: 'textfield' as any }} className="w-full border border-gray-200 rounded-xl px-1 py-2 text-sm focus:outline-none text-center [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm text-gray-900 tabular-nums">
                      €{formatEurNumber(Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - Number(item.discount_pct || 0) / 100))}
                    </span>
                    {items.length > 1 && <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-lg leading-none pl-1">×</button>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 rounded-xl px-4 py-2 w-full hover:border-gray-400 transition-colors">+ Dodaj postavko</button>
          </div>

          {/* KLAVZULA O NEOBRACUNANEM DDV — DODANO 19.8.2026.
              Ta stran ima DVA vmesnika (mobilni od vrstice ~297 in namizni).
              Ob prvi uvedbi (prelet 32) je bila klavzula dodana SAMO v
              mobilnega - na racunalniku je izbirnik manjkal, ceprav zakon
              zahteva navedbo razloga pri vsakem racunu brez DDV. */}
          {(items.some(it => Number(it.vat_rate) === 0) || org?.vat_registered === false) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-medium text-gray-900 mb-1">Razlog za neobračunan DDV</h3>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Zakon zahteva, da račun brez DDV navaja razlog. Če niste prepričani, katera možnost je prava, vprašajte računovodjo.
              </p>
              <select
                value={vatExemptionCode}
                onChange={e => setVatExemptionCode(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="">— izberite razlog —</option>
                {VAT_EXEMPTION_GROUPS.map(g => (
                  <optgroup key={g} label={g}>
                    {VAT_EXEMPTIONS.filter(e => e.group === g).map(e => (
                      <option key={e.code} value={e.code}>{e.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {vatExemptionCode && vatExemptionCode !== 'custom' && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs leading-relaxed">
                  <div className="text-gray-700 mb-1.5">{findVatExemption(vatExemptionCode)?.text}</div>
                  <div className="text-gray-500">{findVatExemption(vatExemptionCode)?.hint}</div>
                  {findVatExemption(vatExemptionCode)?.priglasitev && (
                    <div className="mt-2 p-2 rounded-lg" style={{ background:'#FFF6E5', color:'#8A5A00' }}>
                      Za to oprostitev je potrebna <strong>predhodna priglasitev pri FURS</strong> (43. člen ZDDV-1, prek eDavkov). Navedba člena na računu sama po sebi ne zadošča.
                    </div>
                  )}
                </div>
              )}

              {vatExemptionCode === 'custom' && (
                <textarea
                  value={vatExemptionCustom}
                  onChange={e => setVatExemptionCustom(e.target.value)}
                  placeholder="Vpišite besedilo, ki vam ga je svetoval računovodja..."
                  rows={2}
                  className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              )}

              {!vatExemptionCode && (
                <p className="mt-2 text-xs" style={{ color:'#A32D2D' }}>
                  Razlog še ni izbran — na računu bo manjkala obvezna navedba.
                </p>
              )}
            </div>
          )}

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
              {loading ? 'Shranjujem...' : '📄 Izdaj račun'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
    </AppLayout>
  )
}