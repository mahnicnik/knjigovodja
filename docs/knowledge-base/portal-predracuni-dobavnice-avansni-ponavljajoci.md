---
modul: portal-predracuni-dobavnice-avansni-ponavljajoci
naslov: Portal – predračuni, dobavnice, avansni računi, ponavljajoči računi, e-račun 2028
vloge: [lastnik, admin]
poti: [/predracuni, /predracuni/new, /dobavnice, /dobavnice/new, /avansni-racuni, /ponavljajoci-racuni, /e-racun]
koda:
  - apps/web/app/predracuni/page.tsx, apps/web/app/predracuni/new/page.tsx
  - apps/web/app/dobavnice/page.tsx, apps/web/app/dobavnice/new/page.tsx
  - apps/web/app/avansni-racuni/page.tsx
  - apps/web/app/ponavljajoci-racuni/page.tsx, apps/web/app/api/cron/recurring-invoices
  - apps/web/app/e-racun/page.tsx
posodobljeno: 2026-10-06
---

# Portal – predračuni, dobavnice, avansni in ponavljajoči računi

## Predračuni (ponudbe) – Poslovanje → Predračuni

1. **+ Nov predračun** – stranka, postavke, cene, »Veljavno do«.
2. Status izbereš v spustnem seznamu: Osnutek, Poslano, Sprejeto, Zavrnjeno, Poteklo.
3. Ko stranka ponudbo sprejme: **→ Račun** – predračun se pretvori v osnutek računa (oznaka »✓ Pretvorjeno«).

Predračun ni davčni dokument. Predračuni, ki čakajo na odgovor, so vedno prikazani ne glede na izbrano obdobje.

## Dobavnice – Poslovanje → Dobavnice

1. **+ Nova dobavnica** – prejemnik in dobavljeno blago. Ko vpišeš davčno številko prejemnika, se ime in naslov izpolnita iz registra davčnih zavezancev FURS (kot pri računu – glej `portal-racuni.md`).
2. Neobračunane dobavnice so v sklopu **»Čaka na račun – grupirano po stranki«**.
3. Gumb **📄 Izstavi račun** pri stranki združi vse njene neobračunane dobavnice v **en osnutek računa**; dobavnice dobijo oznako »Zaračunana«.

Dobavnica ni davčni dokument. (POS ima ločen »uvoz dobavnic dobavitelja« za zalogo – glej `pos-zaloga-dobavnice-inventura.md`.)

## Avansni računi – Poslovanje → Avansni računi

1. **+ Nov avansni račun**: stranka, e-mail, opis storitve, **skupna vrednost (€)**, **delež avansa (%)**, datum, rok plačila → **Ustvari avansni račun**.
2. Ko je storitev opravljena: pri avansu **📄 Finalni račun** → **Ustvari finalni račun**. Finalni račun prikaže celotno vrednost, odbitek že plačanega avansa in **preostanek za plačilo**.

Pri izbranem obdobju se odprti avansi zunaj obdobja ne prikažejo – za popoln pregled izberi »Vse«.

## Ponavljajoči računi – Poslovanje → Ponavljajoči računi

1. **+ Nov ponavljajoč račun**: stranka, e-mail stranke, opis storitve, cena, **pogostost** (Tedensko, Mesečno, Četrtletno, Letno), DDV, **naslednja izdaja**, datum konca (neobvezno).
2. Na zapadli datum je račun v sklopu **»Za izdati danes«** z gumbom **→ Izdaj zdaj**; naslednji datum izdaje se samodejno premakne. Samodejno pripravljeni osnutki čakajo na potrditev (opozorilo »ponavljajoč račun čaka na potrditev« je tudi na nadzorni plošči) – preglej jih, preden se pošljejo.
3. Ponavljajoč račun lahko **Pavziraj** ali znova **Aktiviraj**.

Na vrhu: število aktivnih naročnin, mesečni prihodek, za izdati danes.

## E-račun (obveza od 1. 1. 2028)

Stran **E-račun** (`/e-racun`) pojasni zakon ZIERDED: od 1. januarja 2028 so med podjetji obvezni strukturirani e-računi (eSLOG / EN 16931), PDF po e-pošti ne bo dovolj; velja tudi za s.p. brez DDV. V Računku: **Računi → ··· Več → 🧾 Prenesi e-račun (XML)** in samodejna XML priloga ob pošiljanju poslovni stranki.

## Omejitve in opozorila

- Predračun in dobavnica nista davčna dokumenta.
- Datoteke e-računa Računko ne odda neposredno na UJP – XML naložiš v spletno banko ali pri ponudniku e-poti.
- Pri predračunu in ponavljajočem računu so DDV stopnje 22 %, 9,5 %, 5 % in 0 % (enako kot pri izdanih računih, glej `portal-racuni.md`). Avansni računi DDV stopnje trenutno ne prikazujejo kot izbiro – uporabijo 22 % (ali 0 % pri nezavezancu) samodejno.
