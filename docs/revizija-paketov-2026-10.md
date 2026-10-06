# Revizija naročniških paketov – v2 (6. 10. 2026)

Veja `claude/adoring-fermat-4b1ilc`. Izhodišče: `main` = `5315714`. **Na `main` in v produkcijsko bazo ni objavljeno nič.**
Prva različica tega poročila (zemljevid, ugotovitve K1–K5) je v zgodovini veje (`2f82a37`, `7573246`); ta različica jo nadomešča po odločitvah lastnika.

## 1. Neprekršljiva pravila in kako so izpolnjena

| Pravilo | Izvedba | Dokaz |
|---|---|---|
| Za obstoječe organizacije se ne spremeni nič | `organizations.obstojeca_pravila` (migracija 182: `ADD COLUMN … DEFAULT true`, nato `SET DEFAULT false` – brez UPDATE, `updated_at` in sprožilci nedotaknjeni). Vsaka nova preverba (koda: `lib/paket.ts` `jeObstojeca`/`dovoljeno`/`zahtevajPaket`; baza: `org_dovoljeno`, `org_je_obstojeca`) se začne z »obstoječa → kot doslej«. Obstoječe preverbe v API so ostale bajt za bajtom enake, nove so samo **dodane**. | `paketi.spec.ts` »Regresija obstojecih« (free, pro, pro_pos, preizkus, iztekel, stanje pred migracijo), »posnetek pred → po«; `paketi-baza.spec.ts` posnetek vrstic pred = po migraciji |
| Varno tudi PRED migracijo (koda gre v produkcijo prej) | `jeObstojeca` = `obstojeca_pravila !== false` → stolpca ni (undefined) ali organizacija ni prebrana (null) = obstoječa. Preverbe berejo `select('*')`, nikoli poimenovanega stolpca. Cron opomnikov ob manjkajočem stolpcu ne naredi nič. | `paketi.spec.ts` »Regresija obstojecih [… brez stolpca / neprebrana]« |
| POS in FURS nespremenjena za vse | `app/pos/**`, `components/pos/**`, `lib/pos-*`, `lib/furs*`, `apps/desktop` – diff prazen. V `app/api/furs/**` in `app/api/pos/**` je edina sprememba **dodana** preverba paketa v `api/furs/invoice` (za obstoječe vedno »dovoljeno«). | `paketi.spec.ts` »Dokaz nespremenjenosti« (git diff od `5315714`) |
| Testi POS/FURS nespremenjeni | Spremenjeni/novi so samo `tests/paketi.spec.ts`, `tests/paketi-baza.spec.ts`, `tests/fiksture/paketi-shema.sql`. | isti test |
| RLS: obstoječih politik ne spreminjaj | Nobena obstoječa politika ni spremenjena ali izbrisana; dodane so samo `AS RESTRICTIVE` politike, ki za obstoječe vrnejo `true`. | `paketi-baza.spec.ts` »182_down … obstojece politike so ostale« |

## 2. Stanje pred spremembami (produkcija, branje 6. 10. 2026)

| Organizacija (id…) | Paket | Preizkus | Stripe | Računov | Blagajna (naročil) |
|---|---|---|---|---|---|
| 1d406efe (ŠIRM) | pro_pos (ročno, do 2099) | – | stranka, brez naročnine | 21 | da (1499, `business_id` 000…001) |
| df50fb82 | pro_pos (ročno) | – | – | 141 | ne |
| 3a46b81e (test) | pro_pos (do 2027-08-27) | – | – | 8 | da (8) |
| c7dd8ca1 | pro (do 2027-08-27) | – | – | 0 | ne |
| 25f794fd | pro_pos (ročno) | – | – | 0 | ne |
| 9fb28881 | **free** | – | – | 0 | **da (7)** – Free, ki uporablja blagajno |
| ed566348 (demo kavarna) | pro_pos (ročno) | – | – | 15 | da (155) |
| 03924ecd | **free** | – | stranka | **45** | ne |

Nobena organizacija nima `trial_ends_at` ali `stripe_subscription_id`. Zaradi 9fb28881 (Free + blagajna) in 03924ecd (Free, 45 računov) je oznaka obstoječih nujna – brez nje bi nova pravila tema dvema zaprla blagajno oziroma izdajo računov.

## 3. Kaj je narejeno (A–H)

