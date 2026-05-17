'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import './styles.css'

/* ---------- Tokens ---------- */
const PALETTES: Record<string, any> = {
  forest: {
    name: "Forest",
    bg: "#F4EFE6", bg2: "#FBF7EE",
    ink: "#0C2A1E", ink2: "#3A4A40",
    rule: "#D9D2C2",
    primary: "#0E3D2A", primaryInk: "#F4EFE6",
    accent: "#C9442B", accentSoft: "#F4D9CE",
    sage: "#D7E4D4", sageInk: "#1F4732",
  },
  ink: {
    name: "Ink",
    bg: "#0C0F0D", bg2: "#14181A",
    ink: "#EDE7D9", ink2: "#9AA39A",
    rule: "#252B28",
    primary: "#C9F26A", primaryInk: "#0C0F0D",
    accent: "#FF6A45", accentSoft: "#3A1B14",
    sage: "#1B2A22", sageInk: "#9DC8AB",
  },
  paper: {
    name: "Paper",
    bg: "#F2EFE8", bg2: "#FFFFFF",
    ink: "#111111", ink2: "#5C5A55",
    rule: "#D9D6CE",
    primary: "#111111", primaryInk: "#F2EFE8",
    accent: "#D54B2A", accentSoft: "#F4D9CE",
    sage: "#E6E2D6", sageInk: "#2A2A2A",
  },
}

const HEADLINES: Record<string, any> = {
  math: {
    eyebrow: "Narejeno za slovenskega s.p. in d.o.o.",
    pre: "Vaš računovodja naredi ", big: "10 klikov", mid: " na mesec.",
    line2_pre: "Vi plačate ", line2_big: "€300.", line2_post: "",
    sub: "Računko je operativni sistem za vaše podjetje. Računi, blagajna, davki, plače, ekipa — vse na enem mestu. Od €9.99/mes.",
  },
}

/* ---------- Tiny icons ---------- */
function Tick(){return(<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>)}
function Cross(){return(<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>)}
function EU(){return(<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="7" r="1.6" fill="currentColor"/></svg>)}
function Clock(){return(<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.2L9 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>)}
function Bell(){return(<svg width="13" height="13" viewBox="0 0 13 13"><path d="M3 9.5h7l-1-1.5V6a2.5 2.5 0 10-5 0v2L3 9.5z M5.5 11a1 1 0 002 0" stroke="currentColor" fill="none" strokeLinejoin="round"/></svg>)}
const Sq=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><rect x="1.5" y="1.5" width="4" height="4" rx="1" fill="none" stroke="currentColor"/><rect x="7.5" y="1.5" width="4" height="4" rx="1" fill="none" stroke="currentColor"/><rect x="1.5" y="7.5" width="4" height="4" rx="1" fill="none" stroke="currentColor"/><rect x="7.5" y="7.5" width="4" height="4" rx="1" fill="none" stroke="currentColor"/></svg>)
const Bot=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><rect x="2.5" y="4" width="8" height="6.5" rx="1.5" fill="none" stroke="currentColor"/><circle cx="5.2" cy="6.8" r="0.7" fill="currentColor"/><circle cx="7.8" cy="6.8" r="0.7" fill="currentColor"/><path d="M6.5 1.5v2.2" stroke="currentColor" fill="none"/></svg>)
const Bars=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><path d="M2 11h9M3.5 8.5v2M6.5 5.5v5M9.5 7v3.5" stroke="currentColor" fill="none" strokeLinecap="round"/></svg>)
const Doc=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><path d="M3 1.5h5l2.5 2.5v8H3z" fill="none" stroke="currentColor"/><path d="M8 1.5V4h2.5" fill="none" stroke="currentColor"/></svg>)
const Qr=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><rect x="1.5" y="1.5" width="4" height="4" stroke="currentColor" fill="none"/><rect x="7.5" y="1.5" width="4" height="4" stroke="currentColor" fill="none"/><rect x="1.5" y="7.5" width="4" height="4" stroke="currentColor" fill="none"/><rect x="8" y="8" width="1.5" height="1.5" fill="currentColor"/><rect x="10.5" y="10.5" width="1" height="1" fill="currentColor"/></svg>)
const Pct=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><circle cx="3.5" cy="3.5" r="1.5" stroke="currentColor" fill="none"/><circle cx="9.5" cy="9.5" r="1.5" stroke="currentColor" fill="none"/><path d="M2 11L11 2" stroke="currentColor"/></svg>)
const Norm=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><rect x="1.5" y="1.5" width="10" height="10" rx="1" stroke="currentColor" fill="none"/><path d="M3.5 4.5h6M3.5 6.5h6M3.5 8.5h4" stroke="currentColor"/></svg>)
const Scan=()=>(<svg width="13" height="13" viewBox="0 0 13 13"><path d="M2 4.5V2h2.5M11 4.5V2H8.5M2 8.5V11h2.5M11 8.5V11H8.5M3 6.5h7" stroke="currentColor" fill="none" strokeLinecap="round"/></svg>)
const Plus=()=>(<svg width="11" height="11" viewBox="0 0 11 11"><path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeLinecap="round"/></svg>)

