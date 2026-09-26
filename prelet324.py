#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 324 - Stripe webhook: samostojna placila (payment_intent) spet dobijo racun, brez dvojnikov.

DIAGNOZA (Domen Kocjan s.p.): masterclass 289 EUR, 18.9.2026 ob 8:08,
pi_3UGut6... - placilo ni slo prek Checkouta ne prek Stripe racuna, zato je
Stripe poslal SAMO payment_intent.succeeded. Ta dogodek je bil 22.7.2026
odstranjen (pri Checkoutu je skupaj s checkout.session.completed ustvarjal
podvojene racune), zato vsako tako placilo ostane brez racuna.

POPRAVEK:
 - payment_intent.succeeded se obdela
 - checkout in payment_intent istega nakupa imata isti kljuc (ID placila
   pi_), zato nastane en sam racun ne glede na vrstni red; hkratna dogodka
   ustavi unikatni indeks iz migracije 159
 - placilo, ki pripada Stripe racunu (narocnina, poslan racun), se preskoci
   - racun izda invoice.paid
 - novejse API verzije (brez polja `invoice` na placilu) se varno preskocijo
   in zabelezijo, namesto da bi tvegali dvojnik
 - kupec iz receipt_email / podatkov bremenitve; datum placila = dogodek
 - navodila v Integracijah: dodan dogodek payment_intent.succeeded

PREVERJENO: npx tsc --noEmit = 0 napak.

