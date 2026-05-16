'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import HowTo from '@/components/HowTo'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export default function ApiPage() {
  const router = useRouter()
  const supabase = createClient()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null) // Prikaže se samo enkrat
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: member } = await supabase
        .from('org_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
      if (!member || !['owner', 'admin'].includes(member.role)) {
        router.push('/dashboard')
        return
      }

      const { data } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, is_active, last_used_at, created_at')
        .order('created_at', { ascending: false })

      setKeys(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function generateKey() {
    if (!newKeyName.trim()) { showToast('Vnesite ime ključa'); return }
    setGenerating(true)

    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setNewKey(data.key) // Prikaže se samo enkrat
      setNewKeyName('')

      // Reload keys
      const { data: keysData } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, is_active, last_used_at, created_at')
        .order('created_at', { ascending: false })
      setKeys(keysData ?? [])

    } catch (e: any) {
      showToast(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Deaktiviram ta API ključ? Vse integracije ki ga uporabljajo bodo prenehale delovati.')) return
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k))
    showToast('API ključ deaktiviran')
  }

  async function deleteKey(id: string) {
    if (!confirm('Izbrišem ta API ključ? To je nepovratno.')) return
    await supabase.from('api_keys').delete().eq('id', id)
    setKeys(prev => prev.filter(k => k.id !== id))
    showToast('API ključ izbrisan')
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <Link href="/nastavitve" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Nastavitve</Link>
          <h1 style={{ fontSize: 26, fontWeight: 500, color: '#0D1F12', margin: '8px 0 4px' }}>API vmesnik</h1>
          <div style={{ fontSize: 14, color: '#888' }}>Povežite zunanje sisteme z Računko prek REST API</div>
        </div>

        {/* NOVI KLJUČ ALERT */}
        {newKey && (
          <div style={{ background: '#0D1F12', borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#E8B547', fontWeight: 700, marginBottom: 8 }}>⚠️ Shranite ključ zdaj — ne bo prikazan več!</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 12, color: '#fff', wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(255,255,255,0.08)', padding: '10px 12px', borderRadius: 8 }}>
                {newKey}
              </code>
              <button onClick={() => copyKey(newKey)} style={{ background: copied ? '#1D9E75' : '#E8B547', color: '#0D1F12', border: 0, borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {copied ? '✓ Kopirano' : '📋 Kopiraj'}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} style={{ marginTop: 12, background: 'none', border: 0, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
              Shranil sem ključ — zapri
            </button>
          </div>
        )}

        {/* GENERIRAJ KLJUČ */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>Generiraj API ključ</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generateKey()}
              placeholder="Ime ključa (npr. WooCommerce, Moj sistem...)"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }}
            />
            <button onClick={generateKey} disabled={generating || !newKeyName.trim()} style={{
              background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8,
              padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: (generating || !newKeyName.trim()) ? 0.4 : 1, flexShrink: 0,
            }}>
              {generating ? 'Generiram...' : '+ Generiraj'}
            </button>
          </div>
        </div>

        {/* OBSTOJEČI KLJUČI */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>
            API ključi ({keys.length})
          </div>
          {keys.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              Ni API ključev — generirajte prvega zgoraj
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.map(k => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#F7F6F2', borderRadius: 10, opacity: k.is_active ? 1 : 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{k.name}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2, fontFamily: 'monospace' }}>
                      {k.key_prefix}••••••••
                      {k.last_used_at ? ` · Zadnja uporaba: ${new Date(k.last_used_at).toLocaleDateString('sl-SI')}` : ' · Še ni bila uporabljena'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, background: k.is_active ? '#E1F5EE' : '#F3F4F6', color: k.is_active ? '#0E5E3B' : '#888', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
                    {k.is_active ? 'Aktiven' : 'Deaktiviran'}
                  </div>
                  {k.is_active && (
                    <button onClick={() => revokeKey(k.id)} style={{ background: 'none', border: 0, color: '#D97706', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>Deaktiviraj</button>
                  )}
                  <button onClick={() => deleteKey(k.id)} style={{ background: 'none', border: 0, color: '#DC2626', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>Briši</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API DOKUMENTACIJA */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 16 }}>📚 API Dokumentacija</div>

          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Base URL</div>
          <code style={{ display: 'block', fontSize: 12, background: '#F7F6F2', padding: '8px 12px', borderRadius: 8, marginBottom: 20, fontFamily: 'monospace' }}>
            https://racunko.si/api/v1
          </code>

          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avtentikacija</div>
          <code style={{ display: 'block', fontSize: 12, background: '#F7F6F2', padding: '8px 12px', borderRadius: 8, marginBottom: 20, fontFamily: 'monospace' }}>
            Authorization: Bearer rk_live_xxxxxx
          </code>

          {[
            {
              method: 'GET', path: '/invoices', desc: 'Seznam izdanih računov',
              params: 'page, limit, status, from, to',
            },
            {
              method: 'POST', path: '/invoices', desc: 'Ustvari nov račun',
              params: 'client_name*, issue_date*, due_date*, line_items*',
            },
            {
              method: 'GET', path: '/receipts', desc: 'Seznam prejetih računov',
              params: 'page, limit, from, to, category',
            },
            {
              method: 'GET', path: '/stats', desc: 'Finančne statistike',
              params: 'year, month',
            },
          ].map(ep => (
            <div key={ep.path} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div style={{ width: 48, flexShrink: 0 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRadius: 4,
                  background: ep.method === 'GET' ? '#E1F5EE' : '#EDE9FE',
                  color: ep.method === 'GET' ? '#0E5E3B' : '#5B21B6',
                }}>{ep.method}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', fontWeight: 600 }}>{ep.path}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{ep.desc}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, fontFamily: 'monospace' }}>{ep.params}</div>
              </div>
            </div>
          ))}
        </div>

        {/* HOWTO */}
        <HowTo
          title="Kako uporabim API?"
          steps={[
            { icon: '🔑', title: 'Generirajte API ključ', desc: 'Kliknite "+ Generiraj" zgoraj, vnesite ime in shranite ključ — prikaže se samo enkrat.' },
            { icon: '📡', title: 'Pošljite HTTP request', desc: 'Dodajte ključ v Authorization header vsakega klica.', code: 'curl https://racunko.si/api/v1/stats -H "Authorization: Bearer rk_live_..."', copyable: true },
            { icon: '📄', title: 'Prejmete JSON odgovor', desc: 'Vsak odgovor ima format: { success: true, data: [...], meta: { page, total } }' },
            { icon: '🔒', title: 'Varnost', desc: 'Ključa nikoli ne delite javno. Če je kompromitiran, ga takoj deaktivirajte in generirajte novega.' },
          ]}
          tip="Za testiranje priporočamo Postman ali Insomnia — brezplačni API klienti."
        />

      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
