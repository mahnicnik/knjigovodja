#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 320 - Stripe webhook: racun za enkratno prodajo (masterclass) ni nastal.

DIAGNOZA (Domen Kocjan s.p., 20.9.2026): Stripe je poslal invoice.paid, nas
webhook je odgovoril 200 OK, racun pa ni nastal in v dnevniku ni bilo sledi.
 1. Znesek se je bral iz amount_paid. Ta je 0, ko je Stripe racun poravnan
    iz dobroimetja ali oznacen "placan izven Stripe" - vrednost prodaje
    (total) pa je vec kot 0. Webhook je dogodek preskocil kot "znesek 0" in
    vrnil 200, zato ga Stripe ni nikoli ponovil.
 2. Omejitev integration_logs_status_check je dovolila samo success/error/
    pending, koda pa od 30.7.2026 pise 'failed' in 'skipped'. Baza je vse
    take zapise zavrnila, koda je napako tiho pogoltnila -> nobene sledi.

POPRAVKI:
 - pri Stripe racunu je merodajen `total` (0 € preizkusi/kuponi se se
   vedno pravilno preskocijo); opomba na racunu, ce je bil placan izven
   Stripe ali iz dobroimetja
 - checkout.session.completed z vklopljenim "Create an invoice" se
   preskoci (izda ga invoice.paid) - sicer bi nastala DVA racuna, enaka
   past kot 11.8.2026 pri narocninah
 - hkratni dvojnik istega dogodka (unikatni indeks, koda 23505) = "racun
   ze obstaja", ne napaka
 - datum storitve/placila = dejanski trenutek placila (pravilno tudi, ko se
   zamujen dogodek v Stripe rocno ponovno poslje)
 - opis racuna iz postavk Stripe racuna (npr. "Masterclass")
 - zapisi v dnevnik ne pogoltnejo napake vec tiho; vsi zapisi imajo event_id
 - /nastavitve > Integracije: preskoceni dogodki kot ⏭️ z razlogom
 - migracija 159 (ZE UPORABLJENA na produkcijski bazi 25.9.2026)

payment_intent.succeeded se namenoma se vedno NE obdeluje (razlog za
odstranitev 22.7.2026 - podvojeni racuni - ostaja).

PREVERJENO: npx tsc --noEmit = 0 napak.

Uporaba:
    python3 prelet320.py --preveri /pot/do/repozitorija
    python3 prelet320.py /pot/do/repozitorija
