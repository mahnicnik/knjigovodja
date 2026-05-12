'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import LegalUpdatesWidget from '@/components/LegalUpdatesWidget'
import { calculateNetIncome, projectMonthlyRevenue, checkNormirancePragRisk, getTaxSystemLabel, type LegalForm, type TaxSystem } from '@/lib/tax-calculator'
import { generateCashFlow, getChartMaxValue, type OpenInvoice } from '@/lib/cash-flow'

/* ================================================================
   RAČUNKO DASHBOARD V6 — Faza 2
   ================================================================
   Strategy:
   - Standalone layout (NOT wrapped in AppLayout)
   - Own thin rail sidebar (8 icons)
   - Header with density + dark mode toggles
   - REAL data everywhere except AI proactive (still DEMO)
   - Tax calculator powers Hero "Čisti prihodek"
   - Cash flow generator powers chart
   ================================================================ */

const MONTHS_SHORT = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec']
const MONTHS_LONG = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
const DAYS_LONG = ['nedelja','ponedeljek','torek','sreda','četrtek','petek','sobota']

/* ---------- THIN RAIL navigation items ---------- */
const RAIL_ITEMS = [
  { href: '/dashboard',  label: 'Pregled',         icon: 'home',     badge: false },
  { href: '/invoices',   label: 'Računi',          icon: 'invoices', badge: true  },
  { href: '/expenses',   label: 'Stroški',         icon: 'expenses', badge: false },
  { href: '/ddv',        label: 'Davki',           icon: 'taxes',    badge: false },
  { href: '/statistika', label: 'Statistika',      icon: 'stats',    badge: false },
  { href: '/ai',         label: 'AI računovodja',  icon: 'ai',       badge: false },
  { href: '/rokovnik',   label: 'Koledar',         icon: 'calendar', badge: false },
]

/* ---------- QUICK ACTIONS library ---------- */
const ALL_QUICK_ACTIONS = [
  { href:'/invoices/new', icon:'plus',     label:'Nov račun',       sub:'Izstavite takoj' },
  { href:'/scan',         icon:'scan',     label:'Skeniraj račun',  sub:'AI OCR' },
  { href:'/prispevki',    icon:'pay',      label:'Prispevki QR',    sub:'ZPIZ + ZZZS' },
  { href:'/expenses',     icon:'receipt',  label:'Dodaj strošek',   sub:'Prejeti računi' },
  { href:'/ai',           icon:'ai',       label:'AI računovodja',  sub:'Vprašajte karkoli' },
  { href:'/statistika',   icon:'stats',    label:'Statistika',      sub:'Pregled leta' },
  { href:'/blagajna',     icon:'pos',      label:'Blagajna',        sub:'POS terminal' },
  { href:'/kpo',          icon:'book',     label:'KPO knjiga',      sub:'Evidenca' },
  { href:'/ddv',          icon:'percent',  label:'DDV obračun',     sub:'Mesečni DDV' },
  { href:'/invoices',     icon:'list',     label:'Vsi računi',      sub:'Pregled' },
  { href:'/rokovnik',     icon:'calendar', label:'Rokovnik',        sub:'Datumi' },
  { href:'/zaloga',       icon:'box',      label:'Zaloga',          sub:'Upravljanje' },
]
const DEFAULT_QA_HREFS = ['/invoices/new', '/scan', '/prispevki', '/expenses', '/ai', '/statistika']

/* ---------- ICON COMPONENT (inline SVGs) ---------- */
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const props = {
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'home':     return <svg {...props}><path d="M3 12 12 4l9 8"/><path d="M5 11v8h14v-8"/></svg>
    case 'invoices': return <svg {...props}><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 9h6M9 13h6"/></svg>
    case 'expenses': return <svg {...props}><path d="M4 7h16M4 12h16M4 17h10"/></svg>
    case 'taxes':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M8 14l8-8M9 9h.01M15 15h.01"/></svg>
    case 'stats':    return <svg {...props}><path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/></svg>
    case 'ai':       return <svg {...props}><path d="M12 3v3M5 6l2 2M19 6l-2 2M3 13h3M18 13h3M12 21v-3"/><circle cx="12" cy="13" r="5"/></svg>
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 5V3M16 5V3"/></svg>
    case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    case 'search':   return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    case 'mic':      return <svg {...props}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
    case 'sun':      return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    case 'moon':     return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    case 'bell':     return <svg {...props}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>
    case 'scan':     return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/></svg>
    case 'pay':      return <svg {...props}><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/><path d="M16 17l3 3 5-5"/></svg>
    case 'receipt':  return <svg {...props}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>
    case 'pos':      return <svg {...props}><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18M8 21h8M12 17v4"/></svg>
    case 'book':     return <svg {...props}><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/></svg>
    case 'percent':  return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M8 16l8-8M9 9h.01M15 15h.01"/></svg>
    case 'list':     return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
    case 'box':      return <svg {...props}><path d="M21 8l-9 5-9-5"/><path d="M3 8v10l9 5 9-5V8l-9-5z"/></svg>
    case 'edit':     return <svg {...props}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
    case 'check':    return <svg {...props}><path d="M5 13l4 4L19 7"/></svg>
    case 'arrow-right': return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>
    case 'close':    return <svg {...props}><path d="M18 6L6 18M6 6l12 12"/></svg>
    case 'd1':       return <svg {...props} fill="currentColor" stroke="none"><rect x="2" y="3" width="12" height="3" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/></svg>
    case 'd2':       return <svg {...props} fill="currentColor" stroke="none"><rect x="2" y="3" width="12" height="2" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/></svg>
    case 'd3':       return <svg {...props} fill="currentColor" stroke="none"><rect x="2" y="3" width="12" height="1.4" rx="0.6"/><rect x="2" y="6" width="12" height="1.4" rx="0.6"/><rect x="2" y="9" width="12" height="1.4" rx="0.6"/><rect x="2" y="12" width="12" height="1.4" rx="0.6"/></svg>
    default: return null
  }
}

