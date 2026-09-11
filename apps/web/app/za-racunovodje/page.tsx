import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * STRAN: ZA RACUNOVODSKE SERVISE (prelet 256)
 * ═══════════════════════════════════════════
 *
 * NAMEN: pridobiti racunovodske servise kot PRODAJNI KANAL, ne kot stranke.
 *
 * Racunovodkinja ima petdeset strank. Ce ji Racunko prihrani delo, ga bo
 * priporocila - in to je edina pot, po kateri majhen ponudnik doseze ljudi,
 * ki jih sam ne bi nikoli nasel.
 *
 * ZATO JE TON DRUGACEN od ostalih strani: ne prodaja programa, ampak
 * pojasnjuje, zakaj NI grožnja. Prva poved mora to povedati, sicer bralka
 * zapre stran.
 */

export const metadata: Metadata = {
  title: 'Za računovodske servise — Računko ni konkurenca vašemu programu',
  description: 'Računko nima glavne knjige ne dvostavnega knjigovodstva. Vodi eno podjetje, ne vaše pisarne. Vi dobite izvoz VOD za Vasco, Pantheon ali Opal — namesto mape papirjev.',
  alternates: { canonical: '/za-racunovodje' },
}

export default function ZaRacunovodje() {
  return (
    <main style={{ background:'#F7F6F2', minHeight:'100vh', paddingBottom:80 }}>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'56px 24px 0' }}>
        <Link href="/" style={{ fontSize:13, color:'#6B6B63', textDecoration:'none' }}>← Računko</Link>

        <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:'clamp(2rem,5vw,3rem)', lineHeight:1.15, margin:'20px 0 20px' }}>
          Ne zamenjamo vas
        </h1>

        <p style={{ fontSize:19, lineHeight:1.7, color:'#3A3A34' }}>
          Računko nima glavne knjige, kontnega načrta ne dvostavnega knjigovodstva — in jih ne
          namerava imeti. Vodi <strong>eno podjetje</strong>, ne vaše pisarne.
        </p>

        <h2 style={h2}>Kaj Računko je</h2>
        <p style={p}>
          Program, ki ga uporablja vaša stranka. Izdaja račune, slika stroške, vodi blagajno,
          KPO knjigo in amortizacijo — sproti, ne konec kvartala.
        </p>
        <p style={p}>
          Kar iz tega dobite vi, ni mapa papirjev, ampak <strong>izvoz, ki ga vaš program
          prebere</strong>.
        </p>

        <h2 style={h2}>Izvozi</h2>
        <ul style={{ ...p, paddingLeft:22 }}>
          <li style={li}><strong>VOD XML</strong> — knjižbe izdanih računov za Vasco, Pantheon in Opal</li>
          <li style={li}><strong>Excel</strong> — računi, stroški, zaloge in poročila</li>
          <li style={li}><strong>Evidence DDV</strong> — za vse vaše stranke v enem koraku</li>
          <li style={li}><strong>Dnevni zaključki blagajne</strong> — z razčlenitvijo po stopnjah DDV</li>
        </ul>

        <h2 style={h2}>Portal za računovodjo</h2>
        <p style={p}>
          Z enim uporabniškim računom preklapljate med vsemi strankami, ki so vas povabile.
          Brez ločenih prijav in brez gesel, ki jih hranite v beležki.
        </p>
        <p style={p}>
          Vidite, kaj se dogaja <strong>med mesecem</strong> — kateri računi so izdani, kateri
          stroški poslikani, kaj manjka. Ko potrebujete dokumente, so že tam.
        </p>
        <p style={p}>
          Stranka vidi isto kot vi. Kar manjka, vidita oba — in vprašanj po telefonu je manj.
        </p>

        <h2 style={h2}>Kako se stranka poveže z vami</h2>
        <p style={p}>
          Stranka vas povabi sama: Nastavitve → Ekipa → Povabi člana → vaš e-naslov → vloga
          Računovodja. Na e-pošto prejmete povabilo; ko ga sprejmete, vidite njen pregled.
        </p>
        <p style={p}>
          Dostop ima le za branje in izvoze. Računov ne more izdati nihče drug kot stranka sama.
        </p>

        <h2 style={h2}>Za kakšne stranke je primeren</h2>
        <p style={p}>
          Samostojni podjetniki z enostavnim knjigovodstvom in normiranci. Posebej gostinci,
          fitnesi in saloni — Računko ima pravo davčno blagajno, ne le izpisa na trak.
        </p>
        <p style={p}>
          Za d.o.o. z dvostavnim knjigovodstvom Računko ni dovolj, in tega ne skrivamo.
        </p>

        <div style={cta}>
          <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Poglejte, kako izgleda</div>
          <p style={{ fontSize:14.5, lineHeight:1.7, color:'#DCE7E0', margin:'0 0 18px' }}>
            Portal je brezplačen. Plača ga stranka, ne vi.
          </p>
          <Link href="/racunovodja" style={gumb}>Portal za računovodje →</Link>
        </div>

        <div style={{ marginTop:32, fontSize:14 }}>
          <Link href="/funkcije" style={{ color:'#1F4732', marginRight:18 }}>Vse funkcije</Link>
          <Link href="/e-racun" style={{ color:'#1F4732' }}>E-računi od 2028</Link>
        </div>
      </div>
    </main>
  )
}

const h2 = { fontSize:24, fontWeight:700, marginTop:40, marginBottom:12 }
const p = { fontSize:16.5, lineHeight:1.75, color:'#3A3A34', marginBottom:14 }
const li = { marginBottom:10, lineHeight:1.7 }
const cta = { marginTop:44, padding:'28px 26px', background:'#0E3D2A', borderRadius:18, color:'#F7F6F2' }
const gumb = { display:'inline-block', padding:'12px 22px', borderRadius:10, background:'#D89328', color:'#1A1A16', textDecoration:'none', fontWeight:700, fontSize:15 }
