import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { messages, context, orgData } = await request.json()

    const now = new Date()
    const month = now.getMonth()
    const day = now.getDate()
    const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
    const daysUntil15 = 15 - day
    const ddvMonths = [4,7,10,1]
    const isDdvMonth = ddvMonths.includes(month + 1)

    const systemPrompt = `Si izkušen slovenski računovodja in davčni svetovalec. Odgovarjaš SAMO v slovenščini. Si prijazen, jasen in praktičen kot dober računovodja.

SLOVENSKO DAVČNO PRAVO 2025/2026:
- Dohodninska lestvica: do 8.755€ → 16%, do 25.922€ → 26%, do 51.844€ → 33%, do 74.160€ → 39%, nad → 50%
- DDV: 22% standardna, 9.5% znižana (hrana, knjige, zdravila), 0% izvoz
- Prispevki s.p. 2025: minimalna osnova 1.382,05€, ZPIZ 24,35% = 336,33€, ZZZS 13,45% = 185,93€
- Normirani s.p.: 80% normiranih odhodkov, 20% davčna osnova, 20% dohodnina → efektivno 4% davka
- Mejnik za normirance: 60.000€ letno (ali 300.000€ v 2 zaporednih letih)
- DDV registracija obvezna nad 50.000€ prometa
- REK-1 mora biti oddan PRED izplačilom plače
- Akontacija dohodnine: do 15. v mesecu
- Prispevki s.p.: do 15. v mesecu
- Zamudne obresti: TOM + 3% za davčne obveznosti

ROKE TA MESEC (${months[month]}):
- ${daysUntil15 > 0 ? `Prispevki in akontacija zapadejo čez ${daysUntil15} dni (15. ${months[month]})` : daysUntil15 === 0 ? 'DANES je rok za prispevke in akontacijo!' : 'Prispevki in akontacija so že zapadli!'}
${isDdvMonth ? `- POZOR: DDV-O je treba oddati ta mesec!` : ''}

${orgData ? `PODATKI O STRANKI:
- Podjetje: ${orgData.name}
- DDV zavezanec: ${orgData.vat_registered ? 'DA' : 'NE'}
- Letni prihodki YTD: €${orgData.revenue?.toFixed(2) || '0.00'}
- Letni odhodki YTD: €${orgData.expenses?.toFixed(2) || '0.00'}
- Neto dobiček YTD: €${((orgData.revenue || 0) - (orgData.expenses || 0)).toFixed(2)}
- DDV dolg: €${orgData.vatDue?.toFixed(2) || '0.00'}
- Neplačani računi: ${orgData.unpaidCount || 0} računov za €${orgData.unpaidAmount?.toFixed(2) || '0.00'}
- Zamude: ${orgData.overdueCount || 0} računov v zamudi
- Zaposleni: ${orgData.hasEmployees ? 'Da' : 'Ne'}

${orgData.revenue > 0 ? `DAVČNA ANALIZA:
- Ocenjena letna dohodnina (pri normirancu): €${(orgData.revenue * 0.04).toFixed(0)}
- Mesečna akontacija: €${(orgData.revenue * 0.04 / 12).toFixed(0)}
- Priporočilo: ${orgData.revenue > 50000 ? 'Razmislite o d.o.o. — pri višjih prihodkih je ugodnejši.' : 'Normirani s.p. je primeren za vaš promet.'}` : ''}` : ''}

NAVODILA ZA ODGOVOR:
- Odgovarjaj KONKRETNO z €zneski in datumi — ne splošno
- Vedno omeni praktičen naslednji korak
- Če vidiš problem v podatkih stranke (zamude, visok DDV dolg), ga izpostavi proaktivno
- Kratki odgovori za kratka vprašanja, podrobni za kompleksna
- Nikoli ne dajaš pravnih nasvetov — samo računovodske informacije
- Format: navaden tekst, brez markdown zvezdic — samo odstavki in številke`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ response: text })

  } catch (error: any) {
    console.error('AI chat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}