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

/**
 * PRELET 277: posiljatelj V IMENU PODJETJA.
 *
 * Stranka fitnesa je dobivala posto od "Racunko", ki ga ne pozna, ne od
 * podjetja, kjer vadi. Prikazno ime je zdaj ime podjetja; NASLOV ostane
 * racuni@xn--raunko-j2a.si, ker je to edina pri Resendu preverjena domena -
 * z druge posiljati ni mogoce.
 *
 * Znake < > " odstranimo, ker bi pokvarili glavo sporocila.
 */
export function posiljateljZa(imePodjetja?: string | null): string {
  const ime = String(imePodjetja || '').replace(/[<>"]/g, '').trim()
  return ime ? `${ime} <racuni@xn--raunko-j2a.si>` : FROM_EMAIL
}