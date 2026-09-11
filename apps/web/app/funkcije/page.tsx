import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * STRAN Z VSEMI FUNKCIJAMI (prelet 255)
 * ═════════════════════════════════════
 *
 * ZAKAJ SVOJA STRAN: na landing strani je bilo osem skupin s priblizno
 * stiridesetimi postavkami - dovolj za pregled, premalo za odlocitev. Kdor
 * primerja ponudnike, hoce videti VSE; kdor sele gleda, ne sme biti zasut.
 * Zato pregled na landing strani in podrobnosti tu.
 *
 * ZAPISANO PO OPRAVILIH, NE PO MODULIH: uporabnik isce \"kako hitreje vnesem
 * prejeti racun\", ne \"kateri modul pokriva stroske\".
 *
 * VSAKA POSTAVKA POVE, KAJ PRIHRANI. \"Skeniranje racunov\" ni obljuba;
 * \"poslikaj racun, AI prebere dobavitelja, znesek in DDV\" je.
 *
 * SEO: naslovi h2 in h3 so vprasanja oziroma opravila, ker ljudje tako
 * iscejo. Stran je staticna, zato se prikaze takoj in jo iskalnik prebere
 * brez izvajanja skript.
 */

export const metadata: Metadata = {
  title: 'Vse funkcije',
  description: 'Podroben pregled vsega, kar Računko zna: davčna blagajna za lokale, skeniranje računov z AI, e-račun e-SLOG, KPO knjiga, plače, zaloge z normativi in delo brez povezave.',
  alternates: { canonical: '/funkcije' },
}

type Skupina = {
  ikona: string
  naslov: string
  uvod: string
  /** Neobvezno: v katerem paketu je skupina na voljo. */
  paketOpomba?: string
  postavke: { ime: string; opis: string; paket?: string }[]
}

