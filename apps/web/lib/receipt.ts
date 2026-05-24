/**
 * RAČUNKO — POS Receipt HTML Generator
 *
 * Single source of truth za HTML izpis računa.
 * Uporabljata jo:
 *   - autoPrint() v pos/page.tsx (prvi izpis ob plačilu)
 *   - printReceipt() v pos/page.tsx (ponovni izpis iz seznama računov)
 *
 * Širina: 80mm termalni printer (~42 znakov, font-size 11px monospace)
 */

import QRCode from 'qrcode'
import { getFursVerificationUrl } from './furs'

// ===== TIPI =====

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
  vat_rate: number   // npr. 22, 9.5, 0
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
  premiseId: string      // "SIRBFB01"
  deviceId: string       // "RACUNK001"
  invoiceNumber: string  // tridelno: "SIRBFB01-RACUNK001-42"
  issueDate: Date
  cashierName: string
  payment: ReceiptPayment
  lines: ReceiptLine[]
  subtotal: number       // pred popustom + napitnino
  discountAmount?: number
  tip?: number
  total: number
}

// ===== POMOŽNE FUNKCIJE =====

const METHOD_LABELS: Record<string, string> = {
  cash: 'Gotovina',
  card: 'Kartica',
  bon: 'Bon',
  prep: 'Predplačilo',
}

function eur(n: number): string {
  return '€' + n.toFixed(2).replace('.', ',')
}

function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Združi vrstice po DDV stopnji za "Obračun DDV" sekcijo.
 * Pravilo: unit_price je BRUTO (vključuje DDV).
 * Osnova = bruto / (1 + vat_rate/100)
 * DDV = bruto - osnova
 */
function groupByVat(lines: ReceiptLine[]): Array<{ rate: number; base: number; vat: number }> {
  const groups = new Map<number, { base: number; vat: number }>()

  for (const l of lines) {
    if (l.voided) continue
    const lineTotal = (l.total ?? l.qty * l.unit_price)
    const rate = Number(l.vat_rate ?? 22)
    const base = rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal
    const vat = lineTotal - base

    const existing = groups.get(rate) ?? { base: 0, vat: 0 }
    existing.base += base
    existing.vat += vat
    groups.set(rate, existing)
  }

  return Array.from(groups.entries())
    .map(([rate, v]) => ({ rate, base: v.base, vat: v.vat }))
    .sort((a, b) => b.rate - a.rate)
}

// ===== GLAVNA FUNKCIJA =====

