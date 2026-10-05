/**
 * DDV-O XML — SAMO FORMATIRANJE rezultata izracunajDdv (lib/ddv.ts)
 * ══════════════════════════════════════════════════════════════════
 *
 * Revizija K2 (oktober 2026). Prej je stran /ddv/evidenca DDV racunala sama:
 *   · stopnjo izdanih racunov je brala iz stolpca issued_invoices.vat_rate,
 *     ki NE OBSTAJA - vsi racuni (tudi 9,5 %) so pristali v vrsticah za 22 %
 *   · KPO prihodki brez DDV (kartice, banka) so pristali v osnovi za 22 %
 *   · 5 % stopnja ni bila podprta
 *   · Math.max(0, …) je vracilo DDV prikazal kot 0
 *
 * Tu se nic ne racuna - vsak znesek je ze v DdvRezultat.
 *
 * OZNAKE POLJ: za 22 % in 9,5 % ostajajo dosedanje (P11/P12, P21/P22), nove
 * vrstice sledijo istemu vzorcu (P31/P32 za 5 %, P15 za oprosceni promet,
 * P71/P72 za nepricakovane stopnje). Preslikava teh oznak na uradno shemo
 * eDavki (DDV_O_4.xsd) pred to spremembo NI bila preverjena in tudi zdaj ni -
 * preveriti jo je treba loceno, preden se XML uvaza v eDavke.
 */

import type { DdvRezultat, Stopnja } from '@/lib/ddv'

export interface DdvOVrstica {
  stopnja: Stopnja
  oznaka: string
  poljeOsnova: string
  poljeDdv: string | null
  osnova: number
  ddv: number
}

const OZNAKE: Record<Stopnja, { oznaka: string; osnova: string; ddv: string | null }> = {
  '22': { oznaka: 'Prodaje 22 %', osnova: 'P11', ddv: 'P12' },
  '9.5': { oznaka: 'Prodaje 9,5 %', osnova: 'P21', ddv: 'P22' },
  '5': { oznaka: 'Prodaje 5 %', osnova: 'P31', ddv: 'P32' },
  '0': { oznaka: 'Promet brez DDV (0 %, oproščeno)', osnova: 'P15', ddv: null },
  drugo: { oznaka: 'Druge stopnje (preverite!)', osnova: 'P71', ddv: 'P72' },
}

/** Vrstice izstopnega DDV po stopnjah (vedno v istem vrstnem redu). */
export function vrsticeIzstopnegaDdv(r: DdvRezultat): DdvOVrstica[] {
  return (['22', '9.5', '5', '0', 'drugo'] as Stopnja[]).map(s => ({
    stopnja: s,
    oznaka: OZNAKE[s].oznaka,
    poljeOsnova: OZNAKE[s].osnova,
    poljeDdv: OZNAKE[s].ddv,
    osnova: r.izstopniDdv.poStopnjah[s].osnova,
    ddv: r.izstopniDdv.poStopnjah[s].ddv,
  }))
}

const xmlBesedilo = (v: unknown) => String(v ?? '')
const z = (n: number) => n.toFixed(2)

export interface DdvOZavezanec {
  tax_number: string | null
  id_za_ddv: string
  name: string
  address?: string | null
  post_code?: string | null
  city?: string | null
}

/**
 * Sestavi DDV-O XML. `obdobje` doloca, ali gre za cetrtletje (Kvartal) ali
 * mesec (Mesec) - mesecna shema (organizations.vat_period = 'monthly').
 */
export function sestaviDdvOXml(
  zavezanec: DdvOZavezanec,
  r: DdvRezultat,
  obdobje: { leto: number; cetrtletje?: number; mesec?: number },
  datumPodpisa: string,
): string {
  const vrstice = vrsticeIzstopnegaDdv(r)
  // Prazne vrstice za 5 %, 0 % in druge stopnje izpustimo, da XML za
  // obicajno podjetje ostane enak kot doslej. 22 % in 9,5 % sta vedno.
  const izhodni = vrstice
    .filter(v => v.stopnja === '22' || v.stopnja === '9.5' || v.osnova !== 0 || v.ddv !== 0)
    .map(v => [
      `    <${v.poljeOsnova}>${z(v.osnova)}</${v.poljeOsnova}>`,
      ...(v.poljeDdv ? [`    <${v.poljeDdv}>${z(v.ddv)}</${v.poljeDdv}>`] : []),
    ].join('\n'))
    .join('\n')

  const oznakaObdobja = obdobje.mesec
    ? `    <Mesec>${obdobje.mesec}</Mesec>`
    : `    <Kvartal>${obdobje.cetrtletje}</Kvartal>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<DDV_O xmlns="http://edavki.durs.si/Documents/Schemas/DDV_O_4.xsd">
  <Podatki_o_zavezancu>
    <DavcnaStevilka>${xmlBesedilo(zavezanec.tax_number)}</DavcnaStevilka>
    <ID_za_DDV>${xmlBesedilo(zavezanec.id_za_ddv)}</ID_za_DDV>
    <Naziv>${xmlBesedilo(zavezanec.name)}</Naziv>
    <Naslov>${xmlBesedilo(zavezanec.address)}</Naslov>
    <PostnaStevilka>${xmlBesedilo(zavezanec.post_code)}</PostnaStevilka>
    <Kraj>${xmlBesedilo(zavezanec.city)}</Kraj>
  </Podatki_o_zavezancu>
  <Obdobje>
    <ObdobjeOd>${r.od}</ObdobjeOd>
    <ObdobjeDo>${r.do}</ObdobjeDo>
${oznakaObdobja}
    <Leto>${obdobje.leto}</Leto>
  </Obdobje>
  <Obracun>
    <!-- IZHODNI DDV (od prodaj) po stopnjah -->
${izhodni}
    <!-- VHODNI DDV (od nakupov) -->
    <P41>${z(r.vstopniDdv.osnovaSkupaj)}</P41>
    <P42>${z(r.vstopniDdv.skupaj)}</P42>
    <!-- RAZLIKA (negativno = vracilo DDV) -->
    <P51>${z(r.izstopniDdv.skupaj)}</P51>
    <P52>${z(r.vstopniDdv.skupaj)}</P52>
    <P53>${z(r.obveznost)}</P53>
  </Obracun>
  <Podpis>
    <Datum>${datumPodpisa}</Datum>
    <Ime>${xmlBesedilo(zavezanec.name)}</Ime>
  </Podpis>
</DDV_O>`
}
