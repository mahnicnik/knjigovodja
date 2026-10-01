/**
 * Majhna Supabase baza v pomnilniku za teste (prelet 364). Podpira samo,
 * kar uporabljajo testirane funkcije: select/insert/update, eq, is, in, or
 * (preprosti pogoji col.op.val), limit, single/maybeSingle, rpc.
 */
type Vrstica = Record<string, any>
type Pogoj = (v: Vrstica) => boolean

function primerjaj(v: any, op: string, x: string) {
  if (op === 'is') return x === 'null' ? v == null : v === (x === 'true')
  if (op === 'eq') return String(v) === x
  if (op === 'lt') return v != null && String(v) < x
  if (op === 'gte') return v != null && String(v) >= x
  return true
}

function orPogoj(izraz: string): Pogoj {
  const deli = izraz.split(',').map(d => { const [col, op, ...x] = d.split('.'); return { col, op, x: x.join('.') } })
  return v => deli.some(d => primerjaj(v[d.col], d.op, d.x))
}

export function laznaBaza(zacetno: Record<string, Vrstica[]> = {}, rpc: Record<string, (args: any) => any> = {}) {
  const tabele: Record<string, Vrstica[]> = {}
  for (const [k, v] of Object.entries(zacetno)) tabele[k] = v.map(r => ({ ...r }))
  let stevec = 0
  const t = (ime: string) => (tabele[ime] ||= [])

  function poizvedba(ime: string) {
    let op: 'select' | 'update' | 'insert' = 'select'
    let podatki: any = null
    let vrni = false
    let ena: 'single' | 'maybe' | null = null
    const pogoji: Pogoj[] = []
    const q: any = {
      select() { if (op !== 'select') vrni = true; return q },
      update(p: any) { op = 'update'; podatki = p; return q },
      insert(p: any) { op = 'insert'; podatki = p; return q },
      eq(c: string, x: any) { pogoji.push(v => v[c] === x); return q },
      is(c: string, x: any) { pogoji.push(v => (x === null ? v[c] == null : v[c] === x)); return q },
      in(c: string, xs: any[]) { pogoji.push(v => xs.includes(v[c])); return q },
      or(izraz: string) { pogoji.push(orPogoj(izraz)); return q },
      lt(c: string, x: any) { pogoji.push(v => v[c] != null && v[c] < x); return q },
      order() { return q },
      limit() { return q },
      single() { ena = 'single'; return q },
      maybeSingle() { ena = 'maybe'; return q },
      then(ok: any, napaka: any) { return Promise.resolve(izvedi()).then(ok, napaka) },
    }
    function izvedi() {
      const ujema = (v: Vrstica) => pogoji.every(p => p(v))
      let rez: Vrstica[] = []
      if (op === 'insert') {
        const nove = (Array.isArray(podatki) ? podatki : [podatki]).map((p: any) => ({ id: `${ime}-${++stevec}`, ...p }))
        t(ime).push(...nove)
        rez = nove
      } else if (op === 'update') {
        for (const v of t(ime)) if (ujema(v)) { Object.assign(v, podatki); rez.push(v) }
        if (!vrni) return { data: null, error: null }
      } else {
        rez = t(ime).filter(ujema)
      }
      const kopije = rez.map(r => ({ ...r }))
      if (ena) return { data: kopije[0] ?? null, error: ena === 'single' && !kopije[0] ? { message: 'ni vrstice' } : null }
      return { data: kopije, error: null }
    }
    return q
  }

  return {
    tabele,
    from: (ime: string) => poizvedba(ime),
    rpc: async (ime: string, args: any) => ({ data: rpc[ime]?.(args), error: null }),
  }
}
