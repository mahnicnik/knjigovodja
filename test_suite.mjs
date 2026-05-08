import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yvpvrhwodskvbqmgsghy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cHZyaHdvZHNrdmJxbWdzZ2h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTExNzQsImV4cCI6MjA5Mjk2NzE3NH0.T802qo1QASc1_Tnw4smctAhIp5sTCTo45gQKWyZa4AQ'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cHZyaHdvZHNrdmJxbWdzZ2h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM5MTE3NCwiZXhwIjoyMDkyOTY3MTc0fQ.n2ujjymDPdwM416v8WbJtVmnyKhhInei5VJwIzaFHEI'


const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const results = { passed: 0, failed: 0, warnings: 0, tests: [] }

const pass = (profile, test, detail = '') => {
  results.passed++
  results.tests.push({ status: 'PASS', profile, test, detail })
  console.log(`  ✅ ${test}${detail ? ' — ' + detail : ''}`)
}
const fail = (profile, test, detail = '') => {
  results.failed++
  results.tests.push({ status: 'FAIL', profile, test, detail })
  console.log(`  ❌ ${test}${detail ? ' — ' + detail : ''}`)
}
const warn = (profile, test, detail = '') => {
  results.warnings++
  results.tests.push({ status: 'WARN', profile, test, detail })
  console.log(`  ⚠️  ${test}${detail ? ' — ' + detail : ''}`)
}
const section = (title) => console.log(`\n  ── ${title}`)

const PROFILES = [
  { email: 'test-12345678@test.knjigovodja.si', password: 'Test1234!', label: '💻 Ana Kovač s.p.' },
  { email: 'test-23456789@test.knjigovodja.si', password: 'Test1234!', label: '🍽️ Bar Roka d.o.o.' },
  { email: 'test-34567890@test.knjigovodja.si', password: 'Test1234!', label: '🏥 Fizioterapija Šport' },
  { email: 'test-45678901@test.knjigovodja.si', password: 'Test1234!', label: '🛍️ Modni butik Ela' },
  { email: 'test-56789012@test.knjigovodja.si', password: 'Test1234!', label: '🏗️ Gradnje Kos' },
  { email: 'test-67890123@test.knjigovodja.si', password: 'Test1234!', label: '📊 Finance Novak' },
]

