---
name: update-kb
description: Posodobi bazo znanja Računko asistenta (docs/knowledge-base) po spremembah kode. Uporabi ob koncu vsakega preleta, ki spremeni, kar uporabnik vidi ali dela v aplikaciji (strani, gumbi, nastavitve, postopki, omejitve), ali ko GitHub opomni, da baza ni ažurna.
---

# /update-kb – posodobi bazo znanja asistenta

Računko asistent (gumb »💬 Asistent« v portalu, »?« na blagajni) odgovarja iz dokumentov v `docs/knowledge-base/*.md`. Ob vsakem buildu se zapakirajo v `apps/web/lib/kb/baza.generated.ts` (`apps/web/scripts/zgradi-bazo-znanja.mjs`, prebuild). Zastarel dokument pomeni napačen odgovor uporabniku.

## Koraki

1. **Kaj se je spremenilo od zadnje sinhronizacije:**
   ```
   node apps/web/scripts/kb-vpliv.mjs --od-sinhronizacije
   ```
   Izpiše spremenjene uporabniške datoteke, dokumente, ki jih navajajo (polje `koda` v glavi), in datoteke, ki jih ne navaja noben dokument. Če uporabnik poda drug obseg (npr. `abc123..HEAD`), uporabi tega.

2. **Za vsak prizadeti dokument** preberi `git diff <od>..HEAD -- <datoteke>` in ugotovi, ali se je spremenilo kaj, kar vidi uporabnik:
   imena menijev, zavihkov, gumbov in polj; koraki postopka; kdo kaj sme (vloge, pravice, paket Pro/Pro + POS); omejitve (npr. »samo isti dan«); nove funkcije.
   Notranje spremembe (refaktor, popravek izračuna brez spremembe vmesnika, komentarji) **ne** zahtevajo posodobitve – zapiši, da si jih preveril.

3. **Posodobi dokument** – piši za končnega uporabnika, slovensko, z **natančnimi imeni iz kode** (preveri jih z grep, ne po spominu):
   - ohrani glavo (`modul`, `naslov`, `vloge`, `poti`, `koda`, `posodobljeno`); `posodobljeno` nastavi na današnji datum; dopolni `koda`, če je funkcija v novi datoteki;
   - razdelki: kratek opis, koraki (oštevilčeni), »Omejitve in opozorila« (pasti, ki jih uporabnik težko odkrije sam);
   - opiši **dejansko delovanje kode**, tudi kadar se razlikuje od besedila v aplikaciji – razliko omeni v omejitvah in jo sporoči uporabniku kot morebitno napako.

4. **Nepokrite datoteke** (nov modul ali stran): dodaj v obstoječi dokument ali ustvari nov `docs/knowledge-base/<modul>.md` (ime datoteke = `modul` v glavi) in ga vpiši v tabelo v `_index.md`. Če je to pogosto vprašanje, dodaj vrstico v »Pogosta vprašanja« v `_index.md` (oblika: `- vprašanje | modul.md | pos|portal|vse`).

5. **Zapakiraj in preveri:**
   ```
   cd apps/web
   node scripts/zgradi-bazo-znanja.mjs
   npx playwright test tests/asistent.spec.ts
   ```
   Test preveri tudi, da poti v polju `koda` obstajajo – če datoteke ni več, popravi pot.

6. **Oznaka sinhronizacije:** zapiši trenutni commit (pred svojim commitom) v `docs/knowledge-base/.zadnja-sinhronizacija`:
   ```
   git rev-parse HEAD > docs/knowledge-base/.zadnja-sinhronizacija
   ```

7. **Commit** v istem preletu kot sprememba kode (ali takoj za njim), npr. »Baza znanja: …«. Na koncu povzemi, katere dokumente si spremenil, katere preveril brez sprememb in katere razlike med besedilom v aplikaciji in kodo si našel.

## Pravila

- Asistent fiskalizacijo (FURS) samo opisuje – v dokumentih ne opisuj, kako jo obiti.
- Ne vpisuj skrivnosti, ključev, e-mailov strank ali internih naslovov.
- Baza naj ostane zgoščena (zdaj ~28k tokenov, gre cela v poziv). Ko preraste ~150k tokenov, je čas za iskanje po odsekih (pgvector) – opozori uporabnika.
