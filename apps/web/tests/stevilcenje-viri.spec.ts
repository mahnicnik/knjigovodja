import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * REVIZIJA K4: davcno potrjeno stevilko racuna sme dodeliti SAMO
 * next_invoice_number. Staticna varovalka - pregleda vso kodo aplikacije.
 * (Socasnost preverja tests/stevilcenje-socasno.spec.ts nad pravim PostgreSQL.)
 */

const KOREN = join(__dirname, '..')
function datoteke(mapa: string): string[] {
  return readdirSync(mapa).flatMap(ime => {
    const pot = join(mapa, ime)
    if (['node_modules', '.next', 'tests', 'public'].includes(ime)) return []
    return statSync(pot).isDirectory() ? datoteke(pot) : /\.(ts|tsx|js|mjs)$/.test(ime) ? [pot] : []
  })
}
const koda = ['app', 'lib', 'components'].flatMap(m => datoteke(join(KOREN, m)))
  .map(pot => ({ pot: relative(KOREN, pot), vir: readFileSync(pot, 'utf8') }))

test('K4: nobena koda ne klice starih stevcev (get_next_pos_invoice_number, get_next_web_invoice_number)', () => {
  const najdeno = koda.filter(d => /rpc\(\s*['"](get_next_pos_invoice_number|get_next_web_invoice_number)['"]/.test(d.vir)).map(d => d.pot)
  expect(najdeno).toEqual([])
})

test('K4: vsak klic next_invoice_number poda prostor in napravo', () => {
  const klici = koda.flatMap(d => [...d.vir.matchAll(/rpc\(\s*'next_invoice_number'\s*,\s*\{([^}]*)\}/g)].map(m => ({ pot: d.pot, args: m[1] })))
  expect(klici.length).toBeGreaterThanOrEqual(5) // blagajna (2), pos-stripe (2), portal, storno
  for (const k of klici) {
    expect(k.args, k.pot).toMatch(/p_premise_id/)
    expect(k.args, k.pot).toMatch(/p_device_id/)
  }
})
