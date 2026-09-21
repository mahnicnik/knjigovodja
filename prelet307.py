#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 307 — Popravek regresije iz preleta 306: karte in paketi so po tistem
popravku padli pod "Bar" namesto pod "Storitve".

VZROK: prelet 306 je locnico "ima item_id → bar" zamenjal z obstojeco
funkcijo `jeStoritevVrstica()` (preverja `service_id` ALI `items.bookable`).
Ta funkcija pa NE pozna tretjega nacina, kako je vrstica narocila lahko
"storitev": prek `customer_package_id` (unovcenje karte ali paketa). Take
vrstice nimajo ne `item_id`, ne `service_id`, ne `items.bookable` - zato jih
je `jeStoritevVrstica()` spregledala in so padle pod "bar" (regresija).

POPRAVEK: nazaj na preprosto, robustno locnico, ki NE zahteva poznavanja
VSEH moznih polj za "storitev": "bar" je SAMO artikel iz cenika (ima
`item_id`), ki hkrati NI oznacen s kljukico "Storitev" (`items.bookable`).
Vse ostalo (karta, paket, storitev - ne glede na to, prek katerega polja je
povezano) je "storitev". S tem sta pravilna oba primera hkrati:
  - artikel iz cenika, oznacen kot storitev (popravek preleta 306) → storitev
  - karta/paket (delovalo pravilno pred preletom 306) → storitev

Popravljeni sta isti dve mesti kot v preletu 306 (poleg "Top artikli" v
Porocilih je "Prodaja storitev po stranki" iz Knjiznice porocil zdaj tudi
popravljena na isto locnico).

Uporaba:
    python3 prelet307.py --preveri /pot/do/repozitorija   # samo preveri sidra
    python3 prelet307.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     "\nimport React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'\nimport { escapeHtml } from '@/lib/html-escape'\nimport { zesekVrstice, razclenitevDdv, popustEurVOdstotek, jeStoritevVrstica } from '@/lib/pos-calc'\nimport { predlagajUjemanje } from '@/lib/ujemanje-artiklov'\nimport { SLOG_AKTA } from '@/lib/interni-akt'\nimport VatExemptionPicker from '@/components/VatExemptionPicker'",
     "\nimport React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'\nimport { escapeHtml } from '@/lib/html-escape'\nimport { zesekVrstice, razclenitevDdv, popustEurVOdstotek } from '@/lib/pos-calc'\nimport { predlagajUjemanje } from '@/lib/ujemanje-artiklov'\nimport { SLOG_AKTA } from '@/lib/interni-akt'\nimport VatExemptionPicker from '@/components/VatExemptionPicker'"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #2',
     '       * PRELET 268: BAR ALI STORITEV.\n       * POPRAVLJENO (prelet 306): prejsnja locnica "ima item_id → bar" je\n       * spregledala storitve, ki so vpisane kot navaden artikel v ceniku in\n       * samo oznacene s kljukico "Storitev" (`bookable`) - te ZDAJ TUDI\n       * imajo `item_id`, zato so se stele pod "bar". Prava locnica je ista\n       * kot povsod drugod v blagajni (glej `jeStoritevVrstica`): karta,\n       * paket ALI artikel, oznacen kot storitev.\n       */\n      const vrsta = jeStoritevVrstica(l as any) ? \'storitev\' : \'bar\'\n      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0, vrsta }\n      itemMap[k].qty += Number(l.qty || 1)\n      if (!sKartico) {',
     '       * PRELET 268: BAR ALI STORITEV.\n       * POPRAVLJENO (prelet 306): prejsnja locnica "ima item_id → bar" je\n       * spregledala storitve, ki so vpisane kot navaden artikel v ceniku in\n       * samo oznacene s kljukico "Storitev" (`bookable`) - te so imele\n       * `item_id`, zato so se stele pod "bar".\n       * POPRAVLJENO (prelet 307): popravek preleta 306 (`jeStoritevVrstica`)\n       * je pri tem prelomil karte in pakete - ti NIMAJO ne `item_id` ne\n       * `service_id` ne `items.bookable` (imajo `customer_package_id`), zato\n       * jih je `jeStoritevVrstica` spregledala in so padle pod "bar".\n       * Prava locnica ostaja preprosta: "bar" je SAMO artikel iz cenika, ki\n       * NI oznacen kot storitev - vse ostalo (karta, paket, storitev) je\n       * "storitev", ne glede na to, prek katerega polja je povezano.\n       */\n      const vrsta = ((l as any).item_id && !(l as any).items?.bookable) ? \'bar\' : \'storitev\'\n      if (!itemMap[k]) itemMap[k] = { name:k, qty:0, total:0, vrsta }\n      itemMap[k].qty += Number(l.qty || 1)\n      if (!sKartico) {'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #1',
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\nimport { jeStoritevVrstica } from '@/lib/pos-calc'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }",
     "import { Fragment, useEffect, useMemo, useState } from 'react'\nimport { createClient } from '@/lib/supabase'\nimport { BUSINESS_ID } from '@/lib/pos-client'\n\ntype Tip = 'text' | 'eur' | 'int' | 'num' | 'date' | 'datetime' | 'pct'\ntype Stolpec = { k: string; l: string; tip?: Tip; w?: number }"),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #2',
     '        // POPRAVLJENO (prelet 306): "ima item_id → bar" je spregledalo\n        // artikle iz cenika, oznacene s kljukico "Storitev" (`bookable`) -\n        // ti so imeli item_id, zato so se steli pod Bar namesto Storitve.\n        let bar = 0, st = 0\n        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (jeStoritevVrstica(l)) st += z; else bar += z }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },',
     '        // POPRAVLJENO (prelet 306): "ima item_id → bar" je spregledalo\n        // artikle iz cenika, oznacene s kljukico "Storitev" (`bookable`) -\n        // ti so imeli item_id, zato so se steli pod Bar namesto Storitve.\n        // POPRAVLJENO (prelet 307): prelet 306 je pri tem prelomil karte in\n        // pakete (nimajo ne item_id ne service_id ne items.bookable) - zdaj\n        // je "bar" samo artikel iz cenika, ki NI oznacen kot storitev; vse\n        // ostalo (karta, paket, storitev) je "storitev".\n        let bar = 0, st = 0\n        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (l.item_id && !l.items?.bookable) bar += z; else st += z }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #3',
     '      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      // POPRAVLJENO (prelet 306): "!item_id" je spregledalo artikle iz\n      // cenika, oznacene s kljukico "Storitev" (`bookable`).\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => jeStoritevVrstica(l)).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || \'Brez stranke\', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))\n    } },\n  { id:\'placila-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po načinih plačila po dnevih\', opis:\'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.\',',
     '      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      // POPRAVLJENO (prelet 306): "!item_id" je spregledalo artikle iz\n      // cenika, oznacene s kljukico "Storitev" (`bookable`).\n      // POPRAVLJENO (prelet 307): popravek preleta 306 je prelomil karte in\n      // pakete - glej pojasnilo pri "mesecni-promet" zgoraj.\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => !(l.item_id && !l.items?.bookable)).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || \'Brez stranke\', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))\n    } },\n  { id:\'placila-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po načinih plačila po dnevih\', opis:\'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.\','),

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
            print(f"    (ali je bil najprej apliciran prelet306.py?)")
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
        print(f"PRELET 307 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet307.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
