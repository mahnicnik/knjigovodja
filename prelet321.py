#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 321 - placilo narocnine: "No such customer" + trial Pro ni mogel placati Pro.

DIAGNOZA (25.9.2026): po zamenjavi STRIPE_SECRET_KEY (bil je vezan na DRUG
Stripe racun kot cene) je cena zacela delovati, placilo pa je padlo z
"No such customer: 'cus_VILGFhFBh40Wpd'" - v bazi shranjena Stripe stranka
je bila ustvarjena v starem racunu. Poleg tega je preverba
`subscription_status === 'pro'` zavrnila vsako stranko na PREIZKUSU Pro, ki
je hotela placati Pro ("Že imate Pro plan").

POPRAVKI (api/stripe/checkout):
 - neveljavna shranjena Stripe stranka -> ustvari novo in poskusi znova
 - "ze ima narocnino" se presoja po stripe_subscription_id (placano),
   ne po subscription_status (velja ze med preizkusom)
 - stranka ne vidi vec surovega anglesko sporocila Stripa

PREVERJENO: npx tsc --noEmit = 0 napak.

Uporaba:
    python3 prelet321.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet321.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/api/stripe/checkout/route.ts',
     'apps/web/app/api/stripe/checkout/route.ts: sprememba #1',
     "    }\n\n    // Pridobi org preko org_members (ne preko owner_id)\n    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'id, name, stripe_customer_id, subscription_status') // vec-org podpora (30.7.2026)\n    const memberErr = null\n\n    if (memberErr || !member || !(member as any).organizations) {",
     "    }\n\n    // Pridobi org preko org_members (ne preko owner_id)\n    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'id, name, stripe_customer_id, stripe_subscription_id, subscription_status') // vec-org podpora (30.7.2026)\n    const memberErr = null\n\n    if (memberErr || !member || !(member as any).organizations) {"),
    ('apps/web/app/api/stripe/checkout/route.ts',
     'apps/web/app/api/stripe/checkout/route.ts: sprememba #2',
     "\n    const org = (member as any).organizations\n\n    // Preveri da uporabnik še nima Pro\n    if (org.subscription_status === 'pro') {\n      return NextResponse.json({ error: 'Že imate Pro plan' }, { status: 400 })\n    }\n\n    // Ustvari ali pridobi Stripe customer\n    let customerId = org.stripe_customer_id\n\n    if (!customerId) {\n      const customer = await stripe.customers.create({\n        email: user.email,\n        name: org.name,\n        metadata: { org_id: org.id, user_id: user.id },\n      })\n      customerId = customer.id\n\n      await supabase\n        .from('organizations')\n        .update({ stripe_customer_id: customerId })\n        .eq('id', org.id)\n    }\n\n    // Ustvari checkout session\n    const session = await stripe.checkout.sessions.create({\n      customer: customerId,\n      mode: 'subscription',\n      payment_method_types: ['card'],\n      line_items: [{\n        price: priceId,\n        quantity: 1,\n      }],\n      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?success=true`,\n      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?cancelled=true`,\n      metadata: { org_id: org.id },\n      subscription_data: {\n        metadata: { org_id: org.id },\n      },\n      locale: 'sl',\n    })\n\n    return NextResponse.json({ url: session.url })\n\n  } catch (error: any) {\n    console.error('Stripe checkout error:', error)\n    return NextResponse.json({ error: error.message }, { status: 500 })\n  }\n}",
     '\n    const org = (member as any).organizations\n\n    // PRELET 321: prej `subscription_status === \'pro\'` -> "Že imate Pro plan".\n    // subscription_status pa je \'pro\'/\'pro_pos\' ze MED BREZPLACNIM\n    // PREIZKUSOM, ko se ni nic placano - stranka na preizkusu Pro zato Pro\n    // sploh ni mogla placati (prelet 319 je gumbe prikazal, ta preverba pa\n    // jih je zavrnila). Merodajno je, ali obstaja PLACANA naročnina.\n    // Ce obstaja, druge ne odpiramo (bila bi dvojna bremenitev) - menjava\n    // paketa gre prek "Upravljaj naročnino" (Stripe portal).\n    if (org.stripe_subscription_id) {\n      return NextResponse.json({\n        error: \'Že imate aktivno plačano naročnino. Paket spremenite v Nastavitve → Naročnina → Upravljaj naročnino.\',\n      }, { status: 400 })\n    }\n\n    async function novaStripeStranka(): Promise<string> {\n      const customer = await stripe.customers.create({\n        email: user!.email,\n        name: org.name,\n        metadata: { org_id: org.id, user_id: user!.id },\n      })\n      const { error: shraniErr } = await supabase\n        .from(\'organizations\')\n        .update({ stripe_customer_id: customer.id })\n        .eq(\'id\', org.id)\n      if (shraniErr) console.error(`Stripe stranka ${customer.id} ustvarjena, shranitev k org ${org.id} ni uspela:`, shraniErr.message)\n      return customer.id\n    }\n\n    function ustvariSejo(customerId: string) {\n      return stripe.checkout.sessions.create({\n        customer: customerId,\n        mode: \'subscription\',\n        payment_method_types: [\'card\'],\n        line_items: [{\n          price: priceId,\n          quantity: 1,\n        }],\n        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?success=true`,\n        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?cancelled=true`,\n        metadata: { org_id: org.id },\n        subscription_data: {\n          metadata: { org_id: org.id },\n        },\n        locale: \'sl\',\n      })\n    }\n\n    // Ustvari ali pridobi Stripe customer\n    let customerId: string = org.stripe_customer_id || await novaStripeStranka()\n\n    // PRELET 321: shranjena Stripe stranka lahko v Stripu ne obstaja vec -\n    // 25.9.2026 se je izkazalo, da je bil STRIPE_SECRET_KEY vezan na DRUG\n    // Stripe racun kot cene; po zamenjavi kljuca so vse prej ustvarjene\n    // stranke (cus_...) postale neveljavne in placilo je padlo z "No such\n    // customer". Enako se zgodi po prehodu iz testnega v produkcijski nacin.\n    // Stranka nima placane narocnine (preverjeno zgoraj), zato je varno\n    // ustvariti novo in poskusiti znova - enak vzorec kot api/stripe/portal.\n    let session\n    try {\n      session = await ustvariSejo(customerId)\n    } catch (e: any) {\n      const neveljavnaStranka = e?.code === \'resource_missing\' && e?.param === \'customer\'\n      if (!neveljavnaStranka) throw e\n      console.log(`Neveljavna Stripe stranka ${customerId} za org ${org.id} - ustvarjam novo`)\n      customerId = await novaStripeStranka()\n      session = await ustvariSejo(customerId)\n    }\n\n    return NextResponse.json({ url: session.url })\n\n  } catch (error: any) {\n    console.error(\'Stripe checkout error:\', error)\n    // PRELET 321: stranki je bilo prikazano surovo angleško sporočilo Stripa\n    // ("No such price: ...", "No such customer: ..."). Celotna napaka je v\n    // strežniškem dnevniku (Vercel), stranka pa dobi razumljivo sporočilo s\n    // kratko kodo, po kateri jo lahko podpora najde.\n    const koda = error?.code || error?.type || \'neznano\'\n    return NextResponse.json({\n      error: `Plačila trenutno ni bilo mogoče začeti. Poskusite znova čez nekaj minut ali nam pišite na support@računko.si (koda: ${koda}).`,\n    }, { status: 500 })\n  }\n}'),

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
        print(f"PRELET 321 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet321.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
