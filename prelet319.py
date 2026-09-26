#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 319 — Stran Nastavitve > Naročnina strankam v brezplačnem preizkusu
(trial) sploh ni pokazala LETNE cene niti gumba za plačilo.

DIAGNOZA: `organizations.subscription_status` se postavi na 'pro' ali
'pro_pos' TAKOJ ob zacetku brezplacnega preizkusa - se preden je karkoli
placano (`stripe_subscription_id` ostane prazen do dejanskega placila). Na
strani /nastavitve pa so bili gumbi za nadgradnjo/placilo (in s tem tudi
prikaz letne cene) skriti takoj, ko je `subscription_status` ze 'pro' ali
'pro_pos' - koda je torej trial stranko obravnavala enako kot stranko, ki
je paket ze v celoti placala, in ji ni pokazala NOBENEGA nacina, da bi
dejansko placala (ne mesecno, ne letno). Ista logika je podvojena tudi
znotraj komponente `UpgradeButton` same (njen zgodnji `return null`), zato
je bilo treba popraviti oboje.

POPRAVEK: nov izracun `jeDejanskoPlacano = !!org?.stripe_subscription_id`
loci "ima placan plan" od "samo preizkusa plan". Gumbi (mesecno IN letno) se
zdaj prikazejo tudi, ce stranka `subscription_status` ze ima, dokler ni
dejansko placala. `UpgradeButton` dobi nov opcijski prop `jePlacano`
(privzeto `true`, da se obnasanje za noben drug klicatelj ne spremeni), ki
enako popravi njegov notranji "ze ima ta plan" izhod.

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po teh spremembah vrne
0 napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napacen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet319.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet319.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/nastavitve/page.tsx',
     'apps/web/app/nastavitve/page.tsx: sprememba #1',
     '\n  const isPro = org?.subscription_status === \'pro\' || org?.subscription_status === \'pro_pos\'\n  const isProPos = org?.subscription_status === \'pro_pos\'\n  const inp = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"\n\n  return (',
     '\n  const isPro = org?.subscription_status === \'pro\' || org?.subscription_status === \'pro_pos\'\n  const isProPos = org?.subscription_status === \'pro_pos\'\n  /**\n   * PRELET 319: `subscription_status` se na \'pro\'/\'pro_pos\' postavi TUDI ob\n   * zacetku brezplacnega preizkusa (trial), se preden je karkoli placano -\n   * `stripe_subscription_id` pa ostane prazen, dokler stranka dejansko ne\n   * placa. Spodaj so gumbi za nadgradnjo/placilo prej skriti takoj, ko je\n   * `isPro`/`isProPos` resnicen - kar je stranko v preizkusni dobi (brez\n   * placila) popolnoma odrezalo od kakrsnegakoli nacina, da bi dejansko\n   * placala: stran ji ni pokazala niti mesecne niti letne cene z gumbom.\n   * `jeDejanskoPlacano` loci "ima placan plan" od "samo preizkusa plan".\n   */\n  const jeDejanskoPlacano = !!org?.stripe_subscription_id\n  const inp = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"\n\n  return ('),
    ('apps/web/app/nastavitve/page.tsx',
     'apps/web/app/nastavitve/page.tsx: sprememba #2',
     '                    <span style={{ color: \'#16a34a\' }}>✓</span> {f}\n                  </div>\n                ))}\n                {!isPro && (\n                  <div style={{ marginTop: 16 }}>\n                    {/* PRELET 213: mesecno in letno. Letno je oznaceno s\n                        prihrankom, ker sicer nihce ne racuna sam. */}\n                    <div style={{ display:\'flex\', flexDirection:\'column\', gap:8 }}>\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro" period="monthly" />\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro" period="yearly" variant="inline" />\n                      {(org?.subscription_status || \'free\') === \'free\' && (\n                        <p style={{ fontSize:11, color:\'#888\', margin:0 }}>Letno = 2 meseca brezplačno (prihranite 25,98 €).</p>\n                      )}',
     '                    <span style={{ color: \'#16a34a\' }}>✓</span> {f}\n                  </div>\n                ))}\n                {(!isPro || !jeDejanskoPlacano) && (\n                  <div style={{ marginTop: 16 }}>\n                    {/* PRELET 213: mesecno in letno. Letno je oznaceno s\n                        prihrankom, ker sicer nihce ne racuna sam.\n                        PRELET 319: pogoj razsirjen z `!jeDejanskoPlacano`, da\n                        gumbe (in s tem letno ceno) vidi tudi stranka, ki je\n                        samo v preizkusni dobi. */}\n                    <div style={{ display:\'flex\', flexDirection:\'column\', gap:8 }}>\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro" period="monthly" jePlacano={jeDejanskoPlacano} />\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro" period="yearly" variant="inline" jePlacano={jeDejanskoPlacano} />\n                      {(org?.subscription_status || \'free\') === \'free\' && (\n                        <p style={{ fontSize:11, color:\'#888\', margin:0 }}>Letno = 2 meseca brezplačno (prihranite 25,98 €).</p>\n                      )}'),
    ('apps/web/app/nastavitve/page.tsx',
     'apps/web/app/nastavitve/page.tsx: sprememba #3',
     '                    <span style={{ color: \'#16a34a\' }}>✓</span> {f}\n                  </div>\n                ))}\n                {!isProPos && (\n                  <div style={{ marginTop: 16 }}>\n                    <div style={{ display:\'flex\', flexDirection:\'column\', gap:8 }}>\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro_pos" period="monthly" />\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro_pos" period="yearly" variant="inline" />\n                      {(org?.subscription_status || \'free\') !== \'pro_pos\' && (\n                        <p style={{ fontSize:11, color:\'#888\', margin:0 }}>Letno = 2 meseca brezplačno (prihranite 59,98 €).</p>\n                      )}',
     '                    <span style={{ color: \'#16a34a\' }}>✓</span> {f}\n                  </div>\n                ))}\n                {(!isProPos || !jeDejanskoPlacano) && (\n                  <div style={{ marginTop: 16 }}>\n                    {/* PRELET 319: pogoj razsirjen z `!jeDejanskoPlacano`, da\n                        stranka v preizkusu Pro+POS vidi tako mesecno kot\n                        letno ceno in gumb, s katerim preizkus dejansko\n                        spremeni v placano narocnino. */}\n                    <div style={{ display:\'flex\', flexDirection:\'column\', gap:8 }}>\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro_pos" period="monthly" jePlacano={jeDejanskoPlacano} />\n                      <UpgradeButton subscriptionStatus={org?.subscription_status || \'free\'} targetPlan="pro_pos" period="yearly" variant="inline" jePlacano={jeDejanskoPlacano} />\n                      {(org?.subscription_status || \'free\') !== \'pro_pos\' && (\n                        <p style={{ fontSize:11, color:\'#888\', margin:0 }}>Letno = 2 meseca brezplačno (prihranite 59,98 €).</p>\n                      )}'),
    ('apps/web/components/UpgradeButton.tsx',
     'apps/web/components/UpgradeButton.tsx: sprememba #1',
     "  variant?: 'primary' | 'inline'\n  /** PRELET 213: mesecno ali letno. Privzeto mesecno. */\n  period?: 'monthly' | 'yearly'\n}\n\n/**",
     '  variant?: \'primary\' | \'inline\'\n  /** PRELET 213: mesecno ali letno. Privzeto mesecno. */\n  period?: \'monthly\' | \'yearly\'\n  /**\n   * PRELET 319: `subscriptionStatus` je \'pro\'/\'pro_pos\' TUDI med brezplacnim\n   * preizkusom (trial), se preden je karkoli placano. Spodnji "ze ima ta\n   * plan" izhod je zato prej gumb skril tudi stranki, ki je samo v\n   * preizkusu in bi rada dejansko placala - stran ji ni ponudila NOBENEGA\n   * nacina za placilo, ne mesecnega ne letnega. Privzeto `true`, da se\n   * obnasanje za vse dosedanje klicatelje ne spremeni; klicatelj, ki pozna\n   * dejansko stanje placila (npr. `!!org?.stripe_subscription_id`), posreduje\n   * `false` za trial stranko, da gumb ostane viden.\n   */\n  jePlacano?: boolean\n}\n\n/**'),
    ('apps/web/components/UpgradeButton.tsx',
     'apps/web/components/UpgradeButton.tsx: sprememba #2',
     "  className = '',\n  variant = 'primary',\n  period = 'monthly',\n}: UpgradeButtonProps) {\n  const [loading, setLoading] = useState(false)\n  const [error, setError] = useState<string | null>(null)",
     "  className = '',\n  variant = 'primary',\n  period = 'monthly',\n  jePlacano = true,\n}: UpgradeButtonProps) {\n  const [loading, setLoading] = useState(false)\n  const [error, setError] = useState<string | null>(null)"),
    ('apps/web/components/UpgradeButton.tsx',
     'apps/web/components/UpgradeButton.tsx: sprememba #3',
     "    }\n  }\n\n  // Že ima ta plan ali višji\n  if (subscriptionStatus === 'pro_pos') return null\n  if (subscriptionStatus === 'pro' && targetPlan === 'pro') return null\n\n  // PRELET 213: cena se bere iz CENE, ne iz zapisanega besedila.\n  const cena = CENE[targetPlan][period]",
     "    }\n  }\n\n  // Že ima ta plan ali višji - a samo, ce ga je dejansko placala (prelet 319)\n  if (subscriptionStatus === 'pro_pos' && jePlacano) return null\n  if (subscriptionStatus === 'pro' && targetPlan === 'pro' && jePlacano) return null\n\n  // PRELET 213: cena se bere iz CENE, ne iz zapisanega besedila.\n  const cena = CENE[targetPlan][period]"),

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
        print(f"PRELET 319 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet319.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