| Točka | Narejeno | Datoteke |
|---|---|---|
| A | `obstojeca_pravila`, `org_dovoljeno`, `org_je_obstojeca`, `efektivni_paket` (za obstoječe samo `subscription_status`) | `supabase/migrations/182_revizija_paketov.sql`, `apps/web/lib/paket.ts` |
| B | Nove org.: Free do 5 računov (sprožilec `omeji_brezplacne_racune`; dobropis/dobavnica ne štejeta, velja tudi za service role); zaklep po ceniku (dodane preverbe v API: ai-chat, scan-receipt, banka, kartice, plačilne liste, uvoz PDF, pošiljanje, e-SLOG, izvoz, zaloge, team/invite, change-role, furs/invoice; middleware za `/pos`, `/zaloge`, `/ai`, `/scan`, `/banka` → `/paket`); RLS `orders_insert_paket` (vnos naročil samo Pro + POS); naročnino spreminja samo strežnik; vloge po paketu; vpis v novo org. samo z veljavnim povabilom | migracija 182, `apps/web/app/api/**/route.ts` (samo dodane vrstice), `apps/web/middleware.ts`, `apps/web/app/paket/page.tsx`, `apps/web/app/invoices/page.tsx`, `apps/web/app/invoices/new/page.tsx`, `apps/web/components/nastavitve/Ekipa.tsx` |
| C | `register.tsx` ne vstavlja več organizacije/članstva; ime podjetja in davčna gresta v metapodatke `signUp`, `handle_new_user` ju uporabi | `apps/mobile/app/register.tsx`, migracija 182 (§7) |
| D | Checkout: `subscription_data.trial_end = trial_ends_at`, če je do izteka > 48 h (Stripe zahteva vsaj 48 h; sicer takojšnje plačilo kot doslej). Obstoječe org. nimajo `trial_ends_at` → seja enaka kot prej | `apps/web/app/api/stripe/checkout/route.ts` |
| E | Cenik: »Evidenca DDV in KPO knjiga« tudi v Brezplačno; Nastavitve: »do 5 računov/mesec« → »do 5 računov«. KPO/DDV nikjer zaklenjena | `apps/web/components/landing/podatki.ts`, `apps/web/app/nastavitve/page.tsx` |
| F | Opomnik 3 dni prej in na dan izteka (Resend, enkrat; samo `obstojeca_pravila = false`); cron `10 7 * * *`. Webhook `charge.refunded`: zapis v dnevnik + e-pošta na `PLATFORMA_OBVESTILA_EMAIL` (privzeto support@računko.si), dostop nespremenjen | `apps/web/lib/opomniki-preizkusa.ts`, `apps/web/app/api/cron/opomniki-preizkusa/route.ts`, `apps/web/vercel.json`, `apps/web/app/api/stripe/webhook/route.ts` |
| G | `checkout` in `portal` pišeta `stripe_customer_id` s service role (v isti objavi kode, **pred** migracijo) | `apps/web/app/api/stripe/checkout/route.ts`, `apps/web/app/api/stripe/portal/route.ts` |
| H | Cen ne spreminjam – glej §6 | – |
| Webhook (nove org.) | Dogodki novih organizacij: sveže stanje iz Stripa, upoštevan `status`, stara naročnina ne prepiše nove. Obstoječe in neprepoznane gredo skozi **nespremenjeno** staro kodo (v datoteki ni odstranjene vrstice) | `apps/web/lib/narocnina-stripe.ts`, webhook |
| Baza znanja | portal-stripe, portal-racuni, ekipa-vloge-osebje, izvoz-racunovodja, pos-osnove, _index – z jasnim »samo računi, odprti po uvedbi« | `docs/knowledge-base/*` |

## 4. Izpuščeno in zakaj

