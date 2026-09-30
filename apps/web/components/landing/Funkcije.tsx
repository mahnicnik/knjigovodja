import s from './landing.module.css'
import { IME } from './ime'
import { Kljukica, Ura } from './Ikone'
import Posnetek from './Posnetek'
import { formatCas, opravilo, type Opravilo } from '@/lib/landing-raziskava'

type Blok = {
  naslov: string
  /** Opravilo iz raziskave, iz katerega pride vrstica s prihrankom. */
  opravilo?: Opravilo['id']
  besedilo: string
  seznam: string[]
  posnetek: string
  pot: string
  alt: string
  telefon?: { ime: string; alt: string }
  /** Posebna slika namesto posnetka v okvirju brskalnika. */
  vrsta?: 'dokument' | 'skener'
}

const racun = opravilo('racun')

const BLOKI: Blok[] = [
  {
    // TODO: podatek iz raziskave - naslov dobi cas izdaje racuna, ko je vpisan.
    naslov: racun.zdajMin != null ? `Račun izdate v ${formatCas(racun.zdajMin)}` : 'Račun izdate, preden stranka odide',
    opravilo: 'racun',
    besedilo: 'Izberete stranko in artikle. Račun je davčno potrjen pri FURS, stranka ga dobi po e-pošti.',
    seznam: ['Potrditev pri FURS ob izdaji — ZOI, EOR in QR za preverjanje', 'UPN QR koda za plačilo na TRR', 'Vaš logotip na računu', 'e-račun v obliki e-SLOG 2.0', 'Ponavljajoči se računi in opomini'],
    // PRELET 343: pravi PDF iz predloge racuna (lib/invoice-pdf.tsx) z
    // izmisljenimi podatki - tak racun dobi stranka.
    posnetek: 'racun', pot: '', vrsta: 'dokument', alt: '',
  },
  {
    naslov: `Stroške fotografirate. Vnos naredi ${IME}.`,
    opravilo: 'strosek',
    besedilo: `Fotografirate račun ali ga posredujete po e-pošti. ${IME} prebere dobavitelja, znesek in DDV ter ga razvrsti. Vi potrdite.`,
    seznam: ['Skener s telefonom ali računalnikom', 'Konto se določi samodejno — računovodja dobi že razvrščene stroške', 'Prejeti računi po e-pošti', 'Uvoz plačil iz bančnega izpiska'],
    posnetek: 'skener-mobilni', pot: '/scan', vrsta: 'skener',
    alt: 'Telefon nad blagajniškim računom: Računko je prebral dobavitelja, znesek, DDV in določil konto',
  },
  {
    naslov: 'Davke in prispevke veste vnaprej',
    opravilo: 'zakljucek',
    besedilo: 'Nadzorna plošča pokaže prihodke, stroške, neto dohodek in DDV za tekoče obdobje ter koliko boste plačali in kdaj.',
    seznam: ['Neto prihodki, stroški in DDV na enem mestu', 'Prispevki in akontacija izračunani sproti', 'Napoved pretoka denarja in opomniki na roke'],
    posnetek: 'davki', pot: '/dashboard', alt: 'Pregled davkov, prispevkov in napoved pretoka denarja',
  },
  {
    naslov: 'Blagajna, ki dela tudi brez interneta',
    opravilo: 'blagajna',
    besedilo: 'Ob izpadu povezave blagajna izda račun z zaščitno oznako in ga prijavi pri FURS, ko se povezava vrne.',
    seznam: ['Mize, tloris in delitev računa', 'Zaloge z normativi', 'Dnevni zaključek z enim klikom'],
    posnetek: 'blagajna', pot: '/pos', alt: 'Blagajna s kategorijami, priljubljenimi artikli in košarico',
  },
  {
    naslov: 'Člani, paketi in termini',
    besedilo: 'Za fitnes, studie in storitve. Člani imajo pakete in naročnine, termini so v koledarju, obisk se odšteje na blagajni.',
    seznam: ['Mesečne naročnine in paketi obiskov', 'Terminski koledar', 'Dostopi za trenerje in osebje'],
    posnetek: 'koledar', pot: '/pos', alt: 'Tedenski urnik terminov s strankami, storitvami in osebjem',
  },
]

function Prihranek({ id }: { id?: Opravilo['id'] }) {
  if (!id) return null
  const o = opravilo(id)
  if (o.prejMin == null || o.zdajMin == null) return null /* TODO: podatek iz raziskave */
  return (
    <p className={s.prihranek}>
      <Ura />
      <span className={s.stevilke}>Prej {formatCas(o.prejMin)}, zdaj <span className={s.marker}>{formatCas(o.zdajMin)}</span></span>
    </p>
  )
}

export default function Funkcije() {
  return (
    <section className={s.sekcija} id="funkcije" aria-labelledby="funkcije-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="funkcije-naslov" className={s.h2}>Opravila, ki jih ne delate več ročno</h2>
        </div>
        <div className={s.funkcije}>
          {BLOKI.map((b, i) => (
            <article key={b.posnetek} className={i % 2 ? s.funkcijaObrnjena : s.funkcija} data-razkrij>
              <div className={s.funkcijaBesedilo}>
                <h3 className={s.h3}>{b.naslov}</h3>
                <Prihranek id={b.opravilo} />
                <p className={s.uvod}>{b.besedilo}</p>
                <ul className={s.seznam}>
                  {b.seznam.map(t => <li key={t}><Kljukica className={s.kljukica} />{t}</li>)}
                </ul>
              </div>
              <div className={s.funkcijaSlika}>
                {b.vrsta === 'dokument' ? (
                  <>
                    <div className={s.dokumenti}>
                      <div className={`${s.dokument} ${s.dokumentZadaj}`}>
                        <Posnetek ime="racun" okvir="brez" alt="Primer računa za plačilo na TRR: postavke s popustom, DDV in UPN QR koda" sizes="(max-width: 900px) 64vw, 360px" />
                      </div>
                      <div className={`${s.dokument} ${s.dokumentSpredaj}`}>
                        <Posnetek ime="racun-furs" okvir="brez" alt="Primer davčno potrjenega računa z ZOI, EOR in kodo QR za preverjanje pri FURS" sizes="(max-width: 900px) 64vw, 360px" />
                      </div>
                    </div>
                    <p className={s.dokumentNapis}>Primera računov z izmišljenimi podatki — za plačilo na TRR z UPN QR in davčno potrjen z ZOI in EOR.</p>
                  </>
                ) : b.vrsta === 'skener' ? (
                  <div className={s.skener}>
                    <div className={s.skenerPapir}>
                      <Posnetek ime="blok-papir" okvir="brez" alt="" sizes="(max-width: 900px) 46vw, 280px" />
                    </div>
                    <span className={s.skenerZarek} aria-hidden="true" />
                    <div className={s.skenerTelefon}>
                      <Posnetek ime={b.posnetek} okvir="telefon" alt={b.alt} sizes="(max-width: 900px) 52vw, 290px" />
                    </div>
                  </div>
                ) : (
                  <Posnetek ime={b.posnetek} pot={b.pot} alt={b.alt} sizes="(max-width: 900px) 92vw, 640px" />
                )}
                {b.telefon && (
                  <div className={s.funkcijaTelefon}>
                    <Posnetek ime={b.telefon.ime} okvir="telefon" alt={b.telefon.alt} sizes="(max-width: 900px) 30vw, 200px" />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 64, textAlign: 'center' }}>
          <a href="/funkcije" className={s.gumbSekundarni}>Vse funkcije</a>
        </p>
      </div>
    </section>
  )
}
