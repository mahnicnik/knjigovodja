'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Pozabljeno geslo</h1>
          <p className="text-gray-500 mt-2">Pošljemo vam link za ponastavitev gesla</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-5xl">📧</div>
            <div className="text-gray-900 font-semibold">Email poslan!</div>
            <p className="text-gray-500 text-sm">
              Preverite vaš nabiralnik na <strong>{email}</strong>.<br/>
              Kliknite na link v emailu za ponastavitev gesla.
            </p>
            <p className="text-gray-400 text-xs mt-4">
              Niste dobili emaila? Preverite mapo Nezaželena pošta.
            </p>
            <a href="/login" className="block text-gray-900 font-medium text-sm hover:underline mt-4">
              ← Nazaj na prijavo
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Email naslov</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.com"
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
              {loading ? 'Pošiljam...' : 'Pošlji link za ponastavitev'}
            </button>
            <p className="text-center text-sm text-gray-500">
              <a href="/login" className="text-gray-900 font-medium hover:underline">
                ← Nazaj na prijavo
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
