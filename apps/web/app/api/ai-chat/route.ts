import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json()

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Si izkušen slovenski računovodja in davčni svetovalec za s.p. (samostojni podjetnik). 
      
Odgovarjaš SAMO v slovenščini. Si prijazen, jasen in praktičen.

Poznaš slovensko davčno zakonodajo 2026:
- Dohodninska lestvica: 16%, 26%, 33%, 39%, 50%
- DDV: 22% standardna, 9.5% znižana
- Prispevki s.p.: razredi 1-15
- REK-1 obrazec za zaposlene
- FURS postopke in roke
- ZGD, ZDDV, ZDoh

${context ? `Podatki o stranki:\n${context}` : ''}

Odgovarjaj kratko in jasno. Če je vprašanje kompleksno, razčleni v točke. 
Vedno dodaj praktičen nasvet. Nikoli ne dajaš pravnih nasvetov — samo računovodske in davčne informacije.`,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ response: text })

  } catch (error: any) {
    console.error('AI chat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}