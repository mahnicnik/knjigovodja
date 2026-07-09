// apps/web/lib/pos-client.ts
// POS Supabase klient — prilagojen za Next.js (Računko.si)
// Uporaba:
//   import { pos, BUSINESS_ID } from '@/lib/pos-client'
//   const items = await pos.items.list()

import { createClient } from '@/lib/supabase'

// ─── Business ID — multi-tenant: dinamično nastavljen glede na org ──
// Live binding: ko resolveBusinessId() spremeni to vrednost, se sprememba
// avtomatsko odraža povsod kjer je BUSINESS_ID uvožen (ES module semantics).
export let BUSINESS_ID: string = ''

/**
 * Nastavi BUSINESS_ID glede na trenutno prijavljeno organizacijo.
 * Če organizacija še nima povezanega POS biznisa (pos_business_id je null),
 * samodejno ustvari nov `businesses` zapis in ga poveže.
 * Kliči to ENKRAT ob nalaganju POS strani, preden se naloži karkoli drugega.
 */
export async function resolveBusinessId(orgId: string, orgName: string, ownerUserId: string): Promise<string> {
  const supabase = sb()
  const { data: org } = await supabase
    .from('organizations')
    .select('pos_business_id')
    .eq('id', orgId)
    .single()

  if (org?.pos_business_id) {
    BUSINESS_ID = org.pos_business_id
    return BUSINESS_ID
  }

  // Ni še POS biznisa — ustvarimo novega
  const { data: newBiz, error } = await supabase
    .from('businesses')
    .insert({
      name: orgName,
      owner_user_id: ownerUserId,
      profile_type: 'trznica',
      vat_rate: 22.00,
      currency: 'EUR',
      language: 'sl-SI',
      master_pin: '9999',
      auto_lock_ms: 60000,
      furs_enabled: false,
      pos_settings: {},
      furs_config: {},
    })
    .select('id')
    .single()

  if (error || !newBiz) {
    throw new Error('Napaka pri ustvarjanju POS biznisa: ' + (error?.message ?? 'neznana napaka'))
  }

  await supabase.from('organizations').update({ pos_business_id: newBiz.id }).eq('id', orgId)

  BUSINESS_ID = newBiz.id
  return BUSINESS_ID
}

// ─── Supabase client ──────────────────────────────────────────────────
// Vsakič ustvarimo nov client (Next.js SSR safe)
function sb() { return createClient() }

// ─── Tipi ────────────────────────────────────────────────────────────
export type StaffRole = 'Lastnik' | 'Vodja' | 'Blagajnik' | 'Trener' | 'Terapevt'
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'needs_attention'
export type OrderStatus = 'open' | 'paid' | 'cancelled' | 'on_hold'
export type PaymentMethod = 'cash' | 'card' | 'bon' | 'tk' | 'tr' | 'prep'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  pin: string
  color: string
  permissions: Record<string, boolean> | null
  is_master?: boolean
}

export interface PosCategory {
  id: string
  name: string
  icon: string | null
  color: string | null
  sort_order: number
}

export interface PosItem {
  id: string
  category_id: string | null
  name: string
  code: string | null
  price: number
  unit: string
  vat_rate: number
  stock: number | null
  low_stock: number | null
  fav: boolean
  kitchen: boolean
  bookable: boolean
  duration_min: number | null
  archived: boolean
}

export interface PosSpace {
  id: string
  name: string
  color: string
  sort_order: number
  tables: PosTable[]
}

export interface PosTable {
  id: string
  space_id: string
  name: string
  seats: number
  x: number
  y: number
  status: TableStatus
  is_bar: boolean
}

export interface PosOrder {
  id: string
  number: number
  table_id: string | null
  customer_id: string | null
  status: OrderStatus
  total: number
  subtotal: number
  vat_amount: number
  tip_amount: number
}

export interface DailyStats {
  promet: number
  racuni: number
  napitnine: number
}

