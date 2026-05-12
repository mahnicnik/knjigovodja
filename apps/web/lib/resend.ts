import { Resend } from 'resend'

// Lazy initialization — ne throw-amo pri import (build time),
// samo če dejansko uporabimo brez env-a (runtime).
function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set in environment variables')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    const client = getResendClient()
    return (client as any)[prop]
  },
})

export const FROM_EMAIL = 'Računko <racuni@xn--raunko-j2a.si>'