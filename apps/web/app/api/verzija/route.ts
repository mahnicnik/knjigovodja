import { NextResponse } from 'next/server'

/**
 * Vrne identifikator trenutne gradnje (22.8.2026).
 *
 * Uporablja ga `ZaznavaNoveRazlicice`, da ugotovi, ali odprt zavihek tece na
 * stari kodi. Vercel ob vsaki objavi nastavi `VERCEL_GIT_COMMIT_SHA`; v
 * razvoju vrnemo 'dev', kar zaznavo utisa.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'dev'

  return NextResponse.json(
    { buildId },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
