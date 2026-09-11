"use client"

/**
 * PREKLIKLJIVO OKNO (prelet 261)
 * ══════════════════════════════
 *
 * POPRAVLJENO: prelet 260 je zavrgel skrbno oblikovano okno in ga nadomestil
 * s sivimi skatlami. Napaka je bila, da sem pisal LASTNE sloge namesto da bi
 * uporabil tiste, ki jih stran ze ima.
 *
 * BESEDISCE, prevzeto iz izvirnika:
 *   okvir        #0B1A10, polmer 16, mocna senca
 *   naslovna     #091410, visina 38, naslov v JetBrains Mono
 *   stranski pas #091410, sirina 56, ikone 36x36 s polmerom 9
 *   vsebina      #F4EFE6
 *   kartica      bela, rob #D9D2C2, polmer 9
 *   oznaka       0.62rem, razmik crk 0.07em, velike crke, #3A4A40
 *   naslov       Instrument Serif, #0C2A1E
 *   poudarek     #0E3D2A (zelena), #C9921B (zlata)
 *
 * Velikosti so v `rem` in majhne (0.62-1.2), ker okno posnema zaslon v
 * pomanjsavi - pri pikah je bilo vse preveliko in je izgledalo kot skica.
 */

import { useState } from 'react'

type Zaslon = 'plosca' | 'blagajna' | 'racuni' | 'zaloga' | 'ai'

const ZASLONI: { id: Zaslon; ime: string; pot: string }[] = [
  { id:'plosca',   ime:'Nadzorna plošča', pot:'/dashboard' },
  { id:'blagajna', ime:'Blagajna',        pot:'/pos' },
  { id:'racuni',   ime:'Računi',          pot:'/invoices' },
  { id:'zaloga',   ime:'Zaloga',          pot:'/zaloge' },
  { id:'ai',       ime:'AI računovodja',  pot:'/ai' },
]

/* Slogi, prevzeti iz izvirnega okna. */
const OZNAKA = { fontSize:'0.62rem', letterSpacing:'0.07em', textTransform:'uppercase' as const, color:'#3A4A40' }
const KARTICA = { background:'white', border:'1px solid #D9D2C2', borderRadius:9, padding:'10px 11px' }
const SERIF = { fontFamily:"'Instrument Serif',serif", color:'#0C2A1E', letterSpacing:'-0.01em' }

