import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'
import { imaPro, STOLPCI_PAKETA } from '@/lib/paket'

// AI branje plačilnih list (25.7.2026, v6 - polna razčlenitev za REK-1)
//
// Razsirjeno na POLNO razclenitev (ne le povzetek gross/net/tax), da lahko
// /rek1 stran uporabi TOCNE, resnicne stevilke iz nalozene plac. liste za
// XML izvoz, namesto ocene vgrajenega kalkulatorja.

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPT = `Analiziraj to plačilno listo (obračun plače) in vrni JSON z naslednjimi polji (samo številke, brez € znaka, decimalno vejico pretvori v piko - torej 1.489,29 postane 1489.29):

OSNOVNO:
- employee_name: polno ime zaposlenca
- period_start: prvi dan obračunskega meseca (YYYY-MM-DD)
- period_end: zadnji dan obračunskega meseca (YYYY-MM-DD)
- gross_amount: BRUTO plača (SKUPAJ BRUTO)
- net_amount: NETO plača (NETO IZPLAČILO, PRED dodatki kot prehrana/prevoz)
- tax_amount: DAVEK (akontacija dohodnine)
- payment_date: "Datum izplačila" (YYYY-MM-DD) ali null

POVRAČILA IN IZPLAČILO (PRELET 335):
- meal_allowance: povračilo za prehrano (npr. vrstica "Prehrana"), sicer 0
- travel_allowance: povračilo za prevoz na delo, sicer 0
- other_allowances: druga povračila/dodatki, izplačani poleg neto plače (brez prehrane in prevoza), sicer 0
- payout_amount: znesek, nakazan zaposlenemu na TRR (npr. "Neto izplačilo na OSR/TRR" = neto + povračila)
- total_taxes_contributions: "SKUPAJ VSI PRISPEVKI IN DAVKI" (vse, kar gre FURS), sicer null

PRISPEVKI ZAPOSLENCA (iz bruto, "plača delavec"):
- ee_piz: prispevek za pokojninsko in invalidsko zavarovanje
- ee_zzzs: prispevek za zdravstveno zavarovanje
- ee_unemployment: prispevek za zaposlovanje
- ee_injury: prispevek za poškodbe pri delu (če obstaja pri zaposlencu, sicer 0)
- ee_long_term_care: prispevek za dolgotrajno oskrbo zaposlenca (1 %), sicer 0
- ee_ozp: obvezni zdravstveni prispevek (fiksni znesek), sicer 0
- ee_total: SKUPAJ PRISPEVKI zaposlenca (tabela "Prispevki iz bruto (plača delavec)")

PRISPEVKI DELODAJALCA (na bruto, "plača delodajalec"):
- er_piz: prispevek za pokojninsko in invalidsko zavarovanje
- er_zzzs: prispevek za zdravstveno zavarovanje
- er_unemployment: prispevek za zaposlovanje
- er_injury: prispevek za poškodbe pri delu
- er_parental: prispevek za starševsko varstvo
- er_long_term_care: prispevek za dolgotrajno oskrbo delodajalca (1 %), sicer 0
- er_min_base_diff: prispevki, ki jih plača DELODAJALEC iz razlike do minimalne osnove (tabela "Prispevki iz bruto (plača delodajalec)"), sicer 0
- er_total: SKUPAJ prispevki delodajalca = tabela "Prispevki NA bruto" + er_min_base_diff

DAVČNA OSNOVA IN OLAJŠAVE:
- income_tax_base: OSNOVA ZA DAVEK
- general_relief: splošna olajšava (če je posebej navedena, sicer null)
- dependent_relief: olajšava za vzdrževane družinske člane (če obstaja, sicer 0)

KLJUČNO POLJE:
- employer_total_cost: vrstica "Skupaj strošek v breme podjetja" ali "Skupaj strošek delodajalca" - CELOTEN znesek, ki bremeni delodajalca. Če te vrstice ni, vrni null.

Če katerega polja na dokumentu ni, vrni 0 (za zneske) ali null (za manjkajoča neobvezna polja kot general_relief). Vrni SAMO JSON brez dodatnega besedila.`

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }
    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), STOLPCI_PAKETA) // vec-org podpora (30.7.2026)
    const isPro = imaPro((member as any)?.organizations)
    if (!isPro) {
      return NextResponse.json({ error: 'AI branje plačilnih list je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    const { pdfBase64, fileBase64, mediaType } = await request.json()

    // DODANO (16.8.2026): omejitev velikosti. Prej se je datoteka poslala v AI
    // brez preverbe - prevelika je pomenila zavrnitev z nerazumljivo napako,
    // dolgo cakanje in po nepotrebnem porabljen strosek obdelave.
    const vsebina = pdfBase64 || fileBase64
    if (vsebina) {
      const velikostMB = (String(vsebina).length * 3 / 4) / (1024 * 1024)
      if (velikostMB > 10) {
        return NextResponse.json({
          error: `Datoteka je prevelika (${velikostMB.toFixed(1)} MB). Najvecja dovoljena velikost je 10 MB - dokument stisnite ali skenirajte pri nizji locljivosti.`,
        }, { status: 413 })
      }
    }
    const data = fileBase64 || pdfBase64
    const type = mediaType || 'application/pdf'
    if (!data) {
      return NextResponse.json({ error: 'Manjka datoteka' }, { status: 400 })
    }

    const isImage = type.startsWith('image/')
    const contentBlock: any = isImage
      ? { type: 'image', source: { type: 'base64', media_type: type, data } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }

    let response
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1536,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
      })
    } catch (apiErr: any) {
      const msg = String(apiErr?.message || '')
      if (msg.includes('encrypted') || msg.includes('password') || msg.includes('Could not process') || msg.includes('invalid')) {
        return NextResponse.json({
          error: 'PDF je zaščiten z geslom in ga ni mogoče prebrati. Rešitev: odprite plačilno listo (z geslom), naredite posnetek zaslona (Cmd+Shift+4 na Macu) in naložite sliko namesto PDF-ja.',
          suggestScreenshot: true,
        }, { status: 400 })
      }
      throw apiErr
    }

    const text = // POPRAVLJENO (17.8.2026): prej neposreden dostop do content[0]. Ce AI vrne
    // PRAZEN odgovor (omejitev hitrosti, prekinjena povezava, zavrnitev), je
    // polje prazno in dostop vrze napako, ki podre celotno stran namesto da bi
    // uporabniku povedala, da branje ni uspelo.
    (response.content?.[0]?.type === 'text' ? response.content[0].text : '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Ni mogoče prebrati podatkov s plačilne liste' }, { status: 400 })
    }
    return NextResponse.json(JSON.parse(jsonMatch[0]))

  } catch (error: any) {
    console.error('Parse payslip error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