// ─── POS API ──────────────────────────────────────────────────────────
export const pos = {

  // ─── Auth — PIN login ─────────────────────────────────────────────
  auth: {
    async pinLogin(pin: string): Promise<StaffMember | null> {
      const { data, error } = await sb().rpc('pin_login', {
        p_business_id: BUSINESS_ID,
        p_pin: pin,
      })
      if (error) throw error
      return data?.[0] || null
    },
  },

  // ─── Catalog ─────────────────────────────────────────────────────
  categories: {
    async list(): Promise<PosCategory[]> {
      const { data, error } = await sb()
        .from('categories')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  },

  items: {
    async list(categoryId?: string): Promise<PosItem[]> {
      let q = sb()
        .from('items')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('archived', false)
      if (categoryId) q = q.eq('category_id', categoryId)
      const { data, error } = await q.order('name')
      if (error) throw error
      return data ?? []
    },

    async favorites(): Promise<PosItem[]> {
      const { data, error } = await sb()
        .from('items')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('archived', false)
        .eq('fav', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  },

  services: {
    async list() {
      const { data, error } = await sb()
        .from('services')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  },

  packageTemplates: {
    async list() {
      const { data, error } = await sb()
        .from('package_templates')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('archived', false)
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Spaces & Tables ─────────────────────────────────────────────
  spaces: {
    async list(): Promise<PosSpace[]> {
      const { data, error } = await sb()
        .from('spaces')
        .select('*, tables(*)')
        .eq('business_id', BUSINESS_ID)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as PosSpace[]
    },

    async updateTableStatus(tableId: string, status: TableStatus) {
      const { error } = await sb()
        .from('tables')
        .update({ status })
        .eq('id', tableId)
      if (error) throw error
    },
  },

  // ─── Customers ───────────────────────────────────────────────────
  customers: {
    async list() {
      const { data, error } = await sb()
        .from('customers')
        .select('*, customer_packages(*)')
        .eq('business_id', BUSINESS_ID)
        .eq('archived', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },

    async search(q: string) {
      const { data, error } = await sb()
        .from('customers')
        .select('*, customer_packages(*)')
        .eq('business_id', BUSINESS_ID)
        .eq('archived', false)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Staff ───────────────────────────────────────────────────────
  staff: {
    async list() {
      const { data, error } = await sb()
        .from('staff')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('active', true)
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Bookings ────────────────────────────────────────────────────
  bookings: {
    async onDate(date: string) {
      const { data, error } = await sb()
        .from('bookings')
        .select('*, customers(name, phone), staff(name, color), services(name, color)')
        .eq('business_id', BUSINESS_ID)
        .gte('start_at', `${date}T00:00:00`)
        .lte('start_at', `${date}T23:59:59`)
        .order('start_at')
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Orders ──────────────────────────────────────────────────────
  orders: {
    async openOrder(params: { tableId?: string; customerId?: string; cashierId: string }) {
      const { data, error } = await sb().rpc('open_order', {
        p_business_id: BUSINESS_ID,
        p_table_id: params.tableId ?? null,
        p_customer_id: params.customerId ?? null,
        p_cashier_id: params.cashierId,
      })
      if (error) throw error
      return data as string // returns order UUID
    },

    async addLine(orderId: string, line: {
      itemId?: string
      serviceId?: string
      name: string
      qty: number
      unitPrice: number
      vatRate: number
      mods?: Array<{ name: string; delta: number }>
      note?: string
    }) {
      const modAdd = (line.mods ?? []).reduce((s, m) => s + m.delta, 0)
      const total = (line.unitPrice + modAdd) * line.qty
      const { error } = await sb().from('order_lines').insert({
        order_id: orderId,
        item_id: line.itemId ?? null,
        service_id: line.serviceId ?? null,
        name: line.name,
        qty: line.qty,
        unit_price: line.unitPrice,
        vat_rate: line.vatRate,
        mods: line.mods ?? [],
        note: line.note ?? null,
        total,
      })
      if (error) throw error
    },

    async pay(params: {
      orderId: string
      method: PaymentMethod
      amount: number
      received?: number
      furs?: boolean
      cashierId: string
      fursZoi?: string
      fursEor?: string
    }) {
      const { data, error } = await sb().rpc('pay_order', {
        p_order_id: params.orderId,
        p_method: params.method,
        p_amount: params.amount,
        p_received: params.received ?? null,
        p_furs: params.furs ?? true,
        p_cashier_id: params.cashierId,
      })
      if (error) throw error

      // Če imamo FURS EOR/ZOI, posodobimo payment record
      if (params.fursEor || params.fursZoi) {
        await sb()
          .from('payments')
          .update({
            furs_zoi: params.fursZoi ?? null,
            furs_eor: params.fursEor ?? null,
            furs_sent_at: new Date().toISOString(),
          })
          .eq('order_id', params.orderId)
          .order('paid_at', { ascending: false })
          .limit(1)
      }

      return data as { payment_id: string; order_id: string }
    },

    async holdOrder(orderId: string, label?: string) {
      const { error } = await sb()
        .from('orders')
        .update({ status: 'on_hold', hold_label: label || null })
        .eq('id', orderId)
      if (error) throw error
    },
    async getHeldOrders(): Promise<any[]> {
      const { data, error } = await sb()
        .from('orders')
        .select('*, order_lines(*), tables(name)')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'on_hold')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    async resumeOrder(orderId: string) {
      const { error } = await sb()
        .from('orders')
        .update({ status: 'open' })
        .eq('id', orderId)
      if (error) throw error
    },
    async getOpenOnTable(tableId: string): Promise<any | null> {
      // .maybeSingle() vrze napako ce obstaja vec kot ena ujemajoca vrstica.
      // Ce pride do redke podvojitve (npr. race condition), vzamemo najnovejso
      // namesto da metoda crasha in tiho pokvari osvezevanje mize.
      const { data, error } = await sb()
        .from('orders')
        .select('*, order_lines(*)')
        .eq('table_id', tableId)
        .in('status', ['open', 'on_hold'])
        .order('opened_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    },
    async syncSessionToKPO(orgId: string, sessionFrom: string, sessionTo: string): Promise<{ productIncome: number; serviceIncome: number } | null> {
      const db = sb()
      // Pridobi vse plačane naročitve v tem sessionu, z vrsticami in tipom artikla
      const { data: orders } = await db
        .from('orders')
        .select('id, closed_at, order_lines(qty, unit_price, vat_rate, voided, item_id, service_id)')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'paid')
        .gte('closed_at', sessionFrom)
        .lte('closed_at', sessionTo)
      if (!orders || orders.length === 0) return null

      let productNet = 0, productVat = 0
      let serviceNet = 0, serviceVat = 0

      for (const o of orders as any[]) {
        for (const l of o.order_lines || []) {
          if (l.voided) continue
          const lineTotal = Number(l.qty || 0) * Number(l.unit_price || 0)
          const rate = Number(l.vat_rate || 22)
          const net = rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal
          const vat = lineTotal - net
          if (l.service_id) {
            serviceNet += net
            serviceVat += vat
          } else {
            productNet += net
            productVat += vat
          }
        }
      }

      const today = new Date(sessionTo).toISOString().split('T')[0]

      if (productNet > 0) {
        await db.from('kpo_entries').insert({
          org_id: orgId,
          entry_date: today,
          description: `POS blagajna — prodaja izdelkov (${today})`,
          entry_type: 'income',
          income: Math.round(productNet * 100) / 100,
          vat_out: Math.round(productVat * 100) / 100,
          category: 'pos_prodaja',
          notes: 'Avtomatski dnevni povzetek iz POS blagajne',
        })
      }
      if (serviceNet > 0) {
        await db.from('kpo_entries').insert({
          org_id: orgId,
          entry_date: today,
          description: `POS blagajna — prodaja storitev (${today})`,
          entry_type: 'income',
          income: Math.round(serviceNet * 100) / 100,
          vat_out: Math.round(serviceVat * 100) / 100,
          category: 'pos_storitve',
          notes: 'Avtomatski dnevni povzetek iz POS blagajne',
        })
      }

      return { productIncome: productNet, serviceIncome: serviceNet }
    },
    async closeOrderEmpty(orderId: string) {
      // Izbriše prazno naročilo (brez vrstic) - uporabljeno ko uporabnik zapusti mizo brez artiklov
      await sb().from('order_lines').delete().eq('order_id', orderId)
      const { error } = await sb().from('orders').delete().eq('id', orderId)
      if (error) throw error
    },
    async replaceLines(orderId: string, lines: Array<{
      itemId?: string
      serviceId?: string
      name: string
      qty: number
      unitPrice: number
      vatRate: number
      mods?: Array<{ name: string; delta: number }>
      note?: string
    }>) {
      await sb().from('order_lines').delete().eq('order_id', orderId)
      if (lines.length === 0) return
      const rows = lines.map(line => {
        const modAdd = (line.mods ?? []).reduce((s, m) => s + m.delta, 0)
        return {
          order_id: orderId,
          item_id: line.itemId ?? null,
          service_id: line.serviceId ?? null,
          name: line.name,
          qty: line.qty,
          unit_price: line.unitPrice,
          vat_rate: line.vatRate,
          mods: line.mods ?? [],
          note: line.note ?? null,
          total: (line.unitPrice + modAdd) * line.qty,
        }
      })
      const { error } = await sb().from('order_lines').insert(rows)
      if (error) throw error
    },
  },

  // ─── Reports & Stats ─────────────────────────────────────────────
  reports: {
    async dailyStats(date?: string): Promise<DailyStats> {
      const today = date ?? new Date().toISOString().substring(0, 10)
      const { data, error } = await sb()
        .from('payments')
        .select('amount, order_id')
        .gte('paid_at', `${today}T00:00:00`)
        .lte('paid_at', `${today}T23:59:59`)
        // Filter by business via orders
        .in('order_id', (await sb()
          .from('orders')
          .select('id')
          .eq('business_id', BUSINESS_ID)
        ).data?.map(o => o.id) ?? [])

      const payments = data ?? []
      const orderIds = [...new Set(payments.map(p => p.order_id))]

      const { data: tips } = await sb()
        .from('orders')
        .select('tip_amount')
        .in('id', orderIds)

      return {
        promet: payments.reduce((s, p) => s + Number(p.amount), 0),
        racuni: orderIds.length,
        napitnine: (tips ?? []).reduce((s, o) => s + Number(o.tip_amount || 0), 0),
      }
    },

    async daily(date?: string) {
      const { data, error } = await sb().rpc('daily_report', {
        p_business_id: BUSINESS_ID,
        p_date: date,
      })
      if (error) throw error
      return data
    },
  },

  // ─── Notifications ───────────────────────────────────────────────
  notifications: {
    async compute() {
      const { data, error } = await sb().rpc('compute_notifications', {
        p_business_id: BUSINESS_ID,
      })
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Happy hour ──────────────────────────────────────────────────
  happyHour: {
    async getActive() {
      const now = new Date()
      const days = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob']
      const today = days[now.getDay()]
      const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const { data, error } = await sb()
        .from('happy_hour_rules')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('active', true)
        .contains('days', [today])
        .lte('from_time', timeNow)
        .gte('to_time', timeNow)
      if (error) throw error
      return data ?? []
    },
  },

  // ─── Realtime ────────────────────────────────────────────────────
  realtime: {
    subscribeToTables(onChange: () => void) {
      return sb()
        .channel('pos-tables')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
        .subscribe()
    },
  },
}