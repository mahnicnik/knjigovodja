import Link from 'next/link'
import AppLayout from '@/components/AppLayout'

export default function TermsPage() {
  return (
    <AppLayout>
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .page{background:#fff;color:#111;min-height:100vh}
        .nav{display:flex;align-items:center;justify-content:space-between;padding:0 40px;height:56px;border-bottom:0.5px solid #EBEBEB;background:#fff}
        .nlogo{display:flex;align-items:center;gap:10px;text-decoration:none}
        .nmark{width:30px;height:30px;border-radius:8px;background:#0A3D2B;display:flex;align-items:center;justify-content:center;color:#9FE1CB;font-size:11px;font-weight:500}
        .nname{font-size:14px;font-weight:500;color:#111}
        .content{max-width:720px;margin:0 auto;padding:48px 40px 80px}
        .tag{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;background:#FEF3E2;color:#9A6315;margin-bottom:16px}
        h1{font-size:32px;font-weight:500;color:#111;letter-spacing:-.5px;margin-bottom:8px}
        .date{font-size:13px;color:#aaa;margin-bottom:40px}
        h2{font-size:18px;font-weight:500;color:#111;margin:32px 0 10px}
        p{font-size:14px;color:#444;line-height:1.75;margin-bottom:12px}
        ul{padding-left:20px;margin-bottom:12px}
        li{font-size:14px;color:#444;line-height:1.75;margin-bottom:4px}
        .divider{border:none;border-top:0.5px solid #EBEBEB;margin:32px 0}
        .highlight{background:#FFF8F0;border:0.5px solid #F0E0C8;border-radius:10px;padding:16px 20px;margin:16px 0}
        .highlight p{margin:0;font-size:13px;color:#666}
        .contact-box{background:#FAFAFA;border:0.5px solid #EBEBEB;border-radius:10px;padding:20px 24px;margin-top:32px}
        .contact-box p{margin:0;font-size:13px;color:#666}
        .contact-box a{color:#1D9E75;text-decoration:none}
        .foot{text-align:center;padding:24px;border-top:0.5px solid #EBEBEB;font-size:12px;color:#aaa}
        .foot a{color:#1D9E75;text-decoration:none;margin:0 8px}
        @media(max-width:768px){.content{padding:32px 16px 60px}.nav{padding:0 16px}}
      `}</style>

      <div className="page">
        <nav className="nav">
          <Link href="/" className="nlogo">
            <div className="nmark">rč</div>
            <span className="nname">Računko</span>
          </Link>
          <Link href="/" style={{fontSize:'12px',color:'#666',textDecoration:'none'}}>← Nazaj</Link>
        </nav>

        <div className="content">
          <div className="tag">Pravni dokumenti</div>
          <h1>Pogoji uporabe</h1>
          <p className="date">Zadnja posodobitev: maj 2026</p>

          <p>Dobrodošli v Računko. Z uporabo naše storitve se strinjate s temi pogoji. Preberite jih skrbno pred registracijo.</p>

          <hr className="divider" />

          <h2>1. Opis storitve</h2>
          <p>Računko je spletna aplikacija za pomoč pri vodenju poslovnih financ slovenskim samostojnim podjetnikom (s.p.) in d.o.o. Storitev vključuje:</p>
          <ul>
            <li>Izdajanje računov in sledenje plačilom</li>
            <li>Evidenco stroškov in skeniranje računov</li>
            <li>Izračun in opominjanje na davčne obveznosti</li>
            <li>AI računovodski asistent</li>
            <li>Obračun plač in evidenco zaposlenih</li>
          </ul>

          <div className="highlight">
            <p>⚠️ <strong>Pomembno:</strong> Računko je informacijsko orodje in ne nadomešča pooblaščenega računovodja ali davčnega svetovalca. Za uradne davčne nasvete in kompleksnejše primere se posvetujte s strokovnjakom.</p>
          </div>

          <h2>2. Uporabniški račun</h2>
          <p>Za uporabo Računko morate:</p>
          <ul>
            <li>Biti starejši od 18 let</li>
            <li>Navesti točne in resnične podatke ob registraciji</li>
            <li>Varovati zaupnost svojega gesla</li>
            <li>Takoj obvestiti nas o nepooblaščeni uporabi vašega računa</li>
          </ul>
          <p>Vsak račun je za enega uporabnika. Skupna raba računa ni dovoljena.</p>

          <h2>3. Plačilni pogoji</h2>
          <p><strong>Brezplačni plan (Starter):</strong> Na voljo brezplačno z omejitvami (do 5 računov mesečno, 10 AI vprašanj).</p>
          <p><strong>Pro plan:</strong> €9.99 mesečno, zaračunano mesečno. Brez letne vezave. Prekličete kadarkoli.</p>
          <p>Ob neplačilu za Pro plan vas obvestimo in po 7 dneh preklopimo na brezplačni plan. Vaši podatki ostanejo.</p>

          <h2>4. Vaši podatki</h2>
          <p>Vsi poslovni podatki ki jih vnesete (računi, stroški, podatki strank) so vaša last. Računko jih ne prodaja, ne deli z oglaševalci in jih ne uporablja za lastne komercialne namene.</p>
          <p>Ob zaprtju računa vam omogočimo izvoz vseh podatkov v standardnih formatih (CSV, PDF) pred izbrisom.</p>

          <h2>5. Dovoljeno in nedovoljeno</h2>
          <p>Prepovedana je naslednja uporaba:</p>
          <ul>
            <li>Vnos lažnih ali zavajajočih podatkov</li>
            <li>Poskusi nepooblaščenega dostopa do podatkov drugih uporabnikov</li>
            <li>Avtomatizirano pridobivanje podatkov (scraping)</li>
            <li>Prodaja ali posredovanje dostopa do vašega računa</li>
            <li>Uporaba za nezakonite dejavnosti</li>
          </ul>

          <h2>6. Razpoložljivost storitve</h2>
          <p>Prizadevamo si za 99.5% razpoložljivost. Ob načrtovanem vzdrževanju vas obvestimo vnaprej. Za neplačljivo škodo zaradi nedostopnosti storitve ne odgovarjamo.</p>

          <h2>7. Omejitev odgovornosti</h2>
          <p>Računko zagotavlja orodje za lažje vodenje financ, ne pa davčnega ali pravnega svetovanja. Za točnost vnesenih podatkov in pravilnost oddanih davčnih obračunov ste odgovorni vi.</p>
          <p>Naša skupna odgovornost je omejena na znesek ki ste ga plačali za storitev v zadnjih 12 mesecih.</p>

          <h2>8. Intelektualna lastnina</h2>
          <p>Programska oprema, dizajn in vsebina Računko so zaščiteni z avtorskimi pravicami. Vam podelimo osebno, neprenosljivo licenco za uporabo storitve. Kopiranje ali distribucija kode ali dizajna brez dovoljenja ni dovoljena.</p>

          <h2>9. Prekinitev storitve</h2>
          <p><strong>Vi:</strong> Račun lahko kadar koli zaprete iz Nastavitev. Pro naročnino prekličete in ne bo zaračunana od naslednjega obračunskega obdobja.</p>
          <p><strong>Mi:</strong> Pridržujemo si pravico prekiniti račun ob kršitvi teh pogojev. V primeru prekinitve brez krivde z vaše strani vam vrnemo sorazmerni del plačanega zneska.</p>

          <h2>10. Spremembe pogojev</h2>
          <p>O bistvenih spremembah pogojev vas obvestimo po emailu vsaj 30 dni vnaprej. Z nadaljnjo uporabo storitve po tem roku se strinjate z novimi pogoji.</p>

          <h2>11. Veljavno pravo</h2>
          <p>Za te pogoje velja slovensko pravo. Morebitne spore rešujemo v pristojnem sodišču v Republiki Sloveniji.</p>

          <div className="contact-box">
            <p>Vprašanja glede pogojev? Pišite nam na <a href="mailto:podpora@računko.si">podpora@računko.si</a></p>
          </div>
        </div>

        <footer className="foot">
          <span>© 2026 Računko</span>
          <a href="/privacy">Zasebnost</a>
          <a href="/terms">Pogoji</a>
          <a href="/">Domov</a>
        </footer>
      </div>
    </>
    </AppLayout>
  )
}
