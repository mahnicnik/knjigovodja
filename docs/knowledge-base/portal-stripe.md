---
modul: portal-stripe
naslov: Stripe v Računku – plačila s kartico (Connect), Stripe integracija (uvoz plačil), naročnina na Računko
vloge: [lastnik, admin]
poti: [/nastavitve?tab=placila, /integracije, /nastavitve?tab=plan, /invoices/zahtevki]
koda:
  - apps/web/components/nastavitve/PlacilaStripe.tsx (Nastavitve → Plačila s kartico – Stripe Connect)
  - apps/web/components/nastavitve/Integracije.tsx, apps/web/components/nastavitve/StripePlacila.tsx (Integracije → Stripe – webhook, ključ za branje, uskladitev)
  - apps/web/app/nastavitve/page.tsx (razdelek 'plan' – Naročnina), apps/web/components/ManageSubscriptionButton.tsx, apps/web/app/api/stripe/checkout
  - apps/web/components/pos/StripePlacilo.tsx (QR plačilo na blagajni), apps/web/app/invoices/zahtevki (zahtevki za plačilo)
posodobljeno: 2026-10-05
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
| 🆓 Free | 0 € | izdajanje računov z omejitvijo **5 računov skupaj**, FURS, PDF, prispevki/UPN QR |
| 💼 Pro | 12,99 €/mes ali 129,90 €/leto | neomejeni računi, pošiljanje po e-pošti, AI skeniranje, dobavnice, AI računovodja |
| 🖥️ Pro + POS | 29,99 €/mes ali 299,90 €/leto | vse iz Pro + POS blagajna, koledar, člani in paketi, zaloga |

Letno plačilo = 2 meseca brezplačno. Nadgradnja: **Nastavitve → Naročnina** → izberi paket (plačilo prek Stripe). Obstoječo naročnino (kartica, preklic, računi) urejaš z gumbom **⚙️ Upravljaj naročnino** (Stripe portal). Če naročnina ni bila sklenjena prek Stripa, gumb to izpiše.

## Omejitve in opozorila

- Signing secret se začne z `whsec_`; ključ za branje z `rk_`. Testni ključ (`rk_test_`) ne pokaže pravih plačil.
- API verzija webhooka v Stripu mora biti 2025-02-24 ali starejša, sicer Računko dogodek zavrne (vidno v »Zadnji dogodki«).
- Ključ za branje mora pripadati **istemu** Stripe računu kot webhook.
- Plačilo s Stripe na blagajni zahteva internet in urejeno FURS potrjevanje; tak račun se vedno davčno potrdi.
- Pri brezplačnem paketu se po 5 izdanih računih prikaže »Nadgradi →«. (Opis »do 5 računov/mesec« v Nastavitvah ne drži – šteje se skupno število računov.)
- Na starejšo stran `/stripe` (Secret Key + webhook) meni ne vodi več – za uvoz plačil uporabljaj **Nastavitve → Integracije → Stripe**.
