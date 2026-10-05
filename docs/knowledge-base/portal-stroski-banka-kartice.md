---
modul: portal-stroski-banka-kartice
naslov: Portal – stroški, skeniranje računov (AI), e-mail skeniranje (Gmail), bančni uvoz, kartični obračuni
vloge: [lastnik, admin]
poti: [/expenses, /scan, /nastavitve?tab=email, /banka, /kartice]
koda:
  - apps/web/app/expenses/page.tsx, apps/web/app/scan/page.tsx, apps/web/app/api/scan-receipt
  - apps/web/components/nastavitve/EmailSkeniranje.tsx, apps/web/app/api/auth/gmail, apps/web/app/api/email-scan
  - apps/web/app/banka/page.tsx, apps/web/app/api/banka/parse-pdf
  - apps/web/app/kartice/page.tsx, apps/web/app/api/kartice/parse-statement
posodobljeno: 2026-10-05
---

# Portal – stroški, skeniranje, banka in kartice

## Stroški – Poslovanje → Stroški

1. **Nov strošek / prejet račun**: dobavitelj, datum računa, znesek brez DDV, **DDV stopnja** (22 %, 9,5 %, 0 % brez DDV), kategorija, opis.
2. **Shrani strošek**. Strošek se zapiše tudi v KPO knjigo; vhodni DDV se upošteva v DDV obračunu (»Odšteje se od DDV dolga«).
3. Klik na strošek ga odpre za urejanje (**Posodobi strošek**).

Nezavezanec za DDV vpiše samo »Znesek stroška« – DDV se ne prikaže. Kategorija (Pisarniški material, Programska oprema, Transport, Prehrana, Marketing …) vpliva na KPO in poročila.

## Skeniranje računa z AI – Skeniraj račun (Pro)

1. Meni **Skeniraj račun** (`/scan`) → fotografiraj ali naloži račun (JPG, PNG, PDF, HEIC z iPhona).
2. AI prebere dobavitelja, datum, znesek, DDV in kategorijo – kartica »✓ AI je prebral podatke«.
3. Preveri in po potrebi popravi → **Preverite in potrdite** → strošek je shranjen.

**Paketni uvoz več PDF računov**: izberi več PDF datotek hkrati – AI vsakega prebere in **samodejno doda med stroške** (brez posamične potrditve).

## E-mail skeniranje stroškov (Gmail) – Nastavitve → E-mail skeniranje

Samodejni uvoz stroškov iz e-poštnih prilog.

1. **Nastavitve → E-mail skeniranje** → **+ Poveži Gmail** (prijava z Google računom in dovoljenje za branje pošte).
2. Pri povezanem računu izberi **Urnik skeniranja**: Dnevno, Tedensko, Mesečno ali Po meri (cron izraz).
3. Neobvezno: **Specifični pošiljatelji** (npr. racuni@dobavitelj.si) – skenira samo njihove e-maile.
4. Za pregled za nazaj: **preveri določen datumski razpon** (npr. od začetka leta). Že obdelane priloge se preskočijo – dvojnikov ne bo.
5. Najdeni računi čakajo v pregledu: **📄 Predogled**, **Potrdi in dodaj med stroške**, **Zavrni**. Če AI meni, da priloga ni račun (dobavnica, izpisek …), je v sklopu »Ostale priloge iz e-pošte« – lahko jo dodaš ročno.

Povezavo odstraniš s **Prekini povezavo**. Zavrnjene predloge lahko obnoviš; pošiljatelja lahko označiš »vedno zavrni«.

## Bančni uvoz – Poslovanje → Bančni uvoz

1. **1. Izberite banko** (NLB, SKB, Nova KBM, Sparkasse, Addiko, Delavska hranilnica, Intesa Sanpaolo, Gorenjska banka …) ali **Samodejno zaznaj**.
2. **2. Naložite izpisek** – CSV, TXT, XML (camt.053) za vse pakete; **PDF samo Pro** (AI branje). Lahko več datotek naenkrat. **Kako izvoziti izpisek** pokaže navodila za izbrano banko.
3. Prilivi se samodejno ujemajo z neplačanimi računi (po znesku, datumu, referenci) – »Ujeto z računi« / »Neujeto«.
4. Za neujete vrstice izberi kategorijo; pri prilivu povej, ali je plačilo prodaje z DDV (0 % = posojilo, polog lastnika, vračilo …). Notranji promet se ne knjiži; plačilo plače se le označi kot plačano (strošek je že iz plačilne liste).
5. Potrdi knjiženje – ujeti računi se označijo kot plačani, ostalo gre v KPO.

## Kartični obračuni – Poslovanje → Kartice

Za promet prek POS terminalov in procesorjev (SumUp, Worldline/Payten, NLB, SKB, Stripe, drugo).

1. **Vnesi kartični obračun**: procesor, obdobje od–do, **bruto prodaja** (kar so stranke plačale), število transakcij, opombe. Provizija in neto nakazilo na TRR se izračunata.
2. Shrani: bruto gre v KPO kot prihodek, provizija kot strošek. Izberi **DDV stopnjo kartičnega prometa**.
3. **Paketni uvoz več izpiskov** (PDF ali slike, Pro) – AI prebere in samodejno knjiži.

## Omejitve in opozorila

- AI skeniranje, PDF bančni izpiski in kartični izpiski z AI zahtevajo paket **Pro**.
- Če je bilo izplačilo kartičnega obračuna že uvoženo iz banke kot prihodek, ga Računko pretvori v kartični prihodek (bruto) – promet ni štet dvakrat.
