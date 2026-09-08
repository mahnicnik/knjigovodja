/**
 * E-RAČUN PO EN 16931 (UBL 2.1)
 * ═════════════════════════════
 *
 * ZAKAJ TO POTREBUJEMO
 * Zakon o izmenjavi elektronskih racunov (ZIERDED, sprejet 23.10.2025)
 * uvaja OBVEZNE strukturirane e-racune med podjetji od 1.1.2028. Velja za
 * vse subjekte v poslovnem registru, tudi za s.p. in ne glede na DDV.
 * PDF po e-posti od takrat NE ZADOSCA - izmenjava po e-posti ni dovoljena.
 *
 * ZAKAJ UBL IN NE e-SLOG XML
 * Zakon dovoljuje e-SLOG ALI drugo sintakso, skladno z EN 16931. UBL 2.1 po
 * tej normi je:
 *   · enak zapis, kot ga uporablja omrezje Peppol (BIS 3.0), kamor se bomo
 *     priklopili pred 2028 - torej ne bo treba pisati dvakrat,
 *   · mednarodno uveljavljen in dokumentiran, zato ga znajo prebrati tudi
 *     tuji sistemi.
 *
 * KAKO SE UPORABI DANES
 * Uporabnik prenese datoteko in jo nalozi v svojo spletno banko ali pri
 * ponudniku e-poti. NEPOSREDNE oddaje na UJP ta koda NE opravlja - portal
 * UJPeRacun nalozenih datotek ne sprejema (preverjeno 24.7.2026).
 *
 * ⚠ PREVERI PRED PRVO UPORABO V PRAVEM POSLU
 * Ta zapis je sestavljen po dokumentaciji EN 16931 in UBL 2.1, NI pa bil
 * potrjen z uradnim potrjevalnikom sheme. Prvo datoteko preveri v
 * potrjevalniku ponudnika e-poti ali banke, preden jo poslješ stranki.
 * Napacno strukturiran racun prejemnik zavrne.
 */

export interface ERacunIzdajatelj {
  naziv: string
  naslov: string
  posta?: string | null
  kraj?: string | null
  davcna: string            // brez predpone SI
  zavezanecZaDdv: boolean
  iban?: string | null
  bic?: string | null
}

export interface ERacunPostavka {
  opis: string
  kolicina: number
  enota?: string | null
  cenaBrezDdv: number
  stopnjaDdv: number
}

export interface ERacunPodatki {
  stevilka: string
  datumIzdaje: string        // YYYY-MM-DD
  datumZapadlosti?: string | null
  datumStoritve?: string | null
  sklic?: string | null
  opomba?: string | null
  izdajatelj: ERacunIzdajatelj
  prejemnik: {
    naziv: string
    naslov?: string | null
    davcna?: string | null
    idZaDdv?: string | null
    email?: string | null
  }
  postavke: ERacunPostavka[]
  osnova: number
  ddv: number
  skupaj: number
  klavzulaOprostitve?: string | null
}

