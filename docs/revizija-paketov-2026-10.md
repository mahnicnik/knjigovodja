# Revizija naročniških paketov (6. 10. 2026)

Stanje kode na `5315714` in produkcijske baze (projekt Supabase »Knjigovodja«, samo branje).
Legenda: ✅ zaščiteno na strežniku · ⚠️ samo UI · ❌ ni zaščiteno nikjer.
Stolpec »Po popravku« opisuje stanje na veji `claude/adoring-fermat-4b1ilc`.

## 0. Najpomembnejše ugotovitve (kritično)

| # | Ugotovitev | Posledica |
|---|---|---|
| K1 | RLS `org_members` ima politiko **`users_can_insert_members` z `WITH CHECK (true)`**. | Vsak prijavljen uporabnik se lahko iz brskalnika vpiše kot `owner` v **katerokoli** organizacijo (z znanim `org_id`) → poln dostop do tujih računov, KPO, plač. Hkrati obide paket (vpis v tujo Pro + POS organizacijo). |
| K2 | Lastnik/admin lahko prek RLS (`organizations_update_owner_admin`) sam posodobi **`subscription_status`, `trial_ends_at`, `plan_expires_at`, `stripe_*`**. Sprožilec `zasciti_stripe_connect_stolpce` ščiti samo Connect stolpce. | `supabase.from('organizations').update({subscription_status:'pro_pos', trial_ends_at:null})` v konzoli = Pro + POS za vedno, zastonj. Politika `Users can insert org` (`WITH CHECK true`) dovoli tudi novo organizacijo z `pro_pos`. |
| K3 | Blagajna nima **nobene** preverbe paketa: ne `/pos` (stran), ne `/api/furs/invoice` (davčno potrjevanje blagajne), ne `/api/pos/sync-income`, ne `/api/zaloge/uvoz-dobavnice`. Namizna aplikacija samo odpre `/pos`; mobilna dela neposredno s Supabase. | Pro in Free uporabnik lahko uporablja celotno blagajno s FURS. |
| K4 | Omejitev 5 računov je **samo v brskalniku** (`invoices/new` šteje vse vrstice, vključno z osnutki in dobropisi). Račune vstavljajo tudi avansni računi, podvajanje, uvoz, ponavljajoči računi (cron), `/api/v1/invoices`. | 6. račun se da izdati z drugo potjo ali neposrednim klicem Supabase. |
| K5 | Paket se nikjer ne izračuna iz `trial_ends_at`; uporablja se samo `subscription_status`. Iztek preizkusa izvede samo `pg_cron` posel `zakljuci-iztekle-preizkuse-dnevno` (03:17 UTC). | Če posel ne teče, preizkus ostane `pro_pos` za vedno. Do 24 h po izteku ima organizacija še ves dostop. |

## 1. Zemljevid branja paketa

