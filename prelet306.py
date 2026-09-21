#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 306 — Blagajna: storitve, prodane kot navaden artikel, so se stele
pod "Bar" namesto pod "Storitve".

VZROK: v poročilih (zaslon Poročila → Pregled, gumb "Bar / Storitve / Vse"
nad "Top artikli"; in v Knjižnici poročil: "Mesečni promet po dejavnostih"
ter "Prodaja storitev po stranki") je locnica med barom in storitvijo
gledala SAMO, ali ima vrstica narocila `item_id`:

    Storitve (karte, paketi) NIMAJO item_id → "storitev"
    Vse ostalo (ima item_id) → "bar"

To je veljalo, DOKLER so bile vse storitve prodane izkljucno kot karte ali
pakete. Ce pa je artikel v ceniku oznacen s kljukico "Storitev" (polje
`bookable`) in prodan neposredno (ne prek karte/paketa), ima ta vrstica
TUDI `item_id` - zato je padla pod "Bar", cetudi gre za storitev.

POPRAVEK: uporabljena je ista funkcija `jeStoritevVrstica()`
(apps/web/lib/pos-calc.ts), ki jo blagajna ze uporablja drugje (npr. pri
knjizenju DDV po stopnjah) - preverja `service_id` ALI `items.bookable`,
ne le prisotnost `item_id`. Popravljena so VSA tri mesta, ki so imela isto
napacno locnico:
  1. Poročila → Pregled → "Top artikli" (filter Bar/Storitve/Vse)
  2. Knjižnica poročil → "Mesečni promet po dejavnostih"
  3. Knjižnica poročil → "Prodaja storitev po stranki"

