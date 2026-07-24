import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * Sprozi Gmail OAuth povezavo - preusmeri uporabnika na Google prijavo.
 *
 * POPRAVLJENO (audit 23.7.2026, CSRF): state je zdaj NAKLJUCEN (ne vec
 * user.id) in shranjen v kratkotrajen httpOnly piskotek. Callback ga mora
 * primerjati, preden nadaljuje - glej callback/route.ts.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://xn--raunko-j2a.si'}/api/auth/gmail/callback`
  const scope = 'https://www.googleapis.com/auth/gmail.readonly'
  const state = crypto.randomBytes(24).toString('hex')

  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  response.cookies.set('gmail_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minut - dovolj za dokoncanje Google prijave
    path: '/',
  })
  return response
}
