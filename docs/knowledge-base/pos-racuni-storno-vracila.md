---
modul: pos-racuni-storno-vracila
naslov: POS – izdani računi, ponovni izpis, sprememba plačila, storno in vračilo
vloge: [lastnik, vodja, blagajnik]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (OrdersScreen, VoidModal, RefundModal, ChangePaymentModal)
posodobljeno: 2026-10-05
---

# POS – izdani računi, storno in vračilo

Vsi računi blagajne so na zaslonu **Računi** (levi meni blagajne). Iščeš lahko po številki računa, EOR ali ZOI kodi in po obdobju. Klik na račun odpre podrobnosti: artikli, način plačila, EOR (FURS) in ZOI (zaščitna oznaka) – klik kodo kopira.

## Gumbi pri računu

| Gumb | Kaj naredi | Kdaj je viden |
|---|---|---|
| 🖨️ Ponovni izpis | ponovno natisne račun | vedno |
| 💳 Spremeni plačilo | popravi način plačila (npr. gotovina → kartica) | samo za **današnje** račune, ki niso stornirani |
| 🗑️ Storno | stornira cel račun – izda storno dokument z negativnimi zneski in ga davčno potrdi | samo za **današnje** račune; potrebna pravica »Storno računa« (Lastnik, Vodja) |
| ↩️ Vračilo | delno ali celotno vračilo izbranih artiklov ali zneska | samo za **današnje** račune; potrebna pravica »Vračilo« (Lastnik, Vodja) |

## Storno računa

1. **Računi** → izberi račun → **🗑️ Storno**.
2. Preveri artikle in znesek, vpiši **razlog storna** (npr. napačna naročba).
3. Potrdi. Nastane storno dokument (negativni zneski), ki se davčno potrdi pri FURS.
4. Zaloga se vrne (pri artiklih z normativom se vrnejo surovine). Če je bil račun plačan s Stripe, se denar stranki vrne prek Stripe.

## Vračilo (delno)

1. **Računi** → izberi račun → **↩️ Vračilo**.
2. Izberi artikle za vračilo ali vpiši znesek (ne sme preseči zneska računa) in **razlog vračila**.
3. Potrdi – natisne se **potrdilo o vračilu** z obračunom DDV; dokument se davčno potrdi.

## Sprememba načina plačila

**Računi** → račun → **💳 Spremeni plačilo** → izberi pravi način → shrani. Za spremembo iz ali v **predplačilo** mora biti na računu izbrana stranka (stanje predplačila se popravi).

## Omejitve in opozorila

- **Storno, vračilo in sprememba plačila so na blagajni mogoči samo isti dan**, kot je bil račun izdan (za račune iz prejšnjih dni gumbi niso prikazani).
- Blagajnik (privzete pravice) gumbov Storno in Vračilo ne vidi – storno opravi vodja ali lastnik, ali pa lastnik blagajniku pravico doda (**POS → Nastavitve → Zaposleni & PIN → Dovoljenja**).
- Davčno potrjenega računa ni mogoče izbrisati (10-letna hramba); popravek je vedno storno ali vračilo.
- Storno ali vračilo se zapišeta v KPO knjigo; če to ob stornu ne uspe, se popravek zapiše ob zaključku izmene.
