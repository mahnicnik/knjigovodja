/**
 * SESTAVLJANJE INTERNEGA AKTA (25.8.2026)
 *
 * Akt o popisu poslovnih prostorov in pravilih za dodeljevanje zaporednih
 * stevilk racunov po sestem odstavku 5. clena ZDavPR.
 *
 * Vsi podatki so v aplikaciji ze: podjetje, poslovni prostori in elektronske
 * naprave. Tu jih samo sestavimo v besedilo, ki ustreza uradni predlogi FURS.
 *
 * POMEMBNO: rezultat se ob sprejetju ZAMRZNE. Akt velja v obliki, v kateri je
 * bil sprejet — ce se pozneje spremeni prostor ali naprava, se sprejme NOVA
 * razlicica, ne popravi obstojeca. Sicer ob nadzoru ni mogoce dokazati, kaj je
 * veljalo takrat, ko je bil racun izdan.
 */

export interface PodatkiAkta {
  naziv: string
  naslov: string
  davcna: string
  zastopnik: string
  prostori: Array<{
    oznaka: string
    naslov: string
    katastrska?: string | null
    stavba?: string | null
    delStavbe?: string | null
    vrsta?: string | null
  }>
  naprave: Array<{ prostorOznaka: string; oznaka: string }>
  /** Dodatne stevilcne vrste za negotovinske racune. */
  negotovinske?: Array<{ vzorec: string; opis: string; primer: string }>
  program?: string
  datumSprejetja: string
}