async function runProfile(profile) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(` ${profile.label}`)
  console.log('═'.repeat(60))

  // 1. AUTH
  section('Avtentikacija')
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({ email: profile.email, password: profile.password })
  if (authErr || !authData.user) { fail(profile.label, 'Prijava', authErr?.message); return }
  pass(profile.label, 'Prijava uspešna', authData.user.id.slice(0,8) + '...')
  const userId = authData.user.id

  // 2. ORGANIZACIJA
  section('Organizacija')
  const { data: member, error: memErr } = await client.from('org_members').select('organizations(*)').eq('user_id', userId).single()
  if (memErr || !member) { fail(profile.label, 'Org membership', memErr?.message); return }
  const org = member.organizations
  org.name ? pass(profile.label, 'Ime org', org.name) : fail(profile.label, 'Ime org', 'prazno')
  org.tax_number ? pass(profile.label, 'Davčna številka', org.tax_number) : fail(profile.label, 'Davčna številka', 'manjka')
  org.iban ? pass(profile.label, 'IBAN', org.iban) : warn(profile.label, 'IBAN', 'manjka — UPN QR ne bo delal')

  // 3. NASTAVITVE
  section('Nastavitve')
  const { data: prefs } = await client.from('user_preferences').select('*').eq('user_id', userId).single()
  if (!prefs) warn(profile.label, 'User preferences', 'manjkajo')
  else {
    prefs.nav_hidden?.length >= 0 ? pass(profile.label, 'Nav hidden', `${prefs.nav_hidden.length} skritih`) : warn(profile.label, 'Nav hidden', 'ni nastavljeno')
    prefs.quick_actions?.length > 0 ? pass(profile.label, 'Hitre akcije', `${prefs.quick_actions.length} akcij`) : warn(profile.label, 'Hitre akcije', 'niso nastavljene')
  }

  // 4. RAČUNI
  section('Računi')
  const { data: invoices, error: invErr } = await client.from('issued_invoices').select('*').eq('org_id', org.id)
  if (invErr) { fail(profile.label, 'Branje računov', invErr.message) }
  else {
    const invList = invoices || []
    pass(profile.label, 'Računi se berejo', `${invList.length} računov`)

    const paid = invList.filter(i => i.status === 'paid')
    const sent = invList.filter(i => i.status === 'sent')
    const today = new Date().toISOString().split('T')[0]
    const overdue = invList.filter(i => i.status === 'sent' && i.due_date < today)

    if (paid.length > 0) pass(profile.label, 'Plačani računi', `${paid.length}x`)
    if (sent.length > 0) pass(profile.label, 'Poslani računi', `${sent.length}x`)
    if (overdue.length > 0) warn(profile.label, 'Računi v zamudi', `${overdue.length}x`)

    // Obvezna polja
    const missing = invList.filter(i => !i.invoice_number || !i.client_name || !i.amount_total).length
    missing === 0 ? pass(profile.label, 'Obvezna polja OK', '') : fail(profile.label, 'Manjkajoča polja', `${missing} računov`)

    // Sklici za UPN
    const noRef = invList.filter(i => !i.reference).length
    noRef === 0 ? pass(profile.label, 'Vsi imajo sklic (UPN)', '') : warn(profile.label, 'Brez sklica', `${noRef} računov`)

    // Skupni prihodki
    const totalRev = invList.filter(i => i.status !== 'draft').reduce((s, i) => s + Number(i.amount_net), 0)
    const totalVatOut = invList.filter(i => i.status !== 'draft').reduce((s, i) => s + Number(i.vat_amount), 0)
    pass(profile.label, 'YTD prihodki', `€${totalRev.toFixed(2)} + DDV €${totalVatOut.toFixed(2)}`)

    // Normiranec meja
    if (!org.vat_registered) {
      if (totalRev > 50000) fail(profile.label, 'Normiranec meja!', `€${totalRev.toFixed(0)} > €50.000`)
      else if (totalRev > 40000) warn(profile.label, 'Normiranec meja', `€${totalRev.toFixed(0)} — bliža se €50.000`)
      else pass(profile.label, 'Normiranec meja OK', `€${totalRev.toFixed(0)} / €50.000`)

      // Izračun dohodnine
      const taxBase = totalRev * 0.20
      const tax = taxBase * 0.20
      pass(profile.label, 'Normirani izračun', `osnova: €${taxBase.toFixed(0)}, dohodnina: €${tax.toFixed(0)}/leto = €${(tax/12).toFixed(0)}/mes`)
    }
  }

  // 5. STROŠKI
  section('Stroški')
  const { data: receipts, error: recErr } = await client.from('receipts').select('*').eq('org_id', org.id)
  if (recErr) fail(profile.label, 'Branje stroškov', recErr.message)
  else {
    const recList = receipts || []
    pass(profile.label, 'Stroški se berejo', `${recList.length} stroškov`)
    const totalExp = recList.reduce((s, r) => s + Number(r.amount_net), 0)
    const vatIn = recList.reduce((s, r) => s + Number(r.vat_amount), 0)
    if (recList.length > 0) pass(profile.label, 'Skupni odhodki', `€${totalExp.toFixed(2)} (vhodni DDV: €${vatIn.toFixed(2)})`)

    // DDV izračun za zavezance
    if (org.vat_registered && invoices) {
      const vatOut = (invoices || []).filter(i => i.status !== 'draft').reduce((s, i) => s + Number(i.vat_amount), 0)
      const vatDue = Math.max(0, vatOut - vatIn)
      pass(profile.label, 'DDV dolg', `€${vatDue.toFixed(2)} (izhodni €${vatOut.toFixed(2)} - vhodni €${vatIn.toFixed(2)})`)
      if (vatDue > 2000) warn(profile.label, 'Visok DDV dolg', `€${vatDue.toFixed(2)}`)
    }

    // Letna analiza — dobiček
    const totalRev2 = (invoices || []).filter(i => i.status !== 'draft').reduce((s, i) => s + Number(i.amount_net), 0)
    const profit = totalRev2 - totalExp
    const margin = totalRev2 > 0 ? (profit / totalRev2 * 100).toFixed(1) : '0'
    pass(profile.label, 'Dobiček', `€${profit.toFixed(0)} (${margin}% marža)`)
    if (profit < 0) fail(profile.label, 'Negativen dobiček!', `€${profit.toFixed(0)}`)
    else if (Number(margin) < 20) warn(profile.label, 'Nizka marža', `${margin}%`)
  }

  // 6. ZAPOSLENI
  const { data: employees } = await client.from('employees').select('*').eq('org_id', org.id).eq('status', 'active')
  if (employees && employees.length > 0) {
    section('Zaposleni')
    pass(profile.label, 'Zaposleni', `${employees.length} aktivnih`)
    for (const emp of employees) {
      const gross = Number(emp.gross_salary)
      gross >= 1253.90
        ? pass(profile.label, `${emp.full_name}`, `bruto €${gross.toFixed(2)} ✓`)
        : fail(profile.label, `${emp.full_name}`, `bruto €${gross.toFixed(2)} < minimalna plača!`)
    }

    // Regres
    const now = new Date()
    if (now.getMonth() >= 3) {
      const { data: regres } = await client.from('payslips').select('*').eq('org_id', org.id).eq('type', 'regres').gte('period_start', `${now.getFullYear()}-01-01`)
      const regresCount = regres?.length || 0
      regresCount >= employees.length
        ? pass(profile.label, 'Regres izplačan', `${regresCount}/${employees.length}`)
        : warn(profile.label, 'Regres', `izplačan ${regresCount}/${employees.length} — rok 1. julij!`)
    }
  }

  // 7. ROKI IN DAVKI
  section('Roki ta mesec')
  const now = new Date()
  const day = now.getDate()
  const ddvMonths = [4, 7, 10, 1]

  day > 15 ? warn(profile.label, 'Prispevki s.p.', `rok 15. je potekel (danes ${day}.)`) : pass(profile.label, 'Prispevki s.p.', `rok čez ${15 - day} dni`)
  day > 15 ? warn(profile.label, 'Akontacija dohodnine', `rok 15. je potekel`) : pass(profile.label, 'Akontacija dohodnine', `rok čez ${15 - day} dni`)
  if (org.vat_registered && ddvMonths.includes(now.getMonth() + 1)) warn(profile.label, 'DDV-O obračun', 'ta mesec je treba oddati!')

  // 8. ZAKONSKE NOVOSTI
  section('Zakonske novosti')
  const { data: updates } = await client.from('legal_updates').select('id').limit(3)
  updates && updates.length > 0
    ? pass(profile.label, 'Zakonske novosti v bazi', `${updates.length}+ novosti`)
    : warn(profile.label, 'Zakonske novosti', 'prazno — pritisnite Osveži na dashboardu')

  // 9. MESEČNI PREGLED
  section('Mesečni pregled')
  const months = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']
  const year = now.getFullYear()
  const monthly = {}
  for (const inv of (invoices || [])) {
    if (inv.status === 'draft') continue
    const d = new Date(inv.issue_date)
    if (d.getFullYear() === year) {
      const m = d.getMonth()
      monthly[m] = (monthly[m] || 0) + Number(inv.amount_net)
    }
  }
  const activeMths = Object.entries(monthly).filter(([,v]) => v > 0)
  if (activeMths.length > 0) pass(profile.label, 'Mesečni pregled', activeMths.map(([m,v]) => `${months[m]}: €${Number(v).toFixed(0)}`).join(' · '))
  else warn(profile.label, 'Mesečni pregled', 'ni računov za ta leto')

  await client.auth.signOut()
}

