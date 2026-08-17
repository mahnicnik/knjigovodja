'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'
import { getActiveMembership } from '@/lib/active-org'

export default function StripePage() {
  const [org, setOrg] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  // DODANO (11.8.2026): Racunko sandbox - simulacija Stripe placila brez
  // pravega webhooka/certifikata.
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<any>(null)
  const [form, setForm] = useState({
    secret_key: '',
    webhook_secret: '',
    default_vat_rate: '0',
    auto_create_invoices: true,
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (!member) return
    const o = (member as any).organizations
    setOrg(o)

    const { data: s } = await supabase.from('stripe_settings').select('*').eq('org_id', o.id).single()
    // POVEZAVA z /integracije (11.8.2026): dejanski webhook handler bere
    // skrivnost IZ 'integrations', ne iz 'stripe_settings' - zato jo tukaj
    // PREDNOSTNO preberemo od tam, da obe strani prikazujeta ISTO stanje.
    const { data: integ } = await supabase.from('integrations').select('webhook_secret').eq('org_id', o.id).eq('type', 'stripe').maybeSingle()
    const effectiveWebhookSecret = integ?.webhook_secret || s?.webhook_secret
    if (s) {
      setSettings(s)
      setForm({
        secret_key: s.secret_key ? '••••••••' + s.secret_key.slice(-4) : '',
        webhook_secret: zadnji4 ? '••••••••' + zadnji4 : '',
        default_vat_rate: s.default_vat_rate || '0',
        auto_create_invoices: s.auto_create_invoices ?? true,
      })
    } else if (zadnji4) {
      setForm(f => ({ ...f, webhook_secret: '••••••••' + zadnji4 }))
    }
    setLoading(false)
  }

  async function save() {
    if (!org) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    const upsertData: any = {
      org_id: org.id,
      default_vat_rate: form.default_vat_rate,
      auto_create_invoices: form.auto_create_invoices,
      updated_at: new Date().toISOString(),
    }
    // Shrani samo če niso masked
    if (!form.secret_key.startsWith('••••')) upsertData.secret_key = form.secret_key
    if (!form.webhook_secret.startsWith('••••')) upsertData.webhook_secret = form.webhook_secret

    // POPRAVLJENO (30.7.2026): prej brez preverjanja napake - ce
    // shranjevanje spodleti, uporabnik ni izvedel nicesar.
    const { error: saveError } = await supabase.from('stripe_settings').upsert(upsertData, { onConflict: 'org_id' })
    if (saveError) {
      alert('Napaka pri shranjevanju: ' + saveError.message)
      setSaving(false)
      return
    }

    // POVEZAVA z /integracije (11.8.2026): ce je uporabnik vnesel novo
    // webhook skrivnost (ne masked), jo zapisemo TUDI v 'integrations' -
    // to je tabela, ki jo dejansko bere webhook handler. Brez tega bi
    // sprememba tukaj ostala "nevidna" za /integracije stran in obratno.
    if (upsertData.webhook_secret) {
      const { data: existingInteg } = await supabase.from('integrations').select('id').eq('org_id', org.id).eq('type', 'stripe').maybeSingle()
      if (existingInteg) {
        const { error: wsUpdErr } = await supabase.from('integrations').update({ webhook_secret: upsertData.webhook_secret, is_active: true }).eq('id', existingInteg.id)
        // POPRAVLJENO (16.8.2026): prej brez preverbe. Webhook bere skrivnost
        // IZ TE tabele - ce se ne shrani, bo Stripe zavracal vse zahteve z
        // napako "Invalid signature", uporabnik pa ne bi vedel zakaj.
        if (wsUpdErr) alert('Webhook skrivnosti ni bilo mogoče shraniti v integracije: ' + wsUpdErr.message + '\n\nStripe plačila NE bodo delovala, dokler tega ne odpravite.')
      } else {
        const { error: wsInsErr } = await supabase.from('integrations').insert({ org_id: org.id, type: 'stripe', settings: {}, webhook_secret: upsertData.webhook_secret, is_active: true })
        if (wsInsErr) alert('Webhook skrivnosti ni bilo mogoče shraniti v integracije: ' + wsInsErr.message + '\n\nStripe plačila NE bodo delovala, dokler tega ne odpravite.')
      }
    }

    setSaving(false)
    load()
  }

  async function simulateTestPayment() {
    setSimulating(true)
    setSimResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/stripe/simulate-test-payment', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await resp.json()
      setSimResult(data)
    } catch (e: any) {
      setSimResult({ error: e.message })
    }
    setSimulating(false)
  }

  async function testConnection() {
    if (!settings?.secret_key) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/stripe/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: org.id }) })
      const data = await res.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ error: e.message })
    }
    setTesting(false)
  }

  // POPRAVLJENO (13.8.2026, KRITICNO): napacna pot (stripe/webhook namesto
  // webhooks/stripe) IN trdo kodirana domena - to je uporabnike posiljalo na
  // NAPACEN, nepovezan endpoint (Racunkova lastna Pro narocnina).
  const webhookUrl = org && typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/stripe?org_id=${org.id}` : ''

  if (loading) return <AppLayout><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: '#888', fontSize: '14px' }}>Nalagam...</div></div></AppLayout>

  return (
    <AppLayout org={org}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link href="/dashboard" style={{ textDecoration: 'none', fontSize: '12px', color: '#888' }}>← Domov</Link>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#0D1F12', marginTop: '2px' }}>Stripe integracija</div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>Avtomatski uvoz plačil iz vaše spletne trgovine</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {settings && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', background: '#E1F5EE', fontSize: '12px', color: '#085041', fontWeight: '500' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1D9E75' }}></div>
              Povezano
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>

        {/* Kako deluje */}
        <div style={{ background: '#F0F9FF', border: '0.5px solid #B5D4F4', borderRadius: '12px', padding: '16px 18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#042C53', marginBottom: '8px' }}>ℹ️ Kako deluje</div>
          <div style={{ fontSize: '12px', color: '#185FA5', lineHeight: '1.6' }}>
            Ko stranka opravi nakup na vaši spletni strani → Stripe pošlje obvestilo na Računko → aplikacija <strong>samodejno ustvari račun</strong> v vaši bazi. Račun je takoj viden v sekciji Računi z oznako "Plačano".
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['checkout.session.completed', 'invoice.paid'].map(e => (
              <span key={e} style={{ fontSize: '10px', fontFamily: 'monospace', background: '#E6F1FB', color: '#185FA5', padding: '2px 8px', borderRadius: '6px' }}>{e}</span>
            ))}
          </div>
        </div>

        {/* API ključi */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>Stripe API ključi</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Najdete jih v Stripe Dashboard → Developers → API keys</div>
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Secret Key (sk_live_... ali sk_test_...)</label>
              <input
                type="password"
                value={form.secret_key}
                onChange={e => setForm({ ...form, secret_key: e.target.value })}
                placeholder="sk_live_..."
                style={{ width: '100%', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Webhook Secret (whsec_...)</label>
              <input
                type="password"
                value={form.webhook_secret}
                onChange={e => setForm({ ...form, webhook_secret: e.target.value })}
                placeholder="whsec_..."
                style={{ width: '100%', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Webhook secret dobite ko nastavite endpoint v Stripe Dashboard</div>
            </div>
          </div>
        </div>

        {/* DDV nastavitve */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>Nastavitve računov</div>
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Privzeta DDV stopnja za Stripe plačila</label>
              <select
                value={form.default_vat_rate}
                onChange={e => setForm({ ...form, default_vat_rate: e.target.value })}
                style={{ width: '100%', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none' }}
              >
                <option value="0">0% — brez DDV (s.p. brez registracije)</option>
                <option value="9.5">9.5% — znižana stopnja</option>
                <option value="22">22% — standardna stopnja</option>
              </select>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Za posamezna plačila nastavite DDV v Stripe metadata: vat_rate=22</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '0.5px solid rgba(0,0,0,0.05)' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#0D1F12', fontWeight: '500' }}>Samodejno ustvari račune</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>Ob vsakem Stripe plačilu se ustvari račun</div>
              </div>
              <div
                onClick={() => setForm({ ...form, auto_create_invoices: !form.auto_create_invoices })}
                style={{ width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer', background: form.auto_create_invoices ? '#1D9E75' : '#ddd', position: 'relative', transition: 'background .2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: '2px', left: form.auto_create_invoices ? '16px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Webhook URL */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>Webhook URL</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Kopirajte ta URL v Stripe Dashboard → Developers → Webhooks → Add endpoint</div>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ background: '#F7F6F2', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <code style={{ flex: 1, fontSize: '11px', color: '#0D1F12', wordBreak: 'break-all', fontFamily: 'monospace' }}>{webhookUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                style={{ background: '#0D1F12', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Kopiraj
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: '500', color: '#666', marginBottom: '6px' }}>Stripe eventi ki jih morate vklopiti:</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['checkout.session.completed', 'invoice.paid'].map(e => (
                  <span key={e} style={{ fontSize: '11px', fontFamily: 'monospace', background: '#F7F6F2', color: '#0D1F12', padding: '3px 9px', borderRadius: '6px', border: '0.5px solid rgba(0,0,0,0.1)' }}>{e}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Test rezultat */}
        {testResult && (
          <div style={{ background: testResult.error ? '#FCEBEB' : '#E1F5EE', border: `0.5px solid ${testResult.error ? '#F7C1C1' : '#A8DFC5'}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: testResult.error ? '#A32D2D' : '#085041', marginBottom: '4px' }}>
              {testResult.error ? '❌ Napaka' : '✅ Povezava uspešna'}
            </div>
            <div style={{ fontSize: '11px', color: testResult.error ? '#A32D2D' : '#0F6E56', fontFamily: 'monospace' }}>
              {testResult.error || `Stripe račun: ${testResult.account_name} (${testResult.account_id})`}
            </div>
          </div>
        )}

        {/* DODANO (11.8.2026): Racunko sandbox - rezultat simulacije */}
        {simResult && (
          <div style={{ background: simResult.error ? '#FCEBEB' : '#E1F5EE', border: `0.5px solid ${simResult.error ? '#F7C1C1' : '#A8DFC5'}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: simResult.error ? '#A32D2D' : '#085041', marginBottom: '4px' }}>
              {simResult.error ? '❌ Napaka pri simulaciji' : `✅ Testni račun ${simResult.invoiceNumber} ustvarjen`}
            </div>
            {!simResult.error && (
              <div style={{ fontSize: '11px', color: '#0F6E56' }}>
                {simResult.fursConfirmed
                  ? (simResult.fursDemoMode ? '🎭 FURS demo fiskalizacija uspešna (DEMO kode)' : '✅ FURS fiskalizacija uspešna')
                  : `⚠ FURS fiskalizacija ni uspela: ${simResult.fursError ?? 'preverite nastavitve blagajne'}`}
              </div>
            )}
          </div>
        )}

        {/* DODANO (11.8.2026): navodila - povezava med FURS demo nacinom in
            Stripe sandbox simulacijo, da uporabnik razume celoten tok. */}
        <div style={{ background: '#F7F6F2', borderRadius: '10px', padding: '12px 16px', marginBottom: '10px', fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
          <b style={{ color: '#0D1F12' }}>💡 Testiranje brez zunanjih odvisnosti:</b> spodnji gumb ustvari testni
          račun brez pravega Stripe plačila. Za popoln test brez zunanjih odvisnosti (vključno s fiskalizacijo)
          najprej vklopite{' '}
          <Link href="/nastavitve/blagajna" style={{ color: '#1D9E75', fontWeight: 600, textDecoration: 'underline' }}>
            FURS demo način
          </Link>
          {' '}— brez tega bo simulacija poskusila pravo fiskalizacijo (potreben certifikat).
        </div>

        {/* Gumbi */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button
            onClick={simulateTestPayment}
            disabled={simulating}
            style={{ flex: 1, padding: '10px 18px', borderRadius: '8px', border: '0.5px solid #1D9E75', background: '#E1F5EE', color: '#0F6E56', fontSize: '13px', fontWeight: '500', cursor: 'pointer', opacity: simulating ? 0.6 : 1 }}
          >
            {simulating ? 'Simuliram...' : '🧪 Simuliraj testno plačilo (Računko sandbox)'}
          </button>
        </div>

        {/* Gumbi */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {settings && (
            <button
              onClick={testConnection}
              disabled={testing}
              style={{ padding: '10px 18px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#0D1F12', fontSize: '13px', fontWeight: '500', cursor: 'pointer', opacity: testing ? 0.6 : 1 }}
            >
              {testing ? 'Testiram...' : '🔌 Testiraj povezavo'}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#0D1F12', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Shranjujem...' : 'Shrani nastavitve'}
          </button>
        </div>

        {/* Navodila */}
        <div style={{ marginTop: '24px', background: '#F7F6F2', borderRadius: '12px', padding: '16px 18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12', marginBottom: '12px' }}>📋 Navodila za nastavitev</div>
          {[
            ['1', 'Prijavite se v Stripe Dashboard na dashboard.stripe.com'],
            ['2', 'Pojdite na Developers → API keys → Kopirajte "Secret key" (sk_live_...)'],
            ['3', 'Pojdite na Developers → Webhooks → Add endpoint'],
            ['4', 'Prilepite Webhook URL od zgoraj in izberite eventi: checkout.session.completed, invoice.paid'],
            ['5', 'Po ustvaritvi webhookа kopirajte "Signing secret" (whsec_...)'],
            ['6', 'Prilepite oba ključa sem in kliknite Shrani'],
            ['7', 'Kliknite Testiraj povezavo — ob uspešnem testu ste pripravljeni'],
          ].map(([num, text]) => (
            <div key={num} style={{ display: 'flex', gap: '10px', marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#1D9E75', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '500', flexShrink: 0 }}>{num}</div>
              <div style={{ color: '#444', lineHeight: '1.5', paddingTop: '1px' }}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
