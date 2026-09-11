import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * STRAN: DAVCNA BLAGAJNA ZA LOKAL (prelet 256)
 * ════════════════════════════════════════════
 *
 * NAMEN: odgovoriti na poizvedbo \"ali potrebujem davcno blagajno za lokal\"
 * in \"kaj potrebujem za davcno blagajno\". To sta vprasanji, ki ju gostinec
 * vtipka, preden sploh ve, da obstajamo.
 *
 * ZAKAJ SVOJA STRAN IN NE ODSTAVEK NA ZACETNI: ena dolga stran tekmuje za
 * eno poizvedbo. Vsaka podstran tekmuje za svojo - in AI pomocnik raje
 * navede stran, ki odgovarja NATANKO na vprasanje, kot tisto, ki govori o
 * vsem hkrati.
 *
 * NACELO PISANJA: najprej odgovor, nato razlaga, sele na koncu izdelek.
 * Stran, ki najprej prodaja, pomocnik preskoci.
 */

export const metadata: Metadata = {
  title: 'Davčna blagajna za lokal — kaj potrebujete in koliko stane',
  description: 'Kdaj je davčna blagajna obvezna, kaj potrebujete za začetek (potrdilo FURS, poslovni prostor, interni akt) in kaj se zgodi ob izpadu interneta. Za bare, kavarne in restavracije.',
  alternates: { canonical: '/davcna-blagajna' },
}

