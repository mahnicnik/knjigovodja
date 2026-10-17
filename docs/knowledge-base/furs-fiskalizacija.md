---
modul: furs-fiskalizacija
naslov: FURS davčno potrjevanje – certifikat, poslovni prostori, naprave, test/produkcija, nastavitve na blagajni
vloge: [lastnik]
poti: [/nastavitve?tab=blagajna, /pos]
koda:
  - apps/web/components/nastavitve/Blagajna.tsx (Nastavitve → Davčna blagajna: Certifikat, Poslovni prostori, Naprave, Osebje blagajne, Test povezave)
  - apps/web/app/api/furs/register-premise/route.ts, apps/web/lib/furs.ts (prijava prostora, premični tip A/B)
  - apps/web/app/pos/page.tsx (FursSection – POS → Nastavitve → FURS & DDV; PremiseSelectScreen)
  - apps/web/app/api/furs/* (komunikacija s FURS – asistent jo samo opisuje)
posodobljeno: 2026-10-17
---

# FURS davčno potrjevanje (fiskalizacija)

Računi za gotovino in kartice (blagajna, Stripe) se morajo davčno potrditi pri FURS. Računko pošlje račun FURS in na račun natisne **EOR** (enkratna identifikacijska oznaka, ki jo vrne FURS) in **ZOI** (zaščitna oznaka izdajatelja).

## Nastavitev (enkrat) – portal: Nastavitve → Davčna blagajna

Razdelek ima zavihke: **🔐 Certifikat**, **🏢 Poslovni prostori**, **🖨️ Naprave**, **👥 Osebje blagajne**, **🧪 Test povezave**.

1. **Pridobi certifikat**: na eDavki (eDavki.durs.si → Davčna blagajna → Registracija certifikata); izda ga SIGEN-CA brezplačno, datoteka `.p12`.
2. **Naloži certifikat**: zavihek Certifikat → klikni polje in izberi `.p12` datoteko → vpiši **geslo certifikata**. En certifikat pokriva vse lokacije. Prikažeta se naziv in »Velja do«.
3. **Poslovni prostor**: zavihek Poslovni prostori → **+ Dodaj prostor** → **ID poslovnega prostora** (npr. SIRBFB01) in **Vrsta prostora**:
   - **Nepremičnina** (lokal, trgovina, pisarna): naslov, poštna številka, kraj in katastrski podatki (kat. občina, št. stavbe, št. dela stavbe).
   - **Premični prostor – tip A**: premični objekt, npr. premična stojnica, ki jo voziš na različne tržnice, ali vozilo.
   - **Premični prostor – tip B**: objekt na stalni lokaciji, npr. stojnica na tržnici ali kiosk.
   Pri premičnem prostoru katastrskih podatkov ni, opis je neobvezen. → **Shrani** → pri prostoru klikni **📤 Prijavi pri FURS** (prijavi se ravno ta prostor). Vsak prostor mora biti prijavljen; kateri tip velja za tvojo stojnico, potrdi z računovodjo.
4. **Naprava**: zavihek Naprave → **Nova naprava** → ID naprave (npr. RACUNK001), prostor in uporaba: »Oboje (POS in Stripe/PDF) – privzeto«, »Samo POS terminal« ali »Samo Stripe/PDF računi« (ločeno zaporedno številčenje). Za več telefonov hkrati (npr. 4 prodajalci na tržnici) dodaj **eno napravo na telefon** (npr. TEL1–TEL4) v isti ali v ločenih prostorih; na vsakem telefonu nato izberi njegovo napravo (Android: **Nastavitve → Davčna blagajna → Davčna naprava**). Pod seznamom naprav je stikalo **»Vsaka naprava svoja izmena (svoj predal)«** – vsaka naprava ima potem svojo izmeno, gotovino in Z-poročilo.
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

## Napake pri nalaganju certifikata

- **»Geslo za certifikat ni pravilno …«** – geslo se ne ujema z datoteko. Preveri velike in male črke ter presledke na začetku ali koncu (pogosto pri kopiranju gesla).
- **»Datoteke ni bilo mogoče prebrati kot certifikat .p12/.pfx …«** – izbrana datoteka ni certifikat z zasebnim ključem (npr. `.cer` ali `.crt`) ali je poškodovana. Naloži `.p12`/`.pfx`, ki ga je izdal SIGEN-CA oz. eDavki. Če isti certifikat deluje v drugem programu, naj uporabnik piše podpori.
- Pri certifikatih podjetij (d.o.o.) je v nazivu ime podjetja; davčna številka se prebere iz certifikata samodejno.
