import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// AI branje plačilnih list (25.7.2026, v5 - KONCNA, brez pdfjs-dist)
//
// ODLOCITEV: pdfjs-dist pot OPUSCENA po 4 zaporednih serverless okoljskih
// napakah (DOMMatrix -> webpack bundling -> file tracing -> worker modul).
// Uvedena je bila SAMO zaradi gesla-zascitenih PDF-jev - ena zahteva, ki je
// povzrocila nesorazmerno zapletenost.
//
// PREPROSTEJSA RESITEV: Claude API bere PDF-je IN slike NEPOSREDNO.
//   - Odklenjen PDF -> poslji kot document (deluje, preverjen vzorec iz
//     api/scan-receipt)
//   - Zaklenjen PDF -> uporabnik naredi posnetek zaslona (Cmd+Shift+4) in
//     naloi SLIKO - Claude jo prebere enako dobro
// Nic pdfjs, nic worker-jev, nic okoljskih posebnosti.

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPT = `Analiziraj to plačilno listo (obračun plače) in vrni JSON z naslednjimi polji:
- employee_name: polno ime zaposlenca
- period_start: prvi dan obračunskega meseca v formatu YYYY-MM-DD
- period_end: zadnji dan obračunskega meseca v formatu YYYY-MM-DD
- gross_amount: BRUTO plača (samo število, brez €)
- net_amount: NETO plača - znesek, ki ga zaposleni dejansko prejme (samo število)
- tax_amount: skupni znesek davka in prispevkov zaposlenca (bruto - neto, samo število)
- employer_total_cost: vrstica "Skupaj strošek v breme podjetja" ali "Skupaj strošek delodajalca" ali podobno poimenovana - CELOTEN znesek, ki bremeni delodajalca (bruto plača + prispevki delodajalca). To je NAJPOMEMBNEJŠE polje - poišči ga natančno, ker je to dejanski strošek podjetja, VEČJI od bruto plače. Če te vrstice na dokumentu ni, vrni null.

Vrni SAMO JSON brez dodatnega besedila.`

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

    // fileBase64 + mediaType: podpira PDF IN slike (posnetki zaslona)
    const { pdfBase64, fileBase64, mediaType } = await request.json()
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
        max_tokens: 1024,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
      })
    } catch (apiErr: any) {
      // Zaklenjen/sifriran PDF - Claude API ga ne more odpreti
      const msg = String(apiErr?.message || '')
      if (msg.includes('encrypted') || msg.includes('password') || msg.includes('Could not process') || msg.includes('invalid')) {
        return NextResponse.json({
          error: 'PDF je zaščiten z geslom in ga ni mogoče prebrati. Rešitev: odprite plačilno listo (z geslom), naredite posnetek zaslona (Cmd+Shift+4 na Macu) in naložite sliko namesto PDF-ja.',
          suggestScreenshot: true,
        }, { status: 400 })
      }
      throw apiErr
    }

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
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
