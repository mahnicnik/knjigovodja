import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * DAVCNA NAPRAVA TELEFONA (trznice, 16.10.2026)
 *
 * 1. Android je racune potrjeval prek /api/furs/confirm (pot za racune s
 *    portala) s stevilko NAROCILA in piskotkom, ki ga streznik ne bere -
 *    racuni s telefona niso bili davcno potrjeni, napaka je bila tiha.
 * 2. /api/furs/invoice je napravo iskal z .maybeSingle() - pri dveh napravah
 *    v prostoru je racun dobil izmisljeno oznako RACUNKO01.
 *
 * Zagon:  cd apps/web && npx playwright test tests/naprava-telefona.spec.ts
 */

const KOREN = join(__dirname, '..')
const REPO = join(KOREN, '..', '..')
const beri = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8')

test('Android potrjuje racun blagajne po isti poti kot splet, z JWT in izbranim podjetjem', () => {
  const pos = beri('apps', 'mobile', 'app', 'pos.tsx')
  expect(pos).toContain("fetch('https://xn--raunko-j2a.si/api/furs/invoice'")
  expect(pos).not.toContain("fetch('https://xn--raunko-j2a.si/api/furs/confirm'")
  expect(pos).toContain("'Authorization': 'Bearer ' + session.access_token")
  expect(pos).toContain("'x-active-org': auth!.orgId")
  expect(pos).toContain('order_id: orderId')
  expect(pos).toContain('premise_id: naprava.prostorId, device_id: naprava.id')
  // napaka ni vec tiha
  expect(pos).toContain('račun NI davčno potrjen')
})

test('/api/furs/invoice sprejme JWT telefona (ne API kljucev) in izbrano napravo', () => {
  const r = beri('apps', 'web', 'app', 'api', 'furs', 'invoice', 'route.ts')
  expect(r).toContain("return t && !t.startsWith('rk_') ? t : null")
  expect(r).toContain('await supabase.auth.getUser(jwt)')
  expect(r).toContain("device_id: requestedDeviceId")
  expect(r).toContain(".eq('premise_id', premise.id)")
  // ni vec maybeSingle po prostoru (pri 2 napravah je vrnil null)
  expect(r).not.toMatch(/\.from\('electronic_devices'\)\s*\.select\('\*'\)\s*\.eq\('premise_id', premise\.id\)\s*\.eq\('is_active', true\)\s*\.maybeSingle\(\)/)
  expect(r).toContain("find((d: any) => d.channel !== 'web')")
})

test('portalna pot (confirm) zna izbrano napravo, ostali klici nespremenjeni', () => {
  const lib = beri('apps', 'web', 'lib', 'furs-invoice-confirm.ts')
  expect(lib).toContain('requestedDeviceId?: string,')
  expect(lib).toContain("izbranaNaprava ?? webDevice")
})

test('telefon z eno napravo ne vprasa, z vec napravami zahteva izbiro', () => {
  const n = beri('apps', 'mobile', 'lib', 'naprava.ts')
  expect(n).toContain('if (vse.length === 1) return { naprava: vse[0], vse };')
  expect(n).toContain("return n ? { naprava: n, vse } : { naprava: null, izbira: true, vse };")
  expect(n).toContain("d.channel !== 'web'")
})
