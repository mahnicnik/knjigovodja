import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  cashier: 'Blagajnik',
  viewer: 'Gledalec',
  accountant: 'Računovodja',
}

/**
 * Generira nakljucno geslo brez lahko-zamenljivih znakov (0/O, 1/l/I),
 * da je gostoljubno za rocno prepisovanje z natisnjenega/prebranega e-maila.
 */
function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < length; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

/**
 * POPRAVLJENO 21.7.2026: prejsnji tok "posljemo povabilo -> uporabnik se sam
 * registrira -> klikne sprejmi" je bil pokvarjen, ker `handle_new_user` sprozilec
 * VSAKEMU novemu uporabniku samodejno ustvari LASTNO, LOCENO organizacijo. Nov
 * uporabnik je torej vedno pristal v svoji prazni organizaciji, nikoli v tisti,
 * v katero je bil dejansko povabljen - "sprejmi enkrat in to je to" zmeda.
 *
 * Nov tok: Racunko SAM ustvari Supabase racun (admin API, nakljucno geslo),
 * takoj po sprozilcu POCISTI osirotelo organizacijo, ki jo je ta ustvaril, in
 * uporabnika poveze s PRAVO organizacijo/vlogo. V e-mailu prejme e-mail+geslo
 * za takojsnjo prijavo - brez registracije, brez onboardinga.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { email, role } = await req.json()
    if (!email || !role) return NextResponse.json({ error: 'Manjkajo parametri' }, { status: 400 })

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Nimate pravic za povabilo novih clanov' }, { status: 403 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', member.org_id)
      .single()

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const roleLabel = ROLE_LABELS[role] ?? role
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://xn--raunko-j2a.si'}/login`

    // Preveri, ali uporabnik ze obstaja (obstojec Racunko racun)
    let existingUserId: string | null = null
    {
      const { data: existing } = await admin
        .from('org_members')
        .select('user_id')
        .limit(1) // placeholder - dejansko iskanje po emailu spodaj prek auth admin
      void existing
    }
    // Iskanje po emailu prek auth admin API (stranska stran - ni neposrednega
    // getUserByEmail v js v2, zato poskusimo najprej ustvariti in ob napaki
    // "already registered" poiscemo obstojeci user_id prek paginated listUsers).
    let isNewUser = true
    let password: string | null = null
    let newUserId: string | null = null

    const createRes = await admin.auth.admin.createUser({
      email,
      password: (password = generatePassword(10)),
      email_confirm: true,
      user_metadata: { full_name: '' },
    })

    if (createRes.error) {
      const msg = createRes.error.message || ''
      if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('registered')) {
        return NextResponse.json({ error: 'Napaka pri ustvarjanju racuna: ' + msg }, { status: 500 })
      }
      // Uporabnik ze obstaja - poisci njegov user_id
      isNewUser = false
      password = null
      let page = 1
      while (!existingUserId && page <= 20) {
        const { data: listData } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        const found = (listData?.users as any[] | undefined)?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
        if (found) existingUserId = found.id
        if (!listData?.users || listData.users.length < 200) break
        page++
      }
      if (!existingUserId) {
        return NextResponse.json({ error: 'Račun že obstaja, a ga ni bilo mogoče najti.' }, { status: 500 })
      }
      newUserId = existingUserId
    } else {
      newUserId = createRes.data.user!.id
      // POCISTI osiroteno organizacijo, ki jo je ustvaril handle_new_user sprozilec
      const { data: orphanMember } = await admin
        .from('org_members')
        .select('id, org_id')
        .eq('user_id', newUserId)
        .maybeSingle()
      if (orphanMember) {
        // POPRAVLJENO (16.8.2026): prej brez preverbe napak. Ce brisanje clanstva
        // spodleti, brisanje organizacije pa uspe, ostane clanstvo, ki kaze na
        // neobstojeco organizacijo - povabljeni uporabnik bi ob prijavi videl
        // pokvarjeno stanje. Napake zabelezimo, a povabila ne ustavimo (gre le
        // za ciscenje osirotelega zapisa).
        const { error: omErr } = await admin.from('org_members').delete().eq('id', orphanMember.id)
        if (omErr) {
          console.error('team/invite: osirotelega clanstva ni bilo mogoce izbrisati:', omErr)
        } else {
          // varno pobrisi tudi osiroteli org zapis (nic drugega se nanj ne sklicuje)
          const { error: orgErr } = await admin.from('organizations').delete().eq('id', orphanMember.org_id)
          if (orgErr) console.error('team/invite: osirotele organizacije ni bilo mogoce izbrisati:', orgErr)
        }
      }
    }

    // Ali je ze clan CILJNE organizacije?
    const { data: alreadyMember } = await admin
      .from('org_members')
      .select('id')
      .eq('org_id', member.org_id)
      .eq('user_id', newUserId!)
      .maybeSingle()

    if (!alreadyMember) {
      const { error: insertErr } = await admin
        .from('org_members')
        .insert({ org_id: member.org_id, user_id: newUserId!, role, invited_by: user.id })
      if (insertErr) {
        return NextResponse.json({ error: 'Napaka pri dodajanju v ekipo: ' + insertErr.message }, { status: 500 })
      }
    }

    // E-mail vsebina - locena za nov racun (geslo) vs obstojec racun (samo obvestilo)
    const html = isNewUser ? `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; color: #0D1F12;">
  <div style="background: #0D1F12; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="color: #E8B547; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">RAČUNKO</div>
    <div style="color: #fff; font-size: 22px; font-weight: 500; margin-top: 8px;">Vaš dostop je pripravljen</div>
  </div>
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-top: 0; border-radius: 0 0 12px 12px; padding: 28px 24px;">
    <p style="font-size: 14px; line-height: 1.6; color: #444;">
      Dodani ste v podjetje <strong>${org?.name ?? 'Računko'}</strong> kot <strong>${roleLabel}</strong>.
      Spodaj so vaši prijavni podatki:
    </p>
    <div style="background: #F7F6F2; border-radius: 10px; padding: 18px; margin: 20px 0;">
      <div style="font-size: 12px; color: #888; margin-bottom: 2px;">E-mail</div>
      <div style="font-size: 15px; font-weight: 700; color: #0D1F12; margin-bottom: 14px; font-family: monospace;">${email}</div>
      <div style="font-size: 12px; color: #888; margin-bottom: 2px;">Geslo</div>
      <div style="font-size: 15px; font-weight: 700; color: #0D1F12; font-family: monospace;">${password}</div>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${loginUrl}" style="background: #0D1F12; color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">
        Prijava →
      </a>
    </div>
    <p style="font-size: 12px; color: #aaa; text-align: center; line-height: 1.5;">
      Priporočamo, da geslo po prvi prijavi spremenite v Nastavitve → Profil.
    </p>
  </div>
</body></html>` : `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; color: #0D1F12;">
  <div style="background: #0D1F12; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="color: #E8B547; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">RAČUNKO</div>
    <div style="color: #fff; font-size: 22px; font-weight: 500; margin-top: 8px;">Nov dostop dodan</div>
  </div>
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-top: 0; border-radius: 0 0 12px 12px; padding: 28px 24px;">
    <p style="font-size: 14px; line-height: 1.6; color: #444;">
      Dodani ste v podjetje <strong>${org?.name ?? 'Računko'}</strong> kot <strong>${roleLabel}</strong>.
      Ker že imate Računko račun, se prijavite z obstoječim geslom.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${loginUrl}" style="background: #0D1F12; color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">
        Prijava →
      </a>
    </div>
  </div>
</body></html>`

    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: isNewUser
        ? `Vaš dostop do ${org?.name ?? 'Računko'} — vloga: ${roleLabel}`
        : `Nov dostop v ${org?.name ?? 'Računko'} — vloga: ${roleLabel}`,
      html,
    } as any)

    if (emailError) {
      console.error('Invite email error:', emailError)
      return NextResponse.json({ error: 'Uporabnik je dodan, a e-mail ni bil poslan: ' + JSON.stringify(emailError) }, { status: 207 })
    }

    return NextResponse.json({ success: true, isNewUser })
  } catch (e: any) {
    console.error('Team invite error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
