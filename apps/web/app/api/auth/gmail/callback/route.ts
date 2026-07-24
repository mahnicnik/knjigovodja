import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { encryptToken } from '@/lib/token-crypto'

/**
 * Google OAuth callback - sprejme kodo, zamenja za access/refresh token,
 * shrani povezavo v email_connections.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xn--raunko-j2a.si'
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const returnedState = searchParams.get('state')

  if (error || !code) {
    return NextResponse.redirect(new URL('/nastavitve?email_error=1', appUrl))
  }

  try {
    const cookieStore = await cookies()

    // CSRF ZASCITA (audit 23.7.2026): primerjaj state proti piskotku,
    // nastavljenem v connect/route.ts PRED preusmeritvijo na Google. Brez
    // tega bi napadalec lahko zvabil prijavljeno zrtev na URL s SVOJO
    // avtorizacijsko kodo in svoj Gmail racun povezal z zrtvino organizacijo.
    const savedState = cookieStore.get('gmail_oauth_state')?.value
    if (!savedState || savedState !== returnedState) {
      console.error('Gmail OAuth: state se ne ujema (mozen CSRF poskus)')
      return NextResponse.redirect(new URL('/nastavitve?email_error=1', appUrl))
    }
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', appUrl))
    }

    const redirectUri = `${appUrl}/api/auth/gmail/callback`

    // Zamenjaj kodo za access/refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('Gmail token exchange error:', tokenData)
      return NextResponse.redirect(new URL('/nastavitve?email_error=1', appUrl))
    }

    // Pridobi email naslov povezanega racuna
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.redirect(new URL('/nastavitve?email_error=1', appUrl))
    }

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()

    // POPRAVLJENO (24.7.2026, audit R5): tokeni sifrirani pred shranjevanjem
    await supabase.from('email_connections').insert({
      org_id: member.org_id,
      provider: 'gmail',
      email_address: profile.emailAddress || 'unknown',
      access_token: encryptToken(tokenData.access_token),
      refresh_token: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      token_expires_at: expiresAt,
      created_by: user.id,
    })

    const response = NextResponse.redirect(new URL('/nastavitve?email_connected=1', appUrl))
    response.cookies.delete('gmail_oauth_state')
    return response
  } catch (e: any) {
    console.error('Gmail callback error:', e)
    return NextResponse.redirect(new URL('/nastavitve?email_error=1', appUrl))
  }
}
