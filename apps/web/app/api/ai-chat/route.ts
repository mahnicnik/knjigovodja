import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPostHogClient } from '@/lib/posthog-server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
    const { data: member } = await supabase
      .from('org_members')
      .select('organizations(subscription_status)')
      .eq('user_id', user.id)
      .maybeSingle()
    const subStatus = (member as any)?.organizations?.subscription_status
    const isPro = subStatus === 'pro' || subStatus === 'pro_pos'
    if (!isPro) {
      return NextResponse.json({ error: 'AI računovodja je na voljo samo v Pro paketu.' }, { status: 403 })
    }
    const { messages, context, orgData } = await request.json()

    getPostHogClient().capture({
      distinctId: orgData?.org_id || 'anonymous',
      event: 'ai_chat_message_sent',
      properties: {
        message_count: messages?.length,
        has_org_data: !!orgData,
      },
    })

    const now = new Date()
    const month = now.getMonth()
    const day = now.getDate()
    const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december']
    const daysUntil15 = 15 - day
    const ddvMonths = [4,7,10,1]
    const isDdvMonth = ddvMonths.includes(month + 1)

    const systemPrompt = `Si izkušen slovenski računovodja in davčni svetovalec. Odgovarjaš SAMO v slovenščini. Si prijazen, jasen in praktičen kot dober računovodja.

SLOVENSKO DAVČNO PRAVO 2026 (posodobljeno 30.7.2026):
- Dohodninska lestvica 2026: do 9.721,43€ → 16%, do 28.592,44€ → 26%, do 57.184,88€ → 33%, do 82.346,23€ → 39%, nad → 50%
- Splošna olajšava 2026: 5.551,93€ letno (462,66€/mesec)
- Minimalna plača 2026: 1.481,88€ bruto
- DDV: 22% standardna, 9.5% znižana (hrana, knjige, zdravila), 0% izvoz
- DDV registracija obvezna nad 60.000€ obdavčljivega prometa v zadnjih 12 mesecih

NORMIRANI S.P. — NOV SISTEM OD 1.1.2026 (zakon ZPZR) — POZOR, TO SE JE SPREMENILO:
- Prag za vstop/ostanek: 120.000€ (polni s.p., zavarovan vsaj 9 mesecev) ali 50.000€ (popoldanski)
- Izstop se presoja po POVPREČJU prihodkov DVEH zaporednih let (polni: povprečje nad 120.000€, vsota nad 240.000€)
- DVOSTOPENJSKO priznavanje normiranih odhodkov (KLJUČNA NOVOST):
  * DO 60.000€ prihodkov: prizna se 80% normiranih odhodkov → davčna osnova 20% → obdavčeno 20% → efektivno ~4%
  * NAD 60.000€ prihodkov: normirani odhodki se NE priznajo (0%) → ta del gre CELOTEN v davčno osnovo → obdavči se PROGRESIVNO (20%/35%)
- Zato NI več enotne 4% stopnje: pri prihodkih nad 60.000€ efektivna stopnja hitro raste
- Ponoven vstop v sistem po izstopu/prenehanju: šele po več kot 5 davčnih letih

- REK-1 mora biti oddan PRED izplačilom plače
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

${orgData.revenue > 0 ? `DAVČNA ANALIZA (ocena po sistemu ZPZR 2026, dvostopenjsko):
${orgData.revenue <= 60000
  ? `- Prihodki do 60.000€ → prizna se 80% normiranih odhodkov
- Ocenjena letna dohodnina: €${(orgData.revenue * 0.04).toFixed(0)} (efektivno ~4%)
- Mesečna akontacija: €${(orgData.revenue * 0.04 / 12).toFixed(0)}`
  : `- OPOZORILO: prihodki presegajo 60.000€ — nad to mejo se normirani odhodki NE priznajo
- Do 60.000€: davek ~€${(60000 * 0.04).toFixed(0)}
- Nad 60.000€ (€${(orgData.revenue - 60000).toFixed(0)}): ta del gre CELOTEN v davčno osnovo, obdavčen progresivno (20%/35%)
- Skupna obveznost bo BISTVENO višja od 4% — natančen izračun zahteva pregled pri računovodji`}
- Priporočilo: ${orgData.revenue > 120000 ? 'Prihodki presegajo prag 120.000€ — preverite, ali še izpolnjujete pogoje za normiranca.' : orgData.revenue > 60000 ? 'Zaradi dvostopenjskega sistema preverite, ali je normiranstvo še ugodnejše od dejanskih odhodkov.' : 'Normirani s.p. je primeren za vaš promet.'}` : ''}` : ''}

NAVODILA ZA ODGOVOR:
- Odgovarjaj KONKRETNO z €zneski in datumi — ne splošno
- Vedno omeni praktičen naslednji korak
- Če vidiš problem v podatkih stranke (zamude, visok DDV dolg), ga izpostavi proaktivno
- Kratki odgovori za kratka vprašanja, podrobni za kompleksna
- Nikoli ne dajaš pravnih nasvetov — samo računovodske informacije
- Format: navaden tekst, brez markdown zvezdic — samo odstavki in številke`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
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