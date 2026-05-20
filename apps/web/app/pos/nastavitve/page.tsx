'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import HowTo from '@/components/HowTo'

// ============================================================================
// TIPI
// ============================================================================

interface Premise {
  id: string
  premise_id: string
  name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  is_active: boolean
}

interface Device {
  id: string
  premise_id: string
  device_id: string
  is_active: boolean
}

interface Certificate {
  id: string
  issuer: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
}

interface Category {
  id: string
  name: string
  color: string
  icon: string
  sort_order: number
  is_active: boolean
}

interface PosItem {
  id: string
  category_id: string | null
  name: string
  price: number
  vat_rate: number
  unit: string
  color: string | null
  emoji: string | null
  is_active: boolean
  sort_order: number
}

interface Space {
  id: string
  name: string
  type: string
  capacity: number | null
  sort_order: number
  is_active: boolean
}

interface Location {
  id: string
  name: string
  pin_code: string | null
  is_active: boolean
}

type TabId = 'profil' | 'furs' | 'cenik' | 'prostori' | 'lokacije'

// ============================================================================
// KONSTANTE
// ============================================================================

const PROFILES = [
  {
    id: 'all_in_one',
    name: 'Vse v enem',
    icon: '🌐',
    description: 'Vsi razdelki — najbolj fleksibilno.',
    modules: ['floor', 'sale', 'calendar', 'customers', 'packages', 'inventory', 'reports', 'admin'],
  },
  {
    id: 'restaurant',
    name: 'Restavracija',
    icon: '🍽️',
    description: 'Mize, naročila po sedežih, split, kuhinja.',
    modules: ['floor', 'sale', 'calendar', 'customers', 'inventory', 'reports', 'admin'],
  },
  {
    id: 'bar',
    name: 'Bar / Kavarna',
    icon: '🍺',
    description: 'Mize, bar tabs, hitra prodaja, happy hour.',
    modules: ['floor', 'sale', 'customers', 'inventory', 'reports', 'admin'],
  },
  {
    id: 'shop',
    name: 'Trgovina',
    icon: '🛒',
    description: 'Barkoda, zaloga, variante, vračila.',
    modules: ['sale', 'inventory', 'customers', 'reports', 'admin'],
  },
  {
    id: 'market',
    name: 'Tržnica / Stojnica',
    icon: '🥕',
    description: 'Najpreprostejši pogled — samo prodaja.',
    modules: ['sale', 'inventory', 'reports', 'admin'],
  },
  {
    id: 'services',
    name: 'Storitve',
    icon: '💆',
    description: 'Fizio, frizer, fitness — koledar je v ospredju.',
    modules: ['calendar', 'customers', 'packages', 'sale', 'reports', 'admin'],
  },
] as const

const ALL_MODULES = [
  { id: 'floor', label: 'Floor' },
  { id: 'sale', label: 'Sale' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'customers', label: 'Customers' },
  { id: 'packages', label: 'Packages' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'reports', label: 'Reports' },
  { id: 'admin', label: 'Admin' },
] as const

const COLORS = ['#1D9E75','#E8B547','#0D1F12','#E05A2B','#5B7FFF','#A855F7','#EC4899','#64748B']

const SPACE_TYPES = [
  { value: 'table', label: 'Miza' },
  { value: 'stall', label: 'Stojnica' },
  { value: 'room', label: 'Prostor/kabinet' },
  { value: 'counter', label: 'Pult' },
  { value: 'other', label: 'Drugo' },
]

// ============================================================================
// STYLES
// ============================================================================

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13,
  outline: 'none', background: '#fff', color: '#0D1F12',
}
const btnP: React.CSSProperties = {
  background: '#0D1F12', color: '#fff', border: 0,
  borderRadius: 8, padding: '9px 18px', fontSize: 13,
  fontWeight: 500, cursor: 'pointer',
}
const btnS: React.CSSProperties = {
  background: '#fff', color: '#666',
  border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8,
  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14,
  border: '0.5px solid rgba(0,0,0,0.08)',
  padding: 24, marginBottom: 16,
}

// ============================================================================
// TOAST HOOK
// ============================================================================

