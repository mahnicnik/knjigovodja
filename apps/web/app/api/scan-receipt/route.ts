import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'
import { navodiloRazvrscanja, dopolniRazvrstitev, prejsnjaRazvrstitev, kontekstPodjetja } from '@/lib/konti'

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
    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'subscription_status, name, pos_profile, vat_registered') // vec-org podpora (30.7.2026)
    const subStatus = (member as any)?.organizations?.subscription_status
    const isPro = subStatus === 'pro' || subStatus === 'pro_pos'
    if (!isPro) {
      return NextResponse.json({ error: 'AI skeniranje računov je na voljo samo v Pro paketu.' }, { status: 403 })
    }
    const { image, mediaType, pdfBase64 } = await request.json()

    // PRELET 339: razvrstitev po kontih (lib/konti) + uporabnikove pretekle odlocitve.
    const navodilo = `Analiziraj ta racun/invoice in vrni JSON z naslednjimi polji:
- vendor: ime dobavitelja/podjetja, ki je izdalo racun
- vendor_tax_number: davcna stevilka ali ID za DDV dobavitelja (ali null)
- invoice_number: stevilka racuna (ali null)
- date: datum v formatu YYYY-MM-DD
- amount_net: znesek brez DDV (samo stevilo, brez €)
- vat_rate: stopnja DDV (22, 9.5, 5 ali 0 - ce je obrnjena davcna obveznost ali brez DDV, potem 0)
- vat_amount: znesek DDV (samo stevilo)
- amount_total: skupni znesek (samo stevilo)
- description: kratek opis, kaj je bilo kupljeno
${navodiloRazvrscanja(kontekstPodjetja((member as any)?.organizations))}

Vrni SAMO JSON brez dodatnega besedila.`
    const koncaj = async (text: string) => {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return NextResponse.json({ error: 'Ni mogoče prebrati podatkov' })
      const d = JSON.parse(jsonMatch[0])
      const prej = member.orgId ? await prejsnjaRazvrstitev(supabase, member.orgId, d) : null
      return NextResponse.json(dopolniRazvrstitev(d, prej))
    }

    let finalImage = image
    let finalMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'

    // Če je PDF — pošljemo kot dokument
    if (pdfBase64) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
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
                text: navodilo,
              },
            ],
          },
        ],
      })

      const text = // POPRAVLJENO (17.8.2026): prej neposreden dostop do content[0]. Ce AI vrne
    // PRAZEN odgovor (omejitev hitrosti, prekinjena povezava, zavrnitev), je
    // polje prazno in dostop vrze napako, ki podre celotno stran namesto da bi
    // uporabniku povedala, da branje ni uspelo.
    (response.content?.[0]?.type === 'text' ? response.content[0].text : '')
      return koncaj(text)
    }

    // Slika
    if (mediaType === 'image/png') finalMediaType = 'image/png'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: finalMediaType,
                data: finalImage,
              },
            },
            {
              type: 'text',
              text: navodilo,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return koncaj(text)

  } catch (error: any) {
    console.error('Scan error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}