const SKUPINE: Skupina[] = [
  {
    ikona: '🤖',
    naslov: 'Umetna inteligenca',
    uvod: 'Delo, ki ga je doslej pomenilo prepisovanje, opravi program.',
    postavke: [
      { ime: 'Skeniranje prejetih računov', opis: 'Poslikate račun ali naložite PDF. Prebrani so dobavitelj, datum, znesek, stopnja DDV in postavke — vi le potrdite. Strošek se zabeleži in gre v KPO.' },
      { ime: 'Skeniranje dobavnic', opis: 'Dobavnica dobavitelja se prebere, postavke se povežejo z vašimi artikli, zaloga se poveča in nabavna cena osveži.' },
      { ime: 'Ročni vnos, ko branje ne uspe', opis: 'Slabo skeniran ali ročno napisan dokument vpišete sami — z istim povezovanjem in prevzemom v zalogo.' },
      { ime: 'Glasovni vnos računa', opis: 'Poveste stranko in postavke, osnutek računa je pripravljen. Za tiste, ki računajo v avtu ali med delom.' },
      { ime: 'AI računovodja', opis: 'Vprašate ga o svojih podatkih — koliko ste zaslužili, kaj vas čaka, ali se splača nakup. Odgovarja iz vaših številk, ne na splošno.' },
      { ime: 'Uvoz starih računov', opis: 'Zgodovino iz drugega programa preberete in uvozite. Prepozna različne oblike številčenja in ohrani zaporedje.' },
      { ime: 'E-mail skeniranje', opis: 'Prejete račune, ki pridejo po e-pošti, aplikacija poišče sama in jih pripravi za potrditev.' },
    ],
  },
  {
    ikona: '🧾',
    naslov: 'Računi in dokumenti',
    uvod: 'Vse vrste dokumentov, ki jih slovenski s.p. potrebuje.',
    postavke: [
      { ime: 'Računi s FURS potrjevanjem', opis: 'Za gotovino, kartico in druga neposredna plačila. ZOI in EOR na računu, prijava v realnem času.' },
      { ime: 'Predračuni in avansni računi', opis: 'Predračun z enim klikom pretvorite v končni račun.' },
      { ime: 'Dobavnice', opis: 'Izdane in prejete, s povezavo na zalogo.' },
      { ime: 'Ponavljajoči računi', opis: 'Mesečno, četrtletno ali letno, s samodejnim pošiljanjem po e-pošti.' },
      { ime: 'e-račun (e-SLOG 2.0)', opis: 'Strukturiran zapis po uradni shemi. Od 1. 1. 2028 obvezen za račune med podjetji.' },
      { ime: 'UPN QR koda', opis: 'Na vsakem računu. Stranka skenira z mobilno banko in plača takoj.' },
      { ime: 'Delna plačila', opis: 'Zabeležite vsak prejeti del. Ko seštevek doseže znesek, se račun sam označi za plačanega.' },
      { ime: 'Samodejni opomniki', opis: 'Stranki, ki ni plačala, opomnik odide brez vašega posredovanja.' },
      { ime: 'Račun na podjetje', opis: 'Z nazivom, naslovom in davčno številko kupca — tudi na blagajni.' },
      { ime: 'Storno', opis: 'Pravilno izveden storno z novo FURS prijavo, ne izbris.' },
    ],
  },
  {
    ikona: '🖥️',
    naslov: 'Blagajna za lokale',
    uvod: 'Prava gostinska blagajna, ne le izpis na trak.',
    paketOpomba: 'Pro + POS',
    postavke: [
      { ime: 'Tloris z mizami', opis: 'Prostori, mize in odprta naročila. Vidite, katera miza ima kaj naročeno in koliko dolguje.' },
      { ime: 'Delitev računa', opis: 'Gost plača svoj del, ostalo ostane odprto na mizi.' },
      { ime: 'Popusti', opis: 'Na posamezno postavko v odstotkih ali evrih, ali na celoten račun.' },
      { ime: 'Delo brez povezave', opis: 'Ob izpadu interneta blagajna izda račun z ZOI in ga natisne. Ko se povezava vrne, ga sama prijavi pri FURS. Zakonski rok sta dva delovna dneva.' },
      { ime: 'Kuhinjski zaslon', opis: 'Kuhar vidi, kaj čaka na pripravo, v živo.' },
      { ime: 'Odrezek za kuharja', opis: 'Za računom se natisne listek s številko naročila in kuhinjskimi postavkami. Gost dobi račun z isto številko.' },
      { ime: 'Dnevna številka naročila', opis: 'Za postrežbo — gost ve, kdaj je na vrsti.' },
      { ime: 'Prijava osebja s PIN', opis: 'Vsak blagajnik s svojo kodo. Na računu piše, kdo ga je izdal.' },
      { ime: 'Skupna izmena', opis: 'Več blagajnikov dela v isti izmeni. Vmesno stanje in zaključek zajameta ves promet.' },
      { ime: 'Zaključek z apoeni', opis: 'Štetje po apoenih, primerjava pričakovano — prešteto — razlika, z razlogom za odstopanje.' },
      { ime: 'Happy hour', opis: 'Ceniki po urah in dnevih, samodejno.' },
      { ime: 'Shranjena naročila', opis: 'Naročilo shranite in nadaljujete pozneje.' },
      { ime: 'Namizna aplikacija', opis: 'Za Windows, s tiskanjem na termalni tiskalnik prek USB in odpiranjem predala.' },
      { ime: 'Mobilna aplikacija', opis: 'Za Android — naročila ob mizah in prodaja na terenu.' },
    ],
  },
  {
    ikona: '📦',
    naslov: 'Zaloge in nabava',
    uvod: 'Da veste, kaj imate in koliko vas je stalo.',
    postavke: [
      { ime: 'Normativi', opis: 'Kava z mlekom odpiše 4 g kave in 1 dl mleka. Prodaja vodi zalogo sestavin sama.' },
      { ime: 'Inventura', opis: 'Preštejete, program pokaže razlike in jih poknjiži.' },
      { ime: 'Prevzem blaga', opis: 'Iz dobavnice — samodejno ali ročno. Zaloga se poveča, nabavna cena zabeleži.' },
      { ime: 'Pavšalno nadomestilo', opis: 'Za dobave kmetov pavšalistov po 95. členu ZDDV-1, ločeno od DDV.' },
      { ime: 'Opozorila o zalogi', opis: 'Enkrat na dan ob uri, ki jo izberete — pred rokom za naročilo pri grosistu, ne po vsakem prodanem pivu.' },
      { ime: 'Uvoz cenika', opis: 'Iz CSV ali Excela, s pametnim povezovanjem stolpcev.' },
    ],
  },
  {
    ikona: '📊',
    naslov: 'Davki in evidence',
    uvod: 'Kar mora biti oddano, in pravočasno.',
    postavke: [
      { ime: 'KPO knjiga', opis: 'Polni se sama iz izdanih računov, stroškov in blagajniškega prometa.' },
      { ime: 'Evidence DDV', opis: 'Knjiga izdanih in prejetih računov, obračun DDV-O.' },
      { ime: 'Prispevki OPSVZ', opis: 'Mesečni obračun in QR koda za plačilo.' },
      { ime: 'Dohodnina', opis: 'Akontacija in letni obračun.' },
      { ime: 'Normiranec', opis: 'Spremljanje praga in izračun davčne osnove.' },
      { ime: 'Amortizacija', opis: 'Register osnovnih sredstev z obračunom.' },
      { ime: 'Reprezentanca in kilometrina', opis: 'Z omejitvami, ki jih predpisuje zakon.' },
      { ime: 'Opomniki na roke', opis: 'Sedem dni pred vsakim davčnim rokom.' },
      { ime: 'Letni pregled', opis: 'Kaj je bilo leto vredno — prihodki, odhodki, davki, neto.' },
    ],
  },
  {
    ikona: '👥',
    naslov: 'Ekipa in plače',
    uvod: 'Za tiste, ki niso sami.',
    postavke: [
      { ime: 'Obračun plač', opis: 'Plačilna lista, prispevki, neto izplačilo.' },
      { ime: 'REK-1', opis: 'XML datoteka, pripravljena za oddajo na eDavke.' },
      { ime: 'Regres', opis: 'Obračun in evidenca.' },
      { ime: 'Evidenca delovnega časa', opis: 'Po ZEPDSV — prihod, odhod, odmori. Obvezna za vsakega delodajalca.' },
      { ime: 'Dopusti in bolniške', opis: 'Koledar in stanje po zaposlenem.' },
      { ime: 'Potni nalogi', opis: 'Nalog, obračun, dnevnice in kilometrina.' },
      { ime: 'Dovoljenja po zaposlenem', opis: 'Vloga določi osnovo, posamezniku pa dodate ali odvzamete pravico. Storno, vračilo, popust, zaključek — vsako posebej.' },
    ],
  },
  {
    ikona: '📅',
    naslov: 'Stranke, člani in termini',
    uvod: 'Za fitnese, salone in vse, ki delajo z naročenimi gosti.',
    postavke: [
      { ime: 'Kartoteka strank', opis: 'Vsi računi, obiski, paketi in zgodovina na enem mestu.' },
      { ime: 'Članske kartice in paketi', opis: 'Z omejenim številom obiskov ali časovno, z zamrznitvijo.' },
      { ime: 'Terminski koledar', opis: 'Rezervacije, ponavljajoči termini, zasedenost.' },
      { ime: 'Opomniki na potek', opis: 'Stranka dobi obvestilo pred iztekom kartice. Če jo je že podaljšala, opomnik ne odide.' },
      { ime: 'Rojstnodnevne čestitke', opis: 'Samodejno, z besedilom, ki ga napišete sami.' },
      { ime: 'Obnova prek povezave', opis: 'Stranka podaljša kartico sama, brez vašega posredovanja.' },
    ],
  },
  {
    ikona: '🔌',
    naslov: 'Povezave in izvozi',
    uvod: 'Da podatki gredo tja, kamor morajo.',
    postavke: [
      { ime: 'Stripe', opis: 'Vsako plačilo postane davčno potrjen račun — kartice, Apple Pay, naročnine.' },
      { ime: 'WooCommerce in Shopify', opis: 'Naročila iz spletne trgovine z izdanimi računi in vodenjem zaloge.' },
      { ime: 'Uvoz plačil iz banke', opis: 'Naložite izpisek (camt.053, XLSX ali CSV). Plačila se povežejo po sklicu, računi označijo kot plačani.' },
      { ime: 'Izvoz VOD', opis: 'Knjižbe v XML za neposreden uvoz v Vasco, Pantheon ali Opal.' },
      { ime: 'Portal za računovodjo', opis: 'Z enim računom preklaplja med vsemi strankami, ki so ga povabile. Vidi dokumente sproti, ne konec kvartala.' },
      { ime: 'Izvozi v Excel', opis: 'Računi, stroški, zaloge, poročila — pripravljeno za nadaljnjo obdelavo.' },
      { ime: 'API ključi', opis: 'Za povezavo z lastnimi orodji.' },
    ],
  },
  {
    ikona: '🔐',
    naslov: 'Varnost',
    uvod: 'Program hrani vaše davčne podatke.',
    postavke: [
      { ime: 'Dvostopenjska prijava', opis: 'Koda iz aplikacije na telefonu poleg gesla. Tudi če kdo izve geslo, brez telefona ne pride noter.' },
      { ime: 'Rezervne kode', opis: 'Deset enkratnih kod za primer, da izgubite telefon.' },
      { ime: 'Samodejno zaklepanje blagajne', opis: 'Po izbranem času nedejavnosti.' },
      { ime: 'Podatki v Evropski uniji', opis: 'Z dnevnimi varnostnimi kopijami.' },
    ],
  },
]

