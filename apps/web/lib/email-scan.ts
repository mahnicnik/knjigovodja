/**
 * PRELET 334: skupno e-postno skeniranje (rocni /api/email-scan/run in nocni
 * /api/email-scan/cron).
 *
 * ZAKAJ (Nik, 27.9.2026 - "scan ne zazna vseh PDF racunov"):
 *  1. NOCNI CRON je iskal le e-poste z besedami racun/invoice/faktura/receipt,
 *     najvec 20 na tek, in oznako "zadnje skeniranje" premaknil VEDNO (tudi ob
 *     napaki). Rocni "Preveri zdaj (od zadnjega skena)" je nato zacel sele pri
 *     tej oznaki - vse, kar je cron preskocil, je bilo izgubljeno.
 *  2. PDF se je iskal le na PRVI ravni sporocila - posredovana sporocila
 *     (Fwd), e-racuni in Outlook priloge so PDF gnezdeni globlje.
 *  3. Iz vsake e-poste se je vzel samo PRVI PDF (npr. dobavnica namesto racuna).
 *  4. Zaklenjen PDF (geslo), napaka AI in "AI meni, da ni racun" so se tiho
 *     zavrgli - brez sledi in brez ponovnega poskusa.
 *
 * ZDAJ:
 *  - vsi PDF-ji iz vseh ravni sporocila, vsak posebej
 *  - vsak PDF pusti sled v email_scan_pending: 'pending' (racun), 'ni_racun'
 *    (AI meni, da ni racun - viden, en klik ga doda v pregled), 'napaka'
 *    (zaklenjen PDF ali napaka branja - vidna; napake branja se ob naslednjem
 *    skeniranju poskusijo znova)
 *  - oznaka zadnjega skeniranja se premakne SAMO, ce je bilo obdobje
 *    pregledano v celoti in brez prehodnih napak
 *  - casovna omejitev: ce zmanjka casa, tek vrne "nedokonceno" in naslednji
 *    tek nadaljuje (ze obdelane priloge se preskocijo brez klica AI)
 */
import Anthropic from '@anthropic-ai/sdk'
import { decryptToken, encryptToken } from '@/lib/token-crypto'
import { najdiUjemanje, STROSEK_POLJA } from '@/lib/strosek-ujemanje'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type IzidSkeniranja = {
  pregledanih: number      // e-poste s prilogo v obdobju
  najdenih: number         // novi racuni v pregled
  zeVneseno: number        // od najdenih: ze med stroski
  niRacun: number          // PDF-ji, ki po mnenju AI niso racun (vidni v seznamu)
  zaklenjenih: number      // PDF z geslom
  napak: number            // napake branja (ponovni poskus ob naslednjem skeniranju)
  nedokoncano: boolean     // zmanjkalo casa ali Gmail omejitev - pozenite znova
  napaka?: string          // povezave ni bilo mogoce uporabiti
}

const PROMPT = `Analiziraj ta dokument in vrni JSON z naslednjimi polji:
- vendor: ime dobavitelja/izdajatelja
- date: datum racuna v formatu YYYY-MM-DD
- amount_net: znesek brez DDV (samo stevilo)
- vat_rate: stopnja DDV (22, 9.5, ali 0)
- vat_amount: znesek DDV (samo stevilo)
- amount_total: skupni znesek za placilo (samo stevilo)
- description: kratek opis
- category: ena od: Pisarniski material, Komunikacije, Programska oprema, Transport, Prehrana, Izobrazevanje, Marketing, Oprema, Storitve, Drugo
- invoice_number: stevilka racuna, kot je izpisana (ali null)
- vendor_tax_number: davcna stevilka ali ID za DDV dobavitelja (ali null)
- is_invoice: true ce je to racun za nakup - ne glede na to, kako se imenuje (racun, e-racun, faktura, invoice, receipt, bill, Rechnung, "racun za sklenjena zavarovanja", tudi ze placan). Mocan znak racuna: dokument vsebuje DAVCNO STEVILKO ali ID ZA DDV izdajatelja IN znesek. false za: dobavnico brez zneskov, predracun, ponudbo, opomin, bancni izpisek, potrdilo o kartičnih transakcijah, placilni nalog, newsletter
- has_tax_number: true ce dokument vsebuje davcno stevilko ali ID za DDV izdajatelja
- document_type: kratko, kaj dokument je (npr. "racun", "dobavnica", "predracun", "izpisek", "potrdilo o placilu")

Vedno izpolni vsa polja, ki jih lahko razberes (tudi ce is_invoice=false).
Vrni SAMO JSON brez dodatnega besedila.`

