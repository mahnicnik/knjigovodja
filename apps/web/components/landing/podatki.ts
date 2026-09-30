import { IME, IME_M, IME_O } from './ime'

/**
 * VSEBINA ZACETNE STRANI (prelet 342)
 * Paketi, cene in odgovori so preneseni iz prejsnje strani - brez emojijev
 * in brez primerjanja z racunovodjo.
 */

export type PaketId = 'brezplacno' | 'pro' | 'pos'

export type Paket = {
  id: PaketId
  ime: string
  /** Cena na mesec pri mesecnem placilu. */
  mesecno: number
  /** Cena na leto pri letnem placilu (dva meseca brezplacno). */
  letno: number
  opis: string
  funkcije: string[]
  poudarjen?: boolean
}

// PRELET 251: 12,99 mesecno, 129,90 letno - dva meseca brezplacno.
export const PAKETI: Paket[] = [
  {
    id: 'brezplacno', ime: 'Brezplačno', mesecno: 0, letno: 0,
    opis: 'Za izdajanje računov, brez omejitve števila.',
    funkcije: ['Neomejeni računi', 'FURS davčno potrjevanje', 'PDF prenos', 'Prispevki in UPN QR', 'AI pomočnik za vprašanja'],
  },
  {
    id: 'pro', ime: 'Pro', mesecno: 12.99, letno: 129.90, poudarjen: true,
    opis: 'Za aktivnega s.p., ki ne želi prepisovati stroškov.',
    funkcije: ['Neomejeni računi in predračuni', 'Fotografirate račun, Računko ga prebere', 'Glasovni vnos računa', 'AI pomočnik za vprašanja o davkih', 'Uvoz plačil iz bančnega izpiska', 'e-račun (e-SLOG) za B2B', 'Evidenca DDV in KPO knjiga', 'Izvoz za Vasco in Pantheon'],
  },
  {
    id: 'pos', ime: 'Pro + POS', mesecno: 29.99, letno: 299.90,
    opis: 'Za lokale, studie in vse, ki sprejemajo gotovino.',
    funkcije: ['Vse iz paketa Pro', 'Blagajna z mizami in tlorisom', 'Delitev računa in popusti', 'Delo brez povezave do 2 dni', 'Kuhinjski zaslon in odrezki', 'Fotografirate dobavnico, zaloga se posodobi', 'Zaloge z normativi in inventuro', 'Člani, paketi in terminski koledar', 'Ekipa s PIN prijavo', 'Namizna in mobilna aplikacija'],
  },
]

export const fmtEur = (n: number) =>
  n.toLocaleString('sl-SI', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'

export type Persona = {
  naslov: string
  kdo: string
  opravila: string[]
  paket: PaketId
}

export const PERSONE: Persona[] = [
  {
    naslov: 'Freelancer in normiranec',
    kdo: 'Svetovalci, razvijalci, fotografi, oblikovalci',
    opravila: ['Račun z UPN QR kodo', 'Prispevki izračunani vsak mesec', 'Normirani odhodki in akontacija', 'Evidenca DDV za zavezance'],
    paket: 'pro',
  },
  {
    naslov: 'Gostinstvo in lokali',
    kdo: 'Kavarne, restavracije, frizerji, obrtniki',
    opravila: ['Davčna blagajna z mizami', 'Delo brez interneta', 'Dnevni zaključek z enim klikom', 'Zaloge in normativi'],
    paket: 'pos',
  },
  {
    naslov: 'Fitnes in zdravje',
    kdo: 'Fitnesi, fizioterapevti, masaža, joga',
    opravila: ['Člani in mesečne naročnine', 'Terminski koledar', 'Dostopi za trenerje', 'Ponavljajoči se računi'],
    paket: 'pos',
  },
]

// VPRASANJA IN ODGOVORI (prelet 250, prenos v prelet 342)
// Odgovori so KRATKI IN DEJSTVENI, ne prodajni: iskalnik in AI pomocnik
// navedeta vir, ki mu lahko zaupata. Isti seznam gre tudi v JSON-LD.
export const VPRASANJA: [string, string][] = [
  ['Ali potrebujem davčno blagajno za lokal?',
    'Da. Če za blago ali storitev prejmete gotovino, kartico ali drugo neposredno plačilo, mora biti račun davčno potrjen pri FURS. To velja za bare, kavarne, restavracije, frizerske salone in fitnes studie. Za plačila na transakcijski račun potrjevanje ni potrebno.'],
  ['Kaj potrebujem, da začnem izdajati davčno potrjene račune?',
    `Troje: digitalno potrdilo FURS, prijavljen poslovni prostor in sprejet interni akt o številčenju. Vse troje uredite v ${IME_M}; potrdilo pridobite brezplačno prek eDavkov.`],
  ['Ali blagajna deluje brez interneta?',
    `Da. Ob izpadu povezave ${IME} izda račun z zaščitno oznako ZOI in ga natisne, nato pa ga samodejno prijavi pri FURS, ko se povezava vrne. Zakonski rok za naknadno prijavo sta dva delovna dneva.`],
  ['Kdaj bodo e-računi med podjetji obvezni?',
    `Od 1. januarja 2028. Zakon ZIERDED, sprejet oktobra 2025, zahteva strukturirano obliko (e-SLOG ali skladno z EN 16931) in prepoveduje izmenjavo po e-pošti. ${IME} že zdaj izvozi e-račun v obliki e-SLOG 2.0.`],
  ['Ali lahko podatke pošljem svojemu računovodji?',
    `Da. ${IME} izvozi račune, stroške, KPO in evidenco DDV v obliki, ki jo prebere računovodski program — Vasco, Pantheon ali Opal. Vaš računovodja lahko dobi tudi lasten dostop do vaših podatkov.`],
  ['Kako varni so moji podatki?',
    'Vsi podatki so shranjeni na strežnikih v Evropski uniji, v skladu z GDPR. Varnostne kopije se naredijo vsakih 24 ur. Vaših podatkov brez vaše privolitve ne delimo s tretjimi osebami.'],
  ['Koliko stane?',
    'Brezplačni paket za osnovno izdajanje računov. Pro stane 12,99 € na mesec, Pro + POS z blagajno 29,99 €. Letno plačilo pomeni dva meseca brezplačno. Brez vezave.'],
  ['Kateri paket je pravi za mene?',
    `Brezplačno, če izdajate račune in drugo urejate sami. Pro, če želite, da ${IME} bere stroške, uvaža bančne izpiske in vodi KPO ter DDV. Pro + POS, če sprejemate gotovino ali kartice na mestu, vodite člane ali zaloge. Paket lahko zamenjate kadarkoli.`],
  ['Ali deluje za DDV zavezance?',
    `Da. ${IME} vodi evidenco DDV in pripravi obračun DDV-O. Z ${IME_O} to delate sproti, ne na koncu obdobja.`],
]
