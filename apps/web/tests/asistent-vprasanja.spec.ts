import { test, expect } from '@playwright/test'
import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { BAZA_ZNANJA } from '../lib/kb/baza.generated'
import { MODEL_ASISTENTA, sistemskiBloki, type VlogaUporabnika } from '../lib/kb/asistent'

/**
 * RAČUNKO ASISTENT – realna testna vprašanja (faza 5, oktober 2026)
 *
 * Za vsako vprašanje:
 *  1. "baza" (vedno): v dokumentu, ki mora odgovoriti, so pricakovana dejstva.
 *     Ce dejstva ni v bazi, ga asistent ne more vedeti.
 *  2. "živo" (samo z ANTHROPIC_API_KEY): isti poziv kot v produkciji
 *     (/api/support-chat), odgovor mora omeniti pricakovane menije/gumbe.
 *     Odgovori se zapisejo v test-results/asistent-odgovori.md za rocni pregled.
 *
 * Zagon zivega dela (porabi ~15 klicev modela):
 *   ANTHROPIC_API_KEY=... npx playwright test tests/asistent-vprasanja.spec.ts
 */

type Primer = {
  vprasanje: string
  pot: string
  vloga?: VlogaUporabnika
  paket?: string
  modul: string            // dokument, ki mora vsebovati odgovor
  vBazi: RegExp[]          // dejstva v tem dokumentu
  vOdgovoru: RegExp[]      // kar mora omeniti odgovor modela
  neVOdgovoru?: RegExp[]
}

const PRIMERI: Primer[] = [
  { vprasanje: 'Kako dodam artikel, ki je normativ (recept/sestavljen artikel) pri POS blagajni?', pot: '/pos', modul: 'pos-normativi-surovine',
    vBazi: [/Z normativom/, /zavihek Surovine/, /porabo na en prodan kos/], vOdgovoru: [/Kategorije & Artikli/, /Surovin/, /Z normativom/] },
  { vprasanje: 'Kje v portalu najdem nastavitve za Stripe?', pot: '/dashboard', modul: 'portal-stripe',
    vBazi: [/Plačila s kartico/, /Integracije → Stripe/, /Naročnina/], vOdgovoru: [/Plačila s kartico/, /Integracij/] },
  { vprasanje: 'Kako vklopim samodejno podaljševanje paketa oziroma članarine?', pot: '/pos', modul: 'pos-paketi-clanarine',
    vBazi: [/Samodejna obnova/, /predračun za podaljšanje/, /ni bremenjena/], vOdgovoru: [/Samodejna obnova/, /predračun/] },
  { vprasanje: 'Kako naredim Z-poročilo?', pot: '/pos', modul: 'pos-zakljucek-z-porocilo',
    vBazi: [/🔒 Zaključi/, /samo obračun/], vOdgovoru: [/Zaključi/] },
  { vprasanje: 'Kje nastavim DDV stopnjo za artikel?', pot: '/pos', modul: 'pos-artikli-ddv',
    vBazi: [/Kategorije & Artikli → Artikli/, /9,5 %/, /razlog za neobračunan DDV/], vOdgovoru: [/Kategorije & Artikli/, /DDV/] },
  { vprasanje: 'Včeraj sem na blagajni izdal napačen račun. Kako ga storniram?', pot: '/pos', modul: 'pos-racuni-storno-vracila',
    vBazi: [/samo isti dan/], vOdgovoru: [/isti dan|današnj|danes/i] },
  { vprasanje: 'Kako zamenjam FURS certifikat?', pot: '/pos', vloga: 'cashier', modul: 'furs-fiskalizacija',
    vBazi: [/Davčna blagajna/, /\.p12/], vOdgovoru: [/lastnik/i, /Davčna blagajna|certifikat/i] },
  { vprasanje: 'Trije prijatelji bi radi plačali vsak svoj del. Kako razdelim račun?', pot: '/pos', modul: 'pos-prodaja-placila',
    vBazi: [/Razdeli/, /Ta oseba plača/], vOdgovoru: [/Razdeli/] },
  { vprasanje: 'Dodal sem artikel tipa Surovina, a ga pri normativu ne morem izbrati. Zakaj?', pot: '/pos', modul: 'pos-normativi-surovine',
    vBazi: [/ločeni tabeli od artiklov/], vOdgovoru: [/zavih\w* Surovine|Surovine/] },
  { vprasanje: 'Kako uvozim dobavnico dobavitelja in ali prepozna tudi surovine, kot sta kava in vino?', pot: '/pos', modul: 'pos-zaloga-dobavnice-inventura',
    vBazi: [/Uvozi dobavnico/, /tudi \*\*surovine\*\*/], vOdgovoru: [/Uvozi dobavnico/, /surovin/i] },
  { vprasanje: 'Kako izvozim podatke za računovodjo, ki dela v programu Vasco?', pot: '/dashboard', modul: 'izvoz-racunovodja',
    vBazi: [/Vasco/, /CSV/], vOdgovoru: [/Izvoz/, /CSV|XLSX|Excel/] },
  { vprasanje: 'Kako oddam DDV-O?', pot: '/ddv', modul: 'portal-kpo-ddv-davki',
    vBazi: [/Prenesi DDV-O XML za eDavki/, /do konca meseca po koncu obdobja/], vOdgovoru: [/XML/, /eDavk|edavki/i] },
  { vprasanje: 'Koliko računov lahko izdam na brezplačnem paketu?', pot: '/invoices', paket: 'Brezplačen (Free)', modul: 'portal-stripe',
    vBazi: [/5 računov skupaj/], vOdgovoru: [/\b5\b/] },
  { vprasanje: 'Kako preklopim FURS iz testnega v produkcijski način?', pot: '/nastavitve', modul: 'furs-fiskalizacija',
    vBazi: [/Test način/, /PRODUKCIJSKI/], vOdgovoru: [/Test način/i, /Davčna blagajna/] },
  { vprasanje: 'Ali se mi bolj splača s.p. ali d.o.o.?', pot: '/dashboard', modul: 'portal-pregled-ai',
    vBazi: [/AI računovodja/], vOdgovoru: [/AI računovodja|računovodj/i] },
]

