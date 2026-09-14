"use client"
/**
 * KNJIZNICA POROCIL (prelet 271)
 * ══════════════════════════════
 *
 * Lastnik potrebuje pregled nad vsem na ENEM mestu - kot v sistemih, ki so
 * rasli dvajset let: drevo skupin levo, klik odpre porocilo, obdobje zgoraj,
 * izvoz v Excel.
 *
 * NACELO: vsako porocilo je ena definicija - ime, stolpci, poizvedba.
 * Izrisovalnik je skupen. Dodati novo porocilo pomeni dodati en element v
 * seznam POROCILA spodaj; nic drugega se ne spremeni.
 *
 * PODATKI: bere iz obstojecih tabel blagajne. Kjer sistem necesa ne belezi
 * (SEPA, boni, omarice), porocila NI - lazno prazno porocilo je slabse od
 * manjkajocega.
 *
 * ZDRUZEVANJE poteka v brskalniku: za majhen lokal je vrstic nekaj tisoc,
 * kar je hitro, in poizvedbe ostanejo preproste ter odporne.
 */
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/pos-client'

type Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'
type Stolpec = { k: string; l: string; tip?: Tip; w?: number }
type Vrstica = Record<string, any>
type Porocilo = {
  id: string; skupina: string; ime: string; opis: string
  stolpci: Stolpec[]
  brezObdobja?: boolean
  nalozi: (db: any, od: string, do_: string) => Promise<Vrstica[]>
}

const T = { surface:'#ffffff', surface2:'#faf5e9', line:'rgba(0,0,0,0.08)', ink:'#1a1f1a', muted:'#6b6962', accent:'#1f6b3a', danger:'#a83232', bg:'#f4efe5' }

/* ── pomocniki ─────────────────────────────────────────────────── */
const n2 = (v: any) => Math.round(Number(v || 0) * 100) / 100
const dan = (iso: string) => String(iso || '').slice(0, 10)
const mesec = (iso: string) => String(iso || '').slice(0, 7)
const DNEVI = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']

async function placaniRacuni(db: any, od: string, do_: string) {
  const { data, error } = await db.from('orders')
    .select('id, invoice_number, closed_at, subtotal, discount_amount, discount_pct, total, cashier_id, customer_id, order_lines(name, qty, unit_price, vat_rate, item_id), payments(method, amount)')
    .eq('business_id', BUSINESS_ID).eq('status', 'paid')
    .gte('closed_at', od + 'T00:00:00').lte('closed_at', do_ + 'T23:59:59')
    .order('closed_at', { ascending: false })
  if (error) throw error
  return data || []
}
async function osebje(db: any) {
  const { data } = await db.from('staff').select('id, name').eq('business_id', BUSINESS_ID)
  return Object.fromEntries((data || []).map((s: any) => [s.id, s.name]))
}
async function stranke(db: any) {
  const { data } = await db.from('customers').select('id, name, phone, email').eq('business_id', BUSINESS_ID)
  return Object.fromEntries((data || []).map((c: any) => [c.id, c]))
}
function grupiraj<T>(vrstice: T[], kljuc: (v: T) => string) {
  const m = new Map<string, T[]>()
  for (const v of vrstice) { const k = kljuc(v); if (!m.has(k)) m.set(k, []); m.get(k)!.push(v) }
  return m
}

