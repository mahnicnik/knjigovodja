// @ts-nocheck
'use client'
export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { escapeHtml } from '@/lib/html-escape'
import { zesekVrstice, razclenitevDdv, popustEurVOdstotek } from '@/lib/pos-calc'
import { predlagajUjemanje } from '@/lib/ujemanje-artiklov'
import { SLOG_AKTA } from '@/lib/interni-akt'
import VatExemptionPicker from '@/components/VatExemptionPicker'
import { vatExemptionText } from '@/lib/vat-exemptions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { pos, BUSINESS_ID, resolveBusinessId, imaOsebje, ustvariPrvegaUporabnika } from '@/lib/pos-client'
import { lokalniDatum } from '@/lib/tax-constants'
import { buildReceiptHTML } from '@/lib/receipt'
import { WorkStatusBar, ClockInModal } from '@/lib/work-session-components'
import { getCurrentSession, openSession, getSessionStats, closeSession, getLastCarryOver, type CashSession, type SessionStats } from '@/lib/cash-session'
import { getActiveMembership } from '@/lib/active-org'
import { buildOpeningReceipt, buildXReportReceipt, buildZReportReceipt } from '@/lib/cash-session-receipt'

// ================================================================
// TEMA
// ================================================================
const T = {
  bg: '#f4efe5', surface: '#ffffff', surface2: '#faf5e9', surface3: '#efeadf',
  ink: '#1a1f1a', inkSoft: '#3a3f3a', muted: '#6b6962', mutedSoft: '#9a9890',
  line: 'rgba(26,31,26,0.10)', lineSoft: 'rgba(26,31,26,0.06)',
  header: '#0d2818', headerInk: '#f6f1e8', headerLine: 'rgba(246,241,232,0.10)',
  brand: '#e9b949', accent: '#1f6b3a', accentText: '#ffffff',
  accentSoft: 'rgba(31,107,58,0.10)', danger: '#a83232', warn: '#b88c28',
  chipBg: '#efeadf', modalBg: '#fff', inputBg: '#fafaf7', summaryBg: '#f9f5eb',
  status: {
    free: { bg: '#ffffff', stroke: 'rgba(31,107,58,0.5)', dot: '#1f6b3a', label: 'Prosto' },
    occupied: { bg: 'rgba(233,185,73,0.18)', stroke: 'rgba(184,140,40,0.55)', dot: '#b88c28', label: 'Zasedeno' },
    reserved: { bg: 'rgba(155,122,201,0.15)', stroke: 'rgba(99,72,150,0.5)', dot: '#634896', label: 'Rezerv.' },
    needs_attention: { bg: 'rgba(168,50,50,0.10)', stroke: 'rgba(168,50,50,0.55)', dot: '#a83232', label: 'Pozor' },
  },
}

// ================================================================
// DDV PO DEJANSKIH STOPNJAH (24.7.2026, audit R3)
// ================================================================
// Prej so 3 mesta v tej datoteki racunala DDV pavsalno kot total/1.22,
// cetudi vsak artikel v kosarici ze ima svoj vat_rate (9,5%/22%/...).
// Ta funkcija racuna DDV PRAVILNO po dejanski stopnji vsake vrstice.
// scale (0-1) omogoca sorazmerno prilagoditev za popust/napitnino,
// uporabljeno na celotnem znesku (ne po posamezni vrstici).
// SPREMENJENO (19.8.2026): izracun se je preselil v lib/pos-calc.ts, da ga
// lahko preverijo testi (tests/blagajna.spec.ts). Ta datoteka ima 11.000
// vrstic in je odjemalska komponenta - testi je niso mogli uvoziti, zato ta
// izracun ni bil nikoli preverjen, ceprav doloca DDV na racunu in na FURS.
function vatBreakdownForCart(cart, scale = 1) {
  return razclenitevDdv(cart, scale)
}

// ================================================================
// STATIČNA KONFIGURACIJA (ne gre v DB)
// ================================================================
const CFG = {
  // POPRAVLJENO (16.8.2026): tu je bilo TRDO ZAPISANO ime "ŠIRM fitness&bar".
  // Vsak nov uporabnik je na svoji blagajni videl tuje ime podjetja - v glavi
  // in na zaklenjenem zaslonu. Ime zdaj prihaja iz organizacije uporabnika.
  business: { name: '', location: '' },
  paymentMethods: [
    { id: 'cash', name: 'Gotovina', icon: '💶' },
    { id: 'card', name: 'Kartica', icon: '💳' },
    // DODANO (21.8.2026): unovcenje karte obiskov. Prej tega na blagajni NI
    // BILO - karto je bilo mogoce porabiti samo prek koledarja. Kdor je
    // stranko sprejel brez termina, poti ni imel; nekateri so uporabili
    // "Bone", ki pa izda navaden racun in ne odsteje nicesar - stranka je
    // bila zaracunana dvakrat.
    { id: 'pkg',  name: 'Karta obiskov', icon: '🎟️' },
    { id: 'bon',  name: 'Boni',    icon: '🎫' },
    { id: 'prep', name: 'Predplačilo', icon: '💰' },
  ],
  tips: [0, 5, 10, 15],
  // masterPin ODSTRANJEN (24.7.2026, audit K4): trdo kodiran '9999',
  // primerjan client-side - za multi-tenant SaaS univerzalni upraviteljski
  // PIN, viden vsakomur v brskalniku. Prijava zdaj izkljucno prek
  // DB-preverjenih PIN-ov osebja (pos.auth.pinLogin).
  rolePresets: {
    Lastnik:   { sale:true,  openCash:true,  refund:true,  voidReceipt:true,  manualDiscount:true,  dailyClose:true,  viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:true,  viewRevenue:true,  viewReports:true,  exportData:true,  editPrices:true,  manageStaff:true,  editSpaces:true,  systemSettings:true  },
    Vodja:     { sale:true,  openCash:true,  refund:true,  voidReceipt:true,  manualDiscount:true,  dailyClose:true,  viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:true,  viewRevenue:true,  viewReports:false, exportData:true,  editPrices:true,  manageStaff:false, editSpaces:true,  systemSettings:false },
    Blagajnik: { sale:true,  openCash:true,  refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:false, manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
    Trener:    { sale:false, openCash:false, refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:false, manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
    Terapevt:  { sale:false, openCash:false, refund:false, voidReceipt:false, manualDiscount:false, dailyClose:false, viewMembers:true,  editMembers:true,  manageBookings:true, viewSales:false, viewRevenue:false, viewReports:false, exportData:false, editPrices:false, manageStaff:false, editSpaces:false, systemSettings:false },
  },
  autoLockOptions: [
    { id: '15s',   label: '15 sekund', ms: 15000  },
    { id: '30s',   label: '30 sekund', ms: 30000  },
    { id: '1min',  label: '1 minuta',  ms: 60000  },
    { id: '5min',  label: '5 minut',   ms: 300000 },
    { id: 'never', label: 'Nikoli',    ms: 0      },
  ],
  profiles: [
    { id: 'all',      name: 'Vse v enem',       icon: '🌐', nav: ['floor','sale','calendar','customers','packages','inventory','orders','reports','admin'] },
    { id: 'rest',     name: 'Restavracija',      icon: '🍽', nav: ['floor','sale','calendar','customers','inventory','orders','reports','admin'] },
    { id: 'bar',      name: 'Bar / Kavarna',     icon: '🍺', nav: ['floor','sale','customers','inventory','orders','reports','admin'] },
    // POPRAVLJENO (16.8.2026): tudi profilu "Storitve" je manjkal zaslon
    // "orders". Tudi tu se izdajajo racuni in jih je treba znati stornirati.
    { id: 'storitve', name: 'Storitve',           icon: '💆', nav: ['calendar','customers','packages','sale','orders','reports','admin'] },
    // POPRAVLJENO (16.8.2026): profilu "Tržnica" je manjkal zaslon "orders"
    // (Računi). Ker je to PRIVZETI profil za nova podjetja, nov uporabnik ni
    // imel nobene poti do izdanih računov - torej ne do storna, ne do vračila,
    // ne do spremembe načina plačila. Vse te funkcije obstajajo in delujejo,
    // le zaslona, kjer se do njih pride, ni bilo v meniju.
    { id: 'trznica',  name: 'Tržnica / Stojnica', icon: '🥕', nav: ['sale','inventory','orders','reports','admin'] },
  ],
  permissionGroups: [
    { title: 'Blagajna & Prodaja', items: [['sale','Prodaja'],['openCash','Odpri blagajno'],['voidReceipt','Storno računa'],['refund','Vračilo'],['manualDiscount','Ročni popust'],['dailyClose','Dnevni zaključek']] },
    { title: 'Člani & Termini',    items: [['viewMembers','Poglej člane'],['editMembers','Uredi profile'],['manageBookings','Upravljaj termine']] },
    { title: 'Finance',            items: [['viewSales','Poglej promet'],['viewRevenue','Poglej prihodke'],['viewReports','Poglej poročila'],['exportData','Izvozi podatke']] },
    { title: 'Nastavitve',         items: [['editPrices','Uredi cenik'],['manageStaff','Upravljaj zaposlene'],['editSpaces','Prostori & mize'],['systemSettings','Nastavitve sistema']] },
  ],
}

/**
 * Podatki podjetja za IZPISE (racun, predracun, Z-porocilo, predracun).
 *
 * POPRAVLJENO (16.8.2026): na izpisih so bili TRDO ZAPISANI podatki podjetja
 * SIRM - ime, naslov in celo davcna stevilka. Vsak drug uporabnik bi na svojem
 * racunu natisnil TUJE podatke, kar je pri davcnem dokumentu resna napaka.
 * Zdaj se vzamejo iz organizacije; ce podatka ni, se polje preprosto izpusti,
 * namesto da bi se vpisal tuj.
 */
function podatkiPodjetja(org: any) {
  const naslov = [org?.address, [org?.post_code, org?.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
  return {
    ime: org?.name || 'Blagajna',
    naslov,
    davcna: org?.tax_number ? String(org.tax_number).replace(/^SI/i, '') : '',
    zavezanec: !!org?.vat_registered,
  }
}

// ================================================================
// HELPERS
// ================================================================
const eur = (v) => '€ ' + Number(v).toFixed(2).replace('.', ',')
/**
 * Izpis odstotka popusta (19.8.2026). Ko uporabnik vnese popust v EVRIH, se
 * ta pretvori v odstotek in ima lahko dolge decimalke (npr. 25.031289...).
 * Tu jih porezemo: cela stevila brez decimalk, ostalo na dve mesti.
 */
const fmtPct = (v) => {
  const n = Number(v) || 0
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return s.replace('.', ',')
}

const H = {
  // SPREMENJENO (19.8.2026): izracun se je preselil v lib/pos-calc.ts, da ga
  // lahko preverijo testi. Vsebina je enaka, vkljucno z varovalkami proti
  // negativnim zneskom (17.8.2026).
  lineTotal: (l) => zesekVrstice(l),
  orderTotals: (cart) => {
    const sub = cart.reduce((s, l) => s + H.lineTotal(l), 0)
    // KLJUCNO: DDV se izracuna PO POSAMEZNI VRSTICI glede na njeno dejansko vat_rate,
    // ne pavsalno za celotno kosarico po 22% (prejsnja koda je bila napacna za artikle z 9.5% DDV)
    const vatByRate = {}
    for (const l of cart) {
      const rate = Number(l.vat_rate ?? 22)
      const lineGross = H.lineTotal(l)
      const lineVat = lineGross - lineGross / (1 + rate / 100)
      vatByRate[rate] = (vatByRate[rate] || 0) + lineVat
    }
    const ddv = Object.values(vatByRate).reduce((s, v) => s + v, 0)
    return { sub, ddv, total: sub, vatByRate }
  },
  // POPRAVLJENO (16.8.2026): prej so bili upraviceni artikli doloceni po
  // IMENU (trdo kodirane besede pivo/vino/lasko...), nastavljena pravila
  // (kategorije, odstotek, dnevi, ure) pa se niso uporabljala nikjer.
  // Zdaj: pravilo doloci kategorije in odstotek.
  activeHappyHourRule: (rules) => {
    if (!rules?.length) return null
    const now = new Date()
    const dan = now.getDay() // 0=nedelja
    const hhmm = now.toTimeString().slice(0, 8)
    return rules.find(r => {
      if (!r.active) return false
      if (Array.isArray(r.days) && r.days.length > 0 && !r.days.map(Number).includes(dan)) return false
      if (r.from_time && hhmm < r.from_time) return false
      if (r.to_time && hhmm > r.to_time) return false
      return true
    }) || null
  },
  isHappyHourEligible: (item, rule) => {
    if (!rule) return false
    // Prazen seznam kategorij = velja za VSE artikle
    if (!Array.isArray(rule.category_ids) || rule.category_ids.length === 0) return true
    return rule.category_ids.includes(item?.category_id)
  },
  memberStatus: (pkgs) => {
    if (!pkgs || pkgs.length === 0) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const active = pkgs.filter(p => p.active)
    if (active.length === 0) return { status: 'none', remainingVisits: 0, daysToExpiry: null }
    const pkg = active[0]
    // POPRAVLJENO (22.8.2026): C9 je bil odpravljen le v prikazu, TU pa ne.
    // Ker je `expires` polnoc, zdajsnji cas pa sredi dneva, je Math.floor
    // odrezal en dan - kartica, ki potece jutri, je bila oznacena kot
    // "potece danes", tista, ki potece danes, pa kot POTEKLA.
    const daysToExpiry = dniDo(pkg.expires) ?? 0
    const remainingVisits = pkg.remaining
    let status = 'active'
    if (daysToExpiry < 0) status = 'expired'
    else if (daysToExpiry <= 3 || remainingVisits <= 1) status = 'critical'
    else if (daysToExpiry <= 7 || remainingVisits <= 2) status = 'expiring'
    return { status, remainingVisits, daysToExpiry }
  },
}

// ================================================================
// SUPABASE DATA HOOK — branje vseh live podatkov iz DB
// ================================================================
function usePosData() {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [spaces, setSpaces] = useState([])
  const [customers, setCustomers] = useState([])
  const [staffList, setStaffList] = useState([])
  // DODANO (16.8.2026): happy hour pravila - prej se niso nikjer nalagala/uporabljala
  const [happyHourRules, setHappyHourRules] = useState([])
  const [packageTemplates, setPackageTemplates] = useState([])
  const [services, setServices] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [notifications, setNotifications] = useState([])
  const [todayStats, setTodayStats] = useState({ promet: 0, racuni: 0, napitnine: 0 })
  const [businessProfile, setBusinessProfile] = useState('all')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [bizReady, setBizReady] = useState(false)
  // DODANO (16.8.2026): napaka pri postavitvi blagajne se je zapisala SAMO v
  // konzolo - uporabnik je obtical na nalaganju brez pojasnila in ni vedel,
  // ali je kriva prijava, pravice ali kaj tretjega.
  const [bizNapaka, setBizNapaka] = useState<string | null>(null)
  // DODANO (16.8.2026): ime podjetja iz organizacije - prej trdo zapisano.
  const [businessName, setBusinessName] = useState('')
  // DODANO (16.8.2026): celotna organizacija - izpisi potrebujejo tudi naslov
  // in davcno stevilko, ki sta bila prej TRDO ZAPISANA (SIRM, 91390419).
  const [org, setOrg] = useState<any>(null)
  // DODANO (17.8.2026): ali blagajna dela v TESTNEM nacinu FURS.
  const [fursTestMode, setFursTestMode] = useState(false)
  // DODANO (16.8.2026): ali blagajna se nima nobenega uporabnika s PIN-om.
  const [potrebujePrvoNastavitev, setPotrebujePrvoNastavitev] = useState(false)

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    async function initBusiness() {
      try {
        const sb2 = createClient()
        const { data: { user } } = await sb2.auth.getUser()
        if (!user) { setBizNapaka('Niste prijavljeni. Prijavite se in poskusite znova.'); return }
        const mem = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
        if (!mem) {
          setBizNapaka('Vaš uporabniški račun ni povezan z nobenim podjetjem. Najprej izpolnite profil podjetja v Nastavitvah.')
          return
        }
        const { data: o } = await sb2.from('organizations')
          // POPRAVLJENO (24.8.2026): poizvedba ni prinesla telefona, e-poste in
          // IBAN-a, zato je opomnik pisal "Oglasite se pri nas" brez stevilke,
          // gumba za klic pa sploh ni bilo.
          .select('name, address, post_code, city, tax_number, vat_registered, furs_test_mode, phone, email, iban, bic')
          .eq('id', mem.org_id).single()
        setFursTestMode(!!o?.furs_test_mode)
        setBusinessName(o?.name || '')
        setOrg(o || null)
        const bizId = await resolveBusinessId(mem.org_id, o?.name || 'Moj biznis', user.id)
        setPotrebujePrvoNastavitev(!(await imaOsebje(bizId)))
        setBizReady(true)
      } catch (e: any) {
        console.error('Napaka pri inicializaciji POS biznisa:', e)
        setBizNapaka(e?.message || 'Blagajne ni bilo mogoče pripraviti.')
      }
    }
    initBusiness()
  }, [])

  useEffect(() => {
    if (!bizReady) return
    async function load() {
      setLoading(true)
      try {
        const [cats, itms, sps, custs, stf, pkgs, svcs, stats] = await Promise.all([
          pos.categories.list(),
          pos.items.list(),
          pos.spaces.list(),
          pos.customers.list(),
          pos.staff.list(),
          pos.packageTemplates.list(),
          pos.services.list(),
          pos.reports.dailyStats(),
          createClient().from('ingredients').select('*').eq('business_id', BUSINESS_ID).order('name'),
        ])
        setCategories(cats)
        setItems(itms)
        setSpaces(sps)
        setCustomers(custs)
        setStaffList(stf)
        setPackageTemplates(pkgs)
        setServices(svcs)
        setTodayStats(stats)
        setIngredients((await createClient().from('ingredients').select('*, item_ingredients(qty_used, item_id)').eq('business_id', BUSINESS_ID).order('name')).data || [])
        // Modifier grupe se naložijo v InventoryScreen in CatalogSection

        // Generiraj in fetch notifikacije
        await createClient().rpc('generate_pos_notifications', { p_business_id: BUSINESS_ID })
        // DODANO (22.8.2026): tudi podatki KARTICE, da lahko v opomniku
        // navedemo obdobje veljavnosti in preostale obiske. Prej je bil
        // naveden samo datum poteka.
        const notifRes = await createClient().from('pos_notifications')
          // POPRAVLJENO (24.8.2026): vgnezdeni izbor NI vseboval `template_id`
          // ne `name`. Zahtevek za podaljsanje je zato dobil template_id=null,
          // javna stran je pokazala "Kartica" brez cene, predracun pa je sel
          // stranki z zneskom 0,00 EUR. Ista vrsta napake kot `package_id`.
          .select('*, customers(name, email), customer_packages(id, name, template_id, expires, activated_at, purchased_at, remaining, total)')
          .eq('business_id', BUSINESS_ID).eq('dismissed', false).order('created_at', { ascending: false })
        setNotifications(notifRes.data || [])
        // Fetch business profile
        // DODANO (16.8.2026): nalozi happy hour pravila
        const hhRes = await createClient().from('happy_hour_rules').select('*').eq('business_id', BUSINESS_ID).eq('active', true)
        setHappyHourRules(hhRes.data || [])
        const { data: bizData } = await createClient().from('businesses').select('profile_type').eq('id', BUSINESS_ID).single()
        if (bizData?.profile_type) setBusinessProfile(bizData.profile_type)
      } catch (e) {
        console.error('usePosData error:', e)
      }
      setLoading(false)
    }
    load()
  }, [reloadKey, bizReady])

  function itemsIn(catId) {
    if (catId === 'cat-fav') {
      const favs = items.filter(i => i.fav)
      return favs.length > 0 ? favs : items.slice(0, 12)
    }
    return items.filter(i => i.category_id === catId)
  }

  const categoriesWithFav = useMemo(() => {
    if (categories.length === 0) return []
    return [{ id: 'cat-fav', name: 'Priljubljeno', icon: '★', color: '#E9B949' }, ...categories]
  }, [categories])

  return { categories: categoriesWithFav, items, spaces, customers, staffList, packageTemplates, services, ingredients, notifications, setNotifications, todayStats, businessProfile, setBusinessProfile, happyHourRules, loading, itemsIn, refresh, bizNapaka, businessName, org, fursTestMode, potrebujePrvoNastavitev, setPotrebujePrvoNastavitev }
}

// ================================================================
// ================================================================
// MULTI-BLAGAJNA — premise + device iz localStorage
// ================================================================
const ACTIVE_PREMISE_KEY = 'racunko_active_premise'
const ACTIVE_DEVICE_KEY  = 'racunko_active_device'

function getActivePremise() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_PREMISE_KEY) || 'null') } catch { return null }
}
function setActivePremise(p) {
  if (p) localStorage.setItem(ACTIVE_PREMISE_KEY, JSON.stringify(p))
  else localStorage.removeItem(ACTIVE_PREMISE_KEY)
}
function getActiveDevice() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_DEVICE_KEY) || 'null') } catch { return null }
}
function setActiveDevice(d) {
  if (d) localStorage.setItem(ACTIVE_DEVICE_KEY, JSON.stringify(d))
  else localStorage.removeItem(ACTIVE_DEVICE_KEY)
}

// AUTH HOOK — real PIN login iz DB
// ================================================================
function useAuthState(autoLockMs = 60000) {
  const [user, setUser] = useState(null)
  const [locked, setLocked] = useState(true)
  const [autoLock, setAutoLock] = useState(() => {
    if (typeof window === 'undefined') return autoLockMs
    const saved = localStorage.getItem('pos_autolock')
    return saved !== null ? parseInt(saved) : autoLockMs
  })
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const reset = () => { lastActivity.current = Date.now() }
    ;['mousedown', 'touchstart', 'keydown', 'wheel'].forEach(e => window.addEventListener(e, reset))
    return () => ['mousedown', 'touchstart', 'keydown', 'wheel'].forEach(e => window.removeEventListener(e, reset))
  }, [])

  useEffect(() => {
    if (autoLock === 0) return
    const t = setInterval(() => {
      if (!locked && Date.now() - lastActivity.current > autoLock) setLocked(true)
    }, 1000)
    return () => clearInterval(t)
  }, [autoLock, locked])

  const permissions = useMemo(() => {
    if (!user) return {}
    if (user.is_master) return Object.fromEntries(Object.keys(CFG.rolePresets.Lastnik).map(k => [k, true]))
    return user.permissions || CFG.rolePresets[user.role] || {}
  }, [user])

  async function unlock(pin) {
    try {
      // DB PIN login (edina pot po odstranitvi master PIN - 24.7.2026, audit K4)
      const staff = await pos.auth.pinLogin(pin)
      if (staff) {
        setUser(staff)
        setLocked(false)
        lastActivity.current = Date.now()
        return true
      }
      return false
    } catch (e) {
      console.error('PIN login error:', e)
      return false
    }
  }

  function lock() { setLocked(true) }

  function saveAutoLock(ms) {
    setAutoLock(ms)
    if (typeof window !== 'undefined') localStorage.setItem('pos_autolock', String(ms))
  }

  return { user, permissions, locked, lock, unlock, autoLock, setAutoLock: saveAutoLock }
}

// ================================================================
// IKONE
// ================================================================
const KI = ({ name, size = 18, strokeWidth = 1.7 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    x: <><path d="M6 6l12 12M18 6L6 18"/></>,
    chev: <path d="m9 6 6 6-6 6"/>,
    chevD: <path d="m6 9 6 6 6-6"/>,
    chair: <><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 10h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"/><path d="M7 17v3M17 17v3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M14 20c0-2 2-4 4-4s4 2 4 4"/></>,
    print: <><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M6 14h12v7H6z"/></>,
    percent: <><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></>,
    check: <path d="m5 13 4 4L20 6"/>,
    bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
    package: <><path d="M16 3l5 3v12l-9 5-9-5V6l5-3M3 6l9 5 9-5M12 11v10"/></>,
    pin: <><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    add_user: <><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-7 6-7s6 3 6 7"/><path d="M19 8v6M22 11h-6"/></>,
    split: <><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-5M20 17h-5"/></>,
    home: <path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2v-9z"/>,
    barcode: <><path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14"/></>,
    happy: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></>,
    scale: <><path d="M12 3v18M5 7l7-4 7 4M3 12l2-5 2 5a2 2 0 1 1-4 0zM17 12l2-5 2 5a2 2 0 1 1-4 0zM7 21h10"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
    refund: <><path d="M3 9h13a5 5 0 0 1 0 10H6"/><path d="m7 5-4 4 4 4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
    gift: <><rect x="3" y="8" width="18" height="12" rx="1"/><path d="M3 8h18M12 8v12"/><path d="M12 8c-1.5-4-7-4-7-1 0 1.5 2 1.5 7 1zM12 8c1.5-4 7-4 7-1 0 1.5-2 1.5-7 1z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    flower: <><circle cx="12" cy="9" r="3"/><circle cx="9" cy="14" r="3"/><circle cx="15" cy="14" r="3"/><circle cx="12" cy="13" r="1.4" fill="currentColor"/></>,
    money: <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.3" fill="currentColor"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.9" fill="currentColor"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] || <circle cx="12" cy="12" r="9"/>}
    </svg>
  )
}

// ================================================================
// PRVA NASTAVITEV BLAGAJNE
// ================================================================
/**
 * DODANO (16.8.2026, BLOKADA): brez tega nov lastnik ni mogel v blagajno.
 * Prijava gre izkljucno prek PIN-a iz tabele osebja, ta pa je za novo podjetje
 * prazna; nastavitve, kjer bi osebje dodal, so ZA zaklepom.
 *
 * Privzetega PIN-a namenoma NE ustvarjamo - enaka zacetna koda pri vseh
 * podjetjih bi pomenila, da jo pozna vsakdo. Namesto tega lastnik tu sam
 * doloCi svoje ime in PIN. Varno je, ker je ze prijavljen s svojim racunom;
 * PIN je dodatna plast za izmensko osebje, ne glavna prijava.
 */
function PrvaNastavitev({ imePodjetja, onKoncano }) {
  const [ime, setIme] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [napaka, setNapaka] = useState('')
  const [shranjujem, setShranjujem] = useState(false)

  async function shrani() {
    setNapaka('')
    if (!ime.trim()) { setNapaka('Vnesite svoje ime.'); return }
    // POPRAVLJENO (19.8.2026): dolzina PIN-a je zdaj 1-4 (prej 4-6).
    if (!/^\d{1,4}$/.test(pin)) { setNapaka('PIN mora imeti od 1 do 4 številke.'); return }
    // DODANO (25.8.2026): dolzina PIN-a se NI preverjala - shranil se je tudi
    // enoznakovni, cetudi zaslon kaze stiri pike. Blagajno je odklenila ena
    // stevka, kar pomeni deset moznih PIN-ov.
    if (!/^\d{4,6}$/.test(pin)) { setNapaka('PIN mora imeti od 4 do 6 števk.'); return }
    if (/^(\d)\1+$/.test(pin)) { setNapaka('PIN ne sme biti sestavljen iz istih števk.'); return }
    if (pin !== pin2) { setNapaka('PIN-a se ne ujemata.'); return }
    if (/^(\d)\1+$/.test(pin)) { setNapaka('PIN naj ne bo sestavljen iz enakih številk (npr. 1111).'); return }
    setShranjujem(true)
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')
      await ustvariPrvegaUporabnika(BUSINESS_ID, user.id, ime, pin)
      onKoncano()
    } catch (e: any) {
      setNapaka(e?.message || 'Shranjevanje ni uspelo.')
      setShranjujem(false)
    }
  }

  const polje: React.CSSProperties = {
    width: '100%', padding: '11px 13px', borderRadius: 9, fontSize: 14,
    border: '1px solid rgba(246,241,232,0.25)', background: 'rgba(255,255,255,0.06)',
    color: T.headerInk, outline: 'none', fontFamily: 'inherit', marginTop: 6,
  }

  return (
    <div style={{ position:'absolute', inset:0, zIndex:1000, background:'radial-gradient(circle at center, #1a3520 0%, #0d2818 60%, #06140d 100%)', color:T.headerInk, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'"Inter", system-ui, sans-serif' }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:26 }}>
          <div style={{ width:44, height:44, borderRadius:11, background:T.brand, color:T.header, fontWeight:800, fontSize:21, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>R</div>
          <div style={{ fontSize:17, fontWeight:700 }}>{imePodjetja || 'Blagajna'}</div>
          <div style={{ fontSize:13, opacity:0.7, marginTop:8, lineHeight:1.6 }}>
            Blagajna še ni nastavljena.<br/>Določite svoje ime in PIN za vstop.
          </div>
        </div>

        <label style={{ fontSize:12, opacity:0.7 }}>Vaše ime
          <input value={ime} onChange={e=>setIme(e.target.value)} placeholder="npr. Ana" style={polje}/>
        </label>

        <label style={{ fontSize:12, opacity:0.7, display:'block', marginTop:14 }}>PIN (1–4 številke)
          <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            inputMode="numeric" type="password" placeholder="••••" style={polje}/>
        </label>

        <label style={{ fontSize:12, opacity:0.7, display:'block', marginTop:14 }}>Ponovite PIN
          <input value={pin2} onChange={e=>setPin2(e.target.value.replace(/\D/g,'').slice(0,6))}
            inputMode="numeric" type="password" placeholder="••••" style={polje}
            onKeyDown={e => { if (e.key === 'Enter') shrani() }}/>
        </label>

        {napaka && <div style={{ fontSize:12.5, color:'#ff8fa3', marginTop:14, lineHeight:1.5 }}>{napaka}</div>}

        <button onClick={shrani} disabled={shranjujem}
          style={{ width:'100%', marginTop:22, padding:'12px', borderRadius:9, border:'none', background:T.brand, color:T.header, fontSize:14, fontWeight:700, cursor: shranjujem?'default':'pointer', fontFamily:'inherit', opacity: shranjujem?0.6:1 }}>
          {shranjujem ? 'Shranjujem…' : 'Nastavi in vstopi'}
        </button>

        <div style={{ fontSize:11.5, opacity:0.55, marginTop:16, textAlign:'center', lineHeight:1.6 }}>
          Dodatno osebje in njihove PIN-e boste lahko dodali v nastavitvah blagajne.
        </div>
      </div>
    </div>
  )
}

// ================================================================
// LOCK SCREEN
// ================================================================
function LockScreen({ auth, imePodjetja }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  async function tryUnlock(fullPin) {
    setLoading(true)
    const ok = await auth.unlock(fullPin)
    // POPRAVLJENO (16.8.2026): sporocilo o napacni kodi je izginilo po 1,2 s,
    // poleg tega ga je NASLEDNJI pritisk tipke takoj izbrisal - uporabnik ni
    // videl nicesar in ni vedel, ali je zatipkal ali sistem ne dela.
    // Zdaj ostane vidno 4 sekunde in se ne izbrise ob naslednjem pritisku,
    // ampak sele ko se sprozi nov poskus.
    if (!ok) { setError(true); setPin(''); setTimeout(() => setError(false), 4000) }
    setLoading(false)
  }

  // POPRAVLJENO (19.8.2026): prej je vsak pritisk cez 800 ms sprozil preverjanje,
  // ne glede na dolzino - ze po PRVI stevilki je javilo "napacna koda" in cele
  // kode sploh ni bilo mogoce vnesti. Ker je PIN zdaj dolg 1-4 znake, samodejno
  // preverjanje ni mogoce (pri enomestnem PIN-u ne vemo, ali je uporabnik
  // koncal), zato je dodan gumb za potrditev.
  const PIN_MAX = 4
  /**
   * Cakanje po ZADNJEM pritisku, preden se PIN preveri (19.8.2026).
   *
   * Prvotno je vsak pritisk sprozil preverjanje cez 800 ms, ne glede na
   * dolzino - ze po prvi stevilki je javilo "napacna koda". Nato je bil dodan
   * gumb za potrditev, kar pa pomeni dodaten klik ob vsaki prijavi.
   *
   * Zdaj se casovnik ob VSAKEM pritisku ponastavi, tako da steje sele od
   * zadnje vtipkane stevilke. Kdor tipka pocasi, ima toliko casa, kolikor ga
   * potrebuje; kdor vtipka stiri stevilke, gre naprej takoj.
   */
  const AVTO_POTRDITEV_MS = 1600
  const casovnik = useRef(null)

  function press(d) {
    if (pin.length >= PIN_MAX || loading) return
    setError(false)
    const next = pin + d
    setPin(next)

    // Ponastavi cakanje - steje od zadnjega pritiska, ne od prvega.
    if (casovnik.current) clearTimeout(casovnik.current)

    if (next.length === PIN_MAX) {
      // Polna dolzina: ni dvoma, da je vnos koncan.
      casovnik.current = setTimeout(() => tryUnlock(next), 150)
    } else {
      casovnik.current = setTimeout(() => tryUnlock(next), AVTO_POTRDITEV_MS)
    }
  }

  function potrdi() {
    if (!pin.length || loading) return
    if (casovnik.current) clearTimeout(casovnik.current)
    setError(false)
    tryUnlock(pin)
  }

  function backspace() {
    // Brisanje pomeni, da uporabnik se tipka - ustavi samodejno potrditev.
    if (casovnik.current) clearTimeout(casovnik.current)
    setError(false)
    setPin(p => p.slice(0, -1))
  }

  // Ob odklopu komponente pocisti morebitni tekoci casovnik.
  useEffect(() => () => { if (casovnik.current) clearTimeout(casovnik.current) }, [])

  const days = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']

  return (
    <div style={{ position:'absolute', inset:0, zIndex:1000, background:'radial-gradient(circle at center, #1a3520 0%, #0d2818 60%, #06140d 100%)', color:T.headerInk, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'"Inter", system-ui, sans-serif' }}>
      <div style={{ position:'absolute', top:32, left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:T.brand, color:T.header, fontWeight:800, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{imePodjetja || 'Blagajna'}</div>
        </div>
      </div>

      <div style={{ marginBottom:28, textAlign:'center' }}>
        <div style={{ fontSize:78, fontWeight:200, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.04em', lineHeight:1 }}>
          {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
        </div>
        <div style={{ fontSize:14, opacity:0.7, marginTop:8, fontWeight:500 }}>
          {days[now.getDay()]}, {now.getDate()}. {months[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      <div style={{ textAlign:'center', marginBottom:22 }}>
        <div style={{ fontSize:13, opacity:0.65, fontWeight:600, marginBottom:14, letterSpacing:'0.04em' }}>Vnesite PIN za vstop</div>
        {/* POPRAVLJENO (16.8.2026): prej vedno SEST krogcev, PIN-i pa so lahko
            dolgi od ene do sestih stevk. Zaslon je nakazoval sestmestno kodo,
            preverjanje pa se je sprozilo prej - videti je bilo, kot da se ni
            zgodilo nic. Zdaj se prikaze en krogec na vneseno stevko. */}
        <div style={{ display:'flex', gap:10, justifyContent:'center', minHeight:14, alignItems:'center' }}>
          {pin.length === 0
            ? <div style={{ fontSize:12, opacity:0.4 }}>· · · ·</div>
            : Array.from({length: pin.length}).map((_,i) => (
                <div key={i} style={{ width:14, height:14, borderRadius:999, background: error ? '#ff5577' : T.brand, transition:'background .15s' }}/>
              ))}
        </div>
        {error && <div style={{ fontSize:13, color:'#ff5577', marginTop:14, fontWeight:700 }}>Napačna koda</div>}

        {/* DODANO (19.8.2026): brez tega je videti, kot da se nic ne dogaja -
            uporabnik ne ve, da bo koda cez trenutek preverjena sama. */}
        {!loading && !error && pin.length > 0 && pin.length < PIN_MAX && (
          <div style={{ fontSize:12, opacity:0.5, marginTop:14 }}>Še malo in preverim …</div>
        )}

        {loading && <div style={{ fontSize:13, opacity:0.6, marginTop:14 }}>Preverjam...</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 84px)', gap:14 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => press(String(n))} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:28, fontWeight:400 }}>{n}</button>
        ))}
        <button onClick={potrdi} disabled={!pin.length || loading} style={{ width:84, height:84, borderRadius:999, background: pin.length ? T.brand : 'rgba(246,241,232,0.04)', border:'none', color: pin.length ? T.header : 'rgba(246,241,232,0.25)', cursor: pin.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center' }} title="Potrdi">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </button>
        <button onClick={() => press('0')} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:28, fontWeight:400 }}>0</button>
        <button onClick={backspace} style={{ width:84, height:84, borderRadius:999, background:'rgba(246,241,232,0.08)', border:'none', color:T.headerInk, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l5-6h13v12H8l-5-6z"/><path d="m13 9 4 6M17 9l-4 6"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ================================================================
// MODAL
// ================================================================
function Modal({ open, onClose, children, width=480 }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(15,20,18,0.55)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth:'94%', maxHeight:'92%', overflow:'auto', background:T.modalBg, borderRadius:14, border:'1px solid rgba(0,0,0,0.06)', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(0,0,0,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
      <button onClick={onClose} style={{ width:32, height:32, borderRadius:10, border:'1px solid rgba(0,0,0,0.08)', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <KI name="x" size={16}/>
      </button>
    </div>
  )
}

// ================================================================
// PAYMENT MODAL — real Supabase order + payment
// ================================================================
function PaymentModal({ open, total, cart, activeTable, activeCustomer, auth, onCancel, onComplete }) {
  const [method, setMethod] = useState('cash')
  const [tipPct, setTipPct] = useState(0)
  const [given, setGiven] = useState('')
  const [discount, setDiscount] = useState(0)
  const [discountEur, setDiscountEur] = useState('')
  const [furs, setFurs] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [cardConfirmed, setCardConfirmed] = useState(false)
  // DODANO (21.8.2026): aktivne kartice izbrane stranke, za unovcenje obiska.
  const [strankineKartice, setStrankineKartice] = useState<any[]>([])
  const [izbranaKartica, setIzbranaKartica] = useState('')
  const [stanjePredplacila, setStanjePredplacila] = useState<number | null>(null)

  useEffect(() => {
    if (!open) { setMethod('cash'); setTipPct(0); setGiven(''); setDiscount(0); setDiscountEur(''); setFurs(true); setError(null); setProcessing(false) }
    if (open && typeof open === 'object') { if(open.discount) setDiscount(open.discount) }
    if (!open) setCardConfirmed(false)
    if (!open) { setStrankineKartice([]); setIzbranaKartica(''); setStanjePredplacila(null) }
  }, [open])

  // Nalozi aktivne kartice izbrane stranke (21.8.2026).
  useEffect(() => {
    if (!open || !activeCustomer?.id) { setStrankineKartice([]); return }
    let veljavno = true
    ;(async () => {
      const { data } = await createClient()
        .from('customer_packages')
        .select('id, name, remaining, total, expires, frozen_at, active, activation_type, activated_at, package_templates(validity_days)')
        .eq('customer_id', activeCustomer.id)
        .eq('active', true)
        .order('expires', { ascending: true })
      if (!veljavno) return
      // Samo kartice z OBISKI - clanarine se ne odstevajo po obiskih.
      const uporabne = (data || []).filter((k: any) => k.remaining !== null && k.remaining > 0)
      setStrankineKartice(uporabne)
      if (uporabne.length === 1) setIzbranaKartica(uporabne[0].id)

      // DODANO (21.8.2026): stanje predplacila. Prej se ob izbiri "Predplacilo"
      // ni videlo, koliko stranka sploh ima - blagajnik je izvedel sele ob
      // napaki "ni dovolj kritja".
      const { data: str } = await createClient()
        .from('customers').select('prepaid').eq('id', activeCustomer.id).maybeSingle()
      if (veljavno) setStanjePredplacila(Number(str?.prepaid ?? 0))
    })()
    return () => { veljavno = false }
  }, [open, activeCustomer?.id])

  const discountEurVal = parseFloat(discountEur) || 0
  const finalTotal = Math.max(0, (total - total * discount / 100 - discountEurVal)) + total * tipPct / 100
  const change = method === 'cash' && given ? Math.max(0, parseFloat(given) - finalTotal) : 0

  async function submitPayment() {
    if (!auth?.user?.id && !auth?.user?.is_master) {
      setError('Ni prijavljenega blagajnika')
      return
    }
    setProcessing(true)
    setError(null)
    try {
      // PREVERBA PRED ODPRTJEM NAROCILA (22.8.2026).
      //
      // NAPAKA: preverba kartice je bila SELE po odprtju narocila, zato je vsak
      // zavrnjen poskus (stranka brez kartice) pustil ODPRTO narocilo - sirota,
      // ki visi v bazi, zaseda zaporedno stevilko in je ni mogoce ne videti
      // ne zapreti.
      if (method === 'pkg') {
        if (!activeCustomer?.id) throw new Error('Za unovčenje kartice izberite stranko.')
        if (!izbranaKartica) throw new Error('Izberite kartico, s katere naj se odšteje obisk.')
        const k = strankineKartice.find((x: any) => x.id === izbranaKartica)
        if (!k) throw new Error('Izbrana kartica ni več na voljo — osvežite okno.')
        if (k.frozen_at) throw new Error('Kartica je zamrznjena — obiska ni mogoče odšteti.')
        if (!(k.remaining > 0)) throw new Error('Na kartici ni več obiskov.')
      }

      // KLJUCNO: pri dlje odprtih mizah (vec rund, dolgo cakanje) avtentikacijski
      // JWT zeton lahko poteče. Preden zacnemo placilni tok, eksplicitno osvezimo
      // sejo - sicer openOrder/addLine/pay lahko tiho spodletijo sredi postopka,
      // medtem ko FURS (server-side) se vedno uspe in natisne racun.
      const { data: sessionCheck, error: sessionError } = await createClient().auth.refreshSession()
      if (sessionError || !sessionCheck?.session) {
        throw new Error('Seja je potekla. Prosimo, ponovno se prijavite in poskusite znova.')
      }

      const cashierId = auth.user.id || null

      // 1. Odpri naročilo
      const orderId = await pos.orders.openOrder({
        tableId: activeTable?.id,
        // POPRAVLJENO (21.8.2026): pri prodaji paketa je bila stranka izbrana
        // v oknu paketa, ne na zaslonu Prodaja - `activeCustomer` je bil zato
        // prazen in racun se NI vezal na stranko. V profilu je pisalo
        // "Ni se nobenih nakupov" in PORABLJENO 0,00 EUR, ceprav je stranka
        // kupila paket za 400 EUR.
        customerId: (typeof open === 'object' && (open as any)?.customerId) || activeCustomer?.id,
        cashierId,
      })

      // 2. Nadomesti vrstice (NE dodajaj!) - narocilo je lahko ze imelo
      // shranjene vrstice iz prejsnjega switchToTable() klica (ko je uporabnik
      // zapustil mizo in se vrnil). Ce bi tu uporabili addLine(), bi se vrstice
      // podvojile, orders.total bi bil napacen, in pay_order() ne bi nikoli
      // oznacil narocila kot placano (SUM(placil) < napacno visok total) -
      // to je bil pravi koren izgubljenih/obticanih miznih racunov.
      await pos.orders.replaceLines(orderId, cart.map(line => ({
        itemId: line.id,
        name: line.name,
        qty: line.qty,
        unitPrice: line.happyHourApplied ? line.price * (1 - Number(line.happyHourPct ?? 20) / 100) : line.price,
        vatRate: line.vat_rate ?? 22,
        // POPRAVLJENO (16.8.2026, OBRACUN): popust se je prej obracunal SAMO na
        // osnovno ceno, doplacila modifikatorjev pa so ostala nepopustena -
        // znesek narocila v bazi se ni ujemal s tistim v kosarici in na racunu
        // (npr. 3,80 EUR namesto 3,50 EUR). Zdaj popust velja za oboje.
        mods: (line.mods || []).map((m:any) => ({
          ...m,
          delta: line.happyHourApplied ? Number(m.delta || 0) * (1 - Number(line.happyHourPct ?? 20) / 100) : Number(m.delta || 0),
        })),
        note: line.note || null,
      })))

      // 3. Plačaj + FURS
      let fursEor = null
      let fursZoi = null
      let fursInvoiceNumber = null
      // DODANO (17.8.2026): razlog neuspesne fiskalizacije, da ga POVEMO
      // blagajniku. Prej se je zapisal samo v konzolo - prodaja se je
      // zakljucila navidez normalno, racun pa je ostal brez davcne potrditve
      // in tega nihce ni opazil.
      let fursNapaka: string | null = null
      if (furs) {
        try {
          const fursRes = await fetch('/api/furs/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // premise_id eksplicitno iz uporabnikove izbire ob prijavi (21.7.2026 popravek)
            // POPRAVLJENO (16.8.2026, KRITICNO): tu je bila spremenljivka
            // "activePremise", ki v TEJ komponenti NE OBSTAJA - definirana je v
            // glavni komponenti. Vsak klic je zato vrgel ReferenceError, izjema
            // se je ujela, racun pa se je shranil BREZ ZOI in BREZ EOR.
            //
            // Uporabnik ni videl nicesar: prodaja se je zakljucila normalno, na
            // zaslonu ni bilo opozorila, v furs_log ni bilo zapisa (ker do FURS
            // sploh ni prislo), zvonec pa takih racunov ne lovi.
            //
            // Zdaj beremo isti podatek prek pomozne funkcije, ki je dosegljiva
            // povsod.
            body: JSON.stringify({ order_id: orderId, total: finalTotal, premise_id: getActivePremise()?.id }),
          })
          // 200 = success, 503 = FURS napaka ampak še vedno imamo ZOI + tridelno
          const fursData = await fursRes.json().catch(() => ({}))
          if (fursData.eor) fursEor = fursData.eor
          if (fursData.zoi) fursZoi = fursData.zoi
          if (fursData.invoiceNumber) fursInvoiceNumber = fursData.invoiceNumber
          if (!fursRes.ok && fursData.error) {
            console.warn('FURS:', fursData.error)
            fursNapaka = fursData.error
          } else if (!fursData.eor) {
            fursNapaka = 'FURS ni vrnil potrditvene kode (EOR).'
          }
        } catch (e: any) {
          console.warn('FURS klic ni uspel, račun bo shranjen brez EOR:', e?.message)
          fursNapaka = e?.message || 'Povezava s FURS ni uspela.'
        }
      }

      // DODANO (16.8.2026, KRITICNO): pri placilu s PREDPLACILOM se stranki
      // stanje NIKOLI ni odstelo - nikjer v kodi ali bazi ni bilo odstevanja,
      // zato bi lahko isto stanje porabila neomejeno mnogokrat. Odstejemo
      // PRED zabelezbo placila (atomarno v bazi, s preverbo kritja) - ce
      // kritja ni dovolj, se placilo sploh ne izvede.
      // UNOVCENJE KARTE OBISKOV (21.8.2026).
      //
      // KLJUCNO: storitev je bila placana ZE ob nakupu kartice, zato se znesek
      // NE sme zaracunati znova. Racun se zakljuci z 0 EUR, odsteje pa se en
      // obisk. Prej te poti sploh ni bilo - uporabniki so uporabljali "Bone",
      // ki izdajo navaden racun in ne odstejejo nicesar: stranka je bila
      // zaracunana dvakrat, kartica pa je ostala nedotaknjena.
      let unovcenaKartica: any = null
      if (method === 'pkg') {
        if (!activeCustomer?.id) throw new Error('Za unovčenje kartice izberite stranko.')
        if (!izbranaKartica) throw new Error('Izberite kartico, s katere naj se odšteje obisk.')

        const kartica = strankineKartice.find((k: any) => k.id === izbranaKartica)
        if (!kartica) throw new Error('Izbrana kartica ni več na voljo — osvežite okno.')
        if (kartica.frozen_at) throw new Error('Kartica je zamrznjena — obiska ni mogoče odšteti.')
        if (!(kartica.remaining > 0)) throw new Error('Na kartici ni več obiskov.')

        const posodobitve: any = { remaining: kartica.remaining - 1 }
        if (posodobitve.remaining === 0) posodobitve.active = false
        // Kartica z aktivacijo ob prvi uporabi se aktivira zdaj.
        if (!kartica.activated_at && kartica.activation_type === 'first_use') {
          posodobitve.activated_at = new Date().toISOString()
          const dni = kartica.package_templates?.validity_days
          if (dni) {
            const potek = new Date()
            potek.setDate(potek.getDate() + dni)
            posodobitve.expires = lokalniDatum(potek)
          }
        }

        const { data: odstet, error: kartErr } = await createClient()
          .from('customer_packages').update(posodobitve).eq('id', izbranaKartica)
          .eq('active', true).gt('remaining', 0).select('id, remaining')
        if (kartErr) throw new Error('Obiska ni bilo mogoče odšteti: ' + kartErr.message)
        if (!odstet || odstet.length === 0) {
          throw new Error('Obisk ni bil odštet — kartica je bila morda vmes porabljena.')
        }
        unovcenaKartica = { ...kartica, preostalo: odstet[0].remaining }
      }

      if (method === 'prep') {
        if (!activeCustomer?.id) throw new Error('Za plačilo s predplačilom izberite stranko.')
        const { error: prepErr } = await createClient().rpc('use_prepaid', {
          p_customer_id: activeCustomer.id,
          p_amount: finalTotal,
        })
        if (prepErr) throw new Error(prepErr.message || 'Predplačila ni bilo mogoče odšteti')
      }

      // DODANO (16.8.2026): napitnina in popust se NISTA nikoli zapisala na
      // narocilo. orders.tip_amount se bere na petih mestih (Z-porocilo,
      // porocila, izpisi), a ga ni nihce nastavil - napitnina je bila
      // zaracunana stranki, v evidencah pa je vedno kazala nic.
      const napitnina = Math.round(total * tipPct / 100 * 100) / 100
      const popust = Math.round((total * discount / 100 + discountEurVal) * 100) / 100
      if (napitnina > 0 || popust > 0) {
        const { error: tipErr } = await createClient().from('orders').update({
          tip_amount: napitnina,
          discount_amount: popust,
        }).eq('id', orderId)
        // POPRAVLJENO (17.8.2026): napitnina in popust vplivata na ZNESEK racuna.
        // Prej se je napaka zapisala samo v konzolo - racun je bil natisnjen z
        // enim zneskom, v evidenci pa je stal drug.
        if (tipErr) {
          console.error('Napitnine/popusta ni bilo mogoce zapisati:', tipErr)
          alert('POZOR: napitnine oziroma popusta ni bilo mogoče zapisati.\n\n' +
                'Znesek na natisnjenem računu se lahko razlikuje od zneska v evidenci. ' +
                'Preverite račun v zavihku Računi.')
        }
      }

      // Pri unovcenju kartice je znesek 0 - storitev je bila placana ze ob
      // nakupu kartice. Ce bi zapisali polni znesek, bi se prihodek stel
      // DVAKRAT: enkrat ob prodaji kartice in enkrat ob vsakem obisku.
      const znesekPlacila = method === 'pkg' ? 0 : finalTotal

      // DODANO (22.8.2026): klavzule o oprostitvi SHRANIMO na narocilo.
      // `order_lines` jih ne hrani, zato ponovni izpis racuna ni imel od kod
      // vzeti besedila - noga racuna z 0 % DDV je ostala brez zakonsko
      // obveznega razloga. Shranimo BESEDILO (ne kode), da sprememba
      // zakonodaje ne spremeni ze izdanih racunov.
      const klavzuleRacuna = Array.from(new Set(
        (cart || [])
          .filter((l: any) => Number(l.vat_rate ?? 22) === 0)
          .map((l: any) => vatExemptionText(l.vat_exemption_code, l.vat_exemption_custom_text))
          .filter(Boolean)
      )) as string[]
      // Pri unovcenju kartice postavimo znesek narocila na 0, SICER OSTANE
      // ODPRTO: baza zapre racun le, ko vsota placil pokrije znesek (0 ni >= 40).
      // Zato racun ni bil viden v seznamu Racuni, cetudi je bil fiskaliziran.
      if (method === 'pkg' && orderId) {
        const { error: nulErr } = await createClient()
          .from('orders').update({ total: 0, subtotal: 0, vat_amount: 0 }).eq('id', orderId)
        if (nulErr) throw new Error('Računa ni bilo mogoče pripraviti: ' + nulErr.message)
      }

      if (klavzuleRacuna.length > 0 && orderId) {
        const { error: klErr } = await createClient()
          .from('orders').update({ vat_exemption_text: klavzuleRacuna.join('\n') }).eq('id', orderId)
        if (klErr) console.error('Klavzule ni bilo mogoce shraniti na racun:', klErr.message)
      }

      const payResult = await pos.orders.pay({
        orderId,
        method: method === 'bon' ? 'bon' : method === 'prep' ? 'prep' : method,
        amount: znesekPlacila,
        received: method === 'cash' && given ? parseFloat(given) : null,
        furs,
        cashierId,
        fursEor,
        fursZoi,
      })

      // ODSTRANJENO (16.8.2026, KRITICNO): tu je bilo DRUGO odstevanje zaloge -
      // zaloga se ze odsteje s sprozilcem trg_order_line_stock v bazi (ob
      // shranjevanju vrstic narocila). Ta koda je odstevala se enkrat, povrh
      // tega pa je uporabljala ZASTAREL posnetek line.stock (iz trenutka, ko je
      // bil artikel dodan v kosarico) in zapisala ABSOLUTNO vrednost - pri dveh
      // hkratnih blagajnah je to povozilo tuje spremembe (lost update).
      // Odstevanje zdaj v celoti opravi baza: atomarno, brez zastarelih vrednosti.
      // Odštej surovine za recipe artikle
      try {
        // POPRAVLJENO (17.8.2026): prej gnezdena zanka z LOCENIM klicem na bazo
        // za vsak recept in nato za vsako sestavino - pri desetih izdelkih s po
        // petimi sestavinami je to petdeset zaporednih klicev, vsak s svojo
        // zakasnitvijo. Blagajna je pri vecji kosarici opazno cakala PO tem, ko
        // je bila prodaja ze zakljucena.
        //
        // Zdaj: normativi vseh receptov v ENI poizvedbi, odstevanja pa vzporedno.
        // VAROVALKA (21.8.2026): `item_type` se v kosarici ni prenasal, zato je
        // bil ta seznam VEDNO prazen in normativi se niso odsteli nikoli -
        // brez sledi. Ce vrstica vrste nima, jo poiscemo v katalogu; ce je
        // recept in normativa ni, to zabelezimo, da napaka ne ostane tiha.
        // POPRAVLJENO (21.8.2026): varovalka iz preleta 70 je uporabljala
        // `posData`, ki ga ta komponenta NE prejme - ob vrstici brez
        // `item_type` bi vrgla "posData is not defined" sredi placila.
        // Kosarica zdaj vrsto vedno nosi (prelet 70), zato zadosca preverba,
        // manjkajoco vrsto pa le zabelezimo.
        const recepti = cart.filter(l => {
          if (l.item_type) return l.item_type === 'recipe'
          console.warn('Vrstica brez item_type — normativi zanjo ne bodo odsteti:', l.name)
          return false
        })
        if (recepti.length > 0) {
          const db = createClient()
          const { data: vsiNormativi } = await db
            .from('item_ingredients')
            .select('item_id, ingredient_id, qty_used')
            .in('item_id', recepti.map(l => l.id))

          // Sestej porabo po sestavini: ce se ista sestavina pojavi v vec
          // receptih, jo odstejemo ENKRAT s skupno kolicino.
          const poSestavini = new Map<string, number>()
          for (const linija of recepti) {
            for (const nl of (vsiNormativi || [])) {
              if (nl.item_id !== linija.id) continue
              const skupaj = (poSestavini.get(nl.ingredient_id) || 0) + Number(nl.qty_used) * linija.qty
              poSestavini.set(nl.ingredient_id, skupaj)
            }
          }

          // POPRAVLJENO (16.8.2026): odstevanje atomarno v bazi - prej
          // SELECT + izracun + UPDATE, kar je pri dveh hkratnih blagajnah
          // pomenilo, da je druga povozila prvo.
          await Promise.all(Array.from(poSestavini.entries()).map(([id, qty]) =>
            db.rpc('decrement_ingredient_stock', { p_ingredient_id: id, p_qty: qty })
          ))
        }
      } catch(normErr) { console.warn('Normativ odštevanje ni uspelo:', normErr) }

      // Pridobi org + premise + device + cashier za izpis računa
      let orgInfo = null
      let premiseInfo = null
      let deviceInfo = null
      let cashierDisplayName = ''
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          const mem = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
          if (mem) {
            const { data: o } = await sb.from('organizations').select('*').eq('id', mem.org_id).single()
            orgInfo = o
            const { data: p } = await sb.from('business_premises').select('*').eq('org_id', mem.org_id).eq('is_active', true).limit(1).maybeSingle()
            premiseInfo = p
            if (p) {
              const { data: d } = await sb.from('electronic_devices').select('*').eq('premise_id', p.id).eq('is_active', true).maybeSingle()
              deviceInfo = d
            }
          }
          // POPRAVLJENO (16.8.2026): na racun se je natisnila PREDPONA E-NASLOVA
          // racuna (npr. "mahnic.nik+test1"), ne ime osebe, ki je racun izdala.
          // Prav sledljivost "kdo je izdal racun" je razlog, da ima vsak svoj
          // PIN - na dokumentu se je to izgubilo.
          cashierDisplayName = auth?.user?.name || ''
        }
      } catch (e) { console.warn('Receipt meta load:', e) }

      const fallbackNumber = `RAC-${orderId ? orderId.slice(-5).toUpperCase() : Date.now().toString().slice(-5)}`

      // DODANO (17.8.2026): ce je bila fiskalizacija ZAHTEVANA, a ni uspela,
      // to POVEJ. Prej se je prodaja zakljucila navidez normalno in racun je
      // ostal brez davcne potrditve - blagajnik tega ni imel kako opaziti.
      // Racun je vseeno izdan (denar je prejet), zato ne ustavljamo prodaje;
      // opozorimo pa, da ga je treba naknadno potrditi.
      if (furs && fursNapaka) {
        // POPRAVLJENO (17.8.2026): locimo, ali je racun sploh nastal. Ce klic
        // pade PRED dodelitvijo stevilke, racuna ni in navodilo o naknadni
        // potrditvi je zavajajoce - blagajnik bi iskal zapis, ki ne obstaja.
        const racunObstaja = !!fursInvoiceNumber
        alert(
          racunObstaja
            ? 'Račun ' + fursInvoiceNumber + ' je izdan, DAVČNO POTRJEVANJE pa NI uspelo.\n\n' +
              'Razlog: ' + fursNapaka + '\n\n' +
              'Potrdite ga prek zvonca v glavi blagajne — gumb "Pošlji v potrditev". ' +
              'Po zakonu v dveh delovnih dneh.'
            : 'Račun NI bil izdan.\n\n' +
              'Razlog: ' + fursNapaka + '\n\n' +
              'Davčno potrjevanje ni uspelo že pred dodelitvijo številke računa, ' +
              'zato račun ni nastal in zaporedna številka ni bila porabljena. ' +
              'Prodajo ponovite.'
        )
      }

      onComplete({
        method,
        total: finalTotal,
        subtotal: total,
        // POPRAVLJENO (16.8.2026): prej "discount_amount: total - finalTotal" in
        // "tip: 0" - ob napitnini je razlika NEGATIVNA, zato je racun prikazal
        // negativen popust namesto napitnine.
        discount_amount: popust,
        tip: napitnina,
        furs,
        eor: fursEor,
        zoi: fursZoi,
        orderId,
        invoiceNumber: fursInvoiceNumber || fallbackNumber,
        org: orgInfo ? {
          name: orgInfo.name,
          address: orgInfo.address,
          post_code: orgInfo.post_code,
          city: orgInfo.city,
          tax_number: orgInfo.tax_number,
          vat_registered: orgInfo.vat_registered,
        } : null,
        premiseId: premiseInfo?.premise_id || '',
        deviceId: deviceInfo?.device_id || 'RACUNKO01',
        cashierName: cashierDisplayName,
        lines: cart.map(l => ({
          name: l.name,
          qty: l.qty,
          // POPRAVLJENO (16.8.2026): na racunu se doplacila modifikatorjev prej
          // NISO upostevala - kupec bi videl nizjo ceno, kot jo dejansko placa.
          // Enak izracun kot v H.lineTotal in replaceLines (cena + doplacila).
          unitPrice: (() => { const b = l.price + (l.mods || []).reduce((s, m) => s + (m.delta || 0), 0); return l.happyHourApplied ? b * (1 - Number(l.happyHourPct ?? 20) / 100) : b })(),
          unit_price: (() => { const b = l.price + (l.mods || []).reduce((s, m) => s + (m.delta || 0), 0); return l.happyHourApplied ? b * (1 - Number(l.happyHourPct ?? 20) / 100) : b })(),
          vat_rate: l.vat_rate ?? 22,
        })),
      })
    } catch (e) {
      // KLJUCNO ZA DIAGNOSTIKO: trajno zabelezi vsako napako v placilnem toku,
      // da naslednjic ne rabimo detektivsko rekonstruirati vzroka iz posrednih podatkov
      try {
        await createClient().from('furs_log').insert({
          org_id: null,
          invoice_id: null,
          status: 'client_error',
          error_message: 'POS submitPayment napaka: ' + (e?.message || String(e)),
          raw_request: { source: 'pos_client_error', stack: e?.stack || null, cart_snapshot: cart },
        })
      } catch (logErr) { console.error('Napaka pri beleženju napake:', logErr) }
      setError(e.message || 'Napaka pri plačilu')
      setProcessing(false)
    }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={processing ? undefined : onCancel} width={620}>
      <ModalHeader title="Zaključi račun" onClose={onCancel}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px' }}>
        <div style={{ padding:22, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Način plačila</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
              {CFG.paymentMethods.map(pm => (
                <button key={pm.id} onClick={() => { setMethod(pm.id); setCardConfirmed(false) }} style={{ padding:'12px 8px', borderRadius:10, cursor:'pointer', background: method===pm.id ? T.accent : T.chipBg, color: method===pm.id ? '#fff' : 'inherit', border:'none', display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:13, fontFamily:'inherit' }}>
                  <span style={{ fontSize:20 }}>{pm.icon}</span>{pm.name}
                </button>
              ))}
            </div>
          </div>
          {/* UNOVCENJE KARTE OBISKOV (21.8.2026) */}
          {method === 'pkg' && (
            <div>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Katera kartica</div>
              {!activeCustomer?.id ? (
                <div style={{ padding:'11px 13px', borderRadius:9, background:'rgba(184,140,40,0.1)', color:'#8A5A00', fontSize:13, lineHeight:1.5 }}>
                  Najprej izberite stranko — kartica je vezana nanjo.
                </div>
              ) : strankineKartice.length === 0 ? (
                <div style={{ padding:'11px 13px', borderRadius:9, background:'rgba(184,140,40,0.1)', color:'#8A5A00', fontSize:13, lineHeight:1.5 }}>
                  {activeCustomer.name} nima aktivne kartice s preostalimi obiski.
                </div>
              ) : (
                <>
                  <select value={izbranaKartica} onChange={e => setIzbranaKartica(e.target.value)}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', fontFamily:'inherit', fontSize:14, background:T.inputBg, outline:'none', boxSizing:'border-box' }}>
                    <option value="">— izberite kartico —</option>
                    {strankineKartice.map((k: any) => (
                      <option key={k.id} value={k.id} disabled={!!k.frozen_at}>
                        {k.name} — {k.remaining} {k.remaining === 1 ? 'obisk' : 'obiskov'}
                        {k.frozen_at ? ' (zamrznjena)' : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop:8, padding:'10px 12px', borderRadius:8, background:T.accentSoft, color:T.accent, fontSize:12, lineHeight:1.5 }}>
                    Odšteje se <strong>1 obisk</strong>. Storitev je bila plačana ob nakupu
                    kartice, zato se znesek NE zaračuna znova.
                  </div>
                </>
              )}
            </div>
          )}

          {/* STANJE PREDPLACILA (21.8.2026) */}
          {method === 'prep' && (
            <div>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Stanje predplačila</div>
              {!activeCustomer?.id ? (
                <div style={{ padding:'11px 13px', borderRadius:9, background:'rgba(184,140,40,0.1)', color:'#8A5A00', fontSize:13, lineHeight:1.5 }}>
                  Najprej izberite stranko — predplačilo je vezano nanjo.
                </div>
              ) : stanjePredplacila === null ? (
                <div style={{ fontSize:13, color:T.muted }}>Nalagam…</div>
              ) : (
                <div style={{ padding:'11px 13px', borderRadius:9,
                  background: stanjePredplacila >= finalTotal ? T.accentSoft : 'rgba(163,45,45,0.08)',
                  color: stanjePredplacila >= finalTotal ? T.accent : T.danger, fontSize:13, lineHeight:1.6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700 }}>
                    <span>{activeCustomer.name}</span><span>{eur(stanjePredplacila)}</span>
                  </div>
                  {stanjePredplacila >= finalTotal ? (
                    <div style={{ fontSize:12, marginTop:3 }}>Po plačilu ostane {eur(stanjePredplacila - finalTotal)}.</div>
                  ) : (
                    <div style={{ fontSize:12, marginTop:3 }}>
                      Manjka {eur(finalTotal - stanjePredplacila)} — plačilo s predplačilom ne bo mogoče.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {method === 'cash' && (
            <div>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Prejeto</div>
              <input value={given} onChange={e => setGiven(e.target.value)} placeholder={eur(finalTotal)} style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', fontFamily:'inherit', fontSize:20, fontWeight:600, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
              <div style={{ display:'flex', gap:5, marginTop:6, flexWrap:'wrap' }}>
                {[5,10,20,50,100].map(v => (
                  <button key={v} onClick={() => setGiven(String(v))} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid rgba(0,0,0,0.08)', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12 }}>{v}€</button>
                ))}
              </div>
              {change > 0 && (
                <div style={{ marginTop:8, padding:'9px 12px', borderRadius:8, background:T.accentSoft, color:T.accent, fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between' }}>
                  <span>Za vrniti</span><span>{eur(change)}</span>
                </div>
              )}
            </div>
          )}
          {method === 'card' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {/* Velik znesek za vnos na terminal */}
              <div style={{ background:T.accentSoft, borderRadius:14, padding:'20px 16px', textAlign:'center' }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em' }}>Vnesi na terminal</div>
                <div style={{ fontSize:48, fontWeight:800, color:T.accent, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>{eur(finalTotal)}</div>
              </div>
              {!cardConfirmed ? (
                <button
                  onClick={() => setCardConfirmed(true)}
                  style={{ width:'100%', padding:'14px', borderRadius:10, border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:15, fontFamily:'inherit', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  ✅ Kartica potrjena na terminalu
                </button>
              ) : (
                <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(31,107,58,0.12)', color:T.accent, fontWeight:700, fontSize:14, textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  ✅ Plačilo potrjeno — klikni Zaključi
                </div>
              )}
            </div>
          )}
          <div style={{ display:'flex', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Napitnina</div>
              <div style={{ display:'flex', gap:4 }}>
                {CFG.tips.map(p => (
                  <button key={p} onClick={() => setTipPct(p)} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:600, fontSize:12, background: tipPct===p ? T.accentSoft : T.chipBg, color: tipPct===p ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:12, color:T.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Popust</div>
              <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                {[0,5,10,20].map(p => (
                  <button key={p} onClick={() => { setDiscount(p); setDiscountEur('') }} style={{ flex:1, padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:600, fontSize:12, background: discount===p && !discountEur ? T.accentSoft : T.chipBg, color: discount===p && !discountEur ? T.accent : 'inherit' }}>
                    {p===0 ? '—' : `${p}%`}
                  </button>
                ))}
              </div>
              <input value={discountEur} onChange={e=>{ setDiscountEur(e.target.value); setDiscount(0) }} placeholder="Popust €" style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
            </div>
          </div>
          {error && <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(168,50,50,0.10)', color:T.danger, fontSize:12, fontWeight:600 }}>✕ {error}</div>}
        </div>
        <div style={{ padding:22, background:T.summaryBg, borderLeft:'1px solid rgba(0,0,0,0.06)', display:'flex', flexDirection:'column' }}>
          <div style={{ fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:T.muted, marginBottom:10 }}>Povzetek</div>

          {/* DODANO (21.8.2026): SEZNAM POSTAVK. Prej sta bili prikazani samo
              vrstici DDV in Skupaj - blagajnik pred potrditvijo ni videl, KAJ
              potrjuje. Pri mesanem racunu z vec storitvami je bilo to slepo
              potrjevanje zneska. */}
          {(cart || []).length > 0 ? (
            <div style={{ marginBottom:10, maxHeight:180, overflowY:'auto' }}>
              {cart.map((l: any, i: number) => (
                <div key={l.lineId || i} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'4px 0', fontSize:12, lineHeight:1.35 }}>
                  <span style={{ flex:1, minWidth:0 }}>
                    {Number(l.qty) > 1 && <span style={{ color:T.muted }}>{l.qty}× </span>}
                    {l.name}
                  </span>
                  <span style={{ fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                    {eur(zesekVrstice(l))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom:10, fontSize:12, color:T.muted, lineHeight:1.4 }}>
              Postavke niso na voljo — znesek je bil pripravljen drugje
              (npr. prodaja paketa).
            </div>
          )}

          {discount > 0 && <SRow label={`Popust ${discount}%`} v={-total*discount/100}/>}
          {tipPct > 0 && <SRow label={`Napitnina ${tipPct}%`} v={total*tipPct/100}/>}
          <div style={{ marginTop:'auto', paddingTop:12, borderTop:'1px solid rgba(0,0,0,0.08)' }}>
            <SRow label="DDV" v={vatBreakdownForCart(cart, total > 0 ? finalTotal / total : 1).vat} muted/>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:6 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Skupaj</div>
              <div style={{ fontWeight:800, fontSize:26, fontVariantNumeric:'tabular-nums' }}>{eur(finalTotal)}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding:'12px 22px 20px', borderTop:'1px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:10 }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:500, color:T.muted, cursor:'pointer' }}>
          <input type="checkbox" checked={furs} onChange={e => setFurs(e.target.checked)} disabled={processing} style={{ accentColor:T.accent, width:15, height:15 }}/>
          Davčno potrdi (FURS)
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={onCancel} disabled={processing} style={{ padding:'10px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid rgba(0,0,0,0.12)', background:'transparent', fontWeight:600, fontSize:13, opacity: processing ? 0.4 : 1 }}>Prekliči</button>
          {/* DODANO (22.8.2026): gumb je ostal videti aktiven tudi, kadar
              unovcenje ni mogoce (stranka brez kartice) - napaka se je pokazala
              sele PO kliku. Zdaj je onemogocen in pove, zakaj. */}
          {(() => {
            const nedovoljeno = method === 'pkg'
              ? (!activeCustomer?.id ? 'Izberite stranko'
                : strankineKartice.length === 0 ? 'Stranka nima kartice'
                : !izbranaKartica ? 'Izberite kartico' : null)
              : null
            const zaklenjen = processing || !!nedovoljeno
            return (
              <button onClick={submitPayment} disabled={zaklenjen}
                title={nedovoljeno || undefined}
                style={{ padding:'10px 22px', borderRadius:9, cursor: processing ? 'wait' : zaklenjen ? 'not-allowed' : 'pointer', fontFamily:'inherit', border:'none', background: zaklenjen && !processing ? '#B8B4AC' : T.accent, color:'#fff', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:6, opacity: processing ? 0.7 : 1 }}>
                {processing ? '⏳ Obdelujem...'
                  : nedovoljeno ? nedovoljeno
                  : <><KI name="check" size={16}/> Zaključi {eur(finalTotal)}</>}
              </button>
            )
          })()}
        </div>
      </div>
    </Modal>
  )
}

function SRow({ label, v, muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13, color: muted ? T.muted : 'inherit' }}>
      <span>{label}</span><span style={{ fontVariantNumeric:'tabular-nums' }}>{v < 0 ? '−' : ''}{eur(Math.abs(v))}</span>
    </div>
  )
}

async function autoPrint(data) {
  // Electron IPC — raw ESC/POS (brez dialoga)
  if (typeof window !== 'undefined' && (window as any).electronAPI?.printRaw) {
    try {
      const printData = {
        business_name: data.org?.name || 'Blagajna',
        business_address: [data.org?.address, [data.org?.post_code, data.org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        tax_number: data.org?.tax_number || '',
        vat_id: data.org?.vat_registered ? 'SI' + (data.org?.tax_number||'') : '',
        receipt_number: data.invoiceNumber || (data.orderId?.slice(-6)) || '—',
        cashier: data.cashierName || '',
        date: new Date().toLocaleString('sl-SI'),
        items: (data.lines||[]).map(l => ({
          name: l.name,
          qty: Number(l.qty),
          unit_price: Number(l.unitPrice||l.unit_price||0),
          vat_rate: Number(l.vat_rate ?? 22),
        })),
        subtotal: Number(data.subtotal||data.total||0),
        discount_pct: data.discount_pct || 0,
        discount_amount: Number(data.discount_amount||0),
        tip: Number(data.tip||0),
        total: Number(data.total||0),
        payment_method: data.method,
        furs_zoi: data.zoi,
        furs_eor: data.eor,
        premise_id: data.premiseId || '',
        premise_address: data.premiseAddress || '',
        is_copy: false,
      }
      const result = await (window as any).electronAPI.printRaw(printData)
      if (result?.ok) return
      if (result?.error) alert('Napaka tiskalnika: ' + result.error)
    } catch (e: any) { alert('Napaka ESC/POS: ' + e.message) }
    return
  }
  // Poskusi lokalni print server (Star/Epson termalni)
  try {
    const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
    if (res.ok) {
      const printData = {
        business_name: data.org?.name || 'Blagajna',
        business_address: [data.org?.address, [data.org?.post_code, data.org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        business_tax: data.org?.vat_registered
          ? `Davčna: ${data.org?.tax_number || ''} | ID za DDV: SI${data.org?.tax_number || ''}`
          : `Davčna: ${data.org?.tax_number || ''}`,
        receipt_number: data.invoiceNumber || data.orderId?.slice(-6),
        cashier: data.cashierName || '',
        date: new Date().toLocaleString('sl-SI'),
        items: (data.lines||[]).map(l => ({
          name: l.name,
          qty: Number(l.qty),
          unit_price: Number(l.unitPrice||l.unit_price||0),
          vat_rate: Number(l.vat_rate ?? 22),
        })),
        subtotal: Number(data.subtotal||data.total||0),
        discount_pct: data.discount_pct || 0,
        discount_amount: data.discount_amount || 0,
        tip: data.tip || 0,
        total: data.total,
        payment_method: data.method,
        furs_zoi: data.zoi,
        furs_eor: data.eor,
      }
      const printRes = await fetch('http://localhost:6789/print/receipt', {
        // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
        // neodzivni storitvi visi, dokler je streznik sam ne prekine.
        signal: AbortSignal.timeout(3000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(printData)
      })
      if ((await printRes.json()).ok) return
    }
  } catch(e) {}

  // Fallback: browser print z lib/receipt.ts helperjem
  try {
    const html = await buildReceiptHTML({
      org: data.org || {
        // POPRAVLJENO (21.8.2026): `posData?.` NE prepreci napake, ce ime
        // sploh ni definirano - vrze "posData is not defined". Ta komponenta
        // ga ne prejme, ime podjetja pa je ze v `data.org`.
        name: 'Blagajna',
        address: '',
        city: '',
        post_code: '',
        tax_number: '',
        vat_registered: false,
      },
      premiseId: data.premiseId || '',
      premiseAddress: data.premiseAddress || '',
      deviceId: data.deviceId || '',
      invoiceNumber: data.invoiceNumber || (data.orderId?.slice(-6)) || '—',
      issueDate: new Date(),
      cashierName: data.cashierName || '',
      payment: {
        method: data.method,
        furs_zoi: data.zoi,
        furs_eor: data.eor,
      },
      lines: (data.lines||[]).map(l => ({
        name: l.name,
        qty: Number(l.qty),
        unit_price: Number(l.unitPrice||l.unit_price||0),
        vat_rate: Number(l.vat_rate ?? 22),
        total: Number(l.total || (l.qty * (l.unitPrice||l.unit_price||0))),
      })),
      subtotal: Number(data.subtotal||data.total||0),
      discountAmount: Number(data.discount_amount||0),
      tip: Number(data.tip||0),
      total: Number(data.total||0),
      // DODANO (19.8.2026): klavzule o neobracunanem DDV za postavke po 0 %.
      // Ce je na racunu vec razlicnih oproscenih storitev (npr. fizioterapija
      // po 42. clenu in najem po 44.), se izpisejo vse - vsaka enkrat.
      vatExemptions: Array.from(new Set(
        (data.lines || [])
          .filter((l: any) => Number(l.vat_rate ?? 22) === 0)
          .map((l: any) => vatExemptionText(l.vat_exemption_code, l.vat_exemption_custom_text))
          .filter(Boolean)
      )) as string[],
    })
    const w = window.open('', '_blank', 'width=380,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
  } catch (e: any) {
    // POPRAVLJENO (17.8.2026): ce tiskanje ne uspe (blokiran pojavni zaslon,
    // zavrnjen dostop), uporabnik ni izvedel nicesar - racun je bil izdan, a
    // brez potrdila za stranko.
    console.error('Receipt print error:', e)
    alert('Računa ni bilo mogoče natisniti.\n\n' +
          'Račun JE izdan in shranjen. Natisnete ga lahko znova v zavihku Računi ' +
          '(gumb Ponovni izpis).\n\nČe se to ponavlja, preverite, ali brskalnik ' +
          'blokira pojavna okna.')
  }
}

function ReceiptToast({ data, onClose }) {
  const fursOk = data?.eor
  const fursFailed = data?.furs && !data?.eor

  React.useEffect(() => {
    if (data) {
      // Avtomatski print
      autoPrint(data)
      // Avtomatsko zapri potrditveno okno po tisku (ni treba rocno klikati Zapri)
      const t = setTimeout(() => { onClose() }, 1000)
      return () => clearTimeout(t)
    }
  }, [data])

  if (!data) return null
  return (
    <Modal open={!!data} onClose={onClose} width={340}>
      <div style={{ padding:'28px 22px', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:999, margin:'0 auto 14px', background:fursFailed?'rgba(168,50,50,0.1)':T.accentSoft, color:fursFailed?T.danger:T.accent, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <KI name="check" size={28} strokeWidth={2.5}/>
        </div>
        <div style={{ fontSize:20, fontWeight:700 }}>Racun zakljucen</div>
        <div style={{ fontSize:22, fontWeight:700, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{eur(data.total)}</div>
        {fursOk && (
          <div style={{ fontSize:12, color:T.accent, marginTop:8, fontWeight:600 }}>
            FURS potrjen
          </div>
        )}
        {fursFailed && (
          /* POPRAVLJENO (17.8.2026): prej je pisalo "Racun je shranjen, potrdi
             ga rocno v zavihku Racuni". To je bilo ZAVAJAJOCE na dva nacina:
             ce klic pade PRED dodelitvijo stevilke, se racun sploh ne shrani in
             ga v zavihku Racuni NI - rocna potrditev torej ni mogoca, ker
             zapisa ni. Blagajnik je iskal nekaj, cesar ni bilo.

             Zdaj locimo dva primera: racun z dodeljeno stevilko RES obstaja in
             ga je mogoce naknadno potrditi prek zvonca; racun brez stevilke pa
             ni nastal in prodajo je treba ponoviti. */
          <div style={{ fontSize:12, color:T.danger, marginTop:8, background:'rgba(168,50,50,0.08)', padding:'10px 12px', borderRadius:8, lineHeight:1.6, textAlign:'left' }}>
            {data.invoiceNumber && !String(data.invoiceNumber).startsWith('RAC-') ? (
              <>
                <b>⚠️ Davčno potrjevanje ni uspelo.</b><br/>
                Račun je izdan in shranjen. Potrdite ga prek <b>zvonca</b> v glavi
                blagajne — gumb „Pošlji v potrditev". Po zakonu v dveh delovnih dneh.
              </>
            ) : (
              <>
                <b>⚠️ Račun NI bil izdan.</b><br/>
                Davčno potrjevanje ni uspelo že pred dodelitvijo številke, zato
                račun ni nastal. Prodajo <b>ponovite</b> — zaporedna številka ni
                bila porabljena.
              </>
            )}
          </div>
        )}
        <div style={{ fontSize:13, fontWeight:600, color:T.muted, marginTop:4 }}>{data.invoiceNumber}</div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid rgba(0,0,0,0.1)', background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={()=>autoPrint(data)} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <KI name="print" size={14}/> Natisni
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ================================================================
// SIDE NAV
// ================================================================
const SCREENS = {
  floor:     { label:'Prostori & mize', icon:'chair'    },
  sale:      { label:'Prodaja',         icon:'grid'     },
  calendar:  { label:'Koledar',         icon:'calendar' },
  customers: { label:'Stranke',         icon:'users'    },
  packages:  { label:'Paketi',          icon:'package'  },
  inventory: { label:'Zaloga',          icon:'box'      },
  inventura: { label:'Inventura',       icon:'scale'    },
  orders:    { label:'Računi',          icon:'receipt'  },
  reports:   { label:'Poročila',        icon:'chart'    },
  admin:     { label:'Nastavitve',      icon:'settings' },
}

/**
 * Levi meni blagajne z urejanjem po meri (20.8.2026).
 *
 * Vrstni red je doslej dolocal profil poslovanja (bar, restavracija ...) in
 * ga uporabnik ni mogel spremeniti. Vsak lokal pa dela drugace: nekje je
 * najpogostejsa Prodaja, drugje Koledar ali Zaloga.
 *
 * Vrstni red se shrani NA NAPRAVO in NA UPORABNIKA - blagajnik ima lahko
 * drugacen razpored kot lastnik na isti blagajni.
 */
function SideNav({ screen, setScreen, nav, staffId }) {
  const kljuc = 'pos_nav_vrstni_red_' + (staffId || 'skupno')
  const [urejanje, setUrejanje] = React.useState(false)
  const [vrstniRed, setVrstniRed] = React.useState(nav)
  const [vlecem, setVlecem] = React.useState(null)
  const [nad, setNad] = React.useState(null)

  // Naloz(i shranjen vrstni red; ce se je profil vmes spremenil, dodaj nove
  // zaslone na konec in odstrani tiste, ki jih profil ne vsebuje vec.
  React.useEffect(() => {
    let shranjen = null
    try { shranjen = JSON.parse(localStorage.getItem(kljuc) || 'null') } catch {}
    if (Array.isArray(shranjen) && shranjen.length > 0) {
      const veljavni = shranjen.filter(id => nav.includes(id))
      const manjkajoci = nav.filter(id => !veljavni.includes(id))
      setVrstniRed([...veljavni, ...manjkajoci])
    } else {
      setVrstniRed(nav)
    }
  }, [nav.join(','), kljuc])

  function shrani(novi) {
    setVrstniRed(novi)
    try { localStorage.setItem(kljuc, JSON.stringify(novi)) } catch {}
  }

  function spusti(ciljniId) {
    if (!vlecem || vlecem === ciljniId) { setVlecem(null); setNad(null); return }
    const novi = vrstniRed.filter(x => x !== vlecem)
    const idx = novi.indexOf(ciljniId)
    novi.splice(idx < 0 ? novi.length : idx, 0, vlecem)
    shrani(novi)
    setVlecem(null); setNad(null)
  }

  return (
    <div style={{ width:80, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', gap:4, flexShrink:0 }}>
      {vrstniRed.map(id => {
        const s = SCREENS[id]
        if (!s) return null
        const active = screen === id
        const jeNad = nad === id && vlecem && vlecem !== id
        return (
          <button
            key={id}
            draggable={urejanje}
            onDragStart={() => setVlecem(id)}
            onDragOver={e => { if (urejanje) { e.preventDefault(); setNad(id) } }}
            onDragLeave={() => setNad(n => n === id ? null : n)}
            onDrop={e => { e.preventDefault(); spusti(id) }}
            onDragEnd={() => { setVlecem(null); setNad(null) }}
            onClick={() => { if (!urejanje) setScreen(id) }}
            title={urejanje ? 'Povlecite za premik' : s.label}
            style={{
              width:64, padding:'11px 4px', borderRadius:10,
              cursor: urejanje ? 'grab' : 'pointer',
              background: active && !urejanje ? T.accentSoft : urejanje ? T.surface2 : 'transparent',
              color: active && !urejanje ? T.accent : T.inkSoft,
              border:'none', fontFamily:'inherit', position:'relative',
              display:'flex', flexDirection:'column', alignItems:'center', gap:5,
              opacity: vlecem === id ? 0.4 : 1,
              boxShadow: jeNad ? 'inset 0 3px 0 ' + T.accent : 'none',
              transition: 'opacity .12s',
            }}>
            {active && !urejanje && <span style={{ position:'absolute', left:-2, top:10, bottom:10, width:3, borderRadius:2, background:T.accent }}/>}
            {urejanje && <span style={{ position:'absolute', top:2, right:6, fontSize:9, color:T.muted }}>⠿</span>}
            <KI name={s.icon} size={20}/>
            <span style={{ fontSize:10, fontWeight:700, textAlign:'center', lineHeight:1.15 }}>{s.label.split(' ')[0]}</span>
          </button>
        )
      })}

      <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
        {urejanje && (
          <button onClick={() => { try { localStorage.removeItem(kljuc) } catch {}; setVrstniRed(nav) }}
            title="Povrni privzeti vrstni red"
            style={{ width:64, padding:'7px 4px', borderRadius:9, border:'none', background:'transparent', color:T.muted, cursor:'pointer', fontFamily:'inherit', fontSize:9, fontWeight:700 }}>
            Povrni
          </button>
        )}
        <button onClick={() => setUrejanje(u => !u)}
          title={urejanje ? 'Končaj urejanje' : 'Uredi vrstni red menija'}
          style={{ width:64, padding:'9px 4px', borderRadius:9, border:'none', background: urejanje ? T.accent : 'transparent', color: urejanje ? '#fff' : T.muted, cursor:'pointer', fontFamily:'inherit', fontSize:10, fontWeight:700 }}>
          {urejanje ? 'Končaj' : '⠿ Uredi'}
        </button>
      </div>
    </div>
  )
}

// ================================================================
// USER AVATAR
// ================================================================
function UserAvatar({ user, onLock }) {
  const [open, setOpen] = useState(false)
  if (!user) return (
    <div style={{ width:30, height:30, borderRadius:999, background:'rgba(255,255,255,0.15)', display:'grid', placeItems:'center' }}>
      <KI name="user" size={14} strokeWidth={2}/>
    </div>
  )
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2)
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 4px 4px 10px', borderRadius:999, background:'rgba(255,255,255,0.08)', border:'none', color:T.headerInk, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600 }}>
        <div style={{ lineHeight:1.1, textAlign:'right' }}>
          <div style={{ fontWeight:700 }}>{user.name.split(' ')[0]}</div>
          <div style={{ fontSize:10, opacity:0.65 }}>{user.role}</div>
        </div>
        <div style={{ width:30, height:30, borderRadius:999, background: user.color || T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>{initials}</div>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:41, width:200, background:'#fff', color:T.ink, borderRadius:11, boxShadow:'0 14px 40px rgba(0,0,0,0.28)', padding:6, border:'1px solid '+T.line }}>
            <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid '+T.lineSoft, marginBottom:4 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{user.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{user.role}</div>
            </div>
            <button onClick={() => { setOpen(false); onLock() }} style={{ width:'100%', padding:'9px 12px', borderRadius:8, background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', color:T.ink, fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
              <KI name="pin" size={14}/> Zakleni
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================

// ================================================================
// PREMISE SELECT SCREEN — izbira lokacije in blagajne
// ================================================================
function PremiseSelectScreen({ auth, onSelected }) {
  const [premises, setPremises] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedPremise, setSelectedPremise] = useState(null)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const db = createClient()
      const [premRes, devRes] = await Promise.all([
        db.from('business_premises').select('*').eq('org_id', auth.orgId || '').eq('is_active', true),
        db.from('electronic_devices').select('*').eq('org_id', auth.orgId || '').eq('is_active', true),
      ])
      const prems = premRes.data || []
      const devs = devRes.data || []
      setPremises(prems)
      setDevices(devs)

      // Preveri če imamo shranjeno izbiro
      const savedPremise = getActivePremise()
      const savedDevice = getActiveDevice()
      if (savedPremise && prems.find(p => p.id === savedPremise.id)) {
        setSelectedPremise(savedPremise)
      } else if (prems.length === 1) {
        setSelectedPremise(prems[0])
      }
      if (savedDevice && devs.find(d => d.id === savedDevice.id)) {
        setSelectedDevice(savedDevice)
      }
      setLoading(false)
    }
    load()
  }, [])

  const premiseDevices = devices.filter(d => d.premise_id === selectedPremise?.id)

  function confirm() {
    if (!selectedPremise) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setActivePremise(selectedPremise)
    setActiveDevice(selectedDevice || premiseDevices[0] || null)
    setTimeout(() => onSelected(selectedPremise, selectedDevice || premiseDevices[0] || null), 300)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:T.header, display:'flex', alignItems:'center', justifyContent:'center', color:T.headerInk }}>
      Nalagam...
    </div>
  )

  // Če je samo en prostor in ena naprava → samodejno nadaljuj
  if (premises.length === 1 && devices.length <= 1) {
    setActivePremise(premises[0])
    setActiveDevice(devices[0] || null)
    onSelected(premises[0], devices[0] || null)
    return null
  }

  return (
    <div style={{ minHeight:'100vh', background:T.header, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:480 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:T.brand, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:22, color:T.header, marginBottom:12 }}>R</div>
          <div style={{ color:T.headerInk, fontWeight:800, fontSize:20 }}>Izberi blagajno</div>
          <div style={{ color:'rgba(246,241,232,0.5)', fontSize:13, marginTop:4 }}>
            Prijavljen: {auth.name} · {auth.role}
          </div>
        </div>

        {/* Poslovni prostori */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(246,241,232,0.5)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Poslovni prostor / lokacija</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {premises.map(p => (
              <button key={p.id} onClick={() => { setSelectedPremise(p); setSelectedDevice(null) }}
                style={{ padding:'14px 16px', borderRadius:11, border:'2px solid '+(selectedPremise?.id===p.id?T.brand:'rgba(255,255,255,0.1)'), background:selectedPremise?.id===p.id?'rgba(233,185,73,0.15)':'rgba(255,255,255,0.05)', cursor:'pointer', fontFamily:'inherit', color:T.headerInk, textAlign:'left', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:9, background:selectedPremise?.id===p.id?T.brand:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                  🏪
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{p.premise_id}</div>
                  <div style={{ fontSize:12, color:'rgba(246,241,232,0.6)', marginTop:2 }}>{p.address}{p.city?`, ${p.city}`:''}</div>
                </div>
                {selectedPremise?.id===p.id && <div style={{ color:T.brand, fontSize:18 }}>✓</div>}
              </button>
            ))}
            {premises.length === 0 && (
              <div style={{ padding:'20px', borderRadius:11, border:'1px solid rgba(255,255,255,0.1)', color:'rgba(246,241,232,0.5)', fontSize:13, textAlign:'center' }}>
                Ni poslovnih prostorov.<br/>
                <span style={{ fontSize:11 }}>Dodaj jih v Nastavitve → FURS → Poslovni prostori</span>
              </div>
            )}
          </div>
        </div>

        {/* Naprave za izbrani prostor */}
        {selectedPremise && premiseDevices.length > 1 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(246,241,232,0.5)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Blagajna / naprava</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {premiseDevices.map(d => (
                <button key={d.id} onClick={() => setSelectedDevice(d)}
                  style={{ padding:'10px 16px', borderRadius:9, border:'2px solid '+(selectedDevice?.id===d.id?T.brand:'rgba(255,255,255,0.1)'), background:selectedDevice?.id===d.id?'rgba(233,185,73,0.15)':'rgba(255,255,255,0.05)', cursor:'pointer', fontFamily:'inherit', color:T.headerInk, fontWeight:selectedDevice?.id===d.id?700:500, fontSize:13 }}>
                  🖨️ {d.device_id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Potrdi */}
        <button onClick={confirm} disabled={!selectedPremise || saving}
          style={{ width:'100%', padding:'14px', borderRadius:11, background:selectedPremise?T.brand:'rgba(255,255,255,0.1)', color:T.header, border:'none', cursor:selectedPremise?'pointer':'not-allowed', fontFamily:'inherit', fontWeight:800, fontSize:15, marginTop:8 }}>
          {saving ? 'Nalagam...' : selectedPremise ? `Odpri blagajno — ${selectedPremise.premise_id}` : 'Izberi poslovni prostor'}
        </button>

        {/* Zamenjaj blagajno */}
        <button onClick={() => { setActivePremise(null); setActiveDevice(null); setSelectedPremise(null); setSelectedDevice(null) }}
          style={{ width:'100%', padding:'10px', borderRadius:9, background:'transparent', color:'rgba(246,241,232,0.4)', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, marginTop:8 }}>
          ↩ Prijavi se z drugim PIN-om
        </button>
      </div>
    </div>
  )
}

// FLOOR SCREEN — real DB spaces + tables
// ================================================================
function FloorScreen({ spaces, switchToTable, setScreen }) {
  const [selectedSpace, setSelectedSpace] = useState(null)

  useEffect(() => {
    if (spaces.length > 0 && !selectedSpace) setSelectedSpace(spaces[0]?.id)
  }, [spaces])

  if (spaces.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12 }}>
        <div style={{ fontSize:40 }}>🪑</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni prostorov</div>
        <div style={{ fontSize:13 }}>Dodaj prostore in mize v <b>Nastavitvah → Prostori</b></div>
      </div>
    )
  }

  const space = spaces.find(s => s.id === selectedSpace) || spaces[0]

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'12px 18px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', gap:4, background:T.surface3, padding:4, borderRadius:10 }}>
          {spaces.map(s => (
            <button key={s.id} onClick={() => setSelectedSpace(s.id)} style={{ padding:'8px 14px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:700, fontSize:13, background: selectedSpace===s.id ? T.header : 'transparent', color: selectedSpace===s.id ? T.headerInk : T.ink, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:999, background:s.color }}/>
              {s.name}
              <span style={{ opacity:0.6, fontSize:11 }}>{(s.tables || []).filter(t => t.status==='occupied').length}/{(s.tables || []).length}</span>
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, marginLeft:16 }}>
          {Object.entries(T.status).map(([k, st]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:T.muted, fontWeight:600 }}>
              <span style={{ width:9, height:9, borderRadius:999, background:st.dot }}/>{st.label}
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button onClick={() => { switchToTable(null); setScreen('sale') }} style={{ padding:'8px 14px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', background:T.accent, color:'#fff', border:'none', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <KI name="plus" size={14}/> Hitra prodaja
          </button>
        </div>
      </div>
      <div style={{ flex:1, position:'relative', overflow:'hidden', background:T.bg, backgroundImage:'radial-gradient(circle, '+T.line+' 1px, transparent 1px)', backgroundSize:'24px 24px' }}>
        {(space.tables || []).map(t => {
          const st = T.status[t.status] || T.status.free
          const isRound = t.seats <= 2
          const w = t.seats<=2 ? 96 : t.seats<=4 ? 118 : 154
          const h = t.seats<=2 ? 96 : t.seats<=4 ? 92 : 116
          return (
            <button key={t.id} onClick={() => { switchToTable(t); setScreen('sale') }}
              style={{ position:'absolute', left:`${t.x}%`, top:`${t.y}%`, width:w, height:h, background:st.bg, border:'2px solid '+st.stroke, borderRadius: isRound ? '50%' : 14, cursor:'pointer', fontFamily:'inherit', color:T.ink, padding:8, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:17, fontWeight:800 }}>{t.name}</div>
              <div style={{ fontSize:10, color:T.muted, display:'flex', alignItems:'center', gap:3 }}>
                <KI name="user" size={10}/> {t.seats}
              </div>
              {t.status==='needs_attention' && (
                <div style={{ position:'absolute', top:-8, right:-8, width:22, height:22, borderRadius:999, background:st.dot, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, boxShadow:'0 0 0 3px '+T.bg }}>!</div>
              )}
              {t.status==='reserved' && t.reservedFor && (
                <div style={{ fontSize:9, color:T.muted, padding:'0 4px', lineHeight:1.2 }}>{t.reservedFor}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================
// SALE SCREEN — real DB kategorije + artikli
// ================================================================

// ─────────────────────────────────────────────────────────────────
// ODPIS / LASTNA PORABA / REPREZENTANCA MODAL
// ─────────────────────────────────────────────────────────────────
function WriteoffModal({ cart, auth, onClose, onDone }) {
  const [reason, setReason] = React.useState('odpis')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const totalCost = cart.reduce((s, l) => s + Number(l.price || 0) * Number(l.qty || 0), 0)
  const vatOnCost = vatBreakdownForCart(cart).vat
  const reasons = [
    { id: 'odpis', label: 'Odpis', desc: 'Pokvarjeno, poteklo, zlomljeno blago' },
    { id: 'lastna_poraba', label: 'Lastna poraba', desc: 'Lastnik/zaposleni vzame za osebno rabo (DDV samoobdavčitev)' },
    { id: 'reprezentanca', label: 'Reprezentanca', desc: 'Pogostitev poslovnih partnerjev' },
  ]
  async function handleSave() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')
      const member = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
      const { error: err } = await createClient().from('stock_writeoffs').insert({
        business_id: BUSINESS_ID,
        org_id: member?.org_id || null,
        reason,
        items: cart.map(l => ({ item_id: l.id, name: l.name, qty: l.qty, unit_price: l.price, vat_rate: l.vat_rate ?? 22 })),
        total_cost: totalCost,
        vat_self_assessed: reason === 'lastna_poraba' ? vatOnCost : 0,
        note: note || null,
        // POPRAVLJENO (16.8.2026): prej identiteta NAPRAVE (na skupnem terminalu
        // vedno ista oseba) - odpis je bil pripisan napacnemu blagajniku.
        created_by: auth?.user?.id || user.id,
      })
      if (err) throw err
      // Odstej zalogo enako kot pri prodaji, brez placila/FURS
      // POPRAVLJENO (16.8.2026): prej branje ZASTARELEGA posnetka line.stock +
      // zapis absolutne vrednosti - ce je vmes tekla prodaja ali prevzem, je
      // odpis povozil tiste spremembe. Zdaj atomarno odstevanje v bazi, z
      // preverjanjem napake (prej je odpis tiho spodletel, uporabnik pa je
      // videl potrditev).
      for (const line of cart) {
        if (line.item_type !== 'recipe' && line.stock !== null && line.stock !== undefined) {
          const { error: stockErr } = await createClient().rpc('decrement_stock', {
            p_item_id: line.id,
            p_qty: line.qty,
          })
          if (stockErr) throw new Error(`Zaloge za "${line.name}" ni bilo mogoče odpisati: ${stockErr.message}`)
        }
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e.message || 'Napaka pri shranjevanju')
    }
    setSaving(false)
  }
  return (
    <Modal open onClose={saving ? undefined : onClose} width={420}>
      <ModalHeader title="Odpis / Poraba / Reprezentanca" onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ fontSize:12, color:T.muted }}>
          Artikli iz košarice se odštejejo iz zaloge brez prodaje in FURS fiskalizacije. Namenjeno internim evidencam po slovenski davčni zakonodaji.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {reasons.map(r => (
            <button key={r.id} onClick={() => setReason(r.id)} style={{ textAlign:'left', padding:'10px 12px', borderRadius:10, cursor:'pointer', background: reason===r.id ? T.accentSoft : T.surface, border: '1px solid ' + (reason===r.id ? T.accent : T.line), fontFamily:'inherit' }}>
              <div style={{ fontWeight:700, fontSize:13, color: reason===r.id ? T.accent : T.ink }}>{r.label}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{r.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <label style={{ fontSize:11, color:T.muted, display:'block', marginBottom:4 }}>Opomba (neobvezno)</label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="npr. razbita steklenica" style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13 }}/>
        </div>
        <div style={{ background:T.surface, borderRadius:10, padding:'10px 12px', fontSize:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span>Nabavna vrednost:</span><span style={{ fontWeight:700 }}>€{totalCost.toFixed(2)}</span>
          </div>
          {reason === 'lastna_poraba' && (
            <div style={{ display:'flex', justifyContent:'space-between', color:T.accent }}>
              <span>DDV za samoobdavčitev:</span><span style={{ fontWeight:700 }}>€{vatOnCost.toFixed(2)}</span>
            </div>
          )}
        </div>
        {error && <div style={{ color:T.danger, fontSize:12 }}>{error}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {saving ? 'Shranjujem...' : 'Potrdi'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SaleScreen({ activeTable, setActiveTable, activeCustomer, cart, setCart, addItem, adjustQty, setPaymentOpen, totals, setActiveCustomer, posData, happyHourActive, setHappyHourActive, cashSession, onNeedOpenCash, auth }) {
  // Podatki podjetja za izpise - prej trdo zapisani (SIRM, naslov, davcna).
  const pp = podatkiPodjetja(posData.org || { name: posData.businessName })
  const [showWriteoff, setShowWriteoff] = React.useState(false)
  const [cartDiscount, setCartDiscount] = useState(0)
  const [proformaModal, setProformaModal] = useState(false)
  const [proformaRecipient, setProformaRecipient] = useState({ name:'', address:'', tax_number:'', vat_id:'' })
  const [selectedCat, setSelectedCat] = useState('cat-fav')
  const [search, setSearch] = useState('')
  const [scanModal, setScanModal] = useState(false)

  const items = useMemo(() => {
    if (search) return posData.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.code || '').toLowerCase().includes(search.toLowerCase()))
    return posData.itemsIn(selectedCat)
  }, [selectedCat, search, posData.items])

  if (posData.loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted }}>⏳ Nalagam cenik...</div>

  if (posData.categories.length <= 1 && posData.items.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12, padding:40, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>🛍️</div>
        <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Cenik je prazen</div>
        <div style={{ fontSize:13, maxWidth:340 }}>Pojdi v <b>Nastavitve → Kategorije & Artikli</b> in dodaj prve produkte.</div>
      </div>
    )
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      {/* Kategorije sidebar */}
      <div style={{ width:196, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid '+T.lineSoft, fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Kategorije</div>
        <div style={{ overflowY:'auto', flex:1, padding:8 }}>
          {posData.categories.map(c => {
            const active = selectedCat === c.id
            return (
              <button key={c.id} onClick={() => { setSelectedCat(c.id); setSearch('') }} style={{ width:'100%', padding:'10px', borderRadius:9, marginBottom:2, background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.ink, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: active ? 700 : 500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                <span style={{ width:30, height:30, borderRadius:8, background:c.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>{c.icon}</span>
                <span style={{ flex:1 }}>{c.name}</span>
                {active && <KI name="chev" size={14}/>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Artikli */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, background:T.surface, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={15}/></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Išči artikel ali šifro…" style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.surface2, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <button onClick={() => setScanModal(true)} style={{ padding:'9px 12px', borderRadius:9, background:T.surface2, color:T.ink, border:'1px solid '+T.line, fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'inherit' }}>
            <KI name="barcode" size={14}/> Skeniraj
          </button>
          <button onClick={() => {
            // POPRAVLJENO (16.8.2026): ob vklopu preveri, ali za ta cas obstaja
            // aktivno pravilo - prej je gumb vedno dal 20% na pivo/vino, ne glede
            // na nastavitve. Brez pravila vklop nima ucinka, zato uporabnika
            // opozorimo namesto tihega nedelovanja.
            if (!happyHourActive) {
              const r = H.activeHappyHourRule(posData.happyHourRules)
              if (!r) { alert('Za ta dan in uro ni nastavljenega happy hour pravila.\n\nPravilo dodajte v Nastavitve → Happy hour.'); return }
            }
            setHappyHourActive(h => !h)
          }} style={{ padding:'9px 12px', borderRadius:9, background: happyHourActive ? T.brand : T.surface2, color: happyHourActive ? T.header : T.ink, border:'1px solid '+(happyHourActive ? T.brand : T.line), fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'inherit' }}>
            <KI name="happy" size={14}/> Happy hour{happyHourActive ? ` −${Number(H.activeHappyHourRule(posData.happyHourRules)?.discount_pct ?? 0)}%` : ''}
          </button>
          <div style={{ marginLeft:'auto', fontSize:12, color:T.muted }}>{items.length} artiklov</div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, alignContent:'start' }}>
          {items.map(it => {
            // POPRAVLJENO (16.8.2026): oznaka po AKTIVNEM PRAVILU, ne po imenu
            const hhRule = happyHourActive ? H.activeHappyHourRule(posData.happyHourRules) : null
            const onSale = !!hhRule && H.isHappyHourEligible(it, hhRule)
            return (
              <button key={it.id} onClick={() => addItem(it, happyHourActive)} style={{ background:T.surface, border:'1px solid '+T.line, borderRadius:11, padding:'12px', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:T.ink, display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:96, position:'relative' }}>
                {it.fav && <span style={{ position:'absolute', top:8, right:8, color:T.brand, fontSize:11 }}>★</span>}
                {onSale && <span style={{ position:'absolute', top:8, left:8, fontSize:9, fontWeight:800, color:T.header, background:T.brand, padding:'2px 5px', borderRadius:4, textTransform:'uppercase' }}>−{Number(hhRule?.discount_pct ?? 0)}%</span>}
                <div style={{ fontSize:13, fontWeight:600, lineHeight:1.25, marginTop: (it.fav || onSale) ? 14 : 0 }}>{it.name}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:8 }}>
                  <div>
                    {onSale ? (
                      <>
                        <div style={{ fontSize:10, color:T.muted, textDecoration:'line-through' }}>{eur(it.price)}</div>
                        <div style={{ fontSize:15, fontWeight:800, fontVariantNumeric:'tabular-nums', color:T.warn }}>{eur(it.price * (1 - Number(hhRule?.discount_pct ?? 0) / 100))}</div>
                      </>
                    ) : (
                      <div style={{ fontSize:15, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</div>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{it.code}</div>
                </div>
              </button>
            )
          })}
          {items.length === 0 && <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:T.muted }}>Ni artiklov v tej kategoriji</div>}
        </div>
      </div>

      {/* Košarica */}
      <SaleCart cart={cart} setCart={setCart} adjustQty={adjustQty} activeTable={activeTable} activeCustomer={activeCustomer} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer} customers={posData.customers} cartDiscount={cartDiscount} setCartDiscount={setCartDiscount} cashSession={cashSession} onNeedOpenCash={onNeedOpenCash}
        auth={auth}
        onWriteoff={() => setShowWriteoff(true)}
        onHoldOrder={async () => {
          if (cart.length === 0) return
          try {
            const label = activeTable ? activeTable.name : new Date().toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})
            const cashierId = auth?.user?.id || null
            const orderId = await pos.orders.openOrder({ tableId: activeTable?.id, customerId: activeCustomer?.id, cashierId })
            for (const line of cart) {
              await pos.orders.addLine(orderId, { itemId: line.id, name: line.name, qty: line.qty, unitPrice: line.price, vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null })
            }
            await pos.orders.holdOrder(orderId, label)
            setCart([])
            setActiveTable(null)
            alert('Račun shranjen: ' + label)
          } catch(e: any) { alert('Napaka: ' + e.message) }
        }}
        onProforma={() => { if (cart.length > 0) setProformaModal(true) }}
        onProformaOld={async () => {
          if (cart.length === 0) return
          const label = activeTable ? activeTable.name : 'Predracun'
          const total = totals.total * (1 - (cartDiscount||0)/100)
          const num = 'PRE-' + Date.now().toString().slice(-6)
          const eur2 = (n:number) => n.toFixed(2).replace('.',',') + ' €'
          // ESC/POS (Electron)
          if (typeof window !== 'undefined' && (window as any).electronAPI?.printRaw) {
            const printData = {
              business_name: pp.ime,
              business_address: pp.naslov,
              receipt_number: num,
              cashier: auth?.user?.name || '',
              date: new Date().toLocaleString('sl-SI'),
              items: cart.map((l:any) => ({ name: l.name, qty: Number(l.qty), unit_price: Number(l.price), vat_rate: Number(l.vat_rate ?? 22) })),
              subtotal: totals.sub,
              discount_amount: totals.total - total,
              tip: 0, total,
              payment_method: 'predracun',
            }
            const r = await (window as any).electronAPI.printRaw(printData)
            if (!r?.ok) alert('Napaka tiskalnika: ' + r?.error)
            return
          }
          // Browser — odpri HTML v novem oknu
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Predracun ${num}</title>
<style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:13px;color:#000;max-width:700px;margin:0 auto}
.header{text-align:center;margin-bottom:24px}.title{font-size:22px;font-weight:bold;margin:8px 0}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;border-bottom:1px solid #ddd;text-align:left}
th{background:#f5f5f5;font-weight:bold}.right{text-align:right}.total-row{font-size:16px;font-weight:bold}
.footer{margin-top:32px;font-size:11px;color:#666;text-align:center;border-top:1px solid #ddd;padding-top:12px}
.stamp{border:2px dashed #999;padding:20px;text-align:center;margin:24px 0;color:#999;font-size:14px}
</style></head><body>
<div class="header">
  <div style="font-size:18px;font-weight:bold">${escapeHtml(pp.ime)}</div>
  ${pp.naslov ? `<div>${escapeHtml(pp.naslov)}</div>` : ''}
</div>
<div style="display:flex;justify-content:space-between;margin-bottom:16px">
  <div><div class="title">PREDRACUN</div><div>St. ${num}</div></div>
  <div style="text-align:right"><div>Datum: ${new Date().toLocaleDateString('sl-SI')}</div>${label !== 'Predracun' ? '<div>Miza: '+label+'</div>' : ''}</div>
</div>
<table><thead><tr><th>Artikel</th><th class="right">Kol.</th><th class="right">Cena</th><th class="right">Skupaj</th></tr></thead>
<tbody>${cart.map((l:any) => `<tr><td>${escapeHtml(l.name)}</td><td class="right">${l.qty}</td><td class="right">${eur2(Number(l.price))}</td><td class="right">${eur2(Number(l.price)*Number(l.qty))}</td></tr>`).join('')}
</tbody></table>
${cartDiscount > 0 ? `<div style="text-align:right;color:#666">Popust ${fmtPct(cartDiscount)}%: -${eur2(totals.total-total)}</div>` : ''}
<div class="total-row" style="text-align:right;font-size:18px;margin:12px 0">SKUPAJ: ${eur2(total)}</div>
<div class="stamp">Predracun ni davčno potrjen. Velja do: ${new Date(Date.now()+7*86400000).toLocaleDateString('sl-SI')}</div>
<div class="footer">${escapeHtml(pp.ime)} · www.racunko.si<br>Predracun izdan s sistemom RACUNKO</div>
<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno
     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne
     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez
     tiskalnika pa cista ovira. Zdaj je gumb - kdor tiska, klikne. -->
<div style="position:fixed;top:0;left:0;right:0;padding:10px;background:#0D1F12;display:flex;gap:8px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="padding:9px 22px;border:0;border-radius:8px;background:#fff;color:#0D1F12;font-weight:700;font-size:14px;cursor:pointer">Natisni</button>
  <button onclick="window.close()" style="padding:9px 22px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Zapri</button>
</div>
<style>@media print{.no-print{display:none!important}}body{padding-top:56px}</style>
</body></html>`
          const w = window.open('','_blank','width=800,height=900')
          if (w) { w.document.write(html); w.document.close() }
        }}
      />
      {showWriteoff && (
        <WriteoffModal
          cart={cart}
          auth={auth}
          onClose={()=>setShowWriteoff(false)}
          onDone={()=>{ setCart([]); posData.refresh() }}
        />
      )}

      {/* Proforma modal — podatki prejemnika */}
      {proformaModal && (
        <Modal open onClose={()=>setProformaModal(false)} width={480}>
          <ModalHeader title="Predračun za podjetje" onClose={()=>setProformaModal(false)}/>
          <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ padding:'10px 14px', background:T.surface2, borderRadius:9, fontSize:12, color:T.muted }}>
              Pusti prazno za predračun brez podatkov prejemnika
            </div>
            <Field label="Ime podjetja / stranke">
              <input value={proformaRecipient.name} onChange={e=>setProformaRecipient(p=>({...p,name:e.target.value}))} placeholder="d.o.o., s.p., ime stranke..." style={inp} autoFocus/>
            </Field>
            <Field label="Naslov">
              <input value={proformaRecipient.address} onChange={e=>setProformaRecipient(p=>({...p,address:e.target.value}))} placeholder="Ulica 1, 1000 Ljubljana" style={inp}/>
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Davčna številka">
                <input value={proformaRecipient.tax_number} onChange={e=>setProformaRecipient(p=>({...p,tax_number:e.target.value}))} placeholder="12345678" style={inp}/>
              </Field>
              <Field label="ID za DDV (če je zavezanec)">
                <input value={proformaRecipient.vat_id} onChange={e=>setProformaRecipient(p=>({...p,vat_id:e.target.value}))} placeholder="SI12345678" style={inp}/>
              </Field>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
              <button onClick={()=>setProformaModal(false)} style={btnS}>Prekliči</button>
              <button onClick={async()=>{
                setProformaModal(false)
                const label = activeTable ? activeTable.name : 'Predracun'
                const total = totals.total * (1 - (cartDiscount||0)/100)
                const num = 'PRE-' + Date.now().toString().slice(-6)
                const eur2 = (n:number) => n.toFixed(2).replace('.',',') + ' €'
                const r = proformaRecipient
                const recipientHtml = r.name ? `
                  <div style="border:1px solid #ddd;padding:14px;border-radius:6px;margin-bottom:16px">
                    <div style="font-size:11px;color:#999;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em">PREJEMNIK</div>
                    <div style="font-weight:bold;font-size:14px">${escapeHtml(r.name)}</div>
                    ${r.address ? `<div>${escapeHtml(r.address)}</div>` : ''}
                    ${r.tax_number ? `<div>Davčna: ${r.tax_number}</div>` : ''}
                    ${r.vat_id ? `<div>ID DDV: ${r.vat_id}</div>` : ''}
                  </div>` : ''
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Predračun ${num}</title>
<style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:13px;color:#000;max-width:700px;margin:0 auto}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;border-bottom:1px solid #ddd;text-align:left}
th{background:#f5f5f5;font-weight:bold}.right{text-align:right}
.footer{margin-top:32px;font-size:11px;color:#666;text-align:center;border-top:1px solid #ddd;padding-top:12px}
.stamp{border:2px dashed #999;padding:16px;text-align:center;margin:20px 0;color:#999;font-size:13px}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:24px;border-bottom:2px solid #000;padding-bottom:16px">
  <div>
    <div style="font-size:20px;font-weight:bold">${escapeHtml(pp.ime)}</div>
    ${pp.naslov ? `<div style="color:#666">${escapeHtml(pp.naslov)}</div>` : ''}
    <div style="color:#666">www.racunko.si</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:bold">PREDRAČUN</div>
    <div>Št. ${num}</div>
    <div>Datum: ${new Date().toLocaleDateString('sl-SI')}</div>
    <div>Velja do: ${new Date(Date.now()+7*86400000).toLocaleDateString('sl-SI')}</div>
    ${label !== 'Predracun' ? '<div>Ref: '+label+'</div>' : ''}
  </div>
</div>
${recipientHtml}
<table><thead><tr><th>Artikel</th><th class="right">Kol.</th><th class="right">Cena/kos</th><th class="right">DDV%</th><th class="right">Skupaj</th></tr></thead>
<tbody>${cart.map((l:any) => `<tr><td>${escapeHtml(l.name)}</td><td class="right">${l.qty}</td><td class="right">${eur2(Number(l.price))}</td><td class="right">${l.vat_rate ?? 22}%</td><td class="right">${eur2(Number(l.price)*Number(l.qty))}</td></tr>`).join('')}
</tbody></table>
<div style="display:flex;justify-content:flex-end">
  <div style="min-width:280px">
    ${cartDiscount > 0 ? `<div style="display:flex;justify-content:space-between;color:#666;padding:4px 0"><span>Popust ${fmtPct(cartDiscount)}%:</span><span>-${eur2(totals.total-total)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;color:#666;padding:4px 0;border-top:1px solid #ddd;margin-top:4px"><span>Osnova (brez DDV):</span><span>${eur2(vatBreakdownForCart(cart, totals.total > 0 ? total / totals.total : 1).net)}</span></div>
    ${vatBreakdownForCart(cart, totals.total > 0 ? total / totals.total : 1).byRate.map(r => `<div style="display:flex;justify-content:space-between;color:#666;padding:4px 0"><span>DDV ${r.rate}%:</span><span>${eur2(r.vat)}</span></div>`).join('')}
    <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;border-top:2px solid #000;padding-top:8px;margin-top:4px"><span>SKUPAJ:</span><span>${eur2(total)}</span></div>
  </div>
</div>
<div class="stamp">Ta predračun ni davčno potrjen račun.<br>Po plačilu izstavimo uradni davčni račun.</div>
<div class="footer">${escapeHtml(pp.ime)}${pp.davcna ? ' · Davčna: ' + pp.davcna : ''}<br>Izdano s sistemom RAČUNKO · www.racunko.si</div>
<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno
     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne
     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez
     tiskalnika pa cista ovira. Zdaj je gumb - kdor tiska, klikne. -->
<div style="position:fixed;top:0;left:0;right:0;padding:10px;background:#0D1F12;display:flex;gap:8px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="padding:9px 22px;border:0;border-radius:8px;background:#fff;color:#0D1F12;font-weight:700;font-size:14px;cursor:pointer">Natisni</button>
  <button onclick="window.close()" style="padding:9px 22px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Zapri</button>
</div>
<style>@media print{.no-print{display:none!important}}body{padding-top:56px}</style>
</body></html>`
                const w = window.open('','_blank','width=820,height=960')
                if (w) { w.document.write(html); w.document.close() }
              }} style={btnP}>🖨️ Natisni predračun</button>
            </div>
          </div>
        </Modal>
      )}
      {/* Scan placeholder */}
      <Modal open={scanModal} onClose={() => setScanModal(false)} width={380}>
        <div style={{ padding:'28px 22px', textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:10 }}>📷</div>
          <div style={{ fontSize:17, fontWeight:600, marginBottom:6 }}>Skeniraj barkodo</div>
          <div style={{ fontSize:13, color:T.muted, marginBottom:18 }}>Barkodni čitalec prihaja. Vnesite šifro v iskalnik.</div>
          <button onClick={() => setScanModal(false)} style={{ background:T.accent, color:'#fff', border:'none', borderRadius:9, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Zapri</button>
        </div>
      </Modal>
    </div>
  )
}

function SaleCart({ cart, setCart, adjustQty, activeTable, activeCustomer, setPaymentOpen, totals, setActiveCustomer, customers, cartDiscount, setCartDiscount, cashSession, onNeedOpenCash, onHoldOrder, onProforma, onWriteoff, auth }) {
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  // DODANO (19.8.2026): nacin vnosa popusta - odstotek ali znesek v evrih.
  const [discountMode, setDiscountMode] = useState('pct')
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitParts, setSplitParts] = useState(2)
  const [splitPaid, setSplitPaid] = useState([])
  const [splitQty, setSplitQty] = useState({})
  const [pickCustomer, setPickCustomer] = useState(false)
  const [custSearch, setCustSearch] = useState('')

  const filteredCustomers = customers.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || '').includes(custSearch))

  return (
    <div style={{ width:340, background:T.surface, borderLeft:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:T.muted, fontWeight:700 }}>Naročilo</div>
          <div style={{ fontWeight:700, fontSize:14, marginTop:2 }}>
            {activeTable ? activeTable.name : 'Hitra prodaja'}
            <span style={{ color:T.muted, fontWeight:500, fontSize:12 }}> · {cart.reduce((s, l) => s + l.qty, 0)} kos</span>
          </div>
        </div>
        {cart.length > 0 && (
          <button onClick={() => setCart([])} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.muted, padding:4 }}>
            <KI name="trash" size={14}/>
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {cart.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:T.muted, fontSize:12 }}>
            <div style={{ fontSize:26, marginBottom:8, opacity:0.4 }}>🛒</div>
            Košarica je prazna.<br/>Tapni artikel za dodajanje.
          </div>
        )}
        {cart.map(l => (
          <div key={l.lineId} style={{ padding:'10px 12px', borderBottom:'1px solid '+T.lineSoft, display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>
                {l.name}
                {l.happyHourApplied && <span style={{ fontSize:9, fontWeight:800, color:T.warn, background:'rgba(184,140,40,0.15)', padding:'1px 5px', borderRadius:4, marginLeft:5 }}>−{Number(l.happyHourPct ?? 20)}%</span>}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              <div style={{ fontWeight:800, fontSize:14, fontVariantNumeric:'tabular-nums' }}>{eur(H.lineTotal(l))}</div>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button onClick={() => l.qty===1 ? setCart(c => c.filter(x => x.lineId!==l.lineId)) : adjustQty(l.lineId, -1)} style={{ width:24, height:24, borderRadius:6, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {l.qty===1 ? <KI name="trash" size={11}/> : <KI name="minus" size={12}/>}
                </button>
                <div style={{ width:24, textAlign:'center', fontWeight:700, fontSize:13 }}>{l.qty}</div>
                <button onClick={() => adjustQty(l.lineId, 1)} style={{ width:24, height:24, borderRadius:6, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <KI name="plus" size={12}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ padding:'8px 10px', borderTop:'1px solid '+T.line, display:'flex', gap:5 }}>
          <button onClick={() => setPickCustomer(true)} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.ink, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="user" size={14}/>Stranka
          </button>
          <button onClick={()=>{setDiscountInput(cartDiscount>0?String(cartDiscount):'');setDiscountOpen(true)}} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:cartDiscount>0?T.accentSoft:T.chipBg, border:'none', cursor:'pointer', color:cartDiscount>0?T.accent:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="percent" size={14}/>{cartDiscount>0?`-${fmtPct(cartDiscount)}%`:'Popust'}
          </button>
          <button onClick={()=>setSplitOpen(true)} style={{ flex:1, padding:'8px 4px', borderRadius:7, background:T.chipBg, border:'none', cursor:'pointer', color:T.muted, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}>
            <KI name="split" size={14}/>Razdeli
          </button>
        </div>
      )}

      <div style={{ padding:'12px 16px', background:T.surface2, borderTop:'1px solid '+T.line }}>
        {activeCustomer && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 10px', background:T.accentSoft, borderRadius:8 }}>
            <div style={{ flex:1, fontSize:12, fontWeight:600, color:T.accent }}>{activeCustomer.name}</div>
            <button onClick={() => setActiveCustomer(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:T.accent }}><KI name="x" size={12}/></button>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:T.muted }}>
          <span>Vmesna</span><span>{eur(totals.sub)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:10, color:T.muted }}>
          {totals.vatByRate && Object.keys(totals.vatByRate).length > 0 ? (
            Object.entries(totals.vatByRate).map(([rate, amt]) => (
              <React.Fragment key={rate}>
                <span>DDV {rate}%</span><span>{eur(amt)}</span>
              </React.Fragment>
            ))
          ) : (
            <><span>DDV</span><span>{eur(totals.ddv)}</span></>
          )}
        </div>
        {cartDiscount>0 && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:T.accent }}>
            <span>Popust {fmtPct(cartDiscount)}%</span><span>-{eur(totals.total*cartDiscount/100)}</span>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div style={{ fontWeight:700, fontSize:14 }}>Skupaj</div>
          <div style={{ fontWeight:800, fontSize:26, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{eur(totals.total)}</div>
        </div>
        {cart.length > 0 && (
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            <button onClick={onHoldOrder} style={{ flex:1, padding:'9px 4px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, color:T.ink, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              💾 Shrani
            </button>
            <button onClick={onProforma} style={{ flex:1, padding:'9px 4px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, color:T.ink, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              🧾 Predračun
            </button>
            <button onClick={onWriteoff} style={{ flex:1, padding:'9px 4px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, color:T.ink, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              ⋯ Več
            </button>
          </div>
        )}
        <button disabled={cart.length===0} onClick={() => {
          if (!cashSession && onNeedOpenCash) { onNeedOpenCash(); return }
          setPaymentOpen({ discount: cartDiscount })
        }} style={{ width:'100%', marginTop:8, padding:'13px', borderRadius:9, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily:'inherit', border:'none', background: cart.length ? T.accent : '#ccc', color:'#fff', fontWeight:800, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <KI name="arrow" size={16} strokeWidth={2.2}/> {!cashSession ? '🔒 Odpri blagajno' : (cart.length > 0 ? `Plačaj ${eur(totals.total*(1-cartDiscount/100))}` : 'Plačaj')}
        </button>
      </div>

      {discountOpen && (
        <Modal open onClose={()=>setDiscountOpen(false)} width={320}>
          <ModalHeader title="Popust na račun" onClose={()=>setDiscountOpen(false)}/>
          <div style={{ padding:'20px 22px' }}>
            {/* DODANO (19.8.2026): popust v EVRIH, ne samo v odstotkih.
                Popust je v celotni kodi (listki, racuni, placilo, FURS) vezan
                na ODSTOTEK, zato vneseni znesek tu pretvorimo v odstotek -
                predelava vseh odjemalcev bi bila v blagajni prevec tvegana.
                Znesek popusta zato ostane natancen, na listku pa se izpise
                odstotek (lahko z decimalkami). */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {[['pct','V odstotkih (%)'],['eur','V evrih (€)']].map(([m,label])=>(
                <button key={m} onClick={()=>{setDiscountMode(m);setDiscountInput('')}}
                  style={{ flex:1, padding:'8px 4px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, background:discountMode===m?T.accentSoft:T.chipBg, color:discountMode===m?T.accent:T.muted }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>
              {discountMode==='eur' ? 'Vnesi znesek popusta v evrih' : 'Vnesi % popust na celoten račun'}
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {(discountMode==='eur' ? [1,2,5,10,20] : [5,10,15,20,25]).map(p=>(
                <button key={p} onClick={()=>setDiscountInput(String(p))} style={{ flex:1, padding:'8px 4px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13, background:discountInput===String(p)?T.accentSoft:T.chipBg, color:discountInput===String(p)?T.accent:T.ink }}>
                  {discountMode==='eur' ? `${p} €` : `${p}%`}
                </button>
              ))}
            </div>

            <input type="number" onFocus={e => e.target.select()} min="0" max={discountMode==='eur'?undefined:"100"} step={discountMode==='eur'?'0.01':'1'} value={discountInput} onChange={e=>setDiscountInput(e.target.value)}
              placeholder={discountMode==='eur' ? 'Znesek v €...' : 'Ali vnesi ročno...'} style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, background:T.inputBg, outline:'none', boxSizing:'border-box', marginBottom:10 }}/>

            {/* Predogled - da uporabnik takoj vidi, koliko bo dejansko odbito. */}
            {Number(discountInput) > 0 && totals.total > 0 && (
              <div style={{ fontSize:12, color:T.muted, marginBottom:12, padding:'8px 10px', background:T.chipBg, borderRadius:7 }}>
                {discountMode==='eur'
                  ? <>Popust {eur(Math.min(Number(discountInput), totals.total))} od {eur(totals.total)} · <strong>{(Math.min(Number(discountInput), totals.total)/totals.total*100).toFixed(1)} %</strong></>
                  : <>Popust {Number(discountInput)} % · <strong>{eur(totals.total*Number(discountInput)/100)}</strong></>}
                {discountMode==='eur' && Number(discountInput) > totals.total && (
                  <div style={{ color:T.danger, marginTop:4 }}>Znesek presega vrednost računa — omejeno na {eur(totals.total)}.</div>
                )}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{setCartDiscount(0);setDiscountOpen(false)}} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Odstrani</button>
              <button onClick={()=>{
                const vneseno = Number(discountInput) || 0
                let pct = 0
                if (discountMode === 'eur') {
                  // Znesek -> odstotek. Omejimo na vrednost racuna, da popust
                  // ne more preseci zneska (negativen racun).
                  const znesek = Math.min(vneseno, totals.total)
                  pct = totals.total > 0 ? Number((znesek / totals.total * 100).toFixed(4)) : 0
                } else {
                  pct = Math.min(vneseno, 100)
                }
                setCartDiscount(pct)
                setDiscountOpen(false)
              }} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Potrdi</button>
            </div>
          </div>
        </Modal>
      )}
      {splitOpen && (
        <Modal open onClose={()=>setSplitOpen(false)} width={480}>
          <ModalHeader title="Razdeli račun" onClose={()=>setSplitOpen(false)}/>
          <div style={{ padding:'16px 20px', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontSize:13, color:T.muted, marginBottom:14 }}>
              Izberi artikle za to osebo, nato klikni Plačaj. Po plačilu se nadaljuje z ostalimi.
            </div>
            <div style={{ marginBottom:12 }}>
              {cart.map((line) => {
                const alreadyPaidQty = splitPaid.filter(p => p.lineId === line.lineId).reduce((s,p)=>s+p.qty,0)
                const availableQty = line.qty - alreadyPaidQty
                const selectedQty = splitQty[line.lineId] || 0
                if (availableQty <= 0) return (
                  <div key={line.lineId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, marginBottom:6, border:'1px solid '+T.line, background:T.surface2, opacity:0.4 }}>
                    <div style={{ flex:1, fontWeight:600, fontSize:13 }}>{line.name}</div>
                    <span style={{ fontSize:11, color:T.accent, fontWeight:700 }}>✓ Plačano</span>
                  </div>
                )
                return (
                  <div key={line.lineId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, marginBottom:6, border:'1px solid '+(selectedQty>0?T.accent:T.line), background:selectedQty>0?T.accentSoft:T.surface }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{line.name}</div>
                      <div style={{ fontSize:11, color:T.muted }}>Na voljo: {availableQty}× {eur(line.price)}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <button onClick={()=>setSplitQty(p=>({...p,[line.lineId]:Math.max(0,(p[line.lineId]||0)-1)}))}
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:16, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                      <div style={{ minWidth:28, textAlign:'center', fontWeight:700, fontSize:15 }}>{selectedQty}</div>
                      <button onClick={()=>setSplitQty(p=>({...p,[line.lineId]:Math.min(availableQty,(p[line.lineId]||0)+1)}))}
                        style={{ width:28, height:28, borderRadius:7, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', fontFamily:'inherit', fontSize:16, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                    </div>
                    <div style={{ fontWeight:700, fontSize:13, minWidth:60, textAlign:'right' }}>{eur(line.price * selectedQty)}</div>
                  </div>
                )
              })}
            </div>
            {(() => {
              const selectedLines = cart.filter(l => (splitQty[l.lineId]||0) > 0).map(l => ({...l, qty: splitQty[l.lineId]}))
              const selectedTotal = selectedLines.reduce((s,l)=>s+l.price*l.qty,0)
              const totalPaidQty = cart.reduce((s,l)=>s+(splitPaid.filter(p=>p.lineId===l.lineId).reduce((ss,p)=>ss+p.qty,0)),0)
              const totalQty = cart.reduce((s,l)=>s+l.qty,0)
              const remaining = cart.filter(l => {
                const paidQty = splitPaid.filter(p=>p.lineId===l.lineId).reduce((s,p)=>s+p.qty,0)
                return l.qty - paidQty - (splitQty[l.lineId]||0) > 0
              })
              return (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:15, marginBottom:12, padding:'10px 12px', background:T.accentSoft, borderRadius:9 }}>
                    <span>Ta oseba plača:</span>
                    <span style={{ color:T.accent }}>{eur(selectedTotal)}</span>
                  </div>
                  {remaining.length > 0 && (
                    <div style={{ fontSize:12, color:T.muted, marginBottom:12, textAlign:'center' }}>
                      Preostalo po plačilu: {eur(remaining.reduce((s,l)=>{
                        const paidQty = splitPaid.filter(p=>p.lineId===l.lineId).reduce((ss,p)=>ss+p.qty,0)
                        return s + l.price*(l.qty-paidQty-(splitQty[l.lineId]||0))
                      },0))}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setSplitOpen(false)} style={{ flex:1, padding:'11px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Prekliči</button>
                    <button disabled={selectedLines.length===0} onClick={()=>{
                      setSplitOpen(false)
                      setPaymentOpen({ discount:cartDiscount, splitLines: selectedLines, onSplitPaid: (paidItems) => {
                        // KLJUCNO: dejansko zmanjsaj kolicine v kosarici za placane artikle,
                        // ne samo sledi placilu loceno (prejsnja koda je pustila cart nedotaknjen,
                        // zato je "5 Lasko" ostalo prikazano tudi po placilu 2 od 5)
                        setCart(c => c.flatMap(l => {
                          const paid = paidItems.find(p => p.lineId === l.lineId)
                          if (!paid) return [l]
                          const remainingQty = l.qty - paid.qty
                          return remainingQty > 0 ? [{ ...l, qty: remainingQty }] : []
                        }))
                        setSplitPaid(p=>[...p,...paidItems.map(l=>({lineId:l.lineId,qty:l.qty}))])
                        setSplitQty({})
                        const allPaid = cart.every(l => {
                          const newPaidQty = [...splitPaid,...paidItems.map(x=>({lineId:x.lineId,qty:x.qty}))].filter(p=>p.lineId===l.lineId).reduce((s,p)=>s+p.qty,0)
                          return newPaidQty >= l.qty
                        })
                        if(allPaid) {
                          setSplitPaid([])
                          setSplitQty({})
                        } else {
                          setSplitOpen(true)
                        }
                      }})
                    }} style={{ flex:2, padding:'11px', borderRadius:8, border:'none', background:selectedLines.length?T.accent:'#ccc', color:'#fff', cursor:selectedLines.length?'pointer':'not-allowed', fontFamily:'inherit', fontWeight:700, fontSize:14 }}>
                      Plačaj {eur(selectedTotal)}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}
      {pickCustomer && (
        <Modal open onClose={() => { setPickCustomer(false); setCustSearch('') }}>
          <ModalHeader title="Izberi stranko" onClose={() => { setPickCustomer(false); setCustSearch('') }}/>
          <div style={{ padding:'12px 16px' }}>
            <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Išči po imenu ali telefonu..." style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:10 }}/>
            {filteredCustomers.map(c => (
              <button key={c.id} onClick={() => { setActiveCustomer(c); setPickCustomer(false); setCustSearch('') }} style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:4, background:'transparent', border:'1px solid '+T.line, cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:999, background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
                  {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{c.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{c.phone} · {c.tier}</div>
                </div>
              </button>
            ))}
            {filteredCustomers.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:13 }}>Ni strank</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ================================================================
// CALENDAR SCREEN
// ================================================================
function CalendarScreen({ posData }) {
  const [view, setView] = useState('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingModal, setBookingModal] = useState(null) // null | {} | booking obj
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedSpace, setSelectedSpace] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [draggingId, setDraggingId] = useState<string|null>(null)

  const hours = Array.from({length:14}, (_, i) => 7 + i) // 7:00 - 20:00
  const HOUR_H = 60 // px per hour
  const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
  const daysShort = ['Ned','Pon','Tor','Sre','Čet','Pet','Sob']
  const daysFull = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']

  // Terapevti (staff s posebnimi vlogami)
  const therapists = posData.staffList.filter(s => s.role && ['Terapevt','Trener','Lastnik','Fizioterapevt','Trener'].includes(s.role))
  const filteredStaff = selectedStaff === 'all' ? therapists : therapists.filter(s => s.id === selectedStaff)

  // Teden datumi
  const getWeekDates = (d) => {
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay()+6)%7))
    return Array.from({length:7}, (_, i) => { const dd = new Date(mon); dd.setDate(mon.getDate()+i); return dd })
  }
  const weekDates = getWeekDates(currentDate)

  // Naloži rezervacije
  useEffect(() => {
    loadBookings()
  }, [currentDate, view])

  async function loadBookings() {
    setLoading(true)
    let from, to
    if (view === 'day') {
      from = new Date(currentDate); from.setHours(0,0,0,0)
      to = new Date(currentDate); to.setHours(23,59,59,999)
    } else if (view === 'month') {
      from = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      to = new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 0, 23, 59, 59)
    } else {
      from = new Date(weekDates[0]); from.setHours(0,0,0,0)
      to = new Date(weekDates[6]); to.setHours(23,59,59,999)
    }
    const {data} = await createClient()
      .from('bookings')
      .select('*, customers(id,name,phone,email,customer_packages(id,name,active,remaining,template_id)), staff(id,name,color,role), services(id,name,duration_min,color)')
      .eq('business_id', BUSINESS_ID)
      .gte('start_at', from.toISOString())
      .lte('start_at', to.toISOString())
      .order('start_at', { ascending: true })
    setBookings(data || [])
    setLoading(false)
  }

  function navigate(dir) {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'month') d.setMonth(d.getMonth() + dir)
    else d.setDate(d.getDate() + dir*7)
    setCurrentDate(d)
  }

  // Drag & drop — premakni booking
  async function moveBooking(bookingId: string, newStart: Date) {
    const b = bookings.find((x:any) => x.id === bookingId)
    if (!b) return
    const oldStart = new Date(b.start_at)
    const diff = newStart.getTime() - oldStart.getTime()
    const newEnd = b.end_at ? new Date(new Date(b.end_at).getTime() + diff) : null
    const { error: dragErr } = await createClient().from('bookings').update({
      start_at: newStart.toISOString(),
      ...(newEnd ? { end_at: newEnd.toISOString() } : {})
    }).eq('id', bookingId)
    // POPRAVLJENO (16.8.2026): prej brez preverbe - termin je na zaslonu ostal
    // premaknjen, v bazi pa ne; ob osvezitvi je skocil nazaj brez pojasnila.
    if (dragErr) alert('Termina ni bilo mogoče premakniti: ' + dragErr.message)
    await loadBookings()
    setDraggingId(null)
  }

  function goToday() { setCurrentDate(new Date()) }

  const isToday = (d) => {
    const t = new Date()
    return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear()
  }

  // Barva po statusu
  const statusStyle = (status) => ({
    scheduled: { bg:'#1f6b3a20', border:'#1f6b3a', text:'#1f6b3a' },
    confirmed:  { bg:'#1f6b3a35', border:'#1f6b3a', text:'#0d2818' },
    arrived:    { bg:'#e9b94930', border:'#b88c28', text:'#7a5c10' },
    no_show:    { bg:'rgba(168,50,50,0.12)', border:'#a83232', text:'#a83232' },
    cancelled:  { bg:'#f4efe5', border:'#d0ccc5', text:'#9a9890' },
  }[status] || { bg:'#e8f4fd', border:'#3b82f6', text:'#1e40af' })

  // Booking pozicija v grid
  function bookingPos(b) {
    const start = new Date(b.start_at)
    const startH = start.getHours() + start.getMinutes()/60
    const topPct = (startH - 7) * HOUR_H
    const height = Math.max((b.duration_min || 60) / 60 * HOUR_H, 24)
    return { top: topPct, height }
  }

  const headerDate = view === 'day'
    ? `${daysFull[currentDate.getDay()]}, ${currentDate.getDate()}. ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : `${weekDates[0].getDate()}. ${months[weekDates[0].getMonth()]} – ${weekDates[6].getDate()}. ${months[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`

  const cols = view === 'day' ? filteredStaff : weekDates

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:T.bg }}>

      {/* Header toolbar */}
      <div style={{ padding:'10px 16px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* Navigacija */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={()=>navigate(-1)} style={{ ...btnS, padding:'6px 10px', fontSize:14 }}>‹</button>
          <button onClick={goToday} style={{ ...btnS, padding:'6px 12px', fontSize:12, fontWeight:700 }}>Danes</button>
          <button onClick={()=>navigate(1)} style={{ ...btnS, padding:'6px 10px', fontSize:14 }}>›</button>
        </div>

        <div style={{ fontSize:14, fontWeight:700, marginLeft:4 }}>{headerDate}</div>

        {/* View toggle */}
        <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:8 }}>
          {[['day','Dan'],['week','Teden'],['month','Mesec']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', border:'none', fontWeight:700, fontSize:11, background:view===v?T.header:'transparent', color:view===v?T.headerInk:T.ink }}>{l}</button>
          ))}
        </div>

        {/* Filter po terapevtu */}
        {view === 'day' && therapists.length > 1 && (
          <select value={selectedStaff} onChange={e=>setSelectedStaff(e.target.value)}
            style={{ padding:'6px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit', background:T.surface }}>
            <option value="all">Vsi terapevti</option>
            {therapists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {/* Status filter */}
        <div style={{ display:'flex', gap:4 }}>
          {[['all','Vsi'],['confirmed','Potrjeni'],['arrived','Prišli'],['no_show','Odsotni']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)}
              style={{ padding:'4px 10px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+(filterStatus===v?T.accent:T.line), fontSize:11, fontWeight:filterStatus===v?700:400, background:filterStatus===v?T.accentSoft:'transparent', color:filterStatus===v?T.accent:T.muted }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={()=>setBookingModal({})} style={{ marginLeft:'auto', ...btnP, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <KI name="plus" size={13}/> Nova rezervacija
        </button>
      </div>

      {/* Mesečni pogled */}
      {view === 'month' && (
        <div style={{ flex:1, overflow:'auto', padding:16 }}>
          {(() => {
            const year = currentDate.getFullYear()
            const month = currentDate.getMonth()
            const firstDay = new Date(year, month, 1)
            const lastDay = new Date(year, month+1, 0)
            const startDow = (firstDay.getDay()+6)%7 // ponedeljek=0
            const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7
            const cells = Array.from({length: totalCells}, (_, i) => {
              const dayNum = i - startDow + 1
              if (dayNum < 1 || dayNum > lastDay.getDate()) return null
              return new Date(year, month, dayNum)
            })
            return (
              <div>
                {/* Dnevi v tednu */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
                  {['Pon','Tor','Sre','Čet','Pet','Sob','Ned'].map(d => (
                    <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:T.muted, padding:'4px 0' }}>{d}</div>
                  ))}
                </div>
                {/* Celice */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} style={{ minHeight:80, background:T.surface2, borderRadius:6 }}/>
                    const dayBookings = bookings.filter(b => {
                      const bd = new Date(b.start_at)
                      return bd.getDate()===day.getDate() && bd.getMonth()===day.getMonth()
                    })
                    const today = isToday(day)
                    return (
                      <div key={i}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          if (!draggingId) return
                          const d = new Date(day); d.setHours(9,0,0,0)
                          moveBooking(draggingId, d)
                        }}
                        onClick={() => { setCurrentDate(day); setView('day') }}
                        style={{ minHeight:80, background:today?T.accentSoft:T.surface, borderRadius:8, border:'1px solid '+(today?T.accent:T.lineSoft), padding:6, cursor:'pointer' }}>
                        <div style={{ fontSize:12, fontWeight:800, color:today?T.accent:T.ink, marginBottom:4 }}>{day.getDate()}</div>
                        {dayBookings.slice(0,3).map(b => {
                          const ss = statusStyle(b.status)
                          return (
                            <div key={b.id}
                              draggable
                              onDragStart={e => { e.stopPropagation(); setDraggingId(b.id); e.dataTransfer.effectAllowed='move' }}
                              onClick={e => { e.stopPropagation(); setBookingModal(b) }}
                              style={{ fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:4, marginBottom:2, background:ss.bg, color:ss.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'grab' }}>
                              {new Date(b.start_at).toLocaleTimeString('sl-SI',{hour:'2-digit',minute:'2-digit'})} {b.customers?.name||'Stranka'}
                            </div>
                          )
                        })}
                        {dayBookings.length > 3 && (
                          <div style={{ fontSize:9, color:T.muted, fontWeight:700 }}>+{dayBookings.length-3} več</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Glavna vsebina */}
      <div style={{ flex:1, overflow:'auto', position:'relative', display: view==='month'?'none':'flex', flexDirection:'column' }}>
        {therapists.length === 0 && view === 'day' ? (
          <div style={{ padding:60, textAlign:'center', color:T.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
            <div style={{ fontSize:13 }}>Dodaj zaposlene z vlogo Terapevt/Trener v <b>Nastavitvah → Zaposleni</b></div>
          </div>
        ) : (
          <div style={{ display:'flex', minWidth: view==='day'?`${56+Math.max(cols.length,1)*180}px`:'900px' }}>

            {/* Ura stolpec */}
            <div style={{ width:52, flexShrink:0, background:T.surface2, borderRight:'1px solid '+T.line, paddingTop:48 }}>
              {hours.map(h=>(
                <div key={h} style={{ height:HOUR_H, borderTop:'1px solid '+T.lineSoft, padding:'3px 6px', fontSize:10, fontWeight:700, color:T.muted, fontVariantNumeric:'tabular-nums' }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Stolpci */}
            <div style={{ flex:1, display:'grid', gridTemplateColumns:`repeat(${Math.max(cols.length,1)}, 1fr)` }}>

              {/* Header vrstica */}
              {(view === 'day' ? filteredStaff : weekDates).map((col, ci) => {
                const isStaff = view === 'day'
                const s = isStaff ? col : null
                const d = isStaff ? null : col
                const todayCol = !isStaff && isToday(d)
                return (
                  <div key={ci} style={{ height:48, background: todayCol?T.accentSoft:T.surface2, borderBottom:'1px solid '+T.line, borderRight:'1px solid '+T.lineSoft, padding:'8px 10px', display:'flex', alignItems:'center', gap:8, position:'sticky', top:0, zIndex:2 }}>
                    {isStaff ? (
                      <>
                        <div style={{ width:28, height:28, borderRadius:999, background:s.color||T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:10, flexShrink:0 }}>
                          {s.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:12 }}>{s.name}</div>
                          <div style={{ fontSize:9, color:T.muted }}>{s.role}</div>
                          {(() => {
                            const staffBookings = bookings.filter(b => b.staff_id === s.id)
                            const workHours = hours.length
                            const bookedHours = staffBookings.reduce((sum, b) => sum + (b.duration_min||60)/60, 0)
                            const pct = Math.min(100, Math.round(bookedHours/workHours*100))
                            return pct > 0 ? (
                              <div style={{ marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                                <div style={{ flex:1, height:3, background:T.surface3, borderRadius:99 }}>
                                  <div style={{ width:pct+'%', height:'100%', background:pct>80?T.danger:T.accent, borderRadius:99 }}/>
                                </div>
                                <span style={{ fontSize:9, color:T.muted, fontWeight:700 }}>{pct}%</span>
                              </div>
                            ) : null
                          })()}
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign:'center', width:'100%' }}>
                        <div style={{ fontSize:10, color:T.muted, fontWeight:700 }}>{daysShort[d.getDay()]}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:todayCol?T.accent:T.ink }}>{d.getDate()}</div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Urne celice + rezervacije */}
              {(view === 'day' ? filteredStaff : weekDates).map((col, ci) => {
                const colDate = view === 'day' ? currentDate : col
                const colStaffId = view === 'day' ? col.id : null

                const colBookings = bookings.filter(b => {
                  const bd = new Date(b.start_at)
                  const sameDay = bd.getDate()===colDate.getDate() && bd.getMonth()===colDate.getMonth()
                  const sameStaff = view === 'week' || !colStaffId || b.staff_id === colStaffId
                  const matchStatus = filterStatus === 'all' || b.status === filterStatus
                  return sameDay && sameStaff && matchStatus
                })

                return (
                  <div key={ci} style={{ borderRight:'1px solid '+T.lineSoft, position:'relative', background:T.surface }}>
                    {/* Urne linije */}
                    {hours.map(h=>(
                      <div key={h}
                        style={{ height:HOUR_H, borderTop:'1px solid '+T.lineSoft, cursor:'pointer', background:draggingId?'transparent':undefined }}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='rgba(31,107,58,0.08)' }}
                        onDragLeave={e => { e.currentTarget.style.background='' }}
                        onDrop={e => {
                          e.currentTarget.style.background=''
                          if (!draggingId) return
                          const d = new Date(colDate); d.setHours(h,0,0,0)
                          moveBooking(draggingId, d)
                        }}
                        onClick={()=>{
                          if (draggingId) return
                          const d = new Date(colDate)
                          d.setHours(h,0,0,0)
                          setBookingModal({ start_at: d.toISOString(), staff_id: colStaffId })
                        }}/>
                    ))}

                    {/* Rezervacije */}
                    {(() => {
                      // DODANO (21.8.2026): PREKRIVAJOCI termini so se risali
                      // eden CEZ drugega (vsi left:2, right:2), zato je bil
                      // viden samo zadnji - dva termina ob isti uri sta
                      // izgledala kot en sam. Zdaj se razdelijo v stolpce.
                      const zacetek = (b: any) => new Date(b.start_at).getTime()
                      const konec = (b: any) => zacetek(b) + Number(b.duration_min || 60) * 60000

                      // Sestavi skupine terminov, ki se med sabo prekrivajo.
                      const urejeni = [...colBookings].sort((a, b) => zacetek(a) - zacetek(b))
                      const skupine: any[][] = []
                      for (const b of urejeni) {
                        const skupina = skupine.find(g => g.some(x => zacetek(b) < konec(x) && konec(b) > zacetek(x)))
                        if (skupina) skupina.push(b)
                        else skupine.push([b])
                      }

                      // Vsakemu terminu dolocimo stolpec znotraj njegove skupine.
                      const lega = new Map<string, { stolpec: number; skupno: number }>()
                      for (const g of skupine) {
                        g.forEach((b, i) => lega.set(b.id, { stolpec: i, skupno: g.length }))
                      }
                      return colBookings.map(b => {
                      const {top, height} = bookingPos(b)
                      const ss = statusStyle(b.status)
                      const svc = b.services
                      const cust = b.customers
                      const l = lega.get(b.id) || { stolpec: 0, skupno: 1 }
                      const sirinaPct = 100 / l.skupno
                      return (
                        <div key={b.id}
                          draggable
                          onDragStart={e => { setDraggingId(b.id); e.dataTransfer.effectAllowed='move' }}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={()=>setBookingModal(b)}
                          title={l.skupno > 1 ? `${l.skupno} termina ob istem času` : undefined}
                          style={{ position:'absolute', top, height:height-2, borderRadius:7,
                            left: `calc(${l.stolpec * sirinaPct}% + 2px)`,
                            width: `calc(${sirinaPct}% - 4px)`,
                            background:svc?.color?svc.color+'25':ss.bg, border:'2px solid '+(svc?.color||ss.border), cursor:'grab', overflow:'hidden', padding:'3px 7px', zIndex:1, opacity:draggingId===b.id?0.5:1 }}>
                          <div style={{ fontWeight:700, fontSize:11, color:svc?.color||ss.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {cust?.name || b.customer_name || 'Neznana stranka'}
                          </div>
                          {height > 40 && (
                            <div style={{ fontSize:10, color:T.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {svc?.name || 'Storitev'} · {b.duration_min||60} min
                            </div>
                          )}
                          {height > 50 && b.staff && (
                            <div style={{ fontSize:9, fontWeight:600, display:'flex', alignItems:'center', gap:3, marginTop:1 }}>
                              <div style={{ width:8, height:8, borderRadius:'50%', background:b.staff.color||T.accent, flexShrink:0 }}/>
                              <span style={{ color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.staff.name}</span>
                            </div>
                          )}
                          {height > 55 && b.status === 'no_show' && (
                            <div style={{ fontSize:9, fontWeight:800, color:T.danger }}>⚠️ NI PRIŠEL</div>
                          )}
                        </div>
                      )
                    })
                    })()}

                    {/* Trenutni čas indikator */}
                    {isToday(colDate) && (() => {
                      const now = new Date()
                      const nowH = now.getHours() + now.getMinutes()/60
                      if (nowH < 7 || nowH > 21) return null
                      return (
                        <div style={{ position:'absolute', top:(nowH-7)*HOUR_H, left:0, right:0, height:2, background:'#ef4444', zIndex:3 }}>
                          <div style={{ position:'absolute', left:-4, top:-4, width:10, height:10, borderRadius:'50%', background:'#ef4444' }}/>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Booking modal */}
      {bookingModal !== null && (
        <BookingModal
          booking={bookingModal}
          posData={posData}
          onClose={()=>setBookingModal(null)}
          onSaved={(datumTermina?: string)=>{
            if (datumTermina) {
              const d = new Date(datumTermina)
              if (!isNaN(d.getTime())) setCurrentDate(d)   // skoci na dan termina
            }
            loadBookings()
            setBookingModal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Booking Modal ─────────────────────────────────────────────
/**
 * Pretvori datum v obliko za polje `datetime-local`, ki pricakuje LOKALNI cas.
 *
 * NAPAKA (popravljeno 21.8.2026): uporabljen je bil `toISOString()`, ki vrne
 * UTC. Rezervacija ob 9:00 se je v obrazcu pokazala kot 7:00, in ce je
 * uporabnik karkoli spremenil ter shranil, se je termin PREMAKNIL za dve uri
 * nazaj - tiho, ob vsakem urejanju.
 */
function zaVnosDatumaCasa(d: Date | string | null | undefined): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
    + `T${p(dt.getHours())}:${p(dt.getMinutes())}`
}

function BookingModal({ booking, posData, onClose, onSaved }) {
  // Opozorilo o prekrivanju terminov — V VMESNIKU, ne v blokirnem oknu
  // (22.8.2026). Prvi klik ga pokaze, drugi potrdi.
  const [opozoriloTrk, setOpozoriloTrk] = React.useState<string | null>(null)
  const [potrjenTrk, setPotrjenTrk] = React.useState(false)
  const isNew = !booking.id
  const [data, setData] = useState({
    customer_id: booking.customer_id || '',
    customer_name: booking.customer_name || '',
    staff_id: booking.staff_id || '',
    service_id: booking.service_id || '',
    start_at: zaVnosDatumaCasa(booking.start_at),
    duration_min: booking.duration_min || 60,
    status: booking.status || 'scheduled',
    note: booking.note || '',
    space_id: booking.space_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [custSearch, setCustSearch] = useState(booking.customer_name || '')
  const [showCustList, setShowCustList] = useState(false)
  const [activePkgs, setActivePkgs] = useState([])
  const [selectedPkg, setSelectedPkg] = useState(booking.customer_package_id || '')
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const therapists = posData.staffList.filter(s => s.role && ['Terapevt','Trener','Lastnik','Fizioterapevt'].includes(s.role))
  const custResults = posData.customers.filter(c =>
    custSearch && c.name.toLowerCase().includes(custSearch.toLowerCase())
  ).slice(0,6)

  // Naloži aktivne pakete stranke
  useEffect(() => {
    if (!data.customer_id) { setActivePkgs([]); return }
    async function load() {
      const {data:pkgs} = await createClient()
        .from('customer_packages')
        // POPRAVLJENO (24.8.2026): izbor ni vseboval `validity_days`, koda pa
        // ga bere pri karticah z aktivacijo ob PRVI UPORABI - datum poteka se
        // zato ni nastavil in kartica bi veljala neomejeno.
        .select('*, package_templates(name, template_type, validity_days)')
        .eq('customer_id', data.customer_id)
        .eq('active', true)
      setActivePkgs(pkgs || [])
    }
    load()
  }, [data.customer_id])

  // Ko izbereš storitev → nastavi trajanje
  useEffect(() => {
    if (!data.service_id) return
    const svc = posData.services.find(s => s.id === data.service_id)
    if (svc?.duration_min) setData(p => ({ ...p, duration_min: svc.duration_min }))
  }, [data.service_id])

  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        customer_id: data.customer_id || null,
        customer_name: custSearch,
        staff_id: data.staff_id || null,
        service_id: data.service_id || null,
        start_at: new Date(data.start_at).toISOString(),
        duration_min: Number(data.duration_min),
        status: data.status,
        note: data.note || null,
        reminder_sent: false,
        is_table: false,
        space_id: data.space_id || null,
        // DODANO (24.8.2026): izbrana kartica se ob shranjevanju IZGUBILA.
        // Koda jo je brala (`booking.customer_package_id`), a je nikoli ni
        // zapisala - in stolpca v bazi sploh ni bilo (SQL 10 ga doda).
        // Posledica: ob statusu "Prisel/a" se obisk NI odstel, uporabnik pa je
        // videl le "✓ Prihod zabelezen" in mislil, da je.
        customer_package_id: selectedPkg || null,
      }

      // DODANO (21.8.2026): opozorilo na ZASEDEN termin. Prej sta se dve
      // rezervaciji ob isti uri pri istem izvajalcu ustvarili brez besede -
      // uporabnik je izvedel sele, ko je videl dva termina drug ob drugem.
      // Opozorilo je NEBLOKIRNO: dvojna rezervacija je vcasih namerna
      // (skupinska vadba, dva terapevta v istem prostoru).
      if (payload.staff_id && payload.start_at) {
        const zacetek = new Date(payload.start_at)
        const konec = new Date(zacetek.getTime() + Number(payload.duration_min || 60) * 60000)
        const { data: obstojeci } = await createClient()
          .from('bookings')
          .select('id, start_at, duration_min, customer_name, customers(name)')
          .eq('business_id', BUSINESS_ID)
          .eq('staff_id', payload.staff_id)
          .neq('status', 'cancelled')
          .gte('start_at', new Date(zacetek.getTime() - 4 * 3600000).toISOString())
          .lte('start_at', new Date(konec.getTime() + 4 * 3600000).toISOString())

        const trki = (obstojeci || []).filter((b: any) => {
          if (!isNew && b.id === booking.id) return false
          const bZac = new Date(b.start_at).getTime()
          const bKon = bZac + Number(b.duration_min || 60) * 60000
          return zacetek.getTime() < bKon && konec.getTime() > bZac
        })

        // SPREMENJENO (22.8.2026): opozorilo je bilo `window.confirm`, ki
        // BLOKIRA cel brskalnik in ga uporabnik (ali agent) ne more prebrati,
        // ce se okno odpre v ozadju. Zdaj je opozorilo V VMESNIKU: prvi klik
        // ga pokaze, drugi potrdi.
        if (trki.length > 0 && !potrjenTrk) {
          const imena = trki
            .map((b: any) => b.customers?.name || b.customer_name || 'termin')
            .join(', ')
          const ura = zacetek.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })
          setOpozoriloTrk(
            `Izvajalec ima ob ${ura} že ${trki.length === 1 ? 'termin' : trki.length + ' termine'}: ${imena}.`
          )
          setSaving(false)
          return
        }
      }

      if (isNew) {
        const {error} = await createClient().from('bookings').insert(payload)
        if (error) throw error
      } else {
        const {error} = await createClient().from('bookings').update(payload).eq('id', booking.id)
        if (error) throw error
      }

      // Pošlji email opomnik (12h pred terminom)
      if (data.customer_id && isNew) {
        const cust = posData.customers.find(c => c.id === data.customer_id)
        if (cust?.email) {
          const termDate = new Date(data.start_at)
          const svc = posData.services.find(s => s.id === data.service_id)
          fetch('/api/email/send', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              to: cust.email,
              subject: `Opomnik: ${svc?.name || 'termin'} – ${termDate.toLocaleDateString('sl-SI')}`,
              customerName: cust.name,
              html: `<div style="font-family:Inter,sans-serif;padding:32px 24px;max-width:560px">
                <h2 style="color:#0d2818">Opomnik za termin</h2>
                <p>Spoštovani ${cust.name},</p>
                <p>Opominjamo vas, da imate rezerviran termin:</p>
                <div style="background:#f4efe5;padding:16px;border-radius:10px;margin:16px 0">
                  <b>${svc?.name || 'Termin'}</b><br/>
                  📅 ${termDate.toLocaleDateString('sl-SI', {weekday:'long',day:'numeric',month:'long'})}<br/>
                  ⏰ ${termDate.toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})}
                  ${data.duration_min ? ` · ${data.duration_min} min` : ''}
                </div>
                <p>V primeru odpovedi nas prosimo obvestite vsaj 24 ur vnaprej.</p>
                <p>Lep pozdrav,<br/><b>${escapeHtml(posData?.businessName || 'Ekipa')}</b></p>
              </div>`
            })
          }).catch(()=>{})
        }
      }

      // DODANO (21.8.2026): sporocimo DATUM shranjenega termina, da koledar
      // skoci nanj. Prej je uporabnik ustvaril termin za jutri, koledar pa je
      // ostal na danes - videti je bilo, kot da rezervacija ni nastala, zato
      // jo je vnesel se enkrat.
      onSaved(data.start_at)
    } catch(e: any) {
      const sporocilo = String(e?.message || '').includes('idx_staff_pin')
        ? 'Ta PIN že uporablja druga oseba. Izberite drugega.'
        : (e?.message || 'Shranjevanje ni uspelo')
      showToast(sporocilo, false)
    }
    setSaving(false)
  }

  async function deleteBooking() {
    if (!confirm('Izbrišem to rezervacijo?')) return
    // `.select()`: Supabase NE javi napake, ce brisanje ne zadene nobene vrstice (20.8.2026).
    const { data: brisBook, error: delBookErr } = await createClient().from('bookings').delete().eq('id', booking.id).select('id')
    if (delBookErr) { alert('Termina ni bilo mogoče izbrisati: ' + delBookErr.message); return }
    if (!brisBook || brisBook.length === 0) { alert('Termin ni bil izbrisan — nimate pravic ali je bil že odstranjen.'); return }
    onSaved()
  }

  async function markStatus(status) {
    // POPRAVLJENO (16.8.2026): brez te varovalke je dvojni klik na "Prišel"
    // odstel obisk DVAKRAT - stranki je izginil obisk s kartice po krivem.
    const alreadyArrived = booking.status === 'arrived'
    const { error: statusErr } = await createClient().from('bookings').update({ status }).eq('id', booking.id)
    if (statusErr) { showToast('Statusa ni bilo mogoče spremeniti: ' + statusErr.message, false); return }
    // Če "arrived" in ima paket → odštej obisk
    if (status === 'arrived' && selectedPkg && !alreadyArrived) {
      const pkg = activePkgs.find(p => p.id === selectedPkg)
      // DODANO (16.8.2026): tudi tu (prihod na termin) se je obisk odstel z
      // ZAMRZNJENE kartice - enako kot pri rocni uporabi obiska.
      if (pkg?.frozen_at) {
        showToast('Kartica je zamrznjena — obisk ni bil odštet.', false)
      } else if (pkg && pkg.remaining > 0) {
        const updates: any = { remaining: pkg.remaining - 1 }
        if (updates.remaining === 0) updates.active = false
        if (!pkg.activated_at && pkg.activation_type === 'first_use') {
          updates.activated_at = new Date().toISOString()
          if (pkg.package_templates?.validity_days) {
            const exp = new Date()
            exp.setDate(exp.getDate() + pkg.package_templates.validity_days)
            updates.expires = lokalniDatum(exp)
          }
        }
        const { error: visitErr } = await createClient().from('customer_packages').update(updates).eq('id', selectedPkg)
        if (visitErr) { showToast('Obiska ni bilo mogoče odšteti: ' + visitErr.message, false); return }
        showToast('✓ Obisk zabeležen + odštet iz kartice')
      }
    } else if (status === 'arrived') {
      // DODANO (24.8.2026): prej je pisalo samo "Prihod zabelezen" tudi, kadar
      // ima stranka kartico, ki bi jo bilo mogoce uporabiti - uporabnik je
      // mislil, da je obisk odstet. Zdaj to izrecno povemo.
      const naVoljo = (activePkgs || []).filter((p: any) => p.remaining > 0 && !p.frozen_at)
      if (!selectedPkg && naVoljo.length > 0) {
        showToast('✓ Prihod zabeležen — obisk NI odštet, ker kartica ni izbrana', false)
      } else {
        showToast('✓ Prihod zabeležen')
      }
    }
    onSaved()
  }

  const statusOptions = [
    { id:'scheduled', label:'Načrtovano', color:'#1f6b3a' },
    { id:'confirmed', label:'Potrjeno', color:'#0d2818' },
    { id:'arrived', label:'Prišel/a', color:'#b88c28' },
    { id:'no_show', label:'Ni prišel', color:'#a83232' },
    { id:'cancelled', label:'Preklicano', color:'#9a9890' },
  ]

  return (
    <Modal open onClose={onClose} width={520}>
      <ModalHeader title={isNew ? '📅 Nova rezervacija' : '📅 Uredi rezervacijo'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'80vh', overflowY:'auto' }}>

        {/* Status gumbi (samo za obstoječe) */}
        {!isNew && (
          <div>
            <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Status</label>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {statusOptions.map(s=>(
                <button key={s.id} onClick={()=>markStatus(s.id)}
                  style={{ padding:'6px 12px', borderRadius:7, border:'2px solid '+(data.status===s.id?s.color:T.line), background:data.status===s.id?s.color+'15':'transparent', color:data.status===s.id?s.color:T.muted, fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stranka */}
        <div style={{ position:'relative' }}>
          <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Stranka</label>
          <input value={custSearch} onChange={e=>{setCustSearch(e.target.value);setShowCustList(true);setData(p=>({...p,customer_id:''}))}}
            onFocus={()=>setShowCustList(true)}
            placeholder="Išči stranko..." style={inp}/>
          {showCustList && custResults.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:'1px solid '+T.line, borderRadius:9, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50 }}>
              {custResults.map(c=>(
                <div key={c.id} onClick={()=>{
                  setData(p=>({...p,customer_id:c.id,customer_name:c.name}))
                  setCustSearch(c.name); setShowCustList(false)
                }} style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid '+T.lineSoft }}>
                  <div style={{ width:30, height:30, borderRadius:999, background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11 }}>
                    {c.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{c.phone||c.email||'brez kontakta'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aktivni paketi stranke */}
        {activePkgs.length > 0 && (
          <div>
            <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Uporabi kartico (odšteje obisk ob prihodu)</label>
            <select value={selectedPkg} onChange={e=>setSelectedPkg(e.target.value)} style={inp}>
              <option value="">— Brez kartice (plačilo ob obisku) —</option>
              {activePkgs.map(p=>(
                <option key={p.id} value={p.id}>
                  {p.name} {p.remaining!==null?`(${p.remaining} obiskov)`:''} 
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {/* Storitev */}
          <Field label="Storitev">
            <select value={data.service_id} onChange={e=>setData(p=>({...p,service_id:e.target.value}))} style={inp}>
              <option value="">— Izberi storitev —</option>
              {posData.services.map(s=><option key={s.id} value={s.id}>{s.name} ({s.duration_min} min)</option>)}
            </select>
          </Field>

          {/* Terapevt */}
          <Field label="Terapevt / trener">
            <select value={data.staff_id} onChange={e=>setData(p=>({...p,staff_id:e.target.value}))} style={inp}>
              <option value="">— Izberi —</option>
              {therapists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10 }}>
          <Field label="Datum in čas *">
            <input type="datetime-local" value={data.start_at} onChange={e=>setData(p=>({...p,start_at:e.target.value}))} style={inp}/>
          </Field>
          <Field label="Trajanje (min)">
            <input type="number" onFocus={e => e.target.select()} value={data.duration_min} onChange={e=>setData(p=>({...p,duration_min:e.target.value}))} min="15" step="15" style={inp}/>
          </Field>
        </div>

        <Field label="Opomba">
          <textarea value={data.note} onChange={e=>setData(p=>({...p,note:e.target.value}))} rows={2}
            style={{ ...inp, resize:'vertical' }} placeholder="Posebne zahteve, opomba terapevtu..."/>
        </Field>

        {/* Prostor + Status */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Prostor / ordinacija">
            <select value={data.space_id} onChange={e=>setData(p=>({...p,space_id:e.target.value}))} style={inp}>
              <option value="">— Brez prostora —</option>
              {posData.spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={data.status} onChange={e=>setData(p=>({...p,status:e.target.value}))} style={inp}>
              <option value="scheduled">Načrtovano</option>
              <option value="confirmed">Potrjeno</option>
              <option value="arrived">Prišel/a ✓</option>
              <option value="no_show">Ni prišel ✗</option>
              <option value="cancelled">Preklicano</option>
            </select>
          </Field>
        </div>

        {/* Email opomnik info */}
        {isNew && data.customer_id && posData.customers.find(c=>c.id===data.customer_id)?.email && (
          <div style={{ padding:'8px 12px', background:T.accentSoft, borderRadius:8, fontSize:11, color:T.accent }}>
            📧 Stranka bo prejela email potrditev takoj po shranjevanju
          </div>
        )}

        {/* OPOZORILO O PREKRIVANJU (22.8.2026) — v vmesniku, ne v blokirnem oknu. */}
        {opozoriloTrk && (
          <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(184,140,40,0.1)', border:'1px solid rgba(184,140,40,0.3)', marginTop:4 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#8A5A00', marginBottom:4 }}>Termin je zaseden</div>
            <div style={{ fontSize:12, color:'#8A5A00', lineHeight:1.5, marginBottom:10 }}>
              {opozoriloTrk} Dvojna rezervacija je lahko namerna (skupinska vadba,
              dva izvajalca v istem prostoru).
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setOpozoriloTrk(null)} style={{ ...btnS, fontSize:12 }}>Popravi termin</button>
              <button onClick={()=>{ setPotrjenTrk(true); setOpozoriloTrk(null); setTimeout(save, 0) }}
                style={{ ...btnP, fontSize:12 }}>Vseeno rezerviraj</button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:4 }}>
          {!isNew ? (
            <button onClick={deleteBooking} style={{ ...btnS, color:T.danger, fontSize:12 }}>🗑 Izbriši</button>
          ) : <div/>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>
              {saving?'Shranjujem...':isNew?'Rezerviraj':'Shrani'}
            </button>
          </div>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </Modal>
  )
}

// ================================================================
// POPRAVLJENO (19.8.2026): imena tipov paketov so bila brez sumnikov, ena
// pa tudi napacno crkovana ("Claenarina" namesto "Clanarina"). Uporabnik to
// vidi ob vsakem ustvarjanju paketa, zato je vredno popraviti.
const TEMPLATE_TYPES = {
  membership:   { label:'Članarina',       icon:'info',    color:'#1f6b3a' },
  visits:       { label:'Karta obiskov',   icon:'target',  color:'#634896' },
  gift_voucher: { label:'Darilni bon',     icon:'gift',    color:'#b88c28' },
  service_bon:  { label:'Storitveni bon',  icon:'bell',    color:'#0ea5e9' },
  seasonal:     { label:'Sezonska',        icon:'flower',  color:'#ec4899' },
  time_restrict:{ label:'Časovna',         icon:'clock',   color:'#f97316' },
  group_class:  { label:'Skupinska',       icon:'users',   color:'#8b5cf6' },
  prepaid:      { label:'Predplačilo',     icon:'money',   color:'#14b8a6' },
}
const ACTIVATION_TYPES = {
  purchase:   'Ob nakupu',
  first_use:  'Ob prvem obisku',
  fixed_date: 'Na datum',
}
// PS SCREEN
// ================================================================

function PackagesScreen({ posData, setSellPackageModal }) {
  const [filter, setFilter] = React.useState('all')
  const allPkgs = posData.customers.flatMap(c => (c.customer_packages||[]))
  const now = new Date()
  const weekFromNow = new Date(now); weekFromNow.setDate(now.getDate()+7)
  const activeCount = allPkgs.filter(p => p.active).length
  const expiringCount = allPkgs.filter(p => p.active && p.expires && new Date(p.expires) >= now && new Date(p.expires) <= weekFromNow).length
  const expiredCount = allPkgs.filter(p => p.active && p.expires && new Date(p.expires) < now).length
  const filtered = posData.packageTemplates.filter(p => filter === 'all' || (p.template_type||p.type) === filter)
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
          {[{label:'AKTIVNIH',value:activeCount,color:T.accent},{label:'POTEČEJO',value:expiringCount,color:'#b88c28'},{label:'POTEKLE',value:expiredCount,color:T.danger},{label:'PROMET',value:'—',color:T.ink}].map(s=>(
            <div key={s.label} style={{ padding:'12px 16px', borderRadius:11, background:T.surface2, border:'1px solid '+T.line }}>
              <div style={{ fontSize:9, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:6 }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={()=>setFilter('all')} style={{ padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:filter==='all'?T.header:T.face3, color:filter==='all'?T.headerInk:T.ink }}>Vsi</button>
          {Object.entries(TEMPLATE_TYPES).map(([k,v])=>(<button key={k} onClick={()=>setFilter(k)} style={{ padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:filter===k?v.color:T.surface3, color:filter===k?'#fff':T.ink, display:'inline-flex', alignItems:'center', gap:5 }}><KI name={v.icon} size={13}/> {v.label}</button>))}
        </div>
      </div>
      {posData.packageTemplates.length === 0 ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:12, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40 }}>🎫</div>
          <div style={{ fontSize:15, fontWeight:600, color:T.ink }}>Ni paketov</div>
          <div style={{ fontSize:13 }}>Dodaj pakete v Nastavitvah</div>
        </div>
      ) : (
        <div style={{ flex:1, overflow:'auto', padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12, alignContent:'start' }}>
          {filtered.map(p => {
            const ttype = p.template_type || p.type || 'visits'
            const tconf = TEMPLATE_TYPES[ttype] || TEMPLATE_TYPES.visits
            return (<div key={p.id} style={{ background:T.surface, borderRadius:13, border:'1px solid '+T.line, padding:18, display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:tconf.color+'18', display:'flex', alignItems:'center', justifyContent:'center', color:tconf.color }}><KI name={tconf.icon} size={20}/></div>
                <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:800 }}>{p.name}</div><span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:tconf.color+'18', color:tconf.color }}>{tconf.label}</span></div>
              </div>
              <div style={{ fontSize:28, fontWeight:900, color:tconf.color }}>{eur(p.price)}</div>
              {p.description && <div style={{ fontSize:12, color:T.muted, marginTop:6, lineHeight:1.5 }}>{p.description}</div>}
              <div style={{ fontSize:11, color:T.muted, marginTop:10, paddingTop:10, borderTop:'1px solid '+T.lineSoft, display:'flex', flexWrap:'wrap', gap:8 }}>
                {p.validity_days && <span>📅 {p.validity_days} dni</span>}
                {p.visits && <span>🎯 {p.visits}x</span>}
              </div>
              <button onClick={()=>setSellPackageModal(p)} style={{ ...btnP, marginTop:14, justifyContent:'center', background:tconf.color }}>Prodaj stranki</button>
            </div>)
          })}
        </div>
      )}
    </div>
  )
}

// ================================================================
// CUSTOMERS SCREEN — full profile hub
// ================================================================

function CustomersScreen({ posData, setActiveCustomer, setScreen, setSellPackageModal }) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('vse')
  const [selectedId, setSelectedId] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [bulkEmailModal, setBulkEmailModal] = useState(false)
  const [customerPackages, setCustomerPackages] = useState([])
  const [customerDetailRefreshKey, setCustomerDetailRefreshKey] = useState(0)
  const [customerOrders, setCustomerOrders] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeTab, setActiveTab] = useState('pregled')
  const [customerStats, setCustomerStats] = useState(null)

  const initials = (name) => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  // Filtriraj stranke
  let filtered = posData.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone||'').includes(search) || (c.email||'').toLowerCase().includes(search.toLowerCase()))
  if (tierFilter !== 'vse') filtered = filtered.filter(c => (c.tier||'regular') === tierFilter)

  const selected = posData.customers.find(c => c.id === selectedId)

  // Fetch customer detail
  useEffect(() => {
    if (!selectedId) return
    setLoadingDetail(true)
    setCustomerStats(null)
    async function load() {
      // DODANO (21.8.2026): obrocni nacrti. Prej kartica v profilu ni povedala,
      // da gre za obroke - "Placano: 45 EUR" je bilo od navadne clanarine za
      // 45 EUR nerazlocljivo. Skupna vrednost, stevilo obrokov in zapadlosti
      // niso bili vidni nikjer.
      const [pkgRes, ordRes, invRes] = await Promise.all([
        createClient().from('customer_packages')
          .select('*, package_templates(name, template_type, color, validity_days, visits)')
          .eq('customer_id', selectedId)
          .order('active', { ascending: false })
          .order('purchased_at', { ascending: false }),
        createClient().from('orders')
          // POPRAVLJENO (19.8.2026): `created_at` na orders ne obstaja -
          // zgodovina narocil stranke se ni prikazala.
          .select('id, opened_at, closed_at, payments(amount, method), order_lines(name, qty, unit_price)')
          .eq('customer_id', selectedId)
          .order('opened_at', { ascending: false })
          .limit(30),
        // B4 (22.8.2026): tudi IZDANI racuni (obroki, paketi iz portala).
        // Prej je zgodovina brala samo `orders` iz blagajne, zato obrocna
        // prodaja v profilu ni bila vidna.
        // POPRAVLJENO (25.8.2026): filtrirali smo po `customer_id`, tega stolpca
        // pa `issued_invoices` NIMA - poizvedba je vsakic padla, `catch` jo je
        // pogoltnil in obrocni racuni v zgodovini niso bili nikoli vidni.
        // Tabela hrani stranko po IMENU in E-NASLOVU (client_name, client_email).
        createClient().from('issued_invoices')
          .select('id, invoice_number, issue_date, amount_total, status, line_items, client_name, client_email')
          .order('issue_date', { ascending: false })
          .limit(200),
      ])
      const pkgs = pkgRes.data || []
      const ords = ordRes.data || []
      setCustomerPackages(pkgs)
      // Zdruzimo oboje v en seznam, urejen po datumu.
      // Ujemanje po IMENU ali E-NASLOVU (25.8.2026): `issued_invoices` nima
      // povezave na stranko, hrani pa njeno ime in e-naslov ob izdaji.
      // E-naslov je zanesljivejsi, zato ga preverimo najprej.
      const stranka = posData.customers.find((c: any) => c.id === selectedId)
      const imeStranke = (stranka?.name || '').trim().toLowerCase()
      const epostaStranke = (stranka?.email || '').trim().toLowerCase()

      const izdani = (invRes.data || [])
        .filter((r: any) => {
          const rEposta = (r.client_email || '').trim().toLowerCase()
          if (epostaStranke && rEposta) return rEposta === epostaStranke
          const rIme = (r.client_name || '').trim().toLowerCase()
          return !!imeStranke && rIme === imeStranke
        })
        .map((r: any) => ({
        id: r.id,
        closed_at: r.issue_date,
        opened_at: r.issue_date,
        total: Number(r.amount_total || 0),
        jeIzdanRacun: true,
        stevilka: r.invoice_number,
        order_lines: Array.isArray(r.line_items)
          ? r.line_items.map((p: any) => ({ name: p.description || p.name, qty: p.quantity ?? 1 }))
          : [],
        // POPRAVLJENO (25.8.2026): seznam placil je bil PRAZEN, zgodovina pa
        // znesek izpisuje iz njega - obrok je zato kazal 0,00 EUR, cetudi je
        // bil racun izdan za 45 EUR. Znesek vzamemo iz racuna samega.
        payments: [{ amount: Number(r.amount_total || 0), method: 'invoice' }],
      }))
      setCustomerOrders([...ords, ...izdani].sort((a: any, b: any) =>
        new Date(b.closed_at || b.opened_at || 0).getTime()
        - new Date(a.closed_at || a.opened_at || 0).getTime()))

      // Izračunaj statistike
      const totalSpent = ords.reduce((s,o) => s + (o.payments||[]).reduce((ss,p)=>ss+Number(p.amount||0),0), 0)
      const visitCount = pkgs.reduce((s,p) => s + ((p.package_templates?.visits||0) - (p.remaining||0)), 0)
      const lastVisit = ords.length > 0 ? (ords[0].closed_at || ords[0].opened_at) : null
      const daysSince = lastVisit ? Math.floor((new Date()-new Date(lastVisit))/86400000) : null
      setCustomerStats({ totalSpent, visitCount, lastVisit, daysSince, orderCount: ords.length })
      setLoadingDetail(false)
    }
    load()
  }, [selectedId, customerDetailRefreshKey, posData.customers])

  const pkgStatusDot = (c) => {
    const pkgs = (c.customer_packages||[]).filter(p=>p.active)
    if (!pkgs.length) return '#9a9890'
    // Enako kot zgoraj (22.8.2026).
    const near = pkgs.some(p => { const d = dniDo(p.expires); return d !== null && d <= 7 })
    const low = pkgs.some(p => p.remaining!==null && p.remaining<=2)
    if (near||low) return T.warn
    return T.accent
  }

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      {/* Leva lista */}
      <div style={{ width:280, background:T.surface, borderRight:'1px solid '+T.line, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'10px 10px 8px', borderBottom:'1px solid '+T.line }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.muted }}>{filtered.length} strank</div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>setBulkEmailModal(true)} title="Pošlji email vsem"
                style={{ ...btnS, padding:'5px 8px', fontSize:11 }}>✉️</button>
              <button onClick={()=>setAddModal(true)} style={{ ...btnP, padding:'5px 10px', fontSize:11 }}>+ Nova</button>
            </div>
          </div>
          <div style={{ position:'relative', marginBottom:6 }}>
            <div style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={12}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ime, telefon, email…"
              style={{ width:'100%', padding:'7px 10px 7px 28px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:3 }}>
            {[['vse','Vse'],['regular','Redni'],['silver','Srebro'],['gold','Zlato'],['vip','VIP']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setTierFilter(id)}
                style={{ flex:1, padding:'4px 2px', borderRadius:6, border:'none', background:tierFilter===id?T.header:T.surface3, color:tierFilter===id?T.headerInk:T.muted, fontWeight:700, fontSize:9, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:5 }}>
          {filtered.length === 0 && (
            <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>
              {search ? 'Ni rezultatov' : 'Ni strank'}
            </div>
          )}
          {filtered.map(c => {
            const active = c.id === selectedId
            const activePkgs = (c.customer_packages||[]).filter(p=>p.active)
            const dot = pkgStatusDot(c)
            return (
              <button key={c.id} onClick={()=>{setSelectedId(c.id);setActiveTab('pregled')}}
                style={{ width:'100%', padding:'9px 10px', borderRadius:9, marginBottom:2, background:active?T.accentSoft:'transparent', border:'1px solid '+(active?T.accent:'transparent'), cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:34, height:34, borderRadius:999, background:active?T.accent:T.surface3, color:active?'#fff':T.ink, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11, flexShrink:0, position:'relative' }}>
                  {initials(c.name)}
                  <div style={{ position:'absolute', bottom:0, right:0, width:9, height:9, borderRadius:'50%', background:dot, border:'1.5px solid '+T.surface }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                    {c.tier && c.tier !== 'regular' && <span style={{ fontSize:8, fontWeight:800, padding:'1px 4px', borderRadius:3, background:c.tier==='gold'?'#e9b949':c.tier==='silver'?'#94a3b8':'#a855f7', color:'#fff' }}>{c.tier.toUpperCase()}</span>}
                  </div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:1, display:'flex', gap:6 }}>
                    {activePkgs.length > 0 && <span>{activePkgs.length} aktivnih kart</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desna stran */}
      {!selected ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:T.muted, gap:8 }}>
          <div style={{ fontSize:36 }}>👤</div>
          <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>Izberi stranko</div>
          <div style={{ fontSize:12 }}>ali dodaj novo s klikom + Nova</div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:T.bg }}>
          {/* Header */}
          <div style={{ background:T.surface, borderBottom:'1px solid '+T.line, padding:'14px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
              <div style={{ width:52, height:52, borderRadius:999, background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, flexShrink:0 }}>
                {initials(selected.name)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:20, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>
                  {selected.name}
                  {selected.tier && selected.tier !== 'regular' && (
                    <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:5, background:selected.tier==='gold'?'#e9b94920':selected.tier==='silver'?'#94a3b820':'#a855f720', color:selected.tier==='gold'?'#b88c28':selected.tier==='silver'?'#64748b':'#9333ea' }}>
                      ⭐ {selected.tier.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:12, color:T.muted, marginTop:3, display:'flex', gap:12, flexWrap:'wrap' }}>
                  {selected.phone && <span>📞 {selected.phone}</span>}
                  {selected.email && <span>✉️ {selected.email}</span>}
                  {selected.birth_date && <span>🎂 {new Date(selected.birth_date).toLocaleDateString('sl-SI')}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>{setActiveCustomer(selected);setScreen('packages')}}
                  style={{ ...btnS, padding:'8px 12px', fontSize:12 }}>🎫 Prodaj paket</button>
                <button onClick={()=>{setActiveCustomer(selected);setScreen('sale')}}
                  style={{ ...btnP, padding:'8px 12px', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
                  <KI name="receipt" size={13}/> Nov račun
                </button>
              </div>
            </div>

            {/* Stat kartice */}
            {customerStats && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                {[
                  ['TOČKE', selected.points||0, selected.tier||'Redni'],
                  ['PREDPLAČILO', eur(selected.prepaid||0), Number(selected.prepaid)>0?'na voljo':'brez'],
                  ['OBISKI', customerStats.visitCount, customerStats.daysSince!==null?`zadnji: ${new Date(customerStats.lastVisit).toLocaleDateString('sl-SI')}`:'ni obiskov'],
                  ['PORABLJENO', eur(customerStats.totalSpent), `povp. ${eur(customerStats.orderCount>0?customerStats.totalSpent/customerStats.orderCount:0)}`],
                ].map(([l,v,s])=>(
                  <div key={String(l)} style={{ padding:'10px 12px', background:T.surface2, borderRadius:10, border:'1px solid '+T.line }}>
                    <div style={{ fontSize:9, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{s}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabi */}
            <div style={{ display:'flex', gap:0, borderBottom:'2px solid '+T.line, marginBottom:-14 }}>
              {[
                ['pregled','Pregled'],
                ['kartice','Paketi & predplačilo'+(customerPackages.filter(p=>p.active).length?' '+customerPackages.filter(p=>p.active).length:'')],
                ['zgodovina','Zgodovina'+(customerOrders.length?' '+customerOrders.length:'')],
                ['opombe','Opombe'],
                ['uredi','Uredi'],
              ].map(([id,lbl])=>(
                <button key={id} onClick={()=>setActiveTab(id)}
                  style={{ padding:'8px 14px', background:'none', border:'none', borderBottom:activeTab===id?'2px solid '+T.accent:'2px solid transparent', marginBottom:-2, cursor:'pointer', fontFamily:'inherit', fontWeight:activeTab===id?700:500, fontSize:12, color:activeTab===id?T.accent:T.muted }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Tab vsebina */}
          <div style={{ flex:1, overflowY:'auto', padding:20 }}>
            {activeTab === 'pregled' && (
              <CustomerOverviewTab customer={selected} orders={customerOrders} packages={customerPackages} loading={loadingDetail} setActiveTab={setActiveTab} setActiveCustomer={setActiveCustomer} setScreen={setScreen}/>
            )}
            {activeTab === 'kartice' && (
              <CustomerPackagesTab customer={selected} packages={customerPackages} posData={posData} loading={loadingDetail}
                onRefresh={()=>setCustomerDetailRefreshKey(k=>k+1)} setSellPackageModal={setSellPackageModal} setScreen={setScreen} setActiveCustomer={setActiveCustomer}/>
            )}
            {activeTab === 'zgodovina' && (
              <CustomerHistoryTab orders={customerOrders} loading={loadingDetail}/>
            )}
            {activeTab === 'opombe' && (
              <CustomerNotesTab customer={selected} onSave={()=>posData.refresh()}/>
            )}
            {activeTab === 'uredi' && (
              <CustomerProfileEditTab customer={selected} onSave={()=>{posData.refresh();setSelectedId(s=>s)}}/>
            )}
            {/* ODSTRANJENO (21.8.2026): sklic na komponento CustomerClinicalTab,
                ki NE OBSTAJA. Zavihka "klinicno" se sicer nikjer ne da izbrati,
                zato se ni sesulo - a bi se, cim bi ga kdo dodal med zavihke. */}
          </div>
        </div>
      )}

      {addModal && <AddCustomerModal onClose={()=>setAddModal(false)} onSaved={(id)=>{posData.refresh();setSelectedId(id);setAddModal(false)}}/>}
      {bulkEmailModal && <BulkEmailModal customers={posData.customers} onClose={()=>setBulkEmailModal(false)}/>}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────
function CustomerOverviewTab({ customer, orders, packages, loading, setActiveTab, setActiveCustomer, setScreen }) {
  const activePkgs = packages.filter(p=>p.active)
  const recentOrders = orders.slice(0,3)

  if (loading) return <div style={{ color:T.muted, fontSize:13 }}>Nalagam...</div>

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
      {/* Zadnji obiski */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:18 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>ZADNJI OBISKI</div>
        {recentOrders.length === 0 ? (
          <div style={{ fontSize:13, color:T.muted }}>Ni še nobenih obiskov</div>
        ) : recentOrders.map((o,i) => {
          const total = (o.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0)
          const items = (o.order_lines||[]).map(l=>l.name).join(', ')
          return (
            <div key={o.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:i<recentOrders.length-1?'1px solid '+T.lineSoft:'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{items || 'Račun'}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{new Date(o.closed_at || o.opened_at).toLocaleDateString('sl-SI')}</div>
              </div>
              <div style={{ fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(total)}</div>
            </div>
          )
        })}
        {orders.length > 3 && (
          <button onClick={()=>setActiveTab('zgodovina')} style={{ ...btnS, width:'100%', marginTop:10, fontSize:12 }}>
            Prikaži vso zgodovino ({orders.length})
          </button>
        )}
      </div>

      {/* Hitri ukrepi */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>HITRI UKREPI</div>
          {[
            ['🎁', 'Dodaj boni / popust', ()=>{}],
            ['💰', 'Polni predplačilo', ()=>setActiveTab('kartice')],
            ['🎫', 'Prodaj paket', ()=>{setActiveCustomer(customer);setScreen('packages')}],
            ['📧', 'Pošlji email', ()=>{}],
          ].map(([icon,lbl,fn])=>(
            <button key={lbl} onClick={fn} style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid '+T.line, background:T.surface2, cursor:'pointer', fontFamily:'inherit', fontSize:13, textAlign:'left', display:'flex', alignItems:'center', gap:10, marginBottom:6, color:T.ink }}>
              <span>{icon}</span> {lbl}
            </button>
          ))}
        </div>

        {activePkgs.length > 0 && (
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>AKTIVNA KARTICA</div>
            {activePkgs.slice(0,1).map(p => {
              const daysLeft = dniDo(p.expires)
              const pct = p.total && p.remaining!==null ? p.remaining/p.total : null
              return (
                <div key={p.id}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{p.name}</div>
                  {p.remaining !== null && p.total && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:T.muted, marginBottom:4 }}>
                        <span>{p.remaining} obiskov</span><span style={{ fontWeight:700, fontSize:16, color:'#634896' }}>{p.remaining}/{p.total}</span>
                      </div>
                      <div style={{ height:8, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:((pct||0)*100)+'%', background:'#634896', borderRadius:999 }}/>
                      </div>
                    </>
                  )}
                  {daysLeft !== null && (
                    <div style={{ fontSize:11, color:daysLeft<=7?T.warn:T.muted, marginTop:6 }}>
                      {daysLeft<0?'Poteklo':daysLeft===0?'Poteče danes':`Velja do: ${new Date(p.expires).toLocaleDateString('sl-SI')}`}
                    </div>
                  )}
                </div>
              )
            })}
            {activePkgs.length > 1 && <button onClick={()=>setActiveTab('kartice')} style={{ ...btnS, width:'100%', marginTop:8, fontSize:11 }}>+ {activePkgs.length-1} kartice več</button>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Notes Tab ────────────────────────────────────────────────
function CustomerNotesTab({ customer, onSave }) {
  const [notes, setNotes] = useState(customer.notes||'')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setNotes(customer.notes||''); setSaved(false) }, [customer.id])

  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    const { error: notesErr } = await createClient().from('customers').update({ notes }).eq('id', customer.id)
    if (notesErr) { alert('Opombe ni bilo mogoče shraniti: ' + notesErr.message); return }
    setSaving(false); setSaved(true); onSave()
    setTimeout(()=>setSaved(false),3000)
  }

  return (
    <div style={{ maxWidth:520 }}>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>INTERNE OPOMBE</div>
      <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>Vidno samo vam — alergije, preference, posebnosti</div>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={8}
        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.surface, resize:'vertical', outline:'none', boxSizing:'border-box' }}
        placeholder="Npr: Alergija na lateks. Raje jutranji termini. Kontaktna oseba: mama Ana (+386...)"/>
      <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
        <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani opombe'}</button>
        {saved && <span style={{ fontSize:12, color:T.accent }}>✓ Shranjeno</span>}
      </div>
    </div>
  )
}

// ─── Bulk Email Modal ─────────────────────────────────────────
function BulkEmailModal({ customers, onClose, posData }) {
  // Podatki podjetja za nogo e-poste - prej trdo zapisani (SIRM, naslov).
  const pp = podatkiPodjetja(posData?.org || { name: posData?.businessName })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState('all') // all | with_email | active_packages
  // Izbira posameznih prejemnikov (21.8.2026).
  const [iskanje, setIskanje] = useState('')
  const [izkljuceni, setIzkljuceni] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  // DODANO (21.8.2026): izbira POSAMEZNIH prejemnikov. Prej sta bili na voljo
  // samo dve skupini ("vse" ali "aktivni clani") - poslati sporocilo dvema
  // izbranima strankama ni bilo mogoce, izkljuciti koga tudi ne.
  const kandidati = customers.filter(c => {
    if (!c.email) return false
    if (filter === 'active_packages') return (c.customer_packages||[]).some(p=>p.active)
    return true
  })

  const iskani = iskanje.trim().toLowerCase()
  const prikazani = iskani
    ? kandidati.filter(c =>
        (c.name || '').toLowerCase().includes(iskani) ||
        (c.email || '').toLowerCase().includes(iskani))
    : kandidati

  // Ce uporabnik ni izbral nikogar rocno, veljajo vsi iz skupine.
  const targets = izkljuceni.size > 0
    ? kandidati.filter(c => !izkljuceni.has(c.id))
    : kandidati

  async function send() {
    if (!subject || !body) return alert('Vnesi zadevo in sporočilo')
    if (!confirm(`Pošlji email ${targets.length} strankam?`)) return
    setSending(true)
    let sent = 0, failed = 0
    for (const c of targets) {
      try {
        const res = await fetch('/api/email/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            to: c.email,
            subject,
            html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
              <h2 style="color:#0d2818">${subject}</h2>
              <div style="font-size:15px;line-height:1.7;color:#444">${body.split(String.fromCharCode(10)).join('<br/>')}</div>
              <hr style="margin:24px 0;border-color:#e5e1d8"/>
              <p style="font-size:12px;color:#999">${escapeHtml(pp.ime)}${pp.naslov ? ' · ' + pp.naslov : ''}</p>
            </div>`,
          })
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }
      await new Promise(r=>setTimeout(r,200))
    }
    setSending(false)
    setResult({ sent, failed })
  }

  return (
    <Modal open onClose={onClose} width={560}>
      <ModalHeader title="✉️ Pošlji email članom" onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* Prejemniki */}
        <div>
          <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>Prejemniki</label>
          <div style={{ display:'flex', gap:6 }}>
            {[['all','Vse stranke z emailom'],['active_packages','Samo aktivni člani']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setFilter(id)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid '+(filter===id?T.accent:T.line), background:filter===id?T.accentSoft:'transparent', color:filter===id?T.accent:T.ink, fontWeight:filter===id?700:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8, marginBottom:6 }}>
            <div style={{ fontSize:11, color:T.muted }}>
              📧 {targets.length} od {kandidati.length} prejemnikov
            </div>
            {izkljuceni.size > 0 && (
              <button onClick={()=>setIzkljuceni(new Set())}
                style={{ background:'none', border:0, color:T.accent, fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                Izberi vse
              </button>
            )}
          </div>

          <input value={iskanje} onChange={e=>setIskanje(e.target.value)}
            placeholder="Poišči stranko…"
            style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box', marginBottom:6 }}/>

          <div style={{ maxHeight:150, overflowY:'auto', border:'1px solid '+T.line, borderRadius:8 }}>
            {prikazani.length === 0 ? (
              <div style={{ padding:'10px 12px', fontSize:12, color:T.muted }}>Ni ujemanja.</div>
            ) : prikazani.map((c: any) => {
              const izbran = !izkljuceni.has(c.id)
              return (
                <label key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', fontSize:12 }}>
                  <input type="checkbox" checked={izbran} style={{ accentColor:T.accent }}
                    onChange={()=>setIzkljuceni(prev => {
                      const n = new Set(prev)
                      if (n.has(c.id)) n.delete(c.id); else n.add(c.id)
                      return n
                    })}/>
                  <span style={{ flex:1, minWidth:0 }}>
                    <span style={{ fontWeight:600 }}>{c.name}</span>
                    <span style={{ color:T.muted }}> · {c.email}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <Field label="Zadeva *">
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Npr: Obvestilo o novem urniku" style={inp}/>
        </Field>

        <Field label="Sporočilo *">
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={8}
            style={{ ...inp, resize:'vertical' }} placeholder="Spoštovani,&#10;&#10;obveščamo vas, da...&#10;&#10;Lep pozdrav,&#10;Ekipa"/>
        </Field>

        {result && (
          <div style={{ padding:'12px 14px', borderRadius:9, background:result.failed>0?'rgba(168,50,50,0.1)':T.accentSoft, color:result.failed>0?T.danger:T.accent, fontSize:13, fontWeight:600 }}>
            ✓ Poslano: {result.sent} · Neuspešno: {result.failed}
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={send} disabled={sending||targets.length===0} style={{ ...btnP, opacity:sending?0.7:1 }}>
            {sending?`Pošiljam... (${targets.length})`:targets.length===0?'Ni prejemnikov':`Pošlji ${targets.length} emailov`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Profile Edit Tab ─────────────────────────────────────────
function CustomerProfileEditTab({ customer, onSave }) {
  const [data, setData] = useState({...customer})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  async function removeCustomer() {
    if (!confirm(`Izbrišem stranko "${customer.name}"? Tega dejanja ni mogoče razveljaviti.`)) return
    setDeleting(true)
    try {
      // `.select()`: Supabase NE javi napake, ce brisanje ne zadene nobene vrstice (20.8.2026).
      const { data: brisCust, error } = await createClient().from('customers').delete().eq('id', customer.id).select('id')
      // POPRAVLJENO (21.8.2026): to preverjanje je ob preletu 66 pomotoma
      // pristalo v shranjevanju REZERVACIJE - vzorec "if (error) throw error"
      // se je ujel na napacnem mestu v datoteki. Posledica: ob vsaki novi
      // rezervaciji je JS vrgel "brisCust is not defined", okno se ni zaprlo
      // in uporabnik je klikal znova - nastale so PODVOJENE rezervacije.
      if (!brisCust || brisCust.length === 0) {
        throw new Error('Stranka ni bila izbrisana — nimate pravic ali je bila že odstranjena.')
      }
      if (error) throw error
      onSave()
    } catch(e) { alert(e.message) }
    setDeleting(false)
  }
  useEffect(() => { setData({...customer}); setSaved(false) }, [customer.id])
  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const {error} = await createClient().from('customers').update({
        name: data.name, phone: data.phone||null, email: data.email||null,
        birth_date: data.birth_date||null, address: data.address||null,
        notes: data.notes||null, gender: data.gender||null,
        marketing_consent: !!data.marketing_consent,
        notification_email: data.notification_email !== false,
        tier: data.tier||null,
      }).eq('id', customer.id)
      if (error) throw error
      setSaved(true); onSave()
      setTimeout(()=>setSaved(false), 3000)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }
  return (
    <div style={{ maxWidth:520 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Ime in priimek *"><input value={data?.name||''} onChange={e=>setData(p=>({...p,name:e.target.value}))} style={inp}/></Field>
        <Field label="Spol">
          <select value={data?.gender||''} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
            <option value="">—</option><option value="m">Moški</option><option value="f">Ženski</option><option value="other">Drugo</option>
          </select>
        </Field>
        <Field label="Telefon"><input value={data?.phone||''} onChange={e=>setData(p=>({...p,phone:e.target.value}))} placeholder="+386 41 123 456" style={inp}/></Field>
        <Field label="Datum rojstva"><input type="date" value={data?.birth_date||''} onChange={e=>setData(p=>({...p,birth_date:e.target.value}))} style={inp}/></Field>
        <Field label="Email"><input type="email" value={data?.email||''} onChange={e=>setData(p=>({...p,email:e.target.value}))} placeholder="ana@gmail.com" style={inp}/></Field>
        <Field label="Tip člana">
          <select value={data?.tier||''} onChange={e=>setData(p=>({...p,tier:e.target.value}))} style={inp}>
            <option value="">Redni</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="vip">VIP</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop:12 }}><Field label="Naslov"><input value={data?.address||''} onChange={e=>setData(p=>({...p,address:e.target.value}))} placeholder="Ulica 1, 1000 Ljubljana" style={inp}/></Field></div>
      <div style={{ marginTop:12 }}><Field label="Interne opombe"><textarea value={data?.notes||''} onChange={e=>setData(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical' }} placeholder="Alergije, preference..."/></Field></div>
      <div style={{ display:'flex', gap:20, marginTop:12 }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={data?.notification_email!==false} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>📧 Email obvestila
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={!!data?.marketing_consent} onChange={e=>setData(p=>({...p,marketing_consent:e.target.checked}))} style={{ accentColor:T.accent }}/>📣 Marketing
        </label>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:16, alignItems:'center' }}>
        <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani spremembe'}</button>
        <button onClick={removeCustomer} disabled={deleting} style={{ ...btnS, color:T.danger, opacity:deleting?0.6:1 }}>{deleting?'Brišem...':'🗑️ Izbriši stranko'}</button>
        {saved && <span style={{ fontSize:12, color:T.accent, fontWeight:600 }}>✓ Shranjeno</span>}
      </div>
    </div>
  )
}

// ─── Customer Packages Tab ────────────────────────────────────
/**
 * Stevilo dni do datuma, steto po KOLEDARSKIH dnevih (22.8.2026).
 *
 * NAPAKA, ki jo to odpravlja: `Math.floor((potek - new Date()) / 86400000)`
 * primerja s trenutnim CASOM, ne z zacetkom dneva. Ob 10:25 je do poteka cez
 * 180 dni ostalo 179,56 dneva, `Math.floor` pa je to zaokrozil navzdol -
 * 180-dnevni paket je kazal "cez 179 dni".
 */
function dniDo(datum: string | Date | null | undefined): number | null {
  if (!datum) return null
  const cilj = new Date(datum)
  if (isNaN(cilj.getTime())) return null
  const zdaj = new Date()
  const a = new Date(zdaj.getFullYear(), zdaj.getMonth(), zdaj.getDate())
  const b = new Date(cilj.getFullYear(), cilj.getMonth(), cilj.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function CustomerPackagesTab({ customer, packages, posData, loading, onRefresh, setSellPackageModal, setScreen, setActiveCustomer }) {
  // DODANO (21.8.2026): obrocni nacrti za prikaz na kartici paketa. Nalozimo
  // jih TU, kjer se prikazujejo - prej so bili pomotoma v drugi komponenti in
  // spremenljivka tu sploh ni obstajala.
  const [obrocniNacrti, setObrocniNacrti] = React.useState<any[]>([])
  React.useEffect(() => {
    if (!customer?.id) { setObrocniNacrti([]); return }
    let veljavno = true
    ;(async () => {
      const { data } = await createClient()
        .from('installment_plans')
        .select('id, customer_package_id, total_amount, installment_count, installment_amount, installments(installment_number, due_date, amount, status)')
        .eq('customer_id', customer.id)
      if (veljavno) setObrocniNacrti(data || [])
    })()
    return () => { veljavno = false }
  }, [customer?.id])

  const [actionLoading, setActionLoading] = useState(null)
  const [manualAddModal, setManualAddModal] = useState(null)
  const [editPkgModal, setEditPkgModal] = useState(null)
  const [extendPkgModal, setExtendPkgModal] = useState(null)
  const [freezeModal, setFreezeModal] = useState(null)
  const [toast, setToast] = useState(null)
  const [prepaidAmount, setPrepaidAmount] = useState('')
  const [addingPrepaid, setAddingPrepaid] = useState(false)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const active = packages.filter(p=>p.active)
  const inactive = packages.filter(p=>!p.active)

  async function useVisit(pkg) {
    if (pkg.remaining !== null && pkg.remaining <= 0) { showToast('Ni več obiskov!', false); return }
    // DODANO (16.8.2026): zamrznjene kartice ni bilo mogoce lociti od aktivne -
    // obisk se je odstel tudi, ko je stranka clanarino zamrznila (npr. dopust),
    // ceprav ji je bila veljavnost ob odmrznitvi podaljsana za iste dneve.
    if (pkg.frozen_at) { showToast('Kartica je zamrznjena. Najprej jo odmrznite.', false); return }
    setActionLoading(pkg.id+'_use')
    try {
      const updates: any = {}
      if (pkg.remaining !== null) updates.remaining = pkg.remaining - 1
      if (!pkg.activated_at && pkg.activation_type === 'first_use') {
        const now = new Date()
        updates.activated_at = now.toISOString()
        if (pkg.package_templates?.validity_days) {
          const exp = new Date(now)
          exp.setDate(exp.getDate() + pkg.package_templates.validity_days)
          updates.expires = lokalniDatum(exp)
        }
      }
      if (updates.remaining === 0) updates.active = false
      const {error} = await createClient().from('customer_packages').update(updates).eq('id', pkg.id)
      if (error) throw error
      showToast('✓ Obisk zabeležen')
      onRefresh()
    } catch(e) { showToast(e.message, false) }
    setActionLoading(null)
  }

  async function toggleFreeze(pkg) {
    setActionLoading(pkg.id+'_freeze')
    try {
      if (pkg.frozen_at) {
        const frozenDays = Math.floor((new Date().getTime()-new Date(pkg.frozen_at).getTime())/86400000)
        let newExpires = pkg.expires
        if (pkg.expires && frozenDays > 0) {
          const exp = new Date(pkg.expires)
          exp.setDate(exp.getDate()+frozenDays)
          newExpires = lokalniDatum(exp)
        }
        // POPRAVLJENO (16.8.2026): prej brez preverbe napake - uporabnik je videl
        // "odmrznjena", tudi ce se v bazi ni nic spremenilo.
        const { error: unfreezeErr } = await createClient().from('customer_packages').update({ frozen_at:null, frozen_until:null, expires:newExpires }).eq('id', pkg.id)
        if (unfreezeErr) throw unfreezeErr
        showToast('Kartica odmrznjena. +'+frozenDays+' dni.')
      } else {
        const { error: freezeErr } = await createClient().from('customer_packages').update({ frozen_at: new Date().toISOString() }).eq('id', pkg.id)
        if (freezeErr) throw freezeErr
        showToast('Kartica zamrznjena.')
      }
      onRefresh()
    } catch(e) { showToast(e.message, false) }
    setActionLoading(null)
  }

  async function deactivate(pkg) {
    if (!confirm(`Deaktiviram kartico "${pkg.name}"?`)) return
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - uporabnik je videl
    // "deaktivirana", tudi ce se v bazi ni nic spremenilo.
    const { error: deactErr } = await createClient().from('customer_packages').update({ active:false }).eq('id', pkg.id)
    if (deactErr) { showToast(deactErr.message, false); return }
    showToast('Kartica deaktivirana')
    onRefresh()
  }
  async function deletePkg(pkg) {
    if (!confirm(`Trajno izbrisem kartico "${pkg.name}"? Tega ni mogoce razveljaviti.`)) return
    // `.select()`: Supabase NE javi napake, ce brisanje ne zadene nobene vrstice (20.8.2026).
    const { data: brisPkg, error } = await createClient().from('customer_packages').delete().eq('id', pkg.id).select('id')
    if (error) { showToast(error.message, false); return }
    if (!brisPkg || brisPkg.length === 0) { showToast('Paket ni bil izbrisan — nimate pravic ali je bil že odstranjen.', false); return }
    showToast('Kartica trajno izbrisana')
    onRefresh()
  }

  async function addPrepaid() {
    const amount = parseFloat(prepaidAmount)
    if (isNaN(amount) || amount <= 0) return
    setAddingPrepaid(true)
    // POPRAVLJENO (16.8.2026): prej branje stanja + zapis ABSOLUTNE vrednosti -
    // ce je stranka vmes placala na drugi blagajni, je polnjenje povozilo tisto
    // placilo (lost update). Zdaj atomarno v bazi. Prav tako se preverja napaka.
    const { error: prepErr } = await createClient().rpc('refund_prepaid', {
      p_customer_id: customer.id,
      p_amount: amount,
    })
    setAddingPrepaid(false)
    if (prepErr) { showToast('Napaka pri polnjenju: ' + prepErr.message, false); return }
    setPrepaidAmount('')
    showToast(`✓ Dodano ${eur(amount)} predplačila`)
    onRefresh()
  }

  if (loading) return <div style={{ padding:32, textAlign:'center', color:T.muted }}>Nalagam...</div>

  return (
    <div>
      {/* Prodaj paket / Nov racun sta ze na voljo zgoraj desno na profilu stranke - tukaj samo se manualni dodatek */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
        <button onClick={()=>setManualAddModal({})} style={{ ...btnS, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <KI name="edit" size={13}/> Dodaj kartico rocno
        </button>
      </div>

      {/* Aktivne kartice */}
      {active.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>AKTIVNI PAKETI ({active.length})</div>
          {active.map(pkg => {
            const tc = TEMPLATE_TYPES[pkg.template_type||pkg.package_templates?.template_type]||TEMPLATE_TYPES.visits
            const daysLeft = dniDo(pkg.expires)
            const isFrozen = !!pkg.frozen_at
            const isNear = daysLeft!==null && daysLeft<=7
            const barPct = pkg.total && pkg.remaining!==null ? (pkg.remaining/pkg.total*100) : null
            return (
              <div key={pkg.id} style={{ padding:16, borderRadius:12, marginBottom:10, background:T.surface, border:'2px solid '+(isFrozen?'#94a3b8':isNear?T.warn:tc.color)+'40', opacity:isFrozen?0.75:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:tc.color+'18', display:'flex', alignItems:'center', justifyContent:'center', color:tc.color }}><KI name={tc.icon} size={18}/></div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{pkg.name}</div>
                    {/* POPRAVLJENO (22.8.2026): pisalo je "Placano: 45 EUR", ceprav
                        je bilo pri obrocnem paketu placano 0 EUR - dve vrstici v
                        istem okvircku sta si nasprotovali. `purchase_price` je
                        CENA, ne placilo; koliko je dejansko placano, pove
                        obrocni nacrt spodaj. */}
                    <div style={{ fontSize:11, color:T.muted }}>{tc.label}{pkg.purchase_price?` · Cena: ${eur(pkg.purchase_price)}`:''}</div>

                    {/* OBROCNI NACRT (21.8.2026): prej se ni videlo, da gre za
                        obroke - "Placano: 45 EUR" je bilo od navadne clanarine
                        nerazlocljivo. Skupne vrednosti, stevila obrokov in
                        zapadlosti ni bilo nikjer. */}
                    {(() => {
                      // `installment_plans` se veze na customer_package_id;
                      // stolpca package_template_id NIMA (preverjeno v bazi).
                      const nacrt = (obrocniNacrti || []).find((n: any) => n.customer_package_id === pkg.id)
                      if (!nacrt) return null
                      const obroki = (nacrt.installments || []).slice()
                        .sort((a: any, b: any) => a.installment_number - b.installment_number)
                      const placani = obroki.filter((o: any) => o.status === 'paid')
                      const naslednji = obroki.find((o: any) => o.status !== 'paid')
                      const skupaj = obroki.length > 0
                        ? obroki.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0)
                        : Number(nacrt.total_amount || 0)
                      const placano = placani.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0)
                      return (
                        <div style={{ marginTop:6, padding:'7px 9px', borderRadius:7, background:T.surface2, fontSize:11, lineHeight:1.6 }}>
                          <div style={{ fontWeight:700 }}>
                            Obročno: {placani.length} / {obroki.length} plačanih
                          </div>
                          <div style={{ color:T.muted }}>
                            {eur(placano)} od {eur(skupaj)}
                            {skupaj - placano > 0 && <> · preostane <strong>{eur(skupaj - placano)}</strong></>}
                          </div>
                          {naslednji && (
                            <div style={{ color:T.warn }}>
                              Naslednji obrok {eur(naslednji.amount)} zapade{' '}
                              {new Date(naslednji.due_date).toLocaleDateString('sl-SI')}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  {pkg.remaining !== null && (
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:22, fontWeight:800, fontVariantNumeric:'tabular-nums', color:pkg.remaining<=2?T.danger:tc.color }}>{pkg.remaining}</div>
                      {pkg.total && <div style={{ fontSize:10, color:T.muted }}>/ {pkg.total} obiskov</div>}
                    </div>
                  )}
                  {isFrozen && <span style={{ fontSize:9, fontWeight:800, background:'#64748b', color:'#fff', padding:'2px 6px', borderRadius:4 }}>❄️ ZAMRZ.</span>}
                </div>
                {barPct !== null && (
                  <div style={{ height:6, borderRadius:999, background:T.surface3, overflow:'hidden', marginBottom:8 }}>
                    <div style={{ height:'100%', width:barPct+'%', background:pkg.remaining<=2?T.danger:tc.color, borderRadius:999 }}/>
                  </div>
                )}
                {pkg.expires && (
                  <div style={{ fontSize:12, color:isNear?T.warn:T.muted, marginBottom:10 }}>
                    {isNear?'⚠️ ':'📅 '}Poteče: {new Date(pkg.expires).toLocaleDateString('sl-SI')}
                    {daysLeft!==null && <span style={{ marginLeft:5 }}>({daysLeft<0?'poteklo':daysLeft===0?'danes':`čez ${daysLeft} dni`})</span>}
                  </div>
                )}
                <div style={{ display:'flex', gap:6 }}>
                  {pkg.remaining !== null && pkg.remaining > 0 && !isFrozen && (
                    <button onClick={()=>useVisit(pkg)} disabled={actionLoading===pkg.id+'_use'} style={{ ...btnP, padding:'7px 12px', fontSize:12, background:tc.color }}>
                      {actionLoading===pkg.id+'_use'?'...':'✓ Uporabi obisk'}
                    </button>
                  )}
                  <button onClick={()=>isFrozen?toggleFreeze(pkg):setFreezeModal(pkg)} disabled={!!actionLoading} style={{ ...btnS, padding:'7px 12px', fontSize:12 }}>
                    {isFrozen?'❄️ Odmrzni':'⏸ Zamrzni'}
                  </button>
                  <button onClick={()=>setEditPkgModal(pkg)} style={{ ...btnS, padding:'7px 12px', fontSize:12 }}>✏️ Popravi</button>
                  <button onClick={()=>setExtendPkgModal(pkg)} style={{ ...btnS, padding:'7px 12px', fontSize:12 }}>➕ Podaljšaj</button>
                  <button onClick={()=>deactivate(pkg)} style={{ ...btnS, padding:'7px 12px', fontSize:12, color:T.danger }}>Deaktiviraj</button>
                  <button onClick={()=>deletePkg(pkg)} style={{ ...btnS, padding:'7px 12px', fontSize:12, color:T.danger }}>🗑 Briši</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active.length === 0 && (
        <div style={{ padding:32, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line, marginBottom:16 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🎫</div>
          Ni aktivnih kartic. Klikni "Kupi kartico" da prodaš prvo.
        </div>
      )}

      {/* Predplačilo */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>PREDPLAČILO</div>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:10, color:T.muted }}>Trenutno stanje</div>
            <div style={{ fontSize:28, fontWeight:800, color:Number(customer.prepaid)>0?T.accent:T.muted, fontVariantNumeric:'tabular-nums' }}>{eur(customer.prepaid||0)}</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>Stranka lahko z predplačilom plačuje storitve in produkte. Stanje se odbija avtomatsko.</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="number" onFocus={e => e.target.select()} value={prepaidAmount} onChange={e=>setPrepaidAmount(e.target.value)} placeholder="Znesek €" min="0" step="0.5"
            style={{ width:120, ...inp }}/>
          <button onClick={addPrepaid} disabled={addingPrepaid||!prepaidAmount} style={{ ...btnP, opacity:!prepaidAmount?0.5:1 }}>+ Napolni</button>
        </div>
      </div>

      {/* Pretekle kartice */}
      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>PRETEKLE ({inactive.length})</div>
          {inactive.map(pkg => (
            <div key={pkg.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:T.surface, borderRadius:9, marginBottom:5, opacity:0.55 }}>
              <div><KI name={(TEMPLATE_TYPES[pkg.template_type||pkg.package_templates?.template_type]||TEMPLATE_TYPES.visits).icon} size={14}/></div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{pkg.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{pkg.expires?`Poteklo: ${new Date(pkg.expires).toLocaleDateString('sl-SI')}`:'Porabljeno'}</div>
              </div>
              {pkg.purchase_price && <div style={{ fontSize:12, color:T.muted }}>{eur(pkg.purchase_price)}</div>}
            </div>
          ))}
        </div>
      )}

                {manualAddModal && <ManualAddCardModal customer={customer} posData={posData} onClose={()=>setManualAddModal(null)} onDone={()=>{ setManualAddModal(null); onRefresh() }}/>}
                {editPkgModal && <EditPackageModal pkg={editPkgModal} onClose={()=>setEditPkgModal(null)} onDone={()=>{ setEditPkgModal(null); onRefresh() }}/>}
                {extendPkgModal && <ExtendPackageModal pkg={extendPkgModal} onClose={()=>setExtendPkgModal(null)} onDone={()=>{ setExtendPkgModal(null); onRefresh() }}/>}
                {freezeModal && <FreezePackageModal pkg={freezeModal} onClose={()=>setFreezeModal(null)} onDone={()=>{ setFreezeModal(null); onRefresh() }}/>}
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Customer History Tab ─────────────────────────────────────
function CustomerHistoryTab({ orders, loading }) {
  if (loading) return <div style={{ padding:32, textAlign:'center', color:T.muted }}>Nalagam...</div>
  if (orders.length === 0) return (
    <div style={{ padding:32, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
      <div style={{ fontSize:28, marginBottom:8 }}>📋</div>Ni še nobenih nakupov
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>VSI OBISKI IN RAČUNI</div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:T.surface2 }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>DATUM</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>OPIS</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>ZNESEK</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>TIP</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o,i) => {
              const total = (o.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0)
              const method = (o.payments||[])[0]?.method || ''
              const items = (o.order_lines||[]).map(l=>l.name).join(', ')
              const methodIcon = {cash:'💶',card:'💳',bon:'🎫',prep:'💰'}[method]||'💳'
              // POPRAVLJENO (22.8.2026): oznaki sta bili zamenjani - unovcenje
              // KARTICE ('pkg') je bilo oznaceno kot "PLAČILO", placilo z boni
              // pa kot "PAKET". Zdaj vsak nacin dobi svojo oznako.
              const oznakaNacina =
                o.jeIzdanRacun ? 'RAČUN ' + (o.stevilka || '')
                : method === 'pkg' ? 'KARTICA OBISKOV'
                : method === 'prep' ? 'PREDPLAČILO'
                : method === 'bon' ? 'BON'
                : method === 'cash' ? 'GOTOVINA'
                : method === 'card' ? 'KARTICA'
                : 'PLAČILO'
              const isPkg = o.jeIzdanRacun || method === 'pkg' || method === 'bon' || method === 'prep'
              return (
                <tr key={o.id} style={{ borderTop:'1px solid '+T.lineSoft, background:i%2?T.surface2:T.surface }}>
                  <td style={{ padding:'10px 14px', fontSize:12, color:T.muted }}>
                    {/* POPRAVLJENO (22.8.2026): `orders.created_at` NE OBSTAJA
                        (stolpci so opened_at, closed_at, voided_at), zato je
                        v zgodovini pisalo "Invalid Date". */}
                    {(() => {
                      const d = o.closed_at || o.opened_at
                      const dt = d ? new Date(d) : null
                      return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('sl-SI') : '—'
                    })()}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600 }}>
                    {items || 'Račun'}
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(total)}</td>
                  <td style={{ padding:'10px 14px', textAlign:'right' }}>
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:isPkg?'rgba(99,72,150,0.12)':T.accentSoft, color:isPkg?'#634896':T.accent, textTransform:'uppercase' }}>
                      {methodIcon} {oznakaNacina}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Add Customer Modal ───────────────────────────────────────
function AddCustomerModal({ onClose, onSaved }) {
  const [data, setData] = useState({ name:'', phone:'', email:'', gender:'', notification_email:true })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!data.name.trim()) return alert('Ime je obvezno')
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const {data:saved, error} = await createClient().from('customers').insert({
        business_id: BUSINESS_ID, name: data.name, phone: data.phone||null,
        email: data.email||null, gender: data.gender||null,
        notification_email: data.notification_email, points:0, prepaid:0, tier:'regular',
      }).select().single()
      if (error) throw error
      onSaved(saved.id)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }
  return (
    <Modal open onClose={onClose} width={420}>
      <ModalHeader title="Nova stranka" onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
        <Field label="Ime in priimek *"><input value={data.name} onChange={e=>setData(p=>({...p,name:e.target.value}))} placeholder="Ana Novak" style={inp} autoFocus/></Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Telefon"><input value={data.phone} onChange={e=>setData(p=>({...p,phone:e.target.value}))} placeholder="+386 41 123 456" style={inp}/></Field>
          <Field label="Spol">
            <select value={data.gender} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
              <option value="">—</option><option value="m">Moški</option><option value="f">Ženski</option>
            </select>
          </Field>
        </div>
        <Field label="Email"><input type="email" value={data.email} onChange={e=>setData(p=>({...p,email:e.target.value}))} placeholder="ana@gmail.com" style={inp}/></Field>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer' }}>
          <input type="checkbox" checked={data.notification_email} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>
          Pošiljaj email obvestila o kartah
        </label>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Dodaj stranko'}</button>
        </div>
      </div>
    </Modal>
  )
}


function DobavnicaImportModal({ posData, onClose, onImported }) {
  const [step, setStep] = React.useState('upload')
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState({})
  // Ujemanje vrstice dobavnice z artiklom v blagajni (20.8.2026).
  // itemId: null pomeni "brez knjizenja", 'NOV' pomeni "ustvari nov artikel".
  const [ujemanja, setUjemanja] = React.useState({})
  const [importing, setImporting] = React.useState(false)
  const [log, setLog] = React.useState([])
  const fileRef = React.useRef(null)

  async function handleFile(f) {
    if (!f || f.type !== 'application/pdf') { setError('Prosim nalozi PDF datoteko'); return }
    setLoading(true); setError('')
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })
      const resp = await fetch('/api/pos/import-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, items: posData.items.map(i => ({ id: i.id, name: i.name, barcode: i.barcode })) }),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Napaka') }
      const data = await resp.json()

      // DODANO (20.8.2026): AI pogosto ne poveze vrstic, ker so imena v
      // blagajni kratka ("Corona"), na dobavnici pa dolga ("PIVO CORONA
      // EXTRA 0,33L ST"). Zato ujemanje IZRACUNAMO se sami - po crtni kodi in
      // podobnosti naziva z upostevanjem velikosti pakiranja.
      // DODANO (20.8.2026): v nabor za ujemanje gredo tudi SUROVINE. Prej so
      // se iskala ujemanja samo med artikli, zato kave, vina in zganih pijac,
      // ki se vodijo kot surovine z normativi, ni bilo mogoce polniti iz
      // dobavnice - vnasati jih je bilo treba rocno ob vsaki dobavi.
      //
      // Artikli z NORMATIVOM so izloceni: espresso ni fizicna stvar in na
      // dobavnici ne pride, polnijo se njegove sestavine.
      const katalog = [
        ...posData.items
          .filter(i => i.item_type !== 'recipe' && i.item_type !== 'ingredient')
          .map(i => ({ id: i.id, name: i.name, barcode: i.barcode, vrsta: 'item' })),
        ...(posData.ingredients || [])
          .map(i => ({ id: i.id, name: i.name, barcode: i.barcode, vrsta: 'ingredient' })),
      ]
      const sel = {}
      const ujem = {}
      ;(data.artikli || []).forEach((a, i) => {
        sel[i] = true
        if (a.ujemanje_id) {
          ujem[i] = { itemId: a.ujemanje_id, vrsta: 'item', vir: 'ai', zanesljivost: 'visoka' }
        } else {
          const pr = predlagajUjemanje({ naziv: a.naziv, ean: a.ean }, katalog)
          const najden = katalog.find(k => k.id === pr.itemId)
          ujem[i] = {
            itemId: pr.itemId,
            vrsta: najden?.vrsta || 'item',
            vir: pr.itemId ? 'predlog' : 'brez',
            zanesljivost: pr.zanesljivost,
            ocena: pr.ocena,
          }
        }
      })
      setResult(data)
      setSelected(sel)
      setUjemanja(ujem)
      setStep('preview')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function doImport() {
    setImporting(true)
    const newLog = []
    const sb = createClient()

    // 1. Shrani glavo dobavnice
    let deliveryId = null
    try {
      const selectedArtikli = (result?.artikli || []).filter((_,i) => selected[i])
      const { data: delivery, error: deliveryErr } = await sb.from('deliveries').insert({
        business_id: BUSINESS_ID,
        supplier: result?.dobavitelj || null,
        document_number: result?.stevilka_dokumenta || null,
        document_date: result?.datum || null,
        total_ex_vat: result?.skupaj_brez_ddv || null,
        total_vat: result?.skupaj_ddv || null,
        total_inc_vat: result?.skupaj_z_ddv || null,
      }).select().single()
      if (deliveryErr) throw deliveryErr
      deliveryId = delivery.id

      // PRESTAVLJENO (20.8.2026): vrstice se zapisejo SELE po koraku 3.
      // Prej so se shranile TU, ujemanja pa so se razresila sele spodaj -
      // artikli, ustvarjeni na novo, bi zato v dobavnici ostali brez povezave
      // (item_id null), kar bi pokvarilo tudi razveljavitev zaloge ob brisanju.
      if (false && selectedArtikli.length > 0) {
        const lines = selectedArtikli.map((a, i) => ({
          delivery_id: deliveryId,
          // Potrjeno ujemanje (20.8.2026); 'NOV' se razresi spodaj, zato tu null.
          item_id: (a.ujemanje_id && a.ujemanje_id !== 'NOV') ? a.ujemanje_id : null,
          item_name: a.naziv,
          ean: a.ean || null,
          quantity: Number(a.kolicina || 0),
          unit: a.enota || 'kos',
          price_ex_vat: Number(a.cena_brez_ddv || 0),
          discount_pct: Number(a.popust_procent || 0),
          net_price_ex_vat: Number(a.neto_cena_brez_ddv || 0),
          vat_rate: Number(a.ddv_stopnja || 22),
          net_price_inc_vat: Number(a.neto_cena_z_ddv || 0),
          total_ex_vat: Number(a.vrednost_brez_ddv || 0),
          total_inc_vat: Number(a.vrednost_z_ddv || 0),
        }))
        const { error: dlErr } = await sb.from('delivery_lines').insert(lines)
        // POPRAVLJENO (17.8.2026): brez vrstic je dobavnica prazna - uporabnik
        // je videl potrditev, zaloga pa se ni spremenila.
        if (dlErr) {
          console.error('Vrstic dobavnice ni bilo mogoce shraniti:', dlErr)
          setError('Dobavnica je shranjena, artiklov na njej pa NI bilo mogoče shraniti: ' + dlErr.message)
        }
      }
    } catch(e) {
      console.error('delivery save error:', e)
    }

    // 3. Posodobi zaloge artiklov
    for (const [idx, artikel] of (result?.artikli || []).entries()) {
      if (!selected[idx]) continue
      try {
        // SPREMENJENO (20.8.2026): uporabimo ujemanje, ki ga je POTRDIL
        // uporabnik, ne le tistega od AI. Prej so vrstice brez AI ujemanja
        // tiho izpadle in zaloga se ni premaknila.
        const izbira = ujemanja[idx] || {}
        const jeSurovina = izbira.vrsta === 'ingredient' || izbira.vir === 'nova_surovina'
        let ciljniId = izbira.itemId && izbira.itemId !== 'NOV' ? izbira.itemId : null

        // DODANO (20.8.2026): nova SUROVINA (kava, vino, moka ...). Te se
        // vodijo v loceni tabeli in nimajo prodajne cene - prodaja se izdelek
        // iz njih (espresso), surovina se odsteva po normativu.
        if (izbira.vir === 'nova_surovina') {
          const { data: novaSur, error: surErr } = await sb.from('ingredients').insert({
            business_id: BUSINESS_ID,
            name: artikel.naziv,
            unit: artikel.enota || 'kos',
            stock_qty: 0,
            cost_price: artikel.neto_cena_brez_ddv || null,
            barcode: artikel.ean || null,
          }).select('id').single()
          if (surErr) throw surErr
          ciljniId = novaSur.id
          newLog.push({ name: artikel.naziv, ok: true, msg: 'nova surovina — dodajte jo v normative' })
        }

        // Knjizenje na SUROVINO (obstojeco ali pravkar ustvarjeno).
        if (jeSurovina && ciljniId) {
          const { error: sErr } = await sb.rpc('increment_ingredient_stock', {
            p_ingredient_id: ciljniId,
            p_qty: Number(artikel.kolicina || 0),
          })
          if (sErr) throw sErr

          // Nabavna cena in crtna koda - koda se zapomni za naslednjic.
          const patchSur: any = {}
          if (artikel.neto_cena_brez_ddv) patchSur.cost_price = artikel.neto_cena_brez_ddv
          if (artikel.ean) patchSur.barcode = artikel.ean
          if (Object.keys(patchSur).length > 0) {
            const { error: pErr } = await sb.from('ingredients').update(patchSur).eq('id', ciljniId)
            if (pErr) throw pErr
          }

          artikel.ujemanje_id = null   // vrstica dobavnice se veze na ARTIKEL, ne surovino
          artikel.ujemanje_ingredient_id = ciljniId
          if (izbira.vir !== 'nova_surovina') {
            newLog.push({
              name: artikel.naziv, ok: true,
              msg: '+' + artikel.kolicina + ' ' + (artikel.enota || 'kos') + ' (surovina)'
                + (artikel.ean ? ' · koda shranjena' : ''),
            })
          }
          continue
        }

        // Uporabnik je zahteval NOV artikel - ustvarimo ga.
        if (izbira.itemId === 'NOV') {
          const { data: novArtikel, error: novErr } = await sb.from('items').insert({
            business_id: BUSINESS_ID,
            name: artikel.naziv,
            price: 0,                                   // prodajno ceno dolocite sami
            cost_price: artikel.neto_cena_brez_ddv || null,
            barcode: artikel.ean || null,
            vat_rate: Number(artikel.ddv_stopnja ?? 22),
            unit: artikel.enota || 'kos',
            stock: 0,
          }).select('id').single()
          if (novErr) throw novErr
          ciljniId = novArtikel.id
          newLog.push({ name: artikel.naziv, ok: true, msg: 'nov artikel — določite prodajno ceno' })
        }

        if (!ciljniId) {
          newLog.push({ name: artikel.naziv, ok: false, msg: 'preskočeno — brez knjiženja' })
          continue
        }

        artikel.ujemanje_id = ciljniId
        if (ciljniId) {
          // POPRAVLJENO (16.8.2026): prej branje zaloge iz ZASTARELEGA posnetka
          // + zapis absolutne vrednosti - ce je vmes tekla prodaja, je uvoz
          // povozil odstete kolicine. Zdaj atomarno pristevanje v bazi.
          const qty = Number(artikel.kolicina || 0)
          const { error: stockErr } = await sb.rpc('increment_stock', {
            p_item_id: artikel.ujemanje_id,
            p_qty: qty,
          })
          if (stockErr) throw stockErr

          // POPRAVLJENO (16.8.2026): nabavna cena in EAN se posodobita SAMO,
          // ce ju je AI dejansko prepoznal - prej je "|| null" IZBRISAL
          // obstojeco nabavno ceno, kadar je AI ni razbral iz PDF-ja.
          const patch: any = {}
          if (artikel.neto_cena_brez_ddv) patch.cost_price = artikel.neto_cena_brez_ddv
          // Crtna koda se zapise ob PRVEM potrjenem ujemanju - naslednjic se
          // artikel ujame samodejno in rocnega dela ni vec (20.8.2026).
          if (artikel.ean) patch.barcode = artikel.ean
          if (Object.keys(patch).length > 0) {
            // POPRAVLJENO (16.8.2026): prej se napaka ni preverjala - uporabnik
            // je videl "+X kos" tudi, ce posodobitev sploh ni uspela.
            const { error: patchErr } = await sb.from('items').update(patch).eq('id', artikel.ujemanje_id)
            if (patchErr) throw patchErr
          }
          newLog.push({
            name: artikel.naziv, ok: true,
            msg: '+' + artikel.kolicina + ' ' + (artikel.enota || 'kos')
              + (artikel.ean ? ' · koda shranjena' : ''),
          })
        }
      } catch(e) { newLog.push({ name: artikel.naziv, ok: false, msg: e.message }) }
    }
    // 4. Sele zdaj zapisemo vrstice - vsa ujemanja so razresena (20.8.2026).
    if (deliveryId) {
      const vrstice = (result?.artikli || [])
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => selected[i])
        .map(({ a }) => ({
          delivery_id: deliveryId,
          item_id: a.ujemanje_id || null,
          // Surovina se vodi loceno - brez tega brisanje dobavnice ne bi
          // znalo vrniti zaloge surovine nazaj (20.8.2026).
          ingredient_id: a.ujemanje_ingredient_id || null,
          item_name: a.naziv,
          ean: a.ean || null,
          quantity: Number(a.kolicina || 0),
          unit: a.enota || 'kos',
          price_ex_vat: Number(a.cena_brez_ddv || 0),
          discount_pct: Number(a.popust_procent || 0),
          net_price_ex_vat: Number(a.neto_cena_brez_ddv || 0),
          vat_rate: Number(a.ddv_stopnja || 22),
          net_price_inc_vat: Number(a.neto_cena_z_ddv || 0),
          total_ex_vat: Number(a.vrednost_brez_ddv || 0),
          total_inc_vat: Number(a.vrednost_z_ddv || 0),
        }))
      if (vrstice.length > 0) {
        const { error: dlErr } = await sb.from('delivery_lines').insert(vrstice)
        if (dlErr) {
          console.error('Vrstic dobavnice ni bilo mogoce shraniti:', dlErr)
          setError('Zaloga je posodobljena, vrstic dobavnice pa NI bilo mogoče shraniti: ' + dlErr.message)
        }
      }
    }

    setLog(newLog); setStep('done'); setImporting(false)
  }

  return (
    <Modal open onClose={onClose} width={580}>
      <ModalHeader title="Uvoz dobavnice (AI)" onClose={onClose}/>
      <div style={{ padding:'20px 22px', maxHeight:'75vh', overflowY:'auto' }}>
        {step === 'upload' && (
          <div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:16 }}>Nalozi PDF dobavnico — AI bo samodejno prepoznal artikle, kolicine in cene.</div>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}}
            style={{ border:'2px dashed '+T.line, borderRadius:12, padding:40, textAlign:'center', cursor:'pointer', background:T.surface2 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>PDF</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Povleci PDF sem ali klikni za izbiro</div>
              <div style={{ fontSize:12, color:T.muted }}>PDF dobavnice ali racuni dobaviteljev</div>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0])}/>
            </div>
            {loading && <div style={{ marginTop:16, padding:'14px 16px', background:T.accentSoft, borderRadius:10, fontSize:13, color:T.accent }}>AI analizira dobavnico...</div>}
            {error && <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(168,50,50,0.1)', borderRadius:9, fontSize:13, color:T.danger }}>{error}</div>}
          </div>
        )}
        {step === 'preview' && result && (
          <div>
            <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:10, marginBottom:16, fontSize:13 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>{result.dobavitelj || 'Neznan dobavitelj'}</div>
              <div style={{ color:T.muted, display:'flex', gap:16 }}>
                {result.datum && <span>{result.datum}</span>}
                {result.stevilka && <span>St: {result.stevilka}</span>}
                {result.skupaj_z_ddv && <span>{eur(result.skupaj_z_ddv)}</span>}
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:10 }}>ARTIKLI ({result.artikli?.length || 0})</div>
            {/* PRENOVLJENO (20.8.2026): vsaka vrstica ima zdaj IZBIRNIK artikla.
                Prej je bilo ujemanje prepusceno AI - ce ga ni nasel, je pisalo
                samo "Nov artikel - dodaj rocno" in zaloga se ni premaknila.
                Pri eni dobavnici ni bila povezana NOBENA od 17 vrstic. */}
            {result.artikli?.map((a, i) => {
              const u = ujemanja[i] || {}
              const barvaZanesljivosti = u.vir === 'ai' || u.zanesljivost === 'visoka' ? T.accent
                : u.zanesljivost === 'srednja' ? T.warn : T.muted
              return (
              <div key={i} style={{ padding:'10px 12px', background:selected[i]?T.surface:T.surface3, borderRadius:10, marginBottom:6, border:'1px solid '+T.line, opacity:selected[i]?1:0.55 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="checkbox" checked={!!selected[i]} onChange={e=>setSelected(p=>({...p,[i]:e.target.checked}))} style={{ accentColor:T.accent, width:16, height:16 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.naziv}</div>
                    {a.ean && <div style={{ fontSize:10, color:T.muted, fontFamily:'monospace' }}>{a.ean}</div>}
                  </div>
                  <div style={{ textAlign:'right', fontSize:12, whiteSpace:'nowrap' }}>
                    <div style={{ fontWeight:700 }}>{a.kolicina} {a.enota || 'kos'}</div>
                    {a.neto_cena_brez_ddv && <div style={{ color:T.muted }}>{eur(a.neto_cena_brez_ddv)}</div>}
                  </div>
                </div>

                {selected[i] && (
                  <div style={{ marginTop:8, paddingLeft:26 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>Knjiži na:</span>
                      <select
                        value={u.itemId ? (u.vrsta === 'ingredient' ? 'ing:' : 'itm:') + u.itemId : ''}
                        onChange={e=>{
                          const v = e.target.value
                          // Iz vrednosti razberemo tudi VRSTO cilja - artikel
                          // in surovina sta v locenih tabelah (20.8.2026).
                          const jeSurovina = v.startsWith('ing:')
                          const cistId = v.replace(/^(ing|itm):/, '')
                          setUjemanja(p=>({ ...p, [i]: {
                            ...(p[i]||{}),
                            itemId: cistId || null,
                            vrsta: jeSurovina ? 'ingredient' : 'item',
                            vir: v === 'NOV' ? 'nov' : v === 'NOVA_SUROVINA' ? 'nova_surovina' : v ? 'rocno' : 'brez',
                            zanesljivost: 'visoka',
                          } }))
                        }}
                        style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'1px solid '+(u.itemId ? T.line : T.warn), fontFamily:'inherit', fontSize:12, background:T.inputBg, minWidth:0 }}>
                        <option value="">— ne knjiži (preskoči) —</option>
                        <option value="NOV">+ Ustvari nov artikel</option>
                        <option value="NOVA_SUROVINA">+ Ustvari novo surovino</option>
                        <optgroup label="Artikli">
                          {posData.items
                            .filter(it => it.item_type !== 'recipe' && it.item_type !== 'ingredient')
                            .map(it => (
                              <option key={it.id} value={'itm:' + it.id}>{it.name}</option>
                            ))}
                        </optgroup>
                        {(posData.ingredients || []).length > 0 && (
                          <optgroup label="Surovine">
                            {(posData.ingredients || []).map(ig => (
                              <option key={ig.id} value={'ing:' + ig.id}>{ig.name} ({ig.unit || 'kos'})</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <div style={{ fontSize:10, marginTop:4, color:barvaZanesljivosti }}>
                      {u.vir === 'ai' && '✓ prepoznal AI'}
                      {u.vir === 'predlog' && u.zanesljivost === 'visoka' && '✓ zanesljiv predlog'}
                      {u.vir === 'predlog' && u.zanesljivost === 'srednja' && '~ predlog — preverite'}
                      {u.vir === 'predlog' && u.zanesljivost === 'nizka' && '⚠ negotov predlog — preverite'}
                      {u.vir === 'rocno' && '✓ izbrali ste sami'}
                      {u.vir === 'nov' && '+ nastal bo nov artikel'}
                      {u.vir === 'nova_surovina' && '+ nastala bo nova surovina'}
                      {u.vrsta === 'ingredient' && u.itemId && u.vir !== 'nova_surovina' && ' · surovina'}
                      {u.vir === 'brez' && '⚠ zaloga se ne bo spremenila'}
                    </div>
                  </div>
                )}
              </div>
            )})}

            {/* Povzetek, da je pred uvozom jasno, kaj se bo zgodilo. */}
            {(() => {
              const izbrane = (result.artikli || []).map((_, i) => i).filter(i => selected[i])
              const jeNov = i => ujemanja[i]?.vir === 'nov' || ujemanja[i]?.vir === 'nova_surovina'
              const artikli = izbrane.filter(i => ujemanja[i]?.itemId && ujemanja[i]?.vrsta !== 'ingredient' && !jeNov(i)).length
              const surovine = izbrane.filter(i => ujemanja[i]?.itemId && ujemanja[i]?.vrsta === 'ingredient' && !jeNov(i)).length
              const novi = izbrane.filter(i => jeNov(i)).length
              const brez = izbrane.filter(i => !ujemanja[i]?.itemId && !jeNov(i)).length
              return (
                <div style={{ marginTop:12, padding:'10px 12px', background:T.surface2, borderRadius:9, fontSize:12, lineHeight:1.6 }}>
                  {artikli > 0 && <div><strong>{artikli}</strong> {artikli === 1 ? 'artiklu' : 'artiklom'} se bo povečala zaloga</div>}
                  {surovine > 0 && <div><strong>{surovine}</strong> {surovine === 1 ? 'surovini' : 'surovinam'} se bo povečala zaloga</div>}
                  {novi > 0 && <div><strong>{novi}</strong> {novi === 1 ? 'bo nastal na novo' : 'jih bo nastalo na novo'}</div>}
                  {brez > 0 && <div style={{ color:T.warn }}><strong>{brez}</strong> brez knjiženja — zaloga se ne bo spremenila</div>}
                  {artikli + surovine + novi === 0 && <div style={{ color:T.warn }}>Nobena vrstica ne bo poknjižena.</div>}
                </div>
              )
            })()}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={()=>setStep('upload')} style={btnS}>Nazaj</button>
              <button onClick={doImport} disabled={importing} style={{ ...btnP, opacity:importing?0.7:1 }}>
                {importing ? 'Uvazam...' : 'Uvozi ' + Object.values(selected).filter(Boolean).length + ' artiklov'}
              </button>
            </div>
          </div>
        )}
        {step === 'done' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:16 }}>Uvoz zakljucen</div>
            {log.map((l, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, marginBottom:5, background:l.ok?T.accentSoft:'rgba(168,50,50,0.08)' }}>
                <span>{l.ok ? 'OK' : 'X'}</span>
                <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:600 }}>{l.name}</div><div style={{ fontSize:11, color:T.muted }}>{l.msg}</div></div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={onImported} style={btnP}>Zapri in osvezi</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function InventoryScreen({ posData }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('items')
  const [filter, setFilter] = useState('vse') // vse | nizko | razprodano
  const [sort, setSort] = useState('name') // name | stock | value | sold
  const [selectedItem, setSelectedItem] = useState(null)
  const [salesData, setSalesData] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const [dobavnicaModal, setDobavnicaModal] = useState(false)
  const [deliveries, setDeliveries] = useState([])
  const [deliveriesLoaded, setDeliveriesLoaded] = useState(false)

  /**
   * Ponovno nalozi dobavnice (20.8.2026).
   *
   * NAPAKA, ki jo to odpravlja: dobavnice so se nalozile SAMO enkrat (pogoj
   * `!deliveriesLoaded`), `posData.refresh()` pa osvezi artikle in surovine,
   * NE pa dobavnic. Po brisanju je zapis res izginil iz baze, seznam na
   * zaslonu pa je ostal star - videti je bilo, kot da brisanje ne deluje.
   */
  async function naloziDobavnice() {
    const { data } = await createClient().from('deliveries').select('*')
      .eq('business_id', BUSINESS_ID).order('document_date', { ascending: false })
    setDeliveries(data || [])
    setDeliveriesLoaded(true)
  }
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [deliveryLines, setDeliveryLines] = useState([])
  const [editModal, setEditModal] = useState(null)
  const [ingEditModal, setIngEditModal] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [itemModal, setItemModal] = useState(null)
  const [modifierGroups, setModifierGroups] = useState<any[]>([])
  const [itemModifierLinks, setItemModifierLinks] = useState<Record<string,string[]>>({})
  const [modGroupModal, setModGroupModal] = useState<any>(null) // {name, required, multi_select}

  const [saving, setSaving] = useState(false)
  const [invToast, setInvToast] = useState(null)

  const allItems = posData.items.filter(i => i.item_type !== 'ingredient')
  const allIngredients = posData.ingredients

  // Statistike za header
  /**
   * POPRAVLJENO (21.8.2026): filtri v zalogi niso delovali iz DVEH razlogov.
   *
   * 1. Pri ARTIKLIH je koda brala `min_stock`, ta stolpec pa v tabeli `items`
   *    NE OBSTAJA - pravi je `low_stock`. Vrednost je bila vedno undefined,
   *    zato pogoj `min_stock > 0` nikoli ni drzal in filter "Pod minimum" ni
   *    mogel vrniti nicesar. (Surovine `min_stock` imajo - tam je bilo prav.)
   *
   * 2. Stevilcni stolpci se iz baze pogosto vrnejo kot NIZ ("0.00"), zato
   *    `stock === 0` ni drzal, primerjava `<=` pa je delovala po abecedi.
   */
  const st = (v: any) => v === null || v === undefined || v === '' ? null : Number(v)
  const jePodMinimumom = (zaloga: any, minimum: any) => {
    const z = st(zaloga), m = st(minimum)
    return z !== null && m !== null && m > 0 && z <= m
  }
  const jeRazprodano = (zaloga: any) => {
    const z = st(zaloga)
    return z !== null && z === 0
  }

  const lowStock = allItems.filter(i => jePodMinimumom(i.stock, i.low_stock))
  const lowIngr = allIngredients.filter(i => jePodMinimumom(i.stock_qty, i.min_stock))
  const totalAlerts = lowStock.length + lowIngr.length
  // POPRAVLJENO (25.8.2026): tu se je zaokrozila SAMO vsota, v portalu pa
  // vsaka vrstica posebej - zato sta se vrednosti razhajali za nekaj centov
  // (550,02 proti 549,90). Za popis je merodajna vsota ZAOKROZENIH vrstic,
  // ker je to znesek, ki gre v knjige.
  const zaokrozi = (n: number) => Math.round(n * 100) / 100
  const totalValueItems = allItems.reduce((s,i) => s + zaokrozi((i.cost_price||0)*(i.stock||0)), 0)
  const totalValueIngr = allIngredients.reduce((s,i) => s + zaokrozi((i.cost_price||0)*(i.stock_qty||0)), 0)
  const totalValue = totalValueItems + totalValueIngr

  // Filtriraj in sortiraj
  let items = allItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  if (filter === 'nizko') items = items.filter(i => jePodMinimumom(i.stock, i.low_stock))
  if (filter === 'razprodano') items = items.filter(i => jeRazprodano(i.stock))
  if (sort === 'stock') items = [...items].sort((a,b) => (a.stock||0)-(b.stock||0))
  else if (sort === 'value') items = [...items].sort((a,b) => ((b.cost_price||0)*(b.stock||0))-((a.cost_price||0)*(a.stock||0)))
  else if (sort === 'sold') items = [...items].sort((a,b) => (salesData[b.id]||0)-(salesData[a.id]||0))
  else items = [...items].sort((a,b) => a.name.localeCompare(b.name))

  let ingredients = allIngredients.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  if (filter === 'nizko') ingredients = ingredients.filter(i => jePodMinimumom(i.stock_qty, i.min_stock))
  if (filter === 'razprodano') ingredients = ingredients.filter(i => jeRazprodano(i.stock_qty))

  // Naloži prodajne podatke za sortiranje
  useEffect(() => {
    async function loadSales() {
      const from = new Date(); from.setDate(from.getDate()-30)
      const { data } = await createClient()
        .from('order_lines')
        // POPRAVLJENO (19.8.2026): `orders.created_at` NE OBSTAJA (stolpci so
        // opened_at, closed_at, voided_at) - poizvedba je tiho odpovedala in
        // priporocila artiklov so ostala prazna.
        .select('name, qty, orders!inner(closed_at, status)')
        .eq('orders.status', 'paid')
        .gte('orders.closed_at', from.toISOString())
      if (!data) return
      const map = {}
      data.forEach(l => {
        const item = posData.items.find(i => i.name === l.name)
        if (item) map[item.id] = (map[item.id]||0) + Number(l.qty||1)
      })
      setSalesData(map)
        {!!selectedDelivery && (
          <Modal open onClose={()=>setSelectedDelivery(null)} width={700}>
            <ModalHeader title={(selectedDelivery.supplier||'Dobavnica')+' — '+(selectedDelivery.document_number||'')} onClose={()=>setSelectedDelivery(null)}/>
            <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
              <div style={{ display:'flex', gap:16, marginBottom:16, fontSize:13, color:T.muted }}>
                <span>Datum: {selectedDelivery.document_date}</span>
                <span>Skupaj: <b style={{ color:T.ink }}>€{Number(selectedDelivery.total_inc_vat||0).toFixed(2)}</b></span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                    {['Artikel','EAN','Količina','Cena brez DDV','Popust','Neto cena','DDV%','Vrednost'].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveryLines.length===0 ? (
                    <tr><td colSpan={8} style={{ padding:20, textAlign:'center', color:T.muted }}>Ni vrstic</td></tr>
                  ) : deliveryLines.map((l,i)=>(
                    <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{l.item_name||'—'}</td>
                      <td style={{ padding:'8px 10px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{l.ean||'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700 }}>{l.quantity} {l.unit||'kos'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12 }}>{l.price_ex_vat?'€'+Number(l.price_ex_vat).toFixed(4):'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.discount_pct?Number(l.discount_pct).toFixed(1)+'%':'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, fontSize:12 }}>{l.net_price_ex_vat?'€'+Number(l.net_price_ex_vat).toFixed(4):'—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.vat_rate}%</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>{l.total_inc_vat?'€'+Number(l.total_inc_vat).toFixed(2):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
        {invToast && (
          <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:invToast.ok?T.accent:T.danger, color:'#fff', padding:'10px 22px', borderRadius:10, fontWeight:600, fontSize:14, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.18)' }}>
            {invToast.msg}
          </div>
        )}
// ================================================================
    }
    loadSales()
  }, [])

  // Naloži zgodovino cen za izbran artikel
  useEffect(() => {
    if (!selectedItem) return
    async function loadHistory() {
      const { data } = await createClient()
        .from('price_history')
        .select('*')
        .eq('item_id', selectedItem.id)
        .order('recorded_at', { ascending: false })
        .limit(10)
      if (data) setPriceHistory(h => ({ ...h, [selectedItem.id]: data }))
    }
    loadHistory()
  }, [selectedItem])

  // Posodobi nabavno ceno in zapiši v zgodovino
  async function updateCostPrice(item, newPrice) {
    const price = parseFloat(newPrice)
    if (isNaN(price) || price < 0) return
    const db = createClient()
    const { error: cpErr } = await db.from('ingredients').update({ cost_price: price }).eq('id', item.id)
    if (cpErr) { showInvToast('Nabavne cene ni bilo mogoče shraniti: ' + cpErr.message, false); return }
    // Zapiši v zgodovino
    const { error: phErr } = await db.from('price_history').insert({
      item_id: item.id,
      item_name: item.name,
      cost_price: price,
      recorded_at: new Date().toISOString(),
      business_id: BUSINESS_ID,
    }).select()
    // POPRAVLJENO (16.8.2026): prej brez preverbe - zgodovina cen se je tiho
    // ne zapisala, kar popaci kasnejso analizo nabavnih cen.
    if (phErr) console.error('Zgodovine cen ni bilo mogoce zapisati:', phErr)
    posData.refresh()
  }

  const margin = (item) => {
    if (!item.cost_price || !item.price) return null
    return ((item.price - item.cost_price) / item.price * 100).toFixed(0)
  }


  const realCategories = posData.categories.filter(c=>c.id!=='cat-fav')
  function showInvToast(msg, ok=true) { setInvToast({msg,ok}); setTimeout(()=>setInvToast(null),3000) }
  async function saveItem() {
    if (!itemModal?.name?.trim()) { showInvToast('Ime je obvezno',false); return }
    const itemType = itemModal?.item_type || 'simple'
    if (itemType !== 'ingredient' && (!itemModal.price || Number(itemModal.price)<=0)) { showInvToast('Prodajna cena mora biti > 0',false); return }
    if (itemModal.vat_rate===undefined || itemModal.vat_rate==='') { showInvToast('DDV stopnja je obvezna',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        business_id:BUSINESS_ID, category_id:itemModal.category_id||null,
        name:itemModal.name, code:itemModal.code||null,
        price:itemModal.price?Number(itemModal.price):0,
        unit:itemModal.unit||'kos', vat_rate:Number(itemModal.vat_rate),
        stock:itemModal.stock!=null&&itemModal.stock!==''?Number(itemModal.stock):null,
        fav:!!itemModal.fav, kitchen:!!itemModal.kitchen, bookable:!!itemModal.bookable,
        duration_min:itemModal.bookable&&itemModal.duration_min?Number(itemModal.duration_min):null,
        item_type: itemType, archived:false,
      }
      let savedId = itemModal.id
      if (itemModal.id) {
        const {error} = await createClient().from('items').update(payload).eq('id',itemModal.id)
        if (error) throw error
      } else {
        const {data, error} = await createClient().from('items').insert(payload).select().single()
        if (error) throw error
        savedId = data.id
      }
      if (itemType === 'recipe' && savedId) {
        const { error: recErr } = await createClient().from('item_ingredients').delete().eq('item_id', savedId)
        if (recErr) throw recErr
        const normLines = (itemModal.normativ||[]).filter(n=>n.ingredient_id&&n.qty_used)
        if (normLines.length > 0) {
          const {error} = await createClient().from('item_ingredients').insert(
            normLines.map(n=>({ item_id:savedId, ingredient_id:n.ingredient_id, qty_used:Number(n.qty_used) }))
          )
          if (error) throw error
        }
      }
      setItemModal(null); posData.refresh(); showInvToast(itemModal.id?'Artikel posodobljen':'Artikel dodan')
    } catch(e) { showInvToast(e.message,false) }
    setSaving(false)
  }
  /**
   * Brisanje surovine (20.8.2026).
   *
   * Surovino, ki je uporabljena v receptu artikla, NE brisemo brez opozorila -
   * artikel bi ostal z nedelujoco sestavino in obracun porabe bi bil napacen.
   */
  const [deliveryEdit, setDeliveryEdit] = useState(null)

  /**
   * Brisanje dobavnice (20.8.2026).
   *
   * ⚠️ Dobavnica je ob uvozu POVECALA zalogo. Ce bi jo samo izbrisali, bi
   * zaloga ostala napihnjena in inventura se ne bi ujemala. Zato kolicine
   * najprej odstejemo nazaj - in to SAMO za vrstice, ki so bile takrat
   * dejansko poknjizene (imajo item_id).
   */
  async function deleteDelivery(d) {
    const db = createClient()
    const { data: vrstice } = await db.from('delivery_lines')
      .select('item_id, ingredient_id, item_name, quantity').eq('delivery_id', d.id)

    const poknjizene = (vrstice || []).filter(v => v.item_id || v.ingredient_id)
    const opozorilo = poknjizene.length > 0
      ? `Izbrišem dobavnico ${d.document_number || ''} (${d.supplier || 'neznan dobavitelj'})?\n\n`
        + `Zaloga bo pri ${poknjizene.length} ${poknjizene.length === 1 ? 'artiklu' : 'artiklih'} zmanjšana nazaj za uvožene količine.`
      : `Izbrišem dobavnico ${d.document_number || ''} (${d.supplier || 'neznan dobavitelj'})?\n\n`
        + `Zaloge ni treba popravljati — nobena vrstica ni bila poknjižena na artikel.`
    if (!confirm(opozorilo)) return

    // 1. Razveljavi zalogo.
    const neuspeli = []
    for (const v of poknjizene) {
      // Surovina in artikel sta v LOCENIH tabelah, vsaka s svojo funkcijo.
      const { error } = v.ingredient_id
        ? await db.rpc('increment_ingredient_stock', {
            p_ingredient_id: v.ingredient_id,
            p_qty: -Number(v.quantity || 0),
          })
        : await db.rpc('increment_stock', {
            p_item_id: v.item_id,
            p_qty: -Number(v.quantity || 0),
          })
      if (error) neuspeli.push(v.item_name)
    }
    if (neuspeli.length > 0) {
      showInvToast('Zaloge ni bilo mogoče popraviti pri: ' + neuspeli.join(', ') + ' — dobavnica NI izbrisana', false)
      return
    }

    // 2. Sele nato vrstice in glavo.
    const { error: vErr } = await db.from('delivery_lines').delete().eq('delivery_id', d.id)
    if (vErr) { showInvToast('Vrstic dobavnice ni bilo mogoče izbrisati: ' + vErr.message, false); return }

    // `.select()` je nujen: Supabase NE javi napake, ce brisanje ne zadene
    // nobene vrstice (npr. zaradi varnostnih pravil). Brez tega bi uporabnik
    // videl potrditev, zapis pa bi ostal - ista past kot pri spremembi nacina
    // placila (prelet 37).
    const { data: izbrisano, error: gErr } = await db.from('deliveries')
      .delete().eq('id', d.id).select('id')
    if (gErr) { showInvToast('Dobavnice ni bilo mogoče izbrisati: ' + gErr.message, false); return }
    if (!izbrisano || izbrisano.length === 0) {
      showInvToast('Dobavnica ni bila izbrisana — nimate pravic ali je bila že odstranjena.', false)
      await naloziDobavnice()
      return
    }

    await naloziDobavnice()   // brez tega seznam ostane star (20.8.2026)
    posData.refresh()
    showInvToast(poknjizene.length > 0
      ? `Dobavnica izbrisana, zaloga popravljena pri ${poknjizene.length} artiklih`
      : 'Dobavnica izbrisana')
  }

  /** Urejanje podatkov dobavnice (dobavitelj, dokument, datum). */
  async function saveDeliveryEdit() {
    if (!deliveryEdit) return
    const { data: posodobljeno, error } = await createClient().from('deliveries').update({
      supplier: deliveryEdit.supplier?.trim() || null,
      document_number: deliveryEdit.document_number?.trim() || null,
      document_date: deliveryEdit.document_date || null,
    }).eq('id', deliveryEdit.id).select('id')
    if (error) { showInvToast('Dobavnice ni bilo mogoče shraniti: ' + error.message, false); return }
    if (!posodobljeno || posodobljeno.length === 0) {
      showInvToast('Sprememba ni bila shranjena — dobavnica ni bila najdena.', false); return
    }
    setDeliveryEdit(null)
    await naloziDobavnice()
    posData.refresh()
    showInvToast('Dobavnica posodobljena')
  }

  async function deleteIngredient(id, name) {
    const db = createClient()
    const { count } = await db.from('item_ingredients')
      .select('id', { count: 'exact', head: true }).eq('ingredient_id', id)

    const opozorilo = count && count > 0
      ? `Surovina "${name}" je uporabljena v ${count} ${count === 1 ? 'receptu' : 'receptih'}.\n\nČe jo izbrišete, bo iz njih odstranjena in obračun porabe za te artikle ne bo več pravilen.\n\nVseeno izbrišem?`
      : `Izbrišem surovino "${name}"?`
    if (!confirm(opozorilo)) return

    // Najprej povezave na recepte, sele nato surovino - sicer bi tuji kljuc
    // brisanje zavrnil.
    if (count && count > 0) {
      const { error: vezErr } = await db.from('item_ingredients').delete().eq('ingredient_id', id)
      if (vezErr) { showInvToast('Povezav na recepte ni bilo mogoče odstraniti: ' + vezErr.message, false); return }
    }
    // `.select()`: Supabase NE javi napake, ce brisanje ne zadene nobene vrstice (20.8.2026).
    const { data: brisIng, error } = await db.from('ingredients').delete().eq('id', id).select('id')
    if (error) { showInvToast('Surovine ni bilo mogoče izbrisati: ' + error.message, false); return }
    if (!brisIng || brisIng.length === 0) { showInvToast('Surovina ni bila izbrisana — nimate pravic ali je bila že odstranjena.', false); return }
    posData.refresh(); showInvToast('Surovina izbrisana')
  }

  /** Shranjevanje urejene surovine (20.8.2026). */
  const vnosStil = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' as any }

  async function saveIngEdit() {
    if (!ingEditModal) return
    if (!String(ingEditModal.name || '').trim()) { showInvToast('Ime surovine je obvezno', false); return }
    setEditSaving(true)
    try {
      const { error } = await createClient().from('ingredients').update({
        name: ingEditModal.name.trim(),
        unit: ingEditModal.unit || null,
        min_stock: ingEditModal.min_stock !== '' ? Number(ingEditModal.min_stock) : null,
        cost_price: ingEditModal.cost_price !== '' ? Number(ingEditModal.cost_price) : null,
        supplier: ingEditModal.supplier || null,
      }).eq('id', ingEditModal.id)
      if (error) throw error
      posData.refresh(); setIngEditModal(null); showInvToast('Surovina posodobljena')
    } catch (e) {
      showInvToast(e.message, false)
    }
    setEditSaving(false)
  }

  async function deleteItem(id, name) {
    if (!confirm(`Izbrišem artikel "${name}"?`)) return
    const { error: arcErr } = await createClient().from('items').update({archived:true}).eq('id',id)
    if (arcErr) { showInvToast('Artikla ni bilo mogoče izbrisati: ' + arcErr.message, false); return }
    posData.refresh(); showInvToast('Artikel izbrisan')
  }
  async function saveEdit() {
    if (!editModal) return
    setEditSaving(true)
    try {
      // POPRAVLJENO (16.8.2026): prej brez preverbe napake - uporabnik je videl
      // "Artikel posodobljen", tudi ce se v bazi ni nic spremenilo.
      const { error: editItemErr } = await createClient().from('items').update({
        name: editModal.name || undefined,
        price: editModal.price !== '' ? Number(editModal.price) : undefined,
        stock: editModal.stock !== '' ? Number(editModal.stock) : null,
        low_stock: editModal.min_stock !== '' ? Number(editModal.min_stock) : null,
        cost_price: editModal.cost_price !== '' ? Number(editModal.cost_price) : null,
      }).eq('id', editModal.id)
      if (editItemErr) throw editItemErr
      posData.refresh(); setEditModal(null)
      setInvToast({msg:'Artikel posodobljen',ok:true}); setTimeout(()=>setInvToast(null),3000)
    } catch(e) {
      setInvToast({msg:e.message,ok:false}); setTimeout(()=>setInvToast(null),3000)
    }
    setEditSaving(false)
  }
  async function exportInventory(items, ingredients) {
    const XLSX = await import('xlsx')
    const date = new Date().toLocaleDateString('sl-SI').replace(/\./g,'-')
    const itemRows = [['Artikel','Šifra','Kategorija','Prod. cena','Nab. cena','Zaloga','Min zaloga','Vrednost','DDV %'],...items.map(i=>[i.name,i.sku||'',i.category||'',i.price||0,i.cost_price||0,i.stock||0,i.low_stock||0,((i.cost_price||0)*(i.stock||0)).toFixed(2),i.vat_rate ?? 22])]
    const ingrRows = [['Surovina','Enota','Nab. cena','Zaloga','Min zaloga','Vrednost'],...ingredients.map(i=>[i.name,i.unit||'',i.cost_price||0,i.stock_qty||0,i.min_stock||0,((i.cost_price||0)*(i.stock_qty||0)).toFixed(2)])]
    const tI = items.reduce((s,i)=>s+(i.cost_price||0)*(i.stock||0),0)
    const tG = ingredients.reduce((s,i)=>s+(i.cost_price||0)*(i.stock_qty||0),0)
    const sumRows = [['INVENTURA'],['Datum:',date],[''],['Artikli',tI.toFixed(2)],['Surovine',tG.toFixed(2)],['SKUPAJ',(tI+tG).toFixed(2)]]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Artikli')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ingrRows), 'Surovine')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Skupaj')
    XLSX.writeFile(wb, 'inventura-'+date+'.xlsx')
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      {dobavnicaModal && <DobavnicaImportModal posData={posData} onClose={()=>setDobavnicaModal(false)} onImported={()=>{posData.refresh();setDobavnicaModal(false)}}/> }

      {/* Header statistike */}
      <div style={{ padding:'14px 20px', background:T.surface, borderBottom:'1px solid '+T.line }}>
        <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>ZALOGA</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{allItems.length + allIngredients.length} artiklov</div>
          </div>
          {totalAlerts > 0 && (
            <div onClick={()=>setFilter('nizko')} style={{ padding:'8px 14px', borderRadius:9, background:'rgba(168,50,50,0.1)', border:'1px solid rgba(168,50,50,0.2)', cursor:'pointer' }}>
              <div style={{ fontSize:10, color:T.danger, fontWeight:700, textTransform:'uppercase' }}>POD MINIMUM</div>
              <div style={{ fontSize:22, fontWeight:800, color:T.danger }}>{totalAlerts}</div>
              <div style={{ fontSize:11, color:T.danger }}>opozorila</div>
            </div>
          )}
          <div style={{ padding:'8px 14px', borderRadius:9, background:T.surface2, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>VREDNOST</div>
            <div style={{ fontSize:22, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{eur(totalValue)}</div>
            <div style={{ fontSize:11, color:T.muted }}>po nabavni</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={()=>setDobavnicaModal(true)} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:5 }}>Uvozi dobavnico</button>
            <button onClick={()=>exportInventory(allItems,allIngredients)} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
              <KI name="print" size={13}/> Izvozi
            </button>
            <button onClick={()=>setItemModal({vat_rate:9.5,unit:'kos',fav:false,kitchen:false,bookable:false})} style={{ ...btnP, fontSize:12 }}>
              + Nov artikel
            </button>
          </div>
        </div>

        {/* Tabi + filtri */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:9 }}>
            {[['items','Artikli'],['ingredients','Surovine'],['deliveries','Dobavnice']].map(([id,lbl])=>(
              <button key={id} onClick={()=>{setTab(id);setFilter('vse');if(id==='deliveries'&&!deliveriesLoaded){naloziDobavnice()}}} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:tab===id?T.header:'transparent', color:tab===id?T.headerInk:T.ink, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {[['vse','Vse'],['nizko','↓ Pod minimum'],['razprodano','Razprodano']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setFilter(id)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid '+(filter===id?T.accent:T.line), background:filter===id?T.accentSoft:'transparent', color:filter===id?T.accent:T.ink, fontWeight:filter===id?700:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
            ))}
          </div>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{ padding:'6px 10px', borderRadius:7, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit', background:T.surface, cursor:'pointer' }}>
            <option value="name">A–Z</option>
            <option value="stock">↑ Zaloga</option>
            <option value="value">↑ Vrednost</option>
            <option value="sold">↑ Najbolj prodajano (30d)</option>
          </select>
          <div style={{ position:'relative', flex:1, maxWidth:280 }}>
            <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={13}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči artikel ali šifro…" style={{ width:'100%', padding:'7px 10px 7px 30px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex:1, overflow:'auto' }}>
        {tab === 'items' && (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
              <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {['Artikel','Šifra','Prod. cena','Nab. cena','Stanje','Min','Vrednost','Status','Akcije'].map((h,i)=>(
                  <th key={i} style={{ padding:'11px 12px', textAlign:i>=2&&i<8?'right':i===8?'center':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it,idx)=>{
                const low = jePodMinimumom(it.stock, it.low_stock)
                const zero = it.stock === 0
                const value = (it.cost_price||0) * (it.stock||0)
                const m = margin(it)
                const sold30 = salesData[it.id] || 0
                return (
                  <tr key={it.id} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                        {it.name}
                        {/* DODANO (21.8.2026): oznaka NORMATIVA. Prej je artikel z
                            recepturo v seznamu izgledal enako kot navaden - iz
                            seznama se ni videlo, kateri artikli porabljajo
                            surovine in katerim se odsteva lastna zaloga. */}
                        {it.item_type === 'recipe' && (
                          <span title="Ob prodaji se odštejejo sestavine, ne ta artikel"
                            style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:T.accentSoft, color:T.accent, whiteSpace:'nowrap' }}>
                            NORMATIV
                          </span>
                        )}
                        {it.bookable && (
                          <span title="Storitev — rezervira se v koledarju"
                            style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:T.chipBg, color:T.muted, whiteSpace:'nowrap' }}>
                            STORITEV
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:10, color:T.muted, marginTop:2, display:'flex', gap:8 }}>
                        {sold30 > 0 && <span>📦 {sold30}× / 30d</span>}
                        {m !== null && <span style={{ color: Number(m)>50?T.accent:Number(m)>20?T.warn:T.danger }}>marža {m}%</span>}
                      </div>
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{it.code||'—'}</td>
                    <td style={{ ing:'10px 12px', textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums', fontSize:13 }}>{eur(it.price)}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, color:it.cost_price?T.ink:T.muted, fontVariantNumeric:'tabular-nums' }}>{it.cost_price?eur(it.cost_price):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums', color:zero?T.danger:low?T.warn:T.ink }}>
                      {it.stock===null?<span style={{ color:T.muted }}>∞</span>:it.stock}
                      <span style={{ fontSize:10, color:T.muted, fontWeight:400, marginLeft:3 }}>{it.unit||'kos'}</span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:T.muted, fontSize:12, fontVariantNumeric:'tabular-nums' }}>{it.low_stock||'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12, color:value>0?T.ink:T.muted }}>{value>0?eur(value):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, whiteSpace:'nowrap',
                        background: zero?'rgba(168,50,50,0.15)':low?'rgba(184,140,40,0.15)':T.accentSoft,
                        color: zero?T.danger:low?T.warn:T.accent, textTransform:'uppercase' }}>
                        {zero?'Razprodano':low?'Nizka zaloga':'V zalogi'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        <button onClick={()=>setEditModal({ id:it.id, name:it.name, price:it.price??'', stock:it.stock??'', min_stock:it.low_stock??'', cost_price:it.cost_price??'' })}
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✏️</button>
                        <button onClick={()=>setSelectedItem(selectedItem?.id===it.id?null:it)}
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+(selectedItem?.id===it.id?T.accent:T.line), background:selectedItem?.id===it.id?T.accentSoft:T.surface, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>📊</button>
                        {/* DODANO (20.8.2026): funkcija deleteItem() je ze
                            obstajala, a je ni bilo mogoce sprozit - gumba v
                            tabeli ni bilo. Artikla se torej ni dalo izbrisati. */}
                        <button onClick={()=>deleteItem(it.id, it.name)} title="Izbriši artikel"
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', color:T.danger }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {items.length===0 && <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni artiklov za izbran filter</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'deliveries' && (
          <div style={{ padding:'0 2px' }}>
            {deliveries.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, fontSize:13 }}>Še ni uvoženih dobavnic</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                    {/* POPRAVLJENO (20.8.2026): "1olid" namesto "1px solid" -
                        crta pod glavo tabele se sploh ni izrisala.
                        DODAN stolpec "Akcije": dobavnice ni bilo mogoce ne
                        urediti ne izbrisati, klik je odprl samo podrobnosti. */}
                    {['Datum','Dobavitelj','Dokument','Brez DDV','DDV','Z DDV','Akcije'].map((h,i)=>(
                      <th key={i} style={{ padding:'11px 12px', textAlign:i>=3&&i<6?'right':i===6?'center':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d,idx)=>(
                    <tr key={d.id} onClick={async()=>{setSelectedDelivery(d);const{data}=await createClient().from('delivery_lines').select('*').eq('delivery_id',d.id).order('id');setDeliveryLines(data||[])}} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
                      <td style={{ padding:'10px 12px', fontSize:13 }}>{d.document_date||'—'}</td>
                      <td style={{ padding:'10px 12px', fontWeight:600, fontSize:13 }}>{d.supplier||'—'}</td>
                      <td style={{ padding:'10px 12px', fontSize:12, color:T.muted, fontFamily:'monospace' }}>{d.document_number||'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{d.total_ex_vat?'€'+Number(d.total_ex_vat).toFixed(2):'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums', color:T.muted }}>{d.total_vat?'€'+Number(d.total_vat).toFixed(2):'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums' }}>{d.total_inc_vat?'€'+Number(d.total_inc_vat).toFixed(2):'—'}</td>
                      <td style={{ padding:'10px 12px', textAlign:'center', whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>setDeliveryEdit({ id:d.id, supplier:d.supplier||'', document_number:d.document_number||'', document_date:d.document_date||'' })}
                          title="Uredi podatke dobavnice"
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13 }}>✏️</button>
                        <button onClick={()=>deleteDelivery(d)}
                          title="Izbriši dobavnico"
                          style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, marginLeft:6, color:T.danger }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 'ingredients' && (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
              <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {['Surovina','Enota','Zaloga','Min','Nabavna cena','Vrednost','Status','Akcije'].map((h,i)=>(
                  <th key={i} style={{ padding:'11px 12px', textAlign:i>=2&&i<7?'right':i===7?'center':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ig,idx)=>{
                const low = jePodMinimumom(ig.stock_qty, ig.min_stock)
                const zero = ig.stock_qty === 0
                const value = (ig.cost_price||0) * (ig.stock_qty||0)
                return (
                  <tr key={ig.id} style={{ background:idx%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{ig.name}</div>
                      {ig.supplier && <div style={{ fontSize:11, color:T.muted }}>{ig.supplier}</div>}
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:12, color:T.muted }}>{ig.unit}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, fontSize:14, fontVariantNumeric:'tabular-nums', color:zero?T.danger:low?T.warn:T.ink }}>{ig.stock_qty??'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:T.muted, fontSize:12 }}>{ig.min_stock||'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                        {ig.cost_price ? eur(ig.cost_price) : '—'}
                        <button onClick={async()=>{const p=prompt(`Nova nabavna cena za ${ig.name} (${ig.unit}):`,ig.cost_price||'');if(p!==null)updateCostPrice(ig,p)}}
                          style={{ width:20, height:20, borderRadius:5, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>✏️</button>
                      </div>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums', color:value>0?T.ink:T.muted }}>{value>0?eur(value):'—'}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5,
                        background: zero?'rgba(168,50,50,0.15)':low?'rgba(184,140,40,0.15)':T.accentSoft,
                        color: zero?T.danger:low?T.warn:T.accent, textTransform:'uppercase' }}>
                        {zero?'Razprodano':low?'Nizka zaloga':'V zalogi'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>
                      <button onClick={async()=>{
                        const q=prompt(`Nova zaloga za ${ig.name} (${ig.unit}):`,ig.stock_qty)
                        if(q===null) return
                        // POPRAVLJENO (16.8.2026): prej brez preverbe vnosa (NaN) in napake
                        const qn = Number(String(q).replace(',','.'))
                        if(!isFinite(qn) || qn < 0) { alert('Vnesite veljavno število (npr. 12,5)'); return }
                        const { error } = await createClient().from('ingredients').update({stock_qty:qn}).eq('id',ig.id)
                        if(error) { alert('Zaloge ni bilo mogoče posodobiti: ' + error.message); return }
                        posData.refresh()
                      }}
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:14 }}
                        title="Popravi zalogo">+</button>
                      {/* DODANO (20.8.2026): surovine je bilo mogoce samo
                          DODATI - urejanja imena/enote/min. zaloge in brisanja
                          ni bilo nikjer. Zmotno vneseno surovino je bilo
                          mogoce le pustiti na seznamu. */}
                      <button onClick={()=>setIngEditModal({ id:ig.id, name:ig.name, unit:ig.unit||'', min_stock:ig.min_stock??'', cost_price:ig.cost_price??'', supplier:ig.supplier||'' })}
                        title="Uredi surovino"
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, marginLeft:6 }}>✏️</button>
                      <button onClick={()=>deleteIngredient(ig.id, ig.name)}
                        title="Izbriši surovino"
                        style={{ width:28, height:28, borderRadius:7, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontSize:13, marginLeft:6, color:T.danger }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
              {ingredients.length===0 && <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni surovin za izbran filter</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Mini statistika za izbran artikel */}
      {selectedItem && (
        <div style={{ borderTop:'2px solid '+T.accent, background:T.surface, padding:'16px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>📊 {selectedItem.name} — mini statistika</div>
            <button onClick={()=>setSelectedItem(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.muted, fontSize:18 }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              ['Prodano (30d)', salesData[selectedItem.id]||0, 'kos'],
              ['Prihodek (30d)', eur((salesData[selectedItem.id]||0)*selectedItem.price), ''],
              ['Marža', selectedItem.cost_price?margin(selectedItem)+'%':'N/A', ''],
              ['Zaloga vrednost', eur((selectedItem.cost_price||0)*(selectedItem.stock||0)), ''],
            ].map(([l,v,s])=>(
              <div key={String(l)} style={{ padding:'10px 12px', background:T.surface2, borderRadius:9, border:'1px solid '+T.line }}>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:800, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{v}</div>
                {s && <div style={{ fontSize:11, color:T.muted }}>{s}</div>}
              </div>
            ))}
          </div>
          {/* Zgodovina cen */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Zgodovina nabavnih cen</div>
            {(priceHistory[selectedItem.id]||[]).length === 0 ? (
              <div style={{ fontSize:12, color:T.muted }}>Ni zgodovine cen. Uredi nabavno ceno v Nastavitvah → Sestavine.</div>
            ) : (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {(priceHistory[selectedItem.id]||[]).map((h:any, i:number) => (
                  <div key={i} style={{ padding:'6px 10px', background:T.surface2, borderRadius:7, fontSize:12 }}>
                    <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{eur(h.cost_price)}</span>
                    <span style={{ color:T.muted, marginLeft:6 }}>{new Date(h.recorded_at).toLocaleDateString('sl-SI')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
        {/* DODANO (20.8.2026): urejanje surovine. Prej je bilo surovino mogoce
            samo DODATI - imena, enote, min. zaloge ali dobavitelja ni bilo
            mogoce popraviti, zmotno vnesene pa ne izbrisati. */}
        {/* Urejanje podatkov dobavnice (20.8.2026). */}
        {!!deliveryEdit && (
          <Modal open onClose={()=>setDeliveryEdit(null)} width={440}>
            <ModalHeader title="Uredi dobavnico" onClose={()=>setDeliveryEdit(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Dobavitelj">
                <input value={deliveryEdit.supplier||''} onChange={e=>setDeliveryEdit(p=>({...p,supplier:e.target.value}))} style={vnosStil}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Št. dokumenta">
                  <input value={deliveryEdit.document_number||''} onChange={e=>setDeliveryEdit(p=>({...p,document_number:e.target.value}))} style={vnosStil}/>
                </Field>
                <Field label="Datum">
                  <input type="date" value={deliveryEdit.document_date||''} onChange={e=>setDeliveryEdit(p=>({...p,document_date:e.target.value}))} style={vnosStil}/>
                </Field>
              </div>
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>
                Postavk in zneskov tu ni mogoče spreminjati — ti izhajajo iz uvožene
                dobavnice. Če so napačni, dobavnico izbrišite in uvozite znova.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={()=>setDeliveryEdit(null)} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Prekliči</button>
                <button onClick={saveDeliveryEdit} style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Shrani</button>
              </div>
            </div>
          </Modal>
        )}

        {!!ingEditModal && (
          <Modal open onClose={()=>setIngEditModal(null)} width={440}>
            <ModalHeader title={'Uredi surovino: ' + (ingEditModal.name||'')} onClose={()=>setIngEditModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Naziv surovine *">
                <input value={ingEditModal.name||''} onChange={e=>setIngEditModal(p=>({...p,name:e.target.value}))} style={vnosStil}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Enota">
                  <select value={ingEditModal.unit||''} onChange={e=>setIngEditModal(p=>({...p,unit:e.target.value}))} style={vnosStil}>
                    {['L','dL','mL','kg','g','kos'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Najnižja zaloga">
                  <input type="number" onFocus={e=>e.target.select()} value={ingEditModal.min_stock??''} onChange={e=>setIngEditModal(p=>({...p,min_stock:e.target.value}))} style={vnosStil}/>
                </Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* POPRAVLJENO (21.8.2026): oznaka ni povedala, NA KATERO ENOTO
                    se cena nanasa. Uporabnik je pri kavi v gramih vpisal 18
                    (misljeno 18 EUR/kg), program pa je to razumel kot 18 EUR
                    NA GRAM - vrednost zaloge 18.000 EUR namesto 18. */}
                <Field label={`Nabavna cena (€ / ${ingEditModal.unit || 'enoto'})`}>
                  <input type="number" step="0.0001" onFocus={e=>e.target.select()} value={ingEditModal.cost_price??''} onChange={e=>setIngEditModal(p=>({...p,cost_price:e.target.value}))} style={vnosStil}/>
                  {ingEditModal.cost_price && ingEditModal.stock_qty ? (
                    <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>
                      Vrednost zaloge: {eur(Number(ingEditModal.cost_price) * Number(ingEditModal.stock_qty || 0))}
                    </div>
                  ) : null}
                </Field>
                <Field label="Dobavitelj">
                  <input value={ingEditModal.supplier||''} onChange={e=>setIngEditModal(p=>({...p,supplier:e.target.value}))} style={vnosStil}/>
                </Field>
              </div>
              <div style={{ fontSize:11, color:T.muted }}>
                Zalogo popravite z gumbom <strong>+</strong> v preglednici — tako ostane zapis o spremembi.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={()=>setIngEditModal(null)} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Prekliči</button>
                <button onClick={saveIngEdit} style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Shrani</button>
              </div>
            </div>
          </Modal>
        )}

        {!!editModal && (
          <Modal open onClose={()=>setEditModal(null)} width={440}>
            <ModalHeader title={'Uredi: '+editModal.name} onClose={()=>setEditModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Naziv artikla">
                <input value={editModal.name||''} onChange={e=>setEditModal(p=>({...p,name:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Prodajna cena (EUR)">
                  <input type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={editModal.price??''} onChange={e=>setEditModal(p=>({...p,price:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
                <Field label="Nabavna cena (EUR)">
                  <input type="number" onFocus={e => e.target.select()} min="0" step="0.0001" value={editModal.cost_price??''} onChange={e=>setEditModal(p=>({...p,cost_price:e.target.value}))} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Zaloga">
                  <input type="number" onFocus={e => e.target.select()} min="0" value={editModal.stock??''} onChange={e=>setEditModal(p=>({...p,stock:e.target.value}))} placeholder="prazno = neomejeno" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
                <Field label="Min. zaloga">
                  <input type="number" onFocus={e => e.target.select()} min="0" value={editModal.min_stock??''} onChange={e=>setEditModal(p=>({...p,min_stock:e.target.value}))} placeholder="npr. 20" style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13, background:T.inputBg, outline:'none', boxSizing:'border-box' }}/>
                </Field>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                <button onClick={()=>setEditModal(null)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Prekliči</button>
                <button onClick={saveEdit} disabled={editSaving} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, opacity:editSaving?0.7:1 }}>{editSaving?'Shranjujem...':'Shrani'}</button>
              </div>
            </div>
          </Modal>
        )}
        {!!selectedDelivery && (
          <Modal open onClose={()=>setSelectedDelivery(null)} width={700}>
            <ModalHeader title={(selectedDelivery.supplier||'Dobavnica')+' - '+(selectedDelivery.document_number||'')} onClose={()=>setSelectedDelivery(null)}/>
            <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
              <div style={{ display:'flex', gap:16, marginBottom:16, fontSize:13, color:T.muted }}>
                <span>Datum: {selectedDelivery.document_date}</span>
                <span>Skupaj z DDV: <b style={{ color:T.ink }}>{Number(selectedDelivery.total_inc_vat||0).toFixed(2)} EUR</b></span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                    {['Artikel','EAN','Količina','Cena brez DDV','Popust','Neto cena','DDV%','Vrednost'].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveryLines.length===0 ? (
                    <tr><td colSpan={8} style={{ padding:20, textAlign:'center', color:T.muted }}>Ni vrstic</td></tr>
                  ) : deliveryLines.map((l,i)=>(
                    <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{l.item_name||'-'}</td>
                      <td style={{ padding:'8px 10px', fontSize:11, color:T.muted, fontFamily:'monospace' }}>{l.ean||'-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700 }}>{l.quantity} {l.unit||'kos'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12 }}>{l.price_ex_vat ? Number(l.price_ex_vat).toFixed(4)+' EUR' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.discount_pct ? Number(l.discount_pct).toFixed(1)+'%' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:600, fontSize:12 }}>{l.net_price_ex_vat ? Number(l.net_price_ex_vat).toFixed(4)+' EUR' : '-'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12, color:T.muted }}>{l.vat_rate}%</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:13 }}>{l.total_inc_vat ? Number(l.total_inc_vat).toFixed(2)+' EUR' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
        {invToast && (
          <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:invToast.ok?T.accent:T.danger, color:'#fff', padding:'10px 22px', borderRadius:10, fontWeight:600, fontSize:14, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.18)' }}>
            {invToast.msg}
          </div>
        )}
        {!!itemModal && (
          <Modal open onClose={()=>setItemModal(null)} width={520}>
            <ModalHeader title={itemModal?.id?'Uredi artikel':'Nov artikel'} onClose={()=>setItemModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'72vh', overflowY:'auto' }}>
              <Field label="Tip artikla *">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                  {[
                    { id:'simple', label:'Enostaven', desc:'Pivo, vstopnina, kava', icon:'🛍️' },
                    { id:'recipe', label:'Z normativom', desc:'Točeno vino, koktajl', icon:'🧪' },
                    { id:'ingredient', label:'Surovina', desc:'Vino 1L, moka 1kg', icon:'📦' },
                  ].map(t=>{
                    const sel = (itemModal?.item_type||'simple') === t.id
                    return (
                      <div key={t.id} onClick={()=>setItemModal(p=>({...p,item_type:t.id}))} style={{ padding:'10px 8px', borderRadius:9, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface }}>
                        <div style={{ fontSize:20 }}>{t.icon}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:sel?T.accent:T.ink, marginTop:4 }}>{t.label}</div>
                        <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{t.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </Field>
              <Field label="Ime artikla / storitve *">
                <input value={itemModal?.name||''} onChange={e=>setItemModal(p=>({...p,name:e.target.value}))} placeholder="Espresso, Masaža, Vstopnina..." style={inp} autoFocus/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {(itemModal?.item_type||'simple') !== 'ingredient' && (
                  <Field label="Prodajna cena (€) *">
                    <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
                  </Field>
                )}
                {(itemModal?.item_type||'simple') === 'ingredient' && (
                  <Field label="Nabavna cena (€)">
                    <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
                  </Field>
                )}
                <Field label="Enota">
                  <select value={itemModal?.unit||'kos'} onChange={e=>setItemModal(p=>({...p,unit:e.target.value}))} style={inp}>
                    {['kos','dl','cl','ml','L','g','kg','ura','paket','obisk','porcija'].map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
              </div>
              <VatExemptionPicker
                vatRate={itemModal?.vat_rate}
                code={itemModal?.vat_exemption_code}
                customText={itemModal?.vat_exemption_custom_text}
                onCodeChange={c => setItemModal(p => ({ ...p, vat_exemption_code: c }))}
                onCustomTextChange={t => setItemModal(p => ({ ...p, vat_exemption_custom_text: t }))}
                inputStyle={inp}
              />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="DDV stopnja *">
                  <select value={itemModal?.vat_rate??''} onChange={e=>setItemModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
                    <option value="">— izberi DDV —</option>
                    <option value={0}>0% (oproščeno)</option>
                    <option value={9.5}>9.5% (hrana, pijača)</option>
                    <option value={22}>22% (splošna)</option>
                  </select>
                </Field>
                <Field label="Šifra (koda)">
                  <input value={itemModal?.code||''} onChange={e=>setItemModal(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="K01" style={{...inp,fontFamily:'monospace'}}/>
                </Field>
              </div>
              {(itemModal?.item_type||'simple') !== 'ingredient' && (
                <Field label="Kategorija">
                  <select value={itemModal?.category_id||''} onChange={e=>setItemModal(p=>({...p,category_id:e.target.value||null}))} style={inp}>
                    <option value="">Brez kategorije</option>
                    {realCategories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label={(itemModal?.item_type||'simple')==='ingredient'?'Zaloga v skladišču':'Zaloga (pusti prazno za neomejeno)'}>
                <input type="number" onFocus={e => e.target.select()} min="0" value={itemModal?.stock??''} onChange={e=>setItemModal(p=>({...p,stock:e.target.value}))} placeholder="∞" style={inp}/>
              </Field>
              {/* Modifier grupe */}
              {(itemModal?.item_type||'simple') !== 'ingredient' && (
                <Field label="Modifier grupe (variante, dodatki)">
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {modifierGroups.map(mg => {
                      const linked = itemModal?.id ? (itemModifierLinks[itemModal.id]||[]).includes(mg.id) : (itemModal?._modLinks||[]).includes(mg.id)
                      return (
                        <div key={mg.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, background:linked?T.accentSoft:T.surface }}>
                          <input type="checkbox" checked={linked} onChange={async e => {
                            if (itemModal?.id) {
                              if (e.target.checked) {
                                const { error: linkErr } = await createClient().from('item_modifier_group_links').insert({ item_id: itemModal.id, group_id: mg.id })
                                if (linkErr) alert('Skupine ni bilo mogoče povezati z artiklom: ' + linkErr.message)
                              } else {
                                await createClient().from('item_modifier_group_links').delete().eq('item_id', itemModal.id).eq('group_id', mg.id)
                              }
                              const { data: linkData } = await createClient().from('item_modifier_group_links').select('item_id, group_id')
                              if (linkData) {
                                const links: Record<string,string[]> = {}
                                for (const l of linkData) { if (!links[l.item_id]) links[l.item_id] = []; links[l.item_id].push(l.group_id) }
                                setItemModifierLinks(links)
                              }
                            } else {
                              const cur = itemModal?._modLinks || []
                              setItemModal((p:any) => ({...p, _modLinks: e.target.checked ? [...cur, mg.id] : cur.filter((id:string) => id !== mg.id)}))
                            }
                          }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:12 }}>{mg.name} {mg.required?'(obvezno)':''} {mg.multi_select?'(več izbir)':''}</div>
                            <div style={{ fontSize:11, color:T.muted }}>{(mg.item_modifiers||[]).map((m:any) => m.name + (m.price_delta ? (m.price_delta>0?'+':'')+m.price_delta+'€' : '')).join(' · ')}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setModGroupModal({ id: mg.id, name: mg.name, required: mg.required, multi_select: mg.multi_select, modifiers: (mg.item_modifiers||[]).length > 0 ? mg.item_modifiers.map((m:any) => ({ id: m.id, name: m.name, price_delta: m.price_delta })) : [{name:'',price_delta:0}] }) }} style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, padding:4 }} title="Uredi">✏️</button>
                          <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`Izbrišem modifier grupo "${mg.name}"?`)) return; await createClient().from('item_modifier_group_links').delete().eq('group_id', mg.id); await createClient().from('item_modifiers').delete().eq('group_id', mg.id); await createClient().from('item_modifier_groups').delete().eq('id', mg.id); const { data: mg2 } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order'); setModifierGroups(mg2 || []) }} style={{ background:'none', border:'none', cursor:'pointer', color:T.danger, padding:4 }} title="Izbriši">🗑️</button>
                        </div>
                      )
                    })}
                    <button onClick={() => setModGroupModal({ name:'', required:false, multi_select:false, modifiers:[{name:'',price_delta:0}] })} style={{ ...btnS, fontSize:11, alignSelf:'flex-start' }}>+ Nova modifier grupa</button>
                  </div>
                </Field>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
                {itemModal?.id && <button onClick={()=>deleteItem(itemModal.id,itemModal.name)} style={{ ...btnS, color:T.danger }}>Izbriši</button>}
                <button onClick={()=>setItemModal(null)} style={btnS}>Prekliči</button>
                <button onClick={saveItem} disabled={saving} style={{ ...btnP, opacity:saving?0.7:1 }}>{saving?'Shranjujem...':'Shrani'}</button>
              </div>
            </div>
          </Modal>
        )}
        {/* Modifier Group Modal */}
        {!!modGroupModal && (
          <Modal open onClose={()=>setModGroupModal(null)} width={480}>
            <ModalHeader title="Nova modifier grupa" onClose={()=>setModGroupModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Ime grupe (npr. Mleko, Velikost, Dodatki)">
                <input value={modGroupModal.name} onChange={e=>setModGroupModal((p:any)=>({...p,name:e.target.value}))} placeholder="Mleko" style={inp} autoFocus/>
              </Field>
              <div style={{ display:'flex', gap:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={modGroupModal.required} onChange={e=>setModGroupModal((p:any)=>({...p,required:e.target.checked}))}/> Obvezna izbira
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={modGroupModal.multi_select} onChange={e=>setModGroupModal((p:any)=>({...p,multi_select:e.target.checked}))}/> Več izbir
                </label>
              </div>
              <Field label="Možnosti">
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {modGroupModal.modifiers.map((m:any, i:number) => (
                    <div key={i} style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <input value={m.name} onChange={e=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],name:e.target.value};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="npr. Ovseno" style={{...inp,flex:2}}/>
                      <input type="number" onFocus={e => e.target.select()} step="0.1" value={m.price_delta||''} onChange={e=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],price_delta:parseFloat(e.target.value)||0};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="+0.50" style={{...inp,flex:1,width:80}}/>
                      <button onClick={()=>{const ms=modGroupModal.modifiers.filter((_:any,j:number)=>j!==i);setModGroupModal((p:any)=>({...p,modifiers:ms}))}} style={{ color:T.danger, background:'none', border:'none', cursor:'pointer', fontSize:16 }}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>setModGroupModal((p:any)=>({...p,modifiers:[...p.modifiers,{name:'',price_delta:0}]}))} style={{ ...btnS, fontSize:11, alignSelf:'flex-start' }}>+ Dodaj možnost</button>
                </div>
              </Field>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>setModGroupModal(null)} style={btnS}>Prekliči</button>
                <button onClick={async()=>{
                  if (!modGroupModal.name.trim()) return
                  let groupId = modGroupModal.id
                  if (groupId) {
                    const { error: mgErr } = await createClient().from('item_modifier_groups').update({ name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).eq('id', groupId)
                    if (mgErr) { alert('Skupine ni bilo mogoče shraniti: ' + mgErr.message); return }
                    const { error: mdErr } = await createClient().from('item_modifiers').delete().eq('group_id', groupId)
                    if (mdErr) { alert('Starih doplačil ni bilo mogoče odstraniti: ' + mdErr.message); return }
                  } else {
                    const { data: mg } = await createClient().from('item_modifier_groups').insert({ business_id:BUSINESS_ID, name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).select().single()
                    groupId = mg?.id
                  }
                  if (groupId && modGroupModal.modifiers.filter((m:any)=>m.name).length > 0) {
                    await createClient().from('item_modifiers').insert(modGroupModal.modifiers.filter((m:any)=>m.name).map((m:any,i:number)=>({ group_id:groupId, name:m.name, price_delta:m.price_delta||0, sort_order:i })))
                  }
                  const { data: mgData } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order')
                  setModifierGroups(mgData || [])
                  setModGroupModal(null)
                }} style={btnP}>Shrani grupo</button>
              </div>
            </div>
          </Modal>
        )}
        {/* Modifier Group Modal */}
        {!!modGroupModal && (
          <Modal open onClose={()=>setModGroupModal(null)} width={480}>
            <ModalHeader title="Nova modifier grupa" onClose={()=>setModGroupModal(null)}/>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Ime grupe (npr. Mleko, Velikost, Dodatki)">
                <input value={modGroupModal.name} onChange={e=>setModGroupModal((p:any)=>({...p,name:e.target.value}))} placeholder="Mleko" style={inp} autoFocus/>
              </Field>
              <div style={{ display:'flex', gap:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={modGroupModal.required} onChange={e=>setModGroupModal((p:any)=>({...p,required:e.target.checked}))}/> Obvezna izbira
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={modGroupModal.multi_select} onChange={e=>setModGroupModal((p:any)=>({...p,multi_select:e.target.checked}))}/> Več izbir
                </label>
              </div>
              <Field label="Možnosti">
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {modGroupModal.modifiers.map((m:any, i:number) => (
                    <div key={i} style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <input value={m.name} onChange={e=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],name:e.target.value};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="npr. Ovseno" style={{...inp,flex:2}}/>
                      <input type="number" onFocus={e => e.target.select()} step="0.1" value={m.price_delta||''} onChange={e=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],price_delta:parseFloat(e.target.value)||0};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="+0.50" style={{...inp,flex:1,width:80}}/>
                      <button onClick={()=>{const ms=modGroupModal.modifiers.filter((_:any,j:number)=>j!==i);setModGroupModal((p:any)=>({...p,modifiers:ms}))}} style={{ color:T.danger, background:'none', border:'none', cursor:'pointer', fontSize:16 }}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>setModGroupModal((p:any)=>({...p,modifiers:[...p.modifiers,{name:'',price_delta:0}]}))} style={{ ...btnS, fontSize:11, alignSelf:'flex-start' }}>+ Dodaj možnost</button>
                </div>
              </Field>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>setModGroupModal(null)} style={btnS}>Prekliči</button>
                <button onClick={async()=>{
                  if (!modGroupModal.name.trim()) return
                  let groupId = modGroupModal.id
                  if (groupId) {
                    const { error: mgErr } = await createClient().from('item_modifier_groups').update({ name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).eq('id', groupId)
                    if (mgErr) { alert('Skupine ni bilo mogoče shraniti: ' + mgErr.message); return }
                    const { error: mdErr } = await createClient().from('item_modifiers').delete().eq('group_id', groupId)
                    if (mdErr) { alert('Starih doplačil ni bilo mogoče odstraniti: ' + mdErr.message); return }
                  } else {
                    const { data: mg } = await createClient().from('item_modifier_groups').insert({ business_id:BUSINESS_ID, name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).select().single()
                    groupId = mg?.id
                  }
                  if (groupId && modGroupModal.modifiers.filter((m:any)=>m.name).length > 0) {
                    await createClient().from('item_modifiers').insert(modGroupModal.modifiers.filter((m:any)=>m.name).map((m:any,i:number)=>({ group_id:groupId, name:m.name, price_delta:m.price_delta||0, sort_order:i })))
                  }
                  const { data: mgData } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order')
                  setModifierGroups(mgData || [])
                  setModGroupModal(null)
                }} style={btnP}>Shrani grupo</button>
              </div>
            </div>
          </Modal>
        )}
    </div>
  )
}


// ================================================================
// Z-REPORT MODAL — zaključek izmene
// ================================================================

// ─────────────────────────────────────────────────────────────────
// CASH SESSION HELPERS
// ─────────────────────────────────────────────────────────────────

async function printCashReceipt(html: string) {
  // Electron IPC (desktop app) — direktno, brez HTTP
  if (typeof window !== 'undefined' && (window as any).electronAPI?.printReceipt) {
    const result = await (window as any).electronAPI.printReceipt(html)
    if (result?.ok) return
    if (result?.error) alert('Napaka tiskalnika: ' + result.error)
    return
  }
  // Fallback: localhost print server
  try {
    const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
    if (res.ok) {
      const printRes = await fetch('http://localhost:6789/print/receipt', {
        // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
        // neodzivni storitvi visi, dokler je streznik sam ne prekine.
        signal: AbortSignal.timeout(3000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html })
      })
      if ((await printRes.json()).ok) return
    }
  } catch {}
  // Zadnji fallback: browser popup
  const w = window.open('about:blank', '_blank', 'width=380,height=700')
  if (!w) { alert('Tiskalnik ni dosegljiv. Preverite ali je Racunko POS app odprta.'); return }
  w.document.write(html)
  w.document.close()
}

// ─────────────────────────────────────────────────────────────────
// OTVORITEV BLAGAJNE MODAL
// ─────────────────────────────────────────────────────────────────

function OpenCashModal({ posData, auth, onClose, onOpened }) {
  const [cashAmount, setCashAmount] = React.useState('0.00')
  const [prenos, setPrenos] = React.useState<number | null>(null)
  const [note, setNote] = React.useState('')

  /**
   * PRENOS IZ PREJSNJE IZMENE (dodano 25.8.2026).
   *
   * Okno je predlagalo 0,00 EUR, cetudi je Z-porocilo v istem trenutku
   * javljalo "Prenos iz prejsnje izmene: 794,80 EUR". Dve okni sta si
   * nasprotovali, blagajnik pa je moral znesek prepisovati rocno.
   */
  React.useEffect(() => {
    ;(async () => {
      const { data } = await createClient()
        .from('z_reports')
        .select('cash_closing')
        .eq('business_id', BUSINESS_ID)
        .order('report_number', { ascending: false })
        .limit(1)
      const zadnji = Number(data?.[0]?.cash_closing ?? 0)
      if (zadnji > 0) { setPrenos(zadnji); setCashAmount(zadnji.toFixed(2)) }
    })()
  }, [])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  async function handleOpen() {
    const amount = parseFloat(cashAmount)
    if (isNaN(amount) || amount < 0) { setError('Vnesi veljavni znesek'); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      // POPRAVLJENO (13.8.2026, KRITICNO): dodan staffId (PRAVA PIN identiteta
      // iz auth.user, ne Supabase auth uporabnika naprave) - omogoca loceno
      // sejo za vsako osebo.
      const { session, error: err } = await openSession({
        cashOpening: amount,
        openedBy: user.id,
        staffId: auth.user?.id,
        note: note || undefined,
      })
      if (err) throw new Error(err)

      // Pridobi session number
      const { data: allSessions } = await db
        .from('cash_sessions')
        .select('id')
        .eq('business_id', BUSINESS_ID)
        .order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session!.id) + 1

      // Org za izpis
      const member = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      // POPRAVLJENO (16.8.2026): ime PIN-prijavljene osebe namesto predpone
      // e-naslova racuna.
      const cashierName = auth?.user?.name || ''

      // Natisni otvoritev
      const html = buildOpeningReceipt({
        session: session!,
        org: org || { name: 'Blagajna', tax_number: '', vat_registered: false },
        sessionNumber,
        cashierName,
      })
      await printCashReceipt(html)

      onOpened(session)
      onClose()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={360}>
      <ModalHeader title="Otvoritev blagajne" onClose={onClose}/>
      <div style={{ padding:'24px 20px', display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ background:T.accentSoft, borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:12, color:T.accent, fontWeight:700, marginBottom:2 }}>💰 Začetna gotovina</div>
          <div style={{ fontSize:11, color:T.muted }}>Preštej gotovino v blagajni in vnesi znesek</div>
        </div>

        <div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Znesek v blagajni (€)</div>
          {prenos !== null && (
            <div style={{ fontSize:11, color:T.accent, marginBottom:6 }}>
              Prevzeto iz prejšnje izmene: {eur(prenos)} — popravite, če ste prešteli drugače.
            </div>
          )}
          <input
            type="number" onFocus={e => e.target.select()}
            min="0"
            step="0.01"
            value={cashAmount}
            onChange={e => setCashAmount(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
            autoFocus
          />
        </div>

        <div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Opomba (opcijsko)</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="npr. manjkal drobiž..."
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
          />
        </div>

        {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
          <button onClick={handleOpen} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {saving ? 'Odpiranje...' : '🔓 Odpri blagajno'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// X-POROČILO MODAL (vmesno stanje)
// ─────────────────────────────────────────────────────────────────

function VmesnoStanjeModal({ session, posData, auth, onClose }) {
  const [stats, setStats] = React.useState<SessionStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [printing, setPrinting] = React.useState(false)

  React.useEffect(() => {
    getSessionStats(session).then(s => { setStats(s); setLoading(false) })
  }, [])

  async function handlePrint() {
    if (!stats) return
    setPrinting(true)
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      const member = user ? await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) : null // POPRAVLJENO 16.8.2026: vec-org varno
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const { data: allSessions } = await createClient().from('cash_sessions').select('id').eq('business_id', BUSINESS_ID).order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session.id) + 1
      const cashierName = auth?.user?.name || ''

      const html = buildXReportReceipt({
        session,
        stats,
        org: org || { name: 'Blagajna', tax_number: '', vat_registered: false },
        sessionNumber,
        cashierName,
      })
      await printCashReceipt(html)
    } catch (e: any) { alert(e.message) }
    setPrinting(false)
  }

  const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',')

  return (
    <Modal open onClose={onClose} width={400}>
      <ModalHeader title="Vmesno stanje blagajne" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:12 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:20, color:T.muted }}>Nalagam...</div>
        ) : stats ? (<>
          <div style={{ background:T.surface, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:T.muted }}>Izmena odprta</div>
            <div style={{ fontSize:13, fontWeight:700 }}>{new Date(session.opened_at).toLocaleString('sl-SI')}</div>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1 }}>Promet po plačilu</div>
          {[['Gotovina', stats.cash, stats.cashCount], ['Kartica', stats.card, stats.cardCount], ['Bon', stats.bon, stats.bonCount]].map(([label, amt, cnt]) => (
            <div key={label as string} style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span>{label as string}</span>
              <span style={{ fontWeight:600 }}>{eur(amt as number)} <span style={{ color:T.muted, fontSize:11 }}>({cnt as number})</span></span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, borderTop:'2px solid '+T.line, paddingTop:8 }}>
            <span>SKUPAJ</span>
            <span>{eur(stats.totalRevenue)}</span>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1, marginTop:4 }}>Pričakovana gotovina</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, background:T.accentSoft, padding:'10px 12px', borderRadius:8 }}>
            <span>V blagajni naj bo:</span>
            <span style={{ color:T.accent }}>{eur(stats.cashExpected)}</span>
          </div>
        </>) : <div style={{ color:T.danger }}>Napaka pri nalaganju</div>}

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Zapri</button>
          <button onClick={handlePrint} disabled={printing || loading} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {printing ? 'Tiskam...' : '🖨️ Natisni'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// ZAKLJUČEK BLAGAJNE MODAL
// ─────────────────────────────────────────────────────────────────

function CloseCashModal({ session, posData, auth, onClose, onClosed }) {
  const [stats, setStats] = React.useState<SessionStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [cashDeclared, setCashDeclared] = React.useState('0.00')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    getSessionStats(session).then(s => {
      setStats(s)
      // POPRAVLJENO (25.8.2026): polje "Presteto v blagajni" se je predizpolnilo
      // s PRICAKOVANIM zneskom. To vabi k slepemu potrjevanju namesto k
      // stetju - razlika, ki je bistvo zakljucka, se tako nikoli ne pokaze.
      // Pricakovani znesek je izpisan zraven, vpise pa uporabnik presteto.
      setCashDeclared('')
      setLoading(false)
    })
  }, [])

  const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',')
  const declared = parseFloat(cashDeclared) || 0
  const expected = stats?.cashExpected || 0
  const difference = declared - expected
  const diffLabel = Math.abs(difference) < 0.01 ? 'Ujema se ✓' : difference > 0 ? `+${eur(difference)} (višek)` : `−${eur(Math.abs(difference))} (manjko)`
  const diffColor = Math.abs(difference) < 0.01 ? T.accent : difference > 0 ? '#2563eb' : T.danger

  async function handleClose() {
    // DODANO (17.8.2026): zastavica mora biti VIDNA tudi v obravnavi napake,
    // zato je deklarirana pred pastjo. Pove, ali je bilo BISTVO (zapis izmene
    // in Z-porocila) ze opravljeno - takrat napaka v pomoznem koraku ne sme
    // izgledati kot padec celotnega zakljucka.
    let zakljucekUspel = false
    if (!stats) return

    // DODANO (25.8.2026): VELIKA RAZLIKA zahteva potrditev.
    //
    // Prej je bilo mogoce izmeno zakljuciti z manjkom v visini CELE blagajne
    // (pri preizkusu 898,40 EUR) tako hitro, kot bi jo zakljucil pravilno -
    // brez enega samega opozorila. Najpogostejsi vzrok ni tatvina, ampak
    // znesek, vpisan v napacno polje.
    const mejaOpozorila = Math.max(20, expected * 0.05)
    if (Math.abs(difference) > mejaOpozorila) {
      const smer = difference < 0 ? 'MANJKO' : 'VIŠEK'
      if (!confirm(
        `${smer}: ${eur(Math.abs(difference))}\n\n`
        + `Pričakovano: ${eur(expected)}\n`
        + `Prešteto: ${eur(declared)}\n\n`
        + 'Preverite, ali je znesek vpisan v pravo polje. '
        + 'Zaključim izmeno s to razliko?'
      )) return
    }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      // DODANO (16.8.2026): opozorilo na ODPRTE racune. Prej je bilo mogoce
      // zakljuciti dan z odprto mizo - racun je ostal neplacan in nevidoma
      // visel naprej, promet pa ni bil zajet v Z-porocilu.
      const { data: odprti } = await createClient()
        .from('orders')
        .select('id, total, tables(name)')
        .eq('business_id', BUSINESS_ID)
        .in('status', ['open','on_hold'])
      if (odprti?.length) {
        const skupaj = odprti.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
        const seznam = odprti.slice(0, 5).map((o: any) => '• ' + (o.tables?.name || 'brez mize') + ' — €' + Number(o.total || 0).toFixed(2)).join('\n')
        const vec = odprti.length > 5 ? `\n… in še ${odprti.length - 5}` : ''
        if (!confirm(`Pozor: ${odprti.length} računov je še odprtih (skupaj €${skupaj.toFixed(2)}):\n\n${seznam}${vec}\n\nTi računi NE bodo zajeti v Z-poročilu. Vseeno zaključim blagajno?`)) {
          setSaving(false)
          return
        }
      }

      // POPRAVLJENO (17.8.2026): cas zakljucka je definiran TU, pred vsemi
      // uporabami. Prej se je spodaj uporabljal "updatedSession", ki je nastal
      // sele pozneje, zato je prenos prometa v knjigo prihodkov vedno padel z
      // napako "Cannot access before initialization" - in ker se je zapisala
      // samo v konzolo, tega nihce ni opazil.
      const casZakljucka = new Date().toISOString()

      // POPRAVLJENO (13.8.2026, KRITICNO): closedBy uporablja PRAVO PIN
      // identiteto (auth.user) za Z-porocilo staff_id - prej Supabase auth
      // uporabnika naprave, zato je Z-porocilo vedno beleZilo napacno osebo
      // kot tistega, ki je zakljucil izmeno.
      const { zReportNumber, difference: diff, error: err } = await closeSession({
        session,
        cashClosingDeclared: declared,
        closedBy: auth.user?.id || user.id,
        note: note || undefined,
      })
      if (err) throw new Error(err)

      // DODANO (17.8.2026): od tu naprej je BISTVO opravljeno - izmena je
      // zaprta in Z-porocilo zapisano v bazi. Vse nadaljnje (prenos v knjigo,
      // izpis, e-posta) so POMOZNI koraki.
      //
      // Prej je bila vsa ta koda v eni sami pasti za napake: ce je padel
      // katerikoli pomozni korak, je vmesnik prikazal celoten zakljucek kot
      // NEUSPEL - cetudi sta bila izmena in Z-porocilo ze shranjena.
      // Blagajnik bi ob tem poskusil zakljuciti znova, kar ni mogoce in ni
      // potrebno. Zdaj napaka v pomoznem koraku ne razveljavi videza uspeha.
      zakljucekUspel = true

      // Pridobi org za izpis
      const member = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      // Prenesi dnevni promet POS blagajne v KPO knjigo (izdelki/storitve loceno)
      if (member) {
        try {
          // POPRAVLJENO (16.8.2026): posredujemo blagajnika seje, da se ob
          // hkratnih sejah vec blagajnikov isti promet ne knjizi veckrat.
          await pos.orders.syncSessionToKPO(member.org_id, session.opened_at, casZakljucka, session.staff_id)

          // DODANO (17.8.2026): oznaci Z-porocilo kot preneseno.
          //
          // Prej se ta zastavica ni posodobila NIKOLI ob samodejnem prenosu -
          // ostala je "false", cetudi je prenos uspel. Sama po sebi to ni
          // motilo, postane pa nevarna v trenutku, ko bi kdo dodal ponovni
          // poskus neuspelih prenosov ali gumb "poslji se enkrat": ta bi videl
          // "false" in promet knjizil DRUGIC.
          //
          // Zastavica zdaj odraza resnicno stanje.
          const { error: zFlagErr } = await createClient()
            .from('z_reports')
            .update({ sent_to_racunko: true })
            .eq('business_id', BUSINESS_ID)
            .eq('report_number', zReportNumber)
          if (zFlagErr) console.warn('Oznake prenosa Z-poročila ni bilo mogoče shraniti:', zFlagErr)
        } catch (kpoErr: any) {
          console.warn('KPO sinhronizacija ni uspela:', kpoErr)
        }
      }
      const { data: allSessions } = await createClient().from('cash_sessions').select('id').eq('business_id', BUSINESS_ID).order('created_at', { ascending: true })
      const sessionNumber = (allSessions || []).findIndex(s => s.id === session.id) + 1
      const cashierName = auth?.user?.name || ''

      // Natisni Z-poročilo
      const updatedSession = { ...session, closed_at: casZakljucka, closing_note: note }
      const html = buildZReportReceipt({
        session: updatedSession as any,
        stats,
        org: org || { name: 'Blagajna', tax_number: '', vat_registered: false },
        zReportNumber: zReportNumber!,
        cashierName,
        cashClosingDeclared: declared,
      })
      await printCashReceipt(html)

      // Pošlji email
      // POPRAVLJENO (14.8.2026, KRITICNO): 'org' spremenljivka NIKOLI ni bila
      // definirana v tem obsegu - vsak zakljucek blagajne je povzrocil
      // ReferenceError, ki se je tiho ujel (try/catch), zaradi cesar VSE po
      // tej tocki (setSaved, zapiranje modala) NI NIKOLI izvedlo. Prav tako
      // je staff.email polje, ki ne obstaja v bazi (staff tabela nima email
      // stolpca) - ownerEmail je bil VEDNO undefined. Uporabimo user.email,
      // ki je ze zanesljivo pridobljen zgoraj v tej isti funkciji.
      if (user?.email) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            subject: `Z-poročilo #${zReportNumber} — ${new Date().toLocaleDateString('sl-SI')}`,
            html,
          })
        }).catch(() => {})
      }

      setSaved(true)
      setTimeout(() => { onClosed(); onClose() }, 1500)
    } catch (e: any) {
      // POPRAVLJENO (17.8.2026): ce je bilo BISTVO ze opravljeno (izmena zaprta,
      // Z-porocilo zapisano), napake NE prikazemo kot padec zakljucka. Prej je
      // padec pomoznega koraka - na primer prenosa v knjigo - prikazal celoten
      // zakljucek kot neuspel, cetudi je bil ze zapisan. Blagajnik bi ob tem
      // poskusil zakljuciti znova, kar ni mogoce in ni potrebno.
      if (zakljucekUspel) {
        console.warn('Zaključek je uspel, pomožni korak pa ne:', e)
        alert(
          'Blagajna je zaključena in Z-poročilo je shranjeno.\n\n' +
          'Ni pa uspelo: ' + (e?.message || 'zadnji korak') + '\n\n' +
          'Zaključka NE ponavljajte — izmena je že zaprta.'
        )
        onClosed?.()
        onClose?.()
      } else {
        setError(e.message)
      }
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={420}>
      <ModalHeader title="Zaključek blagajne" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:20, color:T.muted }}>Nalagam...</div>
        ) : saved ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Blagajna zaključena</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Z-poročilo natisnjeno</div>
          </div>
        ) : stats ? (<>
          <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px', fontSize:12, color:T.muted }}>
            Izmena: {new Date(session.opened_at).toLocaleString('sl-SI')} – zdaj
          </div>

          {/* POPRAVLJENO (25.8.2026): pisalo je "Promet dneva", izmena pa lahko
              tece vec dni (pri preizkusu 117 ur). Obseg je od zadnjega
              zakljucka, ne od polnoci. */}
          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1 }}>Promet izmene</div>
          {[['Gotovina', stats.cash, stats.cashCount], ['Kartica', stats.card, stats.cardCount], ['Bon', stats.bon, stats.bonCount]].map(([label, amt, cnt]) => (
            <div key={label as string} style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span>{label as string}</span>
              <span style={{ fontWeight:600 }}>{eur(amt as number)} <span style={{ color:T.muted, fontSize:11 }}>({cnt as number})</span></span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, borderTop:'2px solid '+T.line, paddingTop:8 }}>
            <span>SKUPAJ</span><span>{eur(stats.totalRevenue)}</span>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:1, marginTop:4 }}>Izračun gotovine</div>
          <div style={{ background:T.surface, borderRadius:8, padding:'10px 12px', fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}><span>Začetna:</span><span>{eur(Number(session.cash_opening))}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between' }}><span>+ Gotovinski računi:</span><span>{eur(stats.cash)}</span></div>
            {stats.refundTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between' }}><span>− Vračila:</span><span>{eur(stats.refundTotal)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'1px solid '+T.line, marginTop:6, paddingTop:6 }}>
              <span>Pričakovano v blagajni:</span><span>{eur(expected)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Prešteto v blagajni (€)</div>
            <input
              type="number" onFocus={e => e.target.select()} min="0" step="0.01"
              value={cashDeclared}
              onChange={e => setCashDeclared(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
            />
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, padding:'10px 12px', background:'rgba(0,0,0,0.04)', borderRadius:8 }}>
            <span>Razlika:</span>
            <span style={{ color:diffColor }}>{diffLabel}</span>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Opomba (opcijsko)</div>
            <input
              type="text" value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="npr. manjkalo 5€, oddano v sef..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleClose} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.danger, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Zaključujem...' : '🔒 Zaključi blagajno'}
            </button>
          </div>
        </>) : <div style={{ color:T.danger }}>Napaka pri nalaganju</div>}
      </div>
    </Modal>
  )
}

function ZReportModal({ posData, onClose }) {
  // Podatki podjetja za Z-porocilo - prej trdo zapisani.
  const pp = podatkiPodjetja(posData?.org || { name: posData?.businessName })
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [cashOpening, setCashOpening] = useState('0')
  const [carryOver, setCarryOver] = useState<number|null>(null)
  React.useEffect(() => {
    getLastCarryOver().then(v => {
      if (v !== null) {
        setCarryOver(v)
        setCashOpening(v.toFixed(2))
      }
    })
  }, [])
  const [cashClosing, setCashClosing] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reportNumber, setReportNumber] = useState(1)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const db = createClient()
    const today = new Date()

    // POPRAVLJENO (21.8.2026): Z-porocilo je zajemalo CEL DAN, ne izmene.
    // Ce si blagajno zakljucil dvakrat v istem dnevu, je drugo porocilo
    // ponovilo ves promet prvega - podvojen davcni dokument. Zdaj izmena
    // tece od zadnjega zakljucka naprej.
    const { data: zadnjeZ } = await db
      .from('z_reports')
      .select('closed_at, cash_closing')
      .eq('business_id', BUSINESS_ID)
      .order('report_number', { ascending: false })
      .limit(1)

    const zacetekIzmene = zadnjeZ?.[0]?.closed_at
      ? new Date(zadnjeZ[0].closed_at)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate())

    // Prenos gotovine iz prejsnje izmene - doslej je vedno pisalo 0,00,
    // ceprav je prejsnje porocilo prenos izrecno priporocilo.
    const prenosIzPrejsnje = Number(zadnjeZ?.[0]?.cash_closing ?? 0)

    const from = zacetekIzmene
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    // Naloži naročila danes
    const { data: orders } = await db
      .from('orders')
      // POPRAVLJENO (19.8.2026): dve napaki v eni poizvedbi.
      // 1) `created_at` v tabeli `orders` NE OBSTAJA (stolpci so opened_at,
      //    closed_at, voided_at) - poizvedba je odpovedala in Z-poročilo je
      //    dobilo prazen seznam naročil.
      // 2) `payments.tip` prav tako ne obstaja.
      // Za dnevni zaključek je pravi stolpec closed_at (kdaj je bil račun
      // zaključen), ne kdaj je bila miza odprta.
      // DODANO (21.8.2026): tudi POSTAVKE, da lahko izracunamo DDV po stopnjah.
      // Z-porocilo ga doslej sploh ni imelo - niti v prikazu niti v bazi,
      // ceprav stolpci `total_vat_22`, `total_vat_95` in osnove obstajajo.
      // Racunovodja za DDV obracun potrebuje prav to razclenitev.
      .select('id, closed_at, payments(amount, method), order_lines(qty, unit_price, total, vat_rate, voided)')
      .eq('business_id', BUSINESS_ID)
      .eq('status', 'paid')
      .gte('closed_at', from.toISOString())
      .lte('closed_at', to.toISOString())

    // Naloži vračila danes
    const { data: refunds } = await db
      .from('refunds')
      .select('amount')
      .eq('business_id', BUSINESS_ID)
      // POPRAVLJENO (19.8.2026): tabela `refunds` nima stolpca `created_at` -
      // pravi je `refunded_at`. Poizvedba je odpovedala in vracila so tiho
      // izpadla iz Z-porocila: dnevni zakljucek je kazal previsok promet.
      .gte('refunded_at', from.toISOString())
      .lte('refunded_at', to.toISOString())

    // Pridobi zadnjo Z-poročilo številko
    const { data: lastZ } = await db
      .from('z_reports')
      .select('report_number')
      .eq('business_id', BUSINESS_ID)
      .order('report_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    setReportNumber((lastZ?.report_number || 0) + 1)

    // Izračuni
    let cash = 0, card = 0, bon = 0, other = 0, tips = 0
    const ords = orders || []

    // DDV PO STOPNJAH (21.8.2026) — doslej ga Z-poročilo sploh ni imelo.
    // Vsaka postavka nosi svojo stopnjo; cena je BRUTO, zato osnovo dobimo
    // z deljenjem, ne z množenjem.
    const poStopnji = new Map<number, { osnova: number; ddv: number }>()

    ords.forEach(o => {
      ;(o.payments || []).forEach(p => {
        const amt = Number(p.amount || 0)
        // Napitnin tabela `payments` ne beleži (prej bran neobstoječi p.tip).
        const tip = 0
        tips += tip
        if (p.method === 'cash') cash += amt
        else if (p.method === 'card') card += amt
        else if (p.method === 'bon') bon += amt
        else other += amt
      })

      ;(o.order_lines || []).forEach((l: any) => {
        if (l.voided) return
        const bruto = l.total != null ? Number(l.total) : Number(l.qty || 0) * Number(l.unit_price || 0)
        const stopnja = Number(l.vat_rate ?? 22)
        const osnova = stopnja > 0 ? bruto / (1 + stopnja / 100) : bruto
        const obstoj = poStopnji.get(stopnja) || { osnova: 0, ddv: 0 }
        obstoj.osnova += osnova
        obstoj.ddv += bruto - osnova
        poStopnji.set(stopnja, obstoj)
      })
    })

    const zaokrozi = (n: number) => Math.round(n * 100) / 100
    const ddvPoStopnjah = Array.from(poStopnji.entries())
      .map(([stopnja, v]) => ({ stopnja, osnova: zaokrozi(v.osnova), ddv: zaokrozi(v.ddv) }))
      .sort((a, b) => b.stopnja - a.stopnja)

    const totalRefunds = (refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const totalRevenue = cash + card + bon + other

    setData({
      date: today,
      orderCount: ords.length,
      cash, card, bon, other, tips,
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
      ddvPoStopnjah,
      zacetekIzmene: zacetekIzmene.toISOString(),
      prenosIzPrejsnje,
    })
    // Prenos iz prejsnje izmene predlagamo kot zacetno gotovino - doslej je
    // uporabnik moral vpisati sam, ceprav ga je prejsnje porocilo priporocilo.
    if (prenosIzPrejsnje > 0 && cashOpening === '0') {
      setCashOpening(String(prenosIzPrejsnje))
    }
    // POPRAVLJENO (21.8.2026): `carryOver` se ni NIKOLI nastavil, zato je
    // vrstica "Prenos iz prejsnje izmene" vedno kazala 0,00.
    setCarryOver(prenosIzPrejsnje)
    setLoading(false)
  }

  async function closeShift() {
    if (!data) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const db = createClient()

      // Shrani Z-poročilo v DB
      const { data: zReport, error } = await createClient().from('z_reports').insert({
        business_id: BUSINESS_ID,
        report_number: reportNumber,
        opened_at: new Date(data.date.getFullYear(), data.date.getMonth(), data.date.getDate()).toISOString(),
        closed_at: new Date().toISOString(),
        cash_opening: Number(cashOpening),
        cash_closing: Number(cashClosing),
        total_cash: data.cash,
        total_card: data.card,
        total_bon: data.bon,
        total_other: data.other,
        total_revenue: data.totalRevenue,
        total_refunds: data.totalRefunds,
        order_count: data.orderCount,
        // DODANO (21.8.2026): DDV po stopnjah. Stolpci so v bazi obstajali,
        // a se NISO polnili - racunovodja je dobil Z-porocilo brez podatka,
        // ki ga za DDV obracun potrebuje najbolj.
        total_vat_22: (data.ddvPoStopnjah || []).find(v => v.stopnja === 22)?.ddv ?? 0,
        total_vat_95: (data.ddvPoStopnjah || []).find(v => v.stopnja === 9.5)?.ddv ?? 0,
        total_vat_base_0: (data.ddvPoStopnjah || []).find(v => v.stopnja === 0)?.osnova ?? 0,
        total_vat_base_other: (data.ddvPoStopnjah || [])
          .filter(v => v.stopnja !== 0 && v.stopnja !== 9.5 && v.stopnja !== 22)
          .reduce((sum, v) => sum + v.osnova, 0),
        sent_to_racunko: false,
      }).select().single()

      if (error) throw error

      // Pošlji email z Z-poročilom na lastnika
      // POPRAVLJENO (14.8.2026): staff.email in biz.email polji NE obstajata
      // v bazi (staff/businesses tabeli nimata email stolpca) - ta pogoj je
      // bil VEDNO false, email se NIKOLI ni poslal. Uporabimo trenutno
      // prijavljeno Supabase identiteto namesto tega.
      const { data: { user: currentUser } } = await createClient().auth.getUser()
      if (currentUser?.email) {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: currentUser.email,
            subject: `Z-poročilo #${reportNumber} — ${data.date.toLocaleDateString('sl-SI')}`,
            html: buildZReportHTML(data, reportNumber, cashOpening, cashClosing),
          })
        })
      }

      // Sinhroniziraj promet z računko.si
      try {
        // POPRAVLJENO (17.8.2026): lokalni datum namesto UTC - prodaja po
        // polnoci bi sicer padla v prejsnji dan.
        const dateStr = lokalniDatum(data.date)
        await fetch('/api/pos/sync-income', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dateStr,
            amount: data.totalRevenue,
            refunds: data.totalRefunds,
            description: `POS promet — ${posData.businessName || 'blagajna'} (Z#${reportNumber})`,
            z_report_id: zReport?.id,
          })
        })
        // OPOMBA (17.8.2026): ista zastavica se uporablja za DVE stvari - za
        // prenos prometa v knjigo prihodkov (ob zakljucku izmene) in za
        // posiljanje Z-porocila po e-posti (tu). Ker oboje pomeni "obdelano v
        // portalu", zastavica ostaja skupna; ce bi kdaj potrebovali loceno
        // sled, je treba dodati locen stolpec.
        const { error: zSyncErr } = await createClient().from('z_reports').update({ sent_to_racunko: true }).eq('id', zReport?.id)
        if (zSyncErr) console.error('Z-poročila ni bilo mogoče označiti kot poslano:', zSyncErr)
      } catch (syncErr) {
        console.warn('Sync z računko.si ni uspel:', syncErr)
      }

      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 2000)
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  function buildZReportHTML(d, num, opening, closing) {
    const dateStr = d.date.toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    return `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8"><title>Z-poročilo #${num}</title></head>
<body style="font-family:monospace;max-width:400px;margin:0 auto;padding:20px;background:#fff;color:#000">
<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
  <div style="font-size:18px;font-weight:bold">${escapeHtml(pp.ime)}</div>
  ${pp.naslov ? `<div style="font-size:12px">${escapeHtml(pp.naslov)}</div>` : ''}
  <div style="font-size:12px">ID: ${new Date().getTime()}</div>
</div>
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:16px;font-weight:bold">Z-POROČILO #${num}</div>
  <div style="font-size:12px">${dateStr}</div>
  <div style="font-size:12px">Zaključeno: ${new Date().toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})}</div>
</div>
<div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:10px 0;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between"><span>Gotovina (odprtje):</span><span>${Number(opening).toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Gotovina (zaključek):</span><span>${Number(closing).toFixed(2)} €</span></div>
</div>
<div style="margin-bottom:12px">
  <div style="font-weight:bold;margin-bottom:6px">PLAČILA PO METODAH:</div>
  <div style="display:flex;justify-content:space-between"><span>Gotovina:</span><span>${d.cash.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Kartica:</span><span>${d.card.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Boni:</span><span>${d.bon.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Ostalo:</span><span>${d.other.toFixed(2)} €</span></div>
</div>
<div style="border-top:2px solid #000;padding-top:10px;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between"><span>Skupni promet:</span><span>${d.totalRevenue.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Vračila:</span><span>-${d.totalRefunds.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>NETO PROMET:</span><span>${d.netRevenue.toFixed(2)} €</span></div>
  <div style="display:flex;justify-content:space-between"><span>Število računov:</span><span>${d.orderCount}</span></div>
  <div style="display:flex;justify-content:space-between"><span>Napitnine:</span><span>${d.tips.toFixed(2)} €</span></div>
</div>
<div style="text-align:center;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:10px">
  Generirano: Računko POS · ${new Date().toLocaleString('sl-SI')}
</div>
</body></html>`
  }

  const Row = ({ label, value, bold = false, danger = false }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid '+T.lineSoft }}>
      <span style={{ fontSize:13, color: danger ? T.danger : T.ink, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight: bold ? 800 : 600, fontVariantNumeric:'tabular-nums', color: danger ? T.danger : bold ? T.ink : T.muted }}>{value}</span>
    </div>
  )

  return (
    <Modal open onClose={onClose} width={480}>
      <ModalHeader title={`🖨️ Z-poročilo #${reportNumber} — Zaključek izmene`} onClose={onClose}/>
      <div style={{ padding:'20px 22px', maxHeight:'80vh', overflowY:'auto' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:T.muted }}>Nalagam podatke...</div>
        ) : !data ? null : (
          <>
            <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:10, marginBottom:16, fontSize:13, color:T.accent, fontWeight:600 }}>
              📅 {data.date.toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </div>

            {/* Gotovina */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>STANJE BLAGAJNE</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Gotovina ob odprtju (€)">
                  <input type="number" onFocus={e => e.target.select()} value={cashOpening} onChange={e=>setCashOpening(e.target.value)} min="0" step="0.01" style={inp}/>
                  {carryOver !== null && (
                    <div style={{ marginTop:6, padding:'7px 10px', borderRadius:7, background:T.accentSoft, fontSize:11, color:T.accent, fontWeight:600 }}>
                      💰 Prenos iz prejšnje izmene: €{carryOver.toFixed(2).replace('.',',')}
                    </div>
                  )}
                </Field>
                <Field label="Gotovina ob zaključku (€)">
                  <input type="number" onFocus={e => e.target.select()} value={cashClosing} onChange={e=>setCashClosing(e.target.value)} min="0" step="0.01" style={inp}/>
                </Field>
              </div>
            </div>

            {/* Plačila */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>PLAČILA PO METODAH</div>
              <div style={{ background:T.surface, borderRadius:10, border:'1px solid '+T.line, padding:'4px 14px' }}>
                <Row label="💶 Gotovina" value={eur(data.cash)}/>
                <Row label="💳 Kartica" value={eur(data.card)}/>
                <Row label="🎫 Boni / paketi" value={eur(data.bon)}/>
                <Row label="💰 Ostalo" value={eur(data.other)}/>
              </div>
            </div>

            {/* DDV PO STOPNJAH — DODANO 21.8.2026.
                Z-porocilo tega razdelka doslej SPLOH ni imelo, ceprav je to
                podatek, ki ga racunovodja za DDV obracun potrebuje najbolj.
                Brez njega je moral razclenitev iskati po posameznih racunih. */}
            {(data.ddvPoStopnjah || []).length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>DDV PO STOPNJAH</div>
                <div style={{ background:T.surface, borderRadius:10, border:'1px solid '+T.line, padding:'4px 14px' }}>
                  {data.ddvPoStopnjah.map((v: any) => (
                    <Row key={v.stopnja}
                      label={v.stopnja === 0
                        ? 'Oproščeno (0 %) — osnova'
                        : `Osnova ${String(v.stopnja).replace('.', ',')} % → DDV`}
                      value={v.stopnja === 0 ? eur(v.osnova) : `${eur(v.osnova)} → ${eur(v.ddv)}`}/>
                  ))}
                  <Row label="DDV SKUPAJ"
                    value={eur(data.ddvPoStopnjah.reduce((sum: number, v: any) => sum + v.ddv, 0))} bold/>
                </div>
              </div>
            )}

            {/* Skupaj */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>SKUPAJ</div>
              <div style={{ background:T.surface, borderRadius:10, border:'1px solid '+T.line, padding:'4px 14px' }}>
                <Row label="Skupni promet" value={eur(data.totalRevenue)}/>
                <Row label="Vračila" value={`-${eur(data.totalRefunds)}`} danger={data.totalRefunds > 0}/>
                <Row label="Napitnine" value={eur(data.tips)}/>
                <Row label="Število računov" value={data.orderCount}/>
                <Row label="NETO PROMET" value={eur(data.netRevenue)} bold/>
              </div>
            </div>

            {/* Razlika v gotovini */}
            {cashClosing !== '0' && (
              <div style={{ padding:'10px 14px', borderRadius:9, marginBottom:16, background: Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01 ? T.accentSoft : 'rgba(184,140,40,0.1)', border:'1px solid '+(Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01 ? T.accent : T.warn) }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  <div style={{ marginTop:8, padding:'10px 14px', borderRadius:9, background:'rgba(31,107,58,0.08)', border:'1px solid rgba(31,107,58,0.2)', fontSize:12 }}>
                    <div style={{ fontWeight:700, color:T.accent, marginBottom:2 }}>💰 Prenos v naslednjo izmeno</div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:600 }}>
                      <span>Priporočena začetna gotovina:</span>
                      {/* POPRAVLJENO (21.8.2026): tu je bil uporabljen `stats`,
                          ki v TEJ komponenti ne obstaja - obstaja v CloseCashModal.
                          Ker se ta blok prikaze sele, ko blagajnik vpise gotovino,
                          se je aplikacija sesula natanko takrat: "stats is not
                          defined", bela stran, izmena ni bila zakljucena.
                          Priporocena zacetna gotovina je preprosto tisto, kar je
                          blagajnik prestel ob zakljucku. */}
                      <span style={{ color:T.accent, fontSize:14 }}>€{(Number(cashClosing) || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>Ta znesek bo samodejno predlagan pri naslednji otvoritvi blagajne.</div>
                  </div>
                                    {Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash) < 0.01
                    ? '✅ Gotovina se ujema'
                    : `⚠️ Razlika v gotovini: ${eur(Math.abs(Number(cashClosing) - Number(cashOpening) - data.cash))}`
                  }
                </div>
              </div>
            )}

            <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>
              📧 Z-poročilo bo avtomatsko poslano na email lastnika in shranjeno v bazi.
            </div>

            {saved && (
              <div style={{ padding:'12px 14px', background:T.accentSoft, borderRadius:9, marginBottom:12, fontSize:13, fontWeight:700, color:T.accent }}>
                ✅ Z-poročilo #${reportNumber} shranjeno in poslano!
              </div>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={onClose} style={btnS}>Prekliči</button>
              <button onClick={closeShift} disabled={saving || saved} style={{ ...btnP, opacity:saving?0.7:1 }}>
                {saving ? 'Zaključujem...' : saved ? '✓ Zaključeno' : `🖨️ Zaključi izmeno #${reportNumber}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}


// ================================================================
// ORDERS SCREEN — pregled računov
// ================================================================

// ─────────────────────────────────────────────────────────────────
// STORNO MODAL
// ─────────────────────────────────────────────────────────────────


function ChangePaymentModal({ order, payment, onClose, onChanged }) {
  const [method, setMethod] = React.useState(payment?.method || 'cash')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  async function handleSave() {
    if (method === payment?.method) { onClose(); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      // DODANO (16.8.2026): odkar se predplacilo dejansko odsteva od stanja
      // stranke, mora sprememba nacina placila stanje tudi popraviti - sicer
      // bi stranki znesek ostal odstet (ali pa bi placala s predplacilom, ne
      // da bi se ji odstelo).
      const staraJePrep = payment?.method === 'prep'
      const novaJePrep = method === 'prep'
      if (staraJePrep !== novaJePrep) {
        if (!order?.customer_id) throw new Error('Za spremembo iz/v predplačilo mora biti na računu izbrana stranka.')
        const znesek = Number(payment?.amount || 0)
        const { error: prepErr } = staraJePrep
          ? await createClient().rpc('refund_prepaid', { p_customer_id: order.customer_id, p_amount: znesek })
          : await createClient().rpc('use_prepaid', { p_customer_id: order.customer_id, p_amount: znesek })
        if (prepErr) throw new Error(prepErr.message || 'Stanja predplačila ni bilo mogoče popraviti')
      }

      // DODANO (19.8.2026): varovalka. Prej je manjkal `id` v poizvedbi placil,
      // zato je bil payment.id undefined - update ni zadel nobene vrstice,
      // napake pa ni bilo (Supabase update brez zadetka NI napaka), zato je
      // videti, kot da je shranjeno, v resnici pa se ni spremenilo nic.
      if (!payment?.id) throw new Error('Plačila ni bilo mogoče prepoznati (manjka identifikator). Osvežite seznam računov in poskusite znova.')

      const { data: posodobljeno, error: err } = await createClient()
        .from('payments').update({ method }).eq('id', payment.id).select('id')
      if (err) throw err
      if (!posodobljeno || posodobljeno.length === 0) {
        throw new Error('Sprememba ni bila shranjena — plačilo ni bilo najdeno.')
      }
      onChanged()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Napaka pri spremembi plačila')
    }
    setSaving(false)
  }
  return (
    <Modal open onClose={saving ? undefined : onClose} width={380}>
      <ModalHeader title="Spremeni način plačila" onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ fontSize:12, color:T.muted }}>
          Račun #{order.number || order.id.slice(-6)} — davčna fiskalizacija (ZOI/EOR) ostane nespremenjena, spremeni se samo evidentiran način plačila.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
          {CFG.paymentMethods.map(pm => (
            <button key={pm.id} onClick={() => setMethod(pm.id)} style={{ padding:'12px 8px', borderRadius:10, cursor:'pointer', background: method===pm.id ? T.accent : T.chipBg, color: method===pm.id ? '#fff' : 'inherit', border:'none', display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:13, fontFamily:'inherit' }}>
              <span style={{ fontSize:20 }}>{pm.icon}</span>{pm.name}
            </button>
          ))}
        </div>
        {error && <div style={{ color:T.danger, fontSize:12 }}>{error}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13 }}>
            {saving ? 'Shranjujem...' : 'Shrani'}
          </button>
        </div>
      </div>
    </Modal>
  )
}


// ─────────────────────────────────────────────────────────────────
// UPRAVLJANJE MIZE — prenos na drugo mizo/zaposlenega, zdruzitev
// ─────────────────────────────────────────────────────────────────
function TableActionsModal({ activeTable, posData, auth, onClose, onDone }) {
  const [tab, setTab] = React.useState('table') // table | staff | merge
  const [targetTableId, setTargetTableId] = React.useState('')
  const [targetStaffId, setTargetStaffId] = React.useState('')
  const [sourceTableId, setSourceTableId] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [allTables, setAllTables] = React.useState([])
  React.useEffect(() => {
    createClient().from('tables').select('id, name, status').order('name').then(({ data }) => setAllTables(data || []))
  }, [])
  const otherTables = allTables.filter(t => t.id !== activeTable.id)
  const freeTables = otherTables.filter(t => t.status !== 'occupied')
  const occupiedTables = otherTables.filter(t => t.status === 'occupied')

  async function moveToTable() {
    if (!targetTableId) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    setSaving(true); setError('')
    try {
      const existing = await pos.orders.getOpenOnTable(activeTable.id)
      if (!existing) throw new Error('Na tej mizi ni odprtega naročila')
      // DODANO (16.8.2026): brez te preverbe bi prenos na ZASEDENO mizo ustvaril
      // DVE odprti narocili na isti mizi - getOpenOnTable vrne samo najnovejso,
      // starejse narocilo pa bi postalo NEVIDNO in nikoli placano (izgubljen racun).
      const targetExisting = await pos.orders.getOpenOnTable(targetTableId)
      if (targetExisting) {
        const targetName = otherTables.find(t => t.id === targetTableId)?.name || 'ciljna miza'
        throw new Error(`Miza "${targetName}" že ima odprto naročilo. Uporabite zavihek "Združi mizi" namesto prenosa.`)
      }
      const db = createClient()
      const { error: err } = await db.from('orders').update({ table_id: targetTableId }).eq('id', existing.id)
      if (err) throw err
      await db.from('tables').update({ status: 'free' }).eq('id', activeTable.id)
      await db.from('tables').update({ status: 'occupied' }).eq('id', targetTableId)
      onDone()
      onClose()
    } catch (e: any) { setError(e.message || 'Napaka') }
    setSaving(false)
  }

  async function moveToStaff() {
    if (!targetStaffId) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    setSaving(true); setError('')
    try {
      const existing = await pos.orders.getOpenOnTable(activeTable.id)
      if (!existing) throw new Error('Na tej mizi ni odprtega naročila')
      const { error: err } = await createClient().from('orders').update({ cashier_id: targetStaffId }).eq('id', existing.id)
      if (err) throw err
      onDone()
      onClose()
    } catch (e: any) { setError(e.message || 'Napaka') }
    setSaving(false)
  }

  async function mergeTables() {
    if (!sourceTableId) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    // POPRAVLJENO (17.8.2026): varovalka pred dvojnim klikom - prej se je
    // stanje nastavilo, a se ni preverjalo.
    if (saving) return
    setSaving(true); setError('')
    try {
      const db = createClient()
      const current = await pos.orders.getOpenOnTable(activeTable.id)
      const source = await pos.orders.getOpenOnTable(sourceTableId)
      if (!current) throw new Error('Na tej mizi ni odprtega naročila')
      if (!source) throw new Error('Izbrana miza nima odprtega naročila')
      const { error: err } = await db.from('order_lines').update({ order_id: current.id }).eq('order_id', source.id)
      if (err) throw err
      // POPRAVLJENO (17.8.2026): prej brez preverbe - ce se izvorno narocilo ne
      // zapre, ostane na mizi "duh" z vrsticami, ki so ze na drugi mizi.
      const { error: srcErr } = await db.from('orders').update({ status: 'cancelled' }).eq('id', source.id)
      if (srcErr) throw new Error('Izvornega računa ni bilo mogoče zapreti: ' + srcErr.message)
      const { error: tblErr } = await db.from('tables').update({ status: 'free' }).eq('id', sourceTableId)
      if (tblErr) console.warn('Mize ni bilo mogoce sprostiti:', tblErr)
      onDone()
      onClose()
    } catch (e: any) { setError(e.message || 'Napaka') }
    setSaving(false)
  }

  const tabs = [
    { id: 'table', label: '🔄 Druga miza' },
    { id: 'staff', label: '👤 Zaposleni' },
    { id: 'merge', label: '🔗 Združi' },
  ]
  return (
    <Modal open onClose={saving ? undefined : onClose} width={400}>
      <ModalHeader title={`Upravljaj mizo: ${activeTable.name}`} onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', gap:4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:'8px 6px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, background: tab===t.id?T.accent:T.chipBg, color: tab===t.id?'#fff':'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'table' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, color:T.muted }}>Prenesi trenutno naročilo na drugo (prosto) mizo.</div>
            <select value={targetTableId} onChange={e=>setTargetTableId(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13 }}>
              <option value="">-- Izberi mizo --</option>
              {freeTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {error && <div style={{ color:T.danger, fontSize:12 }}>{error}</div>}
            <button onClick={moveToTable} disabled={saving || !targetTableId} style={{ padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, opacity: !targetTableId?0.5:1 }}>
              {saving ? 'Prenašam...' : 'Prenesi naročilo'}
            </button>
          </div>
        )}

        {tab === 'staff' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, color:T.muted }}>Prenesi odgovornost za naročilo na drugega zaposlenega (npr. ob menjavi izmene).</div>
            <select value={targetStaffId} onChange={e=>setTargetStaffId(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13 }}>
              <option value="">-- Izberi zaposlenega --</option>
              {(posData.staffList||[]).map((st:any) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            {error && <div style={{ color:T.danger, fontSize:12 }}>{error}</div>}
            <button onClick={moveToStaff} disabled={saving || !targetStaffId} style={{ padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, opacity: !targetStaffId?0.5:1 }}>
              {saving ? 'Prenašam...' : 'Prenesi odgovornost'}
            </button>
          </div>
        )}

        {tab === 'merge' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, color:T.muted }}>Združi naročilo z druge (zasedene) mize v trenutno naročilo. Druga miza se sprosti.</div>
            <select value={sourceTableId} onChange={e=>setSourceTableId(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:13 }}>
              <option value="">-- Izberi mizo za združitev --</option>
              {occupiedTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {error && <div style={{ color:T.danger, fontSize:12 }}>{error}</div>}
            <button onClick={mergeTables} disabled={saving || !sourceTableId} style={{ padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, opacity: !sourceTableId?0.5:1 }}>
              {saving ? 'Združujem...' : 'Združi mizi'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function VoidModal({ order, lines, payment, posData, auth, onClose, onVoided }) {
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  async function handleVoid() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')

      // 1. Pridobi org podatke za FURS klic
      // POPRAVLJENO (16.8.2026): maybeSingle() na org_members vrze napako, ce
      // je uporabnik clan VEC organizacij (npr. racunovodja) - uporabimo
      // uveljavljeno pomozno funkcijo, ki upostevaje izbrano aktivno org.
      const activeMembership = await getActiveMembership()
      const member = activeMembership ? { org_id: activeMembership.org_id } : null
      if (!member) throw new Error('Org ni najdena')

      // 2. Kliči FURS kredit nota (storno)
      const fursRes = await fetch('/api/furs/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          total: order.total,
          original_eor: payment?.furs_eor,
          reason,
        })
      })
      const fursData = await fursRes.json().catch(() => ({}))

      // DODANO (16.8.2026): ce je bilo placano s PREDPLACILOM, ga ob stornu
      // vrnemo stranki - sicer bi ji znesek ostal odstet, racun pa razveljavljen.
      if (payment?.method === 'prep' && order?.customer_id) {
        const { error: refundPrepErr } = await createClient().rpc('refund_prepaid', {
          p_customer_id: order.customer_id,
          p_amount: Number(payment.amount),
        })
        if (refundPrepErr) throw new Error('Predplačila ni bilo mogoče vrniti: ' + refundPrepErr.message)
      }

      // 3. Označi order kot storniran
      const { error: voidErr } = await createClient().from('orders').update({
        voided_at: new Date().toISOString(),
        // POPRAVLJENO (16.8.2026): voided_by je uporabljal Supabase identiteto
        // NAPRAVE (na skupnem terminalu vedno ista oseba), ne PIN-preverjene
        // identitete blagajnika - storno je bil vedno pripisan napacni osebi.
        voided_by: auth?.user?.id || null,
        void_reason: reason || 'Storno',
        void_furs_eor: fursData.eor || null,
        void_furs_zoi: fursData.zoi || null,
        status: 'voided',
      }).eq('id', order.id)
      // POPRAVLJENO (16.8.2026): prej brez preverbe - ce oznaka storna spodleti,
      // je uporabnik vseeno videl potrdilo, racun pa je ostal veljaven.
      if (voidErr) throw new Error('Storna ni bilo mogoče zabeležiti: ' + voidErr.message)

      // 4. VRNI ZALOGO (21.8.2026)
      //
      // NAPAKA, ki jo to odpravlja: storno je racun oznacil kot storniran in
      // prijavil FURS, zaloge pa NI vrnil. Prodanih 7 kozarcev vina je iz
      // surovine odstelo 0,7 L; po stornu bi moralo biti vrnjeno, a je zaloga
      // ostala znizana. Enako pri navadnih artiklih.
      //
      // Vrstni red je enak kot pri prodaji, le v obratno smer:
      //   - navaden artikel  -> increment_stock (+kolicina)
      //   - artikel z normativom -> increment_ingredient_stock po sestavinah
      try {
        const db = createClient()

        // `order_lines` NE hrani `item_type` - poiscemo ga v katalogu. Brez
        // tega bi bili vsi artikli obravnavani kot navadni in porabe surovin
        // ne bi vrnili (ista past kot pri kosarici, prelet 70).
        const vrsta = (l: any) =>
          posData?.items?.find((x: any) => x.id === l.item_id)?.item_type || 'simple'

        // a) Navadni artikli - vrni kolicino nazaj.
        const navadni = (lines || []).filter((l: any) => l.item_id && vrsta(l) !== 'recipe')
        for (const l of navadni) {
          const { error } = await db.rpc('increment_stock', {
            p_item_id: l.item_id,
            p_qty: Number(l.qty || 0),
          })
          if (error) console.error('Zaloge za "' + l.name + '" ni bilo mogoce vrniti:', error.message)
        }

        // b) Artikli z normativom - vrni porabo surovin.
        const recepti = (lines || []).filter((l: any) => l.item_id && vrsta(l) === 'recipe')
        if (recepti.length > 0) {
          const { data: normativi } = await db
            .from('item_ingredients')
            .select('item_id, ingredient_id, qty_used')
            .in('item_id', recepti.map((l: any) => l.item_id))

          // Sestej po surovini: ce se ista pojavi v vec receptih, vrnemo ENKRAT.
          const poSurovini = new Map<string, number>()
          for (const l of recepti) {
            for (const n of (normativi || [])) {
              if (n.item_id !== l.item_id) continue
              poSurovini.set(n.ingredient_id,
                (poSurovini.get(n.ingredient_id) || 0) + Number(n.qty_used) * Number(l.qty || 0))
            }
          }

          for (const [ingredientId, kolicina] of poSurovini) {
            const { error } = await db.rpc('increment_ingredient_stock', {
              p_ingredient_id: ingredientId,
              p_qty: kolicina,
            })
            if (error) console.error('Zaloge surovine ni bilo mogoce vrniti:', error.message)
          }
        }
      } catch (zalogaErr: any) {
        // Zaloga ne sme prepreciti storna - racun je ze storniran in prijavljen
        // FURS. Napako zabelezimo in uporabnika opozorimo.
        console.error('Vracanje zaloge ob stornu:', zalogaErr)
        setError('Račun je storniran, zaloge pa ni bilo mogoče vrniti — preverite jo ročno.')
      }

      // 5. Natisni storno račun
      const { data: org } = member ? await createClient().from('organizations').select('*').eq('id', member.org_id).single() : { data: null }
      const cashierName = auth?.user?.name || ''
      const html = buildStornoReceiptHTML({
        order, lines, payment, org, cashierName,
        voidEor: fursData.eor,
        voidZoi: fursData.zoi,
        reason: reason || 'Storno',
        // Lastna stevilka storna in klavzule (25.8.2026).
        stornoNumber: fursData?.invoiceNumber ?? null,
        vatExemptions: Array.from(new Set((lines || [])
          .filter((l: any) => Number(l.vat_rate ?? 22) === 0)
          .map((l: any) => {
            const kat = posData?.items?.find((x: any) => x.id === l.item_id)
            return vatExemptionText(kat?.vat_exemption_code, kat?.vat_exemption_custom_text)
          })
          .filter(Boolean))),
      })
      const w = window.open('', '_blank', 'width=380,height=700')
      if (w) { w.document.write(html); w.document.close() }

      setDone(true)
      setTimeout(() => { onVoided(); onClose() }, 1500)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={400}>
      <ModalHeader title="Storno računa" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Račun storniran</div>
          </div>
        ) : (<>
          <div style={{ background:'rgba(168,50,50,0.08)', border:'1px solid rgba(168,50,50,0.2)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.danger, marginBottom:4 }}>⚠️ Pozor — storno je nepovraten</div>
            <div style={{ fontSize:12, color:T.muted }}>Stornira se celoten račun #{order.number || order.id.slice(-6)} za €{Number(order.total).toFixed(2)}. Stranki se vrne celoten znesek.</div>
          </div>

          <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Artikli na računu:</div>
            {lines.map(l => (
              <div key={l.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'2px 0', color:T.muted }}>
                <span>{l.name} × {l.qty}</span>
                <span>€{(Number(l.qty)*Number(l.unit_price)).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, borderTop:'1px solid '+T.line, marginTop:6, paddingTop:6 }}>
              <span>Skupaj:</span><span>€{Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Razlog storna</div>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="npr. napačna naročba, zahteva stranke..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleVoid} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.danger, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Storniram...' : '🗑️ Potrdi storno'}
            </button>
          </div>
        </>)}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// VRAČILO MODAL (delno)
// ─────────────────────────────────────────────────────────────────

function RefundModal({ order, lines, payment, auth, onClose, onRefunded }) {
  const [selectedLines, setSelectedLines] = React.useState<string[]>([])
  const [customAmount, setCustomAmount] = React.useState('')
  const [mode, setMode] = React.useState<'lines'|'custom'>('lines')
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  const selectedTotal = lines
    .filter(l => selectedLines.includes(l.id))
    .reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0)

  const refundAmount = mode === 'lines'
    ? selectedTotal
    : parseFloat(customAmount) || 0

  function toggleLine(id: string) {
    setSelectedLines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleRefund() {
    if (refundAmount <= 0) { setError('Znesek vračila mora biti večji od 0'); return }
    if (refundAmount > Number(order.total)) { setError('Znesek ne sme presegati skupaj računa'); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const db = createClient()
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')
      // DODANO (16.8.2026): brez PIN-preverjene identitete blagajnika vracila
      // ni mogoce zabeleziti (cashier_id je obvezen tuji kljuc na staff).
      if (!auth?.user?.id) throw new Error('Prijavite se s PIN kodo za vračilo')

      const { error: refundErr } = await createClient().from('refunds').insert({
        business_id: BUSINESS_ID,
        original_order_id: order.id,
        amount: refundAmount,
        reason: reason || 'Delno vračilo',
        // POPRAVLJENO (16.8.2026, KRITICNO): cashier_id je TUJI KLJUC na
        // staff(id), koda pa je vpisovala user.id (Supabase racun naprave) -
        // vsak poskus vracila je spodletel s krsitvijo tujega kljuca. Zdaj
        // uporabimo PIN-preverjeno identiteto blagajnika (auth.user je zapis
        // iz staff tabele).
        cashier_id: auth?.user?.id,
        // DODANO (16.8.2026): nacin vracila se ni belezil. Izracun pricakovane
        // gotovine v blagajni manjkajoc nacin obravnava kot GOTOVINO, zato bi
        // se KARTICNO vracilo odstelo od pricakovane gotovine - blagajniku bi
        // ob zakljucku manjkal denar, ki ga ni nikoli izplacal. Vracilo gre po
        // isti poti kot izvirno placilo.
        method: payment?.method || 'cash',
        refunded_at: new Date().toISOString(),
      })
      // DODANO (16.8.2026): prej se napaka pri vpisu ni preverjala - vracilo
      // je tiho spodletelo, uporabnik pa je videl potrdilo o uspehu.
      if (refundErr) throw new Error('Vračila ni bilo mogoče zabeležiti: ' + refundErr.message)

      // Natisni vračilo
      const html = buildRefundReceiptHTML({
        order, refundAmount,
        reason: reason || 'Delno vračilo',
        // POPRAVLJENO (24.8.2026): na listku vracila je pristala PREDPONA
        // E-NASLOVA namesto imena. Ime osebja blagajne je v `auth.user.name`.
        cashierName: auth?.user?.name || '',
      })
      const w = window.open('', '_blank', 'width=380,height=600')
      if (w) { w.document.write(html); w.document.close() }

      setDone(true)
      setTimeout(() => { onRefunded(); onClose() }, 1500)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} width={420}>
      <ModalHeader title="Delno vračilo" onClose={onClose}/>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700 }}>Vračilo zabeleženo</div>
            <div style={{ fontSize:13, color:T.muted, marginTop:4 }}>€{refundAmount.toFixed(2)}</div>
          </div>
        ) : (<>
          {/* Način */}
          <div style={{ display:'flex', gap:8 }}>
            {(['lines', 'custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'8px', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, border:'1px solid '+T.line, background: mode===m ? T.accent : 'transparent', color: mode===m ? '#fff' : T.text }}>
                {m === 'lines' ? '📋 Po artiklih' : '✏️ Ročni znesek'}
              </button>
            ))}
          </div>

          {mode === 'lines' ? (
            <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Izberi artikle za vračilo:</div>
              {lines.map(l => {
                const lineTotal = Number(l.qty) * Number(l.unit_price)
                const selected = selectedLines.includes(l.id)
                return (
                  <div key={l.id} onClick={() => toggleLine(l.id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <div style={{ width:18, height:18, borderRadius:4, border:'1.5px solid '+(selected?T.accent:T.line), background:selected?T.accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12 }}>
                        {selected ? '✓' : ''}
                      </div>
                      <span style={{ fontSize:13 }}>{l.name} × {l.qty}</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight:600 }}>€{lineTotal.toFixed(2)}</span>
                  </div>
                )
              })}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, marginTop:8, paddingTop:8, borderTop:'1px solid '+T.line }}>
                <span>Vračilo:</span><span style={{ color:T.accent }}>€{selectedTotal.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Znesek vračila (€)</div>
              <input
                type="number" onFocus={e => e.target.select()} min="0.01" step="0.01" max={order.total}
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder={`Max: €${Number(order.total).toFixed(2)}`}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:14, fontWeight:700, background:T.inputBg, outline:'none' }}
                autoFocus
              />
            </div>
          )}

          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Razlog vračila</div>
            <input
              type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="npr. napaka pri naročilu, nezadovoljstvo..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}
            />
          </div>

          {refundAmount > 0 && (
            <div style={{ background:T.accentSoft, borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700 }}>
              <span>Vračilo stranki:</span>
              <span style={{ color:T.accent }}>€{refundAmount.toFixed(2)}</span>
            </div>
          )}

          {error && <div style={{ color:T.danger, fontSize:12, background:'rgba(168,50,50,0.08)', padding:'8px 12px', borderRadius:8 }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'1px solid '+T.line, background:'transparent', fontWeight:600, fontSize:13 }}>Prekliči</button>
            <button onClick={handleRefund} disabled={saving || refundAmount <= 0} style={{ flex:2, padding:'11px', borderRadius:9, cursor:'pointer', fontFamily:'inherit', border:'none', background: refundAmount > 0 ? T.accent : T.line, color:'#fff', fontWeight:700, fontSize:13 }}>
              {saving ? 'Shranjujem...' : `↩️ Vrni €${refundAmount.toFixed(2)}`}
            </button>
          </div>
        </>)}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// STORNO RAČUN HTML (termalni format)
// ─────────────────────────────────────────────────────────────────

/**
 * IZPIS STORNA (popravljeno 25.8.2026).
 *
 * Prej troje narobe:
 *   1. Datum se je jemal iz `new Date()` OB TISKU — vsak ponovni izpis istega
 *      dokumenta je pokazal drug cas. Davcni dokument mora nositi cas IZDAJE.
 *   2. Manjkala je LASTNA stevilka storna (SIRBFB01-TEST1-28); pisalo je le
 *      "Storno racuna: #22".
 *   3. Manjkala sta OBRACUN DDV in klavzula o oprostitvi, ki ju original ima.
 */
function buildStornoReceiptHTML({ order, lines, payment, org, cashierName, voidEor, voidZoi, reason, stornoNumber, vatExemptions }) {
  const eur = n => '€' + Number(n).toFixed(2).replace('.', ',')
  const addr = [org?.address, [org?.post_code, org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>STORNO #${order.number}</title>
<style>@page{size:80mm auto;margin:0}body{font-family:monospace;font-size:11px;line-height:1.4;color:#000;background:#fff;margin:0;padding:8mm 4mm;max-width:80mm}.c{text-align:center}.b{font-weight:700}.l{border-top:1px dashed #000;margin:6px 0}.dl{border-top:2px solid #000;margin:6px 0}.r{display:flex;justify-content:space-between}.s{font-size:10px;color:#444}.footer{text-align:center;font-size:10px;margin-top:8px}.brand{font-weight:700;letter-spacing:4px;font-size:11px}</style>
</head><body>
<div class="c">
  <div class="b" style="font-size:14px">${org?.name || 'Blagajna'}</div>
  ${addr ? `<div class="s">${addr}</div>` : ''}
  ${org?.tax_number ? `<div class="s">Davčna št.: ${org.tax_number}</div>` : ''}
  ${org?.vat_registered ? `<div class="s">ID za DDV: SI${org.tax_number}</div>` : ''}
</div>
<div class="l"></div>
<div class="c b" style="font-size:13px;color:#a83232">⚠️ STORNO RAČUN</div>
<div class="c s" style="color:#a83232">Originalni račun je razveljavljen</div>
<div class="l"></div>
${typeof stornoNumber === 'string' && stornoNumber ? `<div class="r"><span>Št. storna:</span><span class="b">${escapeHtml(stornoNumber)}</span></div>` : ''}
<div class="r"><span>Storno računa:</span><span class="b">#${order.number || order.id.slice(-6)}</span></div>
<div class="r"><span>Datum:</span><span>${new Date(order.voided_at || order.closed_at || Date.now()).toLocaleString('sl-SI')}</span></div>
<div class="r"><span>Blagajnik:</span><span>${escapeHtml(cashierName)}</span></div>
<div class="r"><span>Razlog:</span><span>${escapeHtml(reason)}</span></div>
<div class="l"></div>
${lines.map(l => `
<div class="r"><span>${escapeHtml(l.name)}</span><span>-${eur(Number(l.qty)*Number(l.unit_price))}</span></div>
<div class="r s"><span>  ${l.qty} × ${eur(l.unit_price)}</span><span></span></div>
`).join('')}
<div class="dl"></div>
<div class="r b" style="font-size:13px"><span>VRAČILO:</span><span style="color:#a83232">-${eur(order.total)}</span></div>
<div class="dl"></div>
${(() => {
  // OBRACUN DDV (dodano 25.8.2026): storno je davcni dokument in mora imeti
  // enak davcni del kot original, le z nasprotnim predznakom.
  const poStopnji = new Map()
  for (const l of (lines || [])) {
    const bruto = Number(l.total ?? Number(l.qty || 0) * Number(l.unit_price || 0))
    const st = Number(l.vat_rate ?? 22)
    const osn = st > 0 ? bruto / (1 + st / 100) : bruto
    const v = poStopnji.get(st) || { osnova: 0, ddv: 0 }
    v.osnova += osn; v.ddv += bruto - osn
    poStopnji.set(st, v)
  }
  if (poStopnji.size === 0) return ''
  const vrstice = Array.from(poStopnji.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([st, v]) => `<div class="r s"><span>${String(st).replace('.', ',')} % — osnova / DDV</span><span>-${eur(v.osnova)} / -${eur(v.ddv)}</span></div>`)
    .join('')
  return `<div class="s b">OBRAČUN DDV</div>${vrstice}<div class="dl"></div>`
})()}
${(vatExemptions || []).length > 0 ? `
<div class="s" style="margin-top:4px">${(vatExemptions || []).map(t => escapeHtml(t)).join('<br/>')}</div>
<div class="dl"></div>` : ''}
${voidEor ? `
<div class="l"></div>
<div class="s">ZOI: ${voidZoi || '—'}</div>
<div class="s">EOR: ${voidEor}</div>
<div class="c b s" style="margin-top:4px">✓ Davčno potrjeno</div>
` : `<div class="c s" style="color:#a83232">FURS potrjevanje ni uspelo</div>`}
<div class="l"></div>
<div class="c">Hvala za razumevanje!</div>
<div class="l"></div>
<div class="footer">
  <div>⚡ Izdano s sistemom</div>
  <div class="brand">RAČUNKO</div>
  <div>AI knjigovodstvo za s.p.</div>
  <div style="font-weight:700">www.racunko.si</div>
</div>
<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno
     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne
     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez
     tiskalnika pa cista ovira. Zdaj je gumb - kdor tiska, klikne. -->
<div style="position:fixed;top:0;left:0;right:0;padding:10px;background:#0D1F12;display:flex;gap:8px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="padding:9px 22px;border:0;border-radius:8px;background:#fff;color:#0D1F12;font-weight:700;font-size:14px;cursor:pointer">Natisni</button>
  <button onclick="window.close()" style="padding:9px 22px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Zapri</button>
</div>
<style>@media print{.no-print{display:none!important}}body{padding-top:56px}</style>
</body></html>`
}

// ─────────────────────────────────────────────────────────────────
// VRAČILO POTRDILO HTML
// ─────────────────────────────────────────────────────────────────

function buildRefundReceiptHTML({ order, refundAmount, reason, cashierName }) {
  const eur = n => '€' + Number(n).toFixed(2).replace('.', ',')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vračilo #${order.number}</title>
<style>@page{size:80mm auto;margin:0}body{font-family:monospace;font-size:11px;line-height:1.4;color:#000;background:#fff;margin:0;padding:8mm 4mm;max-width:80mm}.c{text-align:center}.b{font-weight:700}.l{border-top:1px dashed #000;margin:6px 0}.dl{border-top:2px solid #000;margin:6px 0}.r{display:flex;justify-content:space-between}.s{font-size:10px;color:#444}.footer{text-align:center;font-size:10px;margin-top:8px}.brand{font-weight:700;letter-spacing:4px;font-size:11px}</style>
</head><body>
<div class="c b" style="font-size:14px">POTRDILO O VRAČILU</div>
<div class="l"></div>
<div class="r"><span>Orig. račun:</span><span class="b">#${order.number || order.id.slice(-6)}</span></div>
<div class="r"><span>Datum:</span><span>${new Date().toLocaleString('sl-SI')}</span></div>
<div class="r"><span>Blagajnik:</span><span>${escapeHtml(cashierName)}</span></div>
<div class="r"><span>Razlog:</span><span>${escapeHtml(reason)}</span></div>
<div class="dl"></div>
<div class="r b" style="font-size:14px"><span>VRAČILO:</span><span style="color:#2563eb">${eur(refundAmount)}</span></div>
<div class="dl"></div>
<div class="c" style="margin-top:8px">Hvala za razumevanje!</div>
<div class="l"></div>
<div class="footer">
  <div>⚡ Izdano s sistemom</div>
  <div class="brand">RAČUNKO</div>
  <div style="font-weight:700">www.racunko.si</div>
</div>
<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno
     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne
     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez
     tiskalnika pa cista ovira. Zdaj je gumb - kdor tiska, klikne. -->
<div style="position:fixed;top:0;left:0;right:0;padding:10px;background:#0D1F12;display:flex;gap:8px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="padding:9px 22px;border:0;border-radius:8px;background:#fff;color:#0D1F12;font-weight:700;font-size:14px;cursor:pointer">Natisni</button>
  <button onclick="window.close()" style="padding:9px 22px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Zapri</button>
</div>
<style>@media print{.no-print{display:none!important}}body{padding-top:56px}</style>
</body></html>`
}

function OrdersScreen({ posData, auth }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [orderPayment, setOrderPayment] = useState(null)
  // DODANO (19.8.2026): stevilke storno dokumentov, kljuc = order_id.
  const [stornoNumbers, setStornoNumbers] = useState({})
  const [period, setPeriod] = useState('today')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return lokalniDatum(d) })
  const [dateTo, setDateTo] = useState(() => lokalniDatum())
  const [showVoid, setShowVoid] = React.useState(false)
  const [showRefund, setShowRefund] = React.useState(false)
  const [showChangePayment, setShowChangePayment] = React.useState(false)

  // Preveri ali je račun od danes
  function isToday(dateStr) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
  }

  const METHOD_LABELS = { cash:'Gotovina', card:'Kartica', bon:'Bon', prep:'Predplačilo', split:'Deljeno' }

  async function loadOrders() {
    setLoading(true)
    const sb = createClient()
    let fromDate, toDate
    const now = new Date()
    if (period === 'today') {
      fromDate = new Date(); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'week') {
      fromDate = new Date(); fromDate.setDate(now.getDate()-7); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'month') {
      fromDate = new Date(); fromDate.setDate(1); fromDate.setHours(0,0,0,0)
      toDate = new Date(); toDate.setHours(23,59,59,999)
    } else if (period === 'custom') {
      fromDate = new Date(dateFrom + 'T00:00:00')
      toDate = new Date(dateTo + 'T23:59:59')
    } else {
      fromDate = new Date('2020-01-01')
      toDate = new Date()
    }

    // POPRAVLJENO 21.7.2026: prej je bil filter striktno .eq('status','paid'),
    // zaradi cesar so stornirani racuni (status='voided') po stornu popolnoma
    // izginili iz seznama - podatki niso bili izbrisani, a jih ni bilo mozno
    // videti brez rocnega poizvedovanja v bazo. Zdaj ostanejo vidni, obstojeca
    // "Storniran" znacka (voided_at) jih jasno oznaci ob odprtju.
    let q = sb
      .from('orders')
      // POPRAVLJENO (19.8.2026): manjkal je `id` placila. Modal "Spremeni nacin
      // placila" shranjuje z `.eq('id', payment.id)` - ker id ni bil izbran, je
      // bil undefined, poizvedba ni zadela nobene vrstice in sprememba se ni
      // shranila. Napake ni javilo, ker Supabase update brez zadetka NI napaka.
      // POPRAVLJENO (24.8.2026): izbor ni vseboval `cashier_id`, zato
      // `payment?.cashier_id` ni bil nikoli definiran - iskanje imena
      // blagajnika se je preskocilo in na racunu je pisalo "Blagajnik: —".
      // Ista vrsta napake kot `package_id` in `template_id`.
      .select('*, payments(id, method, amount, furs_zoi, furs_eor, paid_at, cashier_id)')
      .eq('business_id', BUSINESS_ID)
      .in('status', ['paid', 'voided'])
      .order('closed_at', { ascending: false })
      .limit(500)

    if (period !== 'all') {
      q = q.gte('closed_at', fromDate.toISOString()).lte('closed_at', toDate.toISOString())
    }

    const { data, error } = await q
    const nar = data || []
    setOrders(nar)

    // DODANO (19.8.2026): stevilke STORNO dokumentov. Ob stornu se izda nov
    // dokument z lastno zaporedno stevilko (ZDavPR: "racun se stornira tako, da
    // se izda nov racun z negativnimi zneski"), a se na seznamu ni bil viden -
    // videti je bilo le precrtan izvirnik. Stranka tako ni mogla dobiti storno
    // dokumenta, pri nadzoru pa se stevilo dokumentov v blagajni ni ujemalo s
    // stevilom, ki jih ima FURS.
    const stornirani = nar.filter(o => o.voided_at || o.status === 'voided').map(o => o.id)
    if (stornirani.length > 0) {
      const { data: st } = await sb
        .from('pos_invoice_numbers')
        .select('order_id, invoice_number, sequence_number, created_at, note')
        .in('order_id', stornirani)
        .not('note', 'is', null)
      const map = {}
      ;(st || []).forEach(r => { map[r.order_id] = r })
      setStornoNumbers(map)
    } else {
      setStornoNumbers({})
    }
    setLoading(false)
  }

  async function loadOrderDetail(order) {
    setSelectedOrder(order)
    const sb = createClient()
    const { data: lines } = await sb.from('order_lines').select('*').eq('order_id', order.id).order('id')
    setOrderLines(lines || [])
    setOrderPayment(order.payments?.[0] || null)
  }

  useEffect(() => { if(period !== 'custom') loadOrders() }, [period])

  const filtered = orders.filter(o =>
    !search || String(o.number).includes(search) ||
    (o.payments?.[0]?.furs_eor || '').toLowerCase().includes(search.toLowerCase())
  )

  // POPRAVLJENO (16.8.2026): vsota je vstevala tudi STORNIRANE racune, zato je
  // stevec nad seznamom kazal promet, ki ga v resnici ni bilo. Zakljucek blagajne
  // jih je pravilno izvzel, seznam pa ne - dve razlicni stevilki za isto stvar.
  const totalFiltered = filtered
    .filter(o => o.status !== 'voided' && !o.voided_at)
    .reduce((s,o) => s + Number(o.total||0), 0)
  const stStorniranih = filtered.filter(o => o.status === 'voided' || o.voided_at).length

  // DODANO (19.8.2026): vrstice za prikaz. Vsak storniran racun da DVE vrstici:
  // izvirnik (precrtan) in samostojen STORNO dokument z negativnim zneskom.
  // Tako je v blagajni vidno enako stevilo dokumentov, kot jih ima FURS.
  const vrstice = []
  filtered.forEach(o => {
    vrstice.push({ tip: 'racun', o, cas: o.closed_at })
    if (o.voided_at || o.status === 'voided') {
      const st = stornoNumbers[o.id]
      vrstice.push({
        tip: 'storno',
        o,
        cas: o.voided_at || st?.created_at || o.closed_at,
        stevilka: st?.invoice_number || null,
        zaporedna: st?.sequence_number ?? null,
      })
    }
  })
  vrstice.sort((a, b) => new Date(b.cas || 0).getTime() - new Date(a.cas || 0).getTime())

  async function printReceipt(order, lines, payment) {
    // POPRAVLJENO (21.8.2026): funkcija je uporabljala `db`, ki ni bil nikjer
    // definiran - tiskanje racuna iz seznama bi vrglo "db is not defined".
    const db = createClient()
    // Pridobi org + premise + cashier za glavo računa
    let orgData = null
    let premiseData = null
    let deviceData = null
    let cashierName = ''

    try {
      const { data: { user } } = await db.auth.getUser()
      if (user) {
        const member = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
        if (member) {
          const { data: org } = await db.from('organizations').select('*').eq('id', member.org_id).single()
          orgData = org

          const { data: premise } = await db.from('business_premises')
            .select('*').eq('org_id', member.org_id).eq('is_active', true).limit(1).maybeSingle()
          premiseData = premise

          if (premise) {
            const { data: device } = await db.from('electronic_devices')
              .select('*').eq('premise_id', premise.id).eq('is_active', true).maybeSingle()
            deviceData = device
          }
        }

        // BLAGAJNIK NA RACUNU (popravljeno 24.8.2026).
        //
        // NAPAKA: iskali smo v `org_members` po `user_id`, `cashier_id` pa je
        // ID OSEBJA BLAGAJNE (tabela `staff`) - ujemanja ni bilo nikoli, zato
        // je koda padla na predpono e-naslova. Na racunu je pisalo
        // "mahnic.nik+test1" namesto imena blagajnika. Na davcnem dokumentu je
        // to napacen podatek.
        if (payment?.cashier_id) {
          const { data: osebje } = await db.from('staff')
            .select('name').eq('id', payment.cashier_id).maybeSingle()
          cashierName = osebje?.name || ''
        }
        if (!cashierName) {
          // POPRAVLJENO (24.8.2026): brali smo `org_members.display_name`,
          // tega stolpca pa v tabeli SPLOH NI - poizvedba je vrnila napako,
          // `catch` jo je pogoltnil in ime je ostalo prazno. Osebje blagajne
          // je v tabeli `staff`; poiscemo prijavljenega uporabnika tam.
          const { data: jaz } = await db.from('staff')
            .select('name').eq('user_id', user.id).eq('active', true)
            .limit(1).maybeSingle()
          // Predpone e-naslova NE uporabimo - raje prazno, kot da na davcni
          // dokument zapisemo nekaj, kar ni ime.
          cashierName = jaz?.name || ''
        }
      }
    } catch (e) {}

    // Electron IPC (desktop app) — direktno, brez HTTP
    if (typeof window !== 'undefined' && (window as any).electronAPI?.printReceipt) {
      try {
        const html = await buildReceiptHTML({
          org: orgData || { name: 'Blagajna', tax_number: '', vat_registered: false },
          premiseId: premiseData?.premise_id || '',
          premiseAddress: premiseData ? [premiseData.address, [premiseData.post_code, premiseData.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
          deviceId: deviceData?.device_id || '',
          invoiceNumber: order.invoice_number || order.number || order.id.slice(-6),
          issueDate: new Date(order.closed_at),
          cashierName: cashierName,
          payment: { method: payment?.method || 'cash', furs_zoi: payment?.furs_zoi, furs_eor: payment?.furs_eor },
          lines: (lines||[]).map(l => ({
            name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price),
            vat_rate: Number(l.vat_rate ?? 22), total: Number(l.total || l.qty * l.unit_price), voided: l.voided,
          })),
          // DODANO (22.8.2026): klavzula o oprostitvi tudi pri PONOVNEM izpisu.
          // `order_lines` je ne hrani, zato jo vzamemo iz narocila (shranjena
          // ob placilu); pri starih racunih jo poiscemo v katalogu po item_id.
          vatExemptions: order.vat_exemption_text
            ? String(order.vat_exemption_text).split('\n').filter(Boolean)
            : Array.from(new Set(
                (lines || [])
                  .filter((l: any) => Number(l.vat_rate ?? 22) === 0)
                  .map((l: any) => {
                    const kat = posData?.items?.find((x: any) => x.id === l.item_id)
                    return vatExemptionText(kat?.vat_exemption_code, kat?.vat_exemption_custom_text)
                  })
                  .filter(Boolean)
              )) as string[],
          subtotal: Number(order.subtotal||0),
          discountAmount: Number(order.discount_amount||0),
          tip: Number(order.tip_amount||0),
          total: Number(order.total||0),
        })
        const result = await (window as any).electronAPI.printReceipt(html)
        if (result?.ok) return
        if (result?.error) alert('Napaka tiskalnika: ' + result.error)
        return
      } catch (e: any) { alert('Napaka IPC print: ' + e.message); return }
    }
    // Poskusi lokalni print server
    try {
      const res = await fetch('http://localhost:6789/health', { signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        const printData = {
          business_name: orgData?.name || 'Blagajna',
          business_address: [orgData?.address, [orgData?.post_code, orgData?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          tax_number: orgData?.tax_number || '',
          vat_id: orgData?.vat_registered ? `SI${orgData.tax_number}` : '',
          receipt_number: order.invoice_number || order.number || order.id.slice(-6),
          cashier: cashierName,
          date: order.closed_at ? new Date(order.closed_at).toLocaleString('sl-SI') : '—',
          items: (lines||[]).map(l => ({
            name: l.name,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price),
            vat_rate: Number(l.vat_rate ?? 22),
          })),
          subtotal: Number(order.subtotal),
          discount_pct: Number(order.discount_pct||0),
          discount_amount: Number(order.discount_amount||0),
          tip: Number(order.tip_amount||0),
          total: Number(order.total),
          payment_method: payment?.method,
          furs_zoi: payment?.furs_zoi,
          furs_eor: payment?.furs_eor,
        }
        const printRes = await fetch('http://localhost:6789/print/receipt', {
          // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
          // neodzivni storitvi visi, dokler je streznik sam ne prekine.
          signal: AbortSignal.timeout(3000),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(printData)
        })
        const result = await printRes.json()
        if (result.ok) return
        alert('Napaka tiskalnika: ' + result.error)
        return
      }
    } catch (e) {}

    // Fallback: browser print z lib/receipt.ts helperjem
    try {
      const html = await buildReceiptHTML({
        org: orgData || {
          name: posData?.businessName || 'Blagajna',
          tax_number: '',
          vat_registered: false,
        },
        premiseId: premiseData?.premise_id || '',
        premiseAddress: premiseData ? [premiseData.address, [premiseData.post_code, premiseData.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
        deviceId: deviceData?.device_id || '',
        invoiceNumber: order.invoice_number || order.number || order.id.slice(-6),
        issueDate: new Date(order.closed_at),
        cashierName: cashierName,
        payment: {
          method: payment?.method || 'cash',
          furs_zoi: payment?.furs_zoi,
          furs_eor: payment?.furs_eor,
        },
        lines: (lines||[]).map(l => ({
          name: l.name,
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
          vat_rate: Number(l.vat_rate ?? 22),
          total: Number(l.total || l.qty * l.unit_price),
          voided: l.voided,
        })),
        // Klavzula o oprostitvi tudi tu (22.8.2026) — glej opombo zgoraj.
        vatExemptions: order.vat_exemption_text
          ? String(order.vat_exemption_text).split('\n').filter(Boolean)
          : Array.from(new Set(
              (lines || [])
                .filter((l: any) => Number(l.vat_rate ?? 22) === 0)
                .map((l: any) => {
                  const kat = posData?.items?.find((x: any) => x.id === l.item_id)
                  return vatExemptionText(kat?.vat_exemption_code, kat?.vat_exemption_custom_text)
                })
                .filter(Boolean)
            )) as string[],
        subtotal: Number(order.subtotal||0),
        discountAmount: Number(order.discount_amount||0),
        tip: Number(order.tip_amount||0),
        total: Number(order.total||0),
      })
      const w = window.open('', '_blank', 'width=400,height=700')
      if (!w) return
      w.document.write(html)
      w.document.close()
    } catch (e) {
      console.error('Receipt print error:', e)
      alert('Napaka pri izpisu računa: ' + e.message)
    }
  }

  return (
    <div style={{ display:'flex', height:'100%', gap:0 }}>
      {/* Seznam */}
      <div style={{ width: selectedOrder ? 400 : '100%', borderRight: selectedOrder ? '1px solid '+T.line : 'none', display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid '+T.line, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Računi</div>
          <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
            {(auth?.user?.is_master || auth?.user?.role === 'Lastnik'
                ? [['today','Danes'],['week','Teden'],['month','Mesec'],['custom','Po meri'],['all','Vse']]
                : [['today','Danes']]
              ).map(([id,lbl])=>(
              <button key={id} onClick={()=>{setPeriod(id)}} style={{ padding:'5px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:period===id?T.accent:'transparent', color:period===id?'#fff':T.muted }}>
                {lbl}
              </button>
            ))}
            {period==='custom' && (
              <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:4 }}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{ padding:'4px 8px', borderRadius:7, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
                <span style={{ color:T.muted, fontSize:12 }}>—</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{ padding:'4px 8px', borderRadius:7, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
                <button onClick={loadOrders} style={{ padding:'4px 10px', borderRadius:7, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>Išči</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderBottom:'1px solid '+T.line, display:'flex', gap:10, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči po številki ali EOR..." style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none' }}/>
          <div style={{ fontSize:12, color:T.muted, whiteSpace:'nowrap' }}>
            {filtered.length} računov · €{totalFiltered.toFixed(2)}
            {stStorniranih > 0 && <span style={{ color:T.danger }}> · {stStorniranih} storn.</span>}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:T.muted }}>Nalagam...</div>
          ) : vrstice.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:T.muted }}>Ni računov za izbrano obdobje</div>
          ) : vrstice.map(v => {
            const o = v.o
            const payment = o.payments?.[0]
            const jeStorno = v.tip === 'storno'
            const isSelected = selectedOrder?.id === o.id

            // ── STORNO DOKUMENT — samostojna vrstica (19.8.2026) ──
            // Zakon zahteva, da se ob stornu izda NOV dokument z negativnimi
            // zneski. Doslej je bil viden samo precrtan izvirnik, storno pa
            // nikjer - stranka ga ni mogla dobiti, pri nadzoru pa se stevilo
            // dokumentov ni ujemalo s FURS.
            if (jeStorno) {
              return (
                <div key={o.id + '-storno'} onClick={()=>loadOrderDetail(o)}
                  style={{ padding:'12px 16px', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', background: isSelected ? 'rgba(168,50,50,0.06)' : 'rgba(168,50,50,0.03)', display:'flex', gap:12, alignItems:'center', borderLeft:'3px solid '+T.danger }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ color:T.danger }}>STORNO</span>
                      {v.stevilka
                        ? <span style={{ fontSize:11, color:T.muted, fontWeight:600 }}>{v.stevilka}</span>
                        : <span style={{ fontSize:10, color:T.muted }}>(številka ni na voljo)</span>}
                    </div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                      {v.cas ? new Date(v.cas).toLocaleString('sl-SI') : '—'}
                      {' · storno računa #'}{o.number || o.id.slice(-6)}
                      {o.void_reason ? ` · ${o.void_reason}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:15, fontVariantNumeric:'tabular-nums', color:T.danger }}>
                    −€{Number(o.total).toFixed(2)}
                  </div>
                </div>
              )
            }

            return (
              <div key={o.id} onClick={()=>loadOrderDetail(o)} style={{ padding:'12px 16px', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', background:isSelected?T.accentSoft:T.surface, display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, display:'flex', gap:8, alignItems:'center' }}>
                    <span>#{o.number || o.id.slice(-6)}</span>
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:T.chipBg, color:T.muted, fontWeight:600 }}>
                      {METHOD_LABELS[payment?.method] || '—'}
                    </span>
                    {/* DODANO (16.8.2026): oznaka storna. Prej je storniran racun
                        na seznamu izgledal enako kot veljaven - z zneskom in brez
                        opozorila; storno je bil viden sele ob odprtju. */}
                    {(o.status === 'voided' || o.voided_at) && (
                      <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'rgba(168,50,50,0.15)', color:T.danger, fontWeight:700 }}>
                        STORNIRAN
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                    {o.closed_at ? new Date(o.closed_at).toLocaleString('sl-SI') : '—'}
                  </div>
                </div>
                <div style={{ fontWeight:800, fontSize:15, fontVariantNumeric:'tabular-nums',
                  textDecoration:(o.status==='voided'||o.voided_at)?'line-through':'none',
                  color:(o.status==='voided'||o.voided_at)?T.muted:'inherit' }}>€{Number(o.total).toFixed(2)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {showVoid && selectedOrder && (
        <VoidModal
          order={selectedOrder}
          lines={orderLines}
          payment={orderPayment}
          posData={posData}
          auth={auth}
          onClose={()=>setShowVoid(false)}
          onVoided={()=>{
            setSelectedOrder(null)
            loadOrders()
            // DODANO (16.8.2026): osvezi tudi GLAVO (PROMET, RACUNI) in zalogo.
            // Prej se je osvezil samo seznam, glava pa je se naprej kazala
            // promet storniranega racuna - dnevni promet v glavi ni ustrezal
            // niti seznamu niti zakljucku blagajne.
            posData.refresh()
          }}
        />
      )}
      {showRefund && selectedOrder && (
        <RefundModal
          order={selectedOrder}
          lines={orderLines}
          payment={orderPayment}
          auth={auth}
          onClose={()=>setShowRefund(false)}
          onRefunded={()=>{ setSelectedOrder(null); loadOrders(); posData.refresh() }}
        />
      )}
      {showChangePayment && selectedOrder && orderPayment && (
        <ChangePaymentModal
          order={selectedOrder}
          payment={orderPayment}
          onClose={()=>setShowChangePayment(false)}
          onChanged={()=>{ loadOrders() }}
        />
      )}
      {/* Detail */}
      {selectedOrder && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>Račun #{selectedOrder.number || selectedOrder.id.slice(-6)}</div>
              <div style={{ fontSize:12, color:T.muted }}>{selectedOrder.closed_at ? new Date(selectedOrder.closed_at).toLocaleString('sl-SI') : '—'}</div>
            </div>
            <button onClick={async ()=>{
                if (typeof window !== 'undefined' && (window as any).electronAPI?.printRaw) {
                  // ESC/POS direktni print
                  // POPRAVLJENO (21.8.2026): `db` ni bil definiran - ponovni
                  // izpis racuna bi vrgel "db is not defined".
                  const db = createClient()
                  let orgData = null, premiseData = null, cashierName = ''
                  try {
                    const { data: { user } } = await db.auth.getUser()
                    if (user) {
                      const member = await getActiveMembership().then(m => m ? { org_id: m.org_id } : null) // POPRAVLJENO 16.8.2026: vec-org varno
                      if (member) {
                        const { data: org } = await db.from('organizations').select('*').eq('id', member.org_id).single()
                        orgData = org
                        const { data: premise } = await db.from('business_premises').select('*').eq('org_id', member.org_id).eq('is_active', true).limit(1).maybeSingle()
                        premiseData = premise
                      }
                      // POPRAVLJENO (16.8.2026): maybeSingle() bi vrgel napako pri
                      // uporabniku, ki je clan vec organizacij - omejimo na aktivno.
                      // POPRAVLJENO (24.8.2026): `org_members.display_name` ne obstaja.
                      const { data: me } = await db.from('staff').select('name')
                        .eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
                      cashierName = me?.name || ''   // e-naslova NE na davcni dokument
                    }
                  } catch {}
                  const pd = {
                    business_name: orgData?.name || 'Blagajna',
                    business_address: [orgData?.address, [orgData?.post_code, orgData?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
                    tax_number: orgData?.tax_number || '',
                    vat_id: orgData?.vat_registered ? 'SI'+(orgData?.tax_number||'') : '',
                    receipt_number: selectedOrder.invoice_number || selectedOrder.number || selectedOrder.id.slice(-6),
                    cashier: cashierName,
                    date: selectedOrder.closed_at ? new Date(selectedOrder.closed_at).toLocaleString('sl-SI') : '—',
                    items: (orderLines||[]).map((l:any) => ({ name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price), vat_rate: Number(l.vat_rate ?? 22) })),
                    subtotal: Number(selectedOrder.subtotal||0),
                    discount_amount: Number(selectedOrder.discount_amount||0),
                    tip: Number(selectedOrder.tip_amount||0),
                    total: Number(selectedOrder.total||0),
                    payment_method: orderPayment?.method,
                    furs_zoi: orderPayment?.furs_zoi,
                    furs_eor: orderPayment?.furs_eor,
                    premise_id: premiseData?.premise_id || '',
                    premise_address: premiseData ? [premiseData.address, [premiseData.post_code, premiseData.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
                    is_copy: true,
                  }
                  const r = await (window as any).electronAPI.printRaw(pd)
                  if (!r?.ok) alert('Napaka: ' + r?.error)
                } else {
                  printReceipt(selectedOrder, orderLines, orderPayment)
                }
              }}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
              🖨️ Ponovni izpis
            </button>
            {isToday(selectedOrder.closed_at) && !selectedOrder.voided_at && orderPayment && (
              <button onClick={()=>setShowChangePayment(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                💳 Spremeni plačilo
              </button>
            )}
            {/* POPRAVLJENO (16.8.2026, VARNOST): prej brez preverbe pravic -
                blagajnik z voidReceipt:false je lahko storniral racune. */}
            {isToday(selectedOrder.closed_at) && !selectedOrder.voided_at && auth?.permissions?.voidReceipt && (
              <button onClick={()=>setShowVoid(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(168,50,50,0.1)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                🗑️ Storno
              </button>
            )}
            {/* POPRAVLJENO (16.8.2026, VARNOST): prej brez preverbe pravic -
                blagajnik z refund:false je lahko izvajal vracila. */}
            {isToday(selectedOrder.closed_at) && !selectedOrder.voided_at && auth?.permissions?.refund && (
              <button onClick={()=>setShowRefund(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(37,99,235,0.1)', color:'#2563eb', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                ↩️ Vračilo
              </button>
            )}
            {selectedOrder.voided_at && (
              <div style={{ padding:'6px 12px', borderRadius:8, background:'rgba(168,50,50,0.08)', color:T.danger, fontSize:12, fontWeight:700 }}>
                ⛔ Storniran
              </div>
            )}
            {/* DODANO (19.8.2026): ponovni izpis STORNO dokumenta. Storno je
                samostojen dokument z lastno stevilko in ga stranka ob vracilu
                dobi - doslej ga je bilo mogoce natisniti SAMO v trenutku
                storniranja, kasneje nikoli vec. */}
            {selectedOrder.voided_at && (
              <button onClick={async ()=>{
                try {
                  const db = createClient()
                  const { data: { user } } = await db.auth.getUser()
                  let orgData = null, cashierName = ''
                  const member = await getActiveMembership()
                  if (member) {
                    const { data: org } = await db.from('organizations').select('*').eq('id', member.org_id).single()
                    orgData = org
                    if (user) {
                      // POPRAVLJENO (24.8.2026): `org_members.display_name` ne obstaja.
                      const { data: me } = await db.from('staff').select('name')
                        .eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
                      cashierName = me?.name || ''   // e-naslova NE na davcni dokument
                    }
                  }
                  const html = buildStornoReceiptHTML({
                    order: selectedOrder,
                    lines: orderLines,
                    payment: orderPayment,
                    org: orgData,
                    cashierName,
                    voidEor: selectedOrder.void_furs_eor,
                    voidZoi: selectedOrder.void_furs_zoi,
                    reason: selectedOrder.void_reason || 'Storno',
                    // POPRAVLJENO (25.8.2026): tu je pristal CEL ZAPIS iz
                    // `pos_invoice_numbers`, ne stevilka - na dokumentu je
                    // pisalo "[object Object]". Seznam hrani zapise, ker jih
                    // drugod uporabljamo v celoti; tu vzamemo le stevilko.
                    stornoNumber: stornoNumbers?.[selectedOrder.id]?.invoice_number ?? null,
                    vatExemptions: selectedOrder.vat_exemption_text
                      ? String(selectedOrder.vat_exemption_text).split('\n').filter(Boolean)
                      : [],
                  })
                  const w = window.open('', '_blank', 'width=380,height=700')
                  if (w) { w.document.write(html); w.document.close() }
                  else alert('Brskalnik je blokiral pojavno okno — dovolite pojavna okna za to stran.')
                } catch (e) {
                  alert('Storno dokumenta ni bilo mogoče pripraviti: ' + (e?.message || e))
                }
              }}
                style={{ padding:'7px 14px', borderRadius:8, border:'1px solid '+T.line, background:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                🖨️ Izpis storna
              </button>
            )}
            {selectedOrder.furs_required && !orderPayment?.furs_eor && (
              <button onClick={async()=>{
                try {
                  const res = await fetch('/api/furs/invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ order_id: selectedOrder.id, total: selectedOrder.total, premise_id: getActivePremise()?.id }) })
                  if (res.ok) { const d = await res.json(); alert('FURS potrjen! EOR: ' + d.eor); loadOrders() }
                  else alert('FURS napaka: ' + (await res.text()))
                } catch(e) { alert('FURS napaka: ' + e.message) }
              }} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(168,50,50,0.1)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>
                ⚠️ Potrdi FURS
              </button>
            )}
            <button onClick={()=>setSelectedOrder(null)} style={{ width:30, height:30, borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            {/* Plačilo info */}
            <div style={{ background:T.surface2, borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', gap:20 }}>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>Plačilna metoda</div>
                <div style={{ fontWeight:700, fontSize:14 }}>{METHOD_LABELS[orderPayment?.method] || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>Skupaj</div>
                <div style={{ fontWeight:700, fontSize:14 }}>€{Number(selectedOrder.total).toFixed(2)}</div>
              </div>
              {orderPayment?.furs_eor && (
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>EOR (FURS)</div>
                  <div style={{ fontWeight:600, fontSize:11, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis' }}>{orderPayment.furs_eor}</div>
                </div>
              )}
            </div>
            {/* Artikli */}
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>ARTIKLI</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                  {['Artikel','Kol.','Cena','Skupaj'].map((h,i)=>(
                    <th key={i} style={{ padding:'6px 8px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderLines.map((l,i)=>(
                  <tr key={l.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                    <td style={{ padding:'8px', fontSize:13, fontWeight:600 }}>{l.name}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontSize:13 }}>{l.qty}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontSize:13 }}>€{Number(l.unit_price).toFixed(2)}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontWeight:700, fontSize:13 }}>€{(Number(l.qty)*Number(l.unit_price)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedOrder.discount_pct > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px', color:T.accent, fontSize:13 }}>
                <span>Popust {selectedOrder.discount_pct}%</span>
                <span>-€{Number(selectedOrder.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 8px', fontWeight:800, fontSize:16, borderTop:'2px solid '+T.line, marginTop:8 }}>
              <span>SKUPAJ</span>
              <span>€{Number(selectedOrder.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ================================================================
// INVENTURA SCREEN
// ================================================================
function InventuraScreen({ posData, auth }) {
  const [sessions, setSessions] = React.useState<any[]>([])
  const [activeSession, setActiveSession] = React.useState<any>(null)
  const [lines, setLines] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [toast, setToast] = React.useState<any>(null)
  const [filter, setFilter] = React.useState('all') // all | differences | items | ingredients
  const [search, setSearch] = React.useState('')

  function showToast(msg: string, ok = true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  React.useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    setLoading(true)
    const { data } = await createClient()
      .from('inventory_sessions')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('created_at', { ascending: false })
      .limit(20)
    setSessions(data || [])
    setLoading(false)
  }

  async function openSession(data?: any) {
    if (data) {
      setActiveSession(data)
      await loadLines(data.id)
      return
    }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      // DODANO (16.8.2026): brez te preverbe je bilo mogoce odpreti VEC
      // inventur hkrati - vsaka bi ob zakljucku prepisala zalogo s svojimi
      // (starimi) stetji, kar bi izbrisalo rezultat prejsnje.
      const { data: openSess } = await createClient()
        .from('inventory_sessions')
        .select('id')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'open')
        .limit(1)
      if (openSess?.length) {
        showToast('Ena inventura je že odprta. Najprej jo zaključite ali izbrišite.', false)
        setSaving(false)
        return
      }

      // Ustvari novo sejo
      const { data: sess, error } = await createClient()
        .from('inventory_sessions')
        .insert({
          business_id: BUSINESS_ID,
          created_by: auth?.user?.name || 'Blagajnik',
          status: 'open',
        })
        .select()
        .single()
      if (error) throw error

      // Generiraj vrstice iz zaloge
      const allItems = posData.items.filter(i => i.stock !== null)
      const allIngr = posData.ingredients

      const itemLines = allItems.map(i => ({
        session_id: sess.id,
        item_type: 'item',
        item_id: i.id,
        item_name: i.name,
        unit: i.unit || 'kos',
        expected_qty: Number(i.stock || 0),
        actual_qty: null,
      }))
      const ingrLines = allIngr.map(i => ({
        session_id: sess.id,
        item_type: 'ingredient',
        item_id: i.id,
        item_name: i.name,
        unit: i.unit || 'kos',
        expected_qty: Number(i.stock_qty || 0),
        actual_qty: null,
      }))

      if (itemLines.length + ingrLines.length > 0) {
        const { error: lErr } = await createClient()
          .from('inventory_lines')
          .insert([...itemLines, ...ingrLines])
        if (lErr) throw lErr
      }

      await createClient()
        .from('inventory_sessions')
        .update({ total_items: itemLines.length + ingrLines.length })
        .eq('id', sess.id)

      setActiveSession(sess)
      await loadLines(sess.id)
      await loadSessions()
      showToast('Inventura odprta')
    } catch(e: any) { showToast(e.message, false) }
    setSaving(false)
  }

  async function loadLines(sessionId: string) {
    const { data } = await createClient()
      .from('inventory_lines')
      .select('*')
      .eq('session_id', sessionId)
      .order('item_type')
      .order('item_name')
    setLines(data || [])
  }

  async function updateActual(lineId: string, val: string) {
    const num = val === '' ? null : Number(val)
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, actual_qty: num } : l))
    await createClient()
      .from('inventory_lines')
      .update({ actual_qty: num })
      .eq('id', lineId)
  }

  async function closeSession() {
    if (!activeSession) return
    if (!confirm('Zaključi inventuro in posodobi zalogo?')) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const db = createClient()
      const counted = lines.filter(l => l.actual_qty !== null)
      let diffs = 0

      for (const line of counted) {
        const diff = line.actual_qty - line.expected_qty
        if (Math.abs(diff) > 0.001) diffs++
        // Posodobi zalogo
        // POPRAVLJENO (16.8.2026): prej se napake niso preverjale - ce je
        // posodobitev spodletela, je uporabnik vseeno dobil sporocilo
        // "zaloga posodobljena", inventura pa je bila oznacena kot zakljucena.
        const { error: upErr } = line.item_type === 'item'
          ? await db.from('items').update({ stock: line.actual_qty }).eq('id', line.item_id)
          : await db.from('ingredients').update({ stock_qty: line.actual_qty }).eq('id', line.item_id)
        if (upErr) throw new Error(`Napaka pri posodabljanju "${line.item_name}": ${upErr.message}`)
      }

      const { error: closeInvErr } = await db.from('inventory_sessions').update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        total_differences: diffs,
      }).eq('id', activeSession.id)
      // POPRAVLJENO (16.8.2026): prej brez preverbe - zaloge so bile posodobljene,
      // inventura pa je ostala odprta, uporabnik pa je videl "zakljucena".
      if (closeInvErr) throw new Error('Inventure ni bilo mogoče zaključiti: ' + closeInvErr.message)

      posData.refresh()
      setActiveSession(null)
      setLines([])
      await loadSessions()
      showToast(`Inventura zaključena — ${diffs} razlik, zaloga posodobljena`)
    } catch(e: any) { showToast(e.message, false) }
    setSaving(false)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const date = new Date().toLocaleDateString('sl-SI').replace(/\./g,'-')
    const exportLines = activeSession ? lines : []
    if (exportLines.length === 0 && !activeSession) {
      // Izvozi trenutno zalogo brez seje
      const rows = [
        ['Artikel', 'Tip', 'Enota', 'Evidenca', 'Dejansko', 'Razlika', 'Opomba'],
        ...posData.items.filter(i => i.stock !== null).map(i => [i.name, 'Artikel', i.unit||'kos', i.stock||0, '', '', '']),
        ...posData.ingredients.map(i => [i.name, 'Surovina', i.unit||'kos', i.stock_qty||0, '', '', '']),
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{wch:30},{wch:10},{wch:8},{wch:10},{wch:10},{wch:10},{wch:20}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventura')
      XLSX.writeFile(wb, `inventura-${date}.xlsx`)
      return
    }
    const rows = [
      ['Artikel', 'Tip', 'Enota', 'Evidenca', 'Dejansko', 'Razlika', 'Opomba'],
      ...exportLines.map(l => [
        l.item_name, l.item_type === 'item' ? 'Artikel' : 'Surovina',
        l.unit||'kos',
        Number(l.expected_qty||0),
        l.actual_qty !== null ? Number(l.actual_qty) : '',
        l.actual_qty !== null ? Number(l.actual_qty) - Number(l.expected_qty||0) : '',
        l.note || '',
      ])
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{wch:30},{wch:10},{wch:8},{wch:10},{wch:10},{wch:10},{wch:20}]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventura')
    XLSX.writeFile(wb, `inventura-${date}.xlsx`)
  }

  // Filtrirane vrstice
  const filteredLines = React.useMemo(() => {
    let l = lines
    if (filter === 'items') l = l.filter(x => x.item_type === 'item')
    if (filter === 'ingredients') l = l.filter(x => x.item_type === 'ingredient')
    if (filter === 'differences') l = l.filter(x => x.actual_qty !== null && Math.abs(Number(x.actual_qty) - Number(x.expected_qty||0)) > 0.001)
    if (filter === 'missing') l = l.filter(x => x.actual_qty === null)
    if (search) l = l.filter(x => x.item_name.toLowerCase().includes(search.toLowerCase()))
    return l
  }, [lines, filter, search])

  const stats = React.useMemo(() => {
    const counted = lines.filter(l => l.actual_qty !== null).length
    const diffs = lines.filter(l => l.actual_qty !== null && Math.abs(Number(l.actual_qty) - Number(l.expected_qty||0)) > 0.001).length
    const missing = lines.filter(l => l.actual_qty === null).length
    return { counted, diffs, missing, total: lines.length }
  }, [lines])

  // ── Prikaz preteklih sej
  if (!activeSession) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:T.bg }}>
        <div style={{ padding:'16px 20px', background:T.surface, borderBottom:'1px solid '+T.line, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:800 }}>Inventura</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>Preštej zalogo in popravi evidence</div>
          </div>
          <button onClick={exportExcel} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <KI name="print" size={13}/> Izvozi Excel (prazno)
          </button>
          <button onClick={() => openSession()} disabled={saving} style={{ ...btnP, display:'flex', alignItems:'center', gap:6 }}>
            {saving ? 'Odpiranje...' : '+ Nova inventura'}
          </button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:T.muted }}>Nalagam...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:T.muted, background:T.surface, borderRadius:14, border:'1px solid '+T.line }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:15, fontWeight:700, color:T.ink, marginBottom:6 }}>Ni inventur</div>
              <div style={{ fontSize:13 }}>Klikni "+ Nova inventura" da začneš štetje</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {sessions.map(s => {
                const isOpen = s.status === 'open'
                return (
                  <div key={s.id} style={{ padding:'16px 18px', background:T.surface, borderRadius:12, border:'1px solid '+(isOpen?T.accent:T.line), display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:11, background:isOpen?T.accentSoft:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                      {isOpen ? '📋' : '✅'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                        Inventura — {new Date(s.created_at).toLocaleDateString('sl-SI')}
                        {isOpen && <span style={{ fontSize:10, fontWeight:800, background:T.accent, color:'#fff', padding:'2px 7px', borderRadius:5 }}>ODPRTA</span>}
                      </div>
                      <div style={{ fontSize:12, color:T.muted, marginTop:3, display:'flex', gap:12 }}>
                        {s.created_by && <span>👤 {s.created_by}</span>}
                        <span>📦 {s.total_items || 0} artiklov</span>
                        {s.status === 'closed' && <span style={{ color:s.total_differences > 0 ? T.warn : T.accent }}>⚠️ {s.total_differences || 0} razlik</span>}
                        {s.closed_at && <span>Zaključeno: {new Date(s.closed_at).toLocaleDateString('sl-SI')}</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => openSession(s)} style={{ ...btnP, padding:'8px 16px', fontSize:12 }}>
                        {isOpen ? '▶ Nadaljuj' : '🔍 Poglej'}
                      </button>
                      <button onClick={async()=>{
                        if (!confirm('Izbrišem inventuro?')) return
                        // POPRAVLJENO (16.8.2026): prej brez preverbe napak - inventura
                        // je lahko ostala v seznamu, uporabnik pa je mislil, da je izbrisana.
                        const { error: linesErr } = await createClient().from('inventory_lines').delete().eq('session_id', s.id)
                        if (linesErr) { alert('Napaka pri brisanju vrstic: ' + linesErr.message); return }
                        const { error: sessErr } = await createClient().from('inventory_sessions').delete().eq('id', s.id)
                        if (sessErr) { alert('Napaka pri brisanju inventure: ' + sessErr.message); return }
                        await loadSessions()
                        showToast('Inventura izbrisana')
                      }} style={{ ...btnS, padding:'8px 10px', fontSize:12, color:T.danger }}>
                        <KI name="trash" size={14}/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
      </div>
    )
  }

  // ── Aktivna seja — vnos
  const isReadOnly = activeSession.status === 'closed'

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'12px 20px', background:T.surface, borderBottom:'1px solid '+T.line }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          <button onClick={() => { setActiveSession(null); setLines([]) }} style={{ ...btnS, padding:'6px 10px', fontSize:12 }}>
            ← Nazaj
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:16 }}>
              Inventura — {new Date(activeSession.created_at).toLocaleDateString('sl-SI')}
              {isReadOnly && <span style={{ fontSize:11, background:T.surface3, color:T.muted, padding:'2px 8px', borderRadius:5, marginLeft:8 }}>ZAKLJUČENA</span>}
            </div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
              {stats.counted}/{stats.total} prešteto · {stats.diffs} razlik · {stats.missing} manjka
            </div>
          </div>
          <button onClick={exportExcel} style={{ ...btnS, fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <KI name="print" size={13}/> Excel
          </button>
          {!isReadOnly && (
            <button onClick={closeSession} disabled={saving} style={{ padding:'9px 18px', borderRadius:9, border:'none', background:T.danger, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13, opacity:saving?0.7:1 }}>
              {saving ? 'Zaključujem...' : '✅ Zaključi in popravi zalogo'}
            </button>
          )}
        </div>
        {/* Stat chips */}
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {[
            ['all', 'Vse', stats.total, T.ink],
            ['items', 'Artikli', lines.filter(l=>l.item_type==='item').length, T.accent],
            ['ingredients', 'Surovine', lines.filter(l=>l.item_type==='ingredient').length, '#3a6e8f'],
            ['differences', 'Razlike', stats.diffs, T.warn],
            ['missing', 'Neprešteto', stats.missing, T.muted],
          ].map(([id, lbl, cnt, color]) => (
            <button key={String(id)} onClick={() => setFilter(String(id))}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid '+(filter===id?String(color):T.line), background:filter===id?String(color)+'15':'transparent', color:filter===id?String(color):T.muted, fontWeight:filter===id?700:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              {String(lbl)} {Number(cnt) > 0 && <b style={{ marginLeft:4 }}>{String(cnt)}</b>}
            </button>
          ))}
          <div style={{ marginLeft:'auto', position:'relative', maxWidth:240 }}>
            <div style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:T.muted }}><KI name="search" size={13}/></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Išči artikel..." style={{ width:'100%', padding:'6px 10px 6px 28px', borderRadius:8, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:12, background:T.inputBg, outline:'none', boxSizing:'border-box' as any }}/>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height:6, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:(stats.total > 0 ? stats.counted/stats.total*100 : 0)+'%', background:T.accent, borderRadius:999, transition:'width 0.3s' }}/>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:T.surface2, zIndex:1 }}>
            <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {['Artikel / surovina', 'Tip', 'Enota', 'Evidenca', 'Dejansko', 'Razlika', 'Opomba'].map((h,i) => (
                <th key={i} style={{ padding:'10px 12px', textAlign:i>=3?'right':i===6?'left':'left', borderBottom:'1px solid '+T.line, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLines.map((line, idx) => {
              const diff = line.actual_qty !== null ? Number(line.actual_qty) - Number(line.expected_qty||0) : null
              const hasDiff = diff !== null && Math.abs(diff) > 0.001
              const rowBg = idx%2 ? T.surface2 : T.surface
              const diffColor = diff === null ? T.muted : diff > 0 ? T.accent : diff < 0 ? T.danger : T.muted
              return (
                <tr key={line.id} style={{ background:hasDiff?'rgba(184,140,40,0.06)':rowBg, borderBottom:'1px solid '+T.lineSoft }}>
                  <td style={{ padding:'9px 12px', fontWeight:600, fontSize:13 }}>{line.item_name}</td>
                  <td style={{ padding:'9px 12px', fontSize:11 }}>
                    <span style={{ padding:'2px 7px', borderRadius:5, background:line.item_type==='item'?T.accentSoft:'rgba(58,110,143,0.1)', color:line.item_type==='item'?T.accent:'#3a6e8f', fontWeight:700, fontSize:10 }}>
                      {line.item_type==='item'?'Artikel':'Surovina'}
                    </span>
                  </td>
                  <td style={{ padding:'9px 12px', fontSize:12, color:T.muted }}>{line.unit}</td>
                  <td style={{ padding:'9px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:13 }}>
                    {Number(line.expected_qty||0).toFixed(line.unit==='kos'||line.unit===''?0:2)}
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}>
                    {isReadOnly ? (
                      <span style={{ fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums' }}>
                        {line.actual_qty !== null ? Number(line.actual_qty).toFixed(line.unit==='kos'?0:2) : '—'}
                      </span>
                    ) : (
                      <input
                        type="number" onFocus={e => e.target.select()}
                        min="0"
                        step={line.unit==='kos'?'1':'0.01'}
                        value={line.actual_qty !== null && line.actual_qty !== undefined ? line.actual_qty : ''}
                        placeholder="—"
                        onChange={e => updateActual(line.id, e.target.value)}
                        style={{ width:80, padding:'5px 8px', borderRadius:7, border:'1px solid '+(hasDiff?T.warn:T.line), fontFamily:'inherit', fontSize:13, textAlign:'right', background:hasDiff?'rgba(184,140,40,0.08)':T.inputBg, outline:'none', fontVariantNumeric:'tabular-nums' as any }}
                      />
                    )}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums', color:diffColor }}>
                    {diff === null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(line.unit==='kos'?0:2)}
                  </td>
                  <td style={{ padding:'6px 8px' }}>
                    {!isReadOnly ? (
                      <input
                        value={line.note||''}
                        onChange={async e => {
                          const note = e.target.value
                          setLines(prev => prev.map(l => l.id===line.id ? {...l,note} : l))
                          // POPRAVLJENO (16.8.2026): prej brez preverbe napake -
                          // opomba je izginila ob naslednjem nalaganju inventure.
                          const { error: noteErr } = await createClient().from('inventory_lines').update({ note }).eq('id', line.id)
                          if (noteErr) alert('Opombe ni bilo mogoče shraniti: ' + noteErr.message)
                        }}
                        placeholder="opomba..."
                        style={{ width:'100%', minWidth:100, padding:'4px 8px', borderRadius:6, border:'1px solid '+T.line, fontFamily:'inherit', fontSize:11, background:T.inputBg, outline:'none' }}
                      />
                    ) : (
                      <span style={{ fontSize:11, color:T.muted }}>{line.note||''}</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredLines.length === 0 && (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:T.muted }}>Ni vrstic za izbran filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}


// ================================================================
// INVENTURA SCREEN
// ================================================================
// ================================================================
// REPORTS SCREEN — real DB stats
// ================================================================
function ReportsScreen({ posData, auth, setScreen }) {
  const [period, setPeriod] = useState('today')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [showZReport, setShowZReport] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('all')

  useEffect(() => { loadReport(period) }, [period])

  async function loadReport(p) {
    setLoading(true)
    const now = new Date()
    let from, to
    // POPRAVLJENO (16.8.2026, POROCILA): obdobje se je racunalo po UTC, ne po
    // LOKALNEM casu. Slovenija je poleti 2 uri pred UTC, zato je "danes"
    // pomenilo okno od 02:00 do 01:59 naslednjega dne po lokalnem casu -
    // prodaja med polnocjo in 2. uro zjutraj (bar!) je v dnevnem porocilu
    // MANJKALA in se pojavila v vcerajsnjem. Zdaj meje po lokalnem casu.
    const zacetekDneva = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const konecDneva  = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    if (p === 'today') {
      from = zacetekDneva(now)
      to = konecDneva(now)
    } else if (p === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate()-1)
      from = zacetekDneva(y)
      to = konecDneva(y)
    } else if (p === 'week') {
      const w = new Date(now); w.setDate(w.getDate()-7)
      from = zacetekDneva(w)
      to = now
    } else if (p === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      to = now
    } else if (p === 'custom' && customFrom && customTo) {
      from = new Date(customFrom + 'T00:00:00')
      to = new Date(customTo + 'T23:59:59')
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      to = now
    }

    const db = createClient()
    const fromStr = from instanceof Date ? from.toISOString().replace('.000Z','Z').replace('.999Z','Z') : String(from)
    const toStr = to instanceof Date ? to.toISOString().replace('.000Z','Z').replace('.999Z','Z') : String(to)
    // Staff filter — za trenerje/terapevte
    const staffFilter = selectedStaffId !== 'all' ? selectedStaffId : null

    const [ordersRes, refundsRes, bookingsRes] = await Promise.all([
      db.from('orders')
        .select('id, closed_at, total, tip_amount, discount_amount')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'paid')
        .gte('closed_at', fromStr)
        .lte('closed_at', toStr),
      db.from('refunds')
        // POPRAVLJENO (19.8.2026): `created_at` v tabeli `refunds` ne obstaja,
        // pravi stolpec je `refunded_at`. Poizvedba je odpovedala, zato je
        // stran Porocila vedno kazala "Ni vracil v tem obdobju".
        .select('amount, reason, refunded_at')
        .eq('business_id', BUSINESS_ID)
        .gte('refunded_at', fromStr)
        .lte('refunded_at', toStr),
      staffFilter ? db.from('bookings')
        .select('id, start_at, duration_min, status, services(name, price)')
        .eq('business_id', BUSINESS_ID)
        .eq('staff_id', staffFilter)
        .gte('start_at', fromStr)
        .lte('start_at', toStr)
        .in('status', ['confirmed', 'arrived']) : Promise.resolve({ data: [] }),
    ])
    const staffBookings = (staffFilter ? bookingsRes.data : []) || []

    const orders = ordersRes.data || []
    const refunds = refundsRes.data || []

    // Izračuni
    let promet = 0, napitnine = 0, vracila = 0
    const byHour = {}
    const byMethod = { cash:0, card:0, bon:0, prep:0, other:0 }

    // Posebej pridobi payments za te orderje
    const orderIds = orders.map(o => o.id)
    let paymentsData = []
    if (orderIds.length > 0) {
      // POPRAVLJENO (19.8.2026): tu je bil izbran tudi stolpec `tip`, ki v
      // tabeli `payments` NE OBSTAJA. Poizvedba je zato odpovedala, plačila se
      // niso naložila in koda je spodaj padla na privzeto metodo 'cash' -
      // kartično plačilo se je v poročilu prikazalo kot GOTOVINA, napitnine pa
      // vedno kot 0. Znesek prometa je bil pravilen (iz orders.total), zato
      // napaka ni bila očitna.
      const { data: pd, error: pErr } = await db.from('payments')
        .select('order_id, amount, method')
        .in('order_id', orderIds)
      if (pErr) console.error('Napaka pri branju plačil za poročilo:', pErr.message)
      paymentsData = pd || []
    }
    const paymentsByOrder = {}
    paymentsData.forEach(p => {
      if (!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = []
      paymentsByOrder[p.order_id].push(p)
    })
    orders.forEach(o => {
      const payments = paymentsByOrder[o.id] || []
      const amt = payments.length > 0
        ? payments.reduce((s, p) => s + Number(p.amount || 0), 0)
        : Number(o.total || 0)
      // Napitnine: tabela `payments` stolpca za napitnino nima, zato so 0.
      // (Prej je bil bran neobstoječi `p.tip`.) Če bodo napitnine kdaj
      // uvedene, je treba dodati stolpec in ga tu prebrati.
      const tip = 0
      promet += amt
      napitnine += tip
      const h = new Date(o.closed_at).getHours()
      byHour[h] = (byHour[h] || 0) + amt
      const method = payments[0]?.method || 'cash'
      if (method === 'cash') byMethod.cash += amt
      else if (method === 'card') byMethod.card += amt
      else if (method === 'bon') byMethod.bon += amt
      else if (method === 'prep') byMethod.prep += amt
      else byMethod.other += amt
    })

    refunds.forEach(r => { vracila += Number(r.amount || 0) })

    // Top artikli iz order_lines
    const linesRes = await db.from('order_lines')
      .select('name, qty, unit_price, orders!inner(closed_at, status, business_id)')
      .eq('orders.business_id', BUSINESS_ID)
      .eq('orders.status', 'paid')
      .gte('orders.closed_at', fromStr)
      .lte('orders.closed_at', toStr)

    const itemMap = {}
    ;(linesRes.data || []).forEach(l => {
      const k = l.name
      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0 }
      itemMap[k].qty += Number(l.qty || 1)
      itemMap[k].total += Number(l.unit_price || 0) * Number(l.qty || 1)
    })
    const topItems = Object.values(itemMap).sort((a:any,b:any) => b.total - a.total).slice(0,5)

    const staffTotalMin = staffBookings.reduce((s:any, b:any) => s + (b.duration_min||60), 0)
    const staffTotalRevenue = staffBookings.reduce((s:any, b:any) => s + (b.services?.price||0), 0)

    setReportData({
      promet, napitnine, vracila,
      racuni: orders.length,
      byHour, byMethod, topItems, refunds, from, to,
      staffBookings, staffTotalMin, staffTotalRevenue,
      isStaffFiltered: !!staffFilter,
    })
    setLoading(false)
  }

  const periodLabel = { today:'Danes', yesterday:'Včeraj', week:'Zadnjih 7 dni', month:'Ta mesec', custom:'Po meri' }

  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted }}>Nalagam poročilo...</div>
  if (!reportData) return null

  const { promet, napitnine, vracila, racuni, byHour, byMethod, topItems, refunds } = reportData
  const maxHour = Math.max(...Object.values(byHour).map(Number), 1)
  const maxMethod = Math.max(...Object.values(byMethod).map(Number), 1)
  const maxItem = Math.max(...(topItems as any[]).map((i:any) => i.total), 1)

  const hours = Array.from({length:24}, (_,i) => i).filter(h => byHour[h])

  return (
    <div style={{ flex:1, overflow:'auto', padding:20, background:T.bg }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em' }}>POROČILO · {(periodLabel[period]||'').toUpperCase()}</div>
          <div style={{ fontSize:22, fontWeight:800, marginTop:2 }}>
            {period==='today' ? new Date().toLocaleDateString('sl-SI', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : periodLabel[period]}
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {/* Filter po trenerju */}
          {posData.staffList.filter((s:any) => s.role === 'Trener' || s.role === 'Terapevt').length > 0 && (
            <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit', background:T.surface, cursor:'pointer' }}>
              <option value="all">Vsi zaposleni</option>
              {posData.staffList.filter((s:any) => s.role === 'Trener' || s.role === 'Terapevt' || s.role === 'Fizioterapevt').map((s:any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          )}
          <button onClick={()=>setShowPeriodModal(true)} style={{ ...btnS, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
            <KI name="calendar" size={13}/> Spremeni obdobje
          </button>
          <button onClick={()=>setShowZReport(true)} style={{ ...btnP, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
            <KI name="print" size={13}/> Z-poročilo (zaključi izmeno)
          </button>
        </div>
      </div>

      {/* Stat kartice */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          ['PROMET', eur(promet), promet>0?'+'+Math.round(promet/100)+'% glede na včeraj':'danes'],
          ['RAČUNI', racuni, 'povp. '+eur(racuni>0?promet/racuni:0)],
          ['NAPITNINE', eur(napitnine), (promet>0?(napitnine/promet*100).toFixed(2):0)+'% prometa'],
          ['VRAČILA', eur(vracila), refunds.length+' transakcij'],
        ].map(([l,v,s]) => (
          <div key={String(l)} style={{ padding:'14px 16px', background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:800, marginTop:6, fontVariantNumeric:'tabular-nums', color: l==='VRAČILA'&&vracila>0?T.danger:T.ink }}>{v}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12, marginBottom:12 }}>
        {/* Promet po urah */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>PROMET PO URAH</div>
          {hours.length === 0 ? (
            <div style={{ fontSize:13, color:T.muted, padding:'20px 0' }}>Ni podatkov za izbrano obdobje</div>
          ) : (
            <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
              {hours.map(h => {
                const val = byHour[h] || 0
                const pct = val / maxHour
                return (
                  <div key={h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, color:T.muted, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{eur(val)}</div>
                    <div style={{ width:'100%', background:T.accent, borderRadius:'4px 4px 0 0', height:Math.max(pct*80, 4) }}/>
                    <div style={{ fontSize:9, color:T.muted }}>{h}:00</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Plačila po metodah */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>PLAČILA PO METODAH</div>
          {[
            ['Kartica', byMethod.card, '#1f6b3a'],
            ['Gotovina', byMethod.cash, '#b88c28'],
            ['Boni', byMethod.bon, '#634896'],
            ['Ostalo', byMethod.other + byMethod.prep, '#64748b'],
          ].filter(([,v]) => Number(v) > 0).map(([label, val, color]) => (
            <div key={String(label)} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, marginBottom:5 }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric:'tabular-nums' }}>
                  {eur(Number(val))} <span style={{ color:T.muted, fontWeight:400 }}>{promet>0?Math.round(Number(val)/promet*100):0}%</span>
                </span>
              </div>
              <div style={{ height:8, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                <div style={{ height:'100%', width:(Number(val)/maxMethod*100)+'%', background:String(color), borderRadius:999 }}/>
              </div>
            </div>
          ))}
          {Object.values(byMethod).every(v => v === 0) && <div style={{ fontSize:13, color:T.muted }}>Ni plačil</div>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12 }}>
        {/* Top artikli */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>NAJBOLJ PRODAJANI ARTIKLI</div>
          {(topItems as any[]).length === 0 ? (
            <div style={{ fontSize:13, color:T.muted }}>Ni podatkov</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>
                  <th style={{ textAlign:'left', padding:'0 0 10px', letterSpacing:'0.06em' }}>Artikel</th>
                  <th style={{ textAlign:'right', padding:'0 0 10px', letterSpacing:'0.06em' }}>Količina</th>
                  <th style={{ textAlign:'right', padding:'0 0 10px', letterSpacing:'0.06em' }}>Prihodek</th>
                  <th style={{ width:100 }}/>
                </tr>
              </thead>
              <tbody>
                {(topItems as any[]).map((item:any) => (
                  <tr key={item.name} style={{ borderTop:'1px solid '+T.line }}>
                    <td style={{ padding:'10px 0', fontSize:13, fontWeight:600 }}>{item.name}</td>
                    <td style={{ padding:'10px 0', fontSize:13, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{item.qty}</td>
                    <td style={{ padding:'10px 0', fontSize:13, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{eur(item.total)}</td>
                    <td style={{ padding:'10px 0 10px 12px' }}>
                      <div style={{ height:6, background:T.surface3, borderRadius:999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:(item.total/maxItem*100)+'%', background:T.accent, borderRadius:999 }}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Vračila */}
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>VRAČILA</div>
          {refunds.length === 0 ? (
            <div style={{ fontSize:13, color:T.muted }}>Ni vračil v tem obdobju</div>
          ) : refunds.map((r:any, i:number) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i<refunds.length-1?'1px solid '+T.line:'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.danger }}>RAČ-{String(r.orders?.id||'').slice(-4).toUpperCase()}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                  {new Date(r.refunded_at).toLocaleString('sl-SI', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}
                  {r.reason && <> · <i>"{r.reason}"</i></>}
                </div>
              </div>
              <div style={{ fontWeight:800, color:T.danger, fontVariantNumeric:'tabular-nums' }}>−{eur(r.amount)}</div>
            </div>
          ))}
          {/* POPRAVLJENO (16.8.2026): gumb ni imel nobenega dejanja - klik nanj
              se ni zgodilo nic, brez okna in brez sporocila. Vracilo se izvede
              nad KONKRETNIM racunom, zato vodi na zaslon Racuni, kjer se racun
              izbere in nato vrne. */}
          <button onClick={()=>setScreen?.('orders')}
            style={{ ...btnS, width:'100%', marginTop:12, fontSize:12 }}>
            ↩ Novo vračilo — izberi račun
          </button>
        </div>
      </div>

      {/* Porocilo trenerja */}
      {reportData?.isStaffFiltered && (
        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>
            TERMINI TRENERJA/TERAPEVTA
          </div>
          {reportData.staffBookings.length === 0 ? (
            <div style={{ fontSize:13, color:T.muted }}>Ni terminov v tem obdobju</div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
                {[
                  ['TERMINI', reportData.staffBookings.length, 'opravljenih'],
                  ['URE', (reportData.staffTotalMin/60).toFixed(1), 'skupaj ur'],
                  ['PRIHODEK', eur(reportData.staffTotalRevenue), 'od storitev'],
                ].map(([l,v,s]) => (
                  <div key={String(l)} style={{ padding:'12px 14px', background:T.surface2, borderRadius:10, border:'1px solid '+T.line }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:24, fontWeight:800, marginTop:4 }}>{v}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{s}</div>
                  </div>
                ))}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                    {['Datum', 'Storitev', 'Trajanje', 'Status', 'Cena'].map((h,i) => (
                      <th key={i} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.staffBookings.map((b:any, i:number) => (
                    <tr key={b.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                      <td style={{ padding:'8px 10px', fontSize:12 }}>{new Date(b.start_at).toLocaleDateString('sl-SI')}</td>
                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{b.services?.name || '—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontSize:12 }}>{b.duration_min || 60} min</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background: b.status==='arrived'?T.accentSoft:'rgba(184,140,40,0.1)',
                          color: b.status==='arrived'?T.accent:T.warn }}>
                          {b.status==='arrived'?'Prišel':'Potrjeno'}
                        </span>
                      </td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700 }}>{eur(b.services?.price||0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      {showZReport && <ZReportModal posData={posData} onClose={()=>setShowZReport(false)}/>}


      {/* Period modal */}
      {showPeriodModal && (
        <Modal open onClose={()=>setShowPeriodModal(false)} width={340}>
          <ModalHeader title="Izberi obdobje" onClose={()=>setShowPeriodModal(false)}/>
          <div style={{ padding:'16px 20px' }}>
            {[['today','Danes'],['yesterday','Včeraj'],['week','Zadnjih 7 dni'],['month','Ta mesec']].map(([id,lbl]) => (
              <button key={id} onClick={()=>{setPeriod(id);setShowPeriodModal(false)}} style={{ width:'100%', padding:'11px 14px', borderRadius:9, marginBottom:6, background: period===id?T.accentSoft:T.surface2, border:'1px solid '+(period===id?T.accent:T.line), cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: period===id?700:500, textAlign:'left', color: period===id?T.accent:T.ink }}>
                {lbl}
              </button>
            ))}
            <div style={{ marginTop:8, borderTop:'1px solid '+T.line, paddingTop:12 }}>
              <div style={{ fontSize:12, color:T.muted, marginBottom:8 }}>Po meri:</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit' }}/>
                <span style={{ color:T.muted }}>–</span>
                <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, fontSize:12, fontFamily:'inherit' }}/>
              </div>
              <button onClick={()=>{if(customFrom&&customTo){setPeriod('custom');setShowPeriodModal(false)}}} style={{ ...btnP, width:'100%', marginTop:8, fontSize:12 }}>Potrdi</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ================================================================
// ADMIN SCREEN — full CRUD
// ================================================================

/**
 * INTERNI AKT V BLAGAJNI (prestavljeno v nastavitve 25.8.2026).
 *
 * Ob nadzoru mora zavezanec akt predloziti na zahtevo. Prej je bil gumb v
 * orodni vrstici, kjer je zasedal prostor, uporabi pa se redko. Zdaj je med
 * nastavitvami, poleg FURS in DDV, kamor po vsebini sodi.
 *
 * Prikazemo SPREJETO razlicico, ne trenutnega stanja - akt velja v obliki, v
 * kateri je bil sprejet.
 */
function InterniAktSection({ posData }) {
  const [akt, setAkt] = React.useState<any>(null)
  const [nalagam, setNalagam] = React.useState(true)

  React.useEffect(() => {
    const orgId = posData?.org?.id
    if (!orgId) { setNalagam(false); return }
    ;(async () => {
      const { data } = await createClient().from('internal_acts')
        .select('content_html, version, adopted_date, submitted_at')
        .eq('org_id', orgId).is('superseded_at', null).maybeSingle()
      setAkt(data || null)
      setNalagam(false)
    })()
  }, [posData?.org?.id])

  function odpri() {
    if (!akt) return
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) return
    const opomba = akt.submitted_at
      ? `Oddan v eDavke ${new Date(akt.submitted_at).toLocaleDateString('sl-SI')}.`
      : 'OPOZORILO: ni označen kot oddan v eDavke.'
    w.document.write(`<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8">
      <title>Interni akt</title><style>${SLOG_AKTA}
      body{margin:0;padding:32px;background:#fff}
      .vrh{position:sticky;top:0;background:#0D1F12;padding:10px;display:flex;gap:8px;justify-content:center;margin:-32px -32px 20px}
      .vrh button{padding:9px 20px;border:0;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer}
      .meta{font-size:11px;color:#666;text-align:center;margin-bottom:18px}
      </style></head><body>
      <div class="vrh noprint">
        <button onclick="window.print()" style="background:#fff;color:#0D1F12">Natisni</button>
        <button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)">Zapri</button>
      </div>
      <div class="meta noprint">Različica ${akt.version} · sprejet ${new Date(akt.adopted_date).toLocaleDateString('sl-SI')} · ${opomba}</div>
      ${akt.content_html}</body></html>`)
    w.document.close()
  }

  if (nalagam) return <div style={{ color:T.muted, fontSize:13 }}>Nalagam…</div>

  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Interni akt</div>
      <div style={{ fontSize:12, color:T.muted, marginBottom:18, lineHeight:1.6, maxWidth:560 }}>
        Akt o popisu poslovnih prostorov in številčenju računov. Ob nadzoru ga
        odprete in natisnete tukaj — brez iskanja po portalu.
      </div>

      {akt ? (
        <>
          <div style={{ padding:'14px 16px', borderRadius:10, background:T.accentSoft, marginBottom:14, maxWidth:560 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.accent }}>
              Različica {akt.version} · sprejet {new Date(akt.adopted_date).toLocaleDateString('sl-SI')}
            </div>
            <div style={{ fontSize:12, color:T.accent, marginTop:3 }}>
              {akt.submitted_at
                ? `Oddan v eDavke ${new Date(akt.submitted_at).toLocaleDateString('sl-SI')}.`
                : 'Še ni označen kot oddan v eDavke.'}
            </div>
          </div>
          <button onClick={odpri} style={btnP}>📜 Odpri in natisni</button>
        </>
      ) : (
        <div style={{ padding:'14px 16px', borderRadius:10, background:'rgba(184,140,40,0.1)', border:'1px solid rgba(184,140,40,0.3)', fontSize:13, lineHeight:1.6, color:'#8A5A00', maxWidth:560 }}>
          <strong>Interni akt še ni sprejet.</strong><br/>
          Sprejmete ga v portalu: Nastavitve → Davčna blagajna → Interni akt.
          Oddati ga je treba v eDavke pred izdajo prvega računa.
        </div>
      )}
    </div>
  )
}

function AdminScreen({ auth, posData }) {
  const isOwner = !!(auth?.user?.is_master || auth?.user?.role === 'Lastnik')
  const [section, setSection] = useState(isOwner ? 'staff' : 'profile')
  const supabase = createClient()

  const allSections = [
    { id:'profile',    label:'Tip poslovanja',        icon:'home'     },
    { id:'staff',      label:'Zaposleni & PIN',       icon:'users',   ownerOnly:true },
    { id:'spaces',     label:'Prostori & Mize',       icon:'chair',   ownerOnly:true },
    { id:'categories', label:'Kategorije & Artikli',  icon:'grid'     },
    { id:'storitve',   label:'Storitve & Paketi',      icon:'calendar' },
    { id:'happyhour',  label:'Happy hour',            icon:'happy'    },
    { id:'kuhinja',    label:'Kuhinja & display',     icon:'receipt'  },
    { id:'autolock',   label:'Avt. zaklepanje',       icon:'pin'      },
    { id:'furs',       label:'FURS & DDV',            icon:'receipt', ownerOnly:true },
    { id:'akt',        label:'Interni akt',           icon:'file',    ownerOnly:true },
    { id:'inventura',  label:'Inventura',             icon:'scale'    },
  ]
  const sections = allSections.filter(sec => !sec.ownerOnly || isOwner)

  return (
    <div style={{ flex:1, display:'flex', minHeight:0 }}>
      <div style={{ width:220, background:T.surface, borderRight:'1px solid '+T.line, padding:12, flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', padding:'8px 10px' }}>Nastavitve</div>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{ width:'100%', padding:'10px 12px', borderRadius:9, marginBottom:2, background: section===s.id?T.accentSoft:'transparent', color: section===s.id?T.accent:T.ink, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight: section===s.id?700:500, display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
            <KI name={s.icon} size={15}/> {s.label}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:24, background:T.bg }}>
        {section==='staff'      && <StaffSection posData={posData}/>}
        {section==='categories' && <CatalogSection posData={posData}/>}
        {section==='spaces'     && <SpacesSection posData={posData}/>}
        {section==='storitve'   && <StoritveInPaketiSection posData={posData}/>}
        {section==='happyhour'  && <HappyHourSection posData={posData}/>}
        {section==='kuhinja'    && <KuhinjaSection posData={posData}/>}
        {section==='autolock'   && <AutolockSection auth={auth}/>}
        {section==='furs'       && <FursSection/>}
        {section==='akt'        && <InterniAktSection posData={posData}/>}
        {section==='profile'    && <ProfileSection posData={posData}/>}
        {section==='inventura'  && <InventuraScreen posData={posData} auth={auth}/>}
      </div>
    </div>
  )
}

// ─── Staff CRUD ────────────────────────────────────────────────
function StaffSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const COLORS = ['#1f6b3a','#3a6e8f','#c26a3a','#7b61b8','#c76a98','#a83232','#e9b949','#1a1f1a']

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno', false); return }
    if (!modal?.pin?.trim()) { showToast('PIN je obvezen', false); return }
    if (!modal.role) { showToast('Vloga je obvezna', false); return }
    // DODANO (16.8.2026): preverba PIN-a PRED shranjevanjem. Prej je enolicnost
    // ujela sele baza in vrnila surovo anglesko napako
    // ("duplicate key value violates unique constraint idx_staff_pin"), ki
    // uporabniku ne pove nicesar.
    if (!/^\d{1,4}$/.test(String(modal.pin).trim())) { showToast('PIN mora imeti od 1 do 4 številke', false); return }
    if (/^(\d)\1+$/.test(String(modal.pin).trim())) { showToast('PIN naj ne bo sestavljen iz enakih številk', false); return }
    const zaseden = (posData.staffList || []).some((o: any) => String(o.pin) === String(modal.pin).trim() && o.id !== modal.id)
    if (zaseden) { showToast('Ta PIN že uporablja druga oseba. Izberite drugega.', false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      if (modal.id) {
        const { error } = await createClient().from('staff').update({ name:modal.name, role:modal.role, pin:modal.pin, color:modal.color }).eq('id', modal.id)
        if (error) throw error
      } else {
        const { error } = await createClient().from('staff').insert({ business_id:BUSINESS_ID, name:modal.name, role:modal.role, pin:modal.pin, color:modal.color||'#3a6e8f', active:true })
        if (error) throw error
      }
      setModal(null)
      posData.refresh()
      showToast(modal.id ? 'Zaposleni posodobljen' : 'Zaposleni dodan')
    } catch(e) { showToast(e.message, false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem ${name}?`)) return
    const { error: staffErr } = await createClient().from('staff').update({ active:false }).eq('id', id)
    if (staffErr) { showToast('Zaposlenega ni bilo mogoče deaktivirati: ' + staffErr.message, false); return }
    posData.refresh()
    showToast('Zaposleni izbrisan')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Zaposleni & PIN</div>
        <button onClick={() => setModal({ color:'#3a6e8f', role:'Blagajnik' })} style={btnP}>+ Dodaj zaposlenega</button>
      </div>

      {posData.staffList.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni zaposlenih — dodajte prvega</div>
      ) : posData.staffList.map(s => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:14, borderRadius:10, marginBottom:8, background:T.surface, border:'1px solid '+T.line }}>
          <div style={{ width:40, height:40, borderRadius:999, background:s.color||T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
            {s.name.split(' ').map(w=>w[0]).join('')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
            <div style={{ fontSize:11, color:T.muted }}>{s.role}</div>
          </div>
          <div style={{ padding:'5px 10px', borderRadius:7, background:T.surface3, fontFamily:'monospace', fontSize:14, fontWeight:700, letterSpacing:'0.15em' }}>
            {'•'.repeat(s.pin?.length - 1)}{s.pin?.slice(-1)}
          </div>
          <button onClick={() => setModal({...s})} style={btnS}><KI name="edit" size={14}/></button>
          <button onClick={() => remove(s.id, s.name)} style={{ ...btnS, color:T.danger }}><KI name="trash" size={14}/></button>
        </div>
      ))}

      <Modal open={!!modal} onClose={() => setModal(null)} width={420}>
        <ModalHeader title={modal?.id ? 'Uredi zaposlenega' : 'Nov zaposleni'} onClose={() => setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime in priimek *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Ana Novak" style={inp} autoFocus/>
          </Field>
          <Field label="Vloga *">
            <select value={modal?.role||'Blagajnik'} onChange={e=>setModal(p=>({...p,role:e.target.value}))} style={inp}>
              {Object.keys(CFG.rolePresets).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="PIN koda (1-4 mesta) *">
            <input value={modal?.pin||''} onChange={e=>setModal(p=>({...p,pin:e.target.value.replace(/\D/g,'').substring(0,4)}))} placeholder="1234" style={{ ...inp, fontFamily:'monospace', letterSpacing:8, fontSize:20 }} maxLength={4}/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORS.map(c => (
                <div key={c} onClick={()=>setModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: modal?.color===c ? '3px solid #0D1F12' : '3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{ ...btnP, opacity:saving?0.6:1 }}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Emoji Picker ─────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label:'Pijača',    emojis:['🍺','🍻','🍷','🥂','🍾','🥃','🍸','🍹','🧃','🥤','🧋','☕','🍵','🫖','🧉','🍶','🧊','🥛','🍯'] },
  { label:'Hrana',     emojis:['🍕','🍔','🌮','🌯','🥙','🥗','🍜','🍝','🍲','🥘','🫕','🥩','🍖','🍗','🥓','🧆','🥚','🍳','🥞','🧇','🥐','🥖','🫓','🧀','🥗','🫙','🍱','🥪','🌭','🥨','🍟','🧈'] },
  { label:'Sladko',    emojis:['🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍦','🍨','🍧','🍮','🥧'] },
  { label:'Fitnes',    emojis:['💪','🏋️','🤸','🧘','🏃','🚴','🏊','⚽','🏀','🎾','🥊','🏆','🎯','🧗','🏄','🤾'] },
  { label:'Zdravje',   emojis:['💆','🧖','💅','💊','🩺','🩹','🫀','🧬','🌿','🧴','🛁','💈'] },
  { label:'Storitve',  emojis:['✂️','🪥','🧹','🔑','🪴','📋','🗓️','⏰','📞','💻','🖨️','📱'] },
  { label:'Ostalo',    emojis:['🎫','🎁','🛍️','📦','⭐','🌟','✨','🔖','🏷️','💰','💳','🧾','🪙'] },
]

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(0)
  return (
    <div style={{ position:'relative' }}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{ width:52, height:52, borderRadius:10, border:'1px solid rgba(0,0,0,0.15)', background:'#fff', fontSize:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {value||'📦'}
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:100 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:101, background:'#fff', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,0.2)', border:'1px solid rgba(0,0,0,0.08)', width:300, padding:10 }}>
            <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' }}>
              {EMOJI_GROUPS.map((g,i)=>(
                <button key={i} onClick={()=>setGroup(i)} style={{ padding:'3px 8px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:600, background:group===i?'#0D1F12':'#f0ede8', color:group===i?'#fff':'#666' }}>{g.label}</button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:3 }}>
              {EMOJI_GROUPS[group].emojis.map(e=>(
                <button key={e} onClick={()=>{ onChange(e); setOpen(false) }} style={{ width:32, height:32, border:'none', background:'transparent', cursor:'pointer', fontSize:18, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}
                  onMouseEnter={ev=>ev.target.style.background='#f0ede8'} onMouseLeave={ev=>ev.target.style.background='transparent'}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Catalog (Kategorije + Artikli) CRUD ──────────────────────
// ─── Uvoz cenika (AI) ─────────────────────────────────────────
function CenikImportModal({ onClose, posData }) {
  const fileRef = useRef(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  function compressImage(dataUrl) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.onload = () => {
        const maxSize = 1600
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = dataUrl
    })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let body
      if (isPdf) {
        const maxBytes = 4 * 1024 * 1024
        if (file.size > maxBytes) {
          setError(`PDF je prevelik (${(file.size / 1024 / 1024).toFixed(1)}MB). Največja velikost je 4MB.`)
          setProcessing(false)
          return
        }
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
        }
        const pdfBase64 = btoa(binary)
        body = { pdfBase64 }
      } else {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target.result)
          reader.readAsDataURL(file)
        })
        const compressed = await compressImage(dataUrl)
        body = { image: compressed.split(',')[1], mediaType: 'image/jpeg' }
      }
      const res = await fetch('/api/pos/parse-cenik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Napaka pri branju cenika')
        setProcessing(false)
        return
      }
      setItems((data.items || []).map((it) => ({
        name: it.name || '',
        category: it.category || '',
        unit: it.unit || 'kos',
        price: Number(it.price) || 0,
        vat_rate: Number(it.vat_rate) ?? 22,
        selected: true,
      })))
    } catch (e) {
      setError('Napaka: ' + e.message)
    }
    setProcessing(false)
  }

  function updateItem(i, field, value) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function toggleAll(selected) {
    setItems(prev => prev.map(it => ({ ...it, selected })))
  }

  async function saveAll() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const toInsert = items.filter(it => it.selected && it.name.trim())
      if (toInsert.length === 0) {
        setError('Izberite vsaj en izdelek')
        setSaving(false)
        return
      }
      // DODANO (16.8.2026): opozorilo pred podvojitvijo - dvakraten uvoz istega
      // cenika je prej tiho ustvaril podvojene artikle z istim imenom, kar
      // zmede blagajnika pri prodaji in popaci porocila po artiklih.
      const obstojeca = new Set((posData.items || []).filter((i:any) => !i.archived).map((i:any) => (i.name || '').trim().toLowerCase()))
      const podvojeni = toInsert.filter(it => obstojeca.has(it.name.trim().toLowerCase()))
      if (podvojeni.length > 0) {
        const seznam = podvojeni.slice(0, 5).map(it => '• ' + it.name.trim()).join('\n')
        const vec = podvojeni.length > 5 ? `\n… in še ${podvojeni.length - 5}` : ''
        if (!confirm(`${podvojeni.length} izdelkov s tem imenom že obstaja:\n\n${seznam}${vec}\n\nČe nadaljujete, bodo dodani še enkrat (podvojeni). Nadaljujem?`)) {
          setSaving(false)
          return
        }
      }

      // Poiščemo ali ustvarimo kategorije po imenu
      const sb = createClient()
      const categoryNames = [...new Set(toInsert.map(it => it.category.trim()).filter(Boolean))]
      const categoryMap = {}
      for (const catName of categoryNames) {
        const existing = posData.categories.find(c => c.name?.toLowerCase() === catName.toLowerCase())
        if (existing) {
          categoryMap[catName] = existing.id
        } else {
          const { data: newCat, error: catErr } = await sb.from('categories').insert({
            business_id: BUSINESS_ID, name: catName, color: '#1f6b3a', icon: '📦', sort_order: posData.categories.length,
          }).select('id').single()
          if (!catErr && newCat) categoryMap[catName] = newCat.id
        }
      }

      const { error: insertError } = await sb.from('items').insert(
        toInsert.map(it => ({
          business_id: BUSINESS_ID,
          category_id: it.category.trim() ? (categoryMap[it.category.trim()] ?? null) : null,
          name: it.name.trim(),
          price: it.price,
          unit: it.unit || 'kos',
          vat_rate: it.vat_rate,
          item_type: 'simple',
          archived: false,
        }))
      )
      if (insertError) {
        setError('Napaka pri shranjevanju: ' + insertError.message)
        setSaving(false)
        return
      }
      posData.refresh()
      onClose()
    } catch (e) {
      setError('Napaka: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>📷 Uvozi artikle iz cenika</div>
          <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 20, cursor: 'pointer', color: '#aaa' }}>×</button>
        </div>

        {items.length === 0 ? (
          <div>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
              Naložite fotografijo ali PDF vašega cenika — AI bo samodejno prepoznal izdelke, kategorije in cene.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: 48, textAlign: 'center', cursor: 'pointer', background: '#FAFAF8' }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {processing ? 'Analiziram cenik...' : 'Kliknite ali povlecite sliko / PDF cenika'}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Podprte: JPG, PNG, PDF</div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{ display: 'none' }} />
            </div>
            {error && <div style={{ marginTop: 16, fontSize: 13, color: '#DC2626' }}>{error}</div>}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Najdenih {items.length} izdelkov — preverite pred shranjevanjem</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleAll(true)} style={{ fontSize: 12, color: '#1D9E75', background: 'none', border: 0, cursor: 'pointer' }}>Izberi vse</button>
                <button onClick={() => toggleAll(false)} style={{ fontSize: 12, color: '#888', background: 'none', border: 0, cursor: 'pointer' }}>Počisti</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '45vh', overflowY: 'auto' }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 2fr 1fr 70px 60px 60px 24px', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <input type="checkbox" checked={it.selected} onChange={e => updateItem(i, 'selected', e.target.checked)} />
                  <input value={it.name} onChange={e => updateItem(i, 'name', e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 7px', fontSize: 12 }} />
                  <input value={it.category} onChange={e => updateItem(i, 'category', e.target.value)} placeholder="Kategorija" style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 7px', fontSize: 12 }} />
                  <input value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 7px', fontSize: 12, textAlign: 'center' }} />
                  <input type="number" onFocus={e => e.target.select()} step="0.01" value={it.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 7px', fontSize: 12, textAlign: 'right' }} />
                  <select value={it.vat_rate} onChange={e => updateItem(i, 'vat_rate', Number(e.target.value))} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 2px', fontSize: 12 }}>
                    <option value={22}>22%</option>
                    <option value={9.5}>9.5%</option>
                    <option value={0}>0%</option>
                  </select>
                  <button onClick={() => removeItem(i)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
            {error && <div style={{ marginTop: 12, fontSize: 13, color: '#DC2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setItems([])} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer' }}>Prekliči</button>
              <button onClick={saveAll} disabled={saving} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 600, background: '#0D1F12', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : `Shrani ${items.filter(it => it.selected).length} izbranih artiklov`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
function CatalogSection({ posData }) {
  const [catModal, setCatModal] = useState(null)
  const [itemModal, setItemModal] = useState(null)
  const [normModal, setNormModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('categories')
  const [cenikModal, setCenikModal] = useState(false)
  const [modifierGroups, setModifierGroups] = useState<any[]>([])
  const [itemModifierLinks, setItemModifierLinks] = useState<Record<string,string[]>>({})
  const [modGroupModal, setModGroupModal] = useState<any>(null)

  // Naloži modifier grupe
  React.useEffect(() => {
    async function loadModifiers() {
      const { data: mg } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order')
      setModifierGroups(mg || [])
      const { data: links } = await createClient().from('item_modifier_group_links').select('item_id, group_id')
      if (links) {
        const map: Record<string,string[]> = {}
        for (const l of links) { if (!map[l.item_id]) map[l.item_id] = []; map[l.item_id].push(l.group_id) }
        setItemModifierLinks(map)
      }
    }
    loadModifiers()
  }, [])
  const CAT_COLORS = ['#8B5E3C','#5A8F69','#D4A017','#8B2C3E','#A0522D','#C26A3A','#C76A98','#3A6E8F','#4A7C59','#1f6b3a']

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function saveCat() {
    if (!catModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      if (catModal.id) {
        const {error} = await createClient().from('categories').update({name:catModal.name,icon:catModal.icon,color:catModal.color}).eq('id',catModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('categories').insert({business_id:BUSINESS_ID,name:catModal.name,icon:catModal.icon||'📦',color:catModal.color||'#1f6b3a',sort_order:posData.categories.length})
        if (error) throw error
      }
      setCatModal(null); posData.refresh(); showToast(catModal.id?'Kategorija posodobljena':'Kategorija dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteCat(id, name) {
    if (!confirm(`Izbrišem kategorijo "${name}"? Artikli ostanejo brez kategorije.`)) return
    const { error: catDelErr } = await createClient().from('categories').delete().eq('id',id)
    if (catDelErr) { showToast('Kategorije ni bilo mogoče izbrisati: ' + catDelErr.message, false); return }
    posData.refresh(); showToast('Kategorija izbrisana')
  }

  async function saveItem() {
    if (!itemModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    const itemType = itemModal?.item_type || 'simple'
    if (itemType !== 'ingredient' && (!itemModal.price || Number(itemModal.price)<=0)) { showToast('Prodajna cena mora biti > 0',false); return }
    if (itemModal.vat_rate===undefined || itemModal.vat_rate==='') { showToast('DDV stopnja je obvezna ★',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        business_id:BUSINESS_ID, category_id:itemModal.category_id||null,
        name:itemModal.name, code:itemModal.code||null,
        price:itemModal.price?Number(itemModal.price):0,
        unit:itemModal.unit||'kos', vat_rate:Number(itemModal.vat_rate),
        stock:itemModal.stock!=null&&itemModal.stock!==''?Number(itemModal.stock):null,
        fav:!!itemModal.fav, kitchen:!!itemModal.kitchen, bookable:!!itemModal.bookable,
        duration_min:itemModal.bookable&&itemModal.duration_min?Number(itemModal.duration_min):null,
        item_type: itemType,
        archived:false,
      }
      let savedId = itemModal.id
      if (itemModal.id) {
        const {error} = await createClient().from('items').update(payload).eq('id',itemModal.id)
        if (error) throw error
      } else {
        const {data, error} = await createClient().from('items').insert(payload).select().single()
        if (error) throw error
        savedId = data.id
      }
      // Shrani normativ če je recipe tip
      if (itemType === 'recipe' && savedId) {
        const { error: recErr } = await createClient().from('item_ingredients').delete().eq('item_id', savedId)
        if (recErr) throw recErr
        const normLines = (itemModal.normativ||[]).filter(n=>n.ingredient_id&&n.qty_used)
        if (normLines.length > 0) {
          const {error} = await createClient().from('item_ingredients').insert(
            normLines.map(n=>({ item_id:savedId, ingredient_id:n.ingredient_id, qty_used:Number(n.qty_used) }))
          )
          if (error) throw error
        }
      }
      setItemModal(null); posData.refresh(); showToast(itemModal.id?'Artikel posodobljen':'Artikel dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteItem(id, name) {
    if (!confirm(`Izbrišem artikel "${name}"?`)) return
    const { error: arcErr } = await createClient().from('items').update({archived:true}).eq('id',id)
    if (arcErr) { showToast('Artikla ni bilo mogoče izbrisati: ' + arcErr.message, false); return }
    posData.refresh(); showToast('Artikel izbrisan')
  }

  const realCategories = posData.categories.filter(c=>c.id!=='cat-fav')

  return (
    <div>
      <div style={{ display:'flex', gap:0, marginBottom:20, background:T.surface, borderRadius:10, padding:4, width:'fit-content', border:'1px solid '+T.line }}>
        {[['categories','Kategorije'],['items','Artikli'],['surovine','Surovine']].map(([id,lbl]) => (
          <button key={id} onClick={()=>setActiveTab(id)} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:activeTab===id?T.accent:'transparent', color:activeTab===id?'#fff':T.ink, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
        ))}
      </div>

      {activeTab==='categories' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Kategorije ({realCategories.length})</div>
            <button onClick={()=>setCatModal({color:'#1f6b3a',icon:'📦'})} style={btnP}>+ Dodaj kategorijo</button>
          </div>
          {realCategories.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+T.line }}>
              <div style={{ width:36, height:36, borderRadius:8, background:c.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{c.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{posData.items.filter(i=>i.category_id===c.id).length} artiklov</div>
              </div>
              <button onClick={()=>setCatModal({...c})} style={btnS}><KI name="edit" size={14}/></button>
              <button onClick={()=>deleteCat(c.id,c.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
            </div>
          ))}
          {realCategories.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni kategorij — dodajte prvo</div>}
        </div>
      )}

      {activeTab==='surovine' && <SestavineSection posData={posData}/>}
      {cenikModal && <CenikImportModal onClose={()=>setCenikModal(false)} posData={posData} />}
      {activeTab==='items' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Artikli ({posData.items.length})</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setCenikModal(true)} style={{...btnP, background:T.surface2, color:T.ink, border:'1px solid '+T.line}}>📷 Uvozi iz cenika</button>
              <button onClick={()=>setItemModal({vat_rate:9.5,unit:'kos',fav:false,kitchen:false,bookable:false})} style={btnP}>+ Dodaj artikel</button>
            </div>
          </div>
          {posData.items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', background:T.surface, borderRadius:10, marginBottom:4, border:'1px solid '+T.line }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{it.name} {it.fav?'★':''}</div>
                <div style={{ fontSize:11, color:T.muted, fontFamily:'monospace' }}>{it.code||'—'} · DDV {it.vat_rate}% · {it.unit}</div>
              </div>
              <div style={{ fontWeight:700, fontSize:14, minWidth:60, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{eur(it.price)}</div>
              <button onClick={async()=>{
                const {data:normData} = await createClient().from('item_ingredients').select('*').eq('item_id',it.id)
                setItemModal({...it,normativ:normData||[]})
              }} style={btnS}><KI name="edit" size={14}/></button>
              <button onClick={()=>deleteItem(it.id,it.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
            </div>
          ))}
          {posData.items.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni artiklov — dodajte prvega</div>}
        </div>
      )}

      {/* Kategorija modal */}
      <Modal open={!!catModal} onClose={()=>setCatModal(null)} width={400}>
        <ModalHeader title={catModal?.id?'Uredi kategorijo':'Nova kategorija'} onClose={()=>setCatModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime *">
            <input value={catModal?.name||''} onChange={e=>setCatModal(p=>({...p,name:e.target.value}))} placeholder="Bar, Fitness, Kava..." style={inp} autoFocus/>
          </Field>
          <Field label="Emoji">
            <EmojiPicker value={catModal?.icon||'📦'} onChange={icon=>setCatModal(p=>({...p,icon}))}/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {CAT_COLORS.map(c=>(
                <div key={c} onClick={()=>setCatModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:catModal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setCatModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveCat} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {/* Artikel modal */}
      <Modal open={!!itemModal} onClose={()=>setItemModal(null)} width={520}>
        <ModalHeader title={itemModal?.id?'Uredi artikel':'Nov artikel'} onClose={()=>setItemModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'72vh', overflowY:'auto' }}>

          {/* Tip artikla */}
          <Field label="Tip artikla *">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
              {[
                { id:'simple',     label:'Enostaven',   desc:'Pivo, vstopnina, kava', icon:'🛍️' },
                { id:'recipe',     label:'Z normativom', desc:'Točeno vino, koktajl',  icon:'🧪' },
                { id:'ingredient', label:'Surovina',     desc:'Vino 1L, moka 1kg',     icon:'📦' },
              ].map(t=>{
                const sel = (itemModal?.item_type||'simple') === t.id
                return (
                  <div key={t.id} onClick={()=>setItemModal(p=>({...p,item_type:t.id}))} style={{ padding:'10px 8px', borderRadius:9, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface }}>
                    <div style={{ fontSize:20 }}>{t.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:sel?T.accent:T.ink, marginTop:4 }}>{t.label}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{t.desc}</div>
                  </div>
                )
              })}
            </div>
          </Field>

          <Field label="Ime artikla / storitve *">
            <input value={itemModal?.name||''} onChange={e=>setItemModal(p=>({...p,name:e.target.value}))} placeholder="Espresso, Masaža, Vstopnina..." style={inp} autoFocus/>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {(itemModal?.item_type||'simple') !== 'ingredient' && (
              <Field label="Prodajna cena (€) *">
                <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
              </Field>
            )}
            {(itemModal?.item_type||'simple') === 'ingredient' && (
              <Field label="Nabavna cena (€)">
                <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={itemModal?.price||''} onChange={e=>setItemModal(p=>({...p,price:e.target.value}))} placeholder="0.00" style={inp}/>
              </Field>
            )}
            <Field label="Enota">
              <select value={itemModal?.unit||'kos'} onChange={e=>setItemModal(p=>({...p,unit:e.target.value}))} style={inp}>
                {['kos','dl','cl','ml','L','g','kg','ura','paket','obisk','porcija'].map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          <VatExemptionPicker
            vatRate={itemModal?.vat_rate}
            code={itemModal?.vat_exemption_code}
            customText={itemModal?.vat_exemption_custom_text}
            onCodeChange={c => setItemModal(p => ({ ...p, vat_exemption_code: c }))}
            onCustomTextChange={t => setItemModal(p => ({ ...p, vat_exemption_custom_text: t }))}
            inputStyle={inp}
          />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="DDV stopnja *">
              <select value={itemModal?.vat_rate??''} onChange={e=>setItemModal(p=>({...p,vat_rate:e.target.value}))}
                style={{ ...inp, border: (itemModal?.vat_rate===undefined||itemModal?.vat_rate==='')?'1.5px solid '+T.warn:inp.border }}>
                <option value="">— izberi DDV —</option>
                <option value={0}>0% (oproščeno)</option>
                <option value={9.5}>9.5% (hrana, pijača)</option>
                <option value={22}>22% (splošna)</option>
              </select>
            </Field>
            <Field label="Šifra (koda)">
              <input value={itemModal?.code||''} onChange={e=>setItemModal(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="K01" style={{...inp,fontFamily:'monospace'}}/>
            </Field>
          </div>

          {(itemModal?.item_type||'simple') !== 'ingredient' && (
            <Field label="Kategorija">
              <select value={itemModal?.category_id||''} onChange={e=>setItemModal(p=>({...p,category_id:e.target.value||null}))} style={inp}>
                <option value="">Brez kategorije</option>
                {realCategories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </Field>
          )}

          <Field label={(itemModal?.item_type||'simple')==='ingredient'?'Zaloga v skladišču':'Zaloga (pusti prazno za neomejeno)'}>
            <input type="number" onFocus={e => e.target.select()} min="0" value={itemModal?.stock??''} onChange={e=>setItemModal(p=>({...p,stock:e.target.value}))} placeholder="∞" style={inp}/>
          </Field>

          {/* Normativ — samo za recipe tip */}
          {(itemModal?.item_type||'simple') === 'recipe' && (
            <div style={{ background:T.surface2, borderRadius:10, padding:14, border:'1px solid '+T.line }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                🧪 Normativ <span style={{ fontSize:11, color:T.muted, fontWeight:500 }}>— katere surovine porabi ta artikel</span>
              </div>
              {(itemModal?.normativ||[]).map((n,i)=>(
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <select value={n.ingredient_id||''} onChange={e=>{const nv=[...(itemModal.normativ||[])];nv[i]={...nv[i],ingredient_id:e.target.value};setItemModal(p=>({...p,normativ:nv}))}} style={{ ...inp, flex:2 }}>
                    <option value="">— izberi surovino —</option>
                    {posData.ingredients.map(ig=><option key={ig.id} value={ig.id}>{ig.name} ({ig.unit})</option>)}
                  </select>
                  <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={n.qty_used||''} onChange={e=>{const nv=[...(itemModal.normativ||[])];nv[i]={...nv[i],qty_used:e.target.value};setItemModal(p=>({...p,normativ:nv}))}} placeholder="Qty" style={{ ...inp, width:80, flex:0 }}/>
                  <span style={{ fontSize:11, color:T.muted, minWidth:24 }}>
                    {posData.ingredients.find(ig=>ig.id===n.ingredient_id)?.unit||''}
                  </span>
                  <button onClick={()=>setItemModal(p=>({...p,normativ:(p.normativ||[]).filter((_,j)=>j!==i)}))} style={{ background:'none', border:0, cursor:'pointer', color:T.danger, padding:4 }}>✕</button>
                </div>
              ))}
              {posData.ingredients.length === 0 ? (
                <div style={{ fontSize:12, color:T.muted, padding:'8px 0' }}>Najprej dodaj surovine v <b>Nastavitve → Sestavine</b></div>
              ) : (
                <button onClick={()=>setItemModal(p=>({...p,normativ:[...(p.normativ||[]),{ingredient_id:'',qty_used:''}]}))} style={{ ...btnS, padding:'6px 12px', fontSize:12, marginTop:4 }}>
                  + Dodaj surovino
                </button>
              )}
            </div>
          )}

          {(itemModal?.item_type||'simple') !== 'ingredient' && (
            <div style={{ display:'flex', gap:16 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={!!itemModal?.fav} onChange={e=>setItemModal(p=>({...p,fav:e.target.checked}))} style={{ accentColor:T.accent }}/>
                Priljubljeno ★
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={!!itemModal?.kitchen} onChange={e=>setItemModal(p=>({...p,kitchen:e.target.checked}))} style={{ accentColor:T.accent }}/>
                Pošlji v kuhinjo
              </label>
            </div>
          )}

          {/* Modifier grupe */}
          {(itemModal?.item_type||'simple') !== 'ingredient' && (
            <Field label="Modifier grupe (variante, dodatki)">
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {modifierGroups.length === 0 && (
                  <div style={{ fontSize:12, color:T.muted, padding:'6px 0' }}>Ni modifier grup — klikni spodaj da ustvariš prvo</div>
                )}
                {modifierGroups.map((mg:any) => {
                  const linked = itemModal?.id
                    ? (itemModifierLinks[itemModal.id]||[]).includes(mg.id)
                    : (itemModal?._modLinks||[]).includes(mg.id)
                  return (
                    <div key={mg.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'1px solid '+T.line, background:linked?T.accentSoft:T.surface }}>
                      <input type="checkbox" checked={linked} onChange={async (e:any) => {
                        if (itemModal?.id) {
                          if (e.target.checked) {
                            const { error: linkErr } = await createClient().from('item_modifier_group_links').insert({ item_id: itemModal.id, group_id: mg.id })
                                if (linkErr) alert('Skupine ni bilo mogoče povezati z artiklom: ' + linkErr.message)
                          } else {
                            await createClient().from('item_modifier_group_links').delete().eq('item_id', itemModal.id).eq('group_id', mg.id)
                          }
                          const { data: lnks } = await createClient().from('item_modifier_group_links').select('item_id, group_id')
                          if (lnks) {
                            const map: Record<string,string[]> = {}
                            for (const l of lnks) { if (!map[l.item_id]) map[l.item_id] = []; map[l.item_id].push(l.group_id) }
                            setItemModifierLinks(map)
                          }
                        } else {
                          const cur = itemModal?._modLinks || []
                          setItemModal((p:any) => ({...p, _modLinks: e.target.checked ? [...cur, mg.id] : cur.filter((id:string) => id !== mg.id)}))
                        }
                      }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:12 }}>{mg.name}{mg.required?' (obvezno)':''}{mg.multi_select?' (vec izbir)':''}</div>
                        <div style={{ fontSize:11, color:T.muted }}>{(mg.item_modifiers||[]).map((m:any) => m.name + (m.price_delta?(m.price_delta>0?'+':'')+m.price_delta+'€':'')).join(' · ')}</div>
                      </div>
                      <button onClick={(e:any) => { e.stopPropagation(); setModGroupModal({ id: mg.id, name: mg.name, required: mg.required, multi_select: mg.multi_select, modifiers: (mg.item_modifiers||[]).length > 0 ? mg.item_modifiers.map((m:any) => ({ id: m.id, name: m.name, price_delta: m.price_delta })) : [{name:'',price_delta:0}] }) }} style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, padding:4 }} title="Uredi">✏️</button>
                      <button onClick={async (e:any) => { e.stopPropagation(); if (!confirm(`Izbrišem modifier grupo "${mg.name}"?`)) return; await createClient().from('item_modifier_group_links').delete().eq('group_id', mg.id); await createClient().from('item_modifiers').delete().eq('group_id', mg.id); await createClient().from('item_modifier_groups').delete().eq('id', mg.id); const { data: mg2 } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order'); setModifierGroups(mg2 || []) }} style={{ background:'none', border:'none', cursor:'pointer', color:T.danger, padding:4 }} title="Izbriši">🗑️</button>
                    </div>
                  )
                })}
                <button onClick={() => setModGroupModal({ name:'', required:false, multi_select:false, modifiers:[{name:'',price_delta:0}] })} style={{ ...btnS, fontSize:11, alignSelf:'flex-start' }}>+ Nova modifier grupa</button>
              </div>
            </Field>
          )}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={()=>setItemModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveItem} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {/* Modifier Group Modal - CatalogSection */}
      {!!modGroupModal && (
        <Modal open onClose={()=>setModGroupModal(null)} width={480}>
          <ModalHeader title="Nova modifier grupa" onClose={()=>setModGroupModal(null)}/>
          <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
            <Field label="Ime grupe *">
              <input value={modGroupModal.name} onChange={(e:any)=>setModGroupModal((p:any)=>({...p,name:e.target.value}))} placeholder="Mleko, Velikost, Dodatki..." style={inp} autoFocus/>
            </Field>
            <div style={{ display:'flex', gap:16 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={modGroupModal.required} onChange={(e:any)=>setModGroupModal((p:any)=>({...p,required:e.target.checked}))}/> Obvezna
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={modGroupModal.multi_select} onChange={(e:any)=>setModGroupModal((p:any)=>({...p,multi_select:e.target.checked}))}/> Vec izbir
              </label>
            </div>
            <Field label="Moznosti">
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {modGroupModal.modifiers.map((m:any, i:number) => (
                  <div key={i} style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <input value={m.name} onChange={(e:any)=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],name:e.target.value};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="npr. Ovseno" style={{...inp,flex:2}}/>
                    <input type="number" onFocus={e => e.target.select()} step="0.1" value={m.price_delta||''} onChange={(e:any)=>{const ms=[...modGroupModal.modifiers];ms[i]={...ms[i],price_delta:parseFloat(e.target.value)||0};setModGroupModal((p:any)=>({...p,modifiers:ms}))}} placeholder="+0.50" style={{...inp,flex:1,width:80}}/>
                    <button onClick={()=>{const ms=modGroupModal.modifiers.filter((_:any,j:number)=>j!==i);setModGroupModal((p:any)=>({...p,modifiers:ms}))}} style={{ color:T.danger, background:'none', border:'none', cursor:'pointer', fontSize:16 }}>x</button>
                  </div>
                ))}
                <button onClick={()=>setModGroupModal((p:any)=>({...p,modifiers:[...p.modifiers,{name:'',price_delta:0}]}))} style={{ ...btnS, fontSize:11, alignSelf:'flex-start' }}>+ Dodaj moznost</button>
              </div>
            </Field>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={()=>setModGroupModal(null)} style={btnS}>Preklic</button>
              <button onClick={async()=>{
                if (!modGroupModal.name.trim()) return
                let groupId = modGroupModal.id
                if (groupId) {
                  await createClient().from('item_modifier_groups').update({ name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).eq('id', groupId)
                  await createClient().from('item_modifiers').delete().eq('group_id', groupId)
                } else {
                  const { data: mg } = await createClient().from('item_modifier_groups').insert({ business_id:BUSINESS_ID, name:modGroupModal.name, required:modGroupModal.required, multi_select:modGroupModal.multi_select }).select().single()
                  groupId = mg?.id
                }
                if (groupId && modGroupModal.modifiers.filter((m:any)=>m.name).length > 0) {
                  await createClient().from('item_modifiers').insert(modGroupModal.modifiers.filter((m:any)=>m.name).map((m:any,idx:number)=>({ group_id:groupId, name:m.name, price_delta:m.price_delta||0, sort_order:idx })))
                }
                const { data: mgData } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').eq('business_id', BUSINESS_ID).order('sort_order')
                setModifierGroups(mgData || [])
                setModGroupModal(null)
              }} style={btnP}>Shrani grupo</button>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Spaces & Tables CRUD — Visual Canvas + Drag & Drop ──────
function SpacesSection({ posData }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)
  const [spaceModal, setSpaceModal] = useState(null)
  const [tableModal, setTableModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [dragPos, setDragPos] = useState({})
  const canvasRef = useRef(null)
  const SPACE_COLORS = ['#8FBF8F','#B8956A','#9B7AC9','#3a6e8f','#c26a3a','#1f6b3a','#e9b949','#a83232']

  useEffect(() => {
    if (posData.spaces.length > 0 && !selectedSpaceId) setSelectedSpaceId(posData.spaces[0]?.id)
  }, [posData.spaces])

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const selectedSpace = posData.spaces.find(s => s.id === selectedSpaceId)

  // Drag & drop
  function startDrag(e, table) {
    e.preventDefault(); e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDragState({ tableId:table.id, startX:e.clientX, startY:e.clientY, origX:table.x, origY:table.y, canvasW:rect.width, canvasH:rect.height })
  }

  useEffect(() => {
    if (!dragState) return
    function onMove(e) {
      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      const nx = Math.max(0, Math.min(88, dragState.origX + (dx / dragState.canvasW * 100)))
      const ny = Math.max(0, Math.min(82, dragState.origY + (dy / dragState.canvasH * 100)))
      setDragPos(p => ({...p, [dragState.tableId]: {x:nx, y:ny}}))
    }
    async function onUp() {
      const pos = dragPos[dragState.tableId]
      if (pos) {
        try {
          await createClient().from('tables').update({ x:Math.round(pos.x), y:Math.round(pos.y) }).eq('id', dragState.tableId)
          posData.refresh()
        } catch(err) { console.error(err) }
      }
      setDragState(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragState, dragPos])

  async function saveSpace() {
    if (!spaceModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      if (spaceModal.id) {
        const {error} = await createClient().from('spaces').update({name:spaceModal.name,color:spaceModal.color}).eq('id',spaceModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('spaces').insert({business_id:BUSINESS_ID,name:spaceModal.name,color:spaceModal.color||'#8FBF8F',sort_order:posData.spaces.length})
        if (error) throw error
        posData.refresh()
        // select new space
        setTimeout(() => {
          const newSpace = posData.spaces[posData.spaces.length - 1]
          if (newSpace) setSelectedSpaceId(newSpace.id)
        }, 500)
      }
      setSpaceModal(null); posData.refresh(); showToast(spaceModal.id?'Prostor posodobljen':'Prostor dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteSpace(id, name) {
    // DODANO (16.8.2026): tables.space_id ima ON DELETE CASCADE - brisanje
    // prostora IZBRISE VSE njegove mize. Ce ima katera odprto narocilo,
    // brisanje TIHO spodleti (orders.table_id ga blokira), uporabnik pa je
    // prej dobil sporocilo "Prostor izbrisan", ceprav se ni zgodilo nic.
    const { data: spaceTables } = await createClient().from('tables').select('id, name').eq('space_id', id)
    if (spaceTables?.length) {
      for (const t of spaceTables) {
        const openOrder = await pos.orders.getOpenOnTable(t.id)
        if (openOrder) {
          alert(`Prostora "${name}" ni mogoce izbrisati: miza "${t.name}" ima odprto narocilo. Najprej zakljucite vsa odprta narocila v tem prostoru.`)
          return
        }
      }
    }
    if (!confirm(`Izbrišem prostor "${name}" in vse mize (${spaceTables?.length || 0})?`)) return
    const { error: delErr } = await createClient().from('spaces').delete().eq('id',id)
    if (delErr) { showToast('Napaka pri brisanju: ' + delErr.message, false); return }
    const next = posData.spaces.find(s=>s.id!==id)
    setSelectedSpaceId(next?.id||null)
    posData.refresh(); showToast('Prostor izbrisan')
  }

  async function saveTable() {
    if (!tableModal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    const spaceId = tableModal.space_id || selectedSpaceId
    if (!spaceId) { showToast('Izberite prostor',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = { space_id:spaceId, name:tableModal.name, seats:Number(tableModal.seats||2), x:Number(tableModal.x||10), y:Number(tableModal.y||10), status:'free' }
      if (tableModal.id) {
        const {error} = await createClient().from('tables').update(payload).eq('id',tableModal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('tables').insert(payload)
        if (error) throw error
      }
      setTableModal(null); posData.refresh(); showToast(tableModal.id?'Miza posodobljena':'Miza dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function deleteTable(id) {
    // DODANO (16.8.2026): prej se ni preverilo, ali ima miza ODPRTO narocilo -
    // brisanje bi pustilo narocilo brez mize (nedostopno, nikoli placano), ali
    // pa tiho spodletelo zaradi tujega kljuca, brez sporocila uporabniku.
    const openOrder = await pos.orders.getOpenOnTable(id)
    if (openOrder) {
      alert('Te mize ni mogoče izbrisati, ker ima odprto naročilo. Najprej zaključite ali prenesite naročilo.')
      return
    }
    if (!confirm('Izbrišem to mizo?')) return
    const { error } = await createClient().from('tables').delete().eq('id',id)
    if (error) { showToast('Napake pri brisanju: ' + error.message, false); return }
    posData.refresh(); showToast('Miza izbrisana')
  }

  const tablePos = (t) => dragState?.tableId === t.id && dragPos[t.id] ? dragPos[t.id] : {x:t.x, y:t.y}
  const spaceColor = (sp) => sp?.color || '#8FBF8F'

  return (
    <div style={{ display:'flex', gap:0, height:'calc(100vh - 200px)', minHeight:500 }}>
      {/* Leva lista prostorov */}
      <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:0, borderRight:'1px solid '+T.line, paddingRight:16, marginRight:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:T.muted }}>Prostori</div>
          <button onClick={()=>setSpaceModal({color:'#8FBF8F'})} style={{ ...btnP, padding:'6px 10px', fontSize:11 }}>+ Nov</button>
        </div>
        {posData.spaces.length === 0 && (
          <div style={{ fontSize:12, color:T.muted, padding:'12px 0' }}>Ni prostorov</div>
        )}
        {posData.spaces.map(sp => {
          const sel = selectedSpaceId === sp.id
          return (
            <div key={sp.id} onClick={()=>setSelectedSpaceId(sp.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, marginBottom:4, cursor:'pointer', background: sel ? T.accentSoft : 'transparent', border:'1px solid '+(sel?T.accent:'transparent') }}>
              <div style={{ width:32, height:32, borderRadius:8, background:spaceColor(sp), display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <KI name="chair" size={16} strokeWidth={2}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:sel?T.accent:T.ink }}>{sp.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{(sp.tables||[]).length} miz</div>
              </div>
              <button onClick={e=>{e.stopPropagation();deleteSpace(sp.id,sp.name)}} style={{ background:'none', border:0, cursor:'pointer', color:T.muted, padding:4, opacity:0.6 }}>
                <KI name="trash" size={13}/>
              </button>
            </div>
          )
        })}
      </div>

      {/* Desno platno */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {!selectedSpace ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted, fontSize:13 }}>
            Dodaj prostor da začneš
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:spaceColor(selectedSpace) }}/>
              <div style={{ fontSize:16, fontWeight:700 }}>{selectedSpace.name}</div>
              <div style={{ fontSize:12, color:T.muted }}>· {(selectedSpace.tables||[]).length} miz</div>
              <button onClick={()=>setSpaceModal({...selectedSpace})} style={{ ...btnS, padding:'5px 10px', fontSize:11, marginLeft:4 }}>✏️ Uredi</button>
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <div style={{ fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:4 }}>
                  <KI name="arrow" size={12}/> Povleci mizo za premik
                </div>
                <button onClick={()=>setTableModal({space_id:selectedSpace.id,seats:2,x:10,y:10})} style={btnP}>
                  + Dodaj mizo
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div ref={canvasRef} style={{ flex:1, position:'relative', borderRadius:14, border:'1.5px solid '+T.line, background:T.surface2, backgroundImage:'radial-gradient(circle, rgba(26,31,26,0.12) 1px, transparent 1px)', backgroundSize:'24px 24px', overflow:'hidden', userSelect:'none', minHeight:400 }}>
              {(selectedSpace.tables||[]).length === 0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:T.muted }}>
                  <div style={{ fontSize:32 }}>🪑</div>
                  <div style={{ fontSize:13 }}>Klikni <b>+ Dodaj mizo</b> za prvo mizo</div>
                </div>
              )}
              {(selectedSpace.tables||[]).map(t => {
                const pos = tablePos(t)
                const isDragging = dragState?.tableId === t.id
                const isRound = t.seats <= 2
                const w = t.seats<=2?90:t.seats<=4?114:150
                const h = t.seats<=2?90:t.seats<=4?88:110
                const spColor = spaceColor(selectedSpace)
                const statusColors = { free:'rgba(31,107,58,0.5)', occupied:'rgba(184,140,40,0.55)', reserved:'rgba(99,72,150,0.5)', needs_attention:'rgba(168,50,50,0.55)' }
                const borderColor = statusColors[t.status] || statusColors.free
                const bgColor = { free:'#ffffff', occupied:'rgba(233,185,73,0.12)', reserved:'rgba(155,122,201,0.12)', needs_attention:'rgba(168,50,50,0.08)' }[t.status] || '#fff'

                return (
                  <div key={t.id}
                    onMouseDown={e=>startDrag(e,t)}
                    style={{ position:'absolute', left:`${pos.x}%`, top:`${pos.y}%`, width:w, height:h, background:bgColor, border:`2px solid ${borderColor}`, borderRadius:isRound?'50%':14, cursor:isDragging?'grabbing':'grab', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, boxShadow:isDragging?'0 8px 24px rgba(0,0,0,0.18)':'0 2px 6px rgba(0,0,0,0.06)', transition:isDragging?'none':'box-shadow 0.15s', zIndex:isDragging?10:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:T.ink }}>{t.name}</div>
                    <div style={{ fontSize:10, color:T.muted, display:'flex', alignItems:'center', gap:2 }}>
                      <KI name="user" size={9}/>{t.seats}
                    </div>
                    {/* Edit/delete buttons on hover — shown always for admin */}
                    <div style={{ position:'absolute', top:-10, right:-10, display:'flex', gap:3 }}>
                      <button onMouseDown={e=>e.stopPropagation()} onClick={()=>setTableModal({...t,space_id:selectedSpace.id})}
                        style={{ width:22, height:22, borderRadius:'50%', background:T.surface, border:'1px solid '+T.line, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.12)' }}>
                        <KI name="edit" size={10}/>
                      </button>
                      <button onMouseDown={e=>e.stopPropagation()} onClick={()=>deleteTable(t.id)}
                        style={{ width:22, height:22, borderRadius:'50%', background:T.surface, border:'1px solid rgba(168,50,50,0.3)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T.danger, boxShadow:'0 1px 4px rgba(0,0,0,0.12)' }}>
                        <KI name="x" size={10}/>
                      </button>
                    </div>
                  </div>
                )
              })}
              {/* Legenda */}
              <div style={{ position:'absolute', bottom:12, left:12, display:'flex', gap:10 }}>
                {Object.entries(T.status).map(([k,st])=>(
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:T.muted, fontWeight:600 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>{st.label}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Space modal */}
      <Modal open={!!spaceModal} onClose={()=>setSpaceModal(null)} width={380}>
        <ModalHeader title={spaceModal?.id?'Uredi prostor':'Nov prostor'} onClose={()=>setSpaceModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime prostora *">
            <input value={spaceModal?.name||''} onChange={e=>setSpaceModal(p=>({...p,name:e.target.value}))} placeholder="Bar, Terasa, VIP..." style={inp} autoFocus/>
          </Field>
          <Field label="Barva">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {SPACE_COLORS.map(c=>(
                <div key={c} onClick={()=>setSpaceModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:spaceModal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setSpaceModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveSpace} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {/* Table modal */}
      <Modal open={!!tableModal} onClose={()=>setTableModal(null)} width={380}>
        <ModalHeader title={tableModal?.id?'Uredi mizo':'Nova miza'} onClose={()=>setTableModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime *">
            <input value={tableModal?.name||''} onChange={e=>setTableModal(p=>({...p,name:e.target.value}))} placeholder="T1, Terasa 3..." style={inp} autoFocus/>
          </Field>
          <Field label="Število sedežev">
            <div style={{ display:'flex', gap:6 }}>
              {[2,4,6,8].map(n=>(
                <button key={n} onClick={()=>setTableModal(p=>({...p,seats:n}))}
                  style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:14, background:tableModal?.seats==n?T.accent:T.surface3, color:tableModal?.seats==n?'#fff':T.ink }}>
                  {n}
                </button>
              ))}
            </div>
            <input type="number" onFocus={e => e.target.select()} min="1" max="20" value={tableModal?.seats||2} onChange={e=>setTableModal(p=>({...p,seats:Number(e.target.value)}))} style={{ ...inp, marginTop:6 }} placeholder="Ali vpiši ročno"/>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setTableModal(null)} style={btnS}>Prekliči</button>
            <button onClick={saveTable} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Packages Admin CRUD — vse vrste ─────────────────────────

// ─── Storitve & Paketi — zdruzen zaslon z izbiro tipa ────────────
function StoritveInPaketiSection({ posData }) {
  const [svcModal, setSvcModal] = useState(null)
  const [pkgModal, setPkgModal] = useState(null)
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Storitve & Paketi</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Storitve za rezervacije v koledarju, Paketi/Kartice za predplacilo strank.</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setSvcModal({color:'#1f6b3a',duration_min:60,active:true})} style={btnP}>+ Storitev</button>
          <button onClick={()=>setPkgModal({template_type:'visits',activation_type:'purchase',validity_days:30,visits:10,vat_rate:22,notify_before_days:7,days_of_week:[]})} style={btnP}>+ Paket / Kartica</button>
        </div>
      </div>
      <StoritveCrudSection posData={posData} modal={svcModal} setModal={setSvcModal}/>
      <div style={{ height:1, background:T.line, margin:'24px 0' }}/>
      <PackagesAdminSection posData={posData} modal={pkgModal} setModal={setPkgModal}/>
    </div>
  )
}

function PackagesAdminSection({ posData, modal, setModal }) {
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }
  const ttype = modal?.template_type || 'visits'

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.price && ttype !== 'service_bon') { showToast('Cena je obvezna',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        price: Number(modal.price||0),
        template_type: ttype,
        activation_type: modal.activation_type||'purchase',
        validity_days: modal.validity_days?Number(modal.validity_days):null,
        visits: ['visits','group_class'].includes(ttype) ? Number(modal.visits||10) : null,
        monetary_value: ttype==='gift_voucher' ? Number(modal.monetary_value||0) : null,
        time_from: modal.time_from||null,
        time_to: modal.time_to||null,
        days_of_week: modal.days_of_week||[],
        auto_renew: !!modal.auto_renew,
        vat_rate: Number(modal.vat_rate ?? 22),
        // DODANO (19.8.2026): razlog za neobracunan DDV (pri 0 % obvezen).
        vat_exemption_code: Number(modal.vat_rate ?? 22) === 0 ? (modal.vat_exemption_code || null) : null,
        vat_exemption_custom_text: Number(modal.vat_rate ?? 22) === 0 ? (modal.vat_exemption_custom_text || null) : null,
        notify_before_days: Number(modal.notify_before_days||7),
        fixed_start_date: modal.fixed_start_date||null,
        fixed_end_date: modal.fixed_end_date||null,
        description: modal.description||null,
        color: modal.color||(TEMPLATE_TYPES[ttype]?.color||'#1f6b3a'),
        archived: false,
        // legacy fields
        type: ttype === 'visits' ? 'visits' : ttype === 'membership' ? 'unlimited' : 'unlimited',
      }
      if (modal.id) {
        const {error} = await createClient().from('package_templates').update(payload).eq('id',modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('package_templates').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id?'Paket posodobljen':'Paket dodan')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    // DODANO (22.8.2026): povemo, koliko kartic je ze prodanih. Splosno
    // vprasanje "Izbrisem paket?" ne pove, da ima paket zivo prodane kartice -
    // uporabnik ne ve, kaj tvega. (Ze prodane kartice ostanejo veljavne,
    // izgubi se le predloga za nadaljnjo prodajo.)
    const { count } = await createClient()
      .from('customer_packages')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id)
      .eq('active', true)

    const opozorilo = (count || 0) > 0
      ? `Izbrišem paket "${name}"?\n\n`
        + `${count} ${count === 1 ? 'stranka ima' : 'strank ima'} to kartico še aktivno. `
        + `Njihove kartice OSTANEJO veljavne, paketa pa ne boste mogli več prodajati.\n\n`
        + 'Tega ni mogoče razveljaviti.'
      : `Izbrišem paket "${name}"?\n\nTega ni mogoče razveljaviti.`

    if (!confirm(opozorilo)) return
    const { error: tplErr } = await createClient().from('package_templates').update({archived:true}).eq('id',id)
    if (tplErr) { showToast('Predloge ni bilo mogoče arhivirati: ' + tplErr.message, false); return }
    posData.refresh(); showToast('Paket izbrisan')
  }

  const DAYS = [['pon','Pon'],['tor','Tor'],['sre','Sre'],['čet','Čet'],['pet','Pet'],['sob','Sob'],['ned','Ned']]

  return (
    <div>
      {/* Gruppiran prikaz */}
      {Object.entries(TEMPLATE_TYPES).map(([typeKey, typeConf]) => {
        const typePackages = posData.packageTemplates.filter(p => (p.template_type||p.type||'visits') === typeKey || (typeKey==='visits' && p.type==='visits' && !p.template_type) || (typeKey==='membership' && p.type==='unlimited' && !p.template_type))
        if (typePackages.length === 0) return null
        return (
          <div key={typeKey} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ display:'inline-flex', alignItems:'center' }}><KI name={typeConf.icon} size={14}/></span> {typeConf.label}
            </div>
            {typePackages.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+T.line }}>
                <div style={{ width:36, height:36, borderRadius:8, background:typeConf.color+'18', display:'flex', alignItems:'center', justifyContent:'center', color:typeConf.color }}><KI name={typeConf.icon} size={18}/></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                    {p.validity_days && <span>📅 {p.validity_days} dni</span>}
                    {p.visits && <span>🎯 {p.visits}×</span>}
                    {p.activation_type && <span>⚡ {ACTIVATION_TYPES[p.activation_type]||''}</span>}
                    {/* DODANO (21.8.2026): dnevi opozorila. Prej jih je bilo
                        treba preveriti z odpiranjem urejanja. */}
                    <span title="Toliko dni pred iztekom stranka prejme opomnik">
                      🔔 {p.notify_before_days || 7} dni prej
                    </span>
                    {p.auto_renew && <span title="Stranka pred iztekom prejme predračun za podaljšanje">🔄 Predračun ob izteku</span>}
                    {p.description && <span style={{ color:T.mutedSoft }}>· {p.description}</span>}
                  </div>
                </div>
                <div style={{ fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums', color:typeConf.color }}>{eur(p.price)}</div>
                <button onClick={()=>setModal({...p, template_type: p.template_type||p.type||'visits', days_of_week:p.days_of_week||[]})} style={btnS}><KI name="edit" size={14}/></button>
                <button onClick={()=>remove(p.id,p.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
              </div>
            ))}
          </div>
        )
      })}
      {posData.packageTemplates.length===0 && <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni paketov</div>}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={500}>
        <ModalHeader title={modal?.id ? 'Uredi paket' : 'Nov paket'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'75vh', overflowY:'auto' }}>

          {/* Tip */}
          <Field label="Tip paketa *">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5 }}>
              {Object.entries(TEMPLATE_TYPES).map(([k,v])=>{
                const sel = ttype === k
                return (
                  <div key={k} onClick={()=>setModal(p=>({...p,template_type:k}))} style={{ padding:'8px 4px', borderRadius:9, border:'2px solid '+(sel?v.color:T.line), cursor:'pointer', textAlign:'center', background:sel?v.color+'18':T.surface }}>
                    <div><KI name={v.icon} size={18}/></div>
                    <div style={{ fontSize:10, fontWeight:700, color:sel?v.color:T.muted, marginTop:3, lineHeight:1.2 }}>{v.label}</div>
                  </div>
                )
              })}
            </div>
          </Field>

          <Field label="Ime paketa *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Letna članarain, 10× vstopnica, Darilni bon..." style={inp} autoFocus/>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label={ttype==='gift_voucher'?'Vrednost bona (€) *':'Cena (€) *'}>
              <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={modal?.price||''} onChange={e=>setModal(p=>({...p,price:e.target.value}))} style={inp}/>
            </Field>
            <Field label="DDV stopnja *">
              <select value={modal?.vat_rate??22} onChange={e=>setModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
                <option value={0}>0% (bon, kuponi)</option>
                <option value={9.5}>9.5% (storitve)</option>
                <option value={22}>22% (splošna)</option>
              </select>
            </Field>
          </div>
          {/* DODANO (19.8.2026): pri 0 % je po ZDDV-1 obvezna navedba razloga. */}
          <VatExemptionPicker
            vatRate={modal?.vat_rate ?? 22}
            code={modal?.vat_exemption_code}
            customText={modal?.vat_exemption_custom_text}
            onCodeChange={c => setModal(p => ({ ...p, vat_exemption_code: c }))}
            onCustomTextChange={t => setModal(p => ({ ...p, vat_exemption_custom_text: t }))}
            inputStyle={inp}
          />

          {/* Aktivacija */}
          <Field label="Začetek veljavnosti">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
              {Object.entries(ACTIVATION_TYPES).map(([k,v])=>{
                const sel = (modal?.activation_type||'purchase') === k
                return <div key={k} onClick={()=>setModal(p=>({...p,activation_type:k}))} style={{ padding:'8px 6px', borderRadius:8, border:'2px solid '+(sel?T.accent:T.line), cursor:'pointer', textAlign:'center', background:sel?T.accentSoft:T.surface, fontSize:11, fontWeight:600, color:sel?T.accent:T.muted }}>{v}</div>
              })}
            </div>
          </Field>

          {/* Trajanje */}
          {ttype !== 'seasonal' && (
            <Field label="Veljavnost (dni od aktivacije)">
              <input type="number" onFocus={e => e.target.select()} min="1" value={modal?.validity_days||''} onChange={e=>setModal(p=>({...p,validity_days:e.target.value}))} placeholder="30, 90, 365..." style={inp}/>
            </Field>
          )}

          {/* Sezonski datumi */}
          {ttype === 'seasonal' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Začetek sezone *"><input type="date" value={modal?.fixed_start_date||''} onChange={e=>setModal(p=>({...p,fixed_start_date:e.target.value}))} style={inp}/></Field>
              <Field label="Konec sezone *"><input type="date" value={modal?.fixed_end_date||''} onChange={e=>setModal(p=>({...p,fixed_end_date:e.target.value}))} style={inp}/></Field>
            </div>
          )}

          {/* Obiski */}
          {['visits','group_class'].includes(ttype) && (
            <Field label="Število obiskov *">
              <input type="number" onFocus={e => e.target.select()} min="1" value={modal?.visits||10} onChange={e=>setModal(p=>({...p,visits:e.target.value}))} style={inp}/>
            </Field>
          )}

          {/* Časovna omejitev */}
          {ttype === 'time_restrict' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Veljavno od"><input type="time" value={modal?.time_from||'06:00'} onChange={e=>setModal(p=>({...p,time_from:e.target.value}))} style={inp}/></Field>
                <Field label="Veljavno do"><input type="time" value={modal?.time_to||'12:00'} onChange={e=>setModal(p=>({...p,time_to:e.target.value}))} style={inp}/></Field>
              </div>
              <Field label="Veljavni dnevi">
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {DAYS.map(([id,lbl])=>{
                    const sel = (modal?.days_of_week||[]).includes(id)
                    return <button key={id} onClick={()=>setModal(p=>({...p,days_of_week:sel?(p.days_of_week||[]).filter(x=>x!==id):[...(p.days_of_week||[]),id]}))} style={{ padding:'6px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:11, background:sel?T.accent:T.surface3, color:sel?'#fff':T.ink }}>{lbl}</button>
                  })}
                </div>
              </Field>
            </>
          )}

          {/* Opozorila */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Opozorilo pred iztekom (dni)">
              <input type="number" onFocus={e => e.target.select()} min="1" value={modal?.notify_before_days||7} onChange={e=>setModal(p=>({...p,notify_before_days:e.target.value}))} style={inp}/>
            </Field>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:4 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={!!modal?.auto_renew} onChange={e=>setModal(p=>({...p,auto_renew:e.target.checked}))} style={{ accentColor:T.accent }}/>
                Samodejna obnova
              </label>
              {/* DODANO (21.8.2026): razlaga. Prej je bila to gola kljukica -
                  uporabnik ni vedel, ali bo bremenila kartico, izdala racun ali
                  samo podaljsala veljavnost. Dejansko poslje PREDRACUN. */}
              <div style={{ fontSize:10, color:T.muted, marginTop:4, lineHeight:1.45 }}>
                {modal?.auto_renew
                  ? 'Stranka pred iztekom prejme predračun za podaljšanje. Kartica se NE podaljša sama in ni bremenjena — podaljša se šele, ko predračun plača.'
                  : 'Brez obnove stranka prejme le opomnik o izteku.'}
              </div>
            </div>
          </div>

          <Field label="Opis (neobvezno)">
            <input value={modal?.description||''} onChange={e=>setModal(p=>({...p,description:e.target.value}))} placeholder="Kratek opis..." style={inp}/>
          </Field>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}


// ─── Sestavine / Surovine CRUD ───────────────────────────────
function SestavineSection({ posData }) {
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const UNITS = ['L','dl','cl','ml','kg','g','kos','paket','steklenica']
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.unit) { showToast('Enota je obvezna',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        unit: modal.unit,
        stock_qty: Number(modal.stock_qty||0),
        cost_price: modal.cost_price?Number(modal.cost_price):null,
        min_stock: Number(modal.min_stock||0),
        supplier: modal.supplier||null,
      }
      if (modal.id) {
        const {error} = await createClient().from('ingredients').update(payload).eq('id',modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('ingredients').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id?'Surovina posodobljena':'Surovina dodana')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem surovino "${name}"? Normativi ki jo uporabljajo bodo prizadeti.`)) return
    try {
      const {error} = await createClient().from('ingredients').delete().eq('id',id)
      if (error) throw error
      posData.refresh(); showToast('Surovina izbrisana')
    } catch(e) { showToast(e.message,false) }
  }

  async function updateStock(ig) {
    const qty = prompt(`Nova zaloga za ${ig.name} (${ig.unit}):`, ig.stock_qty)
    if (qty === null) return
    // POPRAVLJENO (16.8.2026): prej brez preverbe vnosa in brez preverbe napake -
    // vnos "abc" je zapisal NaN, neuspesen zapis pa je ostal neopazen.
    const qtyNum = Number(String(qty).replace(',', '.'))
    if (!isFinite(qtyNum) || qtyNum < 0) { showToast('Vnesite veljavno število (npr. 12,5)', false); return }
    const { error: qtyErr } = await createClient().from('ingredients').update({ stock_qty: qtyNum }).eq('id',ig.id)
    if (qtyErr) { showToast('Zaloge ni bilo mogoče posodobiti: ' + qtyErr.message, false); return }
    posData.refresh(); showToast('Zaloga posodobljena')
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Sestavine & Surovine</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>
            Surovine za normative — vino po litrih, moka po kg, itd. Ob prodaji normativnih artiklov se zaloga samodejno odšteje.
          </div>
        </div>
        <button onClick={()=>setModal({unit:'L',stock_qty:0,min_stock:0})} style={btnP}>+ Dodaj surovino</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16, marginTop:12 }}>
        {[
          ['Skupaj surovin', posData.ingredients.length, ''],
          ['Nizka zaloga', posData.ingredients.filter(i=>i.stock_qty<=(i.min_stock||0)&&i.min_stock>0).length, 'opozorilo'],
          ['Artiklov z normativom', posData.items.filter(i=>i.item_type==='recipe').length, ''],
        ].map(([l,v,s])=>(
          <div key={l} style={{ padding:'12px 14px', background:T.surface, borderRadius:10, border:'1px solid '+T.line }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            <div style={{ fontSize:24, fontWeight:800, marginTop:4, color:s==='opozorilo'&&v>0?T.danger:T.ink }}>{v}</div>
          </div>
        ))}
      </div>

      {posData.ingredients.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📦</div>
          Ni surovin — dodajte prvo
        </div>
      ) : posData.ingredients.map(ig=>{
        const low = ig.stock_qty <= (ig.min_stock||0) && ig.min_stock > 0
        return (
          <div key={ig.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.surface, borderRadius:10, marginBottom:6, border:'1px solid '+(low?'rgba(168,50,50,0.3)':T.line) }}>
            <div style={{ width:40, height:40, borderRadius:9, background:low?'rgba(168,50,50,0.1)':T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
              📦
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{ig.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                {ig.unit} · Min: {ig.min_stock||0} {ig.unit}
                {ig.supplier && <span> · {ig.supplier}</span>}
                {ig.cost_price && <span> · nab. {eur(ig.cost_price)}</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:20, fontWeight:800, fontVariantNumeric:'tabular-nums', color:low?T.danger:T.ink }}>{ig.stock_qty}</div>
              <div style={{ fontSize:11, color:T.muted }}>{ig.unit}</div>
            </div>
            {low && <div style={{ fontSize:10, fontWeight:700, color:T.danger, background:'rgba(168,50,50,0.1)', padding:'3px 7px', borderRadius:5 }}>NIZKO</div>}
            <button onClick={()=>updateStock(ig)} title="Posodobi zalogo" style={{ ...btnS, padding:'7px 10px', fontSize:12 }}>📥</button>
            <button onClick={()=>setModal({...ig})} style={btnS}><KI name="edit" size={14}/></button>
            <button onClick={()=>remove(ig.id,ig.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
          </div>
        )
      })}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={440}>
        <ModalHeader title={modal?.id?'Uredi surovino':'Nova surovina'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime surovine *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Refošk, Moka, Olje..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Enota *">
              <select value={modal?.unit||'L'} onChange={e=>setModal(p=>({...p,unit:e.target.value}))} style={inp}>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Trenutna zaloga">
              <input type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={modal?.stock_qty||0} onChange={e=>setModal(p=>({...p,stock_qty:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Minimalna zaloga (opozorilo)">
              <input type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={modal?.min_stock||0} onChange={e=>setModal(p=>({...p,min_stock:e.target.value}))} style={inp}/>
            </Field>
            {/* POPRAVLJENO (21.8.2026): oznaka ni povedala, NA KATERO ENOTO se
                cena nanasa. Pri kavi v gramih je uporabnik vpisal 18 (misljeno
                18 EUR/kg), program pa je to razumel kot 18 EUR NA GRAM -
                vrednost zaloge je pokazala 18.000 EUR namesto 18. */}
            <Field label={`Nabavna cena (€ za 1 ${modal?.unit || 'enoto'})`}>
              <input type="number" onFocus={e => e.target.select()} min="0" step="0.0001" value={modal?.cost_price||''} onChange={e=>setModal(p=>({...p,cost_price:e.target.value}))} placeholder="0.0000" style={inp}/>
              {Number(modal?.cost_price) > 0 && (
                <div style={{ fontSize:10, color:T.muted, marginTop:3, lineHeight:1.4 }}>
                  {Number(modal?.stock_qty) > 0
                    ? <>Vrednost zaloge: <strong>{eur(Number(modal.cost_price) * Number(modal.stock_qty))}</strong></>
                    : <>Cena za 1 {modal?.unit || 'enoto'}. Pri kilogramu za 18 € in enoti <strong>g</strong> vpišite 0,018.</>}
                </div>
              )}
            </Field>
          </div>
          <Field label="Dobavitelj (neobvezno)">
            <input value={modal?.supplier||''} onChange={e=>setModal(p=>({...p,supplier:e.target.value}))} placeholder="Vino d.o.o." style={inp}/>
          </Field>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Storitve CRUD ────────────────────────────────────────────
function StoritveCrudSection({ posData, modal, setModal }) {
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const SVC_COLORS = ['#1f6b3a','#3a6e8f','#7b61b8','#c26a3a','#c76a98','#a83232','#e9b949','#1a1f1a']
  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.price) { showToast('Cena je obvezna',false); return }
    if (!modal?.duration_min) { showToast('Trajanje je obvezno',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const db = createClient()
      // Poisci ali ustvari kategorijo "Storitve" - brez kategorije artikel ni viden v Prodaji
      let svcCategoryId = posData.categories.find(c => c.name === 'Storitve')?.id
      if (!svcCategoryId) {
        const { data: newCat, error: catErr } = await db.from('categories').insert({
          business_id: BUSINESS_ID, name: 'Storitve', icon: '💆', color: '#1f6b3a', sort_order: posData.categories.length,
        }).select().single()
        if (catErr) throw catErr
        svcCategoryId = newCat.id
      }
      // KLJUCNO: sinhroniziraj z items tabelo, da je storitev prodajljiva v kosarici
      const itemPayload = {
        business_id: BUSINESS_ID,
        category_id: svcCategoryId,
        name: modal.name,
        price: Number(modal.price),
        unit: 'ura',
        // POPRAVLJENO (19.8.2026): tu je bilo trdo zapisano 22 %, zato je bila
        // izbira uporabnika v obrazcu za storitev IGNORIRANA - fizioterapija,
        // nastavljena na 0 % (oproscena), je v kosarici vseeno dobila 22 %,
        // racun pa napacen DDV. Zdaj se prenese dejansko izbrana stopnja.
        vat_rate: Number(modal.vat_rate ?? 22),
        vat_exemption_code: Number(modal.vat_rate) === 0 ? (modal.vat_exemption_code || null) : null,
        vat_exemption_custom_text: Number(modal.vat_rate) === 0 ? (modal.vat_exemption_custom_text || null) : null,
        bookable: true,
        duration_min: Number(modal.duration_min),
        item_type: 'simple',
        archived: false,
      }
      let linkedItemId = modal.linked_item_id || null
      if (linkedItemId) {
        const { error: svcItemErr } = await db.from('items').update(itemPayload).eq('id', linkedItemId)
        if (svcItemErr) throw svcItemErr
      } else {
        const { data: newItem, error: itemErr } = await db.from('items').insert(itemPayload).select().single()
        if (itemErr) throw itemErr
        linkedItemId = newItem.id
      }

      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        color: modal.color || '#1f6b3a',
        duration_min: Number(modal.duration_min),
        price: Number(modal.price),
        active: modal.active !== false,
        linked_item_id: linkedItemId,
        // DODANO (19.8.2026): razlog za neobracunan DDV (pri 0 % obvezen).
        vat_exemption_code: Number(modal.vat_rate) === 0 ? (modal.vat_exemption_code || null) : null,
        vat_exemption_custom_text: Number(modal.vat_rate) === 0 ? (modal.vat_exemption_custom_text || null) : null,
      }
      if (modal.id) {
        const {error} = await db.from('services').update(payload).eq('id', modal.id)
        if (error) throw error
      } else {
        const {error} = await db.from('services').insert(payload)
        if (error) throw error
      }
      setModal(null); posData.refresh(); showToast(modal.id ? 'Storitev posodobljena (tudi v prodaji)' : 'Storitev dodana (tudi v prodaji)')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`Izbrišem storitev "${name}"?`)) return
    const db = createClient()
    const { data: svc } = await db.from('services').select('linked_item_id').eq('id', id).maybeSingle()
    const { error: svcDeactErr } = await db.from('services').update({ active: false }).eq('id', id)
    if (svcDeactErr) { showToast('Storitve ni bilo mogoče deaktivirati: ' + svcDeactErr.message, false); return }
    if (svc?.linked_item_id) {
      const { error: svcArcErr } = await db.from('items').update({ archived: true }).eq('id', svc.linked_item_id)
      if (svcArcErr) { showToast('Povezanega artikla ni bilo mogoče arhivirati: ' + svcArcErr.message, false); return }
    }
    posData.refresh(); showToast('Storitev izbrisana (tudi iz prodaje)')
  }

  async function toggleActive(svc) {
    const { error: svcToggleErr } = await createClient().from('services').update({ active: !svc.active }).eq('id', svc.id)
    if (svcToggleErr) { showToast('Storitve ni bilo mogoče spremeniti: ' + svcToggleErr.message, false); return }
    posData.refresh()
  }

  return (
    <div>
      <div style={{ marginBottom:12, fontSize:15, fontWeight:700, color:T.muted }}>📋 Storitve (za rezervacije v koledarju)</div>

      {posData.services.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>Ni storitev — dodajte prvo</div>
      ) : posData.services.map(s => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:14, borderRadius:10, marginBottom:8, background:T.surface, border:'1px solid '+T.line, opacity: s.active ? 1 : 0.5 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:s.color||T.accent, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <KI name="calendar" size={18} strokeWidth={2}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{s.duration_min} min · {eur(s.price)}</div>
          </div>
          <div style={{ width:12, height:12, borderRadius:'50%', background:s.color||T.accent, flexShrink:0 }}/>
          <button onClick={()=>toggleActive(s)} title={s.active?'Deaktiviraj':'Aktiviraj'} style={{ ...btnS, padding:'6px 10px', fontSize:11 }}>
            {s.active ? '✅' : '⭕'}
          </button>
          <button onClick={()=>setModal({...s})} style={btnS}><KI name="edit" size={14}/></button>
          <button onClick={()=>remove(s.id,s.name)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
        </div>
      ))}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={420}>
        <ModalHeader title={modal?.id?'Uredi storitev':'Nova storitev'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Ime storitve *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Fizioterapija, Masaža, PT..." style={inp} autoFocus/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Cena (€) *">
              <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={modal?.price||''} onChange={e=>setModal(p=>({...p,price:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Trajanje (min) *">
              <input type="number" onFocus={e => e.target.select()} min="5" step="5" value={modal?.duration_min||60} onChange={e=>setModal(p=>({...p,duration_min:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <Field label="DDV stopnja *">
            <select value={modal?.vat_rate??''} onChange={e=>setModal(p=>({...p,vat_rate:e.target.value}))} style={inp}>
              <option value="">— izberi DDV —</option>
              <option value={0}>0% (oproščeno)</option>
              <option value={9.5}>9.5% (storitve)</option>
              <option value={22}>22% (splošna)</option>
            </select>
          </Field>
          {/* DODANO (19.8.2026): pri 0 % je po ZDDV-1 obvezna navedba razloga. */}
          <VatExemptionPicker
            vatRate={modal?.vat_rate}
            code={modal?.vat_exemption_code}
            customText={modal?.vat_exemption_custom_text}
            onCodeChange={c => setModal(p => ({ ...p, vat_exemption_code: c }))}
            onCustomTextChange={t => setModal(p => ({ ...p, vat_exemption_custom_text: t }))}
            inputStyle={inp}
          />
          <Field label="Barva (za prikaz v koledarju)">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {SVC_COLORS.map(c=>(
                <div key={c} onClick={()=>setModal(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:modal?.color===c?'3px solid #0D1F12':'3px solid transparent' }}/>
              ))}
            </div>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={modal?.active!==false} onChange={e=>setModal(p=>({...p,active:e.target.checked}))} style={{ accentColor:T.accent }}/>
            Storitev je aktivna
          </label>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Happy Hour CRUD ──────────────────────────────────────────
function HappyHourSection({ posData }) {
  const [rules, setRules] = useState([])
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadingRules, setLoadingRules] = useState(true)

  const DAYS = [
    { id:'pon', label:'Pon' }, { id:'tor', label:'Tor' }, { id:'sre', label:'Sre' },
    { id:'čet', label:'Čet' }, { id:'pet', label:'Pet' }, { id:'sob', label:'Sob' }, { id:'ned', label:'Ned' },
  ]

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  async function loadRules() {
    setLoadingRules(true)
    const {data} = await createClient().from('happy_hour_rules').select('*').eq('business_id', BUSINESS_ID)
    setRules(data || [])
    setLoadingRules(false)
  }

  useEffect(() => { loadRules() }, [])

  async function toggleRule(rule) {
    const { error: hhErr } = await createClient().from('happy_hour_rules').update({ active: !rule.active }).eq('id', rule.id)
    if (hhErr) { showToast('Pravila ni bilo mogoče spremeniti: ' + hhErr.message, false); return }
    loadRules()
    showToast(rule.active ? 'Pravilo deaktivirano' : 'Pravilo aktivirano')
  }

  async function save() {
    if (!modal?.name?.trim()) { showToast('Ime je obvezno',false); return }
    if (!modal?.from_time || !modal?.to_time) { showToast('Čas je obvezen',false); return }
    if (!modal?.discount_pct || modal.discount_pct <= 0) { showToast('Popust mora biti > 0%',false); return }
    if (!modal?.days || modal.days.length === 0) { showToast('Izberi vsaj en dan',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const catIds = (posData.categories || []).filter(c => c.id !== 'cat-fav' && (modal.selected_cats || []).includes(c.id)).map(c => c.id)
      const payload = {
        business_id: BUSINESS_ID,
        name: modal.name,
        days: modal.days,
        from_time: modal.from_time,
        to_time: modal.to_time,
        category_ids: catIds,
        discount_pct: Number(modal.discount_pct),
        active: modal.active !== false,
      }
      if (modal.id) {
        const {error} = await createClient().from('happy_hour_rules').update(payload).eq('id', modal.id)
        if (error) throw error
      } else {
        const {error} = await createClient().from('happy_hour_rules').insert(payload)
        if (error) throw error
      }
      setModal(null); loadRules(); showToast(modal.id ? 'Pravilo posodobljeno' : 'Pravilo dodano')
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  async function remove(id) {
    if (!confirm('Izbrišem to pravilo?')) return
    const { error: hhDelErr } = await createClient().from('happy_hour_rules').delete().eq('id', id)
    if (hhDelErr) { showToast('Pravila ni bilo mogoče izbrisati: ' + hhDelErr.message, false); return }
    loadRules(); showToast('Pravilo izbrisano')
  }

  function openEdit(rule) {
    setModal({
      ...rule,
      selected_cats: rule.category_ids || [],
    })
  }

  const realCats = (posData.categories || []).filter(c => c.id !== 'cat-fav')

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Happy hour</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Avtomatski popusti po dnevih, urah in kategorijah.</div>
        </div>
        <button onClick={()=>setModal({days:['pon','tor','sre','čet','pet'],from_time:'17:00',to_time:'19:00',discount_pct:20,active:true,selected_cats:[]})} style={btnP}>+ Dodaj pravilo</button>
      </div>

      {loadingRules ? (
        <div style={{ padding:30, textAlign:'center', color:T.muted }}>Nalagam...</div>
      ) : rules.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
          Ni pravil — dodajte prvo
        </div>
      ) : rules.map(r => (
        <div key={r.id} style={{ padding:16, borderRadius:12, marginBottom:10, background:T.surface, border:'1px solid '+T.line, opacity: r.active ? 1 : 0.55 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background: r.active ? T.brand : T.muted, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{r.name}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                {r.from_time} – {r.to_time} · −{r.discount_pct}%
              </div>
            </div>
            <button onClick={()=>toggleRule(r)} style={{ ...btnS, padding:'6px 10px', fontSize:11 }}>
              {r.active ? '⏸ Pavza' : '▶ Aktiviraj'}
            </button>
            <button onClick={()=>openEdit(r)} style={btnS}><KI name="edit" size={14}/></button>
            <button onClick={()=>remove(r.id)} style={{...btnS,color:T.danger}}><KI name="trash" size={14}/></button>
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {(r.days||[]).map(d => (
              <span key={d} style={{ padding:'3px 8px', borderRadius:5, background: r.active ? T.accentSoft : T.surface3, color: r.active ? T.accent : T.muted, fontSize:11, fontWeight:600, textTransform:'capitalize' }}>{d}</span>
            ))}
          </div>
        </div>
      ))}

      <Modal open={!!modal} onClose={()=>setModal(null)} width={500}>
        <ModalHeader title={modal?.id?'Uredi pravilo':'Novo happy hour pravilo'} onClose={()=>setModal(null)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'65vh', overflowY:'auto' }}>
          <Field label="Ime pravila *">
            <input value={modal?.name||''} onChange={e=>setModal(p=>({...p,name:e.target.value}))} placeholder="Bar happy hour, Jutranjo kavo..." style={inp} autoFocus/>
          </Field>
          <Field label="Popust (%) *">
            <input type="number" onFocus={e => e.target.select()} min="1" max="99" value={modal?.discount_pct||20} onChange={e=>setModal(p=>({...p,discount_pct:e.target.value}))} style={inp}/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Od *">
              <input type="time" value={modal?.from_time||'17:00'} onChange={e=>setModal(p=>({...p,from_time:e.target.value}))} style={inp}/>
            </Field>
            <Field label="Do *">
              <input type="time" value={modal?.to_time||'19:00'} onChange={e=>setModal(p=>({...p,to_time:e.target.value}))} style={inp}/>
            </Field>
          </div>
          <Field label="Dnevi *">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {DAYS.map(d => {
                const sel = (modal?.days||[]).includes(d.id)
                return (
                  <button key={d.id} onClick={()=>setModal(p=>({...p,days:sel?(p.days||[]).filter(x=>x!==d.id):[...(p.days||[]),d.id]}))}
                    style={{ padding:'6px 12px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, background:sel?T.accent:T.surface3, color:sel?'#fff':T.ink }}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Kategorije (pusti prazno = vse)">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {realCats.map(c => {
                const sel = (modal?.selected_cats||[]).includes(c.id)
                return (
                  <button key={c.id} onClick={()=>setModal(p=>({...p,selected_cats:sel?(p.selected_cats||[]).filter(x=>x!==c.id):[...(p.selected_cats||[]),c.id]}))}
                    style={{ padding:'5px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12, background:sel?T.accentSoft:T.surface3, color:sel?T.accent:T.muted, display:'flex', alignItems:'center', gap:4 }}>
                    <span>{c.icon}</span> {c.name}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>Nobena izbrana = velja za vse kategorije</div>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={modal?.active!==false} onChange={e=>setModal(p=>({...p,active:e.target.checked}))} style={{ accentColor:T.accent }}/>
            Pravilo je aktivno
          </label>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setModal(null)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Kuhinja & Display ────────────────────────────────────────
function KuhinjaSection({ posData }) {
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('kds')
  const [kdsEnabled, setKdsEnabled] = useState(false)
  const [customerDisplay, setCustomerDisplay] = useState(false)
  const [kdsOrders, setKdsOrders] = useState([])
  const [now, setNow] = useState(new Date())

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const kitchenItems = posData.items.filter(i => i.kitchen)
  const nonKitchenItems = posData.items.filter(i => !i.kitchen)

  // Tick vsako sekundo za časovnike
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime fetch aktivnih KDS naročil
  useEffect(() => {
    if (!kdsEnabled) return
    let sub

    async function loadOrders() {
      const {data} = await createClient()
        .from('orders')
        .select(`
          id, opened_at, status,
          tables(name, spaces(name)),
          order_lines(id, name, qty, unit_price, note, items(kitchen))
        `)
        .eq('business_id', BUSINESS_ID)
        .in('status', ['open', 'in_progress'])
        // POPRAVLJENO (19.8.2026): `created_at` na orders ne obstaja -
        // kuhinjski zaslon je ostal prazen.
        .order('opened_at', { ascending: true })
      setKdsOrders(data || [])
    }

    loadOrders()

    // Supabase realtime subscription
    sub = createClient()
      .channel('kds_orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${BUSINESS_ID}`
      }, () => loadOrders())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_lines'
      }, () => loadOrders())
      .subscribe()

    return () => { if (sub) createClient().removeChannel(sub) }
  }, [kdsEnabled])

  async function toggleKitchen(item) {
    setSaving(item.id)
    try {
      const {error} = await createClient().from('items').update({ kitchen: !item.kitchen }).eq('id', item.id)
      if (error) throw error
      posData.refresh()
      showToast(item.kitchen ? `${item.name} odstranjen` : `${item.name} dodan v kuhinjo`)
    } catch(e) { showToast(e.message,false) }
    setSaving(null)
  }

  async function markDone(orderId) {
    const { error: doneErr } = await createClient().from('orders').update({ status: 'ready' }).eq('id', orderId)
    if (doneErr) { showToast('Naročila ni bilo mogoče označiti: ' + doneErr.message, false); return }
    showToast('Naročilo označeno kot pripravljeno ✓')
  }

  function elapsedMin(createdAt) {
    return Math.floor((now - new Date(createdAt)) / 60000)
  }

  function elapsedColor(min) {
    if (min < 5) return '#1f6b3a'
    if (min < 10) return '#b88c28'
    return '#a83232'
  }

  // Skupni znesek za customer display (zadnje odprto naročilo)
  const lastOrder = kdsOrders[kdsOrders.length - 1]
  const customerTotal = lastOrder
    ? (lastOrder.order_lines || []).reduce((s, l) => s + Number(l.unit_price || 0) * Number(l.qty || 1), 0)
    : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Kuhinja & display</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>KDS prikaz naročil + customer display</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer', background:T.surface, padding:'8px 12px', borderRadius:9, border:'1px solid '+T.line }}>
            <input type="checkbox" checked={kdsEnabled} onChange={e=>setKdsEnabled(e.target.checked)} style={{ accentColor:T.accent, width:15, height:15 }}/>
            🍳 Kuhinjski display
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, cursor:'pointer', background:T.surface, padding:'8px 12px', borderRadius:9, border:'1px solid '+T.line }}>
            <input type="checkbox" checked={customerDisplay} onChange={e=>setCustomerDisplay(e.target.checked)} style={{ accentColor:T.accent, width:15, height:15 }}/>
            💰 Customer display
          </label>
        </div>
      </div>

      {/* Tabi */}
      <div style={{ display:'flex', gap:2, background:T.surface3, padding:3, borderRadius:9, width:'fit-content' }}>
        {[['kds','🍳 KDS naročila'],['artikli','📋 Artikli za kuhinjo']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ padding:'7px 16px', borderRadius:7, border:'none', background:tab===id?T.header:'transparent', color:tab===id?T.headerInk:T.ink, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{lbl}</button>
        ))}
      </div>

      {/* KDS TAB */}
      {tab === 'kds' && (
        <div style={{ display:'grid', gridTemplateColumns: customerDisplay ? '1fr 320px' : '1fr', gap:12 }}>

          {/* Naročila */}
          <div>
            {!kdsEnabled ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, background:T.surface, borderRadius:12, border:'1px solid '+T.line }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🍳</div>
                <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>KDS je izklopljen</div>
                <div style={{ fontSize:12, marginTop:6 }}>Vklopi "Kuhinjski display" zgoraj da vidiš aktivna naročila v realnem času</div>
              </div>
            ) : kdsOrders.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:T.muted, background:'#0d2818', borderRadius:12 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#8FBF8F' }}>Ni aktivnih naročil</div>
                <div style={{ fontSize:12, color:'#4a7c59', marginTop:6 }}>Kuhinja prosta</div>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
                {kdsOrders.map(order => {
                  const min = elapsedMin(order.opened_at)
                  const color = elapsedColor(min)
                  const kitchenLines = (order.order_lines || []).filter(l => l.items?.kitchen !== false)
                  if (kitchenLines.length === 0) return null
                  const tableName = order.tables?.name || 'Hitra prodaja'
                  const spaceName = order.tables?.spaces?.name || ''
                  return (
                    <div key={order.id} style={{ background:'#0d2818', borderRadius:12, border:'2px solid '+color+'60', overflow:'hidden' }}>
                      {/* Header naročila */}
                      <div style={{ padding:'10px 14px', background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:16, color:'#f6f1e8' }}>{tableName}</div>
                          {spaceName && <div style={{ fontSize:11, color:'#4a7c59' }}>{spaceName}</div>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:color, animation: min>=10 ? 'pulse 1s infinite' : 'none' }}/>
                          <div style={{ fontSize:20, fontWeight:800, fontVariantNumeric:'tabular-nums', color }}>
                            {min}<span style={{ fontSize:12, color:'#4a7c59' }}>min</span>
                          </div>
                        </div>
                      </div>
                      {/* Artikli */}
                      <div style={{ padding:'10px 14px' }}>
                        {kitchenLines.map((line, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom: i<kitchenLines.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:color, flexShrink:0 }}>
                              {line.qty}×
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:14, fontWeight:600, color:'#f6f1e8' }}>{line.name}</div>
                              {line.note && <div style={{ fontSize:11, color:'#b88c28', marginTop:2 }}>📝 {line.note}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Gumb pripravljeno */}
                      <div style={{ padding:'8px 14px 12px' }}>
                        <button onClick={()=>markDone(order.id)} style={{ width:'100%', padding:'9px', borderRadius:8, background:T.accent, color:'#fff', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>
                          ✓ Pripravljeno
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Customer Display */}
          {customerDisplay && (
            <div style={{ background:'#0d2818', borderRadius:12, padding:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:300 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#4a7c59', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>SKUPAJ</div>
              <div style={{ fontSize:48, fontWeight:900, color:'#e9b949', fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
                {eur(customerTotal)}
              </div>
              {lastOrder && (
                <div style={{ fontSize:13, color:'#4a7c59', marginTop:16 }}>
                  {(lastOrder.order_lines||[]).length} artiklov · {lastOrder.tables?.name || 'Hitra prodaja'}
                </div>
              )}
              {!lastOrder && (
                <div style={{ fontSize:13, color:'#4a7c59', marginTop:12 }}>Dobrodošli!</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ARTIKLI TAB */}
      {tab === 'artikli' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:T.accentSoft, borderBottom:'1px solid '+T.line }}>
              <div style={{ fontWeight:700, fontSize:13, color:T.accent }}>🍳 Gre v kuhinjo ({kitchenItems.length})</div>
            </div>
            <div style={{ padding:8, maxHeight:400, overflowY:'auto' }}>
              {kitchenItems.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>Nobeden artikel</div>}
              {kitchenItems.map(it => (
                <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, marginBottom:4, background:T.surface2 }}>
                  <div style={{ flex:1, fontSize:13, fontWeight:500 }}>{it.name}</div>
                  <button onClick={()=>toggleKitchen(it)} disabled={saving===it.id} style={{ ...btnS, padding:'5px 10px', fontSize:11, color:T.danger }}>
                    {saving===it.id ? '...' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:T.surface2, borderBottom:'1px solid '+T.line }}>
              <div style={{ fontWeight:700, fontSize:13, color:T.muted }}>📋 Ni v kuhinji ({nonKitchenItems.length})</div>
            </div>
            <div style={{ padding:8, maxHeight:400, overflowY:'auto' }}>
              {nonKitchenItems.length === 0 && <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:12 }}>Vsi so v kuhinji</div>}
              {nonKitchenItems.map(it => (
                <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, marginBottom:4, background:T.surface2 }}>
                  <div style={{ flex:1, fontSize:13, fontWeight:500, color:T.muted }}>{it.name}</div>
                  <button onClick={()=>toggleKitchen(it)} disabled={saving===it.id} style={{ ...btnS, padding:'5px 10px', fontSize:11, color:T.accent }}>
                    {saving===it.id ? '...' : '+ Dodaj'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok}/>}
    </div>
  )
}

// ─── Autolock ─────────────────────────────────────────────────
function AutolockSection({ auth }) {
  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>Avtomatsko zaklepanje</div>
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:16 }}>
        {CFG.autoLockOptions.map(opt => {
          const active = auth.autoLock === opt.ms
          return (
            <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:9, marginBottom:4, cursor:'pointer', background: active?T.accentSoft:T.surface2, border:'1px solid '+(active?T.accent:T.lineSoft) }}>
              <input type="radio" name="autolock" checked={active} onChange={() => auth.setAutoLock(opt.ms)} style={{ accentColor:T.accent, width:16, height:16 }}/>
              <div style={{ fontSize:13, fontWeight:600, color: active?T.accent:T.ink }}>{opt.label}</div>
              {active && <KI name="check" size={16}/>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ─── FURS ─────────────────────────────────────────────────────
function FursSection() {
  const [settings, setSettings] = useState({
    autoFurs: true,
    showSkipFurs: true,
    requirePinForSkip: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fursStatus, setFursStatus] = useState(null) // null=loading, true=ok, false=error
  const [lastSync, setLastSync] = useState(null)
  const [testMode, setTestMode] = useState(false)

  useEffect(() => {
    async function load() {
      // Naloži pos_settings iz businesses tabele
      const {data} = await createClient()
        .from('businesses')
        .select('pos_settings')
        .eq('id', BUSINESS_ID)
        .single()

      if (data?.pos_settings?.furs) {
        setSettings(s => ({ ...s, ...data.pos_settings.furs }))
      }

      // Preveri FURS status
      try {
        const res = await fetch('/api/furs/status')
        if (res.ok) {
          const d = await res.json()
          setFursStatus(d.connected)
          setLastSync(d.lastSync || null)
          setTestMode(d.testMode || false)
        } else {
          setFursStatus(false)
        }
      } catch {
        setFursStatus(false)
      }
    }
    load()
  }, [])

  async function save(newSettings) {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      // Naloži obstoječe pos_settings
      const {data} = await createClient()
        .from('businesses')
        .select('pos_settings')
        .eq('id', BUSINESS_ID)
        .single()

      const existing = data?.pos_settings || {}
      const updated = { ...existing, furs: newSettings }

      const {error} = await createClient()
        .from('businesses')
        .update({ pos_settings: updated })
        .eq('id', BUSINESS_ID)

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) {
      console.error(e)
    }
    setSaving(false)
  }

  function toggle(key) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    save(next)
  }

  const statusColor = fursStatus === null ? T.muted : fursStatus ? T.accent : T.danger
  const statusLabel = fursStatus === null ? 'Preverjam...' : fursStatus ? 'POVEZANO' : 'NI POVEZAVE'
  const statusBg = fursStatus === null ? T.surface3 : fursStatus ? T.accentSoft : 'rgba(168,50,50,0.1)'

  return (
    <div style={{ maxWidth:580 }}>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>FURS & DDV</div>

      {/* Status kartice */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>FURS davčna potrditev</div>
            {lastSync && <div style={{ fontSize:12, color:T.muted, marginTop:3 }}>Zadnja sinhronizacija: {lastSync}</div>}
          </div>
          <span style={{ fontSize:11, fontWeight:800, padding:'5px 12px', borderRadius:6, background:statusBg, color:statusColor, letterSpacing:'0.06em' }}>
            {statusLabel}
          </span>
        </div>

        {/* Info blok */}
        <div style={{ padding:'12px 14px', background:T.surface2, borderRadius:9, fontSize:12, color:T.muted, lineHeight:1.6 }}>
          {fursStatus ? (
            <>
              <div style={{ color:T.ink, fontWeight:600, marginBottom:4 }}>
                {testMode ? '🧪 TEST način (FURS Playground)' : '✅ Produkcijski način'}
              </div>
              Certifikat je aktiven. Računi se davčno potrjujejo pri FURS.<br/>
              Za zamenjavo certifikata ali spremembo poslovnih prostorov pojdi v <b>Računko → Nastavitve → FURS</b>
            </>
          ) : fursStatus === false ? (
            <>
              <div style={{ color:T.danger, fontWeight:600, marginBottom:4 }}>⚠️ FURS ni dosegljiv</div>
              Certifikat morda ni nastavljen ali je potekel. Preveri nastavitve v <b>Računko → Nastavitve → FURS</b>
            </>
          ) : (
            'Preverjam FURS povezavo...'
          )}
        </div>
      </div>

      {/* POS nastavitve */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>POS nastavitve</span>
          {saved && <span style={{ fontSize:11, color:T.accent, fontWeight:600 }}>✓ Shranjeno</span>}
        </div>

        {[
          {
            key: 'autoFurs',
            label: 'Privzeto davčno potrdi vsak račun',
            desc: 'Checkbox "Davčno potrdi" je privzeto označen pri plačilu',
            icon: '✅'
          },
          {
            key: 'showSkipFurs',
            label: 'Pokaži gumb "Tiskaj brez FURS" v plačilu',
            desc: 'Omogoči blagajniku da izda račun brez davčne potrditve (npr. za interne).',
            icon: '🖨️'
          },
          {
            key: 'requirePinForSkip',
            label: 'Zahteva potrditev PIN za netiskane račune',
            desc: 'Blagajnik mora vnesti PIN vodja/lastnik za vsak račun brez FURS',
            icon: '🔐'
          },
        ].map(opt => (
          <div key={opt.key} onClick={()=>toggle(opt.key)}
            style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 0', borderBottom:'1px solid '+T.lineSoft, cursor:'pointer' }}>
            <div style={{ marginTop:2 }}>
              <div style={{ width:22, height:22, borderRadius:6, background: settings[opt.key] ? T.accent : T.surface3, border: '2px solid '+(settings[opt.key]?T.accent:T.line), display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                {settings[opt.key] && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L20 6"/></svg>}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>
                <span style={{ marginRight:6 }}>{opt.icon}</span>{opt.label}
              </div>
              <div style={{ fontSize:11, color:T.muted, marginTop:3, lineHeight:1.5 }}>{opt.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DDV stopnje info */}
      <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, padding:20 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>DDV stopnje (Slovenia)</div>
        {[
          { rate:'0%', label:'Oproščeno', desc:'Boni, vrednostni kuponi, finančne storitve', color:'#64748b' },
          { rate:'9,5%', label:'Nižja stopnja', desc:'Hrana in pijača (za s seboj), hotelske storitve, kulturne prireditve', color:'#3a6e8f' },
          { rate:'22%', label:'Splošna stopnja', desc:'Večina storitev in blaga — fitnes, fizioterapija, oblačila...', color:'#1f6b3a' },
        ].map(d => (
          <div key={d.rate} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:'1px solid '+T.lineSoft }}>
            <div style={{ width:48, textAlign:'center', fontWeight:800, fontSize:16, color:d.color, fontVariantNumeric:'tabular-nums' }}>{d.rate}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>{d.label}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{d.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop:12, fontSize:11, color:T.muted, lineHeight:1.5 }}>
          💡 DDV stopnjo nastavljaš za vsak artikel posebej v <b>Kategorije & Artikli</b>
        </div>
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────
function ProfileSection({ posData }) {
  const [saving, setSaving] = useState(false)
  const currentProfile = posData.businessProfile || 'all'

  async function select(pid) {
    if (saving) return
    setSaving(true)
    try {
      const { error: profErr } = await createClient().from('businesses').update({ profile_type: pid }).eq('id', BUSINESS_ID)
    if (profErr) { alert('Profila ni bilo mogoče shraniti: ' + profErr.message); return }
      posData.setBusinessProfile(pid)
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Tip poslovanja</div>
      <div style={{ fontSize:13, color:T.muted, marginBottom:20 }}>
        Izberi tip ki ustreza tvojemu poslovanju. Navigacija se prilagodi samodejno.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {CFG.profiles.map(p => {
          const selected = currentProfile === p.id
          return (
            <div key={p.id} onClick={() => select(p.id)} style={{
              padding:18, borderRadius:12, background:T.surface,
              border: selected ? '2px solid '+T.accent : '2px solid '+T.line,
              cursor:'pointer', position:'relative',
              boxShadow: selected ? '0 0 0 3px '+T.accentSoft : 'none',
              transition:'border 0.15s, box-shadow 0.15s',
            }}>
              {selected && (
                <div style={{ position:'absolute', top:14, right:14, width:24, height:24, borderRadius:'50%', background:T.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800 }}>✓</div>
              )}
              <div style={{ fontSize:26, marginBottom:10 }}>{p.icon}</div>
              <div style={{ fontSize:17, fontWeight:800, color: selected ? T.accent : T.ink }}>{p.name}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:4, lineHeight:1.5 }}>
                {p.nav.map(n => (
                  <span key={n} style={{ display:'inline-block', margin:'2px 3px 2px 0', padding:'2px 7px', borderRadius:5, background: selected ? T.accentSoft : T.surface3, color: selected ? T.accent : T.muted, fontSize:10, fontWeight:600, }}>{({floor:"Prostori",sale:"Prodaja",calendar:"Koledar",customers:"Stranke",packages:"Paketi",inventory:"Zaloga",reports:"Poročila",admin:"Nastavitve"})[n]||n}</span>
                ))}
              </div>
              {saving && selected && <div style={{ fontSize:10, color:T.muted, marginTop:6 }}>Shranjujem...</div>}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop:16, padding:'12px 14px', background:T.surface2, borderRadius:10, fontSize:12, color:T.muted }}>
        💡 Sprememba profila takoj posodobi navigacijo. Podatki ostanejo nespremenjeni.
      </div>
    </div>
  )
}

// ================================================================
// SHARED UI HELPERS
// ================================================================
function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  )
}

function Toast({ msg, ok }) {
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: ok ? T.accent : T.danger, color:'#fff', padding:'10px 20px', borderRadius:999, fontSize:13, fontWeight:600, zIndex:4000, boxShadow:'0 8px 24px rgba(0,0,0,0.2)', whiteSpace:'nowrap' }}>
      {ok ? '✓' : '✕'} {msg}
    </div>
  )
}

const inp = { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid rgba(0,0,0,0.15)', fontSize:13, outline:'none', background:'#fff', color:'#0D1F12', boxSizing:'border-box' }
const btnP = { background:'#0D1F12', color:'#fff', border:0, borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }
const btnS = { background:'#fff', color:'#666', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }


// ================================================================
// BELL NOTIFICATIONS
// ================================================================
function BellNotifications({ notifications, notifOpen, setNotifOpen, posData, orderListOpen, setOrderListOpen }) {
  const unread = notifications.filter(n => !n.read && !n.dismissed)
  const [unconfirmed, setUnconfirmed] = React.useState(0)
  const [resending, setResending] = React.useState(false)
  const loadUnconfirmed = React.useCallback(async () => {
    // DODANO (16.8.2026): pocakaj na razrescen business_id. Prej se je poizvedba
    // sprozila takoj ob izrisu in vrnila napako 400 ("orders.business_id=eq."
    // brez vrednosti). To je bila zadnja od treh takih poizvedb.
    if (!BUSINESS_ID) return
    try {
      // POPRAVLJENO (16.8.2026, KRITICNO): filter je iskal racune, ki IMAJO ZOI
      // in NIMAJO EOR - torej samo tiste, kjer je poskus stekel do FURS in bil
      // zavrnjen. Racunov, pri katerih se fiskalizacija sploh NI sprozila
      // (nimajo ne ZOI ne EOR), opozorilo ni zaznalo - in prav takih je bilo
      // 25. Napaka je bila torej dvojno skrita: racun ni fiskaliziran, blagajna
      // pa tega ne pove.
      //
      // Zdaj lovi VSE racune brez potrditve, ne glede na to, kako dalec je
      // poskus prisel.
      const { count } = await createClient()
        .from('payments')
        .select('id, orders!inner(business_id,status)', { count: 'exact', head: true })
        .is('furs_eor', null)
        .eq('orders.business_id', BUSINESS_ID)
        // DODANO (17.8.2026): stornirani racuni NE potrebujejo potrditve - so
        // ze razveljavljeni. Prej jih je zvonec stel med nepotrjene in kazal
        // stiri "nepotrjene" racune, ki so bili v resnici stornirani.
        .neq('orders.status', 'voided')
      setUnconfirmed(count || 0)
    } catch { /* tiho */ }
  }, [])
  React.useEffect(() => {
    loadUnconfirmed()
    const iv = setInterval(loadUnconfirmed, 30000) // osvezi vsakih 30s
    return () => clearInterval(iv)
  }, [loadUnconfirmed, notifOpen])
  async function resendUnconfirmed() {
    if (resending) return
    setResending(true)
    try {
      const res = await fetch('/api/furs/resubmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, onlyUnconfirmed: true }),
      })
      const d = await res.json()
      if (res.ok) {
        alert(`Poslano v potrditev.\nUspešnih: ${d.uspesnih ?? 0}, neuspešnih: ${d.neuspesnih ?? 0}`)
      } else {
        alert('Napaka: ' + (d.error || 'neznana'))
      }
    } catch (e) {
      alert('Napaka pri pošiljanju: ' + e.message)
    }
    setResending(false)
    loadUnconfirmed()
    posData.refresh()
  }
  const lowItems = posData.items.filter(i => i.stock !== null && i.low_stock > 0 && i.stock <= i.low_stock)
  const lowIngr = posData.ingredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  const sevColor = { danger:T.danger, warning:T.warn, info:T.accent }

  async function dismiss(id) {
    // POPRAVLJENO (14.8.2026): dodano preverjanje napake in stevila
    // dejansko spremenjenih vrstic - prej se ni preverjalo, ce je RLS
    // (ali kaj drugega) tiho blokiral posodobitev (0 vrstic, brez napake).
    const { error, count } = await createClient().from('pos_notifications').update({ dismissed:true }).eq('id', id).select('id', { count: 'exact' })
    if (error) {
      console.error('Napaka pri zavrnitvi obvestila:', error)
      alert('Napaka pri zavrnitvi obvestila: ' + error.message)
      return
    }
    if (!count) {
      console.warn('Zavrnitev obvestila ni spremenila nobene vrstice (id:', id, ') - preveri RLS pravice.')
    }
    posData.refresh()
  }

  // DODANO (16.8.2026): rocno posiljanje obvestila stranki iz POS terminala.
  // Pokaze, ali je bila stranka ze obvescena in kdaj, ter omogoca zavestno
  // ponovno posiljanje - prej ni bilo nobenega vpogleda in nobene kontrole.
  const [posiljam, setPosiljam] = useState<string | null>(null)

  // Korak 4 (24.8.2026): zahtevki, ki cakajo na placilo — kljuc je ID kartice.
  const [cakaNaPlacilo, setCakaNaPlacilo] = useState<Record<string, string>>({})
  const [potrjujem, setPotrjujem] = useState<string | null>(null)
  const [osvezitevStevec, setOsvezitevStevec] = useState(0)

  useEffect(() => {
    ;(async () => {
      const { data } = await createClient()
        .from('renewal_requests')
        .select('id, customer_package_id')
        .eq('business_id', BUSINESS_ID)
        .eq('status', 'quoted')
      const m: Record<string, string> = {}
      for (const r of (data || [])) m[r.customer_package_id] = r.id
      setCakaNaPlacilo(m)
    })()
    // POPRAVLJENO (24.8.2026): seznam se je osvezil SAMO ob spremembi stevila
    // obvestil. Na terminalu, ki je odprt ves dan, lastnik ni izvedel, da je
    // stranka narocila podaljsanje - dokler ni strani nalozil znova.
  }, [notifications.length, osvezitevStevec])

  // Vsakih 60 sekund preverimo, ali je prisel nov zahtevek ali obvestilo.
  //
  // POPRAVLJENO (24.8.2026): casovnik je osvezeval SAMO seznam cakajocih
  // placil, obvestila pa so se nalozila le ob priklopu - novo obvestilo
  // "stranka zeli podaljsati" se v zvoncu ni pojavilo niti po stirih minutah.
  // Zdaj ponovno preberemo tudi obvestila.
  useEffect(() => {
    const t = setInterval(async () => {
      setOsvezitevStevec(x => x + 1)
      try {
        const { data } = await createClient().from('pos_notifications')
          .select('*, customers(name, email), customer_packages(id, name, template_id, expires, activated_at, purchased_at, remaining, total)')
          .eq('business_id', BUSINESS_ID).eq('dismissed', false)
          .order('created_at', { ascending: false })
        if (data) posData.setNotifications(data)
      } catch { /* brez omrezja poskusimo znova cez minuto */ }
    }, 60000)
    return () => clearInterval(t)
  }, [])

  /**
   * Potrdi, da je placilo predracuna prispelo (24.8.2026).
   *
   * Vse tezko delo opravi streznik: izda racun, ga poslje in podaljsa kartico.
   * Tu samo pokazemo, kaj se je zgodilo.
   */
  async function potrdiPlacilo(n: any) {
    const zahtevekId = cakaNaPlacilo[n.package_id]
    if (!zahtevekId) return
    if (!confirm('Potrdim, da je plačilo prispelo?\n\nIzdal se bo račun, kartica pa bo podaljšana od dneva po izteku.')) return

    setPotrjujem(n.id)
    try {
      const res = await fetch('/api/obnova/potrdi-placilo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zahtevekId }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Potrditev ni uspela.'); setPotrjujem(null); return }

      alert(
        `Račun ${d.stevilka} je izdan, kartica velja do ${new Date(d.veljaDo).toLocaleDateString('sl-SI')}.\n\n`
        + (d.poslano
            ? 'Račun je poslan stranki po e-pošti.'
            : `Računa NI bilo mogoče poslati: ${d.napakaPoste || 'stranka nima e-naslova'}`)
      )
      posData.refresh()
      window.location.reload()
    } catch (e: any) {
      alert('Potrditev ni uspela: ' + (e?.message || e))
    }
    setPotrjujem(null)
  }
  async function posljiStranki(n: any) {
    const cust = n.customers
    if (!cust?.email) { alert('Stranka nima vnesenega e-naslova.'); return }
    // DODANO (16.8.2026): preverimo, ali je bila stranka o TEJ KARTICI ze
    // obvescena - tudi ce je slo za DRUGO obvestilo (npr. "potece danes" proti
    // "potekla 1 dan nazaj"). Samodejno se poslje samo prvo; vsa nadaljnja
    // zahtevajo zavestno potrditev, da stranke ne zasujemo s sporocili.
    setPosiljam(n.id)
    const { data: prejsnja } = await createClient()
      .from('pos_notifications')
      .select('email_sent_at, message')
      .eq('customer_id', n.customer_id)
      .eq('package_id', n.package_id)
      .eq('email_sent', true)
      .order('email_sent_at', { ascending: false })
      .limit(1)
    const zadnje = prejsnja?.[0]
    if (zadnje) {
      const kdaj = zadnje.email_sent_at ? new Date(zadnje.email_sent_at).toLocaleString('sl-SI') : 'pred kratkim'
      if (!confirm(`${cust.name} je bil(a) o tej kartici že obveščen(a) ${kdaj}.\n\nPrejeto sporočilo: "${zadnje.message}"\n\nPošljem še eno sporočilo?`)) { setPosiljam(null); return }
    }
    try {
      // DODANO (22.8.2026): zeton za javno podaljsanje. Gumb v opomniku je
      // prej vodil v prazno (href="#"); zdaj vodi na stran, kjer si stranka
      // sama narosi predracun.
      let zetonObnove: string | null = null
      // POPRAVLJENO (24.8.2026): tabela `pos_notifications` ima stolpec
      // `package_id`, ne `customer_package_id` - pogoj zato NIKOLI ni drzal,
      // zeton se ni ustvaril in gumba "Podaljsaj kartico" v e-posti ni bilo.
      const karticaId = n.package_id ?? n.customer_package_id ?? null
      if (karticaId) {
        const { data: obstojec } = await createClient()
          .from('renewal_requests')
          .select('token')
          .eq('customer_package_id', karticaId)
          .in('status', ['pending', 'quoted'])
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (obstojec?.token) {
          zetonObnove = obstojec.token
        } else {
          // Brez predloge bi predracun nastal z zneskom 0 EUR - raje ne
          // ustvarimo nicesar in to povemo (24.8.2026).
          const predlogaId = n.customer_packages?.template_id ?? null
          if (!predlogaId) {
            console.warn('Zahtevka za podaljsanje ni mogoce ustvariti: kartica nima predloge paketa.')
            return
          }
          const nov = crypto.randomUUID().replace(/-/g, '')
          const { error: zErr } = await createClient().from('renewal_requests').insert({
            token: nov,
            business_id: BUSINESS_ID,
            customer_id: n.customer_id,
            customer_package_id: karticaId,
            template_id: predlogaId,
          })
          if (!zErr) zetonObnove = nov
          else console.error('Zetona za podaljsanje ni bilo mogoce ustvariti:', zErr.message)
        }
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cust.email,
          subject: n.type === 'expired' ? `Vaša karta je potekla` : `Vaša karta kmalu poteče`,
          customerName: cust.name,
          // Ime se je luscilo iz BESEDILA obvestila, ki ze vsebuje "potece cez
          // 7 dni" - v e-posti je pisalo "... potece cez 7 dni potece 29. avgust".
          packageName: n.customer_packages?.name
            || (n.message || '').split(':').slice(1).join(':').replace(/\s*poteče.*$/i, '').trim()
            || 'kartica',
          // Obdobje veljavnosti in preostali obiski (22.8.2026).
          expiresAt: n.customer_packages?.expires ?? null,
          validFrom: n.customer_packages?.activated_at ?? n.customer_packages?.purchased_at ?? null,
          remaining: n.customer_packages?.remaining ?? null,
          // Kontakt in povezava za podaljsanje (22.8.2026): gumb v e-posti je
          // prej vodil v prazno (href="#"), noga pa je pisala "Poklicite nas"
          // brez stevilke.
          orgPhone: posData?.org?.phone ?? null,
          orgEmail: posData?.org?.email ?? null,
          obnovaUrl: zetonObnove ? `${window.location.origin}/obnova/${zetonObnove}` : null,
          severity: n.severity,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        // POPRAVLJENO (22.8.2026): `e.error` je bil lahko PREDMET, zato je
        // uporabnik videl "[object Object]" namesto razloga.
        const razlog =
          (typeof e?.error === 'string' && e.error) ||
          (typeof e?.error?.message === 'string' && e.error.message) ||
          (typeof e?.message === 'string' && e.message) ||
          `Pošiljanje ni uspelo (HTTP ${res.status})`
        throw new Error(razlog)
      }
      const { error } = await createClient().from('pos_notifications')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', n.id)
      if (error) alert('Sporočilo je poslano, oznake pa ni bilo mogoče shraniti: ' + error.message)
      posData.refresh()
    } catch (e: any) {
      alert('Sporočila ni bilo mogoče poslati: ' + e.message)
    }
    setPosiljam(null)
  }

  async function markAllRead() {
    const { error } = await createClient().from('pos_notifications').update({ read:true }).eq('business_id', BUSINESS_ID).eq('dismissed', false)
    if (error) {
      console.error('Napaka pri oznacevanju kot prebrano:', error)
      alert('Napaka: ' + error.message)
      return
    }
    posData.refresh()
  }

  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setNotifOpen(o=>!o)} style={{ position:'relative', width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T.headerInk }}>
        <KI name="bell" size={18}/>
        {(unread.length + unconfirmed) > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4, minWidth:18, height:18, padding:'0 4px', borderRadius:9, background:T.danger, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid '+T.header }}>
            {(unread.length + unconfirmed) > 9 ? '9+' : (unread.length + unconfirmed)}
          </span>
        )}
      </button>

      {notifOpen && (
        <>
          <div onClick={()=>setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:44 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:45, width:360, maxHeight:480, background:'#fff', color:T.ink, borderRadius:13, boxShadow:'0 16px 48px rgba(0,0,0,0.22)', border:'1px solid '+T.line, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid '+T.line, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Opozorila <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>({unread.length} novih)</span></div>
              {unread.length > 0 && <button onClick={markAllRead} style={{ fontSize:11, color:T.accent, background:'none', border:0, cursor:'pointer', fontWeight:600 }}>Označi vse kot prebrano</button>}
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {unconfirmed > 0 && (
                <div style={{ padding:'14px 16px', borderBottom:'1px solid '+T.line, background:'rgba(220,38,38,0.06)' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ fontSize:18, lineHeight:1, marginTop:1 }}>⚠️</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:T.danger, lineHeight:1.4 }}>
                        {unconfirmed} {unconfirmed === 1 ? 'nepotrjen račun' : (unconfirmed < 5 ? 'nepotrjeni računi' : 'nepotrjenih računov')} pri FURS
                      </div>
                      <div style={{ fontSize:11, color:T.muted, marginTop:3, lineHeight:1.4 }}>
                        Računi so izdani in shranjeni, a še nimajo EOR (npr. zaradi izpada povezave). Po zakonu jih je treba potrditi v 2 delovnih dneh.
                      </div>
                      <button onClick={resendUnconfirmed} disabled={resending}
                        style={{ marginTop:8, width:'100%', padding:'8px', borderRadius:8, background:resending?T.surface2:T.danger, border:'none', cursor:resending?'default':'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, color:resending?T.muted:'#fff' }}>
                        {resending ? 'Pošiljam…' : `📤 Pošlji ${unconfirmed} v potrditev`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {notifications.length === 0 && unconfirmed === 0 && (
                <div style={{ padding:32, textAlign:'center', color:T.muted, fontSize:13 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🎉</div>
                  Ni aktivnih opozoril
                </div>
              )}
              {notifications.map(n => (
                <div key={n.id} style={{ padding:'12px 16px', borderBottom:'1px solid '+T.lineSoft, background:n.read?T.surface:T.surface2, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:sevColor[n.severity]||T.muted, marginTop:5, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight: n.read?400:600, lineHeight:1.4 }}>{n.message}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{new Date(n.created_at).toLocaleDateString('sl-SI')}</div>
                    {/* DODANO (16.8.2026): stanje obvescanja stranke + rocno posiljanje */}
                    {n.customer_id && (
                      <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        {(() => {
                          // Obvescenost velja za CELOTNO kartico, ne le za to
                          // obvestilo - stranka je morda prejela sporocilo ob
                          // prejsnji stopnji ("potece danes" proti "potekla").
                          const sestra = notifications.find((o: any) =>
                            o.customer_id === n.customer_id && o.package_id === n.package_id && o.email_sent)
                          const obvescena = n.email_sent ? n : sestra
                          if (obvescena) return (
                            <span style={{ fontSize:11, color:T.accent, fontWeight:600 }}>
                              ✉ Obveščena {obvescena.email_sent_at ? new Date(obvescena.email_sent_at).toLocaleString('sl-SI', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}
                            </span>
                          )
                          return (
                            <span style={{ fontSize:11, color:T.muted }}>
                              {n.customers?.email ? '✉ Še ni obveščena' : '✉ Brez e-naslova'}
                            </span>
                          )
                        })()}
                        {n.customers?.email && (<>
                          <button onClick={()=>posljiStranki(n)} disabled={posiljam===n.id}
                            style={{ fontSize:11, fontWeight:600, color:T.accent, background:'none', border:'1px solid '+T.line, borderRadius:6, padding:'2px 8px', cursor:posiljam===n.id?'default':'pointer', fontFamily:'inherit', opacity:posiljam===n.id?0.5:1 }}>
                            {posiljam===n.id ? 'Pošiljam…' : (n.email_sent || notifications.some((o: any) => o.customer_id === n.customer_id && o.package_id === n.package_id && o.email_sent)) ? 'Pošlji znova' : 'Pošlji stranki'}
                          </button>

                          {/* DODANO (24.8.2026): korak 4 — potrditev placila.
                              Izda racun, ga poslje stranki, PODALJSA kartico od
                              dneva PO izteku stare in opusti to obvestilo.
                              Prikaze se le, ce je stranka ze narocila predracun. */}
                          {/* Gumb SAMO pri obvestilu o predracunu (24.8.2026).
                              Prej se je pokazal pri obeh obvestilih iste kartice -
                              dve vstopni tocki za isto dejanje sta zmedli. */}
                          {cakaNaPlacilo[n.package_id] && String(n.message || '').includes('predračun') && (
                            <button onClick={()=>potrdiPlacilo(n)} disabled={potrjujem===n.id}
                              style={{ marginLeft:6, padding:'4px 10px', borderRadius:7, border:'none', background:T.accent, color:'#fff', fontSize:11, fontWeight:700, cursor: potrjujem===n.id ? 'wait' : 'pointer', fontFamily:'inherit' }}>
                              {potrjujem===n.id ? 'Potrjujem…' : '✓ Plačilo prejeto'}
                            </button>
                          )}
                        </>)}
                      </div>
                    )}
                  </div>
                  <button onClick={()=>dismiss(n.id)} title="Opusti" style={{ background:'none', border:0, cursor:'pointer', color:T.muted, padding:2, flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
            {notifications.length > 0 && (
              <div style={{ padding:'10px 16px', borderTop:'1px solid '+T.line }}>
                {(lowItems.length + lowIngr.length) > 0 && (
                  <button onClick={()=>{setOrderListOpen(true);setNotifOpen(false)}} style={{ width:'100%', padding:'8px', borderRadius:8, background:T.accent, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12, color:'#fff', marginBottom:6 }}>Narocilnica ({lowItems.length + lowIngr.length})</button>
                )}
                <button onClick={async()=>{
                  // POPRAVLJENO (14.8.2026): dodano preverjanje napake/stevila
                  // vrstic - prej se ni preverjalo, ce RLS tiho blokira posodobitev.
                  const { error, count } = await createClient().from('pos_notifications').update({dismissed:true}).eq('business_id',BUSINESS_ID).eq('dismissed', false).select('id', { count: 'exact' })
                  if (error) {
                    console.error('Napaka pri "Pocisti vse":', error)
                    alert('Napaka pri čiščenju obvestil: ' + error.message)
                    return
                  }
                  if (!count) {
                    console.warn('"Pocisti vse" ni spremenilo nobene vrstice - preveri RLS pravice ali business_id.')
                  }
                  posData.refresh(); setNotifOpen(false)
                }}
                  style={{ width:'100%', padding:'8px', borderRadius:8, background:T.surface2, border:'1px solid '+T.line, cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12, color:T.muted }}>
                  Počisti vse
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================
// ORDER LIST MODAL
// ================================================================
function OrderListModal({ posData, onClose }) {
  const low = posData.items.filter(i => i.stock !== null && i.low_stock > 0 && i.stock <= i.low_stock)
  const lowI = posData.ingredients.filter(i => i.stock_qty !== null && i.stock_qty <= (i.min_stock||0) && i.min_stock > 0)
  return (
    <Modal open onClose={onClose} width={600}>
      <ModalHeader title="Narocilnica" onClose={onClose}/>
      <div style={{ padding:'16px 20px', maxHeight:'75vh', overflowY:'auto' }}>
        <div style={{ fontSize:13, color:T.muted, marginBottom:16 }}>Artikli in surovine pod minimalno zalogo</div>
        {low.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>ARTIKLI</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                {['Artikel','Trenutno','Min','Manjka'].map((h,i)=>(<th key={i} style={{ padding:'8px 10px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>))}
              </tr></thead>
              <tbody>{low.map((it,i)=>(
                <tr key={it.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                  <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13, color:T.ink }}>{it.name}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:it.stock===0?T.danger:T.warn, fontWeight:700 }}>{it.stock} {it.unit||'kos'}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:T.muted, fontSize:12 }}>{it.low_stock}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:T.danger }}>{it.low_stock - it.stock} {it.unit||'kos'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {lowI.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>SUROVINE</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase' }}>
                {['Surovina','Trenutno','Min','Manjka'].map((h,i)=>(<th key={i} style={{ padding:'8px 10px', textAlign:i>0?'right':'left', borderBottom:'1px solid '+T.line }}>{h}</th>))}
              </tr></thead>
              <tbody>{lowI.map((ig,i)=>(
                <tr key={ig.id} style={{ background:i%2?T.surface2:T.surface, borderBottom:'1px solid '+T.lineSoft }}>
                  <td style={{ padding:'8px 10px', fontWeight:600, fontSize:13 }}>{ig.name}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:ig.stock_qty===0?T.danger:T.warn, fontWeight:700 }}>{ig.stock_qty} {ig.unit||'kos'}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', color:T.muted, fontSize:12 }}>{ig.min_stock}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:T.danger }}>{(ig.min_stock||0) - ig.stock_qty} {ig.unit||'kos'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={()=>window.print()} style={{ padding:'8px 18px', borderRadius:8, background:T.accent, border:'none', color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>Natisni</button>
        </div>
      </div>
    </Modal>
  )
}
// ================================================================
// CUSTOMER EDIT BUTTON + MODAL
// ================================================================
function CustomerEditButton({ customer, onSave }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)

  function openModal() {
    setData({ ...customer })
    setOpen(true)
  }

  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const {error} = await createClient().from('customers').update({
        name: data.name, phone: data.phone, email: data.email,
        birth_date: data.birth_date||null, address: data.address||null,
        notes: data.notes||null, gender: data.gender||null,
        marketing_consent: !!data.marketing_consent,
        notification_email: data.notification_email !== false,
      }).eq('id', customer.id)
      if (error) throw error
      setOpen(false); onSave()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <>
      <button onClick={openModal} style={{ ...btnS, padding:'9px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
        <KI name="edit" size={14}/> Uredi profil
      </button>
      <Modal open={open} onClose={()=>setOpen(false)} width={460}>
        <ModalHeader title="Uredi profil stranke" onClose={()=>setOpen(false)}/>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, maxHeight:'70vh', overflowY:'auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Ime in priimek *"><input value={data?.name||''} onChange={e=>setData(p=>({...p,name:e.target.value}))} style={inp}/></Field>
            <Field label="Spol">
              <select value={data?.gender||''} onChange={e=>setData(p=>({...p,gender:e.target.value}))} style={inp}>
                <option value="">—</option>
                <option value="m">Moški</option>
                <option value="f">Ženski</option>
                <option value="other">Drugo</option>
              </select>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Telefon"><input value={data?.phone||''} onChange={e=>setData(p=>({...p,phone:e.target.value}))} style={inp}/></Field>
            <Field label="Datum rojstva"><input type="date" value={data?.birth_date||''} onChange={e=>setData(p=>({...p,birth_date:e.target.value}))} style={inp}/></Field>
          </div>
          <Field label="Email"><input type="email" value={data?.email||''} onChange={e=>setData(p=>({...p,email:e.target.value}))} style={inp}/></Field>
          <Field label="Naslov"><input value={data?.address||''} onChange={e=>setData(p=>({...p,address:e.target.value}))} placeholder="Ulica 1, 1000 Ljubljana" style={inp}/></Field>
          <Field label="Interne opombe">
            <textarea value={data?.notes||''} onChange={e=>setData(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical' }} placeholder="Alergije, preference, posebnosti..."/>
          </Field>
          <div style={{ display:'flex', gap:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={data?.notification_email!==false} onChange={e=>setData(p=>({...p,notification_email:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Email obvestila (izteki kart)
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={!!data?.marketing_consent} onChange={e=>setData(p=>({...p,marketing_consent:e.target.checked}))} style={{ accentColor:T.accent }}/>
              Privolitev za marketing
            </label>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setOpen(false)} style={btnS}>Prekliči</button>
            <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?'Shranjujem...':'Shrani'}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ================================================================
// SELL PACKAGE MODAL — prodaja paketa stranki
// ================================================================
function SellPackageModal({ template, posData, onClose, auth, setPaymentOpen }) {
  const [customerId, setCustomerId] = useState(template?._preselectedCustomer?.id || '')
  const [custSearch, setCustSearch] = useState('')
  const [activationType, setActivationType] = useState(template.activation_type||'purchase')
  const [fixedDate, setFixedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [payInInstallments, setPayInInstallments] = useState(false)
  const [firstInstallmentPayNow, setFirstInstallmentPayNow] = useState(false)
  const [installmentCount, setInstallmentCount] = useState(6)
  const [installmentFrequency, setInstallmentFrequency] = useState('monthly')
  // DODANO (21.8.2026): ko se odpre placilno okno, se to okno SKRIJE. Prej se
  // je placilo odprlo POD njim in je bilo nedosegljivo - uporabnik je moral
  // gornje okno rocno zapreti z X, sicer je obtical.
  const [vOzadju, setVOzadju] = useState(false)
  const [firstDueDate, setFirstDueDate] = useState(lokalniDatum())
  const tconf = TEMPLATE_TYPES[template.template_type||'visits'] || TEMPLATE_TYPES.visits

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  const filtCust = posData.customers.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||'').includes(custSearch))
  const selCust = posData.customers.find(c => c.id === customerId)

  function calcExpiry() {
    let start = new Date()
    if (activationType === 'fixed_date' && fixedDate) start = new Date(fixedDate)
    if (template.validity_days) {
      const exp = new Date(start)
      exp.setDate(exp.getDate() + Number(template.validity_days))
      return lokalniDatum(exp)
    }
    if (template.fixed_end_date) return template.fixed_end_date
    return null
  }

  async function createInstallmentPlanAfterPayment(firstAlreadyPaid) {
    const db = createClient()
    const now = new Date().toISOString()
    const expiresAt = calcExpiry()
    // Kartica se aktivira TAKOJ (kot pri starem sistemu) - placilo se spremlja loceno preko obrokov
    const pkgPayload = {
      customer_id: customerId,
      template_id: template.id,
      template_type: template.template_type||'visits',
      activation_type: activationType,
      name: template.name,
      active: true,
      remaining: template.visits||null,
      total: template.visits||null,
      monetary_balance: template.monetary_value||null,
      expires: expiresAt,
      activated_at: activationType === 'purchase' ? now : null,
      valid_from: activationType === 'fixed_date' && fixedDate ? fixedDate : null,
      purchase_price: template.price,
      notes: notes||null,
      sold_by_staff_id: auth?.user?.id||null,
    }
    const { data: newPkg, error: pkgErr } = await db.from('customer_packages').insert(pkgPayload).select().single()
    if (pkgErr) throw pkgErr
    // KLJUCNO: template.price je CENA NA EN OBROK (npr. mesecna karta 31.99 x 6 mesecev = 191.94 skupaj),
    // NE skupna cena ki bi jo delili na count delov. Prejsnja logika je to napacno delila.
    const perInstallment = Number(template.price)
    const count = Number(installmentCount)
    const totalAmount = Math.round(perInstallment * count * 100) / 100
    const { data: plan, error: planErr } = await db.from('installment_plans').insert({
      business_id: BUSINESS_ID,
      customer_package_id: newPkg.id,
      customer_id: customerId,
      total_amount: totalAmount,
      installment_count: count,
      installment_amount: perInstallment,
      first_due_date: firstDueDate,
      frequency: installmentFrequency,
      status: 'active',
      created_by: auth?.user?.id || null,
    }).select().single()
    if (planErr) throw planErr
    const installmentRows = []
    for (let i = 0; i < count; i++) {
      const due = new Date(firstDueDate)
      if (installmentFrequency === 'monthly') due.setMonth(due.getMonth() + i)
      else due.setDate(due.getDate() + i * 7)
      installmentRows.push({
        plan_id: plan.id,
        installment_number: i + 1,
        due_date: lokalniDatum(due),
        amount: perInstallment,
        // Enako kot zgoraj: stopnja iz paketa, ne pavsalnih 22 % (21.8.2026).
        vat_rate: Number(template.vat_rate ?? 22),
        // Ce je prvi obrok ze placan na blagajni (firstAlreadyPaid), ga oznacimo
        // kot 'paid' takoj - e-mail/cron sistem ga preskoci, ker filtrira po status='pending'.
        status: (firstAlreadyPaid && i === 0) ? 'paid' : 'pending',
      })
    }
    const { data: insertedInstallments, error: instErr } = await db.from('installments').insert(installmentRows).select()
    if (instErr) throw instErr

    if (!firstAlreadyPaid) {
      // Ce prvi obrok zapade danes ali je ze v preteklosti, dnevni cron (ki tece
      // ob 6:00 in sicer tudi ujame zapadle/danasnje obroke) ga ne bi poslal
      // pravocasno - poslji racun/opomnik TAKOJ, ne caka se na jutrisnji run.
      const todayStr = lokalniDatum()
      const firstInst = insertedInstallments?.find((r) => r.installment_number === 1)
      if (firstInst && firstInst.due_date <= todayStr) {
        // C13 (22.8.2026): POCAKAMO na odgovor in povemo, ali je posta res
        // odsla. Prej se je klic sprozil brez cakanja in uporabnik ni izvedel
        // ne, da je uspelo, ne, da je spodletelo - v najboljsem primeru je
        // videl le "aktivirana".
        try {
          const res = await fetch('/api/installments/send-now', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installmentId: firstInst.id }),
          })
          if (res.ok) {
            showToast(`✓ Račun za 1. obrok poslan na ${selCust?.email}`)
          } else {
            const e = await res.json().catch(() => ({}))
            const razlog = (typeof e?.error === 'string' && e.error)
              || (typeof e?.error?.message === 'string' && e.error.message)
              || `HTTP ${res.status}`
            showToast('Paket je aktiviran, računa za 1. obrok pa NI bilo mogoče poslati: ' + razlog, false)
          }
        } catch (e: any) {
          showToast('Paket je aktiviran, računa za 1. obrok pa NI bilo mogoče poslati: ' + (e?.message || e), false)
        }
      }
    }

    showToast(`✓ ${template.name} aktivirana, ${count} obrokov načrtovanih${firstAlreadyPaid ? ' (1. obrok plačan na blagajni)' : ''}`)
    posData.refresh()
  }
  async function sellInInstallments() {
    if (!customerId) { showToast('Izberi stranko',false); return }
    if (!selCust?.email) {
      showToast('Stranka nima vnesenega e-maila - obroki se ne morejo avtomatsko poslati. Dodaj e-mail na profilu stranke.', false)
      return
    }
    if (firstInstallmentPayNow) {
      // Prvi obrok se placa TAKOJ na blagajni (gotovina/kartica), skozi ISTI
      // preverjeni FURS placilni tok kot vsaka druga prodaja (PaymentModal + submitPayment).
      // Kartica in plan obrokov se ustvarita SELE po uspesnem placilu (onSplitPaid callback),
      // enako kot pri navadni (ne-obrocni) prodaji paketa v sell().
      const perInstallment = Number(template.price)
      const firstLine = {
        lineId: 'installment-first-' + Date.now(),
        name: `${template.name} - 1. obrok`,
        price: perInstallment,
        qty: 1,
        // POPRAVLJENO (21.8.2026): stopnja je bila TRDO ZAPISANA na 22 %,
        // zato je bila izbira pri paketu ignorirana. Paket "10x fizioterapija"
        // z 0 % (oproscena zdravstvena storitev) je na racunu dobil 81,15 EUR
        // DDV - napacen davcni dokument, poslan tudi FURS.
        vat_rate: Number(template.vat_rate ?? 22),
        vat_exemption_code: template.vat_exemption_code || null,
        vat_exemption_custom_text: template.vat_exemption_custom_text || null,
      }
      setVOzadju(true)   // skrij to okno, da placilo ni pod njim (21.8.2026)
      setPaymentOpen({
        discount: 0,
        customerId,          // veze racun na stranko (21.8.2026)
        splitLines: [firstLine],
        onSplitPaid: async () => {
          try {
            await createInstallmentPlanAfterPayment(true)
          } catch (e) {
            alert('Napaka pri aktivaciji obrokov po placilu: ' + e.message)
          }
          onClose()
        }
      })
      return
    }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      await createInstallmentPlanAfterPayment(false)
      setTimeout(() => { posData.refresh(); onClose() }, 1500)
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }
  async function sell() {
    if (payInInstallments) { return sellInInstallments() }
    if (!customerId) { showToast('Izberi stranko',false); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      // KLJUCNO: paket se placa preko pravega placilnega toka (gotovina/kartica + FURS fiskalizacija),
      // kartica (customer_packages) se aktivira SELE po uspesnem placilu (onSplitPaid callback spodaj).
      const pkgLine = {
        lineId: 'pkg-' + Date.now(),
        name: template.name,
        price: Number(template.price || 0),
        qty: 1,
        // POPRAVLJENO (21.8.2026): stopnja je bila TRDO ZAPISANA na 22 %,
        // zato je bila izbira pri paketu ignorirana. Paket "10x fizioterapija"
        // z 0 % (oproscena zdravstvena storitev) je na racunu dobil 81,15 EUR
        // DDV - napacen davcni dokument, poslan tudi FURS.
        vat_rate: Number(template.vat_rate ?? 22),
        vat_exemption_code: template.vat_exemption_code || null,
        vat_exemption_custom_text: template.vat_exemption_custom_text || null,
      }
      setVOzadju(true)   // skrij to okno, da placilo ni pod njim (21.8.2026)
      setPaymentOpen({
        discount: 0,
        customerId,          // veze racun na stranko (21.8.2026)
        splitLines: [pkgLine],
        onSplitPaid: async () => {
          try {
            const now = new Date().toISOString()
            const expiresAt = calcExpiry()
            const payload = {
              customer_id: customerId,
              template_id: template.id,
              template_type: template.template_type||'visits',
              activation_type: activationType,
              name: template.name,
              active: true,
              remaining: template.visits||null,
              total: template.visits||null,
              monetary_balance: template.monetary_value||null,
              expires: expiresAt,
              activated_at: activationType === 'purchase' ? now : null,
              valid_from: activationType === 'fixed_date' && fixedDate ? fixedDate : null,
              purchase_price: template.price,
              notes: notes||null,
              sold_by_staff_id: auth?.user?.id||null,
            }
            const {error} = await createClient().from('customer_packages').insert(payload)
            if (error) throw error
            posData.refresh()
          } catch (e) {
            alert('Napaka pri aktivaciji kartice po placilu: ' + e.message)
          }
          onClose()
        }
      })
    } catch(e) { showToast(e.message,false) }
    setSaving(false)
  }

  return (
    <Modal open={!vOzadju} onClose={onClose} width={500}>
      <ModalHeader title={`Prodaj: ${template.name}`} onClose={onClose}/>
      <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Info kartica */}
        <div style={{ padding:14, borderRadius:10, background:tconf.color+'10', border:'1px solid '+tconf.color+'30', display:'flex', gap:12 }}>
          <div style={{ color:tconf.color }}><KI name={tconf.icon} size={28}/></div>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>{template.name}</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>💰 {eur(template.price)}</span>
              {template.validity_days && <span>📅 {template.validity_days} dni</span>}
              {template.visits && <span>🎯 {template.visits} obiskov</span>}
              {template.monetary_value && <span>💳 vrednost {eur(template.monetary_value)}</span>}
            </div>
          </div>
        </div>

        {/* Stranka */}
        <Field label="Stranka *">
          {selCust ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:T.accentSoft, borderRadius:9 }}>
              <div style={{ flex:1, fontWeight:600, color:T.accent }}>{selCust.name} {selCust.phone && `· ${selCust.phone}`}</div>
              <button onClick={()=>setCustomerId('')} style={{ background:'none', border:0, cursor:'pointer', color:T.accent }}><KI name="x" size={14}/></button>
            </div>
          ) : (
            <>
              <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Išči stranko po imenu ali telefonu..." style={{ ...inp, marginBottom:6 }}/>
              <div style={{ maxHeight:160, overflowY:'auto', border:'1px solid '+T.line, borderRadius:8, background:T.surface }}>
                {filtCust.slice(0,8).map(c=>(
                  <button key={c.id} onClick={()=>{setCustomerId(c.id);setCustSearch('')}} style={{ width:'100%', padding:'9px 12px', background:'transparent', border:0, borderBottom:'1px solid '+T.lineSoft, cursor:'pointer', fontFamily:'inherit', color:T.ink, textAlign:'left', fontSize:13, display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:T.surface3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 }}>{c.name.split(' ').map(w=>w[0]).join('')}</div>
                    <div><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:11, color:T.muted }}>{c.phone}</div></div>
                  </button>
                ))}
                {filtCust.length === 0 && <div style={{ padding:16, textAlign:'center', color:T.muted, fontSize:12 }}>Ni strank</div>}
              </div>
            </>
          )}
        </Field>

        {/* Aktivacija */}
        <Field label="Začetek veljavnosti">
          <div style={{ display:'flex', gap:5 }}>
            {Object.entries(ACTIVATION_TYPES).map(([k,v])=>{
              const sel = activationType === k
              return <button key={k} onClick={()=>setActivationType(k)} style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:sel?T.accent:T.surface3, color:sel?'#fff':T.muted }}>{v}</button>
            })}
          </div>
          {activationType === 'fixed_date' && (
            <input type="date" value={fixedDate} onChange={e=>setFixedDate(e.target.value)} style={{ ...inp, marginTop:6 }}/>
          )}
        </Field>

        {/* Datum izteka — preview */}
        {calcExpiry() && (
          <div style={{ padding:'10px 14px', background:T.surface2, borderRadius:9, fontSize:12, color:T.muted }}>
            📅 Poteče: <b style={{ color:T.ink }}>{new Date(calcExpiry()).toLocaleDateString('sl-SI')}</b>
            {activationType === 'first_use' && <span style={{ color:T.warn }}> (šteje od prvega obisku)</span>}
          </div>
        )}

        <Field label="Opomba (neobvezno)">
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Posebnosti, dogovor..." style={inp}/>
        </Field>

        <div style={{ padding:14, borderRadius:10, background:T.surface3, border:'1px solid '+T.line }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:600 }}>
            <input type="checkbox" checked={payInInstallments} onChange={e=>setPayInInstallments(e.target.checked)} style={{ accentColor:T.accent }}/>
            💳 Plačilo v obrokih (odložena plačila)
          </label>
          {/* DODANO (22.8.2026): opozorilo, ce organizacija nima IBAN-a.
              Obrocni racun gre stranki po e-posti z UPN QR kodo - brez IBAN-a
              koda nima prejemnikovega racuna in banka placila ne izvede.
              Prej je uporabnik to izvedel sele, ko ga je stranka poklicala. */}
          {payInInstallments && !posData?.org?.iban && (
            <div style={{ marginTop:12, padding:'11px 13px', borderRadius:9, background:'rgba(163,45,45,0.08)', border:'1px solid rgba(163,45,45,0.25)', fontSize:12, lineHeight:1.55, color:T.danger }}>
              <strong>Manjka IBAN.</strong> Stranka bo prejela račun brez QR kode
              in brez številke računa za nakazilo. Vpišite ga v
              <strong> Nastavitve → Bančni podatki</strong>, nato ponovite prodajo.
            </div>
          )}

          {payInInstallments && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:12 }}>
              <Field label="Število obrokov">
                <input type="number" onFocus={e => e.target.select()} min={2} max={24} value={installmentCount} onChange={e=>setInstallmentCount(e.target.value)} style={inp}/>
              </Field>
              <Field label="Pogostost">
                <select value={installmentFrequency} onChange={e=>setInstallmentFrequency(e.target.value)} style={inp}>
                  <option value="monthly">Mesečno</option>
                  <option value="weekly">Tedensko</option>
                </select>
              </Field>
              <Field label="Prvi obrok">
                <input type="date" value={firstDueDate} onChange={e=>setFirstDueDate(e.target.value)} style={inp}/>
              </Field>
              <div style={{ gridColumn:'1 / -1', fontSize:12, color:T.muted }}>
                {installmentCount}× {eur(Number(template.price))} (skupaj {eur(Math.round(Number(template.price)*Number(installmentCount)*100)/100)}) — kartica se aktivira takoj, račun oziroma opomnik se pošlje samodejno pred vsakim obrokom
              </div>
              <div style={{ gridColumn:'1 / -1', display:'flex', gap:8, marginTop:4 }}>
                <button type="button" onClick={()=>setFirstInstallmentPayNow(false)} style={{ flex:1, padding:'8px 6px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:!firstInstallmentPayNow?T.accent:T.surface2, color:!firstInstallmentPayNow?'#fff':T.muted }}>📧 1. obrok: pošlji na e-mail</button>
                <button type="button" onClick={()=>setFirstInstallmentPayNow(true)} style={{ flex:1, padding:'8px 6px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:11, background:firstInstallmentPayNow?T.accent:T.surface2, color:firstInstallmentPayNow?'#fff':T.muted }}>💳 1. obrok: plačaj zdaj (blagajna)</button>
              </div>
            </div>
          )}
        </div>

        {toast && <div style={{ padding:'9px 12px', borderRadius:8, background:toast.ok?T.accentSoft:'rgba(168,50,50,0.10)', color:toast.ok?T.accent:T.danger, fontSize:12, fontWeight:600 }}>{toast.msg}</div>}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={sell} disabled={saving||!customerId} style={{ ...btnP, background:tconf.color, opacity:(saving||!customerId)?0.5:1 }}>
            {saving ? '⏳ Shranjujem...' : payInInstallments ? `✓ Aktiviraj (${installmentCount}x obrok)` : `✓ Prodaj ${eur(template.price)}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ================================================================
// MAIN APP
// ================================================================
function KlasikApp() {
  const auth = useAuthState(60000)
  const posData = usePosData()
  const [profileId, setProfileId] = useState('all')

  // Sync profileId iz Supabase ob loadu
  useEffect(() => {
    if (posData.businessProfile && posData.businessProfile !== profileId) {
      setProfileId(posData.businessProfile)
    }
  }, [posData.businessProfile])

  const profile = CFG.profiles.find(p => p.id === profileId) || CFG.profiles[0]

  // POPRAVLJENO (16.8.2026, VARNOST): 'admin' je bil null = dostopen VSEM,
  // vkljucno z blagajniki, ki imajo systemSettings:false - lahko so urejali
  // cenik, zaposlene in nastavitve sistema. 'orders' (Racuni) ostaja odprt
  // vsem, ker blagajnik potrebuje ponoven izpis racuna - gumba za storno in
  // vracilo znotraj pa sta zdaj zaklenjena s svojima pravicama.
  const screenPerm = { floor:null, sale:'sale', calendar:'manageBookings', customers:'viewMembers', packages:'editPrices', inventory:'editPrices', orders:null, reports:'viewReports', admin:'systemSettings' }
  const nav = profile.nav.filter(s => { const p = screenPerm[s]; if (!p) return true; return auth.permissions[p] })

  const [screen, setScreen] = useState('sale')

  // DODANO (16.8.2026, VARNOST): ob zamenjavi uporabnika VEDNO ponastavi pogled
  // na prodajo.
  //
  // Prej se pogled ni ponastavil: ce je lastnik zaklenil, medtem ko je bila
  // odprta stran z nastavitvami, je naslednji uporabnik pristal ZNOTRAJ njih -
  // tudi blagajnik, ki do njih nima pravice. Videl je seznam osebja z namigi
  // PIN-ov in lahko odprl obrazec za novega zaposlenega z vlogo Lastnik. To je
  // pomenilo pot do povisanja lastnih pravic.
  const zadnjiUporabnik = React.useRef<string | null>(null)
  React.useEffect(() => {
    const trenutni = auth.user?.id ?? null
    if (trenutni && zadnjiUporabnik.current && trenutni !== zadnjiUporabnik.current) {
      setScreen('sale')
    }
    if (trenutni) zadnjiUporabnik.current = trenutni
  }, [auth.user?.id])

  // Ce uporabnik nima pravice do trenutnega pogleda, ga vrni na prodajo.
  React.useEffect(() => {
    const potrebna = screenPerm[screen]
    if (potrebna && auth.permissions && !auth.permissions[potrebna]) {
      setScreen('sale')
    }
  }, [screen, auth.permissions])
  const [activePremise, setActivePremiseState] = useState(getActivePremise())
  const [activeDevice, setActiveDeviceState] = useState(getActiveDevice())
  const [showPremiseSelect, setShowPremiseSelect] = useState(!getActivePremise() && false)
  const [activeTable, setActiveTable] = useState(null)
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [tableSwitching, setTableSwitching] = useState(false)

  async function switchToTable(newTable) {
    if (tableSwitching) return
    setTableSwitching(true)
    try {
      // 1. Shrani trenutni cart za prejšnjo mizo (če je bila izbrana in ima artikle)
      if (activeTable) {
        const existing = await pos.orders.getOpenOnTable(activeTable.id)
        if (cart.length > 0) {
          const cashierId = auth?.user?.id || null
          const orderId = existing ? existing.id : await pos.orders.openOrder({ tableId: activeTable.id, customerId: activeCustomer?.id, cashierId })
          await pos.orders.replaceLines(orderId, cart.map(line => ({
            itemId: line.id, name: line.name, qty: line.qty, unitPrice: line.price,
            vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null,
          })))
          await pos.spaces.updateTableStatus(activeTable.id, 'occupied')
          posData.refresh()
        } else if (existing) {
          // Cart je prazen - izbrišemo prazno naročilo če obstaja
          await pos.orders.closeOrderEmpty(existing.id)
          await pos.spaces.updateTableStatus(activeTable.id, 'free')
          posData.refresh()
        }
      }
      // 2. Naloži naročilo nove mize (če obstaja)
      if (newTable) {
        const existing = await pos.orders.getOpenOnTable(newTable.id)
        if (existing && existing.order_lines) {
          // `item_type` in `stock` v narocilu nista shranjena - poiscemo ju v
          // katalogu, sicer se ob zakljucku normativi ne bi odsteli (21.8.2026).
          setCart(existing.order_lines.map((l) => {
            const kat = posData.items.find(x => x.id === l.item_id)
            return {
              lineId: Math.random().toString(36).slice(2),
              id: l.item_id, name: l.name, qty: l.qty, price: Number(l.unit_price),
              vat_rate: l.vat_rate, mods: l.mods || [], note: l.note || null,
              item_type: kat?.item_type || 'simple', stock: kat?.stock,
            }
          }))
        } else {
          setCart([])
        }
      } else {
        setCart([])
      }
      setActiveTable(newTable)
    } catch (e) {
      console.error('Napaka pri menjavi mize:', e)
      alert('Napaka pri shranjevanju mize: ' + e.message)
    }
    setTableSwitching(false)
  }
  const [happyHourActive, setHappyHourActive] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [modifierPickModal, setModifierPickModal] = useState<any>(null)
  const [receipt, setReceipt] = useState(null)
  const [cashSession, setCashSession] = React.useState(null)
  const [showTableActions, setShowTableActions] = React.useState(false)
  const [sessionLoaded, setSessionLoaded] = React.useState(false)
  const [showOpenCash, setShowOpenCash] = React.useState(false)
  const [showVmesnoStanje, setShowVmesnoStanje] = React.useState(false)
  const [showCloseCash, setShowCloseCash] = React.useState(false)

  React.useEffect(() => {
    // POPRAVLJENO (16.8.2026): pocakaj, da je business_id razrescen. Prej se
    // je poizvedba sprozila TAKOJ ob izrisu, ko je bil se prazen - streznik je
    // vrnil napako 400 ("business_id=eq." brez vrednosti), v konzoli pa se je
    // ob vsakem odprtju blagajne pojavila napaka "getCurrentSession error".
    if (!posData.businessName && posData.loading) return
    // POPRAVLJENO (13.8.2026, KRITICNO): posreduje PRAVO PIN identiteto
    // (auth.user.id) - prej brez parametra, zato je vsak videl isto,
    // deljeno sejo ne glede na to, kdo je prijavljen.
    getCurrentSession(auth.user?.id).then(s => {
      setCashSession(s)
      setSessionLoaded(true)
    })
  }, [auth.user?.id, posData.loading, posData.businessName])

  function refreshSession() {
    getCurrentSession(auth.user?.id).then(s => setCashSession(s))
  }
  const [now, setNow] = useState(new Date())
  const [notifOpen, setNotifOpen] = useState(false)
  const [orderListOpen, setOrderListOpen] = useState(false)
  const [showClockIn, setShowClockIn] = useState(false)
  const [wsRefreshKey, setWsRefreshKey] = useState(0)

  const [sellPackageModal, setSellPackageModal] = useState(null)
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false)
  const [heldOrders, setHeldOrders] = useState<any[]>([])

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!nav.includes(screen)) setScreen(nav[0] || 'sale') }, [profileId])

  const totals = H.orderTotals(cart)

  async function addItem(item, happyOn = false) {
    // POPRAVLJENO (16.8.2026): upravicenost in odstotek iz AKTIVNEGA PRAVILA
    const hhRule = happyOn ? H.activeHappyHourRule(posData.happyHourRules) : null
    const eligible = !!hhRule && H.isHappyHourEligible(item, hhRule)
    const hhPct = Number(hhRule?.discount_pct ?? 0)
    // Preveri ali ima artikel modifier grupe
    const itemGroups = (posData?.items || []).length > 0 ? [] : []
    // Pridobi modifier grupe za ta artikel iz Supabase
    const { data: linkRows } = await createClient().from('item_modifier_group_links').select('group_id').eq('item_id', item.id)
    if (linkRows && linkRows.length > 0) {
      const groupIds = linkRows.map((l:any) => l.group_id)
      const { data: groups } = await createClient().from('item_modifier_groups').select('*, item_modifiers(*)').in('id', groupIds).order('sort_order')
      if (groups && groups.length > 0) {
        setModifierPickModal({ item, eligible, hhPct, groups, selected: {}, note: '', qty: 1 })
        return
      }
    }
    setCart(c => {
      const idx = c.findIndex(l => l.id === item.id && l.happyHourApplied === eligible && l.mods.length === 0)
      if (idx >= 0) { const cp = [...c]; cp[idx] = {...cp[idx], qty: cp[idx].qty + 1}; return cp }
      // DODANO (19.8.2026): klavzula o neobracunanem DDV potuje z artiklom v
      // kosarico, da se lahko izpise na listku (ZDDV-1 zahteva navedbo razloga).
      /* POPRAVLJENO (21.8.2026): vrstica v kosarici ni nosila `item_type`.
                          Zato je `cart.filter(l => l.item_type === 'recipe')` vedno vrnil
                          PRAZEN seznam in normativi se NIKOLI niso odsteli - prodaja
                          7 kozarcev vina ni zmanjsala zaloge surovine. Poleg tega je
                          `undefined !== 'recipe'` pomenilo, da je koda poskusila odpisati
                          zalogo SAMEMU receptu, ki je nima. */
      return [...c, { lineId: Math.random().toString(36).slice(2), id: item.id, name: item.name, price: Number(item.price), qty: 1, vat_rate: Number(item.vat_rate ?? 22), item_type: item.item_type || 'simple', stock: item.stock, vat_exemption_code: item.vat_exemption_code || null, vat_exemption_custom_text: item.vat_exemption_custom_text || null, unit: item.unit || 'kos', mods: [], note: '', happyHourApplied: eligible, happyHourPct: hhPct }]
    })
  }

  function adjustQty(lineId, delta) {
    setCart(c => c.flatMap(l => l.lineId === lineId ? (l.qty + delta <= 0 ? [] : [{...l, qty: l.qty + delta}]) : [l]))
  }

  const days = ['Ned','Pon','Tor','Sre','Čet','Pet','Sob']

  return (
    <div style={{ width:'100%', height:'100%', background:T.bg, color:T.ink, fontFamily:'"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize:13, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

      {/* HEADER */}
      <div style={{ background:T.header, color:T.headerInk, padding:'8px 16px', display:'flex', alignItems:'center', gap:14, flexShrink:0, borderBottom:'1px solid '+T.headerLine, minHeight:56 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:T.brand, color:T.header, fontWeight:800, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>R</div>
          <div style={{ lineHeight:1.1 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{posData.businessName || 'Blagajna'}</div>
            <div style={{ fontSize:11, opacity:0.65, marginTop:2 }}>{profile.name}</div>
          </div>
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          {auth.permissions?.viewSales && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
              <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Promet</div>
              {/* POPRAVLJENO (25.8.2026): glava je prometu PRISTEVALA trenutno kosarico,
                  ki se ni placana - stevilka, po kateri se blagajnik ravna med
                  dnevom, je bila previsoka, ob praznjenju kosarice pa je padla
                  brez razloga. Promet so IZDANI racuni. */}
              <div style={{ fontSize:15, fontWeight:800, color:T.brand, fontVariantNumeric:'tabular-nums' }}>{eur(posData.todayStats.promet)}</div>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
            <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Računi</div>
            <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{posData.todayStats.racuni}</div>
          </div>
          <div style={{ borderLeft:'1px solid '+T.headerLine, paddingLeft:14, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
            <div style={{ fontSize:10, opacity:0.55, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{days[now.getDay()]}</div>
            <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
              {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
            </div>
          </div>
          {activePremise && <div style={{ fontSize:10, fontWeight:700, color:'#e9b949', background:'rgba(233,185,73,0.15)', padding:'4px 8px', borderRadius:6, letterSpacing:'0.04em' }}>📍 {activePremise.premise_id}</div>}
          {/* DODANO (17.8.2026): oznaka TESTNEGA nacina. Ker sta v nastavitvah
              lahko nalozena OBA certifikata, za pultom ni bilo nacina preveriti,
              kateri je aktiven - racun v testnem nacinu je videti enak pravemu,
              a pri FURS ne velja. */}
          {posData.fursTestMode && (
            <div title="Računi se pošiljajo v TESTNO okolje FURS in NISO davčno veljavni."
              style={{ fontSize:10, fontWeight:800, color:'#0d2818', background:'#e9b949', padding:'4px 9px', borderRadius:6, letterSpacing:'0.06em' }}>
              ⚠ TESTNI NAČIN
            </div>
          )}
          {/* Gumb "📜 AKT" je bil PRESTAVLJEN V NASTAVITVE (25.8.2026): v
              orodni vrstici je zasedal prostor, uporabi pa se redko - ob
              nadzoru. Zdaj je Nastavitve → Interni akt, poleg FURS in DDV. */}
          <WorkStatusBar key={wsRefreshKey} posData={posData} onRequestClockIn={()=>setShowClockIn(true)}/>
          <BellNotifications notifications={posData.notifications} notifOpen={notifOpen} setNotifOpen={setNotifOpen} posData={posData} orderListOpen={orderListOpen} setOrderListOpen={setOrderListOpen}/>
          {orderListOpen && <OrderListModal posData={posData} onClose={()=>setOrderListOpen(false)}/>}
          <button onClick={async()=>{
            const orders = await pos.orders.getHeldOrders()
            setHeldOrders(orders)
            setHeldOrdersOpen(true)
          }} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(233,185,73,0.15)', color:T.brand, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
            💾 {heldOrders.length > 0 ? heldOrders.length + ' shranjenih' : 'Shranjeni'}
          </button>
          {cashSession && (
            <button onClick={()=>setShowVmesnoStanje(true)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(37,99,235,0.15)', color:'#2563eb', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
              Vmesno stanje
            </button>
          )}
          {/* POPRAVLJENO (16.8.2026): gumb za zakljucek se prikaze SAMO tistemu,
              ki ima pravico. Prej ga je videl tudi blagajnik, klik pa ni naredil
              nicesar - videti je bilo, kot da aplikacija ne dela. Gumb, ki ga
              nekdo ne sme uporabiti, naj ga sploh ne vidi. */}
          {cashSession
            ? (auth?.permissions?.dailyClose
                ? <button onClick={()=>setShowCloseCash(true)}
                    style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(168,50,50,0.15)', color:T.danger, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
                    🔒 Zaključi
                  </button>
                : <span title="Dnevni zaključek lahko opravi le vodja ali lastnik."
                    style={{ padding:'5px 10px', borderRadius:7, background:'rgba(255,255,255,0.06)', color:T.inkSoft, fontSize:11, fontWeight:600 }}>
                    Blagajna odprta
                  </span>)
            : <button onClick={()=>setShowOpenCash(true)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:T.accentSoft, color:T.accent, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>
                🔓 Odpri
              </button>
          }
          <UserAvatar user={auth.user} onLock={auth.lock}/>
        </div>
      </div>

      {/* CONTEXT STRIP */}
      {(activeTable || activeCustomer || happyHourActive) && (
        <div style={{ background:T.brand, color:T.header, padding:'7px 18px', display:'flex', alignItems:'center', gap:14, fontSize:12, fontWeight:600, flexShrink:0 }}>
          {happyHourActive && <div style={{ display:'flex', alignItems:'center', gap:6 }}><KI name="happy" size={14}/><span>Happy hour <b>−{Number(H.activeHappyHourRule(posData.happyHourRules)?.discount_pct ?? 0)}%</b></span></div>}
          {activeTable && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="chair" size={14}/><span>Miza: <b>{activeTable.name}</b></span>
              <button onClick={() => setShowTableActions(true)} title="Upravljaj mizo" style={{ background:'rgba(13,40,24,0.15)', border:'none', cursor:'pointer', padding:'3px 8px', borderRadius:5, color:'inherit', display:'flex', fontWeight:800, fontSize:13 }}>⋯</button>
              <button onClick={() => switchToTable(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none', cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
          {activeCustomer && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <KI name="user" size={14}/><span>Stranka: <b>{activeCustomer.name}</b></span>
              <button onClick={() => setActiveCustomer(null)} style={{ background:'rgba(13,40,24,0.15)', border:'none', cursor:'pointer', padding:'3px 6px', borderRadius:5, color:'inherit', display:'flex' }}><KI name="x" size={11}/></button>
            </div>
          )}
        </div>
      )}

      {/* BODY */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        <SideNav screen={screen} setScreen={(id) => {
          // Ce zapuscamo prodajni zaslon z aktivno mizo, najprej pravilno
          // shrani kosarico in sprosti mizo (namesto da activeTable ostane
          // "obtican" in trak "Miza: X" ostane prikazan povsod po aplikaciji)
          if (id !== 'sale' && activeTable) { switchToTable(null) }
          setScreen(id)
        }} nav={nav} staffId={auth?.user?.id}/>
        <div style={{ flex:1, display:'flex', overflow:'hidden', minWidth:0 }}>
          {screen==='floor'     && <FloorScreen spaces={posData.spaces} switchToTable={switchToTable} setScreen={setScreen}/>}
          {screen==='sale'      && <SaleScreen activeTable={activeTable} setActiveTable={setActiveTable} activeCustomer={activeCustomer} cart={cart} setCart={setCart} addItem={addItem} adjustQty={adjustQty} setPaymentOpen={setPaymentOpen} totals={totals} setActiveCustomer={setActiveCustomer} posData={posData} happyHourActive={happyHourActive} setHappyHourActive={setHappyHourActive} cashSession={cashSession} onNeedOpenCash={()=>setShowOpenCash(true)} auth={auth}/>}
          {screen==='calendar'  && <CalendarScreen posData={posData}/>}
          {screen==='customers' && <CustomersScreen posData={posData} setActiveCustomer={setActiveCustomer} setScreen={setScreen} setSellPackageModal={setSellPackageModal}/>}
          {screen==='packages'  && <PackagesScreen posData={posData} setSellPackageModal={setSellPackageModal}/>}
          {screen==='inventory' && <InventoryScreen posData={posData}/>}
          {screen==='inventura' && <InventuraScreen posData={posData} auth={auth}/>}
          {screen==='orders'    && <OrdersScreen posData={posData} auth={auth}/>}
          {screen==='reports'   && <ReportsScreen posData={posData} auth={auth} setScreen={setScreen}/>}
          {screen==='admin'     && <AdminScreen auth={auth} posData={posData}/>}
        </div>
      </div>

      {/* Modifier izbira modal */}
      {!!modifierPickModal && (
        <Modal open onClose={()=>setModifierPickModal(null)} width={480}>
          <div style={{ padding:'20px 22px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Dodaj v naročilo</div>
                <div style={{ fontSize:22, fontWeight:800 }}>{modifierPickModal.item.name}</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800 }}>
                {(() => {
                  const base = Number(modifierPickModal.item.price)
                  const delta = Object.values(modifierPickModal.selected as Record<string,any>).flat().reduce((s:number,m:any)=>s+(m.price_delta||0),0)
                  return '€' + ((base + delta) * modifierPickModal.qty).toFixed(2).replace('.',',')
                })()}
              </div>
            </div>
            {modifierPickModal.groups.map((g:any) => (
              <div key={g.id} style={{ marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>
                  {g.name} {g.required && <span style={{ fontSize:10, background:T.accent, color:'#fff', borderRadius:4, padding:'1px 6px', marginLeft:4 }}>OBVEZNO</span>}
                  {g.multi_select && <span style={{ fontSize:11, color:T.muted, marginLeft:4 }}>več izbir</span>}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {(g.item_modifiers||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((m:any) => {
                    const sel = g.multi_select
                      ? ((modifierPickModal.selected[g.id]||[]) as any[]).some((s:any)=>s.id===m.id)
                      : modifierPickModal.selected[g.id]?.id === m.id
                    return (
                      <button key={m.id} onClick={()=>{
                        setModifierPickModal((p:any) => {
                          const cur = {...p.selected}
                          if (g.multi_select) {
                            const arr = [...(cur[g.id]||[])]
                            const idx = arr.findIndex((s:any)=>s.id===m.id)
                            if (idx>=0) arr.splice(idx,1); else arr.push(m)
                            cur[g.id] = arr
                          } else {
                            cur[g.id] = cur[g.id]?.id === m.id ? null : m
                          }
                          return {...p, selected: cur}
                        })
                      }} style={{ padding:'9px 14px', borderRadius:9, border:'2px solid '+(sel?T.accent:T.line), background:sel?T.accentSoft:T.surface, cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:sel?700:500 }}>
                        {m.name}{m.price_delta ? <span style={{ color:T.muted, fontSize:11 }}> {m.price_delta>0?'+':''}{m.price_delta}€</span> : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div style={{ borderTop:'1px solid '+T.line, paddingTop:12, marginTop:4 }}>
              <div style={{ fontSize:12, color:T.muted, marginBottom:4 }}>Opomba kuhinji</div>
              <input value={modifierPickModal.note} onChange={e=>setModifierPickModal((p:any)=>({...p,note:e.target.value}))} placeholder="npr. brez čebule, na pol pečeno..." style={{...inp,width:'100%',boxSizing:'border-box'}}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:13 }}>Količina</span>
                <button onClick={()=>setModifierPickModal((p:any)=>({...p,qty:Math.max(1,p.qty-1)}))} style={{ width:32,height:32,borderRadius:8,border:'1px solid '+T.line,background:T.surface,cursor:'pointer',fontSize:18,fontFamily:'inherit' }}>−</button>
                <span style={{ fontWeight:700, fontSize:16, minWidth:24, textAlign:'center' }}>{modifierPickModal.qty}</span>
                <button onClick={()=>setModifierPickModal((p:any)=>({...p,qty:p.qty+1}))} style={{ width:32,height:32,borderRadius:8,border:'1px solid '+T.line,background:T.surface,cursor:'pointer',fontSize:18,fontFamily:'inherit' }}>+</button>
              </div>
              <div style={{ fontSize:20, fontWeight:800 }}>
                {(() => {
                  const base = Number(modifierPickModal.item.price)
                  const delta = Object.values(modifierPickModal.selected as Record<string,any>).flat().filter(Boolean).reduce((s:number,m:any)=>s+(m?.price_delta||0),0)
                  return '€' + ((base + delta) * modifierPickModal.qty).toFixed(2).replace('.',',')
                })()}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={()=>setModifierPickModal(null)} style={{ flex:1,padding:'12px',borderRadius:9,border:'1px solid '+T.line,background:'transparent',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:13 }}>Prekliči</button>
              <button onClick={()=>{
                const { item, eligible, hhPct, selected, note, qty } = modifierPickModal
                // Preveri obvezne grupe
                const missing = modifierPickModal.groups.filter((g:any) => g.required && !selected[g.id])
                if (missing.length > 0) { alert('Izberi: ' + missing.map((g:any)=>g.name).join(', ')); return }
                // Zberi vse izbrane modifierje
                const mods = Object.values(selected as Record<string,any>).flat().filter(Boolean).map((m:any)=>({ id:m.id, name:m.name, delta:m.price_delta||0 }))
                const modDelta = mods.reduce((s:number,m:any)=>s+m.delta,0)
                for (let i=0; i<qty; i++) {
                  // POPRAVLJENO (16.8.2026, OBRACUN): prej "price: item.price + modDelta",
                  // hkrati pa se doplacila hranijo se v mods. H.lineTotal in
                  // replaceLines pristejeta mods.delta k price, zato se je doplacilo
                  // steto DVAKRAT - stranka bi bila preplacana za znesek doplacil.
                  // Osnovna cena zdaj ostane cista, doplacila nosi mods.
                  setCart((c:any[]) => [...c, { lineId: Math.random().toString(36).slice(2), id: item.id, name: item.name, price: Number(item.price), qty: 1, vat_rate: Number(item.vat_rate ?? 22), item_type: item.item_type || 'simple', stock: item.stock, vat_exemption_code: item.vat_exemption_code || null, vat_exemption_custom_text: item.vat_exemption_custom_text || null, unit: item.unit||'kos', mods, note: note||'', happyHourApplied: eligible, happyHourPct: Number(hhPct ?? 0) }])
                }
                setModifierPickModal(null)
              }} style={{ flex:2,padding:'12px',borderRadius:9,border:'none',background:T.accent,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14 }}>
                Dodaj v naročilo
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Shranjeni racuni modal */}
      {heldOrdersOpen && (
        <Modal open onClose={()=>setHeldOrdersOpen(false)} width={520}>
          <ModalHeader title="Shranjeni računi" onClose={()=>setHeldOrdersOpen(false)}/>
          <div style={{ padding:'16px 20px', maxHeight:'70vh', overflowY:'auto' }}>
            {heldOrders.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:T.muted }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💾</div>
                Ni shranjenih racunov
              </div>
            ) : heldOrders.map((o:any) => {
              const lines = o.order_lines || []
              const total = lines.reduce((s:number,l:any) => s + Number(l.qty||1)*Number(l.unit_price||0), 0)
              const label = o.hold_label || o.tables?.name || o.id.slice(-6)
              return (
                <div key={o.id} style={{ padding:'14px 16px', borderRadius:12, marginBottom:10, background:T.surface, border:'1px solid '+T.line }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
                      <div style={{ fontSize:12, color:T.muted }}>{new Date(o.created_at).toLocaleString('sl-SI')} · {lines.length} artiklov</div>
                    </div>
                    <div style={{ fontWeight:800, fontSize:18 }}>€{total.toFixed(2).replace('.',',')}</div>
                  </div>
                  <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>
                    {lines.slice(0,3).map((l:any) => `${escapeHtml(l.name)} ×${l.qty}`).join(', ')}{lines.length>3?'...':''}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={async()=>{
                      // Naloži nazaj v kosarico
                      const newCart = lines.map((l:any) => {
                        const kat = posData.items.find((x:any) => x.id === (l.item_id || l.id))
                        return {
                        lineId: Math.random().toString(36).slice(2),
                        id: l.item_id || l.id,
                        name: l.name,
                        price: Number(l.unit_price||0),
                        qty: Number(l.qty||1),
                        vat_rate: Number(l.vat_rate ?? 22),
                        // Brez tega se pri obnovljenem racunu normativi ne odstejejo.
                        item_type: kat?.item_type || 'simple',
                        stock: kat?.stock,
                        unit: 'kos',
                        mods: l.mods||[],
                        note: l.note||'',
                        happyHourApplied: false,
                      }})
                      setCart(newCart)
                      await pos.orders.resumeOrder(o.id)
                      // KLJUCNO: nastavi activeTable na mizo tega narocila, sicer open_order()
                      // ne najde obstojecega 'open' narocila in ustvari podvojeno narocilo pri placilu
                      setActiveTable(o.table_id ? { id: o.table_id, name: o.tables?.name || label } : null)
                      const updated = await pos.orders.getHeldOrders()
                      setHeldOrders(updated)
                      setHeldOrdersOpen(false)
                      setScreen('sale')
                    }} style={{ flex:2, padding:'9px', borderRadius:8, border:'none', background:T.accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 }}>
                      ▶ Nadaljuj
                    </button>
                    <button onClick={async()=>{
                      if (!confirm('Izbrišem ta shranjeni račun?')) return
                      const { error: delHeldErr } = await createClient().from('orders').update({ status:'cancelled' }).eq('id', o.id)
                      if (delHeldErr) { alert('Računa ni bilo mogoče izbrisati: ' + delHeldErr.message); return }
                      const updated = await pos.orders.getHeldOrders()
                      setHeldOrders(updated)
                    }} style={{ padding:'9px 14px', borderRadius:8, border:'1px solid '+T.line, background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:12, color:T.danger }}>
                      Izbriši
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}
      <PaymentModal open={paymentOpen} total={typeof paymentOpen==='object'&&paymentOpen.splitLines ? paymentOpen.splitLines.reduce((s,l)=>s+l.price*l.qty,0)*(1-(paymentOpen.discount||0)/100) : totals.total} cart={typeof paymentOpen==='object'&&paymentOpen.splitLines ? paymentOpen.splitLines : cart} activeTable={activeTable} activeCustomer={activeCustomer} auth={auth}
        onCancel={() => setPaymentOpen(false)}
        onComplete={(data) => {
          const po = paymentOpen
          setPaymentOpen(false)
          setReceipt(data)
          if(typeof po==='object' && po.splitLines && po.onSplitPaid) {
            po.onSplitPaid(po.splitLines.map(l=>l.lineId))
          } else {
            setCart([])
            setActiveTable(null)
          }
          posData.refresh()
        }}/>
      <ReceiptToast data={receipt} onClose={() => setReceipt(null)}/>
      {sellPackageModal && <SellPackageModal template={sellPackageModal} posData={posData} onClose={()=>setSellPackageModal(null)} auth={auth} setPaymentOpen={setPaymentOpen}/>}
      {showClockIn && <ClockInModal posData={posData} onClose={()=>setShowClockIn(false)} onClockedIn={()=>{ setShowClockIn(false); setWsRefreshKey(k=>k+1) }}/>}
      {/* DODANO (16.8.2026): ce postavitev blagajne ne uspe, to POVEJ. Prej se
          je napaka zapisala samo v konzolo, stran pa je ostala na nalaganju -
          uporabnik ni vedel, ali je kriva prijava, pravice ali kaj tretjega. */}
      {posData.bizNapaka && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(15,27,20,0.96)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ maxWidth:460, background:'#fff', borderRadius:14, padding:28, textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>Blagajne ni bilo mogoče pripraviti</div>
            <div style={{ fontSize:13, color:'#555', lineHeight:1.6, marginBottom:18 }}>{posData.bizNapaka}</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={()=>window.location.reload()}
                style={{ padding:'9px 16px', borderRadius:9, border:'none', background:'#1D9E75', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Poskusi znova
              </button>
              <a href="/nastavitve"
                style={{ padding:'9px 16px', borderRadius:9, border:'0.5px solid #ddd', color:'#333', fontSize:13, fontWeight:600, textDecoration:'none' }}>
                Nastavitve
              </a>
            </div>
          </div>
        </div>
      )}
      {showOpenCash && <OpenCashModal posData={posData} auth={auth} onClose={()=>setShowOpenCash(false)} onOpened={(s)=>{ setCashSession(s); setShowOpenCash(false) }}/>}
      {showVmesnoStanje && cashSession && <VmesnoStanjeModal session={cashSession} posData={posData} auth={auth} onClose={()=>setShowVmesnoStanje(false)}/>}
      {showTableActions && activeTable && <TableActionsModal activeTable={activeTable} posData={posData} auth={auth} onClose={()=>setShowTableActions(false)} onDone={()=>{ switchToTable(null); posData.refresh() }}/>}
      {showCloseCash && cashSession && <CloseCashModal session={cashSession} posData={posData} auth={auth} onClose={()=>setShowCloseCash(false)} onClosed={()=>{ setCashSession(null); refreshSession() }}/>}
      
      {/* DODANO (16.8.2026): dokler blagajna nima nobenega uporabnika s PIN-om,
          pokazi zaslon za prvo nastavitev namesto zaklepa - sicer je vstop
          nemogoc (nastavitve so ZA zaklepom). */}
      {posData.potrebujePrvoNastavitev
        ? <PrvaNastavitev imePodjetja={posData.businessName} onKoncano={() => { posData.setPotrebujePrvoNastavitev(false); posData.refresh() }}/>
        : auth.locked && <LockScreen auth={auth} imePodjetja={posData.businessName}/>}
    </div>
  )
}

// ================================================================
// PAGE ENTRY
// ================================================================
export default function PosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0d2818', display:'flex', alignItems:'center', justifyContent:'center', color:'#f6f1e8', fontFamily:'system-ui', fontSize:16 }}>
      Nalagam blagajno...
    </div>
  )

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden' }}>
      <KlasikApp/>
    </div>
  )
}

// Mon May 25 19:33:01 CEST 2026


// ─── Rocno dodajanje kartice (brez placila/racuna) ────────────
function ManualAddCardModal({ customer, posData, onClose, onDone }) {
  const [templateId, setTemplateId] = useState('')
  const [reason, setReason] = useState('')
  const [customVisits, setCustomVisits] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const tpl = posData.packageTemplates.find(t => t.id === templateId)
  // Ko izberes predlogo, privzeto predlagaj njeno stevilo obiskov - a ga je mozno prepisati
  // (npr. stranka kupi 7x namesto standardnih 5x/10x paketov v ceniku).
  useEffect(() => {
    if (tpl && tpl.visits != null) setCustomVisits(String(tpl.visits))
    else setCustomVisits('')
  }, [templateId])
  async function save() {
    if (!templateId) { setError('Izberi paket/kartico'); return }
    if (!reason.trim()) { setError('Razlog je obvezen (za sledljivost, ker gre brez racuna)'); return }
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      let expires = null
      if (tpl.validity_days) {
        const d = new Date()
        d.setDate(d.getDate() + Number(tpl.validity_days))
        expires = lokalniDatum(d)
      }
      // Ce ima predloga stevilcen obisk (visits), uporabi rocno vneseno stevilo (customVisits),
      // sicer padi nazaj na privzeto iz predloge (za neomejene/casovne kartice ostane null).
      const visitsToUse = tpl.visits != null
        ? (customVisits === '' ? tpl.visits : Number(customVisits))
        : null
      const { error: err } = await createClient().from('customer_packages').insert({
        customer_id: customer.id,
        template_id: tpl.id,
        template_type: tpl.template_type || 'visits',
        activation_type: 'purchase',
        name: tpl.name,
        active: true,
        remaining: visitsToUse,
        total: visitsToUse,
        monetary_balance: tpl.monetary_value || null,
        expires,
        activated_at: now,
        purchase_price: 0,
        notes: `[ROCNO BREZ RACUNA] ${escapeHtml(reason)}`,
      })
      if (err) throw err
      onDone()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }
  return (
    <Modal open onClose={onClose} width={440}>
      <ModalHeader title="Dodaj kartico rocno" onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ padding:10, borderRadius:8, background:'rgba(230,160,40,0.1)', color:'#a86a00', fontSize:12 }}>
          ⚠️ Ta kartica se NE fiskalizira in NE gre skozi blagajno. Uporabi samo za migracije, darila ali popravke.
        </div>
        <Field label="Paket / kartica">
          <select value={templateId} onChange={e=>setTemplateId(e.target.value)} style={inp}>
            <option value="">-- Izberi --</option>
            {posData.packageTemplates.filter(t=>!t.archived).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {tpl && tpl.visits != null && (
          <Field label="Število obiskov (spremeni, če se razlikuje od privzetega v ceniku)">
            <input type="number" onFocus={e => e.target.select()} min={1} value={customVisits} onChange={e=>setCustomVisits(e.target.value)} style={inp}/>
          </Field>
        )}
        <Field label="Razlog (obvezno)">
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="npr. migracija iz starega sistema" style={inp}/>
        </Field>
        {error && <div style={{ color:'#a83232', fontSize:12 }}>{error}</div>}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving} style={btnP}>{saving?'Shranjujem...':'Dodaj kartico'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Rocno urejanje kartice (Velja od/do, preostali obiski) ────
function EditPackageModal({ pkg, onClose, onDone }) {
  const [expires, setExpires] = useState(pkg.expires || '')
  const [remaining, setRemaining] = useState(pkg.remaining ?? '')
  const [saving, setSaving] = useState(false)
  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    const updates = { expires: expires || null }
    if (pkg.remaining !== null) {
      // POPRAVLJENO (16.8.2026): prej brez preverbe vnosa - vnos "abc" ali
      // negativno stevilo je zapisalo NaN oz. negativne obiske.
      const rem = remaining === '' ? null : Number(remaining)
      if (rem !== null && (!isFinite(rem) || rem < 0)) { alert('Vnesite veljavno število obiskov (0 ali več).'); setSaving(false); return }
      updates.remaining = rem
    }
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - uporabnik je videl,
    // da je shranjeno, tudi ce se v bazi ni nic spremenilo.
    const { error: editErr } = await createClient().from('customer_packages').update(updates).eq('id', pkg.id)
    setSaving(false)
    if (editErr) { alert('Kartice ni bilo mogoče shraniti: ' + editErr.message); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} width={400}>
      <ModalHeader title={`Popravi: ${pkg.name}`} onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <Field label="Velja do">
          <input type="date" value={expires} onChange={e=>setExpires(e.target.value)} style={inp}/>
        </Field>
        {pkg.remaining !== null && (
          <Field label="Preostali obiski">
            <input type="number" onFocus={e => e.target.select()} min={0} value={remaining} onChange={e=>setRemaining(e.target.value)} style={inp}/>
          </Field>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving} style={btnP}>{saving?'Shranjujem...':'Shrani'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Podaljsanje veljavnosti kartice ────────────────────────────
function ExtendPackageModal({ pkg, onClose, onDone }) {
  const [days, setDays] = useState(30)
  const [saving, setSaving] = useState(false)
  async function save() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    // POPRAVLJENO (16.8.2026): prej brez preverbe vnosa - vnos "abc" je dal
    // Invalid Date in vrgel napako pri toISOString(), ki je nihce ni ujel.
    const d = Number(days)
    if (!isFinite(d) || d === 0) { alert('Vnesite veljavno število dni.'); setSaving(false); return }
    const base = pkg.expires ? new Date(pkg.expires) : new Date()
    base.setDate(base.getDate() + d)
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake.
    const { error: extErr } = await createClient().from('customer_packages').update({ expires: lokalniDatum(base) }).eq('id', pkg.id)
    setSaving(false)
    if (extErr) { alert('Veljavnosti ni bilo mogoče podaljšati: ' + extErr.message); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} width={380}>
      <ModalHeader title={`Podaljšaj: ${pkg.name}`} onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:12, color:T.muted }}>Trenutno poteče: {pkg.expires ? new Date(pkg.expires).toLocaleDateString('sl-SI') : 'brez omejitve'}</div>
        <Field label="Podaljšaj za (dni)">
          <input type="number" onFocus={e => e.target.select()} min={1} value={days} onChange={e=>setDays(e.target.value)} style={inp}/>
        </Field>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving} style={btnP}>{saving?'Podaljšujem...':'Podaljšaj'}</button>
        </div>
      </div>
    </Modal>
  )
}


// ─── Zamrznitev kartice - brez datuma ali do izbranega datuma ──
function FreezePackageModal({ pkg, onClose, onDone }) {
  const [mode, setMode] = useState('indefinite') // 'indefinite' | 'until'
  const [untilDate, setUntilDate] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (mode === 'until' && !untilDate) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake.
    const { error: freezeErr } = await createClient().from('customer_packages').update({
      frozen_at: new Date().toISOString(),
      frozen_until: mode === 'until' ? untilDate : null,
    }).eq('id', pkg.id)
    setSaving(false)
    if (freezeErr) { alert('Kartice ni bilo mogoče zamrzniti: ' + freezeErr.message); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} width={380}>
      <ModalHeader title={`Zamrzni: ${pkg.name}`} onClose={onClose}/>
      <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
          <input type="radio" checked={mode==='indefinite'} onChange={()=>setMode('indefinite')}/>
          Zamrzni zdaj, odmrznem rocno kadarkoli
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
          <input type="radio" checked={mode==='until'} onChange={()=>setMode('until')}/>
          Zamrzni do dolocenega datuma (avtomatsko)
        </label>
        {mode === 'until' && (
          <input type="date" value={untilDate} onChange={e=>setUntilDate(e.target.value)} min={lokalniDatum()} style={inp}/>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnS}>Prekliči</button>
          <button onClick={save} disabled={saving || (mode==='until' && !untilDate)} style={btnP}>{saving?'Zamrzujem...':'Zamrzni'}</button>
        </div>
      </div>
    </Modal>
  )
}