async function main() {
  console.log('\n🧪 Knjigovodja.si — Avtomatizirani test suite')
  console.log('════════════════════════════════════════════')
  console.log(`Začetek: ${new Date().toLocaleString('sl-SI')}\n`)

  for (const profile of PROFILES) {
    await runProfile(profile)
  }

  console.log(`\n\n${'═'.repeat(60)}`)
  console.log(' REZULTATI')
  console.log('═'.repeat(60))
  console.log(`\n  ✅ Passed:   ${results.passed}`)
  console.log(`  ❌ Failed:   ${results.failed}`)
  console.log(`  ⚠️  Warnings: ${results.warnings}`)
  const score = Math.round(results.passed / (results.passed + results.failed + 0.001) * 100)
  console.log(`\n  🎯 Score: ${score}%`)

  if (results.failed > 0) {
    console.log('\n  ── Napake:')
    results.tests.filter(t => t.status === 'FAIL').forEach(t => console.log(`  ❌ [${t.profile}] ${t.test}: ${t.detail}`))
  }
  if (results.warnings > 0) {
    console.log('\n  ── Opozorila:')
    results.tests.filter(t => t.status === 'WARN').forEach(t => console.log(`  ⚠️  [${t.profile}] ${t.test}: ${t.detail}`))
  }
  console.log(`\n  Konec: ${new Date().toLocaleString('sl-SI')}\n`)
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1) })
