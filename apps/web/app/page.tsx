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
    sub: "Računko je AI računovodja. Pozna slovensko davčno pravo, vaše dejanske podatke in roke FURS-a. Enako delo. Ena devetnajstina cene.",
  },
  honest: {
    eyebrow: "Brez posrednika",
    pre: "Vašega računovodjo zamenja ", big: "€19.99 na mesec.", mid: "",
    line2_pre: "In ", line2_big: "ne pozabi nikoli.", line2_post: "",
    sub: "AI ki govori slovensko, bere FURS in dela 24/7. Ne šepeta po telefonu, ne pošilja PDF-jev v prilogi. Naredi.",
  },
  blunt: {
    eyebrow: "Resnica o malih s.p.",
    pre: "Plačujete ", big: "€3.600 letno", mid: "",
    line2_pre: "za ", line2_big: "10 klikov.", line2_post: "",
    sub: "Vsak mesec — ista predloga, isti email, isti zneski. Računovodstvo za s.p. ni storitev. Je copy-paste. Računko ga naredi sam.",
  },
  identity: {
    eyebrow: "Za 90% slovenskih s.p.",
    pre: "Niste ", big: "premajhni", mid: " za pravo računovodstvo.",
    line2_pre: "Le predragi posrednik vam je rekel, ", line2_big: "da ste.", line2_post: "",
    sub: "Računko je AI računovodja ki pozna FURS, vaše dejanske podatke in slovensko davčno pravo. Odgovori v 3 sekundah, ne v 3 dneh. €19.99 mesečno.",
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
          <a href="#kako">Kako deluje</a>
          <a href="#primerjava">Primerjava</a>
          <a href="#cene">Cene</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-cta">
          <Link className="btn btn-ghost" href="/login">Prijava</Link>
          <Link className="btn btn-primary" href="/register">
            Začni — brezplačno <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ---------- Hero ---------- */
function Hero({ headline }: { headline: string }) {
  const h = HEADLINES[headline] || HEADLINES.identity
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
            Prvi račun v 5 minutah <span aria-hidden="true">→</span>
          </Link>
          <Link href="/login" className="btn btn-quiet btn-lg">Prijava</Link>
        </div>
        <p className="hero-proof">
          247 slovenskih s.p. že uporablja. Povprečen prihranek prvega leta: <strong>€3.144</strong>.
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
  const racunko = 240
  const saved = yearly - racunko
  return (
    <section className="section math">
      <header className="section-head">
        <div className="kicker kicker-warn">Preprosta matematika</div>
        <h2 className="h2">Koliko vas <em>dejansko</em> stane računovodja?</h2>
        <p className="lede">Premaknite drsnik na svoj mesečni račun. Računko stane €19.99 mesečno — fiksno, brez dodatkov.</p>
      </header>

      <div className="calc">
        <div className="calc-card calc-input">
          <div className="calc-label">Vaš mesečni račun</div>
          <div className="calc-value">
            <span className="cur">€</span>
            <span className="num">{rate}</span>
            <span className="unit">/mes</span>
          </div>
          <input
            className="calc-slider"
            type="range" min="80" max="600" step="10"
            value={rate}
            onChange={(e) => setRate(parseInt(e.target.value, 10))}
            aria-label="Mesečni račun računovodje"
          />
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
          <div className="calc-foot">Računko: <strong>€240/leto</strong></div>
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
            {[
              ["Prihodki maj","€2.840",""],
              ["Odhodki","€640","ink2"],
              ["Neplačano","€1.200","accent"],
              ["Dobiček","€2.200","primary"],
            ].map(([l,v,k]) => (
              <div key={l} className={"stat stat-"+k}>
                <span>{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>

          <div className="dash-row">
            <div className="dash-card">
              <div className="dash-card-head">
                <h4>Zadnji računi</h4>
                <a>vsi →</a>
              </div>
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

/* ---------- Features ---------- */
const FEATURES = [
  { tone: "violet", title: "AI ki pozna vaše podatke", body: '"Koliko dohodnine bom plačal letos?" — odgovor v 3 sekundah, izračunan iz vašega dejanskega prometa. Ne s splošnimi pravili. Z vašimi.', tag: "24/7 na voljo", icon: <Bot/> },
  { tone: "amber", title: "Prispevki QR — 30 sekund", body: "ZPIZ, ZZZS in akontacija z UPN QR kodo. Skenirate v banki, plačilo gre. Brez ročnega vnosa, brez napak v številkah.", tag: "Samo za SLO trg", icon: <Qr/> },
  { tone: "rose", title: "Opomniki 7 dni vnaprej", body: "Ne en dan prej, ko je že prepozno. 7 dni vnaprej za vsak davčni rok — DDV-O, akontacija, REK-1, prispevki. Nikoli več zamude.", tag: "Brez panike", icon: <Bell/> },
  { tone: "blue", title: "Računi z UPN QR v 30 sec", body: "PDF z UPN QR kodo. Stranka skenira z mobilno banko, plačilo pride direktno na vaš račun. Brez čakanja na potrditev.", tag: "Stripe + UPN", icon: <Doc/> },
  { tone: "mint", title: "Skeniraj strošek — AI OCR", body: "Fotografirate račun, AI prepozna znesek, datum, DDV in dobavitelja. Konec map polnih papirjev in mesečnega pošiljanja.", tag: "iOS + Android", icon: <Scan/> },
  { tone: "sage", title: "Normirani vs. dejanski", body: "Točen izračun kdaj se vam splača preiti na dejanske stroške. Z grafom in mejno vrednostjo — kar vam računovodja verjetno ni nikoli pokazal.", tag: "Unikatno za SLO", icon: <Pct/> },
]

function FeaturesSection() {
  return (
    <section className="section features" id="features">
      <header className="section-head">
        <div className="kicker">Kaj dobite</div>
        <h2 className="h2">Vse kar računovodja počne. <em>Plus tisto kar ne.</em></h2>
        <p className="lede">Računovodja ne odgovori ob 22:00 v nedeljo. Računko odgovori v 3 sekundah.</p>
      </header>
      <div className="feat-grid">
        {FEATURES.map((f,i) => (
          <article key={i} className={"feat feat-"+f.tone}>
            <div className="feat-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            <span className="feat-tag">{f.tag}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ---------- Comparison ---------- */
function Comparison() {
  const rows = [
    ["Splošni odgovori brez vpogleda", "Konkretni odgovori z vašimi podatki"],
    ["Odgovor čez 1–3 dni. Ob 22h — jutri.", "Takoj. 24/7. Tudi nedelje, prazniki."],
    ["Vi zbirate in pošiljate dokumente", "AI OCR — fotka stroška = vnos"],
    ["Opomnik en dan prej — pogosto prepozno", "7 dni vnaprej za vsak davčni rok"],
    ["€280–500 / mesec", "€19.99 / mesec"],
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
          {rows.map((r,i) => (
            <div key={i} className="row">
              <Cross/> <span>{r[0]}</span>
            </div>
          ))}
          <div className="row row-mute">
            <span className="dashm">—</span>
            <span>Smiselno za revizije + d.o.o. nad €50k</span>
          </div>
        </div>
        <div className="compare-col col-right">
          <header>
            <span className="col-icon"><Bot/></span>
            <span><strong>Računko</strong><small> · €19.99/mes</small></span>
          </header>
          {rows.map((r,i) => (
            <div key={i} className="row row-yes">
              <Tick/> <span>{r[1]}</span>
            </div>
          ))}
          <div className="row row-mute">
            <span className="dashm">—</span>
            <span>Za revizije priporočamo računovodja — <strong>Računko pokrije 95%</strong></span>
          </div>
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
              <span>
                <strong>{q.name}</strong>
                <small>{q.role}</small>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

/* ---------- Pricing ---------- */
function Pricing() {
  return (
    <section className="section pricing" id="cene">
      <header className="section-head">
        <div className="kicker">Cene</div>
        <h2 className="h2">Fiksno. Brez presenečenj.</h2>
        <p className="lede">Brez &ldquo;minimuma ur&rdquo;, brez &ldquo;letnega obračuna posebej&rdquo;. Eno število.</p>
      </header>

      <div className="plans">
        <article className="plan">
          <div className="plan-name">Starter</div>
          <div className="plan-price"><span className="cur">€</span><span className="num">0</span><span className="per">/mes</span></div>
          <span className="plan-tag plan-tag-soft">Brez kreditne kartice</span>
          <ul className="plan-list">
            <li><Tick/> 5 računov mesečno</li>
            <li><Tick/> AI računovodja — 10 vprašanj</li>
            <li><Tick/> Prispevki QR</li>
            <li><Tick/> Davčni rokovnik</li>
          </ul>
          <Link className="btn btn-quiet btn-block" href="/register">Začni brezplačno</Link>
        </article>

        <article className="plan plan-hero">
          <div className="plan-flag">Zamenja računovodjo</div>
          <div className="plan-name">Pro</div>
          <div className="plan-price">
            <span className="cur">€</span><span className="num">19.99</span><span className="per">/mes</span>
          </div>
          <span className="plan-tag plan-tag-amber">Prihranek do €5.000/leto</span>
          <ul className="plan-list">
            <li><Tick/> Neomejeni računi</li>
            <li><Tick/> AI brez omejitev · 24/7</li>
            <li><Tick/> OCR skeniranje stroškov</li>
            <li><Tick/> Obračun plač + regres</li>
            <li><Tick/> DDV evidenca</li>
            <li><Tick/> Stripe integracija</li>
          </ul>
          <Link className="btn btn-primary btn-block" href="/register?plan=pro">Začni Pro — €19.99/mes →</Link>
        </article>
      </div>
    </section>
  )
}

/* ---------- FAQ ---------- */
const FAQS = [
  { q:"Ali Računko res nadomesti računovodjo?", a:"Za 90% samostojnih podjetnikov — da. Normiranec, DDV zavezanec, par zaposlenih — Računko pokrije vse. Za d.o.o. z revizijo priporočamo Računko + računovodja za letni zaključek." },
  { q:"Kaj če naredim napako?", a:"Računko vas opomni 7 dni pred rokom. AI vas opozori na nepravilnosti pri vnosu. Mesečni vodič vas korak za korakom pelje skozi vse obveznosti za vaš profil." },
  { q:"Ali moram prekiniti pogodbo z računovodjem?", a:"Ne. Preizkusite Računko mesec brezplačno, šele nato se odločite. Večina strank odpove pogodbo po prvem mesecu — ko vidijo da res deluje." },
  { q:"Deluje za DDV zavezance?", a:"Da. DDV evidenca, izračun obveznosti, opomniki za DDV-O rok — vse je vključeno v Pro planu. Tudi za 22%, 9,5% in 5% stopnje." },
  { q:"Kako varni so moji finančni podatki?", a:"Strežniki v EU (Frankfurt). Supabase platforma z Row Level Security — tehnično je nemogoče da bi drug uporabnik videl vaše podatke. Šifriranje pri prenosu in v mirovanju." },
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
          Seštejte mesečne račune. Potem pomislite kaj ste za to dobili.
          <br/>
          Računko stane <strong>€240 letno</strong>. Ostalo je vaše.
        </p>
        <Link className="btn btn-on-dark btn-lg" href="/register">
          Preizkusi brezplačno — brez kreditne kartice <span aria-hidden="true">→</span>
        </Link>
        <div className="final-trust">Brez vezave · Prekličete kadarkoli · Podatki v EU</div>
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
  const t = {
    palette: "forest",
    headline: "identity",
    density: "normal",
    font: "instrument",
  } as const

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
      <Product />
      <FeaturesSection />
      <Comparison />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </>
  )
}