// @ts-nocheck
'use client'
export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { pos, BUSINESS_ID } from '@/lib/pos-client'

// ================================================================
// TEMA
// ================================================================
const T = {
  bg: '#f4efe5', surface: '#ffffff', surface2: '#faf5e9', surface3: '#efeadf',
  ink: '#1a1f1a', inkSoft: '#3a3f3a', muted: '#6b6962', mutedSoft: '#9a9890',
  line: 'rgba(26,31,26,0.10)', lineSoft: 'rgba(26,31,26,0.06)',
  header: '#0d2818', headerInk: '#f6f1e8', headerLine: 'rgba(246,241,232,0.10)',
  brand: '#e9b949', accent: '#1f6b3a', accentText: '#ffffff',
  accentSoft: 'rgba(31,107,58,0.10)', danger: '#a83232', warn: '#b88c28',
  chipBg: '#efeadf', modalBg: '#fff', inputBg: '#fafaf7', summaryBg: '#f9f5eb',
  status: {
    free: { bg: '#ffffff', stroke: 'rgba(31,107,58,0.5)', dot: '#1f6b3a', label: 'Prosto' },
    occupied: { bg: 'rgba(233,185,73,0.18)', stroke: 'rgba(184,140,40,0.55)', dot: '#b88c28', label: 'Zasedeno' },
    reserved: { bg: 'rgba(155,122,201,0.15)', stroke: 'rgba(99,72,150,0.5)', dot: '#634896', label: 'Rezerv.' },
    needs_attention: { bg: 'rgba(168,50,50,0.10)', stroke: 'rgba(168,50,50,0.55)', dot: '#a83232', label: 'Pozor' },
  },
}

// ================================================================
// STATIČNA KONFIGURACIJA (ne gre v DB)
// ================================================================
const CFG = {
  business: { name: 'ŠIRM fitness&bar', location: 'Gorenja vas' },
  paymentMethods: [
    { id: 'cash', name: 'Gotovina', icon: '💶' },
    { id: 'card', name: 'Kartica', icon: '💳' },
    { id: 'bon',  name: 'Boni',    icon: '🎫' },
    { id: 'prep', name: 'Predplačilo', icon: '💰' },
  ],
  tips: [0, 5, 10, 15],
  masterPin: '9999',
  rolePresets: {
    Lastnik:   { sale:true,  openCash:true,  refund:true,  voidReceipt:true,  manualDiscount:true,  dailyClose:true,  viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:true,  viewRevenue:true,  viewReports:true,  exportData:true,  editPrices:true,  manageStaff:true,  editSpaces:true,  systemSettings:true  },
    Vodja:     { sale:true,  openCash:true,  refund:true,  voidReceipt:true,  manualDiscount:true,  dailyClose:true,  viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:true,  viewRevenue:true,  viewReports:true,  exportData:true,  editPrices:true,  manageStaff:false, editSpaces:true,  systemSettings:true  },
    Blagajnik: { sale:true,  openCash:true,  refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:false, manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
    Trener:    { sale:false, openCash:false, refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:false, manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
    Terapevt:  { sale:false, openCash:false, refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
  },
  autoLockOptions: [
    { id: '15s',   label: '15 sekund', ms: 15000  },
    { id: '30s',   label: '30 sekund', ms: 30000  },
    { id: '1min',  label: '1 minuta',  ms: 60000  },
    { id: '5min',  label: '5 minut',   ms: 300000 },
    { id: 'never', label: 'Nikoli',    ms: 0      },
  ],
  profiles: [
    { id: 'all',      name: 'Vse v enem',       icon: '🌐', nav: ['floor','sale','calendar','customers','packages','inventory','reports','admin'] },
    { id: 'rest',     name: 'Restavracija',      icon: '🍽', nav: ['floor','sale','calendar','customers','inventory','reports','admin'] },
    { id: 'bar',      name: 'Bar / Kavarna',     icon: '🍺', nav: ['floor','sale','customers','inventory','reports','admin'] },
    { id: 'storitve', name: 'Storitve',           icon: '💆', nav: ['calendar','customers','packages','sale','reports','admin'] },
    { id: 'trznica',  name: 'Tržnica / Stojnica', icon: '🥕', nav: ['sale','inventory','reports','admin'] },
  ],
  permissionGroups: [
    { title: 'Blagajna & Prodaja', items: [['sale','Prodaja'],['openCash','Odpri blagajno'],['voidReceipt','Storno računa'],['refund','Vračilo'],['manualDiscount','Ročni popust'],['dailyClose','Dnevni zaključek']] },
    { title: 'Člani & Termini',    items: [['viewMembers','Poglej člane'],['editMembers','Uredi profile'],['manageBookings','Upravljaj termine']] },
    { title: 'Finance',            items: [['viewSales','Poglej promet'],['viewRevenue','Poglej prihodke'],['viewReports','Poglej poročila'],['exportData','Izvozi podatke']] },
    { title: 'Nastavitve',         items: [['editPrices','Uredi cenik'],['manageStaff','Upravljaj zaposlene'],['editSpaces','Prostori & mize'],['systemSettings','Nastavitve sistema']] },
  ],
}

// ================================================================
// HELPERS
// ================================================================
const eur = (v) => '€ ' + Number(v).toFixed(2).replace('.', ',')

const H = {
  lineTotal: (l) => {
    const base = (l.price + (l.mods || []).reduce((s, m) => s + (m.delta || 0), 0)) * l.qty
    return l.happyHourApplied ? base * 0.8 : base
  },
  orderTotals: (cart) => {
    const sub = cart.reduce((s, l) => s + H.lineTotal(l), 0)
    return { sub, ddv: sub - sub / 1.22, total: sub }
  },
  isHappyHourEligible: (itemName) => {
    const n = (itemName || '').toLowerCase()
    return n.includes('pivo') || n.includes('vino') || n.includes('laško') ||
           n.includes('union') || n.includes('radler') || n.includes('whisky') ||
           n.includes('viljam') || n.includes('borovni') || n.includes('žganje')
  },
  memberStatus: (pkgs) => {
    if (!pkgs || pkgs.length === 0) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const active = pkgs.filter(p => p.active)
    if (active.length === 0) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const pkg = active[0]
    const today = new Date()
    const expires = new Date(pkg.expires)
    const daysToExpiry = Math.floor((expires - today) / 86400000)
    const remainingVisits = pkg.remaining
    let status = 'active'
    if (daysToExpiry < 0) status = 'expired'
    else if (daysToExpiry <= 3 || remainingVisits <= 1) status = 'critical'
    else if (daysToExpiry <= 7 || remainingVisits <= 2) status = 'expiring'
    return { status, remainingVisits, daysToExpiry }
  },
}

// ================================================================
// SUPABASE DATA HOOK — branje vseh live podatkov iz DB
// ================================================================
function usePosData() {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [spaces, setSpaces] = useState([])
  const [customers, setCustomers] = useState([])
  const [staffList, setStaffList] = useState([])
  const [packageTemplates, setPackageTemplates] = useState([])
  const [services, setServices] = useState([])
  const [todayStats, setTodayStats] = useState({ promet: 0, racuni: 0, napitnine: 0 })
  const [businessProfile, setBusinessProfile] = useState('all')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, itms, sps, custs, stf, pkgs, svcs, stats] = await Promise.all([
          pos.categories.list(),
          pos.items.list(),
          pos.spaces.list(),
          pos.customers.list(),
          pos.staff.list(),
          pos.packageTemplates.list(),
          pos.services.list(),
          pos.reports.dailyStats(),
        ])
        setCategories(cats)
        setItems(itms)
        setSpaces(sps)
        setCustomers(custs)
        setStaffList(stf)
        setPackageTemplates(pkgs)
        setServices(svcs)
        setTodayStats(stats)
        // Fetch business profile
        const { data: bizData } = await createClient().from('businesses').select('profile_type').eq('id', BUSINESS_ID).single()
        if (bizData?.profile_type) setBusinessProfile(bizData.profile_type)
      } catch (e) {
        console.error('usePosData error:', e)
      }
      setLoading(false)
    }
    load()
  }, [reloadKey])

  function itemsIn(catId) {
    if (catId === 'cat-fav') {
      const favs = items.filter(i => i.fav)
      return favs.length > 0 ? favs : items.slice(0, 12)
    }
    return items.filter(i => i.category_id === catId)
  }

  const categoriesWithFav = useMemo(() => {
    if (categories.length === 0) return []
    return [{ id: 'cat-fav', name: 'Priljubljeno', icon: '★', color: '#E9B949' }, ...categories]
  }, [categories])

  return { categories: categoriesWithFav, items, spaces, customers, staffList, packageTemplates, services, todayStats, businessProfile, setBusinessProfile, loading, itemsIn, refresh }
}

// ================================================================
// AUTH HOOK — real PIN login iz DB
// ================================================================
function useAuthState(autoLockMs = 60000) {
  const [user, setUser] = useState(null)
  const [locked, setLocked] = useState(true)
  const [autoLock, setAutoLock] = useState(autoLockMs)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const reset = () => { lastActivity.current = Date.now() }
    ;['mousedown', 'touchstart', 'keydown', 'wheel'].forEach(e => window.addEventListener(e, reset))
    return () => ['mousedown', 'touchstart', 'keydown', 'wheel'].forEach(e => window.removeEventListener(e, reset))
  }, [])

  useEffect(() => {
    if (autoLock === 0) return
    const t = setInterval(() => {
      if (!locked && Date.now() - lastActivity.current > autoLock) setLocked(true)
    }, 1000)
    return () => clearInterval(t)
  }, [autoLock, locked])

  const permissions = useMemo(() => {
    if (!user) return {}
    if (user.is_master) return Object.fromEntries(Object.keys(CFG.rolePresets.Lastnik).map(k => [k, true]))
    return user.permissions || CFG.rolePresets[user.role] || {}
  }, [user])

  async function unlock(pin) {
    try {
      // Master PIN
      if (pin === CFG.masterPin) {
        setUser({ id: null, name: 'Master', role: 'Lastnik', color: '#a83232', is_master: true })
        setLocked(false)
        lastActivity.current = Date.now()
        return true
      }
      // DB PIN login
      const staff = await pos.auth.pinLogin(pin)
      if (staff) {
        setUser(staff)
        setLocked(false)
        lastActivity.current = Date.now()
        return true
      }
      return false
    } catch (e) {
      console.error('PIN login error:', e)
      return false
    }
  }

  function lock() { setLocked(true) }

  return { user, permissions, locked, lock, unlock, autoLock, setAutoLock }
}

// ================================================================
// IKONE
// ================================================================
const KI = ({ name, size = 18, strokeWidth = 1.7 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    x: <><path d="M6 6l12 12M18 6L6 18"/></>,
    chev: <path d="m9 6 6 6-6 6"/>,
    chevD: <path d="m6 9 6 6 6-6"/>,
    chair: <><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 10h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"/><path d="M7 17v3M17 17v3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M14 20c0-2 2-4 4-4s4 2 4 4"/></>,
    print: <><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>,
    percent: <><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></>,
    check: <path d="m5 13 4 4L20 6"/>,
    bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
    package: <><path d="M16 3l5 3v12l-9 5-9-5V6l5-3M3 6l9 5 9-5M12 11v10"/></>,
    pin: <><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    add_user: <><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-7 6-7s6 3 6 7"/><path d="M19 8v6M22 11h-6"/></>,
    split: <><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-5M20 17h-5"/></>,
    home: <path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2v-9z"/>,
    barcode: <><path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14"/></>,
    happy: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></>,
    scale: <><path d="M12 3v18M5 7l7-4 7 4M3 12l2-5 2 5a2 2 0 1 1-4 0zM17 12l2-5 2 5a2 2 0 1 1-4 0zM7 21h10"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
    refund: <><path d="M3 9h13a5 5 0 0 1 0 10H6"/><path d="m7 5-4 4 4 4"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] || <circle cx="12" cy="12" r="9"/>}
    </svg>
  )
}