Uporaba:
    python3 prelet324.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet324.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #1',
     ' * Nastavitev v Stripe dashboardu uporabnika:\n * Stripe → Developers → Webhooks → Add endpoint\n * - URL: https://xn--raunko-j2a.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID\n * - Events: checkout.session.completed, invoice.paid\n * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)\n *\n * POMEMBNO: To je webhook za UPORABNIKOV lasten Stripe account (npr. za',
     ' * Nastavitev v Stripe dashboardu uporabnika:\n * Stripe → Developers → Webhooks → Add endpoint\n * - URL: https://xn--raunko-j2a.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID\n * - Events: checkout.session.completed, invoice.paid, payment_intent.succeeded\n * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)\n *\n * POMEMBNO: To je webhook za UPORABNIKOV lasten Stripe account (npr. za'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #2',
     '    // ni bilo NOBENE sledi, da je webhook sploh prispel. Ko racun ni nastal,\n    // ni bilo mogoce locevati "webhook ni prispel" od "webhook je prispel,\n    // a smo ga namenoma preskocili". Zdaj beleximo VSAK prejeti dogodek.\n    const handledEvents = [\'checkout.session.completed\', \'invoice.paid\']\n    if (!handledEvents.includes(event.type)) {\n      await zapisiLog(supabase, {\n        org_id: orgId,',
     '    // ni bilo NOBENE sledi, da je webhook sploh prispel. Ko racun ni nastal,\n    // ni bilo mogoce locevati "webhook ni prispel" od "webhook je prispel,\n    // a smo ga namenoma preskocili". Zdaj beleximo VSAK prejeti dogodek.\n    //\n    // PRELET 324: payment_intent.succeeded je spet obdelan - a BREZ dvojnikov.\n    // Brez njega je izpadlo vsako placilo, ki ni slo prek Checkouta ali\n    // Stripe racuna (placilo, ustvarjeno v Stripe nadzorni plosci, placilo\n    // prek zunanje platforme ...). Tako je 18.9.2026 pri Domnu Kocjanu\n    // izpadel racun za masterclass (289 EUR, pi_3UGut6...): Stripe je poslal\n    // samo payment_intent.succeeded, ki ga webhook ni poslusal.\n    // Zascita pred dvojniki (glej `kljucPlacila` spodaj): checkout in\n    // payment_intent istega nakupa imata ZDAJ ISTI kljuc (ID placila pi_),\n    // placilo za Stripe racun pa pokrije invoice.paid.\n    const handledEvents = [\'checkout.session.completed\', \'invoice.paid\', \'payment_intent.succeeded\']\n    if (!handledEvents.includes(event.type)) {\n      await zapisiLog(supabase, {\n        org_id: orgId,'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #3',
     "      return NextResponse.json({ message: 'Checkout z racunom - caka se invoice.paid' }, { status: 200 })\n    }\n\n    // Preveri ali račun za ta Stripe objekt že obstaja\n    const externalRef = `stripe-${obj.id}`\n    const { data: existing } = await supabase\n      .from('issued_invoices')\n      .select('id')\n      .eq('org_id', orgId)\n      .eq('external_reference', externalRef)\n      .maybeSingle()\n\n    if (existing) {\n      await zapisiLog(supabase, {",
     "      return NextResponse.json({ message: 'Checkout z racunom - caka se invoice.paid' }, { status: 200 })\n    }\n\n    // PRELET 324: placilo za Stripe RACUN (narocnina ali poslan racun) sprozi\n    // tudi payment_intent.succeeded - racun zanj izda invoice.paid, zato ga\n    // tu preskocimo (sicer dva racuna za isto placilo).\n    if (event.type === 'payment_intent.succeeded' && obj.invoice) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: 'skipped',\n        payload: { reason: 'payment_intent_for_invoice_awaiting_invoice_paid', event_type: event.type, event_id: event.id, invoice: obj.invoice },\n      })\n      return NextResponse.json({ message: 'Placilo Stripe racuna - racun izda invoice.paid' }, { status: 200 })\n    }\n    // Novejse razlicice Stripe API (od 2025-03-31) v placilu NIMAJO vec polja\n    // `invoice`, zato iz dogodka ni mogoce vedeti, ali placilo pripada Stripe\n    // racunu. Da ne tvegamo dvojnika, takega placila NE obdelamo in to\n    // zabelezimo (resitev: API verzija webhooka 2025-02-24 ali starejsa).\n    if (event.type === 'payment_intent.succeeded' && !('invoice' in obj)) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: 'skipped',\n        payload: { reason: 'payment_intent_api_version_unsupported', event_type: event.type, event_id: event.id, api_version: event.api_version ?? null },\n      })\n      return NextResponse.json({ message: 'API verzija ne omogoca locevanja placil' }, { status: 200 })\n    }\n\n    // PRELET 324: KLJUC PLACILA za zascito pred dvojniki. En nakup prek\n    // Checkouta sprozi checkout.session.completed (cs_) IN\n    // payment_intent.succeeded (pi_) - zato se je 22.7.2026 payment_intent\n    // odstranil. Zdaj oba zapiseta ISTI kljuc: ID placila (pi_). Kateri koli\n    // pride prvi, ustvari racun; drugi najde obstojecega (ali ga zavrne\n    // unikatni indeks iz migracije 159, ce prideta hkrati).\n    const kljucPlacila = event.type === 'payment_intent.succeeded'\n      ? obj.id\n      : (event.type === 'checkout.session.completed' && typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.id)\n    const externalRef = `stripe-${kljucPlacila}`\n    // Racuni, ustvarjeni pred preletom 324, imajo pri checkoutu kljuc cs_ -\n    // preverimo oba, da ponovno poslan star dogodek ne ustvari dvojnika.\n    const kandidati = Array.from(new Set([externalRef, `stripe-${obj.id}`]))\n    const { data: obstojeciRacuni } = await supabase\n      .from('issued_invoices')\n      .select('id')\n      .eq('org_id', orgId)\n      .in('external_reference', kandidati)\n      .limit(1)\n    const existing = (obstojeciRacuni || [])[0] ?? null\n\n    if (existing) {\n      await zapisiLog(supabase, {"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #4',
     "    const vatAmount = org.vat_registered ? amountTotal - amountNet : 0\n\n    // Stranka — Stripe checkout session ima customer_details, invoice ima customer_email\n    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? null\n    const customerName = obj.customer_details?.name ?? obj.customer_name ?? customerEmail ?? 'Stranka iz Stripe'\n\n    // PRELET 320: Stripe racun (invoice) ima opis prodaje v postavkah\n    // (lines), ne v `description` - prej je na racunu pisalo samo",
     "    const vatAmount = org.vat_registered ? amountTotal - amountNet : 0\n\n    // Stranka — Stripe checkout session ima customer_details, invoice ima customer_email\n    // PRELET 324: samostojno placilo (payment_intent) ima podatke o kupcu v\n    // receipt_email in v podatkih bremenitve (charges), ne v customer_details.\n    const bremenitev = obj.charges?.data?.[0]?.billing_details ?? {}\n    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? obj.receipt_email ?? bremenitev.email ?? null\n    const customerName = obj.customer_details?.name ?? obj.customer_name ?? bremenitev.name ?? obj.shipping?.name ?? customerEmail ?? 'Stranka iz Stripe'\n\n    // PRELET 320: Stripe racun (invoice) ima opis prodaje v postavkah\n    // (lines), ne v `description` - prej je na racunu pisalo samo"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #5',
     '    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,\n    // ko se zamujen dogodek v Stripe rocno ponovno poslje ("Resend") - racun\n    // se izda danes, datum opravljene storitve in placila pa ostaneta pravilna.\n    const placanoSek = Number(obj.status_transitions?.paid_at ?? obj.created ?? event.created ?? 0)\n    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()\n    const datumPlacila = lokalniDatum(placanoOb)\n',
     '    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,\n    // ko se zamujen dogodek v Stripe rocno ponovno poslje ("Resend") - racun\n    // se izda danes, datum opravljene storitve in placila pa ostaneta pravilna.\n    // PRELET 324: pri racunu je trenutek placila status_transitions.paid_at;\n    // pri checkoutu/placilu je to trenutek dogodka (obj.created je trenutek\n    // ZACETKA placila - pri 3-D Secure lahko minut prej ali celo drug dan).\n    const placanoSek = Number(obj.status_transitions?.paid_at ?? event.created ?? obj.created ?? 0)\n    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()\n    const datumPlacila = lokalniDatum(placanoOb)\n'),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #1',
     '  steps={[\n    { icon: \'🔑\', title: \'Kopirajte Webhook URL\', desc: \'Ta URL boste vnesli v Stripe nastavitve.\', code: `${webhookBaseUrl}/stripe?org_id=${orgId}`, copyable: true },\n    { icon: \'💳\', title: \'Odprite Stripe Dashboard\', desc: \'Pojdite na: Developers → Webhooks → Add endpoint\' },\n    { icon: \'📋\', title: \'Izpolnite podatke\', desc: \'Events: checkout.session.completed, invoice.paid · URL: (iz koraka 1)\' },\n    { icon: \'✅\', title: \'Kopirajte Signing secret\', desc: \'Stripe vam ob ustvarjanju webhooka pokaže "Signing secret" — kopirajte ga spodaj v polje Webhook Secret.\' },\n  ]}\n  tip="Uporabite vaš LASTEN Stripe webhook (za vašo aplikacijo/produkt) — ne za Računko naročnino."',
     '  steps={[\n    { icon: \'🔑\', title: \'Kopirajte Webhook URL\', desc: \'Ta URL boste vnesli v Stripe nastavitve.\', code: `${webhookBaseUrl}/stripe?org_id=${orgId}`, copyable: true },\n    { icon: \'💳\', title: \'Odprite Stripe Dashboard\', desc: \'Pojdite na: Developers → Webhooks → Add endpoint\' },\n    { icon: \'📋\', title: \'Izpolnite podatke\', desc: \'Events: checkout.session.completed, invoice.paid, payment_intent.succeeded · URL: (iz koraka 1)\' },\n    { icon: \'✅\', title: \'Kopirajte Signing secret\', desc: \'Stripe vam ob ustvarjanju webhooka pokaže "Signing secret" — kopirajte ga spodaj v polje Webhook Secret.\' },\n  ]}\n  tip="Uporabite vaš LASTEN Stripe webhook (za vašo aplikacijo/produkt) — ne za Računko naročnino."'),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #2',
     "              </div>\n              <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>\n                V Stripe: <strong>Developers → Webhooks → Add endpoint</strong><br />\n                Events: <strong>checkout.session.completed, invoice.paid</strong> · URL: (zgoraj)\n              </div>\n            </div>\n          )}",
     "              </div>\n              <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>\n                V Stripe: <strong>Developers → Webhooks → Add endpoint</strong><br />\n                Events: <strong>checkout.session.completed, invoice.paid, payment_intent.succeeded</strong> · URL: (zgoraj)\n              </div>\n            </div>\n          )}"),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #3',
     "  invoice_already_exists_concurrent: 'Račun za to plačilo že obstaja',\n  subscription_checkout_awaiting_invoice_paid: 'Naročnina — račun se izda ob dogodku invoice.paid',\n  checkout_with_invoice_awaiting_invoice_paid: 'Plačilo z računom — račun se izda ob dogodku invoice.paid',\n  event_type_not_handled: 'Vrsta dogodka se ne obdeluje',\n  integration_not_active_or_missing: 'Integracija ni aktivna',\n  org_not_found: 'Organizacija ni najdena',",
     "  invoice_already_exists_concurrent: 'Račun za to plačilo že obstaja',\n  subscription_checkout_awaiting_invoice_paid: 'Naročnina — račun se izda ob dogodku invoice.paid',\n  checkout_with_invoice_awaiting_invoice_paid: 'Plačilo z računom — račun se izda ob dogodku invoice.paid',\n  payment_intent_for_invoice_awaiting_invoice_paid: 'Plačilo Stripe računa — račun se izda ob dogodku invoice.paid',\n  payment_intent_api_version_unsupported: 'API verzija webhooka je preveč nova — v Stripe nastavite 2025-02-24 ali starejšo',\n  event_type_not_handled: 'Vrsta dogodka se ne obdeluje',\n  integration_not_active_or_missing: 'Integracija ni aktivna',\n  org_not_found: 'Organizacija ni najdena',"),

]


def aplic(repo, preveri=False):
    print(f"Repozitorij: {repo}\n")
    stevilo = 0
    for pot, opis, staro, novo in ZAMENJAVE:
        polna_pot = os.path.join(repo, pot)
        if not os.path.exists(polna_pot):
            print(f"  ! MANJKA DATOTEKA: {pot}")
            continue
        with open(polna_pot, encoding='utf-8') as f:
            vsebina = f.read()
        stevilo_pojavitev = vsebina.count(staro)
        if stevilo_pojavitev == 0:
            print(f"  ! sidro NI najdeno: {opis}")
            continue
        if stevilo_pojavitev > 1:
            print(f"  ! sidro NI EDINSTVENO ({stevilo_pojavitev}x): {opis}")
            continue
        if preveri:
            print(f"  v sidro OK: {opis}")
            stevilo += 1
            continue
        nova_vsebina = vsebina.replace(staro, novo)
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(nova_vsebina)
        print(f"  + aplicirano: {opis}")
        stevilo += 1

    print()
    if preveri:
        print(f"Nacin --preveri: nic ni bilo spremenjeno. ({stevilo}/{len(ZAMENJAVE)} sider OK)")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)
    else:
        print(f"PRELET 324 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet324.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
