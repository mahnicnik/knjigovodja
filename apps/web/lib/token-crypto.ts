// lib/token-crypto.ts (24.7.2026, audit R5)
//
// Simetricno sifriranje OAuth token-ov (Gmail refresh_token/access_token)
// preden gredo v bazo. Prej so bili shranjeni v cistopisu - dolgozivi
// refresh_token v bazi je enakovreden trajnemu dostopu do uporabnikove
// Gmail posto, ce bi baza kadarkoli uhajala (npr. service-role kljuc).
//
// NAZAJ-KOMPATIBILNO: obstojeci (ze povezani) racuni imajo trenutno
// cistopisne vrednosti v bazi. decryptToken() te prepozna (ni "enc:v1:"
// predpone) in jih vrne nespremenjene - noben migracija skripta ni
// potrebna, obstojece povezave delujejo naprej brez prekinitve.
//
// Kljuc: EMAIL_TOKEN_KEY env spremenljivka, 32-bajtni kljuc v hex zapisu
// (64 hex znakov). Generiraj z: openssl rand -hex 32

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const hex = process.env.EMAIL_TOKEN_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('EMAIL_TOKEN_KEY manjka ali ni pravilne dolzine (potrebnih 64 hex znakov / 32 bajtov)')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptToken(plain: string): string {
  if (!plain) return plain
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return PREFIX + [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decryptToken(value: string | null): string | null {
  if (!value) return value
  // Nazaj-kompatibilnost: stare cistopisne vrednosti nimajo predpone
  if (!value.startsWith(PREFIX)) return value
  try {
    const [ivHex, authTagHex, ciphertextHex] = value.slice(PREFIX.length).split(':')
    const key = getKey()
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()])
    return plain.toString('utf8')
  } catch (e: any) {
    console.error('decryptToken napaka:', e.message)
    return null
  }
}