export async function buildReceiptHTML(d: ReceiptData): Promise<string> {
  const methodLabel = METHOD_LABELS[d.payment.method] || d.payment.method || '—'
  const vatGroups = groupByVat(d.lines)
  const visibleLines = d.lines.filter(l => !l.voided)

  // QR koda za FURS preverjanje
  let qrImg = ''
  if (d.payment.furs_zoi) {
    try {
      const fursUrl = getFursVerificationUrl(d.payment.furs_zoi, d.issueDate)
      const qrDataUrl = await QRCode.toDataURL(fursUrl, {
        width: 140,
        margin: 1,
        errorCorrectionLevel: 'M',
      })
      qrImg = `<div class="qr"><img src="${qrDataUrl}" alt="FURS QR" width="140" height="140"/></div>`
    } catch {
      qrImg = ''
    }
  }

  // Naslov v eni vrstici
  const fullAddress = [
    d.org.address,
    [d.org.post_code, d.org.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  // Linije računa: dvovrstični format (ime + skupaj zgoraj, qty × cena spodaj)
  const linesHtml = visibleLines.map(l => {
    const lineTotal = l.total ?? l.qty * l.unit_price
    return `
      <div class="row">
        <span class="lname">${escapeHtml(l.name)}</span>
        <span class="lsum">${eur(lineTotal)}</span>
      </div>
      <div class="row sub">
        <span class="lqty">${Number(l.qty)} × ${eur(Number(l.unit_price))}</span>
        <span></span>
      </div>`
  }).join('')

  // Obračun DDV
  const vatHtml = vatGroups.length > 0 ? `
    <div class="line"></div>
    <div class="sectitle">OBRAČUN DDV</div>
    ${vatGroups.map(g => `
      <div class="row sub"><span>Osnova ${g.rate}%</span><span>${eur(g.base)}</span></div>
      <div class="row sub"><span>DDV ${g.rate}%</span><span>${eur(g.vat)}</span></div>
    `).join('')}
  ` : ''

  // Popust + napitnina
  const discountHtml = (d.discountAmount && d.discountAmount > 0) ? `
    <div class="row sub"><span>Popust</span><span>−${eur(d.discountAmount)}</span></div>
  ` : ''
  const tipHtml = (d.tip && d.tip > 0) ? `
    <div class="row sub"><span>Napitnina</span><span>${eur(d.tip)}</span></div>
  ` : ''

  // ZOI / EOR
  const fursHtml = d.payment.furs_eor ? `
    <div class="line"></div>
    <div class="mono small">ZOI: ${d.payment.furs_zoi || '—'}</div>
    <div class="mono small">EOR: ${d.payment.furs_eor}</div>
    ${qrImg}
    <div class="center small confirm">✓ Davčno potrjeno</div>
  ` : `
    <div class="line"></div>
    <div class="center small warn">⚠ FURS potrjevanje ni uspelo</div>
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
    font-size: 11px;
    line-height: 1.4;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 8mm 4mm;
    max-width: 80mm;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .small { font-size: 10px; }
  .mono { font-family: 'Menlo', 'Consolas', monospace; word-break: break-all; }
  .line {
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
  .doubleline {
    border-top: 2px solid #000;
    margin: 6px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .row.sub { color: #444; font-size: 10px; }
  .lname { flex: 1; word-break: break-word; }
  .lsum { white-space: nowrap; }
  .lqty { padding-left: 10px; }
  .header-name {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .header-addr { font-size: 10px; }
  .meta { margin: 4px 0; }
  .meta .row { font-size: 11px; }
  .sectitle {
    font-weight: 700;
    font-size: 11px;
    margin: 4px 0 2px;
  }
  .total-row {
    font-weight: 700;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .confirm { font-weight: 700; margin-top: 4px; }
  .warn { color: #a83232; font-weight: 700; }
  .qr {
    text-align: center;
    margin: 8px 0 4px;
  }
  .qr img { display: block; margin: 0 auto; }
  .footer {
    margin-top: 8px;
    text-align: center;
    font-size: 10px;
    line-height: 1.5;
  }
  .footer .brand {
    font-weight: 700;
    letter-spacing: 4px;
    font-size: 11px;
    margin: 2px 0;
  }
  .footer .url {
    font-weight: 700;
    margin-top: 2px;
  }
</style>
</head>
<body>

  <!-- GLAVA -->
  <div class="center">
    <div class="header-name">${escapeHtml(d.org.name)}</div>
    ${fullAddress ? `<div class="header-addr">${escapeHtml(fullAddress)}</div>` : ''}
    <div class="header-addr">Davčna št.: ${escapeHtml(d.org.tax_number)}</div>
    ${d.org.vat_registered ? `<div class="header-addr">ID za DDV: SI${escapeHtml(d.org.tax_number)}</div>` : ''}
  </div>

  <div class="line"></div>

  <!-- META -->
  <div class="meta">
    <div class="row"><span class="bold">Račun št.:</span><span class="mono">${escapeHtml(d.invoiceNumber)}</span></div>
    <div class="row"><span>Datum:</span><span>${fmtDateTime(d.issueDate)}</span></div>
    <div class="row"><span>Blagajnik:</span><span>${escapeHtml(d.cashierName || '—')}</span></div>
    <div class="row"><span>Plačilo:</span><span>${escapeHtml(methodLabel)}</span></div>
  </div>

  <div class="line"></div>

  <!-- VRSTICE -->
  ${linesHtml}

  ${discountHtml}
  ${tipHtml}

  ${vatHtml}

  <div class="doubleline"></div>
  <div class="total-row">
    <span>SKUPAJ:</span>
    <span>${eur(d.total)}</span>
  </div>
  <div class="doubleline"></div>

  <!-- FURS -->
  ${fursHtml}

  <!-- NOGA -->
  <div class="line"></div>
  <div class="center small" style="margin-top:6px">Hvala za obisk!</div>
  <div class="line"></div>

  <div class="footer">
    <div>⚡ Izdano s sistemom</div>
    <div class="brand">RAČUNKO</div>
    <div>AI knjigovodstvo za s.p.</div>
    <div class="url">www.računko.si</div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 1500);
      }, 100);
    });
  </script>
</body>
</html>`
}