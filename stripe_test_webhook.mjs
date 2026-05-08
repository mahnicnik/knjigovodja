// Test script — simulira Stripe webhook event
// Zaženite: node stripe_test_webhook.mjs

import crypto from 'crypto'

// ── NASTAVITVE ────────────────────────────────────────────
const WEBHOOK_URL = 'https://knjigovodja.vercel.app/api/stripe/webhook'
const ORG_ID = 'd3812c26-eead-418c-abb4-e97ac30036c7'
const WEBHOOK_SECRET = 'whsec_test_secret_123' // mora biti enak kot v stripe_settings tabeli

// ── GENERIRA STRIPE SIGNATURE ─────────────────────────────
function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${payload}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

// ── TEST EVENTI ───────────────────────────────────────────
const EVENTS = {

  payment_intent_succeeded: {
    id: 'evt_test_' + Date.now(),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_' + Date.now(),
        amount: 36600, // 366.00 EUR v centih
        currency: 'eur',
        status: 'succeeded',
        receipt_email: 'stranka@primer.si',
        description: 'Spletni tečaj — Advanced JavaScript',
        shipping: { name: 'Janez Novak' },
        metadata: {
          customer_name: 'Janez Novak',
          customer_email: 'stranka@primer.si',
          description: 'Spletni tecaj — Advanced JavaScript',
          vat_rate: '22',
        }
      }
    }
  },

  invoice_paid: {
    id: 'evt_test_inv_' + Date.now(),
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_test_' + Date.now(),
        amount_paid: 9900, // 99.00 EUR
        currency: 'eur',
        customer_email: 'podjetje@primer.si',
        customer_name: 'Podjetje ABC d.o.o.',
        lines: {
          data: [
            { description: 'SaaS narocnina — Mesecni plan', amount: 9900, quantity: 1 }
          ]
        }
      }
    }
  },

  charge_refunded: {
    id: 'evt_test_ref_' + Date.now(),
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_' + Date.now(),
        amount: 36600,
        amount_refunded: 36600,
        currency: 'eur',
        payment_intent: 'pi_test_12345', // mora obstajati v bazi
      }
    }
  },
}

// ── POŠLJI EVENT ──────────────────────────────────────────
async function sendEvent(eventName) {
  const event = EVENTS[eventName]
  if (!event) {
    console.error(`❌ Neznan event: ${eventName}`)
    console.log('Možni eventi:', Object.keys(EVENTS).join(', '))
    return
  }

  const payload = JSON.stringify(event)
  const signature = generateStripeSignature(payload, WEBHOOK_SECRET)
  const url = `${WEBHOOK_URL}?org_id=${ORG_ID}`

  console.log(`\n🚀 Pošiljam event: ${event.type}`)
  console.log(`   URL: ${url}`)
  console.log(`   Payload: ${payload.slice(0, 100)}...`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
    })

    const data = await res.json()

    if (res.ok) {
      console.log(`✅ Uspešno! Status: ${res.status}`)
      console.log(`   Odgovor:`, data)
    } else {
      console.log(`❌ Napaka! Status: ${res.status}`)
      console.log(`   Odgovor:`, data)
    }
  } catch (e) {
    console.error(`❌ Napaka:`, e.message)
  }
}

// ── MAIN ──────────────────────────────────────────────────
async function main() {
  const eventArg = process.argv[2] || 'payment_intent_succeeded'

  console.log('🧪 Stripe Webhook Tester')
  console.log('═══════════════════════')
  console.log(`ORG_ID: ${ORG_ID}`)
  console.log(`Webhook URL: ${WEBHOOK_URL}`)
  console.log(`Event: ${eventArg}\n`)

  if (ORG_ID === 'VPIŠITE_VAŠ_ORG_ID') {
    console.error('❌ Nastavite ORG_ID v skriptu (vrstica 9)!')
    console.log('\nORG_ID najdete v:')
    console.log('  Supabase → Table Editor → organizations → id stolpec')
    console.log('  Ali v URL ko ste prijavljeni v aplikacijo')
    process.exit(1)
  }

  await sendEvent(eventArg)
}

main()
