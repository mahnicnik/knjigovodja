---
modul: portal-evidence-porocila
naslov: Portal – poročila, statistika, kilometrina, zaloge (portal), amortizacija, reprezentanca, službeni avto
vloge: [lastnik, admin]
poti: [/porocila, /statistika, /kilometrina, /zaloge, /zaloga, /amortizacija, /reprezentanca, /avto]
koda:
  - apps/web/app/porocila/page.tsx, apps/web/app/statistika/page.tsx
  - apps/web/app/kilometrina/page.tsx, apps/web/app/zaloge/page.tsx (/zaloga preusmeri sem)
  - apps/web/app/amortizacija/page.tsx, apps/web/app/reprezentanca/page.tsx, apps/web/app/avto/page.tsx
posodobljeno: 2026-10-05
---

# Portal – evidence in poročila (meni Evidenca)

## Poročila – Evidenca → Poročila

Ploščice: prihodki, odhodki, dobiček, **DDV dolgovan** ali **DDV za vračilo**, marža. Zavihki: **📊 Izkaz P&L** (neto prihodki, DDV, bruto; stroški), **📅 Mesečno**, **👥 Po strankah**, **🗂 Po kategorijah** (tudi po DDV stopnjah).

## Statistika – Pregled → Statistika

Grafi prihodkov in odhodkov po mesecih, odhodki po kategorijah, skupaj fakturirano, top stranke.

## Kilometrina – Evidenca → Kilometrina

**Nov potni nalog** za lastnika: datum, namen, odhod iz, cilj, razdalja (enosmerno), povratna pot, **vrsta poti**:
- **Službena pot** (obisk stranke, sejem, teren) – 0,43 €/km neobdavčeno, potreben potni nalog;
- **Prevoz na delo** (dom ↔ stalno delovno mesto) – 0,21 €/km.
Stran izračuna km in znesek ter natisne potni nalog. (Potni nalogi za **zaposlene** so v **Zaposleni → Potni nalogi**.)

## Zaloge (portal) – Evidenca → Zaloga

Enostavna zaloga v portalu (ločena od zaloge POS blagajne): artikli (SKU, kategorija, enota, nabavna in prodajna cena, DDV, minimalna zaloga), gibanja **⬆ Prevzem**, **⬇ Izdaja**, **⚖ Popravek**, **📄 Uvozi dobavnico**, **✍️ Ročni vnos** dobavnice, statistika (vrednost nabave in prodaje, marža, top artikli, »Potrebno naročiti«).

Zaloga POS blagajne (artikli, surovine, normativi) je ločena – v blagajni na zaslonu **Zaloga** (glej `pos-zaloga-dobavnice-inventura.md`).

## Amortizacija – Evidenca → Amortizacija

**Novo osnovno sredstvo**: naziv, kategorija (IT oprema, osebni avtomobil, stroji, pohištvo, stavba, programska oprema, drugo), nabavna vrednost, datum nakupa → razpored amortizacije in davčno priznani strošek za DDD. Izbris sredstva ne izbriše že poknjiženega stroška v KPO.

## Reprezentanca – Evidenca → Reprezentanca

**Nov reprezentančni strošek**: datum, kategorija (poslovno kosilo, darilo, zabava, nastanitev partnerja, drugo), opis, dobavitelj, **prisotni**, **poslovni namen**, znesek. Davčno je priznano **50 %** – stran pokaže priznani in nepriznani del.

## Službeni avto – Evidenca → Službeni avto

Mesečna evidenca km (poslovno / zasebno), nabavna vrednost avta → **boniteta** (1,5 % nabavne vrednosti na mesec × delež zasebne rabe), poslovni delež za odbitek DDV, poročanje bonitete na REK-1 (šifra 1150).

## Omejitve in opozorila

- Zneski kilometrine in reprezentance so po pravilih za leto 2026, kot jih prikaže stran.
- Za davčne odločitve (npr. ali se splača boniteta) uporabi **AI računovodja** ali vprašaj računovodjo.
