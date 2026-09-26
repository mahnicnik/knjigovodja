#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 317 — Blagajna (POS): ukini nadležno "Nalagam cenik..." utripanje
po vsakem dodanem/spremenjenem artiklu na mizi.

KONTEKST: Prelet 315 je uvedel samodejno shranjevanje košarice ~900ms po
vsaki spremembi (da se artikli ne izgubijo, če uporabnik zapre zavihek ali
pade povezava). Del tega shranjevanja (`shraniKosarico`) je ob koncu klical
`posData.refresh()` - funkcijo, ki na novo prenese CEL cenik (kategorije,
artikli, mize, stranke, osebje, ipd. - okrog 10 ločenih poizvedb) in med
tem prenosom postavi `loading=true`, kar prikaže celozaslonski pokrov
"⏳ Nalagam cenik..." namesto košarice/izbirnika artiklov.

Ta `refresh()` klic v `shraniKosarico` je bil tam namenoma - a NE zaradi
cenika samega, temveč zato, da se barva mize na tlorisu (zasedena/prosta,
`posData.spaces`) takoj osveži, saj `pos.spaces.updateTableStatus()` pише
neposredno v bazo in sam od sebe ne posodobi React stanja. Pred Preletom
315 se je ta klic sprožil redko (ob menjavi mize), zato ni motil. Po
Preletu 315 se zdaj sproži po SKORAJ VSAKI spremembi košarice (dodan
artikel, spremenjena količina, ipd.), zato je postal moteč - blagajnik
vidi utripanje "Nalagam cenik..." med delom.

