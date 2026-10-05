/**
 * Majhna Supabase baza v pomnilniku za teste (prelet 364). Podpira samo,
 * kar uporabljajo testirane funkcije: select/insert/update/upsert, eq, is, in,
 * gte, lt, like, or (pogoji col.op.val in skupine and(...)), limit, range,
 * single/maybeSingle, rpc. Gnezdeni izbori (npr. orders(order_lines(...)))
 * niso podprti - vrstice v testu ze vsebujejo gnezdene podatke.
 */
type Vrstica = Record<string, any>
type Pogoj = (v: Vrstica) => boolean

function primerjaj(v: any, op: string, x: string) {
  if (op === 'is') return x === 'null' ? v == null : v === (x === 'true')
  if (op === 'eq') return String(v) === x
  if (op === 'lt') return v != null && String(v) < x
  if (op === 'gte') return v != null && String(v) >= x
  if (op === 'lte') return v != null && String(v) <= x
  if (op === 'gt') return v != null && String(v) > x
  return true
}

/** Razdeli po vejicah na najvisji ravni (vejice v and(...) ostanejo). */
function razdeli(izraz: string): string[] {
  const deli: string[] = []
  let globina = 0, zacetek = 0
  for (let i = 0; i < izraz.length; i++) {
    if (izraz[i] === '(') globina++
    else if (izraz[i] === ')') globina--
    else if (izraz[i] === ',' && globina === 0) { deli.push(izraz.slice(zacetek, i)); zacetek = i + 1 }
  }
  deli.push(izraz.slice(zacetek))
  return deli
}

function enPogoj(d: string): Pogoj {
  if (d.startsWith('and(') && d.endsWith(')')) {
    const vsi = razdeli(d.slice(4, -1)).map(enPogoj)
    return v => vsi.every(p => p(v))
  }
  const [col, op, ...x] = d.split('.')
  return v => primerjaj(v[col], op, x.join('.'))
}

function orPogoj(izraz: string): Pogoj {
  const deli = razdeli(izraz).map(enPogoj)
  return v => deli.some(p => p(v))
}

const kotLike = (vzorec: string) => new RegExp('^' + vzorec.split('%').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')

export function laznaBaza(zacetno: Record<string, Vrstica[]> = {}, rpc: Record<string, (args: any) => any> = {}) {
  const tabele: Record<string, Vrstica[]> = {}
  for (const [k, v] of Object.entries(zacetno)) tabele[k] = v.map(r => ({ ...r }))
  let stevec = 0
  const t = (ime: string) => (tabele[ime] ||= [])

  function poizvedba(ime: string) {
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
    let podatki: any = null
    let konflikt: string[] = []
    let vrni = false
    let ena: 'single' | 'maybe' | null = null
    const pogoji: Pogoj[] = []
    const q: any = {
      select() { if (op !== 'select') vrni = true; return q },
      update(p: any) { op = 'update'; podatki = p; return q },
      insert(p: any) { op = 'insert'; podatki = p; return q },
      upsert(p: any, o?: { onConflict?: string }) { op = 'upsert'; podatki = p; konflikt = (o?.onConflict || 'id').split(','); return q },
      gte(c: string, x: any) { pogoji.push(v => v[c] != null && String(v[c]) >= String(x)); return q },
      like(c: string, x: string) { const re = kotLike(x); pogoji.push(v => v[c] != null && re.test(String(v[c]))); return q },
      range() { return q },
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
      if (op === 'upsert') {
        for (const p of (Array.isArray(podatki) ? podatki : [podatki])) {
          const obstojeca = t(ime).find(v => konflikt.every(k => v[k] === p[k]))
          if (obstojeca) { Object.assign(obstojeca, p); rez.push(obstojeca) }
          else { const nova = { id: `${ime}-${++stevec}`, ...p }; t(ime).push(nova); rez.push(nova) }
        }
        if (!vrni) return { data: null, error: null }
      } else if (op === 'insert') {
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