/* ── definicije porocil ────────────────────────────────────────── */
const POROCILA: Porocilo[] = [
  /* ── PRODAJA ── */
  { id:'racuni-popusti', skupina:'Prodaja', ime:'Računi s popusti', opis:'Vsi računi, na katerih je bil dan popust — za nadzor nad tem, kdo in koliko odobri.',
    stolpci:[{k:'datum',l:'Datum',tip:'datetime'},{k:'st',l:'Račun'},{k:'blagajnik',l:'Blagajnik'},{k:'pred',l:'Pred popustom',tip:'eur'},{k:'popust',l:'Popust',tip:'eur'},{k:'pct',l:'%',tip:'pct'},{k:'skupaj',l:'Plačano',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const [r, s] = await Promise.all([placaniRacuni(db, od, do_), osebje(db)])
      return r.filter((o: any) => Number(o.discount_amount) > 0).map((o: any) => ({
        datum:o.closed_at, st:o.invoice_number || '—', blagajnik:s[o.cashier_id] || '—',
        pred:n2(o.subtotal), popust:n2(o.discount_amount), pct:Number(o.discount_pct)||0, skupaj:n2(o.total) }))
    } },
  { id:'prodaja-po-strankah', skupina:'Prodaja', ime:'Prodaja po strankah', opis:'Koliko je posamezna stranka kupila v obdobju. Računi brez stranke so v vrstici „Brez stranke".',
    stolpci:[{k:'stranka',l:'Stranka'},{k:'racunov',l:'Računov',tip:'int'},{k:'skupaj',l:'Skupaj',tip:'eur'},{k:'povp',l:'Povprečje',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])
      return [...grupiraj(r, (o: any) => o.customer_id || '')].map(([k, v]) => ({
        stranka: k ? (c[k]?.name || '—') : 'Brez stranke', racunov:v.length,
        skupaj:n2(v.reduce((s: number, o: any) => s + Number(o.total), 0)),
        povp:n2(v.reduce((s: number, o: any) => s + Number(o.total), 0) / v.length) })).sort((a, b) => b.skupaj - a.skupaj)
    } },
  { id:'artikli-po-dnevih', skupina:'Prodaja', ime:'Prodaja po artiklih po dnevih', opis:'Koliko kosov vsakega artikla se je prodalo na posamezen dan.',
    stolpci:[{k:'dan',l:'Dan',tip:'date'},{k:'artikel',l:'Artikel'},{k:'kosov',l:'Kosov',tip:'num'},{k:'skupaj',l:'Prihodek',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const r = await placaniRacuni(db, od, do_)
      const vrstice = r.flatMap((o: any) => (o.order_lines || []).map((l: any) => ({ ...l, dan: dan(o.closed_at) })))
      return [...grupiraj(vrstice, (l: any) => l.dan + '|' + l.name)].map(([k, v]) => ({
        dan:k.split('|')[0], artikel:k.split('|')[1], kosov:n2(v.reduce((s: number, l: any) => s + Number(l.qty), 0)),
        skupaj:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)) })).sort((a, b) => b.dan.localeCompare(a.dan) || b.skupaj - a.skupaj)
    } },
  { id:'mesecni-promet', skupina:'Prodaja', ime:'Mesečni promet po dejavnostih', opis:'Bar (artikli iz cenika) in storitve (karte, paketi) po mesecih.',
    stolpci:[{k:'mesec',l:'Mesec'},{k:'bar',l:'Bar',tip:'eur'},{k:'storitve',l:'Storitve',tip:'eur'},{k:'skupaj',l:'Skupaj',tip:'eur'},{k:'racunov',l:'Računov',tip:'int'}],
    nalozi: async (db, od, do_) => {
      const r = await placaniRacuni(db, od, do_)
      return [...grupiraj(r, (o: any) => mesec(o.closed_at))].map(([m, v]) => {
        let bar = 0, st = 0
        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (l.item_id) bar += z; else st += z }
        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }
      }).sort((a, b) => b.mesec.localeCompare(a.mesec))
    } },
  { id:'storitve-po-stranki', skupina:'Prodaja', ime:'Prodaja storitev po stranki', opis:'Karte in paketi, ki jih je kupila posamezna stranka.',
    stolpci:[{k:'datum',l:'Datum',tip:'datetime'},{k:'stranka',l:'Stranka'},{k:'storitev',l:'Storitev'},{k:'znesek',l:'Znesek',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])
      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => !l.item_id).map((l: any) => ({
        datum:o.closed_at, stranka:c[o.customer_id]?.name || 'Brez stranke', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))
    } },
  { id:'placila-po-dnevih', skupina:'Prodaja', ime:'Prodaja po načinih plačila po dnevih', opis:'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.',
    stolpci:[{k:'dan',l:'Dan',tip:'date'},{k:'cash',l:'Gotovina',tip:'eur'},{k:'card',l:'Kartica',tip:'eur'},{k:'ostalo',l:'Ostalo',tip:'eur'},{k:'skupaj',l:'Skupaj',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const r = await placaniRacuni(db, od, do_)
      return [...grupiraj(r, (o: any) => dan(o.closed_at))].map(([d, v]) => {
        const s = { cash:0, card:0, ostalo:0 }
        for (const o of v as any[]) for (const p of o.payments || []) { const a = Number(p.amount); if (p.method === 'cash') s.cash += a; else if (p.method === 'card') s.card += a; else s.ostalo += a }
        return { dan:d, cash:n2(s.cash), card:n2(s.card), ostalo:n2(s.ostalo), skupaj:n2(s.cash + s.card + s.ostalo) }
      }).sort((a, b) => b.dan.localeCompare(a.dan))
    } },
  { id:'prodaja-po-zaposlenih', skupina:'Prodaja', ime:'Prodaja po zaposlenih', opis:'Promet, število računov in povprečje po blagajniku.',
    stolpci:[{k:'zaposleni',l:'Zaposleni'},{k:'racunov',l:'Računov',tip:'int'},{k:'skupaj',l:'Promet',tip:'eur'},{k:'povp',l:'Povprečje',tip:'eur'},{k:'popusti',l:'Dani popusti',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const [r, s] = await Promise.all([placaniRacuni(db, od, do_), osebje(db)])
      return [...grupiraj(r, (o: any) => o.cashier_id || '')].map(([k, v]) => ({
        zaposleni:s[k] || '—', racunov:v.length,
        skupaj:n2(v.reduce((a: number, o: any) => a + Number(o.total), 0)),
        povp:n2(v.reduce((a: number, o: any) => a + Number(o.total), 0) / v.length),
        popusti:n2(v.reduce((a: number, o: any) => a + Number(o.discount_amount || 0), 0)) })).sort((a, b) => b.skupaj - a.skupaj)
    } },
  { id:'prodaja-rvc', skupina:'Prodaja', ime:'Prodaja z razliko v ceni (RVC)', opis:'Prodajna in nabavna vrednost po artiklu ter marža. Nabavna cena je iz šifranta artiklov — kjer je ni, je marža enaka prodaji.',
    stolpci:[{k:'artikel',l:'Artikel'},{k:'kosov',l:'Kosov',tip:'num'},{k:'prodaja',l:'Prodaja',tip:'eur'},{k:'nabava',l:'Nabava',tip:'eur'},{k:'rvc',l:'RVC',tip:'eur'},{k:'marza',l:'Marža %',tip:'pct'}],
    nalozi: async (db, od, do_) => {
      const [r, { data: items }] = await Promise.all([placaniRacuni(db, od, do_), db.from('items').select('id, cost_price').eq('business_id', BUSINESS_ID)])
      const cena = Object.fromEntries((items || []).map((i: any) => [i.id, Number(i.cost_price || 0)]))
      const vrstice = r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => l.item_id))
      return [...grupiraj(vrstice, (l: any) => l.name)].map(([ime, v]) => {
        const kosov = v.reduce((s: number, l: any) => s + Number(l.qty), 0)
        const prodaja = v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)
        const nabava = v.reduce((s: number, l: any) => s + Number(l.qty) * (cena[l.item_id] || 0), 0)
        return { artikel:ime, kosov:n2(kosov), prodaja:n2(prodaja), nabava:n2(nabava), rvc:n2(prodaja - nabava), marza: prodaja > 0 ? Math.round((prodaja - nabava) / prodaja * 100) : 0 }
      }).sort((a, b) => b.rvc - a.rvc)
    } },

  /* ── CLANI IN KARTE ── */
  { id:'veljavne-karte', skupina:'Člani in karte', ime:'Trenutno veljavne karte', opis:'Aktivne karte, ki še niso potekle. Obdobje ne vpliva.', brezObdobja:true,
    stolpci:[{k:'stranka',l:'Stranka'},{k:'karta',l:'Karta'},{k:'ostane',l:'Ostane'},{k:'potece',l:'Poteče',tip:'date'},{k:'kupljena',l:'Kupljena',tip:'date'},{k:'cena',l:'Cena',tip:'eur'}],
    nalozi: async (db) => {
      const [{ data }, c] = await Promise.all([db.from('customer_packages').select('*').eq('active', true), stranke(db)])
      const zdaj = new Date().toISOString().slice(0, 10)
      return (data || []).filter((p: any) => c[p.customer_id] && (!p.expires || p.expires >= zdaj)).map((p: any) => ({
        stranka:c[p.customer_id]?.name, karta:p.name, ostane: p.total ? `${p.remaining ?? '—'} / ${p.total}` : (p.monetary_balance != null ? `€ ${n2(p.monetary_balance)}` : 'neomejeno'),
        potece:p.expires, kupljena:p.purchased_at, cena:n2(p.purchase_price) })).sort((a: any, b: any) => String(a.potece || '9').localeCompare(String(b.potece || '9')))
    } },
  { id:'clani-po-kartah', skupina:'Člani in karte', ime:'Aktivni člani po vrstah kart', opis:'Koliko članov ima posamezno vrsto karte in koliko prinesejo.', brezObdobja:true,
    stolpci:[{k:'karta',l:'Vrsta karte'},{k:'clanov',l:'Članov',tip:'int'},{k:'vrednost',l:'Vrednost',tip:'eur'},{k:'povp',l:'Povprečna cena',tip:'eur'}],
    nalozi: async (db) => {
      const { data } = await db.from('customer_packages').select('name, purchase_price, expires, active').eq('active', true)
      const zdaj = new Date().toISOString().slice(0, 10)
      const v = (data || []).filter((p: any) => !p.expires || p.expires >= zdaj)
      return [...grupiraj(v, (p: any) => p.name)].map(([k, g]) => ({ karta:k, clanov:g.length,
        vrednost:n2(g.reduce((s: number, p: any) => s + Number(p.purchase_price || 0), 0)),
        povp:n2(g.reduce((s: number, p: any) => s + Number(p.purchase_price || 0), 0) / g.length) })).sort((a, b) => b.clanov - a.clanov)
    } },
  { id:'potekle-karte', skupina:'Člani in karte', ime:'Stranke s potečeno karto', opis:'Karte, ki so potekle v obdobju in niso bile obnovljene — seznam za klic ali sporočilo.',
    stolpci:[{k:'stranka',l:'Stranka'},{k:'telefon',l:'Telefon'},{k:'karta',l:'Karta'},{k:'potekla',l:'Potekla',tip:'date'},{k:'dni',l:'Dni nazaj',tip:'int'}],
    nalozi: async (db, od, do_) => {
      const [{ data }, c] = await Promise.all([db.from('customer_packages').select('customer_id, name, expires').gte('expires', od).lte('expires', do_), stranke(db)])
      const zdaj = Date.now()
      const aktivne = new Set(((await db.from('customer_packages').select('customer_id').eq('active', true).gte('expires', new Date().toISOString().slice(0,10))).data || []).map((p: any) => p.customer_id))
      return (data || []).filter((p: any) => c[p.customer_id] && !aktivne.has(p.customer_id)).map((p: any) => ({
        stranka:c[p.customer_id]?.name, telefon:c[p.customer_id]?.phone || '—', karta:p.name, potekla:p.expires,
        dni:Math.floor((zdaj - new Date(p.expires).getTime()) / 86400000) })).sort((a: any, b: any) => b.dni - a.dni)
    } },
  { id:'obiski-po-stranki', skupina:'Člani in karte', ime:'Obiski po stranki', opis:'Število obiskov (odštetih s karte) v obdobju po stranki.',
    stolpci:[{k:'stranka',l:'Stranka'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'zadnji',l:'Zadnji obisk',tip:'date'}],
    nalozi: async (db, od, do_) => {
      const [{ data }, c] = await Promise.all([db.from('bookings').select('customer_id, visit_deducted_at, start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59'), stranke(db)])
      return [...grupiraj(data || [], (b: any) => b.customer_id || '')].map(([k, v]) => ({
        stranka:c[k]?.name || '—', obiskov:v.length, zadnji:(v as any[]).map(b => b.start_at).sort().at(-1) })).sort((a, b) => b.obiskov - a.obiskov)
    } },
  { id:'obisk-dnevi-v-tednu', skupina:'Člani in karte', ime:'Obisk po dnevih v tednu', opis:'Kateri dnevi so najbolj obiskani — za razpored osebja in urnik.',
    stolpci:[{k:'dan',l:'Dan'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],
    nalozi: async (db, od, do_) => {
      const { data } = await db.from('bookings').select('start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59')
      const st = new Array(7).fill(0); for (const b of data || []) st[new Date(b.start_at).getDay()]++
      const vseh = st.reduce((a, b) => a + b, 0) || 1
      return [1,2,3,4,5,6,0].map(d => ({ dan:DNEVI[d], obiskov:st[d], delez:Math.round(st[d] / vseh * 100) }))
    } },
  { id:'zasedenost-po-urah', skupina:'Člani in karte', ime:'Zasedenost po urah', opis:'Obiski po uri dneva — kdaj je gneča in kdaj prazno.',
    stolpci:[{k:'ura',l:'Ura'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],
    nalozi: async (db, od, do_) => {
      const { data } = await db.from('bookings').select('start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59')
      const st = new Array(24).fill(0); for (const b of data || []) st[new Date(b.start_at).getHours()]++
      const vseh = st.reduce((a, b) => a + b, 0) || 1
      return st.map((n, h) => ({ ura:`${String(h).padStart(2,'0')}:00`, obiskov:n, delez:Math.round(n / vseh * 100) })).filter(r => r.obiskov > 0)
    } },
  { id:'dobroimetje', skupina:'Člani in karte', ime:'Dobroimetje po strankah', opis:'Stranke s predplačanim stanjem na vrednostni karti.', brezObdobja:true,
    stolpci:[{k:'stranka',l:'Stranka'},{k:'karta',l:'Karta'},{k:'stanje',l:'Stanje',tip:'eur'},{k:'potece',l:'Poteče',tip:'date'}],
    nalozi: async (db) => {
      const [{ data }, c] = await Promise.all([db.from('customer_packages').select('customer_id, name, monetary_balance, expires').eq('active', true).gt('monetary_balance', 0), stranke(db)])
      return (data || []).filter((p: any) => c[p.customer_id]).map((p: any) => ({ stranka:c[p.customer_id]?.name, karta:p.name, stanje:n2(p.monetary_balance), potece:p.expires })).sort((a: any, b: any) => b.stanje - a.stanje)
    } },

  /* ── GOSTINSTVO IN ZALOGA ── */
  { id:'poraba-sestavin', skupina:'Gostinstvo in zaloga', ime:'Poraba sestavin po normativih', opis:'Koliko posamezne sestavine je odšlo s prodajo v obdobju, izračunano iz normativov.',
    stolpci:[{k:'sestavina',l:'Sestavina'},{k:'kolicina',l:'Porabljeno',tip:'num'},{k:'enota',l:'Enota'},{k:'vrednost',l:'Nabavna vrednost',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const [r, { data: ing }, { data: rec }] = await Promise.all([placaniRacuni(db, od, do_),
        db.from('ingredients').select('id, name, unit, cost_price').eq('business_id', BUSINESS_ID),
        db.from('item_ingredients').select('item_id, ingredient_id, qty_used')])
      const prodano: Record<string, number> = {}
      for (const o of r) for (const l of o.order_lines || []) if (l.item_id) prodano[l.item_id] = (prodano[l.item_id] || 0) + Number(l.qty)
      const poraba: Record<string, number> = {}
      for (const x of rec || []) if (prodano[x.item_id]) poraba[x.ingredient_id] = (poraba[x.ingredient_id] || 0) + prodano[x.item_id] * Number(x.qty_used)
      return (ing || []).filter((i: any) => poraba[i.id]).map((i: any) => ({ sestavina:i.name, kolicina:n2(poraba[i.id]), enota:i.unit, vrednost:n2(poraba[i.id] * Number(i.cost_price || 0)) })).sort((a: any, b: any) => b.vrednost - a.vrednost)
    } },
  { id:'prevzemi', skupina:'Gostinstvo in zaloga', ime:'Prevzemi blaga (dobavnice)', opis:'Vse vpisane dobavnice v obdobju z zneski.',
    stolpci:[{k:'datum',l:'Datum',tip:'date'},{k:'dobavitelj',l:'Dobavitelj'},{k:'dokument',l:'Dokument'},{k:'brez',l:'Brez DDV',tip:'eur'},{k:'ddv',l:'DDV / nadom.',tip:'eur'},{k:'skupaj',l:'Skupaj',tip:'eur'}],
    nalozi: async (db, od, do_) => {
      const { data, error } = await db.from('deliveries').select('*').eq('business_id', BUSINESS_ID).gte('document_date', od).lte('document_date', do_).order('document_date', { ascending:false })
      if (error) throw error
      return (data || []).map((d: any) => ({ datum:d.document_date, dobavitelj:d.supplier || '—', dokument:(d.document_number || '—') + (d.is_flat_rate ? ' · pavšal' : ''), brez:n2(d.total_ex_vat), ddv:n2(d.total_vat), skupaj:n2(d.total_inc_vat) }))
    } },
  { id:'odpisi', skupina:'Gostinstvo in zaloga', ime:'Odpisi zaloge', opis:'Odpisi z razlogom in vrednostjo — reprezentanca, lastna poraba, kvar, lom.',
    stolpci:[{k:'datum',l:'Datum',tip:'datetime'},{k:'razlog',l:'Razlog'},{k:'postavk',l:'Postavk',tip:'int'},{k:'vrednost',l:'Vrednost',tip:'eur'},{k:'opomba',l:'Opomba'}],
    nalozi: async (db, od, do_) => {
      const { data, error } = await db.from('stock_writeoffs').select('*').eq('business_id', BUSINESS_ID).gte('created_at', od).lte('created_at', do_ + 'T23:59:59').order('created_at', { ascending:false })
      if (error) throw error
      return (data || []).map((w: any) => ({ datum:w.created_at, razlog:w.reason || '—', postavk:Array.isArray(w.items) ? w.items.length : 0, vrednost:n2(w.total_cost), opomba:w.note || '' }))
    } },
  { id:'pod-minimumom', skupina:'Gostinstvo in zaloga', ime:'Sestavine pod minimumom', opis:'Kaj je treba naročiti. Obdobje ne vpliva.', brezObdobja:true,
    stolpci:[{k:'sestavina',l:'Sestavina'},{k:'stanje',l:'Stanje',tip:'num'},{k:'min',l:'Minimum',tip:'num'},{k:'enota',l:'Enota'},{k:'dobavitelj',l:'Dobavitelj'}],
    nalozi: async (db) => {
      const { data } = await db.from('ingredients').select('name, unit, stock_qty, min_stock, supplier').eq('business_id', BUSINESS_ID)
      return (data || []).filter((i: any) => i.min_stock != null && Number(i.stock_qty) < Number(i.min_stock)).map((i: any) => ({ sestavina:i.name, stanje:n2(i.stock_qty), min:n2(i.min_stock), enota:i.unit, dobavitelj:i.supplier || '—' }))
    } },

  /* ── NADZOR ── */
  { id:'storno', skupina:'Nadzor', ime:'Stornacije in vračila', opis:'Vsa vračila z razlogom, blagajnikom in odobritvijo.',
    stolpci:[{k:'datum',l:'Datum',tip:'datetime'},{k:'znesek',l:'Znesek',tip:'eur'},{k:'nacin',l:'Način'},{k:'razlog',l:'Razlog'},{k:'blagajnik',l:'Blagajnik'},{k:'odobril',l:'Odobril'}],
    nalozi: async (db, od, do_) => {
      const [{ data, error }, s] = await Promise.all([db.from('refunds').select('*').eq('business_id', BUSINESS_ID).gte('refunded_at', od).lte('refunded_at', do_ + 'T23:59:59').order('refunded_at', { ascending:false }), osebje(db)])
      if (error) throw error
      return (data || []).map((r: any) => ({ datum:r.refunded_at, znesek:n2(r.amount), nacin:r.method || '—', razlog:r.reason || '—', blagajnik:s[r.cashier_id] || '—', odobril:s[r.approved_by] || '—' }))
    } },
]

/* ── oblikovanje celic ─────────────────────────────────────────── */
function fmt(v: any, tip?: Tip) {
  if (v == null || v === '') return '—'
  switch (tip) {
    case 'eur': return '€ ' + Number(v).toFixed(2).replace('.', ',')
    case 'int': return String(Math.round(Number(v)))
    case 'num': return Number(v).toLocaleString('sl-SI', { maximumFractionDigits:2 })
    case 'pct': return Number(v) + ' %'
    case 'date': return String(v).slice(0, 10).split('-').reverse().join('. ')
    case 'datetime': { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString('sl-SI', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
    default: return String(v)
  }
}
function izvoziCsv(ime: string, stolpci: Stolpec[], vrstice: Vrstica[]) {
  const q = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const glava = stolpci.map(s => q(s.l)).join(';')
  const telo = vrstice.map(r => stolpci.map(s => q(s.tip === 'eur' || s.tip === 'num' || s.tip === 'int' ? String(r[s.k] ?? '').replace('.', ',') : fmt(r[s.k], s.tip))).join(';'))
  const blob = new Blob(['\ufeff' + [glava, ...telo].join('\n')], { type:'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ime.replace(/\s+/g, '_') + '.csv'; a.click()
}

/* ── komponenta ────────────────────────────────────────────────── */
export default function PorocilaKnjiznica() {
  const danes = new Date().toISOString().slice(0, 10)
  const zacMeseca = danes.slice(0, 8) + '01'
  const [od, setOd] = useState(zacMeseca)
  const [do_, setDo] = useState(danes)
  const [aktivno, setAktivno] = useState<string>(POROCILA[0].id)
  const [vrstice, setVrstice] = useState<Vrstica[]>([])
  const [nalagam, setNalagam] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)
  const [iskanje, setIskanje] = useState('')

  const porocilo = useMemo(() => POROCILA.find(p => p.id === aktivno)!, [aktivno])
  const skupine = useMemo<string[]>(() => [...new Set(POROCILA.map(p => p.skupina))], [])

  useEffect(() => {
    let ziv = true
    setNalagam(true); setNapaka(null)
    porocilo.nalozi(createClient(), od, do_)
      .then((v: Vrstica[]) => { if (ziv) setVrstice(v) })
      .catch((e: any) => { if (ziv) { setVrstice([]); setNapaka(e?.message || 'Poročila ni bilo mogoče naložiti.') } })
      .finally(() => { if (ziv) setNalagam(false) })
    return () => { ziv = false }
  }, [aktivno, od, do_])

  const prikazane = useMemo(() => {
    const q = iskanje.trim().toLowerCase()
    if (!q) return vrstice
    return vrstice.filter((r: Vrstica) => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [vrstice, iskanje])

  // Sestevek za stolpce v evrih - lastnik hoce vsoto brez racunanja.
  const sestevki = useMemo(() => {
    const s: Record<string, number> = {}
    for (const st of porocilo.stolpci) if (st.tip === 'eur' || st.tip === 'int' || st.tip === 'num') s[st.k] = n2(prikazane.reduce((a: number, r: Vrstica) => a + Number(r[st.k] || 0), 0))
    return s
  }, [prikazane, porocilo])

  const hitro = (kaj: 'danes' | 'teden' | 'mesec' | 'leto') => {
    const d = new Date(); const y = d.getFullYear(), m = d.getMonth()
    const p = (x: Date) => x.toISOString().slice(0, 10)
    if (kaj === 'danes') { setOd(danes); setDo(danes) }
    if (kaj === 'teden') { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setOd(p(s)); setDo(danes) }
    if (kaj === 'mesec') { setOd(p(new Date(y, m, 1))); setDo(danes) }
    if (kaj === 'leto') { setOd(`${y}-01-01`); setDo(danes) }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', height:'100%', minHeight:0, background:T.bg }}>
      {/* ── drevo porocil ── */}
      {/* PRELET 273: navaden div, ne aside - blagajna oznako aside sloguje temno za svoj meni. */}
      <div style={{ background:'#ffffff', color:'#1a1f1a', borderRight:'1px solid '+T.line, overflowY:'auto', padding:'14px 10px' }}>
        {skupine.map((sk: string) => (
          <div key={sk} style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', padding:'0 8px 6px' }}>{sk}</div>
            {POROCILA.filter(p => p.skupina === sk).map(p => (
              <button key={p.id} onClick={() => setAktivno(p.id)}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12.5,
                         background: aktivno === p.id ? T.accent : 'transparent', color: aktivno === p.id ? '#ffffff' : '#1a1f1a', marginBottom:1 }}>{p.ime}</button>
            ))}
          </div>
        ))}
      </div>

      {/* ── porocilo ── */}
      <div style={{ padding:'18px 22px', overflow:'auto', minWidth:0, color:'#1a1f1a' }}>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{porocilo.ime}</div>
        <div style={{ fontSize:12.5, color:T.muted, marginBottom:14, maxWidth:720, lineHeight:1.5 }}>{porocilo.opis}</div>

        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:14 }}>
          {!porocilo.brezObdobja && (<>
            <input type="date" value={od} onChange={e => setOd(e.target.value)} style={vnos}/>
            <span style={{ color:T.muted }}>–</span>
            <input type="date" value={do_} onChange={e => setDo(e.target.value)} style={vnos}/>
            {([['danes','Danes'],['teden','Ta teden'],['mesec','Ta mesec'],['leto','Letos']] as const).map(([k, l]) => (
              <button key={k} onClick={() => hitro(k)} style={gumbTih}>{l}</button>
            ))}
            <span style={{ width:1, height:20, background:T.line, margin:'0 4px' }}/>
          </>)}
          <input value={iskanje} onChange={e => setIskanje(e.target.value)} placeholder="Išči v poročilu…" style={{ ...vnos, minWidth:180 }}/>
          <button onClick={() => izvoziCsv(porocilo.ime, porocilo.stolpci, prikazane)} disabled={!prikazane.length} style={{ ...gumbTih, marginLeft:'auto' }}>⬇ Izvozi (Excel)</button>
        </div>

        {napaka && <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(168,50,50,0.08)', color:T.danger, fontSize:12.5, marginBottom:12 }}>{napaka}</div>}

        <div style={{ background:T.surface, borderRadius:12, border:'1px solid '+T.line, overflow:'hidden' }}>
          {nalagam ? <div style={{ padding:28, textAlign:'center', color:T.muted, fontSize:13 }}>Nalagam…</div>
          : prikazane.length === 0 ? <div style={{ padding:28, textAlign:'center', color:T.muted, fontSize:13 }}>Ni podatkov za izbrano obdobje.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead><tr style={{ background:T.surface2 }}>
                  {porocilo.stolpci.map(s => <th key={s.k} style={{ textAlign: ['eur','int','num','pct'].includes(s.tip || '') ? 'right' : 'left', padding:'9px 12px', fontSize:10.5, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{s.l}</th>)}
                </tr></thead>
                <tbody>
                  {prikazane.map((r, i) => (
                    <tr key={i} style={{ borderTop:'1px solid '+T.line }}>
                      {porocilo.stolpci.map(s => <td key={s.k} style={{ padding:'8px 12px', textAlign: ['eur','int','num','pct'].includes(s.tip || '') ? 'right' : 'left', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{fmt(r[s.k], s.tip)}</td>)}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(sestevki).length > 0 && (
                  <tfoot><tr style={{ borderTop:'2px solid '+T.line, background:T.surface2, fontWeight:700 }}>
                    {porocilo.stolpci.map((s, i) => <td key={s.k} style={{ padding:'9px 12px', textAlign: ['eur','int','num','pct'].includes(s.tip || '') ? 'right' : 'left', fontVariantNumeric:'tabular-nums' }}>
                      {i === 0 ? `Skupaj · ${prikazane.length}` : (s.k in sestevki && s.tip !== 'pct' ? fmt(sestevki[s.k], s.tip) : '')}
                    </td>)}
                  </tr></tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const vnos = { padding:'7px 10px', borderRadius:8, border:'1px solid rgba(0,0,0,0.12)', fontSize:12.5, fontFamily:'inherit', background:'#fff' }
const gumbTih = { padding:'7px 12px', borderRadius:8, border:'1px solid rgba(0,0,0,0.12)', background:'#fff', color:'#3a3f3a', fontSize:12, cursor:'pointer', fontFamily:'inherit' }
