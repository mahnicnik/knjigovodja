#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 304 — Č/RACUNKO.SI popravki + "Skrij" na dashboardu (trajno).

TA PRELET GRE NA VRH REVERTANEGA STANJA (po "Revert: prelet 302 in 303") -
z mobilno prenovo blagajne (ki je povzrocila regresijo z zvoncem) nima nič
skupnega in je varno aplicirati takoj.

── DEL 1: "racunko.si" (BREZ sumnika) je NAPACNA, TUJA domena ──────────────
"racunko.si" (brez strehe na c) je prava domena DRUGEGA, nepovezanega
podjetja - racunovodskega servisa "Računko d.o.o." iz Kamnika. Nasa prava
domena je "računko.si" (tehnicno "xn--raunko-j2a.si"). Po temeljitem
pregledu CELEGA repozitorija (vkljucno z izpisom na tiskalniku, ne samo
izvorno kodo) so bila najdena in popravljena VSA se preostala mesta:

  - apps/desktop/main.js: izpis "odprtje blagajne / X-obracun / Z-obracun"
    na termalnem tiskalniku (funkcija za IPC "print-text") je uporabljal
    LOCENO, starejso funkcijo za ciscenje besedila, ki sumnikov sploh ni
    poznala - zato je VEDNO pisalo "racunko.si", ceprav so navadni RACUNI
    (funkcija buildEscPos, prelet 189) ze dolgo pravilni. Zdaj uporablja
    isto, na napravi ze potrjeno preklapljanje kodne strani (CP852).
    POZOR - to je datoteka namizne (Electron) aplikacije, NE spletne strani:
    sprememba zacne veljati sele po ponovni izdelavi in namestitvi nove
    razlicice namizne aplikacije, ne s samo objavo na splet (Vercel).
  - apps/web/components/PageHelp.tsx (2x): "Za pomoč pišite na
    support@racunko.si" + mailto povezava - popravljeno na
    "support@računko.si" (prikaz) / "support@xn--raunko-j2a.si" (povezava).
  - apps/web/components/nastavitve/Integracije.tsx: privzeti (SSR) URL za
    webhook naslove.
  - apps/web/components/nastavitve/ApiKljuci.tsx (2x): prikazan "Base URL"
    API dokumentacije + primer curl ukaza.
  - apps/web/app/pos/page.tsx: nogica na natisnjenem PREDRACUNU je pisala
    "sistemom RACUNKO" (vse veliko, brez sumnika) - popravljeno v
    "sistemom Računko".
  - apps/web/app/api/webhooks/{woocommerce,shopify,stripe}/route.ts:
    komentarji na vrhu datotek (navodila za uporabnika, kam vpisati URL).
  - apps/web/app/api/stripe/simulate-test-payment/route.ts: rezervni
    (fallback) testni e-mail, ce prijavljeni uporabnik nima nastavljenega
    e-naslova.

  Preverjeno kot ze PRAVILNO in NI spremenjeno: navadni racuni
  (buildEscPos v main.js, prelet 189), e-posta (lib/resend.ts,
  api/email/send), robots.ts, gmail/team/cron rute - vse te ze uporabljajo
  pravilno domeno "xn--raunko-j2a.si".

── DEL 2: Dashboard - "Skrij" pri "Začetni koraki" zdaj traja ─────────────
Gumb "Skrij" je samo nastavil stanje strani na `false` - ob naslednjem
obisku ali osvezitvi se je sklop VEDNO znova prikazal, obvestilo ob skritju
pa je se trdilo, da uporabnik korake najde "kasneje v Nastavitvah", cetudi
taka moznost ne obstaja. Zdaj se skritje shrani v localStorage (vezano na
organizacijo, enako kot ze obstojeci vzorec za posamezne korake).