/* ---------- Nav ---------- */
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="#top" className="brand" aria-label="Računko">
          <span className="brand-mark" aria-hidden="true">
            <span>r</span><span className="brand-dot">č</span>
          </span>
          <span className="brand-word">računko</span>
        </Link>
        <div className="nav-links">
          <a href="#vodnik">Funkcije</a>
          <a href="#kako">Vmesnik</a>
          <a href="#primerjava">Primerjava</a>
          <a href="#cene">Cene</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-cta">
          <Link className="btn btn-ghost" href="/login">Prijava</Link>
          <Link className="btn btn-primary" href="/register">
            Začni brezplačno <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ---------- Hero ---------- */
function Hero({ headline }: { headline: string }) {
  const h = HEADLINES[headline] || HEADLINES.math
  return (
    <section className="hero" id="top">
      <div className="hero-grid">
        <div className="eyebrow">
          <span className="dot" /> {h.eyebrow}
        </div>
        <h1 className="display">
          <span>{h.pre}</span>
          <em className="display-accent">{h.big}</em>
          <span>{h.mid}</span>
          <br />
          <span>{h.line2_pre}</span>
          <em className="display-accent">{h.line2_big}</em>
          <span>{h.line2_post}</span>
        </h1>
        <p className="hero-sub">{h.sub}</p>
        <div className="hero-cta">
          <Link href="/register" className="btn btn-primary btn-lg">
            Sestavite svoj paket <span aria-hidden="true">→</span>
          </Link>
          <a href="#vodnik" className="btn btn-quiet btn-lg">Oglej si funkcije</a>
        </div>
        <p className="hero-proof">
          Osnova od €9.99/mes · Plug-ini po potrebi · Brez vezave
        </p>
        <ul className="trust">
          <li><Tick/> Brez kreditne kartice</li>
          <li><EU/> Podatki v EU</li>
          <li><Clock/> Nastavitev v 5 minutah</li>
          <li><Cross/> Brez vezave</li>
        </ul>
      </div>
      <div className="hero-quote-rule" aria-hidden="true" />
      <figure className="pull-quote">
        <blockquote>
          <span className="qmark" aria-hidden="true">&ldquo;</span>
          Vsak mesec pošljem računovodji iste dokumente. On mi pošlje
          {" "}<mark>isti email z zneski prispevkov.</mark>{" "}
          Račun: <strong>€320.</strong>
        </blockquote>
        <figcaption>— resnična izkušnja slovenskega s.p. freelancerja</figcaption>
      </figure>
    </section>
  )
}

/* ---------- Live cost calculator ---------- */
function MathSection() {
  const [rate, setRate] = useState(280)
  const yearly = rate * 12
  const racunko = 144
  const saved = yearly - racunko
  return (
    <section className="section math">
      <header className="section-head">
        <div className="kicker kicker-warn">Preprosta matematika</div>
        <h2 className="h2">Koliko vas <em>dejansko</em> stane računovodja?</h2>
        <p className="lede">Premaknite drsnik na svoj mesečni račun. Računko osnova stane €9.99 mesečno.</p>
      </header>
      <div className="calc">
        <div className="calc-card calc-input">
          <div className="calc-label">Vaš mesečni račun</div>
          <div className="calc-value">
            <span className="cur">€</span>
            <span className="num">{rate}</span>
            <span className="unit">/mes</span>
          </div>
          <input className="calc-slider" type="range" min="80" max="600" step="10" value={rate}
            onChange={(e) => setRate(parseInt(e.target.value, 10))} aria-label="Mesečni račun računovodje" />
          <div className="calc-scale">
            <span>€80</span><span>€280 (povp. SLO)</span><span>€600</span>
          </div>
        </div>
        <div className="calc-times" aria-hidden="true">×</div>
        <div className="calc-card calc-mid">
          <div className="calc-label">Mesecev</div>
          <div className="calc-value"><span className="num num-quiet">12</span></div>
          <div className="calc-foot">Vsak mesec. Brez izjeme.</div>
        </div>
        <div className="calc-eq" aria-hidden="true">=</div>
        <div className="calc-card calc-result">
          <div className="calc-label">Letno</div>
          <div className="calc-value">
            <span className="cur">€</span>
            <span className="num num-result">{yearly.toLocaleString("sl-SI")}</span>
          </div>
          <div className="calc-foot">Računko osnova: <strong>€120/leto</strong></div>
        </div>
      </div>
      <div className="savings">
        <span className="savings-label">Letni prihranek z Računkom</span>
        <span className="savings-amt">€{saved.toLocaleString("sl-SI")}</span>
        <span className="savings-foot">≈ {Math.round(saved / 1)} € — vaš denar, ne računovodjin</span>
      </div>
    </section>
  )
}

