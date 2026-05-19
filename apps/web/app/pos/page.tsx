'use client'
// @ts-nocheck

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ===== TIPI =====
interface Category { id: string; name: string; color: string; icon: string; sort_order: number }
interface PosItem { id: string; category_id: string | null; name: string; price: number; vat_rate: number; unit: string; emoji: string | null; is_active: boolean }
interface Space { id: string; name: string; type: string; is_active: boolean }
interface CartItem { item: PosItem; qty: number }
interface OpenOrder { space_id: string; items: CartItem[] }

// ===== HELPERS =====
function fmt(n: number) { return n.toFixed(2) }
function spaceEmoji(type: string) {
  return type === 'table' ? '🪑' : type === 'stall' ? '⛺' : type === 'room' ? '🚪' : type === 'counter' ? '🍺' : '📍'
}

export default function PosTerminalPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [loading, setLoading] = useState(true)

  // PIN login
  const [pinMode, setPinMode] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState('')

  // Data
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<PosItem[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeCat, setActiveCat] = useState<string | null>(null)

  // Cart & orders
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeSpace, setActiveSpace] = useState<Space | null>(null)
  const [openOrders, setOpenOrders] = useState<Record<string, OpenOrder>>({})
  const [view, setView] = useState<'spaces'|'items'|'cart'>('items')

  // Payment
  const [payModal, setPayModal] = useState(false)
  const [payType, setPayType] = useState<'cash'|'card'>('cash')
  const [cashGiven, setCashGiven] = useState('')
  const [paying, setPaying] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{ total: number; eor: string | null; change: number } | null>(null)

  const timeRef = useRef<string>('')
  const [time, setTime] = useState('')

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  // Load org data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      setOrgId(member.org_id)

      const [orgRes, catRes, itemRes, spaceRes, locRes] = await Promise.all([
        supabase.from('organizations').select('name, vat_registered').eq('id', member.org_id).single(),
        supabase.from('pos_categories').select('*').eq('org_id', member.org_id).eq('is_active', true).order('sort_order'),
        supabase.from('pos_items').select('*').eq('org_id', member.org_id).eq('is_active', true).order('sort_order'),
        supabase.from('pos_spaces').select('*').eq('org_id', member.org_id).eq('is_active', true).order('sort_order'),
        supabase.from('pos_locations').select('*').eq('org_id', member.org_id).eq('is_active', true).order('created_at'),
      ])

      setOrgName(orgRes.data?.name ?? '')
      setIsVatRegistered(orgRes.data?.vat_registered ?? false)

      const cats = catRes.data ?? []
      setCategories(cats)
      setItems(itemRes.data ?? [])
      setSpaces(spaceRes.data ?? [])
      if (cats.length > 0) setActiveCat(cats[0].id)

      // Če ni lokacij → brez PIN
      const locs = locRes.data ?? []
      if (locs.length === 0) {
        setLocationId(null)
        setLocationName('')
      } else {
        setPinMode(true)
      }

      // Če ni prostorov → direktno na artikle
      if ((spaceRes.data ?? []).length === 0) setView('items')
      else setView('spaces')

      setLoading(false)
    }
    load()
  }, [router, supabase])

  // PIN login
  async function submitPin() {
    if (!orgId || pin.length < 4) return
    setPinError('')
    const { data: loc } = await supabase
      .from('pos_locations')
      .select('*')
      .eq('org_id', orgId)
      .eq('pin_code', pin)
      .eq('is_active', true)
      .maybeSingle()

    if (!loc) { setPinError('Napačen PIN'); setPin(''); return }
    setLocationId(loc.id)
    setLocationName(loc.name)
    setPinMode(false)
  }

  // Cart operations
  function addItem(item: PosItem) {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) return prev.map(c => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { item, qty: 1 }]
    })
    if (view === 'spaces') setView('items')
  }

  function removeItem(itemId: string) {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === itemId)
      if (!existing) return prev
      if (existing.qty <= 1) return prev.filter(c => c.item.id !== itemId)
      return prev.map(c => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c)
    })
  }

  function clearCart() { setCart([]) }

  // Save cart to space
  function saveToSpace(space: Space) {
    if (cart.length === 0) return
    setOpenOrders(prev => ({
      ...prev,
      [space.id]: { space_id: space.id, items: cart }
    }))
    setActiveSpace(space)
    setCart([])
    setView('spaces')
  }

  // Load cart from space
  function loadFromSpace(space: Space) {
    const order = openOrders[space.id]
    setActiveSpace(space)
    setCart(order?.items ?? [])
    setView('items')
  }

  // Totals
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0)
  const cartItems = cart.reduce((s, c) => s + c.qty, 0)
  const change = cashGiven ? Math.max(0, Number(cashGiven) - cartTotal) : 0

  // Filtered items
  const visibleItems = activeCat
    ? items.filter(i => i.category_id === activeCat)
    : items

  // Payment
  async function handlePayment() {
    if (!orgId || cart.length === 0) return
    setPaying(true)

    try {
      // 1. Shrani transakcijo
      const { data: tx, error: txErr } = await supabase
        .from('pos_transactions')
        .insert({
          org_id: orgId,
          location_id: locationId,
          space_id: activeSpace?.id ?? null,
          total: cartTotal,
          payment_type: payType,
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (txErr || !tx) throw new Error(txErr?.message ?? 'Napaka pri shranjevanju')

      // 2. Shrani postavke
      await supabase.from('pos_transaction_items').insert(
        cart.map(c => ({
          transaction_id: tx.id,
          item_id: c.item.id,
          name: c.item.name,
          quantity: c.qty,
          unit_price: c.item.price,
          vat_rate: c.item.vat_rate,
          total: c.item.price * c.qty,
        }))
      )

      // 3. FURS potrjevanje
      let eor: string | null = null
      try {
        const fursRes = await fetch('/api/furs/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: tx.id, paymentType: payType }),
        })
        const fursData = await fursRes.json()
        if (fursData.success) eor = fursData.eor
      } catch {
        // FURS napaka ne ustavi prodaje
      }

      // 4. Počisti
      setLastReceipt({ total: cartTotal, eor, change: payType === 'cash' ? change : 0 })
      setCart([])
      if (activeSpace) {
        setOpenOrders(prev => { const n = { ...prev }; delete n[activeSpace.id]; return n })
        setActiveSpace(null)
      }
      setPayModal(false)
      setView(spaces.length > 0 ? 'spaces' : 'items')

    } catch (e: any) {
      alert(`Napaka: ${e.message}`)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0D1F12', display: 'grid', placeItems: 'center', color: '#fff' }}>
      Nalagam...
    </div>
  )

  // PIN screen
  if (pinMode) return (
    <div style={{ minHeight: '100vh', background: '#0D1F12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 28, color: '#E8B547', fontWeight: 700, marginBottom: 4 }}>Računko POS</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>{orgName}</div>

      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 16 }}>Vnesite PIN za dostop</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: pin.length > i ? '#E8B547' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
            <button key={i} onClick={() => {
              if (k === '⌫') setPin(p => p.slice(0, -1))
              else if (k === '') return
              else if (pin.length < 4) {
                const newPin = pin + k
                setPin(newPin)
                if (newPin.length === 4) setTimeout(() => {
                  setPin(newPin)
                }, 50)
              }
            }} style={{
              background: k === '⌫' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)',
              border: 0, borderRadius: 12, height: 60, fontSize: k === '⌫' ? 20 : 22, fontWeight: 600,
              color: '#fff', cursor: k === '' ? 'default' : 'pointer',
              opacity: k === '' ? 0 : 1,
            }}>{k}</button>
          ))}
        </div>

        {pinError && <div style={{ color: '#F87171', textAlign: 'center', fontSize: 13, marginTop: 12 }}>{pinError}</div>}

        <button onClick={submitPin} disabled={pin.length < 4} style={{
          width: '100%', marginTop: 16, background: pin.length === 4 ? '#1D9E75' : 'rgba(255,255,255,0.1)',
          border: 0, borderRadius: 12, height: 52, fontSize: 15, fontWeight: 600, color: '#fff', cursor: pin.length === 4 ? 'pointer' : 'default',
          transition: 'background .2s',
        }}>Prijava →</button>

        <button onClick={() => setPinMode(false)} style={{ width: '100%', marginTop: 8, background: 'none', border: 0, color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', padding: 8 }}>
          Preskoči (brez PIN)
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F0EFE9', display: 'flex', flexDirection: 'column', maxWidth: '100vw', overflow: 'hidden' }}>

      {/* TOP BAR */}
      <div style={{ background: '#0D1F12', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.06em' }}>
            {locationName || orgName} · POS
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{time}</div>
        </div>
        {cartItems > 0 && (
          <div style={{ background: '#1D9E75', color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
            {cartItems} · €{fmt(cartTotal)}
          </div>
        )}
        <button onClick={() => router.push('/pos/admin')} style={{ background: 'rgba(255,255,255,0.08)', border: 0, color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>
          ⚙️ Admin
        </button>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ===== SPACES VIEW ===== */}
        {view === 'spaces' && spaces.length > 0 && (
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Prostori & Mize</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {spaces.map(s => {
                const order = openOrders[s.id]
                const hasOrder = !!order && order.items.length > 0
                const orderTotal = hasOrder ? order.items.reduce((sum, c) => sum + c.item.price * c.qty, 0) : 0
                return (
                  <button key={s.id} onClick={() => loadFromSpace(s)} style={{
                    background: hasOrder ? '#0D1F12' : '#fff',
                    border: hasOrder ? 'none' : '0.5px solid rgba(0,0,0,0.1)',
                    borderRadius: 16, padding: '18px 12px', cursor: 'pointer',
                    textAlign: 'center', transition: 'all .15s',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{spaceEmoji(s.type)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: hasOrder ? '#fff' : '#0D1F12' }}>{s.name}</div>
                    {hasOrder ? (
                      <div style={{ fontSize: 12, color: '#E8B547', marginTop: 4, fontWeight: 700 }}>€{fmt(orderTotal)}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Prosto</div>
                    )}
                  </button>
                )
              })}
              {/* Nov prostor / brez prostora */}
              <button onClick={() => { setActiveSpace(null); setView('items') }} style={{
                background: 'rgba(29,158,117,0.1)', border: '1.5px dashed #1D9E75',
                borderRadius: 16, padding: '18px 12px', cursor: 'pointer', textAlign: 'center',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>➕</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1D9E75' }}>Brez prostora</div>
                <div style={{ fontSize: 11, color: '#1D9E75', marginTop: 4, opacity: 0.7 }}>Hitra prodaja</div>
              </button>
            </div>
          </div>
        )}

        {/* ===== ITEMS VIEW ===== */}
        {view === 'items' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Active space banner */}
            {activeSpace && (
              <div style={{ background: '#0D1F12', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{spaceEmoji(activeSpace.type)}</span>
                <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{activeSpace.name}</span>
                <button onClick={() => { setView('spaces') }} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 0, color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>← Prostori</button>
              </div>
            )}

            {/* Category tabs */}
            {categories.length > 0 && (
              <div style={{ background: '#fff', display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
                <button onClick={() => setActiveCat(null)} style={{
                  background: 'none', border: 0, borderBottom: activeCat === null ? '2.5px solid #0D1F12' : '2.5px solid transparent',
                  padding: '12px 16px', fontSize: 13, fontWeight: activeCat === null ? 600 : 400,
                  color: activeCat === null ? '#0D1F12' : '#888', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>Vse</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)} style={{
                    background: 'none', border: 0, borderBottom: activeCat === c.id ? `2.5px solid ${c.color}` : '2.5px solid transparent',
                    padding: '12px 16px', fontSize: 13, fontWeight: activeCat === c.id ? 600 : 400,
                    color: activeCat === c.id ? '#0D1F12' : '#888', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>{c.icon}</span> {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Items grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {visibleItems.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Ni artiklov — dodajte jih v <strong>Admin → Artikli</strong>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {visibleItems.map(item => {
                    const inCart = cart.find(c => c.item.id === item.id)
                    return (
                      <button key={item.id} onClick={() => addItem(item)} style={{
                        background: inCart ? '#0D1F12' : '#fff',
                        border: inCart ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                        borderRadius: 14, padding: '14px 10px', cursor: 'pointer',
                        textAlign: 'center', transition: 'all .1s', position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}>
                        {inCart && (
                          <div style={{ position: 'absolute', top: 6, right: 8, background: '#1D9E75', color: '#fff', borderRadius: 999, width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                            {inCart.qty}
                          </div>
                        )}
                        {item.emoji && <span style={{ fontSize: 26 }}>{item.emoji}</span>}
                        <div style={{ fontSize: 12, fontWeight: 500, color: inCart ? '#fff' : '#0D1F12', lineHeight: 1.3, textAlign: 'center' }}>{item.name}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: inCart ? '#E8B547' : '#1D9E75' }}>€{fmt(item.price)}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== CART VIEW ===== */}
        {view === 'cart' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {cart.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Košarica je prazna</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cart.map(c => (
                    <div key={c.item.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      {c.item.emoji && <span style={{ fontSize: 22, flexShrink: 0 }}>{c.item.emoji}</span>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{c.item.name}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>€{fmt(c.item.price)} / {c.item.unit}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => removeItem(c.item.id)} style={{ width: 30, height: 30, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 18, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#666' }}>−</button>
                        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{c.qty}</span>
                        <button onClick={() => addItem(c.item)} style={{ width: 30, height: 30, borderRadius: 8, background: '#0D1F12', border: 0, fontSize: 18, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>+</button>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F12', minWidth: 60, textAlign: 'right' }}>€{fmt(c.item.price * c.qty)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart total */}
            {cart.length > 0 && (
              <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#888' }}>Skupaj ({cartItems} artiklov)</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#0D1F12' }}>€{fmt(cartTotal)}</span>
                </div>
                {isVatRegistered && (
                  <div style={{ fontSize: 11, color: '#aaa' }}>
                    Vklj. DDV: €{fmt(cart.reduce((s, c) => s + (c.item.price * c.qty * c.item.vat_rate / (100 + c.item.vat_rate)), 0))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', flexShrink: 0 }}>
        {spaces.length > 0 && (
          <button onClick={() => setView('spaces')} style={{
            flex: 1, background: 'none', border: 0, padding: '12px 8px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: view === 'spaces' ? '#0D1F12' : '#aaa',
          }}>
            <span style={{ fontSize: 20 }}>🪑</span>
            <span style={{ fontSize: 10, fontWeight: view === 'spaces' ? 700 : 400 }}>Prostori</span>
          </button>
        )}
        <button onClick={() => setView('items')} style={{
          flex: 1, background: 'none', border: 0, padding: '12px 8px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: view === 'items' ? '#0D1F12' : '#aaa',
        }}>
          <span style={{ fontSize: 20 }}>🛍️</span>
          <span style={{ fontSize: 10, fontWeight: view === 'items' ? 700 : 400 }}>Artikli</span>
        </button>
        <button onClick={() => setView('cart')} style={{
          flex: 1, background: 'none', border: 0, padding: '12px 8px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: view === 'cart' ? '#0D1F12' : '#aaa', position: 'relative',
        }}>
          {cartItems > 0 && (
            <div style={{ position: 'absolute', top: 8, right: '20%', background: '#E05A2B', color: '#fff', borderRadius: 999, width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
              {cartItems}
            </div>
          )}
          <span style={{ fontSize: 20 }}>🧾</span>
          <span style={{ fontSize: 10, fontWeight: view === 'cart' ? 700 : 400 }}>Košarica</span>
        </button>
        {cart.length > 0 && (
          <button onClick={() => setPayModal(true)} style={{
            flex: 2, background: '#0D1F12', border: 0, padding: '12px 16px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: '#fff',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>€{fmt(cartTotal)}</span>
            <span style={{ fontSize: 10, color: '#E8B547' }}>Plačaj →</span>
          </button>
        )}
      </div>

      {/* ===== PAYMENT MODAL ===== */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>Plačilo</div>
              <button onClick={() => setPayModal(false)} style={{ background: 'none', border: 0, fontSize: 24, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
            </div>

            {/* Summary */}
            <div style={{ background: '#F7F6F2', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              {cart.map(c => (
                <div key={c.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span style={{ color: '#666' }}>{c.item.name} × {c.qty}</span>
                  <span style={{ fontWeight: 500 }}>€{fmt(c.item.price * c.qty)}</span>
                </div>
              ))}
              <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>SKUPAJ</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#0D1F12' }}>€{fmt(cartTotal)}</span>
              </div>
            </div>

            {/* Payment type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {(['cash', 'card'] as const).map(pt => (
                <button key={pt} onClick={() => setPayType(pt)} style={{
                  padding: '16px', borderRadius: 14, border: payType === pt ? '2px solid #0D1F12' : '0.5px solid rgba(0,0,0,0.15)',
                  background: payType === pt ? '#0D1F12' : '#fff', cursor: 'pointer', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 28 }}>{pt === 'cash' ? '💵' : '💳'}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: payType === pt ? '#fff' : '#0D1F12', marginTop: 6 }}>
                    {pt === 'cash' ? 'Gotovina' : 'Kartica'}
                  </div>
                </button>
              ))}
            </div>

            {/* Cash input */}
            {payType === 'cash' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Prejeto (€)</label>
                <input
                  type="number" step="0.01" min={cartTotal}
                  value={cashGiven}
                  onChange={e => setCashGiven(e.target.value)}
                  placeholder={fmt(cartTotal)}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 20, fontWeight: 700, textAlign: 'center', outline: 'none' }}
                />
                {cashGiven && Number(cashGiven) >= cartTotal && (
                  <div style={{ marginTop: 8, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#1D9E75' }}>
                    Vračilo: €{fmt(change)}
                  </div>
                )}
                {/* Quick amounts */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {[5, 10, 20, 50].map(a => (
                    <button key={a} onClick={() => setCashGiven(String(a))} style={{
                      flex: 1, background: '#F7F6F2', border: 0, borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}>€{a}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm button */}
            <button onClick={handlePayment} disabled={paying || (payType === 'cash' && cashGiven !== '' && Number(cashGiven) < cartTotal)} style={{
              width: '100%', background: '#1D9E75', color: '#fff', border: 0, borderRadius: 14,
              padding: '16px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              opacity: paying ? 0.7 : 1,
            }}>
              {paying ? 'Potrjevanje...' : `✓ Potrdi plačilo €${fmt(cartTotal)}`}
            </button>
          </div>
        </div>
      )}

      {/* ===== RECEIPT MODAL ===== */}
      {lastReceipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginBottom: 4 }}>Plačano!</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1D9E75', marginBottom: 16 }}>€{fmt(lastReceipt.total)}</div>

            {lastReceipt.change > 0 && (
              <div style={{ background: '#E1F5EE', borderRadius: 10, padding: '12px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#0E5E3B' }}>Vračilo stranki</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0E5E3B' }}>€{fmt(lastReceipt.change)}</div>
              </div>
            )}

            {lastReceipt.eor ? (
              <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>FURS potrjeno ✓</div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa', wordBreak: 'break-all' }}>{lastReceipt.eor}</div>
              </div>
            ) : (
              <div style={{ background: '#FFF8E7', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#92600A' }}>
                ⚠️ FURS potrditev čaka (offline način)
              </div>
            )}

            <button onClick={() => setLastReceipt(null)} style={{
              width: '100%', background: '#0D1F12', color: '#fff', border: 0, borderRadius: 12,
              padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>Nov račun →</button>
          </div>
        </div>
      )}

    </div>
  )
}
