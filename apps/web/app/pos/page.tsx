// @ts-nocheck
'use client'
export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
// PODATKI
// ================================================================
const D = {
  business: { name: 'ŠIRM fitness&bar', location: 'Gorenja vas' },
  today: { promet: 487.40, racuni: 34, averageBill: 14.33, tipsTotal: 28.50, hourlySales: [12,38,52,41,84,92,168] },
  profiles: [
    { id: 'all', name: 'Vse v enem', icon: '🌐', nav: ['floor','sale','calendar','customers','packages','inventory','reports','admin'] },
    { id: 'storitve', name: 'Storitve', icon: '💆', nav: ['calendar','customers','packages','sale','reports','admin'] },
    { id: 'bar', name: 'Bar / Kavarna', icon: '🍺', nav: ['floor','sale','customers','inventory','reports','admin'] },
  ],
  categories: [
    { id: 'cat-fav', name: 'Priljubljeno', icon: '★', color: '#E9B949' },
    { id: 'cat-kava', name: 'Kava', icon: '☕', color: '#8B5E3C' },
    { id: 'cat-pijaca', name: 'Pijača', icon: '🍺', color: '#D4A017' },
    { id: 'cat-hrana', name: 'Hrana', icon: '🍽', color: '#C26A3A' },
    { id: 'cat-fitness', name: 'Fitness', icon: '💪', color: '#1f6b3a' },
  ],
  items: [
    { id: 'p01', cat: 'cat-kava', name: 'Espresso', price: 1.60, fav: true, code: 'K01', stock: 999 },
    { id: 'p02', cat: 'cat-kava', name: 'Cappuccino', price: 2.40, fav: true, code: 'K04', stock: 999 },
    { id: 'p03', cat: 'cat-kava', name: 'Latte macchiato', price: 2.80, fav: false, code: 'K05', stock: 999 },
    { id: 'p11', cat: 'cat-pijaca', name: 'Laško 0,5', price: 3.20, fav: true, code: 'P01', stock: 40 },
    { id: 'p12', cat: 'cat-pijaca', name: 'Radler 0,5', price: 3.20, fav: false, code: 'P04', stock: 20 },
    { id: 'p21', cat: 'cat-hrana', name: 'Burger klasik', price: 9.80, fav: true, code: 'H01', stock: 12, kitchen: true },
    { id: 'p22', cat: 'cat-hrana', name: 'Krompirček', price: 3.80, fav: true, code: 'H03', stock: 999, kitchen: true },
    { id: 'p31', cat: 'cat-fitness', name: 'Dnevna vstopnica', price: 7.00, fav: false, code: 'F01', stock: 999 },
    { id: 'p32', cat: 'cat-fitness', name: 'PT 1:1 (60min)', price: 50.00, fav: false, code: 'F02', stock: 999, bookable: true },
    { id: 'p33', cat: 'cat-fitness', name: 'Fizioterapija', price: 60.00, fav: false, code: 'F03', stock: 999, bookable: true },
    { id: 'p34', cat: 'cat-fitness', name: 'Masaža 60min', price: 40.00, fav: false, code: 'F04', stock: 999, bookable: true },
  ],
  paymentMethods: [
    { id: 'cash', name: 'Gotovina', icon: '💶' },
    { id: 'card', name: 'Kartica', icon: '💳' },
    { id: 'bon', name: 'Bon', icon: '🎫' },
    { id: 'prep', name: 'Predplačilo', icon: '💰' },
  ],
  tips: [0, 5, 10, 15],
  spaces: [
    { id: 'sp-bar', name: 'Bar', color: '#8FBF8F', tables: [
      { id: 't1', name: 'B1', seats: 2, x: 8, y: 12, status: 'free' },
      { id: 't2', name: 'B2', seats: 4, x: 8, y: 42, status: 'occupied', order: 14.80, since: '19:12', server: 'Ana' },
      { id: 't3', name: 'B3', seats: 4, x: 40, y: 18, status: 'needs_attention', order: 32.40, since: '18:48', server: 'Luka' },
      { id: 't4', name: 'B4', seats: 6, x: 40, y: 55, status: 'free' },
      { id: 't5', name: 'B5', seats: 2, x: 72, y: 30, status: 'reserved', reservedFor: '20:00 Novak' },
    ]},
    { id: 'sp-terasa', name: 'Terasa', color: '#B8956A', tables: [
      { id: 'n1', name: 'T1', seats: 4, x: 12, y: 18, status: 'occupied', order: 22.10, since: '19:02', server: 'Ana' },
      { id: 'n2', name: 'T2', seats: 4, x: 42, y: 18, status: 'free' },
      { id: 'n3', name: 'T3', seats: 2, x: 72, y: 18, status: 'free' },
    ]},
  ],
  staff: [
    { id: 's1', name: 'Nik Mahnič', role: 'Lastnik', pin: '1234', color: '#1f6b3a',
      permissions: { sale:true, manageBookings:true, viewMembers:true, editPrices:true, viewReports:true, viewSales:true, editSpaces:true, manageStaff:true } },
    { id: 's2', name: 'Ana Kovač', role: 'Blagajnik', pin: '4567', color: '#7b61b8',
      permissions: { sale:true, manageBookings:true, viewMembers:true, editPrices:false, viewReports:false, viewSales:false, editSpaces:false, manageStaff:false } },
    { id: 's3', name: 'Luka Novak', role: 'Trener', pin: '3456', color: '#3a6e8f',
      permissions: { sale:false, manageBookings:true, viewMembers:true, editPrices:false, viewReports:false, viewSales:false, editSpaces:false, manageStaff:false } },
  ],
  masterPin: '9999',
  rolePresets: {
    Lastnik: { sale:true, manageBookings:true, viewMembers:true, editPrices:true, viewReports:true, viewSales:true, editSpaces:true, manageStaff:true },
    Vodja: { sale:true, manageBookings:true, viewMembers:true, editPrices:true, viewReports:true, viewSales:true, editSpaces:true, manageStaff:false },
    Blagajnik: { sale:true, manageBookings:true, viewMembers:true, editPrices:false, viewReports:false, viewSales:false, editSpaces:false, manageStaff:false },
    Trener: { sale:false, manageBookings:true, viewMembers:true, editPrices:false, viewReports:false, viewSales:false, editSpaces:false, manageStaff:false },
  },
  autoLockOptions: [
    { id: 'never', label: 'Nikoli', ms: 0 },
    { id: '15s', label: '15 sekund', ms: 15000 },
    { id: '30s', label: '30 sekund', ms: 30000 },
    { id: '1m', label: '1 minuta', ms: 60000 },
    { id: '5m', label: '5 minut', ms: 300000 },
  ],
  customers: [
    { id: 'c1', name: 'Marko Novak', phone: '041 234 567', email: 'marko@example.si',
      tier: 'Zlato', points: 320, prepaid: 45.00, visits: 47, spent: 1284.50, avg: 27.32, since: 'apr 2023',
      lastVisit: '10.5.',
      packages: [{ name: 'Paket 10× fizio', remaining: 6, total: 10, expires: '2026-08-15' }],
      history: [{ date: '10.5.', desc: 'Fizioterapija', amount: 0, type: 'package' }] },
    { id: 'c2', name: 'Eva Horvat', phone: '031 887 211', email: 'eva@example.si',
      tier: 'Srebro', points: 84, prepaid: 0, visits: 22, spent: 412.00, avg: 18.72, since: 'sep 2024',
      lastVisit: '13.5.',
      packages: [{ name: 'Mesečna karta', remaining: 14, total: 30, expires: '2026-05-28' }],
      history: [{ date: '13.5.', desc: 'Fitness vstop', amount: 0, type: 'package' }] },
    { id: 'c3', name: 'Janez Krajnc', phone: '040 901 122', email: null,
      tier: 'Bron', points: 12, prepaid: 20.00, visits: 4, spent: 67.20, avg: 16.80, since: 'feb 2026',
      lastVisit: '22.4.',
      packages: [], history: [] },
  ],
  bookings: [
    { id: 'b1', date: '2026-05-20', time: '09:00', duration: 60, customerId: 'c1', staffId: 's1', itemId: 'p33', status: 'confirmed', reminderSent: true },
    { id: 'b2', date: '2026-05-20', time: '10:30', duration: 60, customerId: 'c2', staffId: 's3', itemId: 'p32', status: 'confirmed', reminderSent: true },
    { id: 'b3', date: '2026-05-20', time: '14:00', duration: 60, customerId: 'c3', staffId: 's1', itemId: 'p34', status: 'tentative', reminderSent: false },
  ],
  packageTemplates: [
    { id: 'pk1', name: 'Mesečna neomejena', price: 45.00, type: 'unlimited', validityDays: 30, desc: 'Neomejeno obiskov 30 dni.' },
    { id: 'pk2', name: '10× vstopnica', price: 80.00, type: 'visits', visits: 10, validityDays: 90, desc: '10 vstopov, 3 mesece.' },
    { id: 'pk3', name: 'Letna karta', price: 420.00, type: 'unlimited', validityDays: 365, desc: 'Vse storitve celo leto.' },
    { id: 'pk4', name: 'Jutro (6–12h)', price: 30.00, type: 'time-restricted', validityDays: 30, hoursFrom: '06:00', hoursTo: '12:00', desc: 'Samo jutranji termini.' },
  ],
  services: [
    { id: 'sv1', name: 'PT 1:1', color: '#3a6e8f', durationMin: 60, price: 50 },
    { id: 'sv2', name: 'Fizioterapija', color: '#1f6b3a', durationMin: 60, price: 60 },
    { id: 'sv3', name: 'Masaža', color: '#7b61b8', durationMin: 60, price: 40 },
    { id: 'sv4', name: 'Skupinska vadba', color: '#e9b949', durationMin: 60, price: 15 },
  ],
  refunds: [
    { id: 'r1', original: 'RAČ-1142', amount: -8.40, date: '14.5.', time: '12:24', cashier: 'Ana', reason: 'Napačno naročilo' },
  ],
  permissionGroups: [
    { title: 'Blagajna & Prodaja', items: [['sale','Prodaja'],['manualDiscount','Ročni popust'],['refund','Vračilo'],['dailyClose','Dnevni zaključek']] },
    { title: 'Člani & Termini', items: [['viewMembers','Poglej člane'],['manageBookings','Upravljaj termine']] },
    { title: 'Finance', items: [['viewSales','Poglej promet'],['viewReports','Poglej poročila']] },
    { title: 'Nastavitve', items: [['editPrices','Uredi cenik'],['editSpaces','Prostori & mize'],['manageStaff','Zaposleni']] },
  ],
}