export default function DavcnaBlagajna() {
  return (
    <main style={{ background:'#F7F6F2', minHeight:'100vh', paddingBottom:80 }}>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'56px 24px 0' }}>
        <Link href="/" style={{ fontSize:13, color:'#6B6B63', textDecoration:'none' }}>← Računko</Link>

        <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:'clamp(2rem,5vw,3rem)', lineHeight:1.15, margin:'20px 0 20px' }}>
          Davčna blagajna za lokal
        </h1>

        <p style={{ fontSize:19, lineHeight:1.7, color:'#3A3A34' }}>
          Če za pijačo, hrano ali storitev prejmete gotovino ali kartico, mora biti račun
          davčno potrjen pri FURS. To velja za bare, kavarne, restavracije, frizerske salone
          in fitnes studie — ne glede na velikost.
        </p>

        <h2 style={h2}>Kdaj potrjevanje ni potrebno</h2>
        <p style={p}>
          Kadar stranka plača <strong>na transakcijski račun</strong> — z nakazilom po prejetem
          računu. Takrat račun izdate brez potrjevanja, saj je plačilo sledljivo prek banke.
        </p>
        <p style={p}>
          Enako velja za prodajo drugemu podjetju, če to plača z nakazilom. Kdor ima samo take
          stranke, davčne blagajne ne potrebuje.
        </p>

        <h2 style={h2}>Kaj potrebujete za začetek</h2>
        <ol style={{ ...p, paddingLeft:22 }}>
          <li style={li}>
            <strong>Digitalno potrdilo FURS.</strong> Pridobite ga brezplačno prek eDavkov.
            S tem se računi podpišejo in prijavijo.
          </li>
          <li style={li}>
            <strong>Prijavljen poslovni prostor.</strong> Naslov, katastrska občina, številka
            stavbe in dela stavbe. Prijavi se elektronsko, pred prvim računom.
          </li>
          <li style={li}>
            <strong>Interni akt o številčenju.</strong> Dokument, s katerim določite, kako
            boste račune oštevilčevali. Sprejmete ga sami; ni ga treba nikamor oddati, mora
            pa obstajati in ustrezati dejanskemu delovanju.
          </li>
        </ol>
        <p style={p}>
          Vse troje uredite v Računku — akt se sestavi iz vpisanih podatkov, prostor se prijavi
          z enim klikom.
        </p>

        <h2 style={h2}>Kaj se zgodi, ko pade internet</h2>
        <p style={p}>
          To je vprašanje, ki ga marsikdo zastavi prepozno. Zakon predvideva, da se račun izda
          tudi brez povezave: natisne se z zaščitno oznako <strong>ZOI</strong>, brez potrditvene
          oznake EOR, in se prijavi naknadno.
        </p>
        <p style={p}>
          Rok za naknadno prijavo sta <strong>dva delovna dneva</strong>. Računko to opravi sam,
          takoj ko se povezava vrne — vam ni treba storiti ničesar.
        </p>
        <p style={p}>
          Pogoj je številčenje po posamezni napravi. Pri centralnem številčenju blagajna brez
          povezave računa ne more izdati, ker bi dve napravi lahko podelili isto številko.
        </p>

        <h2 style={h2}>Kaj mora biti na računu</h2>
        <ul style={{ ...p, paddingLeft:22 }}>
          <li style={li}>Številka v obliki <code style={code}>prostor-naprava-zaporedna</code></li>
          <li style={li}>Datum in čas izdaje</li>
          <li style={li}>Naziv, naslov in davčna številka izdajatelja</li>
          <li style={li}>Postavke, cene in razčlenitev DDV</li>
          <li style={li}>Zaščitna oznaka ZOI in potrditvena oznaka EOR</li>
          <li style={li}>QR koda, po kateri kupec račun preveri</li>
        </ul>

        <h2 style={h2}>Koliko stane</h2>
        <p style={p}>
          Pri Računku 29,99 € na mesec za paket s blagajno, brez vezave. V to je vključeno
          davčno potrjevanje, tloris z mizami, delitev računa, zaloge z normativi, kuhinjski
          zaslon in namizna aplikacija z tiskanjem na termalni tiskalnik.
        </p>
        <p style={p}>
          Potrdilo FURS je brezplačno. Strojno opremo — tiskalnik in predal — kupite enkrat;
          Računko deluje z običajnimi termalnimi tiskalniki.
        </p>

        <div style={cta}>
          <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Preizkusite brez vezave</div>
          <p style={{ fontSize:14.5, lineHeight:1.7, color:'#DCE7E0', margin:'0 0 18px' }}>
            Štirinajst dni polnega dostopa, brez kartice. Če vam ne ustreza, preprosto nehate.
          </p>
          <Link href="/register" style={gumb}>Odpri račun →</Link>
        </div>

        <p style={{ ...p, fontSize:13.5, color:'#6B6B63', marginTop:40 }}>
          Vsebina je informativna in ne nadomešča davčnega svetovanja. Za svoj primer se
          posvetujte z računovodkinjo ali preverite na{' '}
          <a href="https://www.fu.gov.si" style={{ color:'#1F4732' }}>fu.gov.si</a>.
        </p>

        <div style={{ marginTop:32, fontSize:14 }}>
          <Link href="/funkcije" style={{ color:'#1F4732', marginRight:18 }}>Vse funkcije</Link>
          <Link href="/e-racun" style={{ color:'#1F4732' }}>E-računi od 2028</Link>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({
        '@context':'https://schema.org','@type':'FAQPage',
        mainEntity:[
          ['Ali potrebujem davčno blagajno za lokal?','Da, če prejemate gotovino ali kartico. Za plačila na transakcijski račun potrjevanje ni potrebno.'],
          ['Kaj potrebujem za davčno blagajno?','Digitalno potrdilo FURS, prijavljen poslovni prostor in sprejet interni akt o številčenju računov.'],
          ['Ali blagajna deluje brez interneta?','Da. Račun se izda z zaščitno oznako ZOI in se prijavi naknadno, v roku dveh delovnih dni.'],
        ].map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})),
      })}} />
    </main>
  )
}

const h2 = { fontSize:24, fontWeight:700, marginTop:40, marginBottom:12 }
const p = { fontSize:16.5, lineHeight:1.75, color:'#3A3A34', marginBottom:14 }
const li = { marginBottom:10, lineHeight:1.7 }
const code = { background:'#EDE8DC', padding:'2px 6px', borderRadius:4, fontSize:14 }
const cta = { marginTop:44, padding:'28px 26px', background:'#0E3D2A', borderRadius:18, color:'#F7F6F2' }
const gumb = { display:'inline-block', padding:'12px 22px', borderRadius:10, background:'#D89328', color:'#1A1A16', textDecoration:'none', fontWeight:700, fontSize:15 }
