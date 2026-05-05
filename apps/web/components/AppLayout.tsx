'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'

const NAV_DEFAULT = [
  { label: 'Pregled', items: [
    { href: '/vodic', icon: '🗺️', label: 'Mesečni vodič' },
    { href: '/dashboard', icon: '▣', label: 'Dashboard' },
    { href: '/statistika', icon: '◈', label: 'Statistika' },
    { href: '/rokovnik', icon: '◷', label: 'Rokovnik' },
    { href: '/opomniki', icon: '△', label: 'Opomniki' },
    { href: '/ai', icon: '◎', label: 'AI računovodja' },
  ]},
  { label: 'Poslovanje', items: [
    { href: '/invoices/new', icon: '+', label: 'Nov račun' },
    { href: '/invoices', icon: '▤', label: 'Računi' },
    { href: '/expenses', icon: '⊡', label: 'Stroški' },
    { href: '/scan', icon: '⊙', label: 'Skeniraj račun' },
    { href: '/kpo', icon: '≡', label: 'KPO knjiga' },
    { href: '/banka', icon: '⬡', label: 'Bančni uvoz' },
    { href: '/kartice', icon: '◉', label: 'Kartice' },
  ]},
  { label: 'Davki', items: [
    { href: '/ddv', icon: '◈', label: 'DDV obračun' },
    { href: '/ddv/evidenca', icon: '▦', label: 'DDV evidenca' },
    { href: '/dohodnina', icon: '◆', label: 'Dohodnina' },
    { href: '/prispevki', icon: '▷', label: 'Prispevki QR' },
    { href: '/normirani', icon: '◑', label: 'Normirani' },
    { href: '/letni-pregled', icon: '◐', label: 'Letni pregled' },
  ]},
  { label: 'Zaposleni', items: [
    { href: '/place', icon: '◉', label: 'Plače' },
    { href: '/rek1', icon: '▦', label: 'REK-1' },
    { href: '/dopust', icon: '◷', label: 'Dopust' },
    { href: '/potni-stroski', icon: '✈', label: 'Potni stroški' },
  ]},
  { label: 'Evidenca', items: [
    { href: '/kilometrina', icon: '◱', label: 'Kilometrina' },
    { href: '/zaloga', icon: '◧', label: 'Zaloga' },
    { href: '/amortizacija', icon: '◰', label: 'Amortizacija' },
    { href: '/reprezentanca', icon: '◫', label: 'Reprezentanca' },
    { href: '/avto', icon: '◲', label: 'Službeni avto' },
  ]},
  { label: 'Blagajna', items: [
    { href: '/blagajna', icon: '▣', label: 'POS blagajna' },
    { href: '/eslog', icon: '◈', label: 'e-Račun' },
  ]},
]

const QA_DEFAULT = [
  { href: '/invoices/new', icon: '+', label: 'Nov račun' },
  { href: '/expenses', icon: '⊡', label: 'Nov strošek' },
  { href: '/scan', icon: '⊙', label: 'Skeniraj' },
  { href: '/dashboard', icon: '▣', label: 'Dashboard' },
  { href: '/blagajna', icon: '◉', label: 'Blagajna' },
  { href: '/kpo', icon: '≡', label: 'KPO knjiga' },
]

type NavItem = { href: string; icon: string; label: string }
type NavSection = { label: string; items: NavItem[] }

