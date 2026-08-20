'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

interface Item {
  id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  purchase_price: number
  sale_price: number
  vat_rate: number
  current_stock: number
  min_stock: number
  is_active: boolean
}

interface Movement {
  id: string
  item_id: string
  type: 'in' | 'out' | 'adjustment'
  quantity: number
  unit_price: number | null
  reference: string | null
  created_at: string
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }

// POPRAVLJENO (17.8.2026): slovenski zapis zneska. Prej "€1234.56" - angleska
// oblika z valuto spredaj in piko kot decimalnim locilom. V isti aplikaciji sta
// obstajala oba zapisa, kar je zgledalo kot napaka.
function fmt(n: number) { return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0) }

export default function ZalogePage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'items'|'movements'|'stats'>('items')
  const [toast, setToast] = useState<string | null>(null)

  // Item modal
  const [itemModal, setItemModal] = useState<Partial<Item> | null>(null)
  const [savingItem, setSavingItem] = useState(false)

  // Movement modal
  const [movModal, setMovModal] = useState<{ itemId: string; itemName: string; type: 'in'|'out'|'adjustment' } | null>(null)
  const [movQty, setMovQty] = useState(1)
  const [movPrice, setMovPrice] = useState(0)
  const [movRef, setMovRef] = useState('')
  const [savingMov, setSavingMov] = useState(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // POPRAVLJENO (17.8.2026): `load` je bil prej definiran ZNOTRAJ useEffect, zato
  // ga deleteItem() ni videl - po brisanju artikla se je stran sesula
  // (ReferenceError: load is not defined) namesto da bi osvezila seznam.
  // Zdaj je na ravni komponente in dosegljiv od vsepovsod.
  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (!member) return
    setOrgId(member.org_id)

    const [itemRes, movRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('org_id', member.org_id).order('name'),
      supabase.from('inventory_movements').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false }).limit(100),
    ])
    setItems(itemRes.data ?? [])
    setMovements(movRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase])

  // DODANO (11.8.2026): manjkala je moznost brisanja artikla - uporabnik
  // ni mogel odstraniti napacno vnesenih testnih vnosov.
  async function deleteItem(id: string) {
    if (!confirm('Res želite izbrisati ta artikel? To dejanje je nepovratno in bo izbrisalo tudi zgodovino gibanja zaloge zanj.')) return
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) {
      showToast('Napaka pri brisanju: ' + error.message)
      return
    }
    setItemModal(null)
    showToast('Artikel izbrisan')
    load()
  }

  async function saveItem() {
    if (!orgId || !itemModal?.name?.trim()) { showToast('Ime artikla je obvezno'); return }
    setSavingItem(true)
    try {
      if (itemModal.id) {
        // POPRAVLJENO (30.7.2026): prej brez preverjanja napake - try/catch
        // ujame samo vrzene izjeme, NE Supabase {error} odgovorov.
        const { error: updateError } = await supabase.from('inventory_items').update({
          name: itemModal.name, sku: itemModal.sku || null, category: itemModal.category || null,
          unit: itemModal.unit ?? 'kos', purchase_price: itemModal.purchase_price ?? 0,
          sale_price: itemModal.sale_price ?? 0, vat_rate: itemModal.vat_rate ?? 22,
          min_stock: itemModal.min_stock ?? 0,
        }).eq('id', itemModal.id)
        if (updateError) throw updateError
      } else {
        const { data: newItem, error: insertError } = await supabase.from('inventory_items').insert({
          org_id: orgId, name: itemModal.name, sku: itemModal.sku || null,
          category: itemModal.category || null, unit: itemModal.unit ?? 'kos',
          purchase_price: itemModal.purchase_price ?? 0, sale_price: itemModal.sale_price ?? 0,
          vat_rate: itemModal.vat_rate ?? 22, current_stock: itemModal.current_stock ?? 0,
          min_stock: itemModal.min_stock ?? 0,
        }).select().single()
        if (insertError) throw insertError

        // Če je začetna zaloga > 0, dodaj movement
        if ((itemModal.current_stock ?? 0) > 0 && newItem) {
          const { error: initErr } = await supabase.from('inventory_movements').insert({
            org_id: orgId, item_id: newItem.id, type: 'in',
            quantity: itemModal.current_stock, unit_price: itemModal.purchase_price ?? 0,
            reference: 'Začetna zaloga',
          })
          if (initErr) showToast('Artikel je shranjen, začetne zaloge pa ni bilo mogoče zabeležiti: ' + initErr.message)
        }
      }

      const { data } = await supabase.from('inventory_items').select('*').eq('org_id', orgId).order('name')
      setItems(data ?? [])
      setItemModal(null)
      showToast(itemModal.id ? 'Artikel posodobljen' : 'Artikel dodan')
    } catch (e: any) { showToast(e.message) }
    setSavingItem(false)
  }

  async function saveMovement() {
    if (!orgId || !movModal || movQty <= 0) { showToast('Količina mora biti večja od 0'); return }
    setSavingMov(true)
    try {
      // POPRAVLJENO (16.8.2026): prej brez preverbe napake - gibanje se ni
      // zapisalo, zaloga pa se je vseeno spremenila (ali obratno).
      const { error: movErr } = await supabase.from('inventory_movements').insert({
        org_id: orgId, item_id: movModal.itemId, type: movModal.type,
        quantity: movQty, unit_price: movPrice || null, reference: movRef.trim() || null,
      })
      if (movErr) throw new Error('Gibanja zaloge ni bilo mogoče zapisati: ' + movErr.message)

      // Posodobi zalogo
      // POPRAVLJENO (16.8.2026): prej branje zaloge iz ZASTARELEGA posnetka in
      // zapis ABSOLUTNE vrednosti - ce je vmes kdo drug spremenil zalogo (druga
      // seja, POS prodaja), se je tista sprememba izgubila. Zdaj atomarno v bazi.
      const item = items.find(i => i.id === movModal.itemId)
      if (item) {
        const { data: novaZaloga, error: stockErr } = movModal.type === 'adjustment'
          ? await supabase.rpc('set_inventory_stock', { p_item_id: item.id, p_value: movQty })
          : await supabase.rpc('adjust_inventory_stock', { p_item_id: item.id, p_delta: movModal.type === 'in' ? movQty : -movQty })
        if (stockErr) throw new Error('Zaloge ni bilo mogoče posodobiti: ' + stockErr.message)
        const newStock = Number(novaZaloga ?? item.current_stock)
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, current_stock: newStock } : i))
      }

      const { data: movData } = await supabase.from('inventory_movements').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100)
      setMovements(movData ?? [])
      setMovModal(null); setMovQty(1); setMovPrice(0); setMovRef('')
      showToast('Gibanje zaloge zabeleženo')
    } catch (e: any) { showToast(e.message) }
    setSavingMov(false)
  }

  async function toggleItem(id: string, is_active: boolean) {
    const { error: togErr } = await supabase.from('inventory_items').update({ is_active: !is_active }).eq('id', id)
    if (togErr) { showToast('Stanja ni bilo mogoče spremeniti: ' + togErr.message); return }
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !is_active } : i))
  }

  const lowStock = items.filter(i => i.is_active && i.current_stock <= i.min_stock && i.min_stock > 0)
  const totalValue = items.reduce((s, i) => s + i.current_stock * i.purchase_price, 0)
  const totalSaleValue = items.reduce((s, i) => s + i.current_stock * i.sale_price, 0)
  const avgMargin = items.length > 0 ? items.reduce((s, i) => s + (i.sale_price > 0 ? (i.sale_price - i.purchase_price) / i.sale_price * 100 : 0), 0) / items.filter(i => i.sale_price > 0).length : 0

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Zaloge</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
            <button onClick={() => setItemModal({ unit: 'kos', vat_rate: 22, current_stock: 0, min_stock: 0 })} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nov artikel</button>
          </div>
        </div>

        {lowStock.length > 0 && (
          <div style={{ maxWidth: 1100, margin: '12px auto 0', background: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#FCA5A5' }}>
            ⚠️ <strong>{lowStock.length} artiklov</strong> pod minimalno zalogo: {lowStock.map(i => i.name).join(', ')}
          </div>
        )}

        <div style={{ maxWidth: 1100, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Artiklov', value: items.filter(i => i.is_active).length, color: '#fff' },
            { label: 'Vrednost nabave', value: fmt(totalValue), color: '#FCD34D' },
            { label: 'Vrednost prodaje', value: fmt(totalSaleValue), color: '#6EE7B7' },
            { label: 'Povp. marža', value: `${avgMargin.toFixed(1)}%`, color: '#A78BFA' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex' }}>
          {([
            { id: 'items', label: `📦 Artikli (${items.length})` },
            { id: 'movements', label: `📋 Gibanja (${movements.length})` },
            { id: 'stats', label: '📊 Statistika' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 0, borderBottom: tab === t.id ? '2.5px solid #0D1F12' : '2.5px solid transparent', padding: '14px 20px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#0D1F12' : '#888', cursor: 'pointer' }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* ARTIKLI */}
        {tab === 'items' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {items.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                Ni artiklov — dodajte prvega
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {['Artikel', 'Kategorija', 'Zaloga', 'Min.', 'Nabavna', 'Prodajna', 'Marža', 'Vrednost', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isLow = item.is_active && item.current_stock <= item.min_stock && item.min_stock > 0
                    const margin = item.sale_price > 0 ? ((item.sale_price - item.purchase_price) / item.sale_price * 100) : 0
                    return (
                      <tr key={item.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', opacity: item.is_active ? 1 : 0.4, background: isLow ? '#FEF2F2' : '#fff' }}>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{item.sku}</div>}
                        </td>
                        <td style={{ padding: '12px 12px', fontSize: 12, color: '#666' }}>{item.category ?? '—'}</td>
                        <td style={{ padding: '12px 12px' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: isLow ? '#DC2626' : '#0D1F12' }}>
                            {item.current_stock} {item.unit}
                          </span>
                          {isLow && <span style={{ fontSize: 10, color: '#DC2626', display: 'block' }}>⚠️ Malo</span>}
                        </td>
                        <td style={{ padding: '12px 12px', fontSize: 12, color: '#888' }}>{item.min_stock} {item.unit}</td>
                        <td style={{ padding: '12px 12px', fontSize: 13, color: '#666' }}>{fmt(item.purchase_price)}</td>
                        <td style={{ padding: '12px 12px', fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{fmt(item.sale_price)}</td>
                        <td style={{ padding: '12px 12px', fontSize: 12, color: margin > 30 ? '#1D9E75' : '#888' }}>{margin.toFixed(1)}%</td>
                        <td style={{ padding: '12px 12px', fontSize: 13, color: '#666' }}>{fmt(item.current_stock * item.purchase_price)}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setMovModal({ itemId: item.id, itemName: item.name, type: 'in' })} style={{ fontSize: 11, background: '#E1F5EE', color: '#0E5E3B', border: 0, borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }} title="Prevzem">+</button>
                            <button onClick={() => setMovModal({ itemId: item.id, itemName: item.name, type: 'out' })} style={{ fontSize: 11, background: '#FEE2E2', color: '#DC2626', border: 0, borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }} title="Izdaja">−</button>
                            <button onClick={() => setItemModal(item)} style={{ fontSize: 11, background: '#F7F6F2', color: '#666', border: 0, borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }}>✏️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* GIBANJA */}
        {tab === 'movements' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {movements.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 14 }}>Ni gibanj zaloge</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {['Datum', 'Artikel', 'Vrsta', 'Količina', 'Cena/enoto', 'Referenca'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => {
                    const item = items.find(i => i.id === m.item_id)
                    const typeInfo = { in: { label: '⬆ Prevzem', color: '#1D9E75' }, out: { label: '⬇ Izdaja', color: '#DC2626' }, adjustment: { label: '⚖ Popravek', color: '#888' } }[m.type]
                    return (
                      <tr key={m.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#666' }}>{new Date(m.created_at).toLocaleDateString('sl-SI')}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: '#0D1F12' }}>{item?.name ?? '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: typeInfo.color }}>{typeInfo.label}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{m.quantity} {item?.unit ?? ''}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: '#666' }}>{m.unit_price ? fmt(m.unit_price) : '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>{m.reference ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* STATISTIKA */}
        {tab === 'stats' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {/* Top 5 po vrednosti */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, gridColumn: 'span 2' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>🏆 Top artikli po vrednosti zaloge</div>
              {[...items].sort((a, b) => (b.current_stock * b.sale_price) - (a.current_stock * a.sale_price)).slice(0, 5).map((item, i) => {
                const val = item.current_stock * item.sale_price
                const max = items[0] ? items[0]?.current_stock * items[0]?.sale_price : 1
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0D1F12', color: '#E8B547', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#0D1F12' }}>{item.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(val)}</span>
                      </div>
                      <div style={{ height: 4, background: '#F7F6F2', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${max > 0 ? (val / max * 100) : 0}%`, background: '#1D9E75', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Gibanja po tipu */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>📊 Gibanja</div>
              {[
                { type: 'in', label: 'Prevzemi', color: '#1D9E75' },
                { type: 'out', label: 'Izdaje', color: '#DC2626' },
                { type: 'adjustment', label: 'Popravki', color: '#888' },
              ].map(t => {
                const count = movements.filter(m => m.type === t.type).length
                return (
                  <div key={t.type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <span style={{ fontSize: 13, color: '#666' }}>{t.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{count}</span>
                  </div>
                )
              })}
            </div>

            {/* Opomniki za naročilo */}
            {lowStock.length > 0 && (
              <div style={{ background: '#FEF2F2', borderRadius: 14, border: '0.5px solid rgba(220,38,38,0.2)', padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 14 }}>⚠️ Potrebno naročiti</div>
                {lowStock.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(220,38,38,0.1)', fontSize: 13 }}>
                    <span style={{ color: '#0D1F12' }}>{item.name}</span>
                    <span style={{ color: '#DC2626', fontWeight: 600 }}>{item.current_stock}/{item.min_stock} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ARTIKEL MODAL */}
      {itemModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setItemModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{itemModal.id ? 'Uredi artikel' : 'Nov artikel'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ime artikla *</label>
                  <input value={itemModal.name ?? ''} onChange={e => setItemModal(p => ({ ...p, name: e.target.value }))} style={inp} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>SKU / koda</label>
                  <input value={itemModal.sku ?? ''} onChange={e => setItemModal(p => ({ ...p, sku: e.target.value }))} placeholder="ART-001" style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Kategorija</label>
                  <input value={itemModal.category ?? ''} onChange={e => setItemModal(p => ({ ...p, category: e.target.value }))} placeholder="Pijača, Hrana, Oprema..." style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Enota</label>
                  <select value={itemModal.unit ?? 'kos'} onChange={e => setItemModal(p => ({ ...p, unit: e.target.value }))} style={inp}>
                    {['kos', 'kg', 'g', 'l', 'dl', 'm', 'ura', 'paket'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Nabavna cena (€)</label>
                  <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal.purchase_price ?? 0} onChange={e => setItemModal(p => ({ ...p, purchase_price: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Prodajna cena (€)</label>
                  <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal.sale_price ?? 0} onChange={e => setItemModal(p => ({ ...p, sale_price: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>DDV %</label>
                  <select value={itemModal.vat_rate ?? 22} onChange={e => setItemModal(p => ({ ...p, vat_rate: Number(e.target.value) }))} style={inp}>
                    <option value={0}>0%</option>
                    <option value={9.5}>9.5%</option>
                    <option value={22}>22%</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {!itemModal.id && (
                  <div>
                    <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Začetna zaloga</label>
                    <input type="number" onFocus={e => e.target.select()} step="0.001" min="0" value={itemModal.current_stock ?? 0} onChange={e => setItemModal(p => ({ ...p, current_stock: Number(e.target.value) }))} style={inp} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Minimalna zaloga (opomnik)</label>
                  <input type="number" onFocus={e => e.target.select()} step="0.001" min="0" value={itemModal.min_stock ?? 0} onChange={e => setItemModal(p => ({ ...p, min_stock: Number(e.target.value) }))} style={inp} />
                </div>
              </div>
              {itemModal.purchase_price && itemModal.sale_price && itemModal.sale_price > 0 && (
                <div style={{ background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0E5E3B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Marža:</span>
                  <strong>{(((itemModal.sale_price - itemModal.purchase_price) / itemModal.sale_price) * 100).toFixed(1)}%</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 20 }}>
              {itemModal.id ? (
                <button onClick={() => deleteItem(itemModal.id!)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid #F7C1C1', background: '#FCEBEB', color: '#A32D2D', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>🗑️ Izbriši</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setItemModal(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
                <button onClick={saveItem} disabled={savingItem} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: savingItem ? 0.6 : 1 }}>
                  {savingItem ? 'Shranjujem...' : 'Shrani'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOVEMENT MODAL */}
      {movModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setMovModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {movModal.type === 'in' ? '⬆ Prevzem' : movModal.type === 'out' ? '⬇ Izdaja' : '⚖ Popravek zaloge'}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{movModal.itemName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Količina *</label>
                <input type="number" onFocus={e => e.target.select()} step="0.001" min="0.001" value={movQty} onChange={e => setMovQty(Number(e.target.value))} style={inp} autoFocus />
              </div>
              {movModal.type === 'in' && (
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Nabavna cena/enoto (€)</label>
                  <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={movPrice} onChange={e => setMovPrice(Number(e.target.value))} style={inp} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Referenca (dobavnica, račun...)</label>
                <input value={movRef} onChange={e => setMovRef(e.target.value)} placeholder="DOB-2026-001" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setMovModal(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={saveMovement} disabled={savingMov} style={{
                background: movModal.type === 'in' ? '#1D9E75' : movModal.type === 'out' ? '#DC2626' : '#0D1F12',
                color: '#fff', border: 0, borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: savingMov ? 0.6 : 1,
              }}>
                {savingMov ? 'Shranjujem...' : 'Potrdi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
    </AppLayout>
  )
}
