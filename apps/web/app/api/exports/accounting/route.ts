import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  generateAccountingXLSX,
  generateAccountingCSV_KIR,
  generateAccountingCSV_KPR,
  type ExportInput,
  type IssuedInvoiceRow,
  type ReceiptRow,
} from '@/lib/accounting-export'
import { resend, FROM_EMAIL } from '@/lib/resend'

const MONTHS = [
  'januar', 'februar', 'marec', 'april', 'maj', 'junij',
  'julij', 'avgust', 'september', 'oktober', 'november', 'december',
]

async function getSupabase() {
    const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const body = await req.json()
    const {
      year,
      month,           // 1-12 (or null for whole year)
      format,          // 'xlsx' | 'csv' | 'both'
      action,          // 'download' | 'email'
      recipientEmail,  // for action='email'
      saveAccountant,  // bool — save accountant email/name to org
      accountantName,  // optional name to save
    } = body

    if (!year || !format || !action) {
      return NextResponse.json({ error: 'Manjkajo obvezni parametri' }, { status: 400 })
    }

    // ===== Pridobi organizacijo =====
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    // ===== Določi obdobje =====
    let periodFrom: string
    let periodTo: string
    let periodLabel: string

    if (month && month >= 1 && month <= 12) {
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(year, month, 0).getDate()
      periodFrom = `${year}-${mm}-01`
      periodTo = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
      periodLabel = `${MONTHS[month - 1]} ${year}`
    } else {
      periodFrom = `${year}-01-01`
      periodTo = `${year}-12-31`
      periodLabel = `Leto ${year}`
    }

    // ===== Pridobi račune =====
    const { data: invoicesData, error: invErr } = await supabase
      .from('issued_invoices')
      .select('*')
      .eq('org_id', org.id)
      .gte('issue_date', periodFrom)
      .lte('issue_date', periodTo)
      .neq('status', 'draft')
      .order('issue_date', { ascending: true })

    if (invErr) {
      return NextResponse.json({ error: `Napaka pri branju računov: ${invErr.message}` }, { status: 500 })
    }

    // ===== Pridobi stroške =====
    const { data: receiptsData, error: recErr } = await supabase
      .from('receipts')
      .select('*')
      .eq('org_id', org.id)
      .gte('receipt_date', periodFrom)
      .lte('receipt_date', periodTo)
      .order('receipt_date', { ascending: true })

    if (recErr) {
      return NextResponse.json({ error: `Napaka pri branju stroškov: ${recErr.message}` }, { status: 500 })
    }

    // ===== Pripravi podatke za export =====
    const issuedInvoices: IssuedInvoiceRow[] = (invoicesData ?? []).map((i: any) => ({
      invoice_number: i.invoice_number,
      issue_date: i.issue_date,
      client_name: i.client_name,
      client_tax_number: i.client_tax_number,
      client_address: i.client_address,
      service_date_from: i.service_date_from,
      service_date_to: i.service_date_to,
      due_date: i.due_date,
      amount_net: Number(i.amount_net),
      vat_amount: Number(i.vat_amount ?? 0),
      amount_total: Number(i.amount_total),
      status: i.status,
      paid_at: i.paid_at,
      zoi: i.zoi,
      eor: i.eor,
      notes: i.notes,
      line_items: i.line_items ?? [],
    }))

    const receipts: ReceiptRow[] = (receiptsData ?? []).map((r: any) => ({
      receipt_number: r.receipt_number,
      receipt_date: r.receipt_date,
      vendor: r.vendor,
      vendor_tax_num: r.vendor_tax_num,
      amount_net: r.amount_net ? Number(r.amount_net) : null,
      vat_rate: r.vat_rate ? Number(r.vat_rate) : null,
      vat_amount: r.vat_amount ? Number(r.vat_amount) : null,
      amount_total: r.amount_total ? Number(r.amount_total) : null,
      category: r.category,
      description: r.description,
      is_deductible: r.is_deductible ?? true,
      status: r.status,
      has_image: !!r.image_url,
    }))

    const exportInput: ExportInput = {
      orgName: org.name,
      orgTaxNumber: org.tax_number,
      orgAddress: org.address ? `${org.address}, ${org.postal_code ?? ''} ${org.city ?? ''}` : null,
      periodLabel,
      periodFrom,
      periodTo,
      issuedInvoices,
      receipts,
    }

    // ===== Save accountant info =====
    if (saveAccountant && recipientEmail) {
      await supabase
        .from('organizations')
        .update({
          accountant_email: recipientEmail,
          accountant_name: accountantName || null,
        })
        .eq('id', org.id)
    }

    // ===== Generiraj datoteke =====
    const xlsxBuffer = format === 'xlsx' || format === 'both' 
      ? generateAccountingXLSX(exportInput) 
      : null

    const csvKir = format === 'csv' || format === 'both'
      ? generateAccountingCSV_KIR(exportInput)
      : null

    const csvKpr = format === 'csv' || format === 'both'
      ? generateAccountingCSV_KPR(exportInput)
      : null

    const fileBaseName = `Racunko_${org.name.replace(/[^a-zA-Z0-9]/g, '_')}_${periodLabel.replace(/\s+/g, '_')}`

    // ===== EMAIL action =====
    if (action === 'email') {
      if (!recipientEmail) {
        return NextResponse.json({ error: 'Manjka email naslov' }, { status: 400 })
      }

      const attachments: Array<{ filename: string; content: Buffer | string }> = []
      
      if (xlsxBuffer) {
        attachments.push({
          filename: `${fileBaseName}.xlsx`,
          content: xlsxBuffer,
        })
      }
      if (csvKir) {
        attachments.push({
          filename: `${fileBaseName}_izdani_racuni.csv`,
          content: '\ufeff' + csvKir, // BOM for Excel UTF-8 recognition
        })
      }
      if (csvKpr) {
        attachments.push({
          filename: `${fileBaseName}_prejeti_racuni.csv`,
          content: '\ufeff' + csvKpr,
        })
      }

      const totalRevenue = issuedInvoices.reduce((s, i) => s + i.amount_net, 0)
      const totalExpenses = receipts.reduce((s, r) => s + (r.amount_net ?? 0), 0)
      const vatOut = issuedInvoices.reduce((s, i) => s + i.vat_amount, 0)
      const vatIn = receipts.reduce((s, r) => s + (r.vat_amount ?? 0), 0)

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; color: #0D1F12;">
  <div style="background: #0D1F12; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
    <div style="font-size: 14px; color: #E8B547; letter-spacing: 0.06em; text-transform: uppercase;">RAČUNKO · Računovodski izvoz</div>
    <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 500;">${periodLabel}</h1>
    <div style="margin-top: 4px; opacity: 0.7; font-size: 13px;">${org.name} · DŠ: ${org.tax_number ?? '—'}</div>
  </div>
  
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-top: 0; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 14px; line-height: 1.6;">
      ${accountantName ? `Pozdravljeni ${accountantName},` : 'Pozdravljeni,'}
    </p>
    
    <p style="font-size: 14px; line-height: 1.6;">
      pošiljam računovodski izvoz za <strong>${periodLabel}</strong>.
      V priponkah najdete:
    </p>
    
    <ul style="font-size: 14px; line-height: 1.8;">
      ${xlsxBuffer ? '<li><strong>XLSX</strong> — 3 sheet-i (Izdani računi, Prejeti računi, Rekapitulacija)</li>' : ''}
      ${csvKir ? '<li><strong>CSV izdani računi</strong> — semicolon separator za Vasco/Pantheon</li>' : ''}
      ${csvKpr ? '<li><strong>CSV prejeti računi</strong> — semicolon separator</li>' : ''}
    </ul>
    
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px;">
      <tr style="background: #F7F6F2;">
        <td colspan="2" style="padding: 12px; font-weight: 600; border-radius: 8px 8px 0 0;">KRATKI POVZETEK</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06);">Izdani računi</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); text-align: right;">${issuedInvoices.length} kos · €${totalRevenue.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06);">Prejeti računi</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); text-align: right;">${receipts.length} kos · €${totalExpenses.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06);">DDV izhodni</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); text-align: right;">€${vatOut.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06);">DDV vstopni</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); text-align: right;">€${vatIn.toFixed(2)}</td>
      </tr>
      <tr style="background: #E1F5EE;">
        <td style="padding: 10px 12px; font-weight: 600;">DDV bilanca</td>
        <td style="padding: 10px 12px; font-weight: 600; text-align: right;">€${(vatOut - vatIn).toFixed(2)}</td>
      </tr>
    </table>
    
    <p style="font-size: 13px; color: #888; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.06);">
      Izvoz je informativen. Podatki morajo biti pregledani in potrjeni s strani 
      certificiranega računovodje. Računko ne nadomešča profesionalne računovodske storitve.
    </p>
    
    <p style="font-size: 13px; color: #888; margin-top: 12px;">
      Lep pozdrav,<br>
      ${org.name}${user.email ? ` · ${user.email}` : ''}
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #aaa;">
    Poslano preko <a href="https://xn--raunko-j2a.si" style="color: #1D9E75; text-decoration: none;">Računko</a>
  </div>
</body>
</html>
      `

      const { error: emailError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        replyTo: user.email,
        subject: `Računovodski izvoz · ${org.name} · ${periodLabel}`,
        html: emailHtml,
        attachments,
      } as any)

      if (emailError) {
        return NextResponse.json({ error: `Email napaka: ${emailError.message}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'email',
        recipient: recipientEmail,
        stats: {
          invoices: issuedInvoices.length,
          receipts: receipts.length,
          totalRevenue,
          totalExpenses,
        },
      })
    }

    // ===== DOWNLOAD action =====
    if (action === 'download') {
      if (format === 'xlsx' && xlsxBuffer) {
        return new NextResponse(xlsxBuffer as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileBaseName}.xlsx"`,
          },
        })
      }

      // For CSV, return JSON with content so frontend can offer separate downloads
      if (format === 'csv') {
        return NextResponse.json({
          success: true,
          fileBaseName,
          csvKir,
          csvKpr,
        })
      }
    }

    return NextResponse.json({ error: 'Neveljavna kombinacija parametrov' }, { status: 400 })

  } catch (e: any) {
    console.error('Export error:', e)
    return NextResponse.json({ error: e.message ?? 'Neznana napaka' }, { status: 500 })
  }
}