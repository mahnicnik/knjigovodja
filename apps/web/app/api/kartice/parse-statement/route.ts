import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPT = `Analiziraj ta obračun/izpisek kartičnega procesorja (SumUp, Wordline, NLB POS, SKB POS, Stripe ipd.) in izlušči naslednje podatke:
- period_from: zacetek obdobja obracuna v formatu YYYY-MM-DD (ce je naveden samo en datum, uporabi istega za period_from in period_to)
- period_to: konec obdobja obracuna v formatu YYYY-MM-DD
- gross_sales: skupna bruto prodaja / promet pred odstetkom provizije (samo stevilka, brez € znaka)
- fee_amount: znesek provizije/stroska procesorja v EUR, ce je eksplicitno naveden (sicer null)
- fee_pct: odstotek provizije, ce je eksplicitno naveden (sicer null)
- net_payout: neto nakazilo / znesek ki je bil ali bo nakazan na TRR (sicer null ce ni naveden)
- transactions: stevilo transakcij, ce je navedeno (sicer null)
- processor_guess: eno izmed "sumup", "wordline", "nlb", "skb", "stripe", "drugo" - glede na to kateri procesor prepoznas iz dokumenta (logotip, ime, format)

Vrni SAMO JSON objekt, brez dodatnega besedila, v tej obliki:
{"period_from": "2026-07-01", "period_to": "2026-07-07", "gross_sales": 543.21, "fee_amount": 8.15, "fee_pct": 1.5, "net_payout": 535.06, "transactions": 42, "processor_guess": "wordline"}

Ce katerega podatka ne najdes, uporabi null za to polje (razen gross_sales, ki je obvezen).`

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
    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'subscription_status') // vec-org podpora (30.7.2026)
    const subStatus = (member as any)?.organizations?.subscription_status
    const isPro = subStatus === 'pro' || subStatus === 'pro_pos'
    if (!isPro) {
      return NextResponse.json({ error: 'Skeniranje kartičnih obračunov je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    const { fileBase64, mediaType } = await request.json()
    if (!fileBase64 || !mediaType) {
      return NextResponse.json({ error: 'fileBase64 ali mediaType manjka' }, { status: 400 })
    }

    const isPdf = mediaType === 'application/pdf'
    const contentBlock: any = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: PROMPT }],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Ni bilo mogoče prebrati obračuna iz dokumenta' }, { status: 422 })
    }
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.gross_sales == null) {
      return NextResponse.json({ error: 'V dokumentu ni bilo mogoče najti bruto zneska prodaje' }, { status: 422 })
    }
    return NextResponse.json({ settlement: parsed })
  } catch (error: any) {
    console.error('Kartice parse-statement error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
