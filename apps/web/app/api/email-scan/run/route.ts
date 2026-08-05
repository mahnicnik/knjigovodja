import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { decryptToken, encryptToken } from '@/lib/token-crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Preveri Gmail povezave organizacije, poisce e-maile s prilogami od
 * zadnjega skeniranja (ali izbranega obdobja) naprej, jih analizira z AI,
 * in shrani v email_scan_pending za rocno potrditev. Nic ne gre avtomatsko
 * v receipts.
 *
 * POPRAVLJENO (30.7.2026, na Nikovo prosnjo - "spusti veliko racunov"):
 * najdeni in odpravljeni STIRJE loceni vzroki izgube racunov:
 *
 * 1. PAGINACIJA: Gmail vrne max 20 zadetkov na klic, koda ni brala
 *    naslednjih strani (nextPageToken) - pri vecjem stevilu racunov v
 *    obdobju je obdelala samo prvih 20, ostalo tiho izgubila.
 *    -> Zdaj bere do 5 strani (100 sporocil), z opozorilom ce jih je se vec.
 *
 * 2. KLJUCNE BESEDE KOT OBVEZEN POGOJ: iskanje je zahtevalo eno od besed
 *    "racun/invoice/faktura/receipt" V BESEDILU e-poste. Dobavitelj, ki
 *    napise samo "V prilogi posiljamo dokument", je bil spregledan -
 *    CEPRAV ima priloz en pravi racun.
 *    -> Zdaj iscemo VSE e-poste s prilogo v obdobju; AI ze itak razvrsca
 *    is_invoice:true/false PO branju, torej dvojno filtriranje ni bilo
 *    potrebno in je le izgubljalo prave racune.
 *
 * 3. LAST_SCANNED_AT SE JE PREMAKNIL TUDI OB NAPAKI: ce je Gmail vrnil
 *    napako (potekel zeton, kvota), se je cas skeniranja vseeno posodobil
 *    -> tisto obdobje se ni NIKOLI vec skeniralo. Zdaj se cas premakne
 *    SAMO ob resnicnem uspehu.
 *
 * 4. SAMO .pdf: druge oblike (.xml e-SLOG, skenirane slike) se niso nasle.
 *    NAMENOMA NEPOPRAVLJENO v tem koraku - AI branje spodaj pricakuje PDF;
 *    razsiritev na slike/XML zahteva locen poseg v AI klic in shranjevanje.
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
    let totalScanned = 0
    let anyCapped = false

    for (const conn of connections) {
      let accessToken = decryptToken(conn.access_token)

      // Osvezi zeton, ce je potekel
      if (conn.token_expires_at && new Date(conn.token_expires_at) <= new Date()) {
        const refreshToken = decryptToken(conn.refresh_token)
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

      const since = customFrom || (conn.last_scanned_at
        ? new Date(conn.last_scanned_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // privzeto zadnjih 7 dni
      const afterStr = Math.floor(since.getTime() / 1000)
      const beforeStr = customTo ? Math.floor(customTo.getTime() / 1000) : null
      const senderFilter = (conn.sender_filters || []).length > 0
        ? '(' + conn.sender_filters.map((s: string) => `from:${s}`).join(' OR ') + ')'
        : ''
      const beforePart = beforeStr ? `before:${beforeStr}` : ''
      // POPRAVLJENO: ključne besede odstranjene kot obvezen pogoj - AI že
      // razvrsti is_invoice po branju priloge, torej Gmail iskanje samo
      // omeji na "ima prilogo v obdobju" (+ pošiljatelj, če je nastavljen).
      const query = `has:attachment after:${afterStr} ${beforePart} ${senderFilter}`.trim()

      // POPRAVLJENO: paginacija - beremo do 5 strani (100 sporočil), da se
      // večje število računov v obdobju ne izgubi tiho pri prvih 20.
      const MAX_PAGES = 5
      let allMessages: { id: string }[] = []
      let pageToken: string | undefined = undefined
      let gmailError = false

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
        url.searchParams.set('q', query)
        url.searchParams.set('maxResults', '20')
        if (pageToken) url.searchParams.set('pageToken', pageToken)

        const listRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
        const listData = await listRes.json()

        if (!listRes.ok) {
          gmailError = true
          break
        }
        if (listData.messages) allMessages.push(...listData.messages)
        if (!listData.nextPageToken) break
        pageToken = listData.nextPageToken
        if (page === MAX_PAGES - 1) anyCapped = true
      }

      // POPRAVLJENO: last_scanned_at se premakne SAMO ob resnicnem uspehu
      // (prej se je premaknil tudi ob napaki Gmail API-ja -> tisto obdobje
      // se ni nikoli vec skeniralo).
      if (gmailError) {
        console.error('email-scan: Gmail API napaka za povezavo', conn.id)
        continue
      }

      totalScanned += allMessages.length

      for (const msgRef of allMessages) {
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

    return NextResponse.json({
      success: true,
      found: totalFound,
      scanned: totalScanned,
      capped: anyCapped, // true = obstaja se vec sporocil, ki jih ta tek ni zajel - pozeni znova
    })
  } catch (e: any) {
    console.error('Email scan run error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
