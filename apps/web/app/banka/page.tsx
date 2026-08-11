'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// ================================================================
// FORMATI SLOVENSKIH BANK
// Vsaka banka ima drugačen CSV format — tukaj so vsi podprti
// ================================================================
const BANK_FORMATS: Record<string, {
  name: string
  delimiter: string
  dateCol: number
  descCol: number
  creditCol: number
  debitCol: number | null
  amountCol: number | null
  referenceCol: number | null
  skipRows: number
  dateFormat: 'dd.mm.yyyy' | 'yyyy-mm-dd' | 'dd/mm/yyyy'
  encoding: 'utf-8' | 'windows-1250'
}> = {
  nlb: {
    name: 'NLB', delimiter: ';', dateCol: 0, descCol: 4,
    creditCol: 6, debitCol: 7, amountCol: null, referenceCol: 3,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'windows-1250',
  },
  skb: {
    name: 'SKB', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 3, debitCol: 4, amountCol: null, referenceCol: 5,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  sparkasse: {
    name: 'Sparkasse', delimiter: ';', dateCol: 0, descCol: 3,
    creditCol: 5, debitCol: null, amountCol: 4, referenceCol: 2,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  nova_kbm: {
    name: 'Nova KBM', delimiter: ';', dateCol: 0, descCol: 3,
    creditCol: 5, debitCol: 6, amountCol: null, referenceCol: 4,
    skipRows: 2, dateFormat: 'dd.mm.yyyy', encoding: 'windows-1250',
  },
  addiko: {
    name: 'Addiko Bank', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 4, debitCol: 5, amountCol: null, referenceCol: 3,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  delavska: {
    name: 'Delavska hranilnica', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 4, debitCol: 5, amountCol: null, referenceCol: 3,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  bks: {
    name: 'BKS Bank', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 4, debitCol: null, amountCol: 3, referenceCol: null,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  otp: {
    name: 'OTP Banka', delimiter: ';', dateCol: 0, descCol: 3,
    creditCol: 5, debitCol: 6, amountCol: null, referenceCol: 4,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  intesa: {
    name: 'Intesa Sanpaolo', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 4, debitCol: 5, amountCol: null, referenceCol: 3,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
  gorenjska: {
    name: 'Gorenjska banka', delimiter: ';', dateCol: 0, descCol: 2,
    creditCol: 4, debitCol: 5, amountCol: null, referenceCol: 3,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'windows-1250',
  },
  auto: {
    name: 'Samodejno zaznaj', delimiter: ';', dateCol: 0, descCol: 1,
    creditCol: 2, debitCol: null, amountCol: 3, referenceCol: null,
    skipRows: 1, dateFormat: 'dd.mm.yyyy', encoding: 'utf-8',
  },
}

interface BankTransaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  reference: string
  matched_invoice: any | null
  selected: boolean
  raw: string
  isInternal?: boolean
  bookCategory?: string
}

// Prepozna notranji promet (POS gotovinski polog/dvig, prenos med lastnimi
// racuni) - ze steto prek POS Z-porocila ali ni nov prihodek/odhodek, zato
// se NE knjizi v KPO. Uporabnik lahko oznako rocno popravi (glej toggle v UI).
function isInternalTransfer(description: string): boolean {
  const d = (description || '').toUpperCase()
  return d.includes('POLOG GOTOVINE') || d.includes('DVIG GOTOVINE')
    || d.includes('PRENOS MED') || d.includes('LASTNI PRENOS')
    || d.includes('POLOG NA BLAGAJN') || d.includes('GOTOVINSKI POLOG')
}

const INCOME_CATEGORIES = ['Prodaja blaga/storitev', 'Obresti', 'Drugo']
const EXPENSE_CATEGORIES = [
  'Pisarniški material', 'Komunikacije', 'Programska oprema',
  'Transport', 'Prehrana', 'Izobraževanje', 'Marketing',
  'Oprema', 'Storitve', 'Bančne provizije', 'Drugo'
]

// Varna base64 pretvorba za VELIKE datoteke (24.7.2026) - btoa(String.
// fromCharCode(...bytes)) povzroci "Maximum call stack size exceeded" pri
// vecjih PDF-jih, ker razsiritev (...) velikega polja preseze JS-ovo
// omejitev stevila argumentov funkcije. Pretvarja po majhnih koscih (32KB).
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk) as any)
  }
  return btoa(binary)
}

// Parser za standarden ISO 20022 camt.053 XML bancni izpisek (24.7.2026).
// Vecina slovenskih/EU bank to ponuja kot alternativo CSV izvozu. Uporabi
// getElementsByTagName (brez namespace predpone), da deluje ne glede na
// tocno razlicico namespace URI-ja, ki ga posamezna banka uporablja.
function parseCamt053(xmlText: string): BankTransaction[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  const entries = Array.from(doc.getElementsByTagName('Ntry'))
  const out: BankTransaction[] = []

  for (const entry of entries) {
    const amtEl = entry.getElementsByTagName('Amt')[0]
    const amount = amtEl ? parseFloat(amtEl.textContent || '0') : 0
    if (!amount) continue

    const indEl = entry.getElementsByTagName('CdtDbtInd')[0]
    const type: 'credit' | 'debit' = indEl?.textContent === 'DBIT' ? 'debit' : 'credit'

    // Datum: najprej BookgDt, ce ni potem ValDt
    const bookgDt = entry.getElementsByTagName('BookgDt')[0]
    const valDt = entry.getElementsByTagName('ValDt')[0]
    const dateEl = (bookgDt || valDt)?.getElementsByTagName('Dt')[0]
      || (bookgDt || valDt)?.getElementsByTagName('DtTm')[0]
    const date = (dateEl?.textContent || '').slice(0, 10)
    if (!date) continue

    // Opis: RmtInf/Ustrd, ce ni potem AddtlNtryInf
    const ustrd = entry.getElementsByTagName('Ustrd')[0]
    const addtl = entry.getElementsByTagName('AddtlNtryInf')[0]
    const description = (ustrd?.textContent || addtl?.textContent || '').trim()

    // Referenca: EndToEndId, ce ni potem AcctSvcrRef
    const e2e = entry.getElementsByTagName('EndToEndId')[0]
    const acctRef = entry.getElementsByTagName('AcctSvcrRef')[0]
    const reference = (e2e?.textContent || acctRef?.textContent || '').trim()

    out.push({
      date,
      description,
      amount,
      type,
      reference,
      matched_invoice: null,
      selected: true,
      raw: entry.outerHTML || '',
    })
  }
  return out
}

function parseDate(str: string, format: string): string {
  const clean = str.trim().replace(/"/g, '')
  if (format === 'dd.mm.yyyy') {
    const [d, m, y] = clean.split('.')
    if (!d || !m || !y) return clean
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (format === 'dd/mm/yyyy') {
    const [d, m, y] = clean.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return clean
}

function parseAmount(str: string): number {
  if (!str) return 0
  return parseFloat(str.replace(/"/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0
}

function parseCSV(text: string, bankKey: string): BankTransaction[] {
  const format = BANK_FORMATS[bankKey] ?? BANK_FORMATS.auto
  const lines = text.split('\n').filter(l => l.trim())
  const transactions: BankTransaction[] = []

  for (let i = format.skipRows; i < lines.length; i++) {
    const line = lines[i]
    const cols = line.split(format.delimiter).map(c => c.replace(/"/g, '').trim())
    if (cols.length < 3) continue

    const dateRaw = cols[format.dateCol] ?? ''
    if (!dateRaw || dateRaw.toLowerCase().includes('datum')) continue

    const date = parseDate(dateRaw, format.dateFormat)
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue

    const desc = cols[format.descCol] ?? ''
    const reference = format.referenceCol !== null ? (cols[format.referenceCol] ?? '') : ''

    let amount = 0
    let type: 'credit' | 'debit' = 'credit'

    if (format.amountCol !== null) {
      amount = parseAmount(cols[format.amountCol] ?? '0')
      type = amount >= 0 ? 'credit' : 'debit'
      amount = Math.abs(amount)
    } else {
      const credit = parseAmount(cols[format.creditCol] ?? '0')
      const debit = format.debitCol !== null ? parseAmount(cols[format.debitCol] ?? '0') : 0
      if (credit > 0) { amount = credit; type = 'credit' }
      else if (debit > 0) { amount = debit; type = 'debit' }
      else continue
    }

    if (amount === 0) continue

    transactions.push({ date, description: desc, amount, type, reference, matched_invoice: null, selected: type === 'credit', raw: line })
  }

  return transactions
}

// Pametno ujemanje transakcij z računi
function matchTransactions(transactions: BankTransaction[], invoices: any[]): BankTransaction[] {
  return transactions.map(t => {
    if (t.type !== 'credit') return t

    // Poskusi ujeti po znesku + datumu (±5 dni)
    const tDate = new Date(t.date)
    const matched = invoices.find(inv => {
      const amountMatch = Math.abs(Number(inv.amount_total) - t.amount) < 0.02
      const invDate = new Date(inv.due_date)
      const daysDiff = Math.abs((tDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24))
      const refMatch = t.reference && inv.invoice_number && (t.reference.includes(inv.invoice_number) || t.description.includes(inv.invoice_number))
      return amountMatch && (daysDiff <= 10 || refMatch)
    })

    return { ...t, matched_invoice: matched ?? null }
  })
}

export default function BankaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [selectedBank, setSelectedBank] = useState('auto') // POPRAVLJENO 30.7.2026: prej trdo kodirano 'delavska' - videti kot ostanek testiranja
  const [stats, setStats] = useState({ matched: 0, unmatched: 0, totalIn: 0, totalOut: 0 })
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)

      const { data: inv } = await supabase.from('issued_invoices').select('*').eq('org_id', member.org_id).eq('status', 'sent').order('due_date', { ascending: true })
      setInvoices(inv ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  // Razclenjeno v locen helper (24.7.2026), da ga lahko klicemo vec-krat
  // zaporedoma pri nalaganju vec datotek naenkrat.
  async function parseOneFile(file: File): Promise<BankTransaction[]> {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isXml = file.type === 'application/xml' || file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')

    if (isPdf) {
      const maxPdfBytes = 4 * 1024 * 1024
      if (file.size > maxPdfBytes) {
        showToast(`${file.name}: PDF je prevelik (${(file.size / 1024 / 1024).toFixed(1)}MB). Največja dovoljena velikost je 4MB.`)
        return []
      }
      const arrayBuffer = await file.arrayBuffer()
      const pdfBase64 = arrayBufferToBase64(arrayBuffer)
      const res = await fetch('/api/banka/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(`${file.name}: ${data.error || 'Napaka pri branju PDF izpiska'}`)
        return []
      }
      return (data.transactions || []).map((t: any) => ({
        date: t.date,
        description: t.description || '',
        amount: Number(t.amount) || 0,
        type: t.type === 'debit' ? 'debit' : 'credit',
        reference: t.reference || '',
        matched_invoice: null,
        selected: true,
        raw: JSON.stringify(t),
      }))
    }

    if (isXml) {
      const text = await file.text()
      const parsed = parseCamt053(text)
      if (parsed.length === 0) {
        showToast(`${file.name}: XML ni prepoznan kot veljaven camt.053 izpisek.`)
      }
      return parsed
    }

    const text = await file.text()
    return parseCSV(text, selectedBank)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[]
    if (files.length === 0) return
    setProcessing(true)

    try {
      // Vec datotek naenkrat (24.7.2026): obstaja ROCNI pregled pred
      // potrditvijo (applyImport spodaj), zato tu SAMO zdruzimo transakcije
      // iz vseh datotek v EN seznam - ne knjizimo samodejno kot pri
      // strosSkih/karticah (kjer takega pregleda ni).
      let parsed: BankTransaction[] = []
      for (const file of files) {
        const fileTransactions = await parseOneFile(file)
        parsed = parsed.concat(fileTransactions)
      }

      if (parsed.length === 0) {
        showToast('Ni bilo mogoče prebrati transakcij. Preverite format banke.')
        setProcessing(false)
        return
      }

      const matched = matchTransactions(parsed, invoices).map(t => ({
        ...t,
        isInternal: isInternalTransfer(t.description),
        // Privzeta kategorija "Drugo" (25.7.2026) - Nik ne rabi klikati
        // vsake vrstice posebej, ce mu privzeta kategorija ustreza.
        bookCategory: t.matched_invoice ? undefined : 'Drugo',
      }))
      setTransactions(matched)

      const credits = matched.filter(t => t.type === 'credit')
      const debits = matched.filter(t => t.type === 'debit')
      setStats({
        matched: credits.filter(t => t.matched_invoice).length,
        unmatched: credits.filter(t => !t.matched_invoice).length,
        totalIn: credits.reduce((s, t) => s + t.amount, 0),
        totalOut: debits.reduce((s, t) => s + t.amount, 0),
      })
      setStep('review')
    } catch (e: any) {
      showToast(`Napaka pri branju: ${e.message}`)
    }
    setProcessing(false)
  }

  function toggleTransaction(i: number) {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, selected: !t.selected } : t))
  }

  async function applyImport() {
    if (!orgId) return
    setImporting(true)

    let bookedCount = 0
    let skippedNoCategory = 0

    for (const t of transactions) {
      if (!t.selected) continue
      if (t.isInternal) continue // notranji promet - ne knjizi

      if (t.type === 'credit' && t.matched_invoice) {
        // Predal 1: ujeto z racunom - samodejno knjizi s pravo DDV razclenitvijo
        const inv = t.matched_invoice
        const alreadyPaid = inv.status === 'paid'
        await supabase.from('issued_invoices').update({
          status: 'paid',
          paid_at: new Date(t.date).toISOString(),
          paid_amount: t.amount,
        }).eq('id', inv.id)

        // VAROVALKA: ce je racun ZE bil placan (npr. prekrivajoc uvoz), ne
        // podvoji KPO vnosa.
        if (!alreadyPaid) {
          // POPRAVLJENO (26.7.2026): invoice_id doda, da KPO stran lahko
          // izloci podvojen prikaz (izdan racun + to placilo, ista transakcija).
          await supabase.from('kpo_entries').insert({
            org_id: orgId,
            entry_date: t.date,
            description: `Plačilo računa ${inv.invoice_number} — ${inv.client_name || ''}`,
            entry_type: 'income',
            income: Number(inv.amount_net) || t.amount,
            expense: 0,
            vat_in: 0,
            vat_out: Number(inv.vat_amount) || 0,
            category: 'Prodaja blaga/storitev',
            notes: `Bančni uvoz · ${t.reference || ''}`,
            invoice_id: inv.id,
          })
          bookedCount++
        }
      } else if (t.bookCategory) {
        // Predal 3: neujeto, rocno izbrana kategorija - knjizi celoten
        // znesek (brez DDV razclenitve - iz bancnega podatka je ni mogoce
        // zanesljivo izracunati).
        await supabase.from('kpo_entries').insert({
          org_id: orgId,
          entry_date: t.date,
          description: t.description || (t.type === 'credit' ? 'Bančni priliv' : 'Bančni odliv'),
          entry_type: t.type === 'credit' ? 'income' : 'expense',
          income: t.type === 'credit' ? t.amount : 0,
          expense: t.type === 'debit' ? t.amount : 0,
          vat_in: 0,
          vat_out: 0,
          category: t.bookCategory,
          notes: `Bančni uvoz · ${t.reference || ''}`,
        })
        bookedCount++
      } else {
        // Neujeto, brez izbrane kategorije - PRESKOCI (varovalka pred
        // napacno davcno osnovo)
        skippedNoCategory++
      }
    }

    const msg = skippedNoCategory > 0
      ? `Poknjiženih ${bookedCount} transakcij. ${skippedNoCategory} preskočenih - izberite kategorijo za knjiženje.`
      : `Poknjiženih ${bookedCount} transakcij.`
    showToast(msg)
    setStep('done')
    setImporting(false)
  }

  function toggleInternal(i: number) {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, isInternal: !t.isInternal } : t))
  }

  function setBookCategory(i: number, category: string) {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, bookCategory: category } : t))
  }

  function reset() {
    setTransactions([])
    setStep('upload')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  // POPRAVLJENO (25.7.2026): prej je gumb spodaj stel SAMO ujete racune -
  // ce ni bilo ujemanj, je bil "0" in onemogocen, kljub temu da
  // applyImport() zdaj knjizi TUDI kategorizirane vrstice.
  const willBookCount = transactions.filter(t => t.selected && !t.isInternal && (t.matched_invoice || t.bookCategory)).length

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Bančni uvoz</div>
          </div>
          <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* KORAK 1 — UPLOAD */}
        {step === 'upload' && (
          <>
            <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#0E5E3B', lineHeight: 1.6 }}>
              💡 Izvozite CSV izpisek iz vaše spletne banke in ga naložite tukaj. Računko bo samodejno prepoznal transakcije in jih ujel z vašimi računi.
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 16 }}>1. Izberite banko</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 20 }}>
                {Object.entries(BANK_FORMATS).map(([key, bank]) => (
                  <button key={key} onClick={() => setSelectedBank(key)} style={{ padding: '10px 14px', borderRadius: 10, border: selectedBank === key ? '2px solid #0D1F12' : '0.5px solid rgba(0,0,0,0.12)', background: selectedBank === key ? '#0D1F12' : '#fff', color: selectedBank === key ? '#fff' : '#0D1F12', fontSize: 13, fontWeight: selectedBank === key ? 600 : 400, cursor: 'pointer', textAlign: 'left' }}>
                    {key === 'auto' ? '🔍 ' : '🏦 '}{bank.name}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 12 }}>2. Naložite izpisek (CSV, XML ali PDF) - lahko več naenkrat</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.6 }}>
                <strong>{BANK_FORMATS[selectedBank]?.name}</strong> → Spletna banka → Račun → Promet → Izvozi CSV
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed rgba(0,0,0,0.15)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const file = e.dataTransfer.files[0]
                  if (file) { const dt = new DataTransfer(); dt.items.add(file); if (fileRef.current) { fileRef.current.files = dt.files; handleFile({ target: fileRef.current } as any) } }
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 4 }}>
                  {processing ? 'Analiziram...' : 'Kliknite ali povlecite CSV / XML / PDF datoteke (lahko izberete več)'}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>Podprte: .csv, .txt, .xml, .pdf</div>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx,.xml,.pdf" multiple onChange={handleFile} style={{ display: 'none' }} />
              </div>
            </div>

            {/* Navodila po bankah */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>Kako izvoziti izpisek</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 Delavska hranilnica</strong><br />
                  Spletna banka → Računi → Promet → Izvoz → CSV
                </div>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 NLB</strong><br />
                  Klikni → Računi → Promet → Prenesi izpisek → CSV
                </div>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 SKB</strong><br />
                  NetBanka → Računi → Izpis prometa → Export CSV
                </div>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 Nova KBM</strong><br />
                  Bank@Net → Račun → Promet → Izvoz → CSV
                </div>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 Sparkasse</strong><br />
                  Spletna banka → Prometi → Izvozi → CSV
                </div>
                <div>
                  <strong style={{ color: '#0D1F12' }}>🏦 Addiko</strong><br />
                  Addiko Online → Računi → Promet → Izvozi
                </div>
              </div>
            </div>
          </>
        )}

        {/* KORAK 2 — PREGLED */}
        {step === 'review' && (
          <>
            {/* Statistike */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Ujeto z računi', value: stats.matched, color: '#1D9E75', bg: '#E1F5EE' },
                { label: 'Neujeto', value: stats.unmatched, color: '#D97706', bg: '#FEF3C7' },
                { label: 'Skupaj prihodki', value: `€${Math.round(stats.totalIn)}`, color: '#1D9E75', bg: '#fff' },
                { label: 'Skupaj odhodki', value: `€${Math.round(stats.totalOut)}`, color: '#DC2626', bg: '#fff' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Tabela transakcij */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Transakcije ({transactions.length})</div>
                <div style={{ fontSize: 12, color: '#888' }}>☑ = bo označeno kot plačano</div>
              </div>
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F7F6F2', zIndex: 1 }}>
                    <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                      {['', 'Datum', 'Opis', 'Referenca', 'Znesek', 'Ujeto z računom'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.04)', background: t.matched_invoice ? '#F0FDF4' : '#fff', opacity: t.type === 'debit' ? 0.6 : 1 }}>
                        <td style={{ padding: '10px 14px', width: 40 }}>
                          <input type="checkbox" checked={t.selected} onChange={() => toggleTransaction(i)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('sl-SI')}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#0D1F12', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{t.reference || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: t.type === 'credit' ? '#1D9E75' : '#DC2626', whiteSpace: 'nowrap' }}>
                          {t.type === 'credit' ? '+' : '-'}€{t.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>
                          {t.isInternal ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#888' }}>Notranji promet (ne knjiži se)</span>
                              <button onClick={() => toggleInternal(i)} style={{ fontSize: 10, color: '#888', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' }}>popravi</button>
                            </span>
                          ) : t.matched_invoice ? (
                            <span style={{ color: '#1D9E75', fontWeight: 600 }}>✓ {t.matched_invoice.invoice_number} — {t.matched_invoice.client_name}</span>
                          ) : (
                            <select
                              value={t.bookCategory || ''}
                              onChange={e => setBookCategory(i, e.target.value)}
                              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: t.bookCategory ? '#0D1F12' : '#D97706' }}
                            >
                              <option value="">Izberi kategorijo…</option>
                              {(t.type === 'credit' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={reset} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '11px 20px', fontSize: 13, cursor: 'pointer' }}>← Naloži drug izpisek</button>
              <button onClick={applyImport} disabled={importing || willBookCount === 0} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (importing || willBookCount === 0) ? 0.5 : 1 }}>
                {importing ? 'Knjižim...' : `✓ Poknjiži ${willBookCount} ${willBookCount === 1 ? 'transakcijo' : 'transakcij'}`}
              </button>
            </div>
          </>
        )}

        {/* KORAK 3 — DONE */}
        {step === 'done' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Uvoz zaključen</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Računi so označeni kot plačani</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={reset} style={{ background: '#F7F6F2', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}>Nov uvoz</button>
              <Link href="/invoices" style={{ background: '#0D1F12', color: '#fff', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>Pregled računov →</Link>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
    </AppLayout>
  )
}
