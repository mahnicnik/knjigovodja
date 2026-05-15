'use client'

import { useEffect, useState, useCallback } from 'react'
import HowTo from '@/components/HowTo'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

// ===== TIPI =====
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

const COLORS = ['#1D9E75','#E8B547','#0D1F12','#E05A2B','#5B7FFF','#A855F7','#EC4899','#64748B']
const SPACE_TYPES = [
  { value: 'table', label: 'Miza' },
  { value: 'stall', label: 'Stojnica' },
  { value: 'room', label: 'Prostor/kabinet' },
  { value: 'counter', label: 'Pult' },
  { value: 'other', label: 'Drugo' },
]

// ===== TOAST =====
function useToast() {
  const [toast, setToast] = useState<{ type: 'success'|'error'; msg: string } | null>(null)
  const show = useCallback((type: 'success'|'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}

// ===== SHARED STYLES =====
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff', color: '#0D1F12' }
const btnP: React.CSSProperties = { background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const btnS: React.CSSProperties = { background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }

export default function PosAdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const { toast, show } = useToast()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [tab, setTab] = useState<'items'|'spaces'|'locations'>('items')
  const [loading, setLoading] = useState(true)

  // Data
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<PosItem[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  // Modals
  const [catModal, setCatModal] = useState<Partial<Category> | null>(null)
  const [itemModal, setItemModal] = useState<Partial<PosItem> | null>(null)
  const [spaceModal, setSpaceModal] = useState<Partial<Space> | null>(null)
  const [locationModal, setLocationModal] = useState<Partial<Location> | null>(null)
  const [saving, setSaving] = useState(false)

  // Load
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      setOrgId(member.org_id)

      const [catRes, itemRes, spaceRes, locRes, orgRes] = await Promise.all([
        supabase.from('pos_categories').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_items').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_spaces').select('*').eq('org_id', member.org_id).order('sort_order'),
        supabase.from('pos_locations').select('*').eq('org_id', member.org_id).order('created_at'),
        supabase.from('organizations').select('vat_registered').eq('id', member.org_id).single(),
      ])
      setCategories(catRes.data ?? [])
      setItems(itemRes.data ?? [])
      setSpaces(spaceRes.data ?? [])
      setLocations(locRes.data ?? [])
      setIsVatRegistered(orgRes.data?.vat_registered ?? false)
      setLoading(false)
    }
    load()
  }, [router, supabase])

  // ===== KATEGORIJE =====
  async function saveCategory() {
    if (!orgId || !catModal?.name?.trim()) { show('error', 'Ime kategorije je obvezno'); return }
    setSaving(true)
    try {
      if (catModal.id) {
        await supabase.from('pos_categories').update({ name: catModal.name, color: catModal.color, icon: catModal.icon }).eq('id', catModal.id)
      } else {
        await supabase.from('pos_categories').insert({ org_id: orgId, name: catModal.name, color: catModal.color ?? '#1D9E75', icon: catModal.icon ?? '📦', sort_order: categories.length })
      }
      const { data } = await supabase.from('pos_categories').select('*').eq('org_id', orgId).order('sort_order')
      setCategories(data ?? [])
      setCatModal(null)
      show('success', catModal.id ? 'Kategorija posodobljena' : 'Kategorija dodana')
    } catch (e: any) { show('error', e.message) }
    setSaving(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('Izbrišem kategorijo? Artikli brez kategorije ostanejo.')) return
    await supabase.from('pos_categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
    show('success', 'Kategorija izbrisana')
  }

  // ===== ARTIKLI =====
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
        await supabase.from('pos_items').update(payload).eq('id', itemModal.id)
      } else {
        await supabase.from('pos_items').insert(payload)
      }
      const { data } = await supabase.from('pos_items').select('*').eq('org_id', orgId).order('sort_order')
      setItems(data ?? [])
      setItemModal(null)
      show('success', itemModal.id ? 'Artikel posodobljen' : 'Artikel dodan')
    } catch (e: any) { show('error', e.message) }
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

  // ===== PROSTORI =====
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
        await supabase.from('pos_spaces').update(payload).eq('id', spaceModal.id)
      } else {
        await supabase.from('pos_spaces').insert(payload)
      }
      const { data } = await supabase.from('pos_spaces').select('*').eq('org_id', orgId).order('sort_order')
      setSpaces(data ?? [])
      setSpaceModal(null)
      show('success', spaceModal.id ? 'Prostor posodobljen' : 'Prostor dodan')
    } catch (e: any) { show('error', e.message) }
    setSaving(false)
  }

  async function deleteSpace(id: string) {
    if (!confirm('Izbrišem prostor?')) return
    await supabase.from('pos_spaces').delete().eq('id', id)
    setSpaces(prev => prev.filter(s => s.id !== id))
    show('success', 'Prostor izbrisan')
  }

  // ===== LOKACIJE =====
  async function saveLocation() {
    if (!orgId || !locationModal?.name?.trim()) { show('error', 'Ime lokacije je obvezno'); return }
    setSaving(true)
    try {
      const pin = locationModal.pin_code?.trim() || Math.floor(1000 + Math.random() * 9000).toString()
      const payload = { org_id: orgId, name: locationModal.name, pin_code: pin, is_active: locationModal.is_active ?? true }
      if (locationModal.id) {
        await supabase.from('pos_locations').update(payload).eq('id', locationModal.id)
      } else {
        await supabase.from('pos_locations').insert(payload)
      }
      const { data } = await supabase.from('pos_locations').select('*').eq('org_id', orgId).order('created_at')
      setLocations(data ?? [])
      setLocationModal(null)
      show('success', locationModal.id ? 'Lokacija posodobljena' : 'Lokacija dodana')
    } catch (e: any) { show('error', e.message) }
    setSaving(false)
  }

  async function deleteLocation(id: string) {
    if (!confirm('Izbrišem lokacijo?')) return
    await supabase.from('pos_locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
    show('success', 'Lokacija izbrisana')
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>

      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13 }}>← Nazaj</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#E8B547', fontSize: 11, fontWeight: 700, letterSpacing: '.06em' }}>POS ADMIN</div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>Upravljanje blagajne</div>
        </div>
        <Link href="/pos" style={{ background: '#1D9E75', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          → Odpri POS terminal
        </Link>
      </div>

      {/* TABS */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '0 24px', display: 'flex', gap: 0 }}>
        {([
          { id: 'items', label: '🛍️ Artikli & Kategorije' },
          { id: 'spaces', label: '🪑 Prostori & Mize' },
          { id: 'locations', label: '📍 Lokacije & PIN' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 0, borderBottom: tab === t.id ? '2px solid #0D1F12' : '2px solid transparent',
            padding: '14px 20px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#0D1F12' : '#888', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <HowTo
  title="Kako nastavim POS terminal?"
  steps={[
    { icon: '📂', title: 'Dodajte kategorije', desc: 'Kategorije so zavihki v POS terminalu. Npr: Bar, Fitness, Fizioterapija. Vsaki dodajte barvo in emoji.' },
    { icon: '🛍️', title: 'Dodajte artikle', desc: 'Za vsak artikel vnesite ime, ceno in kategorijo. Dodajte emoji za hitrejše prepoznavanje na zaslonu.' },
    { icon: '🪑', title: 'Dodajte prostore (opcijsko)', desc: 'Za bar/restavracijo dodajte mize ali prostore. Za tržnico dodajte stojnice.' },
    { icon: '📍', title: 'Dodajte lokacijo + PIN', desc: 'Za vsako napravo/blagajno ustvarite lokacijo s 4-mestnim PIN-om. Prodajalec ga vnese za dostop.' },
    { icon: '📱', title: 'Odprite POS terminal', desc: 'Na vsaki napravi odprite računko.si/pos → vnesite PIN → takoj lahko prodajate.' },
  ]}
  tip="Spremembe cen so vidne na vseh napravah takoj — ni treba posodabljati vsake naprave posebej."
/>

        {/* ===== ARTIKLI TAB ===== */}
        {tab === 'items' && (
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
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni kategorij — dodajte prvo</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F7F6F2', borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
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

              {/* Group by category */}
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
                  {items.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni artiklov — dodajte prvega</div>}
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== PROSTORI TAB ===== */}
        {tab === 'spaces' && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Prostori & Mize</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Mize, stojnice, kabineti — kar koli rabite</div>
              </div>
              <button onClick={() => setSpaceModal({ type: 'table', is_active: true })} style={btnP}>+ Dodaj prostor</button>
            </div>

            {spaces.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni prostorov — dodajte prvega</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {spaces.map(s => (
                  <div key={s.id} style={{ background: '#F7F6F2', borderRadius: 12, padding: '14px', textAlign: 'center', position: 'relative' }}>
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

        {/* ===== LOKACIJE TAB ===== */}
        {tab === 'locations' && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Lokacije & PIN kode</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Vsaka lokacija dobi PIN za prijavo na POS terminal</div>
              </div>
              <button onClick={() => setLocationModal({ is_active: true })} style={btnP}>+ Dodaj lokacijo</button>
            </div>

            {locations.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Ni lokacij — dodajte prvo</div>
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
              💡 Vsak prodajalec odpre <strong>računko.si/pos</strong> in vnese PIN. Cenik je skupen za vse lokacije — sprememba cen se takoj vidi na vseh napravah.
            </div>
          </div>
        )}
      </div>

      {/* ===== MODALI ===== */}

      {/* Kategorija modal */}
      {catModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setCatModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{catModal.id ? 'Uredi kategorijo' : 'Nova kategorija'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime *</label>
                <input value={catModal.name ?? ''} onChange={e => setCatModal(p => ({ ...p, name: e.target.value }))} placeholder="npr. Bar, Fitness, Storitve" style={inp} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Emoji ikona</label>
                <input value={catModal.icon ?? '📦'} onChange={e => setCatModal(p => ({ ...p, icon: e.target.value }))} placeholder="📦" style={{ ...inp, width: 80 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 8 }}>Barva</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setCatModal(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: catModal.color === c ? '3px solid #0D1F12' : '3px solid transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setCatModal(null)} style={btnS}>Prekliči</button>
              <button onClick={saveCategory} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Shranjujem...' : 'Shrani'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Artikel modal */}
      {itemModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setItemModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{itemModal.id ? 'Uredi artikel' : 'Nov artikel'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime artikla / storitve *</label>
                <input value={itemModal.name ?? ''} onChange={e => setItemModal(p => ({ ...p, name: e.target.value }))} placeholder="npr. Kava, Vstopnina, Masaža 60'" style={inp} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Cena (€) *</label>
                  <input type="number" step="0.01" min="0" value={itemModal.price ?? ''} onChange={e => setItemModal(p => ({ ...p, price: Number(e.target.value) }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Enota</label>
                  <input value={itemModal.unit ?? 'kos'} onChange={e => setItemModal(p => ({ ...p, unit: e.target.value }))} placeholder="kos, ura, kg..." style={inp} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>DDV stopnja</label>
                {!isVatRegistered ? (
                  <div style={{ padding: '9px 12px', borderRadius: 8, background: '#F7F6F2', fontSize: 13, color: '#666' }}>
                    0% — niste DDV zavezanec
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Spremenite v Nastavitve → Profil podjetja</div>
                  </div>
                ) : (
                  <select value={itemModal.vat_rate ?? 9.5} onChange={e => setItemModal(p => ({ ...p, vat_rate: Number(e.target.value) }))} style={inp}>
                    <option value={0}>0% (oproščeno)</option>
                    <option value={9.5}>9.5% (hrana, vstopnine)</option>
                    <option value={22}>22% (splošna stopnja)</option>
                  </select>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Kategorija</label>
                <select value={itemModal.category_id ?? ''} onChange={e => setItemModal(p => ({ ...p, category_id: e.target.value || null }))} style={inp}>
                  <option value="">Brez kategorije</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Emoji (neobvezno)</label>
                  <input value={itemModal.emoji ?? ''} onChange={e => setItemModal(p => ({ ...p, emoji: e.target.value }))} placeholder="☕ 🍺 💪" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Vrstni red</label>
                  <input type="number" min="0" value={itemModal.sort_order ?? 0} onChange={e => setItemModal(p => ({ ...p, sort_order: Number(e.target.value) }))} style={inp} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={itemModal.is_active ?? true} onChange={e => setItemModal(p => ({ ...p, is_active: e.target.checked }))} />
                Artikel je aktiven (viden v POS terminalu)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setItemModal(null)} style={btnS}>Prekliči</button>
              <button onClick={saveItem} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Shranjujem...' : 'Shrani'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Prostor modal */}
      {spaceModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setSpaceModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{spaceModal.id ? 'Uredi prostor' : 'Nov prostor'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime *</label>
                <input value={spaceModal.name ?? ''} onChange={e => setSpaceModal(p => ({ ...p, name: e.target.value }))} placeholder="npr. Miza 1, Terasa, Stojnica A" style={inp} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Tip</label>
                <select value={spaceModal.type ?? 'table'} onChange={e => setSpaceModal(p => ({ ...p, type: e.target.value }))} style={inp}>
                  {SPACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Kapaciteta (neobvezno)</label>
                <input type="number" min="1" value={spaceModal.capacity ?? ''} onChange={e => setSpaceModal(p => ({ ...p, capacity: Number(e.target.value) || null }))} placeholder="npr. 4" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Vrstni red</label>
                <input type="number" min="0" value={spaceModal.sort_order ?? 0} onChange={e => setSpaceModal(p => ({ ...p, sort_order: Number(e.target.value) }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setSpaceModal(null)} style={btnS}>Prekliči</button>
              <button onClick={saveSpace} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Shranjujem...' : 'Shrani'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Lokacija modal */}
      {locationModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setLocationModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{locationModal.id ? 'Uredi lokacijo' : 'Nova lokacija'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime lokacije *</label>
                <input value={locationModal.name ?? ''} onChange={e => setLocationModal(p => ({ ...p, name: e.target.value }))} placeholder="npr. Bar, Tržnica Ljubljana, Stojnica 3" style={inp} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>PIN koda (4 številke)</label>
                <input value={locationModal.pin_code ?? ''} onChange={e => setLocationModal(p => ({ ...p, pin_code: e.target.value.replace(/\D/g, '').substring(0, 4) }))} placeholder="Pusti prazno za avtomatsko" style={{ ...inp, fontFamily: 'monospace', letterSpacing: 8, fontSize: 18 }} maxLength={4} />
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Prodajalec vnese ta PIN za dostop do POS terminala</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setLocationModal(null)} style={btnS}>Prekliči</button>
              <button onClick={saveLocation} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Shranjujem...' : 'Shrani'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? '#0D1F12' : '#A32D2D', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

    </div>
  )
}
