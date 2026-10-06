import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { uvoziRegister } from '@/lib/register-zavezancev'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * NOCNI UVOZ REGISTRA DAVCNIH ZAVEZANCEV (FURS odprti podatki, oktober 2026).
 *
 * Prenese DURS_zavezanci_PO.zip in DURS_zavezanci_DEJ.zip, ju razcleni in
 * upserta v register_zavezancev (vir za /api/company-lookup). Stare vrstice
 * se izbrisejo sele, ko sta oba uvoza uspela - ob napaki ostanejo obstojeci
 * podatki nespremenjeni (glej uvoziRegister).
 *
 * Meritve (6.10.2026, GitHub runner): zipa 7,4 + 7,3 MB, prenos in razclenitev
 * obeh ~30 s, RSS ~350 MB. Odgovor vsebuje trajanje po korakih in pomnilnik.
 */
async function prenesi(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Racunko/1.0' },
    signal: AbortSignal.timeout(120_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Prenos ${url} ni uspel: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function GET(request: NextRequest) {
  // Brez nastavljenega CRON_SECRET se NE izvede (sicer bi 'Bearer undefined' odprl vrata).
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const zacetek = Date.now()
  try {
    const izid = await uvoziRegister(sb, prenesi)
    console.log('[register-zavezancev] uvoz uspel', JSON.stringify(izid))
    return NextResponse.json({ ok: true, ...izid })
  } catch (e: any) {
    const napaka = {
      ok: false,
      error: e?.message || String(e),
      trajanje_ms: Date.now() - zacetek,
      pomnilnik_mb: Math.round(process.memoryUsage().rss / 1e6),
      opomba: 'Obstoječi podatki niso bili izbrisani.',
    }
    console.error('[register-zavezancev] uvoz ni uspel', JSON.stringify(napaka))
    return NextResponse.json(napaka, { status: 500 })
  }
}
