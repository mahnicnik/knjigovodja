'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'

const NAV_DEFAULT = [
  { label: 'Pregled', items: [
    { href: '/dashboard',   icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { href: '/vodic',       icon: 'ti-map-2',            label: 'Mesečni vodič' },
    { href: '/statistika',  icon: 'ti-chart-bar',        label: 'Statistika' },
    { href: '/rokovnik',    icon: 'ti-calendar',         label: 'Rokovnik' },
    { href: '/opomniki',    icon: 'ti-bell',             label: 'Opomniki' },
    { href: '/ai',          icon: 'ti-robot',            label: 'AI računovodja' },
  ]},
  { label: 'Poslovanje', items: [
    { href: '/stripe', icon: 'ti-brand-stripe', label: 'Stripe uvoz' },
    { href: '/invoices/new', icon: 'ti-file-plus',     label: 'Nov račun' },
    { href: '/invoices',     icon: 'ti-file-invoice',  label: 'Računi' },
    { href: '/expenses',     icon: 'ti-receipt',       label: 'Stroški' },
    { href: '/scan',         icon: 'ti-scan',          label: 'Skeniraj račun' },
    { href: '/kpo',          icon: 'ti-book',          label: 'KPO knjiga' },
    { href: '/banka',        icon: 'ti-building-bank', label: 'Bančni uvoz' },
    { href: '/kartice',      icon: 'ti-credit-card',   label: 'Kartice' },
  ]},
  { label: 'Davki', items: [
    { href: '/ddv',          icon: 'ti-percentage',       label: 'DDV obračun' },
    { href: '/ddv/evidenca', icon: 'ti-list-details',     label: 'DDV evidenca' },
    { href: '/dohodnina',    icon: 'ti-currency-euro',    label: 'Dohodnina' },
    { href: '/prispevki',    icon: 'ti-qrcode',           label: 'Prispevki QR' },
    { href: '/normirani',    icon: 'ti-calculator',       label: 'Normirani' },
    { href: '/letni-pregled',icon: 'ti-calendar-stats',   label: 'Letni pregled' },
  ]},
  { label: 'Zaposleni', items: [
    { href: '/place',        icon: 'ti-users',       label: 'Plače' },
    { href: '/rek1',         icon: 'ti-file-text',   label: 'REK-1' },
    { href: '/dopust',       icon: 'ti-umbrella',    label: 'Dopust' },
    { href: '/potni-stroski',icon: 'ti-plane',       label: 'Potni stroški' },
  ]},
  { label: 'Evidenca', items: [
    { href: '/kilometrina',  icon: 'ti-car',           label: 'Kilometrina' },
    { href: '/zaloga',       icon: 'ti-package',       label: 'Zaloga' },
    { href: '/amortizacija', icon: 'ti-trending-down', label: 'Amortizacija' },
    { href: '/reprezentanca',icon: 'ti-glass-full',    label: 'Reprezentanca' },
    { href: '/avto',         icon: 'ti-car',           label: 'Službeni avto' },
  ]},
  { label: 'Blagajna', items: [
    { href: '/blagajna', icon: 'ti-building-store', label: 'POS blagajna' },
    { href: '/eslog',    icon: 'ti-file-invoice',   label: 'e-Račun' },
  ]},
]

const QA_DEFAULT = [
  { href: '/invoices/new', icon: 'ti-file-plus',      label: 'Nov račun' },
  { href: '/expenses',     icon: 'ti-receipt',         label: 'Nov strošek' },
  { href: '/scan',         icon: 'ti-scan',            label: 'Skeniraj' },
  { href: '/dashboard',    icon: 'ti-layout-dashboard',label: 'Dashboard' },
  { href: '/blagajna',     icon: 'ti-building-store',  label: 'Blagajna' },
  { href: '/kpo',          icon: 'ti-book',            label: 'KPO knjiga' },
]

const BOTTOM_NAV = [
  { href: '/dashboard',    icon: 'ti-home',         label: 'Domov' },
  { href: '/invoices',     icon: 'ti-file-invoice', label: 'Računi' },
  { href: '/invoices/new', icon: 'ti-plus',         label: 'Nov račun', primary: true },
  { href: '/expenses',     icon: 'ti-receipt',      label: 'Stroški' },
  { href: '/ai',           icon: 'ti-robot',        label: 'AI' },
]

const ACTION_BAR = [
  { href: '/scan',      icon: 'ti-scan',      label: 'Skeniraj strošek' },
  { href: '/prispevki', icon: 'ti-qrcode',    label: 'Prispevki QR' },
  { href: '/ai',        icon: 'ti-robot',     label: 'Vprašaj AI' },
  { href: '/vodic',     icon: 'ti-map-2',     label: 'Vodič' },
]

type NavItem = { href: string; icon: string; label: string }
type NavSection = { label: string; items: NavItem[] }

function Icon({ name, style }: { name: string; style?: React.CSSProperties }) {
  return <i className={`ti ${name}`} style={style} aria-hidden="true" />
}

export default function AppLayout({ children, org }: { children: React.ReactNode; org?: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [orgData, setOrgData] = useState<any>(org || null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [hiddenHrefs, setHiddenHrefs] = useState<Set<string>>(new Set())
  const [sectionOrder, setSectionOrder] = useState<string[]>(NAV_DEFAULT.map(s => s.label))
  const [qaHrefs, setQaHrefs] = useState<string[]>(QA_DEFAULT.slice(0, 3).map(q => q.href))

  const dragItem = useRef<{ type: 'section' | 'qa'; index: number } | null>(null)
  const dragOver = useRef<number | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { setShowMobileMenu(false) }, [pathname])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      if (!org) {
        const { data: member } = await supabase
          .from('org_members').select('organizations(*)')
          .eq('user_id', user.id).single()
        if (member) {
          setOrgData((member as any).organizations)
        } else {
          const path = window.location.pathname
          if (!path.startsWith('/onboarding') && !path.startsWith('/login') && !path.startsWith('/register')) {
            router.push('/onboarding')
          }
          return
        }
      }

      const { data: prefs } = await supabase
        .from('user_preferences').select('*')
        .eq('user_id', user.id).single()

      if (prefs) {
        if (prefs.nav_hidden) setHiddenHrefs(new Set(prefs.nav_hidden))
        if (prefs.nav_order) setSectionOrder(prefs.nav_order)
        if (prefs.quick_actions) setQaHrefs(prefs.quick_actions)
      }
    }
    load()
  }, [])

  async function savePrefs() {
    if (!userId) return
    setSaving(true)
    await supabase.from('user_preferences').upsert({
      user_id: userId,
      nav_hidden: Array.from(hiddenHrefs),
      nav_order: sectionOrder,
      quick_actions: qaHrefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    setShowModal(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = orgData?.name
    ? orgData.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'SP'

  const orderedNav: NavSection[] = sectionOrder
    .map(label => NAV_DEFAULT.find(s => s.label === label))
    .filter(Boolean) as NavSection[]

  const qaItems = qaHrefs
    .map(href => QA_DEFAULT.find(q => q.href === href))
    .filter(Boolean) as NavItem[]

  function handleSectionDragStart(idx: number) { dragItem.current = { type: 'section', index: idx } }
  function handleSectionDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); dragOver.current = idx }
  function handleSectionDrop(idx: number) {
    if (!dragItem.current || dragItem.current.type !== 'section') return
    const from = dragItem.current.index
    if (from === idx) return
    const next = [...sectionOrder]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    setSectionOrder(next)
    dragItem.current = null
  }
  function toggleHidden(href: string) {
    setHiddenHrefs(prev => { const next = new Set(prev); next.has(href) ? next.delete(href) : next.add(href); return next })
  }
  function toggleQA(href: string) {
    setQaHrefs(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href])
  }
  function handleQaDragStart(idx: number) { dragItem.current = { type: 'qa', index: idx } }
  function handleQaDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); dragOver.current = idx }
  function handleQaDrop(idx: number) {
    if (!dragItem.current || dragItem.current.type !== 'qa') return
    const from = dragItem.current.index
    if (from === idx) return
    const next = [...qaHrefs]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    setQaHrefs(next)
    dragItem.current = null
  }

  const sidebarContent = (
    <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#fff', fontSize: '17px', fontWeight: '500', letterSpacing: '-0.3px' }}>Knjigovodja.si</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginTop: '3px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>AI računovodja</div>
        </div>
        {isMobile && (
          <button onClick={() => setShowMobileMenu(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>✕</button>
        )}
      </div>

      {/* Prilagodi gumb */}
      <div style={{ padding: '10px 18px 0' }}>
        <button onClick={() => setShowModal(true)} style={{
          width: '100%', padding: '5px 8px',
          background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '11px',
          cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Icon name="ti-settings" style={{ fontSize: '13px' }} /> Prilagodi meni
        </button>
      </div>

      {/* Quick actions */}
      {qaItems.length > 0 && (
        <div style={{ padding: '10px 10px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', marginTop: '8px' }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '0 8px', marginBottom: '6px' }}>Hitre akcije</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 4px' }}>
            {qaItems.map(item => (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Icon name={item.icon} style={{ fontSize: '13px' }} />{item.label}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {orderedNav.map((section, sIdx) => (
          <div key={section.label} draggable onDragStart={() => handleSectionDragStart(sIdx)} onDragOver={e => handleSectionDragOver(e, sIdx)} onDrop={() => handleSectionDrop(sIdx)} style={{ padding: '12px 10px 4px', cursor: 'grab' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '0 8px', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ opacity: 0.4 }}>⠿</span>{section.label}
            </div>
            {section.items.filter(item => !hiddenHrefs.has(item.href)).map(item => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', marginBottom: '1px', background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent', transition: 'background 0.1s' }}>
                    <Icon name={item.icon} style={{ fontSize: '15px', width: '16px', textAlign: 'center', color: isActive ? '#9FE1CB' : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12.5px', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: isActive ? '500' : '400' }}>{item.label}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        ))}
        <div style={{ height: '8px' }} />
      </nav>

      {/* User */}
      <div style={{ padding: '12px', borderTop: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Link href="/nastavitve" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: '500', flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgData?.name || 'Nastavitve'}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{orgData?.vat_registered ? 'DDV zavezanec' : 's.p.'}</div>
            </div>
          </div>
        </Link>
        <button onClick={handleLogout} style={{ width: '100%', marginTop: '4px', padding: '5px 8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '11px', cursor: 'pointer', textAlign: 'left', borderRadius: '6px' }}>Odjava</button>
      </div>
    </div>
  )

  return (
    <>
      {/* DESKTOP LAYOUT */}
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: '#F7F6F2' }}>
          <aside style={{ background: '#0D1F12', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overflowX: 'hidden', direction: 'rtl', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
            {sidebarContent}
          </aside>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <main style={{ flex: 1 }}>{children}</main>

            {/* Sticky action bar */}
            <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, position: 'sticky', bottom: 0 }}>
              <span style={{ fontSize: '11px', color: '#aaa', marginRight: '4px' }}>Hitro:</span>
              {ACTION_BAR.map(item => (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', border: '0.5px solid rgba(0,0,0,0.1)', background: '#fff', color: '#444', cursor: 'pointer' }}>
                    <Icon name={item.icon} style={{ fontSize: '15px', color: '#666' }} />
                    {item.label}
                  </div>
                </Link>
              ))}
              <div style={{ flex: 1 }} />
              <Link href="/invoices/new" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', background: '#0D1F12', color: '#fff', cursor: 'pointer' }}>
                  <Icon name="ti-file-plus" style={{ fontSize: '16px' }} />
                  Nov račun
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE LAYOUT */}
      {isMobile && (
        <div style={{ minHeight: '100vh', background: '#F7F6F2', paddingBottom: '64px' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0D1F12', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Knjigovodja.si</div>
            <button onClick={() => setShowMobileMenu(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <Icon name="ti-menu-2" style={{ fontSize: '22px', color: '#fff' }} />
            </button>
          </div>

          <main>{children}</main>

          {showMobileMenu && (
            <>
              <div onClick={() => setShowMobileMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
              <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '280px', background: '#0D1F12', zIndex: 101, overflowY: 'auto' }}>
                {sidebarContent}
              </div>
            </>
          )}

          {/* Bottom navigation */}
          <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {BOTTOM_NAV.map(item => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: (item as any).primary ? '8px 0' : '10px 0', gap: '3px' }}>
                    {(item as any).primary ? (
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#0D1F12', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-16px', border: '3px solid #F7F6F2' }}>
                        <Icon name="ti-plus" style={{ fontSize: '20px', color: '#9FE1CB' }} />
                      </div>
                    ) : (
                      <>
                        <Icon name={item.icon} style={{ fontSize: '20px', color: isActive ? '#0D1F12' : '#aaa' }} />
                        <span style={{ fontSize: '10px', color: isActive ? '#0D1F12' : '#aaa', fontWeight: isActive ? '500' : '400' }}>{item.label}</span>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '380px', maxHeight: '85vh', overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>Prilagodi vmesnik</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #eee' }}>
              <div style={{ fontSize: '11px', fontWeight: '500', color: '#999', letterSpacing: '.05em', marginBottom: '10px' }}>HITRE AKCIJE (izberite do 6)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {QA_DEFAULT.map((item) => (
                  <div key={item.href} draggable={qaHrefs.includes(item.href)} onDragStart={() => handleQaDragStart(qaHrefs.indexOf(item.href))} onDragOver={e => handleQaDragOver(e, qaHrefs.indexOf(item.href))} onDrop={() => handleQaDrop(qaHrefs.indexOf(item.href))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 4px', borderRadius: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1a1a' }}>
                      <Icon name={item.icon} style={{ fontSize: '15px', color: '#666' }} />{item.label}
                    </span>
                    <div onClick={() => toggleQA(item.href)} style={{ width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer', background: qaHrefs.includes(item.href) ? '#1D9E75' : '#ddd', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: qaHrefs.includes(item.href) ? '14px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {NAV_DEFAULT.map(section => (
              <div key={section.label} style={{ padding: '12px 18px', borderBottom: '0.5px solid #eee' }}>
                <div style={{ fontSize: '11px', fontWeight: '500', color: '#999', letterSpacing: '.05em', marginBottom: '8px' }}>{section.label.toUpperCase()}</div>
                {section.items.map(item => (
                  <div key={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px', borderBottom: '0.5px solid #f5f5f5' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1a1a' }}>
                      <Icon name={item.icon} style={{ fontSize: '15px', color: '#666' }} />{item.label}
                    </span>
                    <div onClick={() => toggleHidden(item.href)} style={{ width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer', background: !hiddenHrefs.has(item.href) ? '#1D9E75' : '#ddd', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: !hiddenHrefs.has(item.href) ? '14px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ padding: '14px 18px' }}>
              <button onClick={savePrefs} disabled={saving} style={{ width: '100%', padding: '9px', borderRadius: '8px', background: '#1D9E75', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Shranjujem...' : 'Shrani nastavitve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