POPRAVEK: v `usePosData()` dodana nova, ožja funkcija `refreshSpaces()`,
ki osveži SAMO seznam miz/prostorov (`pos.spaces.list()`) - eno samo
poizvedbo - in NE postavlja `loading=true`, torej ne sproži celozaslonskega
pokrova. `shraniKosarico` zdaj namesto `posData.refresh()` kliče
`posData.refreshSpaces()`. Barva mize na tlorisu ostane sinhronizirana
natanko tako kot prej, cenik pa se ne prenaša znova in zaslon ne utripa.
Popoln `posData.refresh()` (cel cenik) ostane nedotaknjen in se še vedno
uporablja tam, kjer je dejansko potreben (npr. ob menjavi mize/zaslona).

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po tej spremembi vrne
0 napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napačen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet317.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet317.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     '\n  const refresh = useCallback(() => setReloadKey(k => k + 1), [])\n\n  /**\n   * OSVEŽITEV OB VRNITVI V OKNO (prelet 197)\n   * ════════════════════════════════════════',
     '\n  const refresh = useCallback(() => setReloadKey(k => k + 1), [])\n\n  /**\n   * OZKA OSVEŽITEV SAMO MIZ/PROSTOROV (prelet 317)\n   * ═══════════════════════════════════════════════\n   *\n   * `refresh()` zgoraj povleče CEL katalog (artikli, kategorije, stranke,\n   * osebje, paketi, storitve, dnevna statistika, surovine, obvestila,\n   * happy hour pravila, profil poslovanja - ~10 poizvedb) in med tem\n   * postavi `loading` na true, kar zamenja prodajni zaslon z "Nalagam\n   * cenik...". To je bilo v redu, dokler se je klicalo redko (ob preklopu\n   * mize). Odkar samodejno shranjevanje košarice (prelet 315) kliče\n   * shranjevanje po SKORAJ VSAKEM dodanem artiklu, bi enak poln refresh\n   * ob vsakem koraku za trenutek prekril celoten zaslon z nalagalnikom.\n   *\n   * Edini razlog, da shranjevanje košarice sploh kliče kak refresh, je\n   * OBARVATI MIZO na tlorisu glede na zasedenost - `updateTableStatus()`\n   * zapiše status samo v bazo, `posData.spaces` (od koder tloris bere\n   * barvo) pa se sam od sebe ne posodobi. Za to zadostuje osvežiti SAMO\n   * seznam prostorov/miz, brez cesarkoli drugega in brez `loading`.\n   */\n  const refreshSpaces = useCallback(async () => {\n    try {\n      const sps = await pos.spaces.list()\n      setSpaces(sps)\n    } catch (e) {\n      console.error(\'refreshSpaces napaka:\', e)\n    }\n  }, [])\n\n  /**\n   * OSVEŽITEV OB VRNITVI V OKNO (prelet 197)\n   * ════════════════════════════════════════'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #2',
     "    return [{ id: 'cat-fav', name: 'Priljubljeno', icon: '★', color: '#E9B949' }, ...categories]\n  }, [categories])\n\n  return { categories: categoriesWithFav, items, spaces, customers, staffList, packageTemplates, services, ingredients, notifications, setNotifications, todayStats, businessProfile, setBusinessProfile, customNav, happyHourRules, loading, itemsIn, refresh, bizNapaka, businessName, org, fursTestMode, potrebujePrvoNastavitev, setPotrebujePrvoNastavitev }\n}\n\n// ================================================================",
     "    return [{ id: 'cat-fav', name: 'Priljubljeno', icon: '★', color: '#E9B949' }, ...categories]\n  }, [categories])\n\n  return { categories: categoriesWithFav, items, spaces, customers, staffList, packageTemplates, services, ingredients, notifications, setNotifications, todayStats, businessProfile, setBusinessProfile, customNav, happyHourRules, loading, itemsIn, refresh, refreshSpaces, bizNapaka, businessName, org, fursTestMode, potrebujePrvoNastavitev, setPotrebujePrvoNastavitev }\n}\n\n// ================================================================"),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #3',
     '   *\n   * `zanesljivaPrazna`: glej `kosaricaZanesljivaRef` zgoraj - posreduje se\n   * naprej v `closeOrderEmpty`.\n   */\n  async function shraniKosarico(tabela, kosarica, zanesljivaPrazna) {\n    if (!tabela) return',
     '   *\n   * `zanesljivaPrazna`: glej `kosaricaZanesljivaRef` zgoraj - posreduje se\n   * naprej v `closeOrderEmpty`.\n   *\n   * PRELET 317: po shranjevanju osvežimo SAMO seznam miz/prostorov\n   * (`posData.refreshSpaces()`), ne celotnega kataloga (`posData.refresh()`)\n   * - edino, kar tu potrebujemo, je da se tloris takoj obarva glede na\n   * zasedenost. Poln refresh bi ob vsakem klicu (torej skoraj po vsakem\n   * dodanem artiklu) za trenutek prekril prodajni zaslon z "Nalagam\n   * cenik...".\n   */\n  async function shraniKosarico(tabela, kosarica, zanesljivaPrazna) {\n    if (!tabela) return'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #4',
     "        vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null,\n      })))\n      await pos.spaces.updateTableStatus(tabela.id, 'occupied')\n      posData.refresh()\n    } else if (existing) {\n      const izbrisano = await pos.orders.closeOrderEmpty(existing.id, { prepricanoPrazno: zanesljivaPrazna })\n      await pos.spaces.updateTableStatus(tabela.id, izbrisano ? 'free' : 'occupied')\n      posData.refresh()\n    }\n  }\n",
     "        vatRate: line.vat_rate ?? 22, mods: line.mods || [], note: line.note || null,\n      })))\n      await pos.spaces.updateTableStatus(tabela.id, 'occupied')\n      posData.refreshSpaces()\n    } else if (existing) {\n      const izbrisano = await pos.orders.closeOrderEmpty(existing.id, { prepricanoPrazno: zanesljivaPrazna })\n      await pos.spaces.updateTableStatus(tabela.id, izbrisano ? 'free' : 'occupied')\n      posData.refreshSpaces()\n    }\n  }\n"),

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
        print(f"PRELET 317 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet317.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
