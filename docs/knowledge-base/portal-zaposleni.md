---
modul: portal-zaposleni
naslov: Portal – plače in zaposleni, plačilne liste (AI), REK-1, dopust, potni stroški, regres, potni nalogi, evidenca časa
vloge: [lastnik, admin]
poti: [/place, /rek1, /dopust, /potni-stroski, /regres, /potni-nalogi, /cas]
koda:
  - apps/web/app/place/page.tsx, apps/web/app/api/place/parse-payslip (AI branje plačilne liste, Pro)
  - apps/web/app/rek1/page.tsx, apps/web/app/dopust/page.tsx, apps/web/app/potni-stroski/page.tsx
  - apps/web/app/regres/page.tsx, apps/web/app/potni-nalogi/page.tsx, apps/web/app/cas/page.tsx
posodobljeno: 2026-10-05
---

# Portal – zaposleni (meni Zaposleni)

## Plače – Zaposleni → Plače

Gumbi: **🧮 Kalkulator**, **📄 Naloži plačilno listo**, **📋 REK-1**, **+ Dodaj zaposlenega**.

1. **+ Dodaj zaposlenega**: ime, davčna številka, IBAN, bruto plača, vrsta zaposlitve (polni ali krajši delovni čas, študentsko delo).
2. **Plačilna lista** (kalkulator): osnovna plača, nadure (30 %), nočni (30 %), nedeljski (50 %) in praznični (100 %) dodatek → bruto, prispevki delojemalca (ZPIZ 15,50 %, ZZZS 6,36 %, brezposelnost, starševsko, dolgotrajna oskrba 1 %, obvezni zdravstveni prispevek), akontacija dohodnine, potni stroški → **neto izplačilo**; prispevki delodajalca (ZPIZ 8,85 %, ZZZS 6,56 %, poškodbe 0,53 %, starševstvo 0,10 %) → skupni strošek delodajalca.
3. **📄 Naloži plačilno listo** (Pro): AI prebere PDF ali sliko plačilne liste od računovodje, vključno s »Skupaj strošek v breme podjetja«, ki se poknjiži v KPO. Če je PDF zaščiten z geslom, naloži posnetek zaslona.

## REK-1 – Zaposleni → REK-1

Izberi obdobje: povzetek bruto, prispevkov EE in ER, dohodnine in neto po zaposlenem ter **skupna plačilna naloga FURS** (sklic prepiši s plačilnega naloga računovodje). Podatki so iz naložene plačilne liste (natančno) ali ocena iz kalkulatorja. To je **delovni povzetek**, ne uradna eDavki shema – REK-1 odda računovodja (eDavki → Vloge → REK-1) najkasneje na dan izplačila plače.

## Dopust in odsotnosti – Zaposleni → Dopust

**Nova odsotnost**: zaposleni, tip (Letni dopust, Bolniška do 30 dni, Bolniška – nega otroka, Porodniška, Neplačan dopust), od–do, opomba → **Shrani odsotnost**. Pregled: dopust ostalo, bolniška dni, neplačan.

## Potni stroški – Zaposleni → Potni stroški

**Nov potni strošek**: zaposleni, datumi, destinacija, namen, vrsta (kilometrina, dnevnice SLO po urah, dnevnica tujina, nočnina, malica, parkirnina, cestnina/vinjeta, drugo), količina ali znesek po računu. Stran pokaže **neobdavčene zneske 2026** in natisne obračun povračila.

## Regres – Zaposleni → Regres

Za vsakega aktivnega zaposlenega: zaposlen od, delež leta, **znesek regresa** (opozorilo »Pod minimumom!«), neobdavčeni del; označi kot plačan. Spodaj zakonske obveznosti, kot jih prikaže stran: minimalni regres (= minimalna plača 2026), neobdavčeni del (126 % minimalne plače), rok izplačila 1. julij 2026 (za sezonske do 1. novembra).

## Potni nalogi – Zaposleni → Potni nalogi

**+ Nov potni nalog**: zaposleni, namen, destinacija, prevoz (osebni avto, javni prevoz, letalo, drugo), datum odhoda in vrnitve, kilometri, dnevnica, nastanitev, ostali stroški. Statusi: Osnutek, Odobren, Plačan.

## Evidenca časa – Zaposleni → Evidenca časa

**+ Nov vnos**: opis dela, ure, datum, stranka, projekt, urna postavka (€/h), zaračunljivo ali ne. Gumb **→ Račun** pretvori nefakturirane ure v račun (potrebna je urna postavka); vnos dobi oznako »✓ Fakturirano«.

## Omejitve in opozorila

- AI branje plačilne liste zahteva paket **Pro**.
- REK-1 iz Računka je informativen povzetek – uradno ga odda računovodja na eDavkih.
- Mejni zneski (minimalna plača, neobdavčeni zneski) so za leto 2026.
