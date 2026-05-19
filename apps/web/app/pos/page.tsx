// @ts-nocheck
'use client'
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ================================================================
// POS DATA — demo podatki za razvoj
// ================================================================
const POS_DATA_DEMO: any = {
  business: { name: 'ŠIRM fitness&bar', location: 'Gorenja vas' },
  today: {
    promet: 487.40, racuni: 34, averageBill: 14.33, tipsTotal: 28.50,
    hourlySales: [12,8,22,45,38,67,82,91,44,28,15,6],
  },
  spaces: [
    { id: 'sp-bar', name: 'Bar', color: '#8FBF8F', tables: [
      { id: 't1', name: 'B1', seats: 2, x: 10, y: 10, status: 'free' },
      { id: 't2', name: 'B2', seats: 4, x: 30, y: 10, status: 'occupied', order: 24.50, since: '18:30', server: 'Ana' },
      { id: 't3', name: 'B3', seats: 4, x: 50, y: 10, status: 'reserved', reservedFor: 'Novak 19:00' },
      { id: 't4', name: 'B4', seats: 6, x: 70, y: 10, status: 'free' },
    ]},
    { id: 'sp-terasa', name: 'Terasa', color: '#e9b949', tables: [
      { id: 't5', name: 'T1', seats: 4, x: 15, y: 20, status: 'free' },
      { id: 't6', name: 'T2', seats: 4, x: 40, y: 20, status: 'occupied', order: 18.00, since: '19:00', server: 'Eva' },
    ]},
  ],
  categories: [
    { id: 'cat-fav', name: 'Priljubljeni', icon: '⭐', color: '#e9b949' },
    { id: 'cat-kava', name: 'Kava', icon: '☕', color: '#7B4F2E' },
    { id: 'cat-pijaca', name: 'Pijača', icon: '🍺', color: '#3a6e8f' },
    { id: 'cat-hrana', name: 'Hrana', icon: '🍔', color: '#2d7a2d' },
    { id: 'cat-fitness', name: 'Fitness', icon: '💪', color: '#1f6b3a' },
  ],
  items: [
    { id: 'i1', name: 'Espresso', price: 1.60, cat: 'cat-kava', code: 'ESP', fav: true, stock: 999 },
    { id: 'i2', name: 'Cappuccino', price: 2.40, cat: 'cat-kava', code: 'CAP', fav: true, stock: 999 },
    { id: 'i3', name: 'Laško 0,5', price: 3.20, cat: 'cat-pijaca', code: 'LAS', stock: 48 },
    { id: 'i4', name: 'Burger klasik', price: 9.80, cat: 'cat-hrana', code: 'BRG', fav: true, stock: 12 },
    { id: 'i5', name: 'Krompirček', price: 3.80, cat: 'cat-hrana', code: 'KRP', stock: 30 },
    { id: 'i6', name: 'PT 1:1 (60min)', price: 50.00, cat: 'cat-fitness', code: 'PT1', bookable: true, stock: 999 },
    { id: 'i7', name: 'Fizioterapija', price: 60.00, cat: 'cat-fitness', code: 'FIZ', bookable: true, stock: 999 },
    { id: 'i8', name: 'Masaža 60min', price: 40.00, cat: 'cat-fitness', code: 'MAS', bookable: true, stock: 999 },
    { id: 'i9', name: 'Dnevna vstopnica', price: 7.00, cat: 'cat-fitness', code: 'DVS', stock: 999 },
  ],
  paymentMethods: [
    { id: 'cash', name: 'Gotovina', icon: '💵' },
    { id: 'card', name: 'Kartica', icon: '💳' },
    { id: 'voucher', name: 'Bon', icon: '🎫' },
    { id: 'prepaid', name: 'Predplačilo', icon: '📱' },
    { id: 'invoice', name: 'Račun', icon: '📄' },
    { id: 'split', name: 'Razdeli', icon: '✂️' },
  ],
  tips: [0, 5, 10, 15],
  modifierGroups: {},
  staff: [
    { id: 's1', name: 'Nik Mahnič', role: 'Lastnik', pin: '1234', color: '#1f6b3a',
      permissions: { sale: true, manageBookings: true, viewMembers: true, editPrices: true,
        viewReports: true, viewSales: true, editSpaces: true, manageStaff: true } },
    { id: 's2', name: 'Ana Kovač', role: 'Blagajnik', pin: '4567', color: '#7b61b8',
      permissions: { sale: true, manageBookings: true, viewMembers: true, editPrices: false,
        viewReports: false, viewSales: false, editSpaces: false, manageStaff: false } },
    { id: 's3', name: 'Luka Novak', role: 'Trener', pin: '3456', color: '#3a6e8f',
      permissions: { sale: false, manageBookings: true, viewMembers: true, editPrices: false,
        viewReports: false, viewSales: false, editSpaces: false, manageStaff: false } },
  ],
  masterPin: '9999',
  rolePresets: {
    'Lastnik': { sale: true, manageBookings: true, viewMembers: true, editPrices: true, viewReports: true, viewSales: true, editSpaces: true, manageStaff: true },
    'Vodja': { sale: true, manageBookings: true, viewMembers: true, editPrices: true, viewReports: true, viewSales: true, editSpaces: true, manageStaff: false },
    'Blagajnik': { sale: true, manageBookings: true, viewMembers: true, editPrices: false, viewReports: false, viewSales: false, editSpaces: false, manageStaff: false },
    'Trener': { sale: false, manageBookings: true, viewMembers: true, editPrices: false, viewReports: false, viewSales: false, editSpaces: false, manageStaff: false },
  },
  permissionGroups: [
    { title: 'Blagajna & Prodaja', items: [
      ['sale', 'Prodaja'], ['discount', 'Ročni popust'], ['refund', 'Vračilo'],
      ['dailyClose', 'Dnevni zaključek'],
    ]},
    { title: 'Člani & Termini', items: [
      ['viewMembers', 'Poglej člane'], ['manageBookings', 'Upravljaj termine'],
    ]},
    { title: 'Finance', items: [
      ['viewSales', 'Poglej promet'], ['viewReports', 'Poglej poročila'],
    ]},
    { title: 'Nastavitve', items: [
      ['editPrices', 'Uredi cenik'], ['editSpaces', 'Prostori & mize'], ['manageStaff', 'Zaposleni'],
    ]},
  ],
  autoLockOptions: [
    { id: 'never', label: 'Nikoli', ms: 0 },
    { id: '15s', label: '15 sekund', ms: 15000 },
    { id: '30s', label: '30 sekund', ms: 30000 },
    { id: '1m', label: '1 minuta', ms: 60000 },
    { id: '5m', label: '5 minut', ms: 300000 },
  ],
  profiles: [
    { id: 'all', name: 'Vse funkcije', icon: '🏢', desc: 'Polna blagajna z vsemi moduli.',
      nav: ['floor','sale','calendar','customers','packages','inventory','reports','admin'] },
    { id: 'fitness', name: 'Fitness / Wellness', icon: '💪', desc: 'Termini, člani, paketi.',
      nav: ['calendar','customers','packages','sale','reports','admin'] },
    { id: 'gostinstvo', name: 'Gostinstvo', icon: '🍽️', desc: 'Mize, prodaja, blagajna.',
      nav: ['floor','sale','inventory','reports','admin'] },
  ],
  customers: [
    { id: 'c1', name: 'Petra Kralj', phone: '041 123 456', email: 'petra@email.com',
      tier: 'Zlato', points: 450, prepaid: 50, visits: 34, lastVisit: '12.5.', spent: 1240, avg: 36.47, since: 'jan 2025',
      membership: { type: 'Mesečna neomejena', expires: '2026-05-25', visits: null },
      packages: [{ name: '10x vstopnica', remaining: 3, total: 10, expires: '2026-06-15', itemId: 'i9' }],
      history: [{ date: '12.5.', desc: 'PT trening', amount: 0, type: 'package' }, { date: '8.5.', desc: 'Espresso x2', amount: 3.20, type: 'cash' }] },
    { id: 'c2', name: 'Miha Novak', phone: '040 987 654', email: 'miha@email.com',
      tier: 'Srebro', points: 180, prepaid: 0, visits: 12, lastVisit: '10.5.', spent: 480, avg: 40, since: 'mar 2025',
      membership: { type: '10x vstopnica', expires: '2026-05-20', visits: 2 },
      packages: [], history: [] },
    { id: 'c3', name: 'Jana Štern', phone: '051 555 777', email: null,
      tier: 'Bron', points: 45, prepaid: 20, visits: 5, lastVisit: '5.5.', spent: 210, avg: 42, since: 'apr 2025',
      membership: null, packages: [], history: [] },
  ],
  bookings: [
    { id: 'b1', customerId: 'c1', staffId: 's3', itemId: 'i6', date: '2026-05-14',
      time: '09:00', duration: 60, status: 'confirmed', reminderSent: true, isTable: false },
    { id: 'b2', customerId: 'c2', staffId: 's3', itemId: 'i7', date: '2026-05-14',
      time: '10:00', duration: 60, status: 'tentative', reminderSent: false, isTable: false },
    { id: 'b3', customerId: 'c3', staffId: 's1', itemId: 'i8', date: '2026-05-14',
      time: '14:00', duration: 60, status: 'confirmed', reminderSent: false, isTable: false },
    { id: 'b4', customerId: 'c1', staffId: null, tableId: 't2', date: '2026-05-14',
      time: '19:00', partySize: 4, customerName: 'Kralj', isTable: true, reminderSent: true },
  ],
  packageTemplates: [
    { id: 'pt1', name: 'Mesečna neomejena', price: 45, type: 'unlimited', validityDays: 30,
      desc: 'Neomejeno število obiskov v mesecu dni.', visits: null },
    { id: 'pt2', name: '10x vstopnica', price: 80, type: 'visits', visits: 10, validityDays: 90,
      desc: '10 vstopov v fitnes, veljavnost 3 mesece.' },
    { id: 'pt3', name: 'Letna karta', price: 420, type: 'unlimited', validityDays: 365,
      desc: 'Neomejeno obiskov celo leto.' },
    { id: 'pt4', name: 'Jutro (6–12h)', price: 30, type: 'time-restricted', validityDays: 30,
      hoursFrom: '06:00', hoursTo: '12:00', desc: 'Vstopi samo v jutranjih urah.' },
  ],
  services: [
    { id: 'sv1', name: 'PT 1:1', color: '#3a6e8f', durationMin: 60, price: 50, defaultStaffId: 's3' },
    { id: 'sv2', name: 'Fizioterapija', color: '#1f6b3a', durationMin: 60, price: 60, defaultStaffId: 's1' },
    { id: 'sv3', name: 'Masaža', color: '#7b61b8', durationMin: 60, price: 40, defaultStaffId: 's2' },
    { id: 'sv4', name: 'Skupinska vadba', color: '#e9b949', durationMin: 60, price: 15, defaultStaffId: 's3' },
  ],
  happyHourRules: [
    { id: 'hh1', name: 'Vesela ura — pijača', active: true, days: ['Pon','Tor','Sre','Čet','Pet'],
      from: '16:00', to: '18:00', discount: 20, categories: ['cat-pijaca'] },
  ],
  refunds: [
    { id: 'r1', original: 'Račun #1042', amount: -12.40, date: '14.5.', time: '11:22', cashier: 'Ana K.', reason: 'Stranka nezadovoljna z jedjo.' },
  ],
}

// ─── Helpers ───────────────────────────────────────────────────────
const posHelpers = {
  profile: (id: string) => POS_DATA_DEMO.profiles.find((p: any) => p.id === id) || POS_DATA_DEMO.profiles[0],
  itemsIn: (catId: string) => POS_DATA_DEMO.items.filter((i: any) => i.cat === catId),
  customer: (id: string) => POS_DATA_DEMO.customers.find((c: any) => c.id === id),
  itemOf: (id: string) => POS_DATA_DEMO.items.find((i: any) => i.id === id),
  lineTotal: (line: any) => {
    const modTotal = (line.mods || []).reduce((s: number, m: any) => s + (m.delta || 0), 0)
    return (line.price + modTotal) * (line.qty || 1)
  },
  orderTotals: (cart: any[]) => {
    const sub = cart.reduce((s: number, l: any) => s + posHelpers.lineTotal(l), 0)
    return { sub, ddv: sub - sub / 1.22, total: sub }
  },
  memberStatus: (c: any) => {
    if (!c.membership) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const expires = c.membership.expires ? new Date(c.membership.expires) : null
    const today = new Date('2026-05-14')
    const daysToExpiry = expires ? Math.floor((expires.getTime() - today.getTime()) / 86400000) : null
    const remainingVisits = c.membership.visits !== null ? c.membership.visits : 999
    let status = 'active'
    if (daysToExpiry !== null && daysToExpiry < 0) status = 'expired'
    else if (daysToExpiry !== null && daysToExpiry <= 3) status = 'critical'
    else if (daysToExpiry !== null && daysToExpiry <= 7) status = 'expiring'
    else if (remainingVisits <= 1) status = 'critical'
    else if (remainingVisits <= 2) status = 'expiring'
    return { status, remainingVisits, daysToExpiry }
  },
  computeNotifications: (resolved: any) => {
    const notifs: any[] = []
    POS_DATA_DEMO.customers.forEach((c: any) => {
      const ms = posHelpers.memberStatus(c)
      const id = 'n-' + c.id
      if (resolved[id]) return
      if (ms.status === 'expired') {
        notifs.push({ id, kind: 'member', severity: 'red', customerName: c.name,
          title: 'Članstvo poteklo', detail: 'Zahteva podaljšanje ali odjavo.',
          actions: ['extend', 'inactive'] })
      } else if (ms.status === 'critical') {
        notifs.push({ id, kind: 'member', severity: 'orange', customerName: c.name,
          title: ms.daysToExpiry !== null ? `Poteče čez \${ms.daysToExpiry} dni` : `Ostane \${ms.remainingVisits} obisk`,
          detail: 'Kmalu bo potrebno podaljšanje.',
          actions: ['extend', 'dismiss'] })
      } else if (ms.status === 'expiring') {
        notifs.push({ id, kind: 'member', severity: 'yellow', customerName: c.name,
          title: ms.daysToExpiry !== null ? `Poteče čez \${ms.daysToExpiry} dni` : `Ostaneta \${ms.remainingVisits} obiski`,
          detail: 'Priporočamo pravočasno podaljšanje.',
          actions: ['extend', 'dismiss'] })
      }
    })
    POS_DATA_DEMO.bookings.filter((b: any) => !b.isTable && !resolved['appt-' + b.id]).forEach((b: any) => {
      const c = posHelpers.customer(b.customerId)
      if (!b.reminderSent) {
        notifs.push({ id: 'appt-' + b.id, kind: 'appointment', severity: 'info',
          customerName: c?.name || '?', title: `\${b.time} — \${c?.name || 'Brez stranke'}`,
          detail: 'Opomnik ni poslan.', actions: ['dismiss'] })
      }
    })
    return notifs
  },
}

function eur(v: number) {
  return '€ ' + v.toFixed(2).replace('.', ',')
}

// ================================================================
// VGRAJENI JSX KOMPONENTI IZ CLAUDE DESIGN
// ================================================================

// ===== pos-shared.jsx =====
// Shared POS UI: modals, helpers used across all 3 variants.
// Each variant skins these with theme tokens via CSS variables.





// ─── Icons ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, stroke = "currentColor", strokeWidth = 1.7 }) => {
  const paths = {
    search:  <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    barcode: <><path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14"/></>,
    star:    <path d="M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.7 6.6 19.3l1.3-6L3.4 9.2l6-.6L12 3z"/>,
    plus:    <><path d="M12 5v14M5 12h14"/></>,
    minus:   <path d="M5 12h14"/>,
    x:       <><path d="M6 6l12 12M18 6L6 18"/></>,
    chev:    <path d="m9 6 6 6-6 6"/>,
    chevL:   <path d="m15 6-6 6 6 6"/>,
    chair:   <><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 10h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"/><path d="M7 17v3M17 17v3"/></>,
    grid:    <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user:    <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    cash:    <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    card:    <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
    print:   <><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>,
    split:   <><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-5"/><path d="M20 17h-5"/></>,
    percent: <><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    gift:    <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8s-3-5-5-3 2 3 5 3c3 0 7-1 5-3s-5 3-5 3z"/></>,
    trash:   <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    arrow:   <path d="M5 12h14M13 6l6 6-6 6"/>,
    arrowL:  <path d="M19 12H5M11 6l-6 6 6 6"/>,
    edit:    <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></>,
    check:   <path d="m5 13 4 4L20 6"/>,
    bell:    <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    clock:   <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    eye:     <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    swap:    <><path d="M7 4 3 8l4 4"/><path d="M3 8h12a4 4 0 0 1 4 4"/><path d="M17 20l4-4-4-4"/><path d="M21 16H9a4 4 0 0 1-4-4"/></>,
    menu:    <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
};

