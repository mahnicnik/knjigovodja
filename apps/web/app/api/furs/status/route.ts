import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const testMode = process.env.FURS_TEST_MODE === 'true'
  const hasCert = !!(process.env.FURS_CERT_B64 || process.env.FURS_CERT_PATH)

  // Preveri ali FURS API odgovori
  let connected = false
  let lastSync = null

  if (hasCert) {
    try {
      // Poskusi ping FURS endpoint
      const fursUrl = testMode
        ? 'https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register'
        : 'https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices/register'

      // Ne pošiljamo pravega zahtevka, samo preverimo dosegljivost
      const res = await fetch(fursUrl, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)

      // FURS vrne 405 za OPTIONS - to pomeni da je dosegljiv
      connected = res !== null
      lastSync = new Date().toLocaleString('sl-SI', {
        hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric'
      })
    } catch {
      connected = false
    }
  }

  return NextResponse.json({
    connected: hasCert && connected,
    testMode,
    hasCert,
    lastSync,
    environment: testMode ? 'test' : 'production',
  })
}
