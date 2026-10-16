---
modul: pos-osnove
naslov: POS blagajna – zagon, prijava, meni in izmena
vloge: [lastnik, vodja, blagajnik, trener, terapevt]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (KlasikApp, PremiseSelectScreen, PrvaNastavitev, LockScreen, SideNav, SCREENS, CFG.profiles)
  - apps/web/app/pos/page.tsx (OpenCashModal, VmesnoStanjeModal, CloseCashModal)
  - apps/mobile/app/izberi-podjetje.tsx, apps/mobile/lib/podjetja.ts (Android: izbira podjetja)
  - apps/mobile/lib/posodobitve.ts, apps/mobile/app/settings.tsx (Android: samodejne posodobitve)
  - apps/mobile/lib/naprava.ts, apps/mobile/app/naprava.tsx (Android: davčna naprava telefona)
posodobljeno: 2026-10-16
---

# POS blagajna – zagon, prijava, meni in izmena

POS blagajna je del Računka na poti `/pos` (v portalu: meni **Blagajna → POS blagajna**). Na voljo je v paketu **Pro + POS**. Pri računih, odprtih po oktobru 2026, se brez tega paketa (npr. po izteku 14-dnevnega preizkusa) namesto blagajne prikaže »Ta funkcija je na voljo v paketu Pro + POS« s povezavo **Nastavitve → Naročnina**; pri prej odprtih računih blagajna deluje kot doslej. Deluje v brskalniku, kot namizna aplikacija za Windows in na telefonu.

## Prvi zagon na napravi

1. Odpri **Blagajna → POS blagajna**.
2. **Izberi blagajno**: najprej poslovni prostor (lokacijo), nato blagajno/napravo. Če seznam prostorov ni prikazan, jih je treba dodati v portalu: **Nastavitve → Davčna blagajna → Poslovni prostori** (in **Naprave**).
3. Ob prvem zagonu (če še ni nobenega zaposlenega) se prikaže **prva nastavitev**: vpiši svoje ime in PIN (1–4 števke, dvakrat). PIN ne sme biti iz samih enakih števk (npr. 1111).

## Prijava s PIN-om in zaklepanje

- Blagajna se odpre z **zaklenjenim zaslonom** – vsak zaposleni vpiše svoj PIN in klikne **Potrdi**.
- Blagajna se po nastavljenem času sama zaklene: **Nastavitve (POS) → Avt. zaklepanje** (15 s, 30 s, 1 min, 5 min ali Nikoli).
- PIN je kratek, ker do blagajne pride samo uporabnik, ki je že prijavljen v Računko; PIN le loči osebje za pultom.

## Android aplikacija: več podjetij in posodobitve

Če je uporabnik član **več podjetij** (npr. lastnik svojega in admin pri stranki), mu Android aplikacija po prijavi pokaže zaslon **Izberi podjetje** (ime podjetja in vloga). Izbira se zapomni – ob naslednjem zagonu se odpre neposredno blagajna izbranega podjetja.
- Zamenjava: **⇄ Zamenjaj podjetje** na zaslonu za PIN ali v **Nastavitve** (pod imenom podjetja). Ob zamenjavi se izpraznijo neplačane košarice in izbrana miza.
- Članstva z vlogo Računovodja se v izbiri ne pokažejo (računovodja nima dostopa do blagajne).
- Uporabnik z enim podjetjem zaslona za izbiro ne vidi.
- Če podjetje še nima osebja blagajne, zaslon za PIN pokaže »Blagajna še nima osebja« – osebje doda lastnik v brskalniku (**Nastavitve → Davčna blagajna → Osebje blagajne** ali **POS → Nastavitve → Zaposleni & PIN**).
- Po odjavi se izbira pozabi.

