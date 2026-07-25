import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// AI branje plačilnih list (25.7.2026) - enak preverjen vzorec kot
// api/scan-receipt/route.ts, prilagojen za placilno listo od racunovodje.
// KLJUCNO polje: employer_total_cost ("Skupaj strosek v breme podjetja") -
// TO se poknjizi v KPO kot dejanski strosek, NE bruto placa (bruto ne
// vkljucuje delodajalcevih prispevkov).

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
      return NextResponse.json({ error: 'AI branje plačilnih list je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    const { pdfBase64 } = await request.json()
    if (!pdfBase64) {
      return NextResponse.json({ error: 'Manjka PDF datoteka' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: `Analiziraj to plačilno listo (obračun plače) in vrni JSON z naslednjimi polji:
- employee_name: polno ime zaposlenca
- period_start: prvi dan obračunskega meseca v formatu YYYY-MM-DD
- period_end: zadnji dan obračunskega meseca v formatu YYYY-MM-DD
- gross_amount: BRUTO plača (samo število, brez €)
- net_amount: NETO plača - znesek, ki ga zaposleni dejansko prejme (samo število)
- tax_amount: skupni znesek davka in prispevkov zaposlenca (bruto - neto, samo število)
- employer_total_cost: vrstica "Skupaj strošek v breme podjetja" ali "Skupaj strošek delodajalca" ali podobno poimenovana - CELOTEN znesek, ki bremeni delodajalca (bruto plača + prispevki delodajalca). To je NAJPOMEMBNEJŠE polje - poišči ga natančno, ker je to dejanski strošek podjetja, VEČJI od bruto plače. Če te vrstice na dokumentu ni, vrni null.

Vrni SAMO JSON brez dodatnega besedila.`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Ni mogoče prebrati podatkov s plačilne liste' })
    return NextResponse.json(JSON.parse(jsonMatch[0]))

  } catch (error: any) {
    console.error('Parse payslip error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