1. **K1 (vpis v tujo organizacijo) in K2 (lastnik sam spremeni paket) ostaneta odprta za OBSTOJEČE organizacije.** Po pravilu 1 in točki A se zanje ne sme spremeniti nič; zaprta sta samo za nove. To je resna varnostna luknja (dostop do podatkov vseh 8 organizacij, tudi ŠIRM) – **potrebna je tvoja izrecna odločitev**, da se politika `users_can_insert_members` (`WITH CHECK true`) zapre tudi za obstoječe.
2. **Napačne prikazane cene** (`UpgradeModal` popravljen na 12,99/29,99 € po potrditvi lastnika; ostaja `Prenosi` 24,99 €, neuporabljen `ProGate`) in kartica Free v Nastavitvah (»Neomejeni računi«, »FURS fiskalizacija«) – niso bile na seznamu odločitev, cene so na seznamu »ne spreminjaj«. Popravek je samo besedilo (zaračuna se vedno cena v Stripu); čaka tvojo odločitev.
3. **Supabase branch**: `create_branch` je dvakrat potekel (timeout), branch ni nastal (verjetno branching na projektu ni omogočen). Migracija in 182_down sta zato preizkušeni na lokalnem PostgreSQL 16 s posnetkom produkcijskih politik/funkcij (24/24). Preverjeno (samo branje) na produkciji: vsi uporabljeni stolpci obstajajo, imena funkcij/politik niso zasedena. **Testa obstoječe Pro + POS s FURS in Z-poročilom na branchu ni bilo mogoče izvesti** – za to omogoči branching ali obnovi projekt »racunko test« in povej, naj nadaljujem.
4. **Nove preverbe v `api/pos/import-delivery`, `api/pos/parse-cenik`, `api/furs/confirm`** niso dodane – tam preverba paketa že obstaja; nova bi dodala samo upoštevanje izteklega preizkusa (≤ 24 h do nočnega pg_cron). Manj posegov v POS/FURS.
5. **`lib/stripe-connect.ts`** (QR plačilo, zahtevki) nespremenjen – iztekel preizkus nove org. ostane do nočnega pg_cron.
6. **Vrsta FURS offline**: nova org., ki bi izdala račun brez povezave tik pred iztekom preizkusa, ga po izteku ne bi mogla naknadno prijaviti (`api/furs/invoice` zavrne). Redek primer; obstoječih ne zadeva.
7. **Pred tem predlagane izboljšave**, ki niso del odločitev (role whitelist v `team/invite`, preimenovanje ProGate …), so umaknjene.

## 5. Objava – vrstni red (ob tvoji potrditvi)

1. Varnostna kopija baze (Supabase → Database → Backups / `pg_dump`).
2. Objava kode (merge na `main` → Vercel). Koda je varna brez migracije.
3. Migracija `182_revizija_paketov.sql`.
4. Takojšnja preverba: `select count(*) filter (where obstojeca_pravila), count(*) from organizations;` (= 8/8); ŠIRM blagajna + FURS; račun v obstoječi Free (03924ecd).
5. Ob napaki: `182_revizija_paketov_down.sql` (koda deluje tudi brez stolpca).
6. Stripe: v webhooku računa omogoči dogodek `charge.refunded` (sicer ga Stripe ne pošlje); po želji nastavi `PLATFORMA_OBVESTILA_EMAIL`.

## 6. Cene za ročno preverbo (H)

| Mesto | Pro mesečno | Pro letno | Pro + POS mesečno | Pro + POS letno |
|---|---|---|---|---|
| Landing `components/landing/podatki.ts` | 12,99 € | 129,90 € | 29,99 € | 299,90 € |
| Nastavitve → Naročnina, `UpgradeButton` | 12,99 € | 129,90 € | 29,99 € | 299,90 € |
| `UpgradeModal` (okno ob omejitvi) | 12,99 € (popravljeno, prej 9,99) | – | 29,99 € (popravljeno, prej 24,99) | – |
| `Prenosi` | – | – | **24,99 €** | – |
| Stripe (env v Vercelu, vrednosti so skrite) | `STRIPE_PRO_PRICE_ID` (prod + preview) | `STRIPE_PRO_YEARLY_PRICE_ID` (**samo prod**) | `STRIPE_PRO_POS_PRICE_ID` (prod + preview) | `STRIPE_PRO_POS_YEARLY_PRICE_ID` (**samo prod**) |

Preveri: `stripe prices retrieve <vrednost>` za vse 4. V previewu letnih cen ni – letni nakup v previewu vrne »Ta paket trenutno ni na voljo«.

## 7. Testi

| Nabor | Rezultat |
|---|---|
| `tests/paketi.spec.ts` (regresija obstoječih, git-diff dokaz, cenik za nove, webhook, opomniki) | 45/45 |
| `tests/paketi-baza.spec.ts` (lokalni PostgreSQL: posnetek pred = po, obstoječa Free 46. račun, Free z blagajno, nova Free 6. račun zavrnjen, registracija splet/mobilna = 1 organizacija + 14 dni, 182_down, idempotentnost) | 24/24 |
| `tests/asistent.spec.ts` | 53/53 |
| Celoten nabor | 809 uspešnih, 8 neuspešnih – **istih 8 pade na `5315714`** (testi proti živi strani `racunko.spec.ts`, `sandbox.spec.ts` in datumsko odvisen `ujemanje.spec.ts:3041`); testi POS/FURS (`blagajna`, `furs-rezervacija`, `stevilcenje-*`, `z-porocilo`, `pos-kpo`, `stripe-connect`, `zahtevki`, `zivi-nacin`) zeleni in nespremenjeni |