export default function DashboardPage() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [org, setOrg] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'light'|'dark'>('light')
  const [density, setDensity] = useState<'comfortable'|'compact'|'power'>('comfortable')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceStage, setVoiceStage] = useState<'listening'|'understood'>('listening')
  const [upnOpen, setUpnOpen] = useState(false)
  const [toasts, setToasts] = useState<{id:number;text:string}[]>([])
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [showQAModal, setShowQAModal] = useState(false)
  const [qaHrefs, setQaHrefs] = useState<string[]>(DEFAULT_QA_HREFS)
  const [qaHrefsDraft, setQaHrefsDraft] = useState<string[]>(DEFAULT_QA_HREFS)
  const [savingQA, setSavingQA] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteSelectedIdx, setPaletteSelectedIdx] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [draggedQaIdx, setDraggedQaIdx] = useState<number | null>(null)

  const [data, setData] = useState({
    revenue: 0, expenses: 0, vatDue: 0,
    unpaidCount: 0, unpaidAmount: 0,
    overdueAmount: 0, overdueCount: 0,
    yearRevenue: 0,
    recentInvoices: [] as any[],
    openInvoices: [] as OpenInvoice[],
    hasEmployees: false,
    hasClients: false,
    hasInvoices: false,
    hasExpenses: false,
    legalForm: null as LegalForm | null,
    taxSystem: null as TaxSystem | null,
  })

  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  const today = now.toISOString().split('T')[0]
  const dayOfMonth = now.getDate()
  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`
  const monthEnd = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year,month+1,0).getDate()}`
  const yearStart = `${year}-01-01`
  const daysUntil15 = 15 - dayOfMonth
  const daysUntil25 = 25 - dayOfMonth
  const daysUntilEndMonth = new Date(year,month+1,0).getDate() - dayOfMonth
  const ddvMonths = [4,7,10,1] // jan, apr, jul, oct (kvartal sledeč mesec)
  const showDDVAlert = ddvMonths.includes(month+1)
  const ddvQuarter = Math.ceil((month+1)/3)

  /* ============ THEME / DENSITY load from localStorage ============ */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = localStorage.getItem('racunko_theme') as 'light'|'dark' | null
    const d = localStorage.getItem('racunko_density') as 'comfortable'|'compact'|'power' | null
    if (t) setTheme(t)
    if (d) setDensity(d)
  }, [])

  /* ============ KEYBOARD SHORTCUTS ============ */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K → odpri command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        setPaletteQuery('')
        setPaletteSelectedIdx(0)
      }
      // Escape zapre vse
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setVoiceOpen(false)
        setUpnOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ============ VOICE MOCK ============ */
  useEffect(() => {
    if (voiceOpen) {
      setVoiceStage('listening')
      const t = setTimeout(() => setVoiceStage('understood'), 2400)
      return () => clearTimeout(t)
    }
  }, [voiceOpen])

  function applyTheme(t: 'light'|'dark') {
    setTheme(t)
    localStorage.setItem('racunko_theme', t)
  }
  function applyDensity(d: 'comfortable'|'compact'|'power') {
    setDensity(d)
    localStorage.setItem('racunko_density', d)
  }

  /* ============ DATA LOAD ============ */
  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: member } = await supabase
        .from('org_members').select('organizations(*)')
        .eq('user_id', user.id).maybeSingle()

      if (!member || !(member as any).organizations) {
        window.location.href = '/onboarding'
        return
      }
      const o = (member as any).organizations
      setOrg(o)

      const { data: prefs } = await supabase
        .from('user_preferences').select('quick_actions')
        .eq('user_id', user.id).maybeSingle()
      if (prefs?.quick_actions && prefs.quick_actions.length > 0) {
        setQaHrefs(prefs.quick_actions)
        setQaHrefsDraft(prefs.quick_actions)
      }

      // Load all data in parallel
      const [invRes, expRes, empRes, cliRes, prefsRes2] = await Promise.all([
        supabase.from('issued_invoices').select('*').eq('org_id', o.id).neq('status','draft'),
        supabase.from('receipts').select('*').eq('org_id', o.id),
        supabase.from('employees').select('id').eq('org_id', o.id).eq('status','active'),
        supabase.from('clients').select('id').eq('org_id', o.id).limit(1),
        supabase.from('user_preferences').select('onboarding_answers').eq('user_id', user.id).maybeSingle(),
      ])

      const invoices = invRes.data || []
      const receipts = expRes.data || []
      const monthInv = invoices.filter((i:any) => i.issue_date >= monthStart && i.issue_date <= monthEnd)
      const yearInv = invoices.filter((i:any) => i.issue_date >= yearStart)
      const revenue = monthInv.reduce((s:number,i:any) => s + Number(i.amount_net), 0)
      const yearRevenue = yearInv.reduce((s:number,i:any) => s + Number(i.amount_net), 0)
      const expenses = receipts.filter((r:any) => r.receipt_date >= monthStart && r.receipt_date <= monthEnd).reduce((s:number,r:any) => s + Number(r.amount_net), 0)
      const vatOut = invoices.reduce((s:number,i:any) => s + Number(i.vat_amount), 0)
      const vatIn = receipts.reduce((s:number,r:any) => s + Number(r.vat_amount), 0)
      const unpaid = invoices.filter((i:any) => i.status === 'sent')
      const overdue = invoices.filter((i:any) => i.status === 'sent' && i.due_date < today)
      const recent = [...invoices].sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
      const openInvs: OpenInvoice[] = unpaid.map((i:any) => ({
        id: i.id,
        due_date: i.due_date,
        amount_total: Number(i.amount_total),
        client_name: i.client_name,
        invoice_number: i.invoice_number,
      }))

      // Determine legal form from onboarding answers
      const onboardingAnswers = prefsRes2.data?.onboarding_answers as Record<string, any> | undefined
      const legalForm: LegalForm | null = onboardingAnswers?.tip === 'sp' ? 'sp'
        : onboardingAnswers?.tip === 'doo' ? 'doo'
        : onboardingAnswers?.tip === 'zavod' ? 'zavod'
        : null

      setData({
        revenue, expenses,
        vatDue: Math.max(0, vatOut - vatIn),
        unpaidCount: unpaid.length,
        unpaidAmount: unpaid.reduce((s:number,i:any) => s + Number(i.amount_total), 0),
        overdueAmount: overdue.reduce((s:number,i:any) => s + Number(i.amount_total), 0),
        overdueCount: overdue.length,
        yearRevenue,
        recentInvoices: recent,
        openInvoices: openInvs,
        hasEmployees: (empRes.data || []).length > 0,
        hasClients: (cliRes.data || []).length > 0,
        hasInvoices: invoices.length > 0,
        hasExpenses: receipts.length > 0,
        legalForm,
        taxSystem: (o.tax_system as TaxSystem) || null,
      })
      setLoading(false)
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setLoading(false)
    }
  }

  /* ============ TOAST ============ */
  function showToast(text: string) {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2400)
  }

  /* ============ QUICK ACTIONS ============ */
  function toggleDraftQA(href: string) {
    setQaHrefsDraft(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href])
  }
  async function saveQA() {
    if (!userId) return
    setSavingQA(true)
    await supabase.from('user_preferences').upsert(
      { user_id: userId, quick_actions: qaHrefsDraft, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    setQaHrefs(qaHrefsDraft)
    setSavingQA(false)
    setShowQAModal(false)
    showToast('Hitre akcije shranjene')
  }
  const activeQA = qaHrefs.map(h => ALL_QUICK_ACTIONS.find(a => a.href === h)).filter(Boolean) as typeof ALL_QUICK_ACTIONS

  /* ============ COMMAND PALETTE ITEMS ============ */
  const paletteItems = useMemo(() => {
    return [
      // Hitra dejanja
      { type: 'action', icon: 'plus',     label: 'Nov račun',           sub: 'Izstavi nov izhodni račun',  href: '/invoices/new' },
      { type: 'action', icon: 'scan',     label: 'Skeniraj račun',      sub: 'AI OCR za prejete račune',   href: '/scan' },
      { type: 'action', icon: 'receipt',  label: 'Dodaj strošek',       sub: 'Ročno vnesi strošek',        href: '/expenses' },
      { type: 'action', icon: 'pay',      label: 'Plačaj prispevke',    sub: 'UPN za s.p. prispevke',      href: '/prispevki' },
      // Pregled
      { type: 'nav',    icon: 'home',     label: 'Dashboard',           sub: 'Domača stran',               href: '/dashboard' },
      { type: 'nav',    icon: 'invoices', label: 'Vsi računi',          sub: 'Pregled izdanih računov',    href: '/invoices' },
      { type: 'nav',    icon: 'expenses', label: 'Vsi stroški',         sub: 'Pregled prejetih računov',   href: '/expenses' },
      { type: 'nav',    icon: 'stats',    label: 'Statistika',          sub: 'Letni pregled',              href: '/statistika' },
      // Davki
      { type: 'tax',    icon: 'percent',  label: 'DDV obračun',         sub: 'Mesečni DDV-O',              href: '/ddv' },
      { type: 'tax',    icon: 'percent',  label: 'DDV evidenca',        sub: 'Knjiga DDV',                 href: '/ddv/evidenca' },
      { type: 'tax',    icon: 'book',     label: 'KPO knjiga',          sub: 'Evidenca prihodkov',         href: '/kpo' },
      { type: 'tax',    icon: 'taxes',    label: 'Dohodnina',           sub: 'Akontacija dohodnine',       href: '/dohodnina' },
      // AI & ostalo
      { type: 'ai',     icon: 'ai',       label: 'AI računovodja',      sub: 'Vprašajte karkoli',          href: '/ai' },
      { type: 'nav',    icon: 'calendar', label: 'Rokovnik',            sub: 'Davčni roki',                href: '/rokovnik' },
      { type: 'nav',    icon: 'settings', label: 'Nastavitve',          sub: 'Profil podjetja',            href: '/nastavitve' },
    ]
  }, [])

  const filteredPaletteItems = useMemo(() => {
    if (!paletteQuery.trim()) return paletteItems
    const q = paletteQuery.toLowerCase().trim()
    return paletteItems.filter(item => 
      item.label.toLowerCase().includes(q) || 
      item.sub.toLowerCase().includes(q)
    )
  }, [paletteItems, paletteQuery])

  function selectPaletteItem(item: typeof paletteItems[0]) {
    setPaletteOpen(false)
    setPaletteQuery('')
    if (item.href) router.push(item.href)
  }

  /* ============ DRAG-AND-DROP for quick actions in modal ============ */
  function handleQaDragStart(idx: number) {
    setDraggedQaIdx(idx)
  }
  function handleQaDragOver(e: React.DragEvent, overIdx: number) {
    e.preventDefault()
    if (draggedQaIdx === null || draggedQaIdx === overIdx) return
    const next = [...qaHrefsDraft]
    const [removed] = next.splice(draggedQaIdx, 1)
    next.splice(overIdx, 0, removed)
    setQaHrefsDraft(next)
    setDraggedQaIdx(overIdx)
  }
  function handleQaDragEnd() {
    setDraggedQaIdx(null)
  }

  /* ============ NOTIFICATIONS (real, computed from data) ============ */
  const notifications = useMemo(() => {
    const items: { id: string; severity: 'urgent'|'warning'|'info'; title: string; subtitle: string; href: string }[] = []
    
    // Overdue invoices
    if (data.overdueCount > 0) {
      items.push({
        id: 'overdue',
        severity: 'urgent',
        title: `${data.overdueCount} ${data.overdueCount === 1 ? 'račun' : 'računov'} v zamudi`,
        subtitle: `Skupaj €${Math.round(data.overdueAmount)}`,
        href: '/invoices',
      })
    }
    // Bližnji rok za prispevke
    if (daysUntil15 >= 0 && daysUntil15 <= 7) {
      items.push({
        id: 'prispevki',
        severity: daysUntil15 <= 3 ? 'urgent' : 'warning',
        title: `Prispevki s.p. zapadejo čez ${daysUntil15} ${daysUntil15 === 1 ? 'dan' : 'dni'}`,
        subtitle: '€522 · ZPIZ + ZZZS',
        href: '/prispevki',
      })
    }
    // DDV
    if (showDDVAlert && org?.vat_registered) {
      items.push({
        id: 'ddv',
        severity: 'info',
        title: `DDV-O Q${ddvQuarter} čaka oddajo`,
        subtitle: 'Konec meseca',
        href: '/ddv/evidenca',
      })
    }
    return items
  }, [data, daysUntil15, showDDVAlert, org, ddvQuarter])

  const notificationCount = notifications.length

  /* ============ COMPUTED: TAX CALCULATION ============ */
  const taxResult = useMemo(() => {
    return calculateNetIncome({
      monthlyRevenue: data.revenue,
      monthlyExpenses: data.expenses,
      yearlyRevenueToDate: data.yearRevenue,
      legalForm: data.legalForm,
      taxSystem: data.taxSystem,
      isVatRegistered: !!org?.vat_registered,
    })
  }, [data, org])

  const projectedMonthRevenue = useMemo(() => {
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate()
    return projectMonthlyRevenue(data.revenue, dayOfMonth, totalDaysInMonth)
  }, [data.revenue, dayOfMonth, year, month])

  const projectedNetIncome = useMemo(() => {
    const projection = calculateNetIncome({
      monthlyRevenue: projectedMonthRevenue,
      monthlyExpenses: data.expenses,
      yearlyRevenueToDate: data.yearRevenue,
      legalForm: data.legalForm,
      taxSystem: data.taxSystem,
      isVatRegistered: !!org?.vat_registered,
    })
    return projection.netIncome
  }, [projectedMonthRevenue, data, org])

  /* ============ COMPUTED: CASH FLOW ============ */
  const cashFlow = useMemo(() => {
    return generateCashFlow({
      openInvoices: data.openInvoices,
      legalForm: data.legalForm,
      taxSystem: data.taxSystem,
      isVatRegistered: !!org?.vat_registered,
      hasEmployees: data.hasEmployees,
      monthlyVatLiability: taxResult.details.vatLiability,
      monthlyIncomeTax: taxResult.details.incomeTax,
      monthlyContributions: taxResult.details.contributions,
    })
  }, [data, org, taxResult])

  /* ============ COMPUTED: NORMIRANEC LIMIT ============ */
  const limitRisk = useMemo(() => {
    return checkNormirancePragRisk(data.yearRevenue, data.taxSystem, month + 1)
  }, [data.yearRevenue, data.taxSystem, month])

  /* ============ COMPUTED: ONBOARDING CHECKLIST ============ */
  const onboardingSteps = useMemo(() => {
    const profileDone = !!(org?.name && org?.tax_number && org?.iban)
    return [
      { id: 1, label: 'Profil podjetja', done: profileDone, href: '/nastavitve' },
      { id: 2, label: 'Prva stranka',     done: data.hasClients, href: '/clients' },
      { id: 3, label: 'Prvi račun',       done: data.hasInvoices, href: '/invoices/new' },
      { id: 4, label: 'Uvozi prvi strošek', done: data.hasExpenses, href: '/expenses' },
    ]
  }, [org, data])
  const onboardingDone = onboardingSteps.filter(s => s.done).length
  const onboardingTotal = onboardingSteps.length
  const onboardingPct = (onboardingDone / onboardingTotal) * 100
  const onboardingComplete = onboardingDone === onboardingTotal

  /* ============ COMPUTED: SMART FOCUS BANNER (najbližji rok) ============ */
  const focus = useMemo(() => {
    const candidates = [
      { name: 'Prispevki za s.p.', amount: 522, days: daysUntil15, day: 15, href: '/prispevki', emoji: '⏰' },
      { name: 'Akontacija dohodnine', amount: 84, days: daysUntil15, day: 15, href: '/dohodnina', emoji: '📋' },
    ]
    if (data.hasEmployees) {
      candidates.push({ name: 'REK-1 + plača', amount: 0, days: daysUntil25, day: 25, href: '/rek1', emoji: '👥' })
    }
    if (showDDVAlert && org?.vat_registered) {
      candidates.push({ name: `DDV-O Q${ddvQuarter}`, amount: data.vatDue, days: daysUntilEndMonth, day: new Date(year,month+1,0).getDate(), href: '/ddv/evidenca', emoji: '🔢' })
    }
    const upcoming = candidates.filter(c => c.days >= 0).sort((a,b) => a.days - b.days)
    return upcoming[0] || null
  }, [daysUntil15, daysUntil25, daysUntilEndMonth, data.hasEmployees, showDDVAlert, org, data.vatDue, ddvQuarter, year, month])

  /* ============ DEADLINES (right panel) ============ */
  const deadlines = useMemo(() => {
    const list = [
      { name: 'Prispevki s.p.',       date: `15. ${MONTHS_SHORT[month]}`, amount: 522, days: daysUntil15, href: '/prispevki', urgent: daysUntil15 <= 7 && daysUntil15 >= 0 },
      { name: 'Akontacija dohodnine', date: `15. ${MONTHS_SHORT[month]}`, amount: 84,  days: daysUntil15, href: '/dohodnina', urgent: false },
    ]
    if (data.hasEmployees) {
      list.push({ name: 'REK-1 + plača', date: `25. ${MONTHS_SHORT[month]}`, amount: 0, days: daysUntil25, href: '/rek1', urgent: daysUntil25 <= 7 && daysUntil25 >= 0 })
    }
    if (showDDVAlert && org?.vat_registered) {
      list.push({ name: `DDV-O Q${ddvQuarter}`, date: `Konec ${MONTHS_SHORT[month]}`, amount: data.vatDue, days: daysUntilEndMonth, href: '/ddv/evidenca', urgent: false })
    }
    return list.filter(d => d.days >= -2)
  }, [month, daysUntil15, daysUntil25, daysUntilEndMonth, data, showDDVAlert, org, ddvQuarter])

  /* ============ HEADER greet ============ */
  const greet = useMemo(() => {
    const hr = now.getHours()
    if (hr < 11) return 'Dobro jutro'
    if (hr < 18) return 'Dober dan'
    return 'Dober večer'
  }, [now])
  const todayStr = `${DAYS_LONG[now.getDay()]} · ${dayOfMonth}. ${MONTHS_LONG[month]} ${year}`
  const ownerName = org?.name?.split(' ')[0] || userEmail?.split('@')[0] || ''

  /* ============ RENDER ============ */
  if (loading) {
    return (
      <div data-theme="light" data-density="comfortable" className="rk-shell">
        <div className="rk-loading">Nalagam...</div>
        <style jsx global>{cssGlobal}</style>
      </div>
    )
  }

  return (
    <div data-theme={theme} data-density={density} className="rk-shell">

      {/* ============ THIN RAIL ============ */}
      <aside className="rk-rail">
        <div className="rk-logo">
          <svg viewBox="0 0 100 100" width="36" height="36">
            <path d="M82 50 C 82 28, 66 14, 46 14 C 26 14, 14 30, 14 50 C 14 70, 28 84, 46 84 C 50 84, 54 83, 58 82 L 64 92 L 64 78 C 76 72, 82 62, 82 50 Z" fill="#0E5E3B"/>
            <circle cx="36" cy="46" r="5" fill="#FFFFFF"/>
            <circle cx="56" cy="46" r="5" fill="#E8B547"/>
            <path d="M30 60 Q 46 72, 62 60" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        {RAIL_ITEMS.map(item => {
          const active = pathname === item.href
          const showBadge = item.badge && data.overdueCount > 0
          return (
            <Link key={item.href} href={item.href} className={`rk-rail-icon ${active ? 'active' : ''}`}>
              <Icon name={item.icon} />
              {showBadge && <span className="rk-badge-dot" />}
              <span className="rk-tip">{item.label}</span>
            </Link>
          )
        })}
        <div className="rk-rail-foot">
          <Link href="/nastavitve" className="rk-rail-icon">
            <Icon name="settings" />
            <span className="rk-tip">Nastavitve</span>
          </Link>
          <Link href="/nastavitve" className="rk-rail-avatar">
            {ownerName.charAt(0).toUpperCase() || 'U'}
          </Link>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main className="rk-main">

        {/* HEADER */}
        <div className="rk-head">
          <div>
            <div className="rk-greet-eyebrow">{todayStr}</div>
            <h1 className="rk-greet">{greet}, <span className="name">{ownerName}</span> 👋</h1>
          </div>
          <div className="rk-head-tools">
            <div className="rk-head-search" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); setPaletteSelectedIdx(0) }}>
              <Icon name="search" size={16} />
              <span>Iskanje računov, strank…</span>
              <kbd>⌘K</kbd>
            </div>
            <button className="rk-tool-btn" title="Glasovni ukaz" onClick={() => setVoiceOpen(true)}>
              <Icon name="mic" />
            </button>
            <button className="rk-tool-btn rk-tool-bell" title={`Obvestila (${notificationCount})`} onClick={() => setNotificationsOpen(!notificationsOpen)}>
              <Icon name="bell" />
              {notificationCount > 0 && <span className="rk-bell-badge">{notificationCount}</span>}
            </button>
            <div className="rk-density-toggle" title="Gostota">
              <button className={density === 'comfortable' ? 'active' : ''} onClick={() => applyDensity('comfortable')} title="Comfortable">
                <Icon name="d1" size={14} />
              </button>
              <button className={density === 'compact' ? 'active' : ''} onClick={() => applyDensity('compact')} title="Compact">
                <Icon name="d2" size={14} />
              </button>
              <button className={density === 'power' ? 'active' : ''} onClick={() => applyDensity('power')} title="Power user">
                <Icon name="d3" size={14} />
              </button>
            </div>
            <button className="rk-tool-btn" title="Tema" onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
            </button>
          </div>
        </div>

        {/* ONBOARDING CHECKLIST (only if not complete) */}
        {showOnboarding && !onboardingComplete && (
          <section className="rk-onboard">
            <button className="rk-onboard-close" onClick={() => { setShowOnboarding(false); showToast('Najdete jih kasneje v Nastavitvah') }} title="Skrij">
              <Icon name="close" size={14} />
            </button>
            <div className="rk-onboard-head">
              <div>
                <div className="rk-onboard-eyebrow">Začetni koraki</div>
                <h3>Pripravimo Računko za vsakdanjo rabo</h3>
              </div>
              <div className="rk-onboard-progress"><b>{onboardingDone}</b> od {onboardingTotal} dokončano</div>
            </div>
            <div className="rk-onboard-bar"><div className="rk-onboard-bar-fill" style={{ width: `${onboardingPct}%` }} /></div>
            <div className="rk-onboard-list">
              {onboardingSteps.map(s => (
                <Link key={s.id} href={s.href} className={`rk-ob-step ${s.done ? 'done' : ''}`}>
                  <span className="rk-ob-num">{s.done ? '✓' : s.id}</span>
                  <span className="rk-ob-label">{s.label}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* SMART FOCUS BANNER */}
        {focus && (
          <section className="rk-focus">
            <div className="rk-focus-emoji">{focus.emoji}</div>
            <div>
              <div className="rk-focus-eyebrow">Fokus tedna · {dayOfMonth}.–{Math.min(dayOfMonth + 7, new Date(year,month+1,0).getDate())}. {MONTHS_SHORT[month]}</div>
              <div className="rk-focus-text">
                {focus.name}{focus.amount > 0 ? <> (<b>€{focus.amount}</b>)</> : null} zapadejo <b>{focus.days === 0 ? 'danes' : focus.days === 1 ? 'jutri' : `čez ${focus.days} dni`}</b>. Vse je pripravljeno za UPN nakazilo.
              </div>
            </div>
            <button className="rk-focus-cta" onClick={() => setUpnOpen(true)}>Plačaj zdaj →</button>
          </section>
        )}

        {/* QUICK ACTIONS */}
        <section className="rk-quick">
          <div className="rk-quick-head">
            <span className="rk-quick-eyebrow">Bližnjice</span>
            <button className="rk-quick-edit" onClick={() => { setQaHrefsDraft(qaHrefs); setShowQAModal(true) }}>
              <Icon name="edit" size={12} />
              Uredi
            </button>
          </div>
          <div className="rk-quick-grid">
            {activeQA.map(a => (
              <Link key={a.href} href={a.href} className="rk-qa">
                <span className="rk-qa-ico"><Icon name={a.icon} /></span>
                <span className="rk-qa-label">{a.label}</span>
              </Link>
            ))}
            <button className="rk-qa rk-qa-add" onClick={() => { setQaHrefsDraft(qaHrefs); setShowQAModal(true) }}>
              <span className="rk-qa-ico"><Icon name="plus" /></span>
              <span className="rk-qa-label">Dodaj</span>
            </button>
          </div>
        </section>

        {/* HERO METRIC + TRIPLE STAT (attached cluster) */}
        <section className="rk-hero rk-hero-attached">
          <div className="rk-hero-eyebrow">Čisti prihodek · {MONTHS_LONG[month]} {year} · {taxResult.systemLabel}</div>
          <div className="rk-hero-row">
            <div>
              <div className="rk-hero-num">€{Math.floor(taxResult.netIncome).toLocaleString('sl-SI')}<span className="cents">,{String(Math.round((taxResult.netIncome % 1) * 100)).padStart(2,'0')}</span></div>
              <div className="rk-hero-sub">
                {data.revenue > 0 ? <>Po prispevkih in davkih ({Math.round(taxResult.details.effectiveRate * 100)}%) · projekcija do konca meseca <strong>€{Math.round(projectedNetIncome).toLocaleString('sl-SI')}</strong></> : <>Še ni prihodkov ta mesec · izstavite prvi račun</>}
              </div>
            </div>
            <svg className="rk-hero-spark" viewBox="0 0 240 70" fill="none">
              <defs>
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#E8B547" stopOpacity="0.4"/>
                  <stop offset="1" stopColor="#E8B547" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 50 L 30 46 L 60 38 L 90 42 L 120 28 L 150 30 L 180 18 L 210 22 L 240 8 L 240 70 L 0 70 Z" fill="url(#g)"/>
              <path d="M0 50 L 30 46 L 60 38 L 90 42 L 120 28 L 150 30 L 180 18 L 210 22 L 240 8" stroke="#E8B547" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="240" cy="8" r="3.5" fill="#E8B547"/>
            </svg>
          </div>
        </section>

        <section className="rk-triple rk-triple-attached">
          <Link href="/invoices" className="rk-stat">
            <div className="rk-stat-lbl"><span>Prihodki {MONTHS_SHORT[month]}</span><span className="rk-arr">→</span></div>
            <div className="rk-stat-val">€{Math.round(data.revenue)}</div>
            <div className="rk-stat-meta">Brez DDV</div>
          </Link>
          <Link href="/expenses" className="rk-stat">
            <div className="rk-stat-lbl"><span>Odhodki {MONTHS_SHORT[month]}</span><span className="rk-arr">→</span></div>
            <div className="rk-stat-val" style={{ color: data.expenses === 0 ? 'var(--ink3)' : undefined, fontWeight: data.expenses === 0 ? 500 : undefined }}>€{Math.round(data.expenses)}</div>
            <div className="rk-stat-meta">{data.expenses === 0 ? 'Skeniraj prvi račun' : 'Brez DDV'}</div>
          </Link>
          <Link href="/invoices" className="rk-stat danger">
            <div className="rk-stat-lbl"><span>Stranke vam dolgujejo</span><span className="rk-arr">→</span></div>
            <div className="rk-stat-val">€{Math.round(data.unpaidAmount)}</div>
            <div className="rk-stat-meta">{data.overdueCount > 0 ? <>Od tega <b>€{Math.round(data.overdueAmount)} v zamudi</b> ({data.overdueCount} {data.overdueCount === 1 ? 'račun' : 'računov'})</> : <>{data.unpaidCount} {data.unpaidCount === 1 ? 'odprt račun' : 'odprtih računov'}</>}</div>
          </Link>
        </section>

        {/* CASH FLOW (real data) */}
        <section className="rk-cashflow">
          <div className="rk-cf-head">
            <div>
              <div className="rk-cf-eyebrow">Pretok denarja · naslednjih 30 dni</div>
              <h3>{cashFlow.summary.message || `Imam dovolj v ${MONTHS_LONG[(month+1) % 12]}u?`}</h3>
            </div>
            <div className="rk-cf-summary">
              <div className="item"><div className="l">Pričakovan dotok</div><div className="v in">+€{Math.round(cashFlow.summary.totalInflow).toLocaleString('sl-SI')}</div></div>
              <div className="item"><div className="l">Načrtovani odhodki</div><div className="v out">−€{Math.round(cashFlow.summary.totalOutflow).toLocaleString('sl-SI')}</div></div>
              <div className="item"><div className="l">Stanje po 30 dneh</div><div className="v" style={{ color: cashFlow.summary.endBalance >= 0 ? 'var(--green)' : 'var(--bad)' }}>€{Math.round(cashFlow.summary.endBalance).toLocaleString('sl-SI')}</div></div>
            </div>
          </div>
          {cashFlow.summary.totalInflow === 0 && cashFlow.summary.totalOutflow === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
              <div style={{ fontSize: '13px', marginBottom: '8px' }}>Ni načrtovanih plačil ali stroškov v naslednjih 30 dneh</div>
              <div style={{ fontSize: '12px' }}>Izstavite račune ali nastavite davčni rok, da pridobimo projekcijo</div>
            </div>
          ) : (
            <svg className="rk-cf-chart" viewBox="0 0 1100 180" preserveAspectRatio="none">
              {(() => {
                const max = getChartMaxValue(cashFlow.days)
                const scale = 80 / max
                return cashFlow.days.map((d, i) => {
                  const x = (i / 29) * 1080 + 10
                  const inH = d.inflow * scale
                  const outH = d.outflow * scale
                  return (
                    <g key={i}>
                      {inH > 0 && <rect x={x - 6} y={90 - inH} width="12" height={inH} fill="#0E5E3B" rx="2"><title>{d.date}: +€{Math.round(d.inflow)}</title></rect>}
                      {outH > 0 && <rect x={x - 6} y="90" width="12" height={outH} fill="#E8B547" rx="2"><title>{d.date}: −€{Math.round(d.outflow)}</title></rect>}
                    </g>
                  )
                })
              })()}
              <line x1="0" x2="1100" y1="90" y2="90" stroke="var(--rule)" strokeWidth="0.5" />
              {(() => {
                const max = getChartMaxValue(cashFlow.days)
                const scale = 80 / max
                const pts = cashFlow.days.map((d, i) => {
                  const x = (i / 29) * 1080 + 10
                  const y = 90 - (d.balance * scale)
                  return `${x} ${Math.max(10, Math.min(170, y))}`
                }).join(' L ')
                return <path d={`M ${pts}`} stroke="var(--ink)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              })()}
            </svg>
          )}
          <div className="rk-cf-legend">
            <span><span className="dot in" />Dotok (računi)</span>
            <span><span className="dot out" />Odtok (davki, prispevki, naročnine)</span>
            <span><span className="dot bal" />Bilanca</span>
          </div>
        </section>

        {/* LIMIT THERMOMETER (real, dynamic based on tax system) */}
        {(data.taxSystem === 'normirani_80' || data.taxSystem === 'normirani_40') && (
        <section className="rk-limit">
          <div className="rk-limit-head">
            <div>
              <div className="rk-limit-eyebrow">Letni limit normiranca · {year} · {taxResult.systemLabel}</div>
              <h3>Še €{Math.max(0, (limitRisk.threshold || 60000) - data.yearRevenue).toLocaleString('sl-SI')} do limita €{(limitRisk.threshold || 60000).toLocaleString('sl-SI')}</h3>
            </div>
            <div className="rk-limit-amount"><b>€{Math.round(data.yearRevenue).toLocaleString('sl-SI')}</b> <span className="total">/ €{(limitRisk.threshold || 60000).toLocaleString('sl-SI')}</span></div>
          </div>
          <div className="rk-limit-bar">
            <div className="rk-limit-bar-fill" style={{ width: `${Math.min((data.yearRevenue / (limitRisk.threshold || 60000)) * 100, 100)}%` }} />
            <div className="rk-limit-marker" style={{ left: `${(month + 1) / 12 * 100}%` }} data-label="Pričakovan tempo" />
          </div>
          <div className="rk-limit-foot">
            <span>{Math.round((data.yearRevenue / (limitRisk.threshold || 60000)) * 100)}% izkoriščeno · {month + 1} {month === 0 ? 'mesec' : 'mesecev'} v leto</span>
            <span><b style={{ color: limitRisk.atRisk ? 'var(--bad)' : 'var(--green)' }}>{limitRisk.atRisk ? 'Pozor — preseganje tempa' : 'V varnem območju'}</b> — {limitRisk.message || `pri tem tempu ~€${Math.round(limitRisk.projectedYearly).toLocaleString('sl-SI')} letno`}</span>
          </div>
        </section>
        )}

        {/* AI PROACTIVE CARD (DEMO) */}
        <section className="rk-ai-card">
          <div className="rk-demo-badge dark">DEMO podatki</div>
          <div className="rk-ai-orb">
            <Icon name="ai" size={22} />
          </div>
          <div className="rk-ai-text">
            <span className="label">AI računovodja predlaga</span>
            Imate <b>3 stroške v e-pošti</b>, ki niso vneseni. Skupaj ~€240. Skeniram in vam jih dam v pregled?
          </div>
          <div className="rk-ai-actions">
            <button className="rk-ai-btn secondary" onClick={() => showToast('Bom predlagal pozneje')}>Pozneje</button>
            <button className="rk-ai-btn primary" onClick={() => showToast('Skeniram 3 stroške…')}>Da, skeniraj</button>
          </div>
        </section>

        {/* LOWER ROW: ACTIVITY + DEADLINES */}
        <section className="rk-lower">

          <div className="rk-panel">
            <div className="rk-panel-head">
              <h3>Zadnja aktivnost</h3>
              <div className="rk-tabs">
                <span className="rk-tab active">Vse</span>
                <Link href="/invoices" className="rk-tab">Računi</Link>
                <Link href="/expenses" className="rk-tab">Stroški</Link>
              </div>
            </div>
            {data.recentInvoices.length === 0 ? (
              <div style={{ padding: '40px 26px', textAlign: 'center', color: 'var(--ink3)' }}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>Še ni aktivnosti</div>
                <Link href="/invoices/new" style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>+ Ustvari prvi račun</Link>
              </div>
            ) : data.recentInvoices.map((inv: any) => {
              const isOverdue = inv.status === 'sent' && inv.due_date < today
              const isPaid = inv.status === 'paid'
              const initial = (inv.client_name || '?').charAt(0).toUpperCase()
              const d = new Date(inv.issue_date)
              const dateStr = `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`
              return (
                <Link key={inv.id} href="/invoices" className="rk-act-row">
                  <div className={`rk-act-ico ${isOverdue ? 'late' : ''}`}>{initial}</div>
                  <div>
                    <div className="rk-act-name">{inv.client_name}</div>
                    <div className="rk-act-sub">#{inv.invoice_number} · {isPaid ? 'plačano' : isOverdue ? 'zapadel' : 'poslano'} {dateStr}</div>
                  </div>
                  <div className={`rk-act-amt ${isOverdue ? 'neg' : 'in'}`}>+€{Math.round(Number(inv.amount_total))}</div>
                  <div className={`rk-pill ${isPaid ? 'paid' : isOverdue ? 'late' : 'sent'}`}>
                    {isPaid ? 'Plačano' : isOverdue ? 'Zamuda' : 'Poslano'}
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="rk-panel">
            <div className="rk-panel-head">
              <h3>Bližnji roki</h3>
              <Link href="/rokovnik" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', textDecoration: 'none' }}>Koledar →</Link>
            </div>
            {deadlines.length === 0 ? (
              <div style={{ padding: '32px 26px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
                Ni rokov v naslednjih 30 dneh
              </div>
            ) : deadlines.map((d, i) => {
              const isUrgent = d.urgent
              const isFirstUrgent = isUrgent && i === 0
              return (
                <div key={i}>
                  <Link href={d.href} className={`rk-dl-row ${isUrgent ? 'urgent' : ''}`}>
                    <div>
                      <div className="rk-dl-name">{d.name}</div>
                      <div className="rk-dl-when">{d.date}</div>
                    </div>
                    <div>
                      {d.amount > 0 && <div className="rk-dl-amt">€{d.amount}</div>}
                      <div className="rk-dl-countdown">
                        {d.days < 0 ? 'Zamuda' : d.days === 0 ? 'Danes' : `čez ${d.days} ${d.days === 1 ? 'dan' : 'dni'}`}
                      </div>
                    </div>
                  </Link>
                  {isFirstUrgent && (
                    <div className="rk-dl-cta-wrap">
                      <button className="rk-dl-cta" onClick={() => setUpnOpen(true)}>
                        Plačaj z UPN — vse pripravljeno <span className="arr">→</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </section>

        {/* LEGAL UPDATES (existing widget — wrapped for v6 styling) */}
        <section className="rk-news-wrap">
          <LegalUpdatesWidget />
        </section>

      </main>

      {/* FAB */}
      <Link href="/invoices/new" className="rk-fab">＋ Nov račun</Link>

      {/* QUICK ACTIONS MODAL (z drag-and-drop) */}
      {showQAModal && (
        <div className="rk-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowQAModal(false) }}>
          <div className="rk-modal" onClick={e => e.stopPropagation()}>
            <div className="rk-modal-head">
              <h3>Uredi hitre akcije</h3>
              <button onClick={() => setShowQAModal(false)} className="rk-modal-close">✕</button>
            </div>
            <div className="rk-modal-body">
              {qaHrefsDraft.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Izbrane akcije ({qaHrefsDraft.length}) · povleci za vrstni red
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
                    {qaHrefsDraft.map((href, idx) => {
                      const item = ALL_QUICK_ACTIONS.find(a => a.href === href)
                      if (!item) return null
                      return (
                        <div
                          key={href}
                          draggable
                          onDragStart={() => handleQaDragStart(idx)}
                          onDragOver={(e) => handleQaDragOver(e, idx)}
                          onDragEnd={handleQaDragEnd}
                          className="rk-qa-draggable"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            background: draggedQaIdx === idx ? 'var(--green-soft)' : 'var(--rule2)',
                            borderRadius: 8,
                            cursor: 'grab',
                            opacity: draggedQaIdx === idx ? 0.6 : 1,
                            transition: 'background 0.12s',
                          }}
                        >
                          <span style={{ color: 'var(--ink3)', fontSize: 14, cursor: 'grab' }}>⠿</span>
                          <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--green-soft)', color: 'var(--green)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Icon name={item.icon} size={14} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                          </div>
                          <button
                            onClick={() => toggleDraftQA(href)}
                            style={{ background: 'none', border: 0, color: 'var(--ink3)', fontSize: 18, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}
                            title="Odstrani"
                          >×</button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Vse razpoložljive akcije
              </div>
              {ALL_QUICK_ACTIONS.map(item => (
                <div key={item.href} className="rk-qa-toggle">
                  <span className="rk-qa-toggle-left">
                    <span className="rk-qa-toggle-ico"><Icon name={item.icon} size={16} /></span>
                    <span>
                      <div className="rk-qa-toggle-name">{item.label}</div>
                      <div className="rk-qa-toggle-sub">{item.sub}</div>
                    </span>
                  </span>
                  <div className="rk-toggle" onClick={() => toggleDraftQA(item.href)} data-on={qaHrefsDraft.includes(item.href)}>
                    <div className="rk-toggle-knob" />
                  </div>
                </div>
              ))}
            </div>
            <div className="rk-modal-foot">
              <button onClick={saveQA} disabled={savingQA} className="rk-modal-save">
                {savingQA ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOICE MODAL (mock transcription) */}
      {voiceOpen && (
        <div className="rk-voice-backdrop" onClick={e => { if (e.target === e.currentTarget) setVoiceOpen(false) }}>
          <div className="rk-voice-card">
            <div className={`rk-voice-orb ${voiceStage === 'listening' ? 'listening' : 'understood'}`}>
              <Icon name="mic" size={32} />
            </div>
            <div className="rk-voice-eyebrow">{voiceStage === 'listening' ? 'Poslušam…' : 'Razumem'}</div>
            <div className="rk-voice-text">
              {voiceStage === 'listening' ? (
                'Povej, kaj želiš storiti'
              ) : data.overdueCount > 0 ? (
                <>
                  <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>Pošlji opomnik za </span>
                  <b style={{ color: 'var(--green)' }}>{data.recentInvoices.find((i:any) => i.status === 'sent' && i.due_date < today)?.client_name || 'stranko'}</b>
                  <span style={{ color: 'var(--ink3)', fontWeight: 500 }}> — zapadel račun</span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>Odpri </span>
                  <b style={{ color: 'var(--green)' }}>nov račun</b>
                </>
              )}
            </div>
            {voiceStage === 'listening' && (
              <div className="rk-voice-wave">
                <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
              </div>
            )}
            {voiceStage === 'listening' && (
              <div className="rk-voice-hints">
                <span>"Nov račun za 500€"</span>
                <span>"Pošlji opomnik"</span>
                <span>"Koliko sem zaslužil maja?"</span>
              </div>
            )}
            <div className="rk-voice-actions">
              <button className="rk-voice-cancel" onClick={() => setVoiceOpen(false)}>Prekliči</button>
              {voiceStage === 'understood' && (
                <button className="rk-voice-confirm" onClick={() => {
                  setVoiceOpen(false)
                  showToast('Glasovni ukazi · kmalu v full funkcionalnosti')
                }}>Izvedi</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPN MODAL (placeholder) */}
      {upnOpen && focus && (
        <div className="rk-upn-backdrop" onClick={e => { if (e.target === e.currentTarget) setUpnOpen(false) }}>
          <div className="rk-upn-card">
            <div className="rk-upn-left">
              <button className="rk-upn-close" onClick={() => setUpnOpen(false)}>×</button>
              <div className="rk-upn-eyebrow">UPN nakazilo · pripravljeno</div>
              <h3>{focus.name} — {MONTHS_LONG[month]} {year}</h3>
              <div className="rk-upn-fields">
                <div className="rk-upn-field"><span className="l">Znesek</span><span className="v amount">€{focus.amount},00</span></div>
                <div className="rk-upn-field"><span className="l">Prejemnik</span><span className="v">FURS — Finančna uprava RS</span></div>
                <div className="rk-upn-field"><span className="l">IBAN</span><span className="v iban">SI56 0110 0888 8000 030</span></div>
                <div className="rk-upn-field"><span className="l">Sklic</span><span className="v iban">SI19 {org?.tax_number || '12345678'}-44008</span></div>
                <div className="rk-upn-field"><span className="l">Namen</span><span className="v">{focus.name} — {MONTHS_LONG[month]} {year}</span></div>
                <div className="rk-upn-field"><span className="l">Rok plačila</span><span className="v"><b>{focus.day}. {MONTHS_LONG[month]} {year}</b> · čez {focus.days} dni</span></div>
              </div>
              <div className="rk-upn-actions">
                <button className="rk-upn-pay" onClick={() => { setUpnOpen(false); showToast('UPN PDF prenesen') }}>Prenesi PDF</button>
                <button className="rk-upn-bank" onClick={() => { setUpnOpen(false); showToast('Odpiram bančno aplikacijo…') }}>Odpri v banki →</button>
              </div>
            </div>
            <div className="rk-upn-right">
              <div className="rk-upn-qr-eyebrow">Skeniraj s telefonom</div>
              <div className="rk-upn-qr">
                <svg viewBox="0 0 100 100">
                  <rect width="100" height="100" fill="#fff"/>
                  {Array.from({ length: 21 }).map((_, y) => 
                    Array.from({ length: 21 }).map((_, x) => {
                      const inCorner = (x < 7 && y < 7) || (x >= 14 && y < 7) || (x < 7 && y >= 14)
                      const cornerDark = inCorner && ((x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4)) || (x === 14 || x === 20 || (y === 0 || y === 6) || (x >= 16 && x <= 18 && y >= 2 && y <= 4)) || (x === 0 || x === 6 || y === 14 || y === 20 || (x >= 2 && x <= 4 && y >= 16 && y <= 18)))
                      const dark = cornerDark || (!inCorner && ((x * 31 + y * 17 + x * y * 7) % 13) > 6)
                      return dark ? <rect key={`${x}-${y}`} x={x*4.5+2} y={y*4.5+2} width="4" height="4" fill="#0F1F18"/> : null
                    })
                  )}
                </svg>
              </div>
              <div className="rk-upn-qr-hint">Odprite mobilno banko in skenirajte QR kodo</div>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND PALETTE (⌘K) */}
      {paletteOpen && (
        <div className="rk-palette-backdrop" onClick={e => { if (e.target === e.currentTarget) setPaletteOpen(false) }}>
          <div className="rk-palette" onClick={e => e.stopPropagation()}>
            <div className="rk-palette-input-wrap">
              <Icon name="search" size={18} />
              <input
                type="text"
                value={paletteQuery}
                onChange={(e) => { setPaletteQuery(e.target.value); setPaletteSelectedIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setPaletteSelectedIdx(Math.min(paletteSelectedIdx + 1, filteredPaletteItems.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setPaletteSelectedIdx(Math.max(paletteSelectedIdx - 1, 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const item = filteredPaletteItems[paletteSelectedIdx]
                    if (item) selectPaletteItem(item)
                  }
                }}
                placeholder="Išči stran ali ukaz…"
                autoFocus
              />
              <kbd>ESC</kbd>
            </div>
            <div className="rk-palette-results">
              {filteredPaletteItems.length === 0 ? (
                <div className="rk-palette-empty">Ni zadetkov za "{paletteQuery}"</div>
              ) : (
                filteredPaletteItems.map((item, idx) => (
                  <div
                    key={item.href || idx}
                    className={`rk-palette-item ${idx === paletteSelectedIdx ? 'selected' : ''}`}
                    onMouseEnter={() => setPaletteSelectedIdx(idx)}
                    onClick={() => selectPaletteItem(item)}
                  >
                    <span className="rk-palette-ico"><Icon name={item.icon} size={16} /></span>
                    <div className="rk-palette-text">
                      <div className="rk-palette-label">{item.label}</div>
                      <div className="rk-palette-sub">{item.sub}</div>
                    </div>
                    <kbd className="rk-palette-enter">↵</kbd>
                  </div>
                ))
              )}
            </div>
            <div className="rk-palette-foot">
              <span>↑↓ za navigacijo</span>
              <span>↵ za izbiro</span>
              <span>esc za zapri</span>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS DROPDOWN */}
      {notificationsOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1500 }} onClick={() => setNotificationsOpen(false)} />
          <div className="rk-notif-dropdown">
            <div className="rk-notif-head">
              <h4>Obvestila</h4>
              {notificationCount > 0 && <span className="rk-notif-count">{notificationCount}</span>}
            </div>
            <div className="rk-notif-list">
              {notifications.length === 0 ? (
                <div className="rk-notif-empty">
                  ✓ Vse je urejeno · ni nujnih obvestil
                </div>
              ) : (
                notifications.map(n => (
                  <Link key={n.id} href={n.href} onClick={() => setNotificationsOpen(false)} className={`rk-notif-item ${n.severity}`}>
                    <span className="rk-notif-dot" />
                    <div>
                      <div className="rk-notif-title">{n.title}</div>
                      <div className="rk-notif-sub">{n.subtitle}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* TOAST WRAP */}
      <div className="rk-toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className="rk-toast show">
            <span className="ti">✓</span><span>{t.text}</span>
          </div>
        ))}
      </div>

      <style jsx global>{cssGlobal}</style>
    </div>
  )
}

/* ================================================================
   GLOBAL CSS
   Adapted from Računko_Dashboard_v6.html
   Prefixed all classes with rk- to avoid Tailwind conflicts
   ================================================================ */
const cssGlobal = `
  :root {
    --bg: #0F1F18;
    --panel: #FFFFFF;
    --ink: #0F1F18;
    --ink2: #4A5C53;
    --ink3: #8A968F;
    --rule: #E4E8E2;
    --rule2: #F1F4EE;
    --green: #0E5E3B;
    --green-deep: #08321F;
    --green-soft: #E4F0E8;
    --warn: #B97A0E;
    --warn-soft: #FAEFD9;
    --bad: #B23A2A;
    --bad-soft: #F7E1DC;
    --warm: #E8B547;
    --cream: #F4EFE6;
    --rk-sans: var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
    --rk-display: var(--font-bricolage), 'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif;
    --rk-serif: var(--font-fraunces), 'Fraunces', Georgia, serif;
    --rk-mono: var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace;
    --d-pad: 1;
    --d-gap: 1;
    --d-type: 1;
  }
  .rk-shell[data-theme="dark"] {
    --bg: #050B08;
    --panel: #122019;
    --ink: #E8EFE9;
    --ink2: #9CAFA4;
    --ink3: #6B7D74;
    --rule: #1E2D26;
    --rule2: #18241E;
    --green: #4AB57D;
    --green-deep: #2A8155;
    --green-soft: #143828;
    --warn: #E8B547;
    --warn-soft: #2D2516;
    --bad: #E07060;
    --bad-soft: #2D1814;
    --warm: #E8B547;
    --cream: #0F1F18;
  }
  .rk-shell[data-density="compact"] {
    --d-pad: 0.75;
    --d-gap: 0.7;
    --d-type: 0.92;
  }
  .rk-shell[data-density="power"] {
    --d-pad: 0.55;
    --d-gap: 0.5;
    --d-type: 0.82;
  }
  .rk-shell { background: var(--bg); color: #fff; font-family: var(--rk-sans); -webkit-font-smoothing: antialiased; font-size: 14px; min-height: 100vh; display: grid; grid-template-columns: 64px 1fr; }
  .rk-shell * { box-sizing: border-box; }
  .rk-loading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: rgba(255,255,255,0.5); font-size: 13px; }

  /* THIN RAIL */
  .rk-rail { background: var(--bg); border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; align-items: center; padding: 18px 0; gap: 6px; position: sticky; top: 0; height: 100vh; z-index: 1000; }
  .rk-logo { width: 36px; height: 36px; display: grid; place-items: center; margin-bottom: 18px; }
  .rk-shell[data-theme="dark"] .rk-logo path:first-of-type { fill: none; stroke: #FFFFFF; stroke-width: 3; }
  .rk-rail-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 18px; position: relative; text-decoration: none; }
  .rk-rail-icon:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .rk-rail-icon.active { background: rgba(255,255,255,0.1); color: #fff; }
  .rk-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warm); position: absolute; top: 6px; right: 6px; }
  .rk-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%) translateX(-4px); background: #fff; color: var(--ink); font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 8px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.12s, transform 0.12s; z-index: 1001; box-shadow: 0 8px 24px rgba(0,0,0,0.25); border: 1px solid var(--rule); }
  .rk-tip::before { content: ''; position: absolute; left: -5px; top: 50%; transform: translateY(-50%) rotate(45deg); width: 8px; height: 8px; background: #fff; border-left: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .rk-rail-icon:hover .rk-tip { opacity: 1; transform: translateY(-50%) translateX(0); }
  .rk-rail-foot { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .rk-rail-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--warm); color: var(--bg); display: grid; place-items: center; font-weight: 700; font-size: 13px; text-decoration: none; }

  /* MAIN */
  .rk-main { background: var(--cream); color: var(--ink); padding: calc(32px * var(--d-pad)) calc(40px * var(--d-pad)) 100px; min-height: 100vh; max-width: 1280px; }

  /* DEMO BADGE */
  .rk-demo-badge { position: absolute; top: 12px; right: 12px; background: rgba(232,181,71,0.15); color: var(--warm); font-family: var(--rk-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(232,181,71,0.3); z-index: 5; }
  .rk-demo-badge.dark { background: rgba(232,181,71,0.2); color: var(--warm); border-color: rgba(232,181,71,0.4); }

  /* HEADER */
  .rk-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; gap: 16px; flex-wrap: wrap; }
  .rk-head-tools { display: flex; align-items: center; gap: 8px; }
  .rk-tool-btn { width: 40px; height: 40px; border-radius: 999px; background: #fff; border: 1px solid var(--rule); display: grid; place-items: center; cursor: pointer; color: var(--ink2); padding: 0; transition: all 0.12s; }
  .rk-tool-btn:hover { color: var(--green); border-color: var(--green); }
  .rk-shell[data-theme="dark"] .rk-tool-btn { background: var(--panel); border-color: var(--rule); }
  .rk-density-toggle { display: flex; background: #fff; border: 1px solid var(--rule); border-radius: 999px; padding: 3px; gap: 2px; }
  .rk-shell[data-theme="dark"] .rk-density-toggle { background: var(--panel); border-color: var(--rule); }
  .rk-density-toggle button { width: 32px; height: 32px; border-radius: 999px; border: 0; background: transparent; cursor: pointer; padding: 0; display: grid; place-items: center; color: var(--ink3); }
  .rk-density-toggle button svg { width: 14px; height: 14px; }
  .rk-density-toggle button:hover { color: var(--ink); }
  .rk-density-toggle button.active { background: var(--bg); color: var(--warm); }
  .rk-greet-eyebrow { font-family: var(--rk-mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); margin-bottom: 6px; }
  .rk-greet { font-family: var(--rk-display); font-weight: 700; font-size: 30px; letter-spacing: -0.02em; line-height: 1.1; margin: 0; color: var(--ink); }
  .rk-greet .name { color: var(--green); }
  .rk-shell[data-density="power"] .rk-greet { font-size: 22px; }
  .rk-head-search { background: #fff; border: 1px solid var(--rule); border-radius: 999px; padding: 10px 18px; display: flex; align-items: center; gap: 10px; min-width: 240px; font-size: 13px; color: var(--ink3); cursor: pointer; }
  .rk-shell[data-theme="dark"] .rk-head-search { background: var(--panel); color: var(--ink2); border-color: var(--rule); }
  .rk-head-search:hover { border-color: var(--green); }
  .rk-head-search kbd { font-family: var(--rk-mono); font-size: 11px; background: var(--rule2); padding: 2px 6px; border-radius: 4px; color: var(--ink2); margin-left: auto; }
  .rk-shell[data-theme="dark"] .rk-head-search kbd { background: var(--rule); color: var(--ink2); }

  /* ONBOARDING */
  .rk-onboard { background: #fff; border: 1px solid var(--rule); border-radius: 18px; padding: 22px 26px; margin-bottom: 18px; position: relative; }
  .rk-shell[data-theme="dark"] .rk-onboard { background: var(--panel); }
  .rk-onboard-close { position: absolute; top: 16px; right: 16px; background: none; border: 0; color: var(--ink3); cursor: pointer; padding: 6px; border-radius: 6px; }
  .rk-onboard-close:hover { background: var(--rule2); color: var(--ink); }
  .rk-onboard-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .rk-onboard-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--green); margin-bottom: 4px; font-weight: 600; }
  .rk-onboard-head h3 { font-family: var(--rk-display); font-weight: 700; font-size: 17px; margin: 0; letter-spacing: -0.01em; color: var(--ink); }
  .rk-onboard-progress { font-family: var(--rk-mono); font-size: 11px; color: var(--ink2); }
  .rk-onboard-progress b { color: var(--ink); font-size: 13px; }
  .rk-onboard-bar { height: 4px; background: var(--rule2); border-radius: 999px; margin-bottom: 18px; overflow: hidden; }
  .rk-onboard-bar-fill { height: 100%; background: var(--green); border-radius: 999px; transition: width 0.3s; }
  .rk-onboard-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .rk-ob-step { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--rule2); border-radius: 12px; cursor: pointer; transition: background 0.12s; text-decoration: none; color: var(--ink); }
  .rk-ob-step:hover { background: var(--green-soft); }
  .rk-ob-step.done { background: var(--green-soft); }
  .rk-ob-step.done .rk-ob-num { background: var(--green); color: #fff; border-color: var(--green); }
  .rk-ob-step.done .rk-ob-label { color: var(--ink2); text-decoration: line-through; }
  .rk-ob-num { width: 22px; height: 22px; border-radius: 50%; background: #fff; color: var(--ink2); display: grid; place-items: center; font-family: var(--rk-mono); font-size: 11px; font-weight: 700; border: 1.5px solid var(--rule); flex-shrink: 0; }
  .rk-ob-label { font-size: 13px; font-weight: 600; line-height: 1.3; }

  /* SMART FOCUS BANNER */
  .rk-focus { background: linear-gradient(96deg, var(--green-deep) 0%, var(--green) 80%); color: #fff; border-radius: 18px; padding: 18px 24px; margin-bottom: 18px; display: grid; grid-template-columns: auto 1fr auto; gap: 22px; align-items: center; position: relative; overflow: hidden; }
  .rk-shell[data-theme="dark"] .rk-focus { background: linear-gradient(96deg, #000 0%, var(--green-deep) 80%); }
  .rk-focus::after { content: ''; position: absolute; right: -40px; top: -40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(232,181,71,0.18) 0%, transparent 70%); pointer-events: none; }
  .rk-focus-emoji { font-size: 28px; line-height: 1; }
  .rk-focus-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--warm); margin-bottom: 4px; font-weight: 600; }
  .rk-focus-text { font-family: var(--rk-display); font-weight: 600; font-size: 17px; line-height: 1.3; letter-spacing: -0.01em; color: #fff; }
  .rk-focus-text b { color: var(--warm); font-weight: 700; }
  .rk-focus-cta { background: var(--warm); color: var(--bg); border: 0; border-radius: 999px; padding: 10px 18px; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
  .rk-focus-cta:hover { background: #f0c25e; }

  /* QUICK ACTIONS */
  .rk-quick { margin-bottom: 18px; }
  .rk-quick-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .rk-quick-eyebrow { font-family: var(--rk-mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); }
  .rk-quick-edit { font-family: var(--rk-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink2); cursor: pointer; background: none; border: 0; padding: 0; display: inline-flex; align-items: center; gap: 6px; }
  .rk-quick-edit:hover { color: var(--green); }
  .rk-quick-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
  .rk-qa { background: #fff; border: 1px solid var(--rule); border-radius: 14px; padding: 16px 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; font: inherit; transition: border-color 0.12s, background 0.12s; min-height: 88px; position: relative; text-decoration: none; color: var(--ink); }
  .rk-shell[data-theme="dark"] .rk-qa { background: var(--panel); }
  .rk-qa:hover { border-color: var(--green); }
  .rk-qa:hover .rk-qa-ico { background: var(--green); color: #fff; }
  .rk-qa-ico { width: 36px; height: 36px; border-radius: 10px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; transition: background 0.12s, color 0.12s; }
  .rk-qa-label { font-size: 12px; font-weight: 600; color: var(--ink); text-align: center; line-height: 1.2; }
  .rk-qa-add { background: transparent; border: 1.5px dashed var(--rule); color: var(--ink3); }
  .rk-qa-add:hover { border-color: var(--green); background: var(--green-soft); color: var(--green); }
  .rk-qa-add .rk-qa-ico { background: transparent; }
  .rk-qa-add:hover .rk-qa-ico { background: var(--green); color: #fff; }
  .rk-shell[data-density="compact"] .rk-qa, .rk-shell[data-density="power"] .rk-qa { min-height: calc(88px * var(--d-pad)); padding: calc(16px * var(--d-pad)) calc(12px * var(--d-pad)); }

  /* HERO */
  .rk-hero { background: var(--bg); color: #fff; border-radius: 24px; padding: 36px 40px 32px; margin-bottom: 14px; position: relative; overflow: hidden; }
  .rk-hero-eyebrow { font-family: var(--rk-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 16px; }
  .rk-hero-row { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: end; }
  .rk-hero-num { font-family: var(--rk-display); font-weight: 700; font-size: 88px; line-height: 0.95; letter-spacing: -0.04em; color: #fff; }
  .rk-hero-num .cents { font-size: 44px; color: rgba(255,255,255,0.45); font-weight: 500; vertical-align: top; }
  .rk-hero-sub { font-family: var(--rk-serif); font-style: italic; font-size: 15px; color: rgba(255,255,255,0.7); margin-top: 6px; }
  .rk-hero-sub strong { color: #fff; font-weight: 500; font-style: normal; }
  .rk-hero-spark { width: 240px; height: 70px; }
  .rk-hero-attached { border-bottom-left-radius: 0; border-bottom-right-radius: 0; margin-bottom: 0; padding-bottom: 28px; }
  .rk-shell[data-density="compact"] .rk-hero, .rk-shell[data-density="power"] .rk-hero { padding: calc(36px * var(--d-pad)) calc(40px * var(--d-pad)); }
  .rk-shell[data-density="compact"] .rk-hero-num, .rk-shell[data-density="power"] .rk-hero-num { font-size: calc(88px * var(--d-type)); }

  /* TRIPLE STAT */
  .rk-triple { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px; }
  .rk-triple-attached { margin-top: 0; border-top: 1px solid rgba(255,255,255,0.06); }
  .rk-triple-attached .rk-stat:not(.danger) { border-top-left-radius: 0; border-top-right-radius: 0; }
  .rk-triple-attached .rk-stat.danger { border-top-left-radius: 0; border-top-right-radius: 0; background: #18342a; border-color: #18342a; }
  .rk-stat { background: #fff; border: 1px solid var(--rule); border-radius: 18px; padding: 22px 24px; min-height: 144px; display: flex; flex-direction: column; cursor: pointer; transition: border-color 0.12s; text-decoration: none; color: var(--ink); }
  .rk-shell[data-theme="dark"] .rk-stat { background: var(--panel); }
  .rk-stat:hover { border-color: var(--green); }
  .rk-stat-lbl { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .rk-arr { color: var(--ink3); font-size: 14px; }
  .rk-stat:hover .rk-arr { color: var(--green); }
  .rk-stat-val { font-family: var(--rk-display); font-weight: 700; font-size: 34px; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
  .rk-stat-meta { font-size: 13px; color: var(--ink2); margin-top: auto; padding-top: 16px; }
  .rk-stat-meta b { color: var(--ink); font-weight: 600; }
  .rk-stat.danger { background: var(--bg); color: #fff; border-color: var(--bg); }
  .rk-shell[data-theme="dark"] .rk-stat.danger { background: #000; border-color: #000; }
  .rk-stat.danger .rk-stat-lbl { color: rgba(255,255,255,0.5); }
  .rk-stat.danger .rk-arr { color: rgba(255,255,255,0.5); }
  .rk-stat.danger .rk-stat-val { color: #fff; }
  .rk-stat.danger .rk-stat-meta { color: rgba(255,255,255,0.7); }
  .rk-stat.danger .rk-stat-meta b { color: var(--warm); }
  .rk-shell[data-density="compact"] .rk-stat, .rk-shell[data-density="power"] .rk-stat { min-height: auto; padding: calc(22px * var(--d-pad)) calc(24px * var(--d-pad)); }
  .rk-shell[data-density="compact"] .rk-stat-val, .rk-shell[data-density="power"] .rk-stat-val { font-size: calc(34px * var(--d-type)); }

  /* CASH FLOW */
  .rk-cashflow { background: #fff; border: 1px solid var(--rule); border-radius: 20px; padding: 24px 26px 18px; margin-bottom: 14px; position: relative; }
  .rk-shell[data-theme="dark"] .rk-cashflow { background: var(--panel); }
  .rk-cf-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 20px; flex-wrap: wrap; }
  .rk-cf-head h3 { font-family: var(--rk-display); font-weight: 700; font-size: 18px; margin: 0; letter-spacing: -0.01em; color: var(--ink); }
  .rk-cf-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px; }
  .rk-cf-summary { display: flex; gap: 28px; align-items: baseline; }
  .rk-cf-summary .item .l { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); }
  .rk-cf-summary .item .v { font-family: var(--rk-display); font-weight: 700; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); }
  .rk-cf-summary .item .v.in { color: var(--green); }
  .rk-cf-summary .item .v.out { color: var(--bad); }
  .rk-cf-chart { width: 100%; height: 180px; display: block; }
  .rk-cf-legend { display: flex; gap: 22px; font-size: 12px; color: var(--ink2); margin-top: 4px; flex-wrap: wrap; }
  .rk-cf-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  .rk-cf-legend .dot.in { background: var(--green); }
  .rk-cf-legend .dot.out { background: var(--warm); }
  .rk-cf-legend .dot.bal { background: var(--ink); border-radius: 50%; }

  /* LIMIT THERMOMETER */
  .rk-limit { background: #fff; border: 1px solid var(--rule); border-radius: 18px; padding: 22px 26px; margin-bottom: 14px; position: relative; }
  .rk-shell[data-theme="dark"] .rk-limit { background: var(--panel); }
  .rk-limit-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; gap: 16px; flex-wrap: wrap; }
  .rk-limit-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px; font-weight: 600; }
  .rk-limit-head h3 { font-family: var(--rk-display); font-weight: 700; font-size: 17px; margin: 0; letter-spacing: -0.01em; color: var(--ink); }
  .rk-limit-amount { font-family: var(--rk-display); font-weight: 700; font-size: 22px; letter-spacing: -0.02em; white-space: nowrap; color: var(--ink); }
  .rk-limit-amount b { color: var(--ink); }
  .rk-limit-amount .total { color: var(--ink3); font-weight: 600; font-size: 16px; }
  .rk-limit-bar { height: 14px; background: var(--rule2); border-radius: 999px; overflow: visible; position: relative; margin-bottom: 14px; }
  .rk-limit-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--green) 0%, var(--green) 60%, var(--warn) 80%, var(--bad) 100%); transition: width 0.4s; }
  .rk-limit-marker { position: absolute; top: -6px; bottom: -6px; width: 2px; background: var(--ink); }
  .rk-limit-marker::after { content: attr(data-label); position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-family: var(--rk-mono); font-size: 10px; font-weight: 600; color: var(--ink2); white-space: nowrap; letter-spacing: 0.04em; }
  .rk-limit-foot { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink2); gap: 16px; flex-wrap: wrap; }
  .rk-limit-foot b { color: var(--green); font-weight: 700; }

  /* AI PROACTIVE */
  .rk-ai-card { background: linear-gradient(135deg, #0F1F18 0%, #1a2e25 100%); color: #fff; border-radius: 18px; padding: 22px 26px; margin-bottom: 14px; display: grid; grid-template-columns: 44px 1fr auto; gap: 18px; align-items: center; position: relative; overflow: hidden; }
  .rk-ai-card::before { content: ''; position: absolute; right: 0; top: 0; width: 220px; height: 100%; background: radial-gradient(circle at 80% 50%, rgba(232,181,71,0.18) 0%, transparent 60%); pointer-events: none; }
  .rk-ai-orb { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--green), var(--warm)); display: grid; place-items: center; flex-shrink: 0; color: #fff; }
  .rk-ai-text { font-family: var(--rk-display); font-weight: 600; font-size: 16px; line-height: 1.4; letter-spacing: -0.01em; position: relative; z-index: 1; }
  .rk-ai-text .label { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--warm); font-weight: 600; display: block; margin-bottom: 4px; }
  .rk-ai-text b { color: var(--warm); font-weight: 700; }
  .rk-ai-actions { display: flex; gap: 8px; flex-shrink: 0; position: relative; z-index: 1; }
  .rk-ai-btn { font: inherit; font-weight: 600; font-size: 13px; padding: 9px 16px; border-radius: 999px; cursor: pointer; border: 0; }
  .rk-ai-btn.primary { background: var(--warm); color: var(--bg); }
  .rk-ai-btn.primary:hover { background: #f0c25e; }
  .rk-ai-btn.secondary { background: rgba(255,255,255,0.1); color: #fff; }
  .rk-ai-btn.secondary:hover { background: rgba(255,255,255,0.18); }

  /* LOWER ROW */
  .rk-lower { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; margin-top: 14px; }
  .rk-panel { background: #fff; border: 1px solid var(--rule); border-radius: 20px; overflow: hidden; }
  .rk-shell[data-theme="dark"] .rk-panel { background: var(--panel); }
  .rk-panel-head { padding: 20px 26px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--rule2); }
  .rk-panel-head h3 { font-family: var(--rk-display); font-weight: 700; font-size: 18px; margin: 0; letter-spacing: -0.01em; color: var(--ink); }
  .rk-tabs { display: flex; gap: 4px; background: var(--rule2); padding: 3px; border-radius: 999px; }
  .rk-shell[data-theme="dark"] .rk-tabs { background: var(--rule); }
  .rk-tab { padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--ink2); cursor: pointer; text-decoration: none; }
  .rk-tab.active { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  .rk-shell[data-theme="dark"] .rk-tab.active { background: var(--panel); color: var(--ink); }
  .rk-act-row { display: grid; grid-template-columns: 36px 1fr auto auto; gap: 16px; align-items: center; padding: 16px 26px; border-top: 1px solid var(--rule2); cursor: pointer; text-decoration: none; color: var(--ink); }
  .rk-act-row:hover { background: var(--rule2); }
  .rk-act-ico { width: 36px; height: 36px; border-radius: 10px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-family: var(--rk-serif); font-weight: 600; font-size: 14px; }
  .rk-act-ico.late { background: var(--bad-soft); color: var(--bad); }
  .rk-act-name { font-weight: 600; font-size: 14px; color: var(--ink); }
  .rk-act-sub { font-family: var(--rk-mono); font-size: 11px; color: var(--ink3); margin-top: 2px; letter-spacing: 0.04em; }
  .rk-act-amt { font-family: var(--rk-display); font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
  .rk-act-amt.neg { color: var(--bad); }
  .rk-act-amt.in { color: var(--green); }
  .rk-pill { font-family: var(--rk-mono); font-size: 10px; padding: 4px 10px; border-radius: 4px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .rk-pill.sent { background: var(--rule2); color: var(--ink2); }
  .rk-shell[data-theme="dark"] .rk-pill.sent { background: var(--rule); color: var(--ink2); }
  .rk-pill.late { background: var(--bad-soft); color: var(--bad); }
  .rk-pill.paid { background: var(--green-soft); color: var(--green); }
  .rk-pill.draft { background: var(--warn-soft); color: var(--warn); }
  .rk-shell[data-density="compact"] .rk-act-row { padding: calc(16px * var(--d-pad)) 26px; }
  .rk-shell[data-density="power"] .rk-act-row { padding: 8px 26px; }
  .rk-shell[data-density="power"] .rk-act-ico { width: 28px; height: 28px; font-size: 12px; }
  .rk-shell[data-density="power"] .rk-panel-head { padding: 14px 26px; }

  .rk-dl-row { padding: 18px 26px; border-top: 1px solid var(--rule2); display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; text-decoration: none; color: var(--ink); }
  .rk-dl-row:first-of-type { border-top: 0; }
  .rk-dl-row:hover { background: var(--rule2); }
  .rk-dl-name { font-weight: 600; font-size: 14px; color: var(--ink); }
  .rk-dl-when { font-family: var(--rk-mono); font-size: 11px; color: var(--ink3); margin-top: 2px; letter-spacing: 0.04em; }
  .rk-dl-amt { font-family: var(--rk-display); font-weight: 700; font-size: 18px; letter-spacing: -0.02em; text-align: right; color: var(--ink); }
  .rk-dl-countdown { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; margin-top: 4px; font-weight: 600; color: var(--ink2); }
  .rk-dl-row.urgent .rk-dl-countdown { color: var(--warn); }
  .rk-dl-row.urgent .rk-dl-amt { color: var(--warn); }
  .rk-dl-cta-wrap { padding: 14px 20px 20px; }
  .rk-dl-cta { background: var(--bg); color: #fff; border: 0; border-radius: 999px; padding: 12px 18px; font: inherit; font-weight: 600; font-size: 13px; cursor: pointer; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  .rk-dl-cta:hover { background: var(--green-deep); }
  .rk-dl-cta .arr { color: var(--warm); }

  /* NEWS / LEGAL */
  .rk-news-wrap { margin-top: 28px; }

  /* FAB */
  .rk-fab { position: fixed; bottom: 28px; right: 32px; background: var(--bg); color: #fff; border: 0; border-radius: 999px; padding: 14px 22px; font: inherit; font-weight: 600; font-size: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; z-index: 100; text-decoration: none; }
  .rk-fab:hover { background: var(--green-deep); }

  /* MODAL */
  .rk-modal-backdrop { position: fixed; inset: 0; background: rgba(15,31,24,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(4px); padding: 16px; }
  .rk-modal { background: #fff; border-radius: 20px; width: 100%; max-width: 520px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
  .rk-shell[data-theme="dark"] .rk-modal { background: var(--panel); }
  .rk-modal-head { padding: 22px 26px; border-bottom: 1px solid var(--rule2); display: flex; justify-content: space-between; align-items: center; }
  .rk-modal-head h3 { font-family: var(--rk-display); font-weight: 700; font-size: 18px; margin: 0; color: var(--ink); }
  .rk-modal-close { background: none; border: 0; font-size: 18px; cursor: pointer; color: var(--ink3); padding: 4px; }
  .rk-modal-body { padding: 14px 22px; overflow-y: auto; flex: 1; }
  .rk-qa-toggle { display: flex; align-items: center; justify-content: space-between; padding: 11px 4px; border-bottom: 0.5px solid var(--rule2); }
  .rk-qa-toggle:last-child { border-bottom: 0; }
  .rk-qa-toggle-left { display: flex; align-items: center; gap: 12px; }
  .rk-qa-toggle-ico { width: 32px; height: 32px; border-radius: 8px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; flex-shrink: 0; }
  .rk-qa-toggle-name { font-size: 13px; font-weight: 600; color: var(--ink); }
  .rk-qa-toggle-sub { font-size: 11px; color: var(--ink3); margin-top: 1px; }
  .rk-toggle { width: 36px; height: 20px; border-radius: 999px; background: var(--rule); cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
  .rk-toggle[data-on="true"] { background: var(--green); }
  .rk-toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
  .rk-toggle[data-on="true"] .rk-toggle-knob { left: 18px; }
  .rk-modal-foot { padding: 14px 22px 18px; border-top: 1px solid var(--rule2); }
  .rk-modal-save { width: 100%; padding: 11px; border-radius: 8px; background: var(--green); color: #fff; border: 0; font: inherit; font-weight: 600; font-size: 13px; cursor: pointer; }
  .rk-modal-save:hover:not(:disabled) { background: var(--green-deep); }
  .rk-modal-save:disabled { opacity: 0.6; cursor: not-allowed; }

  /* VOICE MODAL */
  .rk-voice-backdrop { position: fixed; inset: 0; background: rgba(15,31,24,0.55); display: flex; align-items: center; justify-content: center; z-index: 2500; backdrop-filter: blur(6px); }
  .rk-voice-card { background: #fff; border-radius: 28px; padding: 40px 44px; width: 480px; max-width: 92vw; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.3); }
  .rk-shell[data-theme="dark"] .rk-voice-card { background: var(--panel); }
  .rk-voice-orb { width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, var(--green), var(--green-deep)); margin: 0 auto 20px; display: grid; place-items: center; color: #fff; }
  .rk-voice-eyebrow { font-family: var(--rk-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--green); font-weight: 600; margin-bottom: 8px; }
  .rk-voice-text { font-family: var(--rk-display); font-weight: 600; font-size: 22px; letter-spacing: -0.01em; line-height: 1.3; color: var(--ink); margin-bottom: 24px; }
  .rk-voice-hints { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 20px; }
  .rk-voice-hints span { font-family: var(--rk-mono); font-size: 11px; padding: 5px 10px; border-radius: 999px; background: var(--rule2); color: var(--ink2); }
  .rk-voice-actions { display: flex; gap: 8px; justify-content: center; }
  .rk-voice-cancel { background: transparent; color: var(--ink2); font: inherit; font-weight: 600; font-size: 13px; padding: 11px 22px; border-radius: 999px; cursor: pointer; border: 1px solid var(--rule); }

  /* UPN MODAL */
  .rk-upn-backdrop { position: fixed; inset: 0; background: rgba(15,31,24,0.55); display: flex; align-items: center; justify-content: center; z-index: 2500; backdrop-filter: blur(6px); padding: 20px; }
  .rk-upn-card { background: #fff; border-radius: 24px; width: 720px; max-width: 100%; max-height: 92vh; overflow: hidden; display: grid; grid-template-columns: 1fr 280px; }
  .rk-shell[data-theme="dark"] .rk-upn-card { background: var(--panel); }
  .rk-upn-left { padding: 32px 32px 28px; position: relative; }
  .rk-upn-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--green); font-weight: 600; margin-bottom: 6px; }
  .rk-upn-card h3 { font-family: var(--rk-display); font-weight: 700; font-size: 22px; letter-spacing: -0.01em; margin: 0 0 22px; color: var(--ink); }
  .rk-upn-fields { display: grid; gap: 0; margin-bottom: 24px; }
  .rk-upn-field { display: grid; grid-template-columns: 110px 1fr; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--rule2); align-items: baseline; }
  .rk-upn-field:last-child { border-bottom: 0; }
  .rk-upn-field .l { font-family: var(--rk-mono); font-size: 11px; color: var(--ink3); letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600; }
  .rk-upn-field .v { font-size: 14px; color: var(--ink); font-weight: 500; }
  .rk-upn-field .v.amount { font-family: var(--rk-display); font-size: 22px; font-weight: 700; color: var(--green); letter-spacing: -0.02em; }
  .rk-upn-field .v.iban { font-family: var(--rk-mono); font-size: 13px; }
  .rk-upn-actions { display: flex; gap: 10px; }
  .rk-upn-actions button { font: inherit; font-weight: 600; font-size: 13px; padding: 12px 20px; border-radius: 999px; cursor: pointer; border: 0; flex: 1; }
  .rk-upn-pay { background: var(--rule2); color: var(--ink); }
  .rk-upn-pay:hover { background: var(--rule); }
  .rk-upn-bank { background: var(--green); color: #fff; }
  .rk-upn-bank:hover { background: var(--green-deep); }
  .rk-upn-right { background: var(--cream); padding: 32px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
  .rk-shell[data-theme="dark"] .rk-upn-right { background: var(--rule2); }
  .rk-upn-qr-eyebrow { font-family: var(--rk-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink2); font-weight: 600; }
  .rk-upn-qr { width: 200px; height: 200px; background: #fff; border-radius: 16px; padding: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .rk-upn-qr svg { width: 100%; height: 100%; }
  .rk-upn-qr-hint { font-size: 12px; color: var(--ink2); line-height: 1.5; max-width: 200px; }
  .rk-upn-close { position: absolute; top: 16px; right: 16px; background: rgba(0,0,0,0.06); border: 0; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; color: var(--ink); font-size: 18px; line-height: 1; }

  /* TOAST */
  .rk-toast-wrap { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 3000; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
  .rk-toast { background: var(--bg); color: #fff; padding: 12px 20px; border-radius: 999px; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.18); display: flex; align-items: center; gap: 10px; pointer-events: auto; opacity: 1; }
  .rk-toast .ti { width: 20px; height: 20px; border-radius: 50%; background: var(--warm); color: var(--bg); display: grid; place-items: center; font-size: 12px; font-weight: 700; }

  /* COMMAND PALETTE */
  .rk-palette-backdrop { position: fixed; inset: 0; background: rgba(15,31,24,0.4); display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; z-index: 2500; backdrop-filter: blur(8px); }
  .rk-palette { background: #fff; border-radius: 16px; width: 100%; max-width: 600px; max-height: 70vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,0.25); border: 1px solid var(--rule); }
  .rk-shell[data-theme="dark"] .rk-palette { background: var(--panel); }
  .rk-palette-input-wrap { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--rule2); color: var(--ink2); }
  .rk-palette-input-wrap input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 15px; color: var(--ink); }
  .rk-palette-input-wrap input::placeholder { color: var(--ink3); }
  .rk-palette-input-wrap kbd { font-family: var(--rk-mono); font-size: 10px; background: var(--rule2); color: var(--ink2); padding: 3px 7px; border-radius: 4px; font-weight: 600; }
  .rk-shell[data-theme="dark"] .rk-palette-input-wrap kbd { background: var(--rule); }
  .rk-palette-results { flex: 1; overflow-y: auto; padding: 6px; }
  .rk-palette-empty { padding: 32px 20px; text-align: center; color: var(--ink3); font-size: 13px; }
  .rk-palette-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.08s; }
  .rk-palette-item.selected { background: var(--green-soft); }
  .rk-palette-ico { width: 32px; height: 32px; border-radius: 8px; background: var(--rule2); color: var(--ink2); display: grid; place-items: center; flex-shrink: 0; }
  .rk-shell[data-theme="dark"] .rk-palette-ico { background: var(--rule); }
  .rk-palette-item.selected .rk-palette-ico { background: var(--green); color: #fff; }
  .rk-palette-text { flex: 1; min-width: 0; }
  .rk-palette-label { font-size: 14px; font-weight: 600; color: var(--ink); }
  .rk-palette-sub { font-size: 12px; color: var(--ink3); margin-top: 1px; }
  .rk-palette-enter { font-family: var(--rk-mono); font-size: 11px; color: var(--ink3); background: var(--rule2); padding: 3px 7px; border-radius: 4px; opacity: 0; transition: opacity 0.1s; }
  .rk-shell[data-theme="dark"] .rk-palette-enter { background: var(--rule); }
  .rk-palette-item.selected .rk-palette-enter { opacity: 1; color: var(--green); }
  .rk-palette-foot { padding: 10px 20px; border-top: 1px solid var(--rule2); display: flex; gap: 16px; font-family: var(--rk-mono); font-size: 10px; color: var(--ink3); letter-spacing: 0.04em; }

  /* NOTIFICATIONS BELL + DROPDOWN */
  .rk-tool-bell { position: relative; }
  .rk-bell-badge { position: absolute; top: 4px; right: 4px; min-width: 16px; height: 16px; background: var(--bad); color: #fff; border-radius: 999px; font-size: 9px; font-weight: 700; display: grid; place-items: center; padding: 0 4px; border: 2px solid var(--cream); line-height: 1; }
  .rk-shell[data-theme="dark"] .rk-bell-badge { border-color: var(--bg); }
  .rk-notif-dropdown { position: fixed; top: 80px; right: 32px; width: 360px; max-width: calc(100vw - 32px); background: #fff; border: 1px solid var(--rule); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.16); z-index: 1600; overflow: hidden; }
  .rk-shell[data-theme="dark"] .rk-notif-dropdown { background: var(--panel); }
  .rk-notif-head { padding: 14px 18px; border-bottom: 1px solid var(--rule2); display: flex; justify-content: space-between; align-items: center; }
  .rk-notif-head h4 { font-family: var(--rk-display); font-weight: 700; font-size: 14px; margin: 0; color: var(--ink); }
  .rk-notif-count { background: var(--bad); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .rk-notif-list { max-height: 400px; overflow-y: auto; }
  .rk-notif-empty { padding: 28px 18px; text-align: center; color: var(--ink3); font-size: 13px; }
  .rk-notif-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--rule2); cursor: pointer; text-decoration: none; color: var(--ink); transition: background 0.1s; }
  .rk-notif-item:last-child { border-bottom: 0; }
  .rk-notif-item:hover { background: var(--rule2); }
  .rk-notif-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .rk-notif-item.urgent .rk-notif-dot { background: var(--bad); }
  .rk-notif-item.warning .rk-notif-dot { background: var(--warm); }
  .rk-notif-item.info .rk-notif-dot { background: var(--green); }
  .rk-notif-title { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.4; }
  .rk-notif-sub { font-size: 11px; color: var(--ink3); margin-top: 2px; font-family: var(--rk-mono); letter-spacing: 0.04em; }

  /* VOICE WAVE animation */
  .rk-voice-orb.listening { animation: voicePulse 1.6s ease-in-out infinite; }
  @keyframes voicePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(14,94,59,0.4); } 50% { box-shadow: 0 0 0 16px rgba(14,94,59,0); } }
  .rk-voice-orb.understood { background: linear-gradient(135deg, var(--green), var(--warm)); }
  .rk-voice-wave { display: flex; gap: 4px; align-items: center; justify-content: center; height: 24px; margin-bottom: 16px; }
  .rk-voice-wave span { display: inline-block; width: 3px; background: var(--green); border-radius: 2px; animation: voiceWave 1s ease-in-out infinite; }
  .rk-voice-wave span:nth-child(1) { animation-delay: 0s; height: 8px; }
  .rk-voice-wave span:nth-child(2) { animation-delay: 0.1s; height: 14px; }
  .rk-voice-wave span:nth-child(3) { animation-delay: 0.2s; height: 20px; }
  .rk-voice-wave span:nth-child(4) { animation-delay: 0.3s; height: 18px; }
  .rk-voice-wave span:nth-child(5) { animation-delay: 0.4s; height: 22px; }
  .rk-voice-wave span:nth-child(6) { animation-delay: 0.5s; height: 16px; }
  .rk-voice-wave span:nth-child(7) { animation-delay: 0.6s; height: 18px; }
  .rk-voice-wave span:nth-child(8) { animation-delay: 0.7s; height: 12px; }
  .rk-voice-wave span:nth-child(9) { animation-delay: 0.8s; height: 8px; }
  @keyframes voiceWave { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.4); } }
  .rk-voice-confirm { background: var(--green); color: #fff; font: inherit; font-weight: 600; font-size: 13px; padding: 11px 22px; border-radius: 999px; cursor: pointer; border: 0; }
  .rk-voice-confirm:hover { background: var(--green-deep); }

  /* DRAGGABLE QA in modal */
  .rk-qa-draggable:hover { background: var(--green-soft) !important; }
  .rk-qa-draggable:active { cursor: grabbing; }

  /* MOBILE */
  @media (max-width: 768px) {
    .rk-shell { grid-template-columns: 1fr; }
    .rk-rail { display: none; }
    .rk-main { padding: 20px 16px 90px; }
    .rk-greet { font-size: 22px; }
    .rk-head-search { display: none; }
    .rk-onboard-list { grid-template-columns: 1fr 1fr; }
    .rk-quick-grid { grid-template-columns: repeat(3, 1fr); }
    .rk-hero { padding: 24px 20px 22px; }
    .rk-hero-num { font-size: 56px; }
    .rk-hero-num .cents { font-size: 28px; }
    .rk-hero-spark { display: none; }
    .rk-hero-row { grid-template-columns: 1fr; }
    .rk-triple { grid-template-columns: 1fr; gap: 8px; margin-bottom: 18px; }
    .rk-stat { min-height: auto; padding: 16px 18px; }
    .rk-cf-summary { gap: 16px; flex-wrap: wrap; }
    .rk-cf-summary .item .v { font-size: 16px; }
    .rk-limit-head { flex-direction: column; align-items: flex-start; gap: 8px; }
    .rk-ai-card { grid-template-columns: 1fr; gap: 12px; }
    .rk-ai-orb { display: none; }
    .rk-ai-actions { width: 100%; }
    .rk-ai-btn { flex: 1; }
    .rk-lower { grid-template-columns: 1fr; }
    .rk-act-row { padding: 12px 16px; gap: 10px; grid-template-columns: 28px 1fr auto; }
    .rk-act-row .rk-pill { display: none; }
    .rk-act-ico { width: 28px; height: 28px; font-size: 12px; }
    .rk-dl-row { padding: 14px 16px; }
    .rk-panel-head { padding: 14px 16px; }
    .rk-focus { grid-template-columns: 1fr; gap: 12px; padding: 16px 18px; }
    .rk-focus-cta { width: 100%; }
    .rk-focus-emoji { font-size: 24px; }
    .rk-fab { bottom: 16px; right: 16px; padding: 12px 18px; }
    .rk-upn-card { grid-template-columns: 1fr; max-height: 90vh; overflow-y: auto; }
    .rk-upn-right { padding: 24px 20px; }
    .rk-palette { max-width: calc(100vw - 24px); margin: 0 12px; }
    .rk-palette-backdrop { padding-top: 8vh; }
    .rk-notif-dropdown { top: 70px; right: 12px; width: calc(100vw - 24px); }
  }
`
