---
modul: pos-zakljucek-z-porocilo
naslov: POS – zaključek izmene, Z-poročilo, poročila, dnevni zaključki v portalu
vloge: [lastnik, vodja]
poti: [/pos, /zakljucki]
koda:
  - apps/web/app/pos/page.tsx (CloseCashModal, ZReportModal, VmesnoStanjeModal, ReportsScreen)
  - apps/web/app/zakljucki/page.tsx (Dnevni zaključki v portalu)
posodobljeno: 2026-10-05
---

# POS – zaključek izmene in Z-poročilo

## Kako naredim Z-poročilo (konec dneva / izmene)?

Pravi zaključek izmene je gumb **🔒 Zaključi** v **glavi blagajne** (na telefonu v meniju **⋯**):

1. Klikni **🔒 Zaključi**. Okno »Zaključek blagajne – štetje in Z-poročilo« pokaže promet izmene po načinih plačila.
2. Pokaže se izračun gotovine: začetna gotovina + gotovinski promet − gotovinska vračila = **Pričakovano v blagajni**.
3. Preštej gotovino in vpiši **Prešteto v blagajni (€)**. Prikaže se **Razlika**; po potrebi vpiši opombo (npr. »oddano v sef«).
4. Potrdi. Blagajna se zapre, **Z-poročilo** se shrani in natisne, dnevni promet se zapiše v KPO knjigo.
5. Z-poročilo predlaga **priporočeno začetno gotovino** za naslednjo otvoritev.

Z-poročilo vsebuje: stanje blagajne (gotovina ob odprtju in zaključku), plačila po metodah (gotovina, kartica, boni, ostalo), skupni promet, gotovinska in negotovinska vračila, neto promet, število računov, napitnine in **DDV po stopnjah** (osnova in DDV za 22 %, 9,5 %, 5 % in oproščeno 0 %).

## Gumb »Z-poročilo (samo obračun)« na zaslonu Poročila

Na zaslonu **Poročila** je gumb **Z-poročilo (samo obračun)**. Ta izdela davčni obračun prometa in DDV za izbrano obdobje, a **ne zapre izmene**, ne prešteje gotovine in ne predlaga prenosa v naslednjo izmeno. Za konec dneva uporabi **🔒 Zaključi** v glavi.

## Vmesno stanje (X-poročilo)

**Vmesno stanje** v glavi blagajne pokaže promet po plačilih in koliko gotovine naj bo v blagajni – brez zapiranja izmene. Lahko ga natisneš.

## Poročila (zaslon Poročila)

Obdobje (Zadnjih 7 dni, Ta mesec, po meri), promet po urah, plačila po metodah, najbolje prodajani artikli (po kosih ali prihodku), storitve, vračila, filter po zaposlenem (trener/terapevt). **Vsa poročila** odpre knjižnico dodatnih poročil (npr. DDV po kategorijah artiklov).

## Dnevni zaključki v portalu

V portalu **Blagajna → Dnevni zaključki** (`/zakljucki`) lastnik vidi vsa shranjena Z-poročila z razčlenitvijo po DDV stopnjah. Računovodja jih vidi v svojem portalu.

## Omejitve in opozorila

- **🔒 Zaključi** vidijo le osebe s pravico »Dnevni zaključek« (privzeto Lastnik in Vodja); blagajnik vidi samo »Blagajna odprta«.
- Če zaključek uspe, pomožni korak (npr. zapis v KPO) pa ne, blagajna to izpiše – **zaključka ne ponavljaj**, izmena je že zaprta.
