import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// AI branje plačilnih list (25.7.2026, posodobljeno za GESLOM ZASCITENE PDF-je)
//
// Placilne liste od racunovodij so pogosto sifrirane z geslom (obicajno
// EMSO/davcna stevilka zaposlenca). Anthropic API ne zna brati sifriranih
// PDF-jev neposredno. RESITEV: uporabimo pdfjs-dist (ze nameščena
// odvisnost - Mozillina PDF knjiznica), ki ZNA odpreti PDF z geslom in
// izvleci BESEDILO - to besedilo nato posljemo AI-ju namesto same PDF
// datoteke. To se izogne potrebi po "odklepanju in ponovnem shranjevanju"
// PDF-ja (kar je tehnicno tezje in manj zanesljivo).
//
// Ce PDF NI zascitentx z geslom, se text-extraction vseeno uporabi (deluje
// enako dobro za navadne PDF-je - ni potrebe po locenem "document" nacinu).

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function extractPdfText(pdfBuffer: Buffer, password?: string): Promise<string> {
  // Node.js (legacy) build pdfjs-dist - brez potrebe po browser worker-ju
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    password: password || undefined,
  })
  const pdf = await loadingTask.promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = (textContent.items as any[]).map(item => item.str).join(' ')
    fullText += pageText + '\n'
  }
  return fullText.trim()
}

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

    const { pdfBase64, password } = await request.json()
    if (!pdfBase64) {
      return NextResponse.json({ error: 'Manjka PDF datoteka' }, { status: 400 })
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    let pdfText: string
    try {
      pdfText = await extractPdfText(pdfBuffer, password)
    } catch (pdfErr: any) {
      // pdfjs vrze specificno napako za geslo (PasswordException, code 1=potrebno, 2=napacno)
      if (pdfErr?.name === 'PasswordException') {
        if (pdfErr.code === 1) {
          return NextResponse.json({ error: 'PDF je zaščiten z geslom - prosim vnesite geslo.', needsPassword: true }, { status: 400 })
        }
        return NextResponse.json({ error: 'Napačno geslo za PDF.', needsPassword: true }, { status: 400 })
      }
      return NextResponse.json({ error: 'Napaka pri branju PDF datoteke: ' + pdfErr.message }, { status: 400 })
    }

    if (!pdfText || pdfText.length < 20) {
      return NextResponse.json({ error: 'PDF ne vsebuje berljivega besedila (morda je skeniran kot slika) - poskusite ročno vnesti podatke.' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Tukaj je besedilo, izluščeno iz plačilne liste (obračuna plače):

---
${pdfText}
---

Analiziraj to besedilo in vrni JSON z naslednjimi polji:
- employee_name: polno ime zaposlenca
- period_start: prvi dan obračunskega meseca v formatu YYYY-MM-DD
- period_end: zadnji dan obračunskega meseca v formatu YYYY-MM-DD
- gross_amount: BRUTO plača (samo število, brez €)
- net_amount: NETO plača - znesek, ki ga zaposleni dejansko prejme (samo število)
- tax_amount: skupni znesek davka in prispevkov zaposlenca (bruto - neto, samo število)
- employer_total_cost: vrstica "Skupaj strošek v breme podjetja" ali "Skupaj strošek delodajalca" ali podobno poimenovana - CELOTEN znesek, ki bremeni delodajalca (bruto plača + prispevki delodajalca). To je NAJPOMEMBNEJŠE polje - poišči ga natančno, ker je to dejanski strošek podjetja, VEČJI od bruto plače. Če te vrstice v besedilu ni, vrni null.

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