/** Pobegni znake, ki bi v XML prekinili strukturo. */
function x(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Dva decimalna mesta, pika kot locilo - kot zahteva norma. */
function z(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
}

/**
 * Davcna kategorija po EN 16931:
 *   S = obicajna stopnja, Z = niclna stopnja, E = oproscen DDV,
 *   AE = obrnjena davcna obveznost, O = ni predmet DDV.
 *
 * Nezavezanec za DDV izda racun s kategorijo E in klavzulo o razlogu -
 * prav tako, kot mora biti navedena na papirnem racunu.
 */
function davcnaKategorija(stopnja: number, zavezanec: boolean): string {
  if (!zavezanec) return 'E'
  return stopnja > 0 ? 'S' : 'Z'
}

export function zgradiERacunXml(d: ERacunPodatki): string {
  const zav = d.izdajatelj.zavezanecZaDdv

  // Postavke zdruzimo po stopnji DDV - norma zahteva razclenitev po
  // kategorijah, ne po posameznih vrsticah.
  const poStopnji = new Map<number, { osnova: number; ddv: number }>()
  for (const p of d.postavke) {
    const osnovaVrstice = (Number(p.cenaBrezDdv) || 0) * (Number(p.kolicina) || 0)
    const st = zav ? (Number(p.stopnjaDdv) || 0) : 0
    const obstoj = poStopnji.get(st) || { osnova: 0, ddv: 0 }
    obstoj.osnova += osnovaVrstice
    obstoj.ddv += osnovaVrstice * st / 100
    poStopnji.set(st, obstoj)
  }

  const podskupine = [...poStopnji.entries()].map(([stopnja, v]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${z(v.osnova)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${z(v.ddv)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${davcnaKategorija(stopnja, zav)}</cbc:ID>
        <cbc:Percent>${z(stopnja)}</cbc:Percent>${
          !zav && d.klavzulaOprostitve
            ? `\n        <cbc:TaxExemptionReason>${x(d.klavzulaOprostitve)}</cbc:TaxExemptionReason>`
            : ''
        }
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('')

  const vrstice = d.postavke.map((p, i) => {
    const osnovaVrstice = (Number(p.cenaBrezDdv) || 0) * (Number(p.kolicina) || 0)
    const st = zav ? (Number(p.stopnjaDdv) || 0) : 0
    return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${x(p.enota || 'H87')}">${Number(p.kolicina) || 0}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${z(osnovaVrstice)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${x(p.opis)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${davcnaKategorija(st, zav)}</cbc:ID>
        <cbc:Percent>${z(st)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${z(p.cenaBrezDdv)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${x(d.stevilka)}</cbc:ID>
  <cbc:IssueDate>${x(d.datumIzdaje)}</cbc:IssueDate>${
    d.datumZapadlosti ? `\n  <cbc:DueDate>${x(d.datumZapadlosti)}</cbc:DueDate>` : ''
  }
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${
    d.opomba ? `\n  <cbc:Note>${x(d.opomba)}</cbc:Note>` : ''
  }
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>${
    d.sklic ? `\n  <cac:PaymentTerms><cbc:Note>Sklic: ${x(d.sklic)}</cbc:Note></cac:PaymentTerms>` : ''
  }${
    d.datumStoritve ? `
  <cac:InvoicePeriod>
    <cbc:EndDate>${x(d.datumStoritve)}</cbc:EndDate>
  </cac:InvoicePeriod>` : ''
  }
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${x(d.izdajatelj.naziv)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${x(d.izdajatelj.naslov)}</cbc:StreetName>
        <cbc:CityName>${x(d.izdajatelj.kraj)}</cbc:CityName>
        <cbc:PostalZone>${x(d.izdajatelj.posta)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>SI</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${
        zav ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>SI${x(d.izdajatelj.davcna)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${x(d.izdajatelj.naziv)}</cbc:RegistrationName>
        <cbc:CompanyID>${x(d.izdajatelj.davcna)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${x(d.prejemnik.naziv)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${x(d.prejemnik.naslov)}</cbc:StreetName>
        <cac:Country><cbc:IdentificationCode>SI</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${
        d.prejemnik.idZaDdv ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${x(d.prejemnik.idZaDdv)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${x(d.prejemnik.naziv)}</cbc:RegistrationName>${
          d.prejemnik.davcna ? `\n        <cbc:CompanyID>${x(d.prejemnik.davcna)}</cbc:CompanyID>` : ''
        }
      </cac:PartyLegalEntity>${
        d.prejemnik.email ? `
      <cac:Contact><cbc:ElectronicMail>${x(d.prejemnik.email)}</cbc:ElectronicMail></cac:Contact>` : ''
      }
    </cac:Party>
  </cac:AccountingCustomerParty>${
    d.izdajatelj.iban ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${
      d.sklic ? `\n    <cbc:PaymentID>${x(d.sklic)}</cbc:PaymentID>` : ''
    }
    <cac:PayeeFinancialAccount>
      <cbc:ID>${x(String(d.izdajatelj.iban).replace(/\s/g, ''))}</cbc:ID>${
        d.izdajatelj.bic ? `
      <cac:FinancialInstitutionBranch><cbc:ID>${x(d.izdajatelj.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''
      }
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ''
  }
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${z(d.ddv)}</cbc:TaxAmount>${podskupine}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${z(d.osnova)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${z(d.osnova)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${z(d.skupaj)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${z(d.skupaj)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${vrstice}
</Invoice>
`
}
