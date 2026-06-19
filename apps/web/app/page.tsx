'use client';

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
    features:['Do 5 računov/mesec','PDF download','Prispevki QR','UPN QR koda'],
    cta:'Začni brezplačno', ctaClass:'btn btn-ghost btn-block', highlighted: false,
  },
  {
    name:'Pro', price:'9', priceDec:'.99', per:'/mes', tag:'€119.88/leto', tagClass:'plan-tag-amber',
    features:['Neomejeni računi','Email pošiljanje računov','FURS e-računi & eSlog','Dobavnice','AI računovodja','DDV evidenca'],
    cta:'Začni brezplačno →', ctaClass:'btn btn-on-dark btn-block', highlighted: true, flag:'Najbolj priljubljen',
  },
  {
    name:'Pro + POS', price:'24', priceDec:'.99', per:'/mes', tag:'€299.88/leto', tagClass:'plan-tag-soft',
    features:['Vse iz Pro +','POS blagajna','Terminski koledar','Člani & naročnine','Ekipa & dostopi','Desktop & mobilna app'],
    cta:'Začni brezplačno →', ctaClass:'btn btn-primary btn-block', highlighted: false,
  },
];

const FAQS = [
  { q:'Ali Računko res nadomesti računovodja?', a:'Za 90% samostojnih podjetnikov — da. Normiranec, DDV zavezanec, par zaposlenih — Računko pokrije vse. Za d.o.o. z revizijo priporočamo Računko + računovodja za letni zaključek.' },
  { q:'Kateri paket je za mene pravi?', a:'Free je za tiste, ki začenjajo — do 5 računov brez kreditne kartice. Pro je za aktivnega podjetnika z neomejenimi računi, email pošiljanjem in FURS. Pro + POS je za gostince, obrtnike in studie, ki potrebujejo blagajno, člane in ekipo.' },
  { q:'Ali moram prekiniti pogodbo z računovodjem?', a:'Ni potrebno. Prenesite svoje podatke in preidite postopoma. Računko ima 14-dnevni brezplačni preizkus — brez vezave in brez kreditne kartice.' },
  { q:'Deluje za DDV zavezance?', a:'Da, v celoti. Vključujemo DDV-O obračun, evidenco DDV in eSlog račune za B2G — vse kar DDV zavezanec potrebuje za tekoče poslovanje.' },
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
      { name:'eSlog / UJP', desc:'Elektronski računi za javni sektor — šole, občine', tag:'B2G' },
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
  const savings = Math.round(annual - 119.88);
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
          <nav className="nav-links">
            <a href="#funkcije">Funkcije</a>
            <a href="#vmesnik">Vmesnik</a>
            <a href="#primerjava">Primerjava</a>
            <a href="#cene">Cene</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <a href="#" className="btn btn-ghost">Prijava</a>
            <a href="#cene" className="btn btn-primary">Začni brezplačno →</a>
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
            <a href="#cene" className="btn btn-primary btn-lg">Začni brezplačno →</a>
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
            <p className="lede">Premaknite drsnik na svoj mesečni račun. Računko Pro stane €9.99 mesečno.</p>
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
              <div className="calc-foot">Računko Pro: <strong>€119.88/leto</strong></div>
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
          <h2 className="h2">Vse kar potrebujete.<br /><em>Na enem zaslonu.</em></h2>
          <p className="lede">Prihodki, roki, računi in AI računovodja. Brez iskanja po mailu, brez čakanja na odgovor.</p>
        </div>
        <div style={{marginTop:40,borderRadius:16,overflow:'hidden',background:'#0B1A10',boxShadow:'0 40px 80px -30px rgba(14,61,42,0.35),0 12px 24px -12px rgba(14,61,42,0.2)'}}>
          {/* Browser bar */}
          <div style={{height:38,background:'#091410',display:'flex',alignItems:'center',padding:'0 14px',position:'relative'}}>
            <div style={{display:'inline-flex',gap:6}}><i style={{width:11,height:11,borderRadius:'50%',background:'rgba(255,255,255,0.18)',display:'block'}} /><i style={{width:11,height:11,borderRadius:'50%',background:'rgba(255,255,255,0.18)',display:'block'}} /><i style={{width:11,height:11,borderRadius:'50%',background:'rgba(255,255,255,0.18)',display:'block'}} /></div>
            <div style={{position:'absolute',left:'50%',transform:'translateX(-50%)',fontFamily:"'JetBrains Mono',monospace",fontSize:'0.74rem',color:'rgba(255,255,255,0.55)',background:'rgba(14,61,42,0.6)',padding:'4px 16px',borderRadius:6}}>računko.si/dashboard</div>
          </div>
          {/* Body */}
          <div style={{display:'grid',gridTemplateColumns:'56px 1fr'}}>
            {/* Icon sidebar */}
            <div style={{background:'#091410',display:'flex',flexDirection:'column',alignItems:'center',padding:'14px 0 12px',gap:3,borderRight:'1px solid rgba(255,255,255,0.05)',minHeight:560}}>
              <BrandMark size={28} />
              <div style={{marginBottom:10}} />
              {[
                <svg key="home" width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 7L8 2L14 7V13.5C14 14.05 13.55 14.5 13 14.5H10.5V10H5.5V14.5H3C2.45 14.5 2 14.05 2 13.5V7Z" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
                <svg key="inv" width="16" height="16" fill="none" viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"/><path d="M1.5 6H14.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.3"/></svg>,
                <svg key="exp" width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 2H14L12.5 10H3.5L2 2Z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
                <svg key="usr" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"/><path d="M2 14C2 11.79 4.69 10 8 10C11.31 10 14 11.79 14 14" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round"/></svg>,
                <svg key="stats" width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M1.5 10.5L4.5 5.5L7.5 8.5L10 5.5L14.5 10.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              ].map((icon, i) => (
                <div key={i} style={{width:36,height:36,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',background: i===0 ? 'rgba(255,255,255,0.1)' : 'transparent'}}>{icon}</div>
              ))}
              <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:6,alignItems:'center'}}>
                <div style={{width:30,height:30,background:'#C9921B',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:700,color:'white'}}>€</div>
              </div>
            </div>
            {/* Main */}
            <div style={{background:'#F4EFE6',display:'flex',flexDirection:'column'}}>
              {/* Top bar */}
              <div style={{padding:'13px 18px 11px',borderBottom:'1px solid rgba(0,0,0,0.07)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#F4EFE6',flexShrink:0}}>
                <div>
                  <div style={{fontSize:'0.65rem',color:'#3A4A40',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:3}}>SREDA · 18. JUNIJ 2026</div>
                  <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.2rem',letterSpacing:'-0.01em',color:'#0C2A1E',lineHeight:1.2}}>Dober dan, Jaka <span className="wave">👋</span></div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,background:'white',border:'1px solid #D9D2C2',borderRadius:8,padding:'6px 12px',fontSize:'0.78rem',color:'#3A4A40'}}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 13 13" style={{opacity:0.45}}><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9 9L11.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    Iskanje računov...
                    <span style={{background:'#F4EFE6',border:'1px solid #D9D2C2',borderRadius:4,padding:'1px 5px',fontSize:'0.66rem',fontFamily:"'JetBrains Mono',monospace",opacity:0.7}}>⌘K</span>
                  </div>
                  <div style={{width:30,height:30,background:'#0E3D2A',color:'#F4EFE6',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.68rem',fontWeight:700}}>JK</div>
                </div>
              </div>
              {/* Content */}
              <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:9,overflow:'hidden'}}>
                {/* Quick actions */}
                <div>
                  <div style={{fontSize:'0.62rem',letterSpacing:'0.07em',textTransform:'uppercase',color:'#3A4A40',marginBottom:7}}>BLIŽNJICE</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
                    {['Nov račun','Dodaj strošek','Prispevki QR','Skeniraj račun'].map(label => (
                      <div key={label} style={{background:'white',border:'1px solid #D9D2C2',borderRadius:9,padding:'10px 8px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style={{color:'#0E3D2A'}}><rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5.5V10.5M5.5 8H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        <span style={{fontSize:'0.72rem',color:'#0C2A1E'}}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Revenue card */}
                <div style={{background:'#0E3D2A',color:'#F4EFE6',borderRadius:12,padding:'18px 20px'}}>
                  <div style={{fontSize:'0.62rem',letterSpacing:'0.09em',textTransform:'uppercase',opacity:0.5,marginBottom:10}}>ČISTI PRIHODEK · JUNIJ 2026 · NORMIRANI 80%</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                    <div>
                      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'2.8rem',lineHeight:1,letterSpacing:'-0.03em'}}>€1.539<span style={{fontSize:'0.5em',opacity:0.6}}>.89</span></div>
                      <div style={{fontSize:'0.75rem',opacity:0.55,marginTop:8}}>Po prispevkih in davkih (22%) · projekcija <strong style={{color:'#F4EFE6',opacity:1}}>€2.673</strong></div>
                    </div>
                    <svg width="140" height="54" viewBox="0 0 140 54" fill="none" style={{flexShrink:0,marginLeft:16}}>
                      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D89328" stopOpacity="0.35"/><stop offset="100%" stopColor="#D89328" stopOpacity="0"/></linearGradient></defs>
                      <path d="M2 50 C10 48 18 44 26 40 C34 36 38 38 46 34 C54 30 60 26 70 22 C80 18 88 15 98 11 C108 7 120 5 138 3" stroke="#D89328" strokeWidth="2" strokeLinecap="round" fill="none"/>
                      <path d="M2 50 C10 48 18 44 26 40 C34 36 38 38 46 34 C54 30 60 26 70 22 C80 18 88 15 98 11 C108 7 120 5 138 3 L138 54 L2 54 Z" fill="url(#sg)"/>
                    </svg>
                  </div>
                </div>
                {/* Stats row */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  <div style={{background:'white',border:'1px solid #D9D2C2',borderRadius:10,padding:'14px 15px'}}>
                    <div style={{fontSize:'0.62rem',letterSpacing:'0.06em',textTransform:'uppercase',color:'#3A4A40',marginBottom:6}}>PRIHODKI JUN</div>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.55rem',letterSpacing:'-0.02em',lineHeight:1,color:'#0C2A1E'}}>€1.974</div>
                    <div style={{fontSize:'0.74rem',color:'#3A4A40',marginTop:5}}>Brez DDV</div>
                  </div>
                  <div style={{background:'white',border:'1px solid #D9D2C2',borderRadius:10,padding:'14px 15px'}}>
                    <div style={{fontSize:'0.62rem',letterSpacing:'0.06em',textTransform:'uppercase',color:'#3A4A40',marginBottom:6}}>ODHODKI JUN</div>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.55rem',letterSpacing:'-0.02em',lineHeight:1,color:'#0C2A1E'}}>€0</div>
                    <div style={{fontSize:'0.74rem',color:'#3A4A40',marginTop:5}}>Skeniraj prvi račun</div>
                  </div>
                  <div style={{background:'#0E3D2A',border:'1px solid #0E3D2A',borderRadius:10,padding:'14px 15px',color:'#F4EFE6'}}>
                    <div style={{fontSize:'0.62rem',letterSpacing:'0.06em',textTransform:'uppercase',opacity:0.5,marginBottom:6}}>STRANKE VAM DOLGUJEJO</div>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:'1.55rem',letterSpacing:'-0.02em',lineHeight:1}}>€2.403</div>
                    <div style={{fontSize:'0.74rem',opacity:0.55,marginTop:5}}>7 odprtih računov</div>
                  </div>
                </div>
                {/* Activity + Deadlines */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div style={{background:'white',border:'1px solid #D9D2C2',borderRadius:10,padding:'13px 15px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:11}}>
                      <div style={{fontWeight:600,fontSize:'0.88rem'}}>Zadnja aktivnost</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {[
                        {bg:'#D7E4D4',tc:'#1F4732',init:'M',name:'Meta Platforms',num:'#2026-013',amount:'+€174',status:'POSLANO',stBg:'#DDF1E6',stC:'#1F6B49'},
                        {bg:'#D9E5F4',tc:'#2A4A7A',init:'G',name:'Google LLC',num:'#2026-011',amount:'+€480',status:'POSLANO',stBg:'#DDF1E6',stC:'#1F6B49'},
                        {bg:'#F4D9CE',tc:'#C9442B',init:'A',name:'Amazon EU S.à r.l.',num:'#2026-009',amount:'+€480',status:'POSLANO',stBg:'#DDF1E6',stC:'#1F6B49'},
                      ].map(r => (
                        <div key={r.init} style={{display:'flex',alignItems:'center',gap:9,fontSize:'0.8rem'}}>
                          <div style={{width:26,height:26,background:r.bg,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.66rem',fontWeight:700,color:r.tc,flexShrink:0}}>{r.init}</div>
                          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div><div style={{fontSize:'0.7rem',color:'#3A4A40'}}>{r.num}</div></div>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.78rem',color:'#0C2A1E',fontWeight:500,flexShrink:0}}>{r.amount}</span>
                          <span style={{fontSize:'0.66rem',padding:'2px 7px',background:r.stBg,color:r.stC,borderRadius:999,fontWeight:500,flexShrink:0}}>{r.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{background:'white',border:'1px solid #D9D2C2',borderRadius:10,padding:'13px 15px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:11}}>
                      <div style={{fontWeight:600,fontSize:'0.88rem'}}>Bližnji roki</div>
                      <span style={{fontSize:'0.78rem',color:'#0E3D2A'}}>Koledar →</span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {[
                        {label:'Prispevki s.p.',amount:'€624.05',date:'15. jun',tagBg:'#F4D9CE',tagC:'#C9442B',tagLabel:'ZAMUDA'},
                        {label:'Akontacija dohodnine',amount:'€84',date:'15. jun',tagBg:'#F4D9CE',tagC:'#C9442B',tagLabel:'ZAMUDA'},
                        {label:'DDV-O obračun',amount:'Q2',date:'31. jul',tagBg:'#D7E4D4',tagC:'#1F4732',tagLabel:'25 dni'},
                      ].map((d,i) => (
                        <div key={i}>
                          {i > 0 && <div style={{height:1,background:'#D9D2C2',margin:'0 0 10px'}} />}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:3}}><span style={{fontSize:'0.84rem',fontWeight:500}}>{d.label}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.8rem',fontWeight:600,color:'#0C2A1E'}}>{d.amount}</span></div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:'0.72rem',color:'#3A4A40'}}>{d.date}</span><span style={{fontSize:'0.66rem',padding:'2px 8px',background:d.tagBg,color:d.tagC,borderRadius:999,fontWeight:500}}>{d.tagLabel}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* AI suggestion */}
                <div style={{background:'#0C1F14',borderRadius:10,padding:'11px 15px',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:30,height:30,background:'#1F6B3A',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{color:'#F4EFE6'}}><path d="M7 1L8.5 4.5H12L9.25 6.75L10.25 10.5L7 8.5L3.75 10.5L4.75 6.75L2 4.5H5.5L7 1Z" fill="currentColor"/></svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'0.6rem',letterSpacing:'0.08em',textTransform:'uppercase',color:'rgba(244,239,230,0.4)',marginBottom:2}}>AI RAČUNOVODJA PREDLAGA</div>
                    <div style={{fontSize:'0.8rem',color:'#F4EFE6'}}>Imate <span style={{color:'#D89328',fontWeight:500}}>3 stroške v e-pošti</span>, ki niso vneseni. Skupaj ~€240.</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button style={{padding:'5px 11px',background:'transparent',color:'rgba(244,239,230,0.4)',border:'none',fontFamily:'inherit',fontSize:'0.76rem',cursor:'pointer',borderRadius:6}}>Pozneje</button>
                    <button style={{padding:'5px 12px',background:'#C9921B',color:'white',border:'none',fontFamily:'inherit',fontSize:'0.76rem',fontWeight:500,cursor:'pointer',borderRadius:6}}>Da, skeniraj</button>
                  </div>
                </div>
              </div>
              {/* Bottom bar */}
              <div style={{padding:'10px 14px',borderTop:'1px solid #D9D2C2',background:'#F4EFE6',display:'flex',justifyContent:'flex-end',flexShrink:0}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#0E3D2A',color:'#F4EFE6',borderRadius:8,fontSize:'0.82rem',fontWeight:500,cursor:'pointer'}}>
                  <span style={{fontSize:'1.1rem',fontWeight:300,lineHeight:1}}>+</span> Nov račun
                </div>
              </div>
            </div>
          </div>
        </div>
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
                {['Računi s PDF & UPN QR kodo','Prispevki QR — plačate v sekundi','Normirani odhodki & akontacija','DDV evidenca (za zavezance)','eSlog / UJP za javni sektor'].map(item => (
                  <div key={item} style={{display:'flex',gap:11,alignItems:'flex-start',fontSize:'0.94rem'}}><Check color="#1F4732" /><span>{item}</span></div>
                ))}
              </div>
              <div style={{textAlign:'center',padding:'10px 14px',background:'#F4D9CE',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#C9442B'}}>Priporočamo: Pro · €9.99/mes</div>
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
              <div style={{textAlign:'center',padding:'10px 14px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#F4EFE6'}}>Priporočamo: Pro + POS · €24.99/mes</div>
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
              <div style={{textAlign:'center',padding:'10px 14px',background:'#D7E4D4',borderRadius:999,fontSize:'0.82rem',fontWeight:500,color:'#1F4732'}}>Priporočamo: Pro + POS · €24.99/mes</div>
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
                <a href="#" className={p.ctaClass}>{p.cta}</a>
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
            <a href="#cene" className="btn btn-on-dark btn-lg">Začni brezplačno →</a>
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
