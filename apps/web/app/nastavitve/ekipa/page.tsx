'use client'
import React from 'react'

import { useEffect, useState } from 'react'
import HowTo from '@/components/HowTo'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// ===== TIPI =====
interface Member {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'cashier' | 'viewer' | 'accountant'
  created_at: string
  profile: {
    email: string
    full_name: string | null
  } | null
}

interface Invite {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}

const ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    emoji: '⚙️',
    desc: 'Vse razen nastavitev plačil in brisanja org',
    color: '#5B7FFF',
  },
  {
    value: 'cashier',
    label: 'Blagajnik',
    emoji: '🛒',
    desc: 'Samo POS terminal — prodaja, nič drugega',
    color: '#1D9E75',
  },
  {
    value: 'viewer',
    label: 'Gledalec',
    emoji: '👁️',
    desc: 'Samo ogled podatkov, brez urejanja',
    color: '#888',
  },
  {
    value: 'accountant',
    label: 'Računovodja',
    emoji: '📊',
    desc: 'Ogled + export podatkov za računovodstvo',
    color: '#E8B547',
  },
]

function roleInfo(role: string) {
  return ROLES.find(r => r.value === role) ?? { label: role, emoji: '👤', color: '#888', desc: '' }
}

export default function EkipaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('cashier')
  const [inviting, setInviting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

      if (!member) return
      setOrgId(member.org_id)
      setMyRole(member.role)

      await reload(member.org_id)
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function reload(oid: string) {
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('org_members')
        .select('id, user_id, role, created_at')
        .eq('org_id', oid)
        .order('created_at'),
      supabase
        .from('org_invites')
        .select('*')
        .eq('org_id', oid)
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])

    // Za vsakega člana pridobi profil (id = user_id)
    const membersWithProfiles = await Promise.all(
      (membersRes.data ?? []).map(async (m) => {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, email, full_name')
          .eq('id', m.user_id)
          .maybeSingle()
        return {
          ...m,
          profile: profile ? { email: profile.email, full_name: profile.full_name } : null
        } as Member
      })
    )

    setMembers(membersWithProfiles)
    setInvites(invitesRes.data ?? [])
  }

  async function sendInvite() {
    if (!orgId || !inviteEmail.trim()) return
    if (!inviteEmail.includes('@')) { showToast('error', 'Vnesite veljaven email'); return }

    setInviting(true)
    try {
      // Preveri ali je že član
      const { data: existing } = await supabase
        .from('org_invites')
        .select('id')
        .eq('org_id', orgId)
        .eq('email', inviteEmail.trim().toLowerCase())
        .is('accepted_at', null)
        .maybeSingle()

      if (existing) {
        showToast('error', 'Povabilo za ta email je že poslano')
        setInviting(false)
        return
      }

      // Ustvari povabilo
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 dni veljavnost

      const { data: invite, error } = await supabase
        .from('org_invites')
        .insert({
          org_id: orgId,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          expires_at: expiresAt.toISOString(),
          invited_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      // Pošlji invite email
      await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId: invite.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })

      setInviteEmail('')
      await reload(orgId)
      showToast('success', `Povabilo poslano na ${inviteEmail}`)
    } catch (e: any) {
      showToast('error', e.message)
    } finally {
      setInviting(false)
    }
  }

  // POPRAVLJENO (30.7.2026, audit K8): prej neposreden Supabase klic iz
  // brskalnika, brez preverjanja pravic - UI je gumbe skril za ne-lastnike,
  // a to je bilo samo kozmeticno (konzola v brskalniku bi to zaobsla).
  // Zdaj gre skozi API endpoint, ki na streznikuu preveri vlogo klicatelja.
  async function removeMember(memberId: string) {
    if (!confirm('Odstranite tega člana?')) return
    const res = await fetch('/api/team/remove-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast('error', data.error || 'Napaka pri odstranjevanju')
      return
    }
    setMembers(prev => prev.filter(m => m.id !== memberId))
    showToast('success', 'Član odstranjen')
  }

  async function changeRole(memberId: string, newRole: string) {
    const res = await fetch('/api/team/change-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, newRole }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast('error', data.error || 'Napaka pri spreminjanju vloge')
      return
    }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole as Member['role'] } : m))
    showToast('success', 'Vloga spremenjena')
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm('Prekliči povabilo?')) return
    await supabase.from('org_invites').delete().eq('id', inviteId)
    setInvites(prev => prev.filter(i => i.id !== inviteId))
    showToast('success', 'Povabilo preklicano')
  }

  const isOwner = myRole === 'owner'

  if (loading) return (
    <AppLayout>
    <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>
    </AppLayout>
  )

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 0, color: '#888', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>← Nazaj</button>
          <h1 style={{ fontSize: 26, fontWeight: 500, color: '#0D1F12', margin: 0 }}>Ekipa</h1>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>Upravljajte dostop do vašega Računko računa</div>
        </div>

        {/* VLOGE INFO */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 12 }}>Vloge in dovoljenja</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {ROLES.map(r => (
              <div key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#F7F6F2', borderRadius: 10 }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* POVABI ČLANA */}
        {isOwner && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
            <HowTo
  title="Kako povabim člana ekipe?"
  steps={[
    { icon: '📧', title: 'Vnesite email', desc: 'Vnesite email naslov osebe ki jo želite povabiti.' },
    { icon: '🎭', title: 'Izberite vlogo', desc: 'Blagajnik: samo POS terminal · Admin: vse razen nastavitev plačil · Računovodja: ogled + export · Gledalec: samo ogled' },
    { icon: '📨', title: 'Pošljite povabilo', desc: 'Oseba prejme email s povezavo. Povabilo velja 7 dni.' },
    { icon: '✅', title: 'Oseba sprejme', desc: 'Klikne na link v emailu → ustvari račun ali se prijavi → takoj dobi dostop.' },
  ]}
  tip="Blagajnik bo po prijavi preusmerjen direktno na POS terminal — ni dostopa do računov ali nastavitev."
/>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>+ Povabi novega člana</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Email naslov</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="zaposleni@firma.si"
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 6 }}>Vloga</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ROLES.map(r => (
                    <label key={r.value} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      border: inviteRole === r.value ? `2px solid ${r.color}` : '0.5px solid rgba(0,0,0,0.12)',
                      borderRadius: 10, cursor: 'pointer',
                      background: inviteRole === r.value ? `${r.color}15` : '#fff',
                      transition: 'all .12s',
                    }}>
                      <input type="radio" checked={inviteRole === r.value} onChange={() => setInviteRole(r.value)} style={{ accentColor: r.color }} />
                      <span style={{ fontSize: 16 }}>{r.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={sendInvite}
                disabled={inviting || !inviteEmail.trim()}
                style={{
                  background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8,
                  padding: '11px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  opacity: (inviting || !inviteEmail.trim()) ? 0.4 : 1, alignSelf: 'flex-start',
                }}
              >
                {inviting ? 'Pošiljam...' : '📧 Pošlji povabilo'}
              </button>
            </div>
          </div>
        )}

        {/* OBSTOJEČI ČLANI */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>
            Člani ekipe ({members.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => {
              const role = roleInfo(m.role)
              const isMe = m.role === myRole && members.indexOf(m) === 0
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', background: '#F7F6F2', borderRadius: 10,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: role.color, color: '#fff',
                    display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700,
                  }}>
                    {(m.profile?.full_name ?? m.profile?.email ?? '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>
                      {m.profile?.full_name ?? m.profile?.email ?? 'Neznan uporabnik'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{m.profile?.email}</div>
                  </div>
                  {/* Role badge + change */}
                  {isOwner && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.15)',
                        fontSize: 12, background: '#fff', color: '#0D1F12', cursor: 'pointer',
                      }}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.emoji} {r.label}</option>)}
                    </select>
                  ) : (
                    <div style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: `${role.color}20`, color: role.color,
                    }}>
                      {role.emoji} {role.label}
                    </div>
                  )}
                  {/* Odstrani */}
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => removeMember(m.id)}
                      style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 18, padding: '4px 6px', flexShrink: 0 }}
                      title="Odstrani člana"
                    >×</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ČAKAJOČA POVABILA */}
        {invites.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>
              Čakajoča povabila ({invites.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invites.map(inv => {
                const role = roleInfo(inv.role)
                const expires = new Date(inv.expires_at)
                const daysLeft = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#FFF8E7', borderRadius: 10, border: '0.5px solid rgba(232,181,71,0.3)' }}>
                    <span style={{ fontSize: 18 }}>📧</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{inv.email}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                        {role.emoji} {role.label} · poteče čez {daysLeft} {daysLeft === 1 ? 'dan' : 'dni'}
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 6 }}
                      >Prekliči</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'success' ? '#0D1F12' : '#A32D2D',
            color: '#fff', padding: '12px 20px', borderRadius: 999,
            fontSize: 13, fontWeight: 500, zIndex: 3000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
          }}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
          </div>
        )}

      </div>
    </div>
    </AppLayout>
  )
}
