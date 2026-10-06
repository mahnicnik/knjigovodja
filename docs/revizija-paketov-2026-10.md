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
| Pro: uvoz bančnega izpiska | – | `banka/parse-pdf` (PDF); CSV se bere v brskalniku | ⚠️ | ✅ PDF + stran `/banka` |
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

## 6. Testi

- `tests/paketi.spec.ts` – efektivni paket (free, trial-pro, trial-pro_pos, iztekel, plačan, preklican), pravila funkcij po paketih, webhook (status, vrstni red, iskanje org), middleware poti.
- `tests/paketi-baza.spec.ts` – SQL sprožilci na lokalnem PostgreSQL (preskoči se, če `PAKETI_PG_URL` ni nastavljen): 6. račun zavrnjen, dobropis dovoljen, iztekel preizkus = free, uporabnik ne more spremeniti paketa, ne more se vpisati v tujo organizacijo.
- **Ni narejeno:** e2e proti živi aplikaciji s Stripe testnimi urami (test clocks) – zahteva Stripe testni ključ in testni Supabase projekt (»racunko test« je INACTIVE).