/* ================================================================
   PRODUCT TOUR — interaktivni vodnik po funkcijah
   ================================================================ */
const TOUR_SLIDES = [
  {
    id: 'racuni', label: 'Računi', emoji: '🧾',
    title: 'Računi & fakturiranje',
    sub: 'Od predračuna do plačila — brez papirja',
    features: [
      { name: 'Izdani računi', desc: 'PDF z UPN QR kodo, pošiljanje po emailu v sekundi', badge: null },
      { name: 'Predračuni', desc: 'Pošlji ponudbo → en klik → pretvori v račun', badge: null },
      { name: 'Avansni računi', desc: 'Predplačilo + finalni račun z odbitkom avtomatsko', badge: null },
      { name: 'Ponavljajoči računi', desc: 'Mesečne naročnine se izdajo same — brez roke', badge: null },
      { name: 'eSlog / UJP', desc: 'Elektronski računi za javni sektor — šole, občine', badge: '🏛️ B2G' },
      { name: 'Opomniki za zamudnike', desc: 'Avtomatski email stranki po X dneh zamude', badge: null },
    ],
    highlight: 'UPN QR koda na vsakem PDF-u — stranka skenira z mobilno banko in plača takoj.',
  },
  {
    id: 'finance', label: 'Finance', emoji: '📊',
    title: 'Davki & finance v realnem času',
    sub: 'Nihče drug v Sloveniji tega ne ponuja',
    features: [
      { name: 'Real-time davčni kalkulator', desc: '€702 prihodkov → €385 čistega. V živo, vsak mesec.', badge: '⚡ Unikatno' },
      { name: 'Cash flow 30 dni', desc: 'Projekcija denarnega toka — veste ali boste imeli za prispevke', badge: '⚡ Unikatno' },
      { name: 'DDV obračun', desc: 'DDV evidenca, DDV-O, mesečni/četrtletni obračun', badge: null },
      { name: 'KPO knjiga', desc: 'Evidenca prihodkov za normiranca in dejanski stroški', badge: null },
      { name: 'Normiranec limit', desc: 'Termometer ki pokaže kdaj ste blizu letnega praga', badge: null },
      { name: 'Bančni uvoz CSV', desc: 'NLB, SKB, DH, Nova KBM, Sparkasse — ujemanje z računi', badge: null },
    ],
    highlight: 'Edina aplikacija v Sloveniji ki v realnem času pokaže vaš čisti prihodek po davkih.',
  },
  {
    id: 'blagajna', label: 'Blagajna & POS', emoji: '🏪',
    title: 'POS blagajna za gotovino',
    sub: 'Za gostince, frizerje, tržničarje — kdor dela z gotovino',
    features: [
      { name: 'POS terminal', desc: 'Blagajna na tabletu ali telefonu — brez instalacije', badge: null },
      { name: 'FURS ZDavPR 2026', desc: 'Vsak gotovinski račun potrjen pri FURS v sekundi', badge: '✅ Zakonsko' },
      { name: 'Multi-naprava s PIN', desc: 'Vsak natakar ima PIN — logirate se na kateri koli napravi', badge: null },
      { name: 'Dnevni zaključek PDF', desc: 'Gotovina + kartice + DDV — enako kot 1klik', badge: null },
      { name: 'Zaloge', desc: 'Nabavna/prodajna cena, marža, opomniki za naročanje', badge: null },
      { name: 'Statistika prodaje', desc: 'Najboljši artikli, promet po kategorijah, mesečni trend', badge: null },
    ],
    highlight: 'Polnopravna davčna blagajna na vaši napravi. Ni potrebe po dragi strojni opremi.',
  },
  {
    id: 'kadri', label: 'Kadri & Plače', emoji: '👥',
    title: 'Kadri, plače in HR',
    sub: 'Za s.p. z zaposlenimi — vse na enem mestu',
    features: [
      { name: 'Obračun plač (REK-1)', desc: 'Prispevki delodajalca + delojemalca, FURS oddaja', badge: null },
      { name: 'Regres 2026', desc: 'Min. €1.253,90 — proporcionalen izračun za vsak mesec', badge: null },
      { name: 'Dopust & bolniška', desc: 'Evidenca dni, letni dopust, bolniška, porodniška', badge: null },
      { name: 'Evidenca časa', desc: 'Ure po projektih → direktno v račun stranki', badge: null },
      { name: 'Potni nalogi', desc: 'Kilometrina €0.43/km, dnevnice, FURS-potrjeni zneski', badge: null },
      { name: 'Reprezentanca', desc: '50% davčno priznan strošek — avtomatska evidenca', badge: null },
    ],
    highlight: 'Obračun plač z vsemi prispevki — enostavno kot Excel, natančno kot računovodja.',
  },
  {
    id: 'integracije', label: 'Integracije', emoji: '🔌',
    title: 'Integracije & avtomatizacija',
    sub: 'Povežite vse — naročilo → račun → KPO brez roke',
    features: [
      { name: 'WooCommerce', desc: 'Naročilo pride → račun izdan avtomatsko → KPO vpisan', badge: null },
      { name: 'Shopify', desc: 'Webhook → račun → knjiga prihodkov — brez roke', badge: null },
      { name: 'REST API', desc: 'Povežite lastni sistem z Računko prek API ključev', badge: null },
      { name: 'Multi-user ekipa', desc: 'Admin, blagajnik, računovodja — vsak vidi kar sme', badge: null },
      { name: 'Računovodja portal', desc: 'Računovodja vidi vse vaše stranke — brez XLSX emailov', badge: null },
      { name: 'AI računovodja', desc: '"Koliko dohodnine bom plačal?" — odgovor v 3 sekundah', badge: '🤖 AI' },
    ],
    highlight: 'Računovodja portal je brezplačen za računovodje. Stranke plačajo samo add-on.',
  },
]

