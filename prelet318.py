#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 318 — Dve pritozbi stranke: (1) gumb "Nadgradi zdaj" na nadzorni
plosci ni delal, (2) stran Nastavitve zahteva prevec scrollanja.

────────────────────────────────────────────────────────────────────────
1) GUMB "Nadgradi zdaj" (dashboard, trial baner)
────────────────────────────────────────────────────────────────────────
DIAGNOZA (preverjeno v Vercel runtime error logih projekta "racunko"):
stranka "Zdravstvene in druge storitve, Domen Erzen s.p." je v preizkusni
dobi paketa Pro+POS (organizations.subscription_status='pro_pos',
stripe_subscription_id=NULL, trial_ends_at v prihodnosti). Ko je klik-nila
"Nadgradi zdaj", je /api/stripe/checkout poklical Stripe z napacnim
price ID (okoljska spremenljivka v Verclu kaze na CENO, KI V STRIPU NE
OBSTAJA VEC - "No such price: price_1TclZ7CpU8ARXbU0pDLdF2Sf", zabelezeno
7x od 26.8.2026 do tocno ob casu stranicine pritozbe, 24.9.2026 19:30 UTC).

TA PRELET NE POPRAVI SAME OKOLJSKE SPREMENLJIVKE V VERCLU - to zahteva
pravi, trenutno veljaven Stripe price ID iz Stripe nadzorne plosce (Products
-> Pro + POS -> mesecna cena -> API ID), ki ga lahko vpise samo lastnik
Stripe racuna. KAR TA PRELET POPRAVI, je dejanski programski hrosc: ko je
/api/stripe/checkout vrnil napako, jo je `handleTrialUpgrade` TIHO pogoltnil
- gumb se je za trenutek spremenil v "Preusmerjam...", nato pa se je brez
sledu vrnil v "Nadgradi zdaj", stranka pa ni izvedela, zakaj nic ni naredil.
Zdaj se sporocilo napake (tisto, ki ga API dejansko vrne) izpise pod gumbom,
tako da bo naslednjic - ali ce se karkoli podobnega spet zgodi - stranka
takoj videla, kaj je narobe, namesto tihega nedelovanja.

