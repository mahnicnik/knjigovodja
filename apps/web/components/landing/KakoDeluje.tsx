import s from './landing.module.css'
import { IME } from './ime'
import Posnetek from './Posnetek'

const KORAKI = [
  {
    st: '01',
    naslov: 'Registracija in FURS potrdilo',
    besedilo: 'Vpišete podatke podjetja, naložite potrdilo FURS in prijavite poslovni prostor. Nastavitev traja približno 5 minut.',
    posnetek: 'korak-nastavitve', pot: '/nastavitve/blagajna', alt: 'Nastavitve blagajne s potrdilom FURS in poslovnim prostorom',
  },
  {
    st: '02',
    naslov: 'Fotografirate, izdate, zaračunate',
    besedilo: 'Stroške fotografirate s telefonom. Račune izdate iz seznama strank in artiklov. Stranka dobi PDF z UPN QR kodo.',
    posnetek: 'korak-racuni', pot: '/invoices', alt: 'Seznam izdanih računov s statusi plačil',
  },
  {
    st: '03',
    naslov: `${IME} sam vodi KPO, DDV in roke`,
    besedilo: 'Knjiga prihodkov in odhodkov se polni sproti. Prispevki in DDV so izračunani, na roke vas opomni vnaprej.',
    posnetek: 'korak-kpo', pot: '/kpo', alt: 'Knjiga prihodkov in odhodkov, izpolnjena iz računov in blagajne',
  },
]

export default function KakoDeluje() {
  return (
    <section className={s.sekcija} id="kako-deluje" aria-labelledby="kako-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="kako-naslov" className={s.h2}>Trije koraki. Tretjega ne delate vi.</h2>
        </div>
        <ol className={s.koraki}>
          {KORAKI.map(k => (
            <li key={k.st} className={s.korak} data-razkrij>
              <span className={s.korakStevilka} aria-hidden="true">{k.st}</span>
              <h3 className={s.h3}>{k.naslov}</h3>
              <p className={s.korakBesedilo}>{k.besedilo}</p>
              <div className={s.korakPosnetek}>
                <Posnetek ime={k.posnetek} pot={k.pot} alt={k.alt} sizes="(max-width: 900px) 92vw, 380px" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
