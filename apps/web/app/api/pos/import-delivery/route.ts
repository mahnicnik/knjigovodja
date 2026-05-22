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
    let existingItems: { id: string; name: string; barcode?: string }[] = [];
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'Datoteka manjka' }, { status: 400 });
      const arrayBuffer = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString('base64');
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      existingItems = body.items || [];
      if (body.pdfBase64) base64 = body.pdfBase64;
      else if (body.base64) base64 = body.base64;
      else if (body.fileData) base64 = body.fileData.replace(/^data:[^;]+;base64,/, '');
      else return NextResponse.json({ error: 'Manjka pdfBase64 polje v JSON' }, { status: 400 });
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (!arrayBuffer.byteLength) return NextResponse.json({ error: `Nepodprt Content-Type: ${contentType}` }, { status: 400 });
      base64 = Buffer.from(arrayBuffer).toString('base64');
    }

    const itemsContext = existingItems.length > 0
      ? `\n\nObstoječi artikli v blagajni (za ujemanje po imenu ALI barcode):\n${existingItems.map(i => `- id: "${i.id}", naziv: "${i.name}"${i.barcode ? `, barcode: "${i.barcode}"` : ''}`).join('\n')}`
      : '\n\nV blagajni še ni artiklov — za vse nastavi ujemanje_id na null.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: `Iz te slovenske dobavnice izlušči SAMO glavne produkte (NE embalaže, NE zabojev, NE steklenic).
Za vsak artikel poišči ujemanje med obstoječimi artikli v blagajni (primerjaj po EAN/barcode najprej, potem po imenu).
Odgovori SAMO z validnim JSON-om, brez markdown blokov, brez razlag.${itemsContext}

JSON struktura:
{
  "dobavitelj": "ime dobavitelja",
  "stevilka_dokumenta": "številka računa/dobavnice",
  "datum": "YYYY-MM-DD",
  "artikli": [
    {
      "naziv": "ime artikla iz dobavnice",
      "ean": "EAN/barcode koda ali null",
      "kolicina": 160,
      "enota": "kos",
      "cena_brez_ddv": 1.1989,
      "popust_procent": 12,
      "neto_cena_brez_ddv": 1.0575,
      "ddv_stopnja": 22,
      "neto_cena_z_ddv": 1.29,
      "vrednost_brez_ddv": 169.20,
      "vrednost_z_ddv": 206.42,
      "ujemanje_id": "id obstoječega artikla ali null",
      "ujemanje_ime": "ime obstoječega artikla ali null"
    }
  ],
  "skupaj_brez_ddv": 329.45,
  "skupaj_ddv": 72.49,
  "skupaj_z_ddv": 401.94
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
    return NextResponse.json(parsed);

  } catch (err) {
    console.error('[import-delivery] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
