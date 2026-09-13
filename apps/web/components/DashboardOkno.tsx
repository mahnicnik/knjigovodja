/**
 * OKNO NADZORNE PLOSCE NA ZACETNI STRANI (prelet 266)
 * ═══════════════════════════════════════════════════
 *
 * Narisano PO POSNETKIH pravega vmesnika z dne 13. 9. 2026, ne po spominu:
 * stranski meni z besedilom, pozdrav, iskanje, "Fokus tedna", bliznjice,
 * kartica cistega prihodka z grafom, tri kartice, pretok denarja in AI
 * predlog. Barve, pisave in razmiki so prevzeti iz posnetkov.
 *
 * Podatki so IZMISLJENI (kavarna "Lipa") in NE ustrezajo nobenemu resnicnemu podjetju - zneski, ki bi jih
 * imel resnicen mali lokal.
 *
 * Staticno: nic se ne shranjuje, nic ni mogoce vnesti. To je slika, ki
 * izgleda kot aplikacija, ker je narisana po njej.
 */

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const OZN = { fontFamily:MONO, fontSize:'0.6rem', letterSpacing:'0.14em', textTransform:'uppercase' as const }
const KART = { background:'#fff', border:'1px solid #E7E1D4', borderRadius:14 }

export default function DashboardOkno() {
  return (
    <div style={{ marginTop:40, borderRadius:16, overflow:'hidden', background:'#0B1A10',
                  boxShadow:'0 40px 80px -30px rgba(14,61,42,0.45)' }}>
      {/* naslovna vrstica brskalnika */}
      <div style={{ height:38, background:'#091410', display:'flex', alignItems:'center',
                    padding:'0 14px', position:'relative' }}>
        <div style={{ display:'inline-flex', gap:6 }}>
          {[0,1,2].map(i => <i key={i} style={{ width:11, height:11, borderRadius:'50%', background:'rgba(255,255,255,0.16)' }}/>)}
        </div>
        <div style={{ position:'absolute', left:'50%', transform:'translateX(-50%)', fontFamily:MONO,
                      fontSize:'0.7rem', color:'rgba(244,239,230,0.5)' }}>računko.si/dashboard</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'176px 1fr', height:640, background:'#F4EFE6',
                    fontFamily:"'Inter', system-ui, sans-serif", color:'#0C2A1E' }}>
        {/* ── stranski meni ── */}
        <aside style={{ background:'#102C20', color:'#F4EFE6', padding:'18px 14px', display:'flex',
                        flexDirection:'column', gap:14, fontSize:'0.72rem' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Računko.si</div>
            <div style={{ ...OZN, color:'rgba(244,239,230,0.45)', marginTop:2 }}>AI računovodja</div>
          </div>
          <div style={{ border:'1px solid rgba(244,239,230,0.14)', borderRadius:8, padding:'6px 9px',
                        color:'rgba(244,239,230,0.7)', fontSize:'0.66rem' }}>⚙ Prilagodi meni</div>

          <div>
            <div style={{ ...OZN, color:'rgba(244,239,230,0.4)', marginBottom:6 }}>Hitre akcije</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {['Nov račun','Nov strošek','Skeniraj','KPO knjiga'].map(t => (
                <span key={t} style={{ background:'rgba(244,239,230,0.08)', border:'1px solid rgba(244,239,230,0.12)',
                                       borderRadius:6, padding:'4px 7px', fontSize:'0.62rem' }}>{t}</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ ...OZN, color:'rgba(244,239,230,0.4)', marginBottom:4 }}>Pregled</div>
            {[['Dashboard',true],['Statistika',false],['Opomniki',false],['AI računovodja',false]].map(([t,a]) => (
              <div key={t as string} style={{ padding:'6px 8px', borderRadius:7, marginBottom:2,
                                     background: a ? 'rgba(244,239,230,0.1)' : 'transparent',
                                     color: a ? '#fff' : 'rgba(244,239,230,0.7)', fontWeight: a ? 600 : 400 }}>{t}</div>
            ))}
          </div>
          <div>
            <div style={{ ...OZN, color:'rgba(244,239,230,0.4)', marginBottom:4 }}>Poslovanje</div>
            {['Nov račun','Računi','Predračuni','Ponavljajoči računi','Dobavnice','Stroški'].map(t => (
              <div key={t} style={{ padding:'5px 8px', color:'rgba(244,239,230,0.7)' }}>{t}</div>
            ))}
          </div>
          <div style={{ marginTop:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:'#1F6B38', display:'flex',
                          alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:700 }}>KL</div>
            <div style={{ lineHeight:1.2 }}>
              <div style={{ fontWeight:600, fontSize:'0.68rem' }}>Kavarna Lipa, s.p.</div>
              <div style={{ fontSize:'0.58rem', color:'rgba(244,239,230,0.5)' }}>DDV zavezanec</div>
            </div>
          </div>
        </aside>

        {/* ── vsebina ── */}
        <main style={{ padding:'20px 24px 0', overflow:'hidden', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ ...OZN, color:'#5A6B60' }}>Nedelja · 13. september 2026</div>
              <div style={{ fontSize:'1.55rem', fontWeight:700, marginTop:3, letterSpacing:'-0.02em' }}>
                Dober dan, <span style={{ color:'#1F6B38' }}>Ana</span> 👋
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4 }}>
              <div style={{ ...KART, borderRadius:999, padding:'7px 12px', fontSize:'0.68rem', color:'#8A8A80',
                            display:'flex', alignItems:'center', gap:8, minWidth:200 }}>
                <span>⌕</span><span>Iskanje računov, strank…</span>
                <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:'0.58rem', background:'#F0EBDF',
                               padding:'2px 5px', borderRadius:4 }}>⌘K</span>
              </div>
              <div style={{ ...KART, borderRadius:'50%', width:30, height:30, display:'flex', alignItems:'center',
                            justifyContent:'center', position:'relative', fontSize:'0.8rem' }}>
                🔔<span style={{ position:'absolute', top:-4, right:-4, background:'#C9442B', color:'#fff',
                                  fontSize:'0.52rem', fontWeight:700, borderRadius:999, padding:'1px 5px' }}>2</span>
              </div>
            </div>
          </div>

          {/* fokus tedna */}
          <div style={{ marginTop:16, background:'linear-gradient(90deg,#0E3D2A,#123B2A 70%,#1C4F38)', borderRadius:14,
                        padding:'14px 18px', color:'#F4EFE6', display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:'1.4rem' }}>⏰</span>
            <div style={{ flex:1 }}>
              <div style={{ ...OZN, color:'#E8B74A' }}>Fokus tedna · 13.–20. sep</div>
              <div style={{ fontSize:'0.9rem', fontWeight:600, marginTop:3 }}>
                Prispevki za s.p. (<span style={{ color:'#E8B74A' }}>€612,30</span>) zapadejo{' '}
                <span style={{ color:'#E8B74A' }}>čez 7 dni</span>. Vse je pripravljeno za UPN nakazilo.
              </div>
            </div>
            <div style={{ background:'#E8B74A', color:'#0C2A1E', fontWeight:700, fontSize:'0.72rem',
                          padding:'9px 14px', borderRadius:999, whiteSpace:'nowrap' }}>Plačaj zdaj →</div>
          </div>

          {/* bliznjice */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16, marginBottom:8 }}>
            <div style={{ ...OZN, color:'#5A6B60' }}>Bližnjice</div>
            <div style={{ ...OZN, color:'#5A6B60' }}>✎ Uredi</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            {['Nov račun','Dodaj strošek','Skeniraj račun','Prispevki QR','KPO knjiga'].map(t => (
              <div key={t} style={{ ...KART, padding:'12px 6px', textAlign:'center' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:'#DCEBDF', margin:'0 auto 7px',
                              display:'flex', alignItems:'center', justifyContent:'center', color:'#1F6B38', fontSize:'0.8rem' }}>▢</div>
                <div style={{ fontSize:'0.64rem', fontWeight:600 }}>{t}</div>
              </div>
            ))}
            <div style={{ border:'1px dashed #CFC8B8', borderRadius:14, padding:'12px 6px', textAlign:'center',
                          color:'#8A8A80', fontSize:'0.64rem' }}>
              <div style={{ fontSize:'1.1rem', marginBottom:6 }}>+</div>Dodaj
            </div>
          </div>

          {/* cisti prihodek */}
          <div style={{ marginTop:12, background:'#0B1F15', borderRadius:16, padding:'18px 22px', color:'#F4EFE6',
                        display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
            <div>
              <div style={{ ...OZN, color:'rgba(244,239,230,0.55)' }}>Čisti prihodek · september 2026 · normirani 80%</div>
              <div style={{ fontSize:'3.2rem', fontWeight:800, letterSpacing:'-0.04em', lineHeight:1, margin:'8px 0 6px' }}>
                €3412<sup style={{ fontSize:'0.4em', fontWeight:400, color:'rgba(244,239,230,0.55)', marginLeft:2 }}>,80</sup>
              </div>
              <div style={{ fontFamily:"'Instrument Serif',serif", fontStyle:'italic', fontSize:'0.85rem',
                            color:'rgba(244,239,230,0.75)' }}>
                Po prispevkih in davkih (22%) · projekcija do konca meseca <b style={{ fontStyle:'normal', color:'#fff' }}>€6150</b>
              </div>
            </div>
            <svg width="220" height="70" viewBox="0 0 220 70" style={{ flexShrink:0 }}>
              <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E8B74A" stopOpacity="0.35"/><stop offset="100%" stopColor="#E8B74A" stopOpacity="0"/>
              </linearGradient></defs>
              <path d="M0 60 L30 56 L60 50 L90 52 L120 42 L150 38 L180 30 L220 12 L220 70 L0 70Z" fill="url(#dg)"/>
              <path d="M0 60 L30 56 L60 50 L90 52 L120 42 L150 38 L180 30 L220 12" fill="none" stroke="#E8B74A" strokeWidth="2"/>
            </svg>
          </div>

          {/* tri kartice */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:10 }}>
            {[
              ['Prihodki sep','€4280','Brez DDV', false],
              ['Odhodki sep','€1865','Brez DDV', false],
              ['Stranke vam dolgujejo','€920','Od tega €310 v zamudi', true],
            ].map(([n,v,p,dark]) => (
              <div key={n as string} style={{ ...KART, padding:'14px 16px',
                    background: dark ? '#1F4732' : '#fff', color: dark ? '#F4EFE6' : '#0C2A1E',
                    border: dark ? 'none' : KART.border }}>
                <div style={{ ...OZN, color: dark ? 'rgba(244,239,230,0.6)' : '#5A6B60', display:'flex', justifyContent:'space-between' }}>
                  <span>{n}</span><span>→</span>
                </div>
                <div style={{ fontSize:'1.7rem', fontWeight:800, letterSpacing:'-0.03em', margin:'8px 0 6px' }}>{v}</div>
                <div style={{ fontSize:'0.66rem', color: dark ? 'rgba(244,239,230,0.75)' : '#5A6B60' }}>
                  {dark ? <>Od tega <b style={{ color:'#E8B74A' }}>€310 v zamudi</b> (2 računa)</> : p}
                </div>
              </div>
            ))}
          </div>

          {/* prelivanje v belo, da nakaze, da se nadaljuje */}
          <div style={{ position:'absolute', left:0, right:0, bottom:0, height:60,
                        background:'linear-gradient(to bottom, rgba(244,239,230,0), #F4EFE6)' }}/>
        </main>
      </div>
    </div>
  )
}
