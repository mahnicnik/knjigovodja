import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * STRAN: E-RACUNI OD 2028 (prelet 256)
 * ════════════════════════════════════
 *
 * NAMEN: to je NAJBOLJ DRAGOCENA stran v celotnem naboru, in ne zaradi
 * izdelka.
 *
 * Od 1. 1. 2028 so e-racuni med podjetji obvezni. Vsak slovenski s.p. in
 * d.o.o. bo to moral urediti, in vsi bodo iskali isto: kaj to pomeni, do
 * kdaj, kako. Poizvedb bo desettisoce, konkurencnih strani pa malo - ker je
 * rok se dalec in se nihce ne trudi.
 *
 * Kdor bo takrat prvi z jasnim odgovorom, bo dobil promet, ki ga z oglasi
 * ni mogoce kupiti.
 *
 * ZATO: stran odgovarja na vprasanje, ne prodaja izdelka. Izdelek je
 * omenjen na koncu, v enem odstavku.
 *
 * VIRI: ZIERDED, sprejet 23. 10. 2025. Podatki so preverjeni septembra 2026;
 * ce se zakonodaja spremeni, je treba stran posodobiti - zato je datum
 * zadnjega preverjanja napisan na strani.
 */

export const metadata: Metadata = {
  title: 'E-računi obvezni od 2028 — kaj to pomeni za s.p. in d.o.o.',
  description: 'Od 1. januarja 2028 bodo strukturirani e-računi med podjetji obvezni. Kaj je e-SLOG, zakaj PDF po e-pošti ne bo več dovolj in kako se pripraviti.',
  alternates: { canonical: '/e-racun' },
}

