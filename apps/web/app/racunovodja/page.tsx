'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface ClientOrg {
  org_id: string
  org_name: string
  tax_number: string | null
  tax_system: string | null
  vat_registered: boolean
  member_since: string
  stats: {
    invoices_count: number
    invoices_total: number
    receipts_count: number
    receipts_unconfirmed: number
    overdue_count: number
    overdue_amount: number
  } | null
}

const TAX_SYSTEM_LABELS: Record<string, string> = {
  normirani_80: 'Normirani 80%',
  normirani_40: 'Normirani 40%',
  dejanski: 'Dejanski stroški',
  doo_obdavcitev: 'd.o.o.',
}

function getMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const label = now.toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

export default function RacunovodjaPortal() {
  const router = useRouter()
  const supabase = createClient()

  const [clients, setClients] = useState<ClientOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [search, setSearch] = useState('')
  const { from, to, label: monthLabel } = getMonthRange()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      setUserName(user.email ?? '')

      // Pridobi vse orge kjer je user accountant
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id, created_at')
        .eq('user_id', user.id)
        .eq('role', 'accountant')

      if (!memberships || memberships.length === 0) {
        setLoading(false)
        return
      }

      const orgIds = memberships.map(m => m.org_id)

      // Pridobi org podatke
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, tax_number, tax_system, vat_registered')
        .in('id', orgIds)

      // Za vsako org pridobi statistike tega meseca
      const clientsWithStats = await Promise.all(
        (orgs ?? []).map(async (org) => {
          const membership = memberships.find(m => m.org_id === org.id)

          const [invRes, recRes, overdueRes] = await Promise.all([
            supabase
              .from('issued_invoices')
              .select('amount_total, status')
              .eq('org_id', org.id)
              .gte('issue_date', from)
              .lte('issue_date', to)
              .neq('status', 'draft'),
            supabase
              .from('receipts')
              .select('status')
              .eq('org_id', org.id)
              .gte('receipt_date', from)
              .lte('receipt_date', to),
            supabase
              .from('issued_invoices')
              .select('amount_total')
              .eq('org_id', org.id)
              .eq('status', 'sent')
              .lt('due_date', new Date().toISOString().split('T')[0]),
          ])

          const invoices = invRes.data ?? []
          const receipts = recRes.data ?? []
          const overdue = overdueRes.data ?? []

          return {
            org_id: org.id,
            org_name: org.name,
            tax_number: org.tax_number,
            tax_system: org.tax_system,
            vat_registered: org.vat_registered,
            member_since: membership?.created_at ?? '',
            stats: {
              invoices_count: invoices.length,
              invoices_total: invoices.reduce((s, i) => s + Number(i.amount_total), 0),
              receipts_count: receipts.length,
              receipts_unconfirmed: receipts.filter(r => r.status === 'pending').length,
              overdue_count: overdue.length,
              overdue_amount: overdue.reduce((s, i) => s + Number(i.amount_total), 0),
            },
          } as ClientOrg
        })
      )

      setClients(clientsWithStats)
      setLoading(false)
    }
    load()
  }, [router, supabase, from, to])

  const filtered = clients.filter(c =>
    c.org_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.tax_number ?? '').includes(search)
  )

  const totalRevenue = clients.reduce((s, c) => s + (c.stats?.invoices_total ?? 0), 0)
  const totalOverdue = clients.filter(c => (c.stats?.overdue_count ?? 0) > 0).length
  const totalUnconfirmed = clients.reduce((s, c) => s + (c.stats?.receipts_unconfirmed ?? 0), 0)

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0D1F12', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14 }}>
      Nalagam stranke...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>

      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO · Računovodski portal</div>
              <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Dobrodošli, {userName}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>
                Moj račun
              </Link>
            </div>
          </div>

          {/* Skupne statistike */}
          {clients.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Stranke', value: clients.length, unit: '', color: '#fff' },
                { label: `Prihodki ${monthLabel}`, value: `€${Math.round(totalRevenue).toLocaleString('sl-SI')}`, unit: '', color: '#E8B547' },
                { label: 'Zamudniki', value: totalOverdue, unit: 'strank', color: totalOverdue > 0 ? '#F87171' : '#6EE7B7' },
                { label: 'Nepotrjeni stroški', value: totalUnconfirmed, unit: 'doc', color: totalUnconfirmed > 0 ? '#FCD34D' : '#6EE7B7' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{stat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  {stat.unit && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{stat.unit}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {clients.length === 0 ? (
          /* PRAZNO STANJE */
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni strank</div>
            <div style={{ fontSize: 14, color: '#888', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
              Stranke vas povabijo prek <strong>Nastavitve → Ekipa → Povabi računovodjo</strong>.
              Ko sprejmejo, boste videli njihove podatke tukaj.
            </div>
            <div style={{ marginTop: 24, background: '#F7F6F2', borderRadius: 12, padding: '16px 20px', display: 'inline-block', textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Vaša povezava za stranke</div>
              <div style={{ fontSize: 13, color: '#0D1F12', fontFamily: 'monospace' }}>računko.si/nastavitve/ekipa</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Pošljite strankam — vas povabijo z vlogo "Računovodja"</div>
            </div>
          </div>
        ) : (
          <>
            {/* ISKANJE */}
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Išči po imenu ali davčni številki..."
                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, outline: 'none', background: '#fff' }}
              />
            </div>

            {/* LISTA STRANK */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(client => (
                <div key={client.org_id} style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#0D1F12' }}>{client.org_name}</div>
                      {client.vat_registered && (
                        <div style={{ fontSize: 10, background: '#E1F5EE', color: '#0E5E3B', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>DDV</div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                      {client.tax_number ? `SI${client.tax_number}` : '—'}
                      {client.tax_system && ` · ${TAX_SYSTEM_LABELS[client.tax_system] ?? client.tax_system}`}
                    </div>
                  </div>

                  {/* Statistike */}
                  {client.stats && (
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>{client.stats.invoices_count}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>računov</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#1D9E75' }}>€{Math.round(client.stats.invoices_total).toLocaleString('sl-SI')}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>prihodki</div>
                      </div>
                      {client.stats.overdue_count > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626' }}>{client.stats.overdue_count}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>zamuda</div>
                        </div>
                      )}
                      {client.stats.receipts_unconfirmed > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#D97706' }}>{client.stats.receipts_unconfirmed}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>nepotrjeni</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Akcije */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Link href={`/racunovodja/${client.org_id}`} style={{ background: '#0D1F12', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                      Pregled →
                    </Link>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
