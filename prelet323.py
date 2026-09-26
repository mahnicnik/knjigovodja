#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 323 - Vsa porocila: zneski PO POPUSTIH poleg zneskov pred popusti.

DIAGNOZA (september 2026): "Mesecni promet po dejavnostih" je pokazal
9.209,67 EUR, seznam racunov pa 9.132,37 EUR. Razlika 77,30 EUR so popusti
na 8 racunih - porocila so sestevala kolicina x cena postavke, popust pa je
zapisan na racunu.

POPRAVEK: obstojeci stolpci ostanejo (preimenovani v "pred popusti"),
dodani so stolpci "po popustih" (popust razdeljen med postavke sorazmerno z
vrednostjo, enako kot na zavihku Pregled):
 - Mesecni promet po dejavnostih: Popusti, Bar/Storitve/Skupaj po popustih
 - Prodaja po artiklih po dnevih: Prihodek po popustih
 - Prodaja storitev po stranki: Znesek po popustih
 - Prodaja z razliko v ceni (RVC): Prodaja, RVC in marza po popustih

Pricakovano za 1.-25.9.2026: Bar 5.440,50 + Storitve 3.691,87 =
9.132,37 EUR po popustih (ujema se s seznamom racunov).

PREVERJENO: npx tsc --noEmit = 0 napak.

