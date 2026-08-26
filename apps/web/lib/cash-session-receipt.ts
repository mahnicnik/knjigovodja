/**
 * RAČUNKO POS — Cash Session Receipt Templates
 *
 * Trije HTML izpisi za 80mm termalni printer:
 *   - buildOpeningReceipt()  — Otvoritev blagajne
 *   - buildXReportReceipt()  — X-poročilo (vmesno)
 *   - buildZReportReceipt()  — Z-poročilo (zaključek)
 *
 * Enak format kot lib/receipt.ts (80mm, monospace, @page size: 80mm auto).
 */

import { type CashSession, type SessionStats } from './cash-session'

// ===== TIPI =====

export interface ReceiptOrg {
  name: string
  address?: string | null
  post_code?: string | null
  city?: string | null
  tax_number?: string | null
  vat_registered?: boolean | null
}

// ===== SKUPNI CSS =====

const BASE_CSS = `
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
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .small  { font-size: 10px; }
  .mono   { font-family: 'Menlo', 'Consolas', monospace; }
  .line   { border-top: 1px dashed #000; margin: 6px 0; }
  .dline  { border-top: 2px solid #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 4px; }
  .row.sub { font-size: 10px; color: #444; }
  .title  { font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 4px 0 2px; }
  .subtitle { font-size: 10px; color: #444; margin-bottom: 4px; }
  .section { font-weight: 700; font-size: 11px; margin: 4px 0 2px; }
  .total-row {
    font-weight: 700; font-size: 13px;
    display: flex; justify-content: space-between;
    padding: 3px 0;
  }
  .diff-pos { font-weight: 700; }
  .diff-neg { font-weight: 700; }
  .diff-ok  { font-weight: 700; }
  .sign-line {
    border-bottom: 1px solid #000;
    width: 160px;
    margin: 16px 0 4px;
    height: 1px;
  }
  .footer {
    margin-top: 8px;
    text-align: center;
    font-size: 10px;
    line-height: 1.6;
  }
  .footer .brand {
    font-weight: 700;
    letter-spacing: 4px;
    font-size: 11px;
  }
  .footer .url { font-weight: 700; }
  .warning { font-size: 10px; font-style: italic; }
`

// ===== POMOŽNE =====

function eur(n: number): string {
  return '€' + n.toFixed(2).replace('.', ',')
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`
}

function fmtTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
}

function fmtDateTime(d: Date | string): string {
  return `${fmtDate(d)} ${fmtTime(d)}`
}

function duration(from: string, to?: string | null): string {
  const start = new Date(from)
  const end = to ? new Date(to) : new Date()
  const ms = end.getTime() - start.getTime()
  const h = Math.floor(ms / 1000 / 60 / 60)
  const m = Math.floor((ms / 1000 / 60) % 60)
  return `${h}h ${m}min`
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function orgHeader(org: ReceiptOrg): string {
  const addr = [
    org.address,
    [org.post_code, org.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  return `
    <div class="center">
      <div class="bold" style="font-size:14px">${escHtml(org.name)}</div>
      ${addr ? `<div class="small">${escHtml(addr)}</div>` : ''}
      ${org.tax_number ? `<div class="small">Davčna št.: ${escHtml(org.tax_number)}</div>` : ''}
      ${org.vat_registered && org.tax_number ? `<div class="small">ID za DDV: SI${escHtml(org.tax_number)}</div>` : ''}
    </div>`
}

function footer(): string {
  return `
    <div class="line"></div>
    <div class="footer">
      <div>⚡ Izdano s sistemom</div>
      <div class="brand">RAČUNKO</div>
      <div>AI knjigovodstvo za s.p.</div>
      <div class="url">www.racunko.si</div>
    </div>`
}

/**
 * SPREMENJENO (21.8.2026): prej samodejni `window.print()`, ki je odprl
 * MODALNO okno operacijskega sistema in blokiral cel brskalnik, dokler ga
 * uporabnik ni zaprl. Zdaj gumb — kdor tiska, klikne.
 */
function autoprint(): string {
  return `
    <div class="no-print" style="position:fixed;top:0;left:0;right:0;padding:10px;background:#0D1F12;display:flex;gap:8px;justify-content:center">
      <button onclick="window.print()" style="padding:9px 22px;border:0;border-radius:8px;background:#fff;color:#0D1F12;font-weight:700;font-size:14px;cursor:pointer">Natisni</button>
      <button onclick="window.close()" style="padding:9px 22px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Zapri</button>
    </div>
    <style>@media print{.no-print{display:none!important}}body{padding-top:56px}</style>`
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8"/>
<title>${escHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${body}
${autoprint()}
</body>
</html>`
}

