'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { imaPos } from '@/lib/paket'
import { velikostMB, type StanjePrenosov } from '@/lib/prenosi'

export default function DownloadPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // POPRAVLJENO (15.10.2026): podatke o izdajah da streznik (/api/prenosi),
  // gumba pa vodita na /api/prenosi/windows in /api/prenosi/android.
  // Prej je brskalnik stranke klical GitHub API in APK iskal v Windows
  // izdaji, kjer ga ni - Android gumb je bil href="#" (lib/prenosi.ts).
  const [stanje, setStanje] = useState<StanjePrenosov | null>(null)
  const [androidManjka, setAndroidManjka] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

      if (member) {
        setOrg((member as any).organizations)
      }

      try {
        const res = await fetch('/api/prenosi')
        if (res.ok) setStanje(await res.json())
      } catch {}
      try {
        setAndroidManjka(new URLSearchParams(window.location.search).get('ni') === 'android')
      } catch {}

      setLoading(false)
    }
    load()
  }, [])

  // Enako pravilo kot povsod drugod (lib/paket.ts) - za obstojece
  // organizacije je to isto kot prej `subscription_status === 'pro_pos'`.
  const isProPos = imaPos(org)

  const win = stanje?.windows ?? null
  const android = stanje?.android ?? null
  // Ce streznik GitHuba ni dosegel (stanje null), gumb za Windows vseeno
  // pokazemo: /api/prenosi/windows ima rezervo (stran zadnje izdaje).
  const winNaVoljo = !stanje || !!win
  const androidNaVoljo = !!android && !androidManjka

  if (loading) return (
    <AppLayout>
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f9fafb' }}>
      <div style={{ color: '#888', fontSize: 14 }}>Nalagam...</div>
    </div>
    </AppLayout>
  )

  return (
    <AppLayout org={org}>
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
              Aplikaciji za Windows in Android sta na voljo v paketu Pro + POS.
            </div>
            <Link href="/nastavitve#narocnina" style={{ background: '#1D9E75', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, textDecoration: 'none', display: 'inline-block' }}>
              Nadgradi na Pro + POS — 29,99 €/mes →
            </Link>
          </div>
        ) : (
          // Pro+POS — pokaži downloade
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>
              Računko POS
            </div>

            {/* Windows */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 36 }}>🪟</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>Windows</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                      Windows 10 / 11 · 64-bit · .exe
                      {win && <> · v{win.verzija}</>}
                      {velikostMB(win?.velikost) && <> · {velikostMB(win?.velikost)}</>}
                    </div>
                  </div>
                </div>
                {winNaVoljo ? (
                  <a href="/api/prenosi/windows" style={{ background: '#0D1F12', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    ⬇ Prenesi
                  </a>
                ) : (
                  <span style={{ color: '#888', fontSize: 13 }}>Trenutno ni na voljo</span>
                )}
              </div>
              {/* Namestitev ni digitalno podpisana - brskalnik in SmartScreen jo
                  zato ob prvem prenosu zadrzita. Brez tega namiga stranka misli,
                  da prenos "ne dela" (15.10.2026). */}
              <div style={{ fontSize: 12, color: '#888', marginTop: 14, lineHeight: 1.6 }}>
                Če brskalnik datoteko zadrži, izberite <strong>Obdrži</strong>. Če Windows ob zagonu pokaže
                »Windows je zaščitil vaš računalnik«, kliknite <strong>Več informacij</strong> → <strong>Vseeno zaženi</strong>.
              </div>
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

            {/* Android */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 36 }}>📱</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>Android</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                      Android 8.0+ · .apk
                      {android?.verzija && <> · v{android.verzija}</>}
                      {velikostMB(android?.velikost) && <> · {velikostMB(android?.velikost)}</>}
                    </div>
                  </div>
                </div>
                {androidNaVoljo ? (
                  <a href="/api/prenosi/android" style={{ background: '#0D1F12', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    ⬇ Prenesi APK
                  </a>
                ) : (
                  <span style={{ color: '#888', fontSize: 13 }}>Trenutno ni na voljo</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 14, lineHeight: 1.6 }}>
                Prenesite na telefonu in odprite preneseno datoteko. Ko telefon vpraša, dovolite nameščanje
                iz tega vira (brskalnika). iOS: prihaja kmalu.
              </div>
            </div>

            {/* Navodila */}
            <div style={{ background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0', padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>💡 Navodila za namestitev</div>
              <ol style={{ fontSize: 13, color: '#166534', paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
                <li>Prenesite namestitveno datoteko za vašo napravo</li>
                <li>Zaženite jo in sledite navodilom</li>
                <li>Ob prvem zagonu se prijavite z vašimi Računko podatki</li>
                <li>Aplikacija za Windows se posodablja sama</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
