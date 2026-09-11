"use client"

/**
 * PREKLIKLJIVO OKNO NA ZACETNI STRANI (prelet 260)
 * ════════════════════════════════════════════════
 *
 * ZAKAJ: obiskovalec je doslej videl NEGIBNO sliko nadzorne plosce. Slika
 * pove, kako izgleda; ne pove, kako se uporablja. Kdor klikne, si zapomni
 * bistveno vec od tistega, ki gleda.
 *
 * ZAKAJ POSNEMANO IN NE PRAVA APLIKACIJA: prava je na /demo, kamor vodi gumb
 * zgoraj. Tu gre za nekaj drugega - obiskovalec naj dobi obcutek BREZ
 * odhoda s strani. Vsak odhod je mesto, kjer ga izgubimo.
 *
 * KAJ MORA BITI RESNICNO: stevilke, imena zaslonov in razporeditev. Kdor
 * nato odpre pravo aplikacijo, ne sme biti presenecen. Zato so podatki enaki
 * kot v predstavitvenem podjetju "Kavarna Lipa".
 *
 * KAJ NI: vnosna polja in shranjevanje. Klik preklopi zaslon, nic drugega -
 * posnetek, ki pretvarja, da dela, razocara bolj kot slika.
 */

import { useState } from 'react'

type Zaslon = 'plosca' | 'blagajna' | 'racuni' | 'zaloga' | 'ai'

const ZASLONI: { id: Zaslon; ime: string; ikona: string }[] = [
  { id:'plosca',   ime:'Nadzorna plošča', ikona:'⌂' },
  { id:'blagajna', ime:'Blagajna',        ikona:'▦' },
  { id:'racuni',   ime:'Računi',          ikona:'▤' },
  { id:'zaloga',   ime:'Zaloga',          ikona:'▣' },
  { id:'ai',       ime:'AI računovodja',  ikona:'✳' },
]

export default function DemoOkno() {
  const [zaslon, setZaslon] = useState<Zaslon>('plosca')

  return (
    <div>
      {/* Zavihki nad oknom — vidnejsi od ikon ob strani, ker mora biti na
          prvi pogled jasno, da se DA klikniti. */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginBottom:18 }}>
        {ZASLONI.map(z => (
          <button key={z.id} onClick={() => setZaslon(z.id)}
            style={{
              padding:'8px 15px', borderRadius:9, cursor:'pointer', fontFamily:'inherit',
              fontSize:13, fontWeight:600,
              border:'1px solid ' + (zaslon === z.id ? '#0E3D2A' : '#D9D2C2'),
              background: zaslon === z.id ? '#0E3D2A' : '#fff',
              color: zaslon === z.id ? '#F7F6F2' : '#55554E',
              transition:'all .15s',
            }}>{z.ime}</button>
        ))}
      </div>

      <div style={okvir}>
        <div style={naslovnaVrstica}>
          <span style={{ display:'flex', gap:6 }}>
            {['#FF5F57','#FEBC2E','#28C840'].map(b => (
              <span key={b} style={{ width:11, height:11, borderRadius:'50%', background:b, opacity:.85 }}/>
            ))}
          </span>
          <span style={naslov}>računko.si{zaslon === 'plosca' ? '/dashboard' : '/' + zaslon}</span>
        </div>

        <div style={{ display:'flex', minHeight:430 }}>
          <div style={stranskiPas}>
            {ZASLONI.map(z => (
              <button key={z.id} onClick={() => setZaslon(z.id)} title={z.ime}
                style={{
                  width:34, height:34, borderRadius:9, border:'none', cursor:'pointer',
                  fontSize:15, fontFamily:'inherit',
                  background: zaslon === z.id ? 'rgba(255,255,255,0.16)' : 'transparent',
                  color: zaslon === z.id ? '#fff' : 'rgba(255,255,255,0.45)',
                }}>{z.ikona}</button>
            ))}
          </div>

          <div style={{ flex:1, padding:'22px 24px', background:'#FBF9F4', minWidth:0 }}>
            {zaslon === 'plosca'   && <Plosca />}
            {zaslon === 'blagajna' && <Blagajna />}
            {zaslon === 'racuni'   && <Racuni />}
            {zaslon === 'zaloga'   && <Zaloga />}
            {zaslon === 'ai'       && <Ai />}
          </div>
        </div>
      </div>

      <p style={{ textAlign:'center', fontSize:13, color:'#6B6B63', marginTop:14 }}>
        Kliknite po zavihkih. Za pravo aplikacijo s podatki{' '}
        <a href="/demo" style={{ color:'#1F4732', fontWeight:600 }}>odprite predstavitev →</a>
      </p>
    </div>
  )
}

