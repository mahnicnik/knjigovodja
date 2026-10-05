---
modul: pos-normativi-surovine
naslov: POS – normativi (recepti, sestavljeni artikli) in surovine
vloge: [lastnik, vodja]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (CatalogSection – obrazec artikla, normativ; SestavineSection – zavihek Surovine)
  - apps/web/app/pos/page.tsx (odstevanje surovin ob placilu – funkcija nad PaymentModal; vracanje ob stornu – VoidModal)
  - tabeli items (item_type 'recipe') in item_ingredients (normativ), tabela ingredients (surovine)
posodobljeno: 2026-10-05
---

# POS – normativi in surovine

**Normativ** (recept) pove, koliko katere surovine porabi en prodan artikel. Primer: 1 dl točenega vina porabi 0,1 L vina »Refošk«; espresso porabi 0,007 kg kave. Ob prodaji artikla z normativom blagajna samodejno odšteje zalogo surovin.

## 1. korak – dodaj surovine

1. **POS → Nastavitve → Kategorije & Artikli → zavihek Surovine**.
2. **Nova surovina**: ime (npr. »Refošk«, »Moka«, »Olje«), enota (kos, L, kg, dl, cl, g, ml …), trenutna zaloga, nabavna cena na enoto, dobavitelj (neobvezno), minimalna zaloga za opozorilo.
3. **Shrani**.

Na vrhu zavihka so povzetki: Skupaj surovin, Nizka zaloga, Artiklov z normativom. Zalogo posamezne surovine popraviš z gumbom **Posodobi zalogo**.

## 2. korak – ustvari artikel z normativom

1. **POS → Nastavitve → Kategorije & Artikli → Artikli → + Dodaj artikel**.
2. Tip artikla: **Z normativom** (»Točeno vino, koktajl«).
3. Vpiši ime, prodajno ceno, DDV, kategorijo.
4. V razdelku normativa klikni dodaj vrstico, v spustnem seznamu **izberi surovino** in vpiši **porabo na en prodan kos** v enoti surovine (npr. 0,1 za 1 dl vina, če se vino vodi v litrih; 0,007 za 7 g kave, če se kava vodi v kg). Dovoljene so poljubne decimalke.
5. Dodaj toliko vrstic, kolikor je sestavin, nato **Shrani**.

Če spustni seznam surovin ni prikazan, piše »Najprej dodaj surovine …« – surovin še ni; dodaj jih po 1. koraku. (Besedilo v obrazcu omenja »Nastavitve → Sestavine«; dejanska pot je zavihek **Surovine** v razdelku **Kategorije & Artikli**.)

## Kaj se zgodi ob prodaji, stornu in vračilu

- **Prodaja**: po plačilu se zaloga vseh surovin iz normativa zmanjša za porabo × količina.
- **Storno računa**: poraba surovin se vrne na zalogo. Če vračilo zaloge ne uspe, blagajna to izpiše – zalogo je treba preveriti ročno.
- **Dobavnica**: dobavljene surovine se prištejejo zalogi surovin (glej `pos-zaloga-dobavnice-inventura.md`). Artikli z normativom na dobavnici ne nastopajo – polnijo se njihove surovine.

## Omejitve in opozorila (pogoste napake)

- **Surovine so v ločeni tabeli od artiklov.** V izbiri normativa so samo surovine iz zavihka **Surovine**. Artikel tipa »Surovina«, ustvarjen v zavihku Artikli, se v normativu ne pokaže.
- **Pazi na enote.** Poraba se vpisuje v enoti surovine. Če je kava vodena v kg, je 7 g = 0,007 (ne 7).
- Artikel z normativom nima lastne zaloge – »razprodan« je odvisno od surovin.
- Nizka zaloga surovin se pokaže v obvestilih (zvonec) na blagajni; pošiljanje obvestil o zalogi nastaviš v **POS → Nastavitve → Obveščanje → Obvestila o zalogi** (dnevi in ura).
