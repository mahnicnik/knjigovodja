'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Knjigovodja.si</h1>
          <p className="text-gray-500 mt-2">Ustvarite brezplačni račun</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Ime in priimek</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ana Kovač"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
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
              placeholder="najmanj 8 znakov"
              required
              minLength={8}
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
            {loading ? 'Ustvarjam račun...' : 'Ustvarite račun'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Že imate račun?{' '}
          <a href="/login" className="text-gray-900 font-medium hover:underline">
            Prijava
          </a>
        </p>
      </div>
    </div>
  )
}