/* ── zasloni ─────────────────────────────────────────────────────── */

function Plosca() {
  return (
    <>
      <div style={{ fontSize:11, letterSpacing:'.08em', color:'#8A8A80' }}>ČETRTEK · 11. SEPTEMBER 2026</div>
      <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:26, margin:'4px 0 18px' }}>Dober dan, Ana 👋</div>

      <div style={{ background:'#0E3D2A', borderRadius:14, padding:'18px 20px', color:'#F7F6F2', marginBottom:14 }}>
        <div style={{ fontSize:10.5, letterSpacing:'.08em', color:'#A8C9B5' }}>PROMET · ZADNJIH 14 DNI</div>
        <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:34, marginTop:4 }}>€831,90</div>
        <div style={{ fontSize:12.5, color:'#B9CFC3', marginTop:4 }}>155 računov · povprečno €5,37</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[['Danes','€62,00','16 računov'],['Odprte mize','3','Terasa T2, T4, N1'],['Zaloga pod min.','2','Kava, Mleko']].map(([a,b,c]) => (
          <div key={a} style={kartica}>
            <div style={{ fontSize:10.5, color:'#8A8A80', letterSpacing:'.05em' }}>{a.toUpperCase()}</div>
            <div style={{ fontSize:20, fontWeight:700, margin:'5px 0 2px' }}>{b}</div>
            <div style={{ fontSize:11.5, color:'#8A8A80' }}>{c}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function Blagajna() {
  const artikli = [
    ['Espresso','1,60'],['Kava z mlekom','1,90'],['Cappuccino','2,20'],['Čaj','1,80'],
    ['Voda 0,25','1,50'],['Pivo 0,5','3,50'],['Toast šunka sir','4,50'],['Tortilja piščanec','6,90'],
  ]
  return (
    <div style={{ display:'flex', gap:16 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {['Kava','Pijača','Hrana'].map((k,i) => (
            <span key={k} style={{ padding:'5px 12px', borderRadius:7, fontSize:12, fontWeight:600,
              background: i===0 ? '#0E3D2A' : '#fff', color: i===0 ? '#fff' : '#55554E',
              border:'1px solid #E5E0D4' }}>{k}</span>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))', gap:8 }}>
          {artikli.map(([n,c]) => (
            <div key={n} style={{ ...kartica, padding:'12px 10px', textAlign:'center' }}>
              <div style={{ fontSize:12, fontWeight:600, lineHeight:1.3 }}>{n}</div>
              <div style={{ fontSize:13, color:'#1F4732', fontWeight:700, marginTop:4 }}>€{c}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width:180, background:'#fff', border:'1px solid #E5E0D4', borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, color:'#8A8A80', letterSpacing:'.05em', marginBottom:10 }}>MIZA T2</div>
        {[['2× Espresso','3,20'],['1× Toast','4,50']].map(([n,c]) => (
          <div key={n} style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:7 }}>
            <span>{n}</span><span style={{ fontWeight:600 }}>€{c}</span>
          </div>
        ))}
        <div style={{ borderTop:'1px solid #E5E0D4', marginTop:10, paddingTop:10, display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
          <span>Skupaj</span><span>€7,70</span>
        </div>
        <div style={{ marginTop:12, padding:'9px 0', borderRadius:8, background:'#0E3D2A', color:'#fff', textAlign:'center', fontSize:13, fontWeight:700 }}>Plačilo</div>
      </div>
    </div>
  )
}

function Racuni() {
  const vrstice = [
    ['2026-026','Klub študentov','€224,98','PLAČAN'],
    ['2026-025','Gostilna Pri Lipi','€479,98','POSLAN'],
    ['2026-024','Fitnes Center d.o.o.','€150,00','PLAČAN'],
    ['2026-023','Športno društvo','€720,00','POSLAN'],
  ]
  return (
    <>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:14 }}>Izdani računi</div>
      <div style={{ background:'#fff', border:'1px solid #E5E0D4', borderRadius:12, overflow:'hidden' }}>
        {vrstice.map(([st,kupec,znesek,stanje], i) => (
          <div key={st} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px',
            borderTop: i ? '1px solid #F0EDE4' : 'none', fontSize:13 }}>
            <span style={{ color:'#8A8A80', minWidth:78 }}>{st}</span>
            <span style={{ flex:1, fontWeight:600, minWidth:0 }}>{kupec}</span>
            <span style={{ fontWeight:700 }}>{znesek}</span>
            <span style={{ fontSize:10.5, fontWeight:700, padding:'3px 9px', borderRadius:20,
              background: stanje==='PLAČAN' ? '#E3F0E7' : '#FBF0DC',
              color: stanje==='PLAČAN' ? '#1F6B38' : '#8A6218' }}>{stanje}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:12.5, color:'#8A8A80', marginTop:12 }}>
        Vsak račun je davčno potrjen pri FURS · e-račun e-SLOG na voljo
      </div>
    </>
  )
}

function Zaloga() {
  const vrstice = [
    ['Kava v zrnju','7,4 kg','2,0 kg','v redu'],
    ['Mleko','36 L','10 L','v redu'],
    ['Pivo 0,5','18 kos','24 kos','pod min.'],
    ['Toast kruh','4 kos','10 kos','pod min.'],
  ]
  return (
    <>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Zaloga</div>
      <div style={{ fontSize:12.5, color:'#8A8A80', marginBottom:14 }}>Prodaja odpiše sestavine po normativu</div>
      <div style={{ background:'#fff', border:'1px solid #E5E0D4', borderRadius:12, overflow:'hidden' }}>
        {vrstice.map(([n,stanje,min,oznaka], i) => (
          <div key={n} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px',
            borderTop: i ? '1px solid #F0EDE4' : 'none', fontSize:13 }}>
            <span style={{ flex:1, fontWeight:600, minWidth:0 }}>{n}</span>
            <span style={{ color:'#55554E' }}>{stanje}</span>
            <span style={{ color:'#A8A89E', fontSize:12 }}>min {min}</span>
            <span style={{ fontSize:10.5, fontWeight:700, padding:'3px 9px', borderRadius:20,
              background: oznaka==='v redu' ? '#E3F0E7' : '#FBE4E0',
              color: oznaka==='v redu' ? '#1F6B38' : '#9B3B2A' }}>{oznaka.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Ai() {
  return (
    <>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:14 }}>AI računovodja</div>
      <div style={{ background:'#fff', border:'1px solid #E5E0D4', borderRadius:12, padding:'16px 18px' }}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
          <div style={{ background:'#0E3D2A', color:'#F7F6F2', padding:'9px 14px', borderRadius:'12px 12px 3px 12px', fontSize:13, maxWidth:'78%' }}>
            Koliko sem zaslužil ta mesec in koliko bo šlo za davke?
          </div>
        </div>
        <div style={{ display:'flex', gap:9 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:'#D89328', color:'#1A1A16', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>✳</div>
          <div style={{ fontSize:13, lineHeight:1.65, color:'#3A3A34' }}>
            Septembra ste do danes ustvarili <strong>831,90 €</strong> prometa iz 155 računov.
            Po normiranih odhodkih 80 % je davčna osnova <strong>166,38 €</strong>, akontacija
            dohodnine <strong>33,28 €</strong>.
            <br /><br />
            Prispevki za september znašajo <strong>486,00 €</strong> in zapadejo 20. oktobra.
            Pri tem obsegu prometa jih promet <strong>ne pokrije</strong> — če se ne poveča, boste
            razliko krili iz prihrankov.
          </div>
        </div>
      </div>
      <div style={{ fontSize:12.5, color:'#8A8A80', marginTop:12 }}>
        Odgovarja iz vaših številk, ne na splošno.
      </div>
    </>
  )
}

/* ── slogi ───────────────────────────────────────────────────────── */

const okvir = {
  borderRadius:16, overflow:'hidden', background:'#0E3D2A',
  boxShadow:'0 18px 50px rgba(0,0,0,0.14)', border:'1px solid #D9D2C2',
}
const naslovnaVrstica = {
  display:'flex', alignItems:'center', gap:14, padding:'11px 16px',
  background:'#0B2F20',
}
const naslov = {
  flex:1, textAlign:'center' as const, fontSize:12, color:'rgba(255,255,255,0.55)',
  fontFamily:'ui-monospace, monospace',
}
const stranskiPas = {
  width:54, background:'#0E3D2A', display:'flex', flexDirection:'column' as const,
  alignItems:'center', gap:5, padding:'14px 0', flexShrink:0,
}
const kartica = {
  background:'#fff', border:'1px solid #E5E0D4', borderRadius:11, padding:'13px 14px',
}
