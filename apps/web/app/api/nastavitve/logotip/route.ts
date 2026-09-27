import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId } from '@/lib/active-org-server'

export const dynamic = 'force-dynamic'

/**
 * PRELET 330: logotip organizacije (izpise se na PDF racunih).
 *
 *  POST   multipart { orgId, datoteka }  nalozi / zamenja logotip
 *  DELETE ?orgId=...                     odstrani logotip
 *
 * Samo lastnik ali skrbnik. Sprejme PNG ali JPEG do 2 MB - samo ta dva
 * formata PDF knjiznica (@react-pdf) zanesljivo izrise. Vrsto preverimo po
 * VSEBINI datoteke (prvi bajti), ne po koncnici.
 */
const NAJVEC_BAJTOV = 2 * 1024 * 1024
const VEDRO = 'logotipi'

function vrstaSlike(b: Uint8Array): 'png' | 'jpg' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  return null
}

async function dostop(request: NextRequest, zahtevanaOrg: string | null) {
  const cookieStore = await cookies()
  const uporabniski = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )
  const { data: { user } } = await uporabniski.auth.getUser()
  if (!user) return { napaka: NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 }) }
  if (!zahtevanaOrg) return { napaka: NextResponse.json({ error: 'Manjka organizacija' }, { status: 400 }) }
  const { orgId, role } = await resolveActiveOrgId(uporabniski, user.id, zahtevanaOrg)
  // resolveActiveOrgId ob neujemanju vrne PRVO organizacijo - zato preverimo.
  if (!orgId || orgId !== zahtevanaOrg) return { napaka: NextResponse.json({ error: 'Nimate dostopa do te organizacije' }, { status: 403 }) }
  if (role !== 'owner' && role !== 'admin') return { napaka: NextResponse.json({ error: 'Logotip lahko spremeni le lastnik ali skrbnik' }, { status: 403 }) }
  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return { orgId, sb }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const d = await dostop(request, String(form.get('orgId') || '') || null)
    if ('napaka' in d) return d.napaka
    const { orgId, sb } = d

    const datoteka = form.get('datoteka')
    if (!datoteka || typeof datoteka === 'string') return NextResponse.json({ error: 'Izberite sliko.' }, { status: 400 })
    if (datoteka.size > NAJVEC_BAJTOV) return NextResponse.json({ error: 'Slika je prevelika (največ 2 MB).' }, { status: 400 })
    const bajti = new Uint8Array(await datoteka.arrayBuffer())
    const vrsta = vrstaSlike(bajti)
    if (!vrsta) return NextResponse.json({ error: 'Podprta sta formata PNG in JPG. (SVG, WEBP in HEIC shranite kot PNG.)' }, { status: 400 })

    const pot = `${orgId}/logotip-${Date.now()}.${vrsta}`
    const { error: upErr } = await sb.storage.from(VEDRO).upload(pot, bajti, {
      contentType: vrsta === 'png' ? 'image/png' : 'image/jpeg', upsert: false, cacheControl: '31536000',
    })
    if (upErr) return NextResponse.json({ error: 'Nalaganje ni uspelo: ' + upErr.message }, { status: 500 })
    const { data: javni } = sb.storage.from(VEDRO).getPublicUrl(pot)

    const { data: prej } = await sb.from('organizations').select('logo_pot').eq('id', orgId).single()
    const { error: updErr } = await sb.from('organizations').update({ logo_url: javni.publicUrl, logo_pot: pot }).eq('id', orgId)
    if (updErr) {
      await sb.storage.from(VEDRO).remove([pot])
      return NextResponse.json({ error: 'Logotipa ni bilo mogoče shraniti: ' + updErr.message }, { status: 500 })
    }
    // Stara datoteka ni vec v uporabi (izdani racuni se izrisejo ob prenosu z AKTUALNIM logotipom).
    if (prej?.logo_pot && prej.logo_pot !== pot) await sb.storage.from(VEDRO).remove([prej.logo_pot])

    return NextResponse.json({ success: true, logo_url: javni.publicUrl })
  } catch (e: any) {
    console.error('api/nastavitve/logotip POST:', e)
    return NextResponse.json({ error: e?.message || 'Napaka' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const d = await dostop(request, new URL(request.url).searchParams.get('orgId'))
    if ('napaka' in d) return d.napaka
    const { orgId, sb } = d
    const { data: prej } = await sb.from('organizations').select('logo_pot').eq('id', orgId).single()
    const { error } = await sb.from('organizations').update({ logo_url: null, logo_pot: null }).eq('id', orgId)
    if (error) return NextResponse.json({ error: 'Logotipa ni bilo mogoče odstraniti: ' + error.message }, { status: 500 })
    if (prej?.logo_pot) await sb.storage.from(VEDRO).remove([prej.logo_pot])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('api/nastavitve/logotip DELETE:', e)
    return NextResponse.json({ error: e?.message || 'Napaka' }, { status: 500 })
  }
}
