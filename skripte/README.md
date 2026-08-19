# Orodja za odkrivanje napak

Tri orodja, ki najdejo napake, ki jih ročno klikanje po aplikaciji spregleda.
Vsa se poženejo iz korena repozitorija.

---

## 1. Preverjanje tipov (najpomembnejše)

```bash
cd apps/web && npx tsc --noEmit
```

Od 19.8.2026 je preverjanje **vklopljeno tudi pri buildu** — Vercel se ne
zgradi, dokler koda ni čista. Prej je bilo izklopljeno (`ignoreBuildErrors:
true`), zato so šle v produkcijo napake, kot je bilo sedem nedefiniranih
spremenljivk: pošiljanje računov strankam se je sesuvalo, cron obveščanja
prav tako, in ničesar ni bilo videti, ker je bil build zelen.

**Kaj ujame:** nedefinirane spremenljivke, napačne tipe, zamenjane argumente
(npr. `showToast('sporočilo', 'error')` namesto `showToast('error', 'sporočilo')`).

---

## 2. Preverjanje imen stolpcev

```bash
node skripte/preveri-stolpce.js
```

Imena stolpcev so v kodi navadni nizi (`.eq('created_at', ...)`), zato jih
prevajalnik ne preveri. Če se stolpec imenuje drugače, Supabase tiho vrne
napako, koda pa pogosto pade na privzeto vrednost.

Tako so **vračila izpadla iz Z-poročila, Poročil in zaključka blagajne**
(`refunds.created_at` namesto `refunded_at`), zadržani računi se sploh niso
odprli, in kartično plačilo se je v poročilih kazalo kot gotovina.

**Pomembno:** ob spremembi sheme baze je treba posodobiti `shema-baze.json`:

```sql
select table_name, string_agg(column_name, ',' order by ordinal_position) as cols
from information_schema.columns
where table_schema = 'public'
group by table_name order by table_name;
```

---

## 3. Preverjanje šumnikov

```bash
node skripte/preveri-sumnike.js
```

Najde slovenska besedila v vmesniku brez šumnikov (»Clanarina«, »Stevilo«,
»Kolicina«).

**Pozor:** ne popravljaj vsega, kar najde. Naslovi strani
(`/ponavljajoci-racuni`), imena datotek (`racun-123.pdf`), sporočila v dnevnik
in navodila za AI morajo ostati brez šumnikov — sprememba bi pokvarila
povezave. Popravljaj samo besedila, ki jih uporabnik dejansko vidi.

---

## Priporočen postopek pred vsakim pushom

```bash
cd apps/web && npx tsc --noEmit    # mora biti brez izpisa
cd .. && node skripte/preveri-stolpce.js
```

Prvo je obvezno (sicer build ne bo šel skozi), drugo traja sekundo.

---

## 4. Testi izračunov

```bash
cd apps/web && npx playwright test tests/ --reporter=list
```

Tečejo v ~6 sekundah, brez brskalnika — uvozijo prave funkcije in preverijo
rezultat.

- `tests/blagajna.spec.ts` — DDV po vseh treh stopnjah, mešan račun, popust
  v evrih, storno, zaključek z vračili
- `tests/davki.spec.ts` — normirani odhodki, dohodninska lestvica, zamudne
  obresti

**Vsak test pokriva napako, ki je bila dejansko najdena.** Zato je ob padcu
iz opisa razvidno, kaj se je pokvarilo nazaj.

Preverjeno je bilo, da testi res ujamejo napako: ob namerni vrnitvi vzorca
`vat_rate || 22` so padli štirje testi, med njimi »celotna pot: oproščena
fizioterapija«.

Izračuni blagajne živijo v `lib/pos-calc.ts` — prej so bili znotraj
`app/pos/page.tsx` (11.000 vrstic, odjemalska komponenta) in jih testi niso
mogli uvoziti.

---

## Kar še ni pokrito

- **Tipi iz Supabase** (`supabase gen types typescript`) — potem bi napačna
  imena stolpcev ujel prevajalnik in skripta 2 ne bi bila potrebna.
- **Fiskalizacija** — pravilnost ZOI podpisa in XML sporočila za FURS ni
  pokrita s testi; preverjena je bila ročno v testnem okolju FURS.
- **Obračun plač** — regres, dodatna splošna olajšava in minimalna osnova
  imajo odprta vprašanja za računovodkinjo, zato testov zanje še ni.
