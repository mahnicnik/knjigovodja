---
modul: pos-prodaja-placila
naslov: POS – prodaja, košarica, popusti, razdelitev računa, plačilo, odpis
vloge: [lastnik, vodja, blagajnik]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (SaleScreen, SaleCart, PaymentModal, WriteoffModal, CFG.paymentMethods)
  - apps/web/components/pos/StripePlacilo.tsx, apps/web/lib/pos-stripe.ts (plačilo s Stripe QR)
posodobljeno: 2026-10-05
---

# POS – prodaja in plačilo

## Prodaja (zaslon Prodaja)

1. Če blagajna še ni odprta, gumb za plačilo kaže **🔒 Odpri blagajno** – najprej odpri izmeno (glej `pos-osnove.md`).
2. Klikni artikle v mreži (iskanje po imenu ali šifri). Pri artiklih z modifikatorji izberi dodatek.
3. Količino v košarici povečaš ali zmanjšaš z +/−.
4. **Stranka** (gumb v košarici): pripni stranko na račun – potrebno za unovčenje kartice obiskov, predplačilo in zgodovino stranke.

## Popusti

- **Popust na postavko**: v košarici ob postavki – v odstotkih ali v evrih (»Brez popusta« ga odstrani).
- **Popust na račun**: gumb **%** v košarici – v odstotkih (%) ali v evrih (€). Popust v evrih se pretvori v odstotek in ne more preseči zneska računa.
- Samodejni popusti po urah: **Happy hour** (glej `pos-artikli-ddv.md`).

## Razdelitev računa (split bill)

1. V košarici klikni **Razdeli**.
2. Za osebo, ki plača zdaj, izberi postavke in količine (»Ta oseba plača:«), potrdi in plačaj.
3. Plačane količine se odštejejo iz košarice; ostanek ostane za naslednjo osebo. Postopek ponovi, dokler ni vse plačano.

## Ostali gumbi v košarici

- **💾 Shrani** – shrani naročilo za kasneje (najdeš ga pod **💾 Shranjeni** v glavi).
- **🧾 Predračun** – »Predračun za podjetje«: vpiši ime podjetja ali stranke, naslov, davčno številko in ID za DDV, nato natisni. Predračun ni davčni račun in ne gre v FURS.
- **⋯ Več** – **Odpis / Poraba / Reprezentanca**:
  - *Odpis* – pokvarjeno, poteklo, zlomljeno blago;
  - *Lastna poraba* – lastnik ali zaposleni vzame blago za osebno rabo (DDV samoobdavčitev);
  - *Reprezentanca* – pogostitev poslovnih partnerjev.
  Prikaže nabavno vrednost in DDV za samoobdavčitev, opomba je neobvezna. Zaloga artiklov se zmanjša, račun se ne izda.

## Plačilo

Klikni **Plačaj €…**. V oknu »Zaključi račun« izberi **način plačila**:

| Način | Kdaj |
|---|---|
| 💶 Gotovina | vpiši »Prejeto«, blagajna izračuna »Za vrniti« |
| 💳 Kartica | plačilo na zunanjem POS terminalu (»Vnesi na terminal«) |
| 🎟️ Karta obiskov | unovčenje obiska s kartice stranke – potrebna je izbrana stranka s kartico; kartica ne sme biti zamrznjena ali porabljena |
| 🎫 Boni | plačilo z darilnim bonom |
| 💰 Predplačilo | odšteje znesek od stanja predplačila stranke |
| Stripe (QR) | samo če je podjetje povezano s Stripe (portal **Nastavitve → Plačila s kartico**): na zaslonu se pokaže QR koda, stranka plača s telefonom, račun zaključi in davčno potrdi strežnik |

Dodatno v oknu za plačilo:
- **Napitnina** (0, 5, 10, 15 %) – ni obdavčena.
- **Popust** na celoten račun.
- **Davčno potrdi (FURS)** – privzeto vklopljeno (nastavitev v **POS → Nastavitve → FURS & DDV**). Račun, plačan s Stripe, se vedno davčno potrdi.
- **Račun na podjetje** – vpiši naziv podjetja, naslov in davčno številko (8 števk, brez predpone SI). Davčna se natisne na račun in pošlje FURS.

Po plačilu se natisne ali prikaže račun z ZOI in EOR kodo.

## Omejitve in opozorila

- **Karta obiskov** in **predplačilo** brez interneta ne delujeta (stanje je v bazi).
- Plačilo s Stripe zahteva internet in povezan Stripe račun; brez tega je gumb onemogočen z razlago.
- Če FURS ne odgovori, se račun izda in gre v **vrsto za ponovno pošiljanje** – vidno v obvestilih (zvonec). Po zakonu ga je treba potrditi v dveh delovnih dneh.
- Gumb »Tiskaj brez FURS« je na voljo le, če ga lastnik vklopi v **POS → Nastavitve → FURS & DDV**; lahko zahteva PIN vodje.
- **Odpis artikla z normativom ne odšteje surovin** (zaloga se zmanjša le pri artiklih z lastno zalogo). Pokvarjeno surovino popravi v zavihku **Surovine → Posodobi zalogo** ali z inventuro.
- Napačno izbran način plačila popraviš kasneje na zaslonu **Računi** (glej `pos-racuni-storno-vracila.md`).
