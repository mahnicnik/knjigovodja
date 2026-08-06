'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

interface HelpStep {
  icon: string
  title: string
  desc: string
}

interface PageHelpContent {
  title: string
  description: string
  steps: HelpStep[]
  tip?: string
}

const PAGE_HELP: Record<string, PageHelpContent> = {
  '/invoices': {
    title: 'Izdani računi',
    description: 'Pregled vseh vaših izdanih računov. Tukaj vidite status plačil, pošljete račune strankam in sledite zapadlim terjatvam.',
    steps: [
      { icon: '➕', title: 'Nov račun', desc: 'Kliknite "Nov račun" da ustvarite novega. Vnesite stranko, postavke in datum.' },
      { icon: '📧', title: 'Pošljite po emailu', desc: 'Kliknite na račun → Pošlji. Stranka prejme PDF po emailu (samo Pro).' },
      { icon: '✅', title: 'Označite kot plačano', desc: 'Ko stranka plača, označite račun kot plačan — posodobi se KPO knjiga.' },
      { icon: '⚠️', title: 'Zapadli računi', desc: 'Rdeče označeni računi so zapadli. Pošljite opomin ali kontaktirajte stranko.' },
    ],
    tip: 'Računko avtomatsko številči račune po zaporedju in jih shrani v KPO knjigo prihodkov.',
  },
  '/invoices/new': {
    title: 'Nov račun',
    description: 'Ustvarite nov izhodnji račun za vašo stranko.',
    steps: [
      { icon: '🏢', title: 'Vnesite stranko', desc: 'Vpišite davčno številko stranke in pritisnite Enter — podatki se izpolnijo samodejno iz AJPES.' },
      { icon: '📋', title: 'Dodajte postavke', desc: 'Opišite storitev/blago, vnesite količino in ceno. Dodajte popust % če je potrebno.' },
      { icon: '📅', title: 'Datum in rok', desc: 'Nastavite datum izdaje in rok plačila (privzeto 15 dni).' },
      { icon: '💾', title: 'Shranite ali pošljite', desc: 'Osnutek shranite za kasneje, ali takoj pošljite stranki po emailu.' },
    ],
    tip: 'DDV se izračuna samodejno glede na vašo DDV registracijo.',
  },
  '/expenses': {
    title: 'Stroški in prejeti računi',
    description: 'Evidentirajte vse vaše poslovne stroške — prejete račune, nakupe, stroške poslovanja.',
    steps: [
      { icon: '➕', title: 'Dodajte strošek', desc: 'Kliknite "Dodaj strošek" in vnesite dobavitelja, znesek in kategorijo.' },
      { icon: '📄', title: 'Skenirajte račun', desc: 'Pojdite na "Skeniraj račun" → AI samodejno izpolni podatke iz fotografije/PDF-ja (samo Pro).' },
      { icon: '🏷️', title: 'Kategorije', desc: 'Pravilna kategorija pomaga pri DDV obračunu in poslovnih poročilih.' },
      { icon: '✏️', title: 'Urejanje', desc: 'Kliknite na katerikoli strošek v seznamu da ga uredite ali popravite.' },
    ],
    tip: 'DDV vhod se samodejno upošteva pri mesečnem DDV obračunu.',
  },
  '/prispevki': {
    title: 'Prispevki s.p.',
    description: 'Mesečni prispevki za socialno varnost (ZPIZ, ZZZS, zaposlovanje, starševstvo) in akontacija dohodnine.',
    steps: [
      { icon: '📊', title: 'Preverite zneske', desc: 'Znesek prispevkov je odvisen od vaše prispevne osnove (razred). Preverite v nastavitvah.' },
      { icon: '📱', title: 'Skenirajte QR kodo', desc: 'Vsaka kartica ima UPN QR kodo — skenirajte jo v mobilni banki za hitro plačilo.' },
      { icon: '📅', title: 'Rok plačila', desc: 'Prispevki morajo biti plačani do 15. v mesecu za pretekli mesec.' },
      { icon: '⚙️', title: 'Popoldanski s.p.', desc: 'Če ste zaposleni drugje, nastavite zaposlovanje in starševstvo na 0€ v nastavitvah.' },
    ],
    tip: 'Prispevki se samodejno prikažejo v rokovniku z opozorilom 7 dni pred rokom.',
  },
  '/dohodnina': {
    title: 'Akontacija dohodnine',
    description: 'Kalkulator za izračun mesečne akontacije dohodnine in letne dohodninske obveznosti.',
    steps: [
      { icon: '💰', title: 'Vnesite prihodke', desc: 'Vnesite letne prihodke (YTD) ali povprečni mesečni prihodek za napoved.' },
      { icon: '💸', title: 'Vnesite odhodke', desc: 'Dejanski poslovni stroški zmanjšajo davčno osnovo.' },
      { icon: '👨‍👩‍👧', title: 'Vzdrževani otroci', desc: 'Dodajte vzdrževane družinske člane za davčne olajšave.' },
      { icon: '📋', title: 'Mesečna akontacija', desc: 'Izračunani znesek plačujete mesečno do 15. v mesecu skupaj s prispevki.' },
    ],
    tip: 'Dejanski znesek akontacije določi FURS z odločbo — ta kalkulator je samo ocena.',
  },
  '/ddv': {
    title: 'DDV obračun',
    description: 'Mesečni ali trimesečni obračun DDV (DDV-O obrazec).',
    steps: [
      { icon: '📊', title: 'DDV izhod', desc: 'DDV iz vaših izdanih računov — to dolgujete FURS.' },
      { icon: '📊', title: 'DDV vhod', desc: 'DDV iz vaših stroškov — to vam FURS vrne.' },
      { icon: '🧮', title: 'Razlika', desc: 'DDV izhod − DDV vhod = DDV za plačilo (ali vračilo).' },
      { icon: '📅', title: 'Rok oddaje', desc: 'DDV-O oddajte do zadnjega dne v mesecu za preteklo obdobje.' },
    ],
    tip: 'Računko samodejno zbira DDV iz vaših računov in stroškov.',
  },
  '/kpo': {
    title: 'KPO knjiga',
    description: 'Knjiga prihodkov in odhodkov — zakonsko obvezna evidenca za normirance in s.p. z normirano ugotavljanjem dohodka.',
    steps: [
      { icon: '📖', title: 'Samodejno vodenje', desc: 'Računko samodejno vnaša prihodke ob izdaji računov in odhodke ob vnosu stroškov.' },
      { icon: '🔍', title: 'Filtriranje', desc: 'Filtrirajte po mesecu, letu ali vrsti vnosa.' },
      { icon: '📥', title: 'Izvoz', desc: 'Izvozite KPO knjigo v XLSX za računovodjo ali arhiviranje.' },
    ],
    tip: 'KPO knjiga mora biti ažurna — Računko jo vzdržuje samodejno.',
  },
  '/banka': {
    title: 'Bančni uvoz',
    description: 'Uvozite bančni izpisek in samodejno povežite transakcije z vašimi računi.',
    steps: [
      { icon: '🏦', title: 'Izberite banko', desc: 'Najprej izberite vašo banko — vsaka ima drugačen format izpiska.' },
      { icon: '📄', title: 'Naložite izpisek', desc: 'Izvozite CSV ali PDF iz spletne banke in ga naložite tukaj.' },
      { icon: '🔗', title: 'Ujemanje', desc: 'Računko samodejno poišče ujemajoče račune po znesku in datumu.' },
      { icon: '✅', title: 'Potrdite', desc: 'Preverite ujemanja in potrdite — računi se označijo kot plačani.' },
    ],
    tip: 'PDF uvoz je podprt z AI ekstrakcijo (samo Pro). CSV uvoz je podprt za vse.',
  },
  '/scan': {
    title: 'Skeniraj račun',
    description: 'AI samodejno prebere fotografijo ali PDF vašega prejetega računa in izpolni podatke.',
    steps: [
      { icon: '📷', title: 'Fotografirajte ali naložite', desc: 'Poslikajte račun s telefonom ali naložite PDF/JPG/PNG datoteko.' },
      { icon: '🤖', title: 'AI analiza', desc: 'Claude AI prebere znesek, dobavitelja, datum in DDV stopnjo.' },
      { icon: '✏️', title: 'Preverite', desc: 'Preverite izpolnjene podatke in jih po potrebi popravite.' },
      { icon: '💾', title: 'Shranite', desc: 'Strošek se shrani v vašo evidenco in KPO knjigo.' },
    ],
    tip: 'Skeniranje je na voljo samo v Pro paketu. Podprto: JPG, PNG, PDF, HEIC (iPhone).',
  },
  '/cas': {
    title: 'Evidenca časa',
    description: 'Sledite delovnim uram po projektih in strankah. Samodejno ustvarite račune iz opravljenih ur.',
    steps: [
      { icon: '⏱️', title: 'Zabeležite ure', desc: 'Kliknite "Nov vnos" in vpišite ure, projekt in stranko.' },
      { icon: '💰', title: 'Urna postavka', desc: 'Nastavite urno postavko za zaračunljive ure.' },
      { icon: '📊', title: 'Mesečna norma', desc: 'Progress bar prikazuje opravljene ure proti 176h mesečni normi.' },
      { icon: '🧾', title: 'Ustvarite račun', desc: 'Iz opravljenih ur direktno ustvarite račun stranki.' },
    ],
    tip: 'Ure nad 176h/mesec so prikazane kot nadure.',
  },
  '/place': {
    title: 'Zaposleni in plače',
    description: 'Evidenca zaposlenih, obračun plač, regres in letni dopust.',
    steps: [
      { icon: '👤', title: 'Dodajte zaposlenega', desc: 'Vnesite ime, davčno številko, IBAN in bruto plačo.' },
      { icon: '💰', title: 'Obračun plače', desc: 'Računko samodejno izračuna prispevke delojemalca in delodajalca.' },
      { icon: '📄', title: 'REK-1 XML', desc: 'Prenesite REK-1 datoteko za oddajo na FURS.' },
      { icon: '🏖️', title: 'Regres in dopust', desc: 'Sledite izplačilu regresa in dnevih letnega dopusta.' },
    ],
    tip: 'Bruto plačo za posamezen mesec lahko ročno spremenite brez spremembe privzete vrednosti.',
  },
  '/avansni-racuni': {
    title: 'Avansni računi',
    description: 'Izdajte avansni račun pred opravljeno storitvijo, nato finalni račun z odbitkom avansa.',
    steps: [
      { icon: '📋', title: 'Nov avansni račun', desc: 'Vnesite stranko, skupno vrednost pogodbe in delež avansa (%).' },
      { icon: '💰', title: 'Stranka plača avans', desc: 'Stranka plača avansni račun kot predplačilo.' },
      { icon: '✅', title: 'Finalni račun', desc: 'Ko je storitev opravljena, ustvarite finalni račun — avans se samodejno odšteje.' },
    ],
    tip: 'Finalni račun prikaže celotno vrednost, odbitek avansa in preostanek za plačilo.',
  },
  '/predracuni': {
    title: 'Predračuni',
    description: 'Pošljite ponudbo stranki pred izdajo računa. Ko je potrjena, jo pretvorite v račun.',
    steps: [
      { icon: '📝', title: 'Ustvarite predračun', desc: 'Enako kot račun — stranka, postavke, cene.' },
      { icon: '📧', title: 'Pošljite stranki', desc: 'Stranka dobi PDF predračun po emailu.' },
      { icon: '🔄', title: 'Pretvorite v račun', desc: 'Ko je ponudba sprejeta, s klikom pretvorite predračun v račun.' },
    ],
    tip: 'Predračun ni davčni dokument — za to potrebujete pravi račun.',
  },
  '/dobavnice': {
    title: 'Dobavnice',
    description: 'Izdajte dobavnico za dobavo blaga — kot dokazilo o prevzemu.',
    steps: [
      { icon: '📦', title: 'Nova dobavnica', desc: 'Vnesite prejemnika in blago ki ga dobavljate.' },
      { icon: '🖨️', title: 'Natisnite ali pošljite', desc: 'Pošljite PDF prejemniku ali natisnite za fizični podpis.' },
    ],
    tip: 'Dobavnica ni davčni dokument — za zaračunavanje potrebujete ločen račun.',
  },
  '/potni-nalogi': {
    title: 'Potni nalogi',
    description: 'Evidentirajte službena potovanja in izračunajte kilometrino ter dnevnice.',
    steps: [
      { icon: '🚗', title: 'Nov potni nalog', desc: 'Vnesite destinacijo, namen in tip prevoza.' },
      { icon: '📏', title: 'Kilometrina', desc: 'Za lastni avto vpišite km — Računko izračuna povračilo po zakonski stopnji.' },
      { icon: '🍽️', title: 'Dnevnice', desc: 'Dodajte dnevnice glede na trajanje potovanja.' },
    ],
    tip: 'Potni nalogi morajo biti shranjeni za davčno evidenco.',
  },
  '/integracije': {
    title: 'Integracije',
    description: 'Povežite Računko z vašo spletno trgovino ali aplikacijo za avtomatsko izdajanje računov.',
    steps: [
      { icon: '🛒', title: 'WooCommerce', desc: 'Ob vsakem naročilu v WooCommerce se samodejno ustvari račun v Računko.' },
      { icon: '🏪', title: 'Shopify', desc: 'Enako za Shopify trgovine — webhook ob plačanem naročilu.' },
      { icon: '💳', title: 'Stripe', desc: 'Za lastne aplikacije ki pobirajo plačila prek Stripe — račun ob vsakem plačilu.' },
    ],
    tip: 'Vsaka integracija potrebuje webhook URL in signing secret — navodila so pri vsaki kartici.',
  },
  '/nastavitve': {
    title: 'Nastavitve podjetja',
    description: 'Nastavite podatke vašega podjetja, bančne podatke, prispevke in vse ostale parametre.',
    steps: [
      { icon: '🏢', title: 'Podatki podjetja', desc: 'Ime, naslov, davčna številka — prikazani na vseh računih.' },
      { icon: '🏦', title: 'Bančni podatki', desc: 'IBAN in BIC za prikaz na računih in UPN nalogih.' },
      { icon: '📊', title: 'Prispevki', desc: 'Nastavite mesečne prispevke glede na vašo prispevno osnovo.' },
      { icon: '💳', title: 'Naročnina', desc: 'Upravljajte vašo Računko naročnino in zamenjajte paket.' },
    ],
    tip: 'Pravilno izpolnjeni podatki podjetja so zakonska zahteva na računih.',
  },
  '/statistika': {
    title: 'Statistika',
    description: 'Pregled prihodkov, odhodkov in DDV po mesecih in letih.',
    steps: [
      { icon: '📈', title: 'Mesečni pregled', desc: 'Graf prihodkov in odhodkov po mesecih za tekoče leto.' },
      { icon: '🏆', title: 'Top stranke', desc: 'Katere stranke generirajo največ prihodkov.' },
      { icon: '📊', title: 'DDV analiza', desc: 'DDV izhod, vhod in neto obveznost po mesecih.' },
    ],
    tip: 'Statistika se posodablja v realnem času ob vsaki novi transakciji.',
  },
  '/regres': {
    title: 'Regres',
    description: 'Evidenca in izračun regresa za letni dopust zaposlenih.',
    steps: [
      { icon: '📅', title: 'Rok', desc: 'Regres mora biti izplačan do 1. julija tekočega leta.' },
      { icon: '💰', title: 'Minimalni znesek', desc: 'Minimalni regres je enak minimalni plači (€1.253,90 za 2026).' },
      { icon: '📄', title: 'Obdavčitev', desc: 'Del regresa je neobdavčen (do 126% minimalne plače).' },
    ],
    tip: 'Regres se izračuna proporcionalno glede na delovno dobo v tekočem letu.',
  },
  '/dopust': {
    title: 'Letni dopust',
    description: 'Evidenca koriščenja letnega dopusta in bolniških odsotnosti zaposlenih.',
    steps: [
      { icon: '🏖️', title: 'Dodajte odsotnost', desc: 'Vpišite zaposlenega, vrsto odsotnosti in datume.' },
      { icon: '📊', title: 'Pregled', desc: 'Vidite koliko dni dopusta je koristil vsak zaposleni.' },
    ],
    tip: 'Minimalni letni dopust je 4 tedne (20 dni). Nastavljivo pri vsakem zaposlenem.',
  },
  '/ai': {
    title: 'AI računovodja',
    description: 'Postavite vprašanje o slovenskem davčnem pravu, s.p. obveznostih ali računovodstvu.',
    steps: [
      { icon: '💬', title: 'Postavite vprašanje', desc: 'Npr: "Kdaj moram oddati DDV-O?", "Kaj je normiranec?", "Kako prijavim stroške mobilnega telefona?"' },
      { icon: '📚', title: 'Kontekst', desc: 'AI pozna vaše podatke (prihodki, DDV status) za natančnejše odgovore.' },
      { icon: '⚠️', title: 'Opozorilo', desc: 'AI je pomočnik — za uradno davčno svetovanje se posvetujte z računovodjo.' },
    ],
    tip: 'AI računovodja je na voljo samo v Pro paketu.',
  },
  '/pos': {
    title: 'POS blagajna',
    description: 'Celoten sistem za prodajo, mize, zaloge in blagajniško poslovanje na enem mestu.',
    steps: [
      { icon: '🪑', title: 'Prostori', desc: 'Kliknite na mizo da začnete naročilo — artikli se avtomatsko shranijo na to mizo, tudi če preklopite na drugo.' },
      { icon: '🛒', title: 'Prodaja / Hitra prodaja', desc: 'Izberite artikle iz kategorij ali poiščite po imenu/šifri. "Hitra prodaja" je za prodajo brez mize (npr. bar).' },
      { icon: '💳', title: 'Plačilo', desc: 'V košarici kliknite "Plačaj" — izberite gotovino ali kartico. Račun se davčno potrdi pri FURS samodejno.' },
      { icon: '💾', title: 'Shrani / Odloži', desc: '"Shrani" odloži naročilo za kasneje (npr. gost še ni plačal) — najdete ga nazaj pod "Naročila".' },
      { icon: '👥', title: 'Zaposleni & PIN', desc: 'Vsak zaposleni ima svoj PIN za prijavo v blagajno (Nastavitve → Zaposleni & PIN).' },
      { icon: '📦', title: 'Kategorije & Artikli', desc: 'Dodajajte artikle ročno ali z AI uvozom cenika (naložite fotografijo/PDF cenika).' },
      { icon: '🔒', title: 'Odpri/Zaključi blagajno', desc: 'Na začetku dneva odprite blagajno z začetnim stanjem gotovine, na koncu jo zaključite (Z-poročilo) — promet se avtomatsko prenese v KPO knjigo.' },
    ],
    tip: 'Za pravilno FURS potrjevanje mora biti naložen veljaven TaxCA certifikat v Nastavitve → FURS & DDV.',
  },
}

