'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CHECKLIST = [
  {
    id: 'profil',
    icon: '🏢',
    title: 'Dopolnite profil podjetja',
    desc: 'Dodajte davčno številko, IBAN in naslov za račune.',
    href: '/nastavitve',
    required: true,
  },
  {
    id: 'racun',
    icon: '📄',
    title: 'Ustvarite prvi račun',
    desc: 'Preizkusite fakturiranje in pošljite PDF stranki.',
    href: '/invoices/new',
    required: true,
  },
  {
    id: 'prispevki',
    icon: '💰',
    title: 'Preverite prispevke s.p.',
    desc: 'Preglejte UPN QR kode za ZPIZ, ZZZS in ostale prispevke.',
    href: '/prispevki',
    required: false,
  },
  {
    id: 'narocnina',
    icon: '⭐',
    title: 'Izberite paket',
    desc: 'Nadgradite na Pro ali Pro+POS za neomejene funkcije.',
    href: '/nastavitve#narocnina',
    required: false,
  },
  {
    id: 'blagajna',
    icon: '🖥️',
    title: 'Nastavite davčno blagajno',
    desc: 'Naložite FURS certifikat za fiskalizacijo računov.',
    href: '/nastavitve/blagajna',
    required: false,
  },
]

export default function DobrodosliPage() {
  const [done, setDone] = useState<string[]>([])
  const [org, setOrg] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('org_members').select('organizations(*)')
        .eq('user_id', user.id).maybeSingle()
      if (member) setOrg((member as any).organizations)

      // Naloži shranjene done items
      const saved = localStorage.getItem('rk_onboarding_done')
      if (saved) setDone(JSON.parse(saved))
    }
    load()
  }, [])

  function toggleDone(id: string) {
    const next = done.includes(id) ? done.filter(d => d !== id) : [...done, id]
    setDone(next)
    localStorage.setItem('rk_onboarding_done', JSON.stringify(next))
  }

  const progress = Math.round((done.length / CHECKLIST.length) * 100)
  const isProPos = org?.subscription_status === 'pro_pos'
  const isPro = org?.subscription_status === 'pro' || isProPos

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0D1F12', marginBottom: 6 }}>
            Dobrodošli{org?.name ? `, ${org.name}` : ''}!
          </div>
          <div style={{ fontSize: 14, color: '#888' }}>
            Računko je pripravljen. Sledite korakom za popolno nastavitev.
          </div>
        </div>

        {/* Progress */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>Napredek nastavitve</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75' }}>{progress}%</div>
          </div>
          <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#1D9E75', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {CHECKLIST.map(item => {
            const isDone = done.includes(item.id)
            // Skrij blagajna če ni Pro
            if (item.id === 'blagajna' && !isPro) return null
            return (
              <div key={item.id} style={{
                background: '#fff', borderRadius: 14,
                border: `1px solid ${isDone ? '#bbf7d0' : '#f0f0f0'}`,
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: isDone ? 0.7 : 1,
                transition: 'all 0.2s',
              }}>
                <button
                  onClick={() => toggleDone(item.id)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none', flexShrink: 0,
                    background: isDone ? '#1D9E75' : '#f3f4f6', color: isDone ? '#fff' : '#ccc',
                    cursor: 'pointer', fontSize: 14, display: 'grid', placeItems: 'center',
                  }}
                >
                  {isDone ? '✓' : '○'}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.icon} {item.title}
                    {item.required && <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>obvezno</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>{item.desc}</div>
                </div>
                <Link href={item.href} style={{ fontSize: 12, color: '#1D9E75', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Odpri →
                </Link>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <Link href="/dashboard" style={{
            background: '#0D1F12', color: '#fff', padding: '14px 32px',
            borderRadius: 12, fontWeight: 600, fontSize: 15, textDecoration: 'none',
            display: 'inline-block',
          }}>
            Pojdi na dashboard →
          </Link>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>
            Checklist je dostopen kadarkoli v Nastavitvah
          </div>
        </div>
      </div>
    </div>
  )
}
