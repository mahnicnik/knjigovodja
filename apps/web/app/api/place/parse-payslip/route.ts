import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// AI branje plačilnih list (25.7.2026, popravek v3 - DOMMatrix polyfill)
//
// pdfjs-dist interno referencira brskalniske globalne objekte (DOMMatrix,
// Path2D, ImageData) tudi za goli izvlecek besedila, ker nekateri notranji
// moduli te objekte uvozijo na nivoju modula (ne samo ob risanju). V
// Node.js streznikem okolju (Vercel) ti objekti ne obstajajo -> napaka
// "DOMMatrix is not defined". POPRAVEK: minimalen polyfill (nadomestek)
// PRED uvozom pdfjs-dist - dovolj, da uvoz uspe; za samo besedilo (ne
// risanje na canvas) ne rabimo popolne funkcionalnosti teh razredov.
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    constructor(_init?: any) {}
    multiply() { return new (globalThis as any).DOMMatrix() }
    translate() { return new (globalThis as any).DOMMatrix() }
    scale() { return new (globalThis as any).DOMMatrix() }
    inverse() { return new (globalThis as any).DOMMatrix() }
  }
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    constructor(_init?: any) {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    rect() {}
    bezierCurveTo() {}
  }
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function extractPdfText(pdfBuffer: Buffer, password?: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    password: password || undefined,
    // Onemogoci font/worker funkcije, ki niso potrebne za golo besedilo in
    // dodatno zmanjsajo tveganje za manjkajoce brskalniske API-je.
    disableFontFace: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  } as any)
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