// ─── Modal shell ─────────────────────────────────────────────────────
function Modal({ open, onClose, children, width = 480, theme = {} }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: theme.scrim || 'rgba(15,20,18,0.55)',
      backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxWidth: '92%', maxHeight: '92%', overflow: 'auto',
        background: theme.modalBg || '#fff',
        color: theme.modalText || '#1a1a1a',
        borderRadius: theme.modalRadius ?? 14,
        border: theme.modalBorder || '1px solid rgba(0,0,0,0.06)',
        boxShadow: theme.modalShadow || '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Modifier modal ─────────────────────────────────────────────────
function ModifierModal({ item, onCancel, onConfirm, theme }) {
  const groups = (D.modifierGroups[item?.cat] || []);
  const [picks, setPicks] = useState(() => {
    // Pre-select required first option
    const init = {};
    groups.forEach((g, i) => {
      if (g.required) init[i] = [g.options[0].id];
      else init[i] = [];
    });
    return init;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const togglePick = (gi, id, multi) => {
    setPicks(p => {
      const cur = p[gi] || [];
      if (multi) {
        return { ...p, [gi]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
      }
      return { ...p, [gi]: cur.includes(id) ? [] : [id] };
    });
  };

  const selectedMods = useMemo(() => {
    const out = [];
    groups.forEach((g, gi) => {
      (picks[gi] || []).forEach(id => {
        const opt = g.options.find(o => o.id === id);
        if (opt) out.push({ id: opt.id, name: opt.name, delta: opt.delta });
      });
    });
    return out;
  }, [picks, groups]);

  const lineTotal = H.lineTotal({ price: item?.price || 0, mods: selectedMods, qty });

  return (
    <Modal open={!!item} onClose={onCancel} theme={theme} width={520}>
      <div style={{ padding: '20px 22px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: theme.muted || '#888' }}>Dodaj v naročilo</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{item?.name}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {eur(item?.price || 0)}
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {groups.length === 0 && (
          <div style={{ padding: '14px 0', color: theme.muted || '#999', fontSize: 13 }}>
            Brez modifikatorjev za ta artikel.
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
              {g.required && <div style={{ fontSize: 10, color: theme.accent || '#c0392b',
                background: theme.accentSoft || 'rgba(192,57,43,0.1)', padding: '2px 6px',
                borderRadius: 4, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600
              }}>Obvezno</div>}
              {g.multi && <div style={{ fontSize: 11, color: theme.muted || '#999' }}>več izbir</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {g.options.map(opt => {
                const selected = (picks[gi] || []).includes(opt.id);
                return (
                  <button key={opt.id} onClick={() => togglePick(gi, opt.id, g.multi)} style={{
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: selected ? (theme.accentSoft || '#eef5ee') : (theme.chipBg || '#f5f3ef'),
                    border: `1.5px solid ${selected ? (theme.accent || '#1f6b3a') : 'transparent'}`,
                    color: selected ? (theme.accent || '#1f6b3a') : (theme.text || '#222'),
                    fontWeight: 500, textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                  }}>
                    <span>{opt.name}</span>
                    {opt.delta !== 0 && (
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {opt.delta > 0 ? '+' : ''}{eur(opt.delta)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Opomba kuhinji</div>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="npr. brez čebule, na pol pečeno…" style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'inherit', fontSize: 13,
              background: theme.inputBg || '#fafaf7', color: 'inherit', outline: 'none',
              boxSizing: 'border-box',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 0', borderTop: '1px solid rgba(0,0,0,0.08)',
                      marginTop: 4 }}>
          <div style={{ fontSize: 12, color: theme.muted || '#888', fontWeight: 600 }}>Količina</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
              background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="minus" size={14}/></button>
            <div style={{ minWidth: 28, textAlign: 'center', fontWeight: 600, fontSize: 16 }}>{qty}</div>
            <button onClick={() => setQty(q => q + 1)} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
              background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="plus" size={14}/></button>
          </div>
          <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
            {eur(lineTotal)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '14px 22px 22px' }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'inherit',
          fontWeight: 600, fontSize: 14,
        }}>Prekliči</button>
        <button onClick={() => onConfirm({ qty, mods: selectedMods, note })} style={{
          flex: 2, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: 'none', background: theme.accent || '#1f6b3a', color: theme.accentText || '#fff',
          fontWeight: 700, fontSize: 14,
        }}>Dodaj v naročilo</button>
      </div>
    </Modal>
  );
}

// ─── Payment modal ───────────────────────────────────────────────────
function PaymentModal({ open, total, onCancel, onComplete, theme }) {
  const [method, setMethod] = useState('cash');
  const [tipPct, setTipPct] = useState(0);
  const [given, setGiven] = useState('');
  const [discount, setDiscount] = useState(0);
  const [splitN, setSplitN] = useState(1);
  const [furs, setFurs] = useState(true);
  const [printOnly, setPrintOnly] = useState(false);

  const subTotal = total;
  const tipAmt = subTotal * tipPct / 100;
  const finalTotal = (subTotal - subTotal * discount / 100) + tipAmt;
  const perSplit = finalTotal / Math.max(1, splitN);
  const change = method === 'cash' && given ? Math.max(0, parseFloat(given) - finalTotal) : 0;

  useEffect(() => {
    if (!open) { setMethod('cash'); setTipPct(0); setGiven(''); setDiscount(0); setSplitN(1); setFurs(true); setPrintOnly(false); }
  }, [open]);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} theme={theme} width={620}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.muted || '#888' }}>Plačilo</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>Zaključi račun</div>
        </div>
        <button onClick={onCancel} style={{
          width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)',
          background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit',
        }}><Icon name="x" size={16}/></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 0, minHeight: 380 }}>
        {/* Left: methods + extras */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: theme.muted || '#666', marginBottom: 8,
                          textTransform: 'uppercase', letterSpacing: '0.06em' }}>Način plačila</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {D.paymentMethods.slice(0, 6).map(pm => {
                const active = method === pm.id;
                return (
                  <button key={pm.id} onClick={() => setMethod(pm.id)} style={{
                    padding: '14px 8px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? (theme.accent || '#1f6b3a') : (theme.chipBg || '#f5f3ef'),
                    color: active ? (theme.accentText || '#fff') : 'inherit',
                    border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    fontWeight: 600, fontSize: 12,
                  }}>
                    <span style={{ fontSize: 22 }}>{pm.icon}</span>
                    {pm.name}
                  </button>
                );
              })}
            </div>
          </div>

          {method === 'cash' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, color: theme.muted || '#666', marginBottom: 8,
                            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prejeto v gotovini</div>
              <input value={given} onChange={e => setGiven(e.target.value)}
                placeholder={eur(finalTotal)} style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'inherit', fontSize: 22,
                  fontWeight: 600, background: theme.inputBg || '#fafaf7', color: 'inherit', outline: 'none',
                  boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums',
              }}/>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[5, 10, 20, 50, 100].map(v => (
                  <button key={v} onClick={() => setGiven(String(v))} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
                    background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: 600, fontSize: 13,
                  }}>{v}€</button>
                ))}
                <button onClick={() => setGiven(String(finalTotal.toFixed(2)))} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
                  background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
                  fontWeight: 600, fontSize: 13,
                }}>Točen znesek</button>
              </div>
              {change > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8,
                              background: theme.accentSoft || 'rgba(31,107,58,0.08)',
                              color: theme.accent || '#1f6b3a', fontWeight: 600, fontSize: 14,
                              display: 'flex', justifyContent: 'space-between' }}>
                  <span>Za vrniti</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(change)}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: theme.muted || '#666', marginBottom: 8,
                            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Napitnina</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {D.tips.map(p => (
                  <button key={p} onClick={() => setTipPct(p)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    border: 'none', fontWeight: 600, fontSize: 13,
                    background: tipPct === p ? (theme.accentSoft || 'rgba(31,107,58,0.12)') : (theme.chipBg || '#f5f3ef'),
                    color: tipPct === p ? (theme.accent || '#1f6b3a') : 'inherit',
                  }}>{p === 0 ? '—' : `${p}%`}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: theme.muted || '#666', marginBottom: 8,
                            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Popust</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,5,10,20].map(p => (
                  <button key={p} onClick={() => setDiscount(p)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    border: 'none', fontWeight: 600, fontSize: 13,
                    background: discount === p ? (theme.accentSoft || 'rgba(31,107,58,0.12)') : (theme.chipBg || '#f5f3ef'),
                    color: discount === p ? (theme.accent || '#1f6b3a') : 'inherit',
                  }}>{p === 0 ? '—' : `${p}%`}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: theme.muted || '#666', marginBottom: 8,
                          textTransform: 'uppercase', letterSpacing: '0.06em' }}>Razdeli račun</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setSplitN(n)} style={{
                  width: 44, height: 36, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  border: 'none', fontWeight: 600, fontSize: 14,
                  background: splitN === n ? (theme.accentSoft || 'rgba(31,107,58,0.12)') : (theme.chipBg || '#f5f3ef'),
                  color: splitN === n ? (theme.accent || '#1f6b3a') : 'inherit',
                }}>{n === 1 ? '—' : `${n}×`}</button>
              ))}
              {splitN > 1 && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: theme.muted || '#666' }}>na osebo:</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(perSplit)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: summary */}
        <div style={{ padding: 22, background: theme.summaryBg || '#fafaf6',
                       borderLeft: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: theme.muted || '#888', marginBottom: 12 }}>Povzetek</div>
          <Row label="Vmesna vsota" v={subTotal}/>
          {discount > 0 && <Row label={`Popust ${discount}%`} v={-subTotal * discount / 100} negative/>}
          {tipPct > 0 && <Row label={`Napitnina ${tipPct}%`} v={tipAmt}/>}
          <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <Row label="DDV (22%)" v={finalTotal - finalTotal/1.22} muted/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          marginTop: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Skupaj</div>
              <div style={{ fontWeight: 700, fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{eur(finalTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: FURS toggle + actions */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 500, color: theme.muted || '#666' }}>
          <input type="checkbox" checked={furs} onChange={e => setFurs(e.target.checked)}
                 style={{ accentColor: theme.accent || '#1f6b3a', width: 16, height: 16 }}/>
          Davčno potrdi (FURS)
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => onComplete({ method, total: finalTotal, tip: tipAmt, discount,
                                              furs: false, printOnly: true })} style={{
            padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'inherit',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="print" size={14}/> Tiskaj brez FURS
          </button>
          <button onClick={() => onComplete({ method, total: finalTotal, tip: tipAmt, discount, furs })} style={{
            padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: 'none', background: theme.accent || '#1f6b3a', color: theme.accentText || '#fff',
            fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="check" size={16}/> Zaključi {eur(finalTotal)}
          </button>
        </div>
      </div>
    </Modal>
  );

  function Row({ label, v, negative, muted }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13,
                    color: muted ? (theme.muted || '#888') : 'inherit' }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: negative ? (theme.accent || '#c0392b') : undefined }}>
          {negative ? '−' : ''}{eur(Math.abs(v))}
        </span>
      </div>
    );
  }
}

// ─── Success toast / receipt confirmation ────────────────────────────
function ReceiptToast({ data, onClose, theme }) {
  if (!data) return null;
  return (
    <Modal open={!!data} onClose={onClose} theme={theme} width={360}>
      <div style={{ padding: '28px 22px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 999, margin: '0 auto 14px',
          background: theme.accentSoft || 'rgba(31,107,58,0.12)',
          color: theme.accent || '#1f6b3a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="check" size={28} strokeWidth={2.5}/>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Račun zaključen</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {eur(data.total)}
        </div>
        <div style={{ fontSize: 13, color: theme.muted || '#888', marginTop: 8 }}>
          {data.printOnly ? 'Tiskano brez FURS potrdila' : (data.furs ? 'FURS potrjen' : 'Brez FURS potrditve')}
          &nbsp;•&nbsp; #{Math.floor(Math.random() * 9000 + 1000)}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', color: 'inherit',
            fontWeight: 600, fontSize: 13,
          }}>Zapri</button>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: 'none', background: theme.accent || '#1f6b3a', color: theme.accentText || '#fff',
            fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Icon name="print" size={14}/> Natisni
          </button>
        </div>
      </div>
    </Modal>
  );
}


// ===== pos-klasik-shell.jsx =====
// Klasik POS v2 — Shell, theme, icons, navigation, header
// Hosts the screen router; each screen lives in pos-klasik-screens.jsx

const KLASIK = {
  bg:          '#f4efe5',
  surface:     '#ffffff',
  surface2:    '#faf5e9',
  surface3:    '#efeadf',
  ink:         '#1a1f1a',
  inkSoft:     '#3a3f3a',
  muted:       '#6b6962',
  mutedSoft:   '#9a9890',
  line:        'rgba(26,31,26,0.10)',
  lineSoft:    'rgba(26,31,26,0.06)',
  header:      '#0d2818',
  headerInk:   '#f6f1e8',
  headerLine:  'rgba(246,241,232,0.10)',
  brand:       '#e9b949',
  accent:      '#1f6b3a',
  accentText:  '#ffffff',
  accentSoft:  'rgba(31,107,58,0.10)',
  danger:      '#a83232',
  warn:        '#b88c28',
  chipBg:      '#efeadf',
  modalBg:     '#fff',
  inputBg:     '#fafaf7',
  summaryBg:   '#f9f5eb',
  status: {
    free:      { bg:'#ffffff', stroke:'rgba(31,107,58,0.5)', dot:'#1f6b3a', label:'Prosto' },
    occupied:  { bg:'rgba(233,185,73,0.18)', stroke:'rgba(184,140,40,0.55)', dot:'#b88c28', label:'Zasedeno' },
    reserved:  { bg:'rgba(155,122,201,0.15)', stroke:'rgba(99,72,150,0.5)', dot:'#634896', label:'Rezerv.' },
    needs_attention: { bg:'rgba(168,50,50,0.10)', stroke:'rgba(168,50,50,0.55)', dot:'#a83232', label:'Pozor' },
  },
};

// ─── Icons (extended set) ──────────────────────────────────────────
const KI = ({ name, size = 18, strokeWidth = 1.7 }) => {
  const paths = {
    search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    barcode:  <><path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14"/></>,
    star:     <path d="M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.7 6.6 19.3l1.3-6L3.4 9.2l6-.6L12 3z"/>,
    plus:     <><path d="M12 5v14M5 12h14"/></>,
    minus:    <path d="M5 12h14"/>,
    x:        <><path d="M6 6l12 12M18 6L6 18"/></>,
    chev:     <path d="m9 6 6 6-6 6"/>,
    chevL:    <path d="m15 6-6 6 6 6"/>,
    chevD:    <path d="m6 9 6 6 6-6"/>,
    chevU:    <path d="m6 15 6-6 6 6"/>,
    chair:    <><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 10h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"/><path d="M7 17v3M17 17v3"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    receipt:  <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    users:    <><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M14 20c0-2 2-4 4-4s4 2 4 4"/></>,
    cash:     <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    card:     <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
    print:    <><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>,
    split:    <><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-5"/><path d="M20 17h-5"/></>,
    percent:  <><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    gift:     <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8s-3-5-5-3 2 3 5 3c3 0 7-1 5-3s-5 3-5 3z"/></>,
    trash:    <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    arrow:    <path d="M5 12h14M13 6l6 6-6 6"/>,
    arrowL:   <path d="M19 12H5M11 6l-6 6 6 6"/>,
    edit:     <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></>,
    check:    <path d="m5 13 4 4L20 6"/>,
    bell:     <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    eye:      <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    swap:     <><path d="M7 4 3 8l4 4"/><path d="M3 8h12a4 4 0 0 1 4 4"/><path d="M17 20l4-4-4-4"/><path d="M21 16H9a4 4 0 0 1-4-4"/></>,
    menu:     <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    box:      <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
    chart:    <><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    home:     <><path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2v-9z"/></>,
    money:    <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v6M18 9v6"/></>,
    package:  <><path d="M16 3l5 3v12l-9 5-9-5V6l5-3M3 6l9 5 9-5M12 11v10"/></>,
    phone:    <><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z"/></>,
    mail:     <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    pin:      <><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    weight:   <><path d="M5 7h14l-2 13H7L5 7z"/><circle cx="12" cy="5" r="2.5"/><path d="M10.5 5h3"/></>,
    refund:   <><path d="M3 9h13a5 5 0 0 1 0 10H6"/><path d="m7 5-4 4 4 4"/></>,
    kitchen:  <><path d="M5 21V9l7-5 7 5v12"/><rect x="9" y="13" width="6" height="8"/></>,
    display:  <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
    happy:    <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></>,
    add_user: <><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-7 6-7s6 3 6 7"/><path d="M19 8v6M22 11h-6"/></>,
    fire:     <><path d="M12 3s4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 1 1 2 2 2 2 0 1-4 1-8z"/></>,
    arr_down: <path d="M12 5v14M6 13l6 6 6-6"/>,
    arr_up:   <path d="M12 19V5M6 11l6-6 6 6"/>,
    filter:   <path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] || <circle cx="12" cy="12" r="9"/>}
    </svg>
  );
};

