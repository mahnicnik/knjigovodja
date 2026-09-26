#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 322 - Porocila: Bar + Storitve se nista sestela v promet, placila vsa "gotovina".

DIAGNOZA (september 2026, Sportna dejavnost Nik Mahnic s.p.):
 1. Supabase vrne na poizvedbo NAJVEC 1000 vrstic, brez opozorila. Obdobje
    1.-25.9. ima 1601 postavk - porocilo jih je prebralo 1000, zato je bila
    razdelitev Bar 3.491,30 + Storitve 2.134,93 = 5.626,23 EUR namesto
    Bar 5.440,50 + Storitve 3.691,87 = 9.132,37 EUR (preverjeno v bazi).
 2. Placila so se nalagala z `.in('order_id', [787 ID-jev])` - predolg URL,
    poizvedba odpove, koda privzame gotovino -> "Gotovina 100 %" namesto
    gotovina 5.338,54 + kartica 3.793,83 EUR.

POPRAVKI:
 - nov lib/supabase-strani.ts: nalaganje po straneh in po skupinah ID-jev
 - Porocila > Pregled: racuni, postavke in placila nalozeni v celoti;
   vsako placilo steje pod svojo metodo (deljen racun ni vec v celoti ena
   metoda); racun brez podatka o placilu je "Ostalo", ne gotovina;
   ce se kaj ne nalozi, porocilo to prikaze z opozorilom
 - Vsa porocila: placani racuni, DDV po kategorijah in porocila obiskov
   po straneh (pri daljsih obdobjih bi sicer tiho manjkal promet)
 - razvrscanje "najbolj prodajani" v ceniku: 30 dni prodaje po straneh

PREVERJENO: npx tsc --noEmit = 0 napak; pomocnika preizkusena (1601 vrstic
-> 1601, 787 ID-jev -> 8 skupin po najvec 100).

Uporaba:
    python3 prelet322.py --preveri /pot/do/repozitorija
    python3 prelet322.py /pot/do/repozitorija
