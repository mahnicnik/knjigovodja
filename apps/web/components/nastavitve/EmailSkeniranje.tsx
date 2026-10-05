'use client'
import { useState, useEffect, Suspense } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import { formatEurNumber } from '@/lib/format'
import { izbireKategorij, kontoZa, normalizirajKategorijo } from '@/lib/konti'
import { preberiRazclenitev, zneskiZaShranjevanje } from '@/lib/prejeti-ddv'
import { najdiUjemanje, oknoZaPrimerjavo, STROSEK_POLJA, type ObstojeciStrosek, type Ujemanje } from '@/lib/strosek-ujemanje'

function EmailSkeniranjeContent() {
  const [org, setOrg] = useState<any>(null)
  const [connections, setConnections] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  // PRELET 332: ze vneseni stroski v obdobju predlogov - za oznako "Ze dodano".
  const [obstojeci, setObstojeci] = useState<ObstojeciStrosek[]>([])
  // PRELET 334: vse, kar skeniranje ni dalo v pregled, je zdaj VIDNO.
  const [ostali, setOstali] = useState<Record<'ni_racun' | 'napaka' | 'rejected', any[]>>({ ni_racun: [], napaka: [], rejected: [] })
  const [odprto, setOdprto] = useState<'ni_racun' | 'napaka' | 'rejected' | null>(null)
  const searchParams = useSearchParams()
  const supabase = createClient()

  // PRELET 332: predlogi + stroski v istem obdobju (ujemanje se racuna sproti,
  // zato je oznaka pravilna tudi za stroske, vnesene PO skeniranju).
  async function naloziPredloge(orgId: string) {
    // POPRAVLJENO (19.8.2026, HITROST): brez `pdf_base64` - PDF potrebujemo
    // SAMO ob predogledu in ob potrditvi.
    const { data: pend } = await supabase.from('email_scan_pending').select('id, org_id, connection_id, email_subject, email_from, email_date, attachment_name, extracted, status, created_at').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false })
    setPending(pend || [])
    const okno = oknoZaPrimerjavo(pend || [])
    if (!okno) { setObstojeci([]); return }
    const { data: rc } = await supabase.from('receipts').select(STROSEK_POLJA)
      .eq('org_id', orgId).neq('status', 'rejected')
      .gte('receipt_date', okno.od).lte('receipt_date', okno.do).limit(2000)
    setObstojeci((rc as any) || [])
  }

  async function naloziOstale(orgId: string) {
    const { data } = await supabase.from('email_scan_pending')
      .select('id, email_subject, email_from, email_date, attachment_name, extracted, status, reviewed_at, created_at')
      .eq('org_id', orgId).in('status', ['ni_racun', 'napaka', 'rejected'])
      .order('email_date', { ascending: false }).limit(300)
    // PRELET 338: seznama se ne nabirata v nedogled - zavrnjeni in "ni racun"
    // so vidni 30 dni (za morebitno obnovo), potem se skrijejo. Zaklenjeni PDF
    // in napake ostanejo, dokler jih ne uredite.
    const meja = Date.now() - 30 * 86_400_000
    const o: any = { ni_racun: [], napaka: [], rejected: [] }
    for (const r of data || []) {
      const cas = Date.parse(r.reviewed_at || r.created_at)
      if (r.status !== 'napaka' && Number.isFinite(cas) && cas < meja) continue
      o[r.status]?.push(r)
    }
    setOstali(o)
  }

  // PRELET 338: "Pocisti" - predlogi gredo v arhiv (ne prikazujejo se vec,
  // ostanejo pa zabelezeni, da jih naslednje skeniranje ne najde znova).
  async function pocisti(k: 'ni_racun' | 'napaka' | 'rejected') {
    const ids = ostali[k].map((x: any) => x.id)
    if (!ids.length || !confirm(`Počistim ${ids.length} ${ids.length === 1 ? 'zapis' : 'zapisov'} s seznama? Naslednje skeniranje jih ne bo več prikazalo.`)) return
    const { error } = await supabase.from('email_scan_pending').update({ status: 'arhiv', reviewed_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert('Ni bilo mogoče: ' + error.message); return }
    if (org?.id) await naloziOstale(org.id)
  }

  async function vPregled(item: any) {
    const { error } = await supabase.from('email_scan_pending').update({ status: 'pending', reviewed_at: null }).eq('id', item.id)
    if (error) { alert('Ni bilo mogoče: ' + error.message); return }
    if (org?.id) { await naloziPredloge(org.id); await naloziOstale(org.id) }
  }

  async function odstraniOstalo(item: any) {
    // PRELET 338: odstranjen "ni racun" / napaka gre v arhiv, ne med zavrnjene.
    const { error } = await supabase.from('email_scan_pending').update({ status: 'arhiv', reviewed_at: new Date().toISOString() }).eq('id', item.id)
    if (error) { alert('Ni bilo mogoče: ' + error.message); return }
    if (org?.id) await naloziOstale(org.id)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrg((member as any).organizations)
      const { data: conns } = await supabase.from('email_connections').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false })
      setConnections(conns || [])
      await naloziPredloge(member.org_id)
      await naloziOstale(member.org_id)
      setLoading(false)
    }
    load()
  }, [])

  async function updateConnection(id: string, updates: any) {
    setSavingId(id)
    const { error: connErr } = await supabase.from('email_connections').update(updates).eq('id', id)
    if (connErr) { alert('Nastavitve ni bilo mogoče shraniti: ' + connErr.message); return }
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    setSavingId(null)
  }

  async function disconnectEmail(id: string) {
    if (!confirm('Prekiniti povezavo s tem e-mail racunom?')) return
    const { error: disErr } = await supabase.from('email_connections').delete().eq('id', id)
    if (disErr) { alert('Povezave ni bilo mogoče odstraniti: ' + disErr.message); return }
    setConnections(prev => prev.filter(c => c.id !== id))
  }

  // PRELET 334: skeniranje v vec krogih - ce streznik javi "nedokonceno"
  // (casovna omejitev), nadaljujemo samodejno; ze obdelane priloge se preskocijo.
  const [napredek, setNapredek] = useState('')
  async function runScanNow(range?: { from: string; to: string }) {
    setScanning(true)
    const vsota = { scanned: 0, found: 0, zeVneseno: 0, niRacun: 0, zaklenjenih: 0, napak: 0 }
    let nedokoncano = false
    const napake: string[] = []
    try {
      for (let krog = 1; krog <= 8; krog++) {
        setNapredek(krog > 1 ? `Nadaljujem (${krog}. krog) — do zdaj ${vsota.found} novih računov…` : '')
        const res = await fetch('/api/email-scan/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(range ? { from: range.from, to: range.to } : {}), orgId: org?.id }),
        })
        const data = await res.json().catch(() => ({ error: 'Strežnik ni odgovoril (morda časovna omejitev) — poskusite znova.' }))
        if (!res.ok) { alert('Napaka: ' + (data.error || res.status)); break }
        vsota.scanned = Math.max(vsota.scanned, data.scanned || 0)
        for (const k of ['found', 'zeVneseno', 'niRacun', 'zaklenjenih', 'napak'] as const) vsota[k] += data[k] || 0
        for (const n of data.napake || []) if (!napake.includes(n)) napake.push(n)
        nedokoncano = !!data.nedokoncano
        if (!nedokoncano || napake.length) break
      }
      const vrstice = [
        `Pregledanih e-mailov s prilogo: ${vsota.scanned}`,
        `Novih računov v pregled: ${vsota.found}${vsota.zeVneseno ? ` (od tega ${vsota.zeVneseno} že med stroški — oznaka "Že dodano")` : ''}`,
        vsota.niRacun ? `PDF-jev, ki niso računi (dobavnice, izpiski …): ${vsota.niRacun} — seznam "Ni prepoznano kot račun"` : '',
        vsota.zaklenjenih ? `Zaklenjenih PDF (geslo): ${vsota.zaklenjenih} — vnesite jih ročno` : '',
        vsota.napak ? `Napak pri branju: ${vsota.napak} — ob naslednjem skeniranju se poskusijo znova` : '',
        nedokoncano ? '⚠️ Vsega ni bilo mogoče pregledati naenkrat — kliknite še enkrat, nadaljuje, kjer je ostal.' : '',
        ...napake.map(n => '⚠️ ' + n),
      ].filter(Boolean)
      alert('Skeniranje končano.\n\n' + vrstice.join('\n'))
      if (org?.id) { await naloziPredloge(org.id); await naloziOstale(org.id) }
    } catch (e: any) {
      alert('Napaka: ' + e.message)
    }
    setNapredek('')
    setScanning(false)
  }

  // PRELET 335: varovalka pred dvojnim klikom - pri Polansu je vecklik
  // ustvaril stiri enake stroske.
  const [potrjujem, setPotrjujem] = useState<string | null>(null)
  const [izbraneKat, setIzbraneKat] = useState<Record<string, string>>({}) // PRELET 339
  async function confirmPending(item: any) {
    if (potrjujem) return
    setPotrjujem(item.id)
    try { await potrdiPredlog(item) } finally { setPotrjujem(null) }
  }

  async function potrdiPredlog(item: any) {
    const d = item.extracted
    // PRELET 339: kategorija, kot jo je uporabnik morda popravil v pregledu.
    const kategorija = izbraneKat[item.id] || normalizirajKategorijo(d.category)
    // PRELET 332: opozorilo pred dvojnikom.
    const u = ujemanja.get(item.id)
    if (u && !confirm(`Ta strošek je ${u.zanesljivost === 'gotovo' ? '' : 'morda '}že dodan (${u.vendor || 'strošek'}, ${u.datum ? new Date(u.datum).toLocaleDateString('sl-SI') : ''}, €${formatEurNumber(u.znesek)}).\n\nGa vseeno dodam še enkrat?`)) return
    // DODANO (prelet 298): AI pri e-postnem skeniranju vedno vrne razcep na
    // DDV, tudi ce organizacija NI davcni zavezanec - takrat DDV-ja ne sme
    // uveljavljati in je celoten placan (bruto) znesek strosek. Enak popravek
    // kot v scan/page.tsx (rocno in paketno skeniranje).
    // REVIZIJA V6: DDV po stopnjah iz razclenitve, ne osnova × ena stopnja
    // (lib/prejeti-ddv). Prej je bil ves DDV racuna z mesanimi stopnjami po 22 %.
    const z = zneskiZaShranjevanje({
      jeZavezanec: !!org?.vat_registered,
      osnova: Number(d.amount_net || 0), stopnja: Number(d.vat_rate || 0),
      bruto: d.amount_total ?? d.amount_net, razclenitev: preberiRazclenitev(d.vat_breakdown),
    })
    const vatRate = z.vat_rate, amountNet = z.amount_net, vatAmount = z.vat_amount, amountTotal = z.amount_total
    // POPRAVLJENO (16.8.2026): prej brez preverbe - potrjen racun iz e-poste se
    // ni shranil, predlog pa se je oznacil kot obdelan, zato bi bil izgubljen.
    const { data: rcpData, error: rcpErr } = await supabase.from('receipts').insert({
      org_id: org.id,
      vendor: d.vendor || '',
      receipt_date: d.date || lokalniDatum(),
      amount_net: amountNet,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      amount_total: amountTotal,
      vat_breakdown: z.vat_breakdown,
      description: d.description || '',
      category: kategorija,
      // PRELET 332: za prepoznavanje ze vnesenih stroskov ob naslednjem skeniranju.
      receipt_number: d.invoice_number || null,
      vendor_tax_num: d.vendor_tax_number || null,
      status: 'confirmed',
      is_deductible: kontoZa(kategorija).delez > 0,
      ai_raw_json: { ...d, category: kategorija, konto: kontoZa(kategorija).konto, davcni_delez: kontoZa(kategorija).delez, ai_category: d.category },
      // PDF naloz(imo sele tu, ne ze ob prikazu seznama (19.8.2026).
      attachment_base64: (await supabase.from('email_scan_pending').select('pdf_base64').eq('id', item.id).maybeSingle()).data?.pdf_base64 || null,
      attachment_type: 'pdf',
    }).select('id').single()
    if (rcpErr) { alert('Računa ni bilo mogoče shraniti: ' + rcpErr.message); return }
    // POPRAVLJENO (prelet 295): brez receipt_id se je ta vnos na Dashboardu
    // stel kot LOCEN odhodek poleg zgornjega receipts zapisa - isti strosek
    // iz e-postnega skeniranja je bil prikazan dvakrat (enaka napaka kot v
    // scan/page.tsx, popravljena v preletu 294).
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: d.date || lokalniDatum(),
      description: `${d.vendor || ''} — ${kategorija}`,
      entry_type: 'expense',
      income: 0,
      expense: amountNet,
      vat_in: vatAmount,
      vat_out: 0,
      category: kategorija,
      notes: d.accountant_note || null,
      receipt_id: rcpData?.id ?? null,
    })
    if (kpoErr) { alert('Vnosa v knjigo ni bilo mogoče shraniti: ' + kpoErr.message); return }
    await supabase.from('email_scan_pending').update({ status: 'confirmed', reviewed_at: new Date().toISOString() }).eq('id', item.id)
    setPending(prev => prev.filter(p => p.id !== item.id))
    // Pravkar dodan strosek: ostali predlogi za isti racun dobijo oznako takoj.
    if (rcpData?.id) setObstojeci(prev => [...prev, { id: rcpData.id, vendor: d.vendor || '', receipt_date: d.date || lokalniDatum(), amount_total: amountTotal, amount_net: amountNet, receipt_number: d.invoice_number || null, vendor_tax_num: d.vendor_tax_number || null }])
  }

  async function rejectPending(id: string) {
    const { error: rejErr } = await supabase.from('email_scan_pending').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    // POPRAVLJENO (16.8.2026): prej brez preverbe - predlog je izginil s
    // seznama, v bazi pa ostal, zato bi se ob osvezitvi znova pojavil.
    if (rejErr) { alert('Predloga ni bilo mogoče zavrniti: ' + rejErr.message); return }
    setPending(prev => prev.filter(p => p.id !== id))
    if (org?.id) naloziOstale(org.id)
  }

  async function previewPdf(item: any) {
    // PDF se nalozi SELE ob kliku (19.8.2026) - prej so se vsi PDF-ji prenesli
    // ze ob odprtju strani, ceprav uporabnik odpre kvecjemu enega.
    const { data: zapis } = await supabase
      .from('email_scan_pending').select('pdf_base64').eq('id', item.id).maybeSingle()
    const pdf = zapis?.pdf_base64
    if (!pdf) { alert('PDF ni na voljo za predogled'); return }
    const byteChars = atob(pdf)
    const byteNumbers = new Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  // PRELET 332: odstrani vse predloge, ki so ZANESLJIVO ze dodani.
  async function odstraniZeDodane() {
    const ids = pending.filter(p => ujemanja.get(p.id)?.zanesljivost === 'gotovo').map(p => p.id)
    if (ids.length === 0) return
    if (!confirm(`Odstranim ${ids.length} ${ids.length === 1 ? 'predlog, ki je' : 'predlogov, ki so'} že med stroški? Stroški ostanejo nespremenjeni.`)) return
    const { error } = await supabase.from('email_scan_pending').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert('Predlogov ni bilo mogoče odstraniti: ' + error.message); return }
    setPending(prev => prev.filter(p => !ids.includes(p.id)))
  }

  const ujemanja = new Map<string, Ujemanje>()
  for (const p of pending) { const u = najdiUjemanje(p.extracted, obstojeci); if (u) ujemanja.set(p.id, u) }
  const steviloGotovih = pending.filter(p => ujemanja.get(p.id)?.zanesljivost === 'gotovo').length
  // Novi najprej, ze dodani na koncu.
  const razvrsceni = [...pending].sort((a, b) => (ujemanja.has(a.id) ? 1 : 0) - (ujemanja.has(b.id) ? 1 : 0))

  const scheduleLabels: Record<string, string> = { daily: 'Dnevno', weekly: 'Tedensko', monthly: 'Mesecno', custom: 'Po meri (cron)' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    // DODANO (19.8.2026): stran je bila EDINA v nastavitvah brez AppLayout -
    // uporabnik je izgubil stranski meni in se je lahko vrnil samo prek
    // gumba "Nazaj" ali brskalnika.
    <div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📧 E-mail skeniranje stroškov</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Samodejni uvoz stroškov iz e-poštnih prilog</div>

        {searchParams.get('email_connected') && (
          <div style={{ background: '#f0fdf4', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            ✓ E-mail racun uspesno povezan
          </div>
        )}
        {searchParams.get('email_error') && (
          <div style={{ background: '#fef2f2', color: '#991b1b', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            ⚠ Napaka pri povezovanju e-maila. Poskusite znova.
          </div>
        )}

        {/* POVEZANI RACUNI */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Povezani e-mail racuni</div>
            <a href="/api/auth/gmail/connect" style={{ background: '#0D1F12', color: '#fff', padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              + Poveži Gmail
            </a>
          </div>
          {connections.length === 0 ? (
            <div style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '20px 0' }}>Ni povezanih e-mail racunov</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {connections.map(c => (
                <div key={c.id} style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.email_address}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{c.provider === 'gmail' ? 'Gmail' : 'Outlook'} · Zadnje skeniranje: {c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleString('sl-SI') : 'še ni bilo'}</div>
                    </div>
                    <button onClick={() => disconnectEmail(c.id)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Prekini povezavo</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Urnik skeniranja</label>
                      <select value={c.scan_schedule} onChange={e => updateConnection(c.id, { scan_schedule: e.target.value })} disabled={savingId === c.id}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }}>
                        {Object.entries(scheduleLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Specificni posiljatelji (neobvezno)</label>
                      <input
                        defaultValue={(c.sender_filters || []).join(', ')}
                        onBlur={e => updateConnection(c.id, { sender_filters: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                        placeholder="npr. racuni@dobavitelj.si"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                    </div>
                  </div>
                  {c.scan_schedule === 'custom' && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>
                        Po meri urnik (cron izraz) — npr. "0 6 1 * *" = 1. v mesecu ob 6h, "0 6 1 1,4,7,10 *" = zacetek vsakega trimesecja
                      </label>
                      <input
                        defaultValue={c.custom_cron || ''}
                        onBlur={e => updateConnection(c.id, { custom_cron: e.target.value.trim() })}
                        placeholder="0 6 1 1,4,7,10 *"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                        Format: minuta ura dan-v-mesecu mesec dan-v-tednu. Priporocljivo za konec trimesecja (DDV zavezanci) ali konec leta.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {connections.length > 0 && (
            <>
              <button onClick={() => runScanNow()} disabled={scanning} style={{ marginTop: 16, width: '100%', padding: '11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                {scanning ? (napredek || 'Skeniram… (lahko traja nekaj minut)') : '🔍 Preveri zdaj (od zadnjega skena)'}
              </button>
              <div style={{ marginTop: 12, padding: 14, background: '#faf9f7', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Ali preveri dolocen datumski razpon</div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Za pregled za nazaj (npr. od začetka leta). Že obdelane priloge se preskočijo — dvojnikov ne bo.</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#999', display: 'block', marginBottom: 4 }}>Od</label>
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#999', display: 'block', marginBottom: 4 }}>Do</label>
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </div>
                  <button
                    onClick={() => rangeFrom && rangeTo && runScanNow({ from: rangeFrom, to: rangeTo })}
                    disabled={scanning || !rangeFrom || !rangeTo}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D1F12', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, opacity: (!rangeFrom || !rangeTo) ? 0.5 : 1 }}>
                    Skeniraj
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CAKALNA VRSTA ZA POTRDITEV */}
        {pending.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Najdeni stroški — čakajo na potrditev ({pending.length})</div>
                {ujemanja.size > 0 && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                    Novih: <strong>{pending.length - ujemanja.size}</strong> · že dodanih med stroške: <strong>{ujemanja.size}</strong>
                  </div>
                )}
              </div>
              {steviloGotovih > 0 && (
                <button onClick={odstraniZeDodane} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #A6D9C3', background: '#E1F5EE', color: '#0E5E3B', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
                  Odstrani že dodane iz pregleda ({steviloGotovih})
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {razvrsceni.map(item => {
                const u = ujemanja.get(item.id)
                return (
                <div key={item.id} style={{ border: `1px solid ${u ? (u.zanesljivost === 'gotovo' ? '#A6D9C3' : '#FDE68A') : '#f0f0f0'}`, borderRadius: 12, padding: 16, background: u ? (u.zanesljivost === 'gotovo' ? '#F4FBF8' : '#FFFCF0') : '#fff' }}>
                  {u && (
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: u.zanesljivost === 'gotovo' ? '#0E5E3B' : '#92400E' }}>
                      {u.zanesljivost === 'gotovo' ? '✓ Že dodano med stroške' : '⚠ Morda že dodano'}
                      <span style={{ fontWeight: 400, color: '#666' }}> — {u.vendor || 'strošek'}{u.datum ? ` · ${new Date(u.datum).toLocaleDateString('sl-SI')}` : ''} · €{formatEurNumber(u.znesek)}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    Iz e-maila: {item.email_from} · {item.email_subject}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
                    {item.extracted?._opomba && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#92400E' }}>ℹ️ {item.extracted._opomba}</div>}
                    <div><span style={{ fontSize: 10, color: '#999' }}>Dobavitelj</span><div style={{ fontSize: 13, fontWeight: 600 }}>{item.extracted.vendor}</div></div>
                    <div><span style={{ fontSize: 10, color: '#999' }}>Datum</span><div style={{ fontSize: 13, fontWeight: 600 }}>{item.extracted.date}</div></div>
                    <div><span style={{ fontSize: 10, color: '#999' }}>Skupaj</span><div style={{ fontSize: 13, fontWeight: 700 }}>€{formatEurNumber(Number(item.extracted.amount_total || 0))}</div></div>
                    {(() => {
                      const kat = izbraneKat[item.id] || normalizirajKategorijo(item.extracted.category)
                      return (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: 10, color: '#999' }}>Kategorija · konto {kontoZa(kat).konto}{kontoZa(kat).delez < 100 ? ` · davčno ${kontoZa(kat).delez} %` : ''}{item.extracted.category_reason ? ` · ${item.extracted.category_reason}` : ''}</span>
                          <select value={kat} onChange={e => setIzbraneKat(p => ({ ...p, [item.id]: e.target.value }))}
                            style={{ display: 'block', width: '100%', marginTop: 2, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 12, background: '#fff' }}>
                            {izbireKategorij(kat).map(c => <option key={c}>{c}</option>)}
                          </select>
                          {item.extracted.accountant_note && <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>Opomba za računovodjo: {item.extracted.accountant_note}</div>}
                        </div>
                      )
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => previewPdf(item)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>📄 Predogled</button>
                    {u ? (
                      <>
                        <button onClick={() => confirmPending(item)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Ni isto — vseeno dodaj</button>
                        <button onClick={() => rejectPending(item.id)} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#0E5E3B', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Že dodano — odstrani iz pregleda</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => rejectPending(item.id)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Zavrni</button>
                        <button onClick={() => confirmPending(item)} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#0D1F12', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Potrdi in dodaj med stroške</button>
                      </>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}

        {/* PRELET 334: kar ni slo v pregled, je vidno tukaj. */}
        {(ostali.ni_racun.length + ostali.napaka.length + ostali.rejected.length) > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 20, marginTop: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Ostale priloge iz e-pošte</div>
            {([
              ['ni_racun', '📄 Ni prepoznano kot račun', 'AI meni, da dokument ni račun (dobavnica, izpisek, potrdilo …). Če je, ga dodajte v pregled.'],
              ['napaka', '🔒 Zaklenjeni PDF in napake branja', 'PDF z geslom ne more prebrati nihče razen vas — odprite ga in strošek vnesite ročno. Napake branja se ob naslednjem skeniranju poskusijo znova.'],
              ['rejected', '✕ Zavrnjeni', 'Predlogi, ki ste jih zavrnili. Če ste kakšnega zavrnili po pomoti, ga obnovite.'],
            ] as const).filter(([k]) => ostali[k].length > 0).map(([k, naslov, opis]) => (
              <div key={k} style={{ borderTop: '1px solid #f3f3f3' }}>
                <button onClick={() => setOdprto(odprto === k ? null : k)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '10px 0', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>
                  <span>{naslov} ({ostali[k].length})</span><span>{odprto === k ? '▲' : '▼'}</span>
                </button>
                {odprto === k && (
                  <div style={{ paddingBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: '#888' }}>{opis}{k !== 'napaka' ? ' Prikazani so zadnjih 30 dni.' : ''}</div>
                      <button onClick={() => pocisti(k)} style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>Počisti vse</button>
                    </div>
                    {ostali[k].map((item: any) => {
                      const e = item.extracted || {}
                      const razlog = e._razlog === 'posiljatelj_vedno_zavrnjen' ? 'Samodejno — dokumente tega pošiljatelja vedno zavrnete' : e._razlog === 'pdf_zaklenjen' ? 'PDF je zaklenjen z geslom' : e._razlog === 'napaka_branja' ? 'Napaka branja — poskusi se znova ob naslednjem skeniranju' : e.document_type ? `AI: ${e.document_type}` : ''
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F7F6F2', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {e.vendor || item.email_from}{e.amount_total ? ` · €${formatEurNumber(Number(e.amount_total))}` : ''}{e.date ? ` · ${e.date}` : ''}
                            </div>
                            <div style={{ color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.email_subject} · {item.attachment_name}{razlog ? ` · ${razlog}` : ''}
                            </div>
                          </div>
                          <button onClick={() => previewPdf(item)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>📄</button>
                          {k !== 'napaka' ? (
                            <button onClick={() => vPregled(item)} style={{ padding: '6px 10px', borderRadius: 7, border: 0, background: '#0D1F12', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>{k === 'rejected' ? 'Obnovi' : 'V pregled'}</button>
                          ) : null}
                          {k !== 'rejected' && (
                            <button onClick={() => odstraniOstalo(item)} title="Odstrani" style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#999' }}>✕</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmailSkeniranjeSekcija() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nalagam...</div>}>
      <EmailSkeniranjeContent />
    </Suspense>
  )
}
