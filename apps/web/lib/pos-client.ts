// apps/web/lib/pos-client.ts
// POS Supabase klient — prilagojen za Next.js (Računko.si)
// Uporaba:
//   import { pos, BUSINESS_ID } from '@/lib/pos-client'
//   const items = await pos.items.list()

import { createClient } from '@/lib/supabase'

// ─── Business ID — hardkodiran za ŠIRM ───────────────────────────────
// Vzeto iz seed SQL (04_seed_sirm.sql)
export const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'

// ─── Supabase client ──────────────────────────────────────────────────
// Vsakič ustvarimo nov client (Next.js SSR safe)
function sb() { return createClient() }

// ─── Tipi ────────────────────────────────────────────────────────────
export type StaffRole = 'Lastnik' | 'Vodja' | 'Blagajnik' | 'Trener' | 'Terapevt'
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'needs_attention'
export type OrderStatus = 'open' | 'paid' | 'cancelled'
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

    async getOpenOnTable(tableId: string): Promise<PosOrder | null> {
      const { data, error } = await sb()
        .from('orders')
        .select('*')
        .eq('table_id', tableId)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data as PosOrder | null
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