**Davčna naprava telefona** (več telefonov hkrati, npr. stojnice na tržnici): vsak telefon izdaja račune pod svojo oznako elektronske naprave (oblika računa PROSTOR-NAPRAVA-številka). Če ima podjetje za blagajno več naprav, telefon ob prvem odprtju blagajne vpraša **Davčna naprava** – izberi napravo tega telefona (vsak telefon svojo). Izbira se zapomni; zamenjaš jo v **Nastavitve → Davčna blagajna → Davčna naprava**. Izbrana oznaka je v glavi blagajne (📍 npr. STOJ1-TEL1). Pri eni sami napravi telefon ne sprašuje. Naprave doda lastnik v brskalniku: **Nastavitve → Davčna blagajna → Naprave** (vsaki napravi izbere prostor).

Če FURS ob plačilu ne odgovori ali račun ni potrjen, telefon to pokaže (»⚠️ Plačano – …«). Z ZOI izdan račun se prijavi naknadno; nepotrjen račun potrdiš v Računku pri računu (**⚠️ Potrdi FURS**).

**Posodobitve Android aplikacije** so samodejne: ob zagonu (in ob vrnitvi v aplikacijo, največ na 30 minut) preveri, ali je na voljo nova različica, jo prenese in uporabi ob **naslednjem zagonu** – nikoli med prodajo. Ročno: **Nastavitve → ⟳ Preveri posodobitve** → **Znova zaženi** (neplačane košarice se izpraznijo). Različica in datum zadnje posodobitve sta izpisana na dnu Nastavitev. Ponovna namestitev APK je potrebna le redko (večje spremembe aplikacije).

## Meni zaslonov (levo; na telefonu spodaj/»⋯«)

Zasloni: **Prostori & mize, Prodaja, Koledar, Stranke, Paketi, Zaloga, Kuhinja, Inventura, Računi, Opravila & sporočila, Poročila, Nastavitve**.

- Kateri zasloni so v meniju, določa **Nastavitve (POS) → Tip poslovanja** (profili: Vse v enem, Restavracija, Bar / Kavarna, Storitve, Tržnica / Stojnica, Po meri). Pri »Po meri« izbereš zaslone sam.
- Vrstni red zaslonov v meniju lahko vsak uporabnik prilagodi; shrani se na napravo in na uporabnika.

## Izmena: odpri, vmesno stanje, zaključi (glava blagajne)

1. **🔓 Odpri** (v glavi blagajne) – otvoritev blagajne: preštej gotovino v predalu in vpiši **Znesek v blagajni (€)**. Brez odprte blagajne gumb za plačilo kaže »🔒 Odpri blagajno«.
2. **Vmesno stanje** – pokaže promet po načinu plačila in koliko gotovine naj bo v blagajni. Ne zapre izmene.
3. **🔒 Zaključi** – zaključek izmene: štetje gotovine, razlika in **Z-poročilo**. Glej `pos-zakljucek-z-porocilo.md`.

Na telefonu so ti gumbi (in »💾 Shranjeni«) skriti v meniju **⋯** v glavi.

## Shranjena naročila

V glavi je gumb **💾 Shranjeni** – naročila, shranjena z gumbom **💾 Shrani** v košarici (npr. gost bo plačal kasneje). Klik odpre seznam in naročilo vrne v košarico.

## Obvestila (zvonec v glavi)

Nepotrjeni fiskalni dokumenti pri FURS (za ponovno pošiljanje), nizka zaloga artiklov in surovin, potekajoče oziroma potekle kartice članov.

## Omejitve in opozorila

- Gumb **🔒 Zaključi** vidijo samo osebe s pravico »Dnevni zaključek« (privzeto Lastnik in Vodja). Blagajnik namesto tega vidi napis »Blagajna odprta«.
- Delo brez interneta: blagajna mora biti vsaj enkrat zagnana s povezavo. Brez povezave ni mogoče unovčiti kartice obiskov ali predplačila in ni mogoče plačati s Stripe; gotovina in kartica delujeta, računi gredo v vrsto za FURS.
- Uporabnik z vlogo **blagajnik** v portalu vidi samo blagajno (`/pos`).
