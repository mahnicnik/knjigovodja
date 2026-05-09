'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'
import UpgradeButton from '@/components/UpgradeButton'

const SP_CONTRIBUTIONS: Record<number, number> = {
  1: 2584.92, 2: 3012.36, 3: 3439.20, 4: 3866.04, 5: 4293.00,
  6: 4719.84, 7: 5146.68, 8: 5399.76, 9: 6024.24, 10: 6451.08,
  11: 6877.80, 12: 7304.64, 13: 7731.48, 14: 8585.16, 15: 9438.84,
}

export default function NastavitevPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [form, setForm] = useState({
    name: '',
    tax_number: '',
    vat_number: '',
    vat_registered: false,
    iban: '',
    bic: '',
    address: '',
    post_code: '',
    city: '',
    phone: '',
    email: '',
    contribution_class: 8,
  })
  const supabase = createClient()

  useEffect(() => { 
    load()
    // Check for success/cancel from Stripe redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true' && params.get('plan') === 'pro') {
      setShowSuccess(true)
      posthog.capture('subscription_upgrade_success', { plan: 'pro' })
      window.history.replaceState({}, '', '/nastavitve')
      // Reload org after delay to catch webhook update
      setTimeout(() => load(), 2500)
    } else if (params.get('plan') === 'cancelled') {
      setShowCancelled(true)
      posthog.capture('subscription_upgrade_cancelled')
      window.history.replaceState({}, '', '/nastavitve')
    }
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      setForm({
        name: o.name || '',
        tax_number: o.tax_number || '',
        vat_number: o.vat_number || '',
        vat_registered: o.vat_registered || false,
        iban: o.iban || '',
        bic: o.bic || '',
        address: o.address || '',
        post_code: o.post_code || '',
        city: o.city || '',
        phone: o.phone || '',
        email: o.email || '',
        contribution_class: o.contribution_class || 8,
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    const { error } = await supabase
      .from('organizations')
      .update({
        name: form.name,
        tax_number: form.tax_number,
        vat_number: form.vat_number,
        vat_registered: form.vat_registered,
        iban: form.iban,
        bic: form.bic,
        address: form.address,
        post_code: form.post_code,
        city: form.city,
        phone: form.phone,
        email: form.email,
        contribution_class: form.contribution_class,
      })
      .eq('id', org.id)
    if (error) {
      alert('Napaka: ' + error.message)
    } else {
      posthog.capture('organization_settings_saved', {
        vat_registered: form.vat_registered,
        contribution_class: form.contribution_class,
        has_iban: !!form.iban,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const isPro = org?.plan === 'pro'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Nastavitve s.p.</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
          {saved ? '✓ Shranjeno!' : saving ? 'Shranjujem...' : 'Shrani spremembe'}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {showSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-green-900">🎉 Dobrodošli v Pro planu!</p>
              <p className="text-xs text-green-700 mt-1">Vaš plan je aktiven. Hvala za zaupanje!</p>
            </div>
            <button onClick={() => setShowSuccess(false)} className="text-green-700 hover:text-green-900 text-lg leading-none">✕</button>
          </div>
        )}

        {showCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-900">Plačilo preklicano</p>
              <p className="text-xs text-amber-700 mt-1">Niste izvršili nadgradnje. Plačilo lahko izvršite kadarkoli.</p>
            </div>
            <button onClick={() => setShowCancelled(false)} className="text-amber-700 hover:text-amber-900 text-lg leading-none">✕</button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-medium text-gray-900">Vaš plan</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPro ? 'Pro plan z neomejenim dostopom' : 'Trenutno uporabljate Starter plan'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isPro ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              {isPro ? 'PRO' : 'STARTER'}
            </span>
          </div>

          {isPro ? (
            <div className="space-y-2 text-sm text-gray-600">
              {org.plan_expires_at && (
                <p>Naslednje plačilo: <strong className="text-gray-900">{new Date(org.plan_expires_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
              )}
              <p className="text-xs text-gray-500 pt-2">Za upravljanje naročnine ali preklic kontaktirajte podporo.</p>
            </div>
          ) : (
            <div>
              <ul className="space-y-2 mb-5 text-sm text-gray-600">
                <li className="flex items-center gap-2"><span className="text-green-600">✓</span>Neomejeno število računov</li>
                <li className="flex items-center gap-2"><span className="text-green-600">✓</span>Letno poročilo in DDV obračun</li>
                <li className="flex items-center gap-2"><span className="text-green-600">✓</span>Stripe integracija za samodejni uvoz plačil</li>
                <li className="flex items-center gap-2"><span className="text-green-600">✓</span>AI pomočnik za knjiženje</li>
                <li className="flex items-center gap-2"><span className="text-green-600">✓</span>Prioritetna podpora</li>
              </ul>
              <UpgradeButton currentPlan="starter" />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Osnovni podatki</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Ime s.p. *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Davčna številka *</label>
                <input value={form.tax_number} onChange={e => setForm({...form, tax_number: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Telefon</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                placeholder="041 123 456"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-medium text-gray-900 mb-4">DDV status</h3>
          <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer mb-3"
            onClick={() => setForm({...form, vat_registered: !form.vat_registered})}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.vat_registered ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
              {form.vat_registered && <span className="text-white text-xs">✓</span>}
            </div>
            <div>
              <div className="text-sm font-medium">DDV zavezanec</div>
              <div className="text-xs text-gray-500">Imam ID za DDV (SI...)</div>
            </div>
          </div>
          {form.vat_registered && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">ID za DDV</label>
              <input value={form.vat_number} onChange={e => setForm({...form, vat_number: e.target.value})}
                placeholder="SI12345678"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Naslov</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Ulica in hišna številka</label>
              <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                placeholder="Dunajska cesta 5"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Poštna številka</label>
                <input value={form.post_code} onChange={e => setForm({...form, post_code: e.target.value})}
                  placeholder="1000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kraj</label>
                <input value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                  placeholder="Ljubljana"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Bančni podatki</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">IBAN (TRR)</label>
              <input value={form.iban} onChange={e => setForm({...form, iban: e.target.value})}
                placeholder="SI56 6100 0001 2345 678"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">BIC / SWIFT</label>
              <input value={form.bic} onChange={e => setForm({...form, bic: e.target.value})}
                placeholder="HDELSI22"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Prispevki s.p.</h3>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800 leading-relaxed">
            <strong>Kako vem kateri razred je moj?</strong><br/>
            Preverite vašo <strong>FURS odločbo</strong> ali poglejte na <strong>UPN nalogu za prispevke</strong> — tam piše točen mesečni znesek.
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Prispevni razred</label>
            <select value={form.contribution_class}
              onChange={e => setForm({...form, contribution_class: parseInt(e.target.value)})}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
              {[
                { c: 1,  desc: 'Začetnik / normiranec (prve 3 leta)' },
                { c: 2,  desc: 'Nizki prihodki — pod €10.000/leto' },
                { c: 3,  desc: 'Prihodki ~€15.000/leto' },
                { c: 4,  desc: 'Prihodki ~€20.000/leto' },
                { c: 5,  desc: 'Prihodki ~€25.000/leto' },
                { c: 6,  desc: 'Prihodki ~€30.000/leto' },
                { c: 7,  desc: 'Prihodki ~€35.000/leto' },
                { c: 8,  desc: 'Najpogostejši — prihodki ~€40.000/leto' },
                { c: 9,  desc: 'Prihodki ~€45.000/leto' },
                { c: 10, desc: 'Prihodki ~€50.000/leto' },
                { c: 11, desc: 'Prihodki ~€55.000/leto' },
                { c: 12, desc: 'Prihodki ~€60.000/leto' },
                { c: 13, desc: 'Prihodki ~€65.000/leto' },
                { c: 14, desc: 'Prihodki ~€75.000/leto' },
                { c: 15, desc: 'Najvišji — prihodki nad €80.000/leto' },
              ].map(({ c, desc }) => (
                <option key={c} value={c}>
                  Razred {c} — €{(SP_CONTRIBUTIONS[c]/12).toFixed(2)}/mes — {desc}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-2">
              Mesečni prispevki: <strong>€{(SP_CONTRIBUTIONS[form.contribution_class]/12).toFixed(2)}</strong>
              &nbsp;·&nbsp; Letno: <strong>€{SP_CONTRIBUTIONS[form.contribution_class].toFixed(2)}</strong>
            </p>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
          {saved ? '✓ Shranjeno!' : saving ? 'Shranjujem...' : 'Shrani vse spremembe'}
        </button>

      </div>
    </div>
  )
}