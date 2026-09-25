/**
 * PRELET 322: nalaganje VSEH vrstic iz Supabase, brez tihega rezanja.
 *
 * Supabase (PostgREST) na eno poizvedbo vrne NAJVEC 1000 vrstic - brez
 * napake in brez opozorila. Porocilo v blagajni je za september 2026
 * prebralo le 1000 od 1601 postavk: promet zgoraj je bil pravilen
 * (9.132,37 EUR), razdelitev Bar + Storitve pa je sestela samo 5.626,23 EUR.
 *
 * Druga, sorodna past: `.in('order_id', [...787 ID-jev])` sestavi URL z
 * ~30.000 znaki, ki ga streznik zavrne. Placila se zato niso nalozila in
 * porocilo je VSE racune prikazalo kot gotovino (v resnici 3.793,83 EUR
 * s kartico).
 *
 * Pravilo za porocila: kjer stevilo vrstic raste z obdobjem, NIKOLI ne
 * beri z golo poizvedbo - uporabi te pomocnike.
 */

const VELIKOST_STRANI = 1000
const VELIKOST_SKUPINE = 100

/**
 * Nalozi vse strani poizvedbe. `zgradi` mora vsakic vrniti SVEZO poizvedbo
 * z vsemi filtri in z urejanjem po enolicnem kljucu (npr. `.order('id')`),
 * sicer se lahko vrstice med stranmi podvojijo ali izpustijo.
 */
export async function naloziVseStrani<T = any>(
  zgradi: () => any,
  velikost: number = VELIKOST_STRANI,
): Promise<{ data: T[]; error: any }> {
  const vse: T[] = []
  for (let od = 0; ; od += velikost) {
    const { data, error } = await zgradi().range(od, od + velikost - 1)
    if (error) return { data: vse, error }
    const kos = (data || []) as T[]
    vse.push(...kos)
    if (kos.length < velikost) break
  }
  return { data: vse, error: null }
}

/**
 * Za filtre `.in(stolpec, idji)` z veliko ID-ji: razdeli jih v skupine po
 * 100 (kratek URL), vsako skupino nalozi v celoti in rezultate zdruzi.
 */
export async function naloziPoSkupinah<T = any>(
  idji: string[],
  zgradi: (skupina: string[]) => any,
  velikost: number = VELIKOST_SKUPINE,
): Promise<{ data: T[]; error: any }> {
  const vse: T[] = []
  for (let i = 0; i < idji.length; i += velikost) {
    const skupina = idji.slice(i, i + velikost)
    const { data, error } = await naloziVseStrani<T>(() => zgradi(skupina))
    if (error) return { data: vse, error }
    vse.push(...data)
  }
  return { data: vse, error: null }
}