────────────────────────────────────────────────────────────────────────
2) Stran Nastavitve - prevec scrollanja
────────────────────────────────────────────────────────────────────────
Mreza 12 kartic (Profil podjetja, DDV & prispevki, ... Prenosi) na vrhu
strani je bila prevelika - preden je uporabnik sploh prisel do vsebine
spodaj, je moral scrollati mimo cele mreze. Uporabnik je izrecno zahteval,
da IKONE OSTANEJO (ne zeli jih odstranjenih) - zato je resitev manjsa
kartica: manjsa ikona (24px -> 18px), tanjsi odmiki (14px/10px -> 9px/7px),
gostejsa mreza (min. sirina kartice 110px -> 90px, torej vec stolpcev na
isto sirino zaslona), opis pod napisom pa je zdaj omejen na ENO vrstico
(prej se je pogosto prelomil v dve, kar je bil glavni razlog za visino
kartice) z "..." ob koncu, ce ne gre. Ikone in napisi ostanejo v celoti.

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po teh spremembah vrne
0 napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napacen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet318.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet318.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #1',
     '  // DODANO (19.9.2026): odstevalnik do izteka brezplacnega preizkusa (glej\n  // trialInfo spodaj) - locena state samo za "Nadgradi zdaj" gumb v banerju.\n  const [trialUpgrading, setTrialUpgrading] = useState(false)\n  const [pendingRecurringCount, setPendingRecurringCount] = useState(0)\n  const [userId, setUserId] = useState<string | null>(null)\n  const [userEmail, setUserEmail] = useState<string>(\'\')',
     '  // DODANO (19.9.2026): odstevalnik do izteka brezplacnega preizkusa (glej\n  // trialInfo spodaj) - locena state samo za "Nadgradi zdaj" gumb v banerju.\n  const [trialUpgrading, setTrialUpgrading] = useState(false)\n  /**\n   * PRELET 318: ce /api/stripe/checkout vrne napako (npr. neveljaven Stripe\n   * price ID), se je gumb prej tiho vrnil v prvotno stanje - uporabnik je\n   * videl samo kratek utrip "Preusmerjam..." in nato spet "Nadgradi zdaj",\n   * brez kakrsnegakoli pojasnila, zakaj nic ni naredilo. Ta niz drzi sporocilo\n   * napake, da ga lahko pokazemo neposredno pod gumbom.\n   */\n  const [trialUpgradeError, setTrialUpgradeError] = useState<string | null>(null)\n  const [pendingRecurringCount, setPendingRecurringCount] = useState(0)\n  const [userId, setUserId] = useState<string | null>(null)\n  const [userEmail, setUserEmail] = useState<string>(\'\')'),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #2',
     "\n  async function handleTrialUpgrade() {\n    setTrialUpgrading(true)\n    try {\n      const res = await fetch('/api/stripe/checkout', {\n        method: 'POST',",
     "\n  async function handleTrialUpgrade() {\n    setTrialUpgrading(true)\n    setTrialUpgradeError(null)\n    try {\n      const res = await fetch('/api/stripe/checkout', {\n        method: 'POST',"),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #3',
     '      })\n      const data = await res.json()\n      if (data.url) { window.location.href = data.url; return }\n      setTrialUpgrading(false)\n    } catch {\n      setTrialUpgrading(false)\n    }\n  }',
     "      })\n      const data = await res.json()\n      if (data.url) { window.location.href = data.url; return }\n      // PRELET 318: prej je tu ostalo samo `setTrialUpgrading(false)` - ce\n      // API ni vrnil `url` (npr. napaka pri Stripu), je gumb obmiroval brez\n      // sledu, zakaj. Zdaj pokazemo sporocilo, ki ga je API poslal nazaj.\n      setTrialUpgradeError(data.error || 'Plačila trenutno ni bilo mogoče začeti. Poskusite znova ali nas kontaktirajte na support@računko.si.')\n      setTrialUpgrading(false)\n    } catch {\n      setTrialUpgradeError('Napaka pri povezavi. Poskusite znova ali nas kontaktirajte na support@računko.si.')\n      setTrialUpgrading(false)\n    }\n  }"),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #4',
     '            <button className="rk-trial-cta" onClick={handleTrialUpgrade} disabled={trialUpgrading}>\n              {trialUpgrading ? \'Preusmerjam…\' : \'Nadgradi zdaj\'}\n            </button>\n          </div>\n        )}\n',
     '            <button className="rk-trial-cta" onClick={handleTrialUpgrade} disabled={trialUpgrading}>\n              {trialUpgrading ? \'Preusmerjam…\' : \'Nadgradi zdaj\'}\n            </button>\n            {trialUpgradeError && <span className="rk-trial-error">⚠️ {trialUpgradeError}</span>}\n          </div>\n        )}\n'),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #5',
     '  .rk-trial-cta { background: #0d2818; color: #f6f1e8; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }\n  .rk-trial-cta:hover { background: #163a24; }\n  .rk-trial-cta:disabled { opacity: 0.6; cursor: default; }\n  .rk-onboard { background: #fff; border: 1px solid var(--rule); border-radius: 18px; padding: 22px 26px; margin-bottom: 18px; position: relative; }\n  .rk-shell[data-theme="dark"] .rk-onboard { background: var(--panel); }\n  .rk-onboard-close { position: absolute; top: 16px; right: 16px; background: none; border: 0; color: var(--ink3); cursor: pointer; padding: 6px; border-radius: 6px; }',
     '  .rk-trial-cta { background: #0d2818; color: #f6f1e8; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }\n  .rk-trial-cta:hover { background: #163a24; }\n  .rk-trial-cta:disabled { opacity: 0.6; cursor: default; }\n  .rk-trial-error { flex-basis: 100%; font-size: 12px; color: #b3261e; }\n  .rk-shell[data-theme="dark"] .rk-trial-error { color: #f2b8b5; }\n  .rk-onboard { background: #fff; border: 1px solid var(--rule); border-radius: 18px; padding: 22px 26px; margin-bottom: 18px; position: relative; }\n  .rk-shell[data-theme="dark"] .rk-onboard { background: var(--panel); }\n  .rk-onboard-close { position: absolute; top: 16px; right: 16px; background: none; border: 0; color: var(--ink3); cursor: pointer; padding: 6px; border-radius: 6px; }'),
    ('apps/web/app/nastavitve/page.tsx',
     'apps/web/app/nastavitve/page.tsx: sprememba #1',
     "          </div>\n        )}\n\n        {/* Hub kartic */}\n        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 28 }}>\n          {SECTIONS.map(s => (\n            <button key={s.id} onClick={() => (s as any).href ? router.push((s as any).href) : setActiveSection(s.id)}\n              style={{\n                background: activeSection === s.id ? '#0D1F12' : '#fff',\n                color: activeSection === s.id ? '#fff' : '#333',\n                border: `1.5px solid ${activeSection === s.id ? '#0D1F12' : '#e5e7eb'}`,\n                borderRadius: 14, padding: '14px 10px', cursor: 'pointer',\n                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,\n                transition: 'all 0.15s', fontFamily: 'inherit',\n              }}>\n              <span style={{ fontSize: 24 }}>{s.icon}</span>\n              <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>\n                {s.label}\n                {/* Pušcica pove, da kartica odpre SVOJO stran, ne razdelka tu. */}\n                {(s as any).href && <span style={{ opacity: 0.5, marginLeft: 3 }}>↗</span>}\n              </span>\n              <span style={{ fontSize: 10, opacity: 0.6, textAlign: 'center', lineHeight: 1.3 }}>{s.desc}</span>\n            </button>\n          ))}\n        </div>",
     '          </div>\n        )}\n\n        {/* Hub kartic\n            PRELET 318: kartice so bile prevelike - preden je uporabnik sploh\n            prisel do vsebine spodaj (npr. "Profil podjetja"), je moral\n            scrollati mimo cele mreze ikon. Ikone in napisi OSTANEJO (stranka\n            jih izrecno noce odstranjenih) - namesto tega je vsaka kartica\n            manjsa: manjsa ikona, tanjse odmiki, gostejsa mreza (vec stolpcev\n            na isto sirino), opis pa je omejen na ENO vrstico namesto dveh, kar\n            je bil glavni razlog za visino kartic. */}\n        <div style={{ display: \'grid\', gridTemplateColumns: \'repeat(auto-fill, minmax(90px, 1fr))\', gap: 8, marginBottom: 18 }}>\n          {SECTIONS.map(s => (\n            <button key={s.id} onClick={() => (s as any).href ? router.push((s as any).href) : setActiveSection(s.id)}\n              style={{\n                background: activeSection === s.id ? \'#0D1F12\' : \'#fff\',\n                color: activeSection === s.id ? \'#fff\' : \'#333\',\n                border: `1.5px solid ${activeSection === s.id ? \'#0D1F12\' : \'#e5e7eb\'}`,\n                borderRadius: 12, padding: \'9px 7px\', cursor: \'pointer\',\n                display: \'flex\', flexDirection: \'column\', alignItems: \'center\', gap: 3,\n                transition: \'all 0.15s\', fontFamily: \'inherit\',\n              }}>\n              <span style={{ fontSize: 18 }}>{s.icon}</span>\n              <span style={{ fontSize: 10, fontWeight: 700, textAlign: \'center\', lineHeight: 1.25 }}>\n                {s.label}\n                {/* Pušcica pove, da kartica odpre SVOJO stran, ne razdelka tu. */}\n                {(s as any).href && <span style={{ opacity: 0.5, marginLeft: 3 }}>↗</span>}\n              </span>\n              <span style={{\n                fontSize: 9, opacity: 0.6, textAlign: \'center\', lineHeight: 1.25,\n                maxWidth: \'100%\', whiteSpace: \'nowrap\', overflow: \'hidden\', textOverflow: \'ellipsis\',\n              }}>{s.desc}</span>\n            </button>\n          ))}\n        </div>'),

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
        print(f"PRELET 318 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet318.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
