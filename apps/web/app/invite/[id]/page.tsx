'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AcceptInvitePage() {
  const router = useRouter()
  const params = useParams()
  const inviteId = params.id as string
  const supabase = createClient()

  const [status, setStatus] = useState<'loading'|'found'|'accepting'|'done'|'error'>('loading')
  const [invite, setInvite] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      // Pridobi povabilo
      const { data: inv, error: invErr } = await supabase
        .from('org_invites')
        .select('*, organizations(name)')
        .eq('id', inviteId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (invErr || !inv) {
        setStatus('error')
        setError('Povabilo ni veljavno ali je poteklo.')
        return
      }

      setInvite(inv)
      setOrg(inv.organizations)
      setStatus('found')
    }
    if (inviteId) load()
  }, [inviteId, supabase])

  async function acceptInvite() {
    setStatus('accepting')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Redirect na login z return URL
        router.push(`/login?redirect=/invite/${inviteId}`)
        return
      }

      // Preveri email ujemanje
      if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        setStatus('error')
        setError(`Povabilo je za ${invite.email}. Prijavljeni ste kot ${user.email}. Prijavite se s pravim računom.`)
        return
      }

      // Preveri ali je že član
      const { data: existing } = await supabase
        .from('org_members')
        .select('id')
        .eq('org_id', invite.org_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existing) {
        // Že je član — samo redirect
        await supabase
          .from('org_invites')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', inviteId)
        router.push('/dashboard')
        return
      }

      // Dodaj kot člana
      const { error: memberErr } = await supabase
        .from('org_members')
        .insert({
          org_id: invite.org_id,
          user_id: user.id,
          role: invite.role,
        })

      if (memberErr) throw new Error(memberErr.message)

      // Označi povabilo kot sprejeto
      await supabase
        .from('org_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', inviteId)

      setStatus('done')
      setTimeout(() => {
        // Cashier → POS, ostali → dashboard
        if (invite.role === 'cashier') router.push('/pos')
        else router.push('/dashboard')
      }, 2000)

    } catch (e: any) {
      setStatus('error')
      setError(e.message)
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: '⚙️ Admin',
    cashier: '🛒 Blagajnik',
    viewer: '👁️ Gledalec',
    accountant: '📊 Računovodja',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 40, width: '100%', maxWidth: 420, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>

        {status === 'loading' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 16, color: '#888' }}>Preverjam povabilo...</div>
          </>
        )}

        {status === 'found' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>Povabljeni ste!</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
              Pridružite se podjetju <strong>{org?.name}</strong> kot<br />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>{ROLE_LABELS[invite?.role] ?? invite?.role}</span>
            </div>
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#888' }}>
              Povabilo je za: <strong style={{ color: '#0D1F12' }}>{invite?.email}</strong>
            </div>
            <button
              onClick={acceptInvite}
              style={{
                width: '100%', background: '#0D1F12', color: '#fff', border: 0,
                borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✓ Sprejmi povabilo
            </button>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 12 }}>
              Poteče: {new Date(invite?.expires_at).toLocaleDateString('sl-SI')}
            </div>
          </>
        )}

        {status === 'accepting' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 16, color: '#888' }}>Sprejemam povabilo...</div>
          </>
        )}

        {status === 'done' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>Dobrodošli!</div>
            <div style={{ fontSize: 14, color: '#666' }}>
              Preusmerjam vas na {invite?.role === 'cashier' ? 'POS terminal' : 'dashboard'}...
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>Napaka</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 1.6 }}>{error}</div>
            <button
              onClick={() => router.push('/')}
              style={{
                background: '#F7F6F2', color: '#0D1F12', border: 0,
                borderRadius: 10, padding: '12px 24px', fontSize: 14, cursor: 'pointer',
              }}
            >
              Pojdi na začetek
            </button>
          </>
        )}

        <div style={{ marginTop: 24, fontSize: 12, color: '#aaa' }}>
          Računko · AI računovodja za slovenskega podjetnika
        </div>
      </div>
    </div>
  )
}