| Mesto | Kaj bere | Opomba |
|---|---|---|
| `lib/useSubscription.ts` | `subscription_status` prek `.maybeSingle()` na `org_members` | Pri več organizacijah vrne napako → `free`; ne upošteva aktivne organizacije ne `trial_ends_at`. |
| `components/ProGate.tsx` | `useSubscription` | **Nikjer uporabljen**; cene v besedilu zastarele (9,99 € / 24,99 €). |
| `lib/stripe-connect.ts` `preveriPogoje` | `paketPos`, `paketPortal` | Strežnik; uporablja `/api/pos/stripe/placilo` in zahtevki. |
| `app/nastavitve/page.tsx` | `isPro`, `isProPos`, `jeDejanskoPlacano` | Besedilo »do 5 računov/mesec« (napačno), kartica Free obljublja »Neomejeni računi, FURS fiskalizacija« (napačno). |
| `app/invoices/new/page.tsx`, `app/invoices/page.tsx` | `subscription_status` | Edina omejitev 5 računov (samo UI). |
| `app/dashboard/page.tsx` | `trial_ends_at`, `stripe_subscription_id` | Pasica preizkusa. |
| `app/dobrodosli`, `app/prenosi` | `subscription_status` | Samo prikaz. |
| API (Pro): `ai-chat`, `scan-receipt`, `banka/parse-pdf`, `kartice/parse-statement`, `place/parse-payslip`, `invoices/import-pdf`, `invoices/[id]/send`, `furs/confirm` | `subscription_status ∈ {pro, pro_pos}` | ✅, a brez upoštevanja izteklega preizkusa (K5). |
| API (POS): `pos/import-delivery`, `pos/parse-cenik`, `pos/stripe/placilo` | `= pro_pos` | ✅ (K5). |
| `api/support-chat` | oznaka paketa za asistenta | Samo prikaz. |
| `api/stripe/checkout`, `portal`, `webhook` | `stripe_*`, piše paket | Glej §3. |
| Baza: `handle_new_user` | ob registraciji `pro_pos`, `trial_ends_at = now() + 14 days` | |
| Baza: `zakljuci_iztekle_preizkuse` + `cron.job` | iztek preizkusa → `free` | |
| `middleware.ts` | samo vloge, ne paketa | |
| `apps/desktop/main.js` | odpre `https://računko.si/pos` | brez lastne preverbe |
| `apps/mobile` | neposredno Supabase (`orders`), `/api/furs/invoice` | brez preverbe; `register.tsx` ustvari **drugo** organizacijo poleg tiste iz `handle_new_user` |

## 2. Funkcija s cenika → zaščita

| Funkcija (cenik) | UI | Strežnik (pred) | Stanje pred | Po popravku |
|---|---|---|---|---|
| Free: do 5 računov | `invoices/new` (šteje tudi osnutke/dobropise) | – | ⚠️ | ✅ sprožilec `omeji_brezplacne_racune` (šteje `invoice_type='invoice'`; dobropis/storno in dobavnice ne štejejo) |
| Free: brez FURS | – | `furs/confirm` | ✅ (K5) | ✅ + `furs/invoice` |
| Free: brez e-pošte | gumb skrit | `invoices/[id]/send` | ✅ (K5) | ✅ |
| Pro: skener stroškov | – | `scan-receipt` | ✅ (K5) | ✅ + stran `/scan` |
| Pro: glasovni vnos | – | ni ločene poti (brskalnik) | ❌ | ❌ odprto (samo brskalnik, brez strežniškega klica) |
| Pro: AI računovodja | – | `ai-chat` | ✅ (K5) | ✅ + stran `/ai` |
| Pro: uvoz bančnega izpiska | – | `banka/parse-pdf` (PDF); CSV se bere v brskalniku | ⚠️ | ✅ PDF + stran `/banka` (middleware) |
| Pro: e-SLOG | – | `invoices/[id]/eracun` | ❌ | ✅ |
| Pro: DDV evidenca / KPO | – | neposredno Supabase | ❌ | ❌ odprto – namerno: KPO je zakonska evidenca, zaklep branja bi kršil »podatki ostanejo dostopni«. Odločitev potrebna. |
| Pro: izvoz za računovodjo | – | `exports/accounting` | ❌ | ✅ |
| Pro: dostop za računovodjo | – | `team/invite` | ❌ | ✅ (vloga `accountant`/`viewer` zahteva Pro) |
| Pro: zahtevki za plačilo s kartico | `PlacilaStripe` | `preveriPogoje.paketPortal` | ✅ (K5) | ✅ |
| POS: blagajna `/pos` | – | – | ❌ | ✅ middleware + `furs/invoice`, `pos/sync-income` |
| POS: mize/tloris, delitev, popusti, kuhinjski zaslon | znotraj `/pos` | neposredno Supabase (`orders`) | ❌ | ⚠️ zaprta stran `/pos`; RLS na `orders` ostaja odprto (mobilna aplikacija) |
| POS: kartica prek QR | `StripePlacilo` | `pos/stripe/placilo` | ✅ (K5) | ✅ |
| POS: dobavnice/zaloge/normativi/inventura | – | `pos/import-delivery` ✅, `zaloge/uvoz-dobavnice` ❌, `/zaloge` Supabase | ⚠️ | ✅ API + stran `/zaloge` |
| POS: člani/paketi/koledar | znotraj `/pos` | Supabase | ❌ | ⚠️ (zaprta stran `/pos`) |
| POS: ekipa s PIN | – | `team/invite` (cashier) | ❌ | ✅ vloga `cashier` zahteva Pro + POS |
| POS: namizna / mobilna aplikacija | – | – | ❌ | namizna ✅ (odpre `/pos`); mobilna ❌ odprto (RLS) |
| Uveljavitev paketa nasploh | – | `subscription_status` urejajo lastniki sami (K2) | ❌ | ✅ sprožilec `zasciti_narocnino` |
| Vloge ne obidejo paketa | – | vpis v tujo organizacijo (K1) | ❌ | ✅ politika `org_members` (samo nova lastna org ali veljavno povabilo) |

