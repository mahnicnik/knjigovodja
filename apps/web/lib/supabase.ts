import { createBrowserClient } from '@supabase/ssr'

// POPRAVLJENO (14.8.2026, KRITICNO): prej je ta funkcija ustvarila NOV
// Supabase odjemalec OB VSAKEM KLICU (createClient() je bil klican 181x
// samo v pos/page.tsx!) - vsak primerek ima SVOJ lasten casovnik za
// samodejno osvezevanje avtentikacijskega zetona. Rezultat: deset/sto
// neodvisnih, tekmujocih casovnikov, ki poskusajo osveziti ISTO sejo
// hkrati -> "Failed to fetch" napake pri osvezevanju (opazeno 8x
// zaporedoma med POS avditom). Zdaj: EN, ponovno uporabljen primerek na
// brskalnik/zavihek (standarden, priporocen Supabase vzorec).
let cachedClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!cachedClient) {
    cachedClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return cachedClient
}