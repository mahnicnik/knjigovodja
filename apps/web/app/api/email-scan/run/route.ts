import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { decryptToken, encryptToken } from '@/lib/token-crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Preveri Gmail povezave organizacije, poisce e-maile z racuni/PDF prilogami
 * od zadnjega skeniranja naprej, jih analizira z AI, in shrani v
 * email_scan_pending za rocno potrditev. Nic ne gre avtomatsko v receipts.
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
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Neobvezno: rocno izbrano casovno okno (namesto "od zadnjega skena naprej")
    let customFrom: Date | null = null
    let customTo: Date | null = null
    try {
      const body = await request.json().catch(() => ({}))
      if (body.from) customFrom = new Date(body.from)
      if (body.to) customTo = new Date(body.to)
    } catch {}

    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'Ni povezanih e-mail racunov' }, { status: 400 })
    }

    let totalFound = 0

    for (const conn of connections) {
      // POPRAVLJENO (24.7.2026, audit R5): tokeni se desifrirajo pred uporabo,
      // nov access_token se ponovno sifrira pred shranjevanjem.
      let accessToken = decryptToken(conn.access_token)
      const refreshToken = decryptToken(conn.refresh_token)

      // Osvezi token ce je potekel
      if (conn.token_expires_at && new Date(conn.token_expires_at) <= new Date()) {
        if (!refreshToken) continue
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GMAIL_CLIENT_ID!,
            client_secret: process.env.GMAIL_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        })
        const refreshData = await refreshRes.json()
        if (!refreshRes.ok) continue
        accessToken = refreshData.access_token
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString()
        await supabase.from('email_connections').update({ access_token: encryptToken(accessToken), token_expires_at: newExpiresAt }).eq('id', conn.id)
      }

      // Sestavi Gmail search query: od zadnjega skeniranja, ima prilogo, kljucne besede
      const since = customFrom || (conn.last_scanned_at
        ? new Date(conn.last_scanned_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // privzeto zadnjih 7 dni
      const afterStr = Math.floor(since.getTime() / 1000)
      const beforeStr = customTo ? Math.floor(customTo.getTime() / 1000) : null
      const keywords = (conn.keyword_filters || []).join(' OR ')
      const senderFilter = (conn.sender_filters || []).length > 0
        ? '(' + conn.sender_filters.map((s: string) => `from:${s}`).join(' OR ') + ')'
        : ''
      const beforePart = beforeStr ? `before:${beforeStr}` : ''
      const query = `has:attachment filename:pdf after:${afterStr} ${beforePart} ${senderFilter} (${keywords})`.trim()

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const listData = await listRes.json()
      if (!listRes.ok || !listData.messages) {
        if (!customFrom) {
        await supabase.from('email_connections').update({ last_scanned_at: new Date().toISOString() }).eq('id', conn.id)
      }
        continue
      }

      for (const msgRef of listData.messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const msg = await msgRes.json()
        const headers = msg.payload?.headers || []
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
        const from = headers.find((h: any) => h.name === 'From')?.value || ''
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value

        // Preveri ali je ta e-mail ze bil obdelan
        const { data: existing } = await supabase
          .from('email_scan_pending')
          .select('id')
          .eq('connection_id', conn.id)
          .contains('extracted', { _gmail_message_id: msgRef.id })
          .maybeSingle()
        if (existing) continue

        // Poisci PDF prilogo
        const parts = msg.payload?.parts || []
        const pdfPart = parts.find((p: any) => p.filename?.toLowerCase().endsWith('.pdf') && p.body?.attachmentId)
        if (!pdfPart) continue

        const attRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}/attachments/${pdfPart.body.attachmentId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const attData = await attRes.json()
        if (!attData.data) continue
        // Gmail uporablja URL-safe base64, pretvorimo v standarden base64
        const pdfBase64 = attData.data.replace(/-/g, '+').replace(/_/g, '/')

        try {
          const aiRes = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
                {
                  type: 'text',
                  text: `Analiziraj ta racun/invoice in vrni JSON z naslednjimi polji:
- vendor: ime dobavitelja
- date: datum v formatu YYYY-MM-DD
- amount_net: znesek brez DDV (samo stevilo)
- vat_rate: stopnja DDV (22, 9.5, ali 0)
- vat_amount: znesek DDV (samo stevilo)
- amount_total: skupni znesek (samo stevilo)
- description: kratek opis
- category: ena od: Pisarniski material, Komunikacije, Programska oprema, Transport, Prehrana, Izobrazevanje, Marketing, Oprema, Storitve, Drugo
- is_invoice: true ce je to dejansko racun/faktura, false ce ni (npr. marketing email, opomnik, newsletter)

Vrni SAMO JSON brez dodatnega besedila.`,
                },
              ],
            }],
          })
          const text = aiRes.content[0].type === 'text' ? aiRes.content[0].text : ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) continue
          const extracted = JSON.parse(jsonMatch[0])
          if (extracted.is_invoice === false) continue

          extracted._gmail_message_id = msgRef.id

          await supabase.from('email_scan_pending').insert({
            org_id: member.org_id,
            connection_id: conn.id,
            email_subject: subject,
            email_from: from,
            email_date: dateHeader ? new Date(dateHeader).toISOString() : null,
            attachment_name: pdfPart.filename,
            extracted,
            pdf_base64: pdfBase64,
            status: 'pending',
          })
          totalFound++
        } catch (aiErr) {
          console.error('AI scan error for message', msgRef.id, aiErr)
          continue
        }
      }

      if (!customFrom) {
        await supabase.from('email_connections').update({ last_scanned_at: new Date().toISOString() }).eq('id', conn.id)
      }
    }

    return NextResponse.json({ success: true, found: totalFound })
  } catch (e: any) {
    console.error('Email scan run error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
