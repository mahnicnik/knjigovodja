import s from './landing.module.css'
import { IME } from './ime'

/**
 * PRELET 349: zakaj naj racunovodja priporoci Racunko svojim strankam.
 *
 * Samo funkcije, ki v aplikaciji ze obstajajo (glej /za-racunovodje,
 * /racunovodja, /izvoz, lib/konti.ts). Ton: Racunko racunovodji prihrani
 * delo, ne jemlje mu strank.
 */
const KORISTI = [
  {
    znak: '1',
    naslov: 'Vse stranke na enem mestu',
    besedilo: 'Z enim računom preklapljate med strankami, ki so vas povabile. Brez ločenih prijav in gesel.',
  },
  {
    znak: '2',
    naslov: 'Stroški že razvrščeni po kontih',
    besedilo: `Stranka račun fotografira, ${IME} prebere znesek in DDV ter predlaga konto. Vi preverite, ne prepisujete.`,
  },
  {
    znak: '3',
    naslov: 'Izvoz za Vasco, Pantheon in Opal',
    besedilo: 'Knjižbe izdanih računov v obliki, ki jo vaš program prebere, ter stroški in dnevni zaključki blagajne po stopnjah DDV.',
  },
  {
    znak: '4',
    naslov: 'Manj klicev in iskanja papirjev',
    besedilo: 'Vidite, kaj je izdano, kaj poslikano in kaj manjka. Stranka vidi isto, zato vprašanj po telefonu ni.',
  },
]

export default function ZaRacunovodje() {
  return (
    <section className={s.sekcija} id="za-racunovodje" aria-labelledby="racunovodje-naslov">
      <div className={s.vsebina}>
        <div className={s.glava} data-razkrij>
          <h2 id="racunovodje-naslov" className={s.h2}>Za računovodje: manj prepisovanja, bolj urejene stranke</h2>
          <p className={s.uvod}>
            {IME} ne vodi glavne knjige in ne nadomešča računovodskega programa. Poskrbi, da podatki vaših strank pridejo k vam urejeni, razvrščeni in pravočasno.
          </p>
        </div>
        <div className={s.racunovodjeMreza}>
          {KORISTI.map(k => (
            <article key={k.naslov} className={s.racunovodjeKartica} data-razkrij>
              <span className={s.racunovodjeIkona} aria-hidden="true">{k.znak}</span>
              <h3>{k.naslov}</h3>
              <p>{k.besedilo}</p>
            </article>
          ))}
        </div>
        <div className={s.racunovodjeSpodaj} data-razkrij>
          <a href="/za-racunovodje" className={s.gumbPrimarni}>Več za računovodske servise</a>
          <span className={s.racunovodjeOpomba}>Portal za računovodje je brezplačen. Stranka vas povabi sama, dostop je samo za branje in izvoz.</span>
        </div>
      </div>
    </section>
  )
}