const u = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Vrne besedilo akta v HTML — primerno za prikaz in tiskanje. */
export function sestaviInterniAkt(p: PodatkiAkta): string {
  const datum = p.datumSprejetja
    ? new Date(p.datumSprejetja).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })
    : '__________'

  const vrsticeProstorov = p.prostori.map(pr => `
    <tr>
      <td><strong>${u(pr.oznaka)}</strong></td>
      <td>${u(pr.naslov)}</td>
      <td>${u(pr.katastrska || '—')}</td>
      <td>${u(pr.stavba || '—')}</td>
      <td>${u(pr.delStavbe || '—')}</td>
    </tr>`).join('')

  const vrsticeNaprav = p.naprave.map(n => `
    <tr><td><strong>${u(n.prostorOznaka)}</strong></td><td><strong>${u(n.oznaka)}</strong></td></tr>`).join('')

  // Primer zaporedja za prvo napravo — pokaze obliko stevilke racuna.
  const prva = p.naprave[0]
  const primeri = prva
    ? ['1', '2', '3', '…'].map(n =>
        `<tr><td>${u(prva.prostorOznaka)}-${u(prva.oznaka)}-${n}</td></tr>`).join('')
    : '<tr><td>—</td></tr>'

  const negotovinske = (p.negotovinske || []).length > 0 ? `
    <h3>5. člen</h3>
    <p>Za račune, izdane pri negotovinskem poslovanju (računi, ki niso plačani
    z gotovino in zato ne zapadejo pod postopek davčnega potrjevanja), se
    uporabljajo ločene številčne vrste, in sicer:</p>
    <ul>
      ${p.negotovinske!.map(v =>
        `<li><strong>${u(v.vzorec)}</strong> — ${u(v.opis)} (na primer ${u(v.primer)});</li>`).join('')}
    </ul>
    <p>V vsaki od navedenih številčnih vrst si zaporedne številke sledijo v
    neprekinjenem zaporedju od številke 1 do »n« za posamezno koledarsko leto.
    Številčne vrste se med seboj ne prepletajo, posamezna številka pa se v
    istem koledarskem letu ne uporabi dvakrat.</p>` : ''

  const zadnjiClen = (p.negotovinske || []).length > 0 ? '6' : '5'

  return `
<div class="akt">
  <p>V skladu s šestim odstavkom 5. člena Zakona o davčnem potrjevanju računov
  (Uradni list RS, št. 57/15 in 69/17) ${u(p.naziv)}, ${u(p.naslov)}, davčna
  številka ${u(p.davcna)}, ki jo zastopa ${u(p.zastopnik)}, sprejema</p>

  <h1>INTERNI AKT</h1>
  <h2>o popisu poslovnih prostorov, dodelitvi oznak poslovnim prostorom in
  pravilih za dodeljevanje zaporednih številk računov</h2>

  <h3>1. člen</h3>
  <p>S tem internim aktom se ureja popis poslovnih prostorov in dodelitev oznak
  poslovnim prostorom ter se predpisujejo pravila za dodeljevanje zaporednih
  številk računov zavezanca ${u(p.naziv)}, ${u(p.naslov)}, davčna številka
  ${u(p.davcna)}.</p>

  <h3>2. člen</h3>
  <p>Popis poslovnih prostorov z dodeljenimi oznakami, pripadajočimi naslovi in
  identifikacijskimi oznakami iz registra nepremičnin:</p>
  <table>
    <thead><tr>
      <th>Oznaka poslovnega prostora</th><th>Naslov</th>
      <th>Katastrska občina</th><th>Št. stavbe</th><th>Št. dela stavbe</th>
    </tr></thead>
    <tbody>${vrsticeProstorov}</tbody>
  </table>

  <h3>3. člen</h3>
  <p>Oznake elektronskih naprav, prek katerih se v posameznem poslovnem
  prostoru izdajajo računi:</p>
  <table>
    <thead><tr><th>Oznaka poslovnega prostora</th><th>Oznaka elektronske naprave</th></tr></thead>
    <tbody>${vrsticeNaprav}</tbody>
  </table>
  ${p.program ? `<p>Za izdajanje računov se uporablja programska oprema
  ${u(p.program)}, ki deluje kot spletna aplikacija; podatki se hranijo
  centralno pri ponudniku storitve.</p>` : ''}

  <h3>4. člen</h3>
  <p>Zaporedne številke računov si vsako koledarsko leto, od 1. januarja do
  31. decembra, sledijo v neprekinjenem zaporedju, od zaporedne številke 1 do
  »n«, po posamezni elektronski napravi za izdajo računov v poslovnem
  prostoru.</p>
  <p>Številka računa je sestavljena iz treh delov, ločenih z vezajem, in sicer:
  oznaka poslovnega prostora – oznaka elektronske naprave – zaporedna številka
  računa.</p>
  <table><thead><tr><th>Zaporedje številk računov</th></tr></thead>
  <tbody>${primeri}</tbody></table>
  ${negotovinske}

  <h3>${zadnjiClen}. člen</h3>
  <p>Ta interni akt začne veljati z dnem sprejetja in se uporablja do preklica
  oziroma do sprejetja novega internega akta. Spremembe in dopolnitve se
  sprejmejo na enak način kot ta akt.</p>
  <p>Zavezanec hrani ta interni akt in vse njegove spremembe v skladu z roki,
  določenimi z zakonom, ki ureja davčni postopek, ter ga na zahtevo predloži
  davčnemu organu.</p>

  <p class="podpis">Kraj in datum: ${u(p.naslov.split(',').pop()?.trim() || '')}, ${datum}</p>
  <p class="podpis"><strong>${u(p.naziv)}</strong><br/>${u(p.zastopnik)}</p>
</div>`.trim()
}

/** Slog za prikaz in tiskanje akta. */
export const SLOG_AKTA = `
  .akt { font-family: Inter, system-ui, sans-serif; font-size: 13px; line-height: 1.65; color: #1a1a1a; }
  .akt h1 { font-size: 20px; text-align: center; margin: 18px 0 4px; letter-spacing: .02em; }
  .akt h2 { font-size: 14px; text-align: center; font-weight: 600; margin: 0 0 22px; }
  .akt h3 { font-size: 13px; margin: 20px 0 6px; }
  .akt p { margin: 0 0 10px; }
  .akt ul { margin: 0 0 10px 18px; padding: 0; }
  .akt table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 12px; }
  .akt th, .akt td { border: 1px solid #d5d5d5; padding: 6px 8px; text-align: left; }
  .akt th { background: #f2f2f2; font-weight: 600; }
  .akt .podpis { margin-top: 22px; }
  @media print { .akt { font-size: 12px; } .noprint { display: none !important; } }
`
