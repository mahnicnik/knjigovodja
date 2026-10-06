/**
 * ZAČASNO (6.10.2026) – samo na predogledu: 15 testnih vprašanj Računko
 * asistenta s pravim modelom in ključem iz okolja. Veja test/asistent-zivo
 * se po preizkusu izbriše; v main ne gre.
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { BAZA_ZNANJA } from '@/lib/kb/baza.generated'
import { MODEL_ASISTENTA, sistemskiBloki, type VlogaUporabnika } from '@/lib/kb/asistent'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return NextResponse.json({ error: 'samo predogled' }, { status: 404 })
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const t0 = Date.now()
  const enEn = async (p: Primer) => {
    const z = Date.now()
    try {
      const odg = await client.messages.create({
        model: MODEL_ASISTENTA,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: sistemskiBloki({ podjetje: 'Testno podjetje s.p.', paket: p.paket ?? 'Pro + POS', vloga: p.vloga ?? 'owner', pot: p.pot }),
        messages: [{ role: 'user', content: p.vprasanje }],
      } as any)
      const besedilo = (odg.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
      const manjka = p.vOdgovoru.filter(re => !re.test(besedilo)).map(String)
      const prepovedano = (p.neVOdgovoru ?? []).filter(re => re.test(besedilo)).map(String)
      return { vprasanje: p.vprasanje, pot: p.pot, vloga: p.vloga ?? 'owner', ok: odg.stop_reason !== 'refusal' && !manjka.length && !prepovedano.length,
        manjka, prepovedano, stop: odg.stop_reason, ms: Date.now() - z, usage: odg.usage, besedilo }
    } catch (e: any) {
      return { vprasanje: p.vprasanje, ok: false, napaka: String(e?.message ?? e), ms: Date.now() - z }
    }
  }
  // prvi sam (ustvari predpomnilnik), nato ostali vzporedno
  const prvi = await enEn(PRIMERI[0])
  const ostali = await Promise.all(PRIMERI.slice(1).map(enEn))
  const rez = [prvi, ...ostali]
  return NextResponse.json({ model: MODEL_ASISTENTA, baza: BAZA_ZNANJA.verzija, uspesnih: rez.filter(r => r.ok).length, skupaj: rez.length, ms: Date.now() - t0, rezultati: rez })
}
