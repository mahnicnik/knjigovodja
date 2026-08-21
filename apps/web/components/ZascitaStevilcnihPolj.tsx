'use client'

import { useEffect } from 'react'

/**
 * ZAŠČITA ŠTEVILČNIH POLJ PRED MIŠKINIM KOLEŠČKOM (21.8.2026)
 *
 * Chrome (in ostali brskalniki) ob drsanju s kolescom spreminja vrednost
 * polja tipa `number`, ce je to v fokusu. Uporabnik podrsa po strani, da vidi
 * spodnji del obrazca, in med tem NEOPAZNO spremeni ceno, veljavnost ali
 * kolicino.
 *
 * Odkrito pri preizkusu: veljavnost paketa se je shranila kot 202 namesto
 * 180 dni. Isto velja za ceno artikla, kolicino normativa, gotovino ob
 * zakljucku blagajne in vsa druga stevilcna polja.
 *
 * Namesto popravka na ~200 mestih je tu ena globalna zascita: ko je v fokusu
 * polje tipa `number`, se drsanje nad njim NE prenese na vrednost. Drsanje
 * po strani deluje normalno.
 */
export default function ZascitaStevilcnihPolj() {
  useEffect(() => {
    function obDrsanju(e: WheelEvent) {
      const el = document.activeElement as HTMLInputElement | null
      if (!el || el.tagName !== 'INPUT') return
      if (el.type !== 'number') return
      // Drsanje spremeni vrednost samo, kadar je kazalec NAD poljem.
      if (e.target !== el && !el.contains(e.target as Node)) return
      // Odvzem fokusa je zanesljivejsi od preventDefault: brskalnik vrednosti
      // ne spremeni, stran pa se normalno pomika naprej.
      el.blur()
    }

    // `passive: true` — dogodka ne zaustavljamo, zato drsanje ostane gladko.
    document.addEventListener('wheel', obDrsanju, { passive: true })
    return () => document.removeEventListener('wheel', obDrsanju)
  }, [])

  return null
}
