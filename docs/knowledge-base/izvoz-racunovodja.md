---
modul: izvoz-racunovodja
naslov: Izvoz za računovodjo (XLSX, CSV za Vasco/Pantheon), portal računovodje, povabilo računovodje
vloge: [lastnik, admin, računovodja]
poti: [/izvoz, /racunovodja, /racunovodja/[orgId], /za-racunovodje]
koda:
  - apps/web/app/izvoz/page.tsx, apps/web/app/api/exports/accounting/route.ts, apps/web/lib/accounting-export.ts
  - apps/web/app/racunovodja/page.tsx, apps/web/app/racunovodja/[orgId]/page.tsx
  - apps/web/components/nastavitve/Ekipa.tsx (povabilo z vlogo Računovodja)
posodobljeno: 2026-10-05
---

# Izvoz za računovodjo in portal računovodje

## Izvoz podatkov – Računovodstvo → Izvoz podatkov

1. Izberi **obdobje** in kaj izvoziti: izdani računi, prejeti računi, prihodki, odhodki.
2. Izberi **format**:
   - **Excel (XLSX)** – priporočeno; listi: Izdani računi (KIR), Prejeti računi (KPR), Rekapitulacija ter (kjer so podatki) KPO evidenca in Dnevni zaključki blagajne.
   - **CSV (podpičje)** – 2 datoteki, primerni za uvoz v **Vasco, Pantheon, Minimax, e-računi**.
   - **Excel + CSV (oboje)** – računovodja izbere, kar mu ustreza.
3. **📥 Prenesi datoteke** ali **📧 Pošlji računovodji** (e-mail računovodje in neobvezno ime).

KIR/KPR sta razčlenjena po dejanskih stopnjah DDV (22 %, 9,5 %, 5 %, 0 %, pavšalno nadomestilo 8 %); »DDV za plačilo« v rekapitulaciji je enak kot na strani DDV obračun.

## Povabilo računovodje (lastnik)

**Nastavitve → Ekipa** → vpiši e-mail računovodje → vloga **Računovodja** → **Pošljite povabilo**. Računovodja dobi e-mail (povabilo velja 7 dni), se prijavi ali ustvari račun in dobi dostop samo za branje in izvoz: portal računovodje, izvoz, KPO knjiga, računi in stroški (brez izdajanja ali urejanja računov).

## Portal računovodje – Računovodstvo → Portal strank (vloga Računovodja)

Računovodja vidi seznam strank (zamudniki, nepotrjeni stroški, DDV), išče po imenu ali davčni številki in odpre pregled posamezne stranke (računi, stroški, statistika, POS promet, bančni prilivi, kartični obračuni iz KPO, dnevni zaključki), izvozi XLSX in dodaja opombe. Na vrhu je **povezava za stranke**, ki jo lahko pošlje strankam, da ga povabijo.

## Omejitve in opozorila

- Na voljo sta **XLSX** in **CSV**; strojnega izvoza VOD XML (ne-tekstovni strukturirani format za neposreden uvoz knjižb v Vasco/Pantheon/Opal) ni – predstavitvena stran »Za računovodje« ga od oktobra 2026 zato ne omenja več.
- Računko nima glavne knjige ali dvostavnega knjigovodstva; izvoz je osnova, ki jo računovodja uvozi v svoj program.
- Računovodja ne more izdajati ali urejati računov.