Uporaba:
    python3 prelet306.py --preveri /pot/do/repozitorija   # samo preveri sidra
    python3 prelet306.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     "\nimport React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'\nimport { escapeHtml } from '@/lib/html-escape'\nimport { zesekVrstice, razclenitevDdv, popustEurVOdstotek } from '@/lib/pos-calc'\nimport { predlagajUjemanje } from '@/lib/ujemanje-artiklov'\nimport { SLOG_AKTA } from '@/lib/interni-akt'\nimport VatExemptionPicker from '@/components/VatExemptionPicker'",
     "\nimport React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'\nimport { escapeHtml } from '@/lib/html-escape'\nimport { zesekVrstice, razclenitevDdv, popustEurVOdstotek, jeStoritevVrstica } from '@/lib/pos-calc'\nimport { predlagajUjemanje } from '@/lib/ujemanje-artiklov'\nimport { SLOG_AKTA } from '@/lib/interni-akt'\nimport VatExemptionPicker from '@/components/VatExemptionPicker'"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #2',
     "    // POPRAVLJENO (prelet 181): dodana `subtotal` in `discount_amount`.\n    // Brez njiju iz vrstice ni bilo mogoce vedeti, ali je bil na racunu popust.\n    const linesRes = await db.from('order_lines')\n      .select('name, qty, unit_price, item_id, orders!inner(closed_at, status, business_id, subtotal, discount_amount, payments(method))')\n      .eq('orders.business_id', BUSINESS_ID)\n      .eq('orders.status', 'paid')\n      .gte('orders.closed_at', fromStr)",
     "    // POPRAVLJENO (prelet 181): dodana `subtotal` in `discount_amount`.\n    // Brez njiju iz vrstice ni bilo mogoce vedeti, ali je bil na racunu popust.\n    const linesRes = await db.from('order_lines')\n      .select('name, qty, unit_price, item_id, service_id, items(bookable), orders!inner(closed_at, status, business_id, subtotal, discount_amount, payments(method))')\n      .eq('orders.business_id', BUSINESS_ID)\n      .eq('orders.status', 'paid')\n      .gte('orders.closed_at', fromStr)"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #3',
     "      const sKartico = ((l as any).orders?.payments || []).some((p: any) => p.method === 'pkg')\n      /**\n       * PRELET 268: BAR ALI STORITEV.\n       *\n       * Storitve - clanske karte, treniranje, paketi - se prodajo BREZ\n       * `item_id`, ker niso artikli iz cenika, ampak paketi. Bar (pijaca,\n       * hrana) ima `item_id` vedno. Locnica je v podatkih ze cista; tu jo\n       * le uporabimo.\n       *\n       * V septembru: bar 1.029 kosov za 2.537 EUR, storitve 6 kosov za\n       * 1.143 EUR. Brez locitve je paket za 480 EUR z enim kosom prehitel\n       * kavo s 109 kosi - in lastnik ni videl, kaj se v lokalu res prodaja.\n       */\n      const vrsta = (l as any).item_id ? 'bar' : 'storitev'\n      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0, vrsta }\n      itemMap[k].qty += Number(l.qty || 1)\n      if (!sKartico) {",
     '      const sKartico = ((l as any).orders?.payments || []).some((p: any) => p.method === \'pkg\')\n      /**\n       * PRELET 268: BAR ALI STORITEV.\n       * POPRAVLJENO (prelet 306): prejsnja locnica "ima item_id → bar" je\n       * spregledala storitve, ki so vpisane kot navaden artikel v ceniku in\n       * samo oznacene s kljukico "Storitev" (`bookable`) - te ZDAJ TUDI\n       * imajo `item_id`, zato so se stele pod "bar". Prava locnica je ista\n       * kot povsod drugod v blagajni (glej `jeStoritevVrstica`): karta,\n       * paket ALI artikel, oznacen kot storitev.\n       */\n      const vrsta = jeStoritevVrstica(l as any) ? \'storitev\' : \'bar\'\n      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0, vrsta }\n      itemMap[k].qty += Number(l.qty || 1)\n      if (!sKartico) {'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #1',
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }",
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\nimport { jeStoritevVrstica } from '@/lib/pos-calc'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #2',
     "\nasync function placaniRacuni(db: any, od: string, do_: string) {\n  const { data, error } = await db.from('orders')\n    .select('id, invoice_number, closed_at, subtotal, discount_amount, discount_pct, total, cashier_id, customer_id, order_lines(name, qty, unit_price, vat_rate, item_id), payments(method, amount)')\n    .eq('business_id', BUSINESS_ID).eq('status', 'paid')\n    .gte('closed_at', od + 'T00:00:00').lte('closed_at', do_ + 'T23:59:59')\n    .order('closed_at', { ascending: false })",
     "\nasync function placaniRacuni(db: any, od: string, do_: string) {\n  const { data, error } = await db.from('orders')\n    .select('id, invoice_number, closed_at, subtotal, discount_amount, discount_pct, total, cashier_id, customer_id, order_lines(name, qty, unit_price, vat_rate, item_id, service_id, items(bookable)), payments(method, amount)')\n    .eq('business_id', BUSINESS_ID).eq('status', 'paid')\n    .gte('closed_at', od + 'T00:00:00').lte('closed_at', do_ + 'T23:59:59')\n    .order('closed_at', { ascending: false })"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #3',
     "        dan:k.split('|')[0], artikel:k.split('|')[1], kosov:n2(v.reduce((s: number, l: any) => s + Number(l.qty), 0)),\n        skupaj:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)) })).sort((a, b) => b.dan.localeCompare(a.dan) || b.skupaj - a.skupaj)\n    } },\n  { id:'mesecni-promet', skupina:'Prodaja', ime:'Mesečni promet po dejavnostih', opis:'Bar (artikli iz cenika) in storitve (karte, paketi) po mesecih.',\n    stolpci:[{k:'mesec',l:'Mesec'},{k:'bar',l:'Bar',tip:'eur'},{k:'storitve',l:'Storitve',tip:'eur'},{k:'skupaj',l:'Skupaj',tip:'eur'},{k:'racunov',l:'Računov',tip:'int'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      return [...grupiraj(r, (o: any) => mesec(o.closed_at))].map(([m, v]) => {\n        let bar = 0, st = 0\n        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (l.item_id) bar += z; else st += z }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },\n  { id:'storitve-po-stranki', skupina:'Prodaja', ime:'Prodaja storitev po stranki', opis:'Karte in paketi, ki jih je kupila posamezna stranka.',\n    stolpci:[{k:'datum',l:'Datum',tip:'datetime'},{k:'stranka',l:'Stranka'},{k:'storitev',l:'Storitev'},{k:'znesek',l:'Znesek',tip:'eur'}],\n    nalozi: async (db, od, do_) => {\n      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => !l.item_id).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || 'Brez stranke', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))\n    } },\n  { id:'placila-po-dnevih', skupina:'Prodaja', ime:'Prodaja po načinih plačila po dnevih', opis:'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.',",
     '        dan:k.split(\'|\')[0], artikel:k.split(\'|\')[1], kosov:n2(v.reduce((s: number, l: any) => s + Number(l.qty), 0)),\n        skupaj:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)) })).sort((a, b) => b.dan.localeCompare(a.dan) || b.skupaj - a.skupaj)\n    } },\n  { id:\'mesecni-promet\', skupina:\'Prodaja\', ime:\'Mesečni promet po dejavnostih\', opis:\'Bar (navadni artikli) in storitve (karte, paketi ter artikli, označeni s kljukico "Storitev") po mesecih.\',\n    stolpci:[{k:\'mesec\',l:\'Mesec\'},{k:\'bar\',l:\'Bar\',tip:\'eur\'},{k:\'storitve\',l:\'Storitve\',tip:\'eur\'},{k:\'skupaj\',l:\'Skupaj\',tip:\'eur\'},{k:\'racunov\',l:\'Računov\',tip:\'int\'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      return [...grupiraj(r, (o: any) => mesec(o.closed_at))].map(([m, v]) => {\n        // POPRAVLJENO (prelet 306): "ima item_id → bar" je spregledalo\n        // artikle iz cenika, oznacene s kljukico "Storitev" (`bookable`) -\n        // ti so imeli item_id, zato so se steli pod Bar namesto Storitve.\n        let bar = 0, st = 0\n        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (jeStoritevVrstica(l)) st += z; else bar += z }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },\n  { id:\'storitve-po-stranki\', skupina:\'Prodaja\', ime:\'Prodaja storitev po stranki\', opis:\'Karte, paketi in artikli, označeni s kljukico "Storitev", ki jih je kupila posamezna stranka.\',\n    stolpci:[{k:\'datum\',l:\'Datum\',tip:\'datetime\'},{k:\'stranka\',l:\'Stranka\'},{k:\'storitev\',l:\'Storitev\'},{k:\'znesek\',l:\'Znesek\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      // POPRAVLJENO (prelet 306): "!item_id" je spregledalo artikle iz\n      // cenika, oznacene s kljukico "Storitev" (`bookable`).\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => jeStoritevVrstica(l)).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || \'Brez stranke\', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))\n    } },\n  { id:\'placila-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po načinih plačila po dnevih\', opis:\'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.\','),

]


def aplic(repo, preveri=False):
    print(f"Repozitorij: {repo}\n")
    stevilo = 0
    for pot, opis, staro, novo in ZAMENJAVE:
        polna_pot = os.path.join(repo, pot)
        if not os.path.exists(polna_pot):
            print(f"  ! MANJKA DATOTEKA: {pot}")
            continue
        with open(polna_pot, encoding='utf-8') as f:
            vsebina = f.read()
        stevilo_pojavitev = vsebina.count(staro)
        if stevilo_pojavitev == 0:
            print(f"  ! sidro NI najdeno: {opis}")
            continue
        if stevilo_pojavitev > 1:
            print(f"  ! sidro NI EDINSTVENO ({stevilo_pojavitev}x): {opis}")
            continue
        if preveri:
            print(f"  v sidro OK: {opis}")
            stevilo += 1
            continue
        nova_vsebina = vsebina.replace(staro, novo)
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(nova_vsebina)
        print(f"  + aplicirano: {opis}")
        stevilo += 1

    print()
    if preveri:
        print(f"Nacin --preveri: nic ni bilo spremenjeno. ({stevilo}/{len(ZAMENJAVE)} sider OK)")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)
    else:
        print(f"PRELET 306 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet306.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
