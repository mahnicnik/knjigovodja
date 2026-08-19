/**
 * KLAVZULE O NEOBRAČUNANEM DDV — celoten nabor po ZDDV-1
 * (19.8.2026, razširjeno in POPRAVLJENO)
 *
 * Zakaj obstaja: v Računku je bilo mogoče izbrati stopnjo 0 %, RAZLOGA za to
 * pa ni bilo nikjer. ZDDV-1 zahteva, da račun brez obračunanega DDV vsebuje
 * navedbo razloga (sklic na člen zakona oz. direktive).
 *
 * ⚠️ POPRAVEK glede na prvo različico (19.8.2026): za zdravstvenega delavca v
 * SAMOSTOJNI dejavnosti (npr. fizioterapevt s.p.) velja 2. TOČKA 42. člena,
 * NE 1. točka. 1. točka se nanaša na javne zdravstvene zavode in
 * koncesionarje. Prva različica tega seznama je navajala napačno točko.
 *
 * ⚠️ POMEMBNO: to so pripravljena besedila, NE davčni nasvet. Katera klavzula
 * je pravilna, presodi računovodja glede na konkretne okoliščine. Zato je
 * povsod na voljo tudi lastno besedilo.
 *
 * ⚠️ PRIGLASITEV: za oprostitve po 1., 6., 7., 8., 11., 12. in 13. točki
 * 42. člena morajo osebe, ki NISO osebe javnega prava, oprostitev predhodno
 * PRIGLASITI davčnemu organu (43. člen ZDDV-1, prek eDavkov). Navedba člena
 * na računu sama po sebi ne zadošča. Te vnose označuje `priglasitev`.
 *
 * ⚠️ Ob spremembah zakonodaje je treba ta seznam posodobiti.
 * Vir: ZDDV-1, členi 25, 42, 44, 46, 52, 76.a in 94 (stanje 1.1.2025).
 */

export interface VatExemption {
  code: string
  /** Skupina za razvrstitev v izbirniku. */
  group: string
  /** Kratka oznaka za izbirnik. */
  label: string
  /** Besedilo, ki se izpiše na računu. */
  text: string
  /** Pojasnilo, kdaj se uporabi. */
  hint: string
  /** Ali je potrebna predhodna priglasitev pri FURS (43. člen ZDDV-1). */
  priglasitev?: boolean
}

