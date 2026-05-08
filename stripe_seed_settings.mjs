// Nastavi testne Stripe nastavitve v Supabase za testiranje
// Zaženite: SUPABASE_SERVICE_KEY='eyJ...' node stripe_seed_settings.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yvpvrhwodskvbqmgsghy.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cHZyaHdvZHNrdmJxbWdzZ2h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM5MTE3NCwiZXhwIjoyMDkyOTY3MTc0fQ.n2ujjymDPdwM416v8WbJtVmnyKhhInei5VJwIzaFHEI'

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Manjka SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('🔧 Nastavljam testne Stripe nastavitve...\n')

  // Najdi organizacijo Ana Kovač (test profil)
  const { data: orgs } = await sb.from('organizations').select('id, name')
  
  console.log('Najdene organizacije:')
  orgs?.forEach(o => console.log(`  ${o.id} — ${o.name}`))

  // Nastavi za vsako org testni webhook secret
  for (const org of orgs || []) {
    const { error } = await sb.from('stripe_settings').upsert({
      org_id: org.id,
      secret_key: 'sk_test_dummy_key_for_testing',
      webhook_secret: 'whsec_test_secret_123',
      default_vat_rate: '22',
      auto_create_invoices: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' })

    if (error) console.log(`  ❌ ${org.name}: ${error.message}`)
    else console.log(`  ✅ ${org.name}: Stripe nastavitve shranjene`)
  }

  console.log('\n✅ Nastavitve shranjene!')
  console.log('\nZdaj zaženite test webhook:')
  console.log('  node stripe_test_webhook.mjs')
  console.log('\nNe pozabite nastaviti ORG_ID v stripe_test_webhook.mjs!')
}

main().catch(e => { console.error(e.message); process.exit(1) })