export default function DemoOkno() {
  const [zaslon, setZaslon] = useState<Zaslon>('plosca')
  const trenutni = ZASLONI.find(z => z.id === zaslon)!

  return (
    <div style={{ marginTop:40 }}>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginBottom:16 }}>
        {ZASLONI.map(z => (
          <button key={z.id} onClick={() => setZaslon(z.id)}
            style={{
              padding:'7px 14px', borderRadius:8, cursor:'pointer', fontFamily:'inherit',
              fontSize:'0.8rem', fontWeight:600, transition:'all .15s',
              border:'1px solid ' + (zaslon === z.id ? '#0E3D2A' : '#D9D2C2'),
              background: zaslon === z.id ? '#0E3D2A' : 'white',
              color: zaslon === z.id ? '#F4EFE6' : '#3A4A40',
            }}>{z.ime}</button>
        ))}
      </div>

      <div style={{ borderRadius:16, overflow:'hidden', background:'#0B1A10',
                    boxShadow:'0 40px 80px -30px rgba(14,61,42,0.45)' }}>
        <div style={{ height:38, background:'#091410', display:'flex', alignItems:'center',
                      padding:'0 14px', position:'relative' }}>
          <div style={{ display:'inline-flex', gap:6 }}>
            {[0,1,2].map(i => (
              <i key={i} style={{ width:11, height:11, borderRadius:'50%',
                                  background:'rgba(255,255,255,0.16)' }}/>
            ))}
          </div>
          <div style={{ position:'absolute', left:'50%', transform:'translateX(-50%)',
                        fontFamily:"'JetBrains Mono',monospace", fontSize:'0.7rem',
                        color:'rgba(244,239,230,0.5)' }}>
            računko.si{trenutni.pot}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'56px 1fr' }}>
          <div style={{ background:'#091410', display:'flex', flexDirection:'column',
                        alignItems:'center', padding:'14px 0 12px', gap:3 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:'#0E3D2A',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          color:'#F4EFE6', fontSize:'0.8rem', marginBottom:10 }}>R</div>
            {ZASLONI.map(z => (
              <button key={z.id} onClick={() => setZaslon(z.id)} title={z.ime}
                style={{ width:36, height:36, borderRadius:9, border:'none', cursor:'pointer',
                         display:'flex', alignItems:'center', justifyContent:'center',
                         background: zaslon === z.id ? 'rgba(244,239,230,0.12)' : 'transparent' }}>
                <Ikona id={z.id} aktivna={zaslon === z.id} />
              </button>
            ))}
            <div style={{ marginTop:'auto' }}>
              <div style={{ width:30, height:30, background:'#C9921B', borderRadius:'50%',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'#0C2A1E', fontSize:'0.7rem', fontWeight:700 }}>AK</div>
            </div>
          </div>

          <div style={{ background:'#F4EFE6', display:'flex', flexDirection:'column', minHeight:392 }}>
            <div style={{ padding:'13px 18px 11px', borderBottom:'1px solid rgba(0,0,0,0.07)',
                          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ ...OZNAKA, marginBottom:3 }}>ČETRTEK · 11. SEPTEMBER 2026</div>
                <div style={{ ...SERIF, fontSize:'1.2rem', lineHeight:1.1 }}>
                  {zaslon === 'plosca' ? 'Dober dan, Ana 👋' : trenutni.ime}
                </div>
              </div>
              <div style={{ width:30, height:30, background:'#0E3D2A', color:'#F4EFE6',
                            borderRadius:'50%', display:'flex', alignItems:'center',
                            justifyContent:'center', fontSize:'0.68rem', fontWeight:700 }}>AK</div>
            </div>

            <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:9 }}>
              {zaslon === 'plosca'   && <Plosca />}
              {zaslon === 'blagajna' && <Blagajna />}
              {zaslon === 'racuni'   && <Racuni />}
              {zaslon === 'zaloga'   && <Zaloga />}
              {zaslon === 'ai'       && <Ai />}
            </div>
          </div>
        </div>
      </div>

      <p style={{ textAlign:'center', fontSize:'0.85rem', color:'#3A4A40', marginTop:14 }}>
        Kliknite po zavihkih ·{' '}
        <a href="/demo" style={{ color:'#0E3D2A', fontWeight:600 }}>odprite pravo predstavitev →</a>
      </p>
    </div>
  )
}

function Ikona({ id, aktivna }: { id: Zaslon; aktivna: boolean }) {
  const b = aktivna ? '#F4EFE6' : 'rgba(244,239,230,0.35)'
  const s = { stroke:b, strokeWidth:1.4, fill:'none' as const }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      {id === 'plosca'   && <path d="M2 7L8 2L14 7V13.5C14 14.05 13.55 14.5 13 14.5H10.5V10H5.5V14.5H3C2.45 14.5 2 14.05 2 13.5V7Z" {...s} strokeLinejoin="round"/>}
      {id === 'blagajna' && <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...s}/><path d="M1.5 6.5H14.5" {...s}/></>}
      {id === 'racuni'   && <><path d="M3.5 1.5H12.5V14.5L10.5 13L8 14.5L5.5 13L3.5 14.5V1.5Z" {...s} strokeLinejoin="round"/><path d="M6 5.5H10M6 8.5H10" {...s}/></>}
      {id === 'zaloga'   && <><path d="M2 4.5L8 1.5L14 4.5V11.5L8 14.5L2 11.5V4.5Z" {...s} strokeLinejoin="round"/><path d="M2 4.5L8 7.5L14 4.5M8 7.5V14.5" {...s}/></>}
      {id === 'ai'       && <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" {...s} strokeLinejoin="round"/>}
    </svg>
  )
}

/* ── zasloni ─────────────────────────────────────────────────────── */

