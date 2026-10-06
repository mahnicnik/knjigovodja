import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPostHogClient } from '@/lib/posthog-server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'
import { MODEL_ASISTENTA, sistemskiBloki, ociscenaZgodovina } from '@/lib/kb/asistent'
import { BAZA_ZNANJA } from '@/lib/kb/baza.generated'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * RAČUNKO ASISTENT (prej PRELET 309 — "Vprašaj Računko")
 *
 * AI pomoc pri UPORABI aplikacije (kje je gumb, kako se kaj nastavi), NE za
 * davcno svetovanje – za to je /api/ai-chat ("AI računovodja").
 *
 * SPREMENJENO (oktober 2026): znanje ni vec rocno napisan povzetek v tej
 * datoteki, ampak baza docs/knowledge-base/*.md, ki se ob vsakem buildu
 * zapakira v lib/kb/baza.generated.ts (scripts/zgradi-bazo-znanja.mjs). Cela
 * baza gre v predpomnjen sistemski poziv (lib/kb/asistent.ts). Odgovor se
 * pretaka (text/plain), da uporabnik ne caka na celoten odgovor.
 *
 * Namenoma NI Pro-omejen – pomoc pri uporabi ima vsak paket.
 */
// Odgovor se pretaka; meja zagotavlja, da Vercel daljsega odgovora ne prekine.
export const maxDuration = 60

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

    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'name, subscription_status')
    const org = (member as any)?.organizations
    const subStatus = org?.subscription_status
    const planLabel = subStatus === 'pro_pos' ? 'Pro + POS' : subStatus === 'pro' ? 'Pro' : 'Brezplačen (Free)'

    const { messages, currentPath } = await request.json()
    const zgodovina = ociscenaZgodovina(messages)
    if (zgodovina.length === 0) {
      return NextResponse.json({ error: 'Manjka sporočilo' }, { status: 400 })
    }

    getPostHogClient().capture({
      distinctId: member?.orgId || user.id,
      event: 'support_chat_message_sent',
      properties: { message_count: zgodovina.length, current_path: currentPath, kb_verzija: BAZA_ZNANJA.verzija },
    })

    const stream = client.messages.stream({
      model: MODEL_ASISTENTA,
      max_tokens: 4000,
      // Kratki prakticni odgovori iz baze znanja – nizka zahtevnost zadostuje.
      output_config: { effort: 'low' },
      system: sistemskiBloki({
        podjetje: org?.name,
        paket: planLabel,
        vloga: member?.role,
        pot: typeof currentPath === 'string' ? currentPath.slice(0, 200) : null,
      }),
      messages: zgodovina,
    })

    const enc = new TextEncoder()
    const telo = new ReadableStream<Uint8Array>({
      async start(controller) {
        let karkoli = false
        try {
          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              karkoli = true
              controller.enqueue(enc.encode(ev.delta.text))
            }
          }
          const koncno = await stream.finalMessage()
          if (koncno.stop_reason === 'refusal' || !karkoli) {
            controller.enqueue(enc.encode((karkoli ? '\n\n' : '') + 'Na to vprašanje žal ne morem odgovoriti. Če gre za težavo z aplikacijo, uporabite gumb "Pošlji podpori" pod klepetom.'))
          } else if (koncno.stop_reason === 'max_tokens') {
            controller.enqueue(enc.encode('\n\n(Odgovor je bil predolg in je prekinjen – vprašajte bolj natančno.)'))
          }
        } catch (e: any) {
          console.error('Support chat stream error:', e)
          controller.enqueue(enc.encode((karkoli ? '\n\n' : '') + 'Prišlo je do napake. Poskusite znova ali uporabite "Pošlji podpori".'))
        } finally {
          controller.close()
        }
      },
      cancel() { stream.abort() },
    })

    return new Response(telo, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-KB-Verzija': BAZA_ZNANJA.verzija,
      },
    })
  } catch (error: any) {
    console.error('Support chat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
