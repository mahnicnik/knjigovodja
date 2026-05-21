import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase service role klient (bypass RLS za cron)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// Vercel cron — zaščita z secret
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const results: any[] = []

  try {
    // 1. Pridobi vse aktivne businessse
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name')

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ message: 'No businesses found', sent: 0 })
    }

    for (const biz of businesses) {
      // 2. Generiraj notifikacije za ta business
      await supabase.rpc('generate_pos_notifications', { p_business_id: biz.id })

      // 3. Pridobi neposlane notifikacije s customer emailom
      const { data: notifs } = await supabase
        .from('pos_notifications')
        .select(`
          id, message, severity, type,
          customers (id, name, email, notification_email),
          customer_packages (id, expires, name, template_type)
        `)
        .eq('business_id', biz.id)
        .eq('dismissed', false)
        .eq('email_sent', false)
        .in('type', ['expiring_soon', 'expired', 'low_visits'])
        .order('created_at', { ascending: false })

      if (!notifs || notifs.length === 0) continue

      for (const notif of notifs) {
        const customer = notif.customers as any
        const pkg = notif.customer_packages as any

        // Preskoči če ni emaila ali je opt-out
        if (!customer?.email || customer?.notification_email === false) {
          continue
        }

        // Sestavi zadevo
        const subject = notif.type === 'expired'
          ? `Vaša karta "${pkg?.name}" je potekla`
          : notif.type === 'low_visits'
          ? `Zmanjkuje vam obiskov — ${pkg?.name}`
          : `Vaša karta "${pkg?.name}" kmalu poteče`

        // Pošlji email
        try {
          const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: customer.email,
              subject,
              customerName: customer.name,
              packageName: pkg?.name || 'kartica',
              expiresAt: pkg?.expires,
              severity: notif.severity,
            }),
          })

          if (emailRes.ok) {
            // Označi kot poslano
            await supabase
              .from('pos_notifications')
              .update({ email_sent: true, read: false })
              .eq('id', notif.id)

            results.push({
              customer: customer.name,
              email: customer.email,
              package: pkg?.name,
              status: 'sent',
            })
          } else {
            const err = await emailRes.json()
            results.push({ customer: customer.name, status: 'failed', error: err })
          }
        } catch (emailErr: any) {
          results.push({ customer: customer.name, status: 'error', error: emailErr.message })
        }

        // Rate limiting — max 2 emaila na sekundo (Resend free tier)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status !== 'sent').length,
      details: results,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
