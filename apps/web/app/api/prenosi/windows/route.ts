import { NextResponse } from 'next/server'
import { URL_WINDOWS_REZERVA, zadnjaWindows } from '@/lib/prenosi'

/**
 * Prenos namizne aplikacije za Windows (15.10.2026): preusmeri na .exe zadnje
 * izdaje. Ce latest.yml ni dosegljiv, preusmeri na stran zadnje izdaje na
 * GitHubu, kjer je .exe med datotekami - gumb torej nikoli ne ostane mrtev.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const izdaja = await zadnjaWindows()
  return NextResponse.redirect(izdaja?.url ?? URL_WINDOWS_REZERVA, 302)
}
