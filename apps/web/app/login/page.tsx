'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import posthog from 'posthog-js'
import { getActiveMembership } from '@/lib/active-org'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // PRELET 229: dokler sta nastavljena, cakamo na kodo iz aplikacije.
  const [mfaFaktor, setMfaFaktor] = useState<string | null>(null)
  const [mfaIzziv, setMfaIzziv] = useState<string | null>(null)
  const [mfaKoda, setMfaKoda] = useState('')
  // PRELET 241: rezervna koda za primer izgubljenega telefona.
  const [rezervni, setRezervni] = useState(false)
  const [rezervnaKoda, setRezervnaKoda] = useState('')

  async function uporabiRezervno() {
    if (rezervnaKoda.trim().length < 8) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/mfa/use-backup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ koda: rezervnaKoda }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Koda ni pravilna.')
      const kam = new URLSearchParams(window.location.search).get('next')
      const varnaPot = kam && kam.startsWith('/') && !kam.startsWith('//') ? kam : null
      router.push(varnaPot || '/dashboard')
    } catch (e: any) {
      setError(e?.message || 'Kode ni bilo mogoče preveriti.')
      setLoading(false)
    }
  }

  async function potrdiKodo() {
    if (!mfaFaktor || !mfaIzziv || mfaKoda.length < 6) return
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: napaka } = await supabase.auth.mfa.verify({
      factorId: mfaFaktor, challengeId: mfaIzziv, code: mfaKoda.trim(),
    })
    if (napaka) {
      setError('Koda ni pravilna. Poskusite z novo.')
      setMfaKoda('')
      // Vsak izziv je enkraten - po neuspehu pripravimo novega.
      const { data: nov } = await supabase.auth.mfa.challenge({ factorId: mfaFaktor })
      setMfaIzziv(nov?.id || null)
      setLoading(false)
      return
    }
    const kam = new URLSearchParams(window.location.search).get('next')
    const varnaPot = kam && kam.startsWith('/') && !kam.startsWith('//') ? kam : null
    router.push(varnaPot || '/dashboard')
  }
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Napačen email ali geslo.')
      setLoading(false)
      return
    }

    /**
     * DRUGA STOPNJA (prelet 229)
     *
     * Po pravilnem geslu Supabase sejo ustvari, a jo oznaci kot NEPOPOLNO,
     * ce ima uporabnik vklopljeno dvostopenjsko prijavo. Raven `aal1` pomeni
     * "geslo je pravilno", `aal2` pa "koda je potrjena".
     *
     * Dokler koda ni vpisana, uporabnika ne spustimo naprej - sicer bi bila
     * druga stopnja le videz.
     */
    const { data: raven } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (raven?.nextLevel === 'aal2' && raven.nextLevel !== raven.currentLevel) {
      const { data: faktorji } = await supabase.auth.mfa.listFactors()
      const totp = ((faktorji?.totp || []) as any[]).find(f => f.status === 'verified')
      if (totp) {
        const { data: izziv } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        setMfaFaktor(totp.id)
        setMfaIzziv(izziv?.id || null)
        setLoading(false)
        return
      }
    }

    // Preveri ali ima uporabnik organizacijo
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      posthog.identify(user.id, { email: user.email })
      posthog.capture('user_logged_in', { email: user.email })

      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

      /**
       * VRNITEV NA IZHODISCNO STRAN (prelet 190)
       *
       * Prijava je uporabnika VEDNO poslala na `/dashboard`. V namizni
       * aplikaciji, ki odpre naravnost blagajno, je to pomenilo, da se je
       * osebje po vsaki prijavi znaslo v portalu in moralo blagajno poiskati
       * rocno - namesto da bi vnesli samo PIN.
       *
       * `?next=` pove, kam se je treba vrniti. Sprejmemo samo poti znotraj
       * aplikacije (zacetek s posamicno posevnico), da parameter ne more
       * postati preusmeritev na tujo stran.
       */
      const kam = new URLSearchParams(window.location.search).get('next')
      const varnaPot = kam && /^\/(?!\/)/.test(kam) ? kam : null

      if (member) {
        router.push(varnaPot || '/dashboard')
      } else {
        router.push('/onboarding')
      }
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Računko</h1>
          <p className="text-gray-500 mt-2">AI računovodja za slovenskega s.p.</p>
        </div>

        {/* PRELET 229: obrazec za kodo. Prikaze se SELE po pravilnem geslu,
            zato nikoli ne izda, ali je racun sploh zavarovan z drugo stopnjo. */}
        {mfaFaktor ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Vpišite šestmestno kodo iz aplikacije na telefonu.</p>
              <input
                value={mfaKoda}
                onChange={e => setMfaKoda(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') potrdiKodo() }}
                placeholder="000000" inputMode="numeric" autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg tracking-[0.18em] text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={potrdiKodo} disabled={loading || mfaKoda.length < 6}
              className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium disabled:bg-gray-200 disabled:text-gray-400">
              {loading ? 'Preverjam…' : 'Potrdi in se prijavi'}
            </button>
            {/* PRELET 241: rezervna koda. Seje ne dvigne na drugo stopnjo -
                Supabase tega ne omogoca - ampak dvostopenjsko prijavo ODSTRANI,
                da uporabnik pride noter in jo nastavi na novo. */}
            {rezervni ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Vpišite eno od rezervnih kod.</p>
                <input value={rezervnaKoda} onChange={e => setRezervnaKoda(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') uporabiRezervno() }}
                  placeholder="XXXXX-XXXXX" autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-gray-900"/>
                <button onClick={uporabiRezervno} disabled={loading || rezervnaKoda.length < 8}
                  className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium disabled:bg-gray-200 disabled:text-gray-400">
                  {loading ? 'Preverjam…' : 'Odkleni z rezervno kodo'}
                </button>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Po uporabi bo dvostopenjska prijava izklopljena. Nastavite jo znova v nastavitvah.
                </p>
                <button onClick={() => { setRezervni(false); setRezervnaKoda(''); setError('') }}
                  className="w-full text-sm text-gray-500 hover:text-gray-900">Nazaj</button>
              </div>
            ) : (
              <button onClick={() => { setRezervni(true); setError('') }}
                className="w-full text-sm text-gray-500 hover:text-gray-900">
                Nimam telefona — uporabi rezervno kodo
              </button>
            )}
            <button onClick={() => { setMfaFaktor(null); setMfaIzziv(null); setMfaKoda(''); setError('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-900">
              Nazaj na prijavo
            </button>
          </div>
        ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vas@email.com"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Geslo</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Prijavljam...' : 'Prijava'}
          </button>
        </form>
        )}

        <div className="mt-6 space-y-3 text-center text-sm text-gray-500">
          <p>
            <a href="/forgot-password" className="text-gray-900 font-medium hover:underline">
              Pozabljeno geslo?
            </a>
          </p>
          <p>
            Nimate računa?{' '}
            <a href="/register" className="text-gray-900 font-medium hover:underline">
              Registracija
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
