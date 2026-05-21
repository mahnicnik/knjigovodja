'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function BlagajnaPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr
        if (!user) throw new Error('Ni prijavljenega uporabnika')

        const { data: biz, error: bizErr } = await supabase
          .from('businesses')
          .select('id, name, furs_config, pos_settings')
          .eq('owner_user_id', user.id)
          .single()

        if (bizErr) throw bizErr
        setData(biz)
      } catch(e: any) {
        setError(e.message)
      }
    }
    load()
  }, [])

  if (error) return (
    <div style={{padding:40, color:'red', fontFamily:'monospace'}}>
      <h2>Napaka:</h2>
      <pre>{error}</pre>
    </div>
  )

  if (!data) return <div style={{padding:40}}>Nalagam...</div>

  return (
    <div style={{padding:40, fontFamily:'Inter, system-ui'}}>
      <h1>Davčna blagajna</h1>
      <p>Business: {data.name}</p>
      <pre style={{background:'#f0ede8', padding:16, borderRadius:8, fontSize:12}}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
