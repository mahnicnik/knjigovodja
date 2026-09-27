/**
 * PRELET 335: en vir resnice za zneske iz placilne liste.
 *
 * Primer (Winkler Michaela, avgust 2026):
 *   bruto 1.489,29
 *   - prispevki delavca 383,47  - akontacija 83,66  = NETO 1.022,16
 *   + prehrana 167,16 (povracilo, neobdavceno)      = NA TRR 1.189,32
 *   prispevki delodajalca 260,20 + 7,39 (razlika do min. osnove) = 267,59
 *   FURS = 383,47 + 83,66 + 267,59                  = 734,72
 *   SKUPAJ STROSEK = bruto + prispevki delodajalca + povracila = 1.924,04
 *                  = NA TRR + FURS
 *
 * V KPO gre SKUPAJ STROSEK (en vnos, datum izplacila). Placili na TRR in FURS
 * sta le poravnava te obveznosti - NISTA nov strosek.
 */
export type ObracunPlace = {
  bruto: number
  neto: number          // neto placa (pred povracili)
  povracila: number     // prehrana, prevoz, drugo
  naTrr: number         // neto + povracila - kar gre zaposlenemu
  furs: number          // prispevki delavca + delodajalca + akontacija
  strosek: number       // skupaj strosek v breme podjetja (KPO)
}

const r2 = (x: number) => Math.round(x * 100) / 100
const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export function obracunPlace(p: any): ObracunPlace {
  const bruto = n(p.gross_salary)
  const neto = n(p.net_salary)
  const povracila = r2(n(p.meal_allowance) + n(p.travel_expenses) + n(p.other_allowances))
  const naTrr = r2(neto + povracila)
  // FURS: najprej zapisan znesek s placilne liste ("Skupaj vsi prispevki in davki"),
  // sicer iz razclenitve, sicer strosek - na TRR.
  const izRazclenitve = r2(n(p.ee_total) + n(p.er_total) + n(p.income_tax))
  const strosekZapisan = n(p.employer_total_cost ?? p.total_cost)
  const furs = n(p.total_furs) > 0 ? r2(n(p.total_furs))
    : izRazclenitve > 0 ? izRazclenitve
    : Math.max(0, r2(strosekZapisan - naTrr))
  const strosek = strosekZapisan > 0 ? r2(strosekZapisan) : r2(naTrr + furs)
  return { bruto, neto, povracila, naTrr, furs, strosek }
}

/** Ali se zneski placilne liste ujemajo (na TRR + FURS = skupaj strosek). */
export function preveriObracun(o: ObracunPlace): { ok: boolean; razlika: number } {
  const razlika = r2(o.strosek - (o.naTrr + o.furs))
  return { ok: Math.abs(razlika) <= 0.05, razlika }
}

/** Rok placila: mesecna placa do 18. naslednjega meseca (ZDR-1, 134. clen), regres do 1. julija. */
export function rokPlacila(p: any): string | null {
  if (!p?.year) return null
  if (p.type === 'regres') return `${p.year}-07-01`
  if (!p.month) return null
  return new Date(Date.UTC(p.year, p.month, 18)).toISOString().slice(0, 10) // month 1..12 -> naslednji mesec
}

/** Datum za KPO: dejanski datum izplacila, sicer rok placila. */
export function datumKnjizenja(p: any): string {
  const d = p?.paid_at ? String(p.paid_at).slice(0, 10) : null
  return d || rokPlacila(p) || new Date().toISOString().slice(0, 10)
}

export const MESECI_IME = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december']

/**
 * Bancni odliv, ki poravna obveznost iz placilne liste (na TRR ali FURS).
 * Tak odliv se NE knjizi kot strosek - strosek je ze v KPO iz placilne liste.
 */
export function najdiPlacilnoObveznost(
  znesek: number, datum: string, liste: any[], ze: Set<string>,
): { payslipId: string; vrsta: 'neto' | 'furs'; opis: string } | null {
  const t = Date.parse(datum)
  let naj: { payslipId: string; vrsta: 'neto' | 'furs'; opis: string; dni: number } | null = null
  for (const p of liste) {
    const o = obracunPlace(p)
    const ref = Date.parse(datumKnjizenja(p))
    const dni = Number.isFinite(t) && Number.isFinite(ref) ? Math.abs(t - ref) / 86_400_000 : 999
    if (dni > 45) continue
    const ime = p.employee_name_raw || 'zaposleni'
    const obdobje = p.type === 'regres' ? `regres ${p.year}` : `${MESECI_IME[(p.month || 1) - 1]} ${p.year}`
    for (const [vrsta, z, placano] of [['neto', o.naTrr, p.neto_placano_at], ['furs', o.furs, p.furs_placano_at]] as const) {
      const kljuc = `${p.id}:${vrsta}`
      if (placano || ze.has(kljuc) || z <= 0 || Math.abs(z - znesek) > 0.02) continue
      if (!naj || dni < naj.dni) naj = { payslipId: p.id, vrsta, dni, opis: `${vrsta === 'neto' ? 'Plača na TRR' : 'Prispevki in davki (FURS)'} — ${ime}, ${obdobje}` }
    }
  }
  return naj ? { payslipId: naj.payslipId, vrsta: naj.vrsta, opis: naj.opis } : null
}
