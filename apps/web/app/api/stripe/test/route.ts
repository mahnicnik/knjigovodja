import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await request.json()

    const { data: settings } = await sb
      .from('stripe_settings').select('secret_key').eq('org_id', org_id).single()

    if (!settings?.secret_key) {
      return NextResponse.json({ error: 'Stripe ključ ni nastavljen' }, { status: 400 })
    }

    // Test z Stripe API
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { 'Authorization': `Bearer ${settings.secret_key}` }
    })

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      account_id: data.id,
      account_name: data.business_profile?.name || data.email || data.id,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}