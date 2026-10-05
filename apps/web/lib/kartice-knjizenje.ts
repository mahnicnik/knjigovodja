/**
 * KNJIŽENJE KARTIČNEGA OBRAČUNA (revizija V2, oktober 2026)
 * ════════════════════════════════════════════════════════
 *
 * PREJ (app/kartice): bruto kartični promet se je VEDNO knjizil kot prihodek z
 * DDV 0, provizija kot strosek. Tezave:
 *   1. Organizacija z blagajno: kartična placila so ze v prometu blagajne
 *      (pos_prodaja). Isti promet se je knjizil dvakrat.
 *   2. Zavezanec za DDV brez blagajne: kartični promet je prodaja z DDV -
 *      izstopni DDV je manjkal (vse kot 0 %).
 *   3. Ce je bilo izplacilo obracuna ze uvozeno iz banke kot prihodek
 *      ("Drugo"), je nastal se en prihodek za isti denar (SIRM Q2 2026).
 *
 * ZDAJ:
 *   1. Pri organizaciji z blagajno se prihodek privzeto NE knjizi, ce ima
 *      blagajna v obdobju kartična placila; knjizi se le provizija. Uporabnik
 *      lahko izrecno potrdi, da promet NI iz blagajne (npr. terminal za
 *      storitve na racun).
 *   2. Zavezanec mora izbrati stopnjo DDV - prihodek = osnova, izstopni DDV
 *      locen. Nezavezanec: 0 %.
 *   3. Ze knjizen bancni priliv izplacila se PRETVORI v ta kartični prihodek
 *      (en vnos), namesto da bi nastal se en.
 */

import { najdiKarticniObracun, razcleniPriliv } from '@/lib/banka-ujemanje'
import { lokalniDan } from '@/lib/pos-kpo'

export interface KarticniObracunVnos {
  procesor: string
  od: string                  // YYYY-MM-DD
  do: string                  // YYYY-MM-DD
  bruto: number
  provizija: number
  provizijaPct: number
  transakcij: number | null
  opomba: string              // npr. 'paketni uvoz'
  ddvStopnja: number | null   // obvezno pri DDV zavezancu, ce se prihodek knjizi
  prisiliPrihodek: boolean    // organizacija z blagajno: promet NI iz blagajne
}

export type IzidKnjizenja =
  | { prihodek: 'knjizen' | 'pretvorjen'; provizija: boolean; bancniVnosId?: string }
  | { prihodek: 'izpuscen_blagajna'; provizija: boolean; posKartice: number }
  | { prihodek: 'manjka_ddv'; provizija: boolean }

/** Odlocitev, ali se kartični prihodek knjizi (cista funkcija - testirana). */
export function odlociPrihodek(o: {
  imaBlagajno: boolean; posKartice: number; prisili: boolean; vatRegistered: boolean; ddvStopnja: number | null
}): 'knjizi' | 'izpusti_blagajna' | 'manjka_ddv' {
  if (o.imaBlagajno && o.posKartice > 0 && !o.prisili) return 'izpusti_blagajna'
  if (o.vatRegistered && (o.ddvStopnja === null || o.ddvStopnja === undefined)) return 'manjka_ddv'
  return 'knjizi'
}

const premakni = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

/** Vsota kartičnih placil blagajne v obdobju (lokalni dnevi od–do). */
export async function karticePrekoBlagajne(db: any, businessId: string, od: string, do_: string): Promise<number> {
  const { data, error } = await db.from('orders')
    .select('closed_at, payments(method, amount)')
    .eq('business_id', businessId).eq('status', 'paid')
    .gte('closed_at', `${premakni(od, -1)}T00:00:00Z`).lt('closed_at', `${premakni(do_, 2)}T00:00:00Z`)
  if (error) throw new Error('Kartična plačila blagajne ni bilo mogoče prebrati: ' + error.message)
  let vsota = 0
  for (const o of data || []) {
    const dan = o.closed_at ? lokalniDan(o.closed_at) : ''
    if (dan < od || dan > do_) continue
    for (const p of o.payments || []) if (p.method === 'card') vsota += Number(p.amount || 0)
  }
  return Math.round(vsota * 100) / 100
}

