import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
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
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Poišči vse pomembne davčne in zakonske novosti za slovenske samostojne podjetnike (s.p.) in d.o.o. iz zadnjih 30 dni. Preveri:
1. FURS (furs.gov.si) - novosti glede DDV, dohodnine, akontacij
2. ZPIZ (zpiz.si) - spremembe prispevnih stopenj
3. Uradni list (uradni-list.si) - novi zakoni ki vplivajo na podjetnike
4. MDDSZ - spremembe delovne zakonodaje

Za vsako novost vrni JSON array z objekti:
{
  "title": "kratek naslov",
  "summary": "povzetek v 2-3 stavkih za podjetnika",
  "source": "FURS|ZPIZ|Uradni list|MDDSZ",
  "source_url": "url",
  "category": "ddv|prispevki|dohodnina|zaposleni|splosno",
  "severity": "info|warning|urgent",
  "effective_date": "YYYY-MM-DD ali null",
  "expires_at": "YYYY-MM-DD ali null"
}

Vrni SAMO JSON array, brez dodatnega besedila.`,
        }],
      }),
    })

    const data = await response.json()

    // Poišči text iz odgovora
    let jsonText = ''
    for (const block of data.content || []) {
      if (block.type === 'text') {
        jsonText = block.text
        break
      }
    }

    // Počisti JSON
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let updates: any[] = []
    try {
      updates = JSON.parse(jsonText)
    } catch {
      // Poskusi najti JSON array v besedilu
      const match = jsonText.match(/\[[\s\S]*\]/)
      if (match) updates = JSON.parse(match[0])
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ message: 'No updates found', count: 0 })
    }

    // Shrani v Supabase — najprej pobriši stare
    await supabase.from('legal_updates').delete().lt('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())

    const { error } = await supabase.from('legal_updates').insert(
      updates.map(u => ({
        title: u.title,
        summary: u.summary,
        source: u.source,
        source_url: u.source_url,
        category: u.category || 'splosno',
        severity: u.severity || 'info',
        effective_date: u.effective_date || null,
        expires_at: u.expires_at || null,
      }))
    )

    if (error) throw error

    return NextResponse.json({ message: 'Updated', count: updates.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}