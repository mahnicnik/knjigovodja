/**
 * RAČUNKO — POS Receipt HTML Generator
 */
import QRCode from 'qrcode'
import { getFursVerificationUrl } from './furs'

export interface ReceiptOrg {
  name: string
  address?: string | null
  city?: string | null
  post_code?: string | null
  tax_number: string
  vat_registered?: boolean | null
}

export interface ReceiptLine {
  name: string
  qty: number
  unit_price: number
  vat_rate: number
  total?: number
  voided?: boolean
}

export interface ReceiptPayment {
  method: 'cash' | 'card' | 'bon' | 'prep' | string
  furs_zoi?: string | null
  furs_eor?: string | null
}

export interface ReceiptData {
  org: ReceiptOrg
  premiseId: string
  premiseAddress?: string | null
  deviceId: string
  invoiceNumber: string
  issueDate: Date
  cashierName: string
  payment: ReceiptPayment
  lines: ReceiptLine[]
  subtotal: number
  discountAmount?: number
  tip?: number
  total: number
  /**
   * DODANO (19.8.2026): klavzule o neobracunanem DDV. ZDDV-1 zahteva, da
   * racun brez obracunanega DDV navaja RAZLOG (sklic na clen). Ce je na
   * racunu vec razlicnih oproscenih postavk, se izpisejo VSE klavzule.
   */
  vatExemptions?: string[]
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Gotovina', card: 'Kartica', bon: 'Bon', prep: 'Predplačilo',
}

function vatLabel(rate: number): string {
  if (rate <= 0) return 'A'
  if (rate <= 9.5) return 'B'
  return 'C'
}

