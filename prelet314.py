#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 314 — Nov report "DDV po kategorijah artiklov" v knjižnici poročil
znotraj POS blagajne (apps/web/components/pos/PorocilaKnjiznica.tsx).

POPRAVEK LOKACIJE: Prelet 313 je isti DDV-po-kategorijah pregled dodal v
Poslovna poročila portala (/porocila), ker je bila prvotna zahteva "v vsa
poročila manjka pregled DDV po dejavnosti" razumljena kot ta stran. Iz
posnetka zaslona ("PRODAJA" skupina v levem meniju) se je izkazalo, da je
uporabnik dejansko mislil na knjižnico poročil ZNOTRAJ blagajne (gumb
"Poročila" v POS-u) - to je Prelet 313 ni dosegel, zato "ddv ni bil dodan".
Ta prelet doda IST pregled na PRAVO mesto - Prelet 313 v /porocila ostaja
kot je (dodatna, ne škodljiva postavitev), ta prelet pa dodaja nov vnos v
polje POROCILA v PorocilaKnjiznica.tsx, pod novo skupino "DDV".

KAJ: razčlenitev DDV izhoda POS blagajne po KATEGORIJAH ARTIKLOV (npr. Hrana
9,5 %, Pijača 22 %) za izbrano obdobje - bruto promet, davčna osnova (neto)
in znesek DDV. Vrstice brez artikla (storitve) so združene pod "Storitve",
preostalo pod "Ostalo".

VIR PODATKOV: ista poizvedba (business_id + status='paid' + closed_at) kot
jo ostali reporti v tej knjižnici in Z-poročilo uporabljajo. DDV stopnja se
bere z `?? 22`, NE z `|| 22`, ker bi bila sicer oproščena postavka (0 %)
napačno prešteta med 22-odstotne (ista formula kot v lib/pos-calc.ts in
Prelet 313).

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po tej spremembi vrne 0
napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napačen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet314.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet314.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/components/pos/PorocilaKnjiznica.tsx',
     'apps/web/components/pos/PorocilaKnjiznica.tsx: sprememba #1',
     "      }).sort((a, b) => b.rvc - a.rvc)\n    } },\n\n  /* ── CLANI IN KARTE ── */\n  { id:'veljavne-karte', skupina:'Člani in karte', ime:'Trenutno veljavne karte', opis:'Aktivne karte, ki še niso potekle. Obdobje ne vpliva.', brezObdobja:true,\n    stolpci:[{k:'stranka',l:'Stranka'},{k:'karta',l:'Karta'},{k:'ostane',l:'Ostane'},{k:'potece',l:'Poteče',tip:'date'},{k:'kupljena',l:'Kupljena',tip:'date'},{k:'cena',l:'Cena',tip:'eur'}],",
     '      }).sort((a, b) => b.rvc - a.rvc)\n    } },\n\n  /* ── DDV (prelet 314) ── */\n  { id:\'ddv-po-kategorijah\', skupina:\'DDV\', ime:\'DDV po kategorijah artiklov\', opis:\'Razčlenitev DDV izhoda po kategoriji artikla (npr. Hrana 9,5 %, Pijača 22 %) — bruto promet, davčna osnova in znesek DDV. Postavke brez artikla (karte, paketi, storitve) so združene pod "Storitve".\',\n    stolpci:[{k:\'kategorija\',l:\'Kategorija\'},{k:\'stopnje\',l:\'DDV stopnja\'},{k:\'bruto\',l:\'Bruto promet\',tip:\'eur\'},{k:\'osnova\',l:\'Osnova (neto)\',tip:\'eur\'},{k:\'ddv\',l:\'DDV\',tip:\'eur\'}],\n    nalozi: async (db, od, do_) => {\n      const { data, error } = await db.from(\'orders\')\n        .select(\'id, closed_at, order_lines(total, vat_rate, voided, item_id, service_id, items(category_id, categories(name)))\')\n        .eq(\'business_id\', BUSINESS_ID).eq(\'status\', \'paid\')\n        .gte(\'closed_at\', od + \'T00:00:00\').lte(\'closed_at\', do_ + \'T23:59:59\')\n      if (error) throw error\n      const m: Record<string, { bruto: number; osnova: number; ddv: number; stopnje: Set<number> }> = {}\n      for (const o of data || []) for (const l of o.order_lines || []) {\n        if (l.voided) continue\n        const bruto = Number(l.total) || 0\n        if (!bruto) continue\n        // OPOMBA: `?? 22`, NE `|| 22` - oprosceno (0 %) bi bilo sicer napacno\n        // presteto med 22-odstotne (ista varovalka kot v lib/pos-calc.ts).\n        const stopnja = Number(l.vat_rate ?? 22)\n        const osnova = bruto / (1 + stopnja / 100)\n        const ddv = bruto - osnova\n        const ime = l.items?.categories?.name ?? (l.service_id ? \'Storitve\' : \'Ostalo\')\n        if (!m[ime]) m[ime] = { bruto:0, osnova:0, ddv:0, stopnje:new Set() }\n        m[ime].bruto += bruto; m[ime].osnova += osnova; m[ime].ddv += ddv; m[ime].stopnje.add(stopnja)\n      }\n      return Object.entries(m).map(([kategorija, d]) => ({\n        kategorija, stopnje:[...d.stopnje].sort((a, b) => b - a).map(s => s + \' %\').join(\' + \'),\n        bruto:n2(d.bruto), osnova:n2(d.osnova), ddv:n2(d.ddv) })).sort((a, b) => b.ddv - a.ddv)\n    } },\n\n  /* ── CLANI IN KARTE ── */\n  { id:\'veljavne-karte\', skupina:\'Člani in karte\', ime:\'Trenutno veljavne karte\', opis:\'Aktivne karte, ki še niso potekle. Obdobje ne vpliva.\', brezObdobja:true,\n    stolpci:[{k:\'stranka\',l:\'Stranka\'},{k:\'karta\',l:\'Karta\'},{k:\'ostane\',l:\'Ostane\'},{k:\'potece\',l:\'Poteče\',tip:\'date\'},{k:\'kupljena\',l:\'Kupljena\',tip:\'date\'},{k:\'cena\',l:\'Cena\',tip:\'eur\'}],'),

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
        print(f"PRELET 314 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet314.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
