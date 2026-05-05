'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'

const NAV = [
  {
    label: 'Pregled',
    items: [
      { href: '/vodic', icon: '🗺️', label: 'Mesečni vodič' },
      { href: '/dashboard', icon: '▣', label: 'Dashboard' },
      { href: '/statistika', icon: '◈', label: 'Statistika' },
      { href: '/rokovnik', icon: '◷', label: 'Rokovnik' },
      { href: '/opomniki', icon: '△', label: 'Opomniki' },
      { href: '/ai', icon: '◎', label: 'AI računovodja' },
    ],
  },
  {
    label: 'Poslovanje',
    items: [
      { href: '/invoices/new', icon: '+', label: 'Nov račun' },
      { href: '/invoices', icon: '▤', label: 'Računi' },
      { href: '/expenses', icon: '⊡', label: 'Stroški' },
      { href: '/scan', icon: '⊙', label: 'Skeniraj račun' },
      { href: '/kpo', icon: '≡', label: 'KPO knjiga' },
      { href: '/banka', icon: '⬡', label: 'Bančni uvoz' },
      { href: '/kartice', icon: '◉', label: 'Kartice' },
    ],
  },
  {
    label: 'Davki',
    items: [
      { href: '/ddv', icon: '◈', label: 'DDV obračun' },
      { href: '/ddv/evidenca', icon: '▦', label: 'DDV evidenca' },
      { href: '/dohodnina', icon: '◆', label: 'Dohodnina' },
      { href: '/prispevki', icon: '▷', label: 'Prispevki QR' },
      { href: '/normirani', icon: '◑', label: 'Normirani' },
      { href: '/letni-pregled', icon: '◐', label: 'Letni pregled' },
    ],
  },
  {
    label: 'Zaposleni',
    items: [
      { href: '/place', icon: '◉', label: 'Plače' },
      { href: '/rek1', icon: '▦', label: 'REK-1' },
      { href: '/dopust', icon: '◷', label: 'Dopust' },
      { href: '/potni-stroski', icon: '✈', label: 'Potni stroški' },
    ],
  },
  {
    label: 'Evidenca',
    items: [
      { href: '/kilometrina', icon: '◱', label: 'Kilometrina' },
      { href: '/zaloga', icon: '◧', label: 'Zaloga' },
      { href: '/amortizacija', icon: '◰', label: 'Amortizacija' },
      { href: '/reprezentanca', icon: '◫', label: 'Reprezentanca' },
      { href: '/avto', icon: '◲', label: 'Službeni avto' },
    ],
  },
  {
    label: 'Blagajna',
    items: [
      { href: '/blagajna', icon: '▣', label: 'POS blagajna' },
      { href: '/eslog', icon: '◈', label: 'e-Račun' },
    ],
  },
]

export default function AppLayout({ children, org }: { children: React.ReactNode; org?: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [orgData, setOrgData] = useState<any>(org || null)

  useEffect(() => {
    if (!org) {
      async function load() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: member } = await supabase
          .from('org_members').select('organizations(*)')
          .eq('user_id', user.id).single()
        if (member) setOrgData((member as any).organizations)
      }
      load()
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = orgData?.name
    ? orgData.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'SP'

  return (
    <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', minHeight:'100vh', background:'#F7F6F2' }}>

      {/* Sidebar — direction:rtl premakne scrollbar na levo */}
      <aside style={{
        background: '#0D1F12',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        direction: 'rtl',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.12) transparent',
      }}>
        {/* Wrapper vrne direction nazaj na ltr */}
        <div style={{ direction:'ltr', display:'flex', flexDirection:'column', minHeight:'100%' }}>

          {/* Logo */}
          <div style={{ padding:'20px 18px 16px', borderBottom:'0.5px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
            <div style={{ color:'#fff', fontSize:'17px', fontWeight:'500', letterSpacing:'-0.3px' }}>
              Knjigovodja.si
            </div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'10px', marginTop:'3px', letterSpacing:'0.8px', textTransform:'uppercase' }}>
              AI računovodja
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:'8px 0' }}>
            {NAV.map(section => (
              <div key={section.label} style={{ padding:'12px 10px 4px' }}>
                <div style={{ fontSize:'9px', color:'rgba(255,255,255,0.25)', letterSpacing:'1.2px', textTransform:'uppercase', padding:'0 8px', marginBottom:'3px' }}>
                  {section.label}
                </div>
                {section.items.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                      <div style={{
                        display:'flex', alignItems:'center', gap:'8px',
                        padding:'6px 8px', borderRadius:'8px', marginBottom:'1px',
                        background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                        transition: 'background 0.1s',
                      }}>
                        <span style={{ fontSize:'12px', width:'16px', textAlign:'center', color: isActive ? '#9FE1CB' : 'rgba(255,255,255,0.35)', flexShrink:0 }}>
                          {item.icon}
                        </span>
                        <span style={{ fontSize:'12.5px', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: isActive ? '500' : '400' }}>
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ))}
            <div style={{ height:'8px' }} />
          </nav>

          {/* User */}
          <div style={{ padding:'12px', borderTop:'0.5px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
            <Link href="/nastavitve" style={{ textDecoration:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderRadius:'8px' }}>
                <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'#fff', fontWeight:'500', flexShrink:0 }}>
                  {initials}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.75)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {orgData?.name || 'Nastavitve'}
                  </div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.3)' }}>
                    {orgData?.vat_registered ? 'DDV zavezanec' : 's.p.'}
                  </div>
                </div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              style={{ width:'100%', marginTop:'4px', padding:'5px 8px', background:'transparent', border:'none', color:'rgba(255,255,255,0.2)', fontSize:'11px', cursor:'pointer', textAlign:'left', borderRadius:'6px' }}
            >
              Odjava
            </button>
          </div>

        </div>
      </aside>

      {/* Main content */}
      <main style={{ overflowY:'auto', minHeight:'100vh' }}>
        {children}
      </main>

    </div>
  )
}