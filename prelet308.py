#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 308 — Popravek napake "artikli ostanejo na mizi, ceprav miza ni
oznacena kot zasedena" (mizi "Kot" in "Sredina").

VZROK: v `switchToTable()` (ob preklopu na drugo mizo v POS blagajni) se
prazna kosarica v Reactu obravnava kot "na tej mizi ni nic vec" in se
poklice `closeOrderEmpty()`, nato pa se miza NE GLEDE NA REZULTAT oznaci
kot 'free'. Toda `closeOrderEmpty()` ima svojo varovalko (iz preleta 165):
ce narocilo v BAZI vendarle NI prazno (ima vrstice - denimo, ker je bila
kosarica v Reactu ob hitrem preklopu med mizami zastarela), brisanje
zavrne in tiho vrne (brez napake). Klicna koda tega ni preverjala, zato je
mizo oznacila kot prosto KLJUB TEMU, da je narocilo z artikli ostalo
odprto v bazi. Rezultat: miza na tlorisu prikazana kot prosta, artikli pa
se vedno "visijo" na njej (natanko to sta prijavljala "Kot" in "Sredina").

POPRAVEK:
  1. `pos-client.ts`: `closeOrderEmpty()` zdaj VRNE boolean - `true`, ce je
     bilo narocilo res prazno in izbrisano, `false`, ce je bila varovalka
     sprozena in brisanje preklicano.
  2. `pos/page.tsx`: `switchToTable()` ta rezultat preveri in mizo oznaci
     kot 'free' SAMO, ce je bilo narocilo dejansko izbrisano - sicer jo
     (pravilno) oznaci kot 'occupied', saj narocilo z artikli se vedno
     obstaja.

OPOMBA: to popravi VZROK napake za VNAPREJ (nove primere). Ze obstojeci,
danes ze narobe stanje na mizah "Kot" in "Sredina" v produkcijski bazi to
NE popravi samodejno - to je locen, enkraten popravek podatkov, o katerem
se je treba posebej dogovoriti.

Uporaba:
    python3 prelet308.py --preveri /pot/do/repozitorija   # samo preveri sidra
    python3 prelet308.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     "          await pos.spaces.updateTableStatus(activeTable.id, 'occupied')\n          posData.refresh()\n        } else if (existing) {\n          // Cart je prazen - izbrišemo prazno naročilo če obstaja\n          await pos.orders.closeOrderEmpty(existing.id)\n          await pos.spaces.updateTableStatus(activeTable.id, 'free')\n          posData.refresh()\n        }\n      }",
     '          await pos.spaces.updateTableStatus(activeTable.id, \'occupied\')\n          posData.refresh()\n        } else if (existing) {\n          // Cart je prazen - izbrišemo prazno naročilo če obstaja.\n          //\n          // POPRAVEK (prelet 308): closeOrderEmpty ima varovalko - ce\n          // narocilo v BAZI vendarle ni prazno (npr. zastarela/prazna\n          // kosarica v Reactu ob hitrem preklopu med mizami, medtem ko\n          // je narocilo v bazi ze dobilo artikle), brisanje zavrne in\n          // vrne false, brez napake. Prej smo mizo KLJUB TEMU oznacili\n          // kot \'free\' - zato so artikli ostali v narocilu, miza pa se\n          // je na tlorisu kazala kot prosta ("Kot"/"Sredina" napaka).\n          const izbrisano = await pos.orders.closeOrderEmpty(existing.id)\n          await pos.spaces.updateTableStatus(activeTable.id, izbrisano ? \'free\' : \'occupied\')\n          posData.refresh()\n        }\n      }'),
    ('apps/web/lib/pos-client.ts',
     'apps/web/lib/pos-client.ts: sprememba #1',
     "      // kosarica v Reactu prazna, narocilo v bazi pa ne (npr. tik po\n      // zdruzitvi miz), so artikli izginili. Kosarica v brskalniku ni\n      // dokaz o stanju v bazi.\n      const { data: vrstice } = await sb().from('order_lines').select('id').eq('order_id', orderId).limit(1)\n      if (vrstice && vrstice.length > 0) {\n        console.warn('closeOrderEmpty: narocilo ' + orderId + ' ni prazno - brisanje preklicano')\n        return\n      }\n      const { error } = await sb().from('orders').delete().eq('id', orderId)\n      if (error) throw error\n    },\n    async replaceLines(orderId: string, lines: Array<{\n      itemId?: string",
     '      // kosarica v Reactu prazna, narocilo v bazi pa ne (npr. tik po\n      // zdruzitvi miz), so artikli izginili. Kosarica v brskalniku ni\n      // dokaz o stanju v bazi.\n      //\n      // VRACA boolean (prelet 308): true = narocilo je bilo RES prazno in\n      // izbrisano; false = narocilo NI bilo prazno, brisanje je bilo\n      // preklicano. Klicatelj MORA to preveriti, preden mizo oznaci kot\n      // prosto - sicer miza obvelja za prosto, artikli pa ostanejo v bazi\n      // (natanko to je povzrocilo napako "artikli na mizi kljub temu, da\n      // ni oznacena kot zasedena").\n      const { data: vrstice } = await sb().from(\'order_lines\').select(\'id\').eq(\'order_id\', orderId).limit(1)\n      if (vrstice && vrstice.length > 0) {\n        console.warn(\'closeOrderEmpty: narocilo \' + orderId + \' ni prazno - brisanje preklicano\')\n        return false\n      }\n      const { error } = await sb().from(\'orders\').delete().eq(\'id\', orderId)\n      if (error) throw error\n      return true\n    },\n    async replaceLines(orderId: string, lines: Array<{\n      itemId?: string'),

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
        print(f"PRELET 308 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet308.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