Uporaba:
    python3 prelet304.py --preveri /pot/do/repozitorija   # samo preveri sidra
    python3 prelet304.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/desktop/main.js',
     'apps/desktop/main.js: sprememba #1',
     "      const ESC = 0x1B, GS = 0x1D\n      const out = []\n      const b = (...x) => out.push(...x)\n      // Isti nabor znakov kot pri racunih (Windows-1252), da sumniki ne razpadejo.\n      const sl = (s) => String(s == null ? '' : s)\n        .replace(/[čć]/g,'c').replace(/[ČĆ]/g,'C')\n        .replace(/š/g,'s').replace(/Š/g,'S')\n        .replace(/ž/g,'z').replace(/Ž/g,'Z')\n        .replace(/đ/g,'d').replace(/Đ/g,'D')\n      // Evro je v Windows-1252 bajt 0x80 - brez tega bi se izpisal kot vprasaj.\n      const txt = (s) => {\n        const t = sl(s)\n        for (let i = 0; i < t.length; i++) {\n          const c = t.charCodeAt(i)\n          b(c === 0x20AC ? 0x80 : (c > 0xFF ? 0x3F : c))\n        }\n      }\n      const lf = () => b(0x0A)\n\n      b(ESC, 0x40)          // init\n      b(ESC, 0x74, 0x10)    // kodna stran Windows-1252\n\n      for (const v of vrstice) {\n        const besedilo = typeof v === 'string' ? v : (v?.t ?? '')",
     '      const ESC = 0x1B, GS = 0x1D\n      const out = []\n      const b = (...x) => out.push(...x)\n      /**\n       * POPRAVLJENO: sumniki so tu VEDNO padli na ASCII (c/s/z), zato je\n       * otvoritev/X/Z izpis vedno pisal "racunko.si" namesto "računko.si"\n       * - ceprav so navadni RACUNI (buildEscPos zgoraj) ze od preleta 189\n       * pravilni. Ta izpis je namrec imel svojo, LOCENO in starejso\n       * cistilno funkcijo, ki sumnikov sploh ni poznala - popravek\n       * preleta 189 je zato veljal samo za racune, ne za te tri izpise.\n       *\n       * Zdaj uporablja ISTO kodno stran (CP852, na tem tiskalniku ze\n       * potrjena s preizkusom sumnikov) kot navadni racuni.\n       */\n      const CP852 = { \'č\':0x9F, \'Č\':0xAC, \'š\':0xE7, \'Š\':0xE6,\n                      \'ž\':0xA7, \'Ž\':0xA6, \'ć\':0x86, \'Ć\':0x8F,\n                      \'đ\':0xD0, \'Đ\':0xD1 }\n      let stranZdaj = 0x10\n      const nastaviStran = (n) => { if (stranZdaj !== n) { b(ESC, 0x74, n); stranZdaj = n } }\n      const sl = (s) => (String(s == null ? \'\' : s))\n        .replace(/é/g,\'e\').replace(/è/g,\'e\')\n        .replace(/[^\\x20-\\x7EčČšŠžŽćĆđĐ€\\u0080]/g,\'?\')\n      const zapisi = (s) => {\n        for (const c of String(s == null ? \'\' : s)) {\n          const k = c.charCodeAt(0)\n          if (k >= 0x20 && k <= 0x7E) { b(k); continue }\n          if (c === \'€\' || k === 0x80) { nastaviStran(0x10); b(0x80); continue }\n          const cp = CP852[c]\n          if (cp !== undefined) { nastaviStran(0x12); b(cp); continue }\n          b(0x3F)\n        }\n      }\n      const txt = (s) => zapisi(sl(s))\n      const lf = () => b(0x0A)\n\n      b(ESC, 0x40)          // init\n      b(ESC, 0x74, 0x10)    // zacetna kodna stran Windows-1252 (evro, ASCII)\n\n      for (const v of vrstice) {\n        const besedilo = typeof v === \'string\' ? v : (v?.t ?? \'\')'),
    ('apps/web/app/api/stripe/simulate-test-payment/route.ts',
     'apps/web/app/api/stripe/simulate-test-payment/route.ts: sprememba #1',
     "    // ── Zgradi SIMULIRAN Stripe objekt (checkout.session.completed, mode:payment) ──\n    const fakeStripeId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`\n    const amountTotal = 1.00 // majhen, ocitno testen znesek\n    const customerEmail = user.email ?? 'test@racunko.si'\n    const customerName = 'TEST Simulacija (Računko sandbox)'\n\n    const amountNet = amountTotal / (org.vat_registered ? 1.22 : 1)",
     "    // ── Zgradi SIMULIRAN Stripe objekt (checkout.session.completed, mode:payment) ──\n    const fakeStripeId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`\n    const amountTotal = 1.00 // majhen, ocitno testen znesek\n    const customerEmail = user.email ?? 'test@xn--raunko-j2a.si'\n    const customerName = 'TEST Simulacija (Računko sandbox)'\n\n    const amountNet = amountTotal / (org.vat_registered ? 1.22 : 1)"),
    ('apps/web/app/api/webhooks/shopify/route.ts',
     'apps/web/app/api/webhooks/shopify/route.ts: sprememba #1',
     ' * Shopify Admin → Nastavitve → Obvestila → Webhooks → Ustvari webhook\n * - Dogodek: Naročilo plačano (orders/paid)\n * - Format: JSON\n * - URL: https://racunko.si/api/webhooks/shopify?org_id=VAŠ_ORG_ID\n */\n\nasync function getSupabase() {',
     ' * Shopify Admin → Nastavitve → Obvestila → Webhooks → Ustvari webhook\n * - Dogodek: Naročilo plačano (orders/paid)\n * - Format: JSON\n * - URL: https://xn--raunko-j2a.si/api/webhooks/shopify?org_id=VAŠ_ORG_ID\n */\n\nasync function getSupabase() {'),
    ('apps/web/app/api/webhooks/stripe/route.ts',
     'apps/web/app/api/webhooks/stripe/route.ts: sprememba #1',
     ' *\n * Nastavitev v Stripe dashboardu uporabnika:\n * Stripe → Developers → Webhooks → Add endpoint\n * - URL: https://racunko.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID\n * - Events: checkout.session.completed, invoice.paid\n * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)\n *',
     ' *\n * Nastavitev v Stripe dashboardu uporabnika:\n * Stripe → Developers → Webhooks → Add endpoint\n * - URL: https://xn--raunko-j2a.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID\n * - Events: checkout.session.completed, invoice.paid\n * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)\n *'),
    ('apps/web/app/api/webhooks/woocommerce/route.ts',
     'apps/web/app/api/webhooks/woocommerce/route.ts: sprememba #1',
     ' * - Ime: Računko\n * - Status: Aktiven\n * - Tema: Naročilo ustvarjeno (ali Naročilo zaključeno)\n * - URL: https://racunko.si/api/webhooks/woocommerce?org_id=VAŠ_ORG_ID\n * - Skrivnost: (generirano v Računko nastavitvah)\n */\n',
     ' * - Ime: Računko\n * - Status: Aktiven\n * - Tema: Naročilo ustvarjeno (ali Naročilo zaključeno)\n * - URL: https://xn--raunko-j2a.si/api/webhooks/woocommerce?org_id=VAŠ_ORG_ID\n * - Skrivnost: (generirano v Računko nastavitvah)\n */\n'),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #1',
     '    if (org?.id) localStorage.setItem(`rk_dismissed_steps_${org.id}`, JSON.stringify(next))\n  }\n\n  const onboardingSteps = useMemo(() => {\n    // POPRAVLJENO (16.8.2026): korak je zahteval tudi IBAN, ki pa ni nujen -\n    // s.p. lahko posluje brez izdajanja racunov s placilom na TRR. Uporabnik je',
     '    if (org?.id) localStorage.setItem(`rk_dismissed_steps_${org.id}`, JSON.stringify(next))\n  }\n\n  // DODANO: klik na "Skrij" pri celotnem sklopu "Začetni koraki" je samo\n  // nastavil `showOnboarding` na `false` v stanju te strani - ob naslednjem\n  // obisku (ali osvezitvi) se je sklop VEDNO znova prikazal, ker se nikamor\n  // ni shranilo. Obvestilo ob skritju je pri tem se trdilo, da uporabnik\n  // korake "najde kasneje v Nastavitvah", cetudi taka moznost ne obstaja.\n  //\n  // Zdaj se skritje shrani v localStorage (vezano na organizacijo, enako kot\n  // `dismissedSteps` zgoraj), zato ostane skrito tudi po osvezitvi strani.\n  useEffect(() => {\n    if (!org?.id) return\n    try {\n      setShowOnboarding(localStorage.getItem(`rk_hide_onboarding_${org.id}`) !== \'1\')\n    } catch { /* privzeto ostane prikazano */ }\n  }, [org?.id])\n\n  function hideOnboarding() {\n    setShowOnboarding(false)\n    if (org?.id) { try { localStorage.setItem(`rk_hide_onboarding_${org.id}`, \'1\') } catch {} }\n  }\n\n  const onboardingSteps = useMemo(() => {\n    // POPRAVLJENO (16.8.2026): korak je zahteval tudi IBAN, ki pa ni nujen -\n    // s.p. lahko posluje brez izdajanja racunov s placilom na TRR. Uporabnik je'),
    ('apps/web/app/dashboard/page.tsx',
     'apps/web/app/dashboard/page.tsx: sprememba #2',
     '        {/* ONBOARDING CHECKLIST (only if not complete) */}\n        {showOnboarding && !onboardingComplete && (\n          <section className="rk-onboard">\n            <button className="rk-onboard-close" onClick={() => { setShowOnboarding(false); showToast(\'Najdete jih kasneje v Nastavitvah\') }} title="Skrij">\n              <Icon name="close" size={14} />\n            </button>\n            <div className="rk-onboard-head">',
     '        {/* ONBOARDING CHECKLIST (only if not complete) */}\n        {showOnboarding && !onboardingComplete && (\n          <section className="rk-onboard">\n            <button className="rk-onboard-close" onClick={() => { hideOnboarding(); showToast(\'Skrito na tej napravi\') }} title="Skrij">\n              <Icon name="close" size={14} />\n            </button>\n            <div className="rk-onboard-head">'),
    ('apps/web/app/pos/page.tsx',
     'apps/web/app/pos/page.tsx: sprememba #1',
     '${cartDiscount > 0 ? `<div style="text-align:right;color:#666">Popust ${fmtPct(cartDiscount)}%: -${eur2(totals.total-total)}</div>` : \'\'}\n<div class="total-row" style="text-align:right;font-size:18px;margin:12px 0">SKUPAJ: ${eur2(total)}</div>\n<div class="stamp">Predracun ni davčno potrjen. Velja do: ${new Date(Date.now()+7*86400000).toLocaleDateString(\'sl-SI\')}</div>\n<div class="footer">${escapeHtml(pp.ime)} · www.računko.si<br>Predracun izdan s sistemom RACUNKO</div>\n<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno\n     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne\n     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez',
     '${cartDiscount > 0 ? `<div style="text-align:right;color:#666">Popust ${fmtPct(cartDiscount)}%: -${eur2(totals.total-total)}</div>` : \'\'}\n<div class="total-row" style="text-align:right;font-size:18px;margin:12px 0">SKUPAJ: ${eur2(total)}</div>\n<div class="stamp">Predracun ni davčno potrjen. Velja do: ${new Date(Date.now()+7*86400000).toLocaleDateString(\'sl-SI\')}</div>\n<div class="footer">${escapeHtml(pp.ime)} · www.računko.si<br>Predracun izdan s sistemom Računko</div>\n<!-- SPREMENJENO (21.8.2026): samodejni window.print() je odprl MODALNO okno\n     operacijskega sistema, ki blokira cel brskalnik, dokler ga uporabnik ne\n     zapre. Pri vsakem racunu je bil to odvecen klik, pri strankah brez'),
    ('apps/web/components/PageHelp.tsx',
     'apps/web/components/PageHelp.tsx: sprememba #1',
     "    { icon: '💸', title: 'Stroški', desc: 'Evidentirajte prejete račune in stroške.' },\n    { icon: '📅', title: 'Davki', desc: 'DDV, prispevki, dohodnina — vse na enem mestu.' },\n  ],\n  tip: 'Za pomoč pišite na support@racunko.si',\n}\n\nexport default function PageHelp() {",
     "    { icon: '💸', title: 'Stroški', desc: 'Evidentirajte prejete račune in stroške.' },\n    { icon: '📅', title: 'Davki', desc: 'DDV, prispevki, dohodnina — vse na enem mestu.' },\n  ],\n  tip: 'Za pomoč pišite na support@računko.si',\n}\n\nexport default function PageHelp() {"),
    ('apps/web/components/PageHelp.tsx',
     'apps/web/components/PageHelp.tsx: sprememba #2',
     '\n            {/* Footer */}\n            <div style={{ marginTop: 16, paddingTop: 12, borderTop: \'0.5px solid #f0f0f0\', fontSize: 11, color: \'#bbb\', textAlign: \'center\' }}>\n              Potrebujete dodatno pomoč? <a href="mailto:support@racunko.si" style={{ color: \'#1D9E75\' }}>support@racunko.si</a>\n            </div>\n          </div>\n        </div>',
     '\n            {/* Footer */}\n            <div style={{ marginTop: 16, paddingTop: 12, borderTop: \'0.5px solid #f0f0f0\', fontSize: 11, color: \'#bbb\', textAlign: \'center\' }}>\n              Potrebujete dodatno pomoč? <a href="mailto:support@xn--raunko-j2a.si" style={{ color: \'#1D9E75\' }}>support@računko.si</a>\n            </div>\n          </div>\n        </div>'),
    ('apps/web/components/nastavitve/ApiKljuci.tsx',
     'apps/web/components/nastavitve/ApiKljuci.tsx: sprememba #1',
     "\n          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Base URL</div>\n          <code style={{ display: 'block', fontSize: 12, background: '#F7F6F2', padding: '8px 12px', borderRadius: 8, marginBottom: 20, fontFamily: 'monospace' }}>\n            https://racunko.si/api/v1\n          </code>\n\n          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avtentikacija</div>",
     "\n          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Base URL</div>\n          <code style={{ display: 'block', fontSize: 12, background: '#F7F6F2', padding: '8px 12px', borderRadius: 8, marginBottom: 20, fontFamily: 'monospace' }}>\n            https://xn--raunko-j2a.si/api/v1\n          </code>\n\n          <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avtentikacija</div>"),
    ('apps/web/components/nastavitve/ApiKljuci.tsx',
     'apps/web/components/nastavitve/ApiKljuci.tsx: sprememba #2',
     '          title="Kako uporabim API?"\n          steps={[\n            { icon: \'🔑\', title: \'Generirajte API ključ\', desc: \'Kliknite "+ Generiraj" zgoraj, vnesite ime in shranite ključ — prikaže se samo enkrat.\' },\n            { icon: \'📡\', title: \'Pošljite HTTP request\', desc: \'Dodajte ključ v Authorization header vsakega klica.\', code: \'curl https://racunko.si/api/v1/stats -H "Authorization: Bearer rk_live_..."\', copyable: true },\n            { icon: \'📄\', title: \'Prejmete JSON odgovor\', desc: \'Vsak odgovor ima format: { success: true, data: [...], meta: { page, total } }\' },\n            { icon: \'🔒\', title: \'Varnost\', desc: \'Ključa nikoli ne delite javno. Če je kompromitiran, ga takoj deaktivirajte in generirajte novega.\' },\n          ]}',
     '          title="Kako uporabim API?"\n          steps={[\n            { icon: \'🔑\', title: \'Generirajte API ključ\', desc: \'Kliknite "+ Generiraj" zgoraj, vnesite ime in shranite ključ — prikaže se samo enkrat.\' },\n            { icon: \'📡\', title: \'Pošljite HTTP request\', desc: \'Dodajte ključ v Authorization header vsakega klica.\', code: \'curl https://xn--raunko-j2a.si/api/v1/stats -H "Authorization: Bearer rk_live_..."\', copyable: true },\n            { icon: \'📄\', title: \'Prejmete JSON odgovor\', desc: \'Vsak odgovor ima format: { success: true, data: [...], meta: { page, total } }\' },\n            { icon: \'🔒\', title: \'Varnost\', desc: \'Ključa nikoli ne delite javno. Če je kompromitiran, ga takoj deaktivirajte in generirajte novega.\' },\n          ]}'),
    ('apps/web/components/nastavitve/Integracije.tsx',
     'apps/web/components/nastavitve/Integracije.tsx: sprememba #1',
     "\n  const webhookBaseUrl = typeof window !== 'undefined'\n    ? `${window.location.origin}/api/webhooks`\n    : 'https://racunko.si/api/webhooks'\n\n  const wcIntegration = integrations.find(i => i.type === 'woocommerce')\n  const shIntegration = integrations.find(i => i.type === 'shopify')",
     "\n  const webhookBaseUrl = typeof window !== 'undefined'\n    ? `${window.location.origin}/api/webhooks`\n    : 'https://xn--raunko-j2a.si/api/webhooks'\n\n  const wcIntegration = integrations.find(i => i.type === 'woocommerce')\n  const shIntegration = integrations.find(i => i.type === 'shopify')"),

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
        print(f"PRELET 304 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet304.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
