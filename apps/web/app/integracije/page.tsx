'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import HowTo from '@/components/HowTo'
import { getActiveMembership } from '@/lib/active-org'

interface Integration {
  id: string
  type: 'woocommerce' | 'shopify' | 'stripe'
  is_active: boolean
  settings: {
    shop_url?: string
    shop_name?: string
  }
  webhook_secret: string
  created_at: string
}

export default function IntegrationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // WooCommerce form
  // DODANO (30.7.2026, audit - varnostna najdba): webhook skrivnosti so
  // bile prikazane v celoti, v navadnem besedilu. Zdaj privzeto skrite.
  function maskSecret(secret: string): string {
    if (!secret) return ''
    return '•'.repeat(Math.max(0, secret.length - 4)) + secret.slice(-4)
  }
  const [showWcSecret, setShowWcSecret] = useState(false)
  const [showShSecret, setShowShSecret] = useState(false)
  const [showStrSecret, setShowStrSecret] = useState(false)

  const [wcModal, setWcModal] = useState(false)
  const [wcUrl, setWcUrl] = useState('')
  const [wcSecret, setWcSecret] = useState('')

  // Shopify form
  const [shModal, setShModal] = useState(false)
  const [shUrl, setShUrl] = useState('')
  const [shSecret, setShSecret] = useState('')
  // Stripe form
  const [strModal, setStrModal] = useState(false)
  const [strSecret, setStrSecret] = useState('')

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  function generateSecret() {
    return Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)

      const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('org_id', member.org_id)
        .order('created_at')

      setIntegrations(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function saveIntegration(type: 'woocommerce' | 'shopify' | 'stripe', shopUrl: string, secret: string) {
    if (!orgId) return
    if (type !== 'stripe' && !shopUrl.trim()) { showToast('error', 'URL trgovine je obvezen'); return }

    setSaving(true)
    try {
      const existing = integrations.find(i => i.type === type)
      const settings = type === 'stripe' ? {} : { shop_url: shopUrl.trim() }

      if (existing) {
        await supabase.from('integrations').update({
          settings,
          webhook_secret: secret,
          is_active: true,
        }).eq('id', existing.id)
      } else {
        await supabase.from('integrations').insert({
          org_id: orgId,
          type,
          settings,
          webhook_secret: secret,
          is_active: true,
        })
      }

      const { data } = await supabase
        .from('integrations').select('*').eq('org_id', orgId).order('created_at')
      setIntegrations(data ?? [])

      if (type === 'woocommerce') setWcModal(false)
      if (type === 'shopify') setShModal(false)
      if (type === 'stripe') setStrModal(false)
      showToast('success', `${type === 'woocommerce' ? 'WooCommerce' : type === 'shopify' ? 'Shopify' : 'Stripe'} integracija shranjena`)
    } catch (e: any) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleIntegration(id: string, isActive: boolean) {
    await supabase.from('integrations').update({ is_active: !isActive }).eq('id', id)
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, is_active: !isActive } : i))
  }

  async function deleteIntegration(id: string, type: string) {
    if (!confirm(`Izbrišem ${type} integracijo?`)) return
    await supabase.from('integrations').delete().eq('id', id)
    setIntegrations(prev => prev.filter(i => i.id !== id))
    showToast('success', 'Integracija izbrisana')
  }

  const webhookBaseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks`
    : 'https://racunko.si/api/webhooks'

  const wcIntegration = integrations.find(i => i.type === 'woocommerce')
  const shIntegration = integrations.find(i => i.type === 'shopify')
  const strIntegration = integrations.find(i => i.type === 'stripe')

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>
  )

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13,
    outline: 'none', fontFamily: 'monospace',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <Link href="/nastavitve" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Nastavitve</Link>
          <h1 style={{ fontSize: 26, fontWeight: 500, color: '#0D1F12', margin: '8px 0 4px' }}>Integracije</h1>
          <div style={{ fontSize: 14, color: '#888' }}>Povežite svojo spletno trgovino z Računko</div>
        </div>

        {/* INFO */}
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#0E5E3B', lineHeight: 1.6 }}>
          💡 Ko stranka plača v vaši spletni trgovini → Računko <strong>avtomatsko izda račun</strong> in doda vnos v knjigo prihodkov. Brez ročnega dela.
        </div>

        {/* WOOCOMMERCE */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: wcIntegration ? 16 : 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#7F54B3', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>🛒</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12' }}>WooCommerce</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>WordPress spletna trgovina</div>
            </div>
            {wcIntegration ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleIntegration(wcIntegration.id, wcIntegration.is_active)} style={{
                  padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: wcIntegration.is_active ? '#E1F5EE' : '#FEE2E2',
                  color: wcIntegration.is_active ? '#0E5E3B' : '#DC2626',
                }}>
                  {wcIntegration.is_active ? '✓ Aktiven' : '✕ Neaktiven'}
                </button>
                <button onClick={() => { setWcUrl(wcIntegration.settings?.shop_url ?? ''); setWcSecret(wcIntegration.webhook_secret); setWcModal(true) }} style={{ padding: '6px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 12, cursor: 'pointer', background: '#fff' }}>Uredi</button>
                <button onClick={() => deleteIntegration(wcIntegration.id, 'WooCommerce')} style={{ padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, cursor: 'pointer', background: '#FEE2E2', color: '#DC2626' }}>Briši</button>
              </div>
            ) : (
              <button onClick={() => { setWcUrl(''); setWcSecret(generateSecret()); setWcModal(true) }} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                + Poveži
              </button>
            )}
          </div>
          <HowTo
  title="Kako povežem WooCommerce?"
  steps={[
    { icon: '🔑', title: 'Kopirajte Webhook URL', desc: 'Ta URL boste vnesli v WooCommerce nastavitve.', code: `${webhookBaseUrl}/woocommerce?org_id=${orgId}`, copyable: true },
    { icon: '🛒', title: 'Odprite WooCommerce Admin', desc: 'Pojdite na: Nastavitve → Napredno → Webhooks → Dodaj webhook' },
    { icon: '📋', title: 'Izpolnite podatke', desc: 'Tema: Naročilo ustvarjeno · Format: JSON · URL: (iz koraka 1) · Skrivnost: (Webhook Secret spodaj)' },
    { icon: '✅', title: 'Shranite in testirajte', desc: 'Naredite testno naročilo v vaši trgovini — račun se mora pojaviti v Računko.' },
  ]}
  tip="Računko avtomatsko preveri podpis vsakega webhookа. Lažni klici so zavrnjeni."
/>
          {wcIntegration && (
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook URL za WooCommerce</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', wordBreak: 'break-all', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                {webhookBaseUrl}/woocommerce?org_id={orgId}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 10, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook Secret</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                  {showWcSecret ? wcIntegration.webhook_secret : maskSecret(wcIntegration.webhook_secret)}
                </div>
                <button onClick={() => setShowWcSecret(!showWcSecret)} style={{ padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 11, cursor: 'pointer', background: '#fff', whiteSpace: 'nowrap' }}>
                  {showWcSecret ? 'Skrij' : 'Pokaži'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>
                V WooCommerce: <strong>Nastavitve → Napredno → Webhooks → Dodaj</strong><br />
                Tema: <strong>Naročilo ustvarjeno</strong> · Format: JSON · Skrivnost: (zgoraj)
              </div>
            </div>
          )}
        </div>

        {/* SHOPIFY */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: shIntegration ? 16 : 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#96BF48', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>🏪</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12' }}>Shopify</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Shopify spletna trgovina</div>
            </div>
            {shIntegration ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleIntegration(shIntegration.id, shIntegration.is_active)} style={{
                  padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: shIntegration.is_active ? '#E1F5EE' : '#FEE2E2',
                  color: shIntegration.is_active ? '#0E5E3B' : '#DC2626',
                }}>
                  {shIntegration.is_active ? '✓ Aktiven' : '✕ Neaktiven'}
                </button>
                <button onClick={() => { setShUrl(shIntegration.settings?.shop_url ?? ''); setShSecret(shIntegration.webhook_secret); setShModal(true) }} style={{ padding: '6px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 12, cursor: 'pointer', background: '#fff' }}>Uredi</button>
                <button onClick={() => deleteIntegration(shIntegration.id, 'Shopify')} style={{ padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, cursor: 'pointer', background: '#FEE2E2', color: '#DC2626' }}>Briši</button>
              </div>
            ) : (
              <button onClick={() => { setShUrl(''); setShSecret(generateSecret()); setShModal(true) }} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                + Poveži
              </button>
            )}
          </div>
          <HowTo
  title="Kako povežem Shopify?"
  steps={[
    { icon: '🔑', title: 'Kopirajte Webhook URL', desc: 'Ta URL boste vnesli v Shopify nastavitve.', code: `${webhookBaseUrl}/shopify?org_id=${orgId}`, copyable: true },
    { icon: '🏪', title: 'Odprite Shopify Admin', desc: 'Pojdite na: Nastavitve → Obvestila → Webhooks → Ustvari webhook' },
    { icon: '📋', title: 'Izpolnite podatke', desc: 'Dogodek: Naročilo plačano · Format: JSON · URL: (iz koraka 1)' },
    { icon: '✅', title: 'Shranite in testirajte', desc: 'Naredite testno naročilo — račun se mora pojaviti v Računko.' },
  ]}
  tip="Shopify pošlje webhook ob vsakem plačanem naročilu. Brezplačna naročila so ignorirana."
/>
          {shIntegration && (
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook URL za Shopify</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', wordBreak: 'break-all', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                {webhookBaseUrl}/shopify?org_id={orgId}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 10, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook Secret</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                  {showShSecret ? shIntegration.webhook_secret : maskSecret(shIntegration.webhook_secret)}
                </div>
                <button onClick={() => setShowShSecret(!showShSecret)} style={{ padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 11, cursor: 'pointer', background: '#fff', whiteSpace: 'nowrap' }}>
                  {showShSecret ? 'Skrij' : 'Pokaži'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>
                V Shopify: <strong>Nastavitve → Obvestila → Webhooks → Ustvari webhook</strong><br />
                Dogodek: <strong>Naročilo plačano</strong> · Format: JSON · URL: (zgoraj)
              </div>
            </div>
          )}
        </div>

        {/* STRIPE */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: strIntegration ? 16 : 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#635BFF', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>💳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12' }}>Stripe</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Plačila iz vaše lastne aplikacije</div>
            </div>
            {strIntegration ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleIntegration(strIntegration.id, strIntegration.is_active)} style={{
                  padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: strIntegration.is_active ? '#E1F5EE' : '#FEE2E2',
                  color: strIntegration.is_active ? '#0E5E3B' : '#DC2626',
                }}>
                  {strIntegration.is_active ? '✓ Aktiven' : '✕ Neaktiven'}
                </button>
                <button onClick={() => { setStrSecret(strIntegration.webhook_secret); setStrModal(true) }} style={{ padding: '6px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 12, cursor: 'pointer', background: '#fff' }}>Uredi</button>
                <button onClick={() => deleteIntegration(strIntegration.id, 'Stripe')} style={{ padding: '6px 12px', borderRadius: 6, border: 0, fontSize: 12, cursor: 'pointer', background: '#FEE2E2', color: '#DC2626' }}>Briši</button>
              </div>
            ) : (
              <button onClick={() => { setStrSecret(generateSecret()); setStrModal(true) }} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                + Poveži
              </button>
            )}
          </div>
          <HowTo
  title="Kako povežem Stripe?"
  steps={[
    { icon: '🔑', title: 'Kopirajte Webhook URL', desc: 'Ta URL boste vnesli v Stripe nastavitve.', code: `${webhookBaseUrl}/stripe?org_id=${orgId}`, copyable: true },
    { icon: '💳', title: 'Odprite Stripe Dashboard', desc: 'Pojdite na: Developers → Webhooks → Add endpoint' },
    { icon: '📋', title: 'Izpolnite podatke', desc: 'Events: checkout.session.completed, invoice.paid · URL: (iz koraka 1)' },
    { icon: '✅', title: 'Kopirajte Signing secret', desc: 'Stripe vam ob ustvarjanju webhooka pokaže "Signing secret" — kopirajte ga spodaj v polje Webhook Secret.' },
  ]}
  tip="Uporabite vaš LASTEN Stripe webhook (za vašo aplikacijo/produkt) — ne za Računko naročnino."
/>
          {strIntegration && (
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook URL za Stripe</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', wordBreak: 'break-all', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                {webhookBaseUrl}/stripe?org_id={orgId}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 10, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Webhook Secret (Stripe Signing secret)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#0D1F12', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.1)' }}>
                  {showStrSecret ? strIntegration.webhook_secret : maskSecret(strIntegration.webhook_secret)}
                </div>
                <button onClick={() => setShowStrSecret(!showStrSecret)} style={{ padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 11, cursor: 'pointer', background: '#fff', whiteSpace: 'nowrap' }}>
                  {showStrSecret ? 'Skrij' : 'Pokaži'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>
                V Stripe: <strong>Developers → Webhooks → Add endpoint</strong><br />
                Events: <strong>checkout.session.completed, invoice.paid</strong> · URL: (zgoraj)
              </div>
            </div>
          )}
        </div>

        {/* INTEGRATION LOGS */}
        <IntegrationLogs orgId={orgId} supabase={supabase} />

      </div>

      {/* WOOCOMMERCE MODAL */}
      {wcModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setWcModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>🛒 WooCommerce nastavitve</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>URL vaše WordPress strani *</label>
                <input value={wcUrl} onChange={e => setWcUrl(e.target.value)} placeholder="https://vasatrgovina.si" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Webhook Secret (generirano avtomatsko)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={wcSecret} onChange={e => setWcSecret(e.target.value)} style={{ ...inp, flex: 1 }} />
                  <button onClick={() => setWcSecret(generateSecret())} style={{ padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, cursor: 'pointer', background: '#F7F6F2', flexShrink: 0 }}>↺ Novo</button>
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Kopirajte v WooCommerce → Webhooks → Skrivnost</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setWcModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={() => saveIntegration('woocommerce', wcUrl, wcSecret)} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#0D1F12', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHOPIFY MODAL */}
      {shModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>🏪 Shopify nastavitve</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>URL Shopify trgovine *</label>
                <input value={shUrl} onChange={e => setShUrl(e.target.value)} placeholder="https://vasatrgovina.myshopify.com" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Webhook Secret</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={shSecret} onChange={e => setShSecret(e.target.value)} style={{ ...inp, flex: 1 }} />
                  <button onClick={() => setShSecret(generateSecret())} style={{ padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, cursor: 'pointer', background: '#F7F6F2', flexShrink: 0 }}>↺ Novo</button>
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Kopirajte v Shopify → Webhooks pri ustvarjanju</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={() => saveIntegration('shopify', shUrl, shSecret)} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#0D1F12', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRIPE MODAL */}
      {strModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setStrModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>💳 Stripe nastavitve</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Webhook Secret (Stripe Signing secret) *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={strSecret} onChange={e => setStrSecret(e.target.value)} placeholder="whsec_..." style={{ ...inp, flex: 1 }} />
                  <button onClick={() => setStrSecret(generateSecret())} style={{ padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, cursor: 'pointer', background: '#F7F6F2', flexShrink: 0 }}>↺ Novo</button>
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Prilepite Signing secret iz Stripe → Webhooks → vaš endpoint</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setStrModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={() => saveIntegration('stripe', 'stripe', strSecret)} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#0D1F12', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? '#0D1F12' : '#A32D2D', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}

// Logs komponenta
function IntegrationLogs({ orgId, supabase }: { orgId: string | null; supabase: any }) {
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('integration_logs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }: any) => setLogs(data ?? []))
  }, [orgId, supabase])

  if (logs.length === 0) return null

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>Zadnji dogodki</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {logs.map(log => (
          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#F7F6F2', borderRadius: 8 }}>
            <span style={{ fontSize: 14 }}>{log.status === 'success' ? '✅' : '❌'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#0D1F12' }}>
                {log.integration_type === 'woocommerce' ? '🛒 WooCommerce' : log.integration_type === 'shopify' ? '🏪 Shopify' : '💳 Stripe'} · #{log.external_id}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {new Date(log.created_at).toLocaleString('sl-SI')}
              </div>
            </div>
            {log.invoice_id && (
              <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 500 }}>Račun izdan</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
