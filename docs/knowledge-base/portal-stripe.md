---
modul: portal-stripe
naslov: Stripe v Računku – plačila s kartico (Connect), Stripe integracija (uvoz plačil), naročnina na Računko
vloge: [lastnik, admin]
poti: [/nastavitve?tab=placila, /integracije, /nastavitve?tab=plan, /invoices/zahtevki]
koda:
  - apps/web/components/nastavitve/PlacilaStripe.tsx (Nastavitve → Plačila s kartico – Stripe Connect)
  - apps/web/components/nastavitve/Integracije.tsx, apps/web/components/nastavitve/StripePlacila.tsx (Integracije → Stripe – webhook, ključ za branje, uskladitev)
  - apps/web/app/nastavitve/page.tsx (razdelek 'plan' – Naročnina), apps/web/components/ManageSubscriptionButton.tsx, apps/web/app/api/stripe/checkout
  - apps/web/lib/paket.ts (kaj vsebuje paket, preizkus), apps/web/app/api/stripe/webhook/route.ts, apps/web/lib/narocnina-stripe.ts, apps/web/app/paket/page.tsx, apps/web/components/UpgradeModal.tsx
  - apps/web/components/pos/StripePlacilo.tsx (QR plačilo na blagajni), apps/web/app/invoices/zahtevki (zahtevki za plačilo)
posodobljeno: 2026-10-06
---

# Stripe v Računku – tri različna mesta

»Stripe« se v Računku pojavi na **treh mestih z različnim namenom**. Najprej ugotovi, kaj uporabnik želi:

| Želim … | Kje |
|---|---|
| da mi stranke plačujejo s kartico (QR na blagajni, povezava za plačilo računa) | **Nastavitve → Plačila s kartico** |
| da se plačila iz moje spletne trgovine / aplikacije, ki že uporablja Stripe, samodejno spremenijo v račune | **Nastavitve → Integracije → Stripe** |
| plačati ali spremeniti svojo naročnino na Računko | **Nastavitve → Naročnina** |

## 1. Plačila s kartico (Stripe Connect) – Nastavitve → Plačila s kartico

Poveže podjetje s Stripe računom, da stranke plačajo s kartico ali telefonom. Stripe provizije zaračuna neposredno podjetju; Računko ne zaračuna ničesar.

1. **Nastavitve → Plačila s kartico** → **Poveži Stripe**.
2. Preusmeri te na Stripe: vpiši podatke podjetja in TRR za izplačila. Če prekineš, se kasneje vrneš z **Nadaljuj vpis pri Stripe**.
3. Po vrnitvi se prikaže stanje: Račun, Plačila (omogočena), Izplačila na TRR, Ime pri Stripe.
4. Pogoji: urejeno **davčno potrjevanje** (FURS certifikat in poslovni prostor – **Nastavitve FURS →**).

Uporaba: **blagajna – plačilo prek QR kode** (v oknu za plačilo »Plačaj s Stripe«) in **portal – zahtevek za plačilo** (povezava ali QR koda za plačilo, ki jo pošlješ stranki; seznam v **Računi → Zahtevki za plačilo**, stanja: poslan, plačan, potekel, preklican; gumbi Pokaži QR, Pošlji opomnik, Prekliči). Povezavo lahko uredi samo lastnik podjetja; **Prekini povezavo** jo odstrani. Oznaka »TESTNI NAČIN« pomeni povezavo s Stripe testnim računom.

## 2. Stripe integracija (uvoz plačil) – Nastavitve → Integracije → Stripe

Za podjetja, ki že prodajajo prek Stripe (lastna aplikacija, spletna stran). Vsako plačilo v Stripu samodejno postane račun v Računku (z davčno potrditvijo in vnosom v KPO).

1. **Nastavitve → Integracije** → kartica **Stripe** → **Kako povežem Stripe?**
2. Kopiraj **Webhook URL za Stripe**.
3. V Stripe Dashboard: **Developers → Webhooks → Add endpoint** → prilepi URL; dogodki: `checkout.session.completed`, `invoice.paid`, `payment_intent.succeeded`, `charge.refunded`.
4. Stripe pokaže **Signing secret** (`whsec_…`) – prilepi ga v polje **Webhook Secret (Stripe Signing secret)** in shrani.
5. Priporočeno: **Ključ za branje** – v Stripe **Developers → API keys → Create restricted key** (pravice Read), prilepi `rk_live_…` → **Shrani ključ**. Omogoči **Preveri nastavitev**, **Uskladi zadnjih 30 dni** in nočno uskladitev, ter obdelavo vračil in sporov.