const vsebina = (m: string) => BAZA_ZNANJA.dokumenti.find(d => d.modul === m)?.vsebina ?? ''

for (const p of PRIMERI) {
  test(`baza: ${p.vprasanje}`, () => {
    const v = vsebina(p.modul)
    expect(v, `dokument ${p.modul} ne obstaja`).not.toBe('')
    for (const re of p.vBazi) expect(v, `${p.modul} ne vsebuje ${re}`).toMatch(re)
  })
}

const KLJUC = process.env.ANTHROPIC_API_KEY
const IZPIS = join(__dirname, '..', 'test-results', 'asistent-odgovori.md')

test.describe('živo (model)', () => {
  test.skip(!KLJUC, 'Nastavi ANTHROPIC_API_KEY za preizkus odgovorov modela.')
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  const client = new Anthropic({ apiKey: KLJUC })

  test.beforeAll(() => {
    mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true })
    writeFileSync(IZPIS, `# Odgovori Računko asistenta (baza ${BAZA_ZNANJA.verzija}, model ${MODEL_ASISTENTA})\n\n`)
  })

  for (const p of PRIMERI) {
    test(`živo: ${p.vprasanje}`, async () => {
      const odg = await client.messages.create({
        model: MODEL_ASISTENTA,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: sistemskiBloki({ podjetje: 'Testno podjetje s.p.', paket: p.paket ?? 'Pro + POS', vloga: p.vloga ?? 'owner', pot: p.pot }),
        messages: [{ role: 'user', content: p.vprasanje }],
      })
      const besedilo = odg.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')
      appendFileSync(IZPIS, `## ${p.vprasanje}\n_stran ${p.pot}, vloga ${p.vloga ?? 'owner'}_ · cache read ${odg.usage.cache_read_input_tokens ?? 0}\n\n${besedilo}\n\n`)
      expect(odg.stop_reason).not.toBe('refusal')
      for (const re of p.vOdgovoru) expect(besedilo, `odgovor ne omenja ${re}`).toMatch(re)
      for (const re of p.neVOdgovoru ?? []) expect(besedilo).not.toMatch(re)
    })
  }
})