// ===== 1. OTVORITEV BLAGAJNE =====

export function buildOpeningReceipt(params: {
  session: CashSession
  org: ReceiptOrg
  sessionNumber: number
  cashierName: string
}): string {
  const { session, org, sessionNumber, cashierName } = params

  const body = `
    ${orgHeader(org)}
    <div class="line"></div>

    <div class="center">
      <div class="title">OTVORITEV BLAGAJNE</div>
    </div>

    <div class="line"></div>

    <div class="row"><span>Izmena št.:</span><span class="bold">${sessionNumber}</span></div>
    <div class="row"><span>Datum:</span><span>${fmtDate(session.opened_at)}</span></div>
    <div class="row"><span>Ura:</span><span>${fmtTime(session.opened_at)}</span></div>
    <div class="row"><span>Odpira:</span><span>${escHtml(cashierName)}</span></div>

    <div class="line"></div>

    <div class="section">ZAČETNA GOTOVINA</div>
    <div style="height:6px"></div>
    <div class="total-row">
      <span>V blagajni:</span>
      <span>${eur(Number(session.cash_opening))}</span>
    </div>

    ${session.opening_note ? `
    <div class="line"></div>
    <div class="small">Opomba: ${escHtml(session.opening_note)}</div>
    ` : ''}

    <div class="line"></div>

    <div class="small">Podpis blagajnika:</div>
    <div class="sign-line"></div>
    <div style="height:16px"></div>

    <div class="line"></div>

    ${footer()}
  `

  return wrapHtml(`Otvoritev blagajne #${sessionNumber}`, body)
}

// ===== 2. X-POROČILO (vmesno) =====

export function buildXReportReceipt(params: {
  session: CashSession
  stats: SessionStats
  org: ReceiptOrg
  sessionNumber: number
  cashierName: string
}): string {
  const { session, stats, org, sessionNumber, cashierName } = params
  const now = new Date()

  const body = `
    ${orgHeader(org)}
    <div class="line"></div>

    <div class="center">
      <div class="title">X - POROČILO</div>
      <div class="subtitle">(vmesno stanje)</div>
    </div>

    <div class="line"></div>

    <div class="row"><span>Izmena št.:</span><span class="bold">${sessionNumber}</span></div>
    <div class="row"><span>Otvoritev:</span><span>${fmtDateTime(session.opened_at)}</span></div>
    <div class="row"><span>Tiskano:</span><span>${fmtDateTime(now)}</span></div>
    <div class="row"><span>Trajanje:</span><span>${duration(session.opened_at)}</span></div>
    <div class="row"><span>Blagajnik:</span><span>${escHtml(cashierName)}</span></div>

    <div class="line"></div>
    <div class="section">PROMET PO PLAČILU</div>
    <div style="height:4px"></div>

    <div class="row">
      <span>Gotovina:</span>
      <span>${eur(stats.cash)}&nbsp;&nbsp;(${stats.cashCount})</span>
    </div>
    <div class="row">
      <span>Kartica:</span>
      <span>${eur(stats.card)}&nbsp;&nbsp;(${stats.cardCount})</span>
    </div>
    <div class="row">
      <span>Bon:</span>
      <span>${eur(stats.bon)}&nbsp;&nbsp;(${stats.bonCount})</span>
    </div>
    <div class="row">
      <span>Predplačilo:</span>
      <span>${eur(stats.prep)}&nbsp;&nbsp;(${stats.prepCount})</span>
    </div>
    <div class="dline"></div>
    <div class="total-row">
      <span>SKUPAJ:</span>
      <span>${eur(stats.totalRevenue)}&nbsp;&nbsp;(${stats.orderCount})</span>
    </div>

    ${stats.tips > 0 ? `
    <div class="line"></div>
    <div class="row sub"><span>Napitnine:</span><span>${eur(stats.tips)}</span></div>
    ` : ''}

    <div class="line"></div>
    <div class="section">PRIČAKOVANA GOTOVINA</div>
    <div style="height:4px"></div>

    <div class="row sub">
      <span>Začetna:</span>
      <span>${eur(Number(session.cash_opening))}</span>
    </div>
    <div class="row sub">
      <span>+ Gotov. računi:</span>
      <span>${eur(stats.cash)}</span>
    </div>
    ${/* POPRAVLJENO (26.8.2026): odstevala so se VSA vracila, tudi karticna,
          pricakovana gotovina pa se racuna SAMO iz gotovinskih. Pri karticnem
          vracilu se vrstice niso izsle: zacetna + gotovinski racuni minus
          izpisano vracilo ni dalo pricakovanega zneska. */''}
    ${(stats.cashRefundTotal ?? stats.refundTotal) > 0 ? `
    <div class="row sub">
      <span>− Gotov. vračila:</span>
      <span>${eur(stats.cashRefundTotal ?? stats.refundTotal)}</span>
    </div>
    ` : ''}
    <div class="dline"></div>
    <div class="total-row">
      <span>V blagajni naj bo:</span>
      <span>${eur(stats.cashExpected)}</span>
    </div>

    ${(stats.vatBase22 + stats.vatBase95 + (stats.vatBase0 || 0) + (stats.vatBaseOther || 0)) > 0 ? `
    <div class="line"></div>
    <div class="section">OBRAČUN DDV</div>
    <div style="height:4px"></div>
    ${stats.vatBase22 > 0 ? `
    <div class="row sub"><span>Osnova 22%:</span><span>${eur(stats.vatBase22)}</span></div>
    <div class="row sub"><span>DDV 22%:</span><span>${eur(stats.vat22)}</span></div>
    ` : ''}
    ${(stats.vatBase0 || 0) > 0 ? `
    <div class="row sub"><span>Oproščeno (0%):</span><span>${eur(stats.vatBase0)}</span></div>
    <div class="row sub"><span>DDV 0%:</span><span>${eur(0)}</span></div>
    ` : ''}
    ${(stats.vatBaseOther || 0) > 0 ? `
    <div class="row sub"><span>Druge stopnje — osnova:</span><span>${eur(stats.vatBaseOther)}</span></div>
    ` : ''}
    ${stats.vatBase95 > 0 ? `
    <div class="row sub"><span>Osnova 9,5%:</span><span>${eur(stats.vatBase95)}</span></div>
    <div class="row sub"><span>DDV 9,5%:</span><span>${eur(stats.vat95)}</span></div>
    ` : ''}
    ` : ''}

    <div class="line"></div>
    <div class="center warning">
      ⓘ To je vmesno poročilo.<br/>Izmena še ni zaključena.
    </div>
    <div class="line"></div>

    ${footer()}
  `

  return wrapHtml(`X-poročilo izmena #${sessionNumber}`, body)
}