Pod integracijo je **knjiga plačil**: za vsako Stripe plačilo vidiš, ali ima račun, ali je preskočeno in zakaj (npr. znesek 0 €, račun izda WooCommerce, vrnjeno pred izdajo računa). Gumbi: **Izdaj račun**, **Izdaj na podjetje** (drug kupec kot v Stripu), **Imam ročni račun** / **Nadomesti z davčno potrjenim**, **Poskusi znova**.

Na isti strani sta tudi integraciji **WooCommerce** in **Shopify** (webhook iz trgovine → račun v Računku).

## 3. Naročnina na Računko – Nastavitve → Naročnina

| Paket | Cena | Vsebuje |
|---|---|---|
| 🆓 Free | 0 € | do **5 računov skupaj** (ne na mesec), PDF z UPN QR, izračun prispevkov; **brez** davčnega potrjevanja (FURS) in pošiljanja po e-pošti |
| 💼 Pro | 12,99 €/mes ali 129,90 €/leto | neomejeni računi, FURS, pošiljanje po e-pošti, skener stroškov, AI računovodja, uvoz bančnega izpiska, e-račun (e-SLOG), izvoz in dostop za računovodjo, zahtevki za plačilo s kartico |
| 🖥️ Pro + POS | 29,99 €/mes ali 299,90 €/leto | vse iz Pro + POS blagajna (mize, delitev računa, popusti, kartica prek QR, kuhinjski zaslon), zaloge in dobavnice, člani/paketi/koledar, blagajniki s PIN, namizna aplikacija |

Letno plačilo = 2 meseca brezplačno. Nadgradnja: **Nastavitve → Naročnina** → izberi paket (plačilo prek Stripe). Obstoječo plačano naročnino (kartica, menjava paketa, mesečno ↔ letno, preklic, računi) urejaš z gumbom **⚙️ Upravljaj naročnino** (Stripe portal) – gumb je viden samo pri plačani naročnini.

### Brezplačni preizkus
- Vsak nov račun dobi **14 dni preizkusa paketa Pro + POS**. V Nastavitve → Naročnina piše »🎁 Brezplačni preizkus do …«, na nadzorni plošči pasica »Še N dni brezplačnega preizkusa« z gumbom **Nadgradi zdaj**.
- Ob izteku se paket takoj spremeni v **Free**: zaklenejo se funkcije, **podatki in izdani računi ostanejo** (računi, KPO, DDV, dnevni zaključki so še vedno vidni; storno je vedno mogoč).
- Plačilo med preizkusom začne plačano naročnino takoj (preostanek preizkusa se ne prenese).

### Kaj se zgodi ob …
- **Preklicu** v Stripe portalu: paket ostane do konca plačanega obdobja, nato Free.
- **Neuspelem plačilu**: dokler Stripe še poskuša (zapadlo), paket ostane; ko Stripe naročnino označi kot neplačano ali jo prekliče, paket postane Free.
- **Strani brez paketa** (Blagajna `/pos`, Zaloge, AI računovodja, Skeniraj račun, Bančni uvoz): odpre se obvestilo »Ta funkcija je na voljo v paketu …« s povezavo **Nastavitve → Naročnina**.

## Omejitve in opozorila

- Signing secret se začne z `whsec_`; ključ za branje z `rk_`. Testni ključ (`rk_test_`) ne pokaže pravih plačil.
- API verzija webhooka v Stripu mora biti 2025-02-24 ali starejša, sicer Računko dogodek zavrne (vidno v »Zadnji dogodki«).
- Ključ za branje mora pripadati **istemu** Stripe računu kot webhook.
- Plačilo s Stripe na blagajni zahteva internet in urejeno FURS potrjevanje; tak račun se vedno davčno potrdi.
- Pri brezplačnem paketu se po 5 računih prikaže »Nadgradi →«. Štejejo se vsi računi skupaj (tudi osnutki in avansni), **ne** dobropisi/storno in dobavnice.
- Naročnine ni mogoče spremeniti ročno – samo prek plačila v Stripu. Če je bil paket dodeljen ročno (brez Stripa), ga gumb **Upravljaj naročnino** ne prikaže.
- Na starejšo stran `/stripe` (Secret Key + webhook) meni ne vodi več – za uvoz plačil uporabljaj **Nastavitve → Integracije → Stripe**.
