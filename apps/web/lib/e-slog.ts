/**
 * E-RAČUN PO STANDARDU e-SLOG 2.0
 * ═══════════════════════════════
 *
 * ZAKAJ TO POTREBUJEMO
 * Zakon o izmenjavi elektronskih racunov (ZIERDED, sprejet 23.10.2025) uvaja
 * OBVEZNE strukturirane e-racune med podjetji od 1.1.2028. Velja za vse
 * subjekte v poslovnem registru, tudi za s.p. in ne glede na DDV. Izmenjava
 * po e-posti NI dovoljena - le prek ponudnikov e-poti, Peppola ali
 * neposredne povezave.
 *
 * ZAKAJ e-SLOG IN NE UBL
 * Prva razlicica te kode je ustvarjala UBL po EN 16931. Zakon to sicer
 * dovoljuje, v Sloveniji pa prejemniki in ponudniki e-poti pricakujejo
 * e-SLOG. Zapis je zato predelan po DELUJOCEM e-racunu, prejetem od
 * ponudnika 1 Klik d.o.o. - torej po obliki, ki v praksi dokazano prehaja.
 *
 * ZGRADBA
 * e-SLOG 2.0 izhaja iz EDIFACT sporocila INVOIC, preslikanega v XML:
 *   S_UNH   glava sporocila
 *   S_BGM   vrsta (380 = racun) in stevilka
 *   S_DTM   datumi - 137 izdaja, 35 dobava, 131 davcni dogodek
 *   S_FTX   DOC = oznaka norme, GEN = opomba
 *   G_SG1   sklic za placilo (PQ)
 *   G_SG2   stranke - SE izdajatelj, BY kupec, DP prejemnik
 *   G_SG7   valuta
 *   G_SG8   rok in nacin placila
 *   G_SG26  postavke
 *   G_SG50  skupni zneski
 *   G_SG52  razclenitev DDV
 *
 * SIFRE ZNESKOV (D_5025), preverjene na zgledu:
 *   203 vrednost postavke PO popustu · 125 osnova · 124 DDV · 204 popust
 *   79 sestevek postavk · 260 popusti skupaj · 389 osnova skupaj
 *   176 DDV skupaj · 388 skupaj z DDV · 9 za placilo
 */

export interface ERacunStranka {
  naziv: string
  naslov?: string | null
  posta?: string | null
  kraj?: string | null
  davcna?: string | null        // brez predpone
  idZaDdv?: string | null       // s predpono SI, ce je zavezanec
  maticna?: string | null
  iban?: string | null
  bic?: string | null
  telefon?: string | null
}

export interface ERacunPostavka {
  opis: string
  kolicina: number
  cenaBrezDdv: number
  stopnjaDdv: number
  popustOdstotek?: number
}

export interface ERacunPodatki {
  stevilka: string
  datumIzdaje: string
  datumZapadlosti?: string | null
  datumDobave?: string | null
  sklic?: string | null
  opomba?: string | null
  izdajatelj: ERacunStranka
  kupec: ERacunStranka
  postavke: ERacunPostavka[]
  klavzulaOprostitve?: string | null
}

const x = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const z = (n: number): string => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

/** Znesek s sifro - v e-SLOG se vsak znesek nosi svojo sifro pomena. */
const moa = (sifra: number, znesek: number) =>
  `<S_MOA><C_C516><D_5025>${sifra}</D_5025><D_5004>${z(znesek)}</D_5004></C_C516></S_MOA>`

const dtm = (sifra: number, datum: string) =>
  `<S_DTM><C_C507><D_2005>${sifra}</D_2005><D_2380>${x(datum)}</D_2380></C_C507></S_DTM>`

/** Sklic (RFF) - VA davcna, AHP davcna za namene DDV, 0199 maticna. */
const rff = (koda: string, vrednost: string) =>
  `<G_SG3><S_RFF><C_C506><D_1153>${koda}</D_1153><D_1154>${x(vrednost)}</D_1154></C_C506></S_RFF></G_SG3>`

