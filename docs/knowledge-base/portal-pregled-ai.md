---
modul: portal-pregled-ai
naslov: Portal – nadzorna plošča, mesečni vodič, rokovnik, opomniki za zamude, AI računovodja, onboarding, pomoč
vloge: [lastnik, admin]
poti: [/dashboard, /vodic, /rokovnik, /opomniki, /ai, /onboarding, /dobrodosli]
koda:
  - apps/web/app/dashboard/page.tsx, apps/web/app/vodic/page.tsx, apps/web/app/rokovnik/page.tsx
  - apps/web/app/opomniki/page.tsx, apps/web/app/ai/page.tsx, apps/web/app/api/ai-chat
  - apps/web/app/onboarding/page.tsx, apps/web/components/PageHelp.tsx (Pomoč + Vprašaj Računko)
posodobljeno: 2026-10-05
---

# Portal – pregled, roki, AI in pomoč (meni Pregled)

## Nadzorna plošča – Pregled → Dashboard

Prihodki in odhodki meseca (brez DDV; prihodke lahko razdeliš po virih: Računi, Blagajna, Drugo), »Stranke vam dolgujejo« (z zamudami), **pretok denarja za naslednjih 30 dni** (pričakovani prilivi in odlivi; vneseš lahko stanje na računu za realno napoved), opozorila na roke (prispevki do 20., DDV-O v mesecu oddaje, ponavljajoči računi, ki čakajo na potrditev). Spodaj vrstica **Hitro**: Skeniraj strošek, Prispevki QR, Vprašaj AI, Vodič.

## Mesečni vodič – Pregled → Mesečni vodič

Seznam opravil za mesec s kljukicami (20–40 minut): roki, izdani računi, dnevni zaključki blagajne, kartični obračuni, bančni izpisek, prejeti računi, plače in REK-1, prispevki, DDV.

## Rokovnik – Pregled → Rokovnik

Davčni roki meseca z oznako »Opravljeno« in ključni letni roki: prispevki do 20. v naslednjem mesecu, REK-1 pred vsakim izplačilom plače, **DDV-O Q1 do 30. 4., Q2 do 31. 7., Q3 do 31. 10., Q4 do 31. 1.**, regres do 1. 7., DDD napoved do 31. 3., popis zaloge 31. 12.

## Opomniki za zamude – Pregled → Opomniki

Seznam zapadlih neplačanih računov (število, skupni dolg), **zakonske zamudne obresti** (TOM + 8 %) in priprava opomina (1., 2. ali zadnji opomin z rokom plačila) s plačilnimi podatki (TRR, sklic, namen, znesek).

## AI računovodja – Pregled → AI računovodja (Pro)

Klepet za **davčna in računovodska vprašanja** (slovensko davčno pravo 2026), ki pozna podatke podjetja (prihodki YTD, odhodki, dobiček, neplačano, zamude, prispevki). Primeri: »Koliko dohodnine bom plačal letos?«, »Kateri stroški so davčno priznani?«, »Ali mi bolj ustreza s.p. ali d.o.o.?«.

To je **drugo orodje kot Računko asistent**: asistent pomaga pri *uporabi aplikacije* (kje je gumb, kako se kaj nastavi), AI računovodja svetuje pri *davkih*.

## Pomoč in Računko asistent

V meniju je postavka **Pomoč za to stran**, ki odpre okno z zavihkoma **Navodila** (opis trenutne strani) in **Vprašaj Računko** (asistent za uporabo aplikacije). Če asistent ne zna pomagati, gumb **Pošlji podpori** pošlje pogovor razvijalcem Računka po e-pošti.

## Onboarding (prvi zagon)

Ob registraciji vprašalnik: pravna oblika (s.p., d.o.o./d.n.o., zavod/društvo), DDV status, dejavnosti, zaposleni, davčni sistem (normirani 80 %, normirani 40 %, dejanski stroški) in dodatni moduli (službeni avto, potni stroški, zaloga, osnovna sredstva, blagajna/POS, reprezentanca …). Glede na odgovore se v meniju prikažejo samo potrebni moduli – meni lahko kasneje prilagodiš z gumbom **Prilagodi meni** (zgoraj v levem meniju).

## Omejitve in opozorila

- AI računovodja zahteva paket **Pro**; Računko asistent (pomoč pri uporabi) je na voljo vsem paketom.
- Vprašalnik onboardinga skrije module, ki jih ne potrebuješ (npr. KPO pri d.o.o.); če modula v meniju ni, preveri **Prilagodi meni**.
