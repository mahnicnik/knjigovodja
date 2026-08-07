'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // POPRAVLJENO (30.7.2026): prej getSession() preveril SAMO, ali
    // obstaja KATERAKOLI seja - to je vkljucevalo tudi ze prijavljene
    // uporabnike, ki so obiskali to stran po nesreci (brez pravega
    // tokena). Zdaj poslusa specificen 'PASSWORD_RECOVERY' dogodek, ki
    // ga Supabase sprozi SAMO ob obdelavi pravega tokena za ponastavitev.
    let resolved = false
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        resolved = true
        setReady(true)
      }
    })

    // Varovalka: ce dogodek PASSWORD_RECOVERY ne pride v razumnem casu,
    // predpostavi neveljaven/manjkajoc token.
    const timeout = setTimeout(() => {
      if (!resolved) {
        setError('Neveljavna ali potekla povezava. Zahtevajte novo ponastavitev gesla.')
      }
    }, 3000)

    return () => {
      authListener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Gesli se ne ujemata'); return }
    if (password.length < 8) { setError('Geslo mora imeti vsaj 8 znakov'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }

  if (!ready && !error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Preverjam...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Novo geslo</h1>
          <p className="text-gray-500 mt-2">Vnesite novo geslo za vaš račun</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="text-5xl">✅</div>
            <div className="text-gray-900 font-semibold">Geslo posodobljeno!</div>
            <p className="text-gray-500 text-sm">Preusmerjamo vas na nadzorno ploščo...</p>
          </div>
        ) : error && !ready ? (
          <div className="text-center space-y-4">
            <div className="text-red-500 text-sm">{error}</div>
            <a href="/forgot-password" className="block text-gray-900 font-medium text-sm hover:underline">
              Zahtevaj novo ponastavitev →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Novo geslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Vsaj 8 znakov"
                required
                minLength={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Potrdi geslo</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Ponovi geslo"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Shranjujem...' : 'Nastavi novo geslo'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