// ===== 3. Z-POROČILO (zaključek) =====

export function buildZReportReceipt(params: {
  session: CashSession
  stats: SessionStats
  org: ReceiptOrg
  zReportNumber: number
  cashierName: string
  cashClosingDeclared: number
}): string {
  const { session, stats, org, zReportNumber, cashierName, cashClosingDeclared } = params

  const expected = stats.cashExpected
  const difference = cashClosingDeclared - expected
  const diffAbs = Math.abs(difference)
  const diffLabel = diffAbs < 0.01
    ? 'Ujema se ✓'
    : difference > 0
      ? `+${eur(difference)} (višek)`
      : `−${eur(diffAbs)} (manjko)`

  const body = `
    ${orgHeader(org)}
    <div class="line"></div>

    <div class="center">
      <div class="title">Z - POROČILO</div>
      <div class="subtitle">(zaključek izmene)</div>
    </div>

    <div class="line"></div>

    <div class="row"><span>Z-poročilo št.:</span><span class="bold">${zReportNumber}</span></div>
    <div class="row"><span>Otvoritev:</span><span>${fmtDateTime(session.opened_at)}</span></div>
    <div class="row"><span>Zaključek:</span><span>${fmtDateTime(new Date())}</span></div>
    <div class="row"><span>Trajanje:</span><span>${duration(session.opened_at)}</span></div>
    <div class="row"><span>Blagajnik:</span><span>${escHtml(cashierName)}</span></div>

    <div class="line"></div>
    <div class="section">PROMET PO PLAČILU</div>
    <div style="height:4px"></div>

    <div class="row">
      <span>Gotovina:</span>
      <span>${eur(stats.cash)}&nbsp;&nbsp;(${stats.cashCount})</span>
    </div>
    <div class="row">
      <span>Kartica:</span>
      <span>${eur(stats.card)}&nbsp;&nbsp;(${stats.cardCount})</span>
    </div>
    <div class="row">
      <span>Bon:</span>
      <span>${eur(stats.bon)}&nbsp;&nbsp;(${stats.bonCount})</span>
    </div>
    <div class="row">
      <span>Predplačilo:</span>
      <span>${eur(stats.prep)}&nbsp;&nbsp;(${stats.prepCount})</span>
    </div>
    <div class="dline"></div>
    <div class="total-row">
      <span>SKUPAJ:</span>
      <span>${eur(stats.totalRevenue)}&nbsp;&nbsp;(${stats.orderCount})</span>
    </div>

    ${stats.tips > 0 ? `
    <div class="line"></div>
    <div class="row sub"><span>Napitnine:</span><span>${eur(stats.tips)}</span></div>
    ` : ''}

    ${stats.refundTotal > 0 ? `
    <div class="line"></div>
    <div class="section">VRAČILA</div>
    <div style="height:4px"></div>
    <div class="row sub"><span>Število:</span><span>${stats.refundCount}</span></div>
    <div class="row sub"><span>Skupaj:</span><span>${eur(stats.refundTotal)}</span></div>
    ` : ''}

    ${(stats.vatBase22 + stats.vatBase95 + (stats.vatBase0 || 0) + (stats.vatBaseOther || 0)) > 0 ? `
    <div class="line"></div>
    <div class="section">OBRAČUN DDV</div>
    <div style="height:4px"></div>
    ${stats.vatBase22 > 0 ? `
    <div class="row sub"><span>Osnova 22%:</span><span>${eur(stats.vatBase22)}</span></div>
    <div class="row sub"><span>DDV 22%:</span><span>${eur(stats.vat22)}</span></div>
    ` : ''}
    ${(stats.vatBase0 || 0) > 0 ? `
    <div class="row sub"><span>Oproščeno (0%):</span><span>${eur(stats.vatBase0)}</span></div>
    <div class="row sub"><span>DDV 0%:</span><span>${eur(0)}</span></div>
    ` : ''}
    ${(stats.vatBaseOther || 0) > 0 ? `
    <div class="row sub"><span>Druge stopnje — osnova:</span><span>${eur(stats.vatBaseOther)}</span></div>
    ` : ''}
    ${stats.vatBase95 > 0 ? `
    <div class="row sub"><span>Osnova 9,5%:</span><span>${eur(stats.vatBase95)}</span></div>
    <div class="row sub"><span>DDV 9,5%:</span><span>${eur(stats.vat95)}</span></div>
    ` : ''}
    ` : ''}

    <div class="line"></div>
    <div class="section">IZRAČUN GOTOVINE</div>
    <div style="height:4px"></div>

    <div class="row sub">
      <span>Začetna:</span>
      <span>${eur(Number(session.cash_opening))}</span>
    </div>
    <div class="row sub">
      <span>+ Gotov. računi:</span>
      <span>${eur(stats.cash)}</span>
    </div>
    ${/* POPRAVLJENO (26.8.2026): odstevala so se VSA vracila, tudi karticna,
          pricakovana gotovina pa se racuna SAMO iz gotovinskih. Pri karticnem
          vracilu se vrstice niso izsle: zacetna + gotovinski racuni minus
          izpisano vracilo ni dalo pricakovanega zneska. */''}
    ${(stats.cashRefundTotal ?? stats.refundTotal) > 0 ? `
    <div class="row sub">
      <span>− Gotov. vračila:</span>
      <span>${eur(stats.cashRefundTotal ?? stats.refundTotal)}</span>
    </div>
    ` : ''}
    <div class="dline"></div>
    <div class="total-row">
      <span>Pričakovano:</span>
      <span>${eur(expected)}</span>
    </div>

    <div style="height:4px"></div>
    <div class="total-row">
      <span>Prešteto:</span>
      <span>${eur(cashClosingDeclared)}</span>
    </div>

    <div class="dline"></div>
    <div class="total-row">
      <span>RAZLIKA:</span>
      <span class="${diffAbs < 0.01 ? 'diff-ok' : difference > 0 ? 'diff-pos' : 'diff-neg'}">
        ${diffLabel}
      </span>
    </div>

    ${session.closing_note ? `
    <div class="line"></div>
    <div class="small">Opomba: ${escHtml(session.closing_note)}</div>
    ` : ''}

    <div class="line"></div>

    <div class="small">Podpis blagajnika:</div>
    <div class="sign-line"></div>
    <div style="height:16px"></div>

    <div class="small">Podpis odgovorne osebe:</div>
    <div class="sign-line"></div>
    <div style="height:8px"></div>

    <div class="dline"></div>
    <div class="center bold" style="margin:4px 0">✓ Izmena zaključena</div>
    <div class="dline"></div>

    ${footer()}
  `

  return wrapHtml(`Z-poročilo #${zReportNumber}`, body)
}