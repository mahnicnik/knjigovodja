import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { image, mediaType, pdfBase64 } = await request.json()

    let finalImage = image
    let finalMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'

    // Če je PDF — pošljemo kot dokument
    if (pdfBase64) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
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
                text: `Analiziraj ta račun/invoice in vrni JSON z naslednjimi polji:
- vendor: ime dobavitelja/podjetja ki je izdalo račun
- date: datum v formatu YYYY-MM-DD
- amount_net: znesek brez DDV (samo število, brez €)
- vat_rate: stopnja DDV (22, 9.5, ali 0 - če je reverse charge ali brez DDV potem 0)
- vat_amount: znesek DDV (samo število)
- amount_total: skupni znesek (samo število)
- description: kratek opis
- category: ena od: Pisarniški material, Komunikacije, Programska oprema, Transport, Prehrana, Izobraževanje, Marketing, Oprema, Storitve, Drugo

Vrni SAMO JSON brez dodatnega besedila.`,
              },
            ],
          },
        ],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return NextResponse.json({ error: 'Ni mogoče prebrati podatkov' })
      return NextResponse.json(JSON.parse(jsonMatch[0]))
    }

    // Slika
    if (mediaType === 'image/png') finalMediaType = 'image/png'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
              text: `Analiziraj ta račun in vrni JSON z naslednjimi polji:
- vendor: ime dobavitelja
- date: datum v formatu YYYY-MM-DD
- amount_net: znesek brez DDV (samo število)
- vat_rate: stopnja DDV (22, 9.5, ali 0)
- vat_amount: znesek DDV (samo število)
- amount_total: skupni znesek (samo število)
- description: kratek opis
- category: ena od: Pisarniški material, Komunikacije, Programska oprema, Transport, Prehrana, Izobraževanje, Marketing, Oprema, Storitve, Drugo

Vrni SAMO JSON brez dodatnega besedila.`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Ni mogoče prebrati podatkov' })
    return NextResponse.json(JSON.parse(jsonMatch[0]))

  } catch (error: any) {
    console.error('Scan error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}