function Plosca() {
  return (
    <>
      <div>
        <div style={{ ...OZNAKA, marginBottom:7 }}>BLIŽNJICE</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7 }}>
          {['Nov račun','Dodaj strošek','Prispevki QR','Skeniraj račun'].map(l => (
            <div key={l} style={{ ...KARTICA, padding:'10px 8px', textAlign:'center' }}>
              <span style={{ fontSize:'0.72rem', color:'#0C2A1E' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:'#0E3D2A', borderRadius:11, padding:'14px 16px', color:'#F4EFE6' }}>
        <div style={{ ...OZNAKA, color:'rgba(244,239,230,0.55)' }}>PROMET · ZADNJIH 14 DNI</div>
        <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:'2rem', lineHeight:1.05, margin:'3px 0 2px' }}>
          €831<span style={{ fontSize:'0.55em', opacity:0.85 }}>,90</span>
        </div>
        <div style={{ fontSize:'0.72rem', color:'rgba(244,239,230,0.6)' }}>
          155 računov · povprečno €5,37 · projekcija <strong style={{ color:'#C9921B' }}>€1.780</strong>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
        {[['PROMET DANES','€62,00','16 računov'],['ODPRTE MIZE','3','T2 · T4 · N1'],['POD MINIMUMOM','2','Pivo, Toast kruh']].map(([a,b,c]) => (
          <div key={a} style={KARTICA}>
            <div style={OZNAKA}>{a}</div>
            <div style={{ ...SERIF, fontSize:'1.25rem', margin:'4px 0 1px' }}>{b}</div>
            <div style={{ fontSize:'0.68rem', color:'#3A4A40' }}>{c}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function Blagajna() {
  const artikli = [['Espresso','1,60'],['Kava z mlekom','1,90'],['Cappuccino','2,20'],['Čaj','1,80'],
                   ['Voda 0,25','1,50'],['Radenska','2,20'],['Pivo 0,5','3,50'],['Toast','4,50']]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 150px', gap:9 }}>
      <div>
        <div style={{ display:'flex', gap:5, marginBottom:8 }}>
          {['Kava','Pijača','Hrana'].map((k,i) => (
            <span key={k} style={{ padding:'4px 10px', borderRadius:7, fontSize:'0.7rem', fontWeight:600,
              background: i===0 ? '#0E3D2A' : 'white', color: i===0 ? '#F4EFE6' : '#3A4A40',
              border:'1px solid ' + (i===0 ? '#0E3D2A' : '#D9D2C2') }}>{k}</span>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
          {artikli.map(([n,c]) => (
            <div key={n} style={{ ...KARTICA, padding:'9px 6px', textAlign:'center' }}>
              <div style={{ fontSize:'0.68rem', color:'#0C2A1E', lineHeight:1.25 }}>{n}</div>
              <div style={{ fontSize:'0.72rem', color:'#0E3D2A', fontWeight:700, marginTop:3 }}>€{c}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...KARTICA, display:'flex', flexDirection:'column' }}>
        <div style={{ ...OZNAKA, marginBottom:8 }}>MIZA T2</div>
        {[['2× Espresso','3,20'],['1× Toast','4,50']].map(([n,c]) => (
          <div key={n} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', marginBottom:5, color:'#0C2A1E' }}>
            <span>{n}</span><span style={{ fontWeight:600 }}>€{c}</span>
          </div>
        ))}
        <div style={{ borderTop:'1px solid #D9D2C2', marginTop:'auto', paddingTop:8,
                      display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <span style={OZNAKA}>SKUPAJ</span>
          <span style={{ ...SERIF, fontSize:'1.1rem' }}>€7,70</span>
        </div>
        <div style={{ marginTop:8, padding:'7px 0', borderRadius:7, background:'#0E3D2A',
                      color:'#F4EFE6', textAlign:'center', fontSize:'0.72rem', fontWeight:700 }}>Plačilo</div>
      </div>
    </div>
  )
}

function Racuni() {
  const vrstice = [['2026-026','Klub študentov','224,98','PLAČAN'],
                   ['2026-025','Gostilna Pri Lipi','479,98','POSLAN'],
                   ['2026-024','Fitnes Center d.o.o.','150,00','PLAČAN'],
                   ['2026-023','Športno društvo','720,00','POSLAN']]
  return (
    <>
      <div style={{ ...KARTICA, padding:0, overflow:'hidden' }}>
        {vrstice.map(([st,kupec,znesek,stanje], i) => (
          <div key={st} style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 12px',
                                 borderTop: i ? '1px solid #EDE7DA' : 'none', fontSize:'0.72rem' }}>
            <span style={{ color:'#3A4A40', minWidth:62, fontFamily:"'JetBrains Mono',monospace", fontSize:'0.66rem' }}>{st}</span>
            <span style={{ flex:1, color:'#0C2A1E', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{kupec}</span>
            <span style={{ fontWeight:700, color:'#0C2A1E' }}>€{znesek}</span>
            <span style={{ fontSize:'0.6rem', fontWeight:700, padding:'2px 7px', borderRadius:20, letterSpacing:'0.04em',
              background: stanje==='PLAČAN' ? '#D7E4D4' : '#F4D9CE',
              color: stanje==='PLAČAN' ? '#1F4732' : '#C9442B' }}>{stanje}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'0.68rem', color:'#3A4A40' }}>
        Davčno potrjeno pri FURS · e-račun e-SLOG na voljo
      </div>
    </>
  )
}

function Zaloga() {
  const vrstice = [['Kava v zrnju','7,4 kg','2,0 kg',true],['Mleko','36 L','10 L',true],
                   ['Pivo 0,5','18 kos','24 kos',false],['Toast kruh','4 kos','10 kos',false]]
  return (
    <>
      <div style={{ ...KARTICA, padding:0, overflow:'hidden' }}>
        {vrstice.map(([n,stanje,min,ok], i) => (
          <div key={n as string} style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 12px',
                                 borderTop: i ? '1px solid #EDE7DA' : 'none', fontSize:'0.72rem' }}>
            <span style={{ flex:1, color:'#0C2A1E', minWidth:0 }}>{n}</span>
            <span style={{ color:'#3A4A40' }}>{stanje}</span>
            <span style={{ color:'#8A8A80', fontSize:'0.66rem' }}>min {min}</span>
            <span style={{ fontSize:'0.6rem', fontWeight:700, padding:'2px 7px', borderRadius:20, letterSpacing:'0.04em',
              background: ok ? '#D7E4D4' : '#F4D9CE', color: ok ? '#1F4732' : '#C9442B' }}>
              {ok ? 'V REDU' : 'POD MIN.'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'0.68rem', color:'#3A4A40' }}>
        Prodaja odpiše sestavine po normativu — kava z mlekom vzame 4 g kave in 1 dl mleka.
      </div>
    </>
  )
}

function Ai() {
  return (
    <>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <div style={{ background:'#0E3D2A', color:'#F4EFE6', padding:'8px 12px',
                      borderRadius:'11px 11px 3px 11px', fontSize:'0.72rem', maxWidth:'80%' }}>
          Koliko sem zaslužil ta mesec in ali prispevki pokriti?
        </div>
      </div>
      <div style={{ ...KARTICA, display:'flex', gap:8 }}>
        <div style={{ width:22, height:22, borderRadius:'50%', background:'#C9921B', color:'#0C2A1E',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'0.66rem', flexShrink:0, fontWeight:700 }}>✳</div>
        <div style={{ fontSize:'0.72rem', lineHeight:1.6, color:'#0C2A1E' }}>
          Septembra ste ustvarili <strong>831,90 €</strong> prometa iz 155 računov.
          Po normiranih odhodkih je davčna osnova <strong>166,38 €</strong>,
          akontacija dohodnine <strong>33,28 €</strong>.
          <br /><br />
          Prispevki znašajo <strong>486,00 €</strong> in zapadejo 20. oktobra.
          Promet jih pri tem obsegu <strong style={{ color:'#C9442B' }}>ne pokrije</strong> —
          razliko boste krili iz prihrankov.
        </div>
      </div>
      <div style={{ fontSize:'0.68rem', color:'#3A4A40' }}>
        Odgovarja iz vaših številk, ne na splošno.
      </div>
    </>
  )
}