const DEFAULT_HELP: PageHelpContent = {
  title: 'Pomoč',
  description: 'Računko — pametno računovodstvo za slovensko s.p.',
  steps: [
    { icon: '📊', title: 'Dashboard', desc: 'Pregled vseh ključnih KPI-jev na enem mestu.' },
    { icon: '🧾', title: 'Računi', desc: 'Izdajajte račune, sledite plačilom.' },
    { icon: '💸', title: 'Stroški', desc: 'Evidentirajte prejete račune in stroške.' },
    { icon: '📅', title: 'Davki', desc: 'DDV, prispevki, dohodnina — vse na enem mestu.' },
  ],
  tip: 'Za pomoč pišite na support@racunko.si',
}

export default function PageHelp() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const help = PAGE_HELP[pathname] || DEFAULT_HELP

  return (
    <>
      {/* Floating gumb */}
      {/* DODANO (30.7.2026): className "pagehelp-fab" za mobilno
          medijsko poizvedbo spodaj - na ozkih zaslonih se premakne, da ne
          prekriva vsebine kartic (prej fiksno bottom:100/left:24 povsod). */}
      <style>{`
        @media (max-width: 480px) {
          .pagehelp-fab {
            bottom: 16px !important;
            right: 16px !important;
            left: auto !important;
            width: 40px !important;
            height: 40px !important;
          }
        }
      `}</style>
      <button
        className="pagehelp-fab"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 100,
          left: 24,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#0D1F12',
          color: '#E8B547',
          border: 'none',
          fontSize: 20,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 500,
          transition: 'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        title="Pomoč"
      >
        ?
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
            padding: 24, zIndex: 2000,
          }}
        >
          <div style={{
            background: '#fff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 420,
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: 28,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>{help.title}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4, lineHeight: 1.5 }}>{help.description}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 0 0 12px', flexShrink: 0 }}
              >×</button>
            </div>

            {/* Koraki */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {help.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#0D1F12', color: '#E8B547',
                    display: 'grid', placeItems: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 15 }}>{step.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{step.title}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tip */}
            {help.tip && (
              <div style={{
                marginTop: 16, background: '#E1F5EE', borderRadius: 8,
                padding: '10px 14px', fontSize: 12, color: '#0E5E3B', lineHeight: 1.6,
              }}>
                💡 {help.tip}
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid #f0f0f0', fontSize: 11, color: '#bbb', textAlign: 'center' }}>
              Potrebujete dodatno pomoč? <a href="mailto:support@racunko.si" style={{ color: '#1D9E75' }}>support@racunko.si</a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