export default function AppLayout({ children, org }: { children: React.ReactNode; org?: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [orgData, setOrgData] = useState<any>(org || null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Nav state — hidden hrefs + section order
  const [hiddenHrefs, setHiddenHrefs] = useState<Set<string>>(new Set())
  const [sectionOrder, setSectionOrder] = useState<string[]>(NAV_DEFAULT.map(s => s.label))
  const [qaHrefs, setQaHrefs] = useState<string[]>(QA_DEFAULT.slice(0, 3).map(q => q.href))

  // Drag state
  const dragItem = useRef<{ type: 'section' | 'qa'; index: number } | null>(null)
  const dragOver = useRef<number | null>(null)

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
  } else {
    router.push('/onboarding')
    return
  }
  
  const { data: prefs } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

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

  // Build ordered sections
  const orderedNav: NavSection[] = sectionOrder
    .map(label => NAV_DEFAULT.find(s => s.label === label))
    .filter(Boolean) as NavSection[]

  // Quick action items
  const qaItems = qaHrefs
    .map(href => QA_DEFAULT.find(q => q.href === href))
    .filter(Boolean) as NavItem[]

  // All items flat for modal
  const allItems = NAV_DEFAULT.flatMap(s => s.items)

  function handleSectionDragStart(idx: number) {
    dragItem.current = { type: 'section', index: idx }
  }
  function handleSectionDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    dragOver.current = idx
  }
  function handleSectionDrop(idx: number) {
    if (!dragItem.current || dragItem.current.type !== 'section') return
    const from = dragItem.current.index
    const to = idx
    if (from === to) return
    const next = [...sectionOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setSectionOrder(next)
    dragItem.current = null
  }

  function toggleHidden(href: string) {
    setHiddenHrefs(prev => {
      const next = new Set(prev)
      next.has(href) ? next.delete(href) : next.add(href)
      return next
    })
  }

  function toggleQA(href: string) {
    setQaHrefs(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    )
  }

  function handleQaDragStart(idx: number) {
    dragItem.current = { type: 'qa', index: idx }
  }
  function handleQaDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    dragOver.current = idx
  }
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: '#F7F6F2' }}>

      {/* Sidebar */}
      <aside style={{
        background: '#0D1F12', position: 'sticky', top: 0, height: '100vh',
        overflowY: 'auto', overflowX: 'hidden', direction: 'rtl',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent',
      }}>
        <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

          {/* Logo + customize button */}
          <div style={{ padding: '20px 18px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ color: '#fff', fontSize: '17px', fontWeight: '500', letterSpacing: '-0.3px' }}>
              Knjigovodja.si
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginTop: '3px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              AI računovodja
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                marginTop: '10px', width: '100%', padding: '5px 8px',
                background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '11px',
                cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span>⚙</span> Prilagodi meni
            </button>
          </div>

          {/* Quick actions */}
          {qaItems.length > 0 && (
            <div style={{ padding: '10px 10px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '0 8px', marginBottom: '6px' }}>
                Hitre akcije
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 4px' }}>
                {qaItems.map(item => (
                  <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                      background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <span style={{ fontSize: '11px' }}>{item.icon}</span>
                      {item.label}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Nav sections (draggable) */}
          <nav style={{ flex: 1, padding: '8px 0' }}>
            {orderedNav.map((section, sIdx) => (
              <div
                key={section.label}
                draggable
                onDragStart={() => handleSectionDragStart(sIdx)}
                onDragOver={e => handleSectionDragOver(e, sIdx)}
                onDrop={() => handleSectionDrop(sIdx)}
                style={{ padding: '12px 10px 4px', cursor: 'grab' }}
              >
                <div style={{
                  fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '1.2px',
                  textTransform: 'uppercase', padding: '0 8px', marginBottom: '3px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{ opacity: 0.4 }}>⠿</span>
                  {section.label}
                </div>
                {section.items
                  .filter(item => !hiddenHrefs.has(item.href))
                  .map(item => {
                    const isActive = pathname === item.href
                    return (
                      <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 8px', borderRadius: '8px', marginBottom: '1px',
                          background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                          transition: 'background 0.1s',
                        }}>
                          <span style={{ fontSize: '12px', width: '16px', textAlign: 'center', color: isActive ? '#9FE1CB' : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                            {item.icon}
                          </span>
                          <span style={{ fontSize: '12.5px', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: isActive ? '500' : '400' }}>
                            {item.label}
                          </span>
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
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: '500', flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {orgData?.name || 'Nastavitve'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                    {orgData?.vat_registered ? 'DDV zavezanec' : 's.p.'}
                  </div>
                </div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              style={{ width: '100%', marginTop: '4px', padding: '5px 8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '11px', cursor: 'pointer', textAlign: 'left', borderRadius: '6px' }}
            >
              Odjava
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ overflowY: 'auto', minHeight: '100vh' }}>
        {children}
      </main>

      {/* MODAL */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '12px', width: '380px', maxHeight: '85vh',
            overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>Prilagodi vmesnik</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
            </div>

            {/* Quick actions */}
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #eee' }}>
              <div style={{ fontSize: '11px', fontWeight: '500', color: '#999', letterSpacing: '.05em', marginBottom: '10px' }}>HITRE AKCIJE (izberite do 6)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {QA_DEFAULT.map((item, idx) => (
                  <div
                    key={item.href}
                    draggable={qaHrefs.includes(item.href)}
                    onDragStart={() => handleQaDragStart(qaHrefs.indexOf(item.href))}
                    onDragOver={e => handleQaDragOver(e, qaHrefs.indexOf(item.href))}
                    onDrop={() => handleQaDrop(qaHrefs.indexOf(item.href))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 4px', borderRadius: '6px' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1a1a' }}>
                      <span style={{ fontSize: '13px' }}>{item.icon}</span>
                      {item.label}
                    </span>
                    <div
                      onClick={() => toggleQA(item.href)}
                      style={{
                        width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer',
                        background: qaHrefs.includes(item.href) ? '#1D9E75' : '#ddd',
                        position: 'relative', transition: 'background .2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '2px', left: qaHrefs.includes(item.href) ? '14px' : '2px',
                        width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                        transition: 'left .2s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Nav items per section */}
            {NAV_DEFAULT.map(section => (
              <div key={section.label} style={{ padding: '12px 18px', borderBottom: '0.5px solid #eee' }}>
                <div style={{ fontSize: '11px', fontWeight: '500', color: '#999', letterSpacing: '.05em', marginBottom: '8px' }}>
                  {section.label.toUpperCase()}
                </div>
                {section.items.map(item => (
                  <div key={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px', borderBottom: '0.5px solid #f5f5f5' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1a1a' }}>
                      <span style={{ fontSize: '13px' }}>{item.icon}</span>
                      {item.label}
                    </span>
                    <div
                      onClick={() => toggleHidden(item.href)}
                      style={{
                        width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer',
                        background: !hiddenHrefs.has(item.href) ? '#1D9E75' : '#ddd',
                        position: 'relative', transition: 'background .2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '2px',
                        left: !hiddenHrefs.has(item.href) ? '14px' : '2px',
                        width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                        transition: 'left .2s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Save */}
            <div style={{ padding: '14px 18px' }}>
              <button
                onClick={savePrefs}
                disabled={saving}
                style={{
                  width: '100%', padding: '9px', borderRadius: '8px',
                  background: '#1D9E75', color: '#fff', border: 'none',
                  fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Shranjujem...' : 'Shrani nastavitve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}