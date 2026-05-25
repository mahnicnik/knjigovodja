// @ts-nocheck
'use client'
export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { pos, BUSINESS_ID } from '@/lib/pos-client'
import { buildReceiptHTML } from '@/lib/receipt'
import { getCurrentSession, openSession, getSessionStats, closeSession, type CashSession, type SessionStats } from '@/lib/cash-session'
import { buildOpeningReceipt, buildXReportReceipt, buildZReportReceipt } from '@/lib/cash-session-receipt'

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
    { id: 'all',      name: 'Vse v enem',       icon: '🌐', nav: ['floor','sale','calendar','customers','packages','inventory','orders','reports','admin'] },
    { id: 'rest',     name: 'Restavracija',      icon: '🍽', nav: ['floor','sale','calendar','customers','inventory','orders','reports','admin'] },
    { id: 'bar',      name: 'Bar / Kavarna',     icon: '🍺', nav: ['floor','sale','customers','inventory','orders','reports','admin'] },
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
  const [ingredients, setIngredients] = useState([])
  const [notifications, setNotifications] = useState([])
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
          createClient().from('ingredients').select('*').eq('business_id', BUSINESS_ID).order('name'),
        ])
        setCategories(cats)
        setItems(itms)
        setSpaces(sps)
        setCustomers(custs)
        setStaffList(stf)
        setPackageTemplates(pkgs)
        setServices(svcs)
        setTodayStats(stats)
        setIngredients((await createClient().from('ingredients').select('*, item_ingredients(qty_used, item_id)').eq('business_id', BUSINESS_ID).order('name')).data || [])
        // Generiraj in fetch notifikacije
        await createClient().rpc('generate_pos_notifications', { p_business_id: BUSINESS_ID })
        const notifRes = await createClient().from('pos_notifications').select('*, customers(name, email)').eq('business_id', BUSINESS_ID).eq('dismissed', false).order('created_at', { ascending: false })
        setNotifications(notifRes.data || [])
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

  return { categories: categoriesWithFav, items, spaces, customers, staffList, packageTemplates, services, ingredients, notifications, setNotifications, todayStats, businessProfile, setBusinessProfile, loading, itemsIn, refresh }
}

// ================================================================
// ================================================================
// MULTI-BLAGAJNA — premise + device iz localStorage
// ================================================================
const ACTIVE_PREMISE_KEY = 'racunko_active_premise'
const ACTIVE_DEVICE_KEY  = 'racunko_active_device'

function getActivePremise() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_PREMISE_KEY) || 'null') } catch { return null }
}
function setActivePremise(p) {
  if (p) localStorage.setItem(ACTIVE_PREMISE_KEY, JSON.stringify(p))
  else localStorage.removeItem(ACTIVE_PREMISE_KEY)
}
function getActiveDevice() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_DEVICE_KEY) || 'null') } catch { return null }
}
function setActiveDevice(d) {
  if (d) localStorage.setItem(ACTIVE_DEVICE_KEY, JSON.stringify(d))
  else localStorage.removeItem(ACTIVE_DEVICE_KEY)
}

