'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

export default function DownloadPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [release, setRelease] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

      if (member) {
        setOrg((member as any).organizations)
      }

      // Pridobi latest release iz GitHub
      try {
        const res = await fetch('https://api.github.com/repos/mahnicnik/knjigovodja/releases/latest')
        const data = await res.json()
        setRelease(data)
      } catch {}

      setLoading(false)
    }
    load()
  }, [])

  const isProPos = org?.subscription_status === 'pro_pos'

  const winUrl = release?.assets?.find((a: any) => a.name.endsWith('.exe'))?.browser_download_url
  const version = release?.tag_name || 'v1.0.21'

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f9fafb' }}>
      <div style={{ color: '#888', fontSize: 14 }}>Nalagam...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/dashboard" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Domov</Link>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12', marginTop: 2 }}>⬇️ Prenosi</div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
        {!isProPos ? (
          // Ni Pro+POS — pokaži upgrade CTA
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0', padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>Računko POS Desktop</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Desktop aplikacija je na voljo za uporabnike paketa Pro + POS. Vključuje Windows in Mac verzijo blagajne.
            </div>
            <Link href="/nastavitve#narocnina" style={{ background: '#1D9E75', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, textDecoration: 'none', display: 'inline-block' }}>
              Nadgradi na Pro + POS — €24.99/mes →
            </Link>
          </div>
        ) : (
          // Pro+POS — pokaži downloade
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>
              Računko POS Desktop <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>{version}</span>
            </div>

            {/* Windows */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 36 }}>🪟</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>Windows</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Windows 10 / 11 · 64-bit · .exe installer</div>
                </div>
              </div>
              {winUrl ? (
                <a href={winUrl} style={{ background: '#0D1F12', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  ⬇ Prenesi
                </a>
              ) : (
                <span style={{ color: '#888', fontSize: 13 }}>Ni na voljo</span>
              )}
            </div>

            {/* Mac */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 36 }}>🍎</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>Mac</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>macOS · Zaženi iz izvorne kode</div>
                </div>
              </div>
              <a href="https://github.com/mahnicnik/knjigovodja/blob/main/ZACNI-TUKAJ.md" target="_blank" rel="noopener noreferrer" style={{ background: '#f3f4f6', color: '#0D1F12', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                📖 Navodila
              </a>
            </div>

            {/* Mobile */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 36 }}>📱</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>Mobilna aplikacija</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>iOS & Android · Prihaja kmalu</div>
                </div>
              </div>
              <a href={release?.assets?.find((a: any) => a.name.endsWith('.apk'))?.browser_download_url || '#'}
                style={{ display: 'inline-block', background: '#0D1F12', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                ⬇ Prenesi APK
              </a>
              <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                Android 8.0+ · Omogočite nameščanje iz neznanih virov v nastavitvah
              </div>
            </div>

            {/* Navodila */}
            <div style={{ background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0', padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>💡 Navodila za namestitev</div>
              <ol style={{ fontSize: 13, color: '#166534', paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
                <li>Prenesite installer za vaš operacijski sistem</li>
                <li>Zaženite installer in sledite navodilom</li>
                <li>Ob prvem zagonu se prijavite z vašimi Računko podatki</li>
                <li>Aplikacija se bo samodejno posodabljala</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