// ================================================================
// HELPERS
// ================================================================
const eur = (v) => '€ ' + Number(v).toFixed(2).replace('.', ',')

const H = {
  itemsIn: (catId) => catId === 'cat-fav' ? D.items.filter(i => i.fav) : D.items.filter(i => i.cat === catId),
  lineTotal: (l) => (l.price + (l.mods||[]).reduce((s,m)=>s+(m.delta||0),0)) * l.qty,
  orderTotals: (cart) => {
    const sub = cart.reduce((s,l)=>s+H.lineTotal(l),0)
    return { sub, ddv: sub-sub/1.22, total: sub }
  },
  customer: (id) => D.customers.find(c=>c.id===id),
  itemOf: (id) => D.items.find(i=>i.id===id),
  profile: (id) => D.profiles.find(p=>p.id===id)||D.profiles[0],
  memberStatus: (c) => {
    if (!c.packages || c.packages.length === 0) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const pkg = c.packages[0]
    const today = new Date()
    const expires = new Date(pkg.expires)
    const daysToExpiry = Math.floor((expires-today)/86400000)
    const remainingVisits = pkg.remaining
    let status = 'active'
    if (daysToExpiry < 0) status = 'expired'
    else if (daysToExpiry <= 3) status = 'critical'
    else if (daysToExpiry <= 7) status = 'expiring'
    else if (remainingVisits <= 1) status = 'critical'
    else if (remainingVisits <= 2) status = 'expiring'
    return { status, remainingVisits, daysToExpiry }
  },
  computeNotifications: (resolved) => {
    const notifs = []
    D.customers.forEach(c => {
      const ms = H.memberStatus(c)
      const id = 'n-' + c.id
      if (resolved[id]) return
      if (ms.status === 'expired') {
        notifs.push({ id, kind: 'member', severity: 'red', customerName: c.name, title: 'Članstvo poteklo', detail: 'Zahteva podaljšanje.', actions: ['extend','inactive'] })
      } else if (ms.status === 'critical') {
        notifs.push({ id, kind: 'member', severity: 'orange', customerName: c.name, title: ms.daysToExpiry !== null ? `Poteče čez ${ms.daysToExpiry} dni` : `Ostane ${ms.remainingVisits} obisk`, detail: 'Kmalu bo potrebno podaljšanje.', actions: ['extend','dismiss'] })
      } else if (ms.status === 'expiring') {
        notifs.push({ id, kind: 'member', severity: 'yellow', customerName: c.name, title: ms.daysToExpiry !== null ? `Poteče čez ${ms.daysToExpiry} dni` : `Ostaneta ${ms.remainingVisits} obiski`, detail: 'Priporočamo pravočasno podaljšanje.', actions: ['extend','dismiss'] })
      }
    })
    return notifs
  },
}

// ================================================================
// IKONE
// ================================================================
const KI = ({ name, size = 18, strokeWidth = 1.7 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    x: <><path d="M6 6l12 12M18 6L6 18"/></>,
    chev: <path d="m9 6 6 6-6 6"/>,
    chevL: <path d="m15 6-6 6 6 6"/>,
    chevD: <path d="m6 9 6 6 6-6"/>,
    chair: <><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 10h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"/><path d="M7 17v3M17 17v3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M14 20c0-2 2-4 4-4s4 2 4 4"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
    print: <><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>,
    percent: <><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></>,
    check: <path d="m5 13 4 4L20 6"/>,
    bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
    package: <><path d="M16 3l5 3v12l-9 5-9-5V6l5-3M3 6l9 5 9-5M12 11v10"/></>,
    phone: <><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    pin: <><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    add_user: <><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-7 6-7s6 3 6 7"/><path d="M19 8v6M22 11h-6"/></>,
    split: <><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-5M20 17h-5"/></>,
    home: <><path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2v-9z"/></>,
    money: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    refund: <><path d="M3 9h13a5 5 0 0 1 0 10H6"/><path d="m7 5-4 4 4 4"/></>,
    barcode: <><path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14"/></>,
    swap: <><path d="M7 4 3 8l4 4"/><path d="M3 8h12a4 4 0 0 1 4 4"/><path d="M17 20l4-4-4-4"/><path d="M21 16H9a4 4 0 0 1-4-4"/></>,
    happy: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></>,
    fire: <><path d="M12 3s4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 1 1 2 2 2 2 0 1-4 1-8z"/></>,
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
// AUTH HOOK
// ================================================================
function useAuthState(autoLockMs = 60000) {
  const [user, setUser] = useState(D.staff[0])
  const [locked, setLocked] = useState(true)
  const [autoLock, setAutoLock] = useState(autoLockMs)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const reset = () => { lastActivity.current = Date.now() }
    ;['mousedown','touchstart','keydown','wheel'].forEach(e => window.addEventListener(e, reset))
    return () => ['mousedown','touchstart','keydown','wheel'].forEach(e => window.removeEventListener(e, reset))
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
    return user.permissions || D.rolePresets[user.role] || {}
  }, [user])

  function unlock(pin) {
    if (pin === D.masterPin) { setLocked(false); lastActivity.current = Date.now(); return true }
    const found = D.staff.find(s => s.pin === pin)
    if (found) { setUser(found); setLocked(false); lastActivity.current = Date.now(); return true }
    return false
  }
  function lock() { setLocked(true) }
  function isMasterPin(pin) { return pin === D.masterPin }

  return { user, permissions, locked, lock, unlock, isMasterPin, autoLock, setAutoLock }
}

// ================================================================
// NOTIFICATIONS HOOK
// ================================================================
function useNotifications() {
  const [resolved, setResolved] = useState({})
  const notifs = useMemo(() => H.computeNotifications(resolved), [resolved])
  const resolve = (id) => setResolved(r => ({ ...r, [id]: true }))
  return { notifs, resolve }
}

