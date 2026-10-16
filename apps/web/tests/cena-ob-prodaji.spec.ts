import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * UNIVERZALNI ARTIKEL – CENA OB PRODAJI (16.10.2026, migracija 186)
 *
 * Artikel s kljukico "Cena ob prodaji" nima stalne cene: na blagajni se ob
 * pritisku odpre vnos zneska, DDV je stopnja artikla. Brez baze in brskalnika.
 *
 * Zagon:  cd apps/web && npx playwright test tests/cena-ob-prodaji.spec.ts
 */

const KOREN = join(__dirname, '..')
const REPO = join(KOREN, '..', '..')
const pos = readFileSync(join(KOREN, 'app', 'pos', 'page.tsx'), 'utf8')
const mobPos = readFileSync(join(REPO, 'apps', 'mobile', 'app', 'pos.tsx'), 'utf8')
const mobKosarica = readFileSync(join(REPO, 'apps', 'mobile', 'lib', 'cart.tsx'), 'utf8')
const mobKatalog = readFileSync(join(REPO, 'apps', 'mobile', 'app', 'catalog.tsx'), 'utf8')

test('migracija doda stolpec s privzeto false (obstojeci artikli nespremenjeni)', () => {
  const sql = readFileSync(join(REPO, 'supabase', 'migrations', '186_cena_ob_prodaji.sql'), 'utf8')
  expect(sql).toMatch(/add column if not exists cena_ob_prodaji boolean not null default false/)
})

test.describe('spletna blagajna', () => {
  test('pritisk na univerzalni artikel odpre vnos zneska namesto dodajanja', () => {
    const i = pos.indexOf('async function addItem(item, happyOn = false) {')
    expect(i).toBeGreaterThan(0)
    expect(pos.slice(i, i + 200)).toContain('if (item.cena_ob_prodaji) { setVnosCene(item); return }')
    expect(pos).toContain('<VnosCeneModal item={vnosCene}')
  })

  test('vrstica nosi vneseni znesek, DDV artikla, brez zaloge in brez zdruzevanja', () => {
    const i = pos.indexOf('function dodajZnesek(item, znesek, opis)')
    const telo = pos.slice(i, i + 900)
    expect(telo).toContain('setCart(c => [...c, {')          // vedno nova vrstica
    expect(telo).toContain('price: znesek')
    expect(telo).toContain('name: opis || item.name')
    expect(telo).toContain('vat_rate: Number(item.vat_rate ?? 22)')
    expect(telo).toContain('stock: null')
    expect(telo).toContain('happyHourApplied: false')
  })

  test('oba urejevalnika artikla shranita kljukico in ne zahtevata cene', () => {
    expect(pos.match(/cena_ob_prodaji: obProdaji,/g)?.length).toBe(2)
    expect(pos.match(/const obProdaji = itemType === 'simple' && !!itemModal\.cena_ob_prodaji/g)?.length).toBe(2)
    expect(pos.match(/!obProdaji && \(!itemModal\.price/g)?.length).toBe(2)
    expect(pos.match(/<b>Cena ob prodaji<\/b>/g)?.length).toBe(2)
  })
})

test.describe('Android', () => {
  test('univerzalni artikel odpre vnos zneska, vrstica je locena', () => {
    expect(mobPos).toContain('if (item.cena_ob_prodaji) {')
    expect(mobPos).toContain('cenaVnesena: true')
    expect(mobKosarica).toContain("const ex = item.cenaVnesena ? null : current.find(l => l.item.id === item.id && !l.item.cenaVnesena)")
    // zdruzevanje po lineId, ne po item.id (vec vrstic istega artikla)
    expect(mobKosarica).toContain('l.lineId === ex.lineId')
  })

  test('katalog: 9,5 % DDV se ne zaokrozi na 9 (parseFloat, ne parseInt)', () => {
    expect(mobKatalog).not.toContain('parseInt(newItem.vat_rate)')
    expect(mobKatalog).toContain('parseFloat(newItem.vat_rate)')
    expect(mobKatalog).toContain('cena_ob_prodaji: newItem.cena_ob_prodaji')
  })
})