## 3. Preizkus 14 dni

- **Nastavitev:** `handle_new_user` → `subscription_status='pro_pos'`, `trial_ends_at = now() + interval '14 days'` (timestamptz, UTC – natanko 14 × 24 h od registracije; časovni pas ni pomemben). ✅
- **Iztek:** `pg_cron` `17 3 * * *` UTC → `zakljuci_iztekle_preizkuse()` postavi `free`, `trial_ends_at=null`, razen če je `stripe_subscription_id`. Podatki se ne brišejo. ✅
- **Če cron ne teče:** pred popravkom ostane `pro_pos` za vedno (K5). **Popravek:** `lib/paket.ts` `efektivniPaket()` in SQL `efektivni_paket()` iztekli preizkus brez plačila takoj obravnavata kot `free` – na strežniku in v UI; cron je samo še pospravljanje.
- **Podatki ob izteku:** nič se ne briše; računi, KPO, zaključki ostanejo berljivi; storno, ponovno pošiljanje FURS (`furs/void`, `furs/resubmit*`) ostaneta dovoljena tudi na Free (zakonska obveznost). ✅
- **Opomniki:** samo pasica na nadzorni plošči. **Ni e-pošte pred iztekom** (Resend). ❌ odprto.
- **Ponovitev preizkusa:** nova e-pošta = nov preizkus (sprožilec). Pred popravkom tudi nova organizacija z `pro_pos` prek RLS (K2) ali vpis v tujo (K1). Po popravku: nova organizacija iz brskalnika (mobilna registracija) je vedno `free`.

## 4. Stripe

| Tema | Stanje | Po popravku |
|---|---|---|
| Checkout za 4 cene | ✅ izbira cene po `plan` + `period`; `metadata.org_id` na seji in naročnini | brez spremembe |
| Ali cene v Stripu ustrezajo ceniku (12,99/129,90/29,99/299,90) | **Ni preverljivo iz tega okolja** (ni Stripe ključa). Preveri: `stripe prices retrieve $STRIPE_PRO_PRICE_ID` … za vse 4. | odprto |
| Webhook podpis | ✅ `constructEvent` | ✅ |
| `checkout.session.completed` | nastavi paket, **ne** počisti `trial_ends_at` in ne nastavi `plan_expires_at` | počisti preizkus |
| `subscription.updated` | paket iz cene, **ne glede na `status`** – `unpaid`/`incomplete_expired`/`canceled` ostanejo Pro | status `active`/`trialing`/`past_due` → paket; `unpaid`/`canceled`/`incomplete_expired` → `free` |
| Vrstni red / idempotentnost | podatek iz dogodka; zakasnel `updated` po `deleted` vrne Pro | stanje se vedno prebere sveže iz Stripa (`subscriptions.retrieve`) → isti dogodek 2× ali v napačnem vrstnem redu da isti rezultat |
| Org brez `metadata.org_id` (naročnina iz Dashboarda) | ignorirano | iskanje po `stripe_customer_id` |
| `deleted` za staro naročnino, ko ima org že novo | prepiše na `free` | prezre, če `stripe_subscription_id` ni ta naročnina |
| Preklic | Stripe portal; `cancel_at_period_end` → ostane Pro do `deleted` ✅ | ✅ |
| Nadgradnja/znižanje/mesečno↔letno | Customer Portal (konfiguracija v Stripu – **preveri**, da so v portalu dovoljene vse 4 cene in proration) | brez spremembe |
| Vračilo (`charge.refunded`) | ni obdelave | odprto (paket ostane do preklica) |
| Nakup med preizkusom | zaračuna takoj, preostanek preizkusa se izgubi | odprto – poslovna odločitev (`subscription_data.trial_end`) |
| Portal/checkout pišeta `stripe_customer_id` z uporabniškim odjemalcem | po K2-popravku tega RLS ne bi več dovolil | prestavljeno na service role |