"""
import sys
import os

NOVE_DATOTEKE = {
    'apps/web/lib/supabase-strani.ts': "/**\n * PRELET 322: nalaganje VSEH vrstic iz Supabase, brez tihega rezanja.\n *\n * Supabase (PostgREST) na eno poizvedbo vrne NAJVEC 1000 vrstic - brez\n * napake in brez opozorila. Porocilo v blagajni je za september 2026\n * prebralo le 1000 od 1601 postavk: promet zgoraj je bil pravilen\n * (9.132,37 EUR), razdelitev Bar + Storitve pa je sestela samo 5.626,23 EUR.\n *\n * Druga, sorodna past: `.in('order_id', [...787 ID-jev])` sestavi URL z\n * ~30.000 znaki, ki ga streznik zavrne. Placila se zato niso nalozila in\n * porocilo je VSE racune prikazalo kot gotovino (v resnici 3.793,83 EUR\n * s kartico).\n *\n * Pravilo za porocila: kjer stevilo vrstic raste z obdobjem, NIKOLI ne\n * beri z golo poizvedbo - uporabi te pomocnike.\n */\n\nconst VELIKOST_STRANI = 1000\nconst VELIKOST_SKUPINE = 100\n\n/**\n * Nalozi vse strani poizvedbe. `zgradi` mora vsakic vrniti SVEZO poizvedbo\n * z vsemi filtri in z urejanjem po enolicnem kljucu (npr. `.order('id')`),\n * sicer se lahko vrstice med stranmi podvojijo ali izpustijo.\n */\nexport async function naloziVseStrani<T = any>(\n  zgradi: () => any,\n  velikost: number = VELIKOST_STRANI,\n): Promise<{ data: T[]; error: any }> {\n  const vse: T[] = []\n  for (let od = 0; ; od += velikost) {\n    const { data, error } = await zgradi().range(od, od + velikost - 1)\n    if (error) return { data: vse, error }\n    const kos = (data || []) as T[]\n    vse.push(...kos)\n    if (kos.length < velikost) break\n  }\n  return { data: vse, error: null }\n}\n\n/**\n * Za filtre `.in(stolpec, idji)` z veliko ID-ji: razdeli jih v skupine po\n * 100 (kratek URL), vsako skupino nalozi v celoti in rezultate zdruzi.\n */\nexport async function naloziPoSkupinah<T = any>(\n  idji: string[],\n  zgradi: (skupina: string[]) => any,\n  velikost: number = VELIKOST_SKUPINE,\n): Promise<{ data: T[]; error: any }> {\n  const vse: T[] = []\n  for (let i = 0; i < idji.length; i += velikost) {\n    const skupina = idji.slice(i, i + velikost)\n    const { data, error } = await naloziVseStrani<T>(() => zgradi(skupina))\n    if (error) return { data: vse, error }\n    vse.push(...data)\n  }\n  return { data: vse, error: null }\n}\n",
}

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     "import PorocilaKnjiznica from '@/components/pos/PorocilaKnjiznica'\nimport { pos, BUSINESS_ID, resolveBusinessId, imaOsebje, ustvariPrvegaUporabnika } from '@/lib/pos-client'\nimport { lokalniDatum } from '@/lib/tax-constants'\nimport { buildReceiptHTML } from '@/lib/receipt'\nimport { WorkStatusBar, ClockInModal } from '@/lib/work-session-components'\nimport { getCurrentSession, openSession, getSessionStats, closeSession, getLastCarryOver, type CashSession, type SessionStats } from '@/lib/cash-session'",
     "import PorocilaKnjiznica from '@/components/pos/PorocilaKnjiznica'\nimport { pos, BUSINESS_ID, resolveBusinessId, imaOsebje, ustvariPrvegaUporabnika } from '@/lib/pos-client'\nimport { lokalniDatum } from '@/lib/tax-constants'\nimport { naloziVseStrani, naloziPoSkupinah } from '@/lib/supabase-strani'\nimport { buildReceiptHTML } from '@/lib/receipt'\nimport { WorkStatusBar, ClockInModal } from '@/lib/work-session-components'\nimport { getCurrentSession, openSession, getSessionStats, closeSession, getLastCarryOver, type CashSession, type SessionStats } from '@/lib/cash-session'"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #2',
     "  useEffect(() => {\n    async function loadSales() {\n      const from = new Date(); from.setDate(from.getDate()-30)\n      const { data } = await createClient()\n        .from('order_lines')\n        // POPRAVLJENO (19.8.2026): `orders.created_at` NE OBSTAJA (stolpci so\n        // opened_at, closed_at, voided_at) - poizvedba je tiho odpovedala in\n        // priporocila artiklov so ostala prazna.\n        .select('name, qty, orders!inner(closed_at, status)')\n        .eq('orders.status', 'paid')\n        .gte('orders.closed_at', from.toISOString())\n      if (!data) return\n      const map = {}\n      data.forEach(l => {",
     '  useEffect(() => {\n    async function loadSales() {\n      const from = new Date(); from.setDate(from.getDate()-30)\n      // PRELET 322: po straneh - 30 dni prodaje ima vec kot 1000 postavk,\n      // gola poizvedba je vrnila le prvih 1000 in razvrstitev "najbolj\n      // prodajani" je temeljila na delu podatkov.\n      const { data, error: salesErr } = await naloziVseStrani(() => createClient()\n        .from(\'order_lines\')\n        // POPRAVLJENO (19.8.2026): `orders.created_at` NE OBSTAJA (stolpci so\n        // opened_at, closed_at, voided_at) - poizvedba je tiho odpovedala in\n        // priporocila artiklov so ostala prazna.\n        .select(\'id, name, qty, orders!inner(closed_at, status)\')\n        .eq(\'orders.status\', \'paid\')\n        .gte(\'orders.closed_at\', from.toISOString())\n        .order(\'id\', { ascending: true }))\n      if (salesErr) console.error(\'Prodajni podatki za razvrscanje niso nalozeni v celoti:\', salesErr)\n      if (!data) return\n      const map = {}\n      data.forEach(l => {'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #3',
     "    // Staff filter — za trenerje/terapevte\n    const staffFilter = selectedStaffId !== 'all' ? selectedStaffId : null\n\n    const [ordersRes, refundsRes, bookingsRes] = await Promise.all([\n      db.from('orders')\n        .select('id, closed_at, total, tip_amount, discount_amount')\n        .eq('business_id', BUSINESS_ID)\n        .eq('status', 'paid')\n        .gte('closed_at', fromStr)\n        .lte('closed_at', toStr),\n      db.from('refunds')\n        // POPRAVLJENO (19.8.2026): `created_at` v tabeli `refunds` ne obstaja,\n        // pravi stolpec je `refunded_at`. Poizvedba je odpovedala, zato je",
     "    // Staff filter — za trenerje/terapevte\n    const staffFilter = selectedStaffId !== 'all' ? selectedStaffId : null\n\n    // PRELET 322: racuni se nalagajo PO STRANEH (lib/supabase-strani). Gola\n    // poizvedba vrne najvec 1000 vrstic - pri daljsem obdobju bi promet tiho\n    // manjkal. Napake zberemo in jih na zaslonu PRIKAZEMO, namesto da bi\n    // porocilo pokazalo nepopolne stevilke kot da so pravilne.\n    const napakeNalaganja: string[] = []\n    const [ordersRes, refundsRes, bookingsRes] = await Promise.all([\n      naloziVseStrani(() => db.from('orders')\n        .select('id, closed_at, total, tip_amount, discount_amount')\n        .eq('business_id', BUSINESS_ID)\n        .eq('status', 'paid')\n        .gte('closed_at', fromStr)\n        .lte('closed_at', toStr)\n        .order('closed_at', { ascending: true })\n        .order('id', { ascending: true })),\n      db.from('refunds')\n        // POPRAVLJENO (19.8.2026): `created_at` v tabeli `refunds` ne obstaja,\n        // pravi stolpec je `refunded_at`. Poizvedba je odpovedala, zato je"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #4',
     '    ])\n    const staffBookings = (staffFilter ? bookingsRes.data : []) || []\n\n    const orders = ordersRes.data || []\n    const refunds = refundsRes.data || []\n',
     "    ])\n    const staffBookings = (staffFilter ? bookingsRes.data : []) || []\n\n    if (ordersRes.error) {\n      console.error('Porocilo: racunov ni bilo mogoce v celoti naloziti:', ordersRes.error)\n      napakeNalaganja.push('računi')\n    }\n    const orders = ordersRes.data || []\n    const refunds = refundsRes.data || []\n"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #5',
     "      // kartično plačilo se je v poročilu prikazalo kot GOTOVINA, napitnine pa\n      // vedno kot 0. Znesek prometa je bil pravilen (iz orders.total), zato\n      // napaka ni bila očitna.\n      const { data: pd, error: pErr } = await db.from('payments')\n        .select('order_id, amount, method')\n        .in('order_id', orderIds)\n      if (pErr) console.error('Napaka pri branju plačil za poročilo:', pErr.message)\n      paymentsData = pd || []\n    }\n    const paymentsByOrder = {}",
     "      // kartično plačilo se je v poročilu prikazalo kot GOTOVINA, napitnine pa\n      // vedno kot 0. Znesek prometa je bil pravilen (iz orders.total), zato\n      // napaka ni bila očitna.\n      // PRELET 322: prej `.in('order_id', orderIds)` z VSEMI ID-ji naenkrat.\n      // Pri 787 racunih (september 2026) je URL presegel omejitev, poizvedba\n      // je odpovedala in porocilo je vse prikazalo kot gotovino (dejansko\n      // 3.793,83 EUR s kartico). Zdaj v skupinah po 100 ID-jev.\n      const { data: pd, error: pErr } = await naloziPoSkupinah(orderIds, (skupina) =>\n        db.from('payments')\n          .select('id, order_id, amount, method')\n          .in('order_id', skupina)\n          .order('id', { ascending: true }))\n      if (pErr) {\n        console.error('Napaka pri branju plačil za poročilo:', pErr.message || pErr)\n        napakeNalaganja.push('plačila')\n      }\n      paymentsData = pd || []\n    }\n    const paymentsByOrder = {}"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #6',
     "      const d = new Date(o.closed_at)\n      const dan = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`\n      byDay[dan] = (byDay[dan] || 0) + amt\n      const method = payments[0]?.method || 'cash'\n      if (method === 'cash') byMethod.cash += amt\n      else if (method === 'card') byMethod.card += amt\n      else if (method === 'bon') byMethod.bon += amt\n      else if (method === 'prep') byMethod.prep += amt\n      else byMethod.other += amt\n    })\n\n    refunds.forEach(r => { vracila += Number(r.amount || 0) })",
     '      const d = new Date(o.closed_at)\n      const dan = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,\'0\')}-${String(d.getDate()).padStart(2,\'0\')}`\n      byDay[dan] = (byDay[dan] || 0) + amt\n      // PRELET 322: vsako placilo steje pod SVOJO metodo. Prej je celoten\n      // racun sel pod metodo PRVEGA placila (deljen racun gotovina + kartica\n      // je bil v celoti "gotovina"), racun BREZ zapisa o placilu pa je bil\n      // privzeto gotovina - zato je odpovedano nalaganje placil pokazalo\n      // 100 % gotovine. Brez podatka o placilu zdaj "Ostalo", ne gotovina.\n      const dodajMetodo = (method: string, znesek: number) => {\n        if (method === \'cash\') byMethod.cash += znesek\n        else if (method === \'card\') byMethod.card += znesek\n        else if (method === \'bon\') byMethod.bon += znesek\n        else if (method === \'prep\') byMethod.prep += znesek\n        else byMethod.other += znesek\n      }\n      if (payments.length > 0) payments.forEach(p => dodajMetodo(p.method, Number(p.amount || 0)))\n      else dodajMetodo(\'neznano\', amt)\n    })\n\n    refunds.forEach(r => { vracila += Number(r.amount || 0) })'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #7',
     "    // unovcen obisk enako pomemben kot placan.\n    // POPRAVLJENO (prelet 181): dodana `subtotal` in `discount_amount`.\n    // Brez njiju iz vrstice ni bilo mogoce vedeti, ali je bil na racunu popust.\n    const linesRes = await db.from('order_lines')\n      .select('name, qty, unit_price, item_id, service_id, items(bookable), orders!inner(closed_at, status, business_id, subtotal, discount_amount, payments(method))')\n      .eq('orders.business_id', BUSINESS_ID)\n      .eq('orders.status', 'paid')\n      .gte('orders.closed_at', fromStr)\n      .lte('orders.closed_at', toStr)\n\n    const itemMap = {}\n    ;(linesRes.data || []).forEach(l => {",
     "    // unovcen obisk enako pomemben kot placan.\n    // POPRAVLJENO (prelet 181): dodana `subtotal` in `discount_amount`.\n    // Brez njiju iz vrstice ni bilo mogoce vedeti, ali je bil na racunu popust.\n    // PRELET 322: PO STRANEH. Gola poizvedba je vrnila le prvih 1000 postavk\n    // (september 2026: 1000 od 1601) - razdelitev Bar + Storitve je bila\n    // 5.626,23 EUR namesto 9.132,37 EUR, brez kakrsnegakoli opozorila.\n    const linesRes = await naloziVseStrani(() => db.from('order_lines')\n      .select('id, name, qty, unit_price, item_id, service_id, items(bookable), orders!inner(closed_at, status, business_id, subtotal, discount_amount, payments(method))')\n      .eq('orders.business_id', BUSINESS_ID)\n      .eq('orders.status', 'paid')\n      .gte('orders.closed_at', fromStr)\n      .lte('orders.closed_at', toStr)\n      .order('id', { ascending: true }))\n    if (linesRes.error) {\n      console.error('Porocilo: postavk ni bilo mogoce v celoti naloziti:', linesRes.error)\n      napakeNalaganja.push('postavke')\n    }\n\n    const itemMap = {}\n    ;(linesRes.data || []).forEach(l => {"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #8',
     '      byHour, byDay, byMethod, topItems, refunds, from, to, poVrsti,\n      staffBookings, staffTotalMin, staffTotalRevenue,\n      isStaffFiltered: !!staffFilter,\n    })\n    setLoading(false)\n  }',
     '      byHour, byDay, byMethod, topItems, refunds, from, to, poVrsti,\n      staffBookings, staffTotalMin, staffTotalRevenue,\n      isStaffFiltered: !!staffFilter,\n      napakeNalaganja,\n    })\n    setLoading(false)\n  }'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #9',
     "        </div>\n      )}\n      {pogled === 'pregled' && (<>\n      {/* Header */}\n      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>\n        <div>",
     "        </div>\n      )}\n      {pogled === 'pregled' && (<>\n      {/* PRELET 322: ce se del podatkov ni nalozil, to POVEMO - nepopolne\n          stevilke se ne smejo prikazati, kot da so pravilne. */}\n      {((reportData as any).napakeNalaganja || []).length > 0 && (\n        <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:10, background:'#fdecea', border:'1px solid #f5c2bd', color:'#8a1f11', fontSize:13 }}>\n          ⚠️ Poročilo ni popolno — ni bilo mogoče naložiti: {((reportData as any).napakeNalaganja as string[]).join(', ')}. Osvežite stran ali poskusite znova čez nekaj trenutkov.\n        </div>\n      )}\n      {/* Header */}\n      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>\n        <div>"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #1',
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }",
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\nimport { naloziVseStrani } from '@/lib/supabase-strani'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #2',
     "const mesec = (iso: string) => String(iso || '').slice(0, 7)\nconst DNEVI = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']\n\nasync function placaniRacuni(db: any, od: string, do_: string) {\n  const { data, error } = await db.from('orders')\n    .select('id, invoice_number, closed_at, subtotal, discount_amount, discount_pct, total, cashier_id, customer_id, order_lines(name, qty, unit_price, vat_rate, item_id, service_id, items(bookable)), payments(method, amount)')\n    .eq('business_id', BUSINESS_ID).eq('status', 'paid')\n    .gte('closed_at', od + 'T00:00:00').lte('closed_at', do_ + 'T23:59:59')\n    .order('closed_at', { ascending: false })\n  if (error) throw error\n  return data || []\n}",
     "const mesec = (iso: string) => String(iso || '').slice(0, 7)\nconst DNEVI = ['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota']\n\n// PRELET 322: PO STRANEH - gola poizvedba vrne najvec 1000 racunov, zato bi\n// vsa porocila nad daljsim obdobjem (npr. leto) tiho sestela le del prometa.\n// Napaka se vrze naprej, da porocilo pokaze napako namesto nepopolnih stevilk.\nasync function placaniRacuni(db: any, od: string, do_: string) {\n  const { data, error } = await naloziVseStrani(() => db.from('orders')\n    .select('id, invoice_number, closed_at, subtotal, discount_amount, discount_pct, total, cashier_id, customer_id, order_lines(name, qty, unit_price, vat_rate, item_id, service_id, items(bookable)), payments(method, amount)')\n    .eq('business_id', BUSINESS_ID).eq('status', 'paid')\n    .gte('closed_at', od + 'T00:00:00').lte('closed_at', do_ + 'T23:59:59')\n    .order('closed_at', { ascending: false })\n    .order('id', { ascending: false }))\n  if (error) throw error\n  return data || []\n}"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #3',
     '  { id:\'ddv-po-kategorijah\', skupina:\'DDV\', ime:\'DDV po kategorijah artiklov\', opis:\'Razčlenitev DDV izhoda po kategoriji artikla (npr. Hrana 9,5 %, Pijača 22 %) — bruto promet, davčna osnova in znesek DDV. Postavke brez artikla (karte, paketi, storitve) so združene pod "Storitve".\',\n    stolpci:[{k:\'kategorija\',l:\'Kategorija\'},{k:\'stopnje\',l:\'DDV stopnja\'},{k:\'bruto\',l:\'Bruto promet\',tip:\'eur\'},{k:\'osnova\',l:\'Osnova (neto)\',tip:\'eur\'},{k:\'ddv\',l:\'DDV\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const { data, error } = await db.from(\'orders\')\n        .select(\'id, closed_at, order_lines(total, vat_rate, voided, item_id, service_id, items(category_id, categories(name)))\')\n        .eq(\'business_id\', BUSINESS_ID).eq(\'status\', \'paid\')\n        .gte(\'closed_at\', od + \'T00:00:00\').lte(\'closed_at\', do_ + \'T23:59:59\')\n      if (error) throw error\n      const m: Record<string, { bruto: number; osnova: number; ddv: number; stopnje: Set<number> }> = {}\n      for (const o of data || []) for (const l of o.order_lines || []) {',
     '  { id:\'ddv-po-kategorijah\', skupina:\'DDV\', ime:\'DDV po kategorijah artiklov\', opis:\'Razčlenitev DDV izhoda po kategoriji artikla (npr. Hrana 9,5 %, Pijača 22 %) — bruto promet, davčna osnova in znesek DDV. Postavke brez artikla (karte, paketi, storitve) so združene pod "Storitve".\',\n    stolpci:[{k:\'kategorija\',l:\'Kategorija\'},{k:\'stopnje\',l:\'DDV stopnja\'},{k:\'bruto\',l:\'Bruto promet\',tip:\'eur\'},{k:\'osnova\',l:\'Osnova (neto)\',tip:\'eur\'},{k:\'ddv\',l:\'DDV\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      // PRELET 322: po straneh (glej placaniRacuni).\n      const { data, error } = await naloziVseStrani(() => db.from(\'orders\')\n        .select(\'id, closed_at, order_lines(total, vat_rate, voided, item_id, service_id, items(category_id, categories(name)))\')\n        .eq(\'business_id\', BUSINESS_ID).eq(\'status\', \'paid\')\n        .gte(\'closed_at\', od + \'T00:00:00\').lte(\'closed_at\', do_ + \'T23:59:59\')\n        .order(\'id\', { ascending: true }))\n      if (error) throw error\n      const m: Record<string, { bruto: number; osnova: number; ddv: number; stopnje: Set<number> }> = {}\n      for (const o of data || []) for (const l of o.order_lines || []) {'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #4',
     "  { id:'obiski-po-stranki', skupina:'Člani in karte', ime:'Obiski po stranki', opis:'Število obiskov (odštetih s karte) v obdobju po stranki.',\n    stolpci:[{k:'stranka',l:'Stranka'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'zadnji',l:'Zadnji obisk',tip:'date'}],\n    nalozi: async (db, od, do_) => {\n      const [{ data }, c] = await Promise.all([db.from('bookings').select('customer_id, visit_deducted_at, start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59'), stranke(db)])\n      return [...grupiraj(data || [], (b: any) => b.customer_id || '')].map(([k, v]) => ({\n        stranka:c[k]?.name || '—', obiskov:v.length, zadnji:(v as any[]).map(b => b.start_at).sort().at(-1) })).sort((a, b) => b.obiskov - a.obiskov)\n    } },\n  { id:'obisk-dnevi-v-tednu', skupina:'Člani in karte', ime:'Obisk po dnevih v tednu', opis:'Kateri dnevi so najbolj obiskani — za razpored osebja in urnik.',\n    stolpci:[{k:'dan',l:'Dan'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const { data } = await db.from('bookings').select('start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59')\n      const st = new Array(7).fill(0); for (const b of data || []) st[new Date(b.start_at).getDay()]++\n      const vseh = st.reduce((a, b) => a + b, 0) || 1\n      return [1,2,3,4,5,6,0].map(d => ({ dan:DNEVI[d], obiskov:st[d], delez:Math.round(st[d] / vseh * 100) }))",
     "  { id:'obiski-po-stranki', skupina:'Člani in karte', ime:'Obiski po stranki', opis:'Število obiskov (odštetih s karte) v obdobju po stranki.',\n    stolpci:[{k:'stranka',l:'Stranka'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'zadnji',l:'Zadnji obisk',tip:'date'}],\n    nalozi: async (db, od, do_) => {\n      const [{ data }, c] = await Promise.all([naloziVseStrani(() => db.from('bookings').select('id, customer_id, visit_deducted_at, start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59').order('id', { ascending: true })), stranke(db)])\n      return [...grupiraj(data || [], (b: any) => b.customer_id || '')].map(([k, v]) => ({\n        stranka:c[k]?.name || '—', obiskov:v.length, zadnji:(v as any[]).map(b => b.start_at).sort().at(-1) })).sort((a, b) => b.obiskov - a.obiskov)\n    } },\n  { id:'obisk-dnevi-v-tednu', skupina:'Člani in karte', ime:'Obisk po dnevih v tednu', opis:'Kateri dnevi so najbolj obiskani — za razpored osebja in urnik.',\n    stolpci:[{k:'dan',l:'Dan'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const { data } = await naloziVseStrani(() => db.from('bookings').select('id, start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59').order('id', { ascending: true })) // PRELET 322: po straneh\n      const st = new Array(7).fill(0); for (const b of data || []) st[new Date(b.start_at).getDay()]++\n      const vseh = st.reduce((a, b) => a + b, 0) || 1\n      return [1,2,3,4,5,6,0].map(d => ({ dan:DNEVI[d], obiskov:st[d], delez:Math.round(st[d] / vseh * 100) }))"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #5',
     "  { id:'zasedenost-po-urah', skupina:'Člani in karte', ime:'Zasedenost po urah', opis:'Obiski po uri dneva — kdaj je gneča in kdaj prazno.',\n    stolpci:[{k:'ura',l:'Ura'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const { data } = await db.from('bookings').select('start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59')\n      const st = new Array(24).fill(0); for (const b of data || []) st[new Date(b.start_at).getHours()]++\n      const vseh = st.reduce((a, b) => a + b, 0) || 1\n      return st.map((n, h) => ({ ura:`${String(h).padStart(2,'0')}:00`, obiskov:n, delez:Math.round(n / vseh * 100) })).filter(r => r.obiskov > 0)",
     "  { id:'zasedenost-po-urah', skupina:'Člani in karte', ime:'Zasedenost po urah', opis:'Obiski po uri dneva — kdaj je gneča in kdaj prazno.',\n    stolpci:[{k:'ura',l:'Ura'},{k:'obiskov',l:'Obiskov',tip:'int'},{k:'delez',l:'Delež %',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const { data } = await naloziVseStrani(() => db.from('bookings').select('id, start_at').eq('business_id', BUSINESS_ID).not('visit_deducted_at', 'is', null).gte('start_at', od).lte('start_at', do_ + 'T23:59:59').order('id', { ascending: true })) // PRELET 322: po straneh\n      const st = new Array(24).fill(0); for (const b of data || []) st[new Date(b.start_at).getHours()]++\n      const vseh = st.reduce((a, b) => a + b, 0) || 1\n      return st.map((n, h) => ({ ura:`${String(h).padStart(2,'0')}:00`, obiskov:n, delez:Math.round(n / vseh * 100) })).filter(r => r.obiskov > 0)"),

]


def aplic(repo, preveri=False):
    print(f"Repozitorij: {repo}\n")
    stevilo = 0
    skupaj = len(ZAMENJAVE) + len(NOVE_DATOTEKE)
    for pot, vsebina in NOVE_DATOTEKE.items():
        polna_pot = os.path.join(repo, pot)
        if os.path.exists(polna_pot):
            with open(polna_pot, encoding='utf-8') as f:
                if f.read() == vsebina:
                    print(f"  v nova datoteka ze obstaja (enaka): {pot}")
                    stevilo += 1
                    continue
            print(f"  ! nova datoteka ze obstaja z DRUGO vsebino: {pot}")
            continue
        if preveri:
            print(f"  v nova datoteka OK: {pot}")
            stevilo += 1
            continue
        os.makedirs(os.path.dirname(polna_pot), exist_ok=True)
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(vsebina)
        print(f"  + ustvarjena: {pot}")
        stevilo += 1
    for pot, opis, staro, novo in ZAMENJAVE:
        polna_pot = os.path.join(repo, pot)
        if not os.path.exists(polna_pot):
            print(f"  ! MANJKA DATOTEKA: {pot}")
            continue
        with open(polna_pot, encoding='utf-8') as f:
            vsebina = f.read()
        n = vsebina.count(staro)
        if n == 0:
            print(f"  ! sidro NI najdeno: {opis}")
            continue
        if n > 1:
            print(f"  ! sidro NI EDINSTVENO ({n}x): {opis}")
            continue
        if preveri:
            print(f"  v sidro OK: {opis}")
            stevilo += 1
            continue
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(vsebina.replace(staro, novo))
        print(f"  + aplicirano: {opis}")
        stevilo += 1
    print()
    if preveri:
        print(f"Nacin --preveri: nic ni bilo spremenjeno. ({stevilo}/{skupaj} OK)")
    else:
        print(f"PRELET 322 uspesno apliciran ({stevilo}/{skupaj}).")
    if stevilo != skupaj:
        sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet322.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
