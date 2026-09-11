'use client'

// PRELET 260: preklikljivo okno namesto negibne slike.
import DemoOkno from '@/components/DemoOkno';

import { useState } from 'react';

// ─── CSS ────────────────────────────────────────────────────────────────────

const css = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
html,body{margin:0;padding:0;overflow-x:hidden;background:#F4EFE6;color:#0C2A1E;font-family:'Geist',system-ui,sans-serif;font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;letter-spacing:-0.005em}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}
em{font-style:italic}
.nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(14px);background:color-mix(in oklab,#F4EFE6 80%,transparent);border-bottom:1px solid color-mix(in oklab,#D9D2C2 60%,transparent)}
.nav-inner{max-width:1240px;margin:0 auto;padding:14px clamp(24px,6vw,88px);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:32px}
.brand{display:inline-flex;align-items:center;gap:10px;font-family:'Instrument Serif',serif;font-style:italic;font-size:1.45rem;letter-spacing:-0.02em;color:#0E3D2A}
.nav-links{display:flex;gap:28px;justify-content:center;font-size:0.94rem;color:#3A4A40}
.nav-links a:hover{color:#0C2A1E}
.nav-cta{display:flex;gap:8px;justify-self:end}
.btn{display:inline-flex;align-items:center;gap:0.5em;padding:0.7em 1.15em;border-radius:999px;font-weight:500;font-size:0.95rem;letter-spacing:-0.01em;transition:transform 0.12s ease,background 0.18s ease,box-shadow 0.18s ease;white-space:nowrap;text-decoration:none}
.btn-lg{padding:0.95em 1.6em;font-size:1.02rem}
.btn-block{width:100%;justify-content:center}
.btn-primary{background:#0E3D2A;color:#F4EFE6}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 24px -8px rgba(14,61,42,0.4)}
.btn-ghost{background:transparent;color:#0C2A1E;border:1px solid #D9D2C2}
.btn-quiet{background:transparent;color:#0C2A1E}
.btn-quiet:hover{background:rgba(0,0,0,0.04)}
.btn-on-dark{background:#F4EFE6;color:#0E3D2A}
.btn-on-dark:hover{transform:translateY(-1px)}
.section{max-width:1240px;margin:0 auto;padding:clamp(64px,10vw,120px) clamp(24px,6vw,88px);position:relative}
.section-head{max-width:760px;margin:0 auto 64px;text-align:center}
.kicker{display:inline-flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;padding:6px 12px;border-radius:999px;background:#D7E4D4;color:#1F4732;margin-bottom:28px}
.kicker-warn{background:#F4D9CE;color:#C9442B}
.kicker-on-dark{background:rgba(255,255,255,0.08);color:#F4EFE6;border:1px solid rgba(255,255,255,0.15)}
.h2{font-family:'Instrument Serif',serif;font-size:clamp(2.4rem,5vw,3.6rem);line-height:1.05;font-weight:400;margin:0 0 18px;letter-spacing:-0.02em;color:#0C2A1E}
.h2 em{color:#C9442B}
.lede{font-size:1.12rem;color:#3A4A40;margin:0;line-height:1.5}
.hero{max-width:1240px;margin:0 auto;padding:80px clamp(24px,6vw,88px) 60px;position:relative}
.hero-grid{text-align:center;max-width:1080px;margin:0 auto}
.eyebrow{display:inline-flex;align-items:center;gap:8px;background:#D7E4D4;color:#1F4732;padding:7px 14px;border-radius:999px;font-size:0.85rem;font-weight:500;margin-bottom:36px}
.display{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(2.8rem,7.5vw,6.4rem);line-height:0.97;letter-spacing:-0.03em;margin:0 0 36px;color:#0C2A1E}
.display-accent{color:#C9442B;font-style:italic;white-space:nowrap}
.hero-sub{font-size:clamp(1.05rem,1.4vw,1.22rem);color:#3A4A40;max-width:600px;margin:0 auto 40px;line-height:1.55}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:16px}
.hero-proof{text-align:center;font-size:13px;color:#3A4A40;margin:0 auto 28px;max-width:540px}
.trust{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:28px;justify-content:center;color:#3A4A40;font-size:0.9rem}
.trust li{display:inline-flex;gap:7px;align-items:center}
.trust svg{color:#0E3D2A}
.pull-quote{max-width:720px;margin:56px auto 0;text-align:center}
.pull-quote blockquote{margin:0;font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(1.4rem,2.6vw,1.85rem);line-height:1.35;color:#0C2A1E;letter-spacing:-0.015em}
.pull-quote mark{background:transparent;color:#C9442B}
.pull-quote .qmark{font-size:3rem;color:#C9442B;line-height:0;margin-right:6px}
.pull-quote figcaption{margin-top:22px;font-family:'Geist',system-ui,sans-serif;font-style:normal;font-size:0.88rem;color:#3A4A40}
.math{background:#FBF7EE;border-top:1px solid #D9D2C2;border-bottom:1px solid #D9D2C2}
.math-inner{max-width:1240px;margin:0 auto;padding:clamp(64px,10vw,120px) clamp(24px,6vw,88px)}
.calc{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:20px;align-items:stretch}
.calc-card{background:#F4EFE6;border:1px solid #D9D2C2;border-radius:18px;padding:32px 28px;min-height:220px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.calc-input{background:#F4D9CE;border-color:rgba(201,68,43,0.25)}
.calc-result{background:#0E3D2A;color:#F4EFE6;border:1px solid #0E3D2A}
.calc-mid{background:#FBF7EE}
.calc-label{font-size:0.85rem;color:#3A4A40;margin-bottom:14px}
.calc-result .calc-label{color:rgba(244,239,230,0.7)}
.calc-input .calc-label{color:#C9442B}
.calc-value{font-family:'Instrument Serif',serif;font-size:clamp(2.6rem,4.5vw,3.6rem);line-height:1;letter-spacing:-0.03em;display:inline-flex;align-items:baseline;justify-content:center;gap:4px;color:#C9442B}
.calc-value .cur{font-size:0.65em}
.calc-value .unit{font-size:0.32em;opacity:0.6;margin-left:6px;font-family:'Geist',sans-serif;font-weight:500}
.calc-slider{margin:22px auto 10px;width:100%;-webkit-appearance:none;appearance:none;height:4px;background:rgba(201,68,43,0.2);border-radius:999px;outline:none;cursor:grab}
.calc-slider::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#C9442B;border:4px solid #F4EFE6;box-shadow:0 2px 8px rgba(201,68,43,0.4);cursor:grab}
.calc-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#C9442B;border:4px solid #F4EFE6;cursor:grab}
.calc-scale{display:flex;justify-content:space-between;font-size:0.75rem;color:#3A4A40;margin-top:6px;font-family:'JetBrains Mono',monospace}
.calc-foot{font-size:0.85rem;margin-top:14px;color:#3A4A40}
.calc-result .calc-foot{color:rgba(244,239,230,0.75)}
.calc-result .calc-foot strong{color:#F4EFE6}
.calc-times,.calc-eq{font-family:'Instrument Serif',serif;font-style:italic;font-size:2rem;color:#3A4A40;align-self:center;padding:0 4px}
.savings{margin-top:36px;text-align:center;display:flex;flex-direction:column;align-items:center;width:100%}
.savings-label{font-size:0.82rem;letter-spacing:0.06em;text-transform:uppercase;color:#3A4A40}
.savings-amt{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(3rem,6vw,5rem);line-height:1;color:#0E3D2A;letter-spacing:-0.03em;margin:8px 0 6px}
.savings-foot{font-size:0.92rem;color:#3A4A40}
.quote-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.quote{background:#FBF7EE;border:1px solid #D9D2C2;border-radius:18px;padding:28px;margin:0;display:flex;flex-direction:column;gap:18px}
.quote-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.stars{color:#D89328;font-size:0.88rem;letter-spacing:0.05em}
.save-tag{font-size:0.74rem;padding:4px 10px;border-radius:999px;background:#D7E4D4;color:#1F4732;font-weight:500}
.quote blockquote{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.18rem;line-height:1.4;margin:0;flex:1;letter-spacing:-0.01em;color:#0C2A1E}
.quote figcaption{display:flex;align-items:center;gap:12px;border-top:1px solid #D9D2C2;padding-top:18px}
.quote .avatar{width:36px;height:36px;border-radius:50%;background:#D7E4D4;color:#1F4732;display:inline-flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:600}
.quote figcaption strong{display:block;font-size:0.94rem;font-weight:600}
.quote figcaption small{color:#3A4A40;font-size:0.8rem}
.plans-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:980px;margin:0 auto}
.plan{background:#FBF7EE;border:1px solid #D9D2C2;border-radius:28px;padding:36px 32px;display:flex;flex-direction:column;gap:16px;position:relative}
.plan-hero{background:#0E3D2A;color:#F4EFE6;border-color:#0E3D2A}
.plan-flag{position:absolute;top:-12px;left:24px;background:#C9442B;color:white;font-size:0.74rem;padding:5px 12px;border-radius:999px;font-weight:500}
.plan-name{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.6rem;letter-spacing:-0.01em}
.plan-price{font-family:'Instrument Serif',serif;font-size:4rem;line-height:1;letter-spacing:-0.04em;display:inline-flex;align-items:baseline;gap:4px}
.plan-price .cur{font-size:0.45em;opacity:0.7}
.plan-price .per{font-size:0.25em;color:#3A4A40;font-family:'Geist',sans-serif;margin-left:6px}
.plan-hero .plan-price .per{color:rgba(244,239,230,0.6)}
.plan-tag{align-self:flex-start;font-size:0.78rem;padding:5px 12px;border-radius:999px;font-weight:500}
.plan-tag-soft{background:#D7E4D4;color:#1F4732}
.plan-tag-amber{background:#FBE9CC;color:#8A5800}
.plan-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:12px;flex:1}
.plan-list li{display:flex;align-items:flex-start;gap:12px;font-size:0.96rem}
.plan-list svg{color:#0E3D2A;flex-shrink:0;margin-top:3px}
.plan-hero .plan-list svg{color:#F4EFE6}
.faq-list{max-width:820px;margin:0 auto;border-top:1px solid #D9D2C2}
.faq-item{border-bottom:1px solid #D9D2C2}
.faq-q{width:100%;display:flex;justify-content:space-between;align-items:center;padding:24px 4px;text-align:left;font-size:1.05rem;font-weight:500;letter-spacing:-0.01em}
.faq-q:hover{color:#0E3D2A}
.persona-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.tab-feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.final{background:#0E3D2A;color:#F4EFE6;padding:clamp(64px,10vw,120px) clamp(24px,6vw,88px);text-align:center}
.final-inner{max-width:780px;margin:0 auto}
.final-h{font-family:'Instrument Serif',serif;font-size:clamp(2.6rem,6vw,4.4rem);line-height:1.05;font-weight:400;letter-spacing:-0.025em;margin:22px 0 24px}
.final-h em{color:rgba(244,239,230,0.7);font-style:italic}
.final-sub{color:rgba(244,239,230,0.8);font-size:1.15rem;margin:0 0 36px;line-height:1.55}
.final-sub strong{color:#F4EFE6}
.final-trust{margin-top:24px;font-size:0.86rem;color:rgba(244,239,230,0.6)}
.foot{background:#F4EFE6;border-top:1px solid #D9D2C2;padding:36px clamp(24px,6vw,88px)}
.foot-inner{max-width:1240px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap;font-size:0.88rem;color:#3A4A40}
.foot-brand{display:inline-flex;gap:10px;align-items:center;font-family:'Instrument Serif',serif;font-style:italic;color:#0C2A1E;font-size:1.05rem}
.foot-nav{display:flex;gap:24px}
.foot-nav a:hover{color:#0C2A1E}
.wave{display:inline-block;transform-origin:70% 70%;animation:wave 2.6s ease-in-out infinite}
@keyframes wave{0%,60%,100%{transform:rotate(0deg)}10%{transform:rotate(14deg)}20%{transform:rotate(-8deg)}30%{transform:rotate(14deg)}40%{transform:rotate(-4deg)}50%{transform:rotate(10deg)}}
.tag-ok{background:#DDF1E6;color:#1F6B49}
.tag-warn{background:#FBE9CC;color:#8A5800}
.tag-bad{background:#F4D9CE;color:#C9442B}
.tag-soft{background:#D7E4D4;color:#1F4732}
.tag{font-size:0.7rem;padding:3px 8px;border-radius:999px;font-weight:500}
@media(max-width:760px){.nav-inner{grid-template-columns:auto auto;gap:12px}.nav-links{display:none}.nav-cta .btn{padding:0.55em 0.95em;font-size:0.85rem}}
@media(max-width:640px){.display{font-size:clamp(2.2rem,10vw,3.2rem)}.hero-cta{flex-direction:column;width:100%;max-width:320px;margin:0 auto 16px}.hero-cta .btn{width:100%;justify-content:center}.calc{grid-template-columns:1fr}.calc-times,.calc-eq{display:none}.calc-card{min-height:auto;padding:22px 18px}.quote-grid{grid-template-columns:1fr;max-width:520px;margin:0 auto}.persona-grid{grid-template-columns:1fr;max-width:520px;margin:0 auto}.plans-3{grid-template-columns:1fr;max-width:480px}.tab-feat-grid{grid-template-columns:1fr}.foot-inner{flex-direction:column;gap:16px;text-align:center}.foot-nav{flex-wrap:wrap;justify-content:center;gap:14px 22px}.btn{min-height:44px}.section-head{margin-bottom:40px}.h2{font-size:clamp(1.85rem,7vw,2.4rem)}}
@media(max-width:900px){.persona-grid{grid-template-columns:1fr 1fr}}
@media(max-width:800px){.plans-3{grid-template-columns:1fr 1fr}}
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d="M82 50 C 82 28, 66 14, 46 14 C 26 14, 14 30, 14 50 C 14 70, 28 84, 46 84 C 50 84, 54 83, 58 82 L 64 92 L 64 78 C 76 72, 82 62, 82 50 Z" fill="#0E5E3B"/>
      <circle cx="36" cy="46" r="5" fill="#FFFFFF"/>
      <circle cx="56" cy="46" r="5" fill="#E8B547"/>
      <path d="M30 60 Q 46 72, 62 60" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function Check({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{ color, flexShrink: 0, marginTop: 3 }}>
      <path d="M13 4L6.5 11.5L3 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  { initials:'AK', name:'Ana K.', role:'IT freelancer · Ljubljana', stars:5, tag:'Prihranek €3.120/leto', quote:'Plačevala sem €280/mes. Vsak mesec ista predloga, isti email. Zdaj to naredi Računko. €260 več v žepu — vsak mesec.' },
  { initials:'MT', name:'Miha T.', role:'Grafični oblikovalec · Maribor', stars:5, tag:'0 zamujenih rokov', quote:'Bala sem se, da bom brez računovodje naredila napako. Po 8 mesecih — nobene napake. Vsi roki spoštovani. FURS molči.' },
  { initials:'SP', name:'Sara P.', role:'Fizioterapevtka · Kranj', stars:5, tag:'Prihranek €4.572/leto', quote:'AI mi je odgovoril v 10 sekundah na vprašanje, ki ga je računovodja pustil ob torku. Odgovor je prišel v petek. Za €380/mes.' },
];

const PLANS = [
  {
    name:'Brezplačno', price:'0', priceDec:'', per:'/ vedno', tag:'Začni danes', tagClass:'plan-tag-soft',
    // POPRAVLJENO (prelet 251): pet racunov na mesec je bila najvecja
    // slabost cenika. Konkurent daje NEOMEJENO izdajanje s FURS potrjevanjem
    // zastonj - kdor primerja, nas zavrne, preden pogleda karkoli drugega.
    // Omejitev je odslej drugje, ne pri stevilu racunov.
    features:['Neomejeni računi','FURS davčno potrjevanje','PDF prenos','Prispevki in UPN QR','🤖 AI pomočnik za vprašanja'],
    cta:'Začni brezplačno', ctaClass:'btn btn-ghost btn-block', highlighted: false,
  },
  {
    // PRELET 251: 12,99 mesecno, 129,90 letno - dva meseca brezplacno.
    // Prej je letna cena znasala natanko dvanajstkratnik mesecne, torej
    // popusta ni bilo; nihce ne placa leta vnaprej brez razloga.
    name:'Pro', price:'12', priceDec:'.99', per:'/mes', tag:'129,90 €/leto — 2 meseca gratis', tagClass:'plan-tag-amber',
    // POPRAVLJENO (prelet 253): cenik je nastel pet splosnih postavk, med
    // njimi pa NI bilo tistega, kar uporabnika dejansko prihrani cas -
    // skeniranja racunov, glasovnega vnosa, uvoza placil iz banke. Kdor
    // primerja cenike, vidi samo to, kar tam pise.
    features:['Neomejeni računi in predračuni','📷 Skeniraj račun — AI ga prebere sam','🎙️ Glasovni vnos računa','🤖 AI računovodja odgovarja na vprašanja','🏦 Uvoz plačil iz bančnega izpiska','e-račun (e-SLOG) za B2B','DDV evidenca in KPO knjiga','Izvoz za Vasco in Pantheon'],
    cta:'Začni brezplačno →', ctaClass:'btn btn-on-dark btn-block', highlighted: true, flag:'Najbolj priljubljen',
  },
  {
    name:'Pro + POS', price:'29', priceDec:'.99', per:'/mes', tag:'299,90 €/leto — 2 meseca gratis', tagClass:'plan-tag-soft',
    features:['Vse iz Pro +','Blagajna z mizami in tlorisom','Delitev računa in popusti','⚡ Delo brez povezave do 2 dni','Kuhinjski zaslon in odrezki','📷 Skeniraj dobavnico — zaloga se posodobi','Zaloge z normativi in inventuro','Člani, paketi in terminski koledar','Ekipa s PIN prijavo','Namizna in mobilna aplikacija'],
    cta:'Začni brezplačno →', ctaClass:'btn btn-primary btn-block', highlighted: false,
  },
];

const FAQS = [
  { q:'Ali Računko res nadomesti računovodja?', a:'Za 90% samostojnih podjetnikov — da. Normiranec, DDV zavezanec, par zaposlenih — Računko pokrije vse. Za d.o.o. z revizijo priporočamo Računko + računovodja za letni zaključek.' },
  { q:'Kateri paket je za mene pravi?', a:'Free je za tiste, ki začenjajo — do 5 računov brez kreditne kartice. Pro je za aktivnega podjetnika z neomejenimi računi, email pošiljanjem in FURS. Pro + POS je za gostince, obrtnike in studie, ki potrebujejo blagajno, člane in ekipo.' },
  { q:'Ali moram prekiniti pogodbo z računovodjem?', a:'Ni potrebno. Prenesite svoje podatke in preidite postopoma. Računko ima 14-dnevni brezplačni preizkus — brez vezave in brez kreditne kartice.' },
  { q:'Deluje za DDV zavezance?', a:'Da, v celoti. Vključujemo DDV-O obračun in evidenco DDV — vse kar DDV zavezanec potrebuje za tekoče poslovanje.' },
  { q:'Kako varni so moji finančni podatki?', a:'Vsi podatki so shranjeni na EU strežnikih v skladu z GDPR. Varnostne kopije se naredijo vsake 24 ur. Vaši podatki nikoli niso deljeni s tretjimi stranmi brez vaše privolitve.' },
  { q:'Kdaj je smiselno ostati pri računovodji?', a:'Za revizije, d.o.o. z večjim prometom (nad €100k) ali kadrovske zadeve s kolektivno pogodbo. Za te primere priporočamo kombinacijo Računka in specializiranega računovodje — Računko pokrije 95% vsakdanjega dela.' },
];

type TabId = 'racuni'|'finance'|'blagajna'|'kadri'|'integracije';

const TABS: { id: TabId; label: string; emoji: string; title: string; sub: string; tip: string;
  features: { name: string; desc: string; tag?: string }[] }[] = [
  { id:'racuni', label:'Računi', emoji:'📄', title:'Računi & fakturiranje', sub:'Od predračuna do plačila — brez papirja', tip:'UPN QR koda na vsakem PDF-u — stranka skenira z mobilno banko in plača takoj.',
    features:[
      { name:'Izdani računi', desc:'PDF z UPN QR kodo, pošiljanje po emailu v sekundi' },
      { name:'Predračuni', desc:'Pošlji ponudbo → en klik → pretvori v račun' },
      { name:'Avansni računi', desc:'Predplačilo + finalni račun z odbitkom avtomatsko' },
      { name:'Ponavljajoči računi', desc:'Mesečne naročnine se izdajo same — brez roke' },
      { name:'Opomniki za zamudnike', desc:'Avtomatski email stranki po X dneh zamude' },
    ]},
  { id:'finance', label:'Finance', emoji:'📊', title:'Finance & davki', sub:'Pregled, obračuni in obveznosti — vedno na tekočem', tip:'7 dni vnaprej vas opomni na vsak davčni rok — prispevki, DDV, akontacija.',
    features:[
      { name:'DDV obračun', desc:'Avtomatski DDV-O in arhiv za FURS — brez ročnega vnosa' },
      { name:'Normirani odhodki', desc:'Izračun za s.p. normirance — avtomatski %' },
      { name:'Prispevki QR', desc:'Izračun in QR za plačilo prispevkov vsak mesec' },
      { name:'Cash flow', desc:'Pregled prihodkov in odhodkov v realnem času' },
      { name:'Akontacija dohodnine', desc:'Izračun in opomnik — nikoli prepozno' },
      { name:'Stroški & OCR', desc:'Fotografirajte račun — AI ga vnese samodejno' },
    ]},
  { id:'blagajna', label:'Blagajna & POS', emoji:'🖥️', title:'Blagajna & prodajno mesto', sub:'Gotovinska prodaja, fiskalizacija in zaključki — vse v enem', tip:'FURS ZDavPR 2026 — fiskalizacija je vključena brez doplačila.',
    features:[
      { name:'POS blagajna', desc:'Touchscreen vmesnik za hitro gotovinsko prodajo' },
      { name:'FURS ZDavPR 2026', desc:'Fiskalizacija vseh računov — polna zakonska skladnost' },
      { name:'Dnevni zaključki PDF', desc:'Avtomatski dnevni zaključki v PDF obliki' },
      { name:'Artikli & ceniki', desc:'Katalog artiklov z DDV stopnjami in popusti' },
      { name:'QR plačila', desc:'UPN QR za gotovino ali kartico — brez POS terminala' },
      { name:'Mobilna blagajna', desc:'Prodajajte na terenu z mobilno aplikacijo' },
    ]},
  { id:'kadri', label:'Kadri & Plače', emoji:'👥', title:'Ekipa & plače', sub:'Zaposleni, dopusti, plačilne liste — brez tabel v Excelu', tip:'REK-1 XML datoteka je pripravljena za uvoz v eDavki — en klik oddaje.',
    features:[
      { name:'Ekipa & dostopi', desc:'Dodajte zaposlene z različnimi ravnmi dostopa' },
      { name:'REK-1 obračun plač', desc:'Avtomatski izračun plač in REK-1 XML za eDavki' },
      { name:'Člani & naročnine', desc:'Mesečne naročnine za člane — fitnes, studio, šola' },
      { name:'Terminski koledar', desc:'Rezervacije in termini za storitve ali ekipo' },
      { name:'Evidenca dopustov', desc:'Pregled in odobritev dopustov za celotno ekipo' },
      { name:'Kadrovska evidenca', desc:'Pogodbe, dokumenti in podatki o zaposlenih' },
    ]},
  { id:'integracije', label:'Integracije', emoji:'🔗', title:'Poveži z orodji, ki jih že imaš', sub:'WooCommerce, Shopify, API — brez programiranja', tip:'API ključ dobite v nastavitvah — integracija v manj kot 10 minutah.',
    features:[
      { name:'WooCommerce', desc:'Samodejni računi za vsako spletno naročilo' },
      { name:'Shopify webhook', desc:'Sinhronizacija naročil in samodejno fakturiranje' },
      { name:'REST API', desc:'Polni dostop za razvijalce — dokumentiran Swagger API' },
      { name:'Email integracija', desc:'Pošiljanje računov z vašega domenskega emaila' },
      { name:'eDavki XML', desc:'Izvoz XML datotek za direktni uvoz v eDavki' },
      { name:'Zapier / Make', desc:'Povežite z 1000+ aplikacijami brez kode' },
    ]},
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LandingPage() {
  const [accountantCost, setAccountantCost] = useState(280);
  const [activeTab, setActiveTab] = useState<TabId>('racuni');
  const [openFaq, setOpenFaq] = useState<number>(0);

  const annual = accountantCost * 12;
  // PRELET 251: primerjamo z letnim paketom Pro (129,90 EUR).
  const savings = Math.round(annual - 129.90);
  const fmt = (n: number) => Math.round(n).toLocaleString('sl-SI');

  const tabBtnStyle = (tab: TabId): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.6em 1.2em', borderRadius: 999, fontSize: '0.9rem',
    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.01em', transition: 'all 0.15s ease',
    background: activeTab === tab ? '#0E3D2A' : 'transparent',
    color: activeTab === tab ? '#F4EFE6' : '#3A4A40',
    border: activeTab === tab ? '1px solid #0E3D2A' : '1px solid #D9D2C2',
    outline: 'none',
  });

  const faqAnswerStyle = (i: number): React.CSSProperties => ({
    padding: '0 4px 24px', color: '#3A4A40', fontSize: '1rem',
    lineHeight: 1.65, maxWidth: 700, display: openFaq === i ? 'block' : 'none',
  });

  const faqIconStyle = (i: number): React.CSSProperties => ({
    fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
    fontSize: '1.5rem', lineHeight: 1, width: 28, textAlign: 'center',
    flexShrink: 0, color: openFaq === i ? '#C9442B' : '#3A4A40',
  });

  const currentTab = TABS.find(t => t.id === activeTab)!;

  return (
    <>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className="nav" id="top">
        <div className="nav-inner">
          <a href="#top" className="brand"><BrandMark /><span>Računko</span></a>
          {/* PRELET 257: povezave do podstrani.
              Podstrani so obstajale, a nanje ni vodil noben clen iz menija -
              do njih je prisel samo tisti, ki je prebral do dna. Iskalnik jih
              prav tako najde tezje, ce nanje ne kaze nic z zacetne strani. */}
          <nav className="nav-links">
            <a href="/funkcije">Funkcije</a>
            <a href="/davcna-blagajna">Blagajna</a>
            <a href="/e-racun">E-računi 2028</a>
            <a href="#cene">Cene</a>
            <a href="/za-racunovodje">Za računovodje</a>
          </nav>
          <div className="nav-cta">
            <a href="/login" className="btn btn-ghost">Prijava</a>
            <a href="/register" className="btn btn-primary">Začni brezplačno →</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-grid">
          <div className="eyebrow">
            <span style={{width:6,height:6,background:'#1F4732',borderRadius:'50%',display:'inline-block'}} />
            Narejeno za slovenskega s.p. in d.o.o.
          </div>
          <h1 className="display">
            Od računa do <span className="display-accent">blagajne.</span><br />
            Od prispevkov do <span className="display-accent">ekipe.</span><br />
            Vse za vaše podjetje —<br />na enem mestu.
          </h1>
          <p className="hero-sub">Računko je poslovni portal za slovenskega podjetnika. Fakturiranje, blagajna, davki, člani, ekipa — brez papirjev.</p>
          <div className="hero-cta">
            <a href="/register" className="btn btn-primary btn-lg">Začni brezplačno →</a>
            <a href="#funkcije" className="btn btn-quiet btn-lg">Oglej si funkcije</a>
          </div>
          <p className="hero-proof">Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
          <ul className="trust">
            <li><svg width="15" height="15" fill="none" viewBox="0 0 15 15" style={{color:'#0E3D2A'}}><path d="M12.5 3.5L6 11L2.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Brez vezave</li>
            <li><svg width="15" height="15" fill="none" viewBox="0 0 15 15" style={{color:'#0E3D2A'}}><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 4.5V8L9.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>Nastavitev v 5 minutah</li>
            <li><svg width="15" height="15" fill="none" viewBox="0 0 15 15" style={{color:'#0E3D2A'}}><rect x="2" y="4" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4V3C5 2.45 5.45 2 6 2H9C9.55 2 10 2.45 10 3V4" stroke="currentColor" strokeWidth="1.4"/></svg>Podatki v EU</li>
            <li><svg width="15" height="15" fill="none" viewBox="0 0 15 15" style={{color:'#0E3D2A'}}><path d="M7.5 1L9.18 5.27L13.5 5.63L10.25 8.43L11.27 12.75L7.5 10.42L3.73 12.75L4.75 8.43L1.5 5.63L5.82 5.27L7.5 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>FURS certificiran</li>
          </ul>
          <div style={{maxWidth:920,margin:'96px auto 0',height:1,background:'linear-gradient(90deg,transparent,#D9D2C2 20%,#D9D2C2 80%,transparent)'}} />
          <div className="pull-quote">
            <figure>
              <blockquote><span className="qmark">&ldquo;</span>Vsak mesec pošljem računovodji iste dokumente. On mi pošlje isti email z zneski prispevkov. <mark>Račun: €320.</mark></blockquote>
              <figcaption>— resnična izkušnja slovenskega s.p. freelancerja</figcaption>
            </figure>
          </div>
        </div>
      </div>

      {/* ── CALCULATOR ── */}
      <div className="math">
        <div className="math-inner">
          <div className="section-head">
            <span className="kicker kicker-warn">Preprosta matematika</span>
            <h2 className="h2">Koliko vas <em>dejansko</em> stane računovodja?</h2>
            <p className="lede">Premaknite drsnik na svoj mesečni račun. Računko Pro stane 12,99 € mesečno.</p>
          </div>
          <div className="calc">
            <div className="calc-card calc-input">
              <div className="calc-label">Vaš mesečni račun</div>
              <div className="calc-value"><span className="cur">€</span><span>{fmt(accountantCost)}</span><span className="unit">/mes</span></div>
              <input type="range" className="calc-slider" min={80} max={600} step={10} value={accountantCost} onChange={e => setAccountantCost(parseInt(e.target.value))} />
              <div className="calc-scale"><span>€80</span><span>€280 (povp. SLO)</span><span>€600</span></div>
            </div>
            <div className="calc-times">×</div>
            <div className="calc-card calc-mid">
              <div className="calc-label">Mesecev</div>
              <div className="calc-value" style={{color:'#0C2A1E'}}><span>12</span></div>
              <div className="calc-foot">Vsak mesec. Brez izjeme.</div>
            </div>
            <div className="calc-eq">=</div>
            <div className="calc-card calc-result">
              <div className="calc-label">Letno</div>
              <div className="calc-value" style={{color:'#F4EFE6'}}><span className="cur">€</span><span>{fmt(annual)}</span></div>
              <div className="calc-foot">Računko Pro: <strong>129,90 €/leto</strong></div>
            </div>
          </div>
          <div className="savings">
            <div className="savings-label">Letni prihranek z Računkom</div>
            <div className="savings-amt">€{fmt(savings)}</div>
            <div className="savings-foot">≈ {fmt(savings)} € — vaš denar, ne računovodji</div>
          </div>
        </div>
      </div>

      {/* ── DASHBOARD ── */}
      <section className="section" id="vmesnik">
        <div className="section-head">
          <h2 className="h2">Poglejte, kako <em>deluje.</em></h2>
          <p className="lede">Prihodki, roki, računi in AI računovodja. Brez iskanja po mailu, brez čakanja na odgovor.</p>
        </div>
        {/* POPRAVLJENO (prelet 260): tu je bila NEGIBNA slika nadzorne
            plosce. Slika pove, kako izgleda; ne pove, kako se uporablja.
            Kdor klikne, si zapomni bistveno vec od tistega, ki gleda.

            `DemoOkno` je posnemano, ne prava aplikacija - ta je na /demo.
            Tu gre za drugo stvar: obcutek BREZ odhoda s strani. Vsak odhod
            je mesto, kjer obiskovalca izgubimo. */}
        <DemoOkno />
      </section>

      {/* ── FEATURE TABS ── */}
      <div style={{background:'#FBF7EE',borderTop:'1px solid #D9D2C2',borderBottom:'1px solid #D9D2C2'}} id="funkcije">
        <div style={{maxWidth:1240,margin:'0 auto',padding:'clamp(64px,10vw,120px) clamp(24px,6vw,88px)'}}>
          <div className="section-head">
            <span className="kicker">Interaktivni vodnik</span>
            <h2 className="h2">Kaj vse zmore <em>Računko?</em></h2>
            <p className="lede">Prelistajte vse funkcije — kliknite na katero koli za podrobnosti.</p>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginBottom:32}}>
            {TABS.map(t => (
              <button key={t.id} style={tabBtnStyle(t.id)} onClick={() => setActiveTab(t.id)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div>
            <div style={{background:'#0E3D2A',color:'#F4EFE6',padding:'28px 32px',borderRadius:'18px 18px 0 0'}}>
              <div style={{fontSize:'0.78rem',letterSpacing:'0.07em',textTransform:'uppercase',opacity:0.6,marginBottom:8}}>{currentTab.emoji} {currentTab.label}</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.5rem',letterSpacing:'-0.01em'}}>{currentTab.title}</div>
              <div style={{opacity:0.65,fontSize:'0.92rem',marginTop:4}}>{currentTab.sub}</div>
            </div>
            <div style={{background:'#F4EFE6',border:'1px solid #D9D2C2',borderTop:'none',borderRadius:'0 0 18px 18px',padding:24}}>
              <div className="tab-feat-grid">
                {currentTab.features.map((f, i) => (
                  <div key={f.name} style={{padding:20,border: i===0 ? '2px solid #0E3D2A' : '1px solid #D9D2C2',borderRadius:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <span style={{fontWeight:600,fontSize:'0.96rem'}}>{f.name}</span>
                      {f.tag && <span className="tag tag-soft">{f.tag}</span>}
                    </div>
                    <div style={{color:'#3A4A40',fontSize:'0.9rem'}}>{f.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:16,padding:'14px 18px',background:'#D7E4D4',borderRadius:10,fontSize:'0.9rem',color:'#1F4732'}}>💡 {currentTab.tip}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOR WHOM ── */}
      {/* ZA RACUNOVODSKE SERVISE (prelet 250)
       *
       * ZAKAJ: doslej je stran obljubljala, da "zamenja racunovodja". To je
       * dvakrat slabo. Ni res - Racunko nima glavne knjige, osnovnih sredstev
       * ne obracuna plac na ravni servisa. In naredi sovraznika iz ljudi, ki
       * bi lahko bili najboljsi prodajni kanal.
       *
       * Racunovodkinja ne bo zapustila Vasca, ker v njem vodi VSE svoje
       * stranke. Zamenjala pa bo mapo papirjev za cist izvoz - in stranki
       * priporocila program, ki ji prihrani delo.
       *
       * To je edina pot, po kateri lahko majhen ponudnik doseze stranke, ki
       * jih sam ne bi nikoli nasel. */}
      {/* VSE FUNKCIJE (prelet 253)
       *
       * ZAKAJ: stran je imela stiri zavihke - racuni, finance, blagajna,
       * kadri. Pametnih funkcij ni omenjala nikjer: ne skeniranja, ne
       * glasovnega vnosa, ne dela brez povezave, ne integracij.
       *
       * Kdor primerja ponudnike, presteje, kar je nasteto. Funkcija, ki ni
       * zapisana, v primerjavi ne obstaja - tudi ce je zgrajena in dela.
       *
       * Seznam je razdeljen po opravilih, ne po zaslonih: uporabnik isce
       * "kako hitreje vnesem racun", ne "kateri modul to pokriva". */}
      <section className="section" id="funkcije-vse">
        <div className="section-head">
          <span className="kicker">Vse funkcije</span>
          <h2 className="h2">Kar vam <em>prihrani čas.</em></h2>
          <p className="lede">Ne naštevamo modulov. Naštevamo opravila, ki jih ne boste več delali ročno.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:24,maxWidth:1100,margin:'0 auto'}}>
          {[
            ['🤖', 'Umetna inteligenca', [
              'Skeniraj prejeti račun — AI prebere dobavitelja, znesek in DDV',
              'Skeniraj dobavnico — zaloga se posodobi sama',
              'Glasovni vnos: povej stranko in postavke, osnutek je pripravljen',
              'AI računovodja odgovarja na vprašanja o vaših podatkih',
              'Uvoz starih računov iz drugega programa',
            ]],
            ['🧾', 'Računi in dokumenti', [
              'Računi, predračuni, avansni računi, dobavnice',
              'Ponavljajoči računi s samodejnim pošiljanjem',
              'e-račun v obliki e-SLOG 2.0 (obvezno od 2028)',
              'UPN QR koda na vsakem računu',
              'Delna plačila in samodejni opomniki',
              'Računi na podjetje z davčno številko',
            ]],
            ['🖥️', 'Blagajna za lokale', [
              'Tloris z mizami in odprtimi naročili',
              'Delitev računa med goste',
              'Popust na postavko ali na celoten račun',
              'Delo brez povezave do dveh delovnih dni',
              'Kuhinjski zaslon in odrezek za kuharja',
              'Prijava osebja s PIN, skupna izmena',
              'Happy hour in ceniki po urah',
            ]],
            ['📦', 'Zaloge in nabava', [
              'Normativi — prodaja odpiše sestavine',
              'Inventura z razlikami',
              'Ročni ali samodejni vnos dobavnice',
              'Pavšalno nadomestilo za kmete (95. člen)',
              'Opozorila o zalogi ob uri, ki jo določite',
            ]],
            ['📊', 'Davki in evidence', [
              'KPO knjiga, ki se polni sama iz računov in blagajne',
              'Evidence DDV in obračun',
              'Prispevki OPSVZ in dohodnina',
              'Amortizacija osnovnih sredstev',
              'Normiranec: prag in izračun',
              'Opomniki na davčne roke, sedem dni vnaprej',
            ]],
            ['👥', 'Ekipa in člani', [
              'Plače, REK-1 in regres',
              'Evidenca delovnega časa in dopusti',
              'Potni nalogi in kilometrina',
              'Člani, paketi in terminski koledar',
              'Dovoljenja po posameznem zaposlenem',
            ]],
            ['🔌', 'Povezave', [
              'Stripe — plačila postanejo davčno potrjeni računi',
              'WooCommerce in Shopify — naročila iz trgovine',
              'Uvoz plačil iz bančnega izpiska (camt.053)',
              'Izvoz VOD za Vasco, Pantheon in Opal',
              'Portal za računovodjo',
            ]],
            ['🔐', 'Varnost in dostop', [
              'Dvostopenjska prijava z rezervnimi kodami',
              'Namizna aplikacija za Windows',
              'Mobilna aplikacija za Android',
              'Podatki v Evropski uniji',
            ]],
          ].map(([ikona, naslov, postavke]) => (
            <div key={naslov as string} style={{background:'#FBF7EE',border:'1px solid #D9D2C2',borderRadius:20,padding:'26px 24px'}}>
              <div style={{fontSize:26,marginBottom:10}}>{ikona as string}</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:14}}>{naslov as string}</div>
              <ul style={{listStyle:'none',padding:0,margin:0}}>
                {(postavke as string[]).map(p => (
                  <li key={p} style={{fontSize:14,lineHeight:1.6,color:'#4A4A44',marginBottom:9,paddingLeft:18,position:'relative'}}>
                    <span style={{position:'absolute',left:0,color:'#1F4732'}}>·</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="racunovodje" style={{background:'#0E3D2A',color:'#F7F6F2',padding:'72px 0'}}>
        <div style={{maxWidth:820,margin:'0 auto',padding:'0 24px'}}>
          <span className="kicker" style={{color:'#A8C9B5'}}>Za računovodske servise</span>
          <h2 className="h2" style={{color:'#F7F6F2',marginTop:8}}>
            Ne zamenjamo vas. <em style={{color:'#D89328'}}>Delamo za vas.</em>
          </h2>
          {/* POPRAVLJENO (prelet 252): prejsnje besedilo je trdilo, da Racunko
              nima osnovnih sredstev in obracuna plac. To NI res - ima
              amortizacijo, place in REK-1. Netocnost bi racunovodkinja opazila
              v prvi minuti in izgubili bi zaupanje pri vsem ostalem.
              Preverjeno v kodi: glavne knjige, kontnega nacrta, temeljnic,
              bilance stanja in izkaza poslovnega izida res ni. */}
          <p style={{fontSize:17,lineHeight:1.75,marginTop:20,color:'#DCE7E0'}}>
            Računko ni program za računovodski servis — nima glavne knjige, kontnega načrta
            ne dvostavnega knjigovodstva. Vodi eno podjetje, ne vaše pisarne.
          </p>
          <p style={{fontSize:17,lineHeight:1.75,marginTop:16,color:'#DCE7E0'}}>
            Kar naredi, je delo pred vami: stranka izda račune, poslika stroške in vodi
            blagajno, KPO in amortizacijo. Vi pa namesto mape papirjev dobite
            <strong style={{color:'#fff'}}> izvoz, ki ga vaš program prebere</strong>.
          </p>
          <p style={{fontSize:17,lineHeight:1.75,marginTop:16,color:'#DCE7E0'}}>
            Z enim uporabniškim računom preklapljate med vsemi strankami, ki so vas povabile.
            Knjigovodstvo teče <strong style={{color:'#fff'}}>sproti</strong>, ne konec kvartala —
            ko potrebujete dokumente, so že tam.
          </p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:20,marginTop:36}}>
            {[
              ['Vse stranke na enem mestu', 'Z enim računom preklapljate med podjetji, ki so vas povabila. Brez ločenih prijav.'],
              ['Dokumenti, ko jih rabite', 'Izdani računi, prejeti stroški in dnevni zaključki blagajne — pripravljeni za prenos.'],
              ['Knjižbe brez prepisovanja', 'Izvoz VOD XML za Vasco, Pantheon in Opal. Excel za vse ostalo.'],
              ['Stalen pregled', 'Vidite, kaj se dogaja med mesecem — ne šele, ko vam stranka prinese mapo.'],
              ['Evidence DDV v enem koraku', 'Za vse stranke hkrati, ne za vsako posebej.'],
              ['Manj vprašanj po telefonu', 'Stranka vidi isto kot vi. Kar manjka, vidita oba.'],
            ].map(([n, o]) => (
              <div key={n}>
                <div style={{fontWeight:700,fontSize:15,color:'#fff'}}>{n}</div>
                <div style={{fontSize:14,lineHeight:1.65,marginTop:6,color:'#B9CFC3'}}>{o}</div>
              </div>
            ))}
          </div>
          <a href="/racunovodja" style={{display:'inline-block',marginTop:36,padding:'13px 24px',borderRadius:10,background:'#D89328',color:'#1A1A16',textDecoration:'none',fontWeight:700,fontSize:15}}>
            Portal za računovodje →
          </a>
        </div>
      </section>

      {/* VPRASANJA IN ODGOVORI (prelet 250)
       *
       * ZAKAJ TA RAZDELEK: iskalniki in AI pomocniki odgovarjajo na vprasanja.
       * Kdor v Google ali pomocnika vtipka "ali potrebujem davcno blagajno za
       * lokal", dobi odgovor s strani, ki ga ima zapisanega - ne s strani, ki
       * govori o sebi.
       *
       * Odgovori so KRATKI IN DEJSTVENI, ne prodajni. Pomocnik navede vir, ki
       * mu lahko zaupa; oglasno besedilo preskoci.
       *
       * Zapis JSON-LD spodaj pove iskalniku, da gre za vprasanja in odgovore,
       * zato jih lahko prikaze neposredno v rezultatih. */}
      <section className="section" id="vprasanja">
        <div className="section-head">
          <span className="kicker">Pogosta vprašanja</span>
          <h2 className="h2">Kar vas <em>zanima.</em></h2>
        </div>
        <div style={{maxWidth:760,margin:'0 auto'}}>
          {[
            ['Ali potrebujem davčno blagajno za lokal?',
             'Da. Če za blago ali storitev prejmete gotovino, kartico ali drugo neposredno plačilo, mora biti račun davčno potrjen pri FURS. To velja za bare, kavarne, restavracije, frizerske salone in fitnes studie. Za plačila na transakcijski račun potrjevanje ni potrebno.'],
            ['Kaj potrebujem, da začnem izdajati davčno potrjene račune?',
             'Troje: digitalno potrdilo FURS, prijavljen poslovni prostor in sprejet interni akt o številčenju. Vse troje uredite v Računku; potrdilo pridobite brezplačno prek eDavkov.'],
            ['Ali blagajna deluje brez interneta?',
             'Da. Ob izpadu povezave Računko izda račun z zaščitno oznako ZOI in ga natisne, nato pa ga samodejno prijavi pri FURS, ko se povezava vrne. Zakonski rok za naknadno prijavo sta dva delovna dneva.'],
            ['Ali Računko nadomesti računovodski servis?',
             'Ne in tega ne poskuša. Računko vodi vaše račune, stroške, KPO in DDV evidenco ter jih izvozi v obliki, ki jo računovodski program prebere — Vasco, Pantheon ali Opal. Vaša računovodkinja tako dobi čiste podatke namesto mape s papirji.'],
            ['Kdaj bodo e-računi med podjetji obvezni?',
             'Od 1. januarja 2028. Zakon ZIERDED, sprejet oktobra 2025, zahteva strukturirano obliko (e-SLOG ali skladno z EN 16931) in prepoveduje izmenjavo po e-pošti. Računko že zdaj izvozi e-račun v obliki e-SLOG 2.0.'],
            ['Koliko stane?',
             'Brezplačni paket za osnovno izdajanje računov. Pro stane 12,99 € na mesec, Pro + POS z blagajno 29,99 €. Letno plačilo pomeni dva meseca brezplačno. Brez vezave.'],
          ].map(([v, o]) => (
            <details key={v} style={{borderBottom:'1px solid #D9D2C2',padding:'18px 0'}}>
              <summary style={{fontWeight:600,fontSize:17,cursor:'pointer',listStyle:'none'}}>{v}</summary>
              <p style={{marginTop:12,lineHeight:1.7,color:'#4A4A44'}}>{o}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Strukturirani podatki. Iskalnik in AI pomocnik iz njih razberejo,
          kaj izdelek je, koliko stane in na katera vprasanja odgovarja - brez
          ugibanja iz besedila strani. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Računko',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web, Windows, Android',
            inLanguage: 'sl',
            description: 'Davčna blagajna za lokale in fakturiranje za slovenski s.p. v enem programu. FURS potrjevanje, delo brez povezave, izvoz za računovodski program.',
            offers: [
              { '@type': 'Offer', name: 'Brezplačno', price: '0', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Pro', price: '12.99', priceCurrency: 'EUR',
                priceSpecification: { '@type': 'UnitPriceSpecification', price: '12.99', priceCurrency: 'EUR', billingDuration: 1, billingIncrement: 1, unitCode: 'MON' } },
              { '@type': 'Offer', name: 'Pro + POS', price: '29.99', priceCurrency: 'EUR',
                priceSpecification: { '@type': 'UnitPriceSpecification', price: '29.99', priceCurrency: 'EUR', billingDuration: 1, billingIncrement: 1, unitCode: 'MON' } },
            ],
            featureList: [
              'Davčno potrjevanje računov (FURS)',
              'POS blagajna za gostinstvo — mize, delitev računa, kuhinjski zaslon',
              'Delo brez povezave do dveh delovnih dni',
              'e-račun v obliki e-SLOG 2.0',
              'KPO knjiga in evidence DDV',
              'Izvoz za Vasco, Pantheon in Opal',
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              ['Ali potrebujem davčno blagajno za lokal?', 'Da. Če za blago ali storitev prejmete gotovino, kartico ali drugo neposredno plačilo, mora biti račun davčno potrjen pri FURS. Za plačila na transakcijski račun potrjevanje ni potrebno.'],
              ['Ali blagajna deluje brez interneta?', 'Da. Ob izpadu povezave se račun izda z zaščitno oznako ZOI in se samodejno prijavi pri FURS, ko se povezava vrne. Zakonski rok sta dva delovna dneva.'],
              ['Ali Računko nadomesti računovodski servis?', 'Ne. Računko vodi račune, stroške, KPO in DDV evidenco ter jih izvozi v obliki, ki jo prebere Vasco, Pantheon ali Opal.'],
              ['Kdaj bodo e-računi med podjetji obvezni?', 'Od 1. januarja 2028 po zakonu ZIERDED. Zahtevana je strukturirana oblika e-SLOG ali skladna z EN 16931.'],
            ].map(([q, a]) => ({
              '@type': 'Question', name: q,
              acceptedAnswer: { '@type': 'Answer', text: a },
            })),
          },
        ],
      })}} />

      <section className="section" id="primerjava">
        <div className="section-head">
          <span className="kicker">Za koga je Računko</span>
          <h2 className="h2">Narejeno za <em>vas.</em></h2>
          <p className="lede">Računko se prilagodi vsaki vrsti slovenskega podjetja — od freelancerja do fitnes studija.</p>
        </div>
        <div className="persona-grid">
          {/* Freelancer */}
          <div style={{background:'#FBF7EE',border:'1px solid #D9D2C2',borderRadius:28,overflow:'hidden'}}>
            <div style={{background:'#F4D9CE',padding:'28px 28px 22px'}}>
              <div style={{fontSize:'2rem',marginBottom:12}}>💻</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.45rem',letterSpacing:'-0.01em',color:'#0C2A1E'}}>Freelancer &amp;<br />normiranec</div>
              <div style={{fontSize:'0.86rem',color:'#3A4A40',marginTop:8}}>Svetovalec · Razvijalec · Fotograf · Grafični oblikovalec</div>
            </div>
            <div style={{padding:'24px 28px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:20}}>
                {['Računi s PDF & UPN QR kodo','Prispevki QR — plačate v sekundi','Normirani odhodki & akontacija','DDV evidenca (za zavezance)'].map(item => (
                  <div key={item} style={{display:'flex',gap:11,alignItems:'flex-start',fontSize:'0.94rem'}}><Check color="#1F4732" /><span>{item}</span></div>
                ))}
              </div>
              <div style={{textAlign:'center',padding:'10px 14px',background:'#F4D9CE',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#C9442B'}}>Priporočamo: Pro · 12,99 €/mes</div>
            </div>
          </div>
          {/* Gostinec */}
          <div style={{background:'#0E3D2A',color:'#F4EFE6',borderRadius:28,overflow:'hidden'}}>
            <div style={{background:'#091d12',padding:'28px 28px 22px'}}>
              <div style={{fontSize:'2rem',marginBottom:12}}>🍽️</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.45rem',letterSpacing:'-0.01em'}}>Gostinec &amp;<br />obrtnik</div>
              <div style={{fontSize:'0.86rem',opacity:0.65,marginTop:8}}>Restavracija · Frizer · Avtoserviser · Kavarna</div>
            </div>
            <div style={{padding:'24px 28px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:20}}>
                {['POS blagajna za gotovino & kartice','FURS ZDavPR 2026 fiskalizacija','Dnevni zaključki PDF','Artikli in ceniki z DDV stopnjami','Mobilna blagajna za teren'].map(item => (
                  <div key={item} style={{display:'flex',gap:11,alignItems:'flex-start',fontSize:'0.94rem'}}><Check color="#F4EFE6" /><span>{item}</span></div>
                ))}
              </div>
              <div style={{textAlign:'center',padding:'10px 14px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#F4EFE6'}}>Priporočamo: Pro + POS · 29,99 €/mes</div>
            </div>
          </div>
          {/* Fitness */}
          <div style={{background:'#FBF7EE',border:'1px solid #D9D2C2',borderRadius:28,overflow:'hidden'}}>
            <div style={{background:'#D7E4D4',padding:'28px 28px 22px'}}>
              <div style={{fontSize:'2rem',marginBottom:12}}>💪</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.45rem',letterSpacing:'-0.01em',color:'#0C2A1E'}}>Fitness &amp;<br />zdravje</div>
              <div style={{fontSize:'0.86rem',color:'#1F4732',marginTop:8}}>Fitnes · Fizioterapevt · Masaža · Joga studio</div>
            </div>
            <div style={{padding:'24px 28px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:20}}>
                {['Člani & mesečne naročnine','Terminski koledar & rezervacije','Ekipa & dostopi za trenerje','Računi & ponavljajoči zaračun','Desktop & mobilna aplikacija'].map(item => (
                  <div key={item} style={{display:'flex',gap:11,alignItems:'flex-start',fontSize:'0.94rem'}}><Check color="#1F4732" /><span>{item}</span></div>
                ))}
              </div>
              <div style={{textAlign:'center',padding:'10px 14px',background:'#D7E4D4',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#1F4732'}}>Priporočamo: Pro + POS · 29,99 €/mes</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="section">
        <div className="section-head">
          <span className="kicker">Resnične izkušnje</span>
          <h2 className="h2">S.p. ki so <em>preračunali</em></h2>
          <p className="lede">Ne splošne pohvale — konkretni zneski ki so jih prihranili.</p>
        </div>
        <div className="quote-grid">
          {TESTIMONIALS.map(t => (
            <figure key={t.initials} className="quote">
              <div className="quote-head">
                <div className="stars">{'★'.repeat(t.stars)}</div>
                <span className="save-tag">{t.tag}</span>
              </div>
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption>
                <div className="avatar">{t.initials}</div>
                <div><strong>{t.name}</strong><small>{t.role}</small></div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <div style={{background:'#FBF7EE',borderTop:'1px solid #D9D2C2',borderBottom:'1px solid #D9D2C2'}} id="cene">
        <div style={{maxWidth:1240,margin:'0 auto',padding:'clamp(64px,10vw,120px) clamp(24px,6vw,88px)'}}>
          <div className="section-head">
            <span className="kicker">Cene</span>
            <h2 className="h2">Izberite <em>pravi</em> paket.</h2>
            <p className="lede">Brez skritih stroškov. Nadgradite ali zamenjajte kadarkoli.</p>
          </div>
          <div className="plans-3">
            {PLANS.map(p => (
              <div key={p.name} className={`plan${p.highlighted ? ' plan-hero' : ''}`}>
                {p.flag && <div className="plan-flag">{p.flag}</div>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">
                  <span className="cur">€</span>{p.price}
                  {p.priceDec && <span style={{fontSize:'0.5em',opacity:0.9}}>{p.priceDec}</span>}
                  <span className="per">{p.per}</span>
                </div>
                <span className={`plan-tag ${p.tagClass}`}>{p.tag}</span>
                <ul className="plan-list">
                  {p.features.map(f => (
                    <li key={f}><Check />{f.includes('Neomejeni') || f.includes('Vse iz') ? <strong>{f}</strong> : f}</li>
                  ))}
                </ul>
                <a href="/register" className={p.ctaClass}>{p.cta}</a>
              </div>
            ))}
          </div>
          <p style={{textAlign:'center',fontSize:'0.86rem',color:'#3A4A40',marginTop:28}}>Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
        </div>
      </div>

      {/* ── FAQ ── */}
      <section className="section" id="faq">
        <div className="section-head">
          <span className="kicker">Pogosta vprašanja</span>
          <h2 className="h2">Odgovori brez zavijanja</h2>
        </div>
        <div className="faq-list">
          {FAQS.map((item, i) => (
            <div key={i} className="faq-item">
              <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                {item.q}
                <span style={faqIconStyle(i)}>{openFaq === i ? '−' : '+'}</span>
              </button>
              <div style={faqAnswerStyle(i)}>{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <div className="final">
        <div className="final-inner">
          <span className="kicker kicker-on-dark">Računovodje partnerji</span>
          <h2 className="final-h">Računko + računovodja —<br /><em>najboljša kombinacija.</em></h2>
          <p className="final-sub">Računko pokrije fakturiranje, davke in blagajno. Za letni zaključek, revizijo ali d.o.o. pa vas <strong>povežemo z računovodjem, ki pozna Računko</strong> — manj dela za vse.</p>
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
            <a href="/register" className="btn btn-on-dark btn-lg">Začni brezplačno →</a>
            <a href="#" className="btn btn-lg" style={{background:'rgba(255,255,255,0.1)',color:'#F4EFE6',border:'1px solid rgba(255,255,255,0.2)'}}>Najdi partnerskega računovodja</a>
          </div>
          <p className="final-trust" style={{marginTop:28}}>Brez kreditne kartice · Podatki v EU · Nastavitev v 5 minutah</p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="foot">
        <div className="foot-inner">
          <a href="#top" className="foot-brand"><BrandMark size={26} /><span>Računko</span></a>
          <nav className="foot-nav">
            <a href="#">Pišite ustanovitelju</a>
            <a href="#">Zasebnost</a>
            <a href="#">Pogoji</a>
          </nav>
          <span>© 2026 · Narejeno za slovenskega podjetnika</span>
        </div>
      </footer>
    </>
  );
}
