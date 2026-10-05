---
modul: furs-fiskalizacija
naslov: FURS davčno potrjevanje – certifikat, poslovni prostori, naprave, test/produkcija, nastavitve na blagajni
vloge: [lastnik]
poti: [/nastavitve?tab=blagajna, /pos]
koda:
  - apps/web/components/nastavitve/Blagajna.tsx (Nastavitve → Davčna blagajna: Certifikat, Poslovni prostori, Naprave, Osebje blagajne, Test povezave)
  - apps/web/app/pos/page.tsx (FursSection – POS → Nastavitve → FURS & DDV; PremiseSelectScreen)
  - apps/web/app/api/furs/* (komunikacija s FURS – asistent jo samo opisuje)
posodobljeno: 2026-10-05
---

# FURS davčno potrjevanje (fiskalizacija)

Računi za gotovino in kartice (blagajna, Stripe) se morajo davčno potrditi pri FURS. Računko pošlje račun FURS in na račun natisne **EOR** (enkratna identifikacijska oznaka, ki jo vrne FURS) in **ZOI** (zaščitna oznaka izdajatelja).

## Nastavitev (enkrat) – portal: Nastavitve → Davčna blagajna

Razdelek ima zavihke: **🔐 Certifikat**, **🏢 Poslovni prostori**, **🖨️ Naprave**, **👥 Osebje blagajne**, **🧪 Test povezave**.

1. **Pridobi certifikat**: na eDavki (eDavki.durs.si → Davčna blagajna → Registracija certifikata); izda ga SIGEN-CA brezplačno, datoteka `.p12`.
2. **Naloži certifikat**: zavihek Certifikat → klikni polje in izberi `.p12` datoteko → vpiši **geslo certifikata**. En certifikat pokriva vse lokacije. Prikažeta se naziv in »Velja do«.
3. **Poslovni prostor**: zavihek Poslovni prostori → **Nov poslovni prostor** → **ID poslovnega prostora** (npr. SIRBFB01), naslov, poštna številka, kraj in katastrski podatki → shrani. Prostor se prijavi pri FURS. Vsak lokal mora biti registriran.
4. **Naprava**: zavihek Naprave → **Nova naprava** → ID naprave (npr. RACUNK001), prostor in uporaba: »Oboje (POS in Stripe/PDF) – privzeto«, »Samo POS terminal« ali »Samo Stripe/PDF računi« (ločeno zaporedno številčenje).
5. **Test povezave**: zavihek Test povezave pošlje testni račun – prikazati se morata **EOR** in **ZOI**.

### Test način ali produkcija

Na vrhu razdelka je stikalo **Test način**:
- **🧪 TEST način (FURS Playground)** – računi gredo na testni FURS strežnik, **ne na pravi FURS**. Za preizkušanje.
- **✅ PRODUKCIJSKI način (blagajne.fu.gov.si)** – računi se davčno potrjujejo pri FURS. Za pravo poslovanje mora biti test način **izklopljen**.

## Nastavitve na blagajni – POS → Nastavitve → FURS & DDV (samo lastnik)

- Stanje: ali je bil zadnji račun pri FURS uspešno potrjen in razlog morebitne napake.
- **Privzeto davčno potrdi vsak račun** – kljukica »Davčno potrdi« pri plačilu je privzeto označena.
- **Pokaži gumb »Tiskaj brez FURS« v plačilu** – blagajnik lahko izda račun brez davčne potrditve (npr. interni).
- **Zahteva potrditev PIN za netiskane račune** – za vsak račun brez FURS mora vodja ali lastnik vpisati PIN.
- Pregled DDV stopenj v Sloveniji (0 %, 5 %, 9,5 %, 22 %) s primeri.

## Številčenje računov

Davčne številke računov imajo **en sam števec** za blagajno, portal in storno (oblika poslovni prostor–naprava–zaporedna številka). Naprava »Samo Stripe/PDF računi« ima ločeno zaporedje.

## Ko FURS ne odgovori

Račun se izda, natisne se ZOI, račun pa gre v **vrsto za ponovno pošiljanje**. Na blagajni ga vidiš v obvestilih (zvonec) z gumbom za ponovno pošiljanje. Po zakonu ga je treba naknadno potrditi v **dveh delovnih dneh**.

## Omejitve in opozorila

- Asistent fiskalizacijo samo **opisuje**; računov ne potrjuje in nastavitev ne spreminja.
- Brez naloženega certifikata in prijavljenega poslovnega prostora blagajna ne more izbrati prostora (»Dodaj jih v Nastavitve → FURS → Poslovni prostori«).
- Davčno potrjenega računa ni mogoče izbrisati (10-letna hramba) – popravek je storno ali dobropis.
- Če certifikat poteče, potrjevanje ne deluje – pravočasno naloži novega.