function eur(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function groupByVat(lines: ReceiptLine[]): Array<{ rate: number; label: string; base: number; vat: number; bruto: number }> {
  const groups = new Map<number, { base: number; vat: number; bruto: number }>()
  for (const l of lines) {
    if (l.voided) continue
    const lineTotal = (l.total ?? l.qty * l.unit_price)
    const rate = Number(l.vat_rate ?? 22)
    const base = rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal
    const vat = lineTotal - base
    const existing = groups.get(rate) ?? { base: 0, vat: 0, bruto: 0 }
    existing.base += base
    existing.vat += vat
    existing.bruto += lineTotal
    groups.set(rate, existing)
  }
  return Array.from(groups.entries())
    .map(([rate, v]) => ({ rate, label: vatLabel(rate), base: v.base, vat: v.vat, bruto: v.bruto }))
    .sort((a, b) => b.rate - a.rate)
}

export async function buildReceiptHTML(d: ReceiptData): Promise<string> {
  const methodLabel = METHOD_LABELS[d.payment.method] || d.payment.method || '—'
  const vatGroups = groupByVat(d.lines)
  const visibleLines = d.lines.filter(l => !l.voided)

  let qrImg = ''
  if (d.payment.furs_zoi) {
    try {
      const fursUrl = getFursVerificationUrl(d.payment.furs_zoi, d.issueDate)
      const qrDataUrl = await QRCode.toDataURL(fursUrl, { width: 140, margin: 1, errorCorrectionLevel: 'M' })
      qrImg = `<div class="qr"><img src="${qrDataUrl}" alt="FURS QR" width="140" height="140"/></div>`
    } catch { qrImg = '' }
  }

  const fullAddress = [
    d.org.address,
    [d.org.post_code, d.org.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  const linesHtml = visibleLines.map(l => {
    const lineTotal = l.total ?? l.qty * l.unit_price
    const lbl = vatLabel(Number(l.vat_rate ?? 22))
    return `
      <div class="row">
        <span class="lname">${escapeHtml(l.name)} <span class="vatlbl">${lbl}</span></span>
        <span class="lsum">${eur(lineTotal)}</span>
      </div>
      <div class="row sub">
        <span class="lqty">${Number(l.qty)} x ${eur(Number(l.unit_price))}</span>
        <span></span>
      </div>`
  }).join('')

  const totalBase = vatGroups.reduce((s, g) => s + g.base, 0)
  const totalVat = vatGroups.reduce((s, g) => s + g.vat, 0)
  const totalBruto = vatGroups.reduce((s, g) => s + g.bruto, 0)

  const vatHtml = vatGroups.length > 0 ? `
    <div class="line"></div>
    <div class="sectitle">OBRAČUN DDV</div>
    <table class="vattable">
      <thead>
        <tr><th>##</th><th>DDV%</th><th>NETO</th><th>DDV</th><th>BRUTO</th></tr>
      </thead>
      <tbody>
        ${vatGroups.map(g => `
          <tr>
            <td>${g.label}</td>
            <td>${g.rate.toFixed(1)}%</td>
            <td>${eur(g.base)}</td>
            <td>${eur(g.vat)}</td>
            <td>${eur(g.bruto)}</td>
          </tr>
        `).join('')}
        ${vatGroups.length > 1 ? `
          <tr class="total-vat">
            <td colspan="2">Skupaj:</td>
            <td>${eur(totalBase)}</td>
            <td>${eur(totalVat)}</td>
            <td>${eur(totalBruto)}</td>
          </tr>
        ` : ''}
      </tbody>
    </table>
    <div class="line" style="margin-top:4px"></div>
    ${vatGroups.map(g => `<div class="small">${g.label}: DDV ${g.rate % 1 === 0 ? g.rate.toFixed(0) : g.rate}% stopnja</div>`).join('')}
  ` : ''

  // KLAVZULE O NEOBRACUNANEM DDV (19.8.2026)
  const klavzule = (d.vatExemptions || []).filter(Boolean)
  const vatExemptionHtml = klavzule.length > 0 ? `
    <div class="line" style="margin-top:6px"></div>
    ${klavzule.map(k => `<div class="small" style="margin-top:4px">${escapeHtml(k)}</div>`).join('')}
  ` : ''

  const discountHtml = (d.discountAmount && d.discountAmount > 0) ? `
    <div class="row sub"><span>Popust</span><span>-${eur(d.discountAmount)}</span></div>
  ` : ''

  const tipHtml = (d.tip && d.tip > 0) ? `
    <div class="row sub"><span>Napitnina</span><span>${eur(d.tip)}</span></div>
  ` : ''

  // POPRAVLJENO (16.8.2026): sporocilo "FURS potrjevanje ni uspelo" se je
  // natisnilo VEDNO, kadar kode EOR ni bilo - tudi ce davcno potrjevanje sploh
  // ni bilo zahtevano (uporabnik je odkljukal). To je zavajajoce: bralcu racuna
  // sporoca, da je nekaj spodletelo, ceprav se ni nic poskusilo.
  //
  // Zdaj locimo tri primere: potrjeno, poskuseno in spodletelo, ter ni bilo
  // zahtevano. Poskus prepoznamo po tem, da ZOI obstaja (izracuna se PRED
  // klicem na FURS) - ce ga ni, potrjevanje ni bilo zahtevano.
  const fursHtml = d.payment.furs_eor ? `
    <div class="line"></div>
    <div class="mono small">ZOI: ${d.payment.furs_zoi || '—'}</div>
    <div class="mono small">EOR: ${d.payment.furs_eor}</div>
    ${qrImg}
    <div class="center small confirm">Davčno potrjeno</div>
  ` : d.payment.furs_zoi ? `
    <div class="line"></div>
    <div class="mono small">ZOI: ${d.payment.furs_zoi}</div>
    <div class="center small warn">Davčno potrjevanje ni uspelo — račun bo potrjen naknadno</div>
  ` : `
    <div class="line"></div>
    <div class="center small">Račun ni davčno potrjen</div>
  `

  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8"/>
<title>Račun ${escapeHtml(d.invoiceNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Menlo', 'Consolas', monospace;
    font-size: 11px; line-height: 1.4;
    color: #000; background: #fff;
    margin: 0; padding: 8mm 4mm; max-width: 80mm;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .small { font-size: 10px; }
  .mono { font-family: 'Menlo','Consolas',monospace; word-break: break-all; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .doubleline { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row.sub { color: #444; font-size: 10px; }
  .lname { flex: 1; word-break: break-word; }
  .lsum { white-space: nowrap; }
  .lqty { padding-left: 10px; }
  .vatlbl { font-size: 9px; color: #666; }
  .header-name { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .header-addr { font-size: 10px; }
  .header-pe { font-size: 10px; margin-top: 4px; border-top: 1px dashed #ccc; padding-top: 4px; }
  .meta { margin: 4px 0; }
  .meta .row { font-size: 11px; }
  .sectitle { font-weight: 700; font-size: 11px; margin: 4px 0 2px; }
  .total-row { font-weight: 700; font-size: 14px; display: flex; justify-content: space-between; padding: 4px 0; }
  .confirm { font-weight: 700; margin-top: 4px; }
  .warn { color: #a83232; font-weight: 700; }
  .qr { text-align: center; margin: 8px 0 4px; }
  .qr img { display: block; margin: 0 auto; }
  .vattable { width: 100%; border-collapse: collapse; font-size: 10px; margin: 4px 0; }
  .vattable th { font-weight: 700; text-align: right; padding: 1px 2px; border-bottom: 1px solid #000; }
  .vattable th:first-child { text-align: left; }
  .vattable td { text-align: right; padding: 1px 2px; }
  .vattable td:first-child { text-align: left; }
  .vattable tr.total-vat td { font-weight: 700; border-top: 1px solid #000; }
  .footer { margin-top: 8px; text-align: center; font-size: 10px; line-height: 1.5; }
  .footer .brand { font-weight: 700; letter-spacing: 4px; font-size: 11px; margin: 2px 0; }
  .footer .url { font-weight: 700; margin-top: 2px; }
</style>
</head>
<body>
  <div class="center">
    <div class="header-name">${escapeHtml(d.org.name)}</div>
    ${fullAddress ? `<div class="header-addr">${escapeHtml(fullAddress)}</div>` : ''}
    <div class="header-addr">Davčna št.: ${escapeHtml(d.org.tax_number)}</div>
    ${d.org.vat_registered ? `<div class="header-addr">ID za DDV: SI${escapeHtml(d.org.tax_number)}</div>` : ''}
  </div>
  ${d.premiseAddress ? `
  <div class="center header-pe">
    <div class="small">PE: ${escapeHtml(d.premiseAddress)}</div>
  </div>` : ''}
  <div class="line"></div>
  <div class="meta">
    <div class="row"><span class="bold">Račun št.:</span><span class="mono">${escapeHtml(d.invoiceNumber)}</span></div>
    <div class="row"><span>Datum:</span><span>${fmtDateTime(d.issueDate)}</span></div>
    <div class="row"><span>Blagajnik:</span><span>${escapeHtml(d.cashierName || '—')}</span></div>
    <div class="row"><span>Plačilo:</span><span>${escapeHtml(methodLabel)}</span></div>
  </div>
  <div class="line"></div>
  ${linesHtml}
  ${discountHtml}
  ${tipHtml}
  ${vatHtml}
  ${vatExemptionHtml}
  <div class="doubleline"></div>
  <div class="total-row">
    <span>Za plačilo:</span>
    <span>${eur(d.total)}</span>
  </div>
  <div class="doubleline"></div>
  ${fursHtml}
  <div class="line"></div>
  <div class="center small" style="margin-top:6px">Hvala za obisk!</div>
  <div class="line"></div>
  <div class="footer">
    <div>Izdano s sistemom</div>
    <div class="brand">RACUNKO</div>
    <div>AI knjigovodstvo za s.p.</div>
    <div class="url">www.racunko.si</div>
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 1500); }, 100);
    });
  </script>
</body>
</html>`
}