Uporaba:
    python3 prelet323.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet323.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #1',
     '  return m\n}\n\n/* ── definicije porocil ────────────────────────────────────────── */\nconst POROCILA: Porocilo[] = [\n  /* ── PRODAJA ── */',
     '  return m\n}\n\n/**\n * PRELET 323: POPUST NA RACUNU, RAZDELJEN MED POSTAVKE.\n *\n * Popust je zapisan na RACUNU (`discount_amount`), cena pa na POSTAVKI.\n * Porocila so sestevala `kolicina × cena` in popusta niso poznala - za\n * september 2026 je "Mesecni promet po dejavnostih" pokazal 9.209,67 EUR,\n * placano (in prijavljeno FURS) pa je bilo 9.132,37 EUR; razlika 77,30 EUR\n * so bili popusti na 8 racunih.\n *\n * Stolpci "pred popusti" ostajajo, kot so bili; dodani so stolpci "po\n * popustih". Popust se razdeli med postavke SORAZMERNO z njihovo vrednostjo\n * - enako kot na zavihku Pregled (prelet 181) in pri izracunu DDV v bazi.\n */\nfunction faktorPopusta(o: any): number {\n  const osnova = Number(o?.subtotal || 0)\n  const popust = Number(o?.discount_amount || 0)\n  return osnova > 0 ? Math.max(0, (osnova - popust) / osnova) : 1\n}\n\n/* ── definicije porocil ────────────────────────────────────────── */\nconst POROCILA: Porocilo[] = [\n  /* ── PRODAJA ── */'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #2',
     '        povp:n2(v.reduce((s: number, o: any) => s + Number(o.total), 0) / v.length) })).sort((a, b) => b.skupaj - a.skupaj)\n    } },\n  { id:\'artikli-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po artiklih po dnevih\', opis:\'Koliko kosov vsakega artikla se je prodalo na posamezen dan.\',\n    stolpci:[{k:\'dan\',l:\'Dan\',tip:\'date\'},{k:\'artikel\',l:\'Artikel\'},{k:\'kosov\',l:\'Kosov\',tip:\'num\'},{k:\'skupaj\',l:\'Prihodek\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      const vrstice = r.flatMap((o: any) => (o.order_lines || []).map((l: any) => ({ ...l, dan: dan(o.closed_at) })))\n      return [...grupiraj(vrstice, (l: any) => l.dan + \'|\' + l.name)].map(([k, v]) => ({\n        dan:k.split(\'|\')[0], artikel:k.split(\'|\')[1], kosov:n2(v.reduce((s: number, l: any) => s + Number(l.qty), 0)),\n        skupaj:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)) })).sort((a, b) => b.dan.localeCompare(a.dan) || b.skupaj - a.skupaj)\n    } },\n  { id:\'mesecni-promet\', skupina:\'Prodaja\', ime:\'Mesečni promet po dejavnostih\', opis:\'Bar (navadni artikli) in storitve (karte, paketi ter artikli, označeni s kljukico "Storitev") po mesecih.\',\n    stolpci:[{k:\'mesec\',l:\'Mesec\'},{k:\'bar\',l:\'Bar\',tip:\'eur\'},{k:\'storitve\',l:\'Storitve\',tip:\'eur\'},{k:\'skupaj\',l:\'Skupaj\',tip:\'eur\'},{k:\'racunov\',l:\'Računov\',tip:\'int\'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      return [...grupiraj(r, (o: any) => mesec(o.closed_at))].map(([m, v]) => {',
     '        povp:n2(v.reduce((s: number, o: any) => s + Number(o.total), 0) / v.length) })).sort((a, b) => b.skupaj - a.skupaj)\n    } },\n  { id:\'artikli-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po artiklih po dnevih\', opis:\'Koliko kosov vsakega artikla se je prodalo na posamezen dan.\',\n    stolpci:[{k:\'dan\',l:\'Dan\',tip:\'date\'},{k:\'artikel\',l:\'Artikel\'},{k:\'kosov\',l:\'Kosov\',tip:\'num\'},{k:\'skupaj\',l:\'Prihodek pred popusti\',tip:\'eur\'},{k:\'poPopustih\',l:\'Prihodek po popustih\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      const vrstice = r.flatMap((o: any) => (o.order_lines || []).map((l: any) => ({ ...l, dan: dan(o.closed_at), faktor: faktorPopusta(o) })))\n      return [...grupiraj(vrstice, (l: any) => l.dan + \'|\' + l.name)].map(([k, v]) => ({\n        dan:k.split(\'|\')[0], artikel:k.split(\'|\')[1], kosov:n2(v.reduce((s: number, l: any) => s + Number(l.qty), 0)),\n        skupaj:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)),\n        poPopustih:n2(v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price) * l.faktor, 0)) })).sort((a, b) => b.dan.localeCompare(a.dan) || b.skupaj - a.skupaj)\n    } },\n  { id:\'mesecni-promet\', skupina:\'Prodaja\', ime:\'Mesečni promet po dejavnostih\', opis:\'Bar (navadni artikli) in storitve (karte, paketi ter artikli, označeni s kljukico "Storitev") po mesecih.\',\n    stolpci:[{k:\'mesec\',l:\'Mesec\'},{k:\'bar\',l:\'Bar\',tip:\'eur\'},{k:\'storitve\',l:\'Storitve\',tip:\'eur\'},{k:\'skupaj\',l:\'Skupaj pred popusti\',tip:\'eur\'},{k:\'popusti\',l:\'Popusti\',tip:\'eur\'},{k:\'barPo\',l:\'Bar po popustih\',tip:\'eur\'},{k:\'storitvePo\',l:\'Storitve po popustih\',tip:\'eur\'},{k:\'skupajPo\',l:\'Skupaj po popustih\',tip:\'eur\'},{k:\'racunov\',l:\'Računov\',tip:\'int\'}],\n    nalozi: async (db, od, do_) => {\n      const r = await placaniRacuni(db, od, do_)\n      return [...grupiraj(r, (o: any) => mesec(o.closed_at))].map(([m, v]) => {'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #3',
     '        // pakete (nimajo ne item_id ne service_id ne items.bookable) - zdaj\n        // je "bar" samo artikel iz cenika, ki NI oznacen kot storitev; vse\n        // ostalo (karta, paket, storitev) je "storitev".\n        let bar = 0, st = 0\n        for (const o of v as any[]) for (const l of o.order_lines || []) { const z = Number(l.qty) * Number(l.unit_price); if (l.item_id && !l.items?.bookable) bar += z; else st += z }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },\n  { id:\'storitve-po-stranki\', skupina:\'Prodaja\', ime:\'Prodaja storitev po stranki\', opis:\'Karte, paketi in artikli, označeni s kljukico "Storitev", ki jih je kupila posamezna stranka.\',\n    stolpci:[{k:\'datum\',l:\'Datum\',tip:\'datetime\'},{k:\'stranka\',l:\'Stranka\'},{k:\'storitev\',l:\'Storitev\'},{k:\'znesek\',l:\'Znesek\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      // POPRAVLJENO (prelet 306): "!item_id" je spregledalo artikle iz',
     '        // pakete (nimajo ne item_id ne service_id ne items.bookable) - zdaj\n        // je "bar" samo artikel iz cenika, ki NI oznacen kot storitev; vse\n        // ostalo (karta, paket, storitev) je "storitev".\n        let bar = 0, st = 0, barPo = 0, stPo = 0\n        for (const o of v as any[]) {\n          const f = faktorPopusta(o)\n          for (const l of o.order_lines || []) {\n            const z = Number(l.qty) * Number(l.unit_price)\n            if (l.item_id && !l.items?.bookable) { bar += z; barPo += z * f } else { st += z; stPo += z * f }\n          }\n        }\n        return { mesec:m, bar:n2(bar), storitve:n2(st), skupaj:n2(bar + st),\n          popusti:n2((bar + st) - (barPo + stPo)),\n          barPo:n2(barPo), storitvePo:n2(stPo), skupajPo:n2(barPo + stPo), racunov:v.length }\n      }).sort((a, b) => b.mesec.localeCompare(a.mesec))\n    } },\n  { id:\'storitve-po-stranki\', skupina:\'Prodaja\', ime:\'Prodaja storitev po stranki\', opis:\'Karte, paketi in artikli, označeni s kljukico "Storitev", ki jih je kupila posamezna stranka.\',\n    stolpci:[{k:\'datum\',l:\'Datum\',tip:\'datetime\'},{k:\'stranka\',l:\'Stranka\'},{k:\'storitev\',l:\'Storitev\'},{k:\'znesek\',l:\'Znesek pred popusti\',tip:\'eur\'},{k:\'poPopustih\',l:\'Znesek po popustih\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const [r, c] = await Promise.all([placaniRacuni(db, od, do_), stranke(db)])\n      // POPRAVLJENO (prelet 306): "!item_id" je spregledalo artikle iz'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #4',
     '      // POPRAVLJENO (prelet 307): popravek preleta 306 je prelomil karte in\n      // pakete - glej pojasnilo pri "mesecni-promet" zgoraj.\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => !(l.item_id && !l.items?.bookable)).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || \'Brez stranke\', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)) })))\n    } },\n  { id:\'placila-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po načinih plačila po dnevih\', opis:\'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.\',\n    stolpci:[{k:\'dan\',l:\'Dan\',tip:\'date\'},{k:\'cash\',l:\'Gotovina\',tip:\'eur\'},{k:\'card\',l:\'Kartica\',tip:\'eur\'},{k:\'ostalo\',l:\'Ostalo\',tip:\'eur\'},{k:\'skupaj\',l:\'Skupaj\',tip:\'eur\'}],',
     '      // POPRAVLJENO (prelet 307): popravek preleta 306 je prelomil karte in\n      // pakete - glej pojasnilo pri "mesecni-promet" zgoraj.\n      return r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => !(l.item_id && !l.items?.bookable)).map((l: any) => ({\n        datum:o.closed_at, stranka:c[o.customer_id]?.name || \'Brez stranke\', storitev:l.name, znesek:n2(Number(l.qty) * Number(l.unit_price)),\n        poPopustih:n2(Number(l.qty) * Number(l.unit_price) * faktorPopusta(o)) })))\n    } },\n  { id:\'placila-po-dnevih\', skupina:\'Prodaja\', ime:\'Prodaja po načinih plačila po dnevih\', opis:\'Gotovina, kartica in ostalo za vsak dan posebej — za primerjavo z bančnim izpiskom.\',\n    stolpci:[{k:\'dan\',l:\'Dan\',tip:\'date\'},{k:\'cash\',l:\'Gotovina\',tip:\'eur\'},{k:\'card\',l:\'Kartica\',tip:\'eur\'},{k:\'ostalo\',l:\'Ostalo\',tip:\'eur\'},{k:\'skupaj\',l:\'Skupaj\',tip:\'eur\'}],'),
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #5',
     "        popusti:n2(v.reduce((a: number, o: any) => a + Number(o.discount_amount || 0), 0)) })).sort((a, b) => b.skupaj - a.skupaj)\n    } },\n  { id:'prodaja-rvc', skupina:'Prodaja', ime:'Prodaja z razliko v ceni (RVC)', opis:'Prodajna in nabavna vrednost po artiklu ter marža. Nabavna cena je iz šifranta artiklov — kjer je ni, je marža enaka prodaji.',\n    stolpci:[{k:'artikel',l:'Artikel'},{k:'kosov',l:'Kosov',tip:'num'},{k:'prodaja',l:'Prodaja',tip:'eur'},{k:'nabava',l:'Nabava',tip:'eur'},{k:'rvc',l:'RVC',tip:'eur'},{k:'marza',l:'Marža %',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const [r, { data: items }] = await Promise.all([placaniRacuni(db, od, do_), db.from('items').select('id, cost_price').eq('business_id', BUSINESS_ID)])\n      const cena = Object.fromEntries((items || []).map((i: any) => [i.id, Number(i.cost_price || 0)]))\n      const vrstice = r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => l.item_id))\n      return [...grupiraj(vrstice, (l: any) => l.name)].map(([ime, v]) => {\n        const kosov = v.reduce((s: number, l: any) => s + Number(l.qty), 0)\n        const prodaja = v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)\n        const nabava = v.reduce((s: number, l: any) => s + Number(l.qty) * (cena[l.item_id] || 0), 0)\n        return { artikel:ime, kosov:n2(kosov), prodaja:n2(prodaja), nabava:n2(nabava), rvc:n2(prodaja - nabava), marza: prodaja > 0 ? Math.round((prodaja - nabava) / prodaja * 100) : 0 }\n      }).sort((a, b) => b.rvc - a.rvc)\n    } },\n",
     "        popusti:n2(v.reduce((a: number, o: any) => a + Number(o.discount_amount || 0), 0)) })).sort((a, b) => b.skupaj - a.skupaj)\n    } },\n  { id:'prodaja-rvc', skupina:'Prodaja', ime:'Prodaja z razliko v ceni (RVC)', opis:'Prodajna in nabavna vrednost po artiklu ter marža. Nabavna cena je iz šifranta artiklov — kjer je ni, je marža enaka prodaji.',\n    stolpci:[{k:'artikel',l:'Artikel'},{k:'kosov',l:'Kosov',tip:'num'},{k:'prodaja',l:'Prodaja pred popusti',tip:'eur'},{k:'prodajaPo',l:'Prodaja po popustih',tip:'eur'},{k:'nabava',l:'Nabava',tip:'eur'},{k:'rvc',l:'RVC pred popusti',tip:'eur'},{k:'rvcPo',l:'RVC po popustih',tip:'eur'},{k:'marza',l:'Marža % pred popusti',tip:'pct'},{k:'marzaPo',l:'Marža % po popustih',tip:'pct'}],\n    nalozi: async (db, od, do_) => {\n      const [r, { data: items }] = await Promise.all([placaniRacuni(db, od, do_), db.from('items').select('id, cost_price').eq('business_id', BUSINESS_ID)])\n      const cena = Object.fromEntries((items || []).map((i: any) => [i.id, Number(i.cost_price || 0)]))\n      const vrstice = r.flatMap((o: any) => (o.order_lines || []).filter((l: any) => l.item_id).map((l: any) => ({ ...l, faktor: faktorPopusta(o) })))\n      return [...grupiraj(vrstice, (l: any) => l.name)].map(([ime, v]) => {\n        const kosov = v.reduce((s: number, l: any) => s + Number(l.qty), 0)\n        const prodaja = v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0)\n        const prodajaPo = v.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price) * l.faktor, 0)\n        const nabava = v.reduce((s: number, l: any) => s + Number(l.qty) * (cena[l.item_id] || 0), 0)\n        return { artikel:ime, kosov:n2(kosov), prodaja:n2(prodaja), prodajaPo:n2(prodajaPo), nabava:n2(nabava),\n          rvc:n2(prodaja - nabava), rvcPo:n2(prodajaPo - nabava),\n          marza: prodaja > 0 ? Math.round((prodaja - nabava) / prodaja * 100) : 0,\n          marzaPo: prodajaPo > 0 ? Math.round((prodajaPo - nabava) / prodajaPo * 100) : 0 }\n      }).sort((a, b) => b.rvc - a.rvc)\n    } },\n"),

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
        print(f"PRELET 323 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet323.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
