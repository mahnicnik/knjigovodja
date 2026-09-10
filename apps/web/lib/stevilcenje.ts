/**
 * PREPOZNAVA OBLIKE ŠTEVILKE RAČUNA
 * ═════════════════════════════════
 *
 * ZAKAJ: pri uvozu starih racunov iz drugega programa ne vemo, kako jih je
 * ta stevilcil. Ce oblike ne prepoznamo pravilno, uvozeni racuni ne bodo
 * imeli smiselnega zaporedja - in preverba vrzeli bo javljala, da manjkajo
 * racuni, ki obstajajo.
 *
 * DVA LOCENA SVETOVA (preverjeno pri viru, september 2026):
 *
 *   1. DAVCNO POTRJEN RACUN — 4. odstavek 5. clena ZDavPR
 *      Natanko trije deli: oznaka poslovnega prostora, oznaka elektronske
 *      naprave, zaporedna stevilka.
 *      Oznaki: a-z, A-Z, 0-9, dolzina 1 do 20 znakov.
 *      Zaporedna: SAMO stevke, brez vodilnih nicel (pravilo FURS R_3.4.3).
 *      Primeri: TRGOVINA1-BLAG2-4251 · APP1-B1-1 · SIRBFB01-RACUNKO01-489
 *
 *   2. NAVADEN RACUN — 82. clen ZDDV-1
 *      Oblika NI predpisana. Zahtevana je le "zaporedna stevilka, ki omogoca
 *      identifikacijo racuna". Locilo poljubno, vodilne nicle dovoljene.
 *      Primeri: 2026-001 · 001-2026 · 26-0001 · 1/2026 · R-2026-15 · 47
 *
 * NACELO: oblike NE ugibamo iz ene stevilke, ampak jo UGOTOVIMO iz vzorca.
 * Ena sama "2026-001" je lahko letnica in zaporedna ali predpona in
 * zaporedna; deset stevilk pove, katero od tega drzi.
 */

export type VrstaStevilke =
  | 'fiskalna'      // prostor-naprava-zaporedna
  | 'letnica-prva'  // 2026-001, 2026/1
  | 'letnica-zadnja'// 001-2026, 1/2026
  | 'predpona'      // R-15, FAK001
  | 'gola'          // 47
  | 'neznana'

export interface RazclenjenaStevilka {
  izvirna: string
  vrsta: VrstaStevilke
  predpona: string | null    // vse pred zaporedno stevilko
  letnica: number | null
  zaporedna: number | null
  dolzinaZaporedne: number   // za ohranjanje vodilnih nicel
  /** 2 ali 4 - da "26-0001" ne postane "2026-0001". */
  dolzinaLetnice: number
  locilo: string | null
}

/** Letnica je stiri- ali dvomestno stevilo v smiselnem razponu. */
function jeLetnica(s: string): boolean {
  const n = Number(s)
  if (!Number.isInteger(n)) return false
  if (s.length === 4) return n >= 1990 && n <= 2100
  if (s.length === 2) return n >= 0 && n <= 99
  return false
}

export function razcleni(vhod: string): RazclenjenaStevilka {
  const s = String(vhod || '').trim()
  const prazna: RazclenjenaStevilka = {
    izvirna: s, vrsta: 'neznana', predpona: null, letnica: null,
    zaporedna: null, dolzinaZaporedne: 0, dolzinaLetnice: 0, locilo: null,
  }
  if (!s) return prazna

  // 1. FISKALNA: trije deli, zadnji same stevke brez vodilne nicle.
  //    Oznaki smeta vsebovati vezaje? NE - vezaj je locilo, zato natanko dva.
  const fisk = s.match(/^([A-Za-z0-9]{1,20})-([A-Za-z0-9]{1,20})-([1-9][0-9]*)$/)
  if (fisk) {
    return {
      izvirna: s, vrsta: 'fiskalna',
      predpona: `${fisk[1]}-${fisk[2]}`,
      letnica: null,
      zaporedna: parseInt(fisk[3], 10),
      dolzinaZaporedne: fisk[3].length,
      dolzinaLetnice: 0,
      locilo: '-',
    }
  }

  // 2. DVA DELA, loceno z - / . ali presledkom.
  const dva = s.match(/^(.+?)\s*([-/.\s])\s*(.+)$/)
  if (dva) {
    const [, levo, loc, desno] = dva
    const levoStevke = /^[0-9]+$/.test(levo)
    const desnoStevke = /^[0-9]+$/.test(desno)

    if (levoStevke && desnoStevke) {
      // Katera stran je letnica? Ce sta obe kandidatki, odloci DOLZINA:
      // stirimestna je letnica, dvomestna ob daljsi nasprotni prav tako.
      if (jeLetnica(levo) && !(levo.length === 2 && desno.length === 2)) {
        return { izvirna: s, vrsta: 'letnica-prva', predpona: null,
                 letnica: Number(levo.length === 2 ? '20' + levo : levo),
                 zaporedna: parseInt(desno, 10), dolzinaZaporedne: desno.length,
                 dolzinaLetnice: levo.length, locilo: loc }
      }
      if (jeLetnica(desno)) {
        return { izvirna: s, vrsta: 'letnica-zadnja', predpona: null,
                 letnica: Number(desno.length === 2 ? '20' + desno : desno),
                 zaporedna: parseInt(levo, 10), dolzinaZaporedne: levo.length,
                 dolzinaLetnice: desno.length, locilo: loc }
      }
    }

    // Nestevilcna predpona: R-15, FAK-2026-001 obravnavamo posebej spodaj.
    if (!levoStevke && desnoStevke) {
      return { izvirna: s, vrsta: 'predpona', predpona: levo,
               letnica: null, zaporedna: parseInt(desno, 10),
               dolzinaZaporedne: desno.length, dolzinaLetnice: 0, locilo: loc }
    }
  }

  // 3. TRIJE DELI s crkovno predpono: R-2026-001
  const trije = s.match(/^(.+?)[-/.](\d{2,4})[-/.](\d+)$/)
  if (trije && jeLetnica(trije[2])) {
    return { izvirna: s, vrsta: 'letnica-prva', predpona: trije[1],
             letnica: Number(trije[2].length === 2 ? '20' + trije[2] : trije[2]),
             zaporedna: parseInt(trije[3], 10), dolzinaZaporedne: trije[3].length,
             dolzinaLetnice: trije[2].length, locilo: '-' }
  }

  // 4. GOLA STEVILKA ali crke + stevke brez locila (FAK001)
  const gola = s.match(/^([A-Za-z]*)([0-9]+)$/)
  if (gola) {
    return {
      izvirna: s,
      vrsta: gola[1] ? 'predpona' : 'gola',
      predpona: gola[1] || null,
      letnica: null,
      zaporedna: parseInt(gola[2], 10),
      dolzinaZaporedne: gola[2].length,
      dolzinaLetnice: 0,
      locilo: null,
    }
  }

  return prazna
}

