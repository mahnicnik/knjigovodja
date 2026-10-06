---
modul: _index
naslov: Kazalo baze znanja Računko asistenta
posodobljeno: 2026-10-06
---

# Računko – baza znanja asistenta

Računko je slovenska aplikacija za s.p. in manjša podjetja: **portal** (računi, stroški, KPO, DDV, davki, plače, izvoz za računovodjo) in **POS davčna blagajna** (prodaja, mize, paketi in članarine, zaloga z normativi, koledar, Z-poročila) v enem programu. Deluje v brskalniku, kot namizna aplikacija za Windows in na Androidu.

## Splošno (velja povsod)

- **Paketi**: Free (do 5 računov skupaj, brez FURS, AI in e-pošte), **Pro** (12,99 €/mes – neomejeni računi, FURS, pošiljanje po e-pošti, AI skeniranje in AI branja PDF, AI računovodja, izvoz in dostop za računovodjo), **Pro + POS** (29,99 €/mes – plus POS blagajna, koledar, paketi, zaloga, blagajniki s PIN). Nov račun ima 14 dni preizkusa Pro + POS; po izteku Free, podatki ostanejo. Nadgradnja: Nastavitve → Naročnina (`portal-stripe.md`).
- **Nastavitve portala** odpreš s klikom na **ime podjetja spodaj v levem meniju**. **Nastavitve blagajne** so v blagajni: levi meni → **Nastavitve**. To sta različni mesti.
- **Vloge v portalu**: Lastnik, Admin, Blagajnik (samo POS), Gledalec, Računovodja. **Osebje blagajne** se prijavlja s PIN-om (Lastnik, Vodja, Blagajnik, Trener, Terapevt).
- **Meni** prikazuje samo module, izbrane ob registraciji; manjkajoč modul vklopiš z **Prilagodi meni**.
- Davčno potrjenega računa ni mogoče izbrisati – popravek je storno, vračilo ali dobropis.
- Asistent pomaga pri uporabi aplikacije. Za davčne nasvete je **AI računovodja** (Pro); za hrošče gumb **Pošlji podpori**.

## Moduli

| Dokument | Vsebina |
|---|---|
| pos-osnove.md | zagon blagajne, prostor in naprava, PIN, zaklepanje, meni zaslonov, odpri/vmesno stanje/zaključi, shranjena naročila |
| pos-artikli-ddv.md | kategorije, artikli, tipi artiklov, DDV stopnja artikla, oprostitve, modifikatorji, množične cene, uvoz cenika z AI, happy hour |
| pos-normativi-surovine.md | normativi (recepti), surovine, odštevanje zaloge, pogoste napake |
| pos-prodaja-placila.md | košarica, popusti, razdelitev računa, predračun, odpis/lastna poraba/reprezentanca, načini plačila, Stripe QR, račun na podjetje |
| pos-racuni-storno-vracila.md | zaslon Računi, ponovni izpis, sprememba plačila, storno, vračilo |
| pos-mize.md | prostori, mize, prenos, združevanje |
| pos-paketi-clanarine.md | vrste paketov, samodejna obnova, prodaja, obroki, zamrznitev, podaljšanje, predplačilo, unovčenje |
| pos-zakljucek-z-porocilo.md | zaključek izmene, Z-poročilo, vmesno stanje, poročila, dnevni zaključki |
| pos-zaloga-dobavnice-inventura.md | zaloga, uvoz dobavnic z AI, ujemanje artiklov in surovin, inventura |
| pos-koledar-storitve-kuhinja.md | storitve, koledar, stranke, kuhinja (KDS), obveščanje strank, opravila, interni akt |
| furs-fiskalizacija.md | certifikat, poslovni prostori, naprave, test/produkcija, nastavitve FURS na blagajni |
| ekipa-vloge-osebje.md | vabila v ekipo, vloge, osebje blagajne s PIN-om, dovoljenja |
| portal-racuni.md | izdani računi, nov račun, plačila, storno, dobropis, e-račun XML, uvoz iz PDF, zahtevki za plačilo |
| portal-predracuni-dobavnice-avansni-ponavljajoci.md | predračuni, dobavnice, avansni in ponavljajoči računi, e-račun 2028 |
| portal-stroski-banka-kartice.md | stroški, AI skeniranje, e-mail skeniranje (Gmail), bančni uvoz, kartični obračuni |
| portal-kpo-ddv-davki.md | KPO knjiga, DDV obračun, DDV-O, prispevki QR, dohodnina, normirani, letni pregled |
| portal-zaposleni.md | plače, plačilne liste, REK-1, dopust, potni stroški, regres, potni nalogi, evidenca časa |
| portal-evidence-porocila.md | poročila, statistika, kilometrina, zaloge v portalu, amortizacija, reprezentanca, službeni avto |
| izvoz-racunovodja.md | izvoz XLSX/CSV (Vasco, Pantheon), portal računovodje, povabilo računovodje |
| portal-stripe.md | Stripe na treh mestih: plačila s kartico, integracija (uvoz plačil), naročnina, paketi in preizkus |
| portal-nastavitve.md | razdelki nastavitev, profil in logotip, DDV & prispevki, 2FA, API ključi, prenosi |
| portal-pregled-ai.md | nadzorna plošča, vodič, rokovnik, opomniki, AI računovodja, pomoč, onboarding |

## Pogosta vprašanja

Ta seznam asistent prikaže kot hitre bližnjice (vrstni red je pomemben, prvih nekaj je vidnih).

- Kako dodam artikel z normativom (recept) na blagajni? | pos-normativi-surovine.md | pos
- Kako naredim Z-poročilo ob koncu dneva? | pos-zakljucek-z-porocilo.md | pos
- Kje nastavim DDV stopnjo za artikel? | pos-artikli-ddv.md | pos
- Kako vklopim samodejno podaljševanje paketa ali članarine? | pos-paketi-clanarine.md | pos
- Kako storniram račun na blagajni? | pos-racuni-storno-vracila.md | pos
- Kako razdelim račun med več oseb? | pos-prodaja-placila.md | pos
- Kje v portalu najdem nastavitve za Stripe? | portal-stripe.md | portal
- Kako izdam nov račun? | portal-racuni.md | portal
- Kako povežem FURS certifikat in poslovni prostor? | furs-fiskalizacija.md | portal
- Kako uvozim bančni izpisek? | portal-stroski-banka-kartice.md | portal
- Kako oddam DDV-O? | portal-kpo-ddv-davki.md | portal
- Kako povabim računovodjo? | izvoz-racunovodja.md | portal
- Kaj se zgodi, ko poteče brezplačni preizkus? | portal-stripe.md | vse