type GmailDel = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: GmailDel[] }

/** Vsi PDF-ji na vseh ravneh sporocila (tudi v posredovanih sporocilih). */
export function zberiPdfPriloge(del: GmailDel | undefined, out: GmailDel[] = []): GmailDel[] {
  if (!del) return out
  const ime = String(del.filename || '').toLowerCase()
  const jePdf = del.mimeType === 'application/pdf' || ime.endsWith('.pdf')
  if (jePdf && del.body?.attachmentId) out.push(del)
  for (const p of del.parts || []) zberiPdfPriloge(p, out)
  return out
}

/** Enolicno ime priloge znotraj sporocila (dve prilogi z istim imenom -> #2). */
function imenaPrilog(priloge: GmailDel[]): string[] {
  const videno = new Map<string, number>()
  return priloge.map(p => {
    const ime = p.filename || 'priloga.pdf'
    const n = (videno.get(ime) || 0) + 1
    videno.set(ime, n)
    return n === 1 ? ime : `${ime} #${n}`
  })
}

async function osveziZeton(supabase: any, conn: any): Promise<string | null> {
  let accessToken = decryptToken(conn.access_token)
  if (conn.token_expires_at && new Date(conn.token_expires_at) <= new Date(Date.now() + 60_000)) {
    const refreshToken = decryptToken(conn.refresh_token)
    if (!refreshToken) return null
    const res = await fetch('https://oauth2.googleapis.com/token', {
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
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) return null
    accessToken = data.access_token
    await supabase.from('email_connections').update({
      access_token: encryptToken(accessToken!),
      token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    }).eq('id', conn.id)
  }
  return accessToken
}

async function gmail(accessToken: string, pot: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pot}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

export async function skenirajPovezavo(
  supabase: any,
  conn: any,
  opcije: { od: Date; do?: Date | null; rokMs: number; premakniOznako: boolean },
): Promise<IzidSkeniranja> {
  const zacetek = Date.now()
  const casJe = () => Date.now() - zacetek > opcije.rokMs
  const izid: IzidSkeniranja = { pregledanih: 0, najdenih: 0, zeVneseno: 0, niRacun: 0, zaklenjenih: 0, napak: 0, nedokoncano: false }
  let prehodnaNapaka = false

  const accessToken = await osveziZeton(supabase, conn)
  if (!accessToken) return { ...izid, nedokoncano: true, napaka: 'Gmail povezava je potekla — povežite Gmail znova.' }

  // 1) Seznam e-post s prilogo v obdobju (brez kljucnih besed - AI presodi po branju).
  const senderFilter = (conn.sender_filters || []).length > 0
    ? '(' + conn.sender_filters.map((s: string) => `from:${s}`).join(' OR ') + ')'
    : ''
  const q = [
    'has:attachment',
    `after:${Math.floor(opcije.od.getTime() / 1000)}`,
    opcije.do ? `before:${Math.floor(opcije.do.getTime() / 1000)}` : '',
    senderFilter,
  ].filter(Boolean).join(' ')
  const sporocila: string[] = []
  let pageToken: string | undefined
  for (let stran = 0; stran < 10; stran++) {
    const r = await gmail(accessToken, `messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`)
    if (!r.ok) return { ...izid, nedokoncano: true, napaka: `Gmail napaka ${r.status}` }
    for (const m of r.data.messages || []) sporocila.push(m.id)
    pageToken = r.data.nextPageToken
    if (!pageToken) break
    if (stran === 9) izid.nedokoncano = true   // vec kot 1000 - preostanek naslednjic
  }
  izid.pregledanih = sporocila.length

  // 2) Kaj je ze obdelano (po sporocilu in imenu priloge).
  const obdelano = new Map<string, Map<string, { id: string; status: string; razlog?: string }>>()
  for (let i = 0; i < sporocila.length; i += 100) {
    const kos = sporocila.slice(i, i + 100)
    const { data } = await supabase.from('email_scan_pending')
      .select('id, status, attachment_name, extracted->>_gmail_message_id, extracted->>_razlog')
      .eq('connection_id', conn.id)
      .in('extracted->>_gmail_message_id', kos)
    for (const r of data || []) {
      const mid = r._gmail_message_id
      if (!obdelano.has(mid)) obdelano.set(mid, new Map())
      obdelano.get(mid)!.set(r.attachment_name || '', { id: r.id, status: r.status, razlog: r._razlog })
    }
  }

  // 3) Obdelava - najnovejse najprej (tako vrne Gmail).
  for (const msgId of sporocila) {
    if (casJe()) { izid.nedokoncano = true; break }
    const znano = obdelano.get(msgId)
    const m = await gmail(accessToken, `messages/${msgId}?format=full`)
    if (!m.ok) { prehodnaNapaka = true; izid.napak++; continue }
    const glave = m.data.payload?.headers || []
    const glava = (ime: string) => glave.find((h: any) => String(h.name).toLowerCase() === ime)?.value || ''
    const priloge = zberiPdfPriloge(m.data.payload)
    const imena = imenaPrilog(priloge)

    for (let i = 0; i < priloge.length; i++) {
      if (casJe()) { izid.nedokoncano = true; break }
      const ime = imena[i]
      // Starejsi zapisi (pred preletom 334) imajo ime prvega PDF-ja - ujema se.
      const prej = znano?.get(ime)
      const ponovi = prej && prej.status === 'napaka' && prej.razlog !== 'pdf_zaklenjen'
      if (prej && !ponovi) continue

      const a = await gmail(accessToken, `messages/${msgId}/attachments/${priloge[i].body!.attachmentId}`)
      if (!a.ok || !a.data?.data) { prehodnaNapaka = true; izid.napak++; continue }
      const pdfBase64 = String(a.data.data).replace(/-/g, '+').replace(/_/g, '/')

      const osnova = {
        org_id: conn.org_id,
        connection_id: conn.id,
        email_subject: glava('subject'),
        email_from: glava('from'),
        email_date: glava('date') ? new Date(glava('date')).toISOString() : (m.data.internalDate ? new Date(Number(m.data.internalDate)).toISOString() : null),
        attachment_name: ime,
        pdf_base64: pdfBase64,
      }
      const oznaka = { _gmail_message_id: msgId, _gmail_priloga: ime }

      let status: 'pending' | 'ni_racun' | 'napaka'
      let extracted: any
      try {
        const ai = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: PROMPT },
          ] }],
        })
        const text = ai.content[0]?.type === 'text' ? ai.content[0].text : ''
        const json = text.match(/\{[\s\S]*\}/)
        if (!json) throw new Error('AI ni vrnil podatkov')
        extracted = { ...JSON.parse(json[0]), ...oznaka }
        // PRELET 335: dokument z davcno stevilko izdajatelja in zneskom je skoraj
        // vedno racun, tudi ce ga AI ni tako poimenoval - gre v pregled
        // (razen ocitnih ne-racunov: izpisek, transakcije, nalog, predracun ...).
        const zDavcno = (extracted.has_tax_number || extracted.vendor_tax_number) && Number(extracted.amount_total) > 0
        const neRacun = /izpis|transakc|nalog|predra|ponudb|opomin|dobavnic/i.test(String(extracted.document_type || ''))
        status = extracted.is_invoice === false && !(zDavcno && !neRacun) ? 'ni_racun' : 'pending'
        if (extracted.is_invoice === false && status === 'pending') extracted._opomba = 'Vsebuje davčno številko izdajatelja — preverite, ali je račun'
      } catch (e: any) {
        const sporocilo = String(e?.message || e)
        const zaklenjen = /password protected/i.test(sporocilo)
        extracted = { ...oznaka, _razlog: zaklenjen ? 'pdf_zaklenjen' : 'napaka_branja', _napaka: sporocilo.slice(0, 300) }
        status = 'napaka'
        if (zaklenjen) izid.zaklenjenih++
        else { izid.napak++; prehodnaNapaka = true }
      }

      // PRELET 338: posiljatelj, cigar dokumente uporabnik VEDNO zavrne (vsaj 3x,
      // nikoli potrjen - npr. potrdila o transakcijah), se ne kopici vec v pregledu:
      // "ni racun" gre naravnost v arhiv, predlog pa med zavrnjene (30 dni viden,
      // en klik "Obnovi").
      let koncniStatus: string = status
      if (status !== 'napaka') {
        const naslov = (String(osnova.email_from).match(/<([^>]+)>/)?.[1] || String(osnova.email_from)).trim().toLowerCase()
        if (naslov) {
          const { data: zgodovina } = await supabase.from('email_scan_pending').select('status')
            .eq('org_id', conn.org_id).ilike('email_from', `%${naslov.replace(/[%_]/g, '')}%`).limit(50)
          const potrjenih = (zgodovina || []).filter((z: any) => z.status === 'confirmed').length
          const zavrnjenih = (zgodovina || []).filter((z: any) => z.status === 'rejected' || z.status === 'arhiv').length
          if (potrjenih === 0 && zavrnjenih >= 3) {
            koncniStatus = status === 'ni_racun' ? 'arhiv' : 'rejected'
            extracted._razlog = 'posiljatelj_vedno_zavrnjen'
          }
        }
      }
      const vrstica: Record<string, any> = { ...osnova, extracted, status: koncniStatus }
      if (koncniStatus === 'rejected' || koncniStatus === 'arhiv') vrstica.reviewed_at = new Date().toISOString()
      const { error } = ponovi
        ? await supabase.from('email_scan_pending').update(vrstica).eq('id', prej!.id)
        : await supabase.from('email_scan_pending').insert(vrstica)
      if (error) { console.error('email-scan: zapisa ni bilo mogoce shraniti:', msgId, ime, error.message); prehodnaNapaka = true; continue }

      if (koncniStatus === 'pending') {
        izid.najdenih++
        try {
          const t = Date.parse(String(extracted.date || '').slice(0, 10))
          if (Number.isFinite(t)) {
            const { data: kandidati } = await supabase.from('receipts').select(STROSEK_POLJA)
              .eq('org_id', conn.org_id).neq('status', 'rejected')
              .gte('receipt_date', new Date(t - 12 * 86_400_000).toISOString().slice(0, 10))
              .lte('receipt_date', new Date(t + 12 * 86_400_000).toISOString().slice(0, 10))
              .limit(500)
            if (najdiUjemanje(extracted, kandidati || [])) izid.zeVneseno++
          }
        } catch { /* ni kljucno */ }
      } else if (koncniStatus === 'ni_racun') izid.niRacun++
    }
  }

  // 4) Oznaka zadnjega skeniranja: samo ob popolnem, uspesnem pregledu.
  // Le ce pregled pokriva obdobje OD dosedanje oznake naprej - sicer bi rocni
  // pregled kasnejsega obdobja preskocil vrzel pred njim.
  const pokrivaOdOznake = !conn.last_scanned_at || opcije.od.getTime() <= new Date(conn.last_scanned_at).getTime()
  if (opcije.premakniOznako && pokrivaOdOznake && !izid.nedokoncano && !prehodnaNapaka) {
    const konec = opcije.do && opcije.do.getTime() < Date.now() ? opcije.do : new Date()
    // Nikoli nazaj (rocni pregled starejsega obdobja ne sme vrniti oznake).
    if (!conn.last_scanned_at || new Date(conn.last_scanned_at) < konec) {
      const { error } = await supabase.from('email_connections').update({ last_scanned_at: konec.toISOString() }).eq('id', conn.id)
      if (error) console.error('email-scan: oznake zadnjega skeniranja ni bilo mogoce shraniti:', conn.id, error.message)
    }
  }
  return izid
}