export async function knjiziKarticniObracun(
  db: any,
  org: { id: string; vat_registered?: boolean | null; pos_business_id?: string | null },
  v: KarticniObracunVnos,
): Promise<IzidKnjizenja> {
  const imaBlagajno = !!org.pos_business_id
  const posKartice = imaBlagajno ? await karticePrekoBlagajne(db, org.pos_business_id!, v.od, v.do) : 0
  const odlocitev = odlociPrihodek({ imaBlagajno, posKartice, prisili: v.prisiliPrihodek, vatRegistered: !!org.vat_registered, ddvStopnja: v.ddvStopnja })
  if (odlocitev === 'manjka_ddv') return { prihodek: 'manjka_ddv', provizija: false }

  let izid: IzidKnjizenja
  if (odlocitev === 'izpusti_blagajna') {
    izid = { prihodek: 'izpuscen_blagajna', provizija: false, posKartice }
  } else {
    const stopnja = org.vat_registered ? Number(v.ddvStopnja) : 0
    const { neto, ddv } = razcleniPriliv(v.bruto, stopnja)
    const vnos = {
      entry_date: v.do,
      description: `Kartično poslovanje ${v.procesor} — ${v.od} do ${v.do}`,
      entry_type: 'income',
      income: neto,
      expense: 0,
      vat_in: 0,
      vat_out: ddv,
      vat_rate: stopnja,
      category: 'Kartično poslovanje',
    }
    const opomba = `${v.transakcij ?? '?'} transakcij · provizija ${v.provizijaPct}%${v.opomba ? ' · ' + v.opomba : ''}`

    // Ali je izplacilo tega obracuna ze knjizeno iz banke kot prihodek?
    const { data: bancni } = await db.from('kpo_entries')
      .select('id, entry_date, income, notes, category')
      .eq('org_id', org.id).eq('entry_type', 'income').is('invoice_id', null)
      .gte('entry_date', v.do).lte('entry_date', premakni(v.do, 7))
    const kandidati = (bancni || []).filter((e: any) => String(e.notes || '').startsWith('Bančni uvoz') && e.category !== 'Kartično poslovanje')
    const obracun = [{ id: 'novi', entry_date: v.do, bruto: v.bruto, provizija: v.provizija, opis: '' }]
    const zadetek = kandidati
      .map((e: any) => ({ e, z: najdiKarticniObracun({ date: e.entry_date, amount: Number(e.income), type: 'credit', description: '', reference: '' }, obracun) }))
      .find((x: any) => x.z?.zanesljivost === 'gotovo')

    if (zadetek) {
      const { error } = await db.from('kpo_entries').update({
        ...vnos,
        notes: `${opomba} · pretvorjeno iz bančnega priliva €${Number(zadetek.e.income).toFixed(2)} (${zadetek.e.entry_date}) - izplačilo istega prometa`,
      }).eq('id', zadetek.e.id)
      if (error) throw new Error('Prihodka ni bilo mogoče poknjižiti: ' + error.message)
      izid = { prihodek: 'pretvorjen', provizija: false, bancniVnosId: zadetek.e.id }
    } else {
      const { error } = await db.from('kpo_entries').insert({ org_id: org.id, ...vnos, notes: opomba })
      if (error) throw new Error('Prihodka ni bilo mogoče poknjižiti: ' + error.message)
      izid = { prihodek: 'knjizen', provizija: false }
    }
  }

  if (v.provizija > 0) {
    const { error: feeErr } = await db.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: v.do,
      description: `Provizija ${v.procesor} — ${v.provizijaPct}%`,
      entry_type: 'expense',
      income: 0,
      expense: v.provizija,
      vat_in: 0,
      vat_out: 0,
      category: 'Bančne provizije',
      notes: `Provizija od €${v.bruto} kartičnih plačil${v.opomba ? ' · ' + v.opomba : ''}`,
    })
    if (feeErr) throw new Error('POZOR: prihodek je obdelan, provizije pa NI bilo mogoče poknjižiti: ' + feeErr.message)
    izid.provizija = true
  }
  return izid
}