function stranka(vloga: 'SE' | 'BY' | 'DP', s: ERacunStranka): string {
  const sklici = [
    s.idZaDdv ? rff('VA', s.idZaDdv) : '',
    s.davcna ? rff('AHP', s.davcna) : '',
    s.maticna ? rff('0199', s.maticna) : '',
  ].join('')

  const banka = s.iban
    ? `<S_FII><D_3035>${vloga === 'SE' ? 'RB' : 'BB'}</D_3035>` +
      `<C_C078><D_3194>${x(String(s.iban).replace(/\s/g, ''))}</D_3194></C_C078>` +
      (s.bic ? `<C_C088><D_3433>${x(s.bic)}</D_3433></C_C088>` : '') +
      `</S_FII>`
    : ''

  const stik = s.telefon
    ? `<G_SG5><S_CTA><D_3139>${vloga === 'SE' ? 'SU' : 'PD'}</D_3139></S_CTA>` +
      `<S_COM><C_C076><D_3148>${x(s.telefon)}</D_3148><D_3155>TE</D_3155></C_C076></S_COM></G_SG5>`
    : ''

  return `<G_SG2><S_NAD><D_3035>${vloga}</D_3035>` +
    `<C_C080><D_3036>${x(s.naziv)}</D_3036></C_C080>` +
    (s.naslov ? `<C_C059><D_3042>${x(s.naslov)}</D_3042></C_C059>` : '') +
    (s.kraj ? `<D_3164>${x(String(s.kraj).toUpperCase())}</D_3164>` : '') +
    `<C_C819><D_3228>SLOVENIA</D_3228></C_C819>` +
    (s.posta ? `<D_3251>${x(s.posta)}</D_3251>` : '') +
    `<D_3207>SI</D_3207></S_NAD>` +
    banka + sklici + stik +
    `</G_SG2>`
}