## 5. Razlike cenik ↔ koda

1. Nastavitve → Naročnina: »do 5 računov/**mesec**« – koda šteje skupaj. *Popravljeno.*
2. Nastavitve → kartica Free: »Neomejeni računi, FURS fiskalizacija« – laž. *Popravljeno.*
3. Kartica Pro v Nastavitvah navaja »Dobavnice« (izdane dobavnice so na voljo vsem).
4. `ProGate` (neuporabljen) navaja 9,99 € in 24,99 €. *Odstranjen.*
5. Cenik obljublja POS samo v Pro + POS – koda ga je dajala vsem. *Popravljeno (razen RLS za mobilno).*
6. Cenik obljublja DDV evidenco/KPO samo v Pro – koda jih daje vsem (odločitev odprta, glej §2).
7. Aplikacija ponuja veliko funkcij, ki jih cenik ne omenja (plače, REK-1, potni nalogi, amortizacija …) – brez omejitev za Free.
8. Landing ne omenja 14-dnevnega preizkusa, koda ga daje vsakemu novemu računu (Pro + POS).

## 6. Kaj je popravljeno (veja `claude/adoring-fermat-4b1ilc`, vsak popravek svoj commit)

| Commit | Kaj |
|---|---|
| `lib/paket.ts` | en vir resnice: `efektivniPaket` (iztekel preizkus = free takoj), cenik → funkcije, `zahtevajPaket` za API |
| API vrata | `furs/invoice` (POS), `zaloge/uvoz-dobavnice`, `exports/accounting`, `invoices/[id]/eracun`, `team/invite`, `team/change-role` |
| Migracija 182 | K1, K2, K4, K5 v bazi + vloge po paketu (**ni uporabljena na produkciji**) |
| UI | besedila Naročnine, kartica Free, UpgradeModal/Prenosi cene, števec x/5 čez vse račune, ProGate/useSubscription odstranjena |
| Middleware | `/pos`, `/zaloge`, `/ai`, `/scan`, `/banka` → `/paket` (rewrite – namizna aplikacija ne zapade v zanko) |
| Webhook | sveže stanje iz Stripa, `status`, vrstni red, org po `stripe_customer_id`, stara naročnina ne prepiše nove |
| Ekipa | vloge po paketu v UI; zavrnjeno povabilo ni več »poslano« |
| Baza znanja | portal-stripe, portal-racuni, ekipa-vloge-osebje, izvoz-racunovodja, pos-osnove, _index |

## 7. Odprto / potrebna odločitev

1. **Uporaba migracije 182 na produkciji** (Supabase »Knjigovodja«). Brez nje K1 in K2 ostaneta odprta in omejitev 5 računov ostane samo v UI. Pred uporabo:
   - **Vpliv:** dve obstoječi Free organizaciji imata skupaj **45 računov** – po migraciji ne bosta mogli izdati novega računa (dobropis gre). Odločitev: pustiti, ali jim dodeliti Pro ročno (service role).
   - Organizacije `pro`/`pro_pos` brez Stripa in brez `trial_ends_at` (ročno dodeljene, 5 org) ostanejo plačljive – OK.
2. **Mobilna registracija je pokvarjena že zdaj:** `apps/mobile/app/register.tsx` po `signUp` vstavi DRUGO organizacijo (`handle_new_user` jo je že ustvaril) z `.insert().select()`, kar RLS zavrne (uporabnik še ni član). Predlog: odstraniti vstavljanje organizacije/članstva iz mobilne aplikacije.
3. **Stran `/invite/[id]`** bere `org_invites` kot povabljenec, ki še ni član – RLS mu vrstice ne pokaže. Glavni tok povabila (e-pošta iz `/api/team/invite`) člana doda na strežniku, zato to ni kritično; preveri, ali je stran še potrebna.
4. **POS na mobilni aplikaciji in neposredno prek Supabase** (`orders`, `order_lines`, `payments`): RLS ne pozna paketa. Davčno potrjevanje (`/api/furs/invoice`) je zaprto, vnos naročil ne. Predlog: RLS pogoj `efektivni_paket(org) = 'pro_pos'` na `orders` (zahteva preslikavo `business_id` → org).
5. **KPO / DDV evidenca / plače / potni nalogi …** so odprti vsem paketom. Cenik KPO/DDV uvršča v Pro, a gre za zakonske evidence – odločitev, ali zakleniti samo vnos ali nič.
6. **Cene v Stripu** (12,99 / 129,90 / 29,99 / 299,90 €) niso preverljive iz tega okolja: `stripe prices retrieve <id>` za vse 4 `STRIPE_*_PRICE_ID`; v Customer Portalu omogoči menjavo med vsemi 4 cenami in proration.
7. **Opomniki pred iztekom preizkusa** (e-pošta Resend 3 dni in 1 dan prej) in pasica »preizkus je potekel« ne obstajajo.
8. **Nakup med preizkusom** zaračuna takoj; alternativa `subscription_data.trial_end = trial_ends_at` (plačilo ob izteku preizkusa).
9. **Vračilo** (`charge.refunded`) paketa ne spremeni – naročnino je treba v Stripu tudi preklicati.
10. **`/api/furs/invoice` z `offline`**: račun blagajne, izdan brez povezave tik pred iztekom paketa, se po izteku ne more več naknadno prijaviti FURS (redek primer; rešitev: dovoliti naknadno prijavo za račune z `closed_at` pred iztekom).
11. **E2E s Stripe test clocks** ni narejen (ni testnega ključa; testni Supabase projekt »racunko test« je INACTIVE).

## 8. Testi

- `tests/paketi.spec.ts` – efektivni paket (free, trial-pro, trial-pro_pos, iztekel, plačan, preklican), pravila funkcij po paketih, webhook (status, vrstni red, iskanje org), middleware poti.
- `tests/paketi-baza.spec.ts` – migracija 182 na lokalnem PostgreSQL (`PAKETI_PG="-h /tmp -p 54329 -U postgres"`; brez spremenljivke se preskoči): 7 testnih organizacij, 6. račun zavrnjen (tudi service role), dobropis/dobavnica dovoljena, iztekel preizkus = free, uporabnik ne more spremeniti paketa ali ustvariti `pro_pos` organizacije, vpis v tujo organizacijo zavrnjen, povabilo veljavno samo za pravo vlogo/e-naslov in se porabi, vloge po paketu, idempotentnost. **19/19.**
- `tests/paketi.spec.ts` – **52/52.** Celoten nabor: 811 uspešnih; 8 neuspešnih je enakih na izhodiščnem commitu (testi proti živi strani in datumsko odvisen `ujemanje.spec.ts`).
- **Ni narejeno:** e2e proti živi aplikaciji s Stripe testnimi urami (test clocks) – zahteva Stripe testni ključ in testni Supabase projekt (»racunko test« je INACTIVE).
