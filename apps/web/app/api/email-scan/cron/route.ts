import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { skenirajPovezavo } from '@/lib/email-scan'


/**
 * Klican preko Vercel Cron (dnevno). Preveri VSE aktivne email_connections
 * in za vsako presodi, ali je "na vrsti" glede na njen scan_schedule
 * (daily/weekly/monthly/custom) in last_scanned_at. Ce je, izvede isto
 * skeniranje kot rocni /api/email-scan/run, samo brez uporabniske seje
 * (uporablja service role kljuc, saj gre za sistemski klic).
 */
export async function GET(request: NextRequest) {
  // Zascita pred zunanjimi klici - Vercel Cron poslje ta header samodejno
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('is_active', true)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  const now = new Date()
  const zacetek = Date.now()
  let processed = 0
  const rezultati: any[] = []

  for (const conn of connections) {
    // Presodi ali je ta povezava "na vrsti" glede na urnik
    const last = conn.last_scanned_at ? new Date(conn.last_scanned_at) : null
    let due = false
    if (conn.scan_schedule === 'custom') {
      // Enostaven cron matcher za polji "dan-v-mesecu" in "mesec" (format: min ura dan mesec dan-v-tednu).
      // Cron sam tece dnevno ob 6h, zato preverimo samo ali se DANASNJI datum ujema z dan/mesec polji.
      if (conn.custom_cron) {
        const parts = conn.custom_cron.trim().split(/\s+/)
        if (parts.length === 5) {
          const [, , domField, monthField] = parts
          const nowDay = now.getUTCDate()
          const nowMonth = now.getUTCMonth() + 1
          const matchField = (field: string, value: number) => {
            if (field === '*') return true
            return field.split(',').map(Number).includes(value)
          }
          const domOk = matchField(domField, nowDay)
          const monthOk = matchField(monthField, nowMonth)
          // Ne skeniraj vec kot enkrat isti dan
          const alreadyToday = last && last.toDateString() === now.toDateString()
          due = domOk && monthOk && !alreadyToday
        }
      }
    } else if (!last) {
      due = true
    } else {
      const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)
      if (conn.scan_schedule === 'daily' && hoursSince >= 24) due = true
      else if (conn.scan_schedule === 'weekly' && hoursSince >= 24 * 7) due = true
      else if (conn.scan_schedule === 'monthly' && hoursSince >= 24 * 30) due = true
    }
    if (!due) continue

    // PRELET 334: ista logika kot rocno skeniranje (lib/email-scan). Prej je
    // cron iskal le e-poste s kljucnimi besedami, najvec 20, in oznako
    // premaknil VEDNO - vse ostalo je bilo za rocni "od zadnjega skena"
    // izgubljeno. Zdaj ima omejen cas (cron poganja se druga opravila);
    // nedokoncan pregled nadaljuje naslednji dan (oznaka se ne premakne).
    const preostalo = 90_000 - (Date.now() - zacetek)
    if (preostalo < 10_000) break
    try {
      const od = last || new Date(Date.now() - 7 * 86_400_000)
      const izid = await skenirajPovezavo(supabase, conn, { od, rokMs: preostalo, premakniOznako: true })
      if (izid.napaka) console.error('email-scan cron:', conn.id, izid.napaka)
      rezultati.push({ connection: conn.id, ...izid })
      processed++
    } catch (connErr) {
      console.error('Cron scan error for connection', conn.id, connErr)
      continue
    }
  }

  return NextResponse.json({ success: true, processed, rezultati })
}
