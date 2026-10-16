---
modul: pos-artikli-ddv
naslov: POS – kategorije, artikli, DDV stopnja, modifikatorji, uvoz cenika, happy hour
vloge: [lastnik, vodja]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (CatalogSection, CenikImportModal, HappyHourSection)
  - apps/web/components/pos/MnozicneCene.tsx, apps/web/components/pos/ZgodovinaCen.tsx
  - apps/web/components/VatExemptionPicker.tsx
  - apps/web/app/pos/page.tsx (VnosCeneModal – univerzalni artikel), apps/mobile/app/pos.tsx, apps/mobile/app/catalog.tsx
posodobljeno: 2026-10-16
---

# POS – kategorije, artikli in DDV stopnja

Cenik blagajne se ureja v **POS → Nastavitve → Kategorije & Artikli**. Razdelek ima tri zavihke: **Kategorije**, **Artikli** in **Surovine**.

## Dodajanje kategorije

1. **POS → Nastavitve → Kategorije & Artikli → Kategorije**.
2. Dodaj kategorijo (npr. »Bar, Fitness, Kava«), izberi emoji/barvo, **Shrani**.
3. Vrstni red kategorij spremeniš tako, da jih povlečeš.

## Dodajanje artikla

1. **POS → Nastavitve → Kategorije & Artikli → Artikli**, gumb **+ Dodaj artikel**.
2. Izberi **tip artikla**:
   - **Enostaven** – npr. pivo, vstopnina, kava v kapsuli. Zaloga se vodi na samem artiklu.
   - **Z normativom** – npr. točeno vino, koktajl, espresso. Ob prodaji se odštejejo surovine po normativu (glej `pos-normativi-surovine.md`).
   - **Surovina** – npr. vino 1 L, moka 1 kg. **Pozor:** surovine za normative se vodijo v zavihku **Surovine** (ločena tabela). Artikel tipa »Surovina«, ustvarjen v zavihku Artikli, se v izbiri normativa NE pokaže – za normative surovino vedno dodaj v zavihku **Surovine**.
3. Vpiši ime, prodajno ceno, (neobvezno) nabavno ceno, šifro (npr. K01), kategorijo.
4. Izberi **DDV stopnjo**: 0 % (oproščeno), 5 % (knjige, časopisi), 9,5 % (gostinstvo, šport), 22 % (splošna).
5. Pri **0 %** mora DDV zavezanec izbrati **razlog za neobračunan DDV** (ZDDV-1), npr. oprostitev po 42. členu – razlog se izpiše na računu.
6. **Zaloga v skladišču**: pusti prazno za neomejeno (artikel se nikoli ne pokaže kot razprodan).
7. **Shrani**.

### Kje nastavim DDV stopnjo za artikel?

V obrazcu artikla (**POS → Nastavitve → Kategorije & Artikli → Artikli → uredi artikel**) v spustnem seznamu DDV. Stopnja velja za vsako prodano postavko posebej, zato je na enem računu lahko več stopenj; Z-poročilo in DDV obračun jih ločita.

Smernice iz **POS → Nastavitve → FURS & DDV**: 0 % zdravstvene storitve po 42. členu, izobraževanje, boni; 5 % knjige in časopisi; 9,5 % gostinske storitve, hrana in brezalkoholne pijače, uporaba športnih objektov (samostojna vadba), nastanitev; 22 % alkoholne pijače, vodena vadba in osebno trenerstvo, blago in večina drugih storitev.

Nezavezanec za DDV izbire DDV stopnje ne vidi (vse je 0 %).

## Univerzalni artikel (cena ob prodaji)

Artikel brez stalne cene – znesek vpišeš ob vsaki prodaji, kot na kartičnem terminalu (npr. »Razno 22 %« na tržnici ali za artikle, ki jih nimaš v ceniku).

**Nastavitev:** v obrazcu artikla (tip **Enostaven**) obkljukaj **Cena ob prodaji** (univerzalni artikel). Polje za prodajno ceno se zaklene (»ob prodaji«). Izberi **DDV stopnjo** – ta velja za vsak znesek, vpisan pri tem artiklu. Za različne stopnje naredi več univerzalnih artiklov (npr. »Razno 22 %«, »Razno 9,5 %«). Na Android aplikaciji: **Nastavitve → Kategorije & Artikli → +** → **Cena ob prodaji**.

**Prodaja:** pritisni artikel (na gumbu piše **✎ Vpiši znesek**) → odpre se tipkovnica **Vnesi znesek**. Številke se vpisujejo v centih (1, 2, 5, 0 = 12,50 €), **C** pobriše, **⌫** briše zadnjo številko; v brskalniku lahko tipkaš tudi na tipkovnici (Enter = Dodaj). Po želji vpiši **opis na računu** (npr. »Med 1 kg«) – izpiše se namesto imena artikla. **Dodaj** → vrstica gre v košarico, nato plačilo kot običajno.

- Vsak vnos je svoja vrstica (zneski se ne seštejejo v eno vrstico).
- Zaloga, happy hour in modifikatorji za univerzalni artikel ne veljajo.
- Račun, FURS potrditev, storno, vračilo in Z-poročilo delujejo kot pri drugih artiklih (DDV po stopnji artikla).

## Modifikatorji (dodatki, velikosti)

V obrazcu artikla spodaj: **Nova modifier grupa** (npr. »Mleko«, »Velikost«, »Dodatki«), dodaj možnosti (npr. »Ovseno«, +0,50 €) in **Shrani grupo**. Pri prodaji se ob artiklu pokaže izbira.

## Množična sprememba cen in zgodovina cen

V zavihku Artikli gumb **Množična sprememba cen**: sprememba prodajnih cen več artiklov hkrati (npr. ob podražitvi dobavitelja). Najprej se pokaže predogled »stara → nova cena«, šele nato potrdiš. V istem razdelku je tudi pregled zgodovine cen.

## Uvoz cenika z AI (fotografija ali PDF jedilnika)

1. **POS → Nastavitve → Kategorije & Artikli → Artikli**, gumb **📷 Uvozi iz cenika**.
2. Povleci sliko ali PDF cenika oziroma jedilnika (JPG, PNG, PDF). AI prebere izdelke in cene.
3. Označi izdelke za uvoz (**Izberi vse** / **Počisti**), preveri kategorijo in DDV (22 % ali 9,5 %), **Shrani**.

Obstaja tudi samostojna stran `/pos/uvoz-cenika` z enakim postopkom.

## Happy hour (samodejni popusti)

**POS → Nastavitve → Happy hour → Novo happy hour pravilo**: ime, dnevi v tednu, čas od–do, popust in kategorije (brez izbrane kategorije velja za vse). Pravilo lahko izklopiš ali vklopiš, ne da bi ga brisal.

## Omejitve in opozorila

- DDV stopnja je del artikla; sprememba stopnje velja le za prihodnje prodaje, izdanih računov ne spremeni.
- »Izbriši« artikel arhivira (izgine iz cenika in prodaje); izdani računi s tem artiklom ostanejo nespremenjeni.
- Za normative uporabljaj surovine iz zavihka **Surovine**, ne artiklov tipa »Surovina« (glej zgoraj).
