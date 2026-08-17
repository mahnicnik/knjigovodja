/**
 * Skupna logika za izbirnik obdobja na seznamih (Prelet 17, 17.8.2026).
 *
 * Zakaj obstaja: vec strani (izdani racuni, dobavnice, predracuni, avansni
 * racuni) je ob nalaganju vleklo VSE zapise iz baze brez kakrsnegakoli
 * datumskega filtra ali strancenja. Dokler je zapisov malo, to ni opazno -
 * ko jih bo vec (racuni cez vec let poslovanja), pa postane stran pocasna
 * (poizvedba in izris tisocih vrstic naenkrat).
 *
 * Vzorec je povzet po ze obstojeci resitvi v expenses/page.tsx (30.7.2026),
 * samo poenoten na eno mesto namesto vsake strani svoje kopije.
 */
export type PeriodMode = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom'

export interface PeriodRange {
  from: string | null
  to: string | null
  label: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getPeriodRange(mode: PeriodMode, customFrom: string, customTo: string): PeriodRange {
  const now = new Date()

  if (mode === 'all') return { from: null, to: null, label: 'Vse' }

  if (mode === 'today') {
    const d = toISODate(now)
    return { from: d, to: d, label: 'Danes' }
  }

  if (mode === 'week') {
    // ISO teden: ponedeljek - nedelja
    const dayNum = now.getDay() === 0 ? 7 : now.getDay() // nedelja=0 -> 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayNum - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: toISODate(monday), to: toISODate(sunday), label: 'Ta teden' }
  }

  if (mode === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: `Leto ${now.getFullYear()}` }
  }

  if (mode === 'custom') {
    return { from: customFrom || null, to: customTo || null, label: 'Po meri' }
  }

  // 'month' (privzeto)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`,
    label: 'Ta mesec',
  }
}
