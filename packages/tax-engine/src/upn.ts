// ============================================================
// UPN GENERATOR — Generiranje UPN nalogov in QR kod
// Slovenian UPN (Universal Payment Order) standard
// ============================================================

import { FURS } from './constants'

export interface UPNData {
  payerName: string          // Ime plačnika (vaš s.p.)
  payerAddress: string       // Naslov plačnika
  payerCity: string          // Kraj plačnika
  recipientName: string      // Ime prejemnika (FURS ali delavec)
  recipientAddress: string   // Naslov prejemnika
  recipientCity: string      // Kraj prejemnika
  recipientIBAN: string      // IBAN prejemnika
  amount: number             // Znesek v evrih
  reference: string          // Sklic (SI19... ali SI00... ali SI99)
  purposeCode: string        // Koda namena (TAXS, SALA, itd.)
  description: string        // Namen plačila
  dueDate?: string           // Rok plačila (YYYY-MM-DD)
}

export interface UPNResult {
  upnData: UPNData
  qrString: string           // QR string po slovenskem standardu
  referenceFormatted: string // Formatirani sklic
}

/**
 * Generira UPN nalog za plačilo FURS (davki, prispevki)
 */
export function generateFURSPayment(params: {
  payerName: string
  payerAddress: string
  payerCity: string
  taxNumber: string          // Davčna številka s.p.
  paymentType: 'zpiz_sp' | 'zzzs_sp' | 'income_tax_advance' | 'vat' | 
               'salary_income_tax' | 'salary_ee_contributions' | 'salary_er_contributions'
  amount: number
  year: number
  month: number
  dueDate: string
}): UPNResult {
  const { payerName, payerAddress, payerCity, taxNumber, paymentType, amount, year, month, dueDate } = params

  const monthStr = String(month).padStart(2, '0')
  const yearShort = String(year).slice(-2)

  // Generiraj sklic glede na tip plačila
  const reference = generateReference(taxNumber, paymentType, year, month)
  const purposeCode = getPurposeCode(paymentType)
  const description = getPaymentDescription(paymentType, year, month)

  const upnData: UPNData = {
    payerName,
    payerAddress,
    payerCity,
    recipientName: 'Ministrstvo za finance',
    recipientAddress: 'Župančičeva 3',
    recipientCity: '1000 Ljubljana',
    recipientIBAN: FURS.iban,
    amount,
    reference,
    purposeCode,
    description,
    dueDate,
  }

  return {
    upnData,
    qrString: buildQRString(upnData),
    referenceFormatted: formatReference(reference),
  }
}

/**
 * Generira UPN nalog za neto plačo delavcu
 */
export function generateSalaryPayment(params: {
  payerName: string
  payerAddress: string
  payerCity: string
  employeeName: string
  employeeIBAN: string
  netAmount: number
  year: number
  month: number
  dueDate: string
}): UPNResult {
  const { payerName, payerAddress, payerCity, employeeName, employeeIBAN, netAmount, year, month, dueDate } = params

  const reference = `SI00 ${year}-${String(month).padStart(2,'0')}-PLACA`

  const upnData: UPNData = {
    payerName,
    payerAddress,
    payerCity,
    recipientName: employeeName,
    recipientAddress: '',
    recipientCity: '',
    recipientIBAN: employeeIBAN,
    amount: netAmount,
    reference,
    purposeCode: 'SALA',
    description: `Plača ${getMonthName(month)} ${year}`,
    dueDate,
  }

  return {
    upnData,
    qrString: buildQRString(upnData),
    referenceFormatted: reference,
  }
}

/**
 * Generira sklic (referenčno številko)
 * Format: SI19 DDDDDDDD MMYY
 */
function generateReference(
  taxNumber: string,
  type: string,
  year: number,
  month: number
): string {
  const monthStr = String(month).padStart(2, '0')
  const yearShort = String(year).slice(-2)

  const suffixMap: Record<string, string> = {
    zpiz_sp:                  `ZP${monthStr}${yearShort}`,
    zzzs_sp:                  `ZZ${monthStr}${yearShort}`,
    income_tax_advance:       `AK${monthStr}${yearShort}`,
    vat:                      `DDV${yearShort}`,
    salary_income_tax:        `DH${monthStr}${yearShort}`,
    salary_ee_contributions:  `PD${monthStr}${yearShort}`,
    salary_er_contributions:  `DD${monthStr}${yearShort}`,
  }

  const suffix = suffixMap[type] || `XX${monthStr}${yearShort}`
  return `SI19 ${taxNumber} ${suffix}`
}

/**
 * Zgradi QR string po slovenskem UPN standardu
 * Format: UPNQR\nPLACNIK\n...\nZNESEK\nROK\nNAMEN\nSKLIC\n...
 */
function buildQRString(data: UPNData): string {
  const amount = formatAmount(data.amount)
  const dueDate = data.dueDate ? data.dueDate.replace(/-/g, '') : ''

  const fields = [
    'UPNQR',
    '',                           // Koda plačnika
    '',                           // Nujno (prazno)
    '',                           // Koda bančnega nakazila
    data.payerName,
    data.payerAddress,
    data.payerCity,
    amount,
    dueDate,
    data.purposeCode,
    data.description,
    data.recipientIBAN.replace(/\s/g, ''),
    data.reference.replace(/\s/g, ''),
    data.recipientName,
    data.recipientAddress,
    data.recipientCity,
  ]

  return fields.join('\n')
}

// Pomožne funkcije
function formatAmount(amount: number): string {
  return String(Math.round(amount * 100)).padStart(11, '0')
}

function formatReference(ref: string): string {
  return ref.replace(/(\w{2})(\d+)\s+(\w+)/g, '$1 $2 $3')
}

function getPurposeCode(type: string): string {
  const codes: Record<string, string> = {
    zpiz_sp: 'TAXS', zzzs_sp: 'TAXS',
    income_tax_advance: 'TAXS', vat: 'TAXS',
    salary_income_tax: 'TAXS',
    salary_ee_contributions: 'TAXS',
    salary_er_contributions: 'TAXS',
  }
  return codes[type] || 'OTHR'
}

function getPaymentDescription(type: string, year: number, month: number): string {
  const name = getMonthName(month)
  const descriptions: Record<string, string> = {
    zpiz_sp:                 `Prispevek ZPIZ s.p. ${name} ${year}`,
    zzzs_sp:                 `Prispevek ZZZS s.p. ${name} ${year}`,
    income_tax_advance:      `Akontacija dohodnine ${name} ${year}`,
    vat:                     `DDV obračun ${year}`,
    salary_income_tax:       `Dohodnina odtegljaj ${name} ${year}`,
    salary_ee_contributions: `Prispevki delojemalca ${name} ${year}`,
    salary_er_contributions: `Prispevki delodajalca ${name} ${year}`,
  }
  return descriptions[type] || `Plačilo ${name} ${year}`
}

function getMonthName(month: number): string {
  const months = ['januar','februar','marec','april','maj','junij',
                  'julij','avgust','september','oktober','november','december']
  return months[month - 1] ?? ''
}