// ─── App shell ─────────────────────────────────────────────────────
function KlasikApp() {
  const T = KLASIK;
  
  

  // Auth (PIN lock + permissions)
  const auth = window.useAuthState('1234', 60000);

  const [profileId, setProfileId] = React.useState('all');
  const profile = H.profile(profileId);

  // Map screen ids → required permission
  const screenPerm = {
    floor:     null,
    sale:      'sale',
    calendar:  'manageBookings',
    customers: 'viewMembers',
    packages:  'editPrices',
    inventory: 'editPrices',
    reports:   'viewReports',
    admin:     null,
  };
  // Filter profile nav by user permissions
  const nav = profile.nav.filter(s => {
    const p = screenPerm[s];
    if (!p) return true;
    return auth.permissions[p];
  });

  // Default screen = first allowed
  const [screen, setScreen] = React.useState(nav[0]);
  // When profile changes and current screen is not allowed → pick first
  React.useEffect(() => {
    if (!nav.includes(screen)) setScreen(nav[0]);
  }, [profileId]);

  // Global cart context — shared across floor/sale/calendar/customer flows
  const [activeTable, setActiveTable] = React.useState(null);
  const [activeCustomer, setActiveCustomer] = React.useState(null);
  const [cart, setCart] = React.useState([]);
  const [modifierItem, setModifierItem] = React.useState(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState(null);
  const [now, setNow] = React.useState(new Date());
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  // Customizable header widgets (which to show)
  const [headerWidgets, setHeaderWidgets] = React.useState({
    promet: true, racuni: true, vmesna: true, ura: true,
    notifications: true, openTabs: true, kitchen: false,
  });
  const [widgetEditor, setWidgetEditor] = React.useState(false);

  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const totals = H.orderTotals(cart);

  // Demo notifications
  const notifications = window.useNotifications();
  const [notifOpen, setNotifOpen] = React.useState(false);

  const openTabs = D.spaces.flatMap(s => s.tables.filter(t => t.openTab));

  // ─── Actions surfaced via shared keyboard shortcuts ───────────────
  function addItem(item, opts = {}) {
    if (D.modifierGroups[item.cat] && !opts.skipMods) { setModifierItem(item); return; }
    setCart(c => {
      const key = item.id + '::' + (opts.mods || []).map(m=>m.id).sort().join(',');
      const idx = c.findIndex(l => l.lineKey === key);
      if (idx >= 0) {
        const cp = [...c]; cp[idx] = { ...cp[idx], qty: cp[idx].qty + (opts.qty || 1) }; return cp;
      }
      return [...c, {
        lineId: Math.random().toString(36).slice(2),
        lineKey: key, id: item.id, name: item.name, price: item.price,
        qty: opts.qty || 1, mods: opts.mods || [], note: opts.note || '',
        unit: item.unit, fromPackage: opts.fromPackage || null,
      }];
    });
  }
  function adjustQty(lineId, delta) {
    setCart(c => c.flatMap(l => l.lineId === lineId
      ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]));
  }

  // Quick-jump screens (search-like for the cashier)
  const screens = {
    floor:     { label: 'Prostori & mize',  icon: 'chair',    hint: 'F1' },
    sale:      { label: 'Prodaja',          icon: 'grid',     hint: 'F2' },
    calendar:  { label: 'Koledar',          icon: 'calendar', hint: 'F3' },
    customers: { label: 'Stranke',          icon: 'users',    hint: 'F4' },
    packages:  { label: 'Paketi',           icon: 'package',  hint: 'F5' },
    inventory: { label: 'Zaloga',           icon: 'box',      hint: 'F6' },
    reports:   { label: 'Poročila',         icon: 'chart',    hint: 'F7' },
    admin:     { label: 'Nastavitve',       icon: 'settings', hint: 'F8' },
  };

  // Pass-through props that screens need
  const ctx = {
    T, D, H, KI,
    profile, profileId, setProfileId,
    activeTable, setActiveTable,
    activeCustomer, setActiveCustomer,
    cart, setCart,
    addItem, adjustQty,
    setModifierItem, modifierItem,
    paymentOpen, setPaymentOpen,
    receipt, setReceipt,
    totals,
    screen, setScreen,
    screens,
    nav,
  };

  return (
    <div style={{
      width: '100%', height: '100%', background: T.bg, color: T.ink,
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontSize: 13, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ─── Top header ─────────────────────────────────────────── */}
      <div style={{
        background: T.header, color: T.headerInk, padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        borderBottom: '1px solid ' + T.headerLine, minHeight: 56,
      }}>
        {/* Brand + business */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: T.brand,
            color: T.header, fontWeight: 800, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>R</div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{D.business.name}</div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
              {profile.name}
            </div>
          </div>
        </div>

        {/* Business profile picker */}
        <ProfilePicker T={T} profile={profile} onChange={setProfileId}/>

        {/* Live stats (configurable) */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {headerWidgets.promet && auth.permissions.viewSales && <StatPill T={T} label="Promet"
            value={window.eur(D.today.promet + totals.total)} color={T.brand}/>}
          {headerWidgets.racuni && <StatPill T={T} label="Računi"
            value={D.today.racuni} color={T.headerInk}/>}
          {headerWidgets.vmesna && <StatPill T={T} label="Vmesna"
            value={window.eur(totals.total)} color={cart.length ? T.brand : 'rgba(246,241,232,0.5)'}/>}
          {headerWidgets.ura && (
            <div style={{ borderLeft: '1px solid ' + T.headerLine, paddingLeft: 14,
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 10, opacity: 0.55, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {['Ned','Pon','Tor','Sre','Čet','Pet','Sob'][now.getDay()]}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
              </div>
            </div>
          )}

          {/* Header utility buttons */}
          {headerWidgets.openTabs && openTabs.length > 0 && (
            <HeaderBtn T={T} icon="receipt" badge={openTabs.length}
              tooltip={openTabs.length + ' odprtih računov'}/>
          )}
          {headerWidgets.notifications && (
            <HeaderBtn T={T} icon="bell" badge={notifications.notifs.length || null}
              tooltip="Obvestila"
              onClick={() => setNotifOpen(o => !o)}/>
          )}
          {headerWidgets.kitchen && (
            <HeaderBtn T={T} icon="kitchen" tooltip="Kuhinja"/>
          )}
          <HeaderBtn T={T} icon="settings" tooltip="Prilagodi glavo"
            onClick={() => setWidgetEditor(v => !v)}/>

          {/* User avatar replaces static cashier text */}
          <window.UserAvatar user={auth.user} onLock={auth.lock} T={T}/>
        </div>

        {widgetEditor && (
          <WidgetEditor T={T} widgets={headerWidgets} setWidgets={setHeaderWidgets}
            onClose={() => setWidgetEditor(false)}/>
        )}
        {notifOpen && (
          <window.NotificationsPanel T={T} notifs={notifications.notifs}
            resolve={notifications.resolve}
            onClose={() => setNotifOpen(false)} ctx={null}/>
        )}
      </div>

      {/* ─── Active context strip (table / customer) ─────────────── */}
      {(activeTable || activeCustomer) && (
        <ContextStrip T={T} activeTable={activeTable} activeCustomer={activeCustomer}
          onClearTable={() => setActiveTable(null)}
          onClearCustomer={() => setActiveCustomer(null)}/>
      )}

      {/* ─── Body: side nav + screen ───────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Side nav */}
        <SideNav ctx={ctx}/>

        {/* Current screen */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {screen === 'floor'     && <FloorScreen ctx={ctx}/>}
          {screen === 'sale'      && <SaleScreen ctx={ctx}/>}
          {screen === 'calendar'  && <CalendarScreen ctx={ctx}/>}
          {screen === 'customers' && <CustomersScreen ctx={ctx}/>}
          {screen === 'packages'  && <window.PackagesScreen ctx={ctx}/>}
          {screen === 'inventory' && <InventoryScreen ctx={ctx}/>}
          {screen === 'reports'   && <ReportsScreen ctx={ctx}/>}
          {screen === 'admin'     && <AdminScreen ctx={ctx} auth={auth}/>}
        </div>
      </div>

      {/* Modals */}
      <ModifierModal item={modifierItem} theme={T}
        onCancel={() => setModifierItem(null)}
        onConfirm={({ qty, mods, note }) => {
          const it = modifierItem; setModifierItem(null);
          addItem(it, { qty, mods, note, skipMods: true });
        }}/>
      <PaymentModal open={paymentOpen} total={totals.total} theme={T}
        customer={activeCustomer}
        onCancel={() => setPaymentOpen(false)}
        onComplete={(data) => { setPaymentOpen(false); setReceipt(data); setCart([]);
                                setActiveTable(null); }}/>
      <ReceiptToast data={receipt} onClose={() => setReceipt(null)} theme={T}/>

      {/* Lock screen overlay */}
      {auth.locked && <window.LockScreen auth={auth} theme={T}/>}
    </div>
  );
}

// ─── Stat pill ─────────────────────────────────────────────────────
function StatPill({ T, label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1 }}>
      <div style={{ fontSize: 10, opacity: 0.55, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums',
                    marginTop: 2, letterSpacing: '-0.01em' }}>{value}</div>
    </div>
  );
}

function HeaderBtn({ T, icon, badge, tooltip, onClick }) {
  return (
    <button onClick={onClick} title={tooltip} style={{
      position: 'relative', width: 36, height: 36, borderRadius: 9,
      background: 'rgba(255,255,255,0.06)', border: 'none', color: T.headerInk,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <KI name={icon} size={17}/>
      {badge && (
        <span style={{
          position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 3px',
          background: T.brand, color: T.header, borderRadius: 999,
          fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid ' + T.header,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ─── Profile picker ────────────────────────────────────────────────
function ProfilePicker({ T, profile, onChange }) {
  const [open, setOpen] = React.useState(false);
  
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'rgba(255,255,255,0.08)', border: 'none', color: T.headerInk,
        padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>{profile.icon}</span>
        <span>Tip: <b>{profile.name}</b></span>
        <KI name="chevD" size={13}/>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 30,
          }}/>
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 31,
            width: 320, background: '#fff', color: T.ink, borderRadius: 12,
            boxShadow: '0 14px 40px rgba(0,0,0,0.25)', padding: 8,
            border: '1px solid ' + T.line,
          }}>
            <div style={{ padding: '8px 10px 6px', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.08em', color: T.muted }}>
              Tip poslovanja — vpliva na razdelke
            </div>
            {D.profiles.map(p => (
              <button key={p.id} onClick={() => { onChange(p.id); setOpen(false); }} style={{
                width: '100%', padding: '10px 10px', borderRadius: 8, marginBottom: 2,
                background: p.id === profile.id ? T.accentSoft : 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: T.ink,
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{p.desc}</div>
                </div>
                {p.id === profile.id && <KI name="check" size={16}/>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Header widget editor ─────────────────────────────────────────
function WidgetEditor({ T, widgets, setWidgets, onClose }) {
  const items = [
    { id: 'promet', label: 'Promet (€)' },
    { id: 'racuni', label: 'Št. računov' },
    { id: 'vmesna', label: 'Vmesna vsota' },
    { id: 'ura',    label: 'Ura & dan' },
    { id: 'notifications', label: 'Obvestila (zvonček)' },
    { id: 'openTabs',      label: 'Odprti računi (tabs)' },
    { id: 'kitchen',       label: 'Kuhinja' },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }}/>
      <div style={{
        position: 'absolute', top: 60, right: 14, zIndex: 41,
        width: 260, background: '#fff', color: T.ink, borderRadius: 12,
        boxShadow: '0 14px 40px rgba(0,0,0,0.25)', padding: 12,
        border: '1px solid ' + T.line,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Prilagodi glavo</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', color: T.muted,
            display: 'flex', padding: 4,
          }}><KI name="x" size={14}/></button>
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
          Izberi, kaj naj se prikazuje v zgornji vrstici.
        </div>
        {items.map(it => (
          <label key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
            borderRadius: 7, cursor: 'pointer',
            background: widgets[it.id] ? T.accentSoft : 'transparent',
          }}>
            <input type="checkbox" checked={!!widgets[it.id]}
              onChange={e => setWidgets({ ...widgets, [it.id]: e.target.checked })}
              style={{ accentColor: T.accent, width: 16, height: 16 }}/>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{it.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

// ─── Active context strip ─────────────────────────────────────────
function ContextStrip({ T, activeTable, activeCustomer, onClearTable, onClearCustomer }) {
  return (
    <div style={{
      background: T.brand, color: T.header, padding: '8px 18px',
      display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 600,
      flexShrink: 0,
    }}>
      {activeTable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KI name="chair" size={14}/>
          <span>Aktivna miza: <b style={{ fontWeight: 800 }}>{activeTable.name}</b></span>
          {activeTable.seats && <span style={{ opacity: 0.7 }}>· {activeTable.seats} mest</span>}
          {activeTable.openTab && <span style={{ opacity: 0.7 }}>· odprt račun</span>}
          <button onClick={onClearTable} style={{
            background: 'rgba(13,40,24,0.15)', border: 'none', cursor: 'pointer',
            padding: '3px 6px', borderRadius: 5, color: 'inherit', display: 'flex',
          }}><KI name="x" size={11}/></button>
        </div>
      )}
      {activeCustomer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KI name="user" size={14}/>
          <span>Stranka: <b style={{ fontWeight: 800 }}>{activeCustomer.name}</b></span>
          <span style={{ opacity: 0.7 }}>· {activeCustomer.tier} · {activeCustomer.points} t.</span>
          {activeCustomer.prepaid > 0 && (
            <span style={{ opacity: 0.7 }}>· predplačilo {window.eur(activeCustomer.prepaid)}</span>
          )}
          <button onClick={onClearCustomer} style={{
            background: 'rgba(13,40,24,0.15)', border: 'none', cursor: 'pointer',
            padding: '3px 6px', borderRadius: 5, color: 'inherit', display: 'flex',
          }}><KI name="x" size={11}/></button>
        </div>
      )}
    </div>
  );
}

// ─── Side nav ─────────────────────────────────────────────────────
function SideNav({ ctx }) {
  const { T, screen, setScreen, screens, nav } = ctx;
  return (
    <div style={{
      width: 80, background: T.surface, borderRight: '1px solid ' + T.line,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 0', gap: 4, flexShrink: 0,
    }}>
      {nav.map(id => {
        const s = screens[id];
        const active = screen === id;
        return (
          <button key={id} onClick={() => setScreen(id)} title={s.label} style={{
            width: 64, padding: '11px 4px', borderRadius: 10, cursor: 'pointer',
            background: active ? T.accentSoft : 'transparent',
            color: active ? T.accent : T.inkSoft,
            border: 'none', fontFamily: 'inherit', position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          }}>
            {active && <span style={{
              position: 'absolute', left: -2, top: 10, bottom: 10, width: 3, borderRadius: 2,
              background: T.accent,
            }}/>}
            <KI name={s.icon} size={20}/>
            <span style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>
              {s.label.split(' ')[0]}
            </span>
          </button>
        );
      })}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button title="Pomoč" style={{
          width: 48, height: 48, borderRadius: 10, cursor: 'pointer',
          background: 'transparent', color: T.muted, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700,
        }}>?</button>
      </div>
    </div>
  );
}


// ===== pos-klasik-auth.jsx =====
// Auth: PIN lock screen + permissions context
// Wraps the entire POS — when locked, only the lock screen is visible.

function useAuthState(initialPin = "1234", autoLockMs = 60000) {
  
  const initialUser = D.staff.find(s => s.pin === initialPin) || D.staff[0];
  const [user, setUser]   = React.useState(initialUser);
  const [locked, setLocked] = React.useState(false);
  const [autoLock, setAutoLock] = React.useState(autoLockMs);
  const lastActivity = React.useRef(Date.now());

  // Track activity to reset idle timer
  React.useEffect(() => {
    const reset = () => { lastActivity.current = Date.now(); };
    ['mousedown','touchstart','keydown','wheel'].forEach(e => window.addEventListener(e, reset));
    return () => ['mousedown','touchstart','keydown','wheel'].forEach(e => window.removeEventListener(e, reset));
  }, []);

  // Idle timer
  React.useEffect(() => {
    if (autoLock === 0) return;
    const t = setInterval(() => {
      if (!locked && Date.now() - lastActivity.current > autoLock) setLocked(true);
    }, 1000);
    return () => clearInterval(t);
  }, [autoLock, locked]);

  const permissions = React.useMemo(() => {
    if (!user) return {};
    const role = user.role;
    return user.permissions || D.rolePresets[role] || {};
  }, [user]);

  function unlock(pin) {
    const found = D.staff.find(s => s.pin === pin);
    if (found) { setUser(found); setLocked(false); lastActivity.current = Date.now(); return true; }
    return false;
  }
  function lock() { setLocked(true); }
  function isMasterPin(pin) { return pin === D.masterPin; }

  return { user, permissions, locked, lock, unlock, isMasterPin, autoLock, setAutoLock };
}

// ─── Lock screen ───────────────────────────────────────────────────
function LockScreen({ auth, theme }) {
  const T = theme;
  
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState(false);
  const [now, setNow] = React.useState(new Date());
  const [showMaster, setShowMaster] = React.useState(false);

  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  function press(d) {
    if (pin.length >= 6) return;
    setError(false);
    const next = pin + d;
    setPin(next);
  }
  function backspace() { setError(false); setPin(p => p.slice(0, -1)); }
  function tryUnlock() {
    if (auth.unlock(pin)) { setPin(""); setError(false); }
    else { setError(true); setPin(""); setTimeout(() => setError(false), 1200); }
  }
  // Auto-attempt when length 4
  React.useEffect(() => { if (pin.length === 4 || pin.length === 6) {
    const timer = setTimeout(tryUnlock, 200); return () => clearTimeout(timer);
  } }, [pin]);

  const days = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'];
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1000,
      background: 'radial-gradient(circle at center, #1a3520 0%, #0d2818 60%, #06140d 100%)',
      color: T.headerInk, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      {/* Top: brand + clock */}
      <div style={{
        position: 'absolute', top: 32, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: T.brand,
            color: T.header, fontWeight: 800, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>R</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{D.business.name}</div>
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, fontWeight: 600 }}>
          {D.business.location}
        </div>
      </div>

      {/* Clock */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 78, fontWeight: 200, fontVariantNumeric: 'tabular-nums',
                       letterSpacing: '-0.04em', lineHeight: 1 }}>
          {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
        </div>
        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 8, fontWeight: 500 }}>
          {days[now.getDay()]}, {now.getDate()}. {months[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      {/* PIN entry */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginBottom: 14,
                       letterSpacing: '0.04em' }}>
          {showMaster ? "Vnesite glavni PIN upravitelja" : "Vnesite svoj PIN za odklep"}
        </div>
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          animation: error ? 'shake 0.4s ease' : 'none',
        }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = pin.length > i;
            return (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: 999,
                background: filled ? (error ? '#ff5577' : T.brand) : 'rgba(246,241,232,0.15)',
                border: '1.5px solid ' + (filled ? 'transparent' : 'rgba(246,241,232,0.3)'),
                transition: 'background .15s, transform .15s',
                transform: filled ? 'scale(1.1)' : 'scale(1)',
              }}/>
            );
          })}
        </div>
        {error && (
          <div style={{ fontSize: 13, color: '#ff5577', marginTop: 14, fontWeight: 700 }}>
            Napačna koda
          </div>
        )}
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: 14 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <PinKey key={n} digit={n} onPress={() => press(String(n))} T={T}/>
        ))}
        <button onClick={() => setShowMaster(s => !s)} style={{
          width: 84, height: 84, borderRadius: 999,
          background: 'transparent', border: 'none', color: 'rgba(246,241,232,0.55)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          gap: 2, lineHeight: 1.1, padding: 8,
        }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <span>Klic<br/>upravitelja</span>
        </button>
        <PinKey digit="0" onPress={() => press("0")} T={T}/>
        <button onClick={backspace} style={{
          width: 84, height: 84, borderRadius: 999, background: 'rgba(246,241,232,0.08)',
          border: 'none', color: T.headerInk, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l5-6h13v12H8l-5-6z"/>
            <path d="m13 9 4 6M17 9l-4 6"/>
          </svg>
        </button>
      </div>

      {/* Hint footer */}
      <div style={{ position: 'absolute', bottom: 24, fontSize: 11, opacity: 0.4 }}>
        Demo PINi: Ana 1234 (lastnik) · Eva 4567 (blagajnik) · Luka 3456 (trener) · Master 9999
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

function PinKey({ digit, onPress, T }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onPress}
      style={{
      width: 84, height: 84, borderRadius: 999,
      background: pressed ? 'rgba(246,241,232,0.18)' : 'rgba(246,241,232,0.08)',
      border: 'none', color: T.headerInk, cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 28, fontWeight: 400,
      transition: 'background .08s, transform .08s',
      transform: pressed ? 'scale(0.95)' : 'scale(1)',
    }}>{digit}</button>
  );
}

// ─── User avatar (top-right) with lock menu ───────────────────────
function UserAvatar({ user, onLock, T }) {
  const [open, setOpen] = React.useState(false);
  if (!user) return null;
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0,2);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 10px',
        borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: 'none',
        color: T.headerInk, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
      }}>
        <div style={{ lineHeight: 1.1, textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{user.name.split(' ')[0]}</div>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 500 }}>{user.role}</div>
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: 999, background: user.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 11,
        }}>{initials}</div>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}/>
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            width: 220, background: '#fff', color: T.ink, borderRadius: 11,
            boxShadow: '0 14px 40px rgba(0,0,0,0.28)', padding: 6,
            border: '1px solid ' + T.line,
          }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid ' + T.lineSoft, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{user.role}</div>
            </div>
            <button onClick={() => { setOpen(false); onLock(); }} style={menuRowStyle(T)}>
              <KI name="pin" size={14}/> Zakleni
            </button>
            <button onClick={() => setOpen(false)} style={menuRowStyle(T)}>
              <KI name="user" size={14}/> Moj profil
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function menuRowStyle(T) {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 1,
    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    color: T.ink, fontSize: 13, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
  };
}

// ─── PermissionGate — show fallback when user lacks permission ──
function PermissionGate({ perm, permissions, T, isMasterPin, children }) {
  const [override, setOverride] = React.useState(false);
  const [pinAsk, setPinAsk] = React.useState(false);
  const allowed = permissions[perm] || override;
  if (allowed) return children;
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column',
                   alignItems: 'center', justifyContent: 'center', gap: 18, height: '100%' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 999, background: T.surface3, color: T.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><KI name="pin" size={28}/></div>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Brez dovoljenja</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
          Za to dejanje potrebujete dovoljenje upravitelja.<br/>
          Pokličite lastnika ali vnesite glavni PIN.
        </div>
      </div>
      {!pinAsk ? (
        <button onClick={() => setPinAsk(true)} style={{
          padding: '10px 18px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
        }}>Vnesi glavni PIN</button>
      ) : (
        <input type="password" autoFocus placeholder="•••• glavni PIN"
          onChange={(e) => { if (isMasterPin(e.target.value)) setOverride(true); }}
          style={{
            padding: '12px 16px', borderRadius: 9, border: '1px solid ' + T.line,
            background: T.inputBg, color: T.ink, fontFamily: 'inherit', fontSize: 16,
            letterSpacing: '0.15em', textAlign: 'center', outline: 'none', width: 200,
          }}/>
      )}
    </div>
  );
}


// ===== pos-klasik-screens1.jsx =====
// Klasik POS v2 — Screens (Floor, Sale, Calendar, Customers, Inventory, Reports, Admin)

// ═════════════════════════════════════════════════════════════════════
// FLOOR — table layout + active reservations strip
// ═════════════════════════════════════════════════════════════════════
function FloorScreen({ ctx }) {
  const { T, D, setActiveTable, setScreen } = ctx;
  const [selectedSpace, setSelectedSpace] = React.useState(D.spaces[0].id);
  const [hoverTable, setHoverTable] = React.useState(null);
  const space = D.spaces.find(s => s.id === selectedSpace);

  const upcomingReservations = D.bookings
    .filter(b => b.isTable && b.tableId)
    .slice(0, 4);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top: space tabs + actions */}
      <div style={{
        padding: '12px 18px', background: T.surface, borderBottom: '1px solid ' + T.line,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 4, background: T.surface3, padding: 4, borderRadius: 10 }}>
          {D.spaces.map(s => (
            <button key={s.id} onClick={() => setSelectedSpace(s.id)} style={{
              padding: '8px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', fontWeight: 700, fontSize: 13,
              background: selectedSpace === s.id ? T.header : 'transparent',
              color: selectedSpace === s.id ? T.headerInk : T.ink,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }}/>
              {s.name}
              <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 500 }}>
                {s.tables.filter(t => t.status === 'occupied').length}/{s.tables.length}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginLeft: 16 }}>
          {Object.entries(T.status).map(([k, st]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5,
                                   fontSize: 11, color: T.muted, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: st.dot }}/>
              {st.label}
            </div>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={{
            padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface, color: T.ink, border: '1px solid ' + T.line,
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="swap" size={14}/> Prenos mize</button>
          <button onClick={() => { setActiveTable(null); setScreen('sale'); }} style={{
            padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.accent, color: '#fff', border: 'none',
            fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="plus" size={14}/> Hitra prodaja</button>
        </div>
      </div>

      {/* Body: floor canvas + side panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Floor */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden',
                       background: T.bg,
                       backgroundImage: 'radial-gradient(circle, ' + T.line + ' 1px, transparent 1px)',
                       backgroundSize: '24px 24px',
                       padding: 20 }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {space.tables.map(t => {
              const st = T.status[t.status];
              const isRound = t.seats <= 2;
              const w = t.seats <= 2 ? 96 : t.seats <= 4 ? 118 : 154;
              const h = t.seats <= 2 ? 96 : t.seats <= 4 ? 92 : 116;
              return (
                <button key={t.id}
                  onClick={() => { ctx.setActiveTable(t); ctx.setScreen('sale'); }}
                  onMouseEnter={() => setHoverTable(t)}
                  onMouseLeave={() => setHoverTable(null)}
                  style={{
                  position: 'absolute',
                  left: `${t.x}%`, top: `${t.y}%`,
                  width: w, height: h,
                  background: st.bg,
                  border: '2px solid ' + st.stroke,
                  borderRadius: isRound ? '50%' : 14,
                  cursor: 'pointer', fontFamily: 'inherit', color: T.ink,
                  padding: 8, textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  transition: 'transform .12s',
                }}>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: T.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <KI name="user" size={10}/> {t.seats}
                  </div>
                  {t.status === 'occupied' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                    marginTop: 3 }}>{window.eur(t.order)}</div>
                      <div style={{ fontSize: 9, color: T.muted }}>{t.since} · {t.server}</div>
                    </>
                  )}
                  {t.status === 'needs_attention' && (
                    <div style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22,
                                  borderRadius: 999, background: st.dot, color: '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 12, fontWeight: 800,
                                  boxShadow: '0 0 0 3px ' + T.bg }}>!</div>
                  )}
                  {t.status === 'reserved' && (
                    <div style={{ fontSize: 9, color: T.muted, padding: '0 4px', lineHeight: 1.2 }}>
                      {t.reservedFor}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side: upcoming reservations */}
        <div style={{
          width: 280, background: T.surface, borderLeft: '1px solid ' + T.line,
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + T.line }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.08em', color: T.muted }}>Naslednje rezervacije</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Danes · 14. 5.</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {upcomingReservations.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: T.muted, fontSize: 12 }}>
                Ni rezervacij.
              </div>
            )}
            {upcomingReservations.map(r => {
              const cust = r.customerId ? window.posHelpers.customer(r.customerId) : null;
              const tbl = D.spaces.flatMap(sp => sp.tables).find(t => t.id === r.tableId);
              return (
                <div key={r.id} style={{
                  padding: '12px', borderRadius: 10, marginBottom: 6,
                  background: T.surface2, border: '1px solid ' + T.line,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.accent,
                                   fontVariantNumeric: 'tabular-nums' }}>{r.time}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      {tbl?.name} · {r.partySize} oseb
                    </div>
                    {r.reminderSent ? (
                      <KI name="check" size={12}/>
                    ) : (
                      <span title="Opomnik ni poslan" style={{ marginLeft: 'auto',
                        fontSize: 10, color: T.warn, fontWeight: 700 }}>● SMS</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {cust?.name || r.customerName}
                  </div>
                  {r.note && (
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4, fontStyle: 'italic' }}>"{r.note}"</div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => ctx.setScreen('calendar')} style={{
            margin: 12, padding: '10px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface3, color: T.ink, border: 'none',
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <KI name="calendar" size={14}/> Odpri koledar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SALE — categories + items grid + cart
// ═════════════════════════════════════════════════════════════════════
function SaleScreen({ ctx }) {
  const { T, D, H, activeTable, activeCustomer, cart, addItem, adjustQty, setCart, setPaymentOpen, totals } = ctx;
  const [selectedCat, setSelectedCat] = React.useState('cat-fav');
  const [search, setSearch] = React.useState('');
  const [happyHourActive] = React.useState(true); // demo

  const items = React.useMemo(() => {
    let arr = H.itemsIn(selectedCat);
    if (search) arr = D.items.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search)));
    return arr;
  }, [selectedCat, search]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Categories */}
      <div style={{
        width: 196, background: T.surface, borderRight: '1px solid ' + T.line,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid ' + T.lineSoft,
                       fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                       color: T.muted, fontWeight: 700 }}>Kategorije</div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>
          {D.categories.map(c => {
            const active = selectedCat === c.id;
            return (
              <button key={c.id} onClick={() => { setSelectedCat(c.id); setSearch(''); }} style={{
                width: '100%', padding: '10px 10px', borderRadius: 9, marginBottom: 2,
                background: active ? T.accentSoft : 'transparent',
                color: active ? T.accent : T.ink,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: active ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              }}>
                <span style={{
                  width: 30, height: 30, borderRadius: 8, background: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                }}>{c.icon}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                {active && <KI name="chev" size={14}/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: T.bg }}>
        {/* Toolbar */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid ' + T.line, background: T.surface,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }}>
              <KI name="search" size={15}/>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Išči artikel, šifro ali barkodo…" style={{
                width: '100%', padding: '9px 12px 9px 36px', borderRadius: 9,
                border: '1px solid ' + T.line, fontFamily: 'inherit', fontSize: 13,
                background: T.surface2, color: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}/>
          </div>
          <button style={{
            height: 36, padding: '0 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + T.line, background: T.surface, color: T.ink,
            display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12,
          }}><KI name="barcode" size={16}/> Skeniraj</button>
          <button style={{
            height: 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + T.line, background: T.surface, color: T.ink,
            display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12,
          }}><KI name="weight" size={16}/> Tehtanje</button>
          {happyHourActive && (
            <div style={{
              padding: '6px 10px', borderRadius: 8, background: 'rgba(184,140,40,0.15)',
              color: T.warn, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <KI name="happy" size={14}/> Happy hour · pivo/vino −20%
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>
            {items.length} {items.length === 1 ? 'artikel' : 'artiklov'}
          </div>
        </div>

        {/* Grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 14,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8,
          alignContent: 'start',
        }}>
          {items.map(it => {
            const lowStock = it.alert;
            const outOfStock = it.stock !== undefined && it.stock <= 0 && it.stock !== 999;
            return (
              <button key={it.id} onClick={() => !outOfStock && addItem(it)} disabled={outOfStock} style={{
                background: T.surface, border: '1px solid ' + T.line, borderRadius: 11,
                padding: '12px 12px 11px', cursor: outOfStock ? 'not-allowed' : 'pointer', textAlign: 'left',
                fontFamily: 'inherit', color: T.ink,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                minHeight: 96, position: 'relative',
                opacity: outOfStock ? 0.45 : 1,
              }}>
                {it.fav && <span style={{ position: 'absolute', top: 8, right: 8, color: T.brand, fontSize: 11 }}>★</span>}
                {lowStock && <span style={{
                  position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800,
                  color: T.warn, background: 'rgba(184,140,40,0.15)',
                  padding: '2px 5px', borderRadius: 4, letterSpacing: '0.04em',
                }}>NIZKA</span>}
                {it.bookable && <span style={{
                  position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800,
                  color: T.accent, background: T.accentSoft,
                  padding: '2px 5px', borderRadius: 4, letterSpacing: '0.04em',
                }}>REZERV.</span>}
                {it.isPackage && <span style={{
                  position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800,
                  color: '#634896', background: 'rgba(99,72,150,0.12)',
                  padding: '2px 5px', borderRadius: 4, letterSpacing: '0.04em',
                }}>PAKET</span>}

                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, marginTop: it.fav || lowStock ? 14 : 0 }}>
                  {it.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              marginTop: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{window.eur(it.price)}</div>
                  <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase',
                                letterSpacing: '0.05em' }}>
                    {outOfStock ? 'Razprodano' : it.code}
                  </div>
                </div>
                {it.stock !== undefined && it.stock !== 999 && (
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>
                    Zaloga: <span style={{ color: lowStock ? T.warn : T.muted, fontWeight: 600 }}>{it.stock}</span>
                  </div>
                )}
              </button>
            );
          })}
          {items.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: T.muted }}>
              Ni rezultatov za "{search}"
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <SaleCart ctx={ctx}/>
    </div>
  );
}

// ─── Cart panel for sale screen ────────────────────────────────────
function SaleCart({ ctx }) {
  const { T, D, H, activeTable, activeCustomer, cart, adjustQty, setCart, setPaymentOpen, totals, setScreen, setActiveCustomer } = ctx;
  const [stranke, setStranke] = React.useState(false);

  function useCustomerPackage(pkg) {
    // Add a free line for the next service
    const item = H.itemOf(Object.keys(pkg.packageItems || {})[0] || pkg.itemId);
    if (!item) return;
    setCart(c => [...c, {
      lineId: Math.random().toString(36).slice(2),
      lineKey: item.id + '::pkg',
      id: item.id, name: item.name, price: 0, qty: 1, mods: [], note: 'Paket: ' + pkg.name,
      unit: item.unit, fromPackage: pkg.itemId,
    }]);
  }

  return (
    <div style={{
      width: 340, background: T.surface, borderLeft: '1px solid ' + T.line,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + T.line,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                        color: T.muted, fontWeight: 700 }}>Naročilo</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
            {activeTable ? activeTable.name : 'Hitra prodaja'}
            <span style={{ color: T.muted, fontWeight: 500, fontSize: 12 }}>
              &nbsp;· {cart.reduce((s,l) => s + l.qty, 0)} kos
            </span>
          </div>
        </div>
        {cart.length > 0 && (
          <button onClick={() => setCart([])} style={{
            padding: '4px 8px', borderRadius: 6, background: 'transparent',
            border: 'none', color: T.muted, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
          }}><KI name="trash" size={13}/></button>
        )}
      </div>

      {/* Customer & packages quick add */}
      {activeCustomer && activeCustomer.packages && activeCustomer.packages.length > 0 && (
        <div style={{ padding: '8px 12px', background: 'rgba(99,72,150,0.07)',
                       borderBottom: '1px solid ' + T.lineSoft }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#634896', textTransform: 'uppercase',
                         letterSpacing: '0.06em', marginBottom: 6 }}>Stranke paketi</div>
          {activeCustomer.packages.map((p, i) => (
            <button key={i} onClick={() => useCustomerPackage(p)} style={{
              width: '100%', padding: '6px 8px', borderRadius: 7, marginBottom: 4,
              background: 'rgba(99,72,150,0.10)', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', color: T.ink, textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#634896' }}>
                {p.remaining}/{p.total}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lines */}
      <div style={{ flex: 1, overflowY: 'auto', padding: cart.length === 0 ? 0 : 0 }}>
        {cart.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 12 }}>
            <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.4 }}>🛒</div>
            Košarica je prazna.<br/>Tapni artikel za dodajanje.
          </div>
        )}
        {cart.map(l => (
          <div key={l.lineId} style={{
            padding: '10px 12px', borderBottom: '1px solid ' + T.lineSoft,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{l.name}</div>
              {l.mods && l.mods.length > 0 && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                  {l.mods.map(m => m.name).join(' · ')}
                </div>
              )}
              {l.note && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontStyle: 'italic' }}>"{l.note}"</div>
              )}
              {l.fromPackage && (
                <div style={{ fontSize: 10, fontWeight: 700, color: '#634896', marginTop: 3,
                              textTransform: 'uppercase', letterSpacing: '0.05em' }}>iz paketa</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                {window.eur(H.lineTotal(l))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => l.qty === 1
                  ? setCart(c => c.filter(x => x.lineId !== l.lineId))
                  : adjustQty(l.lineId, -1)} style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid ' + T.line,
                  background: T.surface, cursor: 'pointer', color: T.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{l.qty === 1 ? <KI name="trash" size={11}/> : <KI name="minus" size={12}/>}</button>
                <div style={{ width: 24, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{l.qty}</div>
                <button onClick={() => adjustQty(l.lineId, 1)} style={{
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: T.accentSoft, color: T.accent, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><KI name="plus" size={12}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {cart.length > 0 && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid ' + T.line, display: 'flex', gap: 5 }}>
          <CartAction T={T} icon="percent" label="Popust"/>
          <CartAction T={T} icon="user" label="Stranka"
            onClick={() => setStranke(true)}/>
          <CartAction T={T} icon="split" label="Razdeli"/>
          <CartAction T={T} icon="edit" label="Opomba"/>
          <CartAction T={T} icon="kitchen" label="Pošlji"/>
        </div>
      )}

      {/* Totals + pay */}
      <div style={{ padding: '12px 16px', background: T.surface2, borderTop: '1px solid ' + T.line }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: T.muted }}>
          <span>Vmesna</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{window.eur(totals.sub)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8, color: T.muted }}>
          <span>DDV 22%</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{window.eur(totals.ddv)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Skupaj</div>
          <div style={{ fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {window.eur(totals.total)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button disabled={cart.length === 0}
            style={{
              flex: 1, padding: '10px', borderRadius: 9, cursor: cart.length ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', border: '1px solid ' + T.line, background: T.surface, color: T.ink,
              fontWeight: 700, fontSize: 12, opacity: cart.length === 0 ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><KI name="receipt" size={14}/> Odpri račun</button>
          <button disabled={cart.length === 0} onClick={() => setPaymentOpen(true)} style={{
            flex: 2, padding: '12px', borderRadius: 9, cursor: cart.length ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', border: 'none',
            background: cart.length ? T.accent : '#ccc', color: '#fff',
            fontWeight: 800, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <KI name="arrow" size={16} strokeWidth={2.2}/> Plačaj
          </button>
        </div>
      </div>

      {stranke && (
        <CustomerPickerModal T={T} D={D} onClose={() => setStranke(false)}
          onPick={(c) => { setActiveCustomer(c); setStranke(false); }}/>
      )}
    </div>
  );
}

function CartAction({ T, icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '8px 4px', borderRadius: 7, background: T.chipBg, border: 'none',
      cursor: 'pointer', color: T.ink, fontFamily: 'inherit',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700,
    }}>
      <KI name={icon} size={14}/>{label}
    </button>
  );
}

function CustomerPickerModal({ T, D, onClose, onPick }) {
  const [q, setQ] = React.useState('');
  const filtered = D.customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.phone.includes(q));
  return (
    <PosModal open onClose={onClose} theme={T} width={460}>
      <div style={{ padding: '18px 20px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                       letterSpacing: '0.08em' }}>Izberi stranko</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Pripni stranko na račun</div>
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Išči ime ali telefon…" style={{
            width: '100%', padding: '10px 12px', borderRadius: 9,
            border: '1px solid ' + T.line, fontFamily: 'inherit', fontSize: 13,
            background: T.inputBg, color: T.ink, outline: 'none', boxSizing: 'border-box',
        }}/>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '0 12px 12px' }}>
        {filtered.map(c => (
          <button key={c.id} onClick={() => onPick(c)} style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, marginBottom: 4,
            background: 'transparent', border: '1px solid ' + T.line, cursor: 'pointer',
            fontFamily: 'inherit', color: T.ink, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 999, background: T.surface3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: T.ink,
            }}>{c.name.split(' ').map(w => w[0]).slice(0,2).join('')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                {c.phone} · {c.tier} · {c.points} t.
                {c.packages.length > 0 && <> · {c.packages.length} paket</>}
                {c.prepaid > 0 && <> · predplačilo {window.eur(c.prepaid)}</>}
              </div>
            </div>
          </button>
        ))}
        <button style={{
          width: '100%', padding: '12px', borderRadius: 9,
          background: 'transparent', border: '1px dashed ' + T.line, cursor: 'pointer',
          fontFamily: 'inherit', color: T.accent, fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <KI name="add_user" size={14}/> Dodaj novo stranko
        </button>
      </div>
    </PosModal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// CALENDAR — bookings & reservations
// ═════════════════════════════════════════════════════════════════════
function CalendarScreen({ ctx }) {
  const { T, D, H, setActiveCustomer, setScreen, addItem } = ctx;
  const [staffFilter, setStaffFilter] = React.useState('all');
  const [view, setView] = React.useState('day'); // day | week
  const [showAdd, setShowAdd] = React.useState(false);

  const hours = Array.from({ length: 13 }, (_, i) => 8 + i); // 8:00 – 20:00
  const staffList = staffFilter === 'all' ? D.staff : D.staff.filter(s => s.id === staffFilter);

  const bookings = D.bookings.filter(b => !b.isTable);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 18px', background: T.surface, borderBottom: '1px solid ' + T.line,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={{
            width: 32, height: 32, borderRadius: 8, background: T.surface3, border: 'none',
            cursor: 'pointer', color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><KI name="chevL" size={15}/></button>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: T.surface3,
                         fontWeight: 700, fontSize: 13, minWidth: 130, textAlign: 'center' }}>
            Četrtek, 14. maj
          </div>
          <button style={{
            width: 32, height: 32, borderRadius: 8, background: T.surface3, border: 'none',
            cursor: 'pointer', color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><KI name="chev" size={15}/></button>
          <button style={{
            padding: '7px 12px', borderRadius: 8, background: T.surface, border: '1px solid ' + T.line,
            cursor: 'pointer', color: T.ink, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            marginLeft: 4,
          }}>Danes</button>
        </div>

        <div style={{ display: 'flex', gap: 2, background: T.surface3, padding: 3, borderRadius: 8 }}>
          {['day','week'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', fontWeight: 700, fontSize: 12,
              background: view === v ? T.header : 'transparent',
              color: view === v ? T.headerInk : T.ink,
            }}>{v === 'day' ? 'Dan' : 'Teden'}</button>
          ))}
        </div>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} style={{
          padding: '7px 10px', borderRadius: 8, border: '1px solid ' + T.line,
          background: T.surface, color: T.ink, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
        }}>
          <option value="all">Vsi zaposleni</option>
          {D.staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{
            padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface, color: T.ink, border: '1px solid ' + T.line,
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="bell" size={14}/> Pošlji opomnike (3)</button>
          <button onClick={() => setShowAdd(true)} style={{
            padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.accent, color: '#fff', border: 'none',
            fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="plus" size={14}/> Nova rezervacija</button>
        </div>
      </div>

      {/* Calendar grid */}
      {view === 'week' ? (
        <window.WeekCalendar ctx={ctx} staffFilter={staffFilter}
          onNewBooking={(prefill) => setShowAdd(prefill || true)}/>
      ) : (
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minWidth: 800,
                       display: 'grid',
                       gridTemplateColumns: `60px repeat(${staffList.length}, 1fr)`,
                       gridTemplateRows: 'auto 1fr',
                       background: T.surface }}>
          {/* Header row */}
          <div style={{ borderBottom: '1px solid ' + T.line, borderRight: '1px solid ' + T.line,
                         background: T.surface2 }}/>
          {staffList.map(s => (
            <div key={s.id} style={{
              borderBottom: '1px solid ' + T.line, borderRight: '1px solid ' + T.line,
              padding: '10px 12px', background: T.surface2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 999, background: s.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 11,
                }}>{s.name.split(' ').map(w => w[0]).join('')}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.1 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{s.role}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Time rows */}
          <div style={{ gridColumn: '1 / -1', display: 'grid',
                         gridTemplateColumns: `60px repeat(${staffList.length}, 1fr)`,
                         minHeight: 700 }}>
            {/* Time gutter */}
            <div style={{ background: T.surface2, borderRight: '1px solid ' + T.line,
                          position: 'relative' }}>
              {hours.map((h, i) => (
                <div key={h} style={{
                  height: 56, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: T.muted,
                  fontVariantNumeric: 'tabular-nums', borderTop: i === 0 ? 'none' : '1px solid ' + T.lineSoft,
                }}>{String(h).padStart(2,'0')}:00</div>
              ))}
            </div>

            {/* Staff columns */}
            {staffList.map(s => {
              const staffBookings = bookings.filter(b => b.staffId === s.id);
              return (
                <div key={s.id} style={{
                  position: 'relative', borderRight: '1px solid ' + T.line,
                  background: T.surface,
                  backgroundImage: `repeating-linear-gradient(180deg, transparent 0 55px, ${T.lineSoft} 55px 56px)`,
                }}>
                  {staffBookings.map(b => {
                    const cust = window.posHelpers.customer(b.customerId);
                    const item = window.posHelpers.itemOf(b.itemId);
                    const [hh, mm] = b.time.split(':').map(Number);
                    const top = ((hh - 8) * 56) + (mm / 60 * 56);
                    const height = (b.duration / 60) * 56;
                    const tentative = b.status === 'tentative';
                    return (
                      <button key={b.id} style={{
                        position: 'absolute', top, height, left: 4, right: 4,
                        background: tentative ? 'rgba(184,140,40,0.18)' : T.accentSoft,
                        border: '1px solid ' + (tentative ? T.warn : T.accent),
                        borderLeft: '3px solid ' + (tentative ? T.warn : T.accent),
                        borderRadius: 7, padding: '6px 8px', cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'inherit',
                        color: tentative ? T.warn : T.accent, overflow: 'hidden',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                          {b.time} – {String(hh + Math.floor((mm+b.duration)/60)).padStart(2,'0')}:{String((mm+b.duration)%60).padStart(2,'0')}
                          {tentative && <span style={{ marginLeft: 6, fontSize: 9 }}>NEPOTRJ.</span>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: T.ink }}>{cust?.name}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{item?.name}</div>
                        {b.reminderSent ? (
                          <div style={{ fontSize: 9, color: T.accent, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <KI name="check" size={9}/> opomnik poslan
                          </div>
                        ) : (
                          <div style={{ fontSize: 9, color: T.warn, marginTop: 2, fontWeight: 700 }}>
                            ● opomnik ni poslan
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {showAdd && <NewBookingModal ctx={ctx} onClose={() => setShowAdd(false)}/>}
    </div>
  );
}

function NewBookingModal({ ctx, onClose }) {
  const { T, D } = ctx;
  return (
    <PosModal open onClose={onClose} theme={T} width={520}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid ' + T.line,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>Nova rezervacija</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Dodaj termin</div>
        </div>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid ' + T.line,
          background: 'transparent', cursor: 'pointer', color: T.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><KI name="x" size={14}/></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Stranka">
          <button style={{
            width: '100%', padding: '10px 12px', borderRadius: 9,
            border: '1px solid ' + T.line, background: T.inputBg, color: T.muted,
            fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <KI name="search" size={14}/> Išči ali ustvari novo stranko…
          </button>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Storitev">
            <select style={{
              width: '100%', padding: '10px 12px', borderRadius: 9,
              border: '1px solid ' + T.line, background: T.inputBg, color: T.ink,
              fontFamily: 'inherit', fontSize: 13, outline: 'none',
            }}>
              {D.items.filter(i => i.bookable).map(i => (
                <option key={i.id} value={i.id}>{i.name} · {window.eur(i.price)}</option>
              ))}
            </select>
          </Field>
          <Field label="Zaposleni">
            <select style={{
              width: '100%', padding: '10px 12px', borderRadius: 9,
              border: '1px solid ' + T.line, background: T.inputBg, color: T.ink,
              fontFamily: 'inherit', fontSize: 13, outline: 'none',
            }}>
              {D.staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Datum">
            <input type="date" defaultValue="2026-05-14" style={inputStyle(T)}/>
          </Field>
          <Field label="Ura">
            <input type="time" defaultValue="15:00" style={inputStyle(T)}/>
          </Field>
          <Field label="Trajanje">
            <select style={inputStyle(T)}>
              <option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option>
            </select>
          </Field>
        </div>
        <Field label="Opomba">
          <textarea placeholder="npr. prvi obisk, alergija na…" style={{
            ...inputStyle(T), minHeight: 64, resize: 'vertical', fontFamily: 'inherit',
          }}/>
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <input type="checkbox" defaultChecked style={{ accentColor: T.accent, width: 16, height: 16 }}/>
          Pošlji SMS opomnik 24h pred terminom
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + T.line, background: 'transparent', color: T.ink,
            fontWeight: 600, fontSize: 13,
          }}>Prekliči</button>
          <button onClick={onClose} style={{
            flex: 2, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: 'none', background: T.accent, color: '#fff', fontWeight: 700, fontSize: 13,
          }}>Potrdi rezervacijo</button>
        </div>
      </div>
    </PosModal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted, #6b6962)',
                     textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(T) {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 9,
    border: '1px solid ' + T.line, background: T.inputBg, color: T.ink,
    fontFamily: 'inherit', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
}


// ===== pos-klasik-screens2.jsx =====
// Klasik POS v2 — Screens 2 (Customers, Inventory, Reports, Admin)

// ═════════════════════════════════════════════════════════════════════
// CUSTOMERS — list + detail (packages, prepaid, history, loyalty)
// ═════════════════════════════════════════════════════════════════════
function CustomersScreen({ ctx }) {
  const { T, D, setActiveCustomer, setScreen } = ctx;
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(D.customers[0].id);
  const [tierFilter, setTierFilter] = React.useState('all');

  const filtered = D.customers.filter(c => {
    const matchQ = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchT = tierFilter === 'all' || c.tier.toLowerCase() === tierFilter;
    return matchQ && matchT;
  });
  const selected = D.customers.find(c => c.id === selectedId) || D.customers[0];

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* List */}
      <div style={{
        width: 320, background: T.surface, borderRight: '1px solid ' + T.line,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid ' + T.line }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                             letterSpacing: '0.08em' }}>Stranke</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {filtered.length} <span style={{ color: T.muted, fontWeight: 500, fontSize: 12 }}>od {D.customers.length}</span>
              </div>
            </div>
            <button style={{
              padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              background: T.accent, color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
            }}><KI name="add_user" size={14}/> Nova</button>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.muted }}>
              <KI name="search" size={14}/>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Išči stranko ali telefon…" style={{
                width: '100%', padding: '9px 12px 9px 34px', borderRadius: 9,
                border: '1px solid ' + T.line, fontFamily: 'inherit', fontSize: 13,
                background: T.inputBg, color: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}/>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {['all','zlato','srebro','bron'].map(t => (
              <button key={t} onClick={() => setTierFilter(t)} style={{
                padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                background: tierFilter === t ? T.accent : T.surface3,
                color: tierFilter === t ? '#fff' : T.ink,
                border: 'none', fontWeight: 600, fontSize: 11, textTransform: 'capitalize',
              }}>{t === 'all' ? 'Vse' : t}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {filtered.map(c => {
            const active = c.id === selectedId;
            const tierColor = c.tier === 'Zlato' ? '#e9b949' : c.tier === 'Srebro' ? '#9aa3a8' : '#b88c5e';
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)} style={{
                width: '100%', padding: '10px 10px', borderRadius: 9, marginBottom: 2,
                background: active ? T.accentSoft : 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: T.ink,
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 999, background: T.surface3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, color: T.ink, position: 'relative',
                }}>
                  {c.name.split(' ').map(w => w[0]).slice(0,2).join('')}
                  <span style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12,
                                  borderRadius: 999, background: tierColor,
                                  border: '2px solid ' + (active ? T.accentSoft : T.surface) }}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <window.MemberStatusDot status={window.posHelpers.memberStatus(c).status} size={9}/>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 1, display: 'flex', gap: 6,
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const ms = window.posHelpers.memberStatus(c);
                      return (<>
                        <span>{ms.remainingVisits || 0} obiskov</span>
                        {ms.daysToExpiry !== null && (
                          <span style={{ color: ms.daysToExpiry < 0 ? '#a83232'
                                          : ms.daysToExpiry <= 7 ? '#d97628' : T.muted }}>
                            · {ms.daysToExpiry < 0 ? 'potekla' : (ms.daysToExpiry + ' dni')}
                          </span>
                        )}
                        {c.prepaid > 0 && <span style={{ color: T.accent, fontWeight: 600 }}>· {window.eur(c.prepaid)}</span>}
                      </>);
                    })()}
                  </div>
                </div>
                {active && <KI name="chev" size={14}/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      {selected && <CustomerDetail ctx={ctx} c={selected}/>}
    </div>
  );
}

function CustomerDetail({ ctx, c }) {
  const { T, D, setActiveCustomer, setScreen } = ctx;
  const tierColor = c.tier === 'Zlato' ? '#e9b949' : c.tier === 'Srebro' ? '#9aa3a8' : '#b88c5e';
  const [tab, setTab] = React.useState('overview');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: T.bg }}>
      {/* Hero */}
      <div style={{ padding: '20px 24px', background: T.surface, borderBottom: '1px solid ' + T.line }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 999, background: T.surface3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 22, color: T.ink, position: 'relative',
          }}>
            {c.name.split(' ').map(w => w[0]).slice(0,2).join('')}
            <span style={{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22,
                            borderRadius: 999, background: tierColor, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800, border: '3px solid ' + T.surface }}>★</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{c.name}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4, display: 'flex', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <KI name="phone" size={11}/> {c.phone}
              </span>
              {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <KI name="mail" size={11}/> {c.email}
              </span>}
              <span>Stranka od: {c.since}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              background: T.surface, color: T.ink, border: '1px solid ' + T.line,
              fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}><KI name="calendar" size={14}/> Rezerviraj</button>
            <button style={{
              padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              background: T.surface, color: T.ink, border: '1px solid ' + T.line,
              fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}><KI name="edit" size={14}/> Uredi</button>
            <button onClick={() => { setActiveCustomer(c); setScreen('sale'); }} style={{
              padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              background: T.accent, color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}><KI name="receipt" size={14}/> Nov račun</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
          <Kpi T={T} label="Točke" value={c.points} sub={c.tier}/>
          <Kpi T={T} label="Predplačilo" value={window.eur(c.prepaid)} sub={c.prepaid > 0 ? 'na voljo' : 'brez'} color={c.prepaid > 0 ? T.accent : null}/>
          <Kpi T={T} label="Obiskov" value={c.visits} sub={'zadnji: ' + c.lastVisit}/>
          <Kpi T={T} label="Porabljeno" value={window.eur(c.spent)} sub={'povp. ' + window.eur(c.avg)}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 24px', background: T.surface, borderBottom: '1px solid ' + T.line,
                     display: 'flex', gap: 4 }}>
        {[
          { id: 'overview',  label: 'Pregled' },
          { id: 'packages',  label: 'Paketi & predplačilo', badge: c.packages.length },
          { id: 'history',   label: 'Zgodovina', badge: c.history.length },
          { id: 'notes',     label: 'Opombe' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13,
            fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? T.accent : T.ink,
            borderBottom: '2px solid ' + (tab === t.id ? T.accent : 'transparent'),
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: -1,
          }}>
            {t.label}
            {t.badge ? (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999,
                background: tab === t.id ? T.accentSoft : T.surface3,
                color: tab === t.id ? T.accent : T.muted,
              }}>{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Card T={T} title="Zadnji obiski">
              {c.history.slice(0, 5).map((h, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid ' + T.lineSoft,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.desc}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{h.date}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                 color: h.amount === 0 ? '#634896' : T.ink }}>
                    {h.amount === 0 ? 'paket' : window.eur(h.amount)}
                  </div>
                </div>
              ))}
            </Card>
            <Card T={T} title="Hitri ukrepi">
              <ActionRow T={T} icon="gift"   label="Dodaj boni / popust"/>
              <ActionRow T={T} icon="money"  label="Polni predplačilo"/>
              <ActionRow T={T} icon="package" label="Prodaj paket"/>
              <ActionRow T={T} icon="bell"   label="Pošlji SMS"/>
              <ActionRow T={T} icon="mail"   label="Pošlji email"/>
            </Card>
          </div>
        )}

        {tab === 'packages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card T={T} title="Aktivni paketi">
              {c.packages.length === 0 && (
                <div style={{ padding: 20, color: T.muted, fontSize: 13, textAlign: 'center' }}>
                  Stranka nima aktivnih paketov.
                </div>
              )}
              {c.packages.map((p, i) => {
                const pct = p.remaining / p.total;
                return (
                  <div key={i} style={{
                    padding: '14px', borderRadius: 10, marginBottom: 8,
                    background: 'rgba(99,72,150,0.06)', border: '1px solid rgba(99,72,150,0.18)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#634896',
                                     fontVariantNumeric: 'tabular-nums' }}>
                        {p.remaining}<span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>/{p.total}</span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(99,72,150,0.15)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: (pct * 100) + '%', background: '#634896',
                                     borderRadius: 999 }}/>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: T.muted }}>Velja do: <b style={{ color: T.ink }}>{p.expires}</b></div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btnSmall(T)}>Podaljšaj</button>
                        <button style={btnSmall(T)}>Uporabi</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
            <Card T={T} title="Predplačilo">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Trenutno stanje</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c.prepaid > 0 ? T.accent : T.muted,
                                 fontVariantNumeric: 'tabular-nums' }}>
                    {window.eur(c.prepaid)}
                  </div>
                </div>
                <button style={{
                  padding: '10px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                  background: T.accent, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                }}><KI name="plus" size={14}/> Napolni</button>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8, padding: '0 8px' }}>
                Stranka lahko z predplačilom plačuje storitve in produkte. Stanje se odbija avtomatsko.
              </div>
            </Card>
          </div>
        )}

        {tab === 'history' && (
          <Card T={T} title="Vsi obiski in računi">
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px',
                           padding: '8px 0', borderBottom: '1px solid ' + T.line,
                           fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                           letterSpacing: '0.06em' }}>
              <div>Datum</div><div>Opis</div><div style={{ textAlign: 'right' }}>Znesek</div><div>Tip</div>
            </div>
            {c.history.map((h, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px',
                padding: '10px 0', borderBottom: '1px solid ' + T.lineSoft,
                fontSize: 13, alignItems: 'center',
              }}>
                <div style={{ color: T.muted, fontSize: 12 }}>{h.date}</div>
                <div style={{ fontWeight: 600 }}>{h.desc}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {h.amount === 0 ? '—' : window.eur(h.amount)}
                </div>
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
                    background: h.type === 'package' ? 'rgba(99,72,150,0.12)' : T.surface3,
                    color: h.type === 'package' ? '#634896' : T.muted,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h.type === 'package' ? 'Paket' : 'Plačilo'}</span>
                </div>
              </div>
            ))}
          </Card>
        )}

        {tab === 'notes' && (
          <Card T={T} title="Opombe stranke">
            <textarea placeholder="Alergije, preference, opombe…" style={{
              width: '100%', padding: 12, borderRadius: 9, border: '1px solid ' + T.line,
              background: T.inputBg, color: T.ink, fontFamily: 'inherit', fontSize: 13,
              minHeight: 200, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }} defaultValue="Stranka je alergična na arašide. Preferira termine zjutraj. Prinaša lastno brisačo."/>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button style={{
                padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: 12,
              }}>Shrani opombe</button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Kpi({ T, label, value, sub, color }) {
  return (
    <div style={{
      padding: '12px 14px', background: T.surface2, borderRadius: 10,
      border: '1px solid ' + T.line,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                     letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color || T.ink,
                     fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ T, title, children, right }) {
  return (
    <div style={{
      background: T.surface, borderRadius: 12, border: '1px solid ' + T.line, padding: 16,
    }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function ActionRow({ T, icon, label }) {
  return (
    <button style={{
      width: '100%', padding: '10px 12px', borderRadius: 8, marginBottom: 4,
      background: 'transparent', border: '1px solid ' + T.lineSoft, cursor: 'pointer',
      fontFamily: 'inherit', color: T.ink, textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600,
    }}>
      <KI name={icon} size={14}/> {label}
    </button>
  );
}

function btnSmall(T) {
  return {
    padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    background: T.surface, color: T.ink, border: '1px solid ' + T.line,
    fontWeight: 600, fontSize: 11,
  };
}

// ═════════════════════════════════════════════════════════════════════
// INVENTORY — stock, low stock alerts, variants
// ═════════════════════════════════════════════════════════════════════
function InventoryScreen({ ctx }) {
  const { T, D } = ctx;
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  let items = D.items.filter(i => i.stock !== undefined);
  if (filter === 'low') items = items.filter(i => i.alert);
  if (filter === 'out') items = items.filter(i => i.stock <= 0 && i.stock !== 999);
  if (search) items = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.code.toLowerCase().includes(search.toLowerCase()));

  const lowCount = D.items.filter(i => i.alert).length;
  const totalValue = D.items.filter(i => i.stock !== undefined && i.stock !== 999)
    .reduce((s, i) => s + (i.stock * i.price), 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top bar */}
      <div style={{
        padding: '14px 20px', background: T.surface, borderBottom: '1px solid ' + T.line,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>Zaloga</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
            {D.items.filter(i => i.stock !== undefined).length} artiklov
          </div>
        </div>

        <Kpi T={T} label="Pod minimum" value={lowCount} color={lowCount > 0 ? T.warn : T.muted} sub="opozorila"/>
        <Kpi T={T} label="Vrednost" value={window.eur(totalValue)} sub="po nabavni"/>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{
            padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface, color: T.ink, border: '1px solid ' + T.line,
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="print" size={14}/> Izvozi</button>
          <button style={{
            padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.accent, color: '#fff', border: 'none',
            fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="plus" size={14}/> Nov artikel</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        padding: '10px 20px', background: T.surface, borderBottom: '1px solid ' + T.line,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.muted }}>
            <KI name="search" size={14}/>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Išči artikel ali šifro…" style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: 9,
              border: '1px solid ' + T.line, fontFamily: 'inherit', fontSize: 13,
              background: T.inputBg, outline: 'none', boxSizing: 'border-box',
          }}/>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'all', label: 'Vse' },
            { id: 'low', label: 'Pod minimum', icon: 'arr_down' },
            { id: 'out', label: 'Razprodano' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              background: filter === f.id ? T.header : T.surface3,
              color: filter === f.id ? T.headerInk : T.ink,
              border: 'none', fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {f.icon && <KI name={f.icon} size={13}/>}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead style={{ position: 'sticky', top: 0, background: T.surface2, zIndex: 1 }}>
            <tr style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.06em' }}>
              {['Artikel','Šifra','Cena','Stanje','Min','Vrednost','Status','Akcije'].map((h, i) => (
                <th key={i} style={{ padding: '12px', textAlign: i >= 2 && i <= 5 ? 'right' : 'left',
                                      borderBottom: '1px solid ' + T.line, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => {
              const out = i.stock <= 0;
              const low = i.alert;
              const value = i.stock * i.price;
              return (
                <tr key={i.id} style={{
                  background: idx % 2 ? T.surface2 : T.surface,
                  borderBottom: '1px solid ' + T.lineSoft,
                }}>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{i.name}</div>
                    {i.variants && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                        Variante: {i.variants.join(', ')}
                      </div>
                    )}
                    {i.barcode && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2,
                                     fontFamily: 'monospace' }}>{i.barcode}</div>
                    )}
                  </td>
                  <td style={{ padding: '11px 12px', fontSize: 12, color: T.muted,
                                fontFamily: 'monospace' }}>{i.code}</td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums' }}>{window.eur(i.price)}</td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums',
                      color: out ? T.danger : low ? T.warn : T.ink,
                    }}>{i.stock} <span style={{ fontSize: 10, color: T.muted, fontWeight: 500 }}>{i.unit}</span></span>
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12, color: T.muted,
                                fontVariantNumeric: 'tabular-nums' }}>{i.lowStock || '—'}</td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums' }}>{window.eur(value)}</td>
                  <td style={{ padding: '11px 12px' }}>
                    {out ? (
                      <span style={statusPill(T, T.danger, 'rgba(168,50,50,0.10)')}>Razprodano</span>
                    ) : low ? (
                      <span style={statusPill(T, T.warn, 'rgba(184,140,40,0.12)')}>Nizka zaloga</span>
                    ) : (
                      <span style={statusPill(T, T.accent, T.accentSoft)}>V zalogi</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button style={iconBtn(T)} title="Dodaj zalogo"><KI name="plus" size={13}/></button>
                      <button style={iconBtn(T)} title="Uredi"><KI name="edit" size={13}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusPill(T, color, bg) {
  return {
    fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5,
    background: bg, color, textTransform: 'uppercase', letterSpacing: '0.05em',
  };
}
function iconBtn(T) {
  return {
    width: 28, height: 28, borderRadius: 6, border: '1px solid ' + T.line,
    background: T.surface, color: T.ink, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

// ═════════════════════════════════════════════════════════════════════
// REPORTS — daily Z-report, hourly chart, refunds, top items
// ═════════════════════════════════════════════════════════════════════
function ReportsScreen({ ctx }) {
  const { T, D } = ctx;
  const today = D.today;
  const maxHourly = Math.max(...today.hourlySales);

  // Top items (simulated)
  const top = [
    { name: 'Espresso', count: 64, sum: 102.40 },
    { name: 'Cappuccino', count: 38, sum: 91.20 },
    { name: 'Laško Zlatorog 0,5', count: 22, sum: 70.40 },
    { name: 'Burger klasik', count: 14, sum: 137.20 },
    { name: 'Krompirček', count: 12, sum: 45.60 },
  ];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20, background: T.bg }}>
      {/* Top KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>Poročilo · Današnji dan</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, letterSpacing: '-0.01em' }}>
            Četrtek, 14. maj 2026
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{
            padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface, color: T.ink, border: '1px solid ' + T.line,
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="calendar" size={14}/> Spremeni obdobje</button>
          <button style={{
            padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            background: T.surface, color: T.ink, border: '1px solid ' + T.line,
            fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}><KI name="print" size={14}/> Z-poročilo (zaključi izmeno)</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Kpi T={T} label="Promet"  value={window.eur(today.promet)} sub="+12% glede na včeraj" color={T.accent}/>
        <Kpi T={T} label="Računi"  value={today.racuni} sub={'povp. ' + window.eur(today.averageBill)}/>
        <Kpi T={T} label="Napitnine" value={window.eur(today.tipsTotal)} sub="5.85% prometa"/>
        <Kpi T={T} label="Vračila" value={window.eur(Math.abs(D.refunds.reduce((s,r) => s+r.amount, 0)))} sub={D.refunds.length + ' transakcij'}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card T={T} title="Promet po urah">
          <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 180, padding: '12px 4px' }}>
            {today.hourlySales.map((v, i) => {
              const h = (v / maxHourly) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                       alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.muted,
                                 fontVariantNumeric: 'tabular-nums' }}>{window.eur(v)}</div>
                  <div style={{
                    width: '100%', height: h + '%',
                    background: 'linear-gradient(180deg, ' + T.brand + ', ' + T.warn + ')',
                    borderRadius: '6px 6px 0 0', minHeight: 4,
                  }}/>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>
                    {(13 + i)}:00
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card T={T} title="Plačila po metodah">
          <PaymentSplit T={T} label="Kartica" pct={62} sum={302.20}/>
          <PaymentSplit T={T} label="Gotovina" pct={28} sum={136.50}/>
          <PaymentSplit T={T} label="Boni"     pct={6}  sum={29.20}/>
          <PaymentSplit T={T} label="Ostalo"   pct={4}  sum={19.50}/>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card T={T} title="Najbolj prodajani artikli">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                            letterSpacing: '0.06em' }}>
                <th style={{ padding: '8px 4px', textAlign: 'left' }}>Artikel</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>Količina</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>Prihodek</th>
                <th style={{ padding: '8px 4px', width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {top.map((t, i) => {
                const pct = (t.sum / top[0].sum) * 100;
                return (
                  <tr key={i} style={{ borderTop: '1px solid ' + T.lineSoft }}>
                    <td style={{ padding: '10px 4px', fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 600,
                                  fontVariantNumeric: 'tabular-nums' }}>{t.count}</td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700,
                                  fontVariantNumeric: 'tabular-nums' }}>{window.eur(t.sum)}</td>
                    <td style={{ padding: '10px 4px' }}>
                      <div style={{ height: 5, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: T.accent }}/>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card T={T} title="Vračila">
          {D.refunds.map(r => (
            <div key={r.id} style={{
              padding: 12, borderRadius: 9, marginBottom: 8,
              background: 'rgba(168,50,50,0.06)', border: '1px solid rgba(168,50,50,0.18)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.original}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.danger,
                                fontVariantNumeric: 'tabular-nums' }}>{window.eur(r.amount)}</div>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                {r.date} {r.time} · {r.cashier}
              </div>
              <div style={{ fontSize: 12, color: T.ink, marginTop: 4, fontStyle: 'italic' }}>"{r.reason}"</div>
            </div>
          ))}
          <button style={{
            width: '100%', padding: '10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            background: 'transparent', border: '1px dashed ' + T.line, color: T.muted,
            fontWeight: 600, fontSize: 12, marginTop: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}><KI name="refund" size={14}/> Novo vračilo</button>
        </Card>
      </div>
    </div>
  );
}

function PaymentSplit({ T, label, pct, sum }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {window.eur(sum)} <span style={{ color: T.muted, fontWeight: 500, fontSize: 11 }}>{pct}%</span>
        </span>
      </div>
      <div style={{ height: 6, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: T.accent, borderRadius: 999 }}/>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// ADMIN — staff, happy hour, business profile, integrations
// ═════════════════════════════════════════════════════════════════════
function AdminScreen({ ctx, auth }) {
  const { T, D, profileId, setProfileId } = ctx;
  const [section, setSection] = React.useState('profile');

  const sections = [
    { id: 'profile',   label: 'Tip poslovanja',  icon: 'home' },
    { id: 'spaces',    label: 'Prostori & mize', icon: 'chair', perm: 'editSpaces' },
    { id: 'staff',     label: 'Zaposleni & PIN', icon: 'users', perm: 'manageStaff' },
    { id: 'services',  label: 'Storitve',        icon: 'calendar' },
    { id: 'autolock',  label: 'Avt. zaklep',     icon: 'pin' },
    { id: 'happy',     label: 'Happy hour',      icon: 'happy' },
    { id: 'displays',  label: 'Kuhinja & display',icon: 'display' },
    { id: 'taxes',     label: 'FURS & DDV',      icon: 'receipt' },
    { id: 'devices',   label: 'Naprave',         icon: 'card' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{
        width: 220, background: T.surface, borderRight: '1px solid ' + T.line,
        padding: 12, flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                       letterSpacing: '0.08em', padding: '8px 10px' }}>Nastavitve</div>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, marginBottom: 2,
            background: section === s.id ? T.accentSoft : 'transparent',
            color: section === s.id ? T.accent : T.ink,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: section === s.id ? 700 : 500,
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          }}>
            <KI name={s.icon} size={15}/> {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, background: T.bg }}>
        {section === 'profile' && <ProfileSection ctx={ctx}/>}
        {section === 'spaces' && (
          auth ? (
            <window.PermissionGate perm="editSpaces" permissions={auth.permissions}
              T={T} isMasterPin={auth.isMasterPin}>
              <window.SpacesEditor ctx={ctx}/>
            </window.PermissionGate>
          ) : <window.SpacesEditor ctx={ctx}/>
        )}
        {section === 'staff' && (
          auth ? (
            <window.PermissionGate perm="manageStaff" permissions={auth.permissions}
              T={T} isMasterPin={auth.isMasterPin}>
              <window.StaffSectionV2 ctx={ctx}/>
            </window.PermissionGate>
          ) : <window.StaffSectionV2 ctx={ctx}/>
        )}
        {section === 'autolock' && auth && <window.AutoLockSection ctx={ctx} auth={auth}/>}
        {section === 'services' && <window.ServicesSection ctx={ctx}/>}
        {section === 'happy' && <HappyHourSection ctx={ctx}/>}
        {section === 'displays' && <DisplaysSection ctx={ctx}/>}
        {section === 'taxes' && <TaxesSection ctx={ctx}/>}
        {section === 'devices' && <DevicesSection ctx={ctx}/>}
      </div>
    </div>
  );
}

function ProfileSection({ ctx }) {
  const { T, D, profileId, setProfileId } = ctx;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Tip poslovanja</div>
      <div style={{ fontSize: 13, color: T.muted, marginTop: 6, marginBottom: 20 }}>
        Izberi tip, ki najbolj ustreza tvojemu poslovanju. Vpliva na razdelke v meniju in funkcije.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {D.profiles.map(p => {
          const active = p.id === profileId;
          return (
            <button key={p.id} onClick={() => setProfileId(p.id)} style={{
              padding: 18, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              background: T.surface, color: T.ink,
              border: '2px solid ' + (active ? T.accent : T.line), textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
            }}>
              {active && (
                <div style={{
                  position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 999,
                  background: T.accent, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><KI name="check" size={14} strokeWidth={2.5}/></div>
              )}
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: T.surface3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>{p.icon}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{p.desc}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {p.nav.map(n => (
                  <span key={n} style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    background: T.surface3, color: T.muted, textTransform: 'capitalize',
                  }}>{n}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StaffSection({ ctx }) {
  const { T, D } = ctx;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Zaposleni & PIN</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Vsak zaposleni se prijavi z lastnim PIN-om. Lahko nastaviš vloge in dovoljenja.
          </div>
        </div>
        <button style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="add_user" size={14}/> Nov zaposleni</button>
      </div>
      <Card T={T} title="Aktivni zaposleni">
        {D.staff.map((s, i) => (
          <div key={s.id} style={{
            padding: '12px', borderRadius: 9, marginBottom: 6,
            background: T.surface2, border: '1px solid ' + T.lineSoft,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 999, background: s.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13,
            }}>{s.name.split(' ').map(w => w[0]).join('')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.role}</div>
            </div>
            <div style={{
              padding: '6px 10px', borderRadius: 7, background: T.surface3,
              fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.15em',
            }}>{'•••' + s.pin.slice(-1)}</div>
            <button style={iconBtn(T)}><KI name="edit" size={13}/></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function HappyHourSection({ ctx }) {
  const { T, D } = ctx;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Happy hour pravila</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Avtomatski popusti v določenih urah / dnevih za izbrane kategorije.
          </div>
        </div>
        <button style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="plus" size={14}/> Novo pravilo</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {D.happyHourRules.map(r => (
          <div key={r.id} style={{
            padding: 18, borderRadius: 12, background: T.surface,
            border: '1px solid ' + T.line,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: r.active ? 'rgba(184,140,40,0.15)' : T.surface3,
                color: r.active ? T.warn : T.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <KI name="happy" size={22}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                  {r.days.join(', ')} · {r.from}–{r.to} · {r.discount}% popust
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{
                  width: 40, height: 22, borderRadius: 999, padding: 2,
                  background: r.active ? T.accent : T.surface3, transition: 'background .15s',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 999, background: '#fff',
                    transform: `translateX(${r.active ? 18 : 0}px)`, transition: 'transform .15s',
                  }}/>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {r.categories.map(catId => {
                const c = D.categories.find(c => c.id === catId);
                return c && (
                  <span key={catId} style={{
                    padding: '4px 10px', borderRadius: 6, background: c.color + '30',
                    color: c.color, fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>{c.icon} {c.name}</span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplaysSection({ ctx }) {
  const { T } = ctx;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>
        Kuhinjski display & customer display
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <Card T={T} title="Kuhinjski display (KDS)">
          <div style={{
            background: '#0d1112', color: '#39ff88', padding: 20, borderRadius: 10,
            fontFamily: 'monospace', fontSize: 13, marginBottom: 12,
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              T4 · 3 min ⏱
            </div>
            <div>2× Burger klasik <span style={{ color: '#ffc147' }}>(brez čebule)</span></div>
            <div>1× Cezar solata</div>
            <div>1× Krompirček</div>
            <div style={{ marginTop: 12, color: '#7a838a', fontSize: 11 }}>
              ─────────────────────
            </div>
            <div style={{ marginTop: 12, color: '#fff', fontWeight: 700 }}>N1 · 8 min ⚠️</div>
            <div>1× Pizza margerita</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: T.accent, width: 16, height: 16 }}/>
            Omogoči kuhinjski display
          </label>
        </Card>
        <Card T={T} title="Customer-facing display">
          <div style={{
            background: T.header, color: T.headerInk, padding: 20, borderRadius: 10,
            marginBottom: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>Skupaj</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: T.brand,
                           fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              € 14,80
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
              2× Cappuccino · 1× Tiramisu
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: T.accent, width: 16, height: 16 }}/>
            Pokaži skupni znesek stranki
          </label>
        </Card>
      </div>
    </div>
  );
}

function TaxesSection({ ctx }) {
  const { T } = ctx;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>
        FURS & DDV
      </div>
      <Card T={T} title="Davčna potrditev">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>FURS povezava</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
              Aktivna · zadnja sinhronizacija pred 4 minutami
            </div>
          </div>
          <span style={statusPill(T, T.accent, T.accentSoft)}>Povezano</span>
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid ' + T.line, margin: '12px 0' }}/>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                         padding: '8px 0', cursor: 'pointer' }}>
          <input type="checkbox" defaultChecked style={{ accentColor: T.accent, width: 16, height: 16 }}/>
          Privzeto davčno potrdi vsak račun
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                         padding: '8px 0', cursor: 'pointer' }}>
          <input type="checkbox" defaultChecked style={{ accentColor: T.accent, width: 16, height: 16 }}/>
          Pokaži gumb "Tiskaj brez FURS" v plačilu
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                         padding: '8px 0', cursor: 'pointer' }}>
          <input type="checkbox" style={{ accentColor: T.accent, width: 16, height: 16 }}/>
          Zahteva potrditev PIN za netiskane račune
        </label>
      </Card>
    </div>
  );
}

function DevicesSection({ ctx }) {
  const { T } = ctx;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>
        Povezane naprave
      </div>
      <Card T={T} title="Tiskalniki & terminali">
        <DeviceRow T={T} icon="print" name="Star TSP143 (bar)" status="ok" detail="USB · Bar tiskalnik"/>
        <DeviceRow T={T} icon="print" name="Epson TM-T20 (kuhinja)" status="ok" detail="Wi-Fi · 192.168.1.42"/>
        <DeviceRow T={T} icon="card" name="Bankart terminal" status="ok" detail="Bluetooth · Verifone P200"/>
        <DeviceRow T={T} icon="barcode" name="Symbol DS2208" status="off" detail="USB · trenutno ni povezan"/>
      </Card>
    </div>
  );
}

function DeviceRow({ T, icon, name, status, detail }) {
  const ok = status === 'ok';
  return (
    <div style={{
      padding: '12px', borderRadius: 9, marginBottom: 6,
      background: T.surface2, border: '1px solid ' + T.lineSoft,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 9, background: T.surface3, color: T.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><KI name={icon} size={18}/></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{detail}</div>
      </div>
      <span style={statusPill(T, ok ? T.accent : T.muted, ok ? T.accentSoft : T.surface3)}>
        {ok ? 'Aktiven' : 'Brez povezave'}
      </span>
    </div>
  );
}


// ===== pos-klasik-wellness.jsx =====
// Wellness/fitness module:
//   - WeekCalendar (free/busy view, click-to-book)
//   - PackagesScreen (Kartice & Paketi)
//   - ServicesSection (admin — custom service types)
//   - NotificationsPanel (persistent, rule-driven)
//   - Updated bell badge wiring

// ═════════════════════════════════════════════════════════════════════
// WEEK CALENDAR — replaces day view when `view === 'week'`
// Click on empty slot → opens new booking pre-filled
// ═════════════════════════════════════════════════════════════════════
function WeekCalendar({ ctx, staffFilter, onNewBooking }) {
  const { T, D } = ctx;
  const days = ['Pon','Tor','Sre','Čet','Pet','Sob','Ned'];
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i); // 8–20
  const today = new Date('2026-05-14'); // Thursday
  // Compute Mon date of the week containing today
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = days.map((_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
  const isoOf = (d) => d.toISOString().slice(0,10);

  const bookings = D.bookings.filter(b => !b.isTable &&
    (staffFilter === 'all' || b.staffId === staffFilter));

  // Quickly find a booking for a given day+time+staff combo
  function bookingAt(date, hh, mm) {
    return bookings.find(b => {
      if (b.date !== isoOf(date)) return false;
      const [bh, bm] = b.time.split(':').map(Number);
      return bh === hh && (mm === undefined || (mm === bm));
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', background: T.surface }}>
      <div style={{ minWidth: 900,
                     display: 'grid', gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        {/* Header row: day labels */}
        <div style={{ background: T.surface2, borderBottom: '1px solid ' + T.line,
                       borderRight: '1px solid ' + T.line }}/>
        {weekDates.map((d, i) => {
          const isToday = isoOf(d) === isoOf(today);
          return (
            <div key={i} style={{
              background: T.surface2, borderBottom: '1px solid ' + T.line,
              borderRight: '1px solid ' + T.line, padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted,
                             textTransform: 'uppercase', letterSpacing: '0.06em' }}>{days[i]}</div>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: isToday ? T.accentText : T.ink,
                background: isToday ? T.accent : 'transparent',
                width: 32, height: 32, borderRadius: 999, lineHeight: '32px',
                margin: '6px auto 0', fontVariantNumeric: 'tabular-nums',
              }}>{d.getDate()}</div>
            </div>
          );
        })}

        {/* Time rows */}
        {hours.map((hh, hi) => (
          <React.Fragment key={hh}>
            <div style={{
              background: T.surface2, borderRight: '1px solid ' + T.line,
              borderTop: hi === 0 ? 'none' : '1px solid ' + T.lineSoft,
              padding: '4px 8px', fontSize: 11, fontWeight: 700, color: T.muted,
              fontVariantNumeric: 'tabular-nums', minHeight: 60,
            }}>{String(hh).padStart(2,'0')}:00</div>
            {weekDates.map((d, di) => {
              const b = bookingAt(d, hh);
              const cust = b && D.customers.find(c => c.id === b.customerId);
              const svcItem = b && D.items.find(i => i.id === b.itemId);
              const svc = svcItem && (D.services.find(s => s.name === svcItem.name) || null);
              const color = svc ? svc.color : T.accent;
              const tentative = b && b.status === 'tentative';
              return (
                <div key={di} style={{
                  borderRight: '1px solid ' + T.lineSoft,
                  borderTop: hi === 0 ? 'none' : '1px solid ' + T.lineSoft,
                  position: 'relative', padding: 2, minHeight: 60,
                  background: T.surface,
                }} onClick={() => !b && onNewBooking({ date: isoOf(d), time: String(hh).padStart(2,'0') + ':00' })}>
                  {b ? (
                    <button style={{
                      width: '100%', height: '100%', minHeight: 56,
                      background: tentative ? color + '20' : color + '18',
                      border: '1px solid ' + color, borderLeft: '3px solid ' + color,
                      borderRadius: 6, padding: '6px 8px',
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      color: T.ink, overflow: 'hidden',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color,
                                     fontVariantNumeric: 'tabular-nums' }}>{b.time} · {b.duration}min</div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2,
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cust?.name || 'Brez stranke'}
                      </div>
                      <div style={{ fontSize: 9, color: T.muted, marginTop: 1,
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {svcItem?.name || ''}
                      </div>
                    </button>
                  ) : (
                    <div className="free-slot" style={{
                      width: '100%', height: '100%', minHeight: 56,
                      border: '1px dashed transparent', borderRadius: 6, cursor: 'pointer',
                      transition: 'border-color .12s, background .12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = T.accent;
                      e.currentTarget.style.background = T.accentSoft;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.background = 'transparent';
                    }}>
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PACKAGES SCREEN — Kartice & Paketi
// ═════════════════════════════════════════════════════════════════════
function PackagesScreen({ ctx }) {
  const { T, D } = ctx;
  const [editingId, setEditingId] = React.useState(null);

  // Stats
  const stats = React.useMemo(() => {
    const active = D.customers.filter(c => {
      const s = window.posHelpers.memberStatus(c);
      return s.status === 'active' || s.status === 'expiring';
    }).length;
    const expiring = D.customers.filter(c => {
      const s = window.posHelpers.memberStatus(c);
      return s.status === 'expiring' || s.status === 'critical';
    }).length;
    const expired = D.customers.filter(c => {
      const s = window.posHelpers.memberStatus(c);
      return s.status === 'expired';
    }).length;
    const monthlyRevenue = D.customers.reduce((s, c) => s + c.spent, 0);
    return { active, expiring, expired, monthlyRevenue };
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20, background: T.bg }}>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <Kpi T={T} label="Aktivnih članov" value={stats.active} color={T.accent} sub="zelena oznaka"/>
        <Kpi T={T} label="Potečejo ta teden" value={stats.expiring} color={T.warn} sub="rumena/oranžna"/>
        <Kpi T={T} label="Potekle (čakajo podaljšanje)" value={stats.expired} color={T.danger} sub="rdeča oznaka"/>
        <Kpi T={T} label="Promet ta mesec" value={window.eur(stats.monthlyRevenue)} color={T.ink} sub="vse stranke"/>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Kartice & paketi</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Predloge paketov, ki jih lahko prodaš strankam. Vse je urejljivo.
          </div>
        </div>
        <button onClick={() => setEditingId('new')} style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="plus" size={14}/> Nov paket</button>
      </div>

      {/* Packages grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {D.packageTemplates.map(p => <PackageCard key={p.id} T={T} pkg={p}
          onEdit={() => setEditingId(p.id)}/>)}
      </div>

      {editingId && (
        <PackageEditor T={T} pkg={editingId === 'new' ? null : D.packageTemplates.find(p => p.id === editingId)}
          onClose={() => setEditingId(null)} services={D.services}/>
      )}
    </div>
  );
}

function PackageCard({ T, pkg, onEdit }) {
  const typeColor = pkg.type === 'unlimited' ? '#1f6b3a'
                  : pkg.type === 'visits' ? '#3a6e8f'
                  : pkg.type === 'time-restricted' ? '#e9b949' : '#7b61b8';
  const typeLabel = pkg.type === 'unlimited' ? 'Neomejen'
                  : pkg.type === 'visits' ? (pkg.visits + ' obiskov')
                  : pkg.type === 'time-restricted' ? 'Časovno omejen' : pkg.type;
  return (
    <div style={{
      background: T.surface, borderRadius: 13, border: '1px solid ' + T.line,
      padding: 18, position: 'relative',
    }}>
      <span style={{
        position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 800,
        padding: '4px 9px', borderRadius: 5, background: typeColor + '18', color: typeColor,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{typeLabel}</span>

      <div style={{ fontSize: 16, fontWeight: 800, paddingRight: 110 }}>{pkg.name}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: T.ink,
                       fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {window.eur(pkg.price)}
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 10,
                    minHeight: 36 }}>{pkg.desc}</div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.muted, marginTop: 12,
                    paddingTop: 12, borderTop: '1px solid ' + T.lineSoft, fontWeight: 600 }}>
        <span>Veljavnost: <b style={{ color: T.ink }}>{pkg.validityDays} dni</b></span>
        {pkg.hoursFrom && <span>· {pkg.hoursFrom}–{pkg.hoursTo}</span>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={onEdit} style={{
          flex: 1, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
          background: T.surface3, color: T.ink, border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}><KI name="edit" size={13}/> Uredi</button>
        <button style={{
          flex: 1, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12,
        }}>Prodaj</button>
        <button title="Podvoji" style={{
          width: 32, padding: 0, borderRadius: 7, cursor: 'pointer',
          background: 'transparent', color: T.muted, border: '1px solid ' + T.line,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><KI name="package" size={13}/></button>
      </div>
    </div>
  );
}

function PackageEditor({ T, pkg, services, onClose }) {
  const empty = { name: '', price: 0, type: 'unlimited', validityDays: 30, desc: '' };
  const [v, setV] = React.useState(pkg || empty);
  return (
    <PosModal open onClose={onClose} theme={T} width={520}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid ' + T.line,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>{pkg ? 'Uredi paket' : 'Nov paket'}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {pkg ? pkg.name : 'Definiraj nov paket'}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid ' + T.line,
          background: 'transparent', cursor: 'pointer', color: T.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><KI name="x" size={14}/></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Ime paketa">
          <input value={v.name} onChange={e => setV({ ...v, name: e.target.value })}
            style={inputStyle(T)} placeholder="npr. Mesečna neomejena"/>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Cena (€)">
            <input type="number" step="0.50" value={v.price} onChange={e => setV({ ...v, price: parseFloat(e.target.value) || 0 })}
              style={inputStyle(T)}/>
          </Field>
          <Field label="Veljavnost (dni)">
            <input type="number" value={v.validityDays}
              onChange={e => setV({ ...v, validityDays: parseInt(e.target.value) || 0 })}
              style={inputStyle(T)}/>
          </Field>
        </div>
        <Field label="Tip paketa">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {[
              { id: 'unlimited',       label: 'Neomejen' },
              { id: 'visits',          label: 'Po obiskih (X×)' },
              { id: 'time-restricted', label: 'Časovno omejen (npr. jutro)' },
              { id: 'time-based',      label: 'Trajanje (npr. X dni)' },
            ].map(t => (
              <button key={t.id} onClick={() => setV({ ...v, type: t.id })} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: v.type === t.id ? T.accentSoft : T.surface3,
                color: v.type === t.id ? T.accent : T.ink,
                border: '1px solid ' + (v.type === t.id ? T.accent : 'transparent'),
                fontWeight: 600, fontSize: 12, textAlign: 'left',
              }}>{t.label}</button>
            ))}
          </div>
        </Field>
        {v.type === 'visits' && (
          <Field label="Število obiskov">
            <input type="number" value={v.visits || 10}
              onChange={e => setV({ ...v, visits: parseInt(e.target.value) || 0 })}
              style={inputStyle(T)}/>
          </Field>
        )}
        {v.type === 'time-restricted' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Od ure">
              <input type="time" value={v.hoursFrom || '06:00'}
                onChange={e => setV({ ...v, hoursFrom: e.target.value })}
                style={inputStyle(T)}/>
            </Field>
            <Field label="Do ure">
              <input type="time" value={v.hoursTo || '12:00'}
                onChange={e => setV({ ...v, hoursTo: e.target.value })}
                style={inputStyle(T)}/>
            </Field>
          </div>
        )}
        <Field label="Vezan na storitev (neobvezno)">
          <select value={v.serviceId || ''}
            onChange={e => setV({ ...v, serviceId: e.target.value || null })}
            style={inputStyle(T)}>
            <option value="">— Vse storitve —</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Opis">
          <textarea value={v.desc} onChange={e => setV({ ...v, desc: e.target.value })}
            style={{ ...inputStyle(T), minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}/>
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + T.line, background: 'transparent', color: T.ink,
            fontWeight: 600, fontSize: 13,
          }}>Prekliči</button>
          {pkg && (
            <button onClick={onClose} style={{
              padding: '12px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(168,50,50,0.3)', background: 'transparent', color: T.danger,
              fontWeight: 700, fontSize: 13,
            }}>Izbriši</button>
          )}
          <button onClick={onClose} style={{
            flex: 2, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: 'none', background: T.accent, color: '#fff', fontWeight: 700, fontSize: 13,
          }}>Shrani paket</button>
        </div>
      </div>
    </PosModal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SERVICES SECTION (admin) — CRUD custom service types with color picker
// ═════════════════════════════════════════════════════════════════════
function ServicesSection({ ctx }) {
  const { T, D } = ctx;
  const [services, setServices] = React.useState(() => [...D.services]);
  const [edit, setEdit] = React.useState(null);

  // Live sync
  React.useEffect(() => { D.services = services; }, [services]);

  function add() {
    const id = 'sv-' + Math.random().toString(36).slice(2, 7);
    const colors = ['#1f6b3a','#7b61b8','#3a6e8f','#e9b949','#c76a98','#c26a3a','#a83232'];
    const nu = { id, name: 'Nova storitev', color: colors[services.length % colors.length],
                 durationMin: 60, price: 30, defaultStaffId: D.staff[0].id };
    setServices([...services, nu]); setEdit(nu);
  }
  function update(id, patch) {
    setServices(services.map(s => s.id === id ? { ...s, ...patch } : s));
    if (edit && edit.id === id) setEdit({ ...edit, ...patch });
  }
  function del(id) {
    if (!confirm('Izbrišem storitev?')) return;
    setServices(services.filter(s => s.id !== id));
    setEdit(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Storitve</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Ustvari poljubne storitve z imenom, barvo, trajanjem in ceno. Uporabljene v koledarju in prodaji.
          </div>
        </div>
        <button onClick={add} style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="plus" size={14}/> Nova storitev</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {services.map(s => (
          <div key={s.id} style={{
            background: T.surface, borderRadius: 12, border: '1px solid ' + T.line, padding: 14,
            borderLeft: '4px solid ' + s.color,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input type="color" value={s.color}
                onChange={(e) => update(s.id, { color: e.target.value })}
                style={{ width: 36, height: 36, border: 'none', borderRadius: 8,
                         background: s.color, cursor: 'pointer', padding: 0, flexShrink: 0 }}/>
              <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })}
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 7,
                         border: '1px solid ' + T.line, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                         background: T.surface2, outline: 'none' }}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Trajanje">
                <select value={String(s.durationMin)} onChange={(e) => update(s.id, { durationMin: parseInt(e.target.value) })}
                  style={inputStyle(T)}>
                  <option value="15">15 min</option><option value="30">30 min</option>
                  <option value="45">45 min</option><option value="60">60 min</option>
                  <option value="90">90 min</option><option value="120">120 min</option>
                </select>
              </Field>
              <Field label="Cena (€)">
                <input type="number" step="0.50" value={s.price}
                  onChange={(e) => update(s.id, { price: parseFloat(e.target.value) || 0 })}
                  style={inputStyle(T)}/>
              </Field>
            </div>
            <Field label="Privzeti zaposleni">
              <select value={s.defaultStaffId || ''} onChange={(e) => update(s.id, { defaultStaffId: e.target.value })}
                style={inputStyle(T)}>
                <option value="">— Brez —</option>
                {D.staff.map(st => <option key={st.id} value={st.id}>{st.name} · {st.role}</option>)}
              </select>
            </Field>
            <button onClick={() => del(s.id)} style={{
              marginTop: 10, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', color: T.danger, border: '1px solid rgba(168,50,50,0.2)',
              fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            }}><KI name="trash" size={12}/> Izbriši</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// NOTIFICATIONS PANEL — persistent rule-driven
// ═════════════════════════════════════════════════════════════════════
function useNotifications() {
  const [resolved, setResolved] = React.useState({});
  const notifs = React.useMemo(() => window.posHelpers.computeNotifications(resolved), [resolved]);
  function resolve(id) { setResolved(r => ({ ...r, [id]: true })); }
  return { notifs, resolve };
}

function NotificationsPanel({ T, notifs, resolve, onClose, ctx }) {
  const sevColors = {
    red:    { bg: 'rgba(168,50,50,0.10)',  border: 'rgba(168,50,50,0.35)',  dot: '#a83232', label: 'KRITIČNO' },
    orange: { bg: 'rgba(217,118,40,0.12)', border: 'rgba(217,118,40,0.35)', dot: '#d97628', label: 'POZOR' },
    yellow: { bg: 'rgba(233,185,73,0.15)', border: 'rgba(233,185,73,0.4)',  dot: '#e9b949', label: 'OPOZORILO' },
    info:   { bg: T.surface2,              border: T.line,                  dot: T.accent,  label: 'INFO' },
  };
  // Sort by severity
  const sevOrder = ['red','orange','yellow','info'];
  const sorted = [...notifs].sort((a,b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity));
  const memberNotifs = sorted.filter(n => n.kind === 'member');
  const apptNotifs = sorted.filter(n => n.kind === 'appointment');

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50 }}/>
      <div style={{
        position: 'absolute', top: 60, right: 14, zIndex: 51,
        width: 380, maxHeight: 600, display: 'flex', flexDirection: 'column',
        background: '#fff', color: T.ink, borderRadius: 12,
        boxShadow: '0 18px 50px rgba(0,0,0,0.30)', border: '1px solid ' + T.line,
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + T.line,
                       display: 'flex', alignItems: 'center', gap: 10 }}>
          <KI name="bell" size={16}/>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Obvestila</div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {notifs.length} {notifs.length === 1 ? 'aktivno' : 'aktivnih'}
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, border: 'none',
            background: T.surface3, color: T.ink, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><KI name="x" size={13}/></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {notifs.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: T.muted, fontSize: 13 }}>
              <KI name="check" size={26}/>
              <div style={{ marginTop: 8, fontWeight: 600 }}>Vse obravnavano</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Nobenih obvestil.</div>
            </div>
          )}

          {memberNotifs.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase',
                           letterSpacing: '0.08em', padding: '6px 8px 4px' }}>Člani</div>
          )}
          {memberNotifs.map(n => {
            const c = sevColors[n.severity];
            return (
              <div key={n.id} style={{
                padding: 12, borderRadius: 10, marginBottom: 6,
                background: c.bg, border: '1px solid ' + c.border,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot,
                                  marginTop: 6, flexShrink: 0 }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{n.customerName}</div>
                    <div style={{ fontSize: 12, color: T.ink, marginTop: 2, fontWeight: 600 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{n.detail}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {n.actions.includes('extend') && (
                    <button onClick={() => resolve(n.id)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                      background: T.accent, color: '#fff', border: 'none',
                      fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}><KI name="plus" size={12}/> Podaljšaj</button>
                  )}
                  {n.actions.includes('inactive') && (
                    <button onClick={() => resolve(n.id)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                      background: 'transparent', color: T.muted, border: '1px solid ' + T.line,
                      fontWeight: 600, fontSize: 11,
                    }}>Označi kot out</button>
                  )}
                  {n.actions.includes('dismiss') && (
                    <button onClick={() => resolve(n.id)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                      background: 'transparent', color: T.muted, border: '1px solid ' + T.line,
                      fontWeight: 600, fontSize: 11,
                    }}>Opravljeno</button>
                  )}
                </div>
              </div>
            );
          })}

          {apptNotifs.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase',
                           letterSpacing: '0.08em', padding: '12px 8px 4px' }}>Današnji termini</div>
          )}
          {apptNotifs.map(n => (
            <div key={n.id} style={{
              padding: 12, borderRadius: 10, marginBottom: 6,
              background: T.surface2, border: '1px solid ' + T.line,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <KI name="clock" size={16}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{n.detail}</div>
              </div>
              <button onClick={() => resolve(n.id)} style={{
                padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', color: T.muted, border: '1px solid ' + T.line,
                fontWeight: 600, fontSize: 11,
              }}>OK</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Member status badge for customer list/card
// ═════════════════════════════════════════════════════════════════════
function MemberStatusDot({ status, size = 12 }) {
  const colors = {
    active:    '#1f6b3a',
    expiring:  '#e9b949',
    critical:  '#d97628',
    expired:   '#a83232',
    none:      '#9a9890',
  };
  const labels = {
    active: 'Aktivna', expiring: 'Poteče kmalu', critical: 'Kritično',
    expired: 'Potekla', none: 'Brez kartice',
  };
  return (
    <div title={labels[status]} style={{
      width: size, height: size, borderRadius: 999, background: colors[status] || '#999',
      flexShrink: 0,
    }}/>
  );
}


// ===== pos-klasik-admin-extra.jsx =====
// Spaces & Tables editor — admin section
// Click-to-place table positions, edit seats, status, name

function SpacesEditor({ ctx }) {
  const { T } = ctx;
  // Local copy of spaces — start with the existing data and allow mutations
  const [spaces, setSpaces] = React.useState(() => JSON.parse(JSON.stringify(window.POS_DATA.spaces)));
  const [activeId, setActiveId] = React.useState(spaces[0]?.id);
  const [placeMode, setPlaceMode] = React.useState(false);
  const [editingTable, setEditingTable] = React.useState(null);
  const canvasRef = React.useRef(null);

  const active = spaces.find(s => s.id === activeId);

  // Persist live to window so floor screen sees it
  React.useEffect(() => { window.POS_DATA.spaces = spaces; }, [spaces]);

  function addSpace() {
    const id = 'sp-' + Math.random().toString(36).slice(2, 7);
    const colors = ['#8FBF8F','#B8956A','#9B7AC9','#e9b949','#a83232','#3a6e8f'];
    const sp = { id, name: 'Nov prostor', color: colors[spaces.length % colors.length], tables: [] };
    setSpaces([...spaces, sp]); setActiveId(id);
  }
  function deleteSpace(id) {
    if (!confirm('Izbrišem prostor in vse mize?')) return;
    const next = spaces.filter(s => s.id !== id);
    setSpaces(next);
    if (activeId === id) setActiveId(next[0]?.id);
  }
  function renameSpace(id, name) {
    setSpaces(spaces.map(s => s.id === id ? { ...s, name } : s));
  }
  function setSpaceColor(id, color) {
    setSpaces(spaces.map(s => s.id === id ? { ...s, color } : s));
  }

  function onCanvasClick(e) {
    if (!placeMode || !active) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newId = 't-' + Math.random().toString(36).slice(2, 7);
    const number = active.tables.length + 1;
    const newTable = { id: newId, name: 'T' + number, seats: 4,
                       x: Math.max(2, Math.min(92, x - 6)),
                       y: Math.max(2, Math.min(88, y - 6)),
                       status: 'free' };
    setSpaces(spaces.map(s => s.id === active.id ? { ...s, tables: [...s.tables, newTable] } : s));
    setEditingTable(newTable);
    setPlaceMode(false);
  }

  function updateTable(tid, patch) {
    setSpaces(spaces.map(s => s.id === active.id
      ? { ...s, tables: s.tables.map(t => t.id === tid ? { ...t, ...patch } : t) }
      : s));
    if (editingTable && editingTable.id === tid) setEditingTable({ ...editingTable, ...patch });
  }
  function deleteTable(tid) {
    setSpaces(spaces.map(s => s.id === active.id
      ? { ...s, tables: s.tables.filter(t => t.id !== tid) } : s));
    setEditingTable(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Prostori & mize</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Dodaj prostore (npr. Terasa, Notranjost) in postavi mize. Klikni v platno za novo mizo.
          </div>
        </div>
        <button onClick={addSpace} style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="plus" size={14}/> Nov prostor</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14 }}>
        {/* Space list */}
        <div style={{
          background: T.surface, borderRadius: 12, border: '1px solid ' + T.line, padding: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em', padding: '8px 10px 6px' }}>Prostori</div>
          {spaces.map(s => {
            const sel = s.id === activeId;
            return (
              <div key={s.id} style={{
                padding: '10px 10px', borderRadius: 8, marginBottom: 2,
                background: sel ? T.accentSoft : 'transparent', position: 'relative',
                cursor: 'pointer',
              }} onClick={() => setActiveId(s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={s.color}
                    onChange={(e) => setSpaceColor(s.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 22, height: 22, border: 'none', borderRadius: 999, cursor: 'pointer',
                      background: s.color, padding: 0, flexShrink: 0,
                    }}/>
                  <input value={s.name} onChange={(e) => renameSpace(s.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 6,
                      border: '1px solid transparent', background: 'transparent', color: T.ink,
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 600, outline: 'none',
                    }}
                    onFocus={(e) => e.target.style.background = '#fff'}
                    onBlur={(e) => e.target.style.background = 'transparent'}/>
                  <button onClick={(e) => { e.stopPropagation(); deleteSpace(s.id); }} style={{
                    width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent',
                    color: T.muted, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}><KI name="trash" size={12}/></button>
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4, padding: '0 0 0 32px' }}>
                  {s.tables.length} {s.tables.length === 1 ? 'miza' : 'miz'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Canvas */}
        <div style={{
          background: T.surface, borderRadius: 12, border: '1px solid ' + T.line, padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {active?.name || 'Brez prostora'} <span style={{ color: T.muted, fontWeight: 500 }}>
                · {active?.tables.length || 0} miz
              </span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setPlaceMode(p => !p)} disabled={!active} style={{
                padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                background: placeMode ? T.accent : T.surface3, color: placeMode ? '#fff' : T.ink,
                border: 'none', fontWeight: 700, fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
              }}><KI name="plus" size={14}/> {placeMode ? 'Klikni v platno za mizo…' : 'Dodaj mizo'}</button>
            </div>
          </div>

          <div ref={canvasRef} onClick={onCanvasClick} style={{
            position: 'relative', width: '100%', aspectRatio: '16/10',
            background: T.bg,
            backgroundImage: 'radial-gradient(circle, ' + T.line + ' 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            borderRadius: 10, border: '1px solid ' + T.line,
            cursor: placeMode ? 'crosshair' : 'default',
            overflow: 'hidden',
          }}>
            {active?.tables.map(t => {
              const st = T.status[t.status] || T.status.free;
              const isRound = t.seats <= 2;
              const w = t.seats <= 2 ? 76 : t.seats <= 4 ? 96 : 124;
              const h = t.seats <= 2 ? 76 : t.seats <= 4 ? 76 : 94;
              const sel = editingTable && editingTable.id === t.id;
              return (
                <div key={t.id} onClick={(e) => { e.stopPropagation(); setEditingTable(t); }}
                  style={{
                  position: 'absolute', left: t.x + '%', top: t.y + '%',
                  width: w, height: h,
                  background: st.bg, border: '2px solid ' + (sel ? T.accent : st.stroke),
                  borderRadius: isRound ? '50%' : 12,
                  cursor: 'pointer', fontFamily: 'inherit', color: T.ink,
                  padding: 6, textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: sel ? '0 0 0 3px ' + T.accentSoft : '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{t.name}</div>
                  <div style={{ fontSize: 9, color: T.muted, display: 'flex',
                                 alignItems: 'center', gap: 3, marginTop: 1 }}>
                    <KI name="user" size={9}/> {t.seats}
                  </div>
                </div>
              );
            })}
            {active && active.tables.length === 0 && !placeMode && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: T.muted,
                fontSize: 13, pointerEvents: 'none', gap: 4,
              }}>
                <div style={{ fontSize: 26, opacity: 0.4 }}>🪑</div>
                <div>Ta prostor je prazen.</div>
                <div style={{ fontSize: 11 }}>Klikni "Dodaj mizo" zgoraj.</div>
              </div>
            )}
          </div>

          {/* Editor side panel for selected table */}
          {editingTable && (
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10,
                           background: T.surface2, border: '1px solid ' + T.line }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Urejaš mizo</div>
                <button onClick={() => setEditingTable(null)} style={{
                  marginLeft: 'auto', width: 26, height: 26, borderRadius: 6, border: 'none',
                  background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}><KI name="x" size={14}/></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
                <Field label="Ime">
                  <input value={editingTable.name} onChange={(e) => updateTable(editingTable.id, { name: e.target.value })}
                    style={inputStyle(T)}/>
                </Field>
                <Field label="Število sedežev">
                  <input type="number" min="1" max="20" value={editingTable.seats}
                    onChange={(e) => updateTable(editingTable.id, { seats: parseInt(e.target.value) || 1 })}
                    style={inputStyle(T)}/>
                </Field>
                <Field label="Status">
                  <select value={editingTable.status}
                    onChange={(e) => updateTable(editingTable.id, { status: e.target.value })}
                    style={inputStyle(T)}>
                    <option value="free">Prosto</option>
                    <option value="occupied">Zasedeno</option>
                    <option value="reserved">Rezervirano</option>
                    <option value="needs_attention">Pozor</option>
                  </select>
                </Field>
              </div>
              <button onClick={() => deleteTable(editingTable.id)} style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(168,50,50,0.08)', color: T.danger, border: 'none',
                fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}><KI name="trash" size={13}/> Izbriši to mizo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Updated StaffSection with full permissions editor
// ═════════════════════════════════════════════════════════════════════
function StaffSectionV2({ ctx }) {
  const { T, D } = ctx;
  const [editingId, setEditingId] = React.useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Zaposleni & PIN</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Vsak se prijavi z lastnim PIN-om. Vloge določijo dovoljenja — lahko jih prilagodiš.
          </div>
        </div>
        <button style={{
          marginLeft: 'auto', padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          background: T.accent, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}><KI name="add_user" size={14}/> Nov zaposleni</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14 }}>
        {/* Staff list */}
        <Card T={T} title="Zaposleni">
          {D.staff.map(s => {
            const sel = editingId === s.id;
            return (
              <button key={s.id} onClick={() => setEditingId(s.id)} style={{
                width: '100%', padding: '12px', borderRadius: 9, marginBottom: 6,
                background: sel ? T.accentSoft : T.surface2,
                border: '1px solid ' + (sel ? T.accent : T.lineSoft), cursor: 'pointer',
                fontFamily: 'inherit', color: T.ink, textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 999, background: s.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13,
                }}>{s.name.split(' ').map(w => w[0]).join('')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.role}</div>
                </div>
                <div style={{
                  padding: '5px 9px', borderRadius: 6, background: T.surface3,
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em',
                }}>{'•••' + s.pin.slice(-1)}</div>
              </button>
            );
          })}
        </Card>

        {/* Permission editor */}
        {editingId ? (
          <PermissionsEditor T={T} D={D} staff={D.staff.find(s => s.id === editingId)}/>
        ) : (
          <Card T={T} title="">
            <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>
              <KI name="users" size={28}/>
              <div style={{ marginTop: 10 }}>Izberi zaposlenega za pregled dovoljenj.</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function PermissionsEditor({ T, D, staff }) {
  const [perms, setPerms] = React.useState(staff.permissions || D.rolePresets[staff.role] || {});
  const [role, setRole] = React.useState(staff.role);

  // Reload when staff changes
  React.useEffect(() => {
    setPerms(staff.permissions || D.rolePresets[staff.role] || {});
    setRole(staff.role);
  }, [staff.id]);

  function setRolePreset(r) {
    setRole(r);
    setPerms({ ...(D.rolePresets[r] || {}) });
  }

  const granted = Object.values(perms).filter(Boolean).length;
  const total = D.permissionGroups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Card T={T} title="">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 999, background: staff.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 18,
        }}>{staff.name.split(' ').map(w => w[0]).join('')}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{staff.name}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {granted}/{total} dovoljenj aktivnih
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                         letterSpacing: '0.08em' }}>PIN</div>
          <input type="text" defaultValue={staff.pin} style={{
            width: 90, padding: '6px 10px', borderRadius: 7, border: '1px solid ' + T.line,
            background: T.inputBg, fontFamily: 'monospace', fontSize: 14, fontWeight: 700,
            letterSpacing: '0.2em', textAlign: 'center', outline: 'none',
          }}/>
        </div>
      </div>

      {/* Role preset */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                       letterSpacing: '0.08em', marginBottom: 8 }}>
          Vloga (določi privzeta dovoljenja)
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.keys(D.rolePresets).map(r => (
            <button key={r} onClick={() => setRolePreset(r)} style={{
              padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              background: role === r ? T.header : T.surface3,
              color: role === r ? T.headerInk : T.ink,
              border: 'none', fontWeight: 700, fontSize: 12,
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Permission groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 380, overflowY: 'auto' }}>
        {D.permissionGroups.map(g => (
          <div key={g.title}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.ink, textTransform: 'uppercase',
                           letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 6,
                           borderBottom: '1px solid ' + T.line }}>
              {g.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {g.items.map(([key, label]) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                  borderRadius: 6, cursor: 'pointer',
                  background: perms[key] ? T.accentSoft : 'transparent',
                }}>
                  <input type="checkbox" checked={!!perms[key]}
                    onChange={(e) => setPerms(p => ({ ...p, [key]: e.target.checked }))}
                    style={{ accentColor: T.accent, width: 15, height: 15 }}/>
                  <span style={{ fontSize: 12, fontWeight: perms[key] ? 600 : 500,
                                  color: perms[key] ? T.accent : T.ink }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════
// AutoLock Section
// ═════════════════════════════════════════════════════════════════════
function AutoLockSection({ ctx, auth }) {
  const { T, D } = ctx;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>
        Avtomatsko zaklepanje
      </div>
      <Card T={T} title="Po kolikem času neaktivnosti naj se POS zaklene?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {D.autoLockOptions.map(opt => {
            const active = auth.autoLock === opt.ms;
            return (
              <label key={opt.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                borderRadius: 9, cursor: 'pointer',
                background: active ? T.accentSoft : T.surface2,
                border: '1px solid ' + (active ? T.accent : T.lineSoft),
              }}>
                <input type="radio" name="autolock" checked={active}
                  onChange={() => auth.setAutoLock(opt.ms)}
                  style={{ accentColor: T.accent, width: 16, height: 16 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13,
                                  color: active ? T.accent : T.ink }}>{opt.label}</div>
                </div>
                {active && <KI name="check" size={16}/>}
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: T.surface3,
                       fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          <b style={{ color: T.ink }}>Nasvet:</b> Za blagajno na recepciji priporočamo 30s.
          Kadarkoli lahko ročno zakleneš s klikom na svoj avatar zgoraj desno.
        </div>
      </Card>
    </div>
  );
}



// ================================================================
// NEXT.JS PAGE ENTRY POINT
// ================================================================
function PosPageInner() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Init globals
    if (typeof window !== 'undefined') {
      ;(window as any).React = React
      ;(window as any).POS_DATA = POS_DATA_DEMO
      ;(window as any).posHelpers = posHelpers
      ;(window as any).eur = eur
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setLoading(false)
    }
    load()
  }, [router, supabase])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d2818', display: 'flex', alignItems: 'center',
                   justifyContent: 'center', color: '#f6f1e8', fontFamily: 'system-ui', fontSize: 16 }}>
      Nalagam blagajno...
    </div>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <KlasikApp />
    </div>
  )

}

import dynamic from 'next/dynamic'
const PosPage = dynamic(() => Promise.resolve(PosPageInner), { ssr: false })
export default PosPage
