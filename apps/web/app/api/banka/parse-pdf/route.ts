import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Parsiranje PDF bančnega izpiska prek AI ekstrakcije.
 * Vrne array transakcij v istem formatu kot CSV parser (parseCSV).
 * Samo Pro/Pro+POS — uporablja Claude API kredite.
 */
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
      return NextResponse.json({ error: 'Uvoz PDF bančnega izpiska je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    const { pdfBase64 } = await request.json()

    if (!pdfBase64) {
      return NextResponse.json({ error: 'pdfBase64 manjka' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `Analiziraj ta bančni izpisek (PDF) in izlušči VSE transakcije. Za vsako transakcijo vrni objekt s polji:
- date: datum transakcije v formatu YYYY-MM-DD
- description: opis/namen plačila (kdo je plačnik/prejemnik, referenca)
- amount: znesek transakcije (samo pozitivno število, brez predznaka, brez €)
- type: "credit" če je denar prišel na račun (priliv), "debit" če je denar odšel z računa (odliv)
- reference: referenčna številka plačila če obstaja, sicer prazen string

Vrni SAMO JSON array vseh transakcij, brez dodatnega besedila, v tej obliki:
[
  {"date": "2026-01-15", "description": "Plačilo računa #2026-001", "amount": 150.00, "type": "credit", "reference": "SI00 123"}
]

Če je izpisek dolg in ima veliko transakcij, izlušči jih VSE — ne izpuščaj nobene.`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)

    if (!jsonMatch) {
      return NextResponse.json({ error: 'Ni bilo mogoče prebrati transakcij iz PDF-ja' }, { status: 422 })
    }

    const transactions = JSON.parse(jsonMatch[0])

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'V PDF-ju ni bilo najdenih transakcij' }, { status: 422 })
    }

    return NextResponse.json({ transactions })

  } catch (error: any) {
    console.error('Banka PDF parse error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
