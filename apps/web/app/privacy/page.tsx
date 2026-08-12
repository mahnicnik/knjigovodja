import Link from 'next/link'
import AppLayout from '@/components/AppLayout'

export default function PrivacyPage() {
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
        .tag{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;background:#E8F5EE;color:#085041;margin-bottom:16px}
        h1{font-size:32px;font-weight:500;color:#111;letter-spacing:-.5px;margin-bottom:8px}
        .date{font-size:13px;color:#aaa;margin-bottom:40px}
        h2{font-size:18px;font-weight:500;color:#111;margin:32px 0 10px}
        p{font-size:14px;color:#444;line-height:1.75;margin-bottom:12px}
        ul{padding-left:20px;margin-bottom:12px}
        li{font-size:14px;color:#444;line-height:1.75;margin-bottom:4px}
        .divider{border:none;border-top:0.5px solid #EBEBEB;margin:32px 0}
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
          <h1>Politika zasebnosti</h1>
          <p className="date">Zadnja posodobitev: maj 2026</p>

          <p>Računko (v nadaljevanju "mi", "naša storitev") se zavezuje k varstvu vaših osebnih podatkov. Ta politika zasebnosti pojasnjuje, katere podatke zbiramo, kako jih uporabljamo in kakšne pravice imate kot uporabnik.</p>

          <hr className="divider" />

          <h2>1. Upravljalec podatkov</h2>
          <p>Upravljalec osebnih podatkov je Računko, dostopen na <strong>računko.si</strong>. Za vprašanja v zvezi z zasebnostjo nas kontaktirajte na <strong>podpora@računko.si</strong>.</p>

          <h2>2. Katere podatke zbiramo</h2>
          <p>Zbiramo naslednje kategorije podatkov:</p>
          <ul>
            <li><strong>Podatki računa:</strong> ime, email naslov, geslo (šifrirano)</li>
            <li><strong>Podatki podjetja:</strong> naziv, davčna številka, naslov, IBAN, pravna oblika</li>
            <li><strong>Poslovni podatki:</strong> računi, stroški, zaposleni, plačilni podatki ki jih sami vnesete</li>
            <li><strong>Tehnični podatki:</strong> IP naslov, tip brskalnika, čas dostopa (za varnost)</li>
          </ul>

          <h2>2a. Dostop do Gmail (e-mail skeniranje stroškov)</h2>
          <p>Če se v aplikaciji odločite povezati svoj Gmail račun preko funkcije "E-mail skeniranje", Računko z vašim izrecnim dovoljenjem (preko Google OAuth) pridobi <strong>samo bralni dostop</strong> (gmail.readonly) do vaše e-pošte, in sicer izključno za naslednji namen:</p>
          <ul>
            <li>Iskanje e-mail sporočil s PDF prilogami, ki vsebujejo ključne besede kot so "račun", "invoice", "faktura" ali "receipt"</li>
            <li>Prenos in analiza teh PDF prilog z umetno inteligenco (Anthropic Claude), da se izluščijo podatki o stroških (dobavitelj, znesek, datum, DDV)</li>
            <li>Prikaz izluščenih podatkov v vaši čakalni vrsti za ročni pregled in potrditev — noben podatek se ne vnese v vašo evidenco brez vaše izrecne potrditve</li>
          </ul>
          <p>Računko <strong>ne bere, ne shranjuje in ne obdeluje</strong> vsebine e-mail sporočil, ki ne ustrezajo tem kriterijem (PDF priloga + ključne besede). Dostop lahko kadarkoli prekličete v Nastavitve → E-mail skeniranje, ali preko nastavitev vašega Google računa (myaccount.google.com/permissions). Podatki, pridobljeni iz Gmaila (PDF dokumenti in izluščeni podatki), se hranijo v skladu s pravili iz točke 5 tega dokumenta.</p>
          <p>Uporaba podatkov, pridobljenih preko Google API-jev, je skladna z <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, vključno z omejitvami glede omejene uporabe (Limited Use).</p>
          <h2>3. Namen obdelave podatkov</h2>
          <p>Vaše podatke obdelujemo za naslednje namene:</p>
          <ul>
            <li>Zagotavljanje storitve Računko (vodenje računov, stroški, davki)</li>
            <li>Pošiljanje transakcijskih emailov (potrditev registracije, opomniki)</li>
            <li>Izboljševanje aplikacije na podlagi anonimnih analitičnih podatkov</li>
            <li>Pravna obveznost arhiviranja</li>
          </ul>

          <h2>4. Pravna podlaga</h2>
          <p>Podatke obdelujemo na podlagi:</p>
          <ul>
            <li><strong>Pogodbe:</strong> za izvajanje storitve ki ste jo naročili</li>
            <li><strong>Zakonitega interesa:</strong> za varnost in preprečevanje zlorab</li>
            <li><strong>Privolitve:</strong> za marketinška sporočila (le z vašo izrecno privolitvijo)</li>
          </ul>

          <h2>5. Hramba podatkov</h2>
          <p>Podatke hranimo dokler imate aktiven račun. Po zaprtju računa izbrišemo osebne podatke v roku 30 dni, razen podatkov ki jih moramo hraniti po zakonu (npr. računovodski dokumenti — 10 let po slovenskem pravu).</p>

          <h2>6. Delitev podatkov s tretjimi stranmi</h2>
          <p>Vaših podatkov ne prodajamo. Podatke delimo le z naslednjimi pogodbenimi obdelovalci:</p>
          <ul>
            <li><strong>Supabase</strong> — hramba podatkov (EU strežniki)</li>
            <li><strong>Vercel</strong> — gostovanje aplikacije (EU strežniki)</li>
            <li><strong>Resend</strong> — pošiljanje transakcijskih emailov</li>
            <li><strong>Anthropic</strong> — AI računovodja (vaša vprašanja, brez shranjevanja)</li>
            <li><strong>Google (Gmail API)</strong> — samo če se odločite povezati Gmail za e-mail skeniranje stroškov (glejte točko 2a)</li>
          </ul>

          <h2>7. Varnost podatkov</h2>
          <p>Vaši podatki so zaščiteni z:</p>
          <ul>
            <li>Šifriranjem v prenosu (HTTPS/TLS)</li>
            <li>Row Level Security — tehnično nemogoče da drug uporabnik vidi vaše podatke</li>
            <li>Šifriranimi gesli (bcrypt)</li>
            <li>Rednimi varnostnimi pregledi</li>
          </ul>

          <h2>8. Vaše pravice (GDPR)</h2>
          <p>Kot uporabnik v EU imate naslednje pravice:</p>
          <ul>
            <li><strong>Dostop:</strong> zahtevate kopijo vaših podatkov</li>
            <li><strong>Popravek:</strong> popravek napačnih podatkov</li>
            <li><strong>Izbris:</strong> "pravica do pozabe" — izbrišemo vaše podatke</li>
            <li><strong>Prenosljivost:</strong> izvoz podatkov v standardnem formatu</li>
            <li><strong>Ugovor:</strong> ugovor obdelavi za nekatere namene</li>
          </ul>
          <p>Za uveljavljanje pravic pišite na <strong>podpora@računko.si</strong>. Odgovorimo v 30 dneh.</p>

          <h2>9. Piškotki</h2>
          <p>Računko uporablja samo nujno potrebne funkcionalne piškotke (seja, avtentikacija). Ne uporabljamo sledilnih ali oglaševalskih piškotkov.</p>

          <h2>10. Spremembe politike</h2>
          <p>O pomembnih spremembah vas obvestimo po emailu vsaj 30 dni vnaprej. Datum zadnje posodobitve je naveden na vrhu tega dokumenta.</p>

          <div className="contact-box">
            <p>Vprašanja glede zasebnosti? Pišite nam na <a href="mailto:podpora@računko.si">podpora@računko.si</a></p>
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
