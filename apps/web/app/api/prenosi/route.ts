import { NextResponse } from 'next/server'
import { zadnjaAndroid, zadnjaWindows, type StanjePrenosov } from '@/lib/prenosi'

/**
 * Stanje prenosov za stran /prenosi (15.10.2026): katera aplikacija je na
 * voljo, razlicica in velikost. Podatke o izdajah hrani streznik (lib/prenosi.ts,
 * OSVEZI_S), zato brskalnik stranke ne klice GitHuba.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const [windows, android] = await Promise.all([zadnjaWindows(), zadnjaAndroid()])
  const stanje: StanjePrenosov = { windows, android }
  return NextResponse.json(stanje, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