export const VAT_EXEMPTIONS: VatExemption[] = [
  {
    code: '94',
    group: 'Nisem zavezanec za DDV',
    label: 'Mali davčni zavezanec (94. člen)',
    text: 'DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1 (davčni zavezanec ni identificiran za namene DDV).',
    hint: 'Promet pod pragom za obvezno identifikacijo. Velja za VSE račune takega izdajatelja.',
  },

  {
    code: '42-1',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Zdravstvena oskrba — javna služba ali koncesija (1. točka)',
    text: 'Oproščeno plačila DDV po 1. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Bolnišnična in izvenbolnišnična oskrba, ki jo kot javno službo opravljajo javni zdravstveni zavodi ali koncesionarji.',
    priglasitev: true,
  },
  {
    code: '42-2',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Zdravstvena oskrba — samostojna dejavnost (2. točka)',
    text: 'Oproščeno plačila DDV po 2. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Zdravstvena oskrba, ki jo zdravstveni delavci opravljajo v okviru SAMOSTOJNE zdravstvene dejavnosti — npr. fizioterapevt s.p. Priglasitev ni potrebna.',
  },
  {
    code: '42-3',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Kri, materino mleko, organi (3. točka)',
    text: 'Oproščeno plačila DDV po 3. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Oskrba s krvjo in krvnimi pripravki, materinim mlekom ter človeškimi organi za presajanje.',
  },
  {
    code: '42-4',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Zobni tehniki in zobna protetika (4. točka)',
    text: 'Oproščeno plačila DDV po 4. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Storitve zobnih tehnikov in zobna protetika, ki jo izdela zobni tehnik oziroma zobozdravnik.',
  },
  {
    code: '42-6',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Socialno varstvene storitve (6. točka)',
    text: 'Oproščeno plačila DDV po 6. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Socialno varstvo, domovi za starejše, dolgotrajna oskrba — javna služba, koncesija ali nepridobitne dobrodelne oz. invalidske organizacije.',
    priglasitev: true,
  },
  {
    code: '42-7',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Varstvo otrok in mladostnikov (7. točka)',
    text: 'Oproščeno plačila DDV po 7. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Javna služba, koncesija ali dobrodelne organizacije.',
    priglasitev: true,
  },
  {
    code: '42-15',
    group: 'Zdravstvo in socialno varstvo (42. člen)',
    label: 'Reševalni prevozi (15. točka)',
    text: 'Oproščeno plačila DDV po 15. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Prevozi bolnih ali poškodovanih oseb v posebej prirejenih vozilih in plovilih.',
  },

  {
    code: '42-8',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Vzgoja in izobraževanje (8. točka)',
    text: 'Oproščeno plačila DDV po 8. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Predšolska vzgoja, šolsko izobraževanje, poklicno usposabljanje in prekvalifikacije pri javnih zavodih oz. pooblaščenih organizacijah.',
    priglasitev: true,
  },
  {
    code: '42-9',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Zasebno poučevanje (9. točka)',
    text: 'Oproščeno plačila DDV po 9. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Zasebno poučevanje oseb, ki izpolnjujejo pogoje za učitelja v javni šoli, in se nanaša na šolsko izobraževanje. Inštrukcije šolskih predmetov, ne poljubni tečaji.',
  },
  {
    code: '42-11',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Članarine nepridobitnih organizacij (11. točka)',
    text: 'Oproščeno plačila DDV po 11. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Storitve članom kot povračilo za članarino — politične, sindikalne, verske, humanitarne in podobne nepridobitne organizacije.',
    priglasitev: true,
  },
  {
    code: '42-12',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Šport — nepridobitne organizacije (12. točka)',
    text: 'Oproščeno plačila DDV po 12. točki 1. odstavka 42. člena ZDDV-1.',
    hint: '⚠️ Velja SAMO za nepridobitne organizacije (društva, zveze). Fitnes v okviru s.p. ali d.o.o. NI oproščen — obdavči se po 9,5 %.',
    priglasitev: true,
  },
  {
    code: '42-13',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Kulturne storitve (13. točka)',
    text: 'Oproščeno plačila DDV po 13. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Javni zavodi in od države priznane kulturne institucije.',
    priglasitev: true,
  },
  {
    code: '42-14',
    group: 'Izobraževanje, šport, kultura (42. člen)',
    label: 'Dogodki za zbiranje sredstev (14. točka)',
    text: 'Oproščeno plačila DDV po 14. točki 1. odstavka 42. člena ZDDV-1.',
    hint: 'Priložnostni dobrodelni dogodki organizacij, katerih dejavnost je oproščena, izključno v lastno korist.',
  },

  {
    code: '44-1',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Zavarovalne transakcije (1. točka)',
    text: 'Oproščeno plačila DDV po 1. točki 44. člena ZDDV-1.',
    hint: 'Zavarovalne in pozavarovalne transakcije, vključno s storitvami zavarovalnih posrednikov in zastopnikov.',
  },
  {
    code: '44-2',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Najem nepremičnin (2. točka)',
    text: 'Oproščeno plačila DDV po 2. točki 44. člena ZDDV-1.',
    hint: '⚠️ NE velja za: nastanitve v hotelih in podobnih zmogljivostih, najem garaž in parkirnih površin ter najem trajno instalirane opreme in strojev — ti so obdavčeni.',
  },
  {
    code: '44-3',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Blago brez pravice do odbitka (3. točka)',
    text: 'Oproščeno plačila DDV po 3. točki 44. člena ZDDV-1.',
    hint: 'Dobava blaga, ki se je v celoti uporabljalo za oproščene dejavnosti in pri katerem ni bilo pravice do odbitka vstopnega DDV.',
  },
  {
    code: '44-4',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Finančne storitve (4. točka)',
    text: 'Oproščeno plačila DDV po 4. točki 44. člena ZDDV-1.',
    hint: 'Krediti in posojila, garancije, depoziti, plačilni promet, vrednostni papirji, upravljanje skladov.',
  },
  {
    code: '44-7',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Dobava objektov (7. točka)',
    text: 'Oproščeno plačila DDV po 7. točki 44. člena ZDDV-1.',
    hint: 'Dobava objektov oz. delov objektov in pripadajočih zemljišč, razen če je opravljena pred prvo uporabo.',
  },
  {
    code: '44-8',
    group: 'Finance, najem, nepremičnine (44. člen)',
    label: 'Dobava zemljišč (8. točka)',
    text: 'Oproščeno plačila DDV po 8. točki 44. člena ZDDV-1.',
    hint: 'Dobava zemljišč, razen stavbnih zemljišč.',
  },

  {
    code: '46',
    group: 'Čezmejne dobave',
    label: 'Dobava blaga v EU (46. člen)',
    text: 'Oproščeno plačila DDV po 1. točki 46. člena ZDDV-1 (dobava blaga v drugo državo članico).',
    hint: 'Kupec je zavezanec z veljavno ID številko za DDV v drugi državi članici; blago zapusti Slovenijo.',
  },
  {
    code: '52',
    group: 'Čezmejne dobave',
    label: 'Izvoz blaga izven EU (52. člen)',
    text: 'Oproščeno plačila DDV po 1. točki 1. odstavka 52. člena ZDDV-1 (izvoz blaga).',
    hint: 'Dobava blaga, odposlanega ali odpeljanega izven Evropske unije.',
  },

  {
    code: '25',
    group: 'Obrnjena davčna obveznost',
    label: 'Storitev zavezancu v EU (25. člen)',
    text: 'DDV ni obračunan — obrnjena davčna obveznost po 1. odstavku 25. člena ZDDV-1 oziroma 196. členu Direktive 2006/112/ES.',
    hint: 'Storitev opravljena davčnemu zavezancu s sedežem v drugi državi članici; DDV obračuna prejemnik.',
  },
  {
    code: '76a',
    group: 'Obrnjena davčna obveznost',
    label: 'Domača obrnjena obveznost (76.a člen)',
    text: 'DDV ni obračunan — obrnjena davčna obveznost po 76.a členu ZDDV-1.',
    hint: 'Gradbena dela, najem osebja v gradbeništvu, odpadki, pravice do emisij — med zavezancema v Sloveniji.',
  },

  {
    code: 'custom',
    group: 'Drugo',
    label: 'Lastno besedilo',
    text: '',
    hint: 'Vpišite besedilo, ki vam ga je svetoval računovodja.',
  },
]

