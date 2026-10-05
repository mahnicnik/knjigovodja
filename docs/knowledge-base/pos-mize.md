---
modul: pos-mize
naslov: POS – prostori in mize, prenos naročila, združevanje miz
vloge: [lastnik, vodja, blagajnik]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (SpacesSection, FloorScreen, TableActionsModal)
posodobljeno: 2026-10-05
---

# POS – prostori in mize

## Nastavitev prostorov in miz (lastnik)

1. **POS → Nastavitve → Prostori & Mize** (razdelek vidi samo lastnik).
2. **Nov prostor**: ime (npr. »Bar«, »Terasa«, »VIP«), barva → **Shrani**.
3. Izberi prostor in dodaj **Novo mizo**: ime (npr. »T1«, »Terasa 3«), število sedežev → **Shrani**.

Zaslon **Prostori & mize** v levem meniju nato pokaže tloris po prostorih. Če prostorov še ni, piše »Dodaj prostore in mize v Nastavitvah → Prostori«.

## Delo z mizo

1. Na zaslonu **Prostori & mize** klikni mizo – odpre se Prodaja z mizo (v traku nad prodajo piše »Miza: …«).
2. Dodajaj artikle; naročilo ostane na mizi, dokler ga ne plačaš.
3. Mizo zapustiš z gumbom ✕ v traku (naročilo ostane odprto na mizi).

## Upravljanje mize (gumb ⋯ v traku »Miza: …«)

- **🔄 Druga miza** – prenese trenutno naročilo na drugo, **prosto** mizo.
- **👤 Zaposleni** – prenese odgovornost za naročilo na drugega zaposlenega (npr. ob menjavi izmene).
- **🔗 Združi** – združi naročilo z druge (zasedene) mize v trenutno naročilo; druga miza se sprosti.

Plačilo po osebah za isto mizo: **Razdeli** v košarici (glej `pos-prodaja-placila.md`).

## Omejitve in opozorila

- Naročila ni mogoče prenesti na mizo, ki že ima odprto naročilo – uporabi **🔗 Združi**.
- Mize z odprtim naročilom ni mogoče izbrisati; najprej zaključi ali prenesi naročilo.
- Zaslon Prostori & mize je v meniju le, če ga vsebuje izbrani **Tip poslovanja** (npr. Restavracija, Bar / Kavarna, Vse v enem) ali ga dodaš pri profilu »Po meri«.
