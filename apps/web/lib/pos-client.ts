// apps/web/lib/pos-client.ts
// POS Supabase klient — prilagojen za Next.js (Računko.si)
// Uporaba:
//   import { pos, BUSINESS_ID } from '@/lib/pos-client'
//   const items = await pos.items.list()

import { createClient } from '@/lib/supabase'
import { lokalniDatum } from '@/lib/tax-constants'
import { vatExemptionText } from '@/lib/vat-exemptions'
import { jeStoritevVrstica } from '@/lib/pos-calc'

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
      // POPRAVLJENO (16.8.2026): tu je bilo 'trznica' - NAJBOLJ OMEJEN profil
      // od petih. Nov uporabnik je tako dobil blagajno brez mize, koledarja,
      // strank in paketov, cetudi vodi restavracijo ali fitnes. Baza sama ima
      // privzeto vrednost 'all', kar je smiselno: pokazi VSE, uporabnik naj
      // nato izbere ozji profil, ce ga zeli. Koda je to privzeto vrednost
      // prepisala z najozjo, cesar nihce ni nameraval.
      profile_type: 'all',
      vat_rate: 22.00,
      currency: 'EUR',
      language: 'sl-SI',
      master_pin: null, // master PIN koncept v celoti odstranjen (audit K4, 24.7.2026)
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

/**
 * Ali ima blagajna ze kaksnega uporabnika s PIN-om?
 *
 * DODANO (16.8.2026, BLOKADA): brez uporabnika nov lastnik NE MORE v blagajno.
 * Prijava gre izkljucno prek PIN-a iz tabele staff (master PIN je bil
 * odstranjen 24.7.2026), tabela pa je za novo podjetje prazna. Nastavitve,
 * kjer bi osebje dodal, so ZA zaklepom - torej nedosegljive. Rezultat je bil
 * trajno zaklenjen zaslon brez izhoda.
 *
 * Privzetega PIN-a NAMENOMA ne ustvarjamo: enaka zacetna koda pri vseh
 * podjetjih bi pomenila, da jo pozna vsakdo. Namesto tega blagajna ob prvem
 * vstopu ponudi, da lastnik sam dolo Ci svoje ime in PIN - takrat je ze
 * prijavljen s svojim racunom, zato je to varno.
 */
export async function imaOsebje(businessId: string): Promise<boolean> {
  if (!businessId) return false
  const { data, error } = await sb()
    .from('staff')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)
  if (error) throw new Error('Osebja blagajne ni bilo mogoce prebrati: ' + error.message)
  return !!(data && data.length > 0)
}

