import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from '@/lib/token-crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Klican preko Vercel Cron (dnevno). Preveri VSE aktivne email_connections
 * in za vsako presodi, ali je "na vrsti" glede na njen scan_schedule
 * (daily/weekly/monthly/custom) in last_scanned_at. Ce je, izvede isto
 * skeniranje kot rocni /api/email-scan/run, samo brez uporabniske seje
 * (uporablja service role kljuc, saj gre za sistemski klic).
 */
export async function GET(request: NextRequest) {
  // Zascita pred zunanjimi klici - Vercel Cron poslje ta header samodejno
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('is_active', true)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  const now = new Date()
  let processed = 0

  for (const conn of connections) {
    // Presodi ali je ta povezava "na vrsti" glede na urnik
    const last = conn.last_scanned_at ? new Date(conn.last_scanned_at) : null
    let due = false
    if (conn.scan_schedule === 'custom') {
      // Enostaven cron matcher za polji "dan-v-mesecu" in "mesec" (format: min ura dan mesec dan-v-tednu).
      // Cron sam tece dnevno ob 6h, zato preverimo samo ali se DANASNJI datum ujema z dan/mesec polji.
      if (conn.custom_cron) {
        const parts = conn.custom_cron.trim().split(/\s+/)
        if (parts.length === 5) {
          const [, , domField, monthField] = parts
          const nowDay = now.getUTCDate()
          const nowMonth = now.getUTCMonth() + 1
          const matchField = (field: string, value: number) => {
            if (field === '*') return true
            return field.split(',').map(Number).includes(value)
          }
          const domOk = matchField(domField, nowDay)
          const monthOk = matchField(monthField, nowMonth)
          // Ne skeniraj vec kot enkrat isti dan
          const alreadyToday = last && last.toDateString() === now.toDateString()
          due = domOk && monthOk && !alreadyToday
        }
      }
    } else if (!last) {
      due = true
    } else {
      const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)
      if (conn.scan_schedule === 'daily' && hoursSince >= 24) due = true
      else if (conn.scan_schedule === 'weekly' && hoursSince >= 24 * 7) due = true
      else if (conn.scan_schedule === 'monthly' && hoursSince >= 24 * 30) due = true
    }
    if (!due) continue

    try {
      // POPRAVLJENO (24.7.2026, audit R5): tokeni se desifrirajo pred uporabo,
      // nov access_token se ponovno sifrira pred shranjevanjem.
      let accessToken = decryptToken(conn.access_token)
      const refreshToken = decryptToken(conn.refresh_token)
      if (conn.token_expires_at && new Date(conn.token_expires_at) <= now) {
        if (!refreshToken) continue
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
          // neodzivni storitvi visi, dokler je streznik sam ne prekine.
          signal: AbortSignal.timeout(10000),
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

      const since = last || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const afterStr = Math.floor(since.getTime() / 1000)
      const keywords = (conn.keyword_filters || []).join(' OR ')
      const senderFilter = (conn.sender_filters || []).length > 0
        ? '(' + conn.sender_filters.map((s: string) => `from:${s}`).join(' OR ') + ')'
        : ''
      const query = `has:attachment filename:pdf after:${afterStr} ${senderFilter} (${keywords})`.trim()

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const listData = await listRes.json()
      if (listRes.ok && listData.messages) {
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

          const { data: existing } = await supabase
            .from('email_scan_pending')
            .select('id')
            .eq('connection_id', conn.id)
            .contains('extracted', { _gmail_message_id: msgRef.id })
            .maybeSingle()
          if (existing) continue

          const parts = msg.payload?.parts || []
          const pdfPart = parts.find((p: any) => p.filename?.toLowerCase().endsWith('.pdf') && p.body?.attachmentId)
          if (!pdfPart) continue

          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}/attachments/${pdfPart.body.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          const attData = await attRes.json()
          if (!attData.data) continue
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
- is_invoice: true ce je to dejansko racun/faktura, false ce ni

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

            // POPRAVLJENO (16.8.2026): prej brez preverbe napake - najden racun se
          // ni shranil, stevec pa ga je vseeno stel. Ker se e-posta oznaci kot
          // preskenirana, tega racuna NE bi nikoli vec nasel.
          const { error: pendErr } = await supabase.from('email_scan_pending').insert({
              org_id: conn.org_id,
              connection_id: conn.id,
              email_subject: subject,
              email_from: from,
              email_date: dateHeader ? new Date(dateHeader).toISOString() : null,
              attachment_name: pdfPart.filename,
              extracted,
              pdf_base64: pdfBase64,
              status: 'pending',
            })
          } catch { continue }
        }
      }

      const { error: lsErr } = await supabase.from('email_connections').update({ last_scanned_at: now.toISOString() }).eq('id', conn.id)
      // POPRAVLJENO (16.8.2026): ce se oznaka ne shrani, bo naslednji zagon
      // preskeniral ISTO obdobje in ustvaril podvojene predloge stroskov.
      if (lsErr) console.error('email-scan cron: oznake zadnjega skeniranja NI bilo mogoce shraniti - naslednji zagon lahko ustvari podvojene vnose:', conn.id, lsErr)
      processed++
    } catch (connErr) {
      console.error('Cron scan error for connection', conn.id, connErr)
      continue
    }
  }

  return NextResponse.json({ success: true, processed })
}