export default function ERacun() {
  return (
    <main style={{ background:'#F7F6F2', minHeight:'100vh', paddingBottom:80 }}>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'56px 24px 0' }}>
        <Link href="/" style={{ fontSize:13, color:'#6B6B63', textDecoration:'none' }}>← Računko</Link>

        <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:'clamp(2rem,5vw,3rem)', lineHeight:1.15, margin:'20px 0 20px' }}>
          E-računi bodo obvezni od 2028
        </h1>

        <p style={{ fontSize:19, lineHeight:1.7, color:'#3A3A34' }}>
          Od <strong>1. januarja 2028</strong> bodo morala vsa podjetja v Sloveniji račune med
          seboj izmenjevati v strukturirani elektronski obliki. PDF, poslan po e-pošti, od
          takrat ne bo več zadoščal.
        </p>

        <h2 style={h2}>Kaj pomeni &bdquo;strukturiran&ldquo;</h2>
        <p style={p}>
          PDF je slika dokumenta — človek jo prebere, program pa ne. Strukturiran e-račun je
          datoteka, v kateri je vsak podatek na svojem mestu: kdo izdaja, komu, koliko, katera
          stopnja DDV, kdaj zapade.
        </p>
        <p style={p}>
          Prejemnikov program ga zato <strong>uvozi sam</strong>, brez prepisovanja. To je ves
          namen spremembe — manj ročnega dela in manj napak.
        </p>

        <h2 style={h2}>Katera oblika</h2>
        <p style={p}>
          V Sloveniji <strong>e-SLOG 2.0</strong>. Zakon dopušča tudi druge zapise, skladne z
          evropsko normo EN 16931, a slovenski prejemniki in ponudniki pričakujejo e-SLOG.
        </p>

        <h2 style={h2}>Kako se pošljejo</h2>
        <p style={p}>
          Prek <strong>registriranega ponudnika e-poti</strong>, omrežja Peppol ali neposredne
          povezave med podjetjema. Izmenjava po e-pošti <strong>ne bo dovoljena</strong> — tudi
          če pripnete pravilno datoteko.
        </p>
        <p style={p}>
          V praksi to pomeni, da boste potrebovali bodisi svojo banko, bodisi ponudnika, ki
          račune posreduje namesto vas.
        </p>

        <h2 style={h2}>Za koga velja</h2>
        <p style={p}>
          Za vse subjekte v poslovnem registru — tudi za samostojne podjetnike in <strong>ne
          glede na to, ali ste zavezanec za DDV</strong>. Velja za račune med podjetji; računi
          fizičnim osebam ostanejo, kot so.
        </p>
        <p style={p}>
          Za javni sektor je elektronsko prejemanje obvezno že od leta 2015 prek UJP.
        </p>

        <h2 style={h2}>Kaj storiti zdaj</h2>
        <p style={p}>
          Do roka je še čas, a dvoje je vredno urediti prej.
        </p>
        <ul style={{ ...p, paddingLeft:22 }}>
          <li style={li}>
            <strong>Preverite, ali vaš program zna izvoziti e-SLOG.</strong> Če ne, boste
            program menjali — in to je bolje narediti mirno kot decembra 2027.
          </li>
          <li style={li}>
            <strong>Vprašajte banko, ali posreduje e-račune.</strong> Marsikatera to že počne;
            takrat dodatnega ponudnika ne potrebujete.
          </li>
        </ul>

        <h2 style={h2}>Kje je Računko</h2>
        <p style={p}>
          Izvoz e-računa v obliki e-SLOG 2.0 deluje že zdaj — datoteko prenesete in naložite v
          spletno banko. Povezavo na omrežje za neposredno pošiljanje pripravljamo pred rokom.
        </p>

        <div style={cta}>
          <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Pripravite se mirno</div>
          <p style={{ fontSize:14.5, lineHeight:1.7, color:'#DCE7E0', margin:'0 0 18px' }}>
            Računko izdaja e-račune po uradni shemi e-SLOG 2.0. Štirinajst dni brezplačno.
          </p>
          <Link href="/register" style={gumb}>Preizkusi →</Link>
        </div>

        <p style={{ ...p, fontSize:13.5, color:'#6B6B63', marginTop:40 }}>
          Podatki preverjeni septembra 2026 (zakon ZIERDED, sprejet 23. oktobra 2025).
          Zakonodaja se lahko spremeni — za svoj primer preverite pri viru ali pri
          računovodkinji.
        </p>

        <div style={{ marginTop:32, fontSize:14 }}>
          <Link href="/davcna-blagajna" style={{ color:'#1F4732', marginRight:18 }}>Davčna blagajna</Link>
          <Link href="/funkcije" style={{ color:'#1F4732' }}>Vse funkcije</Link>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({
        '@context':'https://schema.org','@type':'FAQPage',
        mainEntity:[
          ['Kdaj bodo e-računi med podjetji obvezni?','Od 1. januarja 2028, po zakonu ZIERDED, sprejetem oktobra 2025.'],
          ['Ali bo PDF po e-pošti še dovolj?','Ne. Zahtevana bo strukturirana oblika, izmenjava po e-pošti pa ne bo dovoljena.'],
          ['Katera oblika e-računa velja v Sloveniji?','e-SLOG 2.0 ali druga sintaksa, skladna z evropsko normo EN 16931.'],
          ['Ali velja tudi za s.p. brez DDV?','Da. Velja za vse subjekte v poslovnem registru, ne glede na status DDV.'],
        ].map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})),
      })}} />
    </main>
  )
}

const h2 = { fontSize:24, fontWeight:700, marginTop:40, marginBottom:12 }
const p = { fontSize:16.5, lineHeight:1.75, color:'#3A3A34', marginBottom:14 }
const li = { marginBottom:10, lineHeight:1.7 }
const cta = { marginTop:44, padding:'28px 26px', background:'#0E3D2A', borderRadius:18, color:'#F7F6F2' }
const gumb = { display:'inline-block', padding:'12px 22px', borderRadius:10, background:'#D89328', color:'#1A1A16', textDecoration:'none', fontWeight:700, fontSize:15 }