"""
import sys
import os

NOVE_DATOTEKE = {
    'supabase/migrations/159_integration_logs_status_in_dedup.sql': '-- ═══════════════════════════════════════════════════════════════════\n-- PRELET 320: dnevnik integracij + zaščita pred podvojenimi računi\n-- ═══════════════════════════════════════════════════════════════════\n\n-- 1) integration_logs.status je dovoljeval samo success/error/pending,\n--    koda (Stripe, WooCommerce, Shopify webhook) pa od 30.7.2026 piše\n--    \'failed\' in \'skipped\'. Baza je te zapise zavrnila, koda pa je napako\n--    tiho pogoltnila - zato v /integracije ni bilo NOBENE sledi, ko račun\n--    ni nastal (Domen Kocjan, 20.9.2026). Razširimo dovoljene vrednosti.\nalter table integration_logs\n  drop constraint if exists integration_logs_status_check;\nalter table integration_logs\n  add constraint integration_logs_status_check\n  check (status = any (array[\'success\', \'error\', \'pending\', \'failed\', \'skipped\']));\n\n-- 2) Webhooki preverijo "račun že obstaja" z branjem, nato vpišejo. Če\n--    ponudnik isti dogodek pošlje dvakrat hkrati, obe obdelavi preideta\n--    preverbo in nastaneta DVA računa. Unikatni indeks drugi vpis zavrne.\n--    Omejeno na reference, ki jih ustvarijo webhooki (stripe-/wc-/sh-);\n--    javni API (v1) dovoli poljubno external_reference, zato ga ne vežemo.\ncreate unique index if not exists issued_invoices_org_webhook_ref_uniq\n  on issued_invoices (org_id, external_reference)\n  where external_reference like \'stripe-%\'\n     or external_reference like \'wc-%\'\n     or external_reference like \'sh-%\';\n',
}

ZAMENJAVE = [
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #1',
     '  }\n}\n\nasync function generateInvoiceNumber(supabase: any, orgId: string): Promise<string> {\n  const year = new Date().getFullYear()\n  // POPRAVLJENO (16.8.2026): stevilka se je dolocala s STETJEM obstojecih',
     '  }\n}\n\n/**\n * PRELET 320: zapis v integration_logs, ki napake NE pogoltne tiho.\n *\n * Prej so bili VSI zapisi s statusom \'failed\'/\'skipped\' zavrnjeni zaradi\n * omejitve integration_logs_status_check (dovoljevala je samo\n * success/error/pending), napaka pa se je zavrgla z `.then(() => {}, () => {})`.\n * Posledica: od 30.7.2026 ni bil zabelezen NOBEN neuspeh ali preskok - ko\n * racun ni nastal (primer Domen Kocjan, 20.9.2026), v /integracije ni bilo\n * nobene sledi. Omejitev je razsirjena v migraciji 159, tu pa vsak neuspel\n * zapis vsaj izpisemo v streznisko dnevnik, da se tiha izguba ne ponovi.\n */\nasync function zapisiLog(supabase: any, vrstica: Record<string, any>): Promise<void> {\n  try {\n    const { error } = await supabase.from(\'integration_logs\').insert({ integration_type: \'stripe\', ...vrstica })\n    if (error) console.error(\'Stripe webhook: zapis v integration_logs ni uspel:\', error.message, vrstica)\n  } catch (e: any) {\n    console.error(\'Stripe webhook: zapis v integration_logs je vrgel napako:\', e?.message, vrstica)\n  }\n}\n\n/**\n * PRELET 320: znesek placila v centih.\n *\n * Prej: `obj.amount_total ?? obj.amount_paid ?? obj.amount`. Stripe racun\n * (invoice) polja amount_total NIMA, zato se je vzel amount_paid. Ta je 0,\n * kadar je racun poravnan iz dobroimetja stranke ali ga je prodajalec v\n * Stripe oznacil kot "placan izven Stripe" (paid out of band) - vrednost\n * prodaje (`total`) pa je vec kot 0. Webhook je tak racun preskocil kot\n * "znesek 0" in vrnil 200, zato ga Stripe ni nikoli ponovil. Tako je\n * 20.9.2026 izpadel racun za enkratno prodajo (masterclass) pri Domnu.\n *\n * Zdaj je za racun merodajen `total` (vrednost prodaje po popustih). Pri\n * brezplacnem preizkusu ali 100 % kuponu je total 0 in dogodek se se vedno\n * pravilno preskoci.\n */\nfunction izracunajZnesek(obj: any): { centi: number; opomba: string } {\n  if (obj?.object === \'invoice\') {\n    const total = Number(obj.total ?? 0)\n    const placano = Number(obj.amount_paid ?? 0)\n    if (total > 0) {\n      let opomba = \'\'\n      if (placano <= 0) {\n        opomba = obj.paid_out_of_band\n          ? \' Račun je v Stripe označen kot plačan izven Stripe.\'\n          : \' Poravnano iz dobroimetja stranke v Stripe.\'\n      }\n      return { centi: total, opomba }\n    }\n    return { centi: placano > 0 ? placano : 0, opomba: \'\' }\n  }\n  return { centi: Number(obj?.amount_total ?? obj?.amount_received ?? obj?.amount ?? 0), opomba: \'\' }\n}\n\nasync function generateInvoiceNumber(supabase: any, orgId: string): Promise<string> {\n  const year = new Date().getFullYear()\n  // POPRAVLJENO (16.8.2026): stevilka se je dolocala s STETJEM obstojecih'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #2',
     "      // DODANO (prelet 296): ce nekdo (pomotoma) izklopi integracijo, je bil\n      // to prej NAJTISJI moznii izpad - webhook je tiho vracal 404, brez\n      // sledi v /integracije. Zdaj se zabelezi tudi to.\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'stripe',\n        status: 'failed',\n        payload: { reason: 'integration_not_active_or_missing' },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })\n    }\n",
     "      // DODANO (prelet 296): ce nekdo (pomotoma) izklopi integracijo, je bil\n      // to prej NAJTISJI moznii izpad - webhook je tiho vracal 404, brez\n      // sledi v /integracije. Zdaj se zabelezi tudi to.\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        status: 'failed',\n        payload: { reason: 'integration_not_active_or_missing' },\n      })\n      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })\n    }\n"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #3',
     "      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je\n        // tiho zavrnilo brez sledi v /integracije.\n        await supabase.from('integration_logs').insert({\n          org_id: orgId,\n          integration_type: 'stripe',\n          status: 'failed',\n          payload: { error: 'invalid_signature' },\n        })",
     "      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je\n        // tiho zavrnilo brez sledi v /integracije.\n        await zapisiLog(supabase, {\n          org_id: orgId,\n          status: 'failed',\n          payload: { error: 'invalid_signature' },\n        })"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #4',
     '    // a smo ga namenoma preskocili". Zdaj beleximo VSAK prejeti dogodek.\n    const handledEvents = [\'checkout.session.completed\', \'invoice.paid\']\n    if (!handledEvents.includes(event.type)) {\n      await supabase.from(\'integration_logs\').insert({\n        org_id: orgId,\n        integration_type: \'stripe\',\n        external_id: event.data?.object?.id ?? null,\n        status: \'skipped\',\n        payload: { reason: \'event_type_not_handled\', event_type: event.type },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })\n    }\n',
     '    // a smo ga namenoma preskocili". Zdaj beleximo VSAK prejeti dogodek.\n    const handledEvents = [\'checkout.session.completed\', \'invoice.paid\']\n    if (!handledEvents.includes(event.type)) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: event.data?.object?.id ?? null,\n        status: \'skipped\',\n        payload: { reason: \'event_type_not_handled\', event_type: event.type, event_id: event.id },\n      })\n      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })\n    }\n'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #5',
     "    // Za enkratna placila (mode:'payment') checkout.session.completed\n    // ostane edini/pravilni dogodek - nespremenjeno.\n    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'stripe',\n        external_id: obj.id ?? null,\n        status: 'skipped',\n        payload: { reason: 'subscription_checkout_awaiting_invoice_paid', event_type: event.type },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ message: 'Checkout za narocnino - caka se invoice.paid' }, { status: 200 })\n    }\n\n    // Preveri ali račun za ta Stripe objekt že obstaja\n    const externalRef = `stripe-${obj.id}`\n    const { data: existing } = await supabase",
     '    // Za enkratna placila (mode:\'payment\') checkout.session.completed\n    // ostane edini/pravilni dogodek - nespremenjeno.\n    if (event.type === \'checkout.session.completed\' && obj.mode === \'subscription\') {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: \'skipped\',\n        payload: { reason: \'subscription_checkout_awaiting_invoice_paid\', event_type: event.type, event_id: event.id },\n      })\n      return NextResponse.json({ message: \'Checkout za narocnino - caka se invoice.paid\' }, { status: 200 })\n    }\n\n    // PRELET 320: ista past kot zgoraj, le pri ENKRATNEM placilu. Ce ima\n    // Payment Link / Checkout vklopljeno "Create an invoice" (invoice_creation),\n    // Stripe za isti nakup poslje checkout.session.completed (cs_) IN\n    // invoice.paid (in_) - dva razlicna ID-ja, dedup ju ne bi povezal in\n    // nastala bi DVA racuna. V tem primeru je vir resnice invoice.paid.\n    if (event.type === \'checkout.session.completed\' && obj.invoice) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: \'skipped\',\n        payload: { reason: \'checkout_with_invoice_awaiting_invoice_paid\', event_type: event.type, event_id: event.id, invoice: obj.invoice },\n      })\n      return NextResponse.json({ message: \'Checkout z racunom - caka se invoice.paid\' }, { status: 200 })\n    }\n\n    // Preveri ali račun za ta Stripe objekt že obstaja\n    const externalRef = `stripe-${obj.id}`\n    const { data: existing } = await supabase'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #6',
     "      .maybeSingle()\n\n    if (existing) {\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'stripe',\n        external_id: obj.id ?? null,\n        invoice_id: existing.id,\n        status: 'skipped',\n        payload: { reason: 'invoice_already_exists', event_type: event.type },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })\n    }\n",
     "      .maybeSingle()\n\n    if (existing) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        invoice_id: existing.id,\n        status: 'skipped',\n        payload: { reason: 'invoice_already_exists', event_type: event.type, event_id: event.id },\n      })\n      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })\n    }\n"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #7',
     "      .single()\n\n    if (!org) {\n      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })\n    }\n\n    // Znesek je v Stripe vedno v najmanjši enoti valute (centi)\n    const amountTotal = (obj.amount_total ?? obj.amount_paid ?? obj.amount ?? 0) / 100\n    if (amountTotal <= 0) {\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'stripe',\n        external_id: obj.id ?? null,\n        status: 'skipped',\n        payload: { reason: 'amount_zero_or_negative', event_type: event.type },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ message: 'Znesek 0 — preskočeno' }, { status: 200 })\n    }\n",
     "      .single()\n\n    if (!org) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: 'failed',\n        payload: { reason: 'org_not_found', event_type: event.type, event_id: event.id },\n      })\n      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })\n    }\n\n    // Znesek je v Stripe vedno v najmanjši enoti valute (centi).\n    // PRELET 320: glej izracunajZnesek() - pri racunu je merodajen `total`.\n    const { centi: znesekCenti, opomba: znesekOpomba } = izracunajZnesek(obj)\n    const amountTotal = znesekCenti / 100\n    if (amountTotal <= 0) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: 'skipped',\n        payload: {\n          reason: 'amount_zero_or_negative',\n          event_type: event.type,\n          event_id: event.id,\n          // za diagnostiko: vsa znesek-polja, kot jih je poslal Stripe\n          total: obj.total ?? null,\n          amount_paid: obj.amount_paid ?? null,\n          amount_due: obj.amount_due ?? null,\n          amount_total: obj.amount_total ?? null,\n          paid_out_of_band: obj.paid_out_of_band ?? null,\n          billing_reason: obj.billing_reason ?? null,\n        },\n      })\n      return NextResponse.json({ message: 'Znesek 0 — preskočeno' }, { status: 200 })\n    }\n"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #8',
     "    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? null\n    const customerName = obj.customer_details?.name ?? obj.customer_name ?? customerEmail ?? 'Stranka iz Stripe'\n\n    const description = obj.description ?? `Stripe plačilo #${obj.id}`\n\n    const lineItems = [{\n      description,",
     '    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? null\n    const customerName = obj.customer_details?.name ?? obj.customer_name ?? customerEmail ?? \'Stranka iz Stripe\'\n\n    // PRELET 320: Stripe racun (invoice) ima opis prodaje v postavkah\n    // (lines), ne v `description` - prej je na racunu pisalo samo\n    // "Stripe plačilo #in_...". Zdaj vzamemo opise postavk (npr. "Masterclass").\n    const opisPostavk = Array.isArray(obj.lines?.data)\n      ? obj.lines.data.map((l: any) => l?.description).filter(Boolean).join(\', \')\n      : \'\'\n    const description = (obj.description || opisPostavk || `Stripe plačilo #${obj.id}`).slice(0, 300)\n\n    const lineItems = [{\n      description,'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #9',
     "    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)\n    const issueDate = lokalniDatum()\n\n    const { data: invoice, error: invErr } = await supabase\n      .from('issued_invoices')\n      .insert({",
     '    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)\n    const issueDate = lokalniDatum()\n\n    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,\n    // ko se zamujen dogodek v Stripe rocno ponovno poslje ("Resend") - racun\n    // se izda danes, datum opravljene storitve in placila pa ostaneta pravilna.\n    const placanoSek = Number(obj.status_transitions?.paid_at ?? obj.created ?? event.created ?? 0)\n    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()\n    const datumPlacila = lokalniDatum(placanoOb)\n\n    const { data: invoice, error: invErr } = await supabase\n      .from(\'issued_invoices\')\n      .insert({'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #10',
     "        client_email: customerEmail,\n        issue_date: issueDate,\n        due_date: issueDate,\n        service_date_from: issueDate,\n        service_date_to: issueDate,\n        line_items: lineItems,\n        amount_net: Math.round(amountNet * 100) / 100,\n        vat_amount: Math.round(vatAmount * 100) / 100,\n        amount_total: Math.round(amountTotal * 100) / 100,\n        status: 'paid',\n        paid_at: new Date().toISOString(),\n        paid_amount: amountTotal,\n        notes: `Stripe plačilo — ${event.type} (${obj.id})`,\n        external_reference: externalRef,\n      })\n      .select('id')\n      .single()\n\n    if (invErr || !invoice) {\n      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)\n    }",
     '        client_email: customerEmail,\n        issue_date: issueDate,\n        due_date: issueDate,\n        service_date_from: datumPlacila,\n        service_date_to: datumPlacila,\n        line_items: lineItems,\n        amount_net: Math.round(amountNet * 100) / 100,\n        vat_amount: Math.round(vatAmount * 100) / 100,\n        amount_total: Math.round(amountTotal * 100) / 100,\n        status: \'paid\',\n        paid_at: placanoOb.toISOString(),\n        paid_amount: amountTotal,\n        notes: `Stripe plačilo — ${event.type} (${obj.id}).${znesekOpomba}`,\n        external_reference: externalRef,\n      })\n      .select(\'id\')\n      .single()\n\n    // PRELET 320: ce Stripe isti dogodek poslje dvakrat hkrati (ponovni\n    // poskus med se tekoco obdelavo), sta prej obe obdelavi presli preverbo\n    // "ze obstaja" in nastala sta DVA racuna. Unikatni indeks iz migracije\n    // 159 drugi vpis zavrne (23505) - to ni napaka, ampak pravilen dvojnik.\n    if (invErr?.code === \'23505\') {\n      const { data: obstojeci } = await supabase\n        .from(\'issued_invoices\')\n        .select(\'id\')\n        .eq(\'org_id\', orgId)\n        .eq(\'external_reference\', externalRef)\n        .maybeSingle()\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        invoice_id: obstojeci?.id ?? null,\n        status: \'skipped\',\n        payload: { reason: \'invoice_already_exists_concurrent\', event_type: event.type, event_id: event.id },\n      })\n      return NextResponse.json({ message: \'Račun že obstaja\', invoiceId: obstojeci?.id ?? null }, { status: 200 })\n    }\n\n    if (invErr || !invoice) {\n      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)\n    }'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #11',
     "    })\n    if (kpoErr) {\n      console.error('Stripe webhook: racun', invoiceNumber, 'je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'stripe',\n        status: 'failed',\n        payload: {\n          error: 'kpo_entry_failed',",
     "    })\n    if (kpoErr) {\n      console.error('Stripe webhook: racun', invoiceNumber, 'je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        invoice_id: invoice.id,\n        status: 'failed',\n        payload: {\n          error: 'kpo_entry_failed',"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #12',
     "          vat_amount: Math.round(vatAmount * 100) / 100,\n          amount_total: Math.round(amountTotal * 100) / 100,\n          status: 'paid',\n          paid_at: new Date().toISOString(),\n          zoi: fursResult?.zoi ?? null,\n          eor: fursResult?.eor ?? null,\n          organizations: org,",
     "          vat_amount: Math.round(vatAmount * 100) / 100,\n          amount_total: Math.round(amountTotal * 100) / 100,\n          status: 'paid',\n          paid_at: placanoOb.toISOString(),\n          zoi: fursResult?.zoi ?? null,\n          eor: fursResult?.eor ?? null,\n          organizations: org,"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #13',
     "      console.warn('Stripe placilo brez e-maila stranke - racun ni bil poslan po posti:', invoice.id)\n    }\n\n    await supabase.from('integration_logs').insert({\n      org_id: orgId,\n      integration_type: 'stripe',\n      external_id: obj.id,\n      invoice_id: invoice.id,\n      status: 'success',\n      payload: { event_type: event.type, amount_total: amountTotal },\n    })\n\n    return NextResponse.json({",
     "      console.warn('Stripe placilo brez e-maila stranke - racun ni bil poslan po posti:', invoice.id)\n    }\n\n    await zapisiLog(supabase, {\n      org_id: orgId,\n      external_id: obj.id,\n      invoice_id: invoice.id,\n      status: 'success',\n      payload: { event_type: event.type, event_id: event.id, amount_total: amountTotal },\n    })\n\n    return NextResponse.json({"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #14',
     '    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").\n    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).\n    if (orgId && supabase) {\n      await supabase.from(\'integration_logs\').insert({\n        org_id: orgId,\n        integration_type: \'stripe\',\n        status: \'failed\',\n        payload: { error: String(e?.message || e) },\n      }).then(() => {}, () => {})\n    }\n    return NextResponse.json({ error: e.message }, { status: 500 })\n  }',
     '    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").\n    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).\n    if (orgId && supabase) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        status: \'failed\',\n        payload: { error: String(e?.message || e) },\n      })\n    }\n    return NextResponse.json({ error: e.message }, { status: 500 })\n  }'),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #1',
     '  )\n}\n\n// Logs komponenta\nfunction IntegrationLogs({ orgId, supabase }: { orgId: string | null; supabase: any }) {\n  const [logs, setLogs] = useState<any[]>([])',
     "  )\n}\n\n// PRELET 320: razlog v berljivi obliki. Do prelet 320 se zapisi 'skipped'\n// in 'failed' zaradi omejitve v bazi sploh niso shranili, zdaj pa bi se\n// vsi prikazali kot ❌ brez pojasnila - tudi povsem pravilni preskoki\n// (npr. brezplacni preizkus za 0 €), kar bi uporabnika po nepotrebnem skrbelo.\nconst RAZLOGI_DOGODKOV: Record<string, string> = {\n  amount_zero_or_negative: 'Znesek 0 € (npr. brezplačni preizkus) — račun ni potreben',\n  invoice_already_exists: 'Račun za to plačilo že obstaja',\n  invoice_already_exists_concurrent: 'Račun za to plačilo že obstaja',\n  subscription_checkout_awaiting_invoice_paid: 'Naročnina — račun se izda ob dogodku invoice.paid',\n  checkout_with_invoice_awaiting_invoice_paid: 'Plačilo z računom — račun se izda ob dogodku invoice.paid',\n  event_type_not_handled: 'Vrsta dogodka se ne obdeluje',\n  integration_not_active_or_missing: 'Integracija ni aktivna',\n  org_not_found: 'Organizacija ni najdena',\n  invalid_signature: 'Neveljaven podpis — preverite Signing secret',\n  kpo_entry_failed: 'Račun izdan, vnos v knjigo prihodkov ni uspel',\n}\n\nfunction opisDogodka(log: any): string | null {\n  const p = log?.payload ?? {}\n  const kljuc = p.reason ?? p.error\n  if (!kljuc) return null\n  return RAZLOGI_DOGODKOV[kljuc] ?? String(kljuc)\n}\n\n// Logs komponenta\nfunction IntegrationLogs({ orgId, supabase }: { orgId: string | null; supabase: any }) {\n  const [logs, setLogs] = useState<any[]>([])"),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #2',
     "      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>\n        {logs.map(log => (\n          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#F7F6F2', borderRadius: 8 }}>\n            <span style={{ fontSize: 14 }}>{log.status === 'success' ? '✅' : '❌'}</span>\n            <div style={{ flex: 1 }}>\n              <div style={{ fontSize: 12, fontWeight: 500, color: '#0D1F12' }}>\n                {log.integration_type === 'woocommerce' ? '🛒 WooCommerce' : log.integration_type === 'shopify' ? '🏪 Shopify' : '💳 Stripe'} · #{log.external_id}\n              </div>\n              <div style={{ fontSize: 11, color: '#888' }}>\n                {new Date(log.created_at).toLocaleString('sl-SI')}\n              </div>\n            </div>\n            {log.invoice_id && (",
     "      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>\n        {logs.map(log => (\n          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#F7F6F2', borderRadius: 8 }}>\n            <span style={{ fontSize: 14 }}>{log.status === 'success' ? '✅' : log.status === 'skipped' ? '⏭️' : '❌'}</span>\n            <div style={{ flex: 1 }}>\n              <div style={{ fontSize: 12, fontWeight: 500, color: '#0D1F12' }}>\n                {log.integration_type === 'woocommerce' ? '🛒 WooCommerce' : log.integration_type === 'shopify' ? '🏪 Shopify' : '💳 Stripe'}{log.external_id ? ` · #${log.external_id}` : ''}\n              </div>\n              <div style={{ fontSize: 11, color: '#888' }}>\n                {new Date(log.created_at).toLocaleString('sl-SI')}\n                {log.status !== 'success' && opisDogodka(log) ? ` · ${opisDogodka(log)}` : ''}\n              </div>\n            </div>\n            {log.invoice_id && ("),

]


def aplic(repo, preveri=False):
    print(f"Repozitorij: {repo}\n")
    stevilo = 0
    skupaj = len(ZAMENJAVE) + len(NOVE_DATOTEKE)
    for pot, vsebina in NOVE_DATOTEKE.items():
        polna_pot = os.path.join(repo, pot)
        if os.path.exists(polna_pot):
            with open(polna_pot, encoding='utf-8') as f:
                if f.read() == vsebina:
                    print(f"  v nova datoteka ze obstaja (enaka): {pot}")
                    stevilo += 1
                    continue
            print(f"  ! nova datoteka ze obstaja z DRUGO vsebino: {pot}")
            continue
        if preveri:
            print(f"  v nova datoteka OK: {pot}")
            stevilo += 1
            continue
        os.makedirs(os.path.dirname(polna_pot), exist_ok=True)
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(vsebina)
        print(f"  + ustvarjena: {pot}")
        stevilo += 1
    for pot, opis, staro, novo in ZAMENJAVE:
        polna_pot = os.path.join(repo, pot)
        if not os.path.exists(polna_pot):
            print(f"  ! MANJKA DATOTEKA: {pot}")
            continue
        with open(polna_pot, encoding='utf-8') as f:
            vsebina = f.read()
        n = vsebina.count(staro)
        if n == 0:
            print(f"  ! sidro NI najdeno: {opis}")
            continue
        if n > 1:
            print(f"  ! sidro NI EDINSTVENO ({n}x): {opis}")
            continue
        if preveri:
            print(f"  v sidro OK: {opis}")
            stevilo += 1
            continue
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(vsebina.replace(staro, novo))
        print(f"  + aplicirano: {opis}")
        stevilo += 1
    print()
    if preveri:
        print(f"Nacin --preveri: nic ni bilo spremenjeno. ({stevilo}/{skupaj} OK)")
    else:
        print(f"PRELET 320 uspesno apliciran ({stevilo}/{skupaj}).")
    if stevilo != skupaj:
        sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet320.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
