import { createClient } from '@supabase/supabase-js'

// ── NASTAVITVE ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://yvpvrhwodskvbqmgsghy.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cHZyaHdvZHNrdmJxbWdzZ2h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM5MTE3NCwiZXhwIjoyMDkyOTY3MTc0fQ.n2ujjymDPdwM416v8WbJtVmnyKhhInei5VJwIzaFHEI'

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌  Manjka SUPABASE_SERVICE_KEY')
  console.error('   Zaženite: SUPABASE_SERVICE_KEY=eyJ... node seed.mjs')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── HELPERS ─────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`  ${msg}`)
const ok  = (msg) => console.log(`  ✅ ${msg}`)
const err = (msg, e) => console.error(`  ❌ ${msg}:`, e?.message || e)

function dateAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function dateFwd(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function invoiceNum(prefix, n) {
  return `${prefix}-${String(n).padStart(3,'0')}`
}

// ── TESTNI PROFILI ───────────────────────────────────────────────────────────
const PROFILES = [

  // 1. IT freelancer — normiranec
  {
    org: { name: 'Ana Kovač s.p.', tax_number: '12345678', vat_registered: false, address: 'Trubarjeva 10', city: 'Ljubljana', post_code: '1000', iban: 'SI56 0292 1001 2345 679' },
    prefs: { nav_hidden: ['/zaloga','/blagajna','/ddv','/ddv/evidenca','/place','/rek1','/dopust'], quick_actions: ['/invoices/new','/scan','/ai','/prispevki','/statistika','/normirani'] },
    invoices: [
      { client:'Agencija Pixel d.o.o.', amount_net:2500, vat:0, status:'paid', days_ago:45, due_days:30, desc:'Razvoj spletne aplikacije' },
      { client:'Startup XY d.o.o.', amount_net:1800, vat:0, status:'paid', days_ago:30, due_days:14, desc:'UI/UX svetovanje' },
      { client:'Medij Plus d.o.o.', amount_net:3200, vat:0, status:'sent', days_ago:10, due_days:30, desc:'Razvoj mobilne aplikacije' },
      { client:'Tech Solutions d.o.o.', amount_net:950, vat:0, status:'sent', days_ago:20, due_days:14, desc:'Tehnični pregled kode' },
      { client:'E-commerce Ventures', amount_net:4100, vat:0, status:'draft', days_ago:2, due_days:30, desc:'Spletna trgovina — faza 1' },
    ],
    receipts: [
      { desc:'Adobe Creative Cloud', amount_net:55, vat:12.1, days_ago:5 },
      { desc:'GitHub Pro', amount_net:8, vat:1.76, days_ago:5 },
      { desc:'Najemnina pisarne', amount_net:300, vat:0, days_ago:3 },
    ],
    label: '💻 Ana Kovač s.p. — IT freelancer',
  },

  // 2. Gostinstvo — bar z zaposlenimi
  {
    org: { name: 'Bar Roka d.o.o.', tax_number: '23456789', vat_registered: true, address: 'Mestni trg 5', city: 'Maribor', post_code: '2000', iban: 'SI56 0292 1009 8765 432' },
    prefs: { nav_hidden: [], quick_actions: ['/invoices/new','/blagajna','/expenses','/place','/ddv','/scan'] },
    invoices: [
      { client:'Mestna občina Maribor', amount_net:1200, vat:264, status:'paid', days_ago:20, due_days:30, desc:'Catering — slavnostna večerja' },
      { client:'Podjetje ABC d.o.o.', amount_net:800, vat:176, status:'paid', days_ago:15, due_days:14, desc:'Poslovni lunch — 20 oseb' },
      { client:'Hotel Orel', amount_net:2400, vat:528, status:'sent', days_ago:5, due_days:30, desc:'Dobava pijač — oktober' },
    ],
    receipts: [
      { desc:'Dobavitelj pijače — Mercator', amount_net:1200, vat:264, days_ago:8 },
      { desc:'Hrana — Metro Cash&Carry', amount_net:850, vat:80.75, days_ago:6 },
      { desc:'Najemnina lokala', amount_net:1500, vat:0, days_ago:3 },
      { desc:'Elektrika', amount_net:280, vat:61.6, days_ago:4 },
    ],
    employees: [
      { full_name:'Marko Horvat', tax_number:'12121212', iban:'SI56029210012345001', gross_salary:1500, employment_type:'full_time', dependents:1 },
      { full_name:'Sara Novak', tax_number:'34343434', iban:'SI56029210012345002', gross_salary:1400, employment_type:'full_time', dependents:0 },
      { full_name:'Jure Kralj', tax_number:'56565656', iban:'SI56029210012345003', gross_salary:1300, employment_type:'part_time', dependents:2 },
    ],
    label: '🍽️ Bar Roka d.o.o. — gostinstvo',
  },

  // 3. Fizioterapija
  {
    org: { name: 'Fizioterapija Šport s.p.', tax_number: '34567890', vat_registered: false, address: 'Športna 3', city: 'Kranj', post_code: '4000', iban: 'SI56 0292 1005 5555 123' },
    prefs: { nav_hidden: ['/zaloga','/blagajna','/ddv','/ddv/evidenca','/normirani'], quick_actions: ['/invoices/new','/expenses','/scan','/ai','/amortizacija','/kilometrina'] },
    invoices: [
      { client:'Primož Kovač', amount_net:120, vat:0, status:'paid', days_ago:3, due_days:7, desc:'Fizioterapija — 2x obravnava' },
      { client:'Ana Šimenc', amount_net:180, vat:0, status:'paid', days_ago:7, due_days:7, desc:'Fizioterapija — 3x obravnava' },
      { client:'ZZZS — refundacija', amount_net:850, vat:0, status:'sent', days_ago:12, due_days:30, desc:'Refundacija oktober' },
      { client:'Športen center Kranj', amount_net:600, vat:0, status:'paid', days_ago:20, due_days:14, desc:'Skupinska vadba — mesec' },
      { client:'Tomaž Bernik', amount_net:240, vat:0, status:'overdue', days_ago:40, due_days:14, desc:'Fizioterapija — 4x obravnava' },
    ],
    receipts: [
      { desc:'Ultrazvočna naprava — lizing', amount_net:450, vat:0, days_ago:5 },
      { desc:'Material za obravnave', amount_net:85, vat:8.08, days_ago:10 },
      { desc:'Najemnina ordinacije', amount_non:600, amount_net:600, vat:0, days_ago:3 },
    ],
    employees: [
      { full_name:'Maja Zupan', tax_number:'78787878', iban:'SI56029210012345004', gross_salary:1600, employment_type:'full_time', dependents:0 },
    ],
    label: '🏥 Fizioterapija Šport s.p.',
  },

  // 4. Spletna trgovina
  {
    org: { name: 'Modni butik Ela d.o.o.', tax_number: '45678901', vat_registered: true, address: 'Čopova 12', city: 'Ljubljana', post_code: '1000', iban: 'SI56 0292 1007 7777 321' },
    prefs: { nav_hidden: ['/place','/rek1','/dopust','/potni-stroski','/avto','/reprezentanca','/blagajna','/normirani'], quick_actions: ['/invoices/new','/expenses','/zaloga','/scan','/ddv','/eslog'] },
    invoices: [
      { client:'Petra Krajnc', amount_net:89, vat:19.58, status:'paid', days_ago:2, due_days:7, desc:'Bluza — model 2024' },
      { client:'Marta Vidmar', amount_net:245, vat:53.9, status:'paid', days_ago:4, due_days:7, desc:'Komplet — jesenski' },
      { client:'Boutique Rosa d.o.o.', amount_net:1200, vat:264, status:'sent', days_ago:8, due_days:30, desc:'Veleprodaja — 20 kosov' },
      { client:'Online naročilo #1042', amount_net:67, vat:14.74, status:'paid', days_ago:1, due_days:3, desc:'Majica + hlače' },
      { client:'Fashion House d.o.o.', amount_net:3400, vat:748, status:'overdue', days_ago:45, due_days:14, desc:'Kolekcija jesen/zima' },
    ],
    receipts: [
      { desc:'Dobavitelj — italijan kolekcija', amount_net:2800, vat:616, days_ago:15 },
      { desc:'Pakiranje in poštnina', amount_net:180, vat:39.6, days_ago:5 },
      { desc:'Facebook Ads', amount_net:350, vat:77, days_ago:3 },
    ],
    label: '🛍️ Modni butik Ela d.o.o. — e-commerce',
  },

  // 5. Gradbeništvo
  {
    org: { name: 'Gradnje Kos s.p.', tax_number: '56789012', vat_registered: true, address: 'Industrijska 8', city: 'Celje', post_code: '3000', iban: 'SI56 0292 1003 3333 456' },
    prefs: { nav_hidden: ['/zaloga','/normirani','/eslog'], quick_actions: ['/invoices/new','/expenses','/place','/potni-stroski','/reprezentanca','/opomniki'] },
    invoices: [
      { client:'Stanovanjski sklad RS', amount_net:18500, vat:4070, status:'paid', days_ago:60, due_days:30, desc:'Obnova fasade — Blok A' },
      { client:'Grad Celje d.o.o.', amount_net:7200, vat:1584, status:'paid', days_ago:30, due_days:30, desc:'Adaptacija pisarn' },
      { client:'Privatni investitor Krajnc', amount_net:24000, vat:5280, status:'sent', days_ago:10, due_days:45, desc:'Gradnja hiše — faza 2' },
      { client:'Občina Celje', amount_net:4500, vat:990, status:'overdue', days_ago:50, due_days:30, desc:'Asfaltiranje — park' },
    ],
    receipts: [
      { desc:'Gradbeni material — Bauhaus', amount_net:3200, vat:704, days_ago:12 },
      { desc:'Najem gradbenega stroja', amount_net:1800, vat:396, days_ago:8 },
      { desc:'Gorivo za vozila', amount_net:450, vat:99, days_ago:5 },
      { desc:'Zaščitna oprema', amount_net:280, vat:61.6, days_ago:15 },
    ],
    employees: [
      { full_name:'Boštjan Kos', tax_number:'11223344', iban:'SI56029210012345005', gross_salary:1700, employment_type:'full_time', dependents:2 },
      { full_name:'Damjan Ferlič', tax_number:'55667788', iban:'SI56029210012345006', gross_salary:1550, employment_type:'full_time', dependents:1 },
    ],
    label: '🏗️ Gradnje Kos s.p. — gradbeništvo',
  },

  // 6. Finančno svetovanje — mejnik normiranec
  {
    org: { name: 'Finance svetovanje Novak s.p.', tax_number: '67890123', vat_registered: true, address: 'Dunajska 55', city: 'Ljubljana', post_code: '1000', iban: 'SI56 0292 1008 8888 654' },
    prefs: { nav_hidden: ['/zaloga','/blagajna','/place','/rek1','/dopust','/avto','/amortizacija'], quick_actions: ['/invoices/new','/ai','/ddv','/opomniki','/statistika','/scan'] },
    invoices: [
      { client:'Kapital Invest d.o.o.', amount_net:8500, vat:1870, status:'paid', days_ago:45, due_days:30, desc:'M&A svetovanje — Q3' },
      { client:'Private Equity Fund A', amount_net:12000, vat:2640, status:'paid', days_ago:30, due_days:14, desc:'Due diligence — Target X' },
      { client:'Zavarovalnica Triglav', amount_net:6800, vat:1496, status:'paid', days_ago:20, due_days:30, desc:'Aktuarsko poročilo' },
      { client:'Banka Koper d.d.', amount_net:9200, vat:2024, status:'sent', days_ago:8, due_days:30, desc:'Finančni audit Q4' },
      { client:'Startup Accelerator SI', amount_net:4500, vat:990, status:'overdue', days_ago:35, due_days:14, desc:'Pitch deck finančni model' },
    ],
    receipts: [
      { desc:'Bloomberg terminal — mesec', amount_net:1800, vat:396, days_ago:5 },
      { desc:'Pravni nasvet — odvetnik', amount_net:400, vat:88, days_ago:10 },
      { desc:'Poslovni kosilo — 3 stranke', amount_net:180, vat:0, days_ago:7 },
    ],
    label: '📊 Finance svetovanje Novak s.p.',
  },
]

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function seedProfile(profile) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`🔧 ${profile.label}`)
  console.log('─'.repeat(60))

  // 1. Ustvari org
  log('Ustvarjam organizacijo...')
  const { data: org, error: orgErr } = await sb.from('organizations').insert(profile.org).select().single()
  if (orgErr) { err('Org', orgErr); return null }
  ok(`Org: ${org.name} (${org.id.slice(0,8)})`)

  // 2. Ustvari test user v auth (samo preklopi na service role)
  const email = `test-${profile.org.tax_number}@test.knjigovodja.si`
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email, password: 'Test1234!', email_confirm: true,
    user_metadata: { full_name: profile.org.name }
  })
  if (authErr && !authErr.message.includes('already')) { err('Auth user', authErr); return null }
  const userId = authData?.user?.id || (await sb.auth.admin.listUsers()).data.users.find(u=>u.email===email)?.id
  if (!userId) { err('User ID not found'); return null }
  ok(`User: ${email}`)

  // 3. Org member
  await sb.from('org_members').upsert({ org_id: org.id, user_id: userId, role: 'owner' }, { onConflict: 'org_id,user_id' })
  ok('Org member dodan')

  // 4. User preferences
  await sb.from('user_preferences').upsert({
    user_id: userId,
    nav_hidden: profile.prefs.nav_hidden,
    nav_order: ['Pregled','Poslovanje','Davki','Zaposleni','Evidenca','Blagajna'],
    quick_actions: profile.prefs.quick_actions,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  ok('Preferences shranjene')

  // 5. Računi
  log(`Ustvarjam ${profile.invoices.length} računov...`)
  for (let i = 0; i < profile.invoices.length; i++) {
    const inv = profile.invoices[i]
    const num = invoiceNum(new Date().getFullYear(), i+1)
    const issueDate = dateAgo(inv.days_ago)
    const dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + inv.due_days)
    const { error: invErr } = await sb.from('issued_invoices').insert({
      org_id: org.id,
      invoice_number: num,
      client_name: inv.client,
      issue_date: issueDate,
      due_date: dueDate.toISOString().split('T')[0],
      line_items: [{ description: inv.desc, quantity: 1, unit_price: inv.amount_net, vat_rate: inv.vat > 0 ? 22 : 0 }],
      amount_net: inv.amount_net,
      vat_amount: inv.vat || 0,
      amount_total: inv.amount_net + (inv.vat || 0),
      status: inv.status,
      reference: `SI00 ${num}`,
    })
    if (invErr) err(`Račun ${num}`, invErr)
  }
  ok(`${profile.invoices.length} računov ustvarjenih`)

  // 6. Stroški
  if (profile.receipts?.length) {
    log(`Ustvarjam ${profile.receipts.length} stroškov...`)
    for (const r of profile.receipts) {
      await sb.from('receipts').insert({
        org_id: org.id,
        description: r.desc,
        receipt_date: dateAgo(r.days_ago),
        amount_net: r.amount_net,
        vat_amount: r.vat || 0,
        amount_total: r.amount_net + (r.vat || 0),
        category: 'other',
      })
    }
    ok(`${profile.receipts.length} stroškov ustvarjenih`)
  }

  // 7. Zaposleni
  if (profile.employees?.length) {
    log(`Ustvarjam ${profile.employees.length} zaposlenih...`)
    for (const emp of profile.employees) {
      await sb.from('employees').insert({
        org_id: org.id,
        ...emp,
        start_date: dateAgo(365),
        status: 'active',
      })
    }
    ok(`${profile.employees.length} zaposlenih ustvarjenih`)
  }

  return { org, userId, email }
}

async function main() {
  console.log('\n🚀 Knjigovodja.si — Test Data Seed')
  console.log('════════════════════════════════════\n')

  const results = []
  for (const profile of PROFILES) {
    const result = await seedProfile(profile)
    if (result) results.push({ ...result, label: profile.label })
  }

  console.log('\n\n════════════════════════════════════')
  console.log('✅  SEED ZAKLJUČEN')
  console.log('════════════════════════════════════\n')
  console.log('Testni računi:\n')
  for (const r of results) {
    console.log(`  ${r.label}`)
    console.log(`  Email:    ${r.email}`)
    console.log(`  Geslo:    Test1234!`)
    console.log(`  Org ID:   ${r.org.id}\n`)
  }
  console.log('Prijavite se na: https://knjigovodja.vercel.app/login\n')
}

main().catch(e => { console.error('\n💥 Napaka:', e.message); process.exit(1) })
