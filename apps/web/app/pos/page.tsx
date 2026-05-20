'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function PosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d2818', display: 'flex',
                   alignItems: 'center', justifyContent: 'center',
                   color: '#f6f1e8', fontFamily: 'system-ui', fontSize: 16 }}>
      Nalagam blagajno...
    </div>
  )

  return (
    <iframe
      src="/pos-app.html"
      style={{ width: '100vw', height: '100vh', border: 'none', display: 'block' }}
    />
  )
}
