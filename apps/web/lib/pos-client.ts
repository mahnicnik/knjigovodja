// apps/web/lib/pos-client.ts
// POS Supabase klient — prilagojen za Next.js (Računko.si)
// Uporaba:
//   import { pos, BUSINESS_ID } from '@/lib/pos-client'
//   const items = await pos.items.list()

import { createClient } from '@/lib/supabase'
import { knjiziPosDneve, dneviMed } from '@/lib/pos-kpo'

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

/**
 * Ali je narocilo ze izdan racun: ima stevilko racuna ali vsaj eno placilo.
 * Ob napaki branja odgovorimo "da" - raje ne izbrisemo/ne prepisemo, kot da
 * izgubimo davcno potrjen racun.
 */
async function jeIzdanRacun(orderId: string): Promise<boolean> {
  const { data, error } = await sb().from('orders')
    .select('invoice_number, payments(id)')
    .eq('id', orderId).maybeSingle()
  if (error) return true
  if (!data) return false
  return !!(data as any).invoice_number || (((data as any).payments || []).length > 0)
}

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
    /**
     * Prenos prometa izmene v KPO knjigo.
     *
     * PREDELANO (revizija K5/V4/V5, oktober 2026): knjizi se PO DNEVIH prodaje
     * (prej vse z datumom ZAKLJUCKA izmene - izmena cez mejo meseca/cetrtletja je
     * promet prenesla v napacno davcno obdobje), storno in vracila se odstejejo
     * na svoj dan, zapis je idempotenten (kpo_entries.pos_kljuc). Izracun in
     * zapis sta v lib/pos-kpo.ts - ista pot kot Z-porocilo (/api/pos/sync-income)
     * ter storno in vracilo v blagajni.
     *
     * Izmena je skupna za podjetje (prelet 196/216), zato se knjizi ves promet
     * dni izmene; `staffId` ostaja v podpisu zaradi obstojecih klicev.
     */
    async syncSessionToKPO(orgId: string, sessionFrom: string, sessionTo: string, staffId?: string | null): Promise<{ productIncome: number; serviceIncome: number } | null> {
      void staffId
      const knjizbe = await knjiziPosDneve(sb(), orgId, BUSINESS_ID, dneviMed(sessionFrom, sessionTo))
      if (knjizbe.length === 0) return null
      const vsota = (vrsta: string) => knjizbe.filter(k => k.vrsta === vrsta).reduce((s, k) => s + k.neto, 0) / 100
      return { productIncome: vsota('izdelek'), serviceIncome: vsota('storitev') }
    },
    async closeOrderEmpty(orderId: string, opts?: { prepricanoPrazno?: boolean }) {
      // Izbriše prazno naročilo (brez vrstic) - uporabljeno ko uporabnik zapusti mizo brez artiklov
      //
      // VAROVALKA (prelet 165): preverimo, da je narocilo RES prazno.
      // Prej je funkcija brisala vrstice brez vprasanja - ce je bila
      // kosarica v Reactu prazna, narocilo v bazi pa ne (npr. tik po
      // zdruzitvi miz), so artikli izginili. Kosarica v brskalniku ni
      // dokaz o stanju v bazi.
      //
      // VRACA boolean (prelet 308): true = narocilo je bilo RES prazno in
      // izbrisano; false = narocilo NI bilo prazno, brisanje je bilo
      // preklicano. Klicatelj MORA to preveriti, preden mizo oznaci kot
      // prosto - sicer miza obvelja za prosto, artikli pa ostanejo v bazi
      // (natanko to je povzrocilo napako "artikli na mizi kljub temu, da
      // ni oznacena kot zasedena").
      //
      // `opts.prepricanoPrazno` (prelet 315): obide zgornje preverjanje
      // baze. Uporabi SAMO klicatelj, ki je pravkar sam - na tej isti
      // napravi - nalozil narocilo iz baze in ga od takrat samo se
      // uredjal (glej `shraniKosarico` v pos/page.tsx). Brez tega je
      // vsak izbris ZADNJEGA artikla z mize spodletel: baza je do tega
      // klica se vedno kazala "stari" artikel (saj ga ta klic sele
      // pravkar zbrise), varovalka zgoraj pa je zato VEDNO zavrnila
      // brisanje - miza je ostala "zasedena" z artiklom, ki ga ni bilo
      // vec mogoce odstraniti. To je bila prijavljena napaka.
      if (!opts?.prepricanoPrazno) {
        const { data: vrstice } = await sb().from('order_lines').select('id').eq('order_id', orderId).limit(1)
        if (vrstice && vrstice.length > 0) {
          console.warn('closeOrderEmpty: narocilo ' + orderId + ' ni prazno - brisanje preklicano')
          return false
        }
      }
      // VAROVALKA (7.10.2026, racun 1597): narocila, ki ima PLACILO ali
      // STEVILKO RACUNA, ne izbrisemo NIKOLI - tudi s `prepricanoPrazno` ne.
      // Tak racun je lahko ze davcno potrjen; izbris je odnesel vrstice in
      // placilo (ON DELETE CASCADE), racun pa je izginil iz prometa.
      if (await jeIzdanRacun(orderId)) {
        console.error('closeOrderEmpty: narocilo ' + orderId + ' ima placilo ali stevilko racuna - brisanje ZAVRNJENO')
        return false
      }
      const { error } = await sb().from('orders').delete().eq('id', orderId).is('invoice_number', null)
      if (error) throw error
      return true
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
      // VAROVALKA (7.10.2026, racun 1597): vrstic izdanega racuna ne spreminjamo.
      if (await jeIzdanRacun(orderId)) {
        throw new Error('Naročilo je že izdan račun - postavk ni mogoče spremeniti. Osvežite blagajno.')
      }
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
      /**
       * POPRAVLJENO (prelet 276): PROMET V GLAVI JE PADEL NA NIC.
       * ═══════════════════════════════════════════════════════════
       *
       * Prej je funkcija najprej prebrala VSE ID-je narocil podjetja in jih
       * nato poslala kot filter `.in('order_id', [...])`. Vsak ID je 36 znakov;
       * pri 600 narocilih je naslov zahtevka prerasel ~27 kB in streznik ga je
       * zavrnil (HTTP 400). Napaka se je TIHO pozrla - `error` je bil razstavljen,
       * a nikoli preverjen - zato je `data` ostal prazen in promet je kazal 0,00.
       *
       * Zgodilo se je 14. 9. 2026 okoli 15:00, ko je stevilo narocil preslo 600.
       * Do takrat je delovalo; nato bi z vsakim dnem ostalo pokvarjeno.
       *
       * ZDAJ: ena poizvedba z notranjim stikom na `orders`. Naslov je dolg ~300
       * znakov ne glede na stevilo narocil, napitnine pridejo v istem odgovoru,
       * napaka pa se PREVERI - bolje, da poci, kot da tiho kaze nic.
       *
       * Hkrati popravljen DATUM: prej `toISOString().substring(0,10)` = UTC dan,
       * zato se je promet med polnocjo in 02:00 po lokalnem casu stel v vcerajsnji
       * dan. Zdaj meje dneva v lokalnem casu naprave.
       */
      let start: Date
      if (date) { start = new Date(date + 'T00:00:00') }
      else { start = new Date(); start.setHours(0, 0, 0, 0) }
      const end = new Date(start); end.setDate(end.getDate() + 1)

      const { data, error } = await sb()
        .from('payments')
        .select('amount, order_id, orders!inner(business_id, status, tip_amount)')
        .eq('orders.business_id', BUSINESS_ID)
        .neq('orders.status', 'voided')
        .gte('paid_at', start.toISOString())
        .lt('paid_at', end.toISOString())
      if (error) throw error

      const payments = data ?? []
      // Napitnina je lastnost NAROCILA, ne placila - stejemo jo enkrat na narocilo.
      const poNarocilu = new Map<string, number>()
      for (const p of payments as any[]) {
        if (!poNarocilu.has(p.order_id)) poNarocilu.set(p.order_id, Number(p.orders?.tip_amount || 0))
      }

      return {
        promet: payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
        racuni: poNarocilu.size,
        napitnine: [...poNarocilu.values()].reduce((s, t) => s + t, 0),
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