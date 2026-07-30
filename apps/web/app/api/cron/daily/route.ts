import { NextRequest, NextResponse } from 'next/server'
import { GET as notificationsGET } from '../notifications/route'
import { GET as emailScanGET } from '@/app/api/email-scan/cron/route'
import { GET as unfreezeGET } from '../unfreeze-packages/route'
import { GET as installmentsGET } from '../installments/route'
import { GET as recurringInvoicesGET } from '../recurring-invoices/route'

/**
 * En sam dnevni cron, ki zaporedoma pokliCe vse stiri loceno testirane
 * cron funkcije. To resuje omejitev Vercel Hobby plana (max 2 croni na
 * projekt) - namesto 4 locenih vnosov v vercel.json imamo samo 1.
 * Vsaka posamezna funkcija ostaja v svoji datoteki (lazje testiranje/vzdrzevanje),
 * samo klic je zdruzen.
 */
export async function GET(request: NextRequest) {
  const results: Record<string, any> = {}

  try {
    const res = await notificationsGET(request)
    results.notifications = await res.json()
  } catch (e: any) {
    results.notifications = { error: e.message }
  }

  try {
    const res = await emailScanGET(request)
    results.emailScan = await res.json()
  } catch (e: any) {
    results.emailScan = { error: e.message }
  }

  try {
    const res = await unfreezeGET(request)
    results.unfreeze = await res.json()
  } catch (e: any) {
    results.unfreeze = { error: e.message }
  }

  try {
    const res = await installmentsGET(request)
    results.installments = await res.json()
  } catch (e: any) {
    results.installments = { error: e.message }
  }

  try {
    const res = await recurringInvoicesGET(request)
    results.recurringInvoices = await res.json()
  } catch (e: any) {
    results.recurringInvoices = { error: e.message }
  }

  return NextResponse.json({ success: true, results })
}
