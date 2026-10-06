---
modul: portal-racuni
naslov: Portal – izdani računi, nov račun, plačila, storno, dobropis, e-račun, uvoz iz PDF, zahtevki za plačilo
vloge: [lastnik, admin]
poti: [/invoices, /invoices/new, /invoices/edit/[id], /invoices/import, /invoices/zahtevki]
koda:
  - apps/web/app/invoices/page.tsx (seznam, meni »··· Več«)
  - apps/web/app/invoices/new/page.tsx, apps/web/app/invoices/edit/[id]/page.tsx
  - apps/web/app/invoices/import/page.tsx, apps/web/app/invoices/zahtevki/page.tsx
  - apps/web/lib/racun-zaklep.ts (zaklep urejanja), apps/web/app/api/invoices/[id]/eracun (e-račun XML)
  - apps/web/lib/upn-qr.ts (UPN QR na računu), apps/web/lib/invoice-pdf.tsx (PDF računa)
  - apps/web/app/api/company-lookup/route.ts, apps/web/lib/register-zavezancev.ts (iskanje stranke po davčni – register FURS, VIES)
posodobljeno: 2026-10-06
---

# Portal – izdani računi

Meni **Poslovanje → Računi** (`/invoices`). Na vrhu: Skupaj fakturirano, Plačano, Neplačano; gumbi **Uvozi iz PDF**, **💳 Zahtevki za plačilo**, **+ Nov račun**. Statusi: Osnutek, Izdano, Poslano, Zamuda, Plačano, Storno.

## Nov račun

1. **+ Nov račun** (ali meni **Nov račun**).
2. **Stranka**: izberi obstoječo ali vpiši novo. Ko vpišeš **davčno številko** (8 števk, s SI ali brez), se ime in naslov izpolnita samodejno iz **registra davčnih zavezancev FURS** (ali klikni iskanje oziroma Enter). Register ima imena z velikimi črkami; na račun se vpiše berljiv zapis (npr. »HFP, izobraževanje na področju športa, Domen Kocjan s.p.«), ki ga lahko popraviš. Register **nima TRR** – TRR stranke vpiši sam (že vpisanega iskanje ne pobriše). Enako deluje na novi **dobavnici**.
3. **Datumi**: datum računa, rok plačila, (neobvezno) obdobje opravljene storitve od–do.
4. **Storitve in blago**: opis, količina, cena, DDV (22 %, 9,5 %, 5 % ali 0 %), popust %. **+ Dodaj postavko** za več vrstic. **Preračunaj iz cene z DDV** izračuna ceno brez DDV; na voljo je tudi **Kalkulator DDV**.
5. Pri **0 % DDV** izberi **Razlog za neobračunan DDV**; »Zapomni si to izbiro za vse prihodnje račune« jo nastavi kot privzeto.
6. Neobvezno: **Besedilo nad tabelo** (npr. »Na podlagi pogodbe …«) in **Opombe**.
7. **Shrani osnutek** ali **Izdaj račun**. Izdan račun dobi zaporedno številko in se zapiše v KPO knjigo.

**Ustvari zahtevek** (namesto računa) ustvari **zahtevek za plačilo** s povezavo/QR za plačilo s kartico (potreben Stripe – glej `portal-stripe.md`); številko računa dobi šele po plačilu.

Nezavezanec za DDV vidi samo »0 % (ni zavezanec)«.

## Meni »··· Več« pri računu

| Gumb | Kdaj |
|---|---|
| ✅ Označi kot plačano | neplačan, nestorniran račun |
| 💶 Zabeleži delno plačilo | neplačan, nestorniran račun |
| ↩ Razveljavi plačilo | plačan račun |
| ✏️ Uredi račun | samo račun **brez** dodeljene davčne številke (sicer: »Za popravek ga stornirajte in izdajte novega«) |
| 📋 Podvoji račun | ustvari nov osnutek z istimi postavkami |
| 🧾 Prenesi e-račun (XML) | izdan račun (eSLOG/EN 16931 – za spletno banko ali ponudnika e-poti) |
| 📝 Izdaj dobropis | izdan račun (dobropis ima pripono »-D«) |
| 🚫 Storniraj račun | izdan račun (storno ima pripono »-S«; če je bil plačan s Stripe, se denar vrne) |
| 📥 Arhiviraj / 📤 Obnovi iz arhiva | skrije račun iz seznama (»Skrij arhivirane«) |

Ob računu sta še **⬇ PDF** in **📧 Pošlji** (pošiljanje po e-pošti – samo Pro; poslovni stranki se priloži tudi e-račun XML).

## Uvoz računov iz PDF

**Računi → Uvozi iz PDF**: naloži PDF račune iz drugega (zunanjega) sistema; AI prebere številko, stranko, datum, osnovo in DDV. Uvoženi računi so označeni »Uvoženo iz PDF-ja (zunanji sistem)«.

## Zahtevki za plačilo

**Računi → 💳 Zahtevki za plačilo**: seznam poslanih zahtevkov (poslan, plačan, potekel, preklican) z gumbi Pokaži QR, Pošlji (opomnik), Prekliči in povezavo do izdanega računa.

## Omejitve in opozorila

- **Brisanje** je mogoče samo za osnutke in nefiskalizirane storno zapise. Davčno potrjenega računa ni mogoče izbrisati (10-letna hramba) – uporabi storno ali dobropis.
- Račun z dodeljeno davčno številko se ne ureja – storniraj in izdaj novega (lahko s **📋 Podvoji račun**).
- **Brezplačni paket**: največ **5 računov skupaj**; nato se prikaže »Nadgradi →«.
- Samodejno izpolnjevanje stranke: register FURS se osveži vsako jutro (FURS ga objavi ob ~23:00), zato podjetje, registrirano danes, najdeš šele jutri. Če ga v registru ni, se poišče še v **VIES** (samo zavezanci za DDV). Če ni najdeno, se izpiše »Podjetje ni najdeno« / »Iskanje ni uspelo« – podatke vpiši ročno.
- Vrzel v zaporedju številk (npr. zaradi izbrisanega osnutka) je prikazana nad seznamom – za davčni pregled jo je dobro znati pojasniti.
- Pošiljanje po e-pošti zahteva paket Pro.
- **UPN QR koda** je na neplačanih izdanih računih (ne na plačanih, stornih in dobropisih). Vsebuje TRR, znesek, sklic (SI00 + številka računa; če ima številka črke, SI99 – brez sklica), namen »Plačilo računa …« in **ime prejemnika = Ime s.p. iz Nastavitev** (celo, ne skrajšano). Brez veljavnega IBAN-a v **Nastavitve → Bančni podatki** kode ni. Če plačnik po skeniranju vidi **»Ni ujemanja«**, se ime v Nastavitvah ne ujema z uradnim imenom imetnika računa – glej `portal-nastavitve.md`.
- Pri postavkah računa v portalu je od oktobra 2026 na izbiro tudi **5 % DDV** (poleg 22 %, 9,5 %, 0 %), tako pri novem računu kot pri urejanju – enako kot na blagajni (POS).
