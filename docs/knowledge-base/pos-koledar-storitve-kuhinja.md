---
modul: pos-koledar-storitve-kuhinja
naslov: POS – storitve, koledar in termini, stranke, kuhinja (KDS), obveščanje strank, opravila, interni akt
vloge: [lastnik, vodja, blagajnik, trener, terapevt]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (StoritveCrudSection, CalendarScreen, BookingModal, CustomersScreen, KuhinjaSection, RojstniDneviSection, AutolockSection, InterniAktSection)
  - apps/web/components/pos/OpravilaScreen.tsx, OpravilaVOknu.tsx
posodobljeno: 2026-10-05
---

# POS – storitve, koledar, stranke, kuhinja in obveščanje

## Storitve (za rezervacije)

**POS → Nastavitve → Storitve & Paketi → + Storitev**: ime (npr. »Masaža«, »Fizioterapija«, »PT«), cena, **trajanje**, DDV (0 % pri zdravstvenih storitvah po 42. členu – obvezen razlog, 9,5 %, 22 %), barva. Storitev se samodejno pojavi tudi v prodaji. Storitev lahko deaktiviraš.

## Koledar in termini

1. Zaslon **Koledar** (pogled dan / teden / mesec, filter po terapevtu ali trenerju).
2. Klikni prazen termin → izberi **stranko**, **storitev**, zaposlenega, opombo → **Rezerviraj**. Če je termin zaseden, lahko izbereš »Vseeno rezerviraj«.
3. Status termina: Načrtovano, Potrjeno, **Prišel/a ✓**, **Ni prišel ✗**, Preklicano.
4. **Uporabi kartico (odšteje obisk ob prihodu)** – ob statusu »Prišel/a« se s kartice stranke odšteje obisk (zamrznjena kartica se ne odšteje).
5. Stranki lahko pošlješ e-mail opomnik za termin.

Koledar prikazuje zaposlene z vlogo **Terapevt** ali **Trener** – dodaš jih v **POS → Nastavitve → Zaposleni & PIN**.

## Stranke

Zaslon **Stranke**: iskanje (ime, telefon, e-mail), filter »Kartica poteče v 7 dneh«, **Pošlji email vsem** (množično obvestilo). Profil stranke ima zavihke: pregled, **Paketi & predplačilo**, zgodovina nakupov, opombe in urejanje profila.

## Kuhinja (KDS) in zaslon za stranke

**POS → Nastavitve → Kuhinja & display**: vklopi **Kuhinjski display** – zaslon **Kuhinja** v meniju nato v realnem času prikazuje aktivna naročila za kuhinjo. Tu je tudi prikaz za stranke (customer display).

## Obveščanje strank (POS → Nastavitve → Obveščanje)

- **Opomniki o poteku kartice** – »Pošlji samodejno« ali »Potrdim sam«.
- **Obvestila o zalogi** – dnevi in ura pošiljanja (brez izbranih dni obvestil ni).
- **Rojstnodnevne čestitke** – samodejno pošiljanje; potrebna je privolitev stranke; besedilo je neobvezno.

## Opravila & sporočila

Zaslon **Opravila & sporočila**: opravila po fazah izmene (odpiranje, med izmeno, zapiranje), kdo je kaj odkljukal in kdaj, ter sporočila lastnika osebju.

## Avtomatsko zaklepanje in interni akt

- **POS → Nastavitve → Avt. zaklepanje**: čas neaktivnosti, po katerem se blagajna zaklene (15 s – Nikoli).
- **POS → Nastavitve → Interni akt** (samo lastnik): interni akt o davčnem potrjevanju računov (izpis); opozorilo, dokler ni označen kot oddan v eDavke.

## Omejitve in opozorila

- Zaslon Koledar je v meniju, če ga vsebuje **Tip poslovanja** (npr. Storitve, Restavracija, Vse v enem) ali ga dodaš pri profilu »Po meri«.
- Za e-mail opomnike in obvestila mora imeti stranka vpisan e-mail.
