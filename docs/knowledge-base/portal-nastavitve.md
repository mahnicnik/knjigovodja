---
modul: portal-nastavitve
naslov: Portal – nastavitve (profil, logotip, DDV & prispevki, bančni podatki, prijava & varnost, API ključi, prenosi, integracije)
vloge: [lastnik, admin]
poti: [/nastavitve, /api-kljuci, /integracije, /prenosi]
koda:
  - apps/web/app/nastavitve/page.tsx (SECTIONS – seznam razdelkov; ?tab=<id> odpre razdelek)
  - apps/web/components/nastavitve/UradnoIme.tsx (opozorilo, ko ime ni enako uradnemu iz registra)
  - apps/web/components/nastavitve/Logotip.tsx, LogotipUrejevalnik.tsx, ApiKljuci.tsx, Integracije.tsx
  - apps/web/components/DvostopenjskaPrijava.tsx, apps/web/app/prenosi/page.tsx
posodobljeno: 2026-10-05
---

# Portal – nastavitve

**Kje so nastavitve?** Klikni **ime podjetja spodaj v levem meniju** (odpre `/nastavitve`). Razdelki na levi:

| Razdelek | Vsebina | Podrobneje |
|---|---|---|
| 🏢 Profil podjetja | ime s.p., davčna številka, e-mail, telefon, naslov; **logotip** za račune | spodaj |
| 📊 DDV & prispevki | DDV status, ID za DDV, obdobje DDV (četrtletno/mesečno), privzet razlog oprostitve, mesečni prispevki | spodaj |
| 🏦 Bančni podatki | IBAN (TRR), BIC/SWIFT – na računih in UPN QR kodah | spodaj |
| 🧾 Davčna blagajna | FURS certifikat, poslovni prostori, naprave, osebje blagajne, test | `furs-fiskalizacija.md` |
| 💳 Plačila s kartico | Stripe Connect (QR na blagajni, zahtevki) | `portal-stripe.md` |
| 👥 Ekipa | člani, vabila, vloge | `ekipa-vloge-osebje.md` |
| 🔐 Prijava & varnost | geslo, dvostopenjska prijava | spodaj |
| ⭐ Naročnina | paket, nadgradnja, Upravljaj naročnino | `portal-stripe.md` |
| 📒 Računovodja portal | dostop računovodje | `izvoz-racunovodja.md` |
| 🔑 API ključi | REST API | spodaj |
| 🔌 Integracije | Stripe, WooCommerce, Shopify | `portal-stripe.md` |
| 📧 E-mail skeniranje | uvoz stroškov iz Gmaila | `portal-stroski-banka-kartice.md` |
| ⬇️ Prenosi | aplikacija za Windows in telefon | spodaj |

## Profil podjetja in logotip

Vpiši podatke podjetja (obvezno ime in davčna številka – izpišejo se na vseh računih) in shrani. V istem razdelku naložiš **logotip**, ki se izpiše na računih (z urejevalnikom za obrez in postavitev).

**Ime s.p. mora biti uradno ime iz registra (AJPES)**, tako kot ga ima banka na računu. To ime gre tudi v **UPN QR kodo** na računih. Banke od oktobra 2025 pred vsakim plačilom preverijo ime prejemnika; če se ne ujema, plačnik ob skeniranju QR kode vidi opozorilo **»Ni ujemanja«** (angl. »The name doesn't match«) in plačilo pogosto opusti. Ko se ime razlikuje od uradnega (npr. »Domen Kocjan s.p.« namesto »HFP, Domen Kocjan s.p.«), se pod poljem **Ime s.p.** pokaže opozorilo z gumbom **Uporabi uradno ime** → nato **Shrani**. Novo ime velja za vse na novo prenesene ali poslane PDF račune; že poslanih PDF-jev ne spremeni – stranki račun pošlji znova (**📧 Pošlji** ali **⬇ PDF**).

## DDV & prispevki

- **DDV zavezanec** (kljukica) in **ID za DDV** (SI…). Zavezanec postaneš pri obdavčljivem prometu nad 60.000 € v zadnjih 12 mesecih (od 1. 1. 2025) ali prostovoljno.
- **Davčno obdobje za DDV**: četrtletno (običajno do 210.000 € letnega prometa) ali mesečno – od tega so odvisni DDV-O obdobja in opomniki.
- Privzeto besedilo razloga za neobračunan DDV (kot ga je svetoval računovodja).
- **Mesečni prispevki**: PIZ, ZZZS, zaposlovanje, starševsko varstvo (€/mes). Kje najti zneske: od računovodje (UPN nalogi) ali na eDavkih (Obračuni → Prispevki za socialno varnost). Sive številke so le primer, ne vnesena vrednost. Zakonski minimum (651,04 €) velja samo za polni s.p.

## Prijava & varnost

Sprememba gesla (vsaj 8 znakov) in **🛡️ Dvostopenjska prijava**: **Vklopi dvostopenjsko prijavo** → skeniraj QR kodo z aplikacijo za avtentikacijo → vpiši 6-mestno kodo → **Potrdi in vklopi**. Shrani **rezervne kode** (lahko ustvariš nove). Če koda ni pravilna, preveri, da je ura na telefonu točna.

## API ključi

**🔑 API vmesnik** → vnesi ime ključa → **Generiraj API ključ**. Ključ se prikaže **samo enkrat** – shrani ga takoj. Pošiljaj ga v glavi `Authorization`. Končne točke: seznam izdanih računov, ustvari nov račun, seznam prejetih računov, finančne statistike. Ključ lahko deaktiviraš ali izbrišeš (integracije z njim prenehajo delovati).

## Prenosi (namizna aplikacija in telefon)

**Nastavitve → Prenosi** (`/prenosi`):
- **Računko POS Desktop za Windows** (Windows 10/11, 64-bit, .exe): prenesi, zaženi namestitev, ob prvem zagonu se prijavi z Računko podatki; posodablja se sama. Podpira neposreden tisk na blagajniški tiskalnik.
- **Android**: namestitev datoteke (Android 8.0+, dovoli nameščanje iz neznanih virov).
- Mac: ni na voljo. iOS: prihaja kmalu.

## Omejitve in opozorila

- Spremembe DDV statusa vplivajo na nove račune in obračune, ne na že izdane.
- Opozorilo »Ni ujemanja« v bančni aplikaciji plačnika pomeni, da se ime prejemnika ne ujema z imenom imetnika računa – ne da je QR koda napačna. Popravek: uradno ime v **Nastavitve → Profil podjetja**. Če je IBAN pravi, lahko plačnik plačilo vseeno potrdi (»Nadaljuj«) – denar pride na isti račun.
- Plačila s kartico, Ekipo in Davčno blagajno običajno ureja lastnik; vloga Admin nima dostopa do nastavitev plačil.
