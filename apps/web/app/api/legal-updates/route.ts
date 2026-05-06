import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Najprej poskusi z web search
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Si davčni svetovalec za slovensko zakonodajo. Poišči aktualne davčne novosti in zakonske spremembe ki vplivajo na slovenske samostojne podjetnike (s.p.) in d.o.o. v letu 2025 in 2026.

Preveri novosti glede:
- DDV stopnje in pravila (FURS)
- Prispevne stopnje ZPIZ in ZZZS
- Dohodnina in akontacije
- Minimalna plača
- Spremembe ZDR-1

Na koncu vrni SAMO veljavni JSON array (brez markdown, brez razlage) v tej obliki:
[
  {
    "title": "Kratek naslov novosti",
    "summary": "2-3 stavki razlage za podjetnika kaj to pomeni zanj",
    "source": "FURS",
    "source_url": "https://www.furs.gov.si",
    "category": "ddv",
    "severity": "info",
    "effective_date": "2025-01-01",
    "expires_at": null
  }
]

Kategorije: ddv, prispevki, dohodnina, zaposleni, splosno
Severity: info, warning, urgent
Vrni vsaj 3 novosti. SAMO JSON array!`,
        }],
      }),
    })

    const data = await response.json()
    
    if (data.error) {
      throw new Error(data.error.message)
    }

    // Zberi ves text iz odgovora
    let fullText = ''
    for (const block of data.content || []) {
      if (block.type === 'text') {
        fullText += block.text
      }
    }

    // Poskusi najti JSON array
    let updates: any[] = []
    
    // Metoda 1: direktni parse
    try {
      const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      updates = JSON.parse(cleaned)
    } catch {}

    // Metoda 2: regex za JSON array
    if (!Array.isArray(updates) || updates.length === 0) {
      const match = fullText.match(/\[[\s\S]*?\](?=\s*$)/m) || fullText.match(/\[[\s\S]*\]/)
      if (match) {
        try { updates = JSON.parse(match[0]) } catch {}
      }
    }

    // Metoda 3: fallback z statičnimi novostmi če AI ne vrne JSON
    if (!Array.isArray(updates) || updates.length === 0) {
      updates = [
        {
          title: 'Minimalna plača 2025: 1.253,90 €',
          summary: 'Od 1. januarja 2025 je minimalna plača v Sloveniji 1.253,90 € bruto. Za delodajalce to pomeni višje stroške dela in višje prispevke.',
          source: 'MDDSZ',
          source_url: 'https://www.gov.si/teme/minimalna-placa/',
          category: 'zaposleni',
          severity: 'info',
          effective_date: '2025-01-01',
          expires_at: null,
        },
        {
          title: 'Prispevne stopnje za s.p. nespremenjene v 2025',
          summary: 'Prispevne stopnje za ZPIZ (24,35%) in ZZZS (13,45%) ostajajo enake. Osnova za prispevke se usklajuje z rastjo povprečnih plač.',
          source: 'ZPIZ',
          source_url: 'https://www.zpiz.si',
          category: 'prispevki',
          severity: 'info',
          effective_date: '2025-01-01',
          expires_at: null,
        },
        {
          title: 'DDV: Nov sistem VEM za e-commerce od 2025',
          summary: 'Podjetja ki prodajajo blago v EU potrošnikom morajo pri prometu nad 10.000 € letno registrirati DDV v vsaki državi ali uporabiti sistem OSS.',
          source: 'FURS',
          source_url: 'https://www.furs.gov.si/ddv/',
          category: 'ddv',
          severity: 'warning',
          effective_date: '2025-01-01',
          expires_at: null,
        },
        {
          title: 'Akontacija dohodnine za normirance 2025',
          summary: 'Normirani s.p. plačujejo 20% dohodnine na 80% prihodkov (16% efektivno). Akontacije se plačujejo mesečno do 15. v mesecu.',
          source: 'FURS',
          source_url: 'https://www.furs.gov.si/dohodnina/',
          category: 'dohodnina',
          severity: 'info',
          effective_date: '2025-01-01',
          expires_at: null,
        },
      ]
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ message: 'No updates found', count: 0 })
    }

    // Pobriši stare novosti (starejše od 30 dni)
    await supabase
      .from('legal_updates')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    // Shrani nove
    const { error } = await supabase.from('legal_updates').insert(
      updates.slice(0, 10).map((u: any) => ({
        title: String(u.title || '').slice(0, 200),
        summary: String(u.summary || '').slice(0, 1000),
        source: String(u.source || 'FURS').slice(0, 50),
        source_url: String(u.source_url || '').slice(0, 500),
        category: String(u.category || 'splosno').slice(0, 50),
        severity: ['info', 'warning', 'urgent'].includes(u.severity) ? u.severity : 'info',
        effective_date: u.effective_date || null,
        expires_at: u.expires_at || null,
      }))
    )

    if (error) throw error

    return NextResponse.json({ message: 'Updated', count: updates.length })
  } catch (error: any) {
    console.error('Legal updates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}