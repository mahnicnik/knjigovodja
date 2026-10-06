---
modul: pos-osnove
naslov: POS blagajna – zagon, prijava, meni in izmena
vloge: [lastnik, vodja, blagajnik, trener, terapevt]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (KlasikApp, PremiseSelectScreen, PrvaNastavitev, LockScreen, SideNav, SCREENS, CFG.profiles)
  - apps/web/app/pos/page.tsx (OpenCashModal, VmesnoStanjeModal, CloseCashModal)
posodobljeno: 2026-10-06
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