export function zgradiESlogXml(d: ERacunPodatki): string {
  // Postavke: vrednost pred popustom, popust, osnova, DDV.
  let sestevekPostavk = 0, popustiSkupaj = 0, osnovaSkupaj = 0, ddvSkupaj = 0
  const poStopnji = new Map<number, { osnova: number; ddv: number }>()

  const vrstice = d.postavke.map((p, i) => {
    const bruto = (Number(p.cenaBrezDdv) || 0) * (Number(p.kolicina) || 0)
    const popustPct = Number(p.popustOdstotek) || 0
    const popust = bruto * popustPct / 100
    const osnova = bruto - popust
    const stopnja = Number(p.stopnjaDdv) || 0
    const ddv = osnova * stopnja / 100

    sestevekPostavk += bruto
    popustiSkupaj += popust
    osnovaSkupaj += osnova
    ddvSkupaj += ddv
    const obstoj = poStopnji.get(stopnja) || { osnova: 0, ddv: 0 }
    obstoj.osnova += osnova; obstoj.ddv += ddv
    poStopnji.set(stopnja, obstoj)

    const popustBlok = popustPct > 0
      ? `<G_SG39><S_ALC><D_5463>A</D_5463><C_C552><D_5189>95</D_5189></C_C552></S_ALC>` +
        `<G_SG41><S_PCD><C_C501><D_5245>1</D_5245><D_5482>${z(popustPct)}</D_5482></C_C501></S_PCD></G_SG41>` +
        `<G_SG42>${moa(204, popust)}</G_SG42></G_SG39>`
      : ''

    return `<G_SG26><S_LIN/>` +
      `<S_IMD><D_7077>F</D_7077><C_C273><D_7008>${x(p.opis)}</D_7008></C_C273></S_IMD>` +
      `<S_QTY><C_C186><D_6063>47</D_6063><D_6060>${z(p.kolicina)}</D_6060><D_6411>C62</D_6411></C_C186></S_QTY>` +
      // Znesek postavke je PO popustu - preverjeno na pravem racunu, kjer
      // je MOA 203 = 54,40 in DDV 11,97, kar je 22 % od 54,40. Popust se
      // navede posebej v G_SG39, sestevek pred popusti pa v MOA 79.
      `<G_SG27>${moa(203, osnova)}</G_SG27>` +
      `<G_SG34><S_TAX><D_5283>7</D_5283><C_C241><D_5153>VAT</D_5153></C_C241>` +
      `<C_C243><D_5278>${z(stopnja)}</D_5278></C_C243></S_TAX>` +
      moa(125, osnova) + moa(124, ddv) + `</G_SG34>` +
      popustBlok +
      `</G_SG26>`
  }).join('')

  const skupaj = osnovaSkupaj + ddvSkupaj

  const razclenitevDdv = [...poStopnji.entries()].map(([stopnja, v]) =>
    `<G_SG52><S_TAX><D_5283>7</D_5283><C_C241><D_5153>VAT</D_5153></C_C241>` +
    `<C_C243><D_5278>${z(stopnja)}</D_5278></C_C243></S_TAX>` +
    moa(125, v.osnova) + moa(124, v.ddv) + `</G_SG52>`).join('')

  const datumDobave = d.datumDobave || d.datumIzdaje

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="urn:eslog:2.00"><M_INVOIC Id="data">` +
    `<S_UNH><D_0062>NOTPROVIDED</D_0062><C_S009><D_0065>INVOIC</D_0065><D_0052>D</D_0052><D_0054>01B</D_0054><D_0051>UN</D_0051></C_S009></S_UNH>` +
    `<S_BGM><C_C002><D_1001>380</D_1001></C_C002><C_C106><D_1004>${x(d.stevilka)}</D_1004></C_C106></S_BGM>` +
    dtm(137, d.datumIzdaje) +
    dtm(131, datumDobave) +
    dtm(35, datumDobave) +
    `<S_FTX><D_4451>DOC</D_4451><C_C108><D_4440>urn:cen.eu:en16931:2017</D_4440></C_C108></S_FTX>` +
    (d.opomba || d.klavzulaOprostitve
      ? `<S_FTX><D_4451>GEN</D_4451><C_C108><D_4440>${x([d.opomba, d.klavzulaOprostitve].filter(Boolean).join(' '))}</D_4440></C_C108></S_FTX>`
      : '') +
    (d.sklic ? `<G_SG1><S_RFF><C_C506><D_1153>PQ</D_1153><D_1154>${x(d.sklic)}</D_1154></C_C506></S_RFF></G_SG1>` : '') +
    stranka('SE', d.izdajatelj) +
    stranka('BY', d.kupec) +
    `<G_SG7><S_CUX><C_C504><D_6347>2</D_6347><D_6345>EUR</D_6345></C_C504></S_CUX></G_SG7>` +
    (d.datumZapadlosti
      ? `<G_SG8><S_PAT><D_4279>1</D_4279></S_PAT>${dtm(13, d.datumZapadlosti)}<S_PAI><C_C534><D_4461>30</D_4461></C_C534></S_PAI></G_SG8>`
      : '') +
    vrstice +
    `<G_SG50>${moa(79, sestevekPostavk)}</G_SG50>` +
    (popustiSkupaj > 0 ? `<G_SG50>${moa(260, popustiSkupaj)}</G_SG50>` : '') +
    `<G_SG50>${moa(389, osnovaSkupaj)}</G_SG50>` +
    `<G_SG50>${moa(176, ddvSkupaj)}</G_SG50>` +
    `<G_SG50>${moa(388, skupaj)}</G_SG50>` +
    `<G_SG50>${moa(9, skupaj)}</G_SG50>` +
    razclenitevDdv +
    `</M_INVOIC></Invoice>`
}
