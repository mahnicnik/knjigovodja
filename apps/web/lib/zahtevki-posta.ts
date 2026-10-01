/**
 * PRELET 360: e-posta ZAHTEVKA ZA PLACILO in PLACANEGA RACUNA iz zahtevka.
 *
 * Zahtevek NI racun: zadeva, naslov in besedilo to jasno povedo, priloga je
 * "predogled" s QR kodo do /placaj/[zeton]. Racun stranka dobi sele po
 * placilu (drugo sporocilo, z davcno potrjenim PDF racunom).
 *
 * Posiljanje: obstojeci sistem (Resend, posiljatelj v imenu podjetja,
 * logotip kot vgrajena priloga).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { renderToBuffer } from '@react-pdf/renderer'
import { escapeHtml } from '@/lib/html-escape'
import { InvoicePDF } from '@/lib/invoice-pdf'
import { logotipZaEmail, logoNastavitve, LOGO_MERE } from '@/lib/logotip'
import { resend, posiljateljZa } from '@/lib/resend'

const eur = (x: number) => x.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const datum = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('sl-SI') : '')

type Postavka = { description: string; quantity: number; unit_price: number; vat_rate: number; discount_pct?: number }

function okvir(o: { org: any; logoCid: string | null; podnaslov: string; vsebina: string }) {
  const n = logoNastavitve(o.org)
  const m = LOGO_MERE[n.velikost]
  return `<!DOCTYPE html>
<html lang="sl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e8e8e8;overflow:hidden;">
<tr><td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f0f0f0;">
${o.logoCid ? `<img src="cid:${escapeHtml(o.logoCid)}" alt="${escapeHtml(o.org.name || '')}" style="display:block;max-width:${m.emailSirina}px;max-height:${m.emailVisina}px;width:auto;height:auto;border:0;margin:0 0 12px 0;"/>` : ''}
<div style="font-size:18px;font-weight:600;color:#0D1F12;">${escapeHtml(o.org.name || '')}</div>
<div style="font-size:13px;color:#888;margin-top:2px;">${escapeHtml(o.podnaslov)}</div>
</td></tr>
${o.vsebina}
<tr><td style="padding:24px 32px 28px 32px;font-size:11px;color:#999;line-height:1.6;border-top:1px solid #f0f0f0;">
${escapeHtml(o.org.name || '')}${o.org.address ? ' · ' + escapeHtml(o.org.address) : ''}${o.org.city ? ', ' + escapeHtml(`${o.org.post_code || ''} ${o.org.city}`.trim()) : ''}${o.org.tax_number ? ' · davčna št. ' + escapeHtml(String(o.org.tax_number).replace(/^SI/i, '')) : ''}
</td></tr>
</table></td></tr></table></body></html>`
}

function tabelaPostavk(postavke: Postavka[]) {
  const vrstice = postavke.map(p => {
    const znesek = p.quantity * p.unit_price * (1 - (p.discount_pct || 0) / 100) * (1 + p.vat_rate / 100)
    const kol = Number.isInteger(p.quantity) ? String(p.quantity) : String(p.quantity).replace('.', ',')
    return `<tr><td style="padding:8px 0;font-size:13px;color:#0D1F12;border-bottom:1px solid #f2f2f2;">${escapeHtml(p.description)}<div style="font-size:11px;color:#999;">${kol} × ${eur(p.unit_price)}${p.discount_pct ? ` · popust ${String(p.discount_pct).replace('.', ',')} %` : ''}${p.vat_rate ? ` · DDV ${String(p.vat_rate).replace('.', ',')} %` : ''}</div></td>
<td style="padding:8px 0;font-size:13px;color:#0D1F12;text-align:right;white-space:nowrap;border-bottom:1px solid #f2f2f2;vertical-align:top;">${eur(Math.round(znesek * 100) / 100)}</td></tr>`
  }).join('')
  return `<table role="presentation" style="width:100%;border-collapse:collapse;">${vrstice}</table>`
}

export function zahtevekEmailHtml(o: {
  org: any; logoCid: string | null; stevilka: string | null; postavke: Postavka[]; znesek: number
  url: string; veljaDo: string; opomnik: boolean
}) {
  const vsebina = `
<tr><td style="padding:24px 32px 0 32px;">
<div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Zahtevek za plačilo${o.stevilka ? ' ' + escapeHtml(o.stevilka) : ''}</div>
<div style="font-size:14px;color:#444;line-height:1.6;">${o.opomnik ? 'Prijazno vas opominjamo na še neporavnan zahtevek za plačilo.' : 'Pošiljamo vam zahtevek za plačilo.'} <strong>To ni račun</strong> — davčno potrjen račun vam pošljemo takoj po plačilu.</div>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;">${tabelaPostavk(o.postavke)}</td></tr>
<tr><td style="padding:16px 32px 0 32px;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#0D1F12;border-radius:14px;"><tr><td style="padding:22px 26px;">
<div style="font-size:12px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Za plačilo</div>
<div style="font-size:38px;font-weight:700;color:#ffffff;letter-spacing:-1px;line-height:1;">${eur(o.znesek)}</div>
<div style="font-size:12px;color:#E8B547;margin-top:10px;">Povezava velja do ${datum(o.veljaDo)}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;" align="center">
<a href="${escapeHtml(o.url)}" style="display:inline-block;background:#1F6B3A;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 34px;border-radius:12px;">Plačaj s kartico</a>
<div style="font-size:11px;color:#999;margin-top:10px;line-height:1.5;">Kartica, Apple Pay ali Google Pay · varno plačilo prek Stripe<br><a href="${escapeHtml(o.url)}" style="color:#999;word-break:break-all;">${escapeHtml(o.url)}</a></div>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;font-size:12px;color:#888;line-height:1.6;">V prilogi je predogled zahtevka s QR kodo za plačilo.</td></tr>`
  return okvir({ org: o.org, logoCid: o.logoCid, podnaslov: 'vam pošilja zahtevek za plačilo', vsebina })
}

export function placanRacunEmailHtml(o: { org: any; logoCid: string | null; stevilka: string; znesek: number; datumPlacila: string | null; potrjen: boolean }) {
  const vsebina = `
<tr><td style="padding:24px 32px 0 32px;">
<div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Račun</div>
<div style="font-size:26px;font-weight:700;color:#0D1F12;">${escapeHtml(o.stevilka)}</div>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#E1F5EE;border-radius:14px;border:1.5px solid #A6D9C3;"><tr><td style="padding:20px 24px;">
<div style="font-size:15px;font-weight:700;color:#0E5E3B;">✓ Plačano s kartico — ${eur(o.znesek)}</div>
<div style="font-size:12px;color:#1D9E75;margin-top:6px;line-height:1.6;">Hvala za plačilo${o.datumPlacila ? ' dne ' + datum(o.datumPlacila) : ''}. V prilogi je ${o.potrjen ? 'davčno potrjen ' : ''}račun za vašo evidenco. Ničesar vam ni treba več plačati.</div>
</td></tr></table>
</td></tr>`
  return okvir({ org: o.org, logoCid: o.logoCid, podnaslov: 'vam pošilja račun', vsebina })
}

/** Zahtevek po e-posti stranki (prvic ali kot opomnik). */
export async function posljiZahtevek(admin: SupabaseClient, zahtevekId: string, osnova: string, o: { opomnik?: boolean } = {}) {
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('id', zahtevekId).single()
  if (!z) throw new Error('Zahtevek ne obstaja')
  const { data: org } = await admin.from('organizations').select('*').eq('id', z.org_id).single()
  const url = `${osnova}/placaj/${z.zeton}`
  const qr = await QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: 'M' })
  const zaPdf = {
    invoice_number: z.stevilka || 'Zahtevek', invoice_type: 'invoice',
    client_name: z.stranka_ime, client_email: z.stranka_email, client_address: z.stranka_naslov, client_tax_number: z.stranka_davcna,
    issue_date: z.ustvarjeno, service_date: z.service_date, service_date_to: z.service_date_to, header_text: z.header_text,
    line_items: z.postavke, amount_net: Number(z.znesek_neto), vat_amount: Number(z.ddv), amount_total: Number(z.znesek),
    status: 'sent', notes: z.opomba, vat_exemption_text: z.vat_exemption_text,
  }
  const pdf = await renderToBuffer(InvoicePDF({ invoice: zaPdf, org, qrDataUrl: '', zahtevek: { url, qrDataUrl: qr, veljaDo: z.velja_do } }) as any)
  const logo = await logotipZaEmail(org)
  const html = zahtevekEmailHtml({
    org, logoCid: logo?.cid ?? null, stevilka: z.stevilka, postavke: z.postavke, znesek: Number(z.znesek),
    url, veljaDo: z.velja_do, opomnik: !!o.opomnik,
  })
  const zadeva = `${o.opomnik ? 'Opomnik: ' : ''}Zahtevek za plačilo${z.stevilka ? ' ' + z.stevilka : ''} — ${org.name}`
  const { error } = await resend.emails.send({
    from: posiljateljZa(org.name), to: [z.stranka_email], subject: zadeva, html,
    ...(org.email ? { replyTo: org.email } : {}),
    attachments: [{ filename: `zahtevek-${String(z.stevilka || 'placilo').replace(/[^0-9A-Za-z-]/g, '_')}.pdf`, content: pdf }, ...(logo ? [logo.priloga] : [])],
  } as any)
  if (error) throw new Error('E-pošte ni bilo mogoče poslati: ' + error.message)
  const zdaj = new Date().toISOString()
  await admin.from('placilni_zahtevki').update(o.opomnik ? { opomnik_ob: zdaj } : { poslano_ob: zdaj }).eq('id', zahtevekId)
  return { url }
}
