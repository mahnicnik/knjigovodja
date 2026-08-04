import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Uvoz izdanih racunov iz PDF-ja (npr. izvoz iz Cebelice ali drugega sistema)
 * prek AI ekstrakcije. Racuni se oznacijo kot source='imported' in NE gredo
 * skozi FURS potrjevanje ponovno - ze so bili davcno potrjeni v izvornem sistemu.
 * Samo Pro/Pro+POS - uporablja Claude API kredite.
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
      return NextResponse.json({ error: 'Uvoz računov iz PDF je na voljo samo v Pro paketu.' }, { status: 403 })
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
              text: `Analiziraj ta PDF izdanega racuna (lahko je iz Cebelice ali drugega racunovodskega sistema) in izlusci podatke o racunu. Vrni SAMO JSON objekt (brez dodatnega besedila) v tej obliki:
{
  "invoice_number": "stevilka racuna kot je zapisana na dokumentu",
  "client_name": "ime kupca/stranke",
  "client_tax_number": "davcna stevilka stranke ce obstaja, sicer prazen string",
  "client_address": "naslov stranke ce obstaja, sicer prazen string",
  "issue_date": "datum izdaje v formatu YYYY-MM-DD",
  "due_date": "rok placila v formatu YYYY-MM-DD, ce ni naveden uporabi isti datum kot issue_date",
  "amount_net": stevilka - osnova za DDV (neto znesek pred DDV),
  "vat_amount": stevilka - znesek DDV,
  "amount_total": stevilka - skupni znesek za placilo (bruto),
  "line_items": [
    {"description": "opis postavke", "quantity": stevilka, "unit_price": stevilka, "vat_rate": stevilka, "total": stevilka}
  ]
}
Ce katerega od podatkov ni mogoce najti, uporabi razumno privzeto vrednost (0 za zneske, prazen string za besedilo). Zneski morajo biti stevilke brez € znaka in brez locil za tisocice (uporabi piko za decimalke).`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Ni bilo mogoče prebrati podatkov iz PDF-ja' }, { status: 422 })
    }
    const invoiceData = JSON.parse(jsonMatch[0])
    return NextResponse.json({ invoice: invoiceData })
  } catch (error: any) {
    console.error('Invoice PDF import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