/** Skupine v vrstnem redu, kot naj se prikažejo v izbirniku. */
export const VAT_EXEMPTION_GROUPS: string[] = Array.from(
  new Set(VAT_EXEMPTIONS.map(e => e.group)),
)

/** Poišče klavzulo po kodi. */
export function findVatExemption(code: string | null | undefined): VatExemption | null {
  if (!code) return null
  return VAT_EXEMPTIONS.find(e => e.code === code) ?? null
}

/**
 * Vrne besedilo klavzule za izpis na računu.
 * Pri 'custom' se uporabi shranjeno lastno besedilo.
 */
export function vatExemptionText(
  code: string | null | undefined,
  customText?: string | null,
): string | null {
  if (!code) return null
  if (code === 'custom') return customText?.trim() || null
  return findVatExemption(code)?.text ?? null
}

/**
 * Ali račun sploh potrebuje klavzulo?
 * Potrebuje jo, če je katerakoli postavka po 0 % ali če DDV ni obračunan.
 */
export function needsVatExemption(
  lineItems: Array<{ vat_rate?: number | string | null }> | null | undefined,
  vatAmount?: number | null,
): boolean {
  if (Number(vatAmount ?? 0) > 0) {
    return (lineItems ?? []).some(li => Number(li.vat_rate ?? 0) === 0)
  }
  return true
}