/**
 * Ugotovi PREVLADUJOCO obliko iz vec stevilk.
 *
 * Ena sama stevilka je lahko dvoumna - "26-0001" je videti kot letnica+
 * zaporedna, a tudi kot predpona+zaporedna. Vzorec odloci: ce se leva stran
 * pri vecini ponavlja in ustreza letnici, je letnica.
 */
export function ugotoviObliko(stevilke: string[]): {
  vrsta: VrstaStevilke
  predpona: string | null
  dolzinaZaporedne: number
  dolzinaLetnice: number
  locilo: string
  zanesljivost: number   // 0-1, delez stevilk, ki ustrezajo prevladujoci obliki
} {
  const razclenjene = stevilke.map(razcleni).filter(r => r.zaporedna !== null)
  if (razclenjene.length === 0) {
    return { vrsta: 'neznana', predpona: null, dolzinaZaporedne: 0,
             dolzinaLetnice: 0, locilo: '-', zanesljivost: 0 }
  }

  const steviloPoVrsti = new Map<VrstaStevilke, number>()
  for (const r of razclenjene) steviloPoVrsti.set(r.vrsta, (steviloPoVrsti.get(r.vrsta) || 0) + 1)

  let vrsta: VrstaStevilke = 'neznana'
  let najvec = 0
  for (const [v, n] of steviloPoVrsti) if (n > najvec) { najvec = n; vrsta = v }

  const ujemajoce = razclenjene.filter(r => r.vrsta === vrsta)

  // Predpona velja le, ce je pri VSEH ujemajocih enaka - sicer ni predpona,
  // ampak nekaj, kar se od racuna do racuna spreminja.
  const predpone = new Set(ujemajoce.map(r => r.predpona))
  const predpona = predpone.size === 1 ? [...predpone][0] : null

  // Dolzina zaporedne: najpogostejsa, da ohranimo vodilne nicle.
  const dolzine = new Map<number, number>()
  for (const r of ujemajoce) dolzine.set(r.dolzinaZaporedne, (dolzine.get(r.dolzinaZaporedne) || 0) + 1)
  let dolzinaZaporedne = 0
  let najvecD = 0
  for (const [d, n] of dolzine) if (n > najvecD) { najvecD = n; dolzinaZaporedne = d }

  // Locilo in dolzino letnice prevzamemo od prve ujemajoce - znotraj ene
  // oblike sta enaka.
  return {
    vrsta, predpona, dolzinaZaporedne,
    dolzinaLetnice: ujemajoce[0]?.dolzinaLetnice || 4,
    locilo: ujemajoce[0]?.locilo || '-',
    zanesljivost: Math.round((ujemajoce.length / stevilke.length) * 100) / 100,
  }
}

/** Sestavi naslednjo številko v isti obliki. */
export function sestaviNaslednjo(
  oblika: ReturnType<typeof ugotoviObliko>,
  zaporedna: number,
  letnica: number = new Date().getFullYear(),
): string {
  const n = oblika.dolzinaZaporedne > 1
    ? String(zaporedna).padStart(oblika.dolzinaZaporedne, '0')
    : String(zaporedna)

  switch (oblika.vrsta) {
    case 'fiskalna':
      // Fiskalna zaporedna NE sme imeti vodilnih nicel (R_3.4.3).
      return `${oblika.predpona}-${zaporedna}`
    case 'letnica-prva': {
      // Dvomestno letnico OHRANIMO - "26-0001" ne sme postati "2026-0001".
      const l = oblika.dolzinaLetnice === 2 ? String(letnica).slice(-2) : String(letnica)
      const loc = oblika.locilo || '-'
      return oblika.predpona ? `${oblika.predpona}${loc}${l}${loc}${n}` : `${l}${loc}${n}`
    }
    case 'letnica-zadnja': {
      const l = oblika.dolzinaLetnice === 2 ? String(letnica).slice(-2) : String(letnica)
      return `${n}${oblika.locilo || '-'}${l}`
    }
    case 'predpona':
      return `${oblika.predpona}${oblika.predpona?.match(/[A-Za-z]$/) ? '' : '-'}${n}`
    default:
      return n
  }
}