function ProductTour() {
  const [current, setCurrent] = useState(0)
  const [selectedFeat, setSelectedFeat] = useState(0)
  const slide = TOUR_SLIDES[current]

  function goTo(i: number) { setCurrent(i); setSelectedFeat(0) }
  function move(dir: number) {
    const next = current + dir
    if (next < 0 || next >= TOUR_SLIDES.length) return
    goTo(next)
  }

  return (
    <section className="section" id="vodnik" style={{ background: 'var(--bg2, #FBF7EE)' }}>
      <header className="section-head">
        <div className="kicker">Interaktivni vodnik</div>
        <h2 className="h2">Kaj vse zmore Računko?</h2>
        <p className="lede">Prelistajte vse funkcije — kliknite na katero koli za podrobnosti.</p>
      </header>

      {/* Tab navigacija */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, overflowX: 'auto' }}>
        {TOUR_SLIDES.map((s, i) => (
          <button key={s.id} onClick={() => goTo(i)} style={{
            padding: '8px 16px', borderRadius: 999,
            border: current === i ? '2px solid #0E3D2A' : '1px solid var(--rule, #D9D2C2)',
            background: current === i ? '#0E3D2A' : 'transparent',
            color: current === i ? '#F4EFE6' : 'var(--ink2, #3A4A40)',
            fontSize: 13, fontWeight: current === i ? 600 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
          }}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Slide vsebina */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--rule, #D9D2C2)', overflow: 'hidden' }}>
        {/* Header slida */}
        <div style={{ background: '#0E3D2A', padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: 'rgba(232,181,71,0.8)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {slide.emoji} {slide.label}
          </div>
          <div style={{ fontSize: 20, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{slide.title}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{slide.sub}</div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Feature kartice */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            {slide.features.map((f, i) => (
              <div key={i} onClick={() => setSelectedFeat(i)} style={{
                background: selectedFeat === i ? '#F4EFE6' : '#FAFAF8',
                border: selectedFeat === i ? '1.5px solid #0E3D2A' : '1px solid var(--rule, #D9D2C2)',
                borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                transition: 'all .12s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0C2A1E' }}>{f.name}</div>
                  {f.badge && (
                    <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92600A', padding: '2px 6px', borderRadius: 8, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>
                      {f.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#3A4A40', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Highlight box */}
          <div style={{ background: '#E1F5EE', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#0E5E3B', lineHeight: 1.6 }}>
            💡 {slide.highlight}
          </div>
        </div>
      </div>

      {/* Navigacija */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--rule, #D9D2C2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((current + 1) / TOUR_SLIDES.length) * 100}%`, background: '#0E3D2A', borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink2, #3A4A40)', minWidth: 48, textAlign: 'center' }}>{current + 1}/{TOUR_SLIDES.length}</span>
        <button onClick={() => move(-1)} disabled={current === 0} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--rule, #D9D2C2)', background: 'transparent', fontSize: 13, cursor: current === 0 ? 'not-allowed' : 'pointer', opacity: current === 0 ? 0.3 : 1 }}>← Nazaj</button>
        {current < TOUR_SLIDES.length - 1 ? (
          <button onClick={() => move(1)} style={{ padding: '7px 14px', borderRadius: 8, border: 0, background: '#0E3D2A', color: '#F4EFE6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Naprej →</button>
        ) : (
          <Link href="#cene" style={{ padding: '7px 14px', borderRadius: 8, border: 0, background: '#C9442B', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>Sestavi paket →</Link>
        )}
      </div>
    </section>
  )
}

/* ================================================================
   PRICING BUILDER — plug-in pricing calculator
   ================================================================ */
const BASES = [
  {
    id: 'basic', name: 'Nakazila', price: 9.99,
    desc: 'Za normiranca in freelancerja ki fakturira samo na TRR.',
    includes: ['Neomejeni računi & KPO', 'AI računovodja', 'Real-time davčni kalkulator', 'Cash flow 30 dni', 'DDV evidenca'],
    for: 'Freelancer · Normiranec',
  },
  {
    id: 'cash', name: 'Gotovina', price: 14.99,
    desc: 'Za tiste ki sprejemajo gotovino in rabijo FURS blagajno.',
    includes: ['Vse iz Nakazila', 'POS terminal', 'FURS ZDavPR 2026', 'Dnevni zaključki PDF'],
    for: 'Gostinec · Frizerka · Obrtnik',
  },
]

const PLUGIN_GROUPS = [
  {
    label: 'Računi & prodaja',
    plugins: [
      { id: 'recurring', name: 'Ponavljajoči računi', desc: 'Mesečne naročnine avtomatsko', price: 3 },
      { id: 'advance', name: 'Avansni računi', desc: 'Predplačilo + finalni račun', price: 2 },
      { id: 'quotes', name: 'Predračuni & ponudbe', desc: 'Ponudba → račun z enim klikom', price: 2 },
      { id: 'webshop', name: 'Spletna prodaja', desc: 'WooCommerce & Shopify webhook', price: 5 },
    ],
  },
  {
    label: 'Finance & davki',
    plugins: [
      { id: 'bank', name: 'Bančni uvoz CSV', desc: 'Vse SI banke → ujemanje z računi', price: 3 },
      { id: 'eslog', name: 'UJP e-računi', desc: 'eSlog 2.0 za javni sektor', price: 5 },
    ],
  },
  {
    label: 'Ekipa & kadri',
    plugins: [
      { id: 'team', name: 'Multi-user ekipa', desc: 'Admin, blagajnik, računovodja', price: 4 },
      { id: 'payroll', name: 'Plače & REK-1', desc: 'Obračun plač, regres, dopust', price: 5 },
      { id: 'accountant', name: 'Računovodja portal', desc: 'Računovodja vidi vse stranke', price: 4 },
    ],
  },
  {
    label: 'Operativa',
    plugins: [
      { id: 'travel', name: 'Potni nalogi', desc: 'Kilometrina, dnevnice', price: 2 },
      { id: 'inventory', name: 'Zaloge', desc: 'Nabavna cena, marža, opomniki', price: 3 },
      { id: 'api', name: 'API dostop', desc: 'REST API za lastne integracije', price: 5 },
    ],
  },
]

function PricingBuilder() {
  const [activeBase, setActiveBase] = useState('basic')
  const [activePlugins, setActivePlugins] = useState<Set<string>>(new Set())

  const base = BASES.find(b => b.id === activeBase)!
  const pluginTotal = Array.from(activePlugins).reduce((sum, id) => {
    for (const g of PLUGIN_GROUPS) {
      const p = g.plugins.find(p => p.id === id)
      if (p) return sum + p.price
    }
    return sum
  }, 0)
  const total = Math.round((base.price + pluginTotal) * 100) / 100
  const annual = Math.round(total * 12 * 100) / 100
  const r123 = total > 20 ? 49.9 : total > 14 ? 24.9 : 9.9
  const saving = Math.round((r123 - total) * 12)

  function togglePlugin(id: string) {
    setActivePlugins(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cardStyle = (active: boolean): React.CSSProperties => ({
    background: active ? '#F4EFE6' : '#fff',
    border: active ? '2px solid #0E3D2A' : '1px solid var(--rule, #D9D2C2)',
    borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
    transition: 'all .15s', marginBottom: 0,
  })

  const pluginStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12,
    background: active ? '#F4EFE6' : '#fff',
    border: active ? '1.5px solid #0E3D2A' : '1px solid var(--rule, #D9D2C2)',
    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
    transition: 'all .12s',
  })

  return (
    <section className="section" id="cene">
      <header className="section-head">
        <div className="kicker">Cene</div>
        <h2 className="h2">Sestavite <em>svoj</em> paket.</h2>
        <p className="lede">Osnova + samo tisto kar potrebujete. Plug-ine aktivirate in deaktivirate kadarkoli.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        {/* Leva stran — konfiguracija */}
        <div>
          {/* Osnova */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink2, #3A4A40)', marginBottom: 10 }}>
            Korak 1 — Izberite osnovo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {BASES.map(b => (
              <div key={b.id} style={cardStyle(activeBase === b.id)} onClick={() => setActiveBase(b.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0C2A1E' }}>{b.name}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: activeBase === b.id ? '#0E3D2A' : '#3A4A40' }}>
                    €{b.price}<span style={{ fontSize: 12, fontWeight: 400 }}>/mes</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#3A4A40', marginBottom: 10, lineHeight: 1.5 }}>{b.desc}</div>
                {b.includes.map(i => (
                  <div key={i} style={{ fontSize: 11, color: '#0E3D2A', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <Tick /> {i}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#3A4A40', marginTop: 8, fontStyle: 'italic' }}>{b.for}</div>
              </div>
            ))}
          </div>

          {/* Plug-ini */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink2, #3A4A40)', marginBottom: 10 }}>
            Korak 2 — Dodajte plug-ine
          </div>
          {PLUGIN_GROUPS.map(g => (
            <div key={g.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#3A4A40', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 2 }}>{g.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.plugins.map(p => {
                  const on = activePlugins.has(p.id)
                  return (
                    <div key={p.id} style={pluginStyle(on)} onClick={() => togglePlugin(p.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0C2A1E', marginBottom: 1 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#3A4A40' }}>{p.desc}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: on ? '#0E3D2A' : '#3A4A40', flexShrink: 0 }}>+€{p.price}</div>
                      <div style={{
                        width: 34, height: 18, borderRadius: 9,
                        background: on ? '#0E3D2A' : 'var(--rule, #D9D2C2)',
                        position: 'relative', flexShrink: 0, transition: 'background .2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2,
                          left: on ? 18 : 2, width: 14, height: 14,
                          borderRadius: '50%', background: '#fff',
                          transition: 'left .2s',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desna stran — summary */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ background: '#0E3D2A', borderRadius: 16, padding: 22, color: '#fff' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>Vaš paket</div>

            {/* Osnova */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'rgba(255,255,255,0.8)', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span>{base.name}</span>
              <span>€{base.price.toFixed(2)}</span>
            </div>

            {/* Plug-ini */}
            <div style={{ margin: '8px 0', minHeight: 40 }}>
              {activePlugins.size === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>Ni izbranih plug-inov</div>
              ) : (
                Array.from(activePlugins).map(id => {
                  for (const g of PLUGIN_GROUPS) {
                    const p = g.plugins.find(p => p.id === id)
                    if (p) return (
                      <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '3px 0' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#E8B547', fontSize: 11 }}>✓</span>{p.name}
                        </span>
                        <span>+€{p.price}</span>
                      </div>
                    )
                  }
                  return null
                })
              )}
            </div>

            {/* Skupaj */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Skupaj</span>
                <span>
                  <span style={{ fontSize: 30, fontWeight: 500, color: '#E8B547' }}>€{total.toFixed(2)}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>/mes</span>
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 2 }}>€{annual.toFixed(0)} letno</div>
              {saving > 0 && (
                <div style={{ fontSize: 11, background: 'rgba(29,158,117,0.2)', color: '#6EE7B7', padding: '5px 10px', borderRadius: 8, textAlign: 'center', marginTop: 10 }}>
                  vs Račun123: prihranite €{saving}/leto
                </div>
              )}
            </div>

            <Link href="/register" style={{
              display: 'block', width: '100%', marginTop: 16,
              padding: '12px', borderRadius: 8, background: '#E8B547',
              color: '#0C2A1E', fontSize: 14, fontWeight: 600,
              textAlign: 'center', textDecoration: 'none', border: 0,
            }}>
              Začni brezplačno →
            </Link>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8 }}>
              14 dni brezplačno · brez kreditne kartice
            </div>

            {/* Jamstvo */}
            <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
              {['Brez vezave — prekličete kadarkoli', 'Plug-ine aktivirate/deaktivirate kadarkoli', 'Plačate samo kar uporabljate'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
                  <Tick /> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Product mockup ---------- */
function Product() {
  return (
    <section className="section product" id="kako">
      <header className="section-head">
        <div className="kicker">Vmesnik</div>
        <h2 className="h2">Vse kar potrebujete. Na enem zaslonu.</h2>
        <p className="lede">Prihodki, roki, računi in AI računovodja. Brez iskanja po mailu, brez čakanja na odgovor.</p>
      </header>
      <DashboardMock />
    </section>
  )
}

function DashboardMock() {
  return (
    <div className="dash">
      <div className="dash-bar">
        <span className="tl"><i/><i/><i/></span>
        <span className="url">računko.si/dashboard</span>
        <span className="tl tl-r" aria-hidden="true" />
      </div>
      <div className="dash-body">
        <aside className="dash-side">
          <div className="dash-brand">računko</div>
          <div className="dash-grp">Pregled</div>
          <a className="dash-nav active"><Sq/> Dashboard</a>
          <a className="dash-nav"><Bot/> AI računovodja</a>
          <a className="dash-nav"><Bars/> Statistika</a>
          <div className="dash-grp">Poslovanje</div>
          <a className="dash-nav"><Doc/> Računi</a>
          <a className="dash-nav"><Doc/> Stroški</a>
          <div className="dash-grp">Davki</div>
          <a className="dash-nav"><Qr/> Prispevki QR</a>
          <a className="dash-nav"><Pct/> DDV obračun</a>
          <a className="dash-nav"><Norm/> Normirani</a>
          <div className="dash-side-foot">
            <span className="avatar">RS</span>
            <span>
              <strong>Računko s.p.</strong>
              <small>Normiranec · brez DDV</small>
            </span>
          </div>
        </aside>
        <main className="dash-main">
          <header className="dash-head">
            <div>
              <h3>Dober dan <span className="wave">👋</span></h3>
              <p className="dash-sub">Petek, 9. maj 2026 · maj 2026</p>
            </div>
            <div className="dash-pills">
              <span className="pill pill-warn">⏱ 1 račun v zamudi</span>
              <span className="pill pill-warn-soft">⏱ Prispevki čez 6 dni</span>
            </div>
          </header>
          <div className="dash-stats">
            {[["Prihodki maj","€2.840",""],["Odhodki","€640","ink2"],["Neplačano","€1.200","accent"],["Dobiček","€2.200","primary"]].map(([l,v,k]) => (
              <div key={l} className={"stat stat-"+k}><span>{l}</span><strong>{v}</strong></div>
            ))}
          </div>
          <div className="dash-row">
            <div className="dash-card">
              <div className="dash-card-head"><h4>Zadnji računi</h4><a>vsi →</a></div>
              <ul className="dash-list">
                <li><span className="ok"/>Agencija Pixel d.o.o.<em>€1.200</em><span className="tag tag-ok">Plačano</span></li>
                <li><span className="warn"/>Startup XY d.o.o.<em>€850</em><span className="tag tag-warn">Poslano</span></li>
                <li><span className="bad"/>Tech Solutions<em>€350</em><span className="tag tag-bad">Zamuda</span></li>
              </ul>
            </div>
            <div className="dash-card">
              <div className="dash-card-head"><h4>Roki ta mesec</h4></div>
              <ul className="dash-list dash-list-roki">
                <li>Prispevki s.p. — <em>€522</em><span className="tag tag-warn">6 dni</span></li>
                <li>Akontacija — <em>€113</em><span className="tag tag-warn">6 dni</span></li>
                <li>REK-1 + plača<span className="tag tag-soft">17 dni</span></li>
              </ul>
            </div>
          </div>
          <div className="dash-foot">
            <span className="dash-foot-label">Hitro:</span>
            <button className="chip"><Scan/> Skeniraj</button>
            <button className="chip"><Qr/> Prispevki QR</button>
            <button className="chip"><Bot/> AI</button>
            <button className="chip chip-primary"><Plus/> Nov račun</button>
          </div>
        </main>
      </div>
    </div>
  )
}

/* ---------- Comparison ---------- */
function Comparison() {
  const rows = [
    ["Splošni odgovori brez vpogleda", "Konkretni odgovori z vašimi podatki"],
    ["Odgovor čez 1–3 dni. Ob 22h — jutri.", "Takoj. 24/7. Tudi nedelje, prazniki."],
    ["Vi zbirate in pošiljate dokumente", "AI OCR — fotka stroška = vnos"],
    ["Opomnik en dan prej — pogosto prepozno", "7 dni vnaprej za vsak davčni rok"],
    ["€280–500 / mesec", "Od €9.99 / mesec"],
  ]
  return (
    <section className="section compare" id="primerjava">
      <header className="section-head">
        <div className="kicker">Poštena primerjava</div>
        <h2 className="h2">Računovodja vs. Računko</h2>
        <p className="lede">Za s.p. ki večino dela opravljajo sami.</p>
      </header>
      <div className="compare-card">
        <div className="compare-col col-left">
          <header>
            <span className="col-icon">👤</span>
            <span><strong>Računovodja</strong><small> · €200–500/mes</small></span>
          </header>
          {rows.map((r,i) => (<div key={i} className="row"><Cross/> <span>{r[0]}</span></div>))}
          <div className="row row-mute"><span className="dashm">—</span><span>Smiselno za revizije + d.o.o. nad €50k</span></div>
        </div>
        <div className="compare-col col-right">
          <header>
            <span className="col-icon"><Bot/></span>
            <span><strong>Računko</strong><small> · od €9.99/mes</small></span>
          </header>
          {rows.map((r,i) => (<div key={i} className="row row-yes"><Tick/> <span>{r[1]}</span></div>))}
          <div className="row row-mute"><span className="dashm">—</span><span>Za revizije priporočamo računovodja — <strong>Računko pokrije 95%</strong></span></div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Testimonials ---------- */
const QUOTES = [
  { save: "Prihranek €3.120/leto", text: "Plačevala sem €280/mes. Vsak mesec ista predloga, isti email. Zdaj to naredi Računko. €260 več v žepu — vsak mesec.", name: "Ana K.", role: "IT freelancer · Ljubljana", avatar: "AK" },
  { save: "0 zamujenih rokov", text: "Bala sem se, da bom brez računovodje naredila napako. Po 8 mesecih — nobene napake. Vsi roki spoštovani. FURS molči.", name: "Miha T.", role: "Grafični oblikovalec · Maribor", avatar: "MT" },
  { save: "Prihranek €4.572/leto", text: "AI mi je odgovoril v 10 sekundah na vprašanje, ki ga je računovodja pustil ob torku. Odgovor je prišel v petek. Za €380/mes.", name: "Sara P.", role: "Fizioterapevtka · Kranj", avatar: "SP" },
]

function Testimonials() {
  return (
    <section className="section quotes">
      <header className="section-head">
        <div className="kicker">Resnične izkušnje</div>
        <h2 className="h2">S.p. ki so preračunali</h2>
        <p className="lede">Ne splošne pohvale — konkretni zneski ki so jih prihranili.</p>
      </header>
      <div className="quote-grid">
        {QUOTES.map((q,i) => (
          <figure key={i} className="quote">
            <div className="quote-head">
              <span className="stars" aria-label="5 zvezdic">★ ★ ★ ★ ★</span>
              <span className="save-tag">{q.save}</span>
            </div>
            <blockquote>&ldquo;{q.text}&rdquo;</blockquote>
            <figcaption>
              <span className="avatar">{q.avatar}</span>
              <span><strong>{q.name}</strong><small>{q.role}</small></span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

/* ---------- FAQ ---------- */
const FAQS = [
  { q:"Ali Računko res nadomesti računovodja?", a:"Za 90% samostojnih podjetnikov — da. Normiranec, DDV zavezanec, par zaposlenih — Računko pokrije vse. Za d.o.o. z revizijo priporočamo Računko + računovodja za letni zaključek." },
  { q:"Kaj pa če potrebujem samo določene funkcije?", a:"Zato imamo plug-in sistem. Začnete z osnovo (€9.99/mes) in dodate samo kar rabite. Ponavljajoči računi +€3, plače +€5, spletna prodaja +€5. Plačate samo za kar dejansko uporabljate." },
  { q:"Ali moram prekiniti pogodbo z računovodjem?", a:"Ne. Preizkusite Računko mesec brezplačno, šele nato se odločite. Večina strank odpove pogodbo po prvem mesecu — ko vidijo da res deluje." },
  { q:"Deluje za DDV zavezance?", a:"Da. DDV evidenca, izračun obveznosti, opomniki za DDV-O rok — vse je vključeno v osnovi. Tudi za 22%, 9,5% in 5% stopnje." },
  { q:"Kako varni so moji finančni podatki?", a:"Strežniki v EU (Frankfurt). Supabase platforma z Row Level Security — tehnično je nemogoče da bi drug uporabnik videl vaše podatke. Šifriranje pri prenosu in v mirovanju." },
  { q:"Ali plug-ine lahko kadar koli deaktivira?", a:"Da. Plug-ine aktivirate in deaktivirate kadarkoli. Plačate samo za mesece ko so aktivni. Ni pogodbe, ni minimalne obveznosti." },
]

function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="section faq" id="faq">
      <header className="section-head">
        <div className="kicker">Pogosta vprašanja</div>
        <h2 className="h2">Odgovori brez zavijanja</h2>
      </header>
      <div className="faq-list">
        {FAQS.map((f,i) => (
          <div key={i} className={"faq-item"+(open===i?" open":"")}>
            <button className="faq-q" onClick={() => setOpen(open===i?-1:i)} aria-expanded={open===i}>
              <span>{f.q}</span>
              <span className="faq-icn" aria-hidden="true">{open===i ? "−" : "+"}</span>
            </button>
            {open===i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- Final CTA ---------- */
function FinalCTA() {
  return (
    <section className="final" id="zacni">
      <div className="final-inner">
        <div className="kicker kicker-on-dark">Zadnje vprašanje</div>
        <h2 className="final-h">Koliko ste <em>lani</em> plačali računovodji?</h2>
        <p className="final-sub">
          Seštejte mesečne račune. Potem pomislite kaj ste za to dobili.<br/>
          Računko osnova stane <strong>€120 letno</strong>. Ostalo je vaše.
        </p>
        <Link className="btn btn-on-dark btn-lg" href="/register">
          Sestavite svoj paket — brezplačno <span aria-hidden="true">→</span>
        </Link>
        <div className="final-trust">Brez vezave · Plug-ine dodajate po potrebi · Podatki v EU</div>
      </div>
    </section>
  )
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-brand">
          <span className="brand-mark"><span>r</span><span className="brand-dot">č</span></span>
          <span>Računko</span>
        </div>
        <nav className="foot-nav">
          <a href="mailto:ustanovitelj@racunko.si">Pišite ustanovitelju</a>
          <Link href="/privacy">Zasebnost</Link>
          <Link href="/terms">Pogoji</Link>
        </nav>
        <div className="foot-fine">© 2026 · Narejeno za slovenskega podjetnika</div>
      </div>
    </footer>
  )
}

/* ---------- Page ---------- */
export default function LandingPage() {
  const t = { palette: "forest", headline: "math", density: "normal", font: "instrument" } as const

  useEffect(() => {
    const root = document.documentElement
    root.dataset.palette = t.palette
    root.dataset.density = t.density
    root.dataset.font = t.font
  }, [])

  return (
    <>
      <Nav />
      <Hero headline={t.headline} />
      <MathSection />
      <ProductTour />
      <Product />
      <Comparison />
      <Testimonials />
      <PricingBuilder />
      <FAQ />
      <FinalCTA />
      <Footer />
    </>
  )
}
