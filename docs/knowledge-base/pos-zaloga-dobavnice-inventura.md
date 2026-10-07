---
modul: pos-zaloga-dobavnice-inventura
naslov: POS – zaloga, uvoz dobavnic (AI), ujemanje artiklov in surovin, inventura
vloge: [lastnik, vodja]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (InventoryScreen, DobavnicaImportModal, InventuraScreen)
  - apps/web/app/api/pos/import-delivery/route.ts (AI branje PDF dobavnice)
  - apps/web/lib/pakiranje.ts (vsebina pakiranja → enota zaloge)
posodobljeno: 2026-10-07
---

# POS – zaloga, dobavnice in inventura

## Zaslon Zaloga

Zavihki **Artikli**, **Surovine**, **Storitve**, **Dobavnice**; filtri **Vse**, **↓ Pod minimum**, **Razprodano**; razvrščanje (A–Z, po prodaji). Povzetki: zaloga, pod minimumom, vrednost zaloge. Pri artiklu so prodaja in prihodek zadnjih 30 dni ter zgodovina nabavnih cen.

- Artikel z normativom ima opombo »Ob prodaji se odštejejo sestavine, ne ta artikel«.
- Artikel postane **storitev** (rezervacija v koledarju), ko mu v nastavitvah vklopiš »naročljiv«.
- Zalogo surovine popraviš z **Popravi zalogo**.

## Uvoz dobavnice z AI (PDF)

1. **Zaloga → Uvozi dobavnico**.
2. Povleci PDF dobavnice ali računa dobavitelja. AI prepozna dobavitelja, številko dobavnice, postavke, količine in cene.
3. Za vsako vrstico preveri **Knjiži na:** – na obstoječi artikel, na obstoječo **surovino**, kot **nov artikel** ali kot **novo surovino**. Blagajna sama predlaga ujemanje po črtni kodi in podobnosti naziva (npr. »PIVO CORONA EXTRA 0,33L« → »Corona«).
4. Pri vsaki povezani vrstici preveri **vsebino pakiranja**: »1 kos × **20** L v pakiranju → zaloga +20 L · 2,00 €/L«. Število pomeni, koliko enot zaloge (enota izbrane surovine ali artikla) je v enem pakiranju z dobavnice – sod piva 20 L → 20, paket čaja z 20 vrečkami → 20, karton 6 steklenic → 6 (če zalogo vodiš v kosih) ali 4,5 (če jo vodiš v L). Predlog pride iz prejšnjega uvoza, od AI ali iz naziva; popraviš ga v polju. Pri novem artiklu ali surovini izbereš tudi enoto zaloge.
5. Odznači vrstice, ki jih ne želiš knjižiti, in potrdi. Zaloga se poveča za **količino × vsebino**, nabavna cena se zapiše **na enoto zaloge** (cena pakiranja / vsebina), zgodovina cen se posodobi.

Potrjena vsebina pakiranja se **zapomni** za ta artikel dobavitelja (po črtni kodi, sicer po nazivu in dobavitelju) in se naslednjič predlaga sama.

**Ročni vnos** (gumb poleg uvoza): enak obrazec brez PDF-ja – dobavitelj, št. dobavnice, postavke z nazivom, količino, ceno na enoto in DDV (22 %, 9,5 %, 5 %, 0 % ali 8 % pavšalno nadomestilo; pri pavšalnem nadomestilu vpiši še številko dovoljenja FURS).

Uvožene dobavnice so v zavihku **Dobavnice** (urejanje podatkov, brisanje). Brisanje dobavnice zalogo zmanjša za toliko, kot je bilo knjiženo (količina × vsebina pakiranja).

### Sod 20 L se je v zalogo vpisal kot 1 in 40 € – zakaj?

Do 7. 10. 2026 uvoz ni poznal vsebine pakiranja – količino in ceno z dobavnice je prenesel 1 : 1. Pri novih uvozih vpiši vsebino pakiranja (glej zgoraj). Zalogo in nabavno ceno starih uvozov popravi z **Popravi zalogo** pri surovini ali z **inventuro**, nabavno ceno pa v nastavitvah surovine/artikla.

### Ali uvoznik dobavnic vidi surovine?

Da. Od avgusta 2026 so v naboru za ujemanje tudi **surovine** (kava, vino, žgane pijače …), in vrstico lahko knjižiš kot novo surovino. Nova surovina iz dobavnice ima ob uvozu opombo »nova surovina – dodajte jo v normative« – v normativ artikla jo je treba dodati ročno. Artikli z normativom (npr. espresso) niso na izbiro, ker na dobavnici ne nastopajo.

## Inventura

1. Zaslon **Inventura** → **+ Nova inventura**.
2. Za vsak artikel in surovino vpiši **dejansko** stanje (ob njem je stanje v evidenci in razlika). Filtri: vse, samo razlike, artikli, surovine, nepreštete.
3. **Zaključi inventuro** – zaloga se prepiše s preštetim stanjem.

## Omejitve in opozorila

- Hkrati je lahko odprta samo **ena** inventura – najprej zaključi ali izbriši odprto.
- Pavšalno nadomestilo (8 %) na dobavnici ni DDV in se v obračunu DDV obravnava posebej.
- Besedilo »Uredi nabavno ceno v Nastavitvah → Sestavine« na zaslonu Zaloga pomeni zavihek **Surovine** v **Nastavitve → Kategorije & Artikli**.