export default function Funkcije() {
  return (
    <main style={{ background:'#F7F6F2', minHeight:'100vh', paddingBottom:80 }}>
      <div style={{ maxWidth:1000, margin:'0 auto', padding:'56px 24px 0' }}>
        <Link href="/" style={{ fontSize:13, color:'#6B6B63', textDecoration:'none' }}>← Nazaj</Link>
        <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:'clamp(2.2rem,5vw,3.4rem)', lineHeight:1.1, margin:'20px 0 14px' }}>
          Vse, kar Računko zna
        </h1>
        <p style={{ fontSize:18, lineHeight:1.7, color:'#4A4A44', maxWidth:660 }}>
          Podroben seznam. Če vas zanima samo pregled, je na{' '}
          <Link href="/#funkcije-vse" style={{ color:'#1F4732' }}>začetni strani</Link>.
        </p>

        {SKUPINE.map(s => (
          <section key={s.naslov} style={{ marginTop:56 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
              <span style={{ fontSize:26 }}>{s.ikona}</span>
              <h2 style={{ fontSize:26, fontWeight:700, margin:0 }}>{s.naslov}</h2>
            </div>
            <p style={{ fontSize:15, color:'#6B6B63', marginTop:8, marginBottom:24 }}>{s.uvod}</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
              {s.postavke.map(p => (
                <div key={p.ime} style={{ background:'#fff', border:'1px solid #E5E0D4', borderRadius:14, padding:'18px 20px' }}>
                  <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 7px' }}>{p.ime}</h3>
                  <p style={{ fontSize:13.5, lineHeight:1.65, color:'#55554E', margin:0 }}>{p.opis}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div style={{ marginTop:64, padding:'32px 28px', background:'#0E3D2A', borderRadius:20, color:'#F7F6F2' }}>
          <h2 style={{ fontSize:22, fontWeight:700, margin:'0 0 10px' }}>Kaj od tega potrebujete?</h2>
          <p style={{ fontSize:15, lineHeight:1.7, color:'#DCE7E0', margin:'0 0 20px', maxWidth:620 }}>
            Verjetno ne vsega. Brezplačni paket pokrije izdajanje računov, Pro dodá evidence in
            umetno inteligenco, Pro + POS pa blagajno za lokale.
          </p>
          <Link href="/#cene" style={{ display:'inline-block', padding:'12px 22px', borderRadius:10, background:'#D89328', color:'#1A1A16', textDecoration:'none', fontWeight:700, fontSize:15 }}>
            Poglej cenik →
          </Link>
        </div>
      </div>
    </main>
  )
}
