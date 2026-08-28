import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resend, FROM_EMAIL } from '@/lib/resend'

/**
 * ROJSTNODNEVNE ČESTITKE (26.8.2026)
 *
 * POPRAVLJENO (26.8.2026): ta datoteka je ob objavi preleta 142 vsebovala
 * vsebino DNEVNEGA OPRAVILA - napacna kopija pri usklajevanju. Uvazala je
 * samo sebe (`from '../birthdays/route'`), zato cestitke niso mogle delovati.
 *
 * DVE VAROVALKI, ki nista tehnicni, ampak PRAVNI:
 *
 *   1. PRIVOLITEV — cestitka je neposredno trzenje. Brez `marketing_consent`
 *      sporocilo NE odide, tudi ce ima stranka vpisan rojstni dan in e-naslov.
 *
 *   2. VKLOP NA RAVNI ORGANIZACIJE — privzeto IZKLOPLJENO. Odloci lastnik.
 *
 * Tretja varovalka je tehnicna: `birthday_greeted_year` prepreci, da bi
 * ponovni tek istega dne poslal drugo sporocilo.
 */

export const maxDuration = 60

/** Naslov za povezave v e-posti. Brez njega bi bila odjava neuporabna. */
const OSNOVNI_NASLOV = process.env.NEXT_PUBLIC_APP_URL || 'https://xn--raunko-j2a.si'

/** 29. februar: v navadnem letu cestitamo 28. februarja. */
function jeRojstniDanDanes(rojstvo: string, danes: Date): boolean {
  const [, mesec, dan] = rojstvo.split('-').map(Number)
  const m = danes.getMonth() + 1
  const d = danes.getDate()
  if (mesec === m && dan === d) return true

  // Rojen 29.2., letos februar nima 29 dni -> cestitamo 28.2.
  if (mesec === 2 && dan === 29 && m === 2 && d === 28) {
    const leto = danes.getFullYear()
    const jePrestopno = (leto % 4 === 0 && leto % 100 !== 0) || leto % 400 === 0
    return !jePrestopno
  }
  return false
}

function besediloCestitke(
  ime: string,
  podjetje: string,
  poljubno: string | null | undefined,
  odjavaUrl: string,
) {
  const prvoIme = (ime || '').trim().split(/\s+/)[0] || ime
  const sporocilo = poljubno?.trim()
    || 'vse najboljše! Danes naj bo dan zate — uživaj, praznuj po svoje in naj bo lepo. Se vidimo kmalu.'

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F3EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid rgba(0,0,0,0.06)">
    <div style="font-size:32px;margin-bottom:8px">🎂</div>
    <div style="font-size:19px;font-weight:700;color:#0D1F12;margin-bottom:14px;line-height:1.5">
      ${prvoIme}, ${sporocilo}
    </div>
    <div style="font-size:13px;color:#666;line-height:1.6;margin-top:22px;padding-top:16px;border-top:1px solid rgba(0,0,0,0.08)">
      ${podjetje}
    </div>
    <div style="font-size:11px;color:#999;line-height:1.7;margin-top:12px">
      To sporočilo ste prejeli, ker ste privolili v obveščanje.<br/>
      <a href="${odjavaUrl}" style="color:#777;text-decoration:underline">Odjava od obveščanja</a>
    </div>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  const skrivnost = process.env.CRON_SECRET
  if (skrivnost && req.headers.get('authorization') !== `Bearer ${skrivnost}`) {
    return NextResponse.json({ error: 'Neavtoriziran klic' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const danes = new Date()
  const letos = danes.getFullYear()
  let poslanih = 0, preskocenih = 0
  const napake: string[] = []

  // Samo organizacije, ki so to VKLOPILE.
  const { data: orgi } = await db
    .from('organizations')
    .select('id, name, pos_business_id, birthday_email_text')
    .eq('birthday_emails_enabled', true)
    .not('pos_business_id', 'is', null)

  for (const org of orgi || []) {
    const { data: stranke } = await db
      .from('customers')
      .select('id, name, email, birth_date, marketing_consent, birthday_greeted_year, unsubscribe_token')
      .eq('business_id', org.pos_business_id)
      .eq('archived', false)
      .not('birth_date', 'is', null)

    for (const s of stranke || []) {
      if (!jeRojstniDanDanes(s.birth_date, danes)) continue

      // PRIVOLITEV je pogoj, ne priporocilo.
      if (s.marketing_consent !== true) { preskocenih++; continue }
      if (!s.email) { preskocenih++; continue }
      if (s.birthday_greeted_year === letos) { preskocenih++; continue }

      try {
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [s.email],
          subject: `Vse najboljše, ${(s.name || '').split(/\s+/)[0]}! 🎂`,
          html: besediloCestitke(
            s.name,
            org.name || '',
            org.birthday_email_text,
            `${OSNOVNI_NASLOV}/odjava/${s.unsubscribe_token}`,
          ),
        })
        if (error) { napake.push(`${s.email}: ${error.message}`); continue }

        await db.from('customers')
          .update({ birthday_greeted_year: letos })
          .eq('id', s.id)
        poslanih++
      } catch (e: any) {
        napake.push(`${s.email}: ${e?.message || e}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    organizacij: (orgi || []).length,
    poslanih,
    preskocenih,
    napake: napake.slice(0, 5),
  })
}