function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const show = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PosNastavitvePage() {
  const router = useRouter()
  const supabase = createClient()
  const { toast, show } = useToast()

  // ----- Globalno -----
  const [orgId, setOrgId] = useState<string | null>(null)
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [tab, setTab] = useState<TabId>('profil')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ----- Profil -----
  const [posProfile, setPosProfile] = useState<string>('all_in_one')
  const [posModules, setPosModules] = useState<Record<string, boolean>>({})

  // ----- FURS -----
  const [premises, setPremises] = useState<Premise[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [testing, setTesting] = useState(false)
  const [premiseModal, setPremiseModal] = useState<Partial<Premise> & { device_id?: string } | null>(null)
  const [certModal, setCertModal] = useState(false)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState('')

  // ----- Cenik -----
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<PosItem[]>([])
  const [catModal, setCatModal] = useState<Partial<Category> | null>(null)
  const [itemModal, setItemModal] = useState<Partial<PosItem> | null>(null)

  // ----- Prostori -----
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceModal, setSpaceModal] = useState<Partial<Space> | null>(null)

  // ----- Lokacije -----
  const [locations, setLocations] = useState<Location[]>([])
  const [locationModal, setLocationModal] = useState<Partial<Location> | null>(null)

  // ==========================================================================
  // LOAD
  // ==========================================================================

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: member } = await supabase
        .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      setOrgId(member.org_id)

      const [premRes, devRes, certRes, catRes, itemRes, spaceRes, locRes, orgRes] = await Promise.all([
        supabase.from('business_premises').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('electronic_devices').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('furs_certificates').select('id,issuer,valid_from,valid_to,is_active').eq('org_id', member.org_id).eq('is_active', true).maybeSingle(),
        supabase.from('pos_categories').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_items').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_spaces').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_locations').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('organizations').select('vat_registered, pos_profile, pos_modules').eq('id', member.org_id).single(),
      ])

      setPremises(premRes.data ?? [])
      setDevices(devRes.data ?? [])
      setCertificate(certRes.data ?? null)
      setCategories(catRes.data ?? [])
      setItems(itemRes.data ?? [])
      setSpaces(spaceRes.data ?? [])
      setLocations(locRes.data ?? [])
      setIsVatRegistered(orgRes.data?.vat_registered ?? false)

      const profileId = orgRes.data?.pos_profile ?? 'all_in_one'
      setPosProfile(profileId)
      const savedModules = orgRes.data?.pos_modules as Record<string, boolean> | null
      if (savedModules && Object.keys(savedModules).length > 0) {
        setPosModules(savedModules)
      } else {
        const profile = PROFILES.find(p => p.id === profileId) ?? PROFILES[0]
        const mods: Record<string, boolean> = {}
        for (const m of ALL_MODULES) mods[m.id] = (profile.modules as readonly string[]).includes(m.id)
        setPosModules(mods)
      }

      setLoading(false)
    }
    load()
  }, [router, supabase])

  // ==========================================================================
  // PROFIL — SAVE
  // ==========================================================================

  async function selectProfile(profileId: string) {
    const profile = PROFILES.find(p => p.id === profileId) ?? PROFILES[0]
    const mods: Record<string, boolean> = {}
    for (const m of ALL_MODULES) mods[m.id] = (profile.modules as readonly string[]).includes(m.id)
    setPosProfile(profileId)
    setPosModules(mods)
    await saveProfile(profileId, mods)
  }

  async function toggleModule(moduleId: string) {
    const next = { ...posModules, [moduleId]: !posModules[moduleId] }
    setPosModules(next)
    await saveProfile(posProfile, next)
  }

  async function saveProfile(profileId: string, mods: Record<string, boolean>) {
    if (!orgId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ pos_profile: profileId, pos_modules: mods })
        .eq('id', orgId)
      if (error) throw new Error(error.message)
      show('success', 'Profil shranjen')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  // ==========================================================================
  // FURS — PREMISES
  // ==========================================================================

  async function savePremise() {
    if (!orgId || !premiseModal) return
    if (!premiseModal.premise_id?.trim() || !premiseModal.name?.trim()) {
      show('error', 'Oznaka in ime prostora sta obvezna'); return
    }
    setSaving(true)
    try {
      const payload = {
        org_id: orgId,
        premise_id: premiseModal.premise_id.trim().toUpperCase(),
        name: premiseModal.name.trim(),
        address: premiseModal.address?.trim() || null,
        postal_code: premiseModal.postal_code?.trim() || null,
        city: premiseModal.city?.trim() || null,
        premise_type: 'static',
        is_active: true,
      }
      let savedPremiseId: string | null = null
      if (premiseModal.id) {
        const { error } = await supabase.from('business_premises').update(payload).eq('id', premiseModal.id)
        if (error) throw new Error(error.message)
        savedPremiseId = premiseModal.id
      } else {
        const { data: prem, error } = await supabase.from('business_premises').insert(payload).select().single()
        if (error) throw new Error(error.message)
        savedPremiseId = prem.id
        // Ustvari napravo
        const devId = premiseModal.device_id?.trim().toUpperCase() || 'RACUNK001'
        const { error: devErr } = await supabase.from('electronic_devices').insert({
          org_id: orgId, premise_id: prem.id, device_id: devId, is_active: true,
        })
        if (devErr) throw new Error(devErr.message)
      }
      const [premRes, devRes] = await Promise.all([
        supabase.from('business_premises').select('*').eq('org_id', orgId).order('created_at'),
        supabase.from('electronic_devices').select('*').eq('org_id', orgId).order('created_at'),
      ])
      setPremises(premRes.data ?? [])
      setDevices(devRes.data ?? [])
      setPremiseModal(null)
      show('success', premiseModal.id ? 'Prostor posodobljen' : 'Prostor dodan')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function deletePremise(id: string, premId: string) {
    if (!confirm(`Izbrišem prostor ${premId}?`)) return
    await supabase.from('electronic_devices').delete().eq('premise_id', id)
    await supabase.from('business_premises').delete().eq('id', id)
    setPremises(prev => prev.filter(p => p.id !== id))
    setDevices(prev => prev.filter(d => d.premise_id !== id))
    show('success', `Prostor ${premId} izbrisan`)
  }

  // ==========================================================================
  // FURS — CERTIFICATE
  // ==========================================================================

  async function uploadCertificate() {
    if (!orgId || !certFile) return
    if (!certPassword.trim()) { show('error', 'Geslo certifikata je obvezno'); return }
    setSaving(true)
    try {
      const ab = await certFile.arrayBuffer()
      const base64 = Buffer.from(ab).toString('base64')
      const { error } = await supabase.from('furs_certificates').upsert({
        org_id: orgId,
        certificate_data: base64,
        certificate_password: certPassword,
        issuer: 'SIGEN-CA',
        is_active: true,
      }, { onConflict: 'org_id' })
      if (error) throw new Error(error.message)
      const { data: certData } = await supabase
        .from('furs_certificates')
        .select('id,issuer,valid_from,valid_to,is_active')
        .eq('org_id', orgId).eq('is_active', true).maybeSingle()
      setCertificate(certData ?? null)
      setCertModal(false); setCertFile(null); setCertPassword('')
      show('success', 'Certifikat naložen')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function testFursConnection() {
    if (!certificate) { show('error', 'Najprej naložite certifikat'); return }
    if (premises.length === 0) { show('error', 'Najprej dodajte poslovni prostor'); return }
    setTesting(true)
    try {
      const res = await fetch('/api/furs/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.success) show('success', `✓ FURS test uspešen! EOR: ${data.eor?.substring(0, 8)}...`)
      else show('error', `FURS test napaka: ${data.error}`)
    } catch (e: any) {
      show('error', `Napaka: ${e.message}`)
    }
    setTesting(false)
  }

  // ==========================================================================
  // CENIK — KATEGORIJE
  // ==========================================================================

  async function saveCategory() {
    if (!orgId || !catModal?.name?.trim()) { show('error', 'Ime kategorije je obvezno'); return }
    setSaving(true)
    try {
      if (catModal.id) {
        const { error } = await supabase.from('pos_categories')
          .update({ name: catModal.name, color: catModal.color, icon: catModal.icon })
          .eq('id', catModal.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('pos_categories').insert({
          org_id: orgId,
          name: catModal.name,
          color: catModal.color ?? '#1D9E75',
          icon: catModal.icon ?? '📦',
          sort_order: categories.length,
        })
        if (error) throw new Error(error.message)
      }
      const { data } = await supabase.from('pos_categories').select('*').eq('org_id', orgId).order('sort_order')
      setCategories(data ?? [])
      setCatModal(null)
      show('success', catModal.id ? 'Kategorija posodobljena' : 'Kategorija dodana')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('Izbrišem kategorijo? Artikli brez kategorije ostanejo.')) return
    await supabase.from('pos_categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
    show('success', 'Kategorija izbrisana')
  }

  // ==========================================================================
  // CENIK — ARTIKLI
  // ==========================================================================

  async function saveItem() {
    if (!orgId || !itemModal?.name?.trim()) { show('error', 'Ime artikla je obvezno'); return }
    if (!itemModal.price || itemModal.price <= 0) { show('error', 'Cena mora biti večja od 0'); return }
    setSaving(true)
    try {
      const payload = {
        org_id: orgId,
        category_id: itemModal.category_id || null,
        name: itemModal.name,
        price: itemModal.price,
        vat_rate: isVatRegistered ? (itemModal.vat_rate ?? 9.5) : 0,
        unit: itemModal.unit ?? 'kos',
        color: itemModal.color || null,
        emoji: itemModal.emoji || null,
        sort_order: itemModal.sort_order ?? items.length,
        is_active: itemModal.is_active ?? true,
      }
      if (itemModal.id) {
        const { error } = await supabase.from('pos_items').update(payload).eq('id', itemModal.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('pos_items').insert(payload)
        if (error) throw new Error(error.message)
      }
      const { data } = await supabase.from('pos_items').select('*').eq('org_id', orgId).order('sort_order')
      setItems(data ?? [])
      setItemModal(null)
      show('success', itemModal.id ? 'Artikel posodobljen' : 'Artikel dodan')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Izbrišem artikel?')) return
    await supabase.from('pos_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    show('success', 'Artikel izbrisan')
  }

  async function toggleItem(id: string, is_active: boolean) {
    await supabase.from('pos_items').update({ is_active: !is_active }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !is_active } : i))
  }

  // ==========================================================================
  // PROSTORI
  // ==========================================================================

  async function saveSpace() {
    if (!orgId || !spaceModal?.name?.trim()) { show('error', 'Ime prostora je obvezno'); return }
    setSaving(true)
    try {
      const payload = {
        org_id: orgId,
        name: spaceModal.name,
        type: spaceModal.type ?? 'table',
        capacity: spaceModal.capacity || null,
        sort_order: spaceModal.sort_order ?? spaces.length,
        is_active: spaceModal.is_active ?? true,
      }
      if (spaceModal.id) {
        const { error } = await supabase.from('pos_spaces').update(payload).eq('id', spaceModal.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('pos_spaces').insert(payload)
        if (error) throw new Error(error.message)
      }
      const { data } = await supabase.from('pos_spaces').select('*').eq('org_id', orgId).order('sort_order')
      setSpaces(data ?? [])
      setSpaceModal(null)
      show('success', spaceModal.id ? 'Prostor posodobljen' : 'Prostor dodan')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function deleteSpace(id: string) {
    if (!confirm('Izbrišem prostor?')) return
    await supabase.from('pos_spaces').delete().eq('id', id)
    setSpaces(prev => prev.filter(s => s.id !== id))
    show('success', 'Prostor izbrisan')
  }

  // ==========================================================================
  // LOKACIJE
  // ==========================================================================

  async function saveLocation() {
    if (!orgId || !locationModal?.name?.trim()) { show('error', 'Ime lokacije je obvezno'); return }
    setSaving(true)
    try {
      const pin = locationModal.pin_code?.trim() || Math.floor(1000 + Math.random() * 9000).toString()
      const payload = { org_id: orgId, name: locationModal.name, pin_code: pin, is_active: locationModal.is_active ?? true }
      if (locationModal.id) {
        const { error } = await supabase.from('pos_locations').update(payload).eq('id', locationModal.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('pos_locations').insert(payload)
        if (error) throw new Error(error.message)
      }
      const { data } = await supabase.from('pos_locations').select('*').eq('org_id', orgId).order('created_at')
      setLocations(data ?? [])
      setLocationModal(null)
      show('success', locationModal.id ? 'Lokacija posodobljena' : 'Lokacija dodana')
    } catch (e: any) {
      show('error', e.message)
    }
    setSaving(false)
  }

  async function deleteLocation(id: string) {
    if (!confirm('Izbrišem lokacijo?')) return
    await supabase.from('pos_locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
    show('success', 'Lokacija izbrisana')
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  const isFursReady = premises.length > 0 && certificate !== null

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>

      {/* ============ HEADER ============ */}
      <div style={{ background: '#0D1F12', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push('/pos')} style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13 }}>
          ← POS terminal
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#E8B547', fontSize: 11, fontWeight: 700, letterSpacing: '.06em' }}>POS NASTAVITVE</div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>Konfiguracija blagajne</div>
        </div>
        <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}>
          Računko →
        </Link>
      </div>

      {/* ============ TABS ============ */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '0 24px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {([
          { id: 'profil',    label: '🌐 Tip poslovanja' },
          { id: 'furs',      label: '🏛️ Davčna blagajna' },
          { id: 'cenik',     label: '🛍️ Cenik' },
          { id: 'prostori',  label: '🪑 Prostori' },
          { id: 'lokacije',  label: '📍 Lokacije & PIN' },
        ] as { id: TabId; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 0,
            borderBottom: tab === t.id ? '2px solid #0D1F12' : '2px solid transparent',
            padding: '14px 18px', fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#0D1F12' : '#888',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* ============ TAB: PROFIL ============ */}
        {tab === 'profil' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: '#0D1F12', margin: 0 }}>Tip poslovanja</h2>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                Izberi tip, ki najbolj ustreza tvojemu poslovanju. Vpliva na razdelke v meniju in funkcije.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 32 }}>
              {PROFILES.map(p => {
                const selected = posProfile === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => selectProfile(p.id)}
                    style={{
                      background: '#fff',
                      border: selected ? '2px solid #1D9E75' : '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 14, padding: 20, cursor: 'pointer', position: 'relative',
                      transition: 'border 0.15s, transform 0.15s',
                    }}
                  >
                    {selected && (
                      <div style={{ position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: '50%', background: '#1D9E75', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13 }}>✓</div>
                    )}
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F7F6F2', display: 'grid', placeItems: 'center', fontSize: 26, marginBottom: 14 }}>{p.icon}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F12', marginBottom: 6 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>{p.description}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {p.modules.map(m => (
                        <span key={m} style={{ fontSize: 10, fontWeight: 600, background: '#F7F6F2', color: '#666', padding: '4px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Custom moduli */}
            <div style={card}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Aktivni razdelki</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  Prilagodi izbiro — ti razdelki bodo vidni v POS terminalu.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {ALL_MODULES.map(m => {
                  const on = !!posModules[m.id]
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModule(m.id)}
                      style={{
                        background: on ? '#0D1F12' : '#F7F6F2',
                        color: on ? '#fff' : '#888',
                        border: 0, borderRadius: 10, padding: '10px 14px',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: on ? '#1D9E75' : 'rgba(0,0,0,0.1)', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff' }}>{on ? '✓' : ''}</span>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ============ TAB: FURS ============ */}
        {tab === 'furs' && (
          <>
            {/* Status banner */}
            <div style={{
              background: isFursReady ? '#0D1F12' : '#FFF8E7',
              borderRadius: 12, padding: '16px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 24 }}>{isFursReady ? '✅' : '⚠️'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isFursReady ? '#E8B547' : '#92600A' }}>
                  {isFursReady ? 'Blagajna je pripravljena' : 'Blagajna ni aktivna'}
                </div>
                <div style={{ fontSize: 12, color: isFursReady ? 'rgba(255,255,255,0.6)' : '#92600A', marginTop: 2 }}>
                  {isFursReady
                    ? `${premises.length} poslovni prostor · certifikat aktiven · pripravljeni za FURS potrjevanje`
                    : 'Dodajte poslovni prostor in certifikat za FURS potrjevanje'}
                </div>
              </div>
              {isFursReady && (
                <button onClick={testFursConnection} disabled={testing} style={{ background: '#E8B547', color: '#0D1F12', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {testing ? 'Testiram...' : 'Testiraj FURS'}
                </button>
              )}
            </div>

            {/* Poslovni prostori */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Poslovni prostori</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Predhodno registrirajte v eDavki → Davčne blagajne</div>
                </div>
                <button onClick={() => setPremiseModal({ premise_id: '', name: '', address: '', postal_code: '', city: '', device_id: 'RACUNK001' })} style={btnP}>+ Dodaj prostor</button>
              </div>

              {premises.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni poslovnih prostorov</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {premises.map(p => {
                    const dev = devices.find(d => d.premise_id === p.id)
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#F7F6F2', borderRadius: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E1F5EE', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🏢</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{p.name ?? p.premise_id}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 1, fontFamily: 'monospace' }}>
                            {p.premise_id} · {dev?.device_id ?? '—'} · {p.address}, {p.postal_code} {p.city}
                          </div>
                        </div>
                        <button onClick={() => setPremiseModal({ ...p, device_id: dev?.device_id })} style={{ background: 'none', border: 0, color: '#888', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}>✏️</button>
                        <button onClick={() => deletePremise(p.id, p.premise_id)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Certifikat */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Digitalno potrdilo (SIGEN-CA)</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>.p12 certifikat za podpisovanje FURS zahtev</div>
                </div>
                <button onClick={() => setCertModal(true)} style={{ ...btnP, background: certificate ? '#F7F6F2' : '#0D1F12', color: certificate ? '#0D1F12' : '#fff' }}>
                  {certificate ? '↺ Zamenjaj' : '+ Naloži certifikat'}
                </button>
              </div>

              {certificate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#E1F5EE', borderRadius: 10 }}>
                  <div style={{ fontSize: 24 }}>🔐</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0E5E3B' }}>Certifikat aktiven</div>
                    <div style={{ fontSize: 11, color: '#1D9E75', marginTop: 1 }}>
                      {certificate.issuer ?? 'SIGEN-CA'}
                      {certificate.valid_to ? ` · velja do ${new Date(certificate.valid_to).toLocaleDateString('sl-SI')}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, background: '#1D9E75', color: '#fff', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>AKTIVEN</div>
                </div>
              ) : (
                <div style={{ padding: '16px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Ni certifikata — blagajna ne more potrjevati računov pri FURS
                </div>
              )}
            </div>

            <HowTo
              title="Kako registriram davčno blagajno pri FURS?"
              steps={[
                { icon: "🔐", title: "Pridobite SIGEN-CA certifikat", desc: "sigen-ca.si → Pridobite potrdilo (~€25/leto, 1-3 dni)" },
                { icon: "🏛️", title: "Registrirajte se na eDavki", desc: "eDavki → Davčne blagajne → Nov zavezanec" },
                { icon: "🏢", title: "Dodajte poslovni prostor", desc: "eDavki → Davčne blagajne → Poslovni prostori → Dodaj → zapišite oznako (npr. SIRBFB01)" },
                { icon: "💻", title: "Dodajte elektronsko napravo", desc: "V poslovnem prostoru → Naprave → Dodaj → Vrsta: Programska oprema → Oznaka: RACUNK001" },
                { icon: "📤", title: "Izvozite certifikat (.p12)", desc: "Keychain Access → poiščite certifikat → Export → .p12 → nastavite geslo" },
                { icon: "⬆️", title: "Naložite certifikat v Računko", desc: "Kliknite Naloži certifikat → izberite .p12 → vnesite geslo → shranite" },
                { icon: "🧪", title: "Testirajte povezavo", desc: "Kliknite Testiraj FURS — zelena potrditev = blagajna aktivna" },
              ]}
              tip="Certifikat velja 1-2 leti. Računko vas bo opozoril pred iztekom."
            />
          </>
        )}

        {/* ============ TAB: CENIK ============ */}
        {tab === 'cenik' && (
          <>
            {/* Kategorije */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Kategorije</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Zavihki v POS terminalu</div>
                </div>
                <button onClick={() => setCatModal({ color: '#1D9E75', icon: '📦' })} style={btnP}>+ Dodaj kategorijo</button>
              </div>

              {categories.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni kategorij</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F7F6F2', borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                      <span style={{ fontSize: 16 }}>{c.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: '#aaa' }}>({items.filter(i => i.category_id === c.id).length})</span>
                      <button onClick={() => setCatModal(c)} style={{ background: 'none', border: 0, color: '#888', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>✏️</button>
                      <button onClick={() => deleteCategory(c.id)} style={{ background: 'none', border: 0, color: '#888', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Artikli */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Artikli & Storitve</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{items.length} artiklov · {items.filter(i => i.is_active).length} aktivnih</div>
                </div>
                <button onClick={() => setItemModal({ vat_rate: isVatRegistered ? 9.5 : 0, unit: 'kos', is_active: true })} style={btnP}>+ Dodaj artikel</button>
              </div>

              {categories.length > 0 ? (
                [...categories, { id: 'none', name: 'Brez kategorije', color: '#aaa', icon: '—', sort_order: 999, is_active: true }].map(cat => {
                  const catItems = items.filter(i => cat.id === 'none' ? !i.category_id : i.category_id === cat.id)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat.id} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '.04em', textTransform: 'uppercase' }}>{cat.name}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {catItems.map(item => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: item.is_active ? '#F7F6F2' : '#fff', borderRadius: 10, border: item.is_active ? 'none' : '0.5px solid rgba(0,0,0,0.08)', opacity: item.is_active ? 1 : 0.5 }}>
                            {item.emoji && <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.emoji}</span>}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{item.name}</div>
                              <div style={{ fontSize: 11, color: '#888', marginTop: 1, fontFamily: 'monospace' }}>
                                {item.unit} · DDV {item.vat_rate}%
                              </div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F12', minWidth: 60, textAlign: 'right' }}>€{Number(item.price).toFixed(2)}</div>
                            <button onClick={() => toggleItem(item.id, item.is_active)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 16 }} title={item.is_active ? 'Deaktiviraj' : 'Aktiviraj'}>{item.is_active ? '✅' : '⭕'}</button>
                            <button onClick={() => setItemModal(item)} style={{ background: 'none', border: 0, color: '#888', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}>✏️</button>
                            <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 0, color: '#888', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}>🗑️</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F7F6F2', borderRadius: 10 }}>
                      {item.emoji && <span style={{ fontSize: 20 }}>{item.emoji}</span>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>DDV {item.vat_rate}%</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>€{Number(item.price).toFixed(2)}</div>
                      <button onClick={() => setItemModal(item)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12, padding: '4px 6px', color: '#888' }}>✏️</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12, padding: '4px 6px', color: '#888' }}>🗑️</button>
                    </div>
                  ))}
                  {items.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni artiklov</div>}
                </div>
              )}
            </div>
          </>
        )}

        {/* ============ TAB: PROSTORI ============ */}
        {tab === 'prostori' && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Prostori & Mize</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Mize, stojnice, kabineti — kar koli rabite</div>
              </div>
              <button onClick={() => setSpaceModal({ type: 'table', is_active: true })} style={btnP}>+ Dodaj prostor</button>
            </div>

            {spaces.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni prostorov</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {spaces.map(s => (
                  <div key={s.id} style={{ background: '#F7F6F2', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>
                      {s.type === 'table' ? '🪑' : s.type === 'stall' ? '⛺' : s.type === 'room' ? '🚪' : s.type === 'counter' ? '🍺' : '📍'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {SPACE_TYPES.find(t => t.value === s.type)?.label}
                      {s.capacity ? ` · ${s.capacity} mest` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 10 }}>
                      <button onClick={() => setSpaceModal(s)} style={{ ...btnS, padding: '5px 10px', fontSize: 11 }}>✏️</button>
                      <button onClick={() => deleteSpace(s.id)} style={{ ...btnS, padding: '5px 10px', fontSize: 11 }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ TAB: LOKACIJE ============ */}
        {tab === 'lokacije' && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Lokacije & PIN kode</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Vsaka lokacija dobi PIN za prijavo na POS terminal</div>
              </div>
              <button onClick={() => setLocationModal({ is_active: true })} style={btnP}>+ Dodaj lokacijo</button>
            </div>

            {locations.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni lokacij</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locations.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#F7F6F2', borderRadius: 12 }}>
                    <div style={{ fontSize: 28 }}>📍</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>{l.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        PIN za POS terminal:&nbsp;
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0D1F12', letterSpacing: 4, fontSize: 14 }}>{l.pin_code}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 6, padding: '3px 8px', color: '#888' }}>
                      računko.si/pos
                    </div>
                    <button onClick={() => setLocationModal(l)} style={{ ...btnS, padding: '7px 12px', fontSize: 12 }}>✏️ Uredi</button>
                    <button onClick={() => deleteLocation(l.id)} style={{ ...btnS, padding: '7px 12px', fontSize: 12 }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, background: '#E1F5EE', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#0E5E3B', lineHeight: 1.6 }}>
              💡 Vsak prodajalec odpre <strong>računko.si/pos</strong> in vnese PIN. Cenik je skupen za vse lokacije.
            </div>
          </div>
        )}

      </div>

      {/* ============ MODAL: POSLOVNI PROSTOR ============ */}
      {premiseModal && (
        <Modal onClose={() => setPremiseModal(null)} title={premiseModal.id ? 'Uredi prostor' : 'Nov poslovni prostor'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Ime *">
              <input value={premiseModal.name ?? ''} onChange={e => setPremiseModal(p => ({ ...p!, name: e.target.value }))} placeholder="ŠIRM fitness&bar" style={inp} autoFocus />
            </Field>
            <Field label="Oznaka * (iz eDavki)">
              <input value={premiseModal.premise_id ?? ''} onChange={e => setPremiseModal(p => ({ ...p!, premise_id: e.target.value.toUpperCase() }))} placeholder="SIRBFB01" style={{ ...inp, fontFamily: 'monospace' }} />
            </Field>
          </div>
          <Field label="Naslov">
            <input value={premiseModal.address ?? ''} onChange={e => setPremiseModal(p => ({ ...p!, address: e.target.value }))} placeholder="Poljanska cesta 87" style={inp} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <Field label="Poštna">
              <input value={premiseModal.postal_code ?? ''} onChange={e => setPremiseModal(p => ({ ...p!, postal_code: e.target.value }))} placeholder="4224" style={inp} />
            </Field>
            <Field label="Kraj">
              <input value={premiseModal.city ?? ''} onChange={e => setPremiseModal(p => ({ ...p!, city: e.target.value }))} placeholder="Gorenja vas" style={inp} />
            </Field>
          </div>
          {!premiseModal.id && (
            <Field label="Oznaka naprave">
              <input value={premiseModal.device_id ?? 'RACUNK001'} onChange={e => setPremiseModal(p => ({ ...p!, device_id: e.target.value.toUpperCase() }))} placeholder="RACUNK001" style={{ ...inp, fontFamily: 'monospace' }} />
            </Field>
          )}
          <div style={{ background: '#F7F6F2', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
            💡 Oznake morajo biti predhodno registrirane v eDavki → Davčne blagajne.
          </div>
          <ModalActions onCancel={() => setPremiseModal(null)} onSave={savePremise} saving={saving} />
        </Modal>
      )}

      {/* ============ MODAL: CERTIFIKAT ============ */}
      {certModal && (
        <Modal onClose={() => { setCertModal(false); setCertFile(null); setCertPassword('') }} title="Naloži .p12 certifikat">
          <Field label="Certifikat (.p12 file) *">
            <input type="file" accept=".p12,.pfx" onChange={e => setCertFile(e.target.files?.[0] ?? null)} style={{ ...inp, padding: '8px 12px' }} />
            {certFile && <div style={{ fontSize: 11, color: '#1D9E75', marginTop: 4 }}>✓ {certFile.name} ({(certFile.size / 1024).toFixed(1)} KB)</div>}
          </Field>
          <Field label="Geslo certifikata *">
            <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} placeholder="Geslo iz exporta" style={inp} />
          </Field>
          <div style={{ background: '#FFF8E7', border: '0.5px solid #F5D68A', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92600A', lineHeight: 1.5 }}>
            🔒 Certifikat je shranjen šifrirano. Nikoli ne delite ga z drugimi.
          </div>
          <ModalActions
            onCancel={() => { setCertModal(false); setCertFile(null); setCertPassword('') }}
            onSave={uploadCertificate}
            saving={saving}
            saveLabel="🔐 Naloži"
            saveDisabled={!certFile || !certPassword}
          />
        </Modal>
      )}

      {/* ============ MODAL: KATEGORIJA ============ */}
      {catModal && (
        <Modal onClose={() => setCatModal(null)} title={catModal.id ? 'Uredi kategorijo' : 'Nova kategorija'}>
          <Field label="Ime *">
            <input value={catModal.name ?? ''} onChange={e => setCatModal(p => ({ ...p!, name: e.target.value }))} placeholder="Bar, Fitness, Storitve" style={inp} autoFocus />
          </Field>
          <Field label="Emoji">
            <input value={catModal.icon ?? '📦'} onChange={e => setCatModal(p => ({ ...p!, icon: e.target.value }))} style={{ ...inp, width: 80 }} />
          </Field>
          <Field label="Barva">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setCatModal(p => ({ ...p!, color: c }))} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: catModal.color === c ? '3px solid #0D1F12' : '3px solid transparent' }} />
              ))}
            </div>
          </Field>
          <ModalActions onCancel={() => setCatModal(null)} onSave={saveCategory} saving={saving} />
        </Modal>
      )}

      {/* ============ MODAL: ARTIKEL ============ */}
      {itemModal && (
        <Modal onClose={() => setItemModal(null)} title={itemModal.id ? 'Uredi artikel' : 'Nov artikel'} maxWidth={440}>
          <Field label="Ime artikla / storitve *">
            <input value={itemModal.name ?? ''} onChange={e => setItemModal(p => ({ ...p!, name: e.target.value }))} placeholder="Kava, Vstopnina, Masaža 60'" style={inp} autoFocus />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Cena (€) *">
              <input type="number" step="0.01" min="0" value={itemModal.price ?? ''} onChange={e => setItemModal(p => ({ ...p!, price: Number(e.target.value) }))} placeholder="0.00" style={inp} />
            </Field>
            <Field label="Enota">
              <input value={itemModal.unit ?? 'kos'} onChange={e => setItemModal(p => ({ ...p!, unit: e.target.value }))} placeholder="kos, ura, kg..." style={inp} />
            </Field>
          </div>
          <Field label="DDV stopnja">
            {!isVatRegistered ? (
              <div style={{ padding: '9px 12px', borderRadius: 8, background: '#F7F6F2', fontSize: 13, color: '#666' }}>
                0% — niste DDV zavezanec
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Spremenite v Računko → Profil podjetja</div>
              </div>
            ) : (
              <select value={itemModal.vat_rate ?? 9.5} onChange={e => setItemModal(p => ({ ...p!, vat_rate: Number(e.target.value) }))} style={inp}>
                <option value={0}>0% (oproščeno)</option>
                <option value={9.5}>9.5% (hrana, vstopnine)</option>
                <option value={22}>22% (splošna stopnja)</option>
              </select>
            )}
          </Field>
          <Field label="Kategorija">
            <select value={itemModal.category_id ?? ''} onChange={e => setItemModal(p => ({ ...p!, category_id: e.target.value || null }))} style={inp}>
              <option value="">Brez kategorije</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Emoji (neobvezno)">
              <input value={itemModal.emoji ?? ''} onChange={e => setItemModal(p => ({ ...p!, emoji: e.target.value }))} placeholder="☕ 🍺 💪" style={inp} />
            </Field>
            <Field label="Vrstni red">
              <input type="number" min="0" value={itemModal.sort_order ?? 0} onChange={e => setItemModal(p => ({ ...p!, sort_order: Number(e.target.value) }))} style={inp} />
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={itemModal.is_active ?? true} onChange={e => setItemModal(p => ({ ...p!, is_active: e.target.checked }))} />
            Artikel je aktiven
          </label>
          <ModalActions onCancel={() => setItemModal(null)} onSave={saveItem} saving={saving} />
        </Modal>
      )}

      {/* ============ MODAL: PROSTOR ============ */}
      {spaceModal && (
        <Modal onClose={() => setSpaceModal(null)} title={spaceModal.id ? 'Uredi prostor' : 'Nov prostor'}>
          <Field label="Ime *">
            <input value={spaceModal.name ?? ''} onChange={e => setSpaceModal(p => ({ ...p!, name: e.target.value }))} placeholder="Miza 1, Terasa, Stojnica A" style={inp} autoFocus />
          </Field>
          <Field label="Tip">
            <select value={spaceModal.type ?? 'table'} onChange={e => setSpaceModal(p => ({ ...p!, type: e.target.value }))} style={inp}>
              {SPACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Kapaciteta (neobvezno)">
            <input type="number" min="1" value={spaceModal.capacity ?? ''} onChange={e => setSpaceModal(p => ({ ...p!, capacity: Number(e.target.value) || null }))} placeholder="4" style={inp} />
          </Field>
          <Field label="Vrstni red">
            <input type="number" min="0" value={spaceModal.sort_order ?? 0} onChange={e => setSpaceModal(p => ({ ...p!, sort_order: Number(e.target.value) }))} style={inp} />
          </Field>
          <ModalActions onCancel={() => setSpaceModal(null)} onSave={saveSpace} saving={saving} />
        </Modal>
      )}

      {/* ============ MODAL: LOKACIJA ============ */}
      {locationModal && (
        <Modal onClose={() => setLocationModal(null)} title={locationModal.id ? 'Uredi lokacijo' : 'Nova lokacija'}>
          <Field label="Ime lokacije *">
            <input value={locationModal.name ?? ''} onChange={e => setLocationModal(p => ({ ...p!, name: e.target.value }))} placeholder="Bar, Tržnica, Stojnica 3" style={inp} autoFocus />
          </Field>
          <Field label="PIN koda (4 številke)">
            <input value={locationModal.pin_code ?? ''} onChange={e => setLocationModal(p => ({ ...p!, pin_code: e.target.value.replace(/\D/g, '').substring(0, 4) }))} placeholder="Prazno = avto" style={{ ...inp, fontFamily: 'monospace', letterSpacing: 8, fontSize: 18 }} maxLength={4} />
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Prodajalec vnese PIN za dostop do POS</div>
          </Field>
          <ModalActions onCancel={() => setLocationModal(null)} onSave={saveLocation} saving={saving} />
        </Modal>
      )}

      {/* ============ TOAST ============ */}
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
  )
}

// ============================================================================
// HELPER KOMPONENTE
// ============================================================================

function Modal({ children, onClose, title, maxWidth = 400 }: { children: React.ReactNode; onClose: () => void; title: string; maxWidth?: number }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function ModalActions({ onCancel, onSave, saving, saveLabel = 'Shrani', saveDisabled = false }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel?: string; saveDisabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
      <button onClick={onCancel} style={btnS}>Prekliči</button>
      <button onClick={onSave} disabled={saving || saveDisabled} style={{ ...btnP, opacity: (saving || saveDisabled) ? 0.4 : 1 }}>
        {saving ? 'Shranjujem...' : saveLabel}
      </button>
    </div>
  )
}