// ================================================================
// LOCK SCREEN
// ================================================================
function LockScreen({ auth }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  async function tryUnlock(fullPin) {
    setLoading(true)
    const ok = await auth.unlock(fullPin)
    if (!ok) { setError(true); setPin(''); setTimeout(() => setError(false), 1200) }
    setLoading(false)
  }

  function press(d) {
    if (pin.length >= 6 || loading) return
    setError(false)
    const next = pin + d
    setPin(next)
    setTimeout(() => tryUnlock(next), 800)
  }

  function backspace() { setError(false); setPin(p => p.slice(0, -1)) }

  const days = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']

  return (
    <div style={{ position:'absolute', inset:0, zIndex:1000, background:'radial-gradient(circle at center, #1a3520 0%, #0d2818 60%, #06140d 100%)', color:T.headerInk, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'"Inter", system-ui, sans-serif' }}>
      <div style={{ position:'absolute', top:32, left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:T.brand, color:T.header, fontWeight:800, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{CFG.business.name}</div>
        </div>
      </div>

      <div style={{ marginBottom:28, textAlign:'center' }}>
        <div style={{ fontSize:78, fontWeight:200, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.04em', lineHeight:1 }}>
          {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
        </div>
        <div style={{ fontSize:14, opacity:0.7, marginTop:8, fontWeight:500 }}>
          {days[now.getDay()]}, {now.getDate()}. {months[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      <div style={{ textAlign:'center', marginBottom:22 }}>
        <div style={{ fontSize:13, opacity:0.65, fontWeight:600, marginBottom:14, letterSpacing:'0.04em' }}>Vnesite PIN za vstop</div>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          {Array.from({length:6}).map((_,i) => (
            <div key={i} style={{ width:14, height:14, borderRadius:999, background: pin.length > i ? (error ? '#ff5577' : T.brand) : 'rgba(246,241,232,0.15)', border:'1.5px solid '+(pin.length > i ? 'transparent' : 'rgba(246,241,232,0.3)'), transition:'background .15s' }}/>
          ))}
        </div>
        {error && <div style={{ fontSize:13, color:'#ff5577', marginTop:14, fontWeight:700 }}>Napačna koda</div>}
        {loading && <div style={{ fontSize:13, opacity:0.6, marginTop:14 }}>Preverjam...</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 84px)', gap:14 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => press(String(n))} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:28, fontWeight:400 }}>{n}</button>
        ))}
        <div/>
        <button onClick={() => press('0')} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:28, fontWeight:400 }}>0</button>
        <button onClick={backspace} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l5-6h13v12H8l-5-6z"/><path d="m13 9 4 6M17 9l-4 6"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ================================================================
// MODAL
// ================================================================
function Modal({ open, onClose, children, width=480 }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(15,20,18,0.55)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth:'94%', maxHeight:'92%', overflow:'auto', background:T.modalBg, borderRadius:14, border:'1px solid rgba(0,0,0,0.06)', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(0,0,0,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
      <button onClick={onClose} style={{ width:32, height:32, borderRadius:10, border:'1px solid rgba(0,0,0,0.08)', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <KI name="x" size={16}/>
      </button>
    </div>
  )
}

// ================================================================
// PAYMENT MODAL — real Supabase order + payment
// ================================================================
function PaymentModal({ open, total, cart, activeTable, activeCustomer, auth, onCancel, onComplete }) {
  const [method, setMethod] = useState('cash')
  const [tipPct, setTipPct] = useState(0)
  const [given, setGiven] = useState('')
  const [discount, setDiscount] = useState(0)
  const [furs, setFurs] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) { setMethod('cash'); setTipPct(0); setGiven(''); setDiscount(0); setFurs(true); setError(null); setProcessing(false) }
  }, [open])

  const finalTotal = (total - total * discount / 100) + total * tipPct / 100
  const change = method === 'cash' && given ? Math.max(0, parseFloat(given) - finalTotal) : 0

  async function submitPayment() {
    if (!auth?.user?.id && !auth?.user?.is_master) {
      setError('Ni prijavljenega blagajnika')
      return
    }
    setProcessing(true)
    setError(null)
    try {
      const cashierId = auth.user.id || null

      // 1. Odpri naročilo
      const orderId = await pos.orders.openOrder({
        tableId: activeTable?.id,
        customerId: activeCustomer?.id,
        cashierId,
      })

      // 2. Dodaj vrstice
      for (const line of cart) {
        await pos.orders.addLine(orderId, {
          itemId: line.id,
          name: line.name,
          qty: line.qty,
          unitPrice: line.happyHourApplied ? line.price * 0.8 : line.price,
          vatRate: line.vat_rate || 22,
          mods: line.mods || [],
          note: line.note || null,
        })
      }

      // 3. Plačaj + FURS
      let fursEor = null
      let fursZoi = null
      if (furs) {
        try {
          const fursRes = await fetch('/api/furs/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, total: finalTotal }),
          })
          if (fursRes.ok) {
            const fursData = await fursRes.json()
            fursEor = fursData.eor
            fursZoi = fursData.zoi
          }
        } catch (e) {
          console.warn('FURS klic ni uspel, račun bo shranjen brez EOR:', e.message)
        }
      }

      const payResult = await pos.orders.pay({
        orderId,
        method: method === 'bon' ? 'bon' : method === 'prep' ? 'prep' : method,
        amount: finalTotal,
        received: method === 'cash' && given ? parseFloat(given) : null,
        furs,
        cashierId,
        fursEor,
        fursZoi,
      })

      onComplete({
        method,
        total: finalTotal,
        furs,
        eor: fursEor,
        orderId,
        invoiceNumber: `RAČ-${Date.now().toString().slice(-5)}`,
      })
    } catch (e) {
      setError(e.message || 'Napaka pri plačilu')
      setProcessing(false)
    }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={processing ? undefined : onCancel} width={620}>
      <ModalHeader title="Zaključi račun" onClose={onCancel}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px' }}>
        <div style={{ padding:22, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Način plačila</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
              {CFG.paymentMethods.map(pm => (
                <button key={pm.id} onClick={() => setMethod(pm.id)} style={{ padding:'12px 8px', borderRadius:10, cursor:'pointer', background: method===pm.id ? T.accent : T.chipBg, color: method===pm.id ? '#fff' : 'inherit', border:'none', display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:13, fontFamily:'inherit' }}>
                  <span style={{ fontSize:20 }}>{pm.icon}</span>{pm.name}
                </button>
              ))}
            </div>
          </div>
          {method === 'cash' && (
            <div>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Prejeto</div>
              <input value={given} onChange={e => setGiven(e.target.value)} placeholder={eur(finalTotal)} style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', fontFamily:'inherit', fontSize:20, fontWeight:600, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
              <div style={{ display:'flex', gap:5, marginTop:6, flexWrap:'wrap' }}>
                {[5,10,20,50,100].map(v => (
                  <button key={v} onClick={() => setGiven(String(v))} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid rgba(0,0,0,0.08)', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12 }}>{v}€</button>
                ))}
              </div>
              {change > 0 && (
                <div style={{ marginTop:8, padding:'9px 12px', borderRadius:8, background:T.accentSoft, color:T.accent, fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between' }}>
                  <span>Za vrniti</span><span>{eur(change)}</span>
                </div>
              )}
            </div>
          )}
          <div style={{ display:'flex', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Napitnina</div>
              <div style={{ display:'flex', gap:4 }}>
                {CFG.tips.map(p => (
                  <button key={p} onClick={() => setTipPct(p)} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:600, fontSize:12, background: tipPct===p ? T.accentSoft : T.chipBg, color: tipPct===p ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Popust</div>
              <div style={{ display:'flex', gap:4 }}>
                {[0,5,10,20].map(p => (
                  <button key={p} onClick={() => setDiscount(p)} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:600, fontSize:12, background: discount===p ? T.accentSoft : T.chipBg, color: discount===p ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(168,50,50,0.10)', color:T.danger, fontSize:12, fontWeight:600 }}>✕ {error}</div>}
        </div>
        <div style={{ padding:22, background:T.summaryBg, borderLeft:'1px solid rgba(0,0,0,0.06)', display:'flex', flexDirection:'column' }}>
          <div style={{ fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:T.muted, marginBottom:10 }}>Povzetek</div>
          {discount > 0 && <SRow label={`Popust ${discount}%`} v={-total*discount/100}/>}
          {tipPct > 0 && <SRow label={`Napitnina ${tipPct}%`} v={total*tipPct/100}/>}
          <div style={{ marginTop:'auto', paddingTop:12, borderTop:'1px solid rgba(0,0,0,0.08)' }}>
            <SRow label="DDV (22%)" v={finalTotal-finalTotal/1.22} muted/>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:6 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Skupaj</div>
              <div style={{ fontWeight:800, fontSize:26, fontVariantNumeric:'tabular-nums' }}>{eur(finalTotal)}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding:'12px 22px 20px', borderTop:'1px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:10 }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:500, color:T.muted, cursor:'pointer' }}>
          <input type="checkbox" checked={furs} onChange={e => setFurs(e.target.checked)} disabled={processing} style={{ accentColor:T.accent, width:15, height:15 }}/>
          Davčno potrdi (FURS)
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={onCancel} disabled={processing} style={{ padding:'10px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid rgba(0,0,0,0.12)', background:'transparent', fontWeight:600, fontSize:13, opacity: processing ? 0.4 : 1 }}>Prekliči</button>
          <button onClick={submitPayment} disabled={processing} style={{ padding:'10px 22px', borderRadius:9, cursor: processing ? 'wait' : 'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:6, opacity: processing ? 0.7 : 1 }}>
            {processing ? '⏳ Obdelujem...' : <><KI name="check" size={16}/> Zaključi {eur(finalTotal)}</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SRow({ label, v, muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13, color: muted ? T.muted : 'inherit' }}>
      <span>{label}</span><span style={{ fontVariantNumeric:'tabular-nums' }}>{v < 0 ? '−' : ''}{eur(Math.abs(v))}</span>
    </div>
  )
}

function ReceiptToast({ data, onClose }) {
  if (!data) return null
  return (
    <Modal open={!!data} onClose={onClose} width={340}>
      <div style={{ padding:'28px 22px', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:999, margin:'0 auto 14px', background:T.accentSoft, color:T.accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <KI name="check" size={28} strokeWidth={2.5}/>
        </div>
        <div style={{ fontSize:20, fontWeight:700 }}>Račun zaključen</div>
        <div style={{ fontSize:22, fontWeight:700, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{eur(data.total)}</div>
        <div style={{ fontSize:13, color:T.muted, marginTop:8 }}>
          {data.eor ? `FURS ✓  EOR: ${data.eor.substring(0, 10)}...` : data.furs ? 'FURS potrjen' : 'Brez FURS'}
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:T.muted, marginTop:4 }}>{data.invoiceNumber}</div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid rgba(0,0,0,0.1)', background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <KI name="print" size={14}/> Natisni
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ================================================================
// SIDE NAV
// ================================================================
const SCREENS = {
  floor:     { label:'Prostori & mize', icon:'chair'    },
  sale:      { label:'Prodaja',         icon:'grid'     },
  calendar:  { label:'Koledar',         icon:'calendar' },
  customers: { label:'Stranke',         icon:'users'    },
  packages:  { label:'Paketi',          icon:'package'  },
  inventory: { label:'Zaloga',          icon:'box'      },
  reports:   { label:'Poročila',        icon:'chart'    },
  admin:     { label:'Nastavitve',      icon:'settings' },
}

function SideNav({ screen, setScreen, nav }) {
  return (
    <div style={{ width:80, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', gap:4, flexShrink:0 }}>
      {nav.map(id => {
        const s = SCREENS[id]
        const active = screen === id
        return (
          <button key={id} onClick={() => setScreen(id)} title={s.label} style={{ width:64, padding:'11px 4px', borderRadius:10, cursor:'pointer', background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.inkSoft, border:'none', fontFamily:'inherit', position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
            {active && <span style={{ position:'absolute', left:-2, top:10, bottom:10, width:3, borderRadius:2, background:T.accent }}/>}
            <KI name={s.icon} size={20}/>
            <span style={{ fontSize:10, fontWeight:700, textAlign:'center', lineHeight:1.15 }}>{s.label.split(' ')[0]}</span>
          </button>
        )
      })}
    </div>
  )
}

// ================================================================
// USER AVATAR
// ================================================================
function UserAvatar({ user, onLock }) {
  const [open, setOpen] = useState(false)
  if (!user) return (
    <div style={{ width:30, height:30, borderRadius:999, background:'rgba(255,255,255,0.15)', display:'grid', placeItems:'center' }}>
      <KI name="user" size={14} strokeWidth={2}/>
    </div>
  )
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2)
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 4px 4px 10px', borderRadius:999, background:'rgba(255,255,255,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600 }}>
        <div style={{ lineHeight:1.1, textAlign:'right' }}>
          <div style={{ fontWeight:700 }}>{user.name.split(' ')[0]}</div>
          <div style={{ fontSize:10, opacity:0.65 }}>{user.role}</div>
        </div>
        <div style={{ width:30, height:30, borderRadius:999, background: user.color || T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>{initials}</div>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:41, width:200, background:'#fff', color:T.ink, borderRadius:11, boxShadow:'0 14px 40px rgba(0,0,0,0.28)', padding:6, border:'1px solid '+T.line }}>
            <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid '+T.lineSoft, marginBottom:4 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{user.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{user.role}</div>
            </div>
            <button onClick={() => { setOpen(false); onLock() }} style={{ width:'100%', padding:'9px 12px', borderRadius:8, background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', color:T.ink, fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
              <KI name="pin" size={14}/> Zakleni
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================
// FLOOR SCREEN — real DB spaces + tables
// ================================================================
function FloorScreen({ spaces, setActiveTable, setScreen }) {
  const [selectedSpace, setSelectedSpace] = useState(null)

  useEffect(() => {
    if (spaces.length > 0 && !selectedSpace) setSelectedSpace(spaces[0].id)
  }, [spaces])

  if (spaces.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12 }}>
        <div style={{ fontSize:40 }}>🪑</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni prostorov</div>
        <div style={{ fontSize:13 }}>Dodaj prostore in mize v <b>Nastavitvah → Prostori</b></div>
      </div>
    )
  }

  const space = spaces.find(s => s.id === selectedSpace) || spaces[0]

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'12px 18px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', gap:4, background:T.surface3, padding:4, borderRadius:10 }}>
          {spaces.map(s => (
            <button key={s.id} onClick={() => setSelectedSpace(s.id)} style={{ padding:'8px 14px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:700, fontSize:13, background: selectedSpace===s.id ? T.header : 'transparent', color: selectedSpace===s.id ? T.headerInk : T.ink, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:999, background:s.color }}/>
              {s.name}
              <span style={{ opacity:0.6, fontSize:11 }}>{(s.tables || []).filter(t => t.status==='occupied').length}/{(s.tables || []).length}</span>
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, marginLeft:16 }}>
          {Object.entries(T.status).map(([k, st]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:T.muted, fontWeight:600 }}>
              <span style={{ width:9, height:9, borderRadius:999, background:st.dot }}/>{st.label}
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button onClick={() => { setActiveTable(null); setScreen('sale') }} style={{ padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <KI name="plus" size={14}/> Hitra prodaja
          </button>
        </div>
      </div>
      <div style={{ flex:1, position:'relative', overflow:'hidden', background:T.bg, backgroundImage:'radial-gradient(circle, '+T.line+' 1px, transparent 1px)', backgroundSize:'24px 24px' }}>
        {(space.tables || []).map(t => {
          const st = T.status[t.status] || T.status.free
          const isRound = t.seats <= 2
          const w = t.seats<=2 ? 96 : t.seats<=4 ? 118 : 154
          const h = t.seats<=2 ? 96 : t.seats<=4 ? 92 : 116
          return (
            <button key={t.id} onClick={() => { setActiveTable(t); setScreen('sale') }}
              style={{ position:'absolute', left:`${t.x}%`, top:`${t.y}%`, width:w, height:h, background:st.bg, border:'2px solid '+st.stroke, borderRadius: isRound ? '50%' : 14, cursor:'pointer', fontFamily:'inherit', color:T.ink, padding:8, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:17, fontWeight:800 }}>{t.name}</div>
              <div style={{ fontSize:10, color:T.muted, display:'flex', alignItems:'center', gap:3 }}>
                <KI name="user" size={10}/> {t.seats}
              </div>
              {t.status==='needs_attention' && (
                <div style={{ position:'absolute', top:-8, right:-8, width:22, height:22, borderRadius:999, background:st.dot, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, boxShadow:'0 0 0 3px '+T.bg }}>!</div>
              )}
              {t.status==='reserved' && t.reservedFor && (
                <div style={{ fontSize:9, color:T.muted, padding:'0 4px', lineHeight:1.2 }}>{t.reservedFor}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================
// SALE SCREEN — real DB kategorije + artikli
// ================================================================
function SaleScreen({ activeTable, activeCustomer, cart, setCart, addItem, adjustQty, setPaymentOpen, totals, setActiveCustomer, posData, happyHourActive, setHappyHourActive }) {
  const [selectedCat, setSelectedCat] = useState('cat-fav')
  const [search, setSearch] = useState('')
  const [scanModal, setScanModal] = useState(false)

  const items = useMemo(() => {
    if (search) return posData.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.code || '').toLowerCase().includes(search.toLowerCase()))
    return posData.itemsIn(selectedCat)
  }, [selectedCat, search, posData.items])

  if (posData.loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted }}>⏳ Nalagam cenik...</div>

  if (posData.categories.length <= 1 && posData.items.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12, padding:40, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>🛍️</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Cenik je prazen</div>
        <div style={{ fontSize:13, maxWidth:340 }}>Pojdi v <b>Nastavitve → Kategorije & Artikli</b> in dodaj prve produkte.</div>
      </div>
    )
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      {/* Kategorije sidebar */}
      <div style={{ width:196, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid '+T.lineSoft, fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Kategorije</div>
        <div style={{ overflowY:'auto', flex:1, padding:8 }}>
          {posData.categories.map(c => {
            const active = selectedCat === c.id
            return (
              <button key={c.id} onClick={() => { setSelectedCat(c.id); setSearch('') }} style={{ width:'100%', padding:'10px', borderRadius:9, marginBottom:2, background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.ink, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: active ? 700 : 500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                <span style={{ width:30, height:30, borderRadius:8, background:c.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>{c.icon}</span>
                <span style={{ flex:1 }}>{c.name}</span>
                {active && <KI name="chev" size={14}/>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Artikli */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, background:T.surface, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={15}/></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Išči artikel ali šifro…" style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.surface2, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <button onClick={() => setScanModal(true)} style={{ padding:'9px 12px', borderRadius:9, background:T.surface2, color:T.ink, border:'1px solid '+T.line, fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'inherit' }}>
            <KI name="barcode" size={14}/> Skeniraj
          </button>
          <button onClick={() => setHappyHourActive(h => !h)} style={{ padding:'9px 12px', borderRadius:9, background: happyHourActive ? T.brand : T.surface2, color: happyHourActive ? T.header : T.ink, border:'1px solid '+(happyHourActive ? T.brand : T.line), fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'inherit' }}>
            <KI name="happy" size={14}/> Happy hour{happyHourActive ? ' −20%' : ''}
          </button>
          <div style={{ marginLeft:'auto', fontSize:12, color:T.muted }}>{items.length} artiklov</div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, alignContent:'start' }}>
          {items.map(it => {
            const onSale = happyHourActive && H.isHappyHourEligible(it.name)
            return (
              <button key={it.id} onClick={() => addItem(it, happyHourActive)} style={{ background:T.surface, border:'1px solid '+T.line, borderRadius:11, padding:'12px', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:T.ink, display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:96, position:'relative' }}>
                {it.fav && <span style={{ position:'absolute', top:8, right:8, color:T.brand, fontSize:11 }}>★</span>}
                {onSale && <span style={{ position:'absolute', top:8, left:8, fontSize:9, fontWeight:800, color:T.header, background:T.brand, padding:'2px 5px', borderRadius:4, textTransform:'uppercase' }}>−20%</span>}
                <div style={{ fontSize:13, fontWeight:600, lineHeight:1.25, marginTop: (it.fav || onSale) ? 14 : 0 }}>{it.name}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:8 }}>
                  <div>
                    {onSale ? (
                      <>
                        <div style={{ fontSize:10, color:T.muted, textDecoration:'line-through' }}>{eur(it.price)}</div>
                        <div style={{ fontSize:15, fontWeight:800, fontVariantNumeric:'tabular-nums', color:T.warn }}>{eur(it.price * 0.8)}</div>
                      </>
                    ) : (
                      <div style={{ fontSize:15, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</div>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{it.code}</div>
                </div>
              </button>
            )
          })}
          {items.length === 0 && <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:T.muted }}>Ni artiklov v tej kategoriji</div>}
        </div>
      </div>

      {/* Košarica */}
      <SaleCart cart={cart} setCart={setCart} adjustQty={adjustQty} activeTable={activeTable} activeCustomer={activeCustomer} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer} customers={posData.customers}/>

      {/* Scan placeholder */}
      <Modal open={scanModal} onClose={() => setScanModal(false)} width={380}>
        <div style={{ padding:'28px 22px', textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:10 }}>📷</div>
          <div style={{ fontSize:17, fontWeight:600, marginBottom:6 }}>Skeniraj barkodo</div>
          <div style={{ fontSize:13, color:T.muted, marginBottom:18 }}>Barkodni čitalec prihaja. Vnesite šifro v iskalnik.</div>
          <button onClick={() => setScanModal(false)} style={{ background:T.accent, color:'#fff', border:'none', borderRadius:9, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Zapri</button>
        </div>
      </Modal>
    </div>
  )
}

function SaleCart({ cart, setCart, adjustQty, activeTable, activeCustomer, setPaymentOpen, totals, setActiveCustomer, customers }) {
  const [pickCustomer, setPickCustomer] = useState(false)
  const [custSearch, setCustSearch] = useState('')

  const filteredCustomers = customers.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || '').includes(custSearch))

  return (
    <div style={{ width:340, background:T.surface, borderLeft:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Naročilo</div>
          <div style={{ fontWeight:700, fontSize:14, marginTop:2 }}>
            {activeTable ? activeTable.name : 'Hitra prodaja'}
            <span style={{ color:T.muted, fontWeight:500, fontSize:12 }}> · {cart.reduce((s, l) => s + l.qty, 0)} kos</span>
          </div>
        </div>
        {cart.length > 0 && (
          <button onClick={() => setCart([])} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.muted, padding:4 }}>
            <KI name="trash" size={14}/>
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {cart.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:T.muted, fontSize:12 }}>
            <div style={{ fontSize:26, marginBottom:8, opacity:0.4 }}>🛒</div>
            Košarica je prazna.<br/>Tapni artikel za dodajanje.
          </div>
        )}
        {cart.map(l => (
          <div key={l.lineId} style={{ padding:'10px 12px', borderBottom:'1px solid '+T.lineSoft, display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>
                {l.name}
                {l.happyHourApplied && <span style={{ fontSize:9, fontWeight:800, color:T.warn, background:'rgba(184,140,40,0.15)', padding:'1px 5px', borderRadius:4, marginLeft:5 }}>−20%</span>}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              <div style={{ fontWeight:800, fontSize:14, fontVariantNumeric:'tabular-nums' }}>{eur(H.lineTotal(l))}</div>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button onClick={() => l.qty===1 ? setCart(c => c.filter(x => x.lineId!==l.lineId)) : adjustQty(l.lineId, -1)} style={{ width:24, height:24, borderRadius:6, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {l.qty===1 ? <KI name="trash" size={11}/> : <KI name="minus" size={12}/>}
                </button>
                <div style={{ width:24, textAlign:'center', fontWeight:700, fontSize:13 }}>{l.qty}</div>
                <button onClick={() => adjustQty(l.lineId, 1)} style={{ width:24, height:24, borderRadius:6, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <KI name="plus" size={12}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ padding:'8px 10px', borderTop:'1px solid '+T.line, display:'flex', gap:5 }}>
          <button onClick={() => setPickCustomer(true)} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.ink, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="user" size={14}/>Stranka
          </button>
          <button style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="percent" size={14}/>Popust
          </button>
          <button style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="split" size={14}/>Razdeli
          </button>
        </div>
      )}

      <div style={{ padding:'12px 16px', background:T.surface2, borderTop:'1px solid '+T.line }}>
        {activeCustomer && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 10px', background:T.accentSoft, borderRadius:8 }}>
            <div style={{ flex:1, fontSize:12, fontWeight:600, color:T.accent }}>{activeCustomer.name}</div>
            <button onClick={() => setActiveCustomer(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.accent }}><KI name="x" size={12}/></button>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:T.muted }}>
          <span>Vmesna</span><span>{eur(totals.sub)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:10, color:T.muted }}>
          <span>DDV 22%</span><span>{eur(totals.ddv)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div style={{ fontWeight:700, fontSize:14 }}>Skupaj</div>
          <div style={{ fontWeight:800, fontSize:26, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{eur(totals.total)}</div>
        </div>
        <button disabled={cart.length===0} onClick={() => setPaymentOpen(true)} style={{ width:'100%', marginTop:12, padding:'13px', borderRadius:9, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily:'inherit', border:'none', background: cart.length ? T.accent : '#ccc', color:'#fff', fontWeight:800, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <KI name="arrow" size={16} strokeWidth={2.2}/> Plačaj {cart.length > 0 ? eur(totals.total) : ''}
        </button>
      </div>

      {pickCustomer && (
        <Modal open onClose={() => { setPickCustomer(false); setCustSearch('') }}>
          <ModalHeader title="Izberi stranko" onClose={() => { setPickCustomer(false); setCustSearch('') }}/>
          <div style={{ padding:'12px 16px' }}>
            <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Išči po imenu ali telefonu..." style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:10 }}/>
            {filteredCustomers.map(c => (
              <button key={c.id} onClick={() => { setActiveCustomer(c); setPickCustomer(false); setCustSearch('') }} style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:4, background:'transparent', border:'1px solid '+T.line, cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:999, background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
                  {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{c.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{c.phone} · {c.tier}</div>
                </div>
              </button>
            ))}
            {filteredCustomers.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:13 }}>Ni strank</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ================================================================
// CALENDAR SCREEN
// ================================================================
function CalendarScreen({ posData }) {
  const [view, setView] = useState('day')
  const hours = Array.from({length:13}, (_, i) => 8 + i)
  const today = new Date()
  const days = ['Pon','Tor','Sre','Čet','Pet','Sob','Ned']
  const daysFull = ['Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota','Nedelja']
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekDates = days.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  const staff = posData.staffList.filter(s => ['Terapevt','Trener','Lastnik'].includes(s.role)).slice(0, 5)

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'12px 18px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{daysFull[(today.getDay()+6)%7]}, {today.getDate()}. {months[today.getMonth()]} {today.getFullYear()}</div>
        <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:8, marginLeft:16 }}>
          {['day','week'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:'6px 14px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:700, fontSize:12, background: view===v ? T.header : 'transparent', color: view===v ? T.headerInk : T.ink }}>
              {v==='day' ? 'Dan' : 'Teden'}
            </button>
          ))}
        </div>
        <button style={{ marginLeft:'auto', padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <KI name="plus" size={14}/> Nova rezervacija
        </button>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        {staff.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:T.muted }}>
            <div style={{ fontSize:13 }}>Dodaj zaposlene v <b>Nastavitvah → Zaposleni</b> da se prikažejo v koledarju.</div>
          </div>
        ) : (
          <div style={{ minWidth:600, display:'grid', gridTemplateColumns:'56px repeat('+staff.length+', 1fr)', background:T.surface }}>
            <div style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.line }}/>
            {staff.map(s => (
              <div key={s.id} style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.lineSoft, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:999, background:s.color||T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>
                    {s.name.split(' ').map(w => w[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{s.name}</div>
                    <div style={{ fontSize:10, color:T.muted }}>{s.role}</div>
                  </div>
                </div>
              </div>
            ))}
            {hours.map((hh, hi) => (
              <React.Fragment key={hh}>
                <div style={{ background:T.surface2, borderRight:'1px solid '+T.line, borderTop: hi===0?'none':'1px solid '+T.lineSoft, padding:'4px 8px', fontSize:11, fontWeight:700, color:T.muted, fontVariantNumeric:'tabular-nums', minHeight:60 }}>
                  {String(hh).padStart(2,'0')}:00
                </div>
                {staff.map(s => (
                  <div key={s.id} style={{ borderRight:'1px solid '+T.lineSoft, borderTop: hi===0?'none':'1px solid '+T.lineSoft, minHeight:60, padding:2, background:T.surface, cursor:'pointer' }}/>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ================================================================
// CUSTOMERS SCREEN — real DB
// ================================================================
function CustomersScreen({ posData, setActiveCustomer, setScreen }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const filtered = posData.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search))
  const selected = posData.customers.find(c => c.id === selectedId) || posData.customers[0]

  if (posData.customers.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12 }}>
        <div style={{ fontSize:40 }}>👥</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni strank</div>
        <div style={{ fontSize:13 }}>Dodaj stranke v <b>Nastavitvah → Stranke</b></div>
      </div>
    )
  }

  const MemberDot = ({ pkgs }) => {
    const { status } = H.memberStatus(pkgs)
    const colors = { active:'#1f6b3a', expiring:'#e9b949', critical:'#d97628', expired:'#a83232', none:'#9a9890' }
    return <span style={{ display:'inline-block', width:8, height:8, borderRadius:999, background:colors[status]||'#999', marginRight:5 }}/>
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:320, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid '+T.line }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>{filtered.length} strank</div>
          </div>
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={14}/></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Išči stranko…" style={{ width:'100%', padding:'9px 12px 9px 34px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:6 }}>
          {filtered.map(c => {
            const active = c.id === selectedId
            const pkgs = c.customer_packages || []
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)} style={{ width:'100%', padding:'10px', borderRadius:9, marginBottom:2, background: active ? T.accentSoft : 'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:999, background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
                  {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>
                    <MemberDot pkgs={pkgs}/>{c.name}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>
                    {c.phone || 'brez telefona'}
                    {Number(c.prepaid) > 0 && <span style={{ color:T.accent, marginLeft:6 }}>· {eur(c.prepaid)}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg, overflowY:'auto', padding:24 }}>
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
              <div style={{ width:64, height:64, borderRadius:999, background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:22 }}>
                {selected.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:22, fontWeight:800 }}>{selected.name}</div>
                <div style={{ fontSize:12, color:T.muted, marginTop:4, display:'flex', gap:14 }}>
                  {selected.phone && <span>{selected.phone}</span>}
                  {selected.email && <span>{selected.email}</span>}
                </div>
              </div>
              <button onClick={() => { setActiveCustomer(selected); setScreen('sale') }} style={{ padding:'9px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
                <KI name="receipt" size={14}/> Nov račun
              </button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[['Točke', selected.points || 0, selected.tier], ['Predplačilo', eur(selected.prepaid || 0), Number(selected.prepaid)>0?'na voljo':'brez'], ['Paketi', (selected.customer_packages||[]).filter(p=>p.active).length, 'aktivnih']].map(([l,v,s]) => (
                <div key={l} style={{ padding:'12px 14px', background:T.surface2, borderRadius:10, border:'1px solid '+T.line }}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
          {(selected.customer_packages||[]).filter(p=>p.active).length > 0 && (
            <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Aktivni paketi</div>
              {(selected.customer_packages||[]).filter(p=>p.active).map((p, i) => {
                const pct = p.total ? p.remaining / p.total : 1
                return (
                  <div key={i} style={{ padding:14, borderRadius:10, background:'rgba(99,72,150,0.06)', border:'1px solid rgba(99,72,150,0.18)', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:8 }}>
                      <div style={{ flex:1, fontWeight:700, fontSize:14 }}>{p.name}</div>
                      {p.remaining !== null && (
                        <div style={{ fontSize:18, fontWeight:800, color:'#634896', fontVariantNumeric:'tabular-nums' }}>
                          {p.remaining}<span style={{ fontSize:13, color:T.muted }}>/{p.total}</span>
                        </div>
                      )}
                    </div>
                    {p.total && (
                      <div style={{ height:6, borderRadius:999, background:'rgba(99,72,150,0.15)', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:(pct*100)+'%', background:'#634896', borderRadius:999 }}/>
                      </div>
                    )}
                    <div style={{ fontSize:11, color:T.muted, marginTop:8 }}>Velja do: <b style={{ color:T.ink }}>{p.expires}</b></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ================================================================
// PACKAGES SCREEN — real DB
// ================================================================
function PackagesScreen({ posData }) {
  if (posData.packageTemplates.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12, padding:40, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>🎫</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni paketov</div>
        <div style={{ fontSize:13 }}>Dodaj pakete v <b>Nastavitvah → Paketi</b></div>
      </div>
    )
  }
  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Kartice & paketi</div>
          <div style={{ fontSize:13, color:T.muted, marginTop:4 }}>Predloge paketov za prodajo strankam.</div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {posData.packageTemplates.map(p => {
          const typeColor = p.type==='unlimited'?'#1f6b3a':p.type==='visits'?'#3a6e8f':p.type==='time-restricted'?'#e9b949':'#7b61b8'
          const typeLabel = p.type==='unlimited'?'Neomejen':p.type==='visits'?(p.visits+'x'):p.type==='time-restricted'?'Časovno':'Ostalo'
          return (
            <div key={p.id} style={{ background:T.surface, borderRadius:13, border:'1px solid '+T.line, padding:18, position:'relative' }}>
              <span style={{ position:'absolute', top:14, right:14, fontSize:10, fontWeight:800, padding:'4px 9px', borderRadius:5, background:typeColor+'18', color:typeColor, textTransform:'uppercase', letterSpacing:'0.05em' }}>{typeLabel}</span>
              <div style={{ fontSize:16, fontWeight:800, paddingRight:80 }}>{p.name}</div>
              <div style={{ fontSize:34, fontWeight:900, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginTop:10, lineHeight:1 }}>{eur(p.price)}</div>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.5, marginTop:10, minHeight:32 }}>{p.description}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:10, paddingTop:10, borderTop:'1px solid '+T.lineSoft, fontWeight:600 }}>
                Veljavnost: <b style={{ color:T.ink }}>{p.validity_days} dni</b>
                {p.hours_from && <span> · {p.hours_from}–{p.hours_to}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================
// INVENTORY SCREEN — real DB
// ================================================================
function InventoryScreen({ posData }) {
  const [search, setSearch] = useState('')
  const items = posData.items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{posData.items.length} artiklov</div>
        <div style={{ position:'relative', flex:1, maxWidth:360 }}>
          <div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={14}/></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Išči artikel…" style={{ width:'100%', padding:'8px 12px 8px 34px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
          <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
            <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {['Artikel','Šifra','Cena','Stanje','Status'].map((h, i) => (
                <th key={i} style={{ padding:'12px', textAlign: i>=2?'right':'left', borderBottom:'1px solid '+T.line, fontWeight:700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id} style={{ background: idx%2?T.surface2:T.surface }}>
                <td style={{ padding:'11px 12px' }}><div style={{ fontWeight:600, fontSize:13 }}>{it.name}</div></td>
                <td style={{ padding:'11px 12px', fontSize:12, color:T.muted, fontFamily:'monospace' }}>{it.code}</td>
                <td style={{ padding:'11px 12px', textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</td>
                <td style={{ padding:'11px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums', color: it.stock===null?T.muted:it.stock<=0?T.danger:it.low_stock&&it.stock<=it.low_stock?T.warn:T.ink }}>
                  {it.stock===null?'∞':it.stock}
                </td>
                <td style={{ padding:'11px 12px' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:5, background: it.stock===null?T.accentSoft:it.stock<=0?'rgba(168,50,50,0.1)':it.low_stock&&it.stock<=it.low_stock?'rgba(184,140,40,0.12)':T.accentSoft, color: it.stock===null?T.accent:it.stock<=0?T.danger:it.low_stock&&it.stock<=it.low_stock?T.warn:T.accent, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    {it.stock===null?'Neomejeno':it.stock<=0?'Ni':'V zalogi'}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni artiklov. Dodaj jih v Nastavitvah.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================================================================
// REPORTS SCREEN — real DB stats
// ================================================================
function ReportsScreen({ posData }) {
  const stats = posData.todayStats
  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Poročilo · Danes</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Realni podatki iz baze</div>
        </div>
        <button style={{ marginLeft:'auto', padding:'9px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', background:T.surface, color:T.ink, border:'1px solid '+T.line, fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <KI name="print" size={14}/> Z-poročilo
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[['Promet',eur(stats.promet),'danes'],['Računi',stats.racuni,'zaključenih'],['Napitnine',eur(stats.napitnine),'skupaj'],['Povp. račun',eur(stats.racuni>0?stats.promet/stats.racuni:0),'']].map(([l,v,s]) => (
          <div key={l} style={{ padding:'12px 14px', background:T.surface, borderRadius:10, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Pregled dneva</div>
        {stats.racuni === 0
          ? <div style={{ fontSize:13, color:T.muted }}>Danes še ni bilo zaključenih računov.</div>
          : <div style={{ fontSize:13, color:T.muted, lineHeight:1.7 }}>
              Skupaj <b style={{ color:T.ink }}>{stats.racuni} računov</b> v vrednosti <b style={{ color:T.ink }}>{eur(stats.promet)}</b>.<br/>
              Povprečen račun: <b style={{ color:T.ink }}>{eur(stats.promet/stats.racuni)}</b>.
              {stats.napitnine > 0 && <> Napitnine: <b style={{ color:T.ink }}>{eur(stats.napitnine)}</b>.</>}
            </div>
        }
      </div>
    </div>
  )
}

// ================================================================
// ADMIN SCREEN — full CRUD
// ================================================================
function AdminScreen({ auth, posData }) {
  const [section, setSection] = useState('staff')
  const supabase = createClient()

  const sections = [
    { id:'profile',    label:'Tip poslovanja',        icon:'home'     },
    { id:'staff',      label:'Zaposleni & PIN',       icon:'users'    },
    { id:'spaces',     label:'Prostori & Mize',       icon:'chair'    },
    { id:'categories', label:'Kategorije & Artikli',  icon:'grid'     },
    { id:'storitve',   label:'Storitve',              icon:'calendar' },
    { id:'packages',   label:'Paketi',                icon:'package'  },
    { id:'happyhour',  label:'Happy hour',            icon:'happy'    },
    { id:'kuhinja',    label:'Kuhinja & display',     icon:'receipt'  },
    { id:'autolock',   label:'Avt. zaklepanje',       icon:'pin'      },
    { id:'furs',       label:'FURS & DDV',            icon:'receipt'  },
  ]

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:220, background:T.surface, borderRight:'1px solid '+T.line, padding:12, flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', padding:'8px 10px' }}>Nastavitve</div>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:2, background: section===s.id?T.accentSoft:'transparent', color: section===s.id?T.accent:T.ink, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: section===s.id?700:500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
            <KI name={s.icon} size={15}/> {s.label}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:24, background:T.bg }}>
        {section==='staff'      && <StaffSection posData={posData}/>}
        {section==='categories' && <CatalogSection posData={posData}/>}
        {section==='spaces'     && <SpacesSection posData={posData}/>}
        {section==='packages'   && <PackagesAdminSection posData={posData}/>}
        {section==='storitve'   && <StoritveCrudSection posData={posData}/>}
        {section==='happyhour'  && <HappyHourSection posData={posData}/>}
        {section==='kuhinja'    && <KuhinjaSection posData={posData}/>}
        {section==='autolock'   && <AutolockSection auth={auth}/>}
        {section==='furs'       && <FursSection/>}
        {section==='profile'    && <ProfileSection posData={posData}/>}
      </div>
    </div>
  )
}

// ─── Staff CRUD ────────────────────────────────────────────────
function StaffSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const COLORS = ['#1f6b3a','#3a6e8f','#c26a3a','#7b61b8','#c76a98','#a83232','#e9b949','#1a1f1a']

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno', false); return }
    if (!modal?.pin?.trim() || modal.pin.length < 4) { showToast('PIN mora imeti vsaj 4 mesta', false); return }
    if (!modal.role) { showToast('Vloga je obvezna', false); return }
    setSaving(true)
    try {
      if (modal.id) {
        const { error } = await createClient().from('staff').update({ name:modal.name, role:modal.role, pin:modal.pin, color:modal.color }).eq('id', modal.id)
        if (error) throw error
      } else {
        const { error } = await createClient().from('staff').insert({ business_id:BUSINESS_ID, name:modal.name, role:modal.role, pin:modal.pin, color:modal.color||'#3a6e8f', active:true })
        if (error) throw error
      }
      setModal(null)
      posData.refresh()
      showToast(modal.id ? 'Zaposleni posodobljen' : 'Zaposleni dodan')
    } catch(e) { showToast(e.message, false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem ${name}?`)) return
    await createClient().from('staff').update({ active:false }).eq('id', id)
    posData.refresh()
    showToast('Zaposleni izbrisan')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Zaposleni & PIN</div>
        <button onClick={() => setModal({ color:'#3a6e8f', role:'Blagajnik' })} style={btnP}>+ Dodaj zaposlenega</button>
      </div>

      {posData.staffList.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni zaposlenih — dodajte prvega</div>
      ) : posData.staffList.map(s => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:14, borderRadius:10, marginBottom:8, background:T.surface, border:'1px solid '+T.line }}>
          <div style={{ width:40, height:40, borderRadius:999, background:s.color||T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
            {s.name.split(' ').map(w=>w[0]).join('')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
            <div style={{ fontSize:11, color:T.muted }}>{s.role}</div>
          </div>
          <div style={{ padding:'5px 10px', borderRadius:7, background:T.surface3, fontFamily:'monospace', fontSize:14, fontWeight:700, letterSpacing:'0.15em' }}>
            {'•'.repeat(s.pin?.length - 1)}{s.pin?.slice(-1)}
          </div>
          <button onClick={() => setModal({...s})} style={btnS}><KI name="edit" size={14}/></button>
          <button onClick={() => remove(s.id, s.name)} style={{ ...btnS, color:T.danger }}><KI name="trash" size={14}/></button>
        </div>
      ))}

      <Modal open={!!modal} onClose={() => setModal(null)} width={420}>
        <ModalHeader title={modal?.id ? 'Uredi zaposlenega' : 'Nov zaposleni'} onClose={() => setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime in priimek *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Ana Novak" style={inp} autoFocus/>
          </Field>
          <Field label="Vloga *">
            <select value={modal?.role||'Blagajnik'} onChange={e=>setModal(p=>({...p,role:e.target.value}))} style={inp}>
              {Object.keys(CFG.rolePresets).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="PIN koda (4-6 mest) *">
            <input value={modal?.pin||''} onChange={e=>setModal(p=>({...p,pin:e.target.value.replace(/\D/g,'').substring(0,6)}))} placeholder="1234" style={{ ...inp, fontFamily:'monospace', letterSpacing:8, fontSize:20 }} maxLength={6}/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORS.map(c => (
                <div key={c} onClick={()=>setModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: modal?.color===c ? '3px solid #0D1F12' : '3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Catalog (Kategorije + Artikli) CRUD ──────────────────────
function CatalogSection({ posData }) {
  const [catModal, setCatModal] = useState(null)
  const [itemModal, setItemModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('categories')
  const CAT_COLORS = ['#8B5E3C','#5A8F69','#D4A017','#8B2C3E','#A0522D','#C26A3A','#C76A98','#3A6E8F','#4A7C59','#1f6b3a']

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function saveCat() {
    if (!catModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    setSaving(true)
    try {
      if (catModal.id) {
        const {error} = await createClient().from('categories').update({name:catModal.name,icon:catModal.icon,color:catModal.color}).eq('id',catModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('categories').insert({business_id:BUSINESS_ID,name:catModal.name,icon:catModal.icon||'📦',color:catModal.color||'#1f6b3a',sort_order:posData.categories.length})
        if (error) throw error
      }
      setCatModal(null); posData.refresh(); showToast(catModal.id?'Kategorija posodobljena':'Kategorija dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteCat(id, name) {
    if (!confirm(`Izbrišem kategorijo "${name}"? Artikli ostanejo brez kategorije.`)) return
    await createClient().from('categories').delete().eq('id',id)
    posData.refresh(); showToast('Kategorija izbrisana')
  }

  async function saveItem() {
    if (!itemModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!itemModal.price || Number(itemModal.price)<=0) { showToast('Cena mora biti > 0',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id:BUSINESS_ID, category_id:itemModal.category_id||null,
        name:itemModal.name, code:itemModal.code||null, price:Number(itemModal.price),
        unit:itemModal.unit||'kos', vat_rate:Number(itemModal.vat_rate||22),
        stock:itemModal.stock!=null&&itemModal.stock!==''?Number(itemModal.stock):null,
        fav:!!itemModal.fav, kitchen:!!itemModal.kitchen, bookable:!!itemModal.bookable,
        duration_min:itemModal.bookable&&itemModal.duration_min?Number(itemModal.duration_min):null,
        archived:false,
      }
      if (itemModal.id) {
        const {error} = await createClient().from('items').update(payload).eq('id',itemModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('items').insert(payload)
        if (error) throw error
      }
      setItemModal(null); posData.refresh(); showToast(itemModal.id?'Artikel posodobljen':'Artikel dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteItem(id, name) {
    if (!confirm(`Izbrišem artikel "${name}"?`)) return
    await createClient().from('items').update({archived:true}).eq('id',id)
    posData.refresh(); showToast('Artikel izbrisan')
  }

  const realCategories = posData.categories.filter(c=>c.id!=='cat-fav')

  return (
    <div>
      <div style={{ display:'flex', gap:0, marginBottom:20, background:T.surface, borderRadius:10, padding:4, width:'fit-content', border:'1px solid '+T.line }}>
        {[['categories','Kategorije'],['items','Artikli']].map(([id,lbl]) => (
          <button key={id} onClick={()=>setActiveTab(id)} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:activeTab===id?T.accent:'transparent', color:activeTab===id?'#fff':T.ink, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
        ))}
      </div>

      {activeTab==='categories' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Kategorije ({realCategories.length})</div>
            <button onClick={()=>setCatModal({color:'#1f6b3a',icon:'📦'})} style={btnP}>+ Dodaj kategorijo</button>
          </div>
          {realCategories.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+T.line }}>
              <div style={{ width:36, height:36, borderRadius:8, background:c.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{c.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{posData.items.filter(i=>i.category_id===c.id).length} artiklov</div>
              </div>
              <button onClick={()=>setCatModal({...c})} style={btnS}><KI name="edit" size={14}/></button>
              <button onClick={()=>deleteCat(c.id,c.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
            </div>
          ))}
          {realCategories.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni kategorij — dodajte prvo</div>}
        </div>
      )}

      {activeTab==='items' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Artikli ({posData.items.length})</div>
            <button onClick={()=>setItemModal({vat_rate:9.5,unit:'kos',fav:false,kitchen:false,bookable:false})} style={btnP}>+ Dodaj artikel</button>
          </div>
          {posData.items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', background:T.surface, borderRadius:10, marginBottom:4, border:'1px solid '+T.line }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{it.name} {it.fav?'★':''}</div>
                <div style={{ fontSize:11, color:T.muted, fontFamily:'monospace' }}>{it.code||'—'} · DDV {it.vat_rate}% · {it.unit}</div>
              </div>
              <div style={{ fontWeight:700, fontSize:14, minWidth:60, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</div>
              <button onClick={()=>setItemModal({...it})} style={btnS}><KI name="edit" size={14}/></button>
              <button onClick={()=>deleteItem(it.id,it.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
            </div>
          ))}
          {posData.items.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni artiklov — dodajte prvega</div>}
        </div>
      )}

      {/* Kategorija modal */}
      <Modal open={!!catModal} onClose={()=>setCatModal(null)} width={400}>
        <ModalHeader title={catModal?.id?'Uredi kategorijo':'Nova kategorija'} onClose={()=>setCatModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime *">
            <input value={catModal?.name||''} onChange={e=>setCatModal(p=>({...p,name:e.target.value}))} placeholder="Bar, Fitness, Kava..." style={inp} autoFocus/>
          </Field>
          <Field label="Emoji">
            <input value={catModal?.icon||'📦'} onChange={e=>setCatModal(p=>({...p,icon:e.target.value}))} style={{...inp,width:60}}/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {CAT_COLORS.map(c=>(
                <div key={c} onClick={()=>setCatModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:catModal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setCatModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveCat} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {/* Artikel modal */}
      <Modal open={!!itemModal} onClose={()=>setItemModal(null)} width={480}>
        <ModalHeader title={itemModal?.id?'Uredi artikel':'Nov artikel'} onClose={()=>setItemModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'65vh', overflowY:'auto' }}>
          <Field label="Ime artikla / storitve *">
            <input value={itemModal?.name||''} onChange={e=>setItemModal(p=>({...p,name:e.target.value}))} placeholder="Espresso, Masaža, Vstopnina..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Cena (€) *">
              <input type="number" step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
            </Field>
            <Field label="Enota">
              <select value={itemModal?.unit||'kos'} onChange={e=>setItemModal(p=>({...p,unit:e.target.value}))} style={inp}>
                {['kos','dl','kg','ura','paket','obisk'].map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="DDV stopnja">
              <select value={itemModal?.vat_rate??22} onChange={e=>setItemModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
                <option value={0}>0% (oproščeno)</option>
                <option value={9.5}>9.5% (hrana, pijača)</option>
                <option value={22}>22% (splošna)</option>
              </select>
            </Field>
            <Field label="Šifra (koda)">
              <input value={itemModal?.code||''} onChange={e=>setItemModal(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="K01" style={{...inp,fontFamily:'monospace'}}/>
            </Field>
          </div>
          <Field label="Kategorija">
            <select value={itemModal?.category_id||''} onChange={e=>setItemModal(p=>({...p,category_id:e.target.value||null}))} style={inp}>
              <option value="">Brez kategorije</option>
              {realCategories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>
          <Field label="Zaloga (pusti prazno za neomejeno)">
            <input type="number" min="0" value={itemModal?.stock??''} onChange={e=>setItemModal(p=>({...p,stock:e.target.value}))} placeholder="∞" style={inp}/>
          </Field>
          <div style={{ display:'flex', gap:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={!!itemModal?.fav} onChange={e=>setItemModal(p=>({...p,fav:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Priljubljeno ★
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={!!itemModal?.kitchen} onChange={e=>setItemModal(p=>({...p,kitchen:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Pošlji v kuhinjo
            </label>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={()=>setItemModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveItem} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Spaces & Tables CRUD ─────────────────────────────────────
function SpacesSection({ posData }) {
  const [spaceModal, setSpaceModal] = useState(null)
  const [tableModal, setTableModal] = useState(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const SPACE_COLORS = ['#8FBF8F','#B8956A','#9B7AC9','#3a6e8f','#c26a3a','#1f6b3a']

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function saveSpace() {
    if (!spaceModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    setSaving(true)
    try {
      if (spaceModal.id) {
        const {error} = await createClient().from('spaces').update({name:spaceModal.name,color:spaceModal.color}).eq('id',spaceModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('spaces').insert({business_id:BUSINESS_ID,name:spaceModal.name,color:spaceModal.color||'#8FBF8F',sort_order:posData.spaces.length})
        if (error) throw error
      }
      setSpaceModal(null); posData.refresh(); showToast(spaceModal.id?'Prostor posodobljen':'Prostor dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteSpace(id, name) {
    if (!confirm(`Izbrišem prostor "${name}" in vse mize?`)) return
    await createClient().from('spaces').delete().eq('id',id)
    posData.refresh(); showToast('Prostor izbrisan')
  }

  async function saveTable() {
    if (!tableModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    const spaceId = tableModal.space_id || selectedSpaceId
    if (!spaceId) { showToast('Izberite prostor',false); return }
    setSaving(true)
    try {
      const payload = { space_id:spaceId, name:tableModal.name, seats:Number(tableModal.seats||2), x:Number(tableModal.x||10), y:Number(tableModal.y||10), status:'free' }
      if (tableModal.id) {
        const {error} = await createClient().from('tables').update(payload).eq('id',tableModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('tables').insert(payload)
        if (error) throw error
      }
      setTableModal(null); posData.refresh(); showToast(tableModal.id?'Miza posodobljena':'Miza dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteTable(id, name) {
    if (!confirm(`Izbrišem mizo "${name}"?`)) return
    await createClient().from('tables').delete().eq('id',id)
    posData.refresh(); showToast('Miza izbrisana')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Prostori & Mize</div>
        <button onClick={()=>setSpaceModal({color:'#8FBF8F'})} style={btnP}>+ Dodaj prostor</button>
      </div>

      {posData.spaces.map(sp => (
        <div key={sp.id} style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ width:12, height:12, borderRadius:999, background:sp.color }}/>
            <div style={{ fontSize:16, fontWeight:700, flex:1 }}>{sp.name}</div>
            <button onClick={()=>{ setTableModal({space_id:sp.id,seats:2,x:10,y:10}); setSelectedSpaceId(sp.id) }} style={btnS}><KI name="plus" size={13}/> Miza</button>
            <button onClick={()=>setSpaceModal({...sp})} style={btnS}><KI name="edit" size={13}/></button>
            <button onClick={()=>deleteSpace(sp.id,sp.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={13}/></button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {(sp.tables||[]).map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:T.surface3, borderRadius:9 }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{t.name}</span>
                <span style={{ fontSize:11, color:T.muted }}>{t.seats}👤</span>
                <button onClick={()=>setTableModal({...t,space_id:sp.id})} style={{ background:'none', border:0, cursor:'pointer', color:T.muted, fontSize:11, padding:'1px 3px' }}>✏️</button>
                <button onClick={()=>deleteTable(t.id,t.name)} style={{ background:'none', border:0, cursor:'pointer', color:T.muted, fontSize:11, padding:'1px 3px' }}>✕</button>
              </div>
            ))}
            {(sp.tables||[]).length === 0 && <span style={{ fontSize:12, color:T.muted }}>Ni miz — dodajte prvo</span>}
          </div>
        </div>
      ))}
      {posData.spaces.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni prostorov — dodajte prvega</div>}

      {/* Space modal */}
      <Modal open={!!spaceModal} onClose={()=>setSpaceModal(null)} width={380}>
        <ModalHeader title={spaceModal?.id?'Uredi prostor':'Nov prostor'} onClose={()=>setSpaceModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime prostora *">
            <input value={spaceModal?.name||''} onChange={e=>setSpaceModal(p=>({...p,name:e.target.value}))} placeholder="Bar, Terasa, VIP..." style={inp} autoFocus/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {SPACE_COLORS.map(c=>(
                <div key={c} onClick={()=>setSpaceModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:spaceModal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setSpaceModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveSpace} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {/* Table modal */}
      <Modal open={!!tableModal} onClose={()=>setTableModal(null)} width={380}>
        <ModalHeader title={tableModal?.id?'Uredi mizo':'Nova miza'} onClose={()=>setTableModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime *">
            <input value={tableModal?.name||''} onChange={e=>setTableModal(p=>({...p,name:e.target.value}))} placeholder="B1, Terasa 3..." style={inp} autoFocus/>
          </Field>
          <Field label="Število sedežev">
            <input type="number" min="1" value={tableModal?.seats||2} onChange={e=>setTableModal(p=>({...p,seats:e.target.value}))} style={inp}/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Pozicija X (0-100%)">
              <input type="number" min="0" max="95" value={tableModal?.x||10} onChange={e=>setTableModal(p=>({...p,x:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Pozicija Y (0-100%)">
              <input type="number" min="0" max="90" value={tableModal?.y||10} onChange={e=>setTableModal(p=>({...p,y:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setTableModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveTable} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Packages Admin CRUD ──────────────────────────────────────
function PackagesAdminSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function save() {
    if (!modal?.name?.trim()||!modal?.price) { showToast('Ime in cena sta obvezna',false); return }
    setSaving(true)
    try {
      const payload = { business_id:BUSINESS_ID, name:modal.name, price:Number(modal.price), type:modal.type||'unlimited', validity_days:Number(modal.validity_days||30), visits:modal.type==='visits'?Number(modal.visits||10):null, description:modal.description||null, archived:false }
      if (modal.id) {
        const {error} = await createClient().from('package_templates').update(payload).eq('id',modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('package_templates').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id?'Paket posodobljen':'Paket dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem paket "${name}"?`)) return
    await createClient().from('package_templates').update({archived:true}).eq('id',id)
    posData.refresh(); showToast('Paket izbrisan')
  }

  const typeColors = { unlimited:'#1f6b3a', visits:'#3a6e8f', 'time-restricted':'#e9b949' }
  const typeLabels = { unlimited:'Neomejen', visits:'Po obiskih', 'time-restricted':'Časovno' }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Paketi & Kartice</div>
        <button onClick={()=>setModal({type:'unlimited',validity_days:30})} style={btnP}>+ Dodaj paket</button>
      </div>
      {posData.packageTemplates.map(p => (
        <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:T.surface, borderRadius:12, marginBottom:8, border:'1px solid '+T.line }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontWeight:700, fontSize:14 }}>{p.name}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:(typeColors[p.type]||'#888')+'18', color:typeColors[p.type]||'#888', textTransform:'uppercase' }}>{typeLabels[p.type]||p.type}</span>
            </div>
            <div style={{ fontSize:11, color:T.muted }}>
              Veljavnost: {p.validity_days} dni
              {p.visits&&<span> · {p.visits} obiskov</span>}
              {p.description&&<span> · {p.description}</span>}
            </div>
          </div>
          <div style={{ fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(p.price)}</div>
          <button onClick={()=>setModal({...p})} style={btnS}><KI name="edit" size={14}/></button>
          <button onClick={()=>remove(p.id,p.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
        </div>
      ))}
      {posData.packageTemplates.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni paketov</div>}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={440}>
        <ModalHeader title={modal?.id?'Uredi paket':'Nov paket'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime paketa *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Mesečna karta, 10× vstopnica..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Cena (€) *">
              <input type="number" step="0.01" min="0" value={modal?.price||''} onChange={e=>setModal(p=>({...p,price:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Veljavnost (dni)">
              <input type="number" min="1" value={modal?.validity_days||30} onChange={e=>setModal(p=>({...p,validity_days:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <Field label="Tip">
            <select value={modal?.type||'unlimited'} onChange={e=>setModal(p=>({...p,type:e.target.value}))} style={inp}>
              <option value="unlimited">Neomejen (dni)</option>
              <option value="visits">Po obiskih</option>
              <option value="time-restricted">Časovno omejen</option>
            </select>
          </Field>
          {modal?.type==='visits' && (
            <Field label="Število obiskov">
              <input type="number" min="1" value={modal?.visits||10} onChange={e=>setModal(p=>({...p,visits:e.target.value}))} style={inp}/>
            </Field>
          )}
          <Field label="Opis (neobvezno)">
            <input value={modal?.description||''} onChange={e=>setModal(p=>({...p,description:e.target.value}))} placeholder="Kratek opis paketa..." style={inp}/>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}


// ─── Storitve CRUD ────────────────────────────────────────────
function StoritveCrudSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const SVC_COLORS = ['#1f6b3a','#3a6e8f','#7b61b8','#c26a3a','#c76a98','#a83232','#e9b949','#1a1f1a']
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.price) { showToast('Cena je obvezna',false); return }
    if (!modal?.duration_min) { showToast('Trajanje je obvezno',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        color: modal.color || '#1f6b3a',
        duration_min: Number(modal.duration_min),
        price: Number(modal.price),
        active: modal.active !== false,
      }
      if (modal.id) {
        const {error} = await createClient().from('services').update(payload).eq('id', modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('services').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id ? 'Storitev posodobljena' : 'Storitev dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem storitev "${name}"?`)) return
    await createClient().from('services').update({ active: false }).eq('id', id)
    posData.refresh(); showToast('Storitev izbrisana')
  }

  async function toggleActive(svc) {
    await createClient().from('services').update({ active: !svc.active }).eq('id', svc.id)
    posData.refresh()
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Storitve</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Fizioterapija, masaža, PT, striženje... Za rezervacije v koledarju.</div>
        </div>
        <button onClick={()=>setModal({color:'#1f6b3a',duration_min:60,active:true})} style={btnP}>+ Dodaj storitev</button>
      </div>

      {posData.services.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni storitev — dodajte prvo</div>
      ) : posData.services.map(s => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:14, borderRadius:10, marginBottom:8, background:T.surface, border:'1px solid '+T.line, opacity: s.active ? 1 : 0.5 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:s.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <KI name="calendar" size={18} strokeWidth={2}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{s.duration_min} min · {eur(s.price)}</div>
          </div>
          <div style={{ width:12, height:12, borderRadius:'50%', background:s.color||T.accent, flexShrink:0 }}/>
          <button onClick={()=>toggleActive(s)} title={s.active?'Deaktiviraj':'Aktiviraj'} style={{ ...btnS, padding:'6px 10px', fontSize:11 }}>
            {s.active ? '✅' : '⭕'}
          </button>
          <button onClick={()=>setModal({...s})} style={btnS}><KI name="edit" size={14}/></button>
          <button onClick={()=>remove(s.id,s.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
        </div>
      ))}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={420}>
        <ModalHeader title={modal?.id?'Uredi storitev':'Nova storitev'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime storitve *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Fizioterapija, Masaža, PT..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Cena (€) *">
              <input type="number" step="0.01" min="0" value={modal?.price||''} onChange={e=>setModal(p=>({...p,price:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Trajanje (min) *">
              <input type="number" min="5" step="5" value={modal?.duration_min||60} onChange={e=>setModal(p=>({...p,duration_min:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <Field label="Barva (za prikaz v koledarju)">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {SVC_COLORS.map(c=>(
                <div key={c} onClick={()=>setModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:modal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={modal?.active!==false} onChange={e=>setModal(p=>({...p,active:e.target.checked}))} style={{ accentColor:T.accent }}/>
            Storitev je aktivna
          </label>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Happy Hour CRUD ──────────────────────────────────────────
function HappyHourSection({ posData }) {
  const [rules, setRules] = useState([])
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadingRules, setLoadingRules] = useState(true)

  const DAYS = [
    { id:'pon', label:'Pon' }, { id:'tor', label:'Tor' }, { id:'sre', label:'Sre' },
    { id:'čet', label:'Čet' }, { id:'pet', label:'Pet' }, { id:'sob', label:'Sob' }, { id:'ned', label:'Ned' },
  ]

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function loadRules() {
    setLoadingRules(true)
    const {data} = await createClient().from('happy_hour_rules').select('*').eq('business_id', BUSINESS_ID)
    setRules(data || [])
    setLoadingRules(false)
  }

  useEffect(() => { loadRules() }, [])

  async function toggleRule(rule) {
    await createClient().from('happy_hour_rules').update({ active: !rule.active }).eq('id', rule.id)
    loadRules()
    showToast(rule.active ? 'Pravilo deaktivirano' : 'Pravilo aktivirano')
  }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.from_time || !modal?.to_time) { showToast('Čas je obvezen',false); return }
    if (!modal?.discount_pct || modal.discount_pct <= 0) { showToast('Popust mora biti > 0%',false); return }
    if (!modal?.days || modal.days.length === 0) { showToast('Izberi vsaj en dan',false); return }
    setSaving(true)
    try {
      const catIds = (posData.categories || []).filter(c => c.id !== 'cat-fav' && (modal.selected_cats || []).includes(c.id)).map(c => c.id)
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        days: modal.days,
        from_time: modal.from_time,
        to_time: modal.to_time,
        category_ids: catIds,
        discount_pct: Number(modal.discount_pct),
        active: modal.active !== false,
      }
      if (modal.id) {
        const {error} = await createClient().from('happy_hour_rules').update(payload).eq('id', modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('happy_hour_rules').insert(payload)
        if (error) throw error
      }
      setModal(null); loadRules(); showToast(modal.id ? 'Pravilo posodobljeno' : 'Pravilo dodano')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id) {
    if (!confirm('Izbrišem to pravilo?')) return
    await createClient().from('happy_hour_rules').delete().eq('id', id)
    loadRules(); showToast('Pravilo izbrisano')
  }

  function openEdit(rule) {
    setModal({
      ...rule,
      selected_cats: rule.category_ids || [],
    })
  }

  const realCats = (posData.categories || []).filter(c => c.id !== 'cat-fav')

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Happy hour</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Avtomatski popusti po dnevih, urah in kategorijah.</div>
        </div>
        <button onClick={()=>setModal({days:['pon','tor','sre','čet','pet'],from_time:'17:00',to_time:'19:00',discount_pct:20,active:true,selected_cats:[]})} style={btnP}>+ Dodaj pravilo</button>
      </div>

      {loadingRules ? (
        <div style={{ padding:30, textAlign:'center', color:T.muted }}>Nalagam...</div>
      ) : rules.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
          Ni pravil — dodajte prvo
        </div>
      ) : rules.map(r => (
        <div key={r.id} style={{ padding:16, borderRadius:12, marginBottom:10, background:T.surface, border:'1px solid '+T.line, opacity: r.active ? 1 : 0.55 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background: r.active ? T.brand : T.muted, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{r.name}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                {r.from_time} – {r.to_time} · −{r.discount_pct}%
              </div>
            </div>
            <button onClick={()=>toggleRule(r)} style={{ ...btnS, padding:'6px 10px', fontSize:11 }}>
              {r.active ? '⏸ Pavza' : '▶ Aktiviraj'}
            </button>
            <button onClick={()=>openEdit(r)} style={btnS}><KI name="edit" size={14}/></button>
            <button onClick={()=>remove(r.id)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {(r.days||[]).map(d => (
              <span key={d} style={{ padding:'3px 8px', borderRadius:5, background: r.active ? T.accentSoft : T.surface3, color: r.active ? T.accent : T.muted, fontSize:11, fontWeight:600, textTransform:'capitalize' }}>{d}</span>
            ))}
          </div>
        </div>
      ))}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={500}>
        <ModalHeader title={modal?.id?'Uredi pravilo':'Novo happy hour pravilo'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'65vh', overflowY:'auto' }}>
          <Field label="Ime pravila *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Bar happy hour, Jutranjo kavo..." style={inp} autoFocus/>
          </Field>
          <Field label="Popust (%) *">
            <input type="number" min="1" max="99" value={modal?.discount_pct||20} onChange={e=>setModal(p=>({...p,discount_pct:e.target.value}))} style={inp}/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Od *">
              <input type="time" value={modal?.from_time||'17:00'} onChange={e=>setModal(p=>({...p,from_time:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Do *">
              <input type="time" value={modal?.to_time||'19:00'} onChange={e=>setModal(p=>({...p,to_time:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <Field label="Dnevi *">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {DAYS.map(d => {
                const sel = (modal?.days||[]).includes(d.id)
                return (
                  <button key={d.id} onClick={()=>setModal(p=>({...p,days:sel?(p.days||[]).filter(x=>x!==d.id):[...(p.days||[]),d.id]}))}
                    style={{ padding:'6px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, background:sel?T.accent:T.surface3, color:sel?'#fff':T.ink }}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Kategorije (pusti prazno = vse)">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {realCats.map(c => {
                const sel = (modal?.selected_cats||[]).includes(c.id)
                return (
                  <button key={c.id} onClick={()=>setModal(p=>({...p,selected_cats:sel?(p.selected_cats||[]).filter(x=>x!==c.id):[...(p.selected_cats||[]),c.id]}))}
                    style={{ padding:'5px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12, background:sel?T.accentSoft:T.surface3, color:sel?T.accent:T.muted, display:'flex', alignItems:'center', gap:4 }}>
                    <span>{c.icon}</span> {c.name}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>Nobena izbrana = velja za vse kategorije</div>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={modal?.active!==false} onChange={e=>setModal(p=>({...p,active:e.target.checked}))} style={{ accentColor:T.accent }}/>
            Pravilo je aktivno
          </label>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Kuhinja & Display ────────────────────────────────────────
function KuhinjaSection({ posData }) {
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const kitchenItems = posData.items.filter(i => i.kitchen)
  const nonKitchenItems = posData.items.filter(i => !i.kitchen)

  async function toggleKitchen(item) {
    setSaving(item.id)
    try {
      const {error} = await createClient().from('items').update({ kitchen: !item.kitchen }).eq('id', item.id)
      if (error) throw error
      posData.refresh()
      showToast(item.kitchen ? `${item.name} odstranjen iz kuhinje` : `${item.name} dodan v kuhinjo`)
    } catch(e) { showToast(e.message,false) }
    setSaving(null)
  }

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Kuhinja & display</div>
        <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>
          Označi artikle ki gredo v kuhinjo (bon za kuharja). KDS display prihaja.
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Kuhinja ON */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', background:T.accentSoft, borderBottom:'1px solid '+T.line }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.accent }}>🍳 Gre v kuhinjo ({kitchenItems.length})</div>
          </div>
          <div style={{ padding:8, maxHeight:400, overflowY:'auto' }}>
            {kitchenItems.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>Nobeden artikel</div>}
            {kitchenItems.map(it => (
              <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, marginBottom:4, background:T.surface2 }}>
                <div style={{ flex:1, fontSize:13, fontWeight:500 }}>{it.name}</div>
                <button onClick={()=>toggleKitchen(it)} disabled={saving===it.id} style={{ ...btnS, padding:'5px 10px', fontSize:11, color:T.danger }}>
                  {saving===it.id ? '...' : '✕ Odstrani'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Kuhinja OFF */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', background:T.surface2, borderBottom:'1px solid '+T.line }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.muted }}>📋 Ni v kuhinji ({nonKitchenItems.length})</div>
          </div>
          <div style={{ padding:8, maxHeight:400, overflowY:'auto' }}>
            {nonKitchenItems.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>Vsi artikli so v kuhinji</div>}
            {nonKitchenItems.map(it => (
              <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, marginBottom:4, background:T.surface2 }}>
                <div style={{ flex:1, fontSize:13, fontWeight:500, color:T.muted }}>{it.name}</div>
                <button onClick={()=>toggleKitchen(it)} disabled={saving===it.id} style={{ ...btnS, padding:'5px 10px', fontSize:11, color:T.accent }}>
                  {saving===it.id ? '...' : '+ Dodaj'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(184,140,40,0.08)', borderRadius:10, fontSize:12, color:T.warn, border:'1px solid rgba(184,140,40,0.2)' }}>
        🖨️ <b>KDS (Kitchen Display System)</b> — prikaz naročil v kuhinji na zaslonu prihaja v naslednji verziji.
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Autolock ─────────────────────────────────────────────────
function AutolockSection({ auth }) {
  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>Avtomatsko zaklepanje</div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
        {CFG.autoLockOptions.map(opt => {
          const active = auth.autoLock === opt.ms
          return (
            <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:9, marginBottom:4, cursor:'pointer', background: active?T.accentSoft:T.surface2, border:'1px solid '+(active?T.accent:T.lineSoft) }}>
              <input type="radio" name="autolock" checked={active} onChange={() => auth.setAutoLock(opt.ms)} style={{ accentColor:T.accent, width:16, height:16 }}/>
              <div style={{ fontSize:13, fontWeight:600, color: active?T.accent:T.ink }}>{opt.label}</div>
              {active && <KI name="check" size={16}/>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ─── FURS ─────────────────────────────────────────────────────
function FursSection() {
  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>FURS & DDV</div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>FURS davčna blagajna</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Nastavitve certifikata in poslovnih prostorov</div>
          </div>
        </div>
        <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:9, fontSize:13, color:T.accent }}>
          FURS nastavitve (certifikat .p12, poslovni prostori, naprave) so v<br/>
          <b>Računko → Nastavitve → FURS</b>
        </div>
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────
function ProfileSection({ posData }) {
  const [saving, setSaving] = useState(false)
  const currentProfile = posData.businessProfile || 'all'

  async function select(pid) {
    if (saving) return
    setSaving(true)
    try {
      await createClient().from('businesses').update({ profile_type: pid }).eq('id', BUSINESS_ID)
      posData.setBusinessProfile(pid)
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Tip poslovanja</div>
      <div style={{ fontSize:13, color:T.muted, marginBottom:20 }}>
        Izberi tip ki ustreza tvojemu poslovanju. Navigacija se prilagodi samodejno.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {CFG.profiles.map(p => {
          const selected = currentProfile === p.id
          return (
            <div key={p.id} onClick={() => select(p.id)} style={{
              padding:18, borderRadius:12, background:T.surface,
              border: selected ? '2px solid '+T.accent : '2px solid '+T.line,
              cursor:'pointer', position:'relative',
              boxShadow: selected ? '0 0 0 3px '+T.accentSoft : 'none',
              transition:'border 0.15s, box-shadow 0.15s',
            }}>
              {selected && (
                <div style={{ position:'absolute', top:14, right:14, width:24, height:24, borderRadius:'50%', background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800 }}>✓</div>
              )}
              <div style={{ fontSize:26, marginBottom:10 }}>{p.icon}</div>
              <div style={{ fontSize:17, fontWeight:800, color: selected ? T.accent : T.ink }}>{p.name}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:4, lineHeight:1.5 }}>
                {p.nav.map(n => (
                  <span key={n} style={{ display:'inline-block', margin:'2px 3px 2px 0', padding:'2px 7px', borderRadius:5, background: selected ? T.accentSoft : T.surface3, color: selected ? T.accent : T.muted, fontSize:10, fontWeight:600, textTransform:'capitalize' }}>{n}</span>
                ))}
              </div>
              {saving && selected && <div style={{ fontSize:10, color:T.muted, marginTop:6 }}>Shranjujem...</div>}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop:16, padding:'12px 14px', background:T.surface2, borderRadius:10, fontSize:12, color:T.muted }}>
        💡 Sprememba profila takoj posodobi navigacijo. Podatki ostanejo nespremenjeni.
      </div>
    </div>
  )
}

// ================================================================
// SHARED UI HELPERS
// ================================================================
function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  )
}

function Toast({ msg, ok }) {
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: ok ? T.accent : T.danger, color:'#fff', padding:'10px 20px', borderRadius:999, fontSize:13, fontWeight:600, zIndex:4000, boxShadow:'0 8px 24px rgba(0,0,0,0.2)', whiteSpace:'nowrap' }}>
      {ok ? '✓' : '✕'} {msg}
    </div>
  )
}

const inp = { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid rgba(0,0,0,0.15)', fontSize:13, outline:'none', background:'#fff', color:'#0D1F12', boxSizing:'border-box' }
const btnP = { background:'#0D1F12', color:'#fff', border:0, borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }
const btnS = { background:'#fff', color:'#666', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }

// ================================================================
// MAIN APP
// ================================================================
function KlasikApp() {
  const auth = useAuthState(60000)
  const posData = usePosData()
  const [profileId, setProfileId] = useState('all')

  // Sync profileId iz Supabase ob loadu
  useEffect(() => {
    if (posData.businessProfile && posData.businessProfile !== profileId) {
      setProfileId(posData.businessProfile)
    }
  }, [posData.businessProfile])

  const profile = CFG.profiles.find(p => p.id === profileId) || CFG.profiles[0]

  const screenPerm = { floor:null, sale:'sale', calendar:'manageBookings', customers:'viewMembers', packages:'editPrices', inventory:'editPrices', reports:'viewReports', admin:null }
  const nav = profile.nav.filter(s => { const p = screenPerm[s]; if (!p) return true; return auth.permissions[p] })

  const [screen, setScreen] = useState('sale')
  const [activeTable, setActiveTable] = useState(null)
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [happyHourActive, setHappyHourActive] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!nav.includes(screen)) setScreen(nav[0] || 'sale') }, [profileId])

  const totals = H.orderTotals(cart)

  function addItem(item, happyOn = false) {
    const eligible = happyOn && H.isHappyHourEligible(item.name)
    setCart(c => {
      const idx = c.findIndex(l => l.id === item.id && l.happyHourApplied === eligible)
      if (idx >= 0) { const cp = [...c]; cp[idx] = {...cp[idx], qty: cp[idx].qty + 1}; return cp }
      return [...c, { lineId: Math.random().toString(36).slice(2), id: item.id, name: item.name, price: Number(item.price), qty: 1, vat_rate: Number(item.vat_rate || 22), unit: item.unit || 'kos', mods: [], note: '', happyHourApplied: eligible }]
    })
  }

  function adjustQty(lineId, delta) {
    setCart(c => c.flatMap(l => l.lineId === lineId ? (l.qty + delta <= 0 ? [] : [{...l, qty: l.qty + delta}]) : [l]))
  }

  const days = ['Ned','Pon','Tor','Sre','Čet','Pet','Sob']

  return (
    <div style={{ width:'100%', height:'100%', background:T.bg, color:T.ink, fontFamily:'"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize:13, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

      {/* HEADER */}
      <div style={{ background:T.header, color:T.headerInk, padding:'8px 16px', display:'flex', alignItems:'center', gap:14, flexShrink:0, borderBottom:'1px solid '+T.headerLine, minHeight:56 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:T.brand, color:T.header, fontWeight:800, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ lineHeight:1.1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{CFG.business.name}</div>
            <div style={{ fontSize:11, opacity:0.65, marginTop:2 }}>{profile.name}</div>
          </div>
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          {auth.permissions?.viewSales && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
              <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Promet</div>
              <div style={{ fontSize:15, fontWeight:800, color:T.brand, fontVariantNumeric:'tabular-nums' }}>{eur(posData.todayStats.promet + totals.total)}</div>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
            <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Računi</div>
            <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{posData.todayStats.racuni}</div>
          </div>
          <div style={{ borderLeft:'1px solid '+T.headerLine, paddingLeft:14, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
            <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{days[now.getDay()]}</div>
            <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
              {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
            </div>
          </div>
          <UserAvatar user={auth.user} onLock={auth.lock}/>
        </div>
      </div>

      {/* CONTEXT STRIP */}
      {(activeTable || activeCustomer || happyHourActive) && (
        <div style={{ background:T.brand, color:T.header, padding:'7px 18px', display:'flex', alignItems:'center', gap:14, fontSize:12, fontWeight:600, flexShrink:0 }}>
          {happyHourActive && <div style={{ display:'flex', alignItems:'center', gap:6 }}><KI name="happy" size={14}/><span>Happy hour <b>−20%</b></span></div>}
          {activeTable && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="chair" size={14}/><span>Miza: <b>{activeTable.name}</b></span>
              <button onClick={() => setActiveTable(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none', cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
          {activeCustomer && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="user" size={14}/><span>Stranka: <b>{activeCustomer.name}</b></span>
              <button onClick={() => setActiveCustomer(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none', cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
        </div>
      )}

      {/* BODY */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        <SideNav screen={screen} setScreen={setScreen} nav={nav}/>
        <div style={{ flex:1, display:'flex', overflow:'hidden', minWidth:0 }}>
          {screen==='floor'     && <FloorScreen spaces={posData.spaces} setActiveTable={setActiveTable} setScreen={setScreen}/>}
          {screen==='sale'      && <SaleScreen activeTable={activeTable} activeCustomer={activeCustomer} cart={cart} setCart={setCart} addItem={addItem} adjustQty={adjustQty} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer} posData={posData} happyHourActive={happyHourActive} setHappyHourActive={setHappyHourActive}/>}
          {screen==='calendar'  && <CalendarScreen posData={posData}/>}
          {screen==='customers' && <CustomersScreen posData={posData} setActiveCustomer={setActiveCustomer} setScreen={setScreen}/>}
          {screen==='packages'  && <PackagesScreen posData={posData}/>}
          {screen==='inventory' && <InventoryScreen posData={posData}/>}
          {screen==='reports'   && <ReportsScreen posData={posData}/>}
          {screen==='admin'     && <AdminScreen auth={auth} posData={posData}/>}
        </div>
      </div>

      <PaymentModal open={paymentOpen} total={totals.total} cart={cart} activeTable={activeTable} activeCustomer={activeCustomer} auth={auth}
        onCancel={() => setPaymentOpen(false)}
        onComplete={(data) => {
          setPaymentOpen(false)
          setReceipt(data)
          setCart([])
          setActiveTable(null)
          posData.refresh()
        }}/>
      <ReceiptToast data={receipt} onClose={() => setReceipt(null)}/>
      {auth.locked && <LockScreen auth={auth}/>}
    </div>
  )
}

// ================================================================
// PAGE ENTRY
// ================================================================
export default function PosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0d2818', display:'flex', alignItems:'center', justifyContent:'center', color:'#f6f1e8', fontFamily:'system-ui', fontSize:16 }}>
      Nalagam blagajno...
    </div>
  )

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden' }}>
      <KlasikApp/>
    </div>
  )
}

