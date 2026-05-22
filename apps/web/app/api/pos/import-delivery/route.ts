import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    let base64: string;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Frontend pošilja FormData z 'file' poljem
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Datoteka manjka (FormData)' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString('base64');

    } else if (contentType.includes('application/json')) {
      // Frontend pošilja JSON z base64 ali fileData poljem
      const body = await req.json();
      if (body.base64) {
        base64 = body.base64;
      } else if (body.fileData) {
        // Odstrani data URL prefix če obstaja: "data:application/pdf;base64,..."
        base64 = body.fileData.replace(/^data:[^;]+;base64,/, '');
      } else {
        return NextResponse.json({ error: 'Manjka base64 ali fileData polje v JSON' }, { status: 400 });
      }

    } else {
      // Fallback: poskusi kot raw binary body
      const arrayBuffer = await req.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return NextResponse.json(
          { error: `Nepodprt Content-Type: ${contentType}` },
          { status: 400 }
        );
      }
      base64 = Buffer.from(arrayBuffer).toString('base64');
    }

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
