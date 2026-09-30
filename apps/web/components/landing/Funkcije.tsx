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
}

const racun = opravilo('racun')

const BLOKI: Blok[] = [
  {
    // TODO: podatek iz raziskave - naslov dobi cas izdaje racuna, ko je vpisan.
    naslov: racun.zdajMin != null ? `Račun izdate v ${formatCas(racun.zdajMin)}` : 'Račun izdate, preden stranka odide',
    opravilo: 'racun',
    besedilo: 'Izberete stranko in artikle. Račun je davčno potrjen pri FURS, stranka ga dobi po e-pošti.',
    seznam: ['Potrditev pri FURS ob izdaji', 'UPN QR koda na vsakem PDF-u', 'e-račun v obliki e-SLOG 2.0', 'Ponavljajoči se računi in opomini'],
    posnetek: 'racun', pot: '/invoices/new', alt: 'Izdaja novega računa: stranka, postavke, DDV in skupni znesek',
  },
  {
    naslov: `Stroške fotografirate. Vnos naredi ${IME}.`,
    opravilo: 'strosek',
    besedilo: `Fotografirate račun ali ga posredujete po e-pošti. ${IME} prebere dobavitelja, znesek in DDV ter ga razvrsti. Vi potrdite.`,
    seznam: ['Skener s telefonom ali računalnikom', 'Prejeti računi po e-pošti', 'Uvoz plačil iz bančnega izpiska'],
    posnetek: 'skener', pot: '/scan', alt: 'Skeniranje prejetega računa: prebrani dobavitelj, znesek in DDV',
    telefon: { ime: 'skener-mobilni', alt: 'Skeniranje računa s telefonom' },
  },
  {
    naslov: 'Davke in prispevke veste vnaprej',
    opravilo: 'zakljucek',
    besedilo: 'Nadzorna plošča pokaže, koliko boste plačali in kdaj. Napoved pretoka denarja upošteva odprte račune in prihajajoče obveznosti.',
    seznam: ['Prispevki in akontacija izračunani sproti', 'Napoved pretoka denarja', 'Opomniki na davčne roke'],
    posnetek: 'davki', pot: '/dashboard', alt: 'Pregled davkov, prispevkov in napoved pretoka denarja',
  },
  {
    naslov: 'Blagajna, ki dela tudi brez interneta',
    opravilo: 'blagajna',
    besedilo: 'Ob izpadu povezave blagajna izda račun z zaščitno oznako in ga prijavi pri FURS, ko se povezava vrne.',
    seznam: ['Mize, tloris in delitev računa', 'Zaloge z normativi', 'Dnevni zaključek z enim klikom'],
    posnetek: 'blagajna', pot: '/pos', alt: 'Blagajna z artikli, mizami in odprtim računom',
  },
  {
    naslov: 'Člani, paketi in termini',
    besedilo: 'Za fitnes, studie in storitve. Člani imajo pakete in naročnine, termini so v koledarju, obisk se odšteje na blagajni.',
    seznam: ['Mesečne naročnine in paketi obiskov', 'Terminski koledar', 'Dostopi za trenerje in osebje'],
    posnetek: 'clani', pot: '/pos', alt: 'Seznam članov s paketi in veljavnostjo',
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
                <Posnetek ime={b.posnetek} pot={b.pot} alt={b.alt} sizes="(max-width: 900px) 92vw, 640px" />
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