// AUTH HOOK — real PIN login iz DB
// ================================================================
function useAuthState(autoLockMs = 60000) {
  const [user, setUser] = useState(null)
  const [locked, setLocked] = useState(true)
  const [autoLock, setAutoLock] = useState(() => {
    if (typeof window === 'undefined') return autoLockMs
    const saved = localStorage.getItem('pos_autolock')
    return saved !== null ? parseInt(saved) : autoLockMs
  })
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

  function saveAutoLock(ms) {
    setAutoLock(ms)
    if (typeof window !== 'undefined') localStorage.setItem('pos_autolock', String(ms))
  }

  return { user, permissions, locked, lock, unlock, autoLock, setAutoLock: saveAutoLock }
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
    if (open && typeof open === 'object') { if(open.discount) setDiscount(open.discount) }
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
      let fursInvoiceNumber = null
      if (furs) {
        try {
          const fursRes = await fetch('/api/furs/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, total: finalTotal }),
          })
          // 200 = success, 503 = FURS napaka ampak še vedno imamo ZOI + tridelno
          const fursData = await fursRes.json().catch(() => ({}))
          if (fursData.eor) fursEor = fursData.eor
          if (fursData.zoi) fursZoi = fursData.zoi
          if (fursData.invoiceNumber) fursInvoiceNumber = fursData.invoiceNumber
          if (!fursRes.ok && fursData.error) {
            console.warn('FURS:', fursData.error)
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

      // Odštej zalogo za simple artikle
      try {
        for (const line of cart) {
          if (line.item_type !== 'recipe' && line.stock !== null) {
            const newStock = Math.max(0, (line.stock || 0) - line.qty)
            await createClient().from('items').update({ stock: newStock }).eq('id', line.id)
          }
        }
      } catch(stockErr) { console.warn('Zaloga odštevanje ni uspelo:', stockErr) }
      // Odštej surovine za recipe artikle
      try {
        for (const line of cart) {
          if (line.item_type === 'recipe') {
            const {data: normLines} = await createClient().from('item_ingredients').select('ingredient_id, qty_used').eq('item_id', line.id)
            if (normLines && normLines.length > 0) {
              for (const nl of normLines) {
                const {data: ig} = await createClient().from('ingredients').select('stock_qty').eq('id', nl.ingredient_id).single()
                if (ig) {
                  const newQty = Math.max(0, (ig.stock_qty || 0) - (nl.qty_used * line.qty))
                  await createClient().from('ingredients').update({ stock_qty: newQty }).eq('id', nl.ingredient_id)
                }
              }
            }
          }
        }
      } catch(normErr) { console.warn('Normativ odštevanje ni uspelo:', normErr) }

      // Pridobi org + premise + device + cashier za izpis računa
      let orgInfo = null
      let premiseInfo = null
      let deviceInfo = null
      let cashierDisplayName = ''
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          const { data: mem } = await sb.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
          if (mem) {
            const { data: o } = await sb.from('organizations').select('*').eq('id', mem.org_id).single()
            orgInfo = o
            const { data: p } = await sb.from('business_premises').select('*').eq('org_id', mem.org_id).eq('is_active', true).limit(1).maybeSingle()
            premiseInfo = p
            if (p) {
              const { data: d } = await sb.from('electronic_devices').select('*').eq('premise_id', p.id).eq('is_active', true).maybeSingle()
              deviceInfo = d
            }
          }
          cashierDisplayName = user.email?.split('@')[0] || ''
        }
      } catch (e) { console.warn('Receipt meta load:', e) }

      const fallbackNumber = `RAC-${orderId ? orderId.slice(-5).toUpperCase() : Date.now().toString().slice(-5)}`
      onComplete({
        method,
        total: finalTotal,
        subtotal: total,
        discount_amount: total - finalTotal,
        tip: 0,
        furs,
        eor: fursEor,
        zoi: fursZoi,
        orderId,
        invoiceNumber: fursInvoiceNumber || fallbackNumber,
        org: orgInfo ? {
          name: orgInfo.name,
          address: orgInfo.address,
          post_code: orgInfo.post_code,
          city: orgInfo.city,
          tax_number: orgInfo.tax_number,
          vat_registered: orgInfo.vat_registered,
        } : null,
        premiseId: premiseInfo?.premise_id || 'SIRBFB01',
        deviceId: deviceInfo?.device_id || 'RACUNKO01',
        cashierName: cashierDisplayName,
        lines: cart.map(l => ({
          name: l.name,
          qty: l.qty,
          unitPrice: l.happyHourApplied ? l.price * 0.8 : l.price,
          unit_price: l.happyHourApplied ? l.price * 0.8 : l.price,
          vat_rate: l.vat_rate || 22,
        })),
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

async function autoPrint(data) {
  // Poskusi lokalni print server (Star/Epson termalni)
  try {
    const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
    if (res.ok) {
      const printData = {
        business_name: data.org?.name || 'ŠIRM fitness&bar',
        business_address: [data.org?.address, [data.org?.post_code, data.org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        tax_number: data.org?.tax_number || '',
        vat_id: data.org?.vat_registered ? `SI${data.org.tax_number}` : '',
        receipt_number: data.invoiceNumber || data.orderId?.slice(-6),
        cashier: data.cashierName || '',
        date: new Date().toLocaleString('sl-SI'),
        items: (data.lines||[]).map(l => ({
          name: l.name,
          qty: Number(l.qty),
          unit_price: Number(l.unitPrice||l.unit_price||0),
          vat_rate: Number(l.vat_rate || 22),
        })),
        subtotal: Number(data.subtotal||data.total||0),
        discount_pct: data.discount_pct || 0,
        discount_amount: data.discount_amount || 0,
        tip: data.tip || 0,
        total: data.total,
        payment_method: data.method,
        furs_zoi: data.zoi,
        furs_eor: data.eor,
      }
      const printRes = await fetch('http://localhost:6789/print/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(printData)
      })
      if ((await printRes.json()).ok) return
    }
  } catch(e) {}

  // Fallback: browser print z lib/receipt.ts helperjem
  try {
    const html = await buildReceiptHTML({
      org: data.org || {
        name: 'ŠIRM fitness&bar',
        address: 'Poljanska cesta 87',
        city: 'Gorenja vas',
        post_code: '4224',
        tax_number: '',
        vat_registered: false,
      },
      premiseId: data.premiseId || 'SIRBFB01',
      deviceId: data.deviceId || 'RACUNK001',
      invoiceNumber: data.invoiceNumber || (data.orderId?.slice(-6)) || '—',
      issueDate: new Date(),
      cashierName: data.cashierName || '',
      payment: {
        method: data.method,
        furs_zoi: data.zoi,
        furs_eor: data.eor,
      },
      lines: (data.lines||[]).map(l => ({
        name: l.name,
        qty: Number(l.qty),
        unit_price: Number(l.unitPrice||l.unit_price||0),
        vat_rate: Number(l.vat_rate || 22),
        total: Number(l.total || (l.qty * (l.unitPrice||l.unit_price||0))),
      })),
      subtotal: Number(data.subtotal||data.total||0),
      discountAmount: Number(data.discount_amount||0),
      tip: Number(data.tip||0),
      total: Number(data.total||0),
    })
    const w = window.open('', '_blank', 'width=380,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
  } catch (e) {
    console.error('Receipt print error:', e)
  }
}

function ReceiptToast({ data, onClose }) {
  const fursOk = data?.eor
  const fursFailed = data?.furs && !data?.eor

  React.useEffect(() => {
    if (data) {
      // Avtomatski print
      autoPrint(data)
    }
  }, [data])

  if (!data) return null
  return (
    <Modal open={!!data} onClose={onClose} width={340}>
      <div style={{ padding:'28px 22px', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:999, margin:'0 auto 14px', background:fursFailed?'rgba(168,50,50,0.1)':T.accentSoft, color:fursFailed?T.danger:T.accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <KI name="check" size={28} strokeWidth={2.5}/>
        </div>
        <div style={{ fontSize:20, fontWeight:700 }}>Racun zakljucen</div>
        <div style={{ fontSize:22, fontWeight:700, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{eur(data.total)}</div>
        {fursOk && (
          <div style={{ fontSize:12, color:T.accent, marginTop:8, fontWeight:600 }}>
            FURS potrjen
          </div>
        )}
        {fursFailed && (
          <div style={{ fontSize:12, color:T.danger, marginTop:8, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>
            ⚠️ FURS potrjevanje ni uspelo. Racun je shranjen, potrdi ga rocno v zavihku Racuni.
          </div>
        )}
        <div style={{ fontSize:13, fontWeight:600, color:T.muted, marginTop:4 }}>{data.invoiceNumber}</div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid rgba(0,0,0,0.1)', background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={()=>autoPrint(data)} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
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
  orders:    { label:'Računi',           icon:'receipt'  },
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

// ================================================================
// PREMISE SELECT SCREEN — izbira lokacije in blagajne
// ================================================================
function PremiseSelectScreen({ auth, onSelected }) {
  const [premises, setPremises] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedPremise, setSelectedPremise] = useState(null)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const db = createClient()
      const [premRes, devRes] = await Promise.all([
        db.from('business_premises').select('*').eq('org_id', auth.orgId || '').eq('is_active', true),
        db.from('electronic_devices').select('*').eq('org_id', auth.orgId || '').eq('is_active', true),
      ])
      const prems = premRes.data || []
      const devs = devRes.data || []
      setPremises(prems)
      setDevices(devs)

      // Preveri če imamo shranjeno izbiro
      const savedPremise = getActivePremise()
      const savedDevice = getActiveDevice()
      if (savedPremise && prems.find(p => p.id === savedPremise.id)) {
        setSelectedPremise(savedPremise)
      } else if (prems.length === 1) {
        setSelectedPremise(prems[0])
      }
      if (savedDevice && devs.find(d => d.id === savedDevice.id)) {
        setSelectedDevice(savedDevice)
      }
      setLoading(false)
    }
    load()
  }, [])

  const premiseDevices = devices.filter(d => d.premise_id === selectedPremise?.id)

  function confirm() {
    if (!selectedPremise) return
    setSaving(true)
    setActivePremise(selectedPremise)
    setActiveDevice(selectedDevice || premiseDevices[0] || null)
    setTimeout(() => onSelected(selectedPremise, selectedDevice || premiseDevices[0] || null), 300)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:T.header, display:'flex', alignItems:'center', justifyContent:'center', color:T.headerInk }}>
      Nalagam...
    </div>
  )

  // Če je samo en prostor in ena naprava → samodejno nadaljuj
  if (premises.length === 1 && devices.length <= 1) {
    setActivePremise(premises[0])
    setActiveDevice(devices[0] || null)
    onSelected(premises[0], devices[0] || null)
    return null
  }

  return (
    <div style={{ minHeight:'100vh', background:T.header, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:480 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:T.brand, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:22, color:T.header, marginBottom:12 }}>R</div>
          <div style={{ color:T.headerInk, fontWeight:800, fontSize:20 }}>Izberi blagajno</div>
          <div style={{ color:'rgba(246,241,232,0.5)', fontSize:13, marginTop:4 }}>
            Prijavljen: {auth.name} · {auth.role}
          </div>
        </div>

        {/* Poslovni prostori */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(246,241,232,0.5)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Poslovni prostor / lokacija</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {premises.map(p => (
              <button key={p.id} onClick={() => { setSelectedPremise(p); setSelectedDevice(null) }}
                style={{ padding:'14px 16px', borderRadius:11, border:'2px solid '+(selectedPremise?.id===p.id?T.brand:'rgba(255,255,255,0.1)'), background:selectedPremise?.id===p.id?'rgba(233,185,73,0.15)':'rgba(255,255,255,0.05)', cursor:'pointer', fontFamily:'inherit', color:T.headerInk, textAlign:'left', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:9, background:selectedPremise?.id===p.id?T.brand:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                  🏪
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{p.premise_id}</div>
                  <div style={{ fontSize:12, color:'rgba(246,241,232,0.6)', marginTop:2 }}>{p.address}{p.city?`, ${p.city}`:''}</div>
                </div>
                {selectedPremise?.id===p.id && <div style={{ color:T.brand, fontSize:18 }}>✓</div>}
              </button>
            ))}
            {premises.length === 0 && (
              <div style={{ padding:'20px', borderRadius:11, border:'1px solid rgba(255,255,255,0.1)', color:'rgba(246,241,232,0.5)', fontSize:13, textAlign:'center' }}>
                Ni poslovnih prostorov.<br/>
                <span style={{ fontSize:11 }}>Dodaj jih v Nastavitve → FURS → Poslovni prostori</span>
              </div>
            )}
          </div>
        </div>

        {/* Naprave za izbrani prostor */}
        {selectedPremise && premiseDevices.length > 1 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(246,241,232,0.5)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Blagajna / naprava</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {premiseDevices.map(d => (
                <button key={d.id} onClick={() => setSelectedDevice(d)}
                  style={{ padding:'10px 16px', borderRadius:9, border:'2px solid '+(selectedDevice?.id===d.id?T.brand:'rgba(255,255,255,0.1)'), background:selectedDevice?.id===d.id?'rgba(233,185,73,0.15)':'rgba(255,255,255,0.05)', cursor:'pointer', fontFamily:'inherit', color:T.headerInk, fontWeight:selectedDevice?.id===d.id?700:500, fontSize:13 }}>
                  🖨️ {d.device_id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Potrdi */}
        <button onClick={confirm} disabled={!selectedPremise || saving}
          style={{ width:'100%', padding:'14px', borderRadius:11, background:selectedPremise?T.brand:'rgba(255,255,255,0.1)', color:T.header, border:'none', cursor:selectedPremise?'pointer':'not-allowed', fontFamily:'inherit', fontWeight:800, fontSize:15, marginTop:8 }}>
          {saving ? 'Nalagam...' : selectedPremise ? `Odpri blagajno — ${selectedPremise.premise_id}` : 'Izberi poslovni prostor'}
        </button>

        {/* Zamenjaj blagajno */}
        <button onClick={() => { setActivePremise(null); setActiveDevice(null); setSelectedPremise(null); setSelectedDevice(null) }}
          style={{ width:'100%', padding:'10px', borderRadius:9, background:'transparent', color:'rgba(246,241,232,0.4)', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, marginTop:8 }}>
          ↩ Prijavi se z drugim PIN-om
        </button>
      </div>
    </div>
  )
}

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
  const [cartDiscount, setCartDiscount] = useState(0)
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
      <SaleCart cart={cart} setCart={setCart} adjustQty={adjustQty} activeTable={activeTable} activeCustomer={activeCustomer} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer} customers={posData.customers} cartDiscount={cartDiscount} setCartDiscount={setCartDiscount}/>

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

function SaleCart({ cart, setCart, adjustQty, activeTable, activeCustomer, setPaymentOpen, totals, setActiveCustomer, customers, cartDiscount, setCartDiscount }) {
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitParts, setSplitParts] = useState(2)
  const [splitPaid, setSplitPaid] = useState([])
  const [splitQty, setSplitQty] = useState({})
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
          <button onClick={()=>{setDiscountInput(cartDiscount>0?String(cartDiscount):'');setDiscountOpen(true)}} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:cartDiscount>0?T.accentSoft:T.chipBg, border:'none', cursor:'pointer', color:cartDiscount>0?T.accent:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="percent" size={14}/>{cartDiscount>0?`-${cartDiscount}%`:'Popust'}
          </button>
          <button onClick={()=>setSplitOpen(true)} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
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
        {cartDiscount>0 && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:T.accent }}>
            <span>Popust {cartDiscount}%</span><span>-{eur(totals.total*cartDiscount/100)}</span>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div style={{ fontWeight:700, fontSize:14 }}>Skupaj</div>
          <div style={{ fontWeight:800, fontSize:26, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{eur(totals.total)}</div>
        </div>
        <button disabled={cart.length===0} onClick={() => setPaymentOpen({ discount: cartDiscount })} style={{ width:'100%', marginTop:12, padding:'13px', borderRadius:9, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily:'inherit', border:'none', background: cart.length ? T.accent : '#ccc', color:'#fff', fontWeight:800, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <KI name="arrow" size={16} strokeWidth={2.2}/> Plačaj {cart.length > 0 ? eur(totals.total*(1-cartDiscount/100)) : ''}
        </button>
      </div>

      {discountOpen && (
        <Modal open onClose={()=>setDiscountOpen(false)} width={320}>
          <ModalHeader title="Popust na račun" onClose={()=>setDiscountOpen(false)}/>
          <div style={{ padding:'20px 22px' }}>
            <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>Vnesi % popust na celoten račun</div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {[5,10,15,20,25].map(p=>(
                <button key={p} onClick={()=>setDiscountInput(String(p))} style={{ flex:1, padding:'8px 4px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13, background:discountInput===String(p)?T.accentSoft:T.chipBg, color:discountInput===String(p)?T.accent:T.ink }}>
                  {p}%
                </button>
              ))}
            </div>
            <input type="number" min="0" max="100" value={discountInput} onChange={e=>setDiscountInput(e.target.value)}
              placeholder="Ali vnesi ročno..." style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, background:T.inputBg, outline:'none', boxSizing:'border-box', marginBottom:12 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{setCartDiscount(0);setDiscountOpen(false)}} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Odstrani</button>
              <button onClick={()=>{setCartDiscount(Number(discountInput)||0);setDiscountOpen(false)}} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Potrdi</button>
            </div>
          </div>
        </Modal>
      )}
      {splitOpen && (
        <Modal open onClose={()=>setSplitOpen(false)} width={480}>
          <ModalHeader title="Razdeli račun" onClose={()=>setSplitOpen(false)}/>
          <div style={{ padding:'16px 20px', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontSize:13, color:T.muted, marginBottom:14 }}>
              Izberi artikle za to osebo, nato klikni Plačaj. Po plačilu se nadaljuje z ostalimi.
            </div>
            <div style={{ marginBottom:12 }}>
              {cart.map((line) => {
                const alreadyPaidQty = splitPaid.filter(p => p.lineId === line.lineId).reduce((s,p)=>s+p.qty,0)
                const availableQty = line.qty - alreadyPaidQty
                const selectedQty = splitQty[line.lineId] || 0
                if (availableQty <= 0) return (
                  <div key={line.lineId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, marginBottom:6, border:'1px solid '+T.line, background:T.surface2, opacity:0.4 }}>
                    <div style={{ flex:1, fontWeight:600, fontSize:13 }}>{line.name}</div>
                    <span style={{ fontSize:11, color:T.accent, fontWeight:700 }}>✓ Plačano</span>
                  </div>
                )
                return (
                  <div key={line.lineId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, marginBottom:6, border:'1px solid '+(selectedQty>0?T.accent:T.line), background:selectedQty>0?T.accentSoft:T.surface }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{line.name}</div>
                      <div style={{ fontSize:11, color:T.muted }}>Na voljo: {availableQty}× {eur(line.price)}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <button onClick={()=>setSplitQty(p=>({...p,[line.lineId]:Math.max(0,(p[line.lineId]||0)-1)}))}
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:16, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                      <div style={{ minWidth:28, textAlign:'center', fontWeight:700, fontSize:15 }}>{selectedQty}</div>
                      <button onClick={()=>setSplitQty(p=>({...p,[line.lineId]:Math.min(availableQty,(p[line.lineId]||0)+1)}))}
                        style={{ width:28, height:28, borderRadius:7, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', fontFamily:'inherit', fontSize:16, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                    </div>
                    <div style={{ fontWeight:700, fontSize:13, minWidth:60, textAlign:'right' }}>{eur(line.price * selectedQty)}</div>
                  </div>
                )
              })}
            </div>
            {(() => {
              const selectedLines = cart.filter(l => (splitQty[l.lineId]||0) > 0).map(l => ({...l, qty: splitQty[l.lineId]}))
              const selectedTotal = selectedLines.reduce((s,l)=>s+l.price*l.qty,0)
              const totalPaidQty = cart.reduce((s,l)=>s+(splitPaid.filter(p=>p.lineId===l.lineId).reduce((ss,p)=>ss+p.qty,0)),0)
              const totalQty = cart.reduce((s,l)=>s+l.qty,0)
              const remaining = cart.filter(l => {
                const paidQty = splitPaid.filter(p=>p.lineId===l.lineId).reduce((s,p)=>s+p.qty,0)
                return l.qty - paidQty - (splitQty[l.lineId]||0) > 0
              })
              return (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:15, marginBottom:12, padding:'10px 12px', background:T.accentSoft, borderRadius:9 }}>
                    <span>Ta oseba plača:</span>
                    <span style={{ color:T.accent }}>{eur(selectedTotal)}</span>
                  </div>
                  {remaining.length > 0 && (
                    <div style={{ fontSize:12, color:T.muted, marginBottom:12, textAlign:'center' }}>
                      Preostalo po plačilu: {eur(remaining.reduce((s,l)=>{
                        const paidQty = splitPaid.filter(p=>p.lineId===l.lineId).reduce((ss,p)=>ss+p.qty,0)
                        return s + l.price*(l.qty-paidQty-(splitQty[l.lineId]||0))
                      },0))}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setSplitOpen(false)} style={{ flex:1, padding:'11px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Prekliči</button>
                    <button disabled={selectedLines.length===0} onClick={()=>{
                      setSplitOpen(false)
                      setPaymentOpen({ discount:cartDiscount, splitLines: selectedLines, onSplitPaid: (paidItems) => {
                        setSplitPaid(p=>[...p,...paidItems.map(l=>({lineId:l.lineId,qty:l.qty}))])
                        setSplitQty({})
                        const allPaid = cart.every(l => {
                          const newPaidQty = [...splitPaid,...paidItems.map(x=>({lineId:x.lineId,qty:x.qty}))].filter(p=>p.lineId===l.lineId).reduce((s,p)=>s+p.qty,0)
                          return newPaidQty >= l.qty
                        })
                        if(allPaid) {
                          setCart([])
                          setSplitPaid([])
                          setSplitQty({})
                        } else {
                          setSplitOpen(true)
                        }
                      }})
                    }} style={{ flex:2, padding:'11px', borderRadius:8, border:'none', background:selectedLines.length?T.accent:'#ccc', color:'#fff', cursor:selectedLines.length?'pointer':'not-allowed', fontFamily:'inherit', fontWeight:700, fontSize:14 }}>
                      Plačaj {eur(selectedTotal)}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}
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
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingModal, setBookingModal] = useState(null) // null | {} | booking obj
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedSpace, setSelectedSpace] = useState('all')

  const hours = Array.from({length:14}, (_, i) => 7 + i) // 7:00 - 20:00
  const HOUR_H = 60 // px per hour
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
  const daysShort = ['Ned','Pon','Tor','Sre','Čet','Pet','Sob']
  const daysFull = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']

  // Terapevti (staff s posebnimi vlogami)
  const therapists = posData.staffList.filter(s => s.role && ['Terapevt','Trener','Lastnik','Fizioterapevt','Trener'].includes(s.role))
  const filteredStaff = selectedStaff === 'all' ? therapists : therapists.filter(s => s.id === selectedStaff)

  // Teden datumi
  const getWeekDates = (d) => {
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay()+6)%7))
    return Array.from({length:7}, (_, i) => { const dd = new Date(mon); dd.setDate(mon.getDate()+i); return dd })
  }
  const weekDates = getWeekDates(currentDate)

  // Naloži rezervacije
  useEffect(() => {
    loadBookings()
  }, [currentDate, view])

  async function loadBookings() {
    setLoading(true)
    let from, to
    if (view === 'day') {
      from = new Date(currentDate); from.setHours(0,0,0,0)
      to = new Date(currentDate); to.setHours(23,59,59,999)
    } else {
      from = new Date(weekDates[0]); from.setHours(0,0,0,0)
      to = new Date(weekDates[6]); to.setHours(23,59,59,999)
    }
    const {data} = await createClient()
      .from('bookings')
      .select('*, customers(id,name,phone,email,customer_packages(id,name,active,remaining,template_id)), staff(id,name,color,role), services(id,name,duration_min,color)')
      .eq('business_id', BUSINESS_ID)
      .gte('start_at', from.toISOString())
      .lte('start_at', to.toISOString())
      .order('start_at', { ascending: true })
    setBookings(data || [])
    setLoading(false)
  }

  function navigate(dir) {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else d.setDate(d.getDate() + dir*7)
    setCurrentDate(d)
  }

  function goToday() { setCurrentDate(new Date()) }

  const isToday = (d) => {
    const t = new Date()
    return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear()
  }

  // Barva po statusu
  const statusStyle = (status) => ({
    scheduled: { bg:'#1f6b3a20', border:'#1f6b3a', text:'#1f6b3a' },
    confirmed:  { bg:'#1f6b3a35', border:'#1f6b3a', text:'#0d2818' },
    arrived:    { bg:'#e9b94930', border:'#b88c28', text:'#7a5c10' },
    no_show:    { bg:'rgba(168,50,50,0.12)', border:'#a83232', text:'#a83232' },
    cancelled:  { bg:'#f4efe5', border:'#d0ccc5', text:'#9a9890' },
  }[status] || { bg:'#e8f4fd', border:'#3b82f6', text:'#1e40af' })

  // Booking pozicija v grid
  function bookingPos(b) {
    const start = new Date(b.start_at)
    const startH = start.getHours() + start.getMinutes()/60
    const topPct = (startH - 7) * HOUR_H
    const height = Math.max((b.duration_min || 60) / 60 * HOUR_H, 24)
    return { top: topPct, height }
  }

  const headerDate = view === 'day'
    ? `${daysFull[currentDate.getDay()]}, ${currentDate.getDate()}. ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : `${weekDates[0].getDate()}. ${months[weekDates[0].getMonth()]} – ${weekDates[6].getDate()}. ${months[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`

  const cols = view === 'day' ? filteredStaff : weekDates

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:T.bg }}>

      {/* Header toolbar */}
      <div style={{ padding:'10px 16px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* Navigacija */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={()=>navigate(-1)} style={{ ...btnS, padding:'6px 10px', fontSize:14 }}>‹</button>
          <button onClick={goToday} style={{ ...btnS, padding:'6px 12px', fontSize:12, fontWeight:700 }}>Danes</button>
          <button onClick={()=>navigate(1)} style={{ ...btnS, padding:'6px 10px', fontSize:14 }}>›</button>
        </div>

        <div style={{ fontSize:14, fontWeight:700, marginLeft:4 }}>{headerDate}</div>

        {/* View toggle */}
        <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:8 }}>
          {[['day','Dan'],['week','Teden']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:700, fontSize:11, background:view===v?T.header:'transparent', color:view===v?T.headerInk:T.ink }}>{l}</button>
          ))}
        </div>

        {/* Filter po terapevtu */}
        {view === 'day' && therapists.length > 1 && (
          <select value={selectedStaff} onChange={e=>setSelectedStaff(e.target.value)}
            style={{ padding:'6px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit', background:T.surface }}>
            <option value="all">Vsi terapevti</option>
            {therapists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <button onClick={()=>setBookingModal({})} style={{ marginLeft:'auto', ...btnP, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <KI name="plus" size={13}/> Nova rezervacija
        </button>
      </div>

      {/* Glavna vsebina */}
      <div style={{ flex:1, overflow:'auto', position:'relative' }}>
        {therapists.length === 0 && view === 'day' ? (
          <div style={{ padding:60, textAlign:'center', color:T.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
            <div style={{ fontSize:13 }}>Dodaj zaposlene z vlogo Terapevt/Trener v <b>Nastavitvah → Zaposleni</b></div>
          </div>
        ) : (
          <div style={{ display:'flex', minWidth: view==='day'?`${56+Math.max(cols.length,1)*180}px`:'900px' }}>

            {/* Ura stolpec */}
            <div style={{ width:52, flexShrink:0, background:T.surface2, borderRight:'1px solid '+T.line, paddingTop:48 }}>
              {hours.map(h=>(
                <div key={h} style={{ height:HOUR_H, borderTop:'1px solid '+T.lineSoft, padding:'3px 6px', fontSize:10, fontWeight:700, color:T.muted, fontVariantNumeric:'tabular-nums' }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Stolpci */}
            <div style={{ flex:1, display:'grid', gridTemplateColumns:`repeat(${Math.max(cols.length,1)}, 1fr)` }}>

              {/* Header vrstica */}
              {(view === 'day' ? filteredStaff : weekDates).map((col, ci) => {
                const isStaff = view === 'day'
                const s = isStaff ? col : null
                const d = isStaff ? null : col
                const todayCol = !isStaff && isToday(d)
                return (
                  <div key={ci} style={{ height:48, background: todayCol?T.accentSoft:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.lineSoft, padding:'8px 10px', display:'flex', alignItems:'center', gap:8, position:'sticky', top:0, zIndex:2 }}>
                    {isStaff ? (
                      <>
                        <div style={{ width:28, height:28, borderRadius:999, background:s.color||T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:10, flexShrink:0 }}>
                          {s.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:12 }}>{s.name}</div>
                          <div style={{ fontSize:9, color:T.muted }}>{s.role}</div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign:'center', width:'100%' }}>
                        <div style={{ fontSize:10, color:T.muted, fontWeight:700 }}>{daysShort[d.getDay()]}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:todayCol?T.accent:T.ink }}>{d.getDate()}</div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Urne celice + rezervacije */}
              {(view === 'day' ? filteredStaff : weekDates).map((col, ci) => {
                const colDate = view === 'day' ? currentDate : col
                const colStaffId = view === 'day' ? col.id : null

                const colBookings = bookings.filter(b => {
                  const bd = new Date(b.start_at)
                  const sameDay = bd.getDate()===colDate.getDate() && bd.getMonth()===colDate.getMonth()
                  const sameStaff = view === 'week' || !colStaffId || b.staff_id === colStaffId
                  return sameDay && sameStaff
                })

                return (
                  <div key={ci} style={{ borderRight:'1px solid '+T.lineSoft, position:'relative', background:T.surface }}>
                    {/* Urne linije */}
                    {hours.map(h=>(
                      <div key={h} style={{ height:HOUR_H, borderTop:'1px solid '+T.lineSoft, cursor:'pointer' }}
                        onClick={()=>{
                          const d = new Date(colDate)
                          d.setHours(h,0,0,0)
                          setBookingModal({ start_at: d.toISOString(), staff_id: colStaffId })
                        }}/>
                    ))}

                    {/* Rezervacije */}
                    {colBookings.map(b => {
                      const {top, height} = bookingPos(b)
                      const ss = statusStyle(b.status)
                      const svc = b.services
                      const cust = b.customers
                      return (
                        <div key={b.id} onClick={()=>setBookingModal(b)}
                          style={{ position:'absolute', top, left:2, right:2, height:height-2, borderRadius:7, background:svc?.color?svc.color+'25':ss.bg, border:'2px solid '+(svc?.color||ss.border), cursor:'pointer', overflow:'hidden', padding:'3px 7px', zIndex:1 }}>
                          <div style={{ fontWeight:700, fontSize:11, color:svc?.color||ss.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {cust?.name || b.customer_name || 'Neznana stranka'}
                          </div>
                          {height > 40 && (
                            <div style={{ fontSize:10, color:T.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {svc?.name || 'Storitev'} · {b.duration_min||60} min
                            </div>
                          )}
                          {height > 55 && b.status === 'no_show' && (
                            <div style={{ fontSize:9, fontWeight:800, color:T.danger }}>⚠️ NI PRIŠEL</div>
                          )}
                        </div>
                      )
                    })}

                    {/* Trenutni čas indikator */}
                    {isToday(colDate) && (() => {
                      const now = new Date()
                      const nowH = now.getHours() + now.getMinutes()/60
                      if (nowH < 7 || nowH > 21) return null
                      return (
                        <div style={{ position:'absolute', top:(nowH-7)*HOUR_H, left:0, right:0, height:2, background:'#ef4444', zIndex:3 }}>
                          <div style={{ position:'absolute', left:-4, top:-4, width:10, height:10, borderRadius:'50%', background:'#ef4444' }}/>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Booking modal */}
      {bookingModal !== null && (
        <BookingModal
          booking={bookingModal}
          posData={posData}
          onClose={()=>setBookingModal(null)}
          onSaved={()=>{ loadBookings(); setBookingModal(null) }}
        />
      )}
    </div>
  )
}

// ─── Booking Modal ─────────────────────────────────────────────
function BookingModal({ booking, posData, onClose, onSaved }) {
  const isNew = !booking.id
  const [data, setData] = useState({
    customer_id: booking.customer_id || '',
    customer_name: booking.customer_name || '',
    staff_id: booking.staff_id || '',
    service_id: booking.service_id || '',
    start_at: booking.start_at ? new Date(booking.start_at).toISOString().slice(0,16) : new Date().toISOString().slice(0,16),
    duration_min: booking.duration_min || 60,
    status: booking.status || 'scheduled',
    note: booking.note || '',
    space_id: booking.space_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [custSearch, setCustSearch] = useState(booking.customer_name || '')
  const [showCustList, setShowCustList] = useState(false)
  const [activePkgs, setActivePkgs] = useState([])
  const [selectedPkg, setSelectedPkg] = useState(booking.customer_package_id || '')
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const therapists = posData.staffList.filter(s => s.role && ['Terapevt','Trener','Lastnik','Fizioterapevt'].includes(s.role))
  const custResults = posData.customers.filter(c =>
    custSearch && c.name.toLowerCase().includes(custSearch.toLowerCase())
  ).slice(0,6)

  // Naloži aktivne pakete stranke
  useEffect(() => {
    if (!data.customer_id) { setActivePkgs([]); return }
    async function load() {
      const {data:pkgs} = await createClient()
        .from('customer_packages')
        .select('*, package_templates(name,template_type)')
        .eq('customer_id', data.customer_id)
        .eq('active', true)
      setActivePkgs(pkgs || [])
    }
    load()
  }, [data.customer_id])

  // Ko izbereš storitev → nastavi trajanje
  useEffect(() => {
    if (!data.service_id) return
    const svc = posData.services.find(s => s.id === data.service_id)
    if (svc?.duration_min) setData(p => ({ ...p, duration_min: svc.duration_min }))
  }, [data.service_id])

  async function save() {
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        customer_id: data.customer_id || null,
        customer_name: custSearch,
        staff_id: data.staff_id || null,
        service_id: data.service_id || null,
        start_at: new Date(data.start_at).toISOString(),
        duration_min: Number(data.duration_min),
        status: data.status,
        note: data.note || null,
        reminder_sent: false,
        is_table: false,
        space_id: data.space_id || null,
      }

      if (isNew) {
        const {error} = await createClient().from('bookings').insert(payload)
        if (error) throw error
      } else {
        const {error} = await createClient().from('bookings').update(payload).eq('id', booking.id)
        if (error) throw error
      }

      // Pošlji email opomnik (12h pred terminom)
      if (data.customer_id && isNew) {
        const cust = posData.customers.find(c => c.id === data.customer_id)
        if (cust?.email) {
          const termDate = new Date(data.start_at)
          const svc = posData.services.find(s => s.id === data.service_id)
          fetch('/api/email/send', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              to: cust.email,
              subject: `Opomnik: ${svc?.name || 'termin'} – ${termDate.toLocaleDateString('sl-SI')}`,
              customerName: cust.name,
              html: `<div style="font-family:Inter,sans-serif;padding:32px 24px;max-width:560px">
                <h2 style="color:#0d2818">Opomnik za termin</h2>
                <p>Spoštovani ${cust.name},</p>
                <p>Opominjamo vas, da imate rezerviran termin:</p>
                <div style="background:#f4efe5;padding:16px;border-radius:10px;margin:16px 0">
                  <b>${svc?.name || 'Termin'}</b><br/>
                  📅 ${termDate.toLocaleDateString('sl-SI', {weekday:'long',day:'numeric',month:'long'})}<br/>
                  ⏰ ${termDate.toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})}
                  ${data.duration_min ? ` · ${data.duration_min} min` : ''}
                </div>
                <p>V primeru odpovedi nas prosimo obvestite vsaj 24 ur vnaprej.</p>
                <p>Lep pozdrav,<br/><b>Ekipa ŠIRM</b></p>
              </div>`
            })
          }).catch(()=>{})
        }
      }

      onSaved()
    } catch(e) { showToast(e.message, false) }
    setSaving(false)
  }

  async function deleteBooking() {
    if (!confirm('Izbrišem to rezervacijo?')) return
    await createClient().from('bookings').delete().eq('id', booking.id)
    onSaved()
  }

  async function markStatus(status) {
    await createClient().from('bookings').update({ status }).eq('id', booking.id)
    // Če "arrived" in ima paket → odštej obisk
    if (status === 'arrived' && selectedPkg) {
      const pkg = activePkgs.find(p => p.id === selectedPkg)
      if (pkg && pkg.remaining > 0) {
        const updates: any = { remaining: pkg.remaining - 1 }
        if (updates.remaining === 0) updates.active = false
        if (!pkg.activated_at && pkg.activation_type === 'first_use') {
          updates.activated_at = new Date().toISOString()
          if (pkg.package_templates?.validity_days) {
            const exp = new Date()
            exp.setDate(exp.getDate() + pkg.package_templates.validity_days)
            updates.expires = exp.toISOString().split('T')[0]
          }
        }
        await createClient().from('customer_packages').update(updates).eq('id', selectedPkg)
        showToast('✓ Obisk zabeležen + odštet iz kartice')
      }
    } else if (status === 'arrived') {
      showToast('✓ Prihod zabeležen')
    }
    onSaved()
  }

  const statusOptions = [
    { id:'scheduled', label:'Načrtovano', color:'#1f6b3a' },
    { id:'confirmed', label:'Potrjeno', color:'#0d2818' },
    { id:'arrived', label:'Prišel/a', color:'#b88c28' },
    { id:'no_show', label:'Ni prišel', color:'#a83232' },
    { id:'cancelled', label:'Preklicano', color:'#9a9890' },
  ]

  return (
    <Modal open onClose={onClose} width={520}>
      <ModalHeader title={isNew ? '📅 Nova rezervacija' : '📅 Uredi rezervacijo'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'80vh', overflowY:'auto' }}>

        {/* Status gumbi (samo za obstoječe) */}
        {!isNew && (
          <div>
            <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Status</label>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {statusOptions.map(s=>(
                <button key={s.id} onClick={()=>markStatus(s.id)}
                  style={{ padding:'6px 12px', borderRadius:7, border:'2px solid '+(data.status===s.id?s.color:T.line), background:data.status===s.id?s.color+'15':'transparent', color:data.status===s.id?s.color:T.muted, fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stranka */}
        <div style={{ position:'relative' }}>
          <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Stranka</label>
          <input value={custSearch} onChange={e=>{setCustSearch(e.target.value);setShowCustList(true);setData(p=>({...p,customer_id:''}))}}
            onFocus={()=>setShowCustList(true)}
            placeholder="Išči stranko..." style={inp}/>
          {showCustList && custResults.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:'1px solid '+T.line, borderRadius:9, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50 }}>
              {custResults.map(c=>(
                <div key={c.id} onClick={()=>{
                  setData(p=>({...p,customer_id:c.id,customer_name:c.name}))
                  setCustSearch(c.name); setShowCustList(false)
                }} style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid '+T.lineSoft }}>
                  <div style={{ width:30, height:30, borderRadius:999, background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>
                    {c.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{c.phone||c.email||'brez kontakta'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aktivni paketi stranke */}
        {activePkgs.length > 0 && (
          <div>
            <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Uporabi kartico (odšteje obisk ob prihodu)</label>
            <select value={selectedPkg} onChange={e=>setSelectedPkg(e.target.value)} style={inp}>
              <option value="">— Brez kartice (plačilo ob obisku) —</option>
              {activePkgs.map(p=>(
                <option key={p.id} value={p.id}>
                  {p.name} {p.remaining!==null?`(${p.remaining} obiskov)`:''} 
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {/* Storitev */}
          <Field label="Storitev">
            <select value={data.service_id} onChange={e=>setData(p=>({...p,service_id:e.target.value}))} style={inp}>
              <option value="">— Izberi storitev —</option>
              {posData.services.map(s=><option key={s.id} value={s.id}>{s.name} ({s.duration_min} min)</option>)}
            </select>
          </Field>

          {/* Terapevt */}
          <Field label="Terapevt / trener">
            <select value={data.staff_id} onChange={e=>setData(p=>({...p,staff_id:e.target.value}))} style={inp}>
              <option value="">— Izberi —</option>
              {therapists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10 }}>
          <Field label="Datum in čas *">
            <input type="datetime-local" value={data.start_at} onChange={e=>setData(p=>({...p,start_at:e.target.value}))} style={inp}/>
          </Field>
          <Field label="Trajanje (min)">
            <input type="number" value={data.duration_min} onChange={e=>setData(p=>({...p,duration_min:e.target.value}))} min="15" step="15" style={inp}/>
          </Field>
        </div>

        <Field label="Opomba">
          <textarea value={data.note} onChange={e=>setData(p=>({...p,note:e.target.value}))} rows={2}
            style={{ ...inp, resize:'vertical' }} placeholder="Posebne zahteve, opomba terapevtu..."/>
        </Field>

        {/* Prostor + Status */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Prostor / ordinacija">
            <select value={data.space_id} onChange={e=>setData(p=>({...p,space_id:e.target.value}))} style={inp}>
              <option value="">— Brez prostora —</option>
              {posData.spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={data.status} onChange={e=>setData(p=>({...p,status:e.target.value}))} style={inp}>
              <option value="scheduled">Načrtovano</option>
              <option value="confirmed">Potrjeno</option>
              <option value="arrived">Prišel/a ✓</option>
              <option value="no_show">Ni prišel ✗</option>
              <option value="cancelled">Preklicano</option>
            </select>
          </Field>
        </div>

        {/* Email opomnik info */}
        {isNew && data.customer_id && posData.customers.find(c=>c.id===data.customer_id)?.email && (
          <div style={{ padding:'8px 12px', background:T.accentSoft, borderRadius:8, fontSize:11, color:T.accent }}>
            📧 Stranka bo prejela email potrditev takoj po shranjevanju
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:4 }}>
          {!isNew ? (
            <button onClick={deleteBooking} style={{ ...btnS, color:T.danger, fontSize:12 }}>🗑 Izbriši</button>
          ) : <div/>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>
              {saving?'Shranjujem...':isNew?'Rezerviraj':'Shrani'}
            </button>
          </div>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </Modal>
  )
}

// ================================================================
const TEMPLATE_TYPES = {
  membership:   { label:'Claenarina',      icon:'inf',  color:'#1f6b3a' },
  visits:       { label:'Karta obiskov',  icon:'target',  color:'#634896' },
  gift_voucher: { label:'Darilni bon',    icon:'gift',  color:'#b88c28' },
  service_bon:  { label:'Storitveni bon', icon:'bell',  color:'#0ea5e9' },
  seasonal:     { label:'Sezonska',       icon:'flower',  color:'#ec4899' },
  time_restrict:{ label:'Casovna',        icon:'clock',  color:'#f97316' },
  group_class:  { label:'Skupinska',      icon:'group',  color:'#8b5cf6' },
  prepaid:      { label:'Predplacilo',    icon:'money',  color:'#14b8a6' },
}
const ACTIVATION_TYPES = {
  purchase:  'Ob nakupu',
  first_use: 'Ob prvem obisku',
  date:      'Na datum',
}
// PS SCREEN
// ================================================================

function PackagesScreen({ posData, setSellPackageModal }) {
  const [filter, setFilter] = React.useState('all')
  const allPkgs = posData.customers.flatMap(c => (c.customer_packages||[]))
  const now = new Date()
  const weekFromNow = new Date(now); weekFromNow.setDate(now.getDate()+7)
  const activeCount = allPkgs.filter(p => p.active).length
  const expiringCount = allPkgs.filter(p => p.active && p.expires && new Date(p.expires) >= now && new Date(p.expires) <= weekFromNow).length
  const expiredCount = allPkgs.filter(p => p.active && p.expires && new Date(p.expires) < now).length
  const filtered = posData.packageTemplates.filter(p => filter === 'all' || (p.template_type||p.type) === filter)
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
          {[{label:'AKTIVNIH',value:activeCount,color:T.accent},{label:'POTEČEJO',value:expiringCount,color:'#b88c28'},{label:'POTEKLE',value:expiredCount,color:T.danger},{label:'PROMET',value:'—',color:T.ink}].map(s=>(
            <div key={s.label} style={{ padding:'12px 16px', borderRadius:11, background:T.surface2, border:'1px solid '+T.line }}>
              <div style={{ fontSize:9, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:6 }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={()=>setFilter('all')} style={{ padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:filter==='all'?T.header:T.face3, color:filter==='all'?T.headerInk:T.ink }}>Vsi</button>
          {Object.entries(TEMPLATE_TYPES).map(([k,v])=>(<button key={k} onClick={()=>setFilter(k)} style={{ padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:filter===k?v.color:T.surface3, color:filter===k?'#fff':T.ink }}>{v.icon} {v.label}</button>))}
        </div>
      </div>
      {posData.packageTemplates.length === 0 ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40 }}>🎫</div>
          <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni paketov</div>
          <div style={{ fontSize:13 }}>Dodaj pakete v Nastavitvah</div>
        </div>
      ) : (
        <div style={{ flex:1, overflow:'auto', padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12, alignContent:'start' }}>
          {filtered.map(p => {
            const ttype = p.template_type || p.type || 'visits'
            const tconf = TEMPLATE_TYPES[ttype] || TEMPLATE_TYPES.visits
            return (<div key={p.id} style={{ background:T.surface, borderRadius:13, border:'1px solid '+T.line, padding:18, display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:tconf.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{tconf.icon}</div>
                <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:800 }}>{p.name}</div><span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:tconf.color+'18', color:tconf.color }}>{tconf.label}</span></div>
              </div>
              <div style={{ fontSize:28, fontWeight:900, color:tconf.color }}>{eur(p.price)}</div>
              {p.description && <div style={{ fontSize:12, color:T.muted, marginTop:6, lineHeight:1.5 }}>{p.description}</div>}
              <div style={{ fontSize:11, color:T.muted, marginTop:10, paddingTop:10, borderTop:'1px solid '+T.lineSoft, display:'flex', flexWrap:'wrap', gap:8 }}>
                {p.validity_days && <span>📅 {p.validity_days} dni</span>}
                {p.visits && <span>🎯 {p.visits}x</span>}
              </div>
              <button onClick={()=>setSellPackageModal(p)} style={{ ...btnP, marginTop:14, justifyContent:'center', background:tconf.color }}>Prodaj stranki</button>
            </div>)
          })}
        </div>
      )}
    </div>
  )
}

// ================================================================
// CUSTOMERS SCREEN — full profile hub
// ================================================================

function CustomersScreen({ posData, setActiveCustomer, setScreen, setSellPackageModal }) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('vse')
  const [selectedId, setSelectedId] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [bulkEmailModal, setBulkEmailModal] = useState(false)
  const [customerPackages, setCustomerPackages] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeTab, setActiveTab] = useState('pregled')
  const [customerStats, setCustomerStats] = useState(null)

  const initials = (name) => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  // Filtriraj stranke
  let filtered = posData.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone||'').includes(search) || (c.email||'').toLowerCase().includes(search.toLowerCase()))
  if (tierFilter !== 'vse') filtered = filtered.filter(c => (c.tier||'regular') === tierFilter)

  const selected = posData.customers.find(c => c.id === selectedId)

  // Fetch customer detail
  useEffect(() => {
    if (!selectedId) return
    setLoadingDetail(true)
    setCustomerStats(null)
    async function load() {
      const [pkgRes, ordRes] = await Promise.all([
        createClient().from('customer_packages')
          .select('*, package_templates(name, template_type, color, validity_days, visits)')
          .eq('customer_id', selectedId)
          .order('active', { ascending: false })
          .order('created_at', { ascending: false }),
        createClient().from('orders')
          .select('id, created_at, payments(amount, method), order_lines(name, qty, unit_price)')
          .eq('customer_id', selectedId)
          .order('created_at', { ascending: false })
          .limit(30),
      ])
      const pkgs = pkgRes.data || []
      const ords = ordRes.data || []
      setCustomerPackages(pkgs)
      setCustomerOrders(ords)

      // Izračunaj statistike
      const totalSpent = ords.reduce((s,o) => s + (o.payments||[]).reduce((ss,p)=>ss+Number(p.amount||0),0), 0)
      const visitCount = pkgs.reduce((s,p) => s + ((p.package_templates?.visits||0) - (p.remaining||0)), 0)
      const lastVisit = ords.length > 0 ? ords[0].created_at : null
      const daysSince = lastVisit ? Math.floor((new Date()-new Date(lastVisit))/86400000) : null
      setCustomerStats({ totalSpent, visitCount, lastVisit, daysSince, orderCount: ords.length })
      setLoadingDetail(false)
    }
    load()
  }, [selectedId])

  const pkgStatusDot = (c) => {
    const pkgs = (c.customer_packages||[]).filter(p=>p.active)
    if (!pkgs.length) return '#9a9890'
    const near = pkgs.some(p => p.expires && Math.floor((new Date(p.expires)-new Date())/86400000)<=7)
    const low = pkgs.some(p => p.remaining!==null && p.remaining<=2)
    if (near||low) return T.warn
    return T.accent
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      {/* Leva lista */}
      <div style={{ width:280, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'10px 10px 8px', borderBottom:'1px solid '+T.line }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.muted }}>{filtered.length} strank</div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>setBulkEmailModal(true)} title="Pošlji email vsem"
                style={{ ...btnS, padding:'5px 8px', fontSize:11 }}>✉️</button>
              <button onClick={()=>setAddModal(true)} style={{ ...btnP, padding:'5px 10px', fontSize:11 }}>+ Nova</button>
            </div>
          </div>
          <div style={{ position:'relative', marginBottom:6 }}>
            <div style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={12}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ime, telefon, email…"
              style={{ width:'100%', padding:'7px 10px 7px 28px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:3 }}>
            {[['vse','Vse'],['regular','Redni'],['silver','Srebro'],['gold','Zlato'],['vip','VIP']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setTierFilter(id)}
                style={{ flex:1, padding:'4px 2px', borderRadius:6, border:'none', background:tierFilter===id?T.header:T.surface3, color:tierFilter===id?T.headerInk:T.muted, fontWeight:700, fontSize:9, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:5 }}>
          {filtered.length === 0 && (
            <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>
              {search ? 'Ni rezultatov' : 'Ni strank'}
            </div>
          )}
          {filtered.map(c => {
            const active = c.id === selectedId
            const activePkgs = (c.customer_packages||[]).filter(p=>p.active)
            const dot = pkgStatusDot(c)
            return (
              <button key={c.id} onClick={()=>{setSelectedId(c.id);setActiveTab('pregled')}}
                style={{ width:'100%', padding:'9px 10px', borderRadius:9, marginBottom:2, background:active?T.accentSoft:'transparent', border:'1px solid '+(active?T.accent:'transparent'), cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:34, height:34, borderRadius:999, background:active?T.accent:T.surface3, color:active?'#fff':T.ink, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11, flexShrink:0, position:'relative' }}>
                  {initials(c.name)}
                  <div style={{ position:'absolute', bottom:0, right:0, width:9, height:9, borderRadius:'50%', background:dot, border:'1.5px solid '+T.surface }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                    {c.tier && c.tier !== 'regular' && <span style={{ fontSize:8, fontWeight:800, padding:'1px 4px', borderRadius:3, background:c.tier==='gold'?'#e9b949':c.tier==='silver'?'#94a3b8':'#a855f7', color:'#fff' }}>{c.tier.toUpperCase()}</span>}
                  </div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:1, display:'flex', gap:6 }}>
                    {activePkgs.length > 0 && <span>{activePkgs.length} aktivnih kart</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desna stran */}
      {!selected ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:8 }}>
          <div style={{ fontSize:36 }}>👤</div>
          <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>Izberi stranko</div>
          <div style={{ fontSize:12 }}>ali dodaj novo s klikom + Nova</div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg }}>
          {/* Header */}
          <div style={{ background:T.surface, borderBottom:'1px solid '+T.line, padding:'14px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
              <div style={{ width:52, height:52, borderRadius:999, background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, flexShrink:0 }}>
                {initials(selected.name)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:20, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>
                  {selected.name}
                  {selected.tier && selected.tier !== 'regular' && (
                    <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:5, background:selected.tier==='gold'?'#e9b94920':selected.tier==='silver'?'#94a3b820':'#a855f720', color:selected.tier==='gold'?'#b88c28':selected.tier==='silver'?'#64748b':'#9333ea' }}>
                      ⭐ {selected.tier.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:12, color:T.muted, marginTop:3, display:'flex', gap:12, flexWrap:'wrap' }}>
                  {selected.phone && <span>📞 {selected.phone}</span>}
                  {selected.email && <span>✉️ {selected.email}</span>}
                  {selected.birth_date && <span>🎂 {new Date(selected.birth_date).toLocaleDateString('sl-SI')}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>{setActiveCustomer(selected);setScreen('packages')}}
                  style={{ ...btnS, padding:'8px 12px', fontSize:12 }}>🎫 Prodaj paket</button>
                <button onClick={()=>{setActiveCustomer(selected);setScreen('sale')}}
                  style={{ ...btnP, padding:'8px 12px', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
                  <KI name="receipt" size={13}/> Nov račun
                </button>
              </div>
            </div>

            {/* Stat kartice */}
            {customerStats && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                {[
                  ['TOČKE', selected.points||0, selected.tier||'Redni'],
                  ['PREDPLAČILO', eur(selected.prepaid||0), Number(selected.prepaid)>0?'na voljo':'brez'],
                  ['OBISKI', customerStats.visitCount, customerStats.daysSince!==null?`zadnji: ${new Date(customerStats.lastVisit).toLocaleDateString('sl-SI')}`:'ni obiskov'],
                  ['PORABLJENO', eur(customerStats.totalSpent), `povp. ${eur(customerStats.orderCount>0?customerStats.totalSpent/customerStats.orderCount:0)}`],
                ].map(([l,v,s])=>(
                  <div key={String(l)} style={{ padding:'10px 12px', background:T.surface2, borderRadius:10, border:'1px solid '+T.line }}>
                    <div style={{ fontSize:9, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{s}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabi */}
            <div style={{ display:'flex', gap:0, borderBottom:'2px solid '+T.line, marginBottom:-14 }}>
              {[
                ['pregled','Pregled'],
                ['kartice','Paketi & predplačilo'+(customerPackages.filter(p=>p.active).length?' '+customerPackages.filter(p=>p.active).length:'')],
                ['zgodovina','Zgodovina'+(customerOrders.length?' '+customerOrders.length:'')],
                ['opombe','Opombe'],
              ].map(([id,lbl])=>(
                <button key={id} onClick={()=>setActiveTab(id)}
                  style={{ padding:'8px 14px', background:'none', border:'none', borderBottom:activeTab===id?'2px solid '+T.accent:'2px solid transparent', marginBottom:-2, cursor:'pointer', fontFamily:'inherit', fontWeight:activeTab===id?700:500, fontSize:12, color:activeTab===id?T.accent:T.muted }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Tab vsebina */}
          <div style={{ flex:1, overflowY:'auto', padding:20 }}>
            {activeTab === 'pregled' && (
              <CustomerOverviewTab customer={selected} orders={customerOrders} packages={customerPackages} loading={loadingDetail} setActiveTab={setActiveTab} setActiveCustomer={setActiveCustomer} setScreen={setScreen}/>
            )}
            {activeTab === 'kartice' && (
              <CustomerPackagesTab customer={selected} packages={customerPackages} posData={posData} loading={loadingDetail}
                onRefresh={()=>setSelectedId(s=>s)} setSellPackageModal={setSellPackageModal} setScreen={setScreen} setActiveCustomer={setActiveCustomer}/>
            )}
            {activeTab === 'zgodovina' && (
              <CustomerHistoryTab orders={customerOrders} loading={loadingDetail}/>
            )}
            {activeTab === 'opombe' && (
              <CustomerNotesTab customer={selected} onSave={()=>posData.refresh()}/>
            )}
            {activeTab === 'klinicno' && (
              <CustomerClinicalTab customer={selected} posData={posData}/>
            )}
          </div>
        </div>
      )}

      {addModal && <AddCustomerModal onClose={()=>setAddModal(false)} onSaved={(id)=>{posData.refresh();setSelectedId(id);setAddModal(false)}}/>}
      {bulkEmailModal && <BulkEmailModal customers={posData.customers} onClose={()=>setBulkEmailModal(false)}/>}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────
function CustomerOverviewTab({ customer, orders, packages, loading, setActiveTab, setActiveCustomer, setScreen }) {
  const activePkgs = packages.filter(p=>p.active)
  const recentOrders = orders.slice(0,3)

  if (loading) return <div style={{ color:T.muted, fontSize:13 }}>Nalagam...</div>

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
      {/* Zadnji obiski */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:18 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>ZADNJI OBISKI</div>
        {recentOrders.length === 0 ? (
          <div style={{ fontSize:13, color:T.muted }}>Ni še nobenih obiskov</div>
        ) : recentOrders.map((o,i) => {
          const total = (o.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0)
          const items = (o.order_lines||[]).map(l=>l.name).join(', ')
          return (
            <div key={o.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:i<recentOrders.length-1?'1px solid '+T.lineSoft:'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{items || 'Račun'}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{new Date(o.created_at).toLocaleDateString('sl-SI')}</div>
              </div>
              <div style={{ fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(total)}</div>
            </div>
          )
        })}
        {orders.length > 3 && (
          <button onClick={()=>setActiveTab('zgodovina')} style={{ ...btnS, width:'100%', marginTop:10, fontSize:12 }}>
            Prikaži vso zgodovino ({orders.length})
          </button>
        )}
      </div>

      {/* Hitri ukrepi */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>HITRI UKREPI</div>
          {[
            ['🎁', 'Dodaj boni / popust', ()=>{}],
            ['💰', 'Polni predplačilo', ()=>setActiveTab('kartice')],
            ['🎫', 'Prodaj paket', ()=>{setActiveCustomer(customer);setScreen('packages')}],
            ['📧', 'Pošlji email', ()=>{}],
          ].map(([icon,lbl,fn])=>(
            <button key={lbl} onClick={fn} style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid '+T.line, background:T.surface2, cursor:'pointer', fontFamily:'inherit', fontSize:13, textAlign:'left', display:'flex', alignItems:'center', gap:10, marginBottom:6, color:T.ink }}>
              <span>{icon}</span> {lbl}
            </button>
          ))}
        </div>

        {activePkgs.length > 0 && (
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>AKTIVNA KARTICA</div>
            {activePkgs.slice(0,1).map(p => {
              const daysLeft = p.expires ? Math.floor((new Date(p.expires)-new Date())/86400000) : null
              const pct = p.total && p.remaining!==null ? p.remaining/p.total : null
              return (
                <div key={p.id}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{p.name}</div>
                  {p.remaining !== null && p.total && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:T.muted, marginBottom:4 }}>
                        <span>{p.remaining} obiskov</span><span style={{ fontWeight:700, fontSize:16, color:'#634896' }}>{p.remaining}/{p.total}</span>
                      </div>
                      <div style={{ height:8, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:((pct||0)*100)+'%', background:'#634896', borderRadius:999 }}/>
                      </div>
                    </>
                  )}
                  {daysLeft !== null && (
                    <div style={{ fontSize:11, color:daysLeft<=7?T.warn:T.muted, marginTop:6 }}>
                      {daysLeft<0?'Poteklo':daysLeft===0?'Poteče danes':`Velja do: ${new Date(p.expires).toLocaleDateString('sl-SI')}`}
                    </div>
                  )}
                </div>
              )
            })}
            {activePkgs.length > 1 && <button onClick={()=>setActiveTab('kartice')} style={{ ...btnS, width:'100%', marginTop:8, fontSize:11 }}>+ {activePkgs.length-1} kartice več</button>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Notes Tab ────────────────────────────────────────────────
function CustomerNotesTab({ customer, onSave }) {
  const [notes, setNotes] = useState(customer.notes||'')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setNotes(customer.notes||''); setSaved(false) }, [customer.id])

  async function save() {
    setSaving(true)
    await createClient().from('customers').update({ notes }).eq('id', customer.id)
    setSaving(false); setSaved(true); onSave()
    setTimeout(()=>setSaved(false),3000)
  }

  return (
    <div style={{ maxWidth:520 }}>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>INTERNE OPOMBE</div>
      <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>Vidno samo vam — alergije, preference, posebnosti</div>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={8}
        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.surface, resize:'vertical', outline:'none', boxSizing:'border-box' }}
        placeholder="Npr: Alergija na lateks. Raje jutranji termini. Kontaktna oseba: mama Ana (+386...)"/>
      <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
        <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani opombe'}</button>
        {saved && <span style={{ fontSize:12, color:T.accent }}>✓ Shranjeno</span>}
      </div>
    </div>
  )
}

// ─── Bulk Email Modal ─────────────────────────────────────────
function BulkEmailModal({ customers, onClose }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState('all') // all | with_email | active_packages
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const targets = customers.filter(c => {
    if (!c.email) return false
    if (filter === 'active_packages') return (c.customer_packages||[]).some(p=>p.active)
    return true
  })

  async function send() {
    if (!subject || !body) return alert('Vnesi zadevo in sporočilo')
    if (!confirm(`Pošlji email ${targets.length} strankam?`)) return
    setSending(true)
    let sent = 0, failed = 0
    for (const c of targets) {
      try {
        const res = await fetch('/api/email/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            to: c.email,
            subject,
            html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
              <h2 style="color:#0d2818">${subject}</h2>
              <div style="font-size:15px;line-height:1.7;color:#444">${body.split(String.fromCharCode(10)).join('<br/>')}</div>
              <hr style="margin:24px 0;border-color:#e5e1d8"/>
              <p style="font-size:12px;color:#999">ŠIRM fitness&bar · Poljanska cesta 87</p>
            </div>`,
          })
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }
      await new Promise(r=>setTimeout(r,200))
    }
    setSending(false)
    setResult({ sent, failed })
  }

  return (
    <Modal open onClose={onClose} width={560}>
      <ModalHeader title="✉️ Pošlji email članom" onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* Prejemniki */}
        <div>
          <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>Prejemniki</label>
          <div style={{ display:'flex', gap:6 }}>
            {[['all','Vse stranke z emailom'],['active_packages','Samo aktivni člani']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setFilter(id)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid '+(filter===id?T.accent:T.line), background:filter===id?T.accentSoft:'transparent', color:filter===id?T.accent:T.ink, fontWeight:filter===id?700:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>📧 {targets.length} prejemnikov</div>
        </div>

        <Field label="Zadeva *">
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Npr: Obvestilo o novem urniku" style={inp}/>
        </Field>

        <Field label="Sporočilo *">
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={8}
            style={{ ...inp, resize:'vertical' }} placeholder="Spoštovani,&#10;&#10;obveščamo vas, da...&#10;&#10;Lep pozdrav,&#10;Ekipa ŠIRM"/>
        </Field>

        {result && (
          <div style={{ padding:'12px 14px', borderRadius:9, background:result.failed>0?'rgba(168,50,50,0.1)':T.accentSoft, color:result.failed>0?T.danger:T.accent, fontSize:13, fontWeight:600 }}>
            ✓ Poslano: {result.sent} · Neuspešno: {result.failed}
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={send} disabled={sending||targets.length===0} style={{ ...btnP, opacity:sending?0.7:1 }}>
            {sending?`Pošiljam... (${targets.length})`:targets.length===0?'Ni prejemnikov':`Pošlji ${targets.length} emailov`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Profile Edit Tab ─────────────────────────────────────────
function CustomerProfileEditTab({ customer, onSave }) {
  const [data, setData] = useState({...customer})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setData({...customer}); setSaved(false) }, [customer.id])
  async function save() {
    setSaving(true)
    try {
      const {error} = await createClient().from('customers').update({
        name: data.name, phone: data.phone||null, email: data.email||null,
        birth_date: data.birth_date||null, address: data.address||null,
        notes: data.notes||null, gender: data.gender||null,
        marketing_consent: !!data.marketing_consent,
        notification_email: data.notification_email !== false,
        tier: data.tier||null,
      }).eq('id', customer.id)
      if (error) throw error
      setSaved(true); onSave()
      setTimeout(()=>setSaved(false), 3000)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }
  return (
    <div style={{ maxWidth:520 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Ime in priimek *"><input value={data?.name||''} onChange={e=>setData(p=>({...p,name:e.target.value}))} style={inp}/></Field>
        <Field label="Spol">
          <select value={data?.gender||''} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
            <option value="">—</option><option value="m">Moški</option><option value="f">Ženski</option><option value="other">Drugo</option>
          </select>
        </Field>
        <Field label="Telefon"><input value={data?.phone||''} onChange={e=>setData(p=>({...p,phone:e.target.value}))} placeholder="+386 41 123 456" style={inp}/></Field>
        <Field label="Datum rojstva"><input type="date" value={data?.birth_date||''} onChange={e=>setData(p=>({...p,birth_date:e.target.value}))} style={inp}/></Field>
        <Field label="Email"><input type="email" value={data?.email||''} onChange={e=>setData(p=>({...p,email:e.target.value}))} placeholder="ana@gmail.com" style={inp}/></Field>
        <Field label="Tip člana">
          <select value={data?.tier||''} onChange={e=>setData(p=>({...p,tier:e.target.value}))} style={inp}>
            <option value="">Redni</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="vip">VIP</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop:12 }}><Field label="Naslov"><input value={data?.address||''} onChange={e=>setData(p=>({...p,address:e.target.value}))} placeholder="Ulica 1, 1000 Ljubljana" style={inp}/></Field></div>
      <div style={{ marginTop:12 }}><Field label="Interne opombe"><textarea value={data?.notes||''} onChange={e=>setData(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical' }} placeholder="Alergije, preference..."/></Field></div>
      <div style={{ display:'flex', gap:20, marginTop:12 }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={data?.notification_email!==false} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>📧 Email obvestila
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={!!data?.marketing_consent} onChange={e=>setData(p=>({...p,marketing_consent:e.target.checked}))} style={{ accentColor:T.accent }}/>📣 Marketing
        </label>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:16, alignItems:'center' }}>
        <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani spremembe'}</button>
        {saved && <span style={{ fontSize:12, color:T.accent, fontWeight:600 }}>✓ Shranjeno</span>}
      </div>
    </div>
  )
}

// ─── Customer Packages Tab ────────────────────────────────────
function CustomerPackagesTab({ customer, packages, posData, loading, onRefresh, setSellPackageModal, setScreen, setActiveCustomer }) {
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast] = useState(null)
  const [prepaidAmount, setPrepaidAmount] = useState('')
  const [addingPrepaid, setAddingPrepaid] = useState(false)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const active = packages.filter(p=>p.active)
  const inactive = packages.filter(p=>!p.active)

  async function useVisit(pkg) {
    if (pkg.remaining !== null && pkg.remaining <= 0) { showToast('Ni več obiskov!', false); return }
    setActionLoading(pkg.id+'_use')
    try {
      const updates: any = {}
      if (pkg.remaining !== null) updates.remaining = pkg.remaining - 1
      if (!pkg.activated_at && pkg.activation_type === 'first_use') {
        const now = new Date()
        updates.activated_at = now.toISOString()
        if (pkg.package_templates?.validity_days) {
          const exp = new Date(now)
          exp.setDate(exp.getDate() + pkg.package_templates.validity_days)
          updates.expires = exp.toISOString().split('T')[0]
        }
      }
      if (updates.remaining === 0) updates.active = false
      const {error} = await createClient().from('customer_packages').update(updates).eq('id', pkg.id)
      if (error) throw error
      showToast('✓ Obisk zabeležen')
      onRefresh()
    } catch(e) { showToast(e.message, false) }
    setActionLoading(null)
  }

  async function toggleFreeze(pkg) {
    setActionLoading(pkg.id+'_freeze')
    try {
      if (pkg.frozen_at) {
        const frozenDays = Math.floor((new Date().getTime()-new Date(pkg.frozen_at).getTime())/86400000)
        let newExpires = pkg.expires
        if (pkg.expires && frozenDays > 0) {
          const exp = new Date(pkg.expires)
          exp.setDate(exp.getDate()+frozenDays)
          newExpires = exp.toISOString().split('T')[0]
        }
        await createClient().from('customer_packages').update({ frozen_at:null, frozen_until:null, expires:newExpires }).eq('id', pkg.id)
        showToast('Kartica odmrznjena. +'+frozenDays+' dni.')
      } else {
        await createClient().from('customer_packages').update({ frozen_at: new Date().toISOString() }).eq('id', pkg.id)
        showToast('Kartica zamrznjena.')
      }
      onRefresh()
    } catch(e) { showToast(e.message, false) }
    setActionLoading(null)
  }

  async function deactivate(pkg) {
    if (!confirm(`Deaktiviram kartico "${pkg.name}"?`)) return
    await createClient().from('customer_packages').update({ active:false }).eq('id', pkg.id)
    showToast('Kartica deaktivirana')
    onRefresh()
  }

  async function addPrepaid() {
    const amount = parseFloat(prepaidAmount)
    if (isNaN(amount) || amount <= 0) return
    setAddingPrepaid(true)
    const newBalance = (Number(customer.prepaid)||0) + amount
    await createClient().from('customers').update({ prepaid: newBalance }).eq('id', customer.id)
    setPrepaidAmount('')
    setAddingPrepaid(false)
    showToast(`✓ Dodano ${eur(amount)} predplačila`)
    onRefresh()
  }

  if (loading) return <div style={{ padding:32, textAlign:'center', color:T.muted }}>Nalagam...</div>

  return (
    <div>
      {/* CTA gumbi */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <button onClick={()=>{setActiveCustomer(customer);setScreen('packages')}} style={{ ...btnP, display:'flex', alignItems:'center', gap:6 }}>🎫 Kupi kartico / paket</button>
        <button onClick={()=>{setActiveCustomer(customer);setScreen('sale')}} style={{ ...btnS, display:'flex', alignItems:'center', gap:6 }}><KI name="receipt" size={13}/> Nova prodaja</button>
      </div>

      {/* Aktivne kartice */}
      {active.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>AKTIVNI PAKETI ({active.length})</div>
          {active.map(pkg => {
            const tc = TEMPLATE_TYPES[pkg.template_type||pkg.package_templates?.template_type]||TEMPLATE_TYPES.visits
            const daysLeft = pkg.expires ? Math.floor((new Date(pkg.expires).getTime()-new Date().getTime())/86400000) : null
            const isFrozen = !!pkg.frozen_at
            const isNear = daysLeft!==null && daysLeft<=7
            const barPct = pkg.total && pkg.remaining!==null ? (pkg.remaining/pkg.total*100) : null
            return (
              <div key={pkg.id} style={{ padding:16, borderRadius:12, marginBottom:10, background:T.surface, border:'2px solid '+(isFrozen?'#94a3b8':isNear?T.warn:tc.color)+'40', opacity:isFrozen?0.75:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:tc.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{tc.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{pkg.name}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{tc.label}{pkg.purchase_price?` · Plačano: ${eur(pkg.purchase_price)}`:''}</div>
                  </div>
                  {pkg.remaining !== null && (
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:22, fontWeight:800, fontVariantNumeric:'tabular-nums', color:pkg.remaining<=2?T.danger:tc.color }}>{pkg.remaining}</div>
                      {pkg.total && <div style={{ fontSize:10, color:T.muted }}>/ {pkg.total} obiskov</div>}
                    </div>
                  )}
                  {isFrozen && <span style={{ fontSize:9, fontWeight:800, background:'#64748b', color:'#fff', padding:'2px 6px', borderRadius:4 }}>❄️ ZAMRZ.</span>}
                </div>
                {barPct !== null && (
                  <div style={{ height:6, borderRadius:999, background:T.surface3, overflow:'hidden', marginBottom:8 }}>
                    <div style={{ height:'100%', width:barPct+'%', background:pkg.remaining<=2?T.danger:tc.color, borderRadius:999 }}/>
                  </div>
                )}
                {pkg.expires && (
                  <div style={{ fontSize:12, color:isNear?T.warn:T.muted, marginBottom:10 }}>
                    {isNear?'⚠️ ':'📅 '}Poteče: {new Date(pkg.expires).toLocaleDateString('sl-SI')}
                    {daysLeft!==null && <span style={{ marginLeft:5 }}>({daysLeft<0?'poteklo':daysLeft===0?'danes':`čez ${daysLeft} dni`})</span>}
                  </div>
                )}
                <div style={{ display:'flex', gap:6 }}>
                  {pkg.remaining !== null && pkg.remaining > 0 && !isFrozen && (
                    <button onClick={()=>useVisit(pkg)} disabled={actionLoading===pkg.id+'_use'} style={{ ...btnP, padding:'7px 12px', fontSize:12, background:tc.color }}>
                      {actionLoading===pkg.id+'_use'?'...':'✓ Uporabi obisk'}
                    </button>
                  )}
                  <button onClick={()=>toggleFreeze(pkg)} disabled={!!actionLoading} style={{ ...btnS, padding:'7px 12px', fontSize:12 }}>
                    {isFrozen?'❄️ Odmrzni':'⏸ Zamrzni'}
                  </button>
                  <button onClick={()=>deactivate(pkg)} style={{ ...btnS, padding:'7px 12px', fontSize:12, color:T.danger }}>Deaktiviraj</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active.length === 0 && (
        <div style={{ padding:32, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line, marginBottom:16 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🎫</div>
          Ni aktivnih kartic. Klikni "Kupi kartico" da prodaš prvo.
        </div>
      )}

      {/* Predplačilo */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>PREDPLAČILO</div>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:10, color:T.muted }}>Trenutno stanje</div>
            <div style={{ fontSize:28, fontWeight:800, color:Number(customer.prepaid)>0?T.accent:T.muted, fontVariantNumeric:'tabular-nums' }}>{eur(customer.prepaid||0)}</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>Stranka lahko z predplačilom plačuje storitve in produkte. Stanje se odbija avtomatsko.</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="number" value={prepaidAmount} onChange={e=>setPrepaidAmount(e.target.value)} placeholder="Znesek €" min="0" step="0.5"
            style={{ width:120, ...inp }}/>
          <button onClick={addPrepaid} disabled={addingPrepaid||!prepaidAmount} style={{ ...btnP, opacity:!prepaidAmount?0.5:1 }}>+ Napolni</button>
        </div>
      </div>

      {/* Pretekle kartice */}
      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>PRETEKLE ({inactive.length})</div>
          {inactive.map(pkg => (
            <div key={pkg.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:T.surface, borderRadius:9, marginBottom:5, opacity:0.55 }}>
              <div style={{ fontSize:14 }}>{(TEMPLATE_TYPES[pkg.template_type||pkg.package_templates?.template_type]||TEMPLATE_TYPES.visits).icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{pkg.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{pkg.expires?`Poteklo: ${new Date(pkg.expires).toLocaleDateString('sl-SI')}`:'Porabljeno'}</div>
              </div>
              {pkg.purchase_price && <div style={{ fontSize:12, color:T.muted }}>{eur(pkg.purchase_price)}</div>}
            </div>
          ))}
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Customer History Tab ─────────────────────────────────────
function CustomerHistoryTab({ orders, loading }) {
  if (loading) return <div style={{ padding:32, textAlign:'center', color:T.muted }}>Nalagam...</div>
  if (orders.length === 0) return (
    <div style={{ padding:32, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
      <div style={{ fontSize:28, marginBottom:8 }}>📋</div>Ni še nobenih nakupov
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>VSI OBISKI IN RAČUNI</div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:T.surface2 }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>DATUM</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>OPIS</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>ZNESEK</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>TIP</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o,i) => {
              const total = (o.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0)
              const method = (o.payments||[])[0]?.method || ''
              const items = (o.order_lines||[]).map(l=>l.name).join(', ')
              const methodIcon = {cash:'💶',card:'💳',bon:'🎫',prep:'💰'}[method]||'💳'
              const isPkg = method === 'bon' || method === 'prep'
              return (
                <tr key={o.id} style={{ borderTop:'1px solid '+T.lineSoft, background:i%2?T.surface2:T.surface }}>
                  <td style={{ padding:'10px 14px', fontSize:12, color:T.muted }}>
                    {new Date(o.created_at).toLocaleDateString('sl-SI')}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600 }}>
                    {items || 'Račun'}
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(total)}</td>
                  <td style={{ padding:'10px 14px', textAlign:'right' }}>
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:isPkg?'rgba(99,72,150,0.12)':T.accentSoft, color:isPkg?'#634896':T.accent, textTransform:'uppercase' }}>
                      {methodIcon} {isPkg?'PAKET':'PLAČILO'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Add Customer Modal ───────────────────────────────────────
function AddCustomerModal({ onClose, onSaved }) {
  const [data, setData] = useState({ name:'', phone:'', email:'', gender:'', notification_email:true })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!data.name.trim()) return alert('Ime je obvezno')
    setSaving(true)
    try {
      const {data:saved, error} = await createClient().from('customers').insert({
        business_id: BUSINESS_ID, name: data.name, phone: data.phone||null,
        email: data.email||null, gender: data.gender||null,
        notification_email: data.notification_email, points:0, prepaid:0, tier:'regular',
      }).select().single()
      if (error) throw error
      onSaved(saved.id)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }
  return (
    <Modal open onClose={onClose} width={420}>
      <ModalHeader title="Nova stranka" onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
        <Field label="Ime in priimek *"><input value={data.name} onChange={e=>setData(p=>({...p,name:e.target.value}))} placeholder="Ana Novak" style={inp} autoFocus/></Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Telefon"><input value={data.phone} onChange={e=>setData(p=>({...p,phone:e.target.value}))} placeholder="+386 41 123 456" style={inp}/></Field>
          <Field label="Spol">
            <select value={data.gender} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
              <option value="">—</option><option value="m">Moški</option><option value="f">Ženski</option>
            </select>
          </Field>
        </div>
        <Field label="Email"><input type="email" value={data.email} onChange={e=>setData(p=>({...p,email:e.target.value}))} placeholder="ana@gmail.com" style={inp}/></Field>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={data.notification_email} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>
          Pošiljaj email obvestila o kartah
        </label>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Dodaj stranko'}</button>
        </div>
      </div>
    </Modal>
  )
}


function DobavnicaImportModal({ posData, onClose, onImported }) {
  const [step, setStep] = React.useState('upload')
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState({})
  const [importing, setImporting] = React.useState(false)
  const [log, setLog] = React.useState([])
  const fileRef = React.useRef(null)

  async function handleFile(f) {
    if (!f || f.type !== 'application/pdf') { setError('Prosim nalozi PDF datoteko'); return }
    setLoading(true); setError('')
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })
      const resp = await fetch('/api/pos/import-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, items: posData.items.map(i => ({ id: i.id, name: i.name })) }),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Napaka') }
      const data = await resp.json()
      setResult(data)
      const sel = {}
      data.artikli?.forEach((a, i) => { sel[i] = true })
      setSelected(sel)
      setStep('preview')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function doImport() {
    setImporting(true)
    const newLog = []
    const sb = createClient()

    // 1. Shrani glavo dobavnice
    let deliveryId = null
    try {
      const selectedArtikli = (result?.artikli || []).filter((_,i) => selected[i])
      const { data: delivery, error: deliveryErr } = await sb.from('deliveries').insert({
        business_id: BUSINESS_ID,
        supplier: result?.dobavitelj || null,
        document_number: result?.stevilka_dokumenta || null,
        document_date: result?.datum || null,
        total_ex_vat: result?.skupaj_brez_ddv || null,
        total_vat: result?.skupaj_ddv || null,
        total_inc_vat: result?.skupaj_z_ddv || null,
      }).select().single()
      if (deliveryErr) throw deliveryErr
      deliveryId = delivery.id

      // 2. Shrani vrstice dobavnice
      if (selectedArtikli.length > 0) {
        const lines = selectedArtikli.map(a => ({
          delivery_id: deliveryId,
          item_id: a.ujemanje_id || null,
          item_name: a.naziv,
          ean: a.ean || null,
          quantity: Number(a.kolicina || 0),
          unit: a.enota || 'kos',
          price_ex_vat: Number(a.cena_brez_ddv || 0),
          discount_pct: Number(a.popust_procent || 0),
          net_price_ex_vat: Number(a.neto_cena_brez_ddv || 0),
          vat_rate: Number(a.ddv_stopnja || 22),
          net_price_inc_vat: Number(a.neto_cena_z_ddv || 0),
          total_ex_vat: Number(a.vrednost_brez_ddv || 0),
          total_inc_vat: Number(a.vrednost_z_ddv || 0),
        }))
        await sb.from('delivery_lines').insert(lines)
      }
    } catch(e) {
      console.error('delivery save error:', e)
    }

    // 3. Posodobi zaloge artiklov
    for (const [idx, artikel] of (result?.artikli || []).entries()) {
      if (!selected[idx]) continue
      try {
        if (artikel.ujemanje_id) {
          const item = posData.items.find(i => i.id === artikel.ujemanje_id)
          const newStock = (item?.stock || 0) + Number(artikel.kolicina || 0)
          await sb.from('items').update({
            stock: newStock,
            cost_price: artikel.neto_cena_brez_ddv || null,
            barcode: artikel.ean || undefined,
          }).eq('id', artikel.ujemanje_id)
          newLog.push({ name: artikel.naziv, ok: true, msg: '+' + artikel.kolicina + ' kos' })
        } else {
          newLog.push({ name: artikel.naziv, ok: false, msg: 'Nov artikel - dodaj rocno' })
        }
      } catch(e) { newLog.push({ name: artikel.naziv, ok: false, msg: e.message }) }
    }
    setLog(newLog); setStep('done'); setImporting(false)
  }

  return (
    <Modal open onClose={onClose} width={580}>
      <ModalHeader title="Uvoz dobavnice (AI)" onClose={onClose}/>
      <div style={{ padding:'20px 22px', maxHeight:'75vh', overflowY:'auto' }}>
        {step === 'upload' && (
          <div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:16 }}>Nalozi PDF dobavnico — AI bo samodejno prepoznal artikle, kolicine in cene.</div>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}}
            style={{ border:'2px dashed '+T.line, borderRadius:12, padding:40, textAlign:'center', cursor:'pointer', background:T.surface2 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>PDF</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Povleci PDF sem ali klikni za izbiro</div>
              <div style={{ fontSize:12, color:T.muted }}>PDF dobavnice ali racuni dobaviteljev</div>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0])}/>
            </div>
            {loading && <div style={{ marginTop:16, padding:'14px 16px', background:T.accentSoft, borderRadius:10, fontSize:13, color:T.accent }}>AI analizira dobavnico...</div>}
            {error && <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(168,50,50,0.1)', borderRadius:9, fontSize:13, color:T.danger }}>{error}</div>}
          </div>
        )}
        {step === 'preview' && result && (
          <div>
            <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:10, marginBottom:16, fontSize:13 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>{result.dobavitelj || 'Neznan dobavitelj'}</div>
              <div style={{ color:T.muted, display:'flex', gap:16 }}>
                {result.datum && <span>{result.datum}</span>}
                {result.stevilka && <span>St: {result.stevilka}</span>}
                {result.skupaj_z_ddv && <span>{eur(result.skupaj_z_ddv)}</span>}
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:10 }}>ARTIKLI ({result.artikli?.length || 0})</div>
            {result.artikli?.map((a, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:selected[i]?T.surface:T.surface3, borderRadius:10, marginBottom:6, border:'1px solid '+T.line, opacity:selected[i]?1:0.55 }}>
                <input type="checkbox" checked={!!selected[i]} onChange={e=>setSelected(p=>({...p,[i]:e.target.checked}))} style={{ accentColor:T.accent, width:16, height:16 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{a.naziv}</div>
                  {a.ujemanje_ime && <div style={{ fontSize:11, color:T.accent }}>= {a.ujemanje_ime}</div>}
                  {!a.ujemanje_id && <div style={{ fontSize:11, color:T.warn }}>Nov artikel - dodaj rocno</div>}
                </div>
                <div style={{ textAlign:'right', fontSize:12 }}>
                  <div style={{ fontWeight:700 }}>{a.kolicina} {a.enota || 'kos'}</div>
                  {a.nabavna_cena && <div style={{ color:T.muted }}>{eur(a.nabavna_cena)}</div>}
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={()=>setStep('upload')} style={btnS}>Nazaj</button>
              <button onClick={doImport} disabled={importing} style={{ ...btnP, opacity:importing?0.7:1 }}>
                {importing ? 'Uvazam...' : 'Uvozi ' + Object.values(selected).filter(Boolean).length + ' artiklov'}
              </button>
            </div>
          </div>
        )}
        {step === 'done' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:16 }}>Uvoz zakljucen</div>
            {log.map((l, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, marginBottom:5, background:l.ok?T.accentSoft:'rgba(168,50,50,0.08)' }}>
                <span>{l.ok ? 'OK' : 'X'}</span>
                <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:600 }}>{l.name}</div><div style={{ fontSize:11, color:T.muted }}>{l.msg}</div></div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={onImported} style={btnP}>Zapri in osvezi</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function InventoryScreen({ posData }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('items')
  const [filter, setFilter] = useState('vse') // vse | nizko | razprodano
  const [sort, setSort] = useState('name') // name | stock | value | sold
  const [selectedItem, setSelectedItem] = useState(null)
  const [salesData, setSalesData] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const [dobavnicaModal, setDobavnicaModal] = useState(false)
  const [deliveries, setDeliveries] = useState([])
  const [deliveriesLoaded, setDeliveriesLoaded] = useState(false)
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [deliveryLines, setDeliveryLines] = useState([])
  const [editModal, setEditModal] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [itemModal, setItemModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [invToast, setInvToast] = useState(null)

  const allItems = posData.items.filter(i => i.item_type !== 'ingredient')
  const allIngredients = posData.ingredients

  // Statistike za header
  const lowStock = allItems.filter(i => i.stock !== null && i.min_stock > 0 && i.stock <= i.min_stock)
  const lowIngr = allIngredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  const totalAlerts = lowStock.length + lowIngr.length
  const totalValueItems = allItems.reduce((s,i) => s + (i.cost_price||0)*(i.stock||0), 0)
  const totalValueIngr = allIngredients.reduce((s,i) => s + (i.cost_price||0)*(i.stock_qty||0), 0)
  const totalValue = totalValueItems + totalValueIngr

  // Filtriraj in sortiraj
  let items = allItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  if (filter === 'nizko') items = items.filter(i => i.stock !== null && i.min_stock > 0 && i.stock <= i.min_stock)
  if (filter === 'razprodano') items = items.filter(i => i.stock !== null && i.stock === 0)
  if (sort === 'stock') items = [...items].sort((a,b) => (a.stock||0)-(b.stock||0))
  else if (sort === 'value') items = [...items].sort((a,b) => ((b.cost_price||0)*(b.stock||0))-((a.cost_price||0)*(a.stock||0)))
  else if (sort === 'sold') items = [...items].sort((a,b) => (salesData[b.id]||0)-(salesData[a.id]||0))
  else items = [...items].sort((a,b) => a.name.localeCompare(b.name))

  let ingredients = allIngredients.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  if (filter === 'nizko') ingredients = ingredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  if (filter === 'razprodano') ingredients = ingredients.filter(i => i.stock_qty !== null && i.stock_qty === 0)

  // Naloži prodajne podatke za sortiranje
  useEffect(() => {
    async function loadSales() {
      const from = new Date(); from.setDate(from.getDate()-30)
      const { data } = await createClient()
        .from('order_lines')
        .select('name, qty, orders!inner(created_at, status)')
        .eq('orders.status', 'paid')
        .gte('orders.created_at', from.toISOString())
      if (!data) return
      const map = {}
      data.forEach(l => {
        const item = posData.items.find(i => i.name === l.name)
        if (item) map[item.id] = (map[item.id]||0) + Number(l.qty||1)
      })
      setSalesData(map)
        {!!selectedDelivery && (
          <Modal open onClose={()=>setSelectedDelivery(null)} width={700}>
            <ModalHeader title={(selectedDelivery.supplier||'Dobavnica')+' — '+(selectedDelivery.document_number||'')} onClose={()=>setSelectedDelivery(null)}/>
            <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
              <div style={{ display:'flex', gap:16, marginBottom:16, fontSize:13, color:T.muted }}>
                <span>Datum: {selectedDelivery.document_date}</span>
                <span>Skupaj: <b style={{ color:T.ink }}>€{Number(selectedDelivery.total_inc_vat||0).toFixed(2)}</b></span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                    {['Artikel','EAN','Kolicina','Cena brez DDV','Popust','Neto cena','DDV%','Vrednost'].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveryLines.length===0 ? (
                    <tr><td colSpan={8} style={{ padding:20, textAlign:'center', color:T.muted }}>Ni vrstic</td></tr>
                  ) : deliveryLines.map((l,i)=>(
                    <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{l.item_name||'—'}</td>
                      <td style={{ padding:'8px 10px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{l.ean||'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700 }}>{l.quantity} {l.unit||'kos'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12 }}>{l.price_ex_vat?'€'+Number(l.price_ex_vat).toFixed(4):'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.discount_pct?Number(l.discount_pct).toFixed(1)+'%':'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, fontSize:12 }}>{l.net_price_ex_vat?'€'+Number(l.net_price_ex_vat).toFixed(4):'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.vat_rate}%</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>{l.total_inc_vat?'€'+Number(l.total_inc_vat).toFixed(2):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
        {invToast && (
          <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:invToast.ok?T.accent:T.danger, color:'#fff', padding:'10px 22px', borderRadius:10, fontWeight:600, fontSize:14, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.18)' }}>
            {invToast.msg}
          </div>
        )}
// ================================================================
    }
    loadSales()
  }, [])

  // Naloži zgodovino cen za izbran artikel
  useEffect(() => {
    if (!selectedItem) return
    async function loadHistory() {
      const { data } = await createClient()
        .from('price_history')
        .select('*')
        .eq('item_id', selectedItem.id)
        .order('recorded_at', { ascending: false })
        .limit(10)
      if (data) setPriceHistory(h => ({ ...h, [selectedItem.id]: data }))
    }
    loadHistory()
  }, [selectedItem])

  // Posodobi nabavno ceno in zapiši v zgodovino
  async function updateCostPrice(item, newPrice) {
    const price = parseFloat(newPrice)
    if (isNaN(price) || price < 0) return
    const db = createClient()
    await db.from('ingredients').update({ cost_price: price }).eq('id', item.id)
    // Zapiši v zgodovino
    await db.from('price_history').insert({
      item_id: item.id,
      item_name: item.name,
      cost_price: price,
      recorded_at: new Date().toISOString(),
      business_id: BUSINESS_ID,
    }).select()
    posData.refresh()
  }

  const margin = (item) => {
    if (!item.cost_price || !item.price) return null
    return ((item.price - item.cost_price) / item.price * 100).toFixed(0)
  }


  const realCategories = posData.categories.filter(c=>c.id!=='cat-fav')
  function showInvToast(msg, ok=true) { setInvToast({msg,ok}); setTimeout(()=>setInvToast(null),3000) }
  async function saveItem() {
    if (!itemModal?.name?.trim()) { showInvToast('Ime je obvezno',false); return }
    const itemType = itemModal?.item_type || 'simple'
    if (itemType !== 'ingredient' && (!itemModal.price || Number(itemModal.price)<=0)) { showInvToast('Prodajna cena mora biti > 0',false); return }
    if (itemModal.vat_rate===undefined || itemModal.vat_rate==='') { showInvToast('DDV stopnja je obvezna',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id:BUSINESS_ID, category_id:itemModal.category_id||null,
        name:itemModal.name, code:itemModal.code||null,
        price:itemModal.price?Number(itemModal.price):0,
        unit:itemModal.unit||'kos', vat_rate:Number(itemModal.vat_rate),
        stock:itemModal.stock!=null&&itemModal.stock!==''?Number(itemModal.stock):null,
        fav:!!itemModal.fav, kitchen:!!itemModal.kitchen, bookable:!!itemModal.bookable,
        duration_min:itemModal.bookable&&itemModal.duration_min?Number(itemModal.duration_min):null,
        item_type: itemType, archived:false,
      }
      let savedId = itemModal.id
      if (itemModal.id) {
        const {error} = await createClient().from('items').update(payload).eq('id',itemModal.id)
        if (error) throw error
      } else {
        const {data, error} = await createClient().from('items').insert(payload).select().single()
        if (error) throw error
        savedId = data.id
      }
      if (itemType === 'recipe' && savedId) {
        await createClient().from('item_ingredients').delete().eq('item_id', savedId)
        const normLines = (itemModal.normativ||[]).filter(n=>n.ingredient_id&&n.qty_used)
        if (normLines.length > 0) {
          const {error} = await createClient().from('item_ingredients').insert(
            normLines.map(n=>({ item_id:savedId, ingredient_id:n.ingredient_id, qty_used:Number(n.qty_used) }))
          )
          if (error) throw error
        }
      }
      setItemModal(null); posData.refresh(); showInvToast(itemModal.id?'Artikel posodobljen':'Artikel dodan')
    } catch(e) { showInvToast(e.message,false) }
    setSaving(false)
  }
  async function deleteItem(id, name) {
    if (!confirm(`Izbrišem artikel "${name}"?`)) return
    await createClient().from('items').update({archived:true}).eq('id',id)
    posData.refresh(); showInvToast('Artikel izbrisan')
  }
  async function saveEdit() {
    if (!editModal) return
    setEditSaving(true)
    try {
      await createClient().from('items').update({
        name: editModal.name || undefined,
        price: editModal.price !== '' ? Number(editModal.price) : undefined,
        stock: editModal.stock !== '' ? Number(editModal.stock) : null,
        low_stock: editModal.min_stock !== '' ? Number(editModal.min_stock) : null,
        cost_price: editModal.cost_price !== '' ? Number(editModal.cost_price) : null,
      }).eq('id', editModal.id)
      posData.refresh(); setEditModal(null)
      setInvToast({msg:'Artikel posodobljen',ok:true}); setTimeout(()=>setInvToast(null),3000)
    } catch(e) {
      setInvToast({msg:e.message,ok:false}); setTimeout(()=>setInvToast(null),3000)
    }
    setEditSaving(false)
  }
  async function exportInventory(items, ingredients) {
    const XLSX = await import('xlsx')
    const date = new Date().toLocaleDateString('sl-SI').replace(/\./g,'-')
    const itemRows = [['Artikel','Sifra','Kategorija','Prod. cena','Nab. cena','Zaloga','Min zaloga','Vrednost','DDV %'],...items.map(i=>[i.name,i.sku||'',i.category||'',i.price||0,i.cost_price||0,i.stock||0,i.min_stock||0,((i.cost_price||0)*(i.stock||0)).toFixed(2),i.vat_rate||22])]
    const ingrRows = [['Surovina','Enota','Nab. cena','Zaloga','Min zaloga','Vrednost'],...ingredients.map(i=>[i.name,i.unit||'',i.cost_price||0,i.stock_qty||0,i.min_stock||0,((i.cost_price||0)*(i.stock_qty||0)).toFixed(2)])]
    const tI = items.reduce((s,i)=>s+(i.cost_price||0)*(i.stock||0),0)
    const tG = ingredients.reduce((s,i)=>s+(i.cost_price||0)*(i.stock_qty||0),0)
    const sumRows = [['INVENTURA'],['Datum:',date],[''],['Artikli',tI.toFixed(2)],['Surovine',tG.toFixed(2)],['SKUPAJ',(tI+tG).toFixed(2)]]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Artikli')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ingrRows), 'Surovine')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Skupaj')
    XLSX.writeFile(wb, 'inventura-'+date+'.xlsx')
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      {dobavnicaModal && <DobavnicaImportModal posData={posData} onClose={()=>setDobavnicaModal(false)} onImported={()=>{posData.refresh();setDobavnicaModal(false)}}/> }

      {/* Header statistike */}
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line }}>
        <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>ZALOGA</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{allItems.length + allIngredients.length} artiklov</div>
          </div>
          {totalAlerts > 0 && (
            <div onClick={()=>setFilter('nizko')} style={{ padding:'8px 14px', borderRadius:9, background:'rgba(168,50,50,0.1)', border:'1px solid rgba(168,50,50,0.2)', cursor:'pointer' }}>
              <div style={{ fontSize:10, color:T.danger, fontWeight:700, textTransform:'uppercase' }}>POD MINIMUM</div>
              <div style={{ fontSize:22, fontWeight:800, color:T.danger }}>{totalAlerts}</div>
              <div style={{ fontSize:11, color:T.danger }}>opozorila</div>
            </div>
          )}
          <div style={{ padding:'8px 14px', borderRadius:9, background:T.surface2, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>VREDNOST</div>
            <div style={{ fontSize:22, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(totalValue)}</div>
            <div style={{ fontSize:11, color:T.muted }}>po nabavni</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={()=>setDobavnicaModal(true)} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:5 }}>Uvozi dobavnico</button>
            <button onClick={()=>exportInventory(allItems,allIngredients)} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
              <KI name="print" size={13}/> Izvozi
            </button>
            <button onClick={()=>setItemModal({vat_rate:9.5,unit:'kos',fav:false,kitchen:false,bookable:false})} style={{ ...btnP, fontSize:12 }}>
              + Nov artikel
            </button>
          </div>
        </div>

        {/* Tabi + filtri */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:9 }}>
            {[['items','Artikli'],['ingredients','Surovine'],['deliveries','Dobavnice']].map(([id,lbl])=>(
              <button key={id} onClick={()=>{setTab(id);setFilter('vse');if(id==='deliveries'&&!deliveriesLoaded){createClient().from('deliveries').select('*').eq('business_id',BUSINESS_ID).order('document_date',{ascending:false}).then(({data})=>{setDeliveries(data||[]);setDeliveriesLoaded(true)})}}} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:tab===id?T.header:'transparent', color:tab===id?T.headerInk:T.ink, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {[['vse','Vse'],['nizko','↓ Pod minimum'],['razprodano','Razprodano']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setFilter(id)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid '+(filter===id?T.accent:T.line), background:filter===id?T.accentSoft:'transparent', color:filter===id?T.accent:T.ink, fontWeight:filter===id?700:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{ padding:'6px 10px', borderRadius:7, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit', background:T.surface, cursor:'pointer' }}>
            <option value="name">A–Z</option>
            <option value="stock">↑ Zaloga</option>
            <option value="value">↑ Vrednost</option>
            <option value="sold">↑ Najbolj prodajano (30d)</option>
          </select>
          <div style={{ position:'relative', flex:1, maxWidth:280 }}>
            <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={13}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči artikel ali šifro…" style={{ width:'100%', padding:'7px 10px 7px 30px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex:1, overflow:'auto' }}>
        {tab === 'items' && (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
              <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {['Artikel','Šifra','Prod. cena','Nab. cena','Stanje','Min','Vrednost','Status','Akcije'].map((h,i)=>(
                  <th key={i} style={{ padding:'11px 12px', textAlign:i>=2&&i<8?'right':i===8?'center':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it,idx)=>{
                const low = it.stock !== null && it.low_stock > 0 && it.stock <= it.low_stock
                const zero = it.stock === 0
                const value = (it.cost_price||0) * (it.stock||0)
                const m = margin(it)
                const sold30 = salesData[it.id] || 0
                return (
                  <tr key={it.id} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{it.name}</div>
                      <div style={{ fontSize:10, color:T.muted, marginTop:2, display:'flex', gap:8 }}>
                        {sold30 > 0 && <span>📦 {sold30}× / 30d</span>}
                        {m !== null && <span style={{ color: Number(m)>50?T.accent:Number(m)>20?T.warn:T.danger }}>marža {m}%</span>}
                      </div>
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{it.code||'—'}</td>
                    <td style={{ ing:'10px 12px', textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums', fontSize:13 }}>{eur(it.price)}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, color:it.cost_price?T.ink:T.muted, fontVariantNumeric:'tabular-nums' }}>{it.cost_price?eur(it.cost_price):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums', color:zero?T.danger:low?T.warn:T.ink }}>
                      {it.stock===null?<span style={{ color:T.muted }}>∞</span>:it.stock}
                      <span style={{ fontSize:10, color:T.muted, fontWeight:400, marginLeft:3 }}>{it.unit||'kos'}</span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:T.muted, fontSize:12, fontVariantNumeric:'tabular-nums' }}>{it.low_stock||'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12, color:value>0?T.ink:T.muted }}>{value>0?eur(value):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, whiteSpace:'nowrap',
                        background: zero?'rgba(168,50,50,0.15)':low?'rgba(184,140,40,0.15)':T.accentSoft,
                        color: zero?T.danger:low?T.warn:T.accent, textTransform:'uppercase' }}>
                        {zero?'Razprodano':low?'Nizka zaloga':'V zalogi'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        <button onClick={()=>setEditModal({ id:it.id, name:it.name, price:it.price??'', stock:it.stock??'', min_stock:it.low_stock??'', cost_price:it.cost_price??'' })}
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✏️</button>
                        <button onClick={()=>setSelectedItem(selectedItem?.id===it.id?null:it)}
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+(selectedItem?.id===it.id?T.accent:T.line), background:selectedItem?.id===it.id?T.accentSoft:T.surface, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>📊</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {items.length===0 && <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni artiklov za izbran filter</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'deliveries' && (
          <div style={{ padding:'0 2px' }}>
            {deliveries.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, fontSize:13 }}>Še ni uvoženih dobavnic</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                    {['Datum','Dobavitelj','Dokument','Brez DDV','DDV','Z DDV'].map((h,i)=>(
                      <th key={i} style={{ padding:'11px 12px', textAlign:i>=3?'right':'left', borderBottom:'1olid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d,idx)=>(
                    <tr key={d.id} onClick={async()=>{setSelectedDelivery(d);const{data}=await createClient().from('delivery_lines').select('*').eq('delivery_id',d.id).order('id');setDeliveryLines(data||[])}} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
                      <td style={{ padding:'10px 12px', fontSize:13 }}>{d.document_date||'—'}</td>
                      <td style={{ padding:'10px 12px', fontWeight:600, fontSize:13 }}>{d.supplier||'—'}</td>
                      <td style={{ padding:'10px 12px', fontSize:12, color:T.muted, fontFamily:'monospace' }}>{d.document_number||'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{d.total_ex_vat?'€'+Number(d.total_ex_vat).toFixed(2):'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums', color:T.muted }}>{d.total_vat?'€'+Number(d.total_vat).toFixed(2):'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums' }}>{d.total_inc_vat?'€'+Number(d.total_inc_vat).toFixed(2):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 'ingredients' && (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
              <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {['Surovina','Enota','Zaloga','Min','Nabavna cena','Vrednost','Status','Akcije'].map((h,i)=>(
                  <th key={i} style={{ padding:'11px 12px', textAlign:i>=2&&i<7?'right':i===7?'center':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ig,idx)=>{
                const low = ig.stock_qty !== null && ig.stock_qty <= (ig.min_stock||0) && ig.min_stock > 0
                const zero = ig.stock_qty === 0
                const value = (ig.cost_price||0) * (ig.stock_qty||0)
                return (
                  <tr key={ig.id} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{ig.name}</div>
                      {ig.supplier && <div style={{ fontSize:11, color:T.muted }}>{ig.supplier}</div>}
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:12, color:T.muted }}>{ig.unit}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums', color:zero?T.danger:low?T.warn:T.ink }}>{ig.stock_qty??'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:T.muted, fontSize:12 }}>{ig.min_stock||'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                        {ig.cost_price ? eur(ig.cost_price) : '—'}
                        <button onClick={async()=>{const p=prompt(`Nova nabavna cena za ${ig.name} (${ig.unit}):`,ig.cost_price||'');if(p!==null)updateCostPrice(ig,p)}}
                          style={{ width:20, height:20, borderRadius:5, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>✏️</button>
                      </div>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums', color:value>0?T.ink:T.muted }}>{value>0?eur(value):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5,
                        background: zero?'rgba(168,50,50,0.15)':low?'rgba(184,140,40,0.15)':T.accentSoft,
                        color: zero?T.danger:low?T.warn:T.accent, textTransform:'uppercase' }}>
                        {zero?'Razprodano':low?'Nizka zaloga':'V zalogi'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>
                      <button onClick={async()=>{const q=prompt(`Nova zaloga za ${ig.name} (${ig.unit}):`,ig.stock_qty);if(q!==null)await createClient().from('ingredients').update({stock_qty:Number(q)}).eq('id',ig.id).then(()=>posData.refresh())}}
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:14 }}>+</button>
                    </td>
                  </tr>
                )
              })}
              {ingredients.length===0 && <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni surovin za izbran filter</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Mini statistika za izbran artikel */}
      {selectedItem && (
        <div style={{ borderTop:'2px solid '+T.accent, background:T.surface, padding:'16px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>📊 {selectedItem.name} — mini statistika</div>
            <button onClick={()=>setSelectedItem(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.muted, fontSize:18 }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              ['Prodano (30d)', salesData[selectedItem.id]||0, 'kos'],
              ['Prihodek (30d)', eur((salesData[selectedItem.id]||0)*selectedItem.price), ''],
              ['Marža', selectedItem.cost_price?margin(selectedItem)+'%':'N/A', ''],
              ['Zaloga vrednost', eur((selectedItem.cost_price||0)*(selectedItem.stock||0)), ''],
            ].map(([l,v,s])=>(
              <div key={String(l)} style={{ padding:'10px 12px', background:T.surface2, borderRadius:9, border:'1px solid '+T.line }}>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                {s && <div style={{ fontSize:11, color:T.muted }}>{s}</div>}
              </div>
            ))}
          </div>
          {/* Zgodovina cen */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Zgodovina nabavnih cen</div>
            {(priceHistory[selectedItem.id]||[]).length === 0 ? (
              <div style={{ fontSize:12, color:T.muted }}>Ni zgodovine cen. Uredi nabavno ceno v Nastavitvah → Sestavine.</div>
            ) : (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {(priceHistory[selectedItem.id]||[]).map((h:any, i:number) => (
                  <div key={i} style={{ padding:'6px 10px', background:T.surface2, borderRadius:7, fontSize:12 }}>
                    <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{eur(h.cost_price)}</span>
                    <span style={{ color:T.muted, marginLeft:6 }}>{new Date(h.recorded_at).toLocaleDateString('sl-SI')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
        {!!editModal && (
          <Modal open onClose={()=>setEditModal(null)} width={440}>
            <ModalHeader title={'Uredi: '+editModal.name} onClose={()=>setEditModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Naziv artikla">
                <input value={editModal.name||''} onChange={e=>setEditModal(p=>({...p,name:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Prodajna cena (EUR)">
                  <input type="number" min="0" step="0.01" value={editModal.price??''} onChange={e=>setEditModal(p=>({...p,price:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
                <Field label="Nabavna cena (EUR)">
                  <input type="number" min="0" step="0.0001" value={editModal.cost_price??''} onChange={e=>setEditModal(p=>({...p,cost_price:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Zaloga">
                  <input type="number" min="0" value={editModal.stock??''} onChange={e=>setEditModal(p=>({...p,stock:e.target.value}))} placeholder="prazno = neomejeno" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
                <Field label="Min. zaloga">
                  <input type="number" min="0" value={editModal.min_stock??''} onChange={e=>setEditModal(p=>({...p,min_stock:e.target.value}))} placeholder="npr. 20" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                <button onClick={()=>setEditModal(null)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Prekliči</button>
                <button onClick={saveEdit} disabled={editSaving} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, opacity:editSaving?0.7:1 }}>{editSaving?'Shranjujem...':'Shrani'}</button>
              </div>
            </div>
          </Modal>
        )}
        {!!selectedDelivery && (
          <Modal open onClose={()=>setSelectedDelivery(null)} width={700}>
            <ModalHeader title={(selectedDelivery.supplier||'Dobavnica')+' - '+(selectedDelivery.document_number||'')} onClose={()=>setSelectedDelivery(null)}/>
            <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
              <div style={{ display:'flex', gap:16, marginBottom:16, fontSize:13, color:T.muted }}>
                <span>Datum: {selectedDelivery.document_date}</span>
                <span>Skupaj z DDV: <b style={{ color:T.ink }}>{Number(selectedDelivery.total_inc_vat||0).toFixed(2)} EUR</b></span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                    {['Artikel','EAN','Kolicina','Cena brez DDV','Popust','Neto cena','DDV%','Vrednost'].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveryLines.length===0 ? (
                    <tr><td colSpan={8} style={{ padding:20, textAlign:'center', color:T.muted }}>Ni vrstic</td></tr>
                  ) : deliveryLines.map((l,i)=>(
                    <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{l.item_name||'-'}</td>
                      <td style={{ padding:'8px 10px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{l.ean||'-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700 }}>{l.quantity} {l.unit||'kos'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12 }}>{l.price_ex_vat ? Number(l.price_ex_vat).toFixed(4)+' EUR' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.discount_pct ? Number(l.discount_pct).toFixed(1)+'%' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, fontSize:12 }}>{l.net_price_ex_vat ? Number(l.net_price_ex_vat).toFixed(4)+' EUR' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.vat_rate}%</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>{l.total_inc_vat ? Number(l.total_inc_vat).toFixed(2)+' EUR' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
        {invToast && (
          <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:invToast.ok?T.accent:T.danger, color:'#fff', padding:'10px 22px', borderRadius:10, fontWeight:600, fontSize:14, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.18)' }}>
            {invToast.msg}
          </div>
        )}
        {!!itemModal && (
          <Modal open onClose={()=>setItemModal(null)} width={520}>
            <ModalHeader title={itemModal?.id?'Uredi artikel':'Nov artikel'} onClose={()=>setItemModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'72vh', overflowY:'auto' }}>
              <Field label="Tip artikla *">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                  {[
                    { id:'simple', label:'Enostaven', desc:'Pivo, vstopnina, kava', icon:'🛍️' },
                    { id:'recipe', label:'Z normativom', desc:'Točeno vino, koktajl', icon:'🧪' },
                    { id:'ingredient', label:'Surovina', desc:'Vino 1L, moka 1kg', icon:'📦' },
                  ].map(t=>{
                    const sel = (itemModal?.item_type||'simple') === t.id
                    return (
                      <div key={t.id} onClick={()=>setItemModal(p=>({...p,item_type:t.id}))} style={{ padding:'10px 8px', borderRadius:9, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface }}>
                        <div style={{ fontSize:20 }}>{t.icon}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:sel?T.accent:T.ink, marginTop:4 }}>{t.label}</div>
                        <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{t.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </Field>
              <Field label="Ime artikla / storitve *">
                <input value={itemModal?.name||''} onChange={e=>setItemModal(p=>({...p,name:e.target.value}))} placeholder="Espresso, Masaža, Vstopnina..." style={inp} autoFocus/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {(itemModal?.item_type||'simple') !== 'ingredient' && (
                  <Field label="Prodajna cena (€) *">
                    <input type="number" step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
                  </Field>
                )}
                {(itemModal?.item_type||'simple') === 'ingredient' && (
                  <Field label="Nabavna cena (€)">
                    <input type="number" step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
                  </Field>
                )}
                <Field label="Enota">
                  <select value={itemModal?.unit||'kos'} onChange={e=>setItemModal(p=>({...p,unit:e.target.value}))} style={inp}>
                    {['kos','dl','cl','ml','L','g','kg','ura','paket','obisk','porcija'].map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="DDV stopnja *">
                  <select value={itemModal?.vat_rate??''} onChange={e=>setItemModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
                    <option value="">— izberi DDV —</option>
                    <option value={0}>0% (oproščeno)</option>
                    <option value={9.5}>9.5% (hrana, pijača)</option>
                    <option value={22}>22% (splošna)</option>
                  </select>
                </Field>
                <Field label="Šifra (koda)">
                  <input value={itemModal?.code||''} onChange={e=>setItemModal(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="K01" style={{...inp,fontFamily:'monospace'}}/>
                </Field>
              </div>
              {(itemModal?.item_type||'simple') !== 'ingredient' && (
                <Field label="Kategorija">
                  <select value={itemModal?.category_id||''} onChange={e=>setItemModal(p=>({...p,category_id:e.target.value||null}))} style={inp}>
                    <option value="">Brez kategorije</option>
                    {realCategories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label={(itemModal?.item_type||'simple')==='ingredient'?'Zaloga v skladišču':'Zaloga (pusti prazno za neomejeno)'}>
                <input type="number" min="0" value={itemModal?.stock??''} onChange={e=>setItemModal(p=>({...p,stock:e.target.value}))} placeholder="∞" style={inp}/>
              </Field>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
                {itemModal?.id && <button onClick={()=>deleteItem(itemModal.id,itemModal.name)} style={{ ...btnS, color:T.danger }}>Izbriši</button>}
                <button onClick={()=>setItemModal(null)} style={btnS}>Prekliči</button>
                <button onClick={saveItem} disabled={saving} style={{ ...btnP, opacity:saving?0.7:1 }}>{saving?'Shranjujem...':'Shrani'}</button>
              </div>
            </div>
          </Modal>
        )}
    </div>
  )
}


// ================================================================
// Z-REPORT MODAL — zaključek izmene
// ================================================================

// ─────────────────────────────────────────────────────────────────
// CASH SESSION HELPERS
// ─────────────────────────────────────────────────────────────────

async function printCashReceipt(html: string) {
  try {
    const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
    if (res.ok) {
      const printRes = await fetch('http://localhost:6789/print/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html })
      })
      if ((await printRes.json()).ok) return
    }
  } catch {}
  const w = window.open('', '_blank', 'width=380,height=700')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

// ─────────────────────────────────────────────────────────────────
// OTVORITEV BLAGAJNE MODAL
// ─────────────────────────────────────────────────────────────────

function OpenCashModal({ posData, auth, onClose, onOpened }) {
  const [cashAmount, setCashAmount] = React.useState('0.00')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  async function handleOpen() {
    const amount = parseFloat(cashAmount)
    if (isNaN(amount) || amount < 0) { setError('Vnesi veljavni znesek'); return }
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      const { session, error: err } = await openSession({
        cashOpening: amount,
        openedBy: user.id,
        note: note || undefined,
      })
      if (err) throw new Error(err)

      // Pridobi session number
      const { data: allSessions } = await db
        .from('cash_sessions')
        .select('id')
        .eq('business_id', '00000000-0000-0000-0000-000000000001')
        .order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session!.id) + 1

      // Org za izpis
      const { data: member } = await createClient().from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const cashierName = user.email?.split('@')[0] || ''

      // Natisni otvoritev
      const html = buildOpeningReceipt({
        session: session!,
        org: org || { name: 'ŠIRM fitness&bar', tax_number: '', vat_registered: false },
        sessionNumber,
        cashierName,
      })
      await printCashReceipt(html)

      onOpened(session)
      onClose()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={360}>
      <ModalHeader title="Otvoritev blagajne" onClose={onClose}/>
      <div style={{ padding:'24px 20px', display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ background:T.accentSoft, borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:12, color:T.accent, fontWeight:700, marginBottom:2 }}>💰 Začetna gotovina</div>
          <div style={{ fontSize:11, color:T.muted }}>Preštej gotovino v blagajni in vnesi znesek</div>
        </div>

        <div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Znesek v blagajni (€)</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cashAmount}
            onChange={e => setCashAmount(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
            autoFocus
          />
        </div>

        <div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Opomba (opcijsko)</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="npr. manjkal drobiž..."
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
          />
        </div>

        {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
          <button onClick={handleOpen} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {saving ? 'Odpiranje...' : '🔓 Odpri blagajno'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// X-POROČILO MODAL (vmesno stanje)
// ─────────────────────────────────────────────────────────────────

function XReportModal({ session, posData, auth, onClose }) {
  const [stats, setStats] = React.useState<SessionStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [printing, setPrinting] = React.useState(false)

  React.useEffect(() => {
    getSessionStats(session).then(s => { setStats(s); setLoading(false) })
  }, [])

  async function handlePrint() {
    if (!stats) return
    setPrinting(true)
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      const { data: member } = user ? await createClient().from('org_members').select('org_id').eq('user_id', user.id).maybeSingle() : { data: null }
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const { data: allSessions } = await createClient().from('cash_sessions').select('id').eq('business_id', '00000000-0000-0000-0000-000000000001').order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session.id) + 1
      const cashierName = user?.email?.split('@')[0] || ''

      const html = buildXReportReceipt({
        session,
        stats,
        org: org || { name: 'ŠIRM fitness&bar', tax_number: '', vat_registered: false },
        sessionNumber,
        cashierName,
      })
      await printCashReceipt(html)
    } catch (e: any) { alert(e.message) }
    setPrinting(false)
  }

  const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',')

  return (
    <Modal open onClose={onClose} width={400}>
      <ModalHeader title="X-poročilo (vmesno stanje)" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:12 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:20, color:T.muted }}>Nalagam...</div>
        ) : stats ? (<>
          <div style={{ background:T.surface, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:T.muted }}>Izmena odprta</div>
            <div style={{ fontSize:13, fontWeight:700 }}>{new Date(session.opened_at).toLocaleString('sl-SI')}</div>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1 }}>Promet po plačilu</div>
          {[['Gotovina', stats.cash, stats.cashCount], ['Kartica', stats.card, stats.cardCount], ['Bon', stats.bon, stats.bonCount]].map(([label, amt, cnt]) => (
            <div key={label as string} style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span>{label as string}</span>
              <span style={{ fontWeight:600 }}>{eur(amt as number)} <span style={{ color:T.muted, fontSize:11 }}>({cnt as number})</span></span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, borderTop:'2px solid '+T.line, paddingTop:8 }}>
            <span>SKUPAJ</span>
            <span>{eur(stats.totalRevenue)}</span>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1, marginTop:4 }}>Pričakovana gotovina</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, background:T.accentSoft, padding:'10px 12px', borderRadius:8 }}>
            <span>V blagajni naj bo:</span>
            <span style={{ color:T.accent }}>{eur(stats.cashExpected)}</span>
          </div>
        </>) : <div style={{ color:T.danger }}>Napaka pri nalaganju</div>}

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={handlePrint} disabled={printing || loading} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {printing ? 'Tiskam...' : '🖨️ Natisni'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// ZAKLJUČEK BLAGAJNE MODAL
// ─────────────────────────────────────────────────────────────────

function CloseCashModal({ session, posData, auth, onClose, onClosed }) {
  const [stats, setStats] = React.useState<SessionStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [cashDeclared, setCashDeclared] = React.useState('0.00')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    getSessionStats(session).then(s => {
      setStats(s)
      setCashDeclared(s.cashExpected.toFixed(2))
      setLoading(false)
    })
  }, [])

  const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',')
  const declared = parseFloat(cashDeclared) || 0
  const expected = stats?.cashExpected || 0
  const difference = declared - expected
  const diffLabel = Math.abs(difference) < 0.01 ? 'Ujema se ✓' : difference > 0 ? `+${eur(difference)} (višek)` : `−${eur(Math.abs(difference))} (manjko)`
  const diffColor = Math.abs(difference) < 0.01 ? T.accent : difference > 0 ? '#2563eb' : T.danger

  async function handleClose() {
    if (!stats) return
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      const { zReportNumber, difference: diff, error: err } = await closeSession({
        session,
        cashClosingDeclared: declared,
        closedBy: user.id,
        note: note || undefined,
      })
      if (err) throw new Error(err)

      // Pridobi org za izpis
      const { data: member } = await createClient().from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const { data: allSessions } = await createClient().from('cash_sessions').select('id').eq('business_id', '00000000-0000-0000-0000-000000000001').order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session.id) + 1
      const cashierName = user.email?.split('@')[0] || ''

      // Natisni Z-poročilo
      const updatedSession = { ...session, closed_at: new Date().toISOString(), closing_note: note }
      const html = buildZReportReceipt({
        session: updatedSession as any,
        stats,
        org: org || { name: 'ŠIRM fitness&bar', tax_number: '', vat_registered: false },
        zReportNumber: zReportNumber!,
        cashierName,
        cashClosingDeclared: declared,
      })
      await printCashReceipt(html)

      // Pošlji email
      const ownerEmail = posData.staffList?.find(s => s.role === 'Lastnik')?.email
      if (ownerEmail || org?.email) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: ownerEmail || org?.email,
            subject: `Z-poročilo #${zReportNumber} — ${new Date().toLocaleDateString('sl-SI')}`,
            html,
          })
        }).catch(() => {})
      }

      setSaved(true)
      setTimeout(() => { onClosed(); onClose() }, 1500)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={420}>
      <ModalHeader title="Zaključek blagajne" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:20, color:T.muted }}>Nalagam...</div>
        ) : saved ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Blagajna zaključena</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Z-poročilo natisnjeno</div>
          </div>
        ) : stats ? (<>
          <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px', fontSize:12, color:T.muted }}>
            Izmena: {new Date(session.opened_at).toLocaleString('sl-SI')} – zdaj
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1 }}>Promet dneva</div>
          {[['Gotovina', stats.cash, stats.cashCount], ['Kartica', stats.card, stats.cardCount], ['Bon', stats.bon, stats.bonCount]].map(([label, amt, cnt]) => (
            <div key={label as string} style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span>{label as string}</span>
              <span style={{ fontWeight:600 }}>{eur(amt as number)} <span style={{ color:T.muted, fontSize:11 }}>({cnt as number})</span></span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, borderTop:'2px solid '+T.line, paddingTop:8 }}>
            <span>SKUPAJ</span><span>{eur(stats.totalRevenue)}</span>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1, marginTop:4 }}>Izračun gotovine</div>
          <div style={{ background:T.surface, borderRadius:8, padding:'10px 12px', fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}><span>Začetna:</span><span>{eur(Number(session.cash_opening))}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between' }}><span>+ Gotovinski računi:</span><span>{eur(stats.cash)}</span></div>
            {stats.refundTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between' }}><span>− Vračila:</span><span>{eur(stats.refundTotal)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'1px solid '+T.line, marginTop:6, paddingTop:6 }}>
              <span>Pričakovano v blagajni:</span><span>{eur(expected)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Prešteto v blagajni (€)</div>
            <input
              type="number" min="0" step="0.01"
              value={cashDeclared}
              onChange={e => setCashDeclared(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
            />
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, padding:'10px 12px', background:'rgba(0,0,0,0.04)', borderRadius:8 }}>
            <span>Razlika:</span>
            <span style={{ color:diffColor }}>{diffLabel}</span>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Opomba (opcijsko)</div>
            <input
              type="text" value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="npr. manjkalo 5€, oddano v sef..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleClose} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.danger, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Zaključujem...' : '🔒 Zaključi blagajno'}
            </button>
          </div>
        </>) : <div style={{ color:T.danger }}>Napaka pri nalaganju</div>}
      </div>
    </Modal>
  )
}

function ZReportModal({ posData, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [cashOpening, setCashOpening] = useState('0')
  const [cashClosing, setCashClosing] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reportNumber, setReportNumber] = useState(1)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const db = createClient()
    const today = new Date()
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    // Naloži naročila danes
    const { data: orders } = await db
      .from('orders')
      .select('id, created_at, payments(amount, method, tip)')
      .eq('business_id', BUSINESS_ID)
      .eq('status', 'paid')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())

    // Naloži vračila danes
    const { data: refunds } = await db
      .from('refunds')
      .select('amount')
      .eq('business_id', BUSINESS_ID)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())

    // Pridobi zadnjo Z-poročilo številko
    const { data: lastZ } = await db
      .from('z_reports')
      .select('report_number')
      .eq('business_id', BUSINESS_ID)
      .order('report_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    setReportNumber((lastZ?.report_number || 0) + 1)

    // Izračuni
    let cash = 0, card = 0, bon = 0, other = 0, tips = 0
    const ords = orders || []

    ords.forEach(o => {
      ;(o.payments || []).forEach(p => {
        const amt = Number(p.amount || 0)
        const tip = Number(p.tip || 0)
        tips += tip
        if (p.method === 'cash') cash += amt
        else if (p.method === 'card') card += amt
        else if (p.method === 'bon') bon += amt
        else other += amt
      })
    })

    const totalRefunds = (refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const totalRevenue = cash + card + bon + other

    setData({
      date: today,
      orderCount: ords.length,
      cash, card, bon, other, tips,
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
    })
    setLoading(false)
  }

  async function closeShift() {
    if (!data) return
    setSaving(true)
    try {
      const db = createClient()

      // Shrani Z-poročilo v DB
      const { data: zReport, error } = await createClient().from('z_reports').insert({
        business_id: BUSINESS_ID,
        report_number: reportNumber,
        opened_at: new Date(data.date.getFullYear(), data.date.getMonth(), data.date.getDate()).toISOString(),
        closed_at: new Date().toISOString(),
        cash_opening: Number(cashOpening),
        cash_closing: Number(cashClosing),
        total_cash: data.cash,
        total_card: data.card,
        total_bon: data.bon,
        total_other: data.other,
        total_revenue: data.totalRevenue,
        total_refunds: data.totalRefunds,
        order_count: data.orderCount,
        sent_to_racunko: false,
      }).select().single()

      if (error) throw error

      // Pošlji email z Z-poročilom na lastnika
      const biz = posData.businessProfile
      const ownerEmail = posData.staffList.find(s => s.role === 'Lastnik')?.email

      if (ownerEmail || biz?.email) {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: ownerEmail || biz?.email,
            subject: `Z-poročilo #${reportNumber} — ${data.date.toLocaleDateString('sl-SI')}`,
            html: buildZReportHTML(data, reportNumber, cashOpening, cashClosing),
          })
        })
      }

      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 2000)
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  function buildZReportHTML(d, num, opening, closing) {
    const dateStr = d.date.toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    return `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8"><title>Z-poročilo #${num}</title></head>
<body style="font-family:monospace;max-width:400px;margin:0 auto;padding:20px;background:#fff;color:#000">
<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
  <div style="font-size:18px;font-weight:bold">ŠIRM fitness&bar</div>
  <div style="font-size:12px">Poljanska cesta 87, 4224 Gorenja vas</div>
  <div style="font-size:12px">ID: ${new Date().getTime()}</div>
</div>
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:16px;font-weight:bold">Z-POROČILO #${num}</div>
  <div style="font-size:12px">${dateStr}</div>
  <div style="font-size:12px">Zaključeno: ${new Date().toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})}</div>
</div>
<div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:10px 0;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between"><span>Gotovina (odprtje):</span><span>${Number(opening).toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Gotovina (zaključek):</span><span>${Number(closing).toFixed(2)} €</span></div>
</div>
<div style="margin-bottom:12px">
  <div style="font-weight:bold;margin-bottom:6px">PLAČILA PO METODAH:</div>
  <div style="display:flex;justify-content:space-between"><span>Gotovina:</span><span>${d.cash.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Kartica:</span><span>${d.card.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Boni:</span><span>${d.bon.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Ostalo:</span><span>${d.other.toFixed(2)} €</span></div>
</div>
<div style="border-top:2px solid #000;padding-top:10px;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between"><span>Skupni promet:</span><span>${d.totalRevenue.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Vračila:</span><span>-${d.totalRefunds.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>NETO PROMET:</span><span>${d.netRevenue.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Število računov:</span><span>${d.orderCount}</span></div>
  <div style="display:flex;justify-content:space-between"><span>Napitnine:</span><span>${d.tips.toFixed(2)} €</span></div>
</div>
<div style="text-align:center;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:10px">
  Generirano: Računko POS · ${new Date().toLocaleString('sl-SI')}
</div>
</body></html>`
  }

  const Row = ({ label, value, bold = false, danger = false }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid '+T.lineSoft }}>
      <span style={{ fontSize:13, color: danger ? T.danger : T.ink, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight: bold ? 800 : 600, fontVariantNumeric:'tabular-nums', color: danger ? T.danger : bold ? T.ink : T.muted }}>{value}</span>
    </div>
  )

  return (
    <Modal open onClose={onClose} width={480}>
      <ModalHeader title={`🖨️ Z-poročilo #${reportNumber} — Zaključek izmene`} onClose={onClose}/>
      <div style={{ padding:'20px 22px', maxHeight:'80vh', overflowY:'auto' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:T.muted }}>Nalagam podatke...</div>
        ) : !data ? null : (
          <>
            <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:10, marginBottom:16, fontSize:13, color:T.accent, fontWeight:600 }}>
              📅 {data.date.toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </div>

            {/* Gotovina */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>STANJE BLAGAJNE</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Gotovina ob odprtju (€)">
                  <input type="number" value={cashOpening} onChange={e=>setCashOpening(e.target.value)} min="0" step="0.01" style={inp}/>
                </Field>
                <Field label="Gotovina ob zaključku (€)">
                  <input type="number" value={cashClosing} onChange={e=>setCashClosing(e.target.value)} min="0" step="0.01" style={inp}/>
                </Field>
              </div>
            </div>

            {/* Plačila */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>PLAČILA PO METODAH</div>
              <div style={{ background:T.surface, borderRadius:10, border:'1px solid '+T.line, padding:'4px 14px' }}>
                <Row label="💶 Gotovina" value={eur(data.cash)}/>
                <Row label="💳 Kartica" value={eur(data.card)}/>
                <Row label="🎫 Boni / paketi" value={eur(data.bon)}/>
                <Row label="💰 Ostalo" value={eur(data.other)}/>
              </div>
            </div>

            {/* Skupaj */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>SKUPAJ</div>
              <div style={{ background:T.surface, borderRadius:10, border:'1px solid '+T.line, padding:'4px 14px' }}>
                <Row label="Skupni promet" value={eur(data.totalRevenue)}/>
                <Row label="Vračila" value={`-${eur(data.totalRefunds)}`} danger={data.totalRefunds > 0}/>
                <Row label="Napitnine" value={eur(data.tips)}/>
                <Row label="Število računov" value={data.orderCount}/>
                <Row label="NETO PROMET" value={eur(data.netRevenue)} bold/>
              </div>
            </div>

            {/* Razlika v gotovini */}
            {cashClosing !== '0' && (
              <div style={{ padding:'10px 14px', borderRadius:9, marginBottom:16, background: Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01 ? T.accentSoft : 'rgba(184,140,40,0.1)', border:'1px solid '+(Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01 ? T.accent : T.warn) }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01
                    ? '✅ Gotovina se ujema'
                    : `⚠️ Razlika v gotovini: ${eur(Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash))}`
                  }
                </div>
              </div>
            )}

            <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>
              📧 Z-poročilo bo avtomatsko poslano na email lastnika in shranjeno v bazi.
            </div>

            {saved && (
              <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:9, marginBottom:12, fontSize:13, fontWeight:700, color:T.accent }}>
                ✅ Z-poročilo #${reportNumber} shranjeno in poslano!
              </div>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={onClose} style={btnS}>Prekliči</button>
              <button onClick={closeShift} disabled={saving || saved} style={{ ...btnP, opacity:saving?0.7:1 }}>
                {saving ? 'Zaključujem...' : saved ? '✓ Zaključeno' : `🖨️ Zaključi izmeno #${reportNumber}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}


// ================================================================
// ORDERS SCREEN — pregled računov
// ================================================================

// ─────────────────────────────────────────────────────────────────
// STORNO MODAL
// ─────────────────────────────────────────────────────────────────

function VoidModal({ order, lines, payment, posData, auth, onClose, onVoided }) {
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  async function handleVoid() {
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      // 1. Pridobi org podatke za FURS klic
      const { data: member } = await createClient().from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) throw new Error('Org ni najdena')

      // 2. Kliči FURS kredit nota (storno)
      const fursRes = await fetch('/api/furs/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          total: order.total,
          original_eor: payment?.furs_eor,
          reason,
        })
      })
      const fursData = await fursRes.json().catch(() => ({}))

      // 3. Označi order kot storniran
      await createClient().from('orders').update({
        voided_at: new Date().toISOString(),
        voided_by: user.id,
        void_reason: reason || 'Storno',
        void_furs_eor: fursData.eor || null,
        void_furs_zoi: fursData.zoi || null,
        status: 'voided',
      }).eq('id', order.id)

      // 4. Natisni storno račun
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const cashierName = user.email?.split('@')[0] || ''
      const html = buildStornoReceiptHTML({
        order, lines, payment, org, cashierName,
        voidEor: fursData.eor,
        voidZoi: fursData.zoi,
        reason: reason || 'Storno',
      })
      const w = window.open('', '_blank', 'width=380,height=700')
      if (w) { w.document.write(html); w.document.close() }

      setDone(true)
      setTimeout(() => { onVoided(); onClose() }, 1500)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={400}>
      <ModalHeader title="Storno računa" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Račun storniran</div>
          </div>
        ) : (<>
          <div style={{ background:'rgba(168,50,50,0.08)', border:'1px solid rgba(168,50,50,0.2)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.danger, marginBottom:4 }}>⚠️ Pozor — storno je nepovraten</div>
            <div style={{ fontSize:12, color:T.muted }}>Stornira se celoten račun #{order.number || order.id.slice(-6)} za €{Number(order.total).toFixed(2)}. Stranki se vrne celoten znesek.</div>
          </div>

          <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Artikli na računu:</div>
            {lines.map(l => (
              <div key={l.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'2px 0', color:T.muted }}>
                <span>{l.name} × {l.qty}</span>
                <span>€{(Number(l.qty)*Number(l.unit_price)).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, borderTop:'1px solid '+T.line, marginTop:6, paddingTop:6 }}>
              <span>Skupaj:</span><span>€{Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Razlog storna</div>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="npr. napačna naročba, zahteva stranke..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleVoid} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.danger, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Storniram...' : '🗑️ Potrdi storno'}
            </button>
          </div>
        </>)}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// VRAČILO MODAL (delno)
// ─────────────────────────────────────────────────────────────────

function RefundModal({ order, lines, payment, auth, onClose, onRefunded }) {
  const [selectedLines, setSelectedLines] = React.useState<string[]>([])
  const [customAmount, setCustomAmount] = React.useState('')
  const [mode, setMode] = React.useState<'lines'|'custom'>('lines')
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  const selectedTotal = lines
    .filter(l => selectedLines.includes(l.id))
    .reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0)

  const refundAmount = mode === 'lines'
    ? selectedTotal
    : parseFloat(customAmount) || 0

  function toggleLine(id: string) {
    setSelectedLines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleRefund() {
    if (refundAmount <= 0) { setError('Znesek vračila mora biti večji od 0'); return }
    if (refundAmount > Number(order.total)) { setError('Znesek ne sme presegati skupaj računa'); return }
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      await createClient().from('refunds').insert({
        business_id: '00000000-0000-0000-0000-000000000001',
        original_order_id: order.id,
        amount: refundAmount,
        reason: reason || 'Delno vračilo',
        cashier_id: user.id,
        refunded_at: new Date().toISOString(),
      })

      // Natisni vračilo
      const html = buildRefundReceiptHTML({
        order, refundAmount,
        reason: reason || 'Delno vračilo',
        cashierName: user.email?.split('@')[0] || '',
      })
      const w = window.open('', '_blank', 'width=380,height=600')
      if (w) { w.document.write(html); w.document.close() }

      setDone(true)
      setTimeout(() => { onRefunded(); onClose() }, 1500)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={420}>
      <ModalHeader title="Delno vračilo" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Vračilo zabeleženo</div>
            <div style={{ fontSize:13, color:T.muted, marginTop:4 }}>€{refundAmount.toFixed(2)}</div>
          </div>
        ) : (<>
          {/* Način */}
          <div style={{ display:'flex', gap:8 }}>
            {(['lines', 'custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'8px', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, border:'1px solid '+T.line, background: mode===m ? T.accent : 'transparent', color: mode===m ? '#fff' : T.text }}>
                {m === 'lines' ? '📋 Po artiklih' : '✏️ Ročni znesek'}
              </button>
            ))}
          </div>

          {mode === 'lines' ? (
            <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Izberi artikle za vračilo:</div>
              {lines.map(l => {
                const lineTotal = Number(l.qty) * Number(l.unit_price)
                const selected = selectedLines.includes(l.id)
                return (
                  <div key={l.id} onClick={() => toggleLine(l.id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <div style={{ width:18, height:18, borderRadius:4, border:'1.5px solid '+(selected?T.accent:T.line), background:selected?T.accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12 }}>
                        {selected ? '✓' : ''}
                      </div>
                      <span style={{ fontSize:13 }}>{l.name} × {l.qty}</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight:600 }}>€{lineTotal.toFixed(2)}</span>
                  </div>
                )
              })}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, marginTop:8, paddingTop:8, borderTop:'1px solid '+T.line }}>
                <span>Vračilo:</span><span style={{ color:T.accent }}>€{selectedTotal.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Znesek vračila (€)</div>
              <input
                type="number" min="0.01" step="0.01" max={order.total}
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder={`Max: €${Number(order.total).toFixed(2)}`}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
                autoFocus
              />
            </div>
          )}

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Razlog vračila</div>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="npr. napaka pri naročilu, nezadovoljstvo..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {refundAmount > 0 && (
            <div style={{ background:T.accentSoft, borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700 }}>
              <span>Vračilo stranki:</span>
              <span style={{ color:T.accent }}>€{refundAmount.toFixed(2)}</span>
            </div>
          )}

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleRefund} disabled={saving || refundAmount <= 0} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background: refundAmount > 0 ? T.accent : T.line, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Shranjujem...' : `↩️ Vrni €${refundAmount.toFixed(2)}`}
            </button>
          </div>
        </>)}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// STORNO RAČUN HTML (termalni format)
// ─────────────────────────────────────────────────────────────────

function buildStornoReceiptHTML({ order, lines, payment, org, cashierName, voidEor, voidZoi, reason }) {
  const eur = n => '€' + Number(n).toFixed(2).replace('.', ',')
  const addr = [org?.address, [org?.post_code, org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>STORNO #${order.number}</title>
<style>@page{size:80mm auto;margin:0}body{font-family:monospace;font-size:11px;line-height:1.4;color:#000;background:#fff;margin:0;padding:8mm 4mm;max-width:80mm}.c{text-align:center}.b{font-weight:700}.l{border-top:1px dashed #000;margin:6px 0}.dl{border-top:2px solid #000;margin:6px 0}.r{display:flex;justify-content:space-between}.s{font-size:10px;color:#444}.footer{text-align:center;font-size:10px;margin-top:8px}.brand{font-weight:700;letter-spacing:4px;font-size:11px}</style>
</head><body>
<div class="c">
  <div class="b" style="font-size:14px">${org?.name || 'ŠIRM fitness&bar'}</div>
  ${addr ? `<div class="s">${addr}</div>` : ''}
  ${org?.tax_number ? `<div class="s">Davčna št.: ${org.tax_number}</div>` : ''}
  ${org?.vat_registered ? `<div class="s">ID za DDV: SI${org.tax_number}</div>` : ''}
</div>
<div class="l"></div>
<div class="c b" style="font-size:13px;color:#a83232">⚠️ STORNO RAČUN</div>
<div class="c s" style="color:#a83232">Originalni račun je razveljavljen</div>
<div class="l"></div>
<div class="r"><span>Storno računa:</span><span class="b">#${order.number || order.id.slice(-6)}</span></div>
<div class="r"><span>Datum:</span><span>${new Date().toLocaleString('sl-SI')}</span></div>
<div class="r"><span>Blagajnik:</span><span>${cashierName}</span></div>
<div class="r"><span>Razlog:</span><span>${reason}</span></div>
<div class="l"></div>
${lines.map(l => `
<div class="r"><span>${l.name}</span><span>-${eur(Number(l.qty)*Number(l.unit_price))}</span></div>
<div class="r s"><span>  ${l.qty} × ${eur(l.unit_price)}</span><span></span></div>
`).join('')}
<div class="dl"></div>
<div class="r b" style="font-size:13px"><span>VRAČILO:</span><span style="color:#a83232">-${eur(order.total)}</span></div>
<div class="dl"></div>
${voidEor ? `
<div class="l"></div>
<div class="s">ZOI: ${voidZoi || '—'}</div>
<div class="s">EOR: ${voidEor}</div>
<div class="c b s" style="margin-top:4px">✓ Davčno potrjeno</div>
` : `<div class="c s" style="color:#a83232">FURS potrjevanje ni uspelo</div>`}
<div class="l"></div>
<div class="c">Hvala za razumevanje!</div>
<div class="l"></div>
<div class="footer">
  <div>⚡ Izdano s sistemom</div>
  <div class="brand">RAČUNKO</div>
  <div>AI knjigovodstvo za s.p.</div>
  <div style="font-weight:700">www.računko.si</div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();setTimeout(function(){window.close()},1500)},100)})</script>
</body></html>`
}

// ─────────────────────────────────────────────────────────────────
// VRAČILO POTRDILO HTML
// ─────────────────────────────────────────────────────────────────

function buildRefundReceiptHTML({ order, refundAmount, reason, cashierName }) {
  const eur = n => '€' + Number(n).toFixed(2).replace('.', ',')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vračilo #${order.number}</title>
<style>@page{size:80mm auto;margin:0}body{font-family:monospace;font-size:11px;line-height:1.4;color:#000;background:#fff;margin:0;padding:8mm 4mm;max-width:80mm}.c{text-align:center}.b{font-weight:700}.l{border-top:1px dashed #000;margin:6px 0}.dl{border-top:2px solid #000;margin:6px 0}.r{display:flex;justify-content:space-between}.s{font-size:10px;color:#444}.footer{text-align:center;font-size:10px;margin-top:8px}.brand{font-weight:700;letter-spacing:4px;font-size:11px}</style>
</head><body>
<div class="c b" style="font-size:14px">POTRDILO O VRAČILU</div>
<div class="l"></div>
<div class="r"><span>Orig. račun:</span><span class="b">#${order.number || order.id.slice(-6)}</span></div>
<div class="r"><span>Datum:</span><span>${new Date().toLocaleString('sl-SI')}</span></div>
<div class="r"><span>Blagajnik:</span><span>${cashierName}</span></div>
<div class="r"><span>Razlog:</span><span>${reason}</span></div>
<div class="dl"></div>
<div class="r b" style="font-size:14px"><span>VRAČILO:</span><span style="color:#2563eb">${eur(refundAmount)}</span></div>
<div class="dl"></div>
<div class="c" style="margin-top:8px">Hvala za razumevanje!</div>
<div class="l"></div>
<div class="footer">
  <div>⚡ Izdano s sistemom</div>
  <div class="brand">RAČUNKO</div>
  <div style="font-weight:700">www.računko.si</div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();setTimeout(function(){window.close()},1500)},100)})</script>
</body></html>`
}

function OrdersScreen({ posData, auth }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [orderPayment, setOrderPayment] = useState(null)
  const [period, setPeriod] = useState('today')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10))
  const [showVoid, setShowVoid] = React.useState(false)
  const [showRefund, setShowRefund] = React.useState(false)

  // Preveri ali je račun od danes
  function isToday(dateStr) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
  }

  const METHOD_LABELS = { cash:'Gotovina', card:'Kartica', bon:'Bon', prep:'Predplačilo', split:'Deljeno' }

  async function loadOrders() {
    setLoading(true)
    const sb = createClient()
    let fromDate, toDate
    const now = new Date()
    if (period === 'today') {
      fromDate = new Date(); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'week') {
      fromDate = new Date(); fromDate.setDate(now.getDate()-7); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'month') {
      fromDate = new Date(); fromDate.setDate(1); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'custom') {
      fromDate = new Date(dateFrom + 'T00:00:00')
      toDate = new Date(dateTo + 'T23:59:59')
    } else {
      fromDate = new Date('2020-01-01')
      toDate = new Date()
    }

    let q = sb
      .from('orders')
      .select('*, payments(method, amount, furs_zoi, furs_eor, paid_at)')
      .eq('business_id', BUSINESS_ID)
      .eq('status', 'paid')
      .order('closed_at', { ascending: false })
      .limit(500)

    if (period !== 'all') {
      q = q.gte('closed_at', fromDate.toISOString()).lte('closed_at', toDate.toISOString())
    }

    const { data, error } = await q
    setOrders(data || [])
    setLoading(false)
  }

  async function loadOrderDetail(order) {
    setSelectedOrder(order)
    const sb = createClient()
    const { data: lines } = await sb.from('order_lines').select('*').eq('order_id', order.id).order('id')
    setOrderLines(lines || [])
    setOrderPayment(order.payments?.[0] || null)
  }

  useEffect(() => { if(period !== 'custom') loadOrders() }, [period])

  const filtered = orders.filter(o =>
    !search || String(o.number).includes(search) ||
    (o.payments?.[0]?.furs_eor || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalFiltered = filtered.reduce((s,o) => s + Number(o.total||0), 0)

  async function printReceipt(order, lines, payment) {
    // Pridobi org + premise + cashier za glavo računa
    let orgData = null
    let premiseData = null
    let deviceData = null
    let cashierName = ''

    try {
      const { data: { user } } = await db.auth.getUser()
      if (user) {
        const { data: member } = await db.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
        if (member) {
          const { data: org } = await db.from('organizations').select('*').eq('id', member.org_id).single()
          orgData = org

          const { data: premise } = await db.from('business_premises')
            .select('*').eq('org_id', member.org_id).eq('is_active', true).limit(1).maybeSingle()
          premiseData = premise

          if (premise) {
            const { data: device } = await db.from('electronic_devices')
              .select('*').eq('premise_id', premise.id).eq('is_active', true).maybeSingle()
            deviceData = device
          }
        }

        // Cashier ime
        if (payment?.cashier_id) {
          const { data: cashUser } = await db.from('org_members')
            .select('display_name, user_id')
            .eq('user_id', payment.cashier_id)
            .maybeSingle()
          cashierName = cashUser?.display_name || ''
        }
        if (!cashierName) {
          const { data: me } = await db.from('org_members')
            .select('display_name')
            .eq('user_id', user.id)
            .maybeSingle()
          cashierName = me?.display_name || user.email?.split('@')[0] || ''
        }
      }
    } catch (e) {}

    // Poskusi lokalni print server
    try {
      const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        const printData = {
          business_name: orgData?.name || 'ŠIRM fitness&bar',
          business_address: [orgData?.address, [orgData?.post_code, orgData?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          tax_number: orgData?.tax_number || '',
          vat_id: orgData?.vat_registered ? `SI${orgData.tax_number}` : '',
          receipt_number: order.invoice_number || order.number || order.id.slice(-6),
          cashier: cashierName,
          date: new Date(order.closed_at).toLocaleString('sl-SI'),
          items: (lines||[]).map(l => ({
            name: l.name,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price),
            vat_rate: Number(l.vat_rate || 22),
          })),
          subtotal: Number(order.subtotal),
          discount_pct: Number(order.discount_pct||0),
          discount_amount: Number(order.discount_amount||0),
          tip: Number(order.tip_amount||0),
          total: Number(order.total),
          payment_method: payment?.method,
          furs_zoi: payment?.furs_zoi,
          furs_eor: payment?.furs_eor,
        }
        const printRes = await fetch('http://localhost:6789/print/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(printData)
        })
        const result = await printRes.json()
        if (result.ok) return
        alert('Napaka tiskalnika: ' + result.error)
        return
      }
    } catch (e) {}

    // Fallback: browser print z lib/receipt.ts helperjem
    try {
      const html = await buildReceiptHTML({
        org: orgData || {
          name: 'ŠIRM fitness&bar',
          tax_number: '',
          vat_registered: false,
        },
        premiseId: premiseData?.premise_id || 'SIRBFB01',
        deviceId: deviceData?.device_id || 'RACUNK001',
        invoiceNumber: order.invoice_number || order.number || order.id.slice(-6),
        issueDate: new Date(order.closed_at),
        cashierName: cashierName,
        payment: {
          method: payment?.method || 'cash',
          furs_zoi: payment?.furs_zoi,
          furs_eor: payment?.furs_eor,
        },
        lines: (lines||[]).map(l => ({
          name: l.name,
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
          vat_rate: Number(l.vat_rate || 22),
          total: Number(l.total || l.qty * l.unit_price),
          voided: l.voided,
        })),
        subtotal: Number(order.subtotal||0),
        discountAmount: Number(order.discount_amount||0),
        tip: Number(order.tip_amount||0),
        total: Number(order.total||0),
      })
      const w = window.open('', '_blank', 'width=400,height=700')
      if (!w) return
      w.document.write(html)
      w.document.close()
    } catch (e) {
      console.error('Receipt print error:', e)
      alert('Napaka pri izpisu računa: ' + e.message)
    }
  }

  return (
    <div style={{ display:'flex', height:'100%', gap:0 }}>
      {/* Seznam */}
      <div style={{ width: selectedOrder ? 400 : '100%', borderRight: selectedOrder ? '1px solid '+T.line : 'none', display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid '+T.line, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Računi</div>
          <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
            {[['today','Danes'],['week','Teden'],['month','Mesec'],['custom','Po meri'],['all','Vse']].map(([id,lbl])=>(
              <button key={id} onClick={()=>{setPeriod(id)}} style={{ padding:'5px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:period===id?T.accent:'transparent', color:period===id?'#fff':T.muted }}>
                {lbl}
              </button>
            ))}
            {period==='custom' && (
              <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:4 }}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{ padding:'4px 8px', borderRadius:7, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
                <span style={{ color:T.muted, fontSize:12 }}>—</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{ padding:'4px 8px', borderRadius:7, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
                <button onClick={loadOrders} style={{ padding:'4px 10px', borderRadius:7, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>Išči</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderBottom:'1px solid '+T.line, display:'flex', gap:10, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči po številki ali EOR..." style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
          <div style={{ fontSize:12, color:T.muted, whiteSpace:'nowrap' }}>{filtered.length} računov · €{totalFiltered.toFixed(2)}</div>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:T.muted }}>Nalagam...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:T.muted }}>Ni računov za izbrano obdobje</div>
          ) : filtered.map(o => {
            const payment = o.payments?.[0]
            const isSelected = selectedOrder?.id === o.id
            return (
              <div key={o.id} onClick={()=>loadOrderDetail(o)} style={{ padding:'12px 16px', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', background:isSelected?T.accentSoft:T.surface, display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, display:'flex', gap:8, alignItems:'center' }}>
                    <span>#{o.number || o.id.slice(-6)}</span>
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:T.chipBg, color:T.muted, fontWeight:600 }}>
                      {METHOD_LABELS[payment?.method] || '—'}
                    </span>
                    {'' && <span style={{ fontSize:10, color:T.muted }}>{o.spaces.name}</span>}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                    {new Date(o.closed_at).toLocaleString('sl-SI')}
                  </div>
                </div>
                <div style={{ fontWeight:800, fontSize:15, fontVariantNumeric:'tabular-nums' }}>€{Number(o.total).toFixed(2)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {showVoid && selectedOrder && (
        <VoidModal
          order={selectedOrder}
          lines={orderLines}
          payment={orderPayment}
          posData={posData}
          auth={auth}
          onClose={()=>setShowVoid(false)}
          onVoided={()=>{ setSelectedOrder(null); loadOrders() }}
        />
      )}
      {showRefund && selectedOrder && (
        <RefundModal
          order={selectedOrder}
          lines={orderLines}
          payment={orderPayment}
          auth={auth}
          onClose={()=>setShowRefund(false)}
          onRefunded={()=>{ setSelectedOrder(null); loadOrders() }}
        />
      )}
      {/* Detail */}
      {selectedOrder && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>Račun #{selectedOrder.number || selectedOrder.id.slice(-6)}</div>
              <div style={{ fontSize:12, color:T.muted }}>{new Date(selectedOrder.closed_at).toLocaleString('sl-SI')}</div>
            </div>
            <button onClick={()=>printReceipt(selectedOrder, orderLines, orderPayment)}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
              🖨️ Ponovni izpis
            </button>
            {isToday(selectedOrder.closed_at) && !selectedOrder.voided_at && auth.permissions?.voidReceipt && (
              <button onClick={()=>setShowVoid(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(168,50,50,0.1)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                🗑️ Storno
              </button>
            )}
            {isToday(selectedOrder.closed_at) && !selectedOrder.voided_at && auth.permissions?.refund && (
              <button onClick={()=>setShowRefund(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(37,99,235,0.1)', color:'#2563eb', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                ↩️ Vračilo
              </button>
            )}
            {selectedOrder.voided_at && (
              <div style={{ padding:'6px 12px', borderRadius:8, background:'rgba(168,50,50,0.08)', color:T.danger, fontSize:12, fontWeight:700 }}>
                ⛔ Storniran
              </div>
            )}
            {selectedOrder.furs_required && !orderPayment?.furs_eor && (
              <button onClick={async()=>{
                try {
                  const res = await fetch('/api/furs/invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ order_id: selectedOrder.id, total: selectedOrder.total }) })
                  if (res.ok) { const d = await res.json(); alert('FURS potrjen! EOR: ' + d.eor); loadOrders() }
                  else alert('FURS napaka: ' + (await res.text()))
                } catch(e) { alert('FURS napaka: ' + e.message) }
              }} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(168,50,50,0.1)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>
                ⚠️ Potrdi FURS
              </button>
            )}
            <button onClick={()=>setSelectedOrder(null)} style={{ width:30, height:30, borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            {/* Plačilo info */}
            <div style={{ background:T.surface2, borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', gap:20 }}>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>Plačilna metoda</div>
                <div style={{ fontWeight:700, fontSize:14 }}>{METHOD_LABELS[orderPayment?.method] || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>Skupaj</div>
                <div style={{ fontWeight:700, fontSize:14 }}>€{Number(selectedOrder.total).toFixed(2)}</div>
              </div>
              {orderPayment?.furs_eor && (
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>EOR (FURS)</div>
                  <div style={{ fontWeight:600, fontSize:11, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis' }}>{orderPayment.furs_eor}</div>
                </div>
              )}
            </div>
            {/* Artikli */}
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>ARTIKLI</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                  {['Artikel','Kol.','Cena','Skupaj'].map((h,i)=>(
                    <th key={i} style={{ padding:'6px 8px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderLines.map((l,i)=>(
                  <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'8px', fontSize:13, fontWeight:600 }}>{l.name}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontSize:13 }}>{l.qty}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontSize:13 }}>€{Number(l.unit_price).toFixed(2)}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontWeight:700, fontSize:13 }}>€{(Number(l.qty)*Number(l.unit_price)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedOrder.discount_pct > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px', color:T.accent, fontSize:13 }}>
                <span>Popust {selectedOrder.discount_pct}%</span>
                <span>-€{Number(selectedOrder.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 8px', fontWeight:800, fontSize:16, borderTop:'2px solid '+T.line, marginTop:8 }}>
              <span>SKUPAJ</span>
              <span>€{Number(selectedOrder.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ================================================================
// REPORTS SCREEN — real DB stats
// ================================================================
function ReportsScreen({ posData, auth }) {
  const [period, setPeriod] = useState('today')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [showZReport, setShowZReport] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => { loadReport(period) }, [period])

  async function loadReport(p) {
    setLoading(true)
    const now = new Date()
    let from, to
    if (p === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    } else if (p === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate()-1)
      from = new Date(y.getFullYear(), y.getMonth(), y.getDate())
      to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59)
    } else if (p === 'week') {
      from = new Date(now); from.setDate(now.getDate()-7)
      to = now
    } else if (p === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = now
    } else if (p === 'custom' && customFrom && customTo) {
      from = new Date(customFrom)
      to = new Date(customTo + 'T23:59:59')
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      to = now
    }

    const db = createClient()
    const [ordersRes, refundsRes] = await Promise.all([
      db.from('orders')
        .select('id, created_at, payments(amount, method, tip)')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'paid')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString()),
      db.from('refunds')
        .select('amount, reason, created_at, orders(id)')
        .eq('business_id', BUSINESS_ID)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString()),
    ])

    const orders = ordersRes.data || []
    const refunds = refundsRes.data || []

    // Izračuni
    let promet = 0, napitnine = 0, vracila = 0
    const byHour = {}
    const byMethod = { cash:0, card:0, bon:0, prep:0, other:0 }

    orders.forEach(o => {
      const payments = o.payments || []
      payments.forEach(p => {
        const amt = Number(p.amount || 0)
        const tip = Number(p.tip || 0)
        promet += amt
        napitnine += tip
        const h = new Date(o.created_at).getHours()
        byHour[h] = (byHour[h] || 0) + amt
        const m = p.method || 'other'
        if (m === 'cash') byMethod.cash += amt
        else if (m === 'card') byMethod.card += amt
        else if (m === 'bon') byMethod.bon += amt
        else if (m === 'prep') byMethod.prep += amt
        else byMethod.other += amt
      })
    })

    refunds.forEach(r => { vracila += Number(r.amount || 0) })

    // Top artikli iz order_lines
    const linesRes = await db.from('order_lines')
      .select('name, qty, unit_price, orders!inner(created_at, status, business_id)')
      .eq('orders.business_id', BUSINESS_ID)
      .eq('orders.status', 'paid')
      .gte('orders.created_at', from.toISOString())
      .lte('orders.created_at', to.toISOString())

    const itemMap = {}
    ;(linesRes.data || []).forEach(l => {
      const k = l.name
      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0 }
      itemMap[k].qty += Number(l.qty || 1)
      itemMap[k].total += Number(l.unit_price || 0) * Number(l.qty || 1)
    })
    const topItems = Object.values(itemMap).sort((a:any,b:any) => b.total - a.total).slice(0,5)

    setReportData({
      promet, napitnine, vracila,
      racuni: orders.length,
      byHour, byMethod, topItems, refunds, from, to
    })
    setLoading(false)
  }

  const periodLabel = { today:'Danes', yesterday:'Včeraj', week:'Zadnjih 7 dni', month:'Ta mesec', custom:'Po meri' }

  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted }}>Nalagam poročilo...</div>
  if (!reportData) return null

  const { promet, napitnine, vracila, racuni, byHour, byMethod, topItems, refunds } = reportData
  const maxHour = Math.max(...Object.values(byHour).map(Number), 1)
  const maxMethod = Math.max(...Object.values(byMethod).map(Number), 1)
  const maxItem = Math.max(...(topItems as any[]).map((i:any) => i.total), 1)

  const hours = Array.from({length:24}, (_,i) => i).filter(h => byHour[h])

  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em' }}>POROČILO · {(periodLabel[period]||'').toUpperCase()}</div>
          <div style={{ fontSize:22, fontWeight:800, marginTop:2 }}>
            {period==='today' ? new Date().toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : periodLabel[period]}
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={()=>setShowPeriodModal(true)} style={{ ...btnS, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
            <KI name="calendar" size={13}/> Spremeni obdobje
          </button>
          <button onClick={()=>setShowZReport(true)} style={{ ...btnP, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
            <KI name="print" size={13}/> Z-poročilo (zaključi izmeno)
          </button>
        </div>
      </div>

      {/* Stat kartice */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          ['PROMET', eur(promet), promet>0?'+'+Math.round(promet/100)+'% glede na včeraj':'danes'],
          ['RAČUNI', racuni, 'povp. '+eur(racuni>0?promet/racuni:0)],
          ['NAPITNINE', eur(napitnine), (promet>0?(napitnine/promet*100).toFixed(2):0)+'% prometa'],
          ['VRAČILA', eur(vracila), refunds.length+' transakcij'],
        ].map(([l,v,s]) => (
          <div key={String(l)} style={{ padding:'14px 16px', background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:800, marginTop:6, fontVariantNumeric:'tabular-nums', color: l==='VRAČILA'&&vracila>0?T.danger:T.ink }}>{v}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12, marginBottom:12 }}>
        {/* Promet po urah */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>PROMET PO URAH</div>
          {hours.length === 0 ? (
            <div style={{ fontSize:13, color:T.muted, padding:'20px 0' }}>Ni podatkov za izbrano obdobje</div>
          ) : (
            <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
              {hours.map(h => {
                const val = byHour[h] || 0
                const pct = val / maxHour
                return (
                  <div key={h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, color:T.muted, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{eur(val)}</div>
                    <div style={{ width:'100%', background:T.accent, borderRadius:'4px 4px 0 0', height:Math.max(pct*80, 4) }}/>
                    <div style={{ fontSize:9, color:T.muted }}>{h}:00</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Plačila po metodah */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>PLAČILA PO METODAH</div>
          {[
            ['Kartica', byMethod.card, '#1f6b3a'],
            ['Gotovina', byMethod.cash, '#b88c28'],
            ['Boni', byMethod.bon, '#634896'],
            ['Ostalo', byMethod.other + byMethod.prep, '#64748b'],
          ].filter(([,v]) => Number(v) > 0).map(([label, val, color]) => (
            <div key={String(label)} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, marginBottom:5 }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric:'tabular-nums' }}>
                  {eur(Number(val))} <span style={{ color:T.muted, fontWeight:400 }}>{promet>0?Math.round(Number(val)/promet*100):0}%</span>
                </span>
              </div>
              <div style={{ height:8, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                <div style={{ height:'100%', width:(Number(val)/maxMethod*100)+'%', background:String(color), borderRadius:999 }}/>
              </div>
            </div>
          ))}
          {Object.values(byMethod).every(v => v === 0) && <div style={{ fontSize:13, color:T.muted }}>Ni plačil</div>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12 }}>
        {/* Top artikli */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>NAJBOLJ PRODAJANI ARTIKLI</div>
          {(topItems as any[]).length === 0 ? (
            <div style={{ fontSize:13, color:T.muted }}>Ni podatkov</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>
                  <th style={{ textAlign:'left', padding:'0 0 10px', letterSpacing:'0.06em' }}>Artikel</th>
                  <th style={{ textAlign:'right', padding:'0 0 10px', letterSpacing:'0.06em' }}>Količina</th>
                  <th style={{ textAlign:'right', padding:'0 0 10px', letterSpacing:'0.06em' }}>Prihodek</th>
                  <th style={{ width:100 }}/>
                </tr>
              </thead>
              <tbody>
                {(topItems as any[]).map((item:any) => (
                  <tr key={item.name} style={{ borderTop:'1px solid '+T.line }}>
                    <td style={{ padding:'10px 0', fontSize:13, fontWeight:600 }}>{item.name}</td>
                    <td style={{ padding:'10px 0', fontSize:13, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{item.qty}</td>
                    <td style={{ padding:'10px 0', fontSize:13, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{eur(item.total)}</td>
                    <td style={{ padding:'10px 0 10px 12px' }}>
                      <div style={{ height:6, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:(item.total/maxItem*100)+'%', background:T.accent, borderRadius:999 }}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Vračila */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>VRAČILA</div>
          {refunds.length === 0 ? (
            <div style={{ fontSize:13, color:T.muted }}>Ni vračil v tem obdobju</div>
          ) : refunds.map((r:any, i:number) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i<refunds.length-1?'1px solid '+T.line:'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.danger }}>RAČ-{String(r.orders?.id||'').slice(-4).toUpperCase()}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                  {new Date(r.created_at).toLocaleString('sl-SI', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}
                  {r.reason && <> · <i>"{r.reason}"</i></>}
                </div>
              </div>
              <div style={{ fontWeight:800, color:T.danger, fontVariantNumeric:'tabular-nums' }}>−{eur(r.amount)}</div>
            </div>
          ))}
          <button style={{ ...btnS, width:'100%', marginTop:12, fontSize:12 }}>↩ Novo vračilo</button>
        </div>
      </div>

      {showZReport && <ZReportModal posData={posData} onClose={()=>setShowZReport(false)}/>}


      {/* Period modal */}
      {showPeriodModal && (
        <Modal open onClose={()=>setShowPeriodModal(false)} width={340}>
          <ModalHeader title="Izberi obdobje" onClose={()=>setShowPeriodModal(false)}/>
          <div style={{ padding:'16px 20px' }}>
            {[['today','Danes'],['yesterday','Včeraj'],['week','Zadnjih 7 dni'],['month','Ta mesec']].map(([id,lbl]) => (
              <button key={id} onClick={()=>{setPeriod(id);setShowPeriodModal(false)}} style={{ width:'100%', padding:'11px 14px', borderRadius:9, marginBottom:6, background: period===id?T.accentSoft:T.surface2, border:'1px solid '+(period===id?T.accent:T.line), cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: period===id?700:500, textAlign:'left', color: period===id?T.accent:T.ink }}>
                {lbl}
              </button>
            ))}
            <div style={{ marginTop:8, borderTop:'1px solid '+T.line, paddingTop:12 }}>
              <div style={{ fontSize:12, color:T.muted, marginBottom:8 }}>Po meri:</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit' }}/>
                <span style={{ color:T.muted }}>–</span>
                <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit' }}/>
              </div>
              <button onClick={()=>{if(customFrom&&customTo){setPeriod('custom');setShowPeriodModal(false)}}} style={{ ...btnP, width:'100%', marginTop:8, fontSize:12 }}>Potrdi</button>
            </div>
          </div>
        </Modal>
      )}
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
    if (!modal?.pin?.trim()) { showToast('PIN je obvezen', false); return }
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

// ─── Emoji Picker ─────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label:'Pijača',    emojis:['🍺','🍻','🍷','🥂','🍾','🥃','🍸','🍹','🧃','🥤','🧋','☕','🍵','🫖','🧉','🍶'] },
  { label:'Hrana',     emojis:['🍕','🍔','🌮','🌯','🥙','🥗','🍜','🍝','🍲','🥘','🫕','🥩','🍖','🍗','🥓','🧆','🥚','🍳','🥞','🧇','🥐','🥖','🫓','🧀','🥗','🫙','🍱'] },
  { label:'Sladko',    emojis:['🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍦','🍨','🍧','🍮','🥧'] },
  { label:'Fitnes',    emojis:['💪','🏋️','🤸','🧘','🏃','🚴','🏊','⚽','🏀','🎾','🥊','🏆','🎯','🧗','🏄','🤾'] },
  { label:'Zdravje',   emojis:['💆','🧖','💅','💊','🩺','🩹','🫀','🧬','🌿','🧴','🛁','💈'] },
  { label:'Storitve',  emojis:['✂️','🪥','🧹','🔑','🪴','📋','🗓️','⏰','📞','💻','🖨️','📱'] },
  { label:'Ostalo',    emojis:['🎫','🎁','🛍️','📦','⭐','🌟','✨','🔖','🏷️','💰','💳','🧾','🪙'] },
]

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(0)
  return (
    <div style={{ position:'relative' }}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{ width:52, height:52, borderRadius:10, border:'1px solid rgba(0,0,0,0.15)', background:'#fff', fontSize:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {value||'📦'}
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:100 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:101, background:'#fff', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,0.2)', border:'1px solid rgba(0,0,0,0.08)', width:300, padding:10 }}>
            <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' }}>
              {EMOJI_GROUPS.map((g,i)=>(
                <button key={i} onClick={()=>setGroup(i)} style={{ padding:'3px 8px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:600, background:group===i?'#0D1F12':'#f0ede8', color:group===i?'#fff':'#666' }}>{g.label}</button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:3 }}>
              {EMOJI_GROUPS[group].emojis.map(e=>(
                <button key={e} onClick={()=>{ onChange(e); setOpen(false) }} style={{ width:32, height:32, border:'none', background:'transparent', cursor:'pointer', fontSize:18, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}
                  onMouseEnter={ev=>ev.target.style.background='#f0ede8'} onMouseLeave={ev=>ev.target.style.background='transparent'}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Catalog (Kategorije + Artikli) CRUD ──────────────────────
function CatalogSection({ posData }) {
  const [catModal, setCatModal] = useState(null)
  const [itemModal, setItemModal] = useState(null)
  const [normModal, setNormModal] = useState(null)
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
    const itemType = itemModal?.item_type || 'simple'
    if (itemType !== 'ingredient' && (!itemModal.price || Number(itemModal.price)<=0)) { showToast('Prodajna cena mora biti > 0',false); return }
    if (itemModal.vat_rate===undefined || itemModal.vat_rate==='') { showToast('DDV stopnja je obvezna ★',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id:BUSINESS_ID, category_id:itemModal.category_id||null,
        name:itemModal.name, code:itemModal.code||null,
        price:itemModal.price?Number(itemModal.price):0,
        unit:itemModal.unit||'kos', vat_rate:Number(itemModal.vat_rate),
        stock:itemModal.stock!=null&&itemModal.stock!==''?Number(itemModal.stock):null,
        fav:!!itemModal.fav, kitchen:!!itemModal.kitchen, bookable:!!itemModal.bookable,
        duration_min:itemModal.bookable&&itemModal.duration_min?Number(itemModal.duration_min):null,
        item_type: itemType,
        archived:false,
      }
      let savedId = itemModal.id
      if (itemModal.id) {
        const {error} = await createClient().from('items').update(payload).eq('id',itemModal.id)
        if (error) throw error
      } else {
        const {data, error} = await createClient().from('items').insert(payload).select().single()
        if (error) throw error
        savedId = data.id
      }
      // Shrani normativ če je recipe tip
      if (itemType === 'recipe' && savedId) {
        await createClient().from('item_ingredients').delete().eq('item_id', savedId)
        const normLines = (itemModal.normativ||[]).filter(n=>n.ingredient_id&&n.qty_used)
        if (normLines.length > 0) {
          const {error} = await createClient().from('item_ingredients').insert(
            normLines.map(n=>({ item_id:savedId, ingredient_id:n.ingredient_id, qty_used:Number(n.qty_used) }))
          )
          if (error) throw error
        }
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
        {[['categories','Kategorije'],['items','Artikli'],['surovine','Surovine']].map(([id,lbl]) => (
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

      {activeTab==='surovine' && <SestavineSection posData={posData}/>}
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
              <button onClick={async()=>{
                const {data:normData} = await createClient().from('item_ingredients').select('*').eq('item_id',it.id)
                setItemModal({...it,normativ:normData||[]})
              }} style={btnS}><KI name="edit" size={14}/></button>
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
            <EmojiPicker value={catModal?.icon||'📦'} onChange={icon=>setCatModal(p=>({...p,icon}))}/>
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
      <Modal open={!!itemModal} onClose={()=>setItemModal(null)} width={520}>
        <ModalHeader title={itemModal?.id?'Uredi artikel':'Nov artikel'} onClose={()=>setItemModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'72vh', overflowY:'auto' }}>

          {/* Tip artikla */}
          <Field label="Tip artikla *">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
              {[
                { id:'simple',     label:'Enostaven',   desc:'Pivo, vstopnina, kava', icon:'🛍️' },
                { id:'recipe',     label:'Z normativom', desc:'Točeno vino, koktajl',  icon:'🧪' },
                { id:'ingredient', label:'Surovina',     desc:'Vino 1L, moka 1kg',     icon:'📦' },
              ].map(t=>{
                const sel = (itemModal?.item_type||'simple') === t.id
                return (
                  <div key={t.id} onClick={()=>setItemModal(p=>({...p,item_type:t.id}))} style={{ padding:'10px 8px', borderRadius:9, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface }}>
                    <div style={{ fontSize:20 }}>{t.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:sel?T.accent:T.ink, marginTop:4 }}>{t.label}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{t.desc}</div>
                  </div>
                )
              })}
            </div>
          </Field>

          <Field label="Ime artikla / storitve *">
            <input value={itemModal?.name||''} onChange={e=>setItemModal(p=>({...p,name:e.target.value}))} placeholder="Espresso, Masaža, Vstopnina..." style={inp} autoFocus/>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {(itemModal?.item_type||'simple') !== 'ingredient' && (
              <Field label="Prodajna cena (€) *">
                <input type="number" step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
              </Field>
            )}
            {(itemModal?.item_type||'simple') === 'ingredient' && (
              <Field label="Nabavna cena (€)">
                <input type="number" step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
              </Field>
            )}
            <Field label="Enota">
              <select value={itemModal?.unit||'kos'} onChange={e=>setItemModal(p=>({...p,unit:e.target.value}))} style={inp}>
                {['kos','dl','cl','ml','L','g','kg','ura','paket','obisk','porcija'].map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="DDV stopnja *">
              <select value={itemModal?.vat_rate??''} onChange={e=>setItemModal(p=>({...p,vat_rate:e.target.value}))}
                style={{ ...inp, border: (itemModal?.vat_rate===undefined||itemModal?.vat_rate==='')?'1.5px solid '+T.warn:inp.border }}>
                <option value="">— izberi DDV —</option>
                <option value={0}>0% (oproščeno)</option>
                <option value={9.5}>9.5% (hrana, pijača)</option>
                <option value={22}>22% (splošna)</option>
              </select>
            </Field>
            <Field label="Šifra (koda)">
              <input value={itemModal?.code||''} onChange={e=>setItemModal(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="K01" style={{...inp,fontFamily:'monospace'}}/>
            </Field>
          </div>

          {(itemModal?.item_type||'simple') !== 'ingredient' && (
            <Field label="Kategorija">
              <select value={itemModal?.category_id||''} onChange={e=>setItemModal(p=>({...p,category_id:e.target.value||null}))} style={inp}>
                <option value="">Brez kategorije</option>
                {realCategories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </Field>
          )}

          <Field label={(itemModal?.item_type||'simple')==='ingredient'?'Zaloga v skladišču':'Zaloga (pusti prazno za neomejeno)'}>
            <input type="number" min="0" value={itemModal?.stock??''} onChange={e=>setItemModal(p=>({...p,stock:e.target.value}))} placeholder="∞" style={inp}/>
          </Field>

          {/* Normativ — samo za recipe tip */}
          {(itemModal?.item_type||'simple') === 'recipe' && (
            <div style={{ background:T.surface2, borderRadius:10, padding:14, border:'1px solid '+T.line }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                🧪 Normativ <span style={{ fontSize:11, color:T.muted, fontWeight:500 }}>— katere surovine porabi ta artikel</span>
              </div>
              {(itemModal?.normativ||[]).map((n,i)=>(
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <select value={n.ingredient_id||''} onChange={e=>{const nv=[...(itemModal.normativ||[])];nv[i]={...nv[i],ingredient_id:e.target.value};setItemModal(p=>({...p,normativ:nv}))}} style={{ ...inp, flex:2 }}>
                    <option value="">— izberi surovino —</option>
                    {posData.ingredients.map(ig=><option key={ig.id} value={ig.id}>{ig.name} ({ig.unit})</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={n.qty_used||''} onChange={e=>{const nv=[...(itemModal.normativ||[])];nv[i]={...nv[i],qty_used:e.target.value};setItemModal(p=>({...p,normativ:nv}))}} placeholder="Qty" style={{ ...inp, width:80, flex:0 }}/>
                  <span style={{ fontSize:11, color:T.muted, minWidth:24 }}>
                    {posData.ingredients.find(ig=>ig.id===n.ingredient_id)?.unit||''}
                  </span>
                  <button onClick={()=>setItemModal(p=>({...p,normativ:(p.normativ||[]).filter((_,j)=>j!==i)}))} style={{ background:'none', border:0, cursor:'pointer', color:T.danger, padding:4 }}>✕</button>
                </div>
              ))}
              {posData.ingredients.length === 0 ? (
                <div style={{ fontSize:12, color:T.muted, padding:'8px 0' }}>Najprej dodaj surovine v <b>Nastavitve → Sestavine</b></div>
              ) : (
                <button onClick={()=>setItemModal(p=>({...p,normativ:[...(p.normativ||[]),{ingredient_id:'',qty_used:''}]}))} style={{ ...btnS, padding:'6px 12px', fontSize:12, marginTop:4 }}>
                  + Dodaj surovino
                </button>
              )}
            </div>
          )}

          {(itemModal?.item_type||'simple') !== 'ingredient' && (
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
          )}

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

// ─── Spaces & Tables CRUD — Visual Canvas + Drag & Drop ──────
function SpacesSection({ posData }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)
  const [spaceModal, setSpaceModal] = useState(null)
  const [tableModal, setTableModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [dragPos, setDragPos] = useState({})
  const canvasRef = useRef(null)
  const SPACE_COLORS = ['#8FBF8F','#B8956A','#9B7AC9','#3a6e8f','#c26a3a','#1f6b3a','#e9b949','#a83232']

  useEffect(() => {
    if (posData.spaces.length > 0 && !selectedSpaceId) setSelectedSpaceId(posData.spaces[0].id)
  }, [posData.spaces])

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const selectedSpace = posData.spaces.find(s => s.id === selectedSpaceId)

  // Drag & drop
  function startDrag(e, table) {
    e.preventDefault(); e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDragState({ tableId:table.id, startX:e.clientX, startY:e.clientY, origX:table.x, origY:table.y, canvasW:rect.width, canvasH:rect.height })
  }

  useEffect(() => {
    if (!dragState) return
    function onMove(e) {
      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      const nx = Math.max(0, Math.min(88, dragState.origX + (dx / dragState.canvasW * 100)))
      const ny = Math.max(0, Math.min(82, dragState.origY + (dy / dragState.canvasH * 100)))
      setDragPos(p => ({...p, [dragState.tableId]: {x:nx, y:ny}}))
    }
    async function onUp() {
      const pos = dragPos[dragState.tableId]
      if (pos) {
        try {
          await createClient().from('tables').update({ x:Math.round(pos.x), y:Math.round(pos.y) }).eq('id', dragState.tableId)
          posData.refresh()
        } catch(err) { console.error(err) }
      }
      setDragState(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragState, dragPos])

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
        posData.refresh()
        // select new space
        setTimeout(() => {
          const newSpace = posData.spaces[posData.spaces.length - 1]
          if (newSpace) setSelectedSpaceId(newSpace.id)
        }, 500)
      }
      setSpaceModal(null); posData.refresh(); showToast(spaceModal.id?'Prostor posodobljen':'Prostor dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteSpace(id, name) {
    if (!confirm(`Izbrišem prostor "${name}" in vse mize?`)) return
    await createClient().from('spaces').delete().eq('id',id)
    const next = posData.spaces.find(s=>s.id!==id)
    setSelectedSpaceId(next?.id||null)
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

  async function deleteTable(id) {
    if (!confirm('Izbrišem to mizo?')) return
    await createClient().from('tables').delete().eq('id',id)
    posData.refresh(); showToast('Miza izbrisana')
  }

  const tablePos = (t) => dragState?.tableId === t.id && dragPos[t.id] ? dragPos[t.id] : {x:t.x, y:t.y}
  const spaceColor = (sp) => sp?.color || '#8FBF8F'

  return (
    <div style={{ display:'flex', gap:0, height:'calc(100vh - 200px)', minHeight:500 }}>
      {/* Leva lista prostorov */}
      <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:0, borderRight:'1px solid '+T.line, paddingRight:16, marginRight:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:T.muted }}>Prostori</div>
          <button onClick={()=>setSpaceModal({color:'#8FBF8F'})} style={{ ...btnP, padding:'6px 10px', fontSize:11 }}>+ Nov</button>
        </div>
        {posData.spaces.length === 0 && (
          <div style={{ fontSize:12, color:T.muted, padding:'12px 0' }}>Ni prostorov</div>
        )}
        {posData.spaces.map(sp => {
          const sel = selectedSpaceId === sp.id
          return (
            <div key={sp.id} onClick={()=>setSelectedSpaceId(sp.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, marginBottom:4, cursor:'pointer', background: sel ? T.accentSoft : 'transparent', border:'1px solid '+(sel?T.accent:'transparent') }}>
              <div style={{ width:32, height:32, borderRadius:8, background:spaceColor(sp), display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <KI name="chair" size={16} strokeWidth={2}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:sel?T.accent:T.ink }}>{sp.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{(sp.tables||[]).length} miz</div>
              </div>
              <button onClick={e=>{e.stopPropagation();deleteSpace(sp.id,sp.name)}} style={{ background:'none', border:0, cursor:'pointer', color:T.muted, padding:4, opacity:0.6 }}>
                <KI name="trash" size={13}/>
              </button>
            </div>
          )
        })}
      </div>

      {/* Desno platno */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {!selectedSpace ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted, fontSize:13 }}>
            Dodaj prostor da začneš
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:spaceColor(selectedSpace) }}/>
              <div style={{ fontSize:16, fontWeight:700 }}>{selectedSpace.name}</div>
              <div style={{ fontSize:12, color:T.muted }}>· {(selectedSpace.tables||[]).length} miz</div>
              <button onClick={()=>setSpaceModal({...selectedSpace})} style={{ ...btnS, padding:'5px 10px', fontSize:11, marginLeft:4 }}>✏️ Uredi</button>
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <div style={{ fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:4 }}>
                  <KI name="arrow" size={12}/> Povleci mizo za premik
                </div>
                <button onClick={()=>setTableModal({space_id:selectedSpace.id,seats:2,x:10,y:10})} style={btnP}>
                  + Dodaj mizo
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div ref={canvasRef} style={{ flex:1, position:'relative', borderRadius:14, border:'1.5px solid '+T.line, background:T.surface2, backgroundImage:'radial-gradient(circle, rgba(26,31,26,0.12) 1px, transparent 1px)', backgroundSize:'24px 24px', overflow:'hidden', userSelect:'none', minHeight:400 }}>
              {(selectedSpace.tables||[]).length === 0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:T.muted }}>
                  <div style={{ fontSize:32 }}>🪑</div>
                  <div style={{ fontSize:13 }}>Klikni <b>+ Dodaj mizo</b> za prvo mizo</div>
                </div>
              )}
              {(selectedSpace.tables||[]).map(t => {
                const pos = tablePos(t)
                const isDragging = dragState?.tableId === t.id
                const isRound = t.seats <= 2
                const w = t.seats<=2?90:t.seats<=4?114:150
                const h = t.seats<=2?90:t.seats<=4?88:110
                const spColor = spaceColor(selectedSpace)
                const statusColors = { free:'rgba(31,107,58,0.5)', occupied:'rgba(184,140,40,0.55)', reserved:'rgba(99,72,150,0.5)', needs_attention:'rgba(168,50,50,0.55)' }
                const borderColor = statusColors[t.status] || statusColors.free
                const bgColor = { free:'#ffffff', occupied:'rgba(233,185,73,0.12)', reserved:'rgba(155,122,201,0.12)', needs_attention:'rgba(168,50,50,0.08)' }[t.status] || '#fff'

                return (
                  <div key={t.id}
                    onMouseDown={e=>startDrag(e,t)}
                    style={{ position:'absolute', left:`${pos.x}%`, top:`${pos.y}%`, width:w, height:h, background:bgColor, border:`2px solid ${borderColor}`, borderRadius:isRound?'50%':14, cursor:isDragging?'grabbing':'grab', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, boxShadow:isDragging?'0 8px 24px rgba(0,0,0,0.18)':'0 2px 6px rgba(0,0,0,0.06)', transition:isDragging?'none':'box-shadow 0.15s', zIndex:isDragging?10:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:T.ink }}>{t.name}</div>
                    <div style={{ fontSize:10, color:T.muted, display:'flex', alignItems:'center', gap:2 }}>
                      <KI name="user" size={9}/>{t.seats}
                    </div>
                    {/* Edit/delete buttons on hover — shown always for admin */}
                    <div style={{ position:'absolute', top:-10, right:-10, display:'flex', gap:3 }}>
                      <button onMouseDown={e=>e.stopPropagation()} onClick={()=>setTableModal({...t,space_id:selectedSpace.id})}
                        style={{ width:22, height:22, borderRadius:'50%', background:T.surface, border:'1px solid '+T.line, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.12)' }}>
                        <KI name="edit" size={10}/>
                      </button>
                      <button onMouseDown={e=>e.stopPropagation()} onClick={()=>deleteTable(t.id)}
                        style={{ width:22, height:22, borderRadius:'50%', background:T.surface, border:'1px solid rgba(168,50,50,0.3)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T.danger, boxShadow:'0 1px 4px rgba(0,0,0,0.12)' }}>
                        <KI name="x" size={10}/>
                      </button>
                    </div>
                  </div>
                )
              })}
              {/* Legenda */}
              <div style={{ position:'absolute', bottom:12, left:12, display:'flex', gap:10 }}>
                {Object.entries(T.status).map(([k,st])=>(
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:T.muted, fontWeight:600 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>{st.label}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

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
            <input value={tableModal?.name||''} onChange={e=>setTableModal(p=>({...p,name:e.target.value}))} placeholder="T1, Terasa 3..." style={inp} autoFocus/>
          </Field>
          <Field label="Število sedežev">
            <div style={{ display:'flex', gap:6 }}>
              {[2,4,6,8].map(n=>(
                <button key={n} onClick={()=>setTableModal(p=>({...p,seats:n}))}
                  style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:14, background:tableModal?.seats==n?T.accent:T.surface3, color:tableModal?.seats==n?'#fff':T.ink }}>
                  {n}
                </button>
              ))}
            </div>
            <input type="number" min="1" max="20" value={tableModal?.seats||2} onChange={e=>setTableModal(p=>({...p,seats:Number(e.target.value)}))} style={{ ...inp, marginTop:6 }} placeholder="Ali vpiši ročno"/>
          </Field>
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

// ─── Packages Admin CRUD — vse vrste ─────────────────────────
function PackagesAdminSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }
  const ttype = modal?.template_type || 'visits'

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.price && ttype !== 'service_bon') { showToast('Cena je obvezna',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        price: Number(modal.price||0),
        template_type: ttype,
        activation_type: modal.activation_type||'purchase',
        validity_days: modal.validity_days?Number(modal.validity_days):null,
        visits: ['visits','group_class'].includes(ttype) ? Number(modal.visits||10) : null,
        monetary_value: ttype==='gift_voucher' ? Number(modal.monetary_value||0) : null,
        time_from: modal.time_from||null,
        time_to: modal.time_to||null,
        days_of_week: modal.days_of_week||[],
        auto_renew: !!modal.auto_renew,
        vat_rate: Number(modal.vat_rate||22),
        notify_before_days: Number(modal.notify_before_days||7),
        fixed_start_date: modal.fixed_start_date||null,
        fixed_end_date: modal.fixed_end_date||null,
        description: modal.description||null,
        color: modal.color||(TEMPLATE_TYPES[ttype]?.color||'#1f6b3a'),
        archived: false,
        // legacy fields
        type: ttype === 'visits' ? 'visits' : ttype === 'membership' ? 'unlimited' : 'unlimited',
      }
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

  const DAYS = [['pon','Pon'],['tor','Tor'],['sre','Sre'],['čet','Čet'],['pet','Pet'],['sob','Sob'],['ned','Ned']]

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Paketi & Kartice</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Predloge za prodajo strankam — članaraine, kartice, boni.</div>
        </div>
        <button onClick={()=>setModal({template_type:'visits',activation_type:'purchase',validity_days:30,visits:10,vat_rate:22,notify_before_days:7,days_of_week:[]})} style={btnP}>+ Dodaj paket</button>
      </div>

      {/* Gruppiran prikaz */}
      {Object.entries(TEMPLATE_TYPES).map(([typeKey, typeConf]) => {
        const typePackages = posData.packageTemplates.filter(p => (p.template_type||p.type||'visits') === typeKey || (typeKey==='visits' && p.type==='visits' && !p.template_type) || (typeKey==='membership' && p.type==='unlimited' && !p.template_type))
        if (typePackages.length === 0) return null
        return (
          <div key={typeKey} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:14 }}>{typeConf.icon}</span> {typeConf.label}
            </div>
            {typePackages.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+T.line }}>
                <div style={{ width:36, height:36, borderRadius:8, background:typeConf.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{typeConf.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                    {p.validity_days && <span>📅 {p.validity_days} dni</span>}
                    {p.visits && <span>🎯 {p.visits}×</span>}
                    {p.activation_type && <span>⚡ {ACTIVATION_TYPES[p.activation_type]||''}</span>}
                    {p.auto_renew && <span>🔄 Auto</span>}
                    {p.description && <span style={{ color:T.mutedSoft }}>· {p.description}</span>}
                  </div>
                </div>
                <div style={{ fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums', color:typeConf.color }}>{eur(p.price)}</div>
                <button onClick={()=>setModal({...p, template_type: p.template_type||p.type||'visits', days_of_week:p.days_of_week||[]})} style={btnS}><KI name="edit" size={14}/></button>
                <button onClick={()=>remove(p.id,p.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
              </div>
            ))}
          </div>
        )
      })}
      {posData.packageTemplates.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni paketov</div>}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={500}>
        <ModalHeader title={modal?.id ? 'Uredi paket' : 'Nov paket'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'75vh', overflowY:'auto' }}>

          {/* Tip */}
          <Field label="Tip paketa *">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5 }}>
              {Object.entries(TEMPLATE_TYPES).map(([k,v])=>{
                const sel = ttype === k
                return (
                  <div key={k} onClick={()=>setModal(p=>({...p,template_type:k}))} style={{ padding:'8px 4px', borderRadius:9, border:'2px solid '+(sel?v.color:T.line), cursor:'pointer', textAlign:'center', background:sel?v.color+'18':T.surface }}>
                    <div style={{ fontSize:18 }}>{v.icon}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:sel?v.color:T.muted, marginTop:3, lineHeight:1.2 }}>{v.label}</div>
                  </div>
                )
              })}
            </div>
          </Field>

          <Field label="Ime paketa *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Letna članarain, 10× vstopnica, Darilni bon..." style={inp} autoFocus/>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label={ttype==='gift_voucher'?'Vrednost bona (€) *':'Cena (€) *'}>
              <input type="number" step="0.01" min="0" value={modal?.price||''} onChange={e=>setModal(p=>({...p,price:e.target.value}))} style={inp}/>
            </Field>
            <Field label="DDV stopnja *">
              <select value={modal?.vat_rate??22} onChange={e=>setModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
                <option value={0}>0% (bon, kuponi)</option>
                <option value={9.5}>9.5% (storitve)</option>
                <option value={22}>22% (splošna)</option>
              </select>
            </Field>
          </div>

          {/* Aktivacija */}
          <Field label="Začetek veljavnosti">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
              {Object.entries(ACTIVATION_TYPES).map(([k,v])=>{
                const sel = (modal?.activation_type||'purchase') === k
                return <div key={k} onClick={()=>setModal(p=>({...p,activation_type:k}))} style={{ padding:'8px 6px', borderRadius:8, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface, fontSize:11, fontWeight:600, color:sel?T.accent:T.muted }}>{v}</div>
              })}
            </div>
          </Field>

          {/* Trajanje */}
          {ttype !== 'seasonal' && (
            <Field label="Veljavnost (dni od aktivacije)">
              <input type="number" min="1" value={modal?.validity_days||''} onChange={e=>setModal(p=>({...p,validity_days:e.target.value}))} placeholder="30, 90, 365..." style={inp}/>
            </Field>
          )}

          {/* Sezonski datumi */}
          {ttype === 'seasonal' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Začetek sezone *"><input type="date" value={modal?.fixed_start_date||''} onChange={e=>setModal(p=>({...p,fixed_start_date:e.target.value}))} style={inp}/></Field>
              <Field label="Konec sezone *"><input type="date" value={modal?.fixed_end_date||''} onChange={e=>setModal(p=>({...p,fixed_end_date:e.target.value}))} style={inp}/></Field>
            </div>
          )}

          {/* Obiski */}
          {['visits','group_class'].includes(ttype) && (
            <Field label="Število obiskov *">
              <input type="number" min="1" value={modal?.visits||10} onChange={e=>setModal(p=>({...p,visits:e.target.value}))} style={inp}/>
            </Field>
          )}

          {/* Časovna omejitev */}
          {ttype === 'time_restrict' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Veljavno od"><input type="time" value={modal?.time_from||'06:00'} onChange={e=>setModal(p=>({...p,time_from:e.target.value}))} style={inp}/></Field>
                <Field label="Veljavno do"><input type="time" value={modal?.time_to||'12:00'} onChange={e=>setModal(p=>({...p,time_to:e.target.value}))} style={inp}/></Field>
              </div>
              <Field label="Veljavni dnevi">
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {DAYS.map(([id,lbl])=>{
                    const sel = (modal?.days_of_week||[]).includes(id)
                    return <button key={id} onClick={()=>setModal(p=>({...p,days_of_week:sel?(p.days_of_week||[]).filter(x=>x!==id):[...(p.days_of_week||[]),id]}))} style={{ padding:'6px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:11, background:sel?T.accent:T.surface3, color:sel?'#fff':T.ink }}>{lbl}</button>
                  })}
                </div>
              </Field>
            </>
          )}

          {/* Opozorila */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Opozorilo pred iztekom (dni)">
              <input type="number" min="1" value={modal?.notify_before_days||7} onChange={e=>setModal(p=>({...p,notify_before_days:e.target.value}))} style={inp}/>
            </Field>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:4 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={!!modal?.auto_renew} onChange={e=>setModal(p=>({...p,auto_renew:e.target.checked}))} style={{ accentColor:T.accent }}/>
                Avtomatska obnova
              </label>
            </div>
          </div>

          <Field label="Opis (neobvezno)">
            <input value={modal?.description||''} onChange={e=>setModal(p=>({...p,description:e.target.value}))} placeholder="Kratek opis..." style={inp}/>
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


// ─── Sestavine / Surovine CRUD ───────────────────────────────
function SestavineSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const UNITS = ['L','dl','cl','ml','kg','g','kos','paket','steklenica']
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.unit) { showToast('Enota je obvezna',false); return }
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        unit: modal.unit,
        stock_qty: Number(modal.stock_qty||0),
        cost_price: modal.cost_price?Number(modal.cost_price):null,
        min_stock: Number(modal.min_stock||0),
        supplier: modal.supplier||null,
      }
      if (modal.id) {
        const {error} = await createClient().from('ingredients').update(payload).eq('id',modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('ingredients').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id?'Surovina posodobljena':'Surovina dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem surovino "${name}"? Normativi ki jo uporabljajo bodo prizadeti.`)) return
    try {
      const {error} = await createClient().from('ingredients').delete().eq('id',id)
      if (error) throw error
      posData.refresh(); showToast('Surovina izbrisana')
    } catch(e) { showToast(e.message,false) }
  }

  async function updateStock(ig) {
    const qty = prompt(`Nova zaloga za ${ig.name} (${ig.unit}):`, ig.stock_qty)
    if (qty === null) return
    await createClient().from('ingredients').update({ stock_qty: Number(qty) }).eq('id',ig.id)
    posData.refresh(); showToast('Zaloga posodobljena')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Sestavine & Surovine</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>
            Surovine za normative — vino po litrih, moka po kg, itd. Ob prodaji normativnih artiklov se zaloga samodejno odšteje.
          </div>
        </div>
        <button onClick={()=>setModal({unit:'L',stock_qty:0,min_stock:0})} style={btnP}>+ Dodaj surovino</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16, marginTop:12 }}>
        {[
          ['Skupaj surovin', posData.ingredients.length, ''],
          ['Nizka zaloga', posData.ingredients.filter(i=>i.stock_qty<=(i.min_stock||0)&&i.min_stock>0).length, 'opozorilo'],
          ['Artiklov z normativom', posData.items.filter(i=>i.item_type==='recipe').length, ''],
        ].map(([l,v,s])=>(
          <div key={l} style={{ padding:'12px 14px', background:T.surface, borderRadius:10, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:24, fontWeight:800, marginTop:4, color:s==='opozorilo'&&v>0?T.danger:T.ink }}>{v}</div>
          </div>
        ))}
      </div>

      {posData.ingredients.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📦</div>
          Ni surovin — dodajte prvo
        </div>
      ) : posData.ingredients.map(ig=>{
        const low = ig.stock_qty <= (ig.min_stock||0) && ig.min_stock > 0
        return (
          <div key={ig.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+(low?'rgba(168,50,50,0.3)':T.line) }}>
            <div style={{ width:40, height:40, borderRadius:9, background:low?'rgba(168,50,50,0.1)':T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
              📦
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{ig.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                {ig.unit} · Min: {ig.min_stock||0} {ig.unit}
                {ig.supplier && <span> · {ig.supplier}</span>}
                {ig.cost_price && <span> · nab. {eur(ig.cost_price)}</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:20, fontWeight:800, fontVariantNumeric:'tabular-nums', color:low?T.danger:T.ink }}>{ig.stock_qty}</div>
              <div style={{ fontSize:11, color:T.muted }}>{ig.unit}</div>
            </div>
            {low && <div style={{ fontSize:10, fontWeight:700, color:T.danger, background:'rgba(168,50,50,0.1)', padding:'3px 7px', borderRadius:5 }}>NIZKO</div>}
            <button onClick={()=>updateStock(ig)} title="Posodobi zalogo" style={{ ...btnS, padding:'7px 10px', fontSize:12 }}>📥</button>
            <button onClick={()=>setModal({...ig})} style={btnS}><KI name="edit" size={14}/></button>
            <button onClick={()=>remove(ig.id,ig.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
          </div>
        )
      })}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={440}>
        <ModalHeader title={modal?.id?'Uredi surovino':'Nova surovina'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime surovine *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Refošk, Moka, Olje..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Enota *">
              <select value={modal?.unit||'L'} onChange={e=>setModal(p=>({...p,unit:e.target.value}))} style={inp}>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Trenutna zaloga">
              <input type="number" min="0" step="0.01" value={modal?.stock_qty||0} onChange={e=>setModal(p=>({...p,stock_qty:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Minimalna zaloga (opozorilo)">
              <input type="number" min="0" step="0.01" value={modal?.min_stock||0} onChange={e=>setModal(p=>({...p,min_stock:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Nabavna cena (€)">
              <input type="number" min="0" step="0.01" value={modal?.cost_price||''} onChange={e=>setModal(p=>({...p,cost_price:e.target.value}))} placeholder="0.00" style={inp}/>
            </Field>
          </div>
          <Field label="Dobavitelj (neobvezno)">
            <input value={modal?.supplier||''} onChange={e=>setModal(p=>({...p,supplier:e.target.value}))} placeholder="Vino d.o.o." style={inp}/>
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
          <Field label="DDV stopnja *">
            <select value={modal?.vat_rate??''} onChange={e=>setModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
              <option value="">— izberi DDV —</option>
              <option value={0}>0% (oproščeno)</option>
              <option value={9.5}>9.5% (storitve)</option>
              <option value={22}>22% (splošna)</option>
            </select>
          </Field>
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
  const [tab, setTab] = useState('kds')
  const [kdsEnabled, setKdsEnabled] = useState(false)
  const [customerDisplay, setCustomerDisplay] = useState(false)
  const [kdsOrders, setKdsOrders] = useState([])
  const [now, setNow] = useState(new Date())

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const kitchenItems = posData.items.filter(i => i.kitchen)
  const nonKitchenItems = posData.items.filter(i => !i.kitchen)

  // Tick vsako sekundo za časovnike
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime fetch aktivnih KDS naročil
  useEffect(() => {
    if (!kdsEnabled) return
    let sub

    async function loadOrders() {
      const {data} = await createClient()
        .from('orders')
        .select(`
          id, created_at, status,
          tables(name, spaces(name)),
          order_lines(id, name, qty, unit_price, note, items(kitchen))
        `)
        .eq('business_id', BUSINESS_ID)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: true })
      setKdsOrders(data || [])
    }

    loadOrders()

    // Supabase realtime subscription
    sub = createClient()
      .channel('kds_orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${BUSINESS_ID}`
      }, () => loadOrders())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_lines'
      }, () => loadOrders())
      .subscribe()

    return () => { if (sub) createClient().removeChannel(sub) }
  }, [kdsEnabled])

  async function toggleKitchen(item) {
    setSaving(item.id)
    try {
      const {error} = await createClient().from('items').update({ kitchen: !item.kitchen }).eq('id', item.id)
      if (error) throw error
      posData.refresh()
      showToast(item.kitchen ? `${item.name} odstranjen` : `${item.name} dodan v kuhinjo`)
    } catch(e) { showToast(e.message,false) }
    setSaving(null)
  }

  async function markDone(orderId) {
    await createClient().from('orders').update({ status: 'ready' }).eq('id', orderId)
    showToast('Naročilo označeno kot pripravljeno ✓')
  }

  function elapsedMin(createdAt) {
    return Math.floor((now - new Date(createdAt)) / 60000)
  }

  function elapsedColor(min) {
    if (min < 5) return '#1f6b3a'
    if (min < 10) return '#b88c28'
    return '#a83232'
  }

  // Skupni znesek za customer display (zadnje odprto naročilo)
  const lastOrder = kdsOrders[kdsOrders.length - 1]
  const customerTotal = lastOrder
    ? (lastOrder.order_lines || []).reduce((s, l) => s + Number(l.unit_price || 0) * Number(l.qty || 1), 0)
    : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Kuhinja & display</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>KDS prikaz naročil + customer display</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer', background:T.surface, padding:'8px 12px', borderRadius:9, border:'1px solid '+T.line }}>
            <input type="checkbox" checked={kdsEnabled} onChange={e=>setKdsEnabled(e.target.checked)} style={{ accentColor:T.accent, width:15, height:15 }}/>
            🍳 Kuhinjski display
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer', background:T.surface, padding:'8px 12px', borderRadius:9, border:'1px solid '+T.line }}>
            <input type="checkbox" checked={customerDisplay} onChange={e=>setCustomerDisplay(e.target.checked)} style={{ accentColor:T.accent, width:15, height:15 }}/>
            💰 Customer display
          </label>
        </div>
      </div>

      {/* Tabi */}
      <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:9, width:'fit-content' }}>
        {[['kds','🍳 KDS naročila'],['artikli','📋 Artikli za kuhinjo']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ padding:'7px 16px', borderRadius:7, border:'none', background:tab===id?T.header:'transparent', color:tab===id?T.headerInk:T.ink, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
        ))}
      </div>

      {/* KDS TAB */}
      {tab === 'kds' && (
        <div style={{ display:'grid', gridTemplateColumns: customerDisplay ? '1fr 320px' : '1fr', gap:12 }}>

          {/* Naročila */}
          <div>
            {!kdsEnabled ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🍳</div>
                <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>KDS je izklopljen</div>
                <div style={{ fontSize:12, marginTop:6 }}>Vklopi "Kuhinjski display" zgoraj da vidiš aktivna naročila v realnem času</div>
              </div>
            ) : kdsOrders.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, background:'#0d2818', borderRadius:12 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#8FBF8F' }}>Ni aktivnih naročil</div>
                <div style={{ fontSize:12, color:'#4a7c59', marginTop:6 }}>Kuhinja prosta</div>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
                {kdsOrders.map(order => {
                  const min = elapsedMin(order.created_at)
                  const color = elapsedColor(min)
                  const kitchenLines = (order.order_lines || []).filter(l => l.items?.kitchen !== false)
                  if (kitchenLines.length === 0) return null
                  const tableName = order.tables?.name || 'Hitra prodaja'
                  const spaceName = order.tables?.spaces?.name || ''
                  return (
                    <div key={order.id} style={{ background:'#0d2818', borderRadius:12, border:'2px solid '+color+'60', overflow:'hidden' }}>
                      {/* Header naročila */}
                      <div style={{ padding:'10px 14px', background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:16, color:'#f6f1e8' }}>{tableName}</div>
                          {spaceName && <div style={{ fontSize:11, color:'#4a7c59' }}>{spaceName}</div>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:color, animation: min>=10 ? 'pulse 1s infinite' : 'none' }}/>
                          <div style={{ fontSize:20, fontWeight:800, fontVariantNumeric:'tabular-nums', color }}>
                            {min}<span style={{ fontSize:12, color:'#4a7c59' }}>min</span>
                          </div>
                        </div>
                      </div>
                      {/* Artikli */}
                      <div style={{ padding:'10px 14px' }}>
                        {kitchenLines.map((line, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom: i<kitchenLines.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:color, flexShrink:0 }}>
                              {line.qty}×
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:14, fontWeight:600, color:'#f6f1e8' }}>{line.name}</div>
                              {line.note && <div style={{ fontSize:11, color:'#b88c28', marginTop:2 }}>📝 {line.note}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Gumb pripravljeno */}
                      <div style={{ padding:'8px 14px 12px' }}>
                        <button onClick={()=>markDone(order.id)} style={{ width:'100%', padding:'9px', borderRadius:8, background:T.accent, color:'#fff', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>
                          ✓ Pripravljeno
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Customer Display */}
          {customerDisplay && (
            <div style={{ background:'#0d2818', borderRadius:12, padding:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:300 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#4a7c59', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>SKUPAJ</div>
              <div style={{ fontSize:48, fontWeight:900, color:'#e9b949', fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
                {eur(customerTotal)}
              </div>
              {lastOrder && (
                <div style={{ fontSize:13, color:'#4a7c59', marginTop:16 }}>
                  {(lastOrder.order_lines||[]).length} artiklov · {lastOrder.tables?.name || 'Hitra prodaja'}
                </div>
              )}
              {!lastOrder && (
                <div style={{ fontSize:13, color:'#4a7c59', marginTop:12 }}>Dobrodošli!</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ARTIKLI TAB */}
      {tab === 'artikli' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
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
                    {saving===it.id ? '...' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:T.surface2, borderBottom:'1px solid '+T.line }}>
              <div style={{ fontWeight:700, fontSize:13, color:T.muted }}>📋 Ni v kuhinji ({nonKitchenItems.length})</div>
            </div>
            <div style={{ padding:8, maxHeight:400, overflowY:'auto' }}>
              {nonKitchenItems.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>Vsi so v kuhinji</div>}
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
      )}

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
  const [settings, setSettings] = useState({
    autoFurs: true,
    showSkipFurs: true,
    requirePinForSkip: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fursStatus, setFursStatus] = useState(null) // null=loading, true=ok, false=error
  const [lastSync, setLastSync] = useState(null)
  const [testMode, setTestMode] = useState(false)

  useEffect(() => {
    async function load() {
      // Naloži pos_settings iz businesses tabele
      const {data} = await createClient()
        .from('businesses')
        .select('pos_settings')
        .eq('id', BUSINESS_ID)
        .single()

      if (data?.pos_settings?.furs) {
        setSettings(s => ({ ...s, ...data.pos_settings.furs }))
      }

      // Preveri FURS status
      try {
        const res = await fetch('/api/furs/status')
        if (res.ok) {
          const d = await res.json()
          setFursStatus(d.connected)
          setLastSync(d.lastSync || null)
          setTestMode(d.testMode || false)
        } else {
          setFursStatus(false)
        }
      } catch {
        setFursStatus(false)
      }
    }
    load()
  }, [])

  async function save(newSettings) {
    setSaving(true)
    try {
      // Naloži obstoječe pos_settings
      const {data} = await createClient()
        .from('businesses')
        .select('pos_settings')
        .eq('id', BUSINESS_ID)
        .single()

      const existing = data?.pos_settings || {}
      const updated = { ...existing, furs: newSettings }

      const {error} = await createClient()
        .from('businesses')
        .update({ pos_settings: updated })
        .eq('id', BUSINESS_ID)

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) {
      console.error(e)
    }
    setSaving(false)
  }

  function toggle(key) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    save(next)
  }

  const statusColor = fursStatus === null ? T.muted : fursStatus ? T.accent : T.danger
  const statusLabel = fursStatus === null ? 'Preverjam...' : fursStatus ? 'POVEZANO' : 'NI POVEZAVE'
  const statusBg = fursStatus === null ? T.surface3 : fursStatus ? T.accentSoft : 'rgba(168,50,50,0.1)'

  return (
    <div style={{ maxWidth:580 }}>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>FURS & DDV</div>

      {/* Status kartice */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>FURS davčna potrditev</div>
            {lastSync && <div style={{ fontSize:12, color:T.muted, marginTop:3 }}>Zadnja sinhronizacija: {lastSync}</div>}
          </div>
          <span style={{ fontSize:11, fontWeight:800, padding:'5px 12px', borderRadius:6, background:statusBg, color:statusColor, letterSpacing:'0.06em' }}>
            {statusLabel}
          </span>
        </div>

        {/* Info blok */}
        <div style={{ padding:'12px 14px', background:T.surface2, borderRadius:9, fontSize:12, color:T.muted, lineHeight:1.6 }}>
          {fursStatus ? (
            <>
              <div style={{ color:T.ink, fontWeight:600, marginBottom:4 }}>
                {testMode ? '🧪 TEST način (FURS Playground)' : '✅ Produkcijski način'}
              </div>
              Certifikat je aktiven. Računi se davčno potrjujejo pri FURS.<br/>
              Za zamenjavo certifikata ali spremembo poslovnih prostorov pojdi v <b>Računko → Nastavitve → FURS</b>
            </>
          ) : fursStatus === false ? (
            <>
              <div style={{ color:T.danger, fontWeight:600, marginBottom:4 }}>⚠️ FURS ni dosegljiv</div>
              Certifikat morda ni nastavljen ali je potekel. Preveri nastavitve v <b>Računko → Nastavitve → FURS</b>
            </>
          ) : (
            'Preverjam FURS povezavo...'
          )}
        </div>
      </div>

      {/* POS nastavitve */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>POS nastavitve</span>
          {saved && <span style={{ fontSize:11, color:T.accent, fontWeight:600 }}>✓ Shranjeno</span>}
        </div>

        {[
          {
            key: 'autoFurs',
            label: 'Privzeto davčno potrdi vsak račun',
            desc: 'Checkbox "Davčno potrdi" je privzeto označen pri plačilu',
            icon: '✅'
          },
          {
            key: 'showSkipFurs',
            label: 'Pokaži gumb "Tiskaj brez FURS" v plačilu',
            desc: 'Omogoči blagajniku da izda račun brez davčne potrditve (npr. za interne).',
            icon: '🖨️'
          },
          {
            key: 'requirePinForSkip',
            label: 'Zahteva potrditev PIN za netiskane račune',
            desc: 'Blagajnik mora vnesti PIN vodja/lastnik za vsak račun brez FURS',
            icon: '🔐'
          },
        ].map(opt => (
          <div key={opt.key} onClick={()=>toggle(opt.key)}
            style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 0', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
            <div style={{ marginTop:2 }}>
              <div style={{ width:22, height:22, borderRadius:6, background: settings[opt.key] ? T.accent : T.surface3, border: '2px solid '+(settings[opt.key]?T.accent:T.line), display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                {settings[opt.key] && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L20 6"/></svg>}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>
                <span style={{ marginRight:6 }}>{opt.icon}</span>{opt.label}
              </div>
              <div style={{ fontSize:11, color:T.muted, marginTop:3, lineHeight:1.5 }}>{opt.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DDV stopnje info */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>DDV stopnje (Slovenia)</div>
        {[
          { rate:'0%', label:'Oproščeno', desc:'Boni, vrednostni kuponi, finančne storitve', color:'#64748b' },
          { rate:'9,5%', label:'Nižja stopnja', desc:'Hrana in pijača (za s seboj), hotelske storitve, kulturne prireditve', color:'#3a6e8f' },
          { rate:'22%', label:'Splošna stopnja', desc:'Večina storitev in blaga — fitnes, fizioterapija, oblačila...', color:'#1f6b3a' },
        ].map(d => (
          <div key={d.rate} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:'1px solid '+T.lineSoft }}>
            <div style={{ width:48, textAlign:'center', fontWeight:800, fontSize:16, color:d.color, fontVariantNumeric:'tabular-nums' }}>{d.rate}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>{d.label}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{d.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop:12, fontSize:11, color:T.muted, lineHeight:1.5 }}>
          💡 DDV stopnjo nastavljaš za vsak artikel posebej v <b>Kategorije & Artikli</b>
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
                  <span key={n} style={{ display:'inline-block', margin:'2px 3px 2px 0', padding:'2px 7px', borderRadius:5, background: selected ? T.accentSoft : T.surface3, color: selected ? T.accent : T.muted, fontSize:10, fontWeight:600, }}>{({floor:"Prostori",sale:"Prodaja",calendar:"Koledar",customers:"Stranke",packages:"Paketi",inventory:"Zaloga",reports:"Poročila",admin:"Nastavitve"})[n]||n}</span>
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
// BELL NOTIFICATIONS
// ================================================================
function BellNotifications({ notifications, notifOpen, setNotifOpen, posData, orderListOpen, setOrderListOpen }) {
  const unread = notifications.filter(n => !n.read && !n.dismissed)
  const lowItems = posData.items.filter(i => i.stock !== null && i.low_stock > 0 && i.stock <= i.low_stock)
  const lowIngr = posData.ingredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  const sevColor = { danger:T.danger, warning:T.warn, info:T.accent }

  async function dismiss(id) {
    await createClient().from('pos_notifications').update({ dismissed:true }).eq('id', id)
    posData.refresh()
  }

  async function markAllRead() {
    await createClient().from('pos_notifications').update({ read:true }).eq('business_id', BUSINESS_ID).eq('dismissed', false)
    posData.refresh()
  }

  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setNotifOpen(o=>!o)} style={{ position:'relative', width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T.headerInk }}>
        <KI name="bell" size={18}/>
        {unread.length > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4, width:18, height:18, borderRadius:'50%', background:T.danger, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid '+T.header }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {notifOpen && (
        <>
          <div onClick={()=>setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:44 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:45, width:360, maxHeight:480, background:'#fff', color:T.ink, borderRadius:13, boxShadow:'0 16px 48px rgba(0,0,0,0.22)', border:'1px solid '+T.line, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid '+T.line, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Opozorila <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>({unread.length} novih)</span></div>
              {unread.length > 0 && <button onClick={markAllRead} style={{ fontSize:11, color:T.accent, background:'none', border:0, cursor:'pointer', fontWeight:600 }}>Označi vse kot prebrano</button>}
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {notifications.length === 0 && (
                <div style={{ padding:32, textAlign:'center', color:T.muted, fontSize:13 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🎉</div>
                  Ni aktivnih opozoril
                </div>
              )}
              {notifications.map(n => (
                <div key={n.id} style={{ padding:'12px 16px', borderBottom:'1px solid '+T.lineSoft, background:n.read?T.surface:T.surface2, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:sevColor[n.severity]||T.muted, marginTop:5, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight: n.read?400:600, lineHeight:1.4 }}>{n.message}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{new Date(n.created_at).toLocaleDateString('sl-SI')}</div>
                  </div>
                  <button onClick={()=>dismiss(n.id)} title="Opusti" style={{ background:'none', border:0, cursor:'pointer', color:T.muted, padding:2, flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
            {notifications.length > 0 && (
              <div style={{ padding:'10px 16px', borderTop:'1px solid '+T.line }}>
                {(lowItems.length + lowIngr.length) > 0 && (
                  <button onClick={()=>{setOrderListOpen(true);setNotifOpen(false)}} style={{ width:'100%', padding:'8px', borderRadius:8, background:T.accent, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, color:'#fff', marginBottom:6 }}>Narocilnica ({lowItems.length + lowIngr.length})</button>
                )}
                <button onClick={async()=>{ await createClient().from('pos_notifications').update({dismissed:true}).eq('business_id',BUSINESS_ID); posData.refresh(); setNotifOpen(false) }}
                  style={{ width:'100%', padding:'8px', borderRadius:8, background:T.surface2, border:'1px solid '+T.line, cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12, color:T.muted }}>
                  Počisti vse
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================
// ORDER LIST MODAL
// ================================================================
function OrderListModal({ posData, onClose }) {
  const low = posData.items.filter(i => i.stock !== null && i.low_stock > 0 && i.stock <= i.low_stock)
  const lowI = posData.ingredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  return (
    <Modal open onClose={onClose} width={600}>
      <ModalHeader title="Narocilnica" onClose={onClose}/>
      <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
        <div style={{ fontSize:13, color:T.muted, marginBottom:16 }}>Artikli in surovine pod minimalno zalogo</div>
        {low.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>ARTIKLI</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                {['Artikel','Trenutno','Min','Manjka'].map((h,i)=>(<th key={i} style={{ padding:'8px 10px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>))}
              </tr></thead>
              <tbody>{low.map((it,i)=>(
                <tr key={it.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                  <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13, color:T.ink }}>{it.name}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:it.stock===0?T.danger:T.warn, fontWeight:700 }}>{it.stock} {it.unit||'kos'}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:T.muted, fontSize:12 }}>{it.low_stock}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:T.danger }}>{it.low_stock - it.stock} {it.unit||'kos'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {lowI.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>SUROVINE</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                {['Surovina','Trenutno','Min','Manjka'].map((h,i)=>(<th key={i} style={{ padding:'8px 10px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>))}
              </tr></thead>
              <tbody>{lowI.map((ig,i)=>(
                <tr key={ig.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                  <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{ig.name}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:ig.stock_qty===0?T.danger:T.warn, fontWeight:700 }}>{ig.stock_qty} {ig.unit||'kos'}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:T.muted, fontSize:12 }}>{ig.min_stock}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:T.danger }}>{(ig.min_stock||0) - ig.stock_qty} {ig.unit||'kos'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={()=>window.print()} style={{ padding:'8px 18px', borderRadius:8, background:T.accent, border:'none', color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Natisni</button>
        </div>
      </div>
    </Modal>
  )
}
// ================================================================
// CUSTOMER EDIT BUTTON + MODAL
// ================================================================
function CustomerEditButton({ customer, onSave }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)

  function openModal() {
    setData({ ...customer })
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const {error} = await createClient().from('customers').update({
        name: data.name, phone: data.phone, email: data.email,
        birth_date: data.birth_date||null, address: data.address||null,
        notes: data.notes||null, gender: data.gender||null,
        marketing_consent: !!data.marketing_consent,
        notification_email: data.notification_email !== false,
      }).eq('id', customer.id)
      if (error) throw error
      setOpen(false); onSave()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <>
      <button onClick={openModal} style={{ ...btnS, padding:'9px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
        <KI name="edit" size={14}/> Uredi profil
      </button>
      <Modal open={open} onClose={()=>setOpen(false)} width={460}>
        <ModalHeader title="Uredi profil stranke" onClose={()=>setOpen(false)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'70vh', overflowY:'auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Ime in priimek *"><input value={data?.name||''} onChange={e=>setData(p=>({...p,name:e.target.value}))} style={inp}/></Field>
            <Field label="Spol">
              <select value={data?.gender||''} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
                <option value="">—</option>
                <option value="m">Moški</option>
                <option value="f">Ženski</option>
                <option value="other">Drugo</option>
              </select>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Telefon"><input value={data?.phone||''} onChange={e=>setData(p=>({...p,phone:e.target.value}))} style={inp}/></Field>
            <Field label="Datum rojstva"><input type="date" value={data?.birth_date||''} onChange={e=>setData(p=>({...p,birth_date:e.target.value}))} style={inp}/></Field>
          </div>
          <Field label="Email"><input type="email" value={data?.email||''} onChange={e=>setData(p=>({...p,email:e.target.value}))} style={inp}/></Field>
          <Field label="Naslov"><input value={data?.address||''} onChange={e=>setData(p=>({...p,address:e.target.value}))} placeholder="Ulica 1, 1000 Ljubljana" style={inp}/></Field>
          <Field label="Interne opombe">
            <textarea value={data?.notes||''} onChange={e=>setData(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical' }} placeholder="Alergije, preference, posebnosti..."/>
          </Field>
          <div style={{ display:'flex', gap:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={data?.notification_email!==false} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Email obvestila (izteki kart)
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={!!data?.marketing_consent} onChange={e=>setData(p=>({...p,marketing_consent:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Privolitev za marketing
            </label>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setOpen(false)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ================================================================
// SELL PACKAGE MODAL — prodaja paketa stranki
// ================================================================
function SellPackageModal({ template, posData, onClose, auth }) {
  const [customerId, setCustomerId] = useState(template?._preselectedCustomer?.id || '')
  const [custSearch, setCustSearch] = useState('')
  const [activationType, setActivationType] = useState(template.activation_type||'purchase')
  const [fixedDate, setFixedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const tconf = TEMPLATE_TYPES[template.template_type||'visits'] || TEMPLATE_TYPES.visits

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const filtCust = posData.customers.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||'').includes(custSearch))
  const selCust = posData.customers.find(c => c.id === customerId)

  function calcExpiry() {
    let start = new Date()
    if (activationType === 'fixed_date' && fixedDate) start = new Date(fixedDate)
    if (template.validity_days) {
      const exp = new Date(start)
      exp.setDate(exp.getDate() + Number(template.validity_days))
      return exp.toISOString().split('T')[0]
    }
    if (template.fixed_end_date) return template.fixed_end_date
    return null
  }

  async function sell() {
    if (!customerId) { showToast('Izberi stranko',false); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const expiresAt = calcExpiry()
      const payload = {
        customer_id: customerId,
        template_id: template.id,
        template_type: template.template_type||'visits',
        activation_type: activationType,
        name: template.name,
        active: true,
        remaining: template.visits||null,
        total: template.visits||null,
        monetary_balance: template.monetary_value||null,
        expires: expiresAt,
        activated_at: activationType === 'purchase' ? now : null,
        valid_from: activationType === 'fixed_date' && fixedDate ? fixedDate : null,
        purchase_price: template.price,
        notes: notes||null,
        sold_by_staff_id: auth?.user?.id||null,
      }
      const {error} = await createClient().from('customer_packages').insert(payload)
      if (error) throw error

      // Ustvari naročilo + plačilo
      const orderId = await posData.refresh ? null : null
      showToast(`✓ ${template.name} prodana stranki ${selCust?.name}`)
      setTimeout(() => { posData.refresh(); onClose() }, 1500)
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  return (
    <Modal open={true} onClose={onClose} width={500}>
      <ModalHeader title={`Prodaj: ${template.name}`} onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Info kartica */}
        <div style={{ padding:14, borderRadius:10, background:tconf.color+'10', border:'1px solid '+tconf.color+'30', display:'flex', gap:12 }}>
          <div style={{ fontSize:28 }}>{tconf.icon}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>{template.name}</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>💰 {eur(template.price)}</span>
              {template.validity_days && <span>📅 {template.validity_days} dni</span>}
              {template.visits && <span>🎯 {template.visits} obiskov</span>}
              {template.monetary_value && <span>💳 vrednost {eur(template.monetary_value)}</span>}
            </div>
          </div>
        </div>

        {/* Stranka */}
        <Field label="Stranka *">
          {selCust ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:T.accentSoft, borderRadius:9 }}>
              <div style={{ flex:1, fontWeight:600, color:T.accent }}>{selCust.name} {selCust.phone && `· ${selCust.phone}`}</div>
              <button onClick={()=>setCustomerId('')} style={{ background:'none', border:0, cursor:'pointer', color:T.accent }}><KI name="x" size={14}/></button>
            </div>
          ) : (
            <>
              <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Išči stranko po imenu ali telefonu..." style={{ ...inp, marginBottom:6 }}/>
              <div style={{ maxHeight:160, overflowY:'auto', border:'1px solid '+T.line, borderRadius:8, background:T.surface }}>
                {filtCust.slice(0,8).map(c=>(
                  <button key={c.id} onClick={()=>{setCustomerId(c.id);setCustSearch('')}} style={{ width:'100%', padding:'9px 12px', background:'transparent', border:0, borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', fontSize:13, display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 }}>{c.name.split(' ').map(w=>w[0]).join('')}</div>
                    <div><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:11, color:T.muted }}>{c.phone}</div></div>
                  </button>
                ))}
                {filtCust.length === 0 && <div style={{ padding:16, textAlign:'center', color:T.muted, fontSize:12 }}>Ni strank</div>}
              </div>
            </>
          )}
        </Field>

        {/* Aktivacija */}
        <Field label="Začetek veljavnosti">
          <div style={{ display:'flex', gap:5 }}>
            {Object.entries(ACTIVATION_TYPES).map(([k,v])=>{
              const sel = activationType === k
              return <button key={k} onClick={()=>setActivationType(k)} style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:sel?T.accent:T.surface3, color:sel?'#fff':T.muted }}>{v}</button>
            })}
          </div>
          {activationType === 'fixed_date' && (
            <input type="date" value={fixedDate} onChange={e=>setFixedDate(e.target.value)} style={{ ...inp, marginTop:6 }}/>
          )}
        </Field>

        {/* Datum izteka — preview */}
        {calcExpiry() && (
          <div style={{ padding:'10px 14px', background:T.surface2, borderRadius:9, fontSize:12, color:T.muted }}>
            📅 Poteče: <b style={{ color:T.ink }}>{new Date(calcExpiry()).toLocaleDateString('sl-SI')}</b>
            {activationType === 'first_use' && <span style={{ color:T.warn }}> (šteje od prvega obisku)</span>}
          </div>
        )}

        <Field label="Opomba (neobvezno)">
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Posebnosti, dogovor..." style={inp}/>
        </Field>

        {toast && <div style={{ padding:'9px 12px', borderRadius:8, background:toast.ok?T.accentSoft:'rgba(168,50,50,0.10)', color:toast.ok?T.accent:T.danger, fontSize:12, fontWeight:600 }}>{toast.msg}</div>}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={sell} disabled={saving||!customerId} style={{ ...btnP, background:tconf.color, opacity:(saving||!customerId)?0.5:1 }}>
            {saving ? '⏳ Shranjujem...' : `✓ Prodaj ${eur(template.price)}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

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
  const [activePremise, setActivePremiseState] = useState(getActivePremise())
  const [activeDevice, setActiveDeviceState] = useState(getActiveDevice())
  const [showPremiseSelect, setShowPremiseSelect] = useState(!getActivePremise() && false)
  const [activeTable, setActiveTable] = useState(null)
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [happyHourActive, setHappyHourActive] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [cashSession, setCashSession] = React.useState(null)
  const [sessionLoaded, setSessionLoaded] = React.useState(false)
  const [showOpenCash, setShowOpenCash] = React.useState(false)
  const [showXReport, setShowXReport] = React.useState(false)
  const [showCloseCash, setShowCloseCash] = React.useState(false)

  React.useEffect(() => {
    getCurrentSession().then(s => {
      setCashSession(s)
      setSessionLoaded(true)
      if (!s) setShowOpenCash(true)
    })
  }, [])

  function refreshSession() {
    getCurrentSession().then(s => setCashSession(s))
  }
  const [now, setNow] = useState(new Date())
  const [notifOpen, setNotifOpen] = useState(false)
  const [orderListOpen, setOrderListOpen] = useState(false)
  const [sellPackageModal, setSellPackageModal] = useState(null)

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
          {activePremise && <div style={{ fontSize:10, fontWeight:700, color:'#e9b949', background:'rgba(233,185,73,0.15)', padding:'4px 8px', borderRadius:6, letterSpacing:'0.04em' }}>📍 {activePremise.premise_id}</div>}
          <BellNotifications notifications={posData.notifications} notifOpen={notifOpen} setNotifOpen={setNotifOpen} posData={posData} orderListOpen={orderListOpen} setOrderListOpen={setOrderListOpen}/>
          {orderListOpen && <OrderListModal posData={posData} onClose={()=>setOrderListOpen(false)}/>}
          {cashSession && (
            <button onClick={()=>setShowXReport(true)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(37,99,235,0.15)', color:'#2563eb', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
              X-poročilo
            </button>
          )}
          {cashSession
            ? <button onClick={CloseCash(true)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(168,50,50,0.15)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
                🔒 Zaključi
              </button>
            : <button onClick={()=>setShowOpenCash(true)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
                🔓 Odpri
              </button>
          }
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
          {screen==='customers' && <CustomersScreen posData={posData} setActiveCustomer={setActiveCustomer} setScreen={setScreen} setSellPackageModal={setSellPackageModal}/>}
          {screen==='packages'  && <PackagesScreen posData={posData} setSellPackageModal={setSellPackageModal}/>}
          {screen==='inventory' && <InventoryScreen posData={posData}/>}
          {screen==='orders'    && <OrdersScreen posData={posData} auth={auth}/>}
          {screen==='reports'   && <ReportsScreen posData={posData} auth={auth}/>}
          {screen==='admin'     && <AdminScreen auth={auth} posData={posData}/>}
        </div>
      </div>

      <PaymentModal open={paymentOpen} total={typeof paymentOpen==='object'&&paymentOpen.splitLines ? paymentOpen.splitLines.reduce((s,l)=>s+l.price*l.qty,0)*(1-(paymentOpen.discount||0)/100) : totals.total} cart={typeof paymentOpen==='object'&&paymentOpen.splitLines ? paymentOpen.splitLines : cart} activeTable={activeTable} activeCustomer={activeCustomer} auth={auth}
        onCancel={() => setPaymentOpen(false)}
        onComplete={(data) => {
          const po = paymentOpen
          setPaymentOpen(false)
          setReceipt(data)
          if(typeof po==='object' && po.splitLines && po.onSplitPaid) {
            po.onSplitPaid(po.splitLines.map(l=>l.lineId))
          } else {
            setCart([])
            setActiveTable(null)
          }
          posData.refresh()
        }}/>
      <ReceiptToast data={receipt} onClose={() => setReceipt(null)}/>
      {sellPackageModal && <SellPackageModal template={sellPackageModal} posData={posData} onClose={()=>setSellPackageModal(null)} auth={auth}/>}
      {showOpenCash && <OpenCashModal posData={posData} auth={auth} onClose={()=>setShowOpenCash(false)} onOpened={(s)=>{ setCashSession(s); setShowOpenCash(false) }}/>}
      {showXReport && cashSession && <XReportModal session={cashSession} posData={posData} auth={auth} onClose={()=>setShowXReport(false)}/>}
      {showCloseCash && cashSession && <CloseCashModal session={cashSession} posData={posData} auth={auth} onClose={()=>setShowCloseCash(false)} onClosed={()=>{ setCashSession(null); refreshSession() }}/>}
      {sessionLoaded && !cashSession && !showOpenCash && (
        <Modal open width={340}>
          <div style={{ padding:'32px 24px', textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Blagajna je zaprta</div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:20 }}>Pred začetkom prodaje odprite blagajno in vnesite začetno gotovino.</div>
            <button onClick={()=>setShowOpenCash(true)} style={{ width:'100%', padding:'13px', borderRadius:10, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:14 }}>
              🔓 Odpri blagajno
            </button>
          </div>
        </Modal>
      )}
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

