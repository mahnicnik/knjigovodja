import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Klican preko Vercel Cron (dnevno). Preveri VSE zamrznjene kartice
 * (customer_packages), ki imajo dolocen frozen_until datum, ki je ze
 * potekel. Za vsako: izracuna stevilo dni zamrznitve, premakne expires
 * naprej za toliko dni, ter ponastavi frozen_at/frozen_until na null
 * (kartica postane spet aktivna).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data: toUnfreeze } = await supabase
    .from('customer_packages')
    .select('id, expires, frozen_at, frozen_until')
    .not('frozen_at', 'is', null)
    .not('frozen_until', 'is', null)
    .lte('frozen_until', today)

  let unfrozen = 0

  for (const pkg of toUnfreeze || []) {
    try {
      const frozenAt = new Date(pkg.frozen_at)
      const frozenUntil = new Date(pkg.frozen_until)
      const frozenDays = Math.max(0, Math.round((frozenUntil.getTime() - frozenAt.getTime()) / 86400000))

      let newExpires = pkg.expires
      if (pkg.expires && frozenDays > 0) {
        const exp = new Date(pkg.expires)
        exp.setDate(exp.getDate() + frozenDays)
        newExpires = exp.toISOString().split('T')[0]
      }

      await supabase.from('customer_packages').update({
        frozen_at: null,
        frozen_until: null,
        expires: newExpires,
      }).eq('id', pkg.id)

      unfrozen++
    } catch (e) {
      console.error('Napaka pri avtomatski odmrznitvi kartice', pkg.id, e)
    }
  }

  return NextResponse.json({ success: true, unfrozen })
}