// ================================================================
// LOCK SCREEN
// ================================================================
function LockScreen({ auth }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  function press(d) {
    if (pin.length >= 6) return
    setError(false)
    const next = pin + d
    setPin(next)
  }
  function backspace() { setError(false); setPin(p => p.slice(0,-1)) }
  function tryUnlock() {
    if (auth.unlock(pin)) { setPin(''); setError(false) }
    else { setError(true); setPin(''); setTimeout(() => setError(false), 1200) }
  }
  useEffect(() => {
    if (pin.length === 4 || pin.length === 6) {
      const t = setTimeout(tryUnlock, 200); return () => clearTimeout(t)
    }
  }, [pin])

  const days = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']

  return (
    <div style={{ position:'absolute', inset:0, zIndex:1000,
      background:'radial-gradient(circle at center, #1a3520 0%, #0d2818 60%, #06140d 100%)',
      color:T.headerInk, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontFamily:'"Inter", system-ui, sans-serif' }}>
      <div style={{ position:'absolute', top:32, left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:T.brand, color:T.header, fontWeight:800, fontSize:18,
            display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{D.business.name}</div>
        </div>
        <div style={{ fontSize:11, opacity:0.55, fontWeight:600 }}>{D.business.location}</div>
      </div>

      <div style={{ marginBottom:28, textAlign:'center' }}>
        <div style={{ fontSize:78, fontWeight:200, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.04em', lineHeight:1 }}>
          {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
        </div>
        <div style={{ fontSize:14, opacity:0.7, marginTop:8, fontWeight:500 }}>
          {days[now.getDay()]}, {now.getDate()}. {months[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      <div style={{ textAlign:'center', marginBottom:22 }}>
        <div style={{ fontSize:13, opacity:0.65, fontWeight:600, marginBottom:14, letterSpacing:'0.04em' }}>
          Vnesite PIN za vstop
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          {Array.from({length:6}).map((_,i) => {
            const filled = pin.length > i
            return <div key={i} style={{ width:14, height:14, borderRadius:999,
              background: filled ? (error ? '#ff5577' : T.brand) : 'rgba(246,241,232,0.15)',
              border:'1.5px solid '+(filled ? 'transparent' : 'rgba(246,241,232,0.3)'),
              transform: filled ? 'scale(1.1)' : 'scale(1)', transition:'background .15s' }}/>
          })}
        </div>
        {error && <div style={{ fontSize:13, color:'#ff5577', marginTop:14, fontWeight:700 }}>Napačna koda</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 84px)', gap:14 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <PinKey key={n} digit={n} onPress={() => press(String(n))}/>
        ))}
        <div/>
        <PinKey digit="0" onPress={() => press('0')}/>
        <button onClick={backspace} style={{ width:84, height:84, borderRadius:999,
          background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l5-6h13v12H8l-5-6z"/><path d="m13 9 4 6M17 9l-4 6"/>
          </svg>
        </button>
      </div>

      <div style={{ position:'absolute', bottom:24, fontSize:11, opacity:0.4 }}>
        PINi: 1234 (Lastnik) · 4567 (Blagajnik) · 3456 (Trener) · 9999 (Master)
      </div>
    </div>
  )
}

function PinKey({ digit, onPress }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button onPointerDown={()=>setPressed(true)} onPointerUp={()=>setPressed(false)}
      onPointerLeave={()=>setPressed(false)} onClick={onPress}
      style={{ width:84, height:84, borderRadius:999,
        background: pressed ? 'rgba(246,241,232,0.18)' : 'rgba(246,241,232,0.08)',
        border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit',
        fontSize:28, fontWeight:400, transform: pressed ? 'scale(0.95)' : 'scale(1)', transition:'background .08s' }}>
      {digit}
    </button>
  )
}

// ================================================================
// MODALI — SKUPNI
// ================================================================
function Modal({ open, onClose, children, width=480 }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:50,
      background:'rgba(15,20,18,0.55)', backdropFilter:'blur(2px)',
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width, maxWidth:'92%', maxHeight:'92%',
        overflow:'auto', background:T.modalBg, borderRadius:14, border:'1px solid rgba(0,0,0,0.06)',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

function PaymentModal({ open, total, onCancel, onComplete }) {
  const [method, setMethod] = useState('cash')
  const [tipPct, setTipPct] = useState(0)
  const [given, setGiven] = useState('')
  const [discount, setDiscount] = useState(0)
  const [furs, setFurs] = useState(true)

  useEffect(() => {
    if (!open) { setMethod('cash'); setTipPct(0); setGiven(''); setDiscount(0); setFurs(true) }
  }, [open])

  const finalTotal = (total - total*discount/100) + total*tipPct/100
  const change = method === 'cash' && given ? Math.max(0, parseFloat(given) - finalTotal) : 0

  if (!open) return null
  return (
    <Modal open={open} onClose={onCancel} width={620}>
      <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(0,0,0,0.06)',
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:T.muted }}>Plačilo</div>
          <div style={{ fontSize:16, fontWeight:600, marginTop:2 }}>Zaključi račun</div>
        </div>
        <button onClick={onCancel} style={{ width:32, height:32, borderRadius:10, border:'1px solid rgba(0,0,0,0.08)',
          background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <KI name="x" size={16}/>
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px' }}>
        <div style={{ padding:22, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Način plačila</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
              {D.paymentMethods.map(pm => (
                <button key={pm.id} onClick={()=>setMethod(pm.id)} style={{ padding:'12px 8px', borderRadius:10, cursor:'pointer',
                  background: method===pm.id ? T.accent : T.chipBg, color: method===pm.id ? '#fff' : 'inherit',
                  border:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:5, fontWeight:600, fontSize:12, fontFamily:'inherit' }}>
                  <span style={{ fontSize:20 }}>{pm.icon}</span>{pm.name}
                </button>
              ))}
            </div>
          </div>
          {method === 'cash' && (
            <div>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Prejeto</div>
              <input value={given} onChange={e=>setGiven(e.target.value)} placeholder={eur(finalTotal)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(0,0,0,0.1)',
                  fontFamily:'inherit', fontSize:20, fontWeight:600, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
              <div style={{ display:'flex', gap:5, marginTop:6, flexWrap:'wrap' }}>
                {[5,10,20,50,100].map(v => (
                  <button key={v} onClick={()=>setGiven(String(v))} style={{ padding:'5px 12px', borderRadius:7,
                    border:'1px solid rgba(0,0,0,0.08)', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12 }}>
                    {v}€
                  </button>
                ))}
              </div>
              {change > 0 && (
                <div style={{ marginTop:8, padding:'9px 12px', borderRadius:8, background:T.accentSoft, color:T.accent, fontWeight:600, fontSize:14,
                  display:'flex', justifyContent:'space-between' }}>
                  <span>Za vrniti</span><span>{eur(change)}</span>
                </div>
              )}
            </div>
          )}
          <div style={{ display:'flex', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Napitnina</div>
              <div style={{ display:'flex', gap:4 }}>
                {D.tips.map(p => (
                  <button key={p} onClick={()=>setTipPct(p)} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
                    border:'none', fontWeight:600, fontSize:12,
                    background: tipPct===p ? T.accentSoft : T.chipBg, color: tipPct===p ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Popust</div>
              <div style={{ display:'flex', gap:4 }}>
                {[0,5,10,20].map(p => (
                  <button key={p} onClick={()=>setDiscount(p)} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
                    border:'none', fontWeight:600, fontSize:12,
                    background: discount===p ? T.accentSoft : T.chipBg, color: discount===p ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
          <input type="checkbox" checked={furs} onChange={e=>setFurs(e.target.checked)} style={{ accentColor:T.accent, width:15, height:15 }}/>
          Davčno potrdi (FURS)
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ padding:'10px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
            border:'1px solid rgba(0,0,0,0.12)', background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
          <button onClick={()=>onComplete({method,total:finalTotal,furs})} style={{ padding:'10px 22px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
            border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:14,
            display:'flex', alignItems:'center', gap:6 }}>
            <KI name="check" size={16}/> Zaključi {eur(finalTotal)}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SRow({ label, v, muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13, color: muted ? T.muted : 'inherit' }}>
      <span>{label}</span><span style={{ fontVariantNumeric:'tabular-nums' }}>{v<0?'−':''}{eur(Math.abs(v))}</span>
    </div>
  )
}

function ReceiptToast({ data, onClose }) {
  if (!data) return null
  return (
    <Modal open={!!data} onClose={onClose} width={340}>
      <div style={{ padding:'28px 22px', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:999, margin:'0 auto 14px',
          background:T.accentSoft, color:T.accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <KI name="check" size={28} strokeWidth={2.5}/>
        </div>
        <div style={{ fontSize:20, fontWeight:700 }}>Račun zaključen</div>
        <div style={{ fontSize:22, fontWeight:700, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{eur(data.total)}</div>
        <div style={{ fontSize:13, color:T.muted, marginTop:8 }}>
          {data.furs ? 'FURS potrjen' : 'Brez FURS'} · #{Math.floor(Math.random()*9000+1000)}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
            border:'1px solid rgba(0,0,0,0.1)', background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
            border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13,
            display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
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
  floor:     { label:'Prostori & mize', icon:'chair',    hint:'F1' },
  sale:      { label:'Prodaja',         icon:'grid',     hint:'F2' },
  calendar:  { label:'Koledar',         icon:'calendar', hint:'F3' },
  customers: { label:'Stranke',         icon:'users',    hint:'F4' },
  packages:  { label:'Paketi',          icon:'package',  hint:'F5' },
  inventory: { label:'Zaloga',          icon:'box',      hint:'F6' },
  reports:   { label:'Poročila',        icon:'chart',    hint:'F7' },
  admin:     { label:'Nastavitve',      icon:'settings', hint:'F8' },
}

function SideNav({ screen, setScreen, nav }) {
  return (
    <div style={{ width:80, background:T.surface, borderRight:'1px solid '+T.line,
      display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', gap:4, flexShrink:0 }}>
      {nav.map(id => {
        const s = SCREENS[id]
        const active = screen === id
        return (
          <button key={id} onClick={()=>setScreen(id)} title={s.label} style={{
            width:64, padding:'11px 4px', borderRadius:10, cursor:'pointer',
            background: active ? T.accentSoft : 'transparent',
            color: active ? T.accent : T.inkSoft,
            border:'none', fontFamily:'inherit', position:'relative',
            display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
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
  if (!user) return null
  const initials = user.name.split(' ').map(w=>w[0]).join('').slice(0,2)
  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:8,
        padding:'4px 4px 4px 10px', borderRadius:999, background:'rgba(255,255,255,0.08)',
        border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600 }}>
        <div style={{ lineHeight:1.1, textAlign:'right' }}>
          <div style={{ fontWeight:700 }}>{user.name.split(' ')[0]}</div>
          <div style={{ fontSize:10, opacity:0.65 }}>{user.role}</div>
        </div>
        <div style={{ width:30, height:30, borderRadius:999, background:user.color, color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>{initials}</div>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:41,
            width:200, background:'#fff', color:T.ink, borderRadius:11,
            boxShadow:'0 14px 40px rgba(0,0,0,0.28)', padding:6, border:'1px solid '+T.line }}>
            <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid '+T.lineSoft, marginBottom:4 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{user.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{user.role}</div>
            </div>
            <button onClick={()=>{setOpen(false);onLock()}} style={{ width:'100%', padding:'9px 12px', borderRadius:8,
              background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', color:T.ink,
              fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
              <KI name="pin" size={14}/> Zakleni
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================
// NOTIFICATIONS PANEL
// ================================================================
function NotificationsPanel({ notifs, resolve, onClose }) {
  const sevColors = {
    red:    { bg:'rgba(168,50,50,0.10)',  border:'rgba(168,50,50,0.35)',  dot:'#a83232' },
    orange: { bg:'rgba(217,118,40,0.12)', border:'rgba(217,118,40,0.35)', dot:'#d97628' },
    yellow: { bg:'rgba(233,185,73,0.15)', border:'rgba(233,185,73,0.4)',  dot:'#e9b949' },
    info:   { bg:T.surface2,              border:T.line,                  dot:T.accent  },
  }
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:50 }}/>
      <div style={{ position:'absolute', top:60, right:14, zIndex:51,
        width:360, maxHeight:500, display:'flex', flexDirection:'column',
        background:'#fff', color:T.ink, borderRadius:12,
        boxShadow:'0 18px 50px rgba(0,0,0,0.30)', border:'1px solid '+T.line }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid '+T.line,
          display:'flex', alignItems:'center', gap:10 }}>
          <KI name="bell" size={16}/>
          <div style={{ fontWeight:700, fontSize:14 }}>Obvestila</div>
          <div style={{ fontSize:11, color:T.muted }}>{notifs.length} aktivnih</div>
          <button onClick={onClose} style={{ marginLeft:'auto', width:28, height:28, borderRadius:7,
            border:'none', background:T.surface3, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <KI name="x" size={13}/>
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 10px' }}>
          {notifs.length === 0 && (
            <div style={{ padding:30, textAlign:'center', color:T.muted, fontSize:13 }}>
              <div>✅</div><div style={{ marginTop:8, fontWeight:600 }}>Vse obravnavano</div>
            </div>
          )}
          {notifs.map(n => {
            const c = sevColors[n.severity] || sevColors.info
            return (
              <div key={n.id} style={{ padding:12, borderRadius:10, marginBottom:6, background:c.bg, border:'1px solid '+c.border }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <span style={{ width:8, height:8, borderRadius:999, background:c.dot, marginTop:6, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{n.customerName}</div>
                    <div style={{ fontSize:12, marginTop:2, fontWeight:600 }}>{n.title}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{n.detail}</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:8 }}>
                  {n.actions.includes('extend') && (
                    <button onClick={()=>resolve(n.id)} style={{ flex:1, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontFamily:'inherit',
                      background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:11 }}>Podaljšaj</button>
                  )}
                  {(n.actions.includes('dismiss')||n.actions.includes('inactive')) && (
                    <button onClick={()=>resolve(n.id)} style={{ flex:1, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontFamily:'inherit',
                      background:'transparent', color:T.muted, border:'1px solid '+T.line, fontWeight:600, fontSize:11 }}>Opravljeno</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ================================================================
// FLOOR SCREEN
// ================================================================
function FloorScreen({ setActiveTable, setScreen }) {
  const [selectedSpace, setSelectedSpace] = useState(D.spaces[0].id)
  const space = D.spaces.find(s=>s.id===selectedSpace)

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'12px 18px', background:T.surface, borderBottom:'1px solid '+T.line,
        display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', gap:4, background:T.surface3, padding:4, borderRadius:10 }}>
          {D.spaces.map(s => (
            <button key={s.id} onClick={()=>setSelectedSpace(s.id)} style={{ padding:'8px 14px', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
              border:'none', fontWeight:700, fontSize:13,
              background: selectedSpace===s.id ? T.header : 'transparent',
              color: selectedSpace===s.id ? T.headerInk : T.ink,
              display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:999, background:s.color }}/>
              {s.name}
              <span style={{ opacity:0.6, fontSize:11 }}>{s.tables.filter(t=>t.status==='occupied').length}/{s.tables.length}</span>
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, marginLeft:16 }}>
          {Object.entries(T.status).map(([k,st]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:T.muted, fontWeight:600 }}>
              <span style={{ width:9, height:9, borderRadius:999, background:st.dot }}/>{st.label}
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button onClick={()=>{setActiveTable(null);setScreen('sale')}} style={{ padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
            background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12,
            display:'flex', alignItems:'center', gap:6 }}>
            <KI name="plus" size={14}/> Hitra prodaja
          </button>
        </div>
      </div>
      <div style={{ flex:1, position:'relative', overflow:'hidden', background:T.bg,
        backgroundImage:'radial-gradient(circle, '+T.line+' 1px, transparent 1px)', backgroundSize:'24px 24px' }}>
        {space.tables.map(t => {
          const st = T.status[t.status] || T.status.free
          const isRound = t.seats <= 2
          const w = t.seats<=2 ? 96 : t.seats<=4 ? 118 : 154
          const h = t.seats<=2 ? 96 : t.seats<=4 ? 92 : 116
          return (
            <button key={t.id} onClick={()=>{setActiveTable(t);setScreen('sale')}}
              style={{ position:'absolute', left:`${t.x}%`, top:`${t.y}%`,
                width:w, height:h, background:st.bg, border:'2px solid '+st.stroke,
                borderRadius: isRound ? '50%' : 14, cursor:'pointer', fontFamily:'inherit', color:T.ink,
                padding:8, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
                boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:17, fontWeight:800 }}>{t.name}</div>
              <div style={{ fontSize:10, color:T.muted, display:'flex', alignItems:'center', gap:3 }}>
                <KI name="user" size={10}/> {t.seats}
              </div>
              {t.status==='occupied' && (
                <>
                  <div style={{ fontSize:13, fontWeight:800, fontVariantNumeric:'tabular-nums', marginTop:3 }}>{eur(t.order)}</div>
                  <div style={{ fontSize:9, color:T.muted }}>{t.since} · {t.server}</div>
                </>
              )}
              {t.status==='needs_attention' && (
                <div style={{ position:'absolute', top:-8, right:-8, width:22, height:22, borderRadius:999,
                  background:st.dot, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:800, boxShadow:'0 0 0 3px '+T.bg }}>!</div>
              )}
              {t.status==='reserved' && (
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
// SALE SCREEN
// ================================================================
function SaleScreen({ activeTable, activeCustomer, cart, setCart, addItem, adjustQty, setPaymentOpen, totals, setActiveCustomer }) {
  const [selectedCat, setSelectedCat] = useState('cat-fav')
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    if (search) return D.items.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.code.toLowerCase().includes(search.toLowerCase()))
    return H.itemsIn(selectedCat)
  }, [selectedCat, search])

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:196, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid '+T.lineSoft, fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Kategorije</div>
        <div style={{ overflowY:'auto', flex:1, padding:8 }}>
          {D.categories.map(c => {
            const active = selectedCat===c.id
            return (
              <button key={c.id} onClick={()=>{setSelectedCat(c.id);setSearch('')}} style={{ width:'100%', padding:'10px', borderRadius:9, marginBottom:2,
                background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.ink,
                border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: active ? 700 : 500,
                display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                <span style={{ width:30, height:30, borderRadius:8, background:c.color,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>{c.icon}</span>
                <span style={{ flex:1 }}>{c.name}</span>
                {active && <KI name="chev" size={14}/>}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, background:T.surface, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ position:'relative', flex:1, maxWidth:400 }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={15}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči artikel ali šifro…"
              style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:9, border:'1px solid '+T.line,
                fontFamily:'inherit', fontSize:13, background:T.surface2, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginLeft:'auto', fontSize:12, color:T.muted }}>{items.length} artiklov</div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14, display:'grid',
          gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, alignContent:'start' }}>
          {items.map(it => (
            <button key={it.id} onClick={()=>addItem(it)} style={{ background:T.surface, border:'1px solid '+T.line,
              borderRadius:11, padding:'12px', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:T.ink,
              display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:96, position:'relative' }}>
              {it.fav && <span style={{ position:'absolute', top:8, right:8, color:T.brand, fontSize:11 }}>★</span>}
              {it.bookable && <span style={{ position:'absolute', top:8, left:8, fontSize:9, fontWeight:800,
                color:T.accent, background:T.accentSoft, padding:'2px 5px', borderRadius:4, textTransform:'uppercase' }}>REZERV.</span>}
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.25, marginTop: it.fav ? 14 : 0 }}>{it.name}</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:8 }}>
                <div style={{ fontSize:15, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</div>
                <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{it.code}</div>
              </div>
            </button>
          ))}
          {items.length===0 && (
            <div style={{ gridColumn:'1 / -1', padding:40, textAlign:'center', color:T.muted }}>Ni rezultatov za "{search}"</div>
          )}
        </div>
      </div>

      <SaleCart cart={cart} setCart={setCart} adjustQty={adjustQty} activeTable={activeTable}
        activeCustomer={activeCustomer} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer}/>
    </div>
  )
}

function SaleCart({ cart, setCart, adjustQty, activeTable, activeCustomer, setPaymentOpen, totals, setActiveCustomer }) {
  const [pickCustomer, setPickCustomer] = useState(false)
  return (
    <div style={{ width:340, background:T.surface, borderLeft:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Naročilo</div>
          <div style={{ fontWeight:700, fontSize:14, marginTop:2 }}>
            {activeTable ? activeTable.name : 'Hitra prodaja'}
            <span style={{ color:T.muted, fontWeight:500, fontSize:12 }}> · {cart.reduce((s,l)=>s+l.qty,0)} kos</span>
          </div>
        </div>
        {cart.length>0 && (
          <button onClick={()=>setCart([])} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.muted, padding:4 }}>
            <KI name="trash" size={14}/>
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {cart.length===0 && (
          <div style={{ padding:40, textAlign:'center', color:T.muted, fontSize:12 }}>
            <div style={{ fontSize:26, marginBottom:8, opacity:0.4 }}>🛒</div>
            Košarica je prazna.<br/>Tapni artikel za dodajanje.
          </div>
        )}
        {cart.map(l => (
          <div key={l.lineId} style={{ padding:'10px 12px', borderBottom:'1px solid '+T.lineSoft, display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{l.name}</div>
              {l.note && <div style={{ fontSize:11, color:T.muted, marginTop:2, fontStyle:'italic' }}>"{l.note}"</div>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              <div style={{ fontWeight:800, fontSize:14, fontVariantNumeric:'tabular-nums' }}>{eur(H.lineTotal(l))}</div>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button onClick={()=>l.qty===1?setCart(c=>c.filter(x=>x.lineId!==l.lineId)):adjustQty(l.lineId,-1)}
                  style={{ width:24, height:24, borderRadius:6, border:'1px solid '+T.line, background:T.surface, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {l.qty===1 ? <KI name="trash" size={11}/> : <KI name="minus" size={12}/>}
                </button>
                <div style={{ width:24, textAlign:'center', fontWeight:700, fontSize:13 }}>{l.qty}</div>
                <button onClick={()=>adjustQty(l.lineId,1)}
                  style={{ width:24, height:24, borderRadius:6, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <KI name="plus" size={12}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cart.length>0 && (
        <div style={{ padding:'8px 10px', borderTop:'1px solid '+T.line, display:'flex', gap:5 }}>
          {[['user','Stranka',()=>setPickCustomer(true)],['percent','Popust',null],['split','Razdeli',null],['edit','Opomba',null]].map(([icon,label,onClick]) => (
            <button key={label} onClick={onClick||undefined} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none',
              cursor:'pointer', color:T.ink, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
              <KI name={icon} size={14}/>{label}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding:'12px 16px', background:T.surface2, borderTop:'1px solid '+T.line }}>
        {activeCustomer && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 10px',
            background:T.accentSoft, borderRadius:8 }}>
            <div style={{ flex:1, fontSize:12, fontWeight:600, color:T.accent }}>{activeCustomer.name}</div>
            <button onClick={()=>setActiveCustomer(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.accent }}>
              <KI name="x" size={12}/>
            </button>
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
        <button disabled={cart.length===0} onClick={()=>setPaymentOpen(true)} style={{ width:'100%', marginTop:12,
          padding:'13px', borderRadius:9, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily:'inherit',
          border:'none', background: cart.length ? T.accent : '#ccc', color:'#fff', fontWeight:800, fontSize:15,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <KI name="arrow" size={16} strokeWidth={2.2}/> Plačaj {cart.length>0?eur(totals.total):''}
        </button>
      </div>

      {pickCustomer && (
        <Modal open onClose={()=>setPickCustomer(false)}>
          <div style={{ padding:'18px 20px 12px' }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Izberi stranko</div>
          </div>
          <div style={{ padding:'0 12px 12px' }}>
            {D.customers.map(c => (
              <button key={c.id} onClick={()=>{setActiveCustomer(c);setPickCustomer(false)}}
                style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:4,
                  background:'transparent', border:'1px solid '+T.line, cursor:'pointer', fontFamily:'inherit',
                  color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:999, background:T.surface3,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700 }}>
                  {c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{c.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{c.phone} · {c.tier} · {c.points} t.</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ================================================================
// CALENDAR SCREEN
// ================================================================
function CalendarScreen() {
  const [view, setView] = useState('day')
  const hours = Array.from({length:13},(_,i)=>8+i)
  const today = new Date('2026-05-20')
  const days = ['Pon','Tor','Sre','Čet','Pet','Sob','Ned']
  const monday = new Date(today)
  monday.setDate(today.getDate()-((today.getDay()+6)%7))
  const weekDates = days.map((_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d})

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'12px 18px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Torek, 20. maj 2026</div>
        <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:8, marginLeft:16 }}>
          {['day','week'].map(v => (
            <button key={v} onClick={()=>setView(v)} style={{ padding:'6px 14px', borderRadius:6, cursor:'pointer', fontFamily:'inherit',
              border:'none', fontWeight:700, fontSize:12,
              background: view===v ? T.header : 'transparent',
              color: view===v ? T.headerInk : T.ink }}>
              {v==='day' ? 'Dan' : 'Teden'}
            </button>
          ))}
        </div>
        <button style={{ marginLeft:'auto', padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
          background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12,
          display:'flex', alignItems:'center', gap:6 }}>
          <KI name="plus" size={14}/> Nova rezervacija
        </button>
      </div>

      <div style={{ flex:1, overflow:'auto' }}>
        {view==='day' ? (
          <div style={{ minWidth:700, display:'grid', gridTemplateColumns:'56px repeat(3, 1fr)', background:T.surface }}>
            <div style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.line }}/>
            {D.staff.slice(0,3).map(s => (
              <div key={s.id} style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.line, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:999, background:s.color, color:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>
                    {s.name.split(' ').map(w=>w[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{s.name}</div>
                    <div style={{ fontSize:10, color:T.muted }}>{s.role}</div>
                  </div>
                </div>
              </div>
            ))}
            {hours.map((hh,hi) => (
              <React.Fragment key={hh}>
                <div style={{ background:T.surface2, borderRight:'1px solid '+T.line, borderTop: hi===0?'none':'1px solid '+T.lineSoft,
                  padding:'4px 8px', fontSize:11, fontWeight:700, color:T.muted, fontVariantNumeric:'tabular-nums', minHeight:60 }}>
                  {String(hh).padStart(2,'0')}:00
                </div>
                {D.staff.slice(0,3).map(s => {
                  const b = D.bookings.find(b=>b.staffId===s.id && parseInt(b.time.split(':')[0])===hh)
                  const cust = b && H.customer(b.customerId)
                  const item = b && H.itemOf(b.itemId)
                  return (
                    <div key={s.id} style={{ borderRight:'1px solid '+T.lineSoft, borderTop: hi===0?'none':'1px solid '+T.lineSoft,
                      position:'relative', padding:2, minHeight:60, background:T.surface, cursor:'pointer',
                      backgroundImage:`repeating-linear-gradient(180deg, transparent 0 59px, ${T.lineSoft} 59px 60px)` }}>
                      {b && (
                        <div style={{ width:'100%', minHeight:56, background:b.status==='tentative'?'rgba(184,140,40,0.18)':T.accentSoft,
                          border:'1px solid '+(b.status==='tentative'?T.warn:T.accent),
                          borderLeft:'3px solid '+(b.status==='tentative'?T.warn:T.accent),
                          borderRadius:7, padding:'6px 8px', color: b.status==='tentative'?T.warn:T.accent }}>
                          <div style={{ fontSize:11, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{b.time} · {b.duration}min</div>
                          <div style={{ fontSize:12, fontWeight:700, color:T.ink, marginTop:2 }}>{cust?.name}</div>
                          <div style={{ fontSize:11, color:T.muted }}>{item?.name}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={{ minWidth:900, display:'grid', gridTemplateColumns:'56px repeat(7, 1fr)', background:T.surface }}>
            <div style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.line }}/>
            {weekDates.map((d,i) => {
              const isToday = d.toISOString().slice(0,10)===today.toISOString().slice(0,10)
              return (
                <div key={i} style={{ background:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.lineSoft, padding:'10px 8px', textAlign:'center' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>{days[i]}</div>
                  <div style={{ fontSize:18, fontWeight:800, color: isToday?T.accentText:T.ink,
                    background: isToday?T.accent:'transparent', width:32, height:32, borderRadius:999,
                    lineHeight:'32px', margin:'6px auto 0', fontVariantNumeric:'tabular-nums' }}>{d.getDate()}</div>
                </div>
              )
            })}
            {hours.map((hh,hi) => (
              <React.Fragment key={hh}>
                <div style={{ background:T.surface2, borderRight:'1px solid '+T.line, borderTop: hi===0?'none':'1px solid '+T.lineSoft,
                  padding:'4px 8px', fontSize:11, fontWeight:700, color:T.muted, minHeight:60 }}>
                  {String(hh).padStart(2,'0')}:00
                </div>
                {weekDates.map((d,di) => {
                  const iso = d.toISOString().slice(0,10)
                  const b = D.bookings.find(bk=>bk.date===iso && parseInt(bk.time.split(':')[0])===hh)
                  const cust = b && H.customer(b.customerId)
                  return (
                    <div key={di} style={{ borderRight:'1px solid '+T.lineSoft, borderTop: hi===0?'none':'1px solid '+T.lineSoft,
                      minHeight:60, padding:2, background:T.surface, cursor:'pointer' }}>
                      {b && (
                        <div style={{ width:'100%', minHeight:56, background:T.accentSoft,
                          border:'1px solid '+T.accent, borderLeft:'3px solid '+T.accent, borderRadius:6,
                          padding:'5px 6px', color:T.accent, overflow:'hidden' }}>
                          <div style={{ fontSize:10, fontWeight:800 }}>{b.time}</div>
                          <div style={{ fontSize:11, fontWeight:700, color:T.ink }}>{cust?.name}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ================================================================
// CUSTOMERS SCREEN
// ================================================================
function CustomersScreen({ setActiveCustomer, setScreen }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(D.customers[0].id)

  const filtered = D.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
  const selected = D.customers.find(c=>c.id===selectedId)||D.customers[0]

  const MemberDot = ({status}) => {
    const colors = {active:'#1f6b3a',expiring:'#e9b949',critical:'#d97628',expired:'#a83232',none:'#9a9890'}
    return <span style={{ display:'inline-block', width:8, height:8, borderRadius:999, background:colors[status]||'#999', marginRight:5 }}/>
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:320, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid '+T.line }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>{filtered.length} strank</div>
            <button style={{ padding:'7px 11px', borderRadius:8, cursor:'pointer', fontFamily:'inherit',
              background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12,
              display:'flex', alignItems:'center', gap:5 }}>
              <KI name="add_user" size={14}/> Nova
            </button>
          </div>
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={14}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči stranko…"
              style={{ width:'100%', padding:'9px 12px 9px 34px', borderRadius:9, border:'1px solid '+T.line,
                fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:6 }}>
          {filtered.map(c => {
            const active = c.id===selectedId
            const ms = H.memberStatus(c)
            const tierColor = c.tier==='Zlato'?'#e9b949':c.tier==='Srebro'?'#9aa3a8':'#b88c5e'
            return (
              <button key={c.id} onClick={()=>setSelectedId(c.id)} style={{ width:'100%', padding:'10px', borderRadius:9, marginBottom:2,
                background: active ? T.accentSoft : 'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', color:T.ink,
                textAlign:'left', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:999, background:T.surface3, display:'flex',
                  alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, position:'relative' }}>
                  {c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                  <span style={{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:999,
                    background:tierColor, border:'2px solid '+(active?T.accentSoft:T.surface) }}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>
                    <MemberDot status={ms.status}/>{c.name}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>
                    {ms.status!=='none' ? (ms.daysToExpiry!==null ? ms.daysToExpiry+' dni' : ms.remainingVisits+' obiskov') : 'Brez kartice'}
                    {c.prepaid>0 && <span style={{ color:T.accent, marginLeft:6 }}>· {eur(c.prepaid)}</span>}
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
              <div style={{ width:64, height:64, borderRadius:999, background:T.surface3,
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:22 }}>
                {selected.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:22, fontWeight:800 }}>{selected.name}</div>
                <div style={{ fontSize:12, color:T.muted, marginTop:4, display:'flex', gap:14 }}>
                  <span>{selected.phone}</span>
                  {selected.email && <span>{selected.email}</span>}
                  <span>od {selected.since}</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={{ padding:'9px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
                  background:T.surface, color:T.ink, border:'1px solid '+T.line, fontWeight:600, fontSize:12,
                  display:'flex', alignItems:'center', gap:6 }}><KI name="calendar" size={14}/> Rezerviraj</button>
                <button onClick={()=>{setActiveCustomer(selected);setScreen('sale')}} style={{ padding:'9px 14px', borderRadius:9,
                  cursor:'pointer', fontFamily:'inherit', background:T.accent, color:'#fff', border:'none',
                  fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
                  <KI name="receipt" size={14}/> Nov račun
                </button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
              {[['Točke',selected.points,selected.tier],['Predplačilo',eur(selected.prepaid),selected.prepaid>0?'na voljo':'brez'],
                ['Obiskov',selected.visits,'zadnji: '+selected.lastVisit],['Porabljeno',eur(selected.spent),'povp. '+eur(selected.avg)]].map(([l,v,s])=>(
                <div key={l} style={{ padding:'12px 14px', background:T.surface2, borderRadius:10, border:'1px solid '+T.line }}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
          {selected.packages.length>0 && (
            <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Aktivni paketi</div>
              {selected.packages.map((p,i)=>{
                const pct = p.remaining/p.total
                return (
                  <div key={i} style={{ padding:14, borderRadius:10, background:'rgba(99,72,150,0.06)', border:'1px solid rgba(99,72,150,0.18)', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:8 }}>
                      <div style={{ flex:1, fontWeight:700, fontSize:14 }}>{p.name}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:'#634896', fontVariantNumeric:'tabular-nums' }}>
                        {p.remaining}<span style={{ fontSize:13, color:T.muted }}>/{p.total}</span>
                      </div>
                    </div>
                    <div style={{ height:6, borderRadius:999, background:'rgba(99,72,150,0.15)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:(pct*100)+'%', background:'#634896', borderRadius:999 }}/>
                    </div>
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
// PACKAGES SCREEN
// ================================================================
function PackagesScreen() {
  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Kartice & paketi</div>
          <div style={{ fontSize:13, color:T.muted, marginTop:4 }}>Predloge paketov za prodajo strankam.</div>
        </div>
        <button style={{ marginLeft:'auto', padding:'9px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
          background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12,
          display:'flex', alignItems:'center', gap:6 }}><KI name="plus" size={14}/> Nov paket</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {D.packageTemplates.map(p => {
          const typeColor = p.type==='unlimited'?'#1f6b3a':p.type==='visits'?'#3a6e8f':p.type==='time-restricted'?'#e9b949':'#7b61b8'
          const typeLabel = p.type==='unlimited'?'Neomejen':p.type==='visits'?(p.visits+'x obiskov'):p.type==='time-restricted'?'Časovno':'Ostalo'
          return (
            <div key={p.id} style={{ background:T.surface, borderRadius:13, border:'1px solid '+T.line, padding:18, position:'relative' }}>
              <span style={{ position:'absolute', top:14, right:14, fontSize:10, fontWeight:800, padding:'4px 9px',
                borderRadius:5, background:typeColor+'18', color:typeColor, textTransform:'uppercase', letterSpacing:'0.05em' }}>{typeLabel}</span>
              <div style={{ fontSize:16, fontWeight:800, paddingRight:100 }}>{p.name}</div>
              <div style={{ fontSize:34, fontWeight:900, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginTop:10, lineHeight:1 }}>{eur(p.price)}</div>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.5, marginTop:10, minHeight:36 }}>{p.desc}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:10, paddingTop:10, borderTop:'1px solid '+T.lineSoft, fontWeight:600 }}>
                Veljavnost: <b style={{ color:T.ink }}>{p.validityDays} dni</b>
                {p.hoursFrom && <span> · {p.hoursFrom}–{p.hoursTo}</span>}
              </div>
              <div style={{ display:'flex', gap:6, marginTop:12 }}>
                <button style={{ flex:1, padding:'8px', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
                  background:T.surface3, color:T.ink, border:'none', fontWeight:700, fontSize:12,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}><KI name="edit" size={13}/> Uredi</button>
                <button style={{ flex:1, padding:'8px', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
                  background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12 }}>Prodaj</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================
// INVENTORY SCREEN
// ================================================================
function InventoryScreen() {
  const [search, setSearch] = useState('')
  const items = D.items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{D.items.length} artiklov</div>
        <div style={{ position:'relative', flex:1, maxWidth:360 }}>
          <div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={14}/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči artikel…"
            style={{ width:'100%', padding:'8px 12px 8px 34px', borderRadius:9, border:'1px solid '+T.line,
              fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
        </div>
        <button style={{ marginLeft:'auto', padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
          background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12,
          display:'flex', alignItems:'center', gap:6 }}><KI name="plus" size={14}/> Nov artikel</button>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
          <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
            <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {['Artikel','Šifra','Cena','Stanje','Status'].map((h,i)=>(
                <th key={i} style={{ padding:'12px', textAlign: i>=2?'right':'left', borderBottom:'1px solid '+T.line, fontWeight:700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it,idx) => (
              <tr key={it.id} style={{ background: idx%2?T.surface2:T.surface }}>
                <td style={{ padding:'11px 12px' }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{it.name}</div>
                  {it.bookable && <div style={{ fontSize:10, color:T.accent, marginTop:2 }}>Rezervabilno</div>}
                </td>
                <td style={{ padding:'11px 12px', fontSize:12, color:T.muted, fontFamily:'monospace' }}>{it.code}</td>
                <td style={{ padding:'11px 12px', textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</td>
                <td style={{ padding:'11px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums',
                  color: it.stock<=0?T.danger:it.alert?T.warn:T.ink }}>
                  {it.stock===999?'∞':it.stock}
                </td>
                <td style={{ padding:'11px 12px' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:5,
                    background: it.stock<=0?'rgba(168,50,50,0.1)':it.alert?'rgba(184,140,40,0.12)':T.accentSoft,
                    color: it.stock<=0?T.danger:it.alert?T.warn:T.accent,
                    textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    {it.stock<=0?'Ni':'V zalogi'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================================================================
// REPORTS SCREEN
// ================================================================
function ReportsScreen({ permissions }) {
  const today = D.today
  const maxH = Math.max(...today.hourlySales)
  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Poročilo · Torek, 20. maj 2026</div>
        </div>
        <button style={{ marginLeft:'auto', padding:'9px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
          background:T.surface, color:T.ink, border:'1px solid '+T.line, fontWeight:600, fontSize:12,
          display:'flex', alignItems:'center', gap:6 }}><KI name="print" size={14}/> Z-poročilo</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[['Promet',eur(today.promet),'T.accent'],['Računi',today.racuni,''],['Napitnine',eur(today.tipsTotal),''],['Vračila',eur(8.40),'']].map(([l,v])=>(
          <div key={l} style={{ padding:'12px 14px', background:T.surface, borderRadius:10, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Promet po urah</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:160, padding:'0 4px' }}>
          {today.hourlySales.map((v,i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:T.muted, fontVariantNumeric:'tabular-nums' }}>{eur(v)}</div>
              <div style={{ width:'100%', height:(v/maxH*120)+'px', background:'linear-gradient(180deg, '+T.brand+', '+T.warn+')',
                borderRadius:'5px 5px 0 0', minHeight:4 }}/>
              <div style={{ fontSize:9, color:T.muted }}>{(14+i)}:00</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Vračila</div>
        {D.refunds.map(r => (
          <div key={r.id} style={{ padding:12, borderRadius:9, marginBottom:6, background:'rgba(168,50,50,0.06)', border:'1px solid rgba(168,50,50,0.18)' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{r.original}</div>
              <div style={{ fontSize:15, fontWeight:800, color:T.danger, fontVariantNumeric:'tabular-nums' }}>{eur(r.amount)}</div>
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{r.date} {r.time} · {r.cashier}</div>
            <div style={{ fontSize:12, marginTop:4, fontStyle:'italic' }}>"{r.reason}"</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ================================================================
// ADMIN SCREEN
// ================================================================
function AdminScreen({ auth }) {
  const [section, setSection] = useState('profile')
  const sections = [
    { id:'profile', label:'Tip poslovanja', icon:'home' },
    { id:'staff', label:'Zaposleni & PIN', icon:'users' },
    { id:'autolock', label:'Avt. zaklep', icon:'pin' },
    { id:'furs', label:'FURS & DDV', icon:'receipt' },
  ]
  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:220, background:T.surface, borderRight:'1px solid '+T.line, padding:12, flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', padding:'8px 10px' }}>Nastavitve</div>
        {sections.map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)} style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:2,
            background: section===s.id?T.accentSoft:'transparent', color: section===s.id?T.accent:T.ink,
            border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: section===s.id?700:500,
            display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
            <KI name={s.icon} size={15}/> {s.label}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:24, background:T.bg }}>
        {section==='profile' && (
          <div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:16 }}>Tip poslovanja</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
              {D.profiles.map(p => (
                <div key={p.id} style={{ padding:18, borderRadius:12, background:T.surface, border:'2px solid '+T.line }}>
                  <div style={{ fontSize:24, marginBottom:10 }}>{p.icon}</div>
                  <div style={{ fontSize:17, fontWeight:800 }}>{p.name}</div>
                  <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Razdelki: {p.nav.join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {section==='staff' && (
          <div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:16 }}>Zaposleni & PIN</div>
            {D.staff.map(s => (
              <div key={s.id} style={{ padding:14, borderRadius:10, marginBottom:8, background:T.surface, border:'1px solid '+T.line,
                display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:999, background:s.color, color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
                  {s.name.split(' ').map(w=>w[0]).join('')}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{s.role}</div>
                </div>
                <div style={{ padding:'5px 10px', borderRadius:7, background:T.surface3, fontFamily:'monospace', fontSize:14, fontWeight:700, letterSpacing:'0.15em' }}>
                  {'•••'+s.pin.slice(-1)}
                </div>
                <button style={{ width:28, height:28, borderRadius:6, border:'1px solid '+T.line, background:T.surface, color:T.ink, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center' }}><KI name="edit" size={13}/></button>
              </div>
            ))}
          </div>
        )}
        {section==='autolock' && (
          <div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:16 }}>Avtomatsko zaklepanje</div>
            <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
              {D.autoLockOptions.map(opt => {
                const active = auth.autoLock===opt.ms
                return (
                  <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:9, marginBottom:4, cursor:'pointer',
                    background: active?T.accentSoft:T.surface2, border:'1px solid '+(active?T.accent:T.lineSoft) }}>
                    <input type="radio" name="autolock" checked={active} onChange={()=>auth.setAutoLock(opt.ms)} style={{ accentColor:T.accent, width:16, height:16 }}/>
                    <div style={{ fontSize:13, fontWeight:600, color: active?T.accent:T.ink }}>{opt.label}</div>
                    {active && <KI name="check" size={16}/>}
                  </label>
                )
              })}
            </div>
          </div>
        )}
        {section==='furs' && (
          <div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:16 }}>FURS & DDV</div>
            <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 0' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>FURS povezava</div>
                  <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Aktivna · produkcijsko okolje</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'4px 8px', borderRadius:5, background:T.accentSoft, color:T.accent, textTransform:'uppercase' }}>Povezano</span>
              </div>
              <hr style={{ border:'none', borderTop:'1px solid '+T.line, margin:'12px 0' }}/>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'8px 0', cursor:'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor:T.accent, width:16, height:16 }}/>
                Privzeto davčno potrdi vsak račun
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ================================================================
// GŁÓWNA APP KOMPONENTA
// ================================================================
function KlasikApp() {
  const auth = useAuthState(60000)
  const notifications = useNotifications()
  const [profileId, setProfileId] = useState('all')
  const profile = H.profile(profileId)

  const screenPerm = { floor:null, sale:'sale', calendar:'manageBookings', customers:'viewMembers',
    packages:'editPrices', inventory:'editPrices', reports:'viewReports', admin:null }
  const nav = profile.nav.filter(s => { const p=screenPerm[s]; if(!p) return true; return auth.permissions[p] })

  const [screen, setScreen] = useState(nav[0])
  const [activeTable, setActiveTable] = useState(null)
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(()=>setNow(new Date()),30000); return ()=>clearInterval(t) }, [])
  useEffect(() => { if(!nav.includes(screen)) setScreen(nav[0]) }, [profileId])

  const totals = H.orderTotals(cart)

  function addItem(item) {
    setCart(c => {
      const idx = c.findIndex(l=>l.id===item.id)
      if (idx>=0) { const cp=[...c]; cp[idx]={...cp[idx],qty:cp[idx].qty+1}; return cp }
      return [...c, { lineId:Math.random().toString(36).slice(2), id:item.id, name:item.name,
        price:item.price, qty:1, mods:[], note:'' }]
    })
  }
  function adjustQty(lineId, delta) {
    setCart(c=>c.flatMap(l=>l.lineId===lineId?(l.qty+delta<=0?[]:[{...l,qty:l.qty+delta}]):[l]))
  }

  return (
    <div style={{ width:'100%', height:'100%', background:T.bg, color:T.ink,
      fontFamily:'"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontSize:13, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

      {/* HEADER */}
      <div style={{ background:T.header, color:T.headerInk, padding:'8px 16px',
        display:'flex', alignItems:'center', gap:14, flexShrink:0,
        borderBottom:'1px solid '+T.headerLine, minHeight:56, position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:T.brand, color:T.header,
            fontWeight:800, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ lineHeight:1.1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{D.business.name}</div>
            <div style={{ fontSize:11, opacity:0.65, marginTop:2 }}>{profile.name}</div>
          </div>
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          {auth.permissions.viewSales && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
              <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Promet</div>
              <div style={{ fontSize:15, fontWeight:800, color:T.brand, fontVariantNumeric:'tabular-nums' }}>{eur(D.today.promet+totals.total)}</div>
            </div>
          )}
          <div style={{ borderLeft:'1px solid '+T.headerLine, paddingLeft:14, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
            <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              {['Ned','Pon','Tor','Sre','Čet','Pet','Sob'][now.getDay()]}
            </div>
            <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
              {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
            </div>
          </div>
          <button onClick={()=>setNotifOpen(o=>!o)} title="Obvestila" style={{ position:'relative', width:36, height:36,
            borderRadius:9, background:'rgba(255,255,255,0.06)', border:'none', color:T.headerInk, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <KI name="bell" size={17}/>
            {notifications.notifs.length>0 && (
              <span style={{ position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 3px',
                background:T.brand, color:T.header, borderRadius:999, fontSize:10, fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid '+T.header }}>
                {notifications.notifs.length}
              </span>
            )}
          </button>
          <UserAvatar user={auth.user} onLock={auth.lock}/>
        </div>

        {notifOpen && <NotificationsPanel notifs={notifications.notifs} resolve={notifications.resolve} onClose={()=>setNotifOpen(false)}/>}
      </div>

      {/* CONTEXT STRIP */}
      {(activeTable||activeCustomer) && (
        <div style={{ background:T.brand, color:T.header, padding:'7px 18px',
          display:'flex', alignItems:'center', gap:14, fontSize:12, fontWeight:600, flexShrink:0 }}>
          {activeTable && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="chair" size={14}/>
              <span>Miza: <b>{activeTable.name}</b></span>
              <button onClick={()=>setActiveTable(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none',
                cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
          {activeCustomer && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="user" size={14}/>
              <span>Stranka: <b>{activeCustomer.name}</b></span>
              <span style={{ opacity:0.7 }}>· {activeCustomer.tier} · {activeCustomer.points} t.</span>
              <button onClick={()=>setActiveCustomer(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none',
                cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
        </div>
      )}

      {/* BODY */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        <SideNav screen={screen} setScreen={setScreen} nav={nav}/>
        <div style={{ flex:1, display:'flex', overflow:'hidden', minWidth:0 }}>
          {screen==='floor'     && <FloorScreen setActiveTable={setActiveTable} setScreen={setScreen}/>}
          {screen==='sale'      && <SaleScreen activeTable={activeTable} activeCustomer={activeCustomer}
            cart={cart} setCart={setCart} addItem={addItem} adjustQty={adjustQty}
            setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer}/>}
          {screen==='calendar'  && <CalendarScreen/>}
          {screen==='customers' && <CustomersScreen setActiveCustomer={setActiveCustomer} setScreen={setScreen}/>}
          {screen==='packages'  && <PackagesScreen/>}
          {screen==='inventory' && <InventoryScreen/>}
          {screen==='reports'   && <ReportsScreen permissions={auth.permissions}/>}
          {screen==='admin'     && <AdminScreen auth={auth}/>}
        </div>
      </div>

      <PaymentModal open={paymentOpen} total={totals.total}
        onCancel={()=>setPaymentOpen(false)}
        onComplete={(data)=>{setPaymentOpen(false);setReceipt(data);setCart([]);setActiveTable(null)}}/>
      <ReceiptToast data={receipt} onClose={()=>setReceipt(null)}/>
      {auth.locked && <LockScreen auth={auth}/>}
    </div>
  )
}

// ================================================================
// NEXT.JS PAGE ENTRY
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
    <div style={{ minHeight:'100vh', background:'#0d2818', display:'flex', alignItems:'center',
      justifyContent:'center', color:'#f6f1e8', fontFamily:'system-ui', fontSize:16 }}>
      Nalagam blagajno...
    </div>
  )

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden' }}>
      <KlasikApp/>
    </div>
  )
}
