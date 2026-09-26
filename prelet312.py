#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 312 — Mobilni popravek okna "Pomoč" / klepeta "Vprašaj Računko"
(apps/web/components/PageHelp.tsx): vnosno polje klepeta je bilo na mobilnih
napravah (predvsem iOS Safari) POD dejansko vidnim delom zaslona - uporabnik
je moral stran premakniti/scrollati, da je sploh prisel do vnosnega polja.

VZROK: okno pomoci je "position:fixed", pritrjeno na dno zaslona
(alignItems:'flex-end'), z visino "maxHeight: 80vh". Enota "vh" na mobilnih
brskalnikih meri NAJVECJI mozni izgled zaslona (kot da je naslovna vrstica
brskalnika ze skrita), ne dejansko vidno visino v tistem trenutku. Ko je
naslovna vrstica se vidna (privzeto stanje ob odprtju), je okno zato v
resnici visje kot dejansko vidno obmocje - spodnji del (vnosno polje) je bil
potisnjen POD spodnji rob vidnega zaslona.

POPRAVEK: nova CSS enota "dvh" (dynamic viewport height) se samodejno
prilagaja dejansko vidnemu delu zaslona (upostevajoc naslovno vrstico
brskalnika). Dodana je KOT DRUGA vrstica za "vh" - brskalniki, ki "dvh" se ne
poznajo, jo preprosto prezrejo (neveljavna vrednost), tako da "vh" ostane
varnostna mreza. Dodatno je za ozke zaslone (<=480px) rahlo povecan
maksimalni delez zaslona (88% namesto 80%), zmanjsan zunanji odmik in
zmanjsana minimalna visina podrocja s sporocili, da ostane vec prostora za
vnosno polje.

Tri vrednosti (max-height okna, padding ozadja, min-height podrocja s
sporocili), ki jih mora mobilna medijska poizvedba prevoziti, so bile
prestavljene iz inline React "style" objektov v CSS razrede - inline slog v
Reactu vedno prekrije CSS pravilo, ne glede na njegovo specificnost, zato
mobilna medijska poizvedba prej sploh ni imela ucinka.

Uporaba:
    python3 prelet312.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet312.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/components/PageHelp.tsx',
     'apps/web/components/PageHelp.tsx: sprememba #1',
     '        }\n        /* PRELET 309: "tipka" animacija med cakanjem na odgovor klepeta */\n        @keyframes pageHelpBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }\n      `}</style>\n      {/* POPRAVLJENO (prelet 237): PLAVAJOCI GUMB JE ODSTRANJEN.\n          Bil je pritrjen cez vsebino in so ga ze dvakrat premikali, ker je',
     '        }\n        /* PRELET 309: "tipka" animacija med cakanjem na odgovor klepeta */\n        @keyframes pageHelpBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }\n\n        /* PRELET 312: na mobilnih brskalnikih (predvsem iOS Safari) enota\n           "vh" meri NAJVECJI mozni izgled zaslona (kot da je naslovna\n           vrstica brskalnika skrita), ne dejansko vidno visino. Ker je\n           okno pomoci "position:fixed" in prisidno na dno (alignItems:\n           flex-end), je bil spodnji del okna (vnosno polje klepeta) zato\n           pogosto POD dejansko vidnim delom zaslona - uporabnik je moral\n           premakniti/scrollati stran, da je naslovna vrstica izginila in\n           se je vnosno polje sploh prikazalo.\n           POPRAVEK: "dvh" (dynamic viewport height) se samodejno prilagaja\n           dejansko vidnemu delu zaslona. Vrstica z "vh" ostane kot varnostna\n           mreza za stare brskalnike, ki "dvh" se ne poznajo - ti neveljavno\n           vrstico preprosto prezrejo in obveljala je "vh" vrednost nad njo. */\n        .pagehelp-modalica {\n          max-height: 80vh;\n          max-height: 80dvh;\n        }\n        /* PRELET 312: enako kot pri "pagehelp-msgs" spodaj - padding je tu\n           namesto kot inline slog, da ga mobilna medijska poizvedba lahko\n           prevozi (inline slog bi jo sicer vedno prekril). */\n        .pagehelp-overlay { padding: 24px; }\n        /* PRELET 312: min-height je tu (ne kot inline slog na elementu),\n           ker mora mobilna medijska poizvedba spodaj lahko prevozi to\n           vrednost - inline slog bi jo vedno prekril, ne glede na\n           specificnost CSS pravila. */\n        .pagehelp-msgs { min-height: 220px; }\n        @media (max-width: 480px) {\n          .pagehelp-overlay { padding: 12px; }\n          .pagehelp-modalica { max-height: 88vh; max-height: 88dvh; }\n          .pagehelp-msgs { min-height: 140px; }\n        }\n      `}</style>\n      {/* POPRAVLJENO (prelet 237): PLAVAJOCI GUMB JE ODSTRANJEN.\n          Bil je pritrjen cez vsebino in so ga ze dvakrat premikali, ker je'),
    ('apps/web/components/PageHelp.tsx',
     'apps/web/components/PageHelp.tsx: sprememba #2',
     "      {/* Modal overlay */}\n      {open && (\n        <div\n          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}\n          style={{\n            position: 'fixed', inset: 0,\n            background: 'rgba(0,0,0,0.45)',\n            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',\n            padding: 24, zIndex: 2000,\n          }}\n        >\n          <div style={{\n            background: '#fff',\n            borderRadius: 16,\n            width: '100%',\n            // PRELET 309: zavihek klepeta je nekoliko sirsi od staticnih navodil.\n            maxWidth: tab === 'klepet' ? 480 : 420,\n            maxHeight: '80vh',\n            display: 'flex',\n            flexDirection: 'column',\n            overflow: 'hidden',",
     '      {/* Modal overlay */}\n      {open && (\n        <div\n          className="pagehelp-overlay"\n          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}\n          style={{\n            position: \'fixed\', inset: 0,\n            background: \'rgba(0,0,0,0.45)\',\n            display: \'flex\', alignItems: \'flex-end\', justifyContent: \'flex-start\',\n            zIndex: 2000,\n          }}\n        >\n          <div className="pagehelp-modalica" style={{\n            background: \'#fff\',\n            borderRadius: 16,\n            width: \'100%\',\n            // PRELET 309: zavihek klepeta je nekoliko sirsi od staticnih navodil.\n            maxWidth: tab === \'klepet\' ? 480 : 420,\n            // PRELET 312: maxHeight (80vh/80dvh) je zdaj v razredu\n            // "pagehelp-modalica" zgoraj - glej opombo ob @media pravilih.\n            display: \'flex\',\n            flexDirection: \'column\',\n            overflow: \'hidden\','),
    ('apps/web/components/PageHelp.tsx',
     'apps/web/components/PageHelp.tsx: sprememba #3',
     "            ) : (\n              <>\n                {/* Sporočila klepeta */}\n                <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px', minHeight: 220 }}>\n                  {chatMessages.map((msg, i) => (\n                    <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>\n                      <div style={{",
     '            ) : (\n              <>\n                {/* Sporočila klepeta */}\n                <div className="pagehelp-msgs" style={{ flex: 1, overflowY: \'auto\', padding: \'0 28px\' }}>\n                  {chatMessages.map((msg, i) => (\n                    <div key={i} style={{ marginBottom: 12, display: \'flex\', justifyContent: msg.role === \'user\' ? \'flex-end\' : \'flex-start\' }}>\n                      <div style={{'),

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
        print(f"PRELET 312 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet312.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
