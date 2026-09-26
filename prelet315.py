#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 315 — Popravek pravega vzroka: izbrisan artikel z mize se je
"sam vrnil" (apps/web/app/pos/page.tsx, apps/web/lib/pos-client.ts).

VZROK: sprememba košarice (dodajanje, brisanje, sprememba količine) se je
prej zapisala v bazo ŠELE ob preklopu mize, preklopu zaslona v meniju ali
zaključku plačila. Do takrat je bila sprememba samo lokalna, v brskalniku
na tisti napravi. Če uporabnik po brisanju artikla ni preklopil mize
(aplikacija se je osvežila, naprava izgubila povezavo, obtičala na istem
zaslonu ...), se izbris ni nikoli zapisal - ob naslednjem odprtju te mize
se je košarica znova naložila iz baze, kjer je bil artikel še vedno
prisoten.

Poleg tega je varovalka v `closeOrderEmpty` (prelet 165/308 - preprečuje,
da bi zastarela/prazna košarica pobrisala sveže naročilo, ki ga je medtem
napolnila druga naprava) VEDNO zavrnila izbris ZADNJEGA artikla z mize:
baza je do tega klica še vedno kazala "stari" artikel (ta klic ga šele
zbriše), zato je varovalka vsakič sklepala, da je prazna košarica
zastarela, in izbris preklicala. Miza je ostala "zasedena" z artiklom, ki
ga ni bilo več mogoče odstraniti - natanko to je prijavljena napaka
(miza t6, "Kava z mlekom", 23. 9. 2026 - odstranjeno ročno v bazi, glej
spremstveno sporočilo).

POPRAVEK, dve spremembi skupaj:

1. SAMODEJNO SHRANJEVANJE: sprememba košarice se zdaj zapiše v bazo
   samodejno, ~900 ms po zadnji spremembi, dokler je miza aktivna - ne
   šele ob preklopu mize/zaslona/plačilu. Prekinjen tok (osvežitev,
   izguba povezave ...) tako skoraj vedno ujame že zapisano stanje.

