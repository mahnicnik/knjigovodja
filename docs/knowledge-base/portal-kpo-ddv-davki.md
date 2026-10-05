---
modul: portal-kpo-ddv-davki
naslov: Portal – KPO knjiga, DDV obračun in DDV-O, prispevki (UPN QR), dohodnina, normirani, letni pregled
vloge: [lastnik, admin, računovodja]
poti: [/kpo, /ddv, /ddv/evidenca, /prispevki, /dohodnina, /normirani, /letni-pregled]
koda:
  - apps/web/app/kpo/page.tsx, apps/web/components/DdvDolgPloscica.tsx
  - apps/web/lib/ddv.ts (izracunajDdv – en sam izračun DDV za vse strani), apps/web/lib/ddv-o.ts (DDV-O XML)
  - apps/web/app/ddv/page.tsx, apps/web/app/ddv/evidenca/page.tsx
  - apps/web/app/prispevki/page.tsx, apps/web/app/dohodnina/page.tsx, apps/web/app/normirani/page.tsx, apps/web/app/letni-pregled/page.tsx
posodobljeno: 2026-10-05
---

# Portal – KPO, DDV in davki

## KPO knjiga – Poslovanje → KPO knjiga

Knjiga prihodkov in odhodkov se vodi **samodejno**: izdani računi, potrjeni stroški, promet blagajne (po dnevih), bančni uvoz in kartični obračuni – brez dvojnega štetja.

- Obdobje: **Teden, Mesec, Četrtletje, Leto, YTD, Interval** (izpiše se točen razpon datumov).
- Ploščice: **Prihodki** in **Odhodki** (brez DDV), **Dobiček**, **DDV dolg**.
- Ploščica **DDV dolg**: pod zneskom sta izhodni (+) in vhodni (−) DDV; klik na ploščico ali gumb **Podrobnosti DDV** odpre razčlenitev – izhodni DDV po virih (izdani računi, POS promet, ostali prihodki v KPO) in vhodni DDV (prejeti računi, KPO vnosi), vsak vir po stopnjah, z obdobjem. Negativen znesek pomeni vračilo DDV.
- Tabela vnosov z datumom, opisom, prihodkom, odhodkom in DDV.

## DDV obračun – Davki → DDV obračun

Samo za DDV zavezance (sicer »Niste DDV zavezanec« in prikaz prometa zadnjih 12 mesecev za prag registracije).

- **DDV izhod (od prodaj)**: izdani računi, blagajna (POS), knjiga (banka, kartice, drugo).
- **DDV vhod (od nakupov)**.
- Razlika = DDV za plačilo ali »FURS vam vrne«. Spodaj **plačilni podatki FURS** (IBAN, sklic, namen, znesek).

Vse strani (nadzorna plošča, DDV, evidenca, KPO, poročila, izvoz) uporabljajo **isti izračun** DDV, zato so številke enake.

## DDV-O evidenca in oddaja – Davki → DDV evidenca

1. Izberi obdobje (Q1–Q4 ali mesec, po shemi obračuna). Prikaže se razčlenitev po stopnjah (22 %, 9,5 %, 5 %, 0 %), B2B / B2C, nabave (P41/P42) in znesek za plačilo ali vračilo (P53).
2. **⬇ Prenesi DDV-O XML za eDavki** (ali CSV).
3. Na **edavki.durs.si** → Vloge → DDV → DDV-O obrazec → naloži XML (ali vnesi ročno).
4. **Rok: do konca meseca po koncu obdobja** (npr. Q3 do 31. 10.). Po oddaji prejmeš UPN za plačilo.

Nadzorna plošča v mesecu oddaje opozori na DDV-O za **preteklo, zaključeno** obdobje (npr. oktobra na Q3).

## Prispevki s.p. – Davki → Prispevki QR

UPN nalogi z **QR kodo** za PIZ, ZZZS, zaposlovanje, starševsko varstvo in (neobvezno) akontacijo dohodnine. QR kodo skeniraš v mobilni banki. Rok: **20. v naslednjem mesecu**. Zneske določa prispevna osnova – spremeniš jo v **Nastavitve → DDV & prispevki**. Popoldanski s.p. nastavi zaposlovanje in starševstvo na 0 €.

## Dohodnina – Davki → Dohodnina

Kalkulator akontacije: prihodki in odhodki YTD, prispevni razred, vzdrževani otroci, dohodninska lestvica, letni izračun (davčna osnova, splošna olajšava, mesečna akontacija). Dejanski znesek akontacije določi FURS z odločbo – kalkulator je ocena.

## Normirani – Davki → Normirani

Primerjava **normiranih odhodkov (80 %)** z dejanskimi: vpiši letne prihodke, dejanske stroške in prispevni razred – stran pokaže, kaj je ugodnejše.

## Letni pregled – Davki → Letni pregled

Izberi leto in prispevni razred → **Generiraj**: prihodki po mesecih, odhodki po kategorijah, DDV (izhodni, vhodni, **DDV dolg letno** z razčlenitvijo), **DDD – osnova za dohodninsko napoved**, seznama izdanih in prejetih računov; izvoz v PDF.

## Omejitve in opozorila

- Asistent pomaga pri **uporabi** teh strani; za davčne nasvete (kaj je ugodneje, kako obdavčiti) je v meniju **AI računovodja** (`/ai`, Pro).
- Prihodki in odhodki v KPO so **brez DDV**.
- Negativna DDV obveznost je vračilo – ni skrita in ni zaokrožena na 0.