/** Ustvari PRVEGA uporabnika blagajne z imenom in PIN-om, ki ju izbere lastnik. */
export async function ustvariPrvegaUporabnika(
  businessId: string,
  ownerUserId: string,
  ime: string,
  pin: string,
): Promise<void> {
  const { error } = await sb().from('staff').insert({
    business_id: businessId,
    user_id: ownerUserId,
    name: ime.trim() || 'Lastnik',
    role: 'Lastnik',
    pin: pin.trim(),
    active: true,
  })
  if (error) {
    throw new Error('Uporabnika ni bilo mogoce dodati: ' + error.message)
  }
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
        // POPRAVLJENO (19.8.2026): `created_at` v tabeli `orders` NE OBSTAJA
        // (stolpci so opened_at, closed_at, voided_at). Poizvedba je zato
        // vrgla napako, ta pa je bila vrzena naprej (throw error) - seznam
        // zadrzanih racunov se sploh ni odprl.
        .order('opened_at', { ascending: false })
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
    // POPRAVLJENO (16.8.2026, KRITICNO): odkar ima vsak blagajnik SVOJO sejo,
    // lahko vec sej tece hkrati. Ta funkcija je filtrirala narocila SAMO po
    // casovnem oknu seje, zato bi ob zakljucku dveh prekrivajocih se sej ISTI
    // promet knjizila DVAKRAT v knjigo prihodkov. Zdaj filtrira tudi po
    // blagajniku (orders.cashier_id), tako da vsaka seja knjizi le svoj del.
    async syncSessionToKPO(orgId: string, sessionFrom: string, sessionTo: string, staffId?: string | null): Promise<{ productIncome: number; serviceIncome: number } | null> {
      const db = sb()
      // Pridobi vse plačane naročitve v tem sessionu, z vrsticami in tipom artikla
      const { data: orders } = await db
        .from('orders')
        // DODANO (19.8.2026): items(bookable, vat_exemption_code).
        //  • `bookable` loci STORITEV od izdelka: storitev se ob shranjevanju
        //    sinhronizira v katalog artiklov, zato se v blagajni proda kot
        //    ARTIKEL in `order_lines.service_id` ostane prazen - fizioterapija
        //    je bila v KPO knjizena kot "prodaja izdelkov".
        //  • `vat_exemption_code` prinese razlog za neobracunan DDV, ki ga
        //    racunovodja doslej iz knjige ni videl.
        .select('id, closed_at, cashier_id, order_lines(qty, unit_price, total, vat_rate, voided, item_id, service_id, items(bookable, vat_exemption_code, vat_exemption_custom_text))')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'paid')
        .gte('closed_at', sessionFrom)
        .lte('closed_at', sessionTo)
      if (!orders || orders.length === 0) return null

      // Filtriraj na narocila TE seje (tega blagajnika). Ce staffId ni podan
      // (stare seje brez staff_id), obdrzimo staro obnasanje - vsa narocila.
      const mojaNarocila = staffId
        ? (orders as any[]).filter(o => o.cashier_id === staffId)
        : (orders as any[])
      if (mojaNarocila.length === 0) return null

      let productNet = 0, productVat = 0
      let serviceNet = 0, serviceVat = 0

      // POPRAVLJENO (16.8.2026): promet se je sestel v DVA zapisa (izdelki,
      // storitve), stopnje DDV pa so se pri tem POMESALE - obrazec DDV-O
      // zahteva LOCENI vrstici za 22% in 9,5%. Zdaj grupiramo po vrsti IN
      // stopnji, tako da vsak zapis nosi svojo stopnjo.
      const skupine = new Map<string, {
        net: number; vat: number; rate: number; jeStoritev: boolean; klavzule: Set<string>
      }>()
      for (const o of mojaNarocila) {
        for (const l of o.order_lines || []) {
          if (l.voided) continue
          // POPRAVLJENO (16.8.2026): prej brez doplacil modifikatorjev - prihodek
          // v knjigi bi bil prenizek. Stolpec total jih ze vsebuje.
          const lineTotal = l.total != null ? Number(l.total) : Number(l.qty || 0) * Number(l.unit_price || 0)
          const rate = Number(l.vat_rate ?? 22)
          const net = rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal
          const vat = lineTotal - net

          // POPRAVLJENO (19.8.2026): prej samo `!!l.service_id`. Storitev se ob
          // shranjevanju sinhronizira v katalog artiklov in se proda kot ARTIKEL,
          // zato service_id ostane prazen - fizioterapija je bila v KPO knjizena
          // kot "prodaja izdelkov", kategorija pa `pos_prodaja` namesto
          // `pos_storitve`. Artikel, ki je nastal iz storitve, ima `bookable`.
          const artikel: any = (l as any).items
          const jeStoritev = jeStoritevVrstica(l as any)

          const kljuc = `${jeStoritev ? 'storitev' : 'izdelek'}|${rate}`
          const obstoj = skupine.get(kljuc)
            || { net: 0, vat: 0, rate, jeStoritev, klavzule: new Set<string>() }
          obstoj.net += net
          obstoj.vat += vat

          // Razlog za neobracunan DDV (samo pri 0 %). Ce je v isti skupini vec
          // razlicnih razlogov, se zapisejo vsi.
          if (rate === 0) {
            const besedilo = vatExemptionText(
              artikel?.vat_exemption_code,
              artikel?.vat_exemption_custom_text,
            )
            if (besedilo) obstoj.klavzule.add(besedilo)
          }

          skupine.set(kljuc, obstoj)
          if (jeStoritev) { serviceNet += net; serviceVat += vat }
          else { productNet += net; productVat += vat }
        }
      }

      const today = lokalniDatum(new Date(sessionTo))

      // En zapis na kombinacijo vrste in stopnje DDV.
      for (const s of skupine.values()) {
        if (s.net <= 0) continue
        const { error: kpoErr } = await db.from('kpo_entries').insert({
          org_id: orgId,
          entry_date: today,
          description: `POS blagajna — prodaja ${s.jeStoritev ? 'storitev' : 'izdelkov'} ${s.rate}% (${today})`,
          entry_type: 'income',
          income: Math.round(s.net * 100) / 100,
          vat_out: Math.round(s.vat * 100) / 100,
          vat_rate: s.rate,
          category: s.jeStoritev ? 'pos_storitve' : 'pos_prodaja',
          // DODANO (19.8.2026): pri oproscenem prometu se zapise RAZLOG. Prej je
          // vnos imel 0 % DDV brez pojasnila, zakaj - racunovodja iz knjige ni
          // videl, ali gre za oprostitev po 42. clenu ali za neobdavcen bon.
          notes: s.klavzule.size > 0
            ? 'Avtomatski dnevni povzetek iz POS blagajne. ' + Array.from(s.klavzule).join(' ')
            : 'Avtomatski dnevni povzetek iz POS blagajne',
        })
        if (kpoErr) console.error('POS -> KPO: zapisa za stopnjo', s.rate, 'ni bilo mogoce shraniti:', kpoErr)
      }

      return { productIncome: productNet, serviceIncome: serviceNet }
    },
    async closeOrderEmpty(orderId: string) {
      // Izbriše prazno naročilo (brez vrstic) - uporabljeno ko uporabnik zapusti mizo brez artiklov
      //
      // VAROVALKA (prelet 165): preverimo, da je narocilo RES prazno.
      // Prej je funkcija brisala vrstice brez vprasanja - ce je bila
      // kosarica v Reactu prazna, narocilo v bazi pa ne (npr. tik po
      // zdruzitvi miz), so artikli izginili. Kosarica v brskalniku ni
      // dokaz o stanju v bazi.
      const { data: vrstice } = await sb().from('order_lines').select('id').eq('order_id', orderId).limit(1)
      if (vrstice && vrstice.length > 0) {
        console.warn('closeOrderEmpty: narocilo ' + orderId + ' ni prazno - brisanje preklicano')
        return
      }
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
          /**
           * PRELET 203: popust v EVRIH velja za CELO vrstico, `unit_price`
             * pa je cena NA KOS - zato ga porazdelimo (`/ qty`). Zmnozek s
             * kolicino tako spet da znesek, ki ga vidi gost.
             *
             * Nikoli pod nic: popust, visji od vrednosti postavke, jo znica
             * na 0, ne v negativno ceno.
             */
            unit_price: line.qty > 0
              ? Math.max(0, line.unitPrice - (Number((line as any).discountEur ?? 0) || 0) / line.qty)
              : line.unitPrice,
            vat_rate: line.vatRate,
            mods: line.mods ?? [],
            note: line.note ?? null,
            total: Math.max(0, (line.unitPrice + modAdd) * line.qty - (Number((line as any).discountEur ?? 0) || 0)),
            // PRELET 201: popust na postavko. `unit_price` je ZE znizan, to
          // polje pa ohrani, KOLIKSEN popust je bil dan - potrebno za
          // ponatis racuna in za porocila.
          discount_pct: Number((line as any).discountPct ?? 0) || 0,
          // PRELET 203: znesek popusta na postavko, loceno od odstotka.
          discount_eur: Number((line as any).discountEur ?? 0) || 0,
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
      // KLJUCNO: izkljuci storirana narocila (status='voided') iz prometa -
      // placilo ostane v payments tudi po stornu, ampak ne sme steti v PROMET
      const { data, error } = await sb()
        .from('payments')
        .select('amount, order_id')
        .gte('paid_at', `${today}T00:00:00`)
        .lte('paid_at', `${today}T23:59:59`)
        // Filter by business via orders, izkljuci storirana
        .in('order_id', (await sb()
          .from('orders')
          .select('id')
          .eq('business_id', BUSINESS_ID)
          .neq('status', 'voided')
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