2. ZANESLJIVO PRAZNA KOŠARICA: nova zastavica `kosaricaZanesljivaRef`
   spremlja, ali trenutna košarica na tej napravi zanesljivo zrcali bazo
   (je bila nazadnje NALOŽENA iz nje, ne le podedovana). Ko je to res in
   uporabnik izprazni košarico do zadnjega artikla, `closeOrderEmpty`
   dobi novo možnost `{ prepricanoPrazno: true }`, ki preskoči
   preverjanje baze - "prazno" je v tem primeru zanesljivo pravi odgovor,
   ne zastarelo lokalno stanje. Obstoječa varovalka (prelet 165/308) za
   VSE druge primere (preklop mize brez zanesljivega branja, zdrzevanje
   dveh naprav na isti mizi) ostane nespremenjena - privzeta vrednost je
   `false`.

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po tej spremembi vrne
0 napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napačen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet315.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet315.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     '  const [activeCustomer, setActiveCustomer] = useState(null)\n  const [cart, setCart] = useState([])\n  const [tableSwitching, setTableSwitching] = useState(false)\n\n  /**\n   * OSVEŽITEV PO POSEGU V NAROČILO (prelet 165)',
     '  const [activeCustomer, setActiveCustomer] = useState(null)\n  const [cart, setCart] = useState([])\n  const [tableSwitching, setTableSwitching] = useState(false)\n  /**\n   * SAMODEJNO SHRANJEVANJE KOŠARICE (prelet 315)\n   * ═══════════════════════════════════════════\n   *\n   * NAPAKA, KI JO TO ODPRAVLJA — izbrisan artikel se je "sam vrnil".\n   *\n   * Sprememba košarice (dodajanje, brisanje, sprememba količine) se je\n   * prej zapisala v bazo ŠELE ob preklopu mize, preklopu zaslona ali\n   * zaključku plačila (glej `shraniKosarico` spodaj). Do takrat je bila\n   * sprememba samo lokalna - v brskalniku na TEJ napravi. Če uporabnik po\n   * brisanju artikla ni preklopil mize (aplikacija se je osvežila,\n   * naprava izgubila povezavo, obtičala na istem zaslonu ...), se izbris\n   * ni nikoli zapisal v bazo - ob naslednjem odprtju te mize se je\n   * košarica znova naložila iz baze, kjer je bil artikel še vedno\n   * prisoten. Zgledalo je, kot da se je artikel "sam vrnil".\n   *\n   * `kosaricaZanesljivaRef`: ali trenutna košarica ZANESLJIVO zrcali\n   * bazo za `activeTable` (torej je bila nazadnje NALOŽENA iz baze na tej\n   * napravi, ne le podedovana ali privzeto prazna). Ko je to res in\n   * uporabnik izprazni košarico do zadnjega artikla, vemo, da je "prazno"\n   * pravi odgovor - ne le zastarelo lokalno stanje - zato lahko\n   * `closeOrderEmpty` varno obidemo (glej `pos-client.ts`).\n   *\n   * `shranjevanjeTimerRef`: časovnik za spodnji učinek, ki shrani košarico\n   * ~900 ms po zadnji spremembi, dokler je miza aktivna - torej precej\n   * prej, kot bi uporabnik sploh utegnil zapustiti mizo.\n   */\n  const kosaricaZanesljivaRef = useRef(false)\n  const shranjevanjeTimerRef = useRef(null)\n\n  /**\n   * Shrani trenutno košarico na dano mizo v bazo (PRELET 315 - izvleček iz\n   * prejšnjega dela `switchToTable`, saj ga zdaj kliče tudi samodejno\n   * shranjevanje spodaj).\n   *\n   * `zanesljivaPrazna`: glej `kosaricaZanesljivaRef` zgoraj - posreduje se\n   * naprej v `closeOrderEmpty`.\n   */\n  async function shraniKosarico(tabela, kosarica, zanesljivaPrazna) {\n    if (!tabela) return\n    const existing = await pos.orders.getOpenOnTable(tabela.id)\n    if (kosarica.length > 0) {\n      const cashierId = auth?.user?.id || null\n      const orderId = existing ? existing.id : await pos.orders.openOrder({ tableId: tabela.id, customerId: activeCustomer?.id, cashierId })\n      await pos.orders.replaceLines(orderId, kosarica.map(line => ({\n        itemId: line.id, name: line.name, qty: line.qty, unitPrice: line.price,\n        vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null,\n      })))\n      await pos.spaces.updateTableStatus(tabela.id, \'occupied\')\n      posData.refresh()\n    } else if (existing) {\n      const izbrisano = await pos.orders.closeOrderEmpty(existing.id, { prepricanoPrazno: zanesljivaPrazna })\n      await pos.spaces.updateTableStatus(tabela.id, izbrisano ? \'free\' : \'occupied\')\n      posData.refresh()\n    }\n  }\n\n  /**\n   * OSVEŽITEV PO POSEGU V NAROČILO (prelet 165)'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #2',
     "    // Kosarica v Reactu je po posegu zastarela - najprej jo razveljavimo,\n    // da je nobena pot ne more zapisati nazaj cez svezo stanje v bazi.\n    setCart([])\n    try {\n      if (nacin === 'move') {\n        // Narocilo je odslo na drugo mizo - tu ni vec nicesar.",
     "    // Kosarica v Reactu je po posegu zastarela - najprej jo razveljavimo,\n    // da je nobena pot ne more zapisati nazaj cez svezo stanje v bazi.\n    setCart([])\n    // PRELET 315: dokler ni znova prebrana iz baze spodaj, kosarica ni\n    // zanesljiva - samodejno shranjevanje je med tem ne sme obravnavati\n    // kot potrjeno prazno.\n    kosaricaZanesljivaRef.current = false\n    try {\n      if (nacin === 'move') {\n        // Narocilo je odslo na drugo mizo - tu ni vec nicesar."),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #3',
     "            }\n          }))\n        }\n      }\n    } catch (e) {\n      console.error('Osvezitev mize po posegu ni uspela:', e)",
     "            }\n          }))\n        }\n        // PRELET 315: bazo za to mizo smo pravkar prebrali na tej napravi -\n        // kosarica je odslej zanesljivo zrcalo, ne glede na to, ali je\n        // narocilo obstajalo.\n        kosaricaZanesljivaRef.current = true\n      }\n    } catch (e) {\n      console.error('Osvezitev mize po posegu ni uspela:', e)"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #4',
     '  async function switchToTable(newTable) {\n    if (tableSwitching) return\n    setTableSwitching(true)\n    try {\n      // 1. Shrani trenutni cart za prejšnjo mizo (če je bila izbrana in ima artikle)\n      if (activeTable) {\n        const existing = await pos.orders.getOpenOnTable(activeTable.id)\n        if (cart.length > 0) {\n          const cashierId = auth?.user?.id || null\n          const orderId = existing ? existing.id : await pos.orders.openOrder({ tableId: activeTable.id, customerId: activeCustomer?.id, cashierId })\n          await pos.orders.replaceLines(orderId, cart.map(line => ({\n            itemId: line.id, name: line.name, qty: line.qty, unitPrice: line.price,\n            vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null,\n          })))\n          await pos.spaces.updateTableStatus(activeTable.id, \'occupied\')\n          posData.refresh()\n        } else if (existing) {\n          // Cart je prazen - izbrišemo prazno naročilo če obstaja.\n          //\n          // POPRAVEK (prelet 308): closeOrderEmpty ima varovalko - ce\n          // narocilo v BAZI vendarle ni prazno (npr. zastarela/prazna\n          // kosarica v Reactu ob hitrem preklopu med mizami, medtem ko\n          // je narocilo v bazi ze dobilo artikle), brisanje zavrne in\n          // vrne false, brez napake. Prej smo mizo KLJUB TEMU oznacili\n          // kot \'free\' - zato so artikli ostali v narocilu, miza pa se\n          // je na tlorisu kazala kot prosta ("Kot"/"Sredina" napaka).\n          const izbrisano = await pos.orders.closeOrderEmpty(existing.id)\n          await pos.spaces.updateTableStatus(activeTable.id, izbrisano ? \'free\' : \'occupied\')\n          posData.refresh()\n        }\n      }\n      // 2. Naloži naročilo nove mize (če obstaja)\n      if (newTable) {\n        const existing = await pos.orders.getOpenOnTable(newTable.id)\n        if (existing && existing.order_lines) {',
     '  async function switchToTable(newTable) {\n    if (tableSwitching) return\n    setTableSwitching(true)\n    // PRELET 315: ce je samodejno shranjevanje ravno cakalo na svoj\n    // casovnik, ga prekinemo - spodaj bomo isto kosarico shranili takoj,\n    // podvojen/zastarel klic med preklopom mize ni potreben.\n    if (shranjevanjeTimerRef.current) { clearTimeout(shranjevanjeTimerRef.current); shranjevanjeTimerRef.current = null }\n    try {\n      // 1. Shrani trenutni cart za prejšnjo mizo (če je bila izbrana in ima artikle)\n      //\n      // POPRAVEK (prelet 308): closeOrderEmpty ima varovalko - ce narocilo\n      // v BAZI vendarle ni prazno (npr. zastarela/prazna kosarica v\n      // Reactu ob hitrem preklopu med mizami, medtem ko je narocilo v\n      // bazi ze dobilo artikle), brisanje zavrne, da artikli ne izginejo.\n      // `kosaricaZanesljivaRef` (prelet 315) pove, kdaj to preverjanje NI\n      // potrebno - glej `shraniKosarico` in komentar ob ref-u zgoraj.\n      if (activeTable) {\n        await shraniKosarico(activeTable, cart, kosaricaZanesljivaRef.current)\n      }\n      // 2. Naloži naročilo nove mize (če obstaja)\n      kosaricaZanesljivaRef.current = false\n      if (newTable) {\n        const existing = await pos.orders.getOpenOnTable(newTable.id)\n        if (existing && existing.order_lines) {'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #5',
     '        } else {\n          setCart([])\n        }\n      } else {\n        setCart([])\n      }',
     '        } else {\n          setCart([])\n        }\n        // PRELET 315: bazo za novo mizo smo pravkar prebrali na tej napravi.\n        kosaricaZanesljivaRef.current = true\n      } else {\n        setCart([])\n      }'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #6',
     '    }\n    setTableSwitching(false)\n  }\n  const [happyHourActive, setHappyHourActive] = useState(false)\n  const [paymentOpen, setPaymentOpen] = useState(false)\n  const [modifierPickModal, setModifierPickModal] = useState<any>(null)',
     "    }\n    setTableSwitching(false)\n  }\n\n  /**\n   * Samodejno shranjevanje košarice ~900 ms po zadnji spremembi, dokler je\n   * miza aktivna (PRELET 315) - glej obsežen komentar ob\n   * `kosaricaZanesljivaRef` zgoraj. Med samim preklopom mize se učinek NE\n   * sproži (`tableSwitching`), ker `switchToTable` takrat že sam poskrbi\n   * za shranjevanje prejšnje mize in zgoraj počisti morebiten čakajoč\n   * časovnik - brez tega bi lahko podvojeno/zastarelo shranjevanje\n   * poteklo sredi preklopa.\n   */\n  useEffect(() => {\n    if (!activeTable || tableSwitching) return\n    if (shranjevanjeTimerRef.current) clearTimeout(shranjevanjeTimerRef.current)\n    shranjevanjeTimerRef.current = setTimeout(() => {\n      shranjevanjeTimerRef.current = null\n      shraniKosarico(activeTable, cart, kosaricaZanesljivaRef.current).catch((e) => {\n        console.error('Samodejno shranjevanje kosarice ni uspelo:', e)\n      })\n    }, 900)\n    return () => {\n      if (shranjevanjeTimerRef.current) { clearTimeout(shranjevanjeTimerRef.current); shranjevanjeTimerRef.current = null }\n    }\n  }, [cart, activeTable, tableSwitching])\n  const [happyHourActive, setHappyHourActive] = useState(false)\n  const [paymentOpen, setPaymentOpen] = useState(false)\n  const [modifierPickModal, setModifierPickModal] = useState<any>(null)"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #7',
     "                      // KLJUCNO: nastavi activeTable na mizo tega narocila, sicer open_order()\n                      // ne najde obstojecega 'open' narocila in ustvari podvojeno narocilo pri placilu\n                      setActiveTable(o.table_id ? { id: o.table_id, name: o.tables?.name || label } : null)\n                      const updated = await pos.orders.getHeldOrders()\n                      setHeldOrders(updated)\n                      setHeldOrdersOpen(false)",
     "                      // KLJUCNO: nastavi activeTable na mizo tega narocila, sicer open_order()\n                      // ne najde obstojecega 'open' narocila in ustvari podvojeno narocilo pri placilu\n                      setActiveTable(o.table_id ? { id: o.table_id, name: o.tables?.name || label } : null)\n                      // PRELET 315: `newCart` je pravkar prebran neposredno iz vrstic tega\n                      // narocila - zanesljivo zrcali bazo za to mizo.\n                      kosaricaZanesljivaRef.current = true\n                      const updated = await pos.orders.getHeldOrders()\n                      setHeldOrders(updated)\n                      setHeldOrdersOpen(false)"),
    ('apps/web/lib/pos-client.ts',
     'apps/web/lib/pos-client.ts: sprememba #1',
     '\n      return { productIncome: productNet, serviceIncome: serviceNet }\n    },\n    async closeOrderEmpty(orderId: string) {\n      // Izbriše prazno naročilo (brez vrstic) - uporabljeno ko uporabnik zapusti mizo brez artiklov\n      //\n      // VAROVALKA (prelet 165): preverimo, da je narocilo RES prazno.',
     '\n      return { productIncome: productNet, serviceIncome: serviceNet }\n    },\n    async closeOrderEmpty(orderId: string, opts?: { prepricanoPrazno?: boolean }) {\n      // Izbriše prazno naročilo (brez vrstic) - uporabljeno ko uporabnik zapusti mizo brez artiklov\n      //\n      // VAROVALKA (prelet 165): preverimo, da je narocilo RES prazno.'),
    ('apps/web/lib/pos-client.ts',
     'apps/web/lib/pos-client.ts: sprememba #2',
     '      // prosto - sicer miza obvelja za prosto, artikli pa ostanejo v bazi\n      // (natanko to je povzrocilo napako "artikli na mizi kljub temu, da\n      // ni oznacena kot zasedena").\n      const { data: vrstice } = await sb().from(\'order_lines\').select(\'id\').eq(\'order_id\', orderId).limit(1)\n      if (vrstice && vrstice.length > 0) {\n        console.warn(\'closeOrderEmpty: narocilo \' + orderId + \' ni prazno - brisanje preklicano\')\n        return false\n      }\n      const { error } = await sb().from(\'orders\').delete().eq(\'id\', orderId)\n      if (error) throw error',
     '      // prosto - sicer miza obvelja za prosto, artikli pa ostanejo v bazi\n      // (natanko to je povzrocilo napako "artikli na mizi kljub temu, da\n      // ni oznacena kot zasedena").\n      //\n      // `opts.prepricanoPrazno` (prelet 315): obide zgornje preverjanje\n      // baze. Uporabi SAMO klicatelj, ki je pravkar sam - na tej isti\n      // napravi - nalozil narocilo iz baze in ga od takrat samo se\n      // uredjal (glej `shraniKosarico` v pos/page.tsx). Brez tega je\n      // vsak izbris ZADNJEGA artikla z mize spodletel: baza je do tega\n      // klica se vedno kazala "stari" artikel (saj ga ta klic sele\n      // pravkar zbrise), varovalka zgoraj pa je zato VEDNO zavrnila\n      // brisanje - miza je ostala "zasedena" z artiklom, ki ga ni bilo\n      // vec mogoce odstraniti. To je bila prijavljena napaka.\n      if (!opts?.prepricanoPrazno) {\n        const { data: vrstice } = await sb().from(\'order_lines\').select(\'id\').eq(\'order_id\', orderId).limit(1)\n        if (vrstice && vrstice.length > 0) {\n          console.warn(\'closeOrderEmpty: narocilo \' + orderId + \' ni prazno - brisanje preklicano\')\n          return false\n        }\n      }\n      const { error } = await sb().from(\'orders\').delete().eq(\'id\', orderId)\n      if (error) throw error'),

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
        print(f"PRELET 315 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet315.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
