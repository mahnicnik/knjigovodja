/**
 * KLAVZULE O NEOBRAČUNANEM DDV (19.8.2026)
 *
 * Zakaj obstaja: v Računku je bilo mogoče izbrati stopnjo 0 %, RAZLOGA za to
 * pa ni bilo nikjer - ne na računu, ne v bazi. ZDDV-1 zahteva, da račun brez
 * obračunanega DDV vsebuje navedbo razloga (sklic na člen zakona oz. direktive).
 * Račun brez tega je formalno pomanjkljiv.
 *
 * ⚠️ POMEMBNO: to so pripravljena besedila, NE davčni nasvet. Katera klavzula
 * je pravilna v konkretnem primeru, odloči računovodja. Zato je povsod
 * omogočeno tudi lastno besedilo.
 *
 * ⚠️ Ob spremembah zakonodaje je treba ta seznam posodobiti.
 */

export interface VatExemption {
  code: string
  /** Kratka oznaka za izbirnik. */
  label: string
  /** Besedilo, ki se izpiše na računu. */
  text: string
  /** Pojasnilo, kdaj se uporabi - pomoč uporabniku pri izbiri. */
  hint: string
}

export const VAT_EXEMPTIONS: VatExemption[] = [
  {
    code: '94',
    label: 'Nisem zavezanec za DDV (94. člen)',
    text: 'DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1 (nisem zavezanec za DDV).',
    hint: 'Mali davčni zavezanec — promet pod pragom za obvezno registracijo. Velja za VSE račune takega izdajatelja.',
  },
  {
    code: '42',
    label: 'Zdravstvene storitve (42. člen)',
    text: 'Oproščeno plačila DDV po 1. točki 42. člena ZDDV-1 (zdravstvena dejavnost).',
    hint: 'Fizioterapija, zdravstvena obravnava in nega, ki jo opravljajo za to usposobljene osebe.',
  },
  {
    code: '42-soc',
    label: 'Socialno varstvo (42. člen)',
    text: 'Oproščeno plačila DDV po 6. točki 42. člena ZDDV-1 (socialno varstvene storitve).',
    hint: 'Storitve socialnega varstva in pomoči.',
  },
  {
    code: '42-sport',
    label: 'Šport — neprofitne organizacije (42. člen)',
    text: 'Oproščeno plačila DDV po 9. točki 42. člena ZDDV-1 (storitve, povezane s športom).',
    hint: 'Velja SAMO za neprofitne organizacije. Običajni s.p. fitnes se obdavči po 9,5 %.',
  },
  {
    code: '42-izo',
    label: 'Izobraževanje (42. člen)',
    text: 'Oproščeno plačila DDV po 8. točki 42. člena ZDDV-1 (izobraževanje).',
    hint: 'Vzgoja, izobraževanje in usposabljanje pri pooblaščenih izvajalcih.',
  },
  {
    code: '44',
    label: 'Najem nepremičnine (44. člen)',
    text: 'Oproščeno plačila DDV po 2. točki 44. člena ZDDV-1 (najem nepremičnin).',
    hint: 'Najem oz. zakup stanovanjskih in drugih nepremičnin.',
  },
  {
    code: '46',
    label: 'Dobava v EU (46. člen)',
    text: 'Oproščeno plačila DDV po 1. točki 46. člena ZDDV-1 (dobava blaga v drugo državo članico EU).',
    hint: 'Kupec je zavezanec z veljavno ID številko za DDV v drugi državi članici.',
  },
  {
    code: '52',
    label: 'Izvoz izven EU (52. člen)',
    text: 'Oproščeno plačila DDV po 1. točki 52. člena ZDDV-1 (izvoz blaga).',
    hint: 'Dobava blaga izven Evropske unije.',
  },
  {
    code: '25',
    label: 'Storitev v EU — obrnjena davčna obveznost',
    text: 'DDV ni obračunan — obrnjena davčna obveznost po 1. odstavku 25. člena ZDDV-1 oz. čl. 196 Direktive 2006/112/ES.',
    hint: 'Storitev opravljena zavezancu v drugi državi članici; DDV obračuna prejemnik.',
  },
  {
    code: '76a',
    label: 'Obrnjena davčna obveznost (76.a člen)',
    text: 'DDV ni obračunan — obrnjena davčna obveznost po 76.a členu ZDDV-1.',
    hint: 'Gradbene storitve, odpadki in podobno med zavezancema v Sloveniji.',
  },
  {
    code: 'custom',
    label: 'Drugo (lastno besedilo)',
    text: '',
    hint: 'Vpišite besedilo, ki vam ga je svetoval računovodja.',
  },
]

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
    // Ce je DDV delno obracunan, klavzula je se vedno potrebna za 0% postavke.
    return (lineItems ?? []).some(li => Number(li.vat_rate ?? 0) === 0)
  }
  return true
}
