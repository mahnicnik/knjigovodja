import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Uvoz cenika/ponudbe (slika ali PDF) - AI izlušči artikle za POS.
 * Samo Pro+POS.
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

    const { data: member } = await supabase
      .from('org_members')
      .select('organizations(subscription_status)')
      .eq('user_id', user.id)
      .maybeSingle()

    const subStatus = (member as any)?.organizations?.subscription_status
    if (subStatus !== 'pro_pos') {
      return NextResponse.json({ error: 'Uvoz cenika je na voljo samo v Pro + POS paketu.' }, { status: 403 })
    }

    const { image, mediaType, pdfBase64 } = await request.json()

    const prompt = `Analiziraj ta cenik/ponudbo/seznam izdelkov in izlušči VSE produkte/storitve. Za vsak izdelek vrni objekt s polji:
- name: ime izdelka/storitve
- category: kategorija glede na sekcijo cenika (npr. "Kava", "Pivo", "Vino")
- price: prodajna cena (samo število, brez €)
- unit: enota (kos, 1dcl, 0.5L, itd. - privzeto "kos")
- vat_rate: stopnja DDV (22, 9.5, ali 0 - če ni razvidno, uporabi 22)

Vrni SAMO JSON array, brez dodatnega besedila:
[
  {"name": "Kava", "category": "Kava", "price": 1.40, "unit": "kos", "vat_rate": 22}
]

Izlušči VSE izdelke iz cenika, ne izpuščaj nobenega, tudi če je cenik dolg.`

    let content_blocks: any[]
    if (pdfBase64) {
      content_blocks = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: prompt },
      ]
    } else {
      content_blocks = [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: prompt },
      ]
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: content_blocks }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)

    if (!jsonMatch) {
      return NextResponse.json({ error: 'Ni bilo mogoče prebrati izdelkov iz slike/PDF-ja' }, { status: 422 })
    }

    const rawItems = JSON.parse(jsonMatch[0])

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ error: 'Ni bilo najdenih izdelkov' }, { status: 422 })
    }

    return NextResponse.json({ items: rawItems })

  } catch (error: any) {
    console.error('Cenik parse error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
