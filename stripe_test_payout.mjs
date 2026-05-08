import crypto from 'crypto'

const WEBHOOK_URL = 'https://knjigovodja.vercel.app/api/stripe/webhook'
const ORG_ID = 'd3812c26-eead-418c-abb4-e97ac30036c7'
const WEBHOOK_SECRET = 'whsec_test_secret_123'

function generateSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

const EVENTS = {
  payout_paid: {
    id: 'evt_payout_' + Date.now(),
    type: 'payout.paid',
    data: {
      object: {
        id: 'po_test_' + Date.now(),
        amount: 485000, // €4.850 v centih
        currency: 'eur',
        arrival_date: Math.floor(Date.now() / 1000),
        method: 'standard',
        type: 'bank_account',
        description: 'Stripe tedenski payout',
        metadata: {
          period_start: new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0],
          period_end: new Date().toISOString().split('T')[0],
        }
      }
    }
  },
  payout_failed: {
    id: 'evt_payout_fail_' + Date.now(),
    type: 'payout.failed',
    data: {
      object: {
        id: 'po_fail_' + Date.now(),
        amount: 150000,
        currency: 'eur',
        failure_message: 'Napačen IBAN',
        failure_code: 'account_closed',
      }
    }
  },
  refund: {
    id: 'evt_refund_' + Date.now(),
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_' + Date.now(),
        amount: 9900,
        amount_refunded: 9900,
        currency: 'eur',
        payment_intent: 'pi_test_original_123',
      }
    }
  }
}

async function send(eventName) {
  const event = EVENTS[eventName]
  if (!event) { console.error('❌ Neznan event:', Object.keys(EVENTS).join(', ')); return }

  const payload = JSON.stringify(event)
  const signature = generateSignature(payload, WEBHOOK_SECRET)
  const url = `${WEBHOOK_URL}?org_id=${ORG_ID}&mode=payout`

  console.log(`\n🚀 Pošiljam: ${event.type}`)
  console.log(`   URL: ${url}`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
      body: payload,
    })
    const data = await res.json()
    res.ok
      ? console.log(`✅ Status ${res.status}:`, data)
      : console.log(`❌ Napaka ${res.status}:`, data)
  } catch (e) { console.error('❌', e.message) }
}

const arg = process.argv[2] || 'payout_paid'
console.log('🧪 Stripe Payout Tester\n══════════════════════')
send(arg)
