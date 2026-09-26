#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 325 - webhooki: obvezen podpis, trk stevilke ni vec "dvojnik", WooCommerce+Stripe brez dvojnih racunov.

 1. VARNOST: Stripe, WooCommerce in Shopify webhook sta podpis preverjala
    samo, ce je zahteva imela glavo s podpisom. Zahteva BREZ glave je sla
    mimo - kdor je poznal org_id (je v URL-ju), je lahko sprozil izdajo,
    fiskalizacijo in posiljanje izmisljenega racuna. Zdaj: brez secreta ali
    podpisa -> 401 + zapis v dnevnik. Stripe: 5-min casovna toleranca in
    podpora vec v1 podpisom (menjava secreta). Nastavitve ne dovolijo vec
    shraniti integracije brez secreta (Stripe: mora se zaceti z whsec_).
    Vse 4 aktivne Stripe integracije v produkciji imajo secret (preverjeno).
 2. Prelet 320 je VSAK 23505 razumel kot "racun ze obstaja" in vrnil 200.
    Trk STEVILKE racuna (dve hkratni placili) je tako tiho izgubil placilo.
    Zdaj se locita omejitvi; trk stevilke -> nova stevilka (do 3x), sicer
    500, da Stripe dogodek ponovi.
 3. WooCommerce trgovina s Stripe prehodom: Stripe placilo (metadata
    order_id + site_url) se preskoci, ce je WooCommerce integracija za isto
    trgovino aktivna - racun izda WooCommerce (sicer WC- + STR- za isti nakup).

PREVERJENO: npx tsc --noEmit = 0 napak; preverjanje podpisa preizkuseno
(veljaven, dva v1, napacen secret, star 10 min, brez t, spremenjeno telo).

