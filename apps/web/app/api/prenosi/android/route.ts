import { NextResponse } from 'next/server'
import { URL_ANDROID_APK, zadnjaAndroid } from '@/lib/prenosi'

/**
 * Prenos Android aplikacije (15.10.2026): preusmeri na APK v predizdaji
 * `android` (stalno ime, glej lib/prenosi.ts). Ce APK-ja se ni, vrne stranko
 * na /prenosi, kjer pise "Trenutno ni na voljo" - namesto GitHubove strani 404.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const izdaja = await zadnjaAndroid()
  if (izdaja) return NextResponse.redirect(URL_ANDROID_APK, 302)
  return NextResponse.redirect(new URL('/prenosi?ni=android', req.url), 302)
}
