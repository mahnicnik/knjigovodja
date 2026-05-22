import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Datoteka manjka' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Samo PDF datoteke' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const response = await anthropic.messages.create({
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
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Iz te slovenske dobavnice/računa izlušči vse artikle. Odgovori SAMO z validnim JSON-om, brez markdown blokov, brez razlag:

{
  "dobavitelj": "ime dobavitelja",
  "stevilka_dokumenta": "številka",
  "datum": "YYYY-MM-DD",
  "artikli": [
    {
      "naziv": "ime artikla",
      "sifra": "šifra ali null",
      "kolicina": 0,
      "enota": "kos/kg/l",
      "cena_brez_ddv": 0,
      "ddv_stopnja": 22,
      "vrednost_brez_ddv": 0
    }
  ],
  "skupaj_brez_ddv": 0,
  "skupaj_ddv": 0,
  "skupaj_z_ddv": 0
}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI ni vrnil odgovora' }, { status: 500 });
    }

    const cleaned = textBlock.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[import-delivery] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}