Uporaba:
    python3 prelet325.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet325.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #1',
     "\n/**\n * Preveri Stripe webhook podpis (HMAC-SHA256 po Stripe specifikaciji).\n * Stripe pošlje header: t=timestamp,v1=signature\n */\nfunction verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {\n  try {\n    const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part) => {\n      const [k, v] = part.split('=')\n      acc[k] = v\n      return acc\n    }, {})\n    const timestamp = parts['t']\n    const signature = parts['v1']\n    if (!timestamp || !signature) return false\n\n    const signedPayload = `${timestamp}.${payload}`\n    const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')\n\n    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))\n  } catch {\n    return false\n  }",
     "\n/**\n * Preveri Stripe webhook podpis (HMAC-SHA256 po Stripe specifikaciji).\n * Stripe pošlje header: t=timestamp,v1=signature[,v1=signature2]\n *\n * PRELET 325:\n *  - sprejmemo KATERIKOLI v1 podpis (med zamenjavo secreta Stripe poslje\n *    dva - prej je veljal samo zadnji, pravilno podpisan dogodek je lahko\n *    padel);\n *  - casovna toleranca 5 minut (kot uradna Stripe knjiznica), da prestrezen\n *    star dogodek ni mogoce poslati znova.\n */\nconst STRIPE_TOLERANCA_SEK = 300\n\nfunction verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {\n  try {\n    let timestamp = ''\n    const podpisi: string[] = []\n    for (const del of sigHeader.split(',')) {\n      const i = del.indexOf('=')\n      if (i < 0) continue\n      const k = del.slice(0, i).trim()\n      const v = del.slice(i + 1).trim()\n      if (k === 't') timestamp = v\n      else if (k === 'v1') podpisi.push(v)\n    }\n    if (!timestamp || podpisi.length === 0) return false\n    const t = Number(timestamp)\n    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > STRIPE_TOLERANCA_SEK) return false\n\n    const signedPayload = `${timestamp}.${payload}`\n    const computed = Buffer.from(crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex'))\n    return podpisi.some(p => {\n      const b = Buffer.from(p)\n      return b.length === computed.length && crypto.timingSafeEqual(computed, b)\n    })\n  } catch {\n    return false\n  }"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #2',
     "      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })\n    }\n\n    if (integration.webhook_secret && signature) {\n      const isValid = verifyStripeSignature(rawBody, signature, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je",
     '      return NextResponse.json({ error: \'Stripe integracija ni nastavljena\' }, { status: 404 })\n    }\n\n    // PRELET 325 (VARNOST): prej se je podpis preverjal SAMO, ce je bil\n    // secret nastavljen IN je zahteva imela glavo stripe-signature. Zahteva\n    // BREZ glave je sla mimo preverbe - kdor je poznal org_id (je v URL-ju),\n    // je lahko poslal izmisljeno "placilo" in Racunko bi izdal, fiskaliziral\n    // in po e-posti poslal racun. Zdaj brez veljavnega podpisa ni obdelave.\n    if (!integration.webhook_secret || !signature) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        status: \'failed\',\n        payload: { error: !integration.webhook_secret ? \'missing_webhook_secret\' : \'missing_signature\' },\n      })\n      return NextResponse.json({ error: \'Manjka podpis ali Signing secret\' }, { status: 401 })\n    }\n    {\n      const isValid = verifyStripeSignature(rawBody, signature, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #3',
     "      return NextResponse.json({ message: 'API verzija ne omogoca locevanja placil' }, { status: 200 })\n    }\n\n    // PRELET 324: KLJUC PLACILA za zascito pred dvojniki. En nakup prek\n    // Checkouta sprozi checkout.session.completed (cs_) IN\n    // payment_intent.succeeded (pi_) - zato se je 22.7.2026 payment_intent",
     "      return NextResponse.json({ message: 'API verzija ne omogoca locevanja placil' }, { status: 200 })\n    }\n\n    // PRELET 325: WooCommerce trgovina, ki placila pobira prek Stripa\n    // (vticnik WooCommerce Stripe Gateway), v placilo zapise metadata\n    // `order_id` in `site_url`. Ce ima organizacija AKTIVNO WooCommerce\n    // integracijo za isto trgovino, racun izda WooCommerce webhook (z vsemi\n    // postavkami) - brez te zapore bi za isti nakup nastala DVA racuna\n    // (WC-... in STR-...). Ce WooCommerce integracije ni, racun izda Stripe.\n    const wooSite = obj.metadata?.site_url\n    if (obj.metadata?.order_id && wooSite) {\n      const { data: wooInt } = await supabase\n        .from('integrations')\n        .select('settings')\n        .eq('org_id', orgId)\n        .eq('type', 'woocommerce')\n        .eq('is_active', true)\n        .maybeSingle()\n      const gostitelj = (u: any) => { try { return new URL(String(u)).host.replace(/^www\\./, '').toLowerCase() } catch { return '' } }\n      if (wooInt && gostitelj(wooInt.settings?.shop_url) && gostitelj(wooInt.settings?.shop_url) === gostitelj(wooSite)) {\n        await zapisiLog(supabase, {\n          org_id: orgId,\n          external_id: obj.id ?? null,\n          status: 'skipped',\n          payload: { reason: 'woocommerce_order_invoiced_by_woocommerce', event_type: event.type, event_id: event.id, woo_order_id: obj.metadata.order_id },\n        })\n        return NextResponse.json({ message: 'Placilo WooCommerce narocila - racun izda WooCommerce' }, { status: 200 })\n      }\n    }\n\n    // PRELET 324: KLJUC PLACILA za zascito pred dvojniki. En nakup prek\n    // Checkouta sprozi checkout.session.completed (cs_) IN\n    // payment_intent.succeeded (pi_) - zato se je 22.7.2026 payment_intent"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #4',
     '      vat_amount: Math.round(vatAmount * 100) / 100,\n    }]\n\n    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)\n    const issueDate = lokalniDatum()\n\n    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,',
     "      vat_amount: Math.round(vatAmount * 100) / 100,\n    }]\n\n    let invoiceNumber = ''\n    const issueDate = lokalniDatum()\n\n    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,"),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #5',
     "    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()\n    const datumPlacila = lokalniDatum(placanoOb)\n\n    const { data: invoice, error: invErr } = await supabase\n      .from('issued_invoices')\n      .insert({\n        org_id: orgId,\n        invoice_number: invoiceNumber,\n        invoice_type: 'invoice',\n        client_name: customerName,\n        client_email: customerEmail,",
     '    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()\n    const datumPlacila = lokalniDatum(placanoOb)\n\n    // PRELET 325: do 3 poskusi. Stevilka STR-LLLL-NNNN je "najvisja + 1" brez\n    // zaklepa - dve hkratni placili lahko dobita isto stevilko. Prej je koda\n    // VSAK 23505 razumela kot "racun za to placilo ze obstaja" in vrnila 200:\n    // drugo placilo je tiho izginilo. Zdaj locimo, KATERA omejitev je padla:\n    //  - issued_invoices_org_webhook_ref_uniq  -> res isto placilo (dvojnik)\n    //  - karkoli drugega (stevilka racuna)       -> nova stevilka, nov poskus\n    const vpisiRacun = (stevilka: string) => supabase\n      .from(\'issued_invoices\')\n      .insert({\n        org_id: orgId,\n        invoice_number: stevilka,\n        invoice_type: \'invoice\',\n        client_name: customerName,\n        client_email: customerEmail,'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #6',
     '      .select(\'id\')\n      .single()\n\n    // PRELET 320: ce Stripe isti dogodek poslje dvakrat hkrati (ponovni\n    // poskus med se tekoco obdelavo), sta prej obe obdelavi presli preverbo\n    // "ze obstaja" in nastala sta DVA racuna. Unikatni indeks iz migracije\n    // 159 drugi vpis zavrne (23505) - to ni napaka, ampak pravilen dvojnik.\n    if (invErr?.code === \'23505\') {\n      const { data: obstojeci } = await supabase\n        .from(\'issued_invoices\')\n        .select(\'id\')',
     '      .select(\'id\')\n      .single()\n\n    let invoice: any = null\n    let invErr: any = null\n    let jeDvojnikPlacila = false\n    for (let poskus = 0; poskus < 3; poskus++) {\n      invoiceNumber = await generateInvoiceNumber(supabase, orgId)\n      const rez = await vpisiRacun(invoiceNumber)\n      invoice = rez.data\n      invErr = rez.error\n      if (!invErr || invErr.code !== \'23505\') break\n      const besedilo = `${invErr.message || \'\'} ${invErr.details || \'\'}`\n      jeDvojnikPlacila = /issued_invoices_org_webhook_ref_uniq|external_reference/.test(besedilo)\n      if (jeDvojnikPlacila) break\n      console.warn(`Stripe webhook: trk stevilke racuna ${invoiceNumber} (poskus ${poskus + 1}/3) - poskusam z novo stevilko`)\n    }\n\n    // Trk stevilke tudi po treh poskusih: vrnemo 500, da Stripe dogodek\n    // PONOVI (ne 200 - sicer bi placilo ostalo brez racuna za vedno).\n    if (invErr?.code === \'23505\' && !jeDvojnikPlacila) {\n      await zapisiLog(supabase, {\n        org_id: orgId,\n        external_id: obj.id ?? null,\n        status: \'failed\',\n        payload: { reason: \'invoice_number_conflict\', event_type: event.type, event_id: event.id, message: invErr.message },\n      })\n      return NextResponse.json({ error: \'Trk številke računa - poskusite znova\' }, { status: 500 })\n    }\n\n    // PRELET 320: ce Stripe isti dogodek poslje dvakrat hkrati (ponovni\n    // poskus med se tekoco obdelavo), sta prej obe obdelavi presli preverbo\n    // "ze obstaja" in nastala sta DVA racuna. Unikatni indeks iz migracije\n    // 159 drugi vpis zavrne (23505) - to ni napaka, ampak pravilen dvojnik.\n    if (invErr?.code === \'23505\' && jeDvojnikPlacila) {\n      const { data: obstojeci } = await supabase\n        .from(\'issued_invoices\')\n        .select(\'id\')'),
    ('apps/web/app/api/webhooks/woocommerce/route.ts',
     'apps/web/app/api/webhooks/woocommerce/route.ts: sprememba #1',
     '    }\n\n    // Preveri podpis (če je secret nastavljen)\n    if (integration.webhook_secret && signature) {\n      const isValid = verifyWooCommerceSignature(rawBody, signature, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je',
     "    }\n\n    // Preveri podpis (če je secret nastavljen)\n    // PRELET 325 (VARNOST): brez secreta ali brez podpisa ni obdelave - prej\n    // je zahteva brez glave s podpisom sla mimo preverbe in lahko ustvarila\n    // izmisljen placan racun (org_id je v URL-ju).\n    if (!integration.webhook_secret || !signature) {\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'woocommerce',\n        status: 'failed',\n        payload: { error: !integration.webhook_secret ? 'missing_webhook_secret' : 'missing_signature' },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ error: 'Manjka podpis ali Signing secret' }, { status: 401 })\n    }\n    {\n      const isValid = verifyWooCommerceSignature(rawBody, signature, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je"),
    ('apps/web/app/api/webhooks/shopify/route.ts',
     'apps/web/app/api/webhooks/shopify/route.ts: sprememba #1',
     '    }\n\n    // Preveri podpis\n    if (integration.webhook_secret && hmacHeader) {\n      const isValid = verifyShopifySignature(rawBody, hmacHeader, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je',
     "    }\n\n    // Preveri podpis\n    // PRELET 325 (VARNOST): brez secreta ali brez podpisa ni obdelave - prej\n    // je zahteva brez glave s podpisom sla mimo preverbe in lahko ustvarila\n    // izmisljen placan racun (org_id je v URL-ju).\n    if (!integration.webhook_secret || !hmacHeader) {\n      await supabase.from('integration_logs').insert({\n        org_id: orgId,\n        integration_type: 'shopify',\n        status: 'failed',\n        payload: { error: !integration.webhook_secret ? 'missing_webhook_secret' : 'missing_signature' },\n      }).then(() => {}, () => {})\n      return NextResponse.json({ error: 'Manjka podpis ali Signing secret' }, { status: 401 })\n    }\n    {\n      const isValid = verifyShopifySignature(rawBody, hmacHeader, integration.webhook_secret)\n      if (!isValid) {\n        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je"),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #1',
     '  async function saveIntegration(type: \'woocommerce\' | \'shopify\' | \'stripe\', shopUrl: string, secret: string) {\n    if (!orgId) return\n    if (type !== \'stripe\' && !shopUrl.trim()) { showToast(\'error\', \'URL trgovine je obvezen\'); return }\n\n    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se\n    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA',
     '  async function saveIntegration(type: \'woocommerce\' | \'shopify\' | \'stripe\', shopUrl: string, secret: string) {\n    if (!orgId) return\n    if (type !== \'stripe\' && !shopUrl.trim()) { showToast(\'error\', \'URL trgovine je obvezen\'); return }\n    // PRELET 325: brez secreta webhook zdaj zavrne vse zahteve (varnost), zato\n    // ga zahtevamo ze tu - sicer bi se integracija shranila, a nikoli delovala.\n    if (!secret.trim()) { showToast(\'error\', type === \'stripe\' ? \'Signing secret (whsec_…) je obvezen\' : \'Webhook secret je obvezen\'); return }\n    if (type === \'stripe\' && !secret.trim().startsWith(\'whsec_\')) { showToast(\'error\', \'Stripe Signing secret se začne z whsec_ — preverite, da niste kopirali drugega ključa\'); return }\n\n    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se\n    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA'),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #2',
     "  integration_not_active_or_missing: 'Integracija ni aktivna',\n  org_not_found: 'Organizacija ni najdena',\n  invalid_signature: 'Neveljaven podpis — preverite Signing secret',\n  kpo_entry_failed: 'Račun izdan, vnos v knjigo prihodkov ni uspel',\n}\n",
     "  integration_not_active_or_missing: 'Integracija ni aktivna',\n  org_not_found: 'Organizacija ni najdena',\n  invalid_signature: 'Neveljaven podpis — preverite Signing secret',\n  missing_signature: 'Zahteva brez podpisa — zavrnjena',\n  missing_webhook_secret: 'Signing secret ni vpisan — vpišite ga v nastavitvah integracije',\n  woocommerce_order_invoiced_by_woocommerce: 'Plačilo WooCommerce naročila — račun izda WooCommerce integracija',\n  invoice_number_conflict: 'Trk številke računa — Stripe bo dogodek poslal znova',\n  kpo_entry_failed: 'Račun izdan, vnos v knjigo prihodkov ni uspel',\n}\n"),

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
        print(f"PRELET 325 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet325.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
