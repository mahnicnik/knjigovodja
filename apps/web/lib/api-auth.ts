/**
 * RAČUNKO — API Key Authentication
 *
 * Vsak API klic mora vsebovati veljaven API ključ v headerju:
 * Authorization: Bearer rk_live_xxxxxxxxxxxx
 *
 * API ključi so shranjeni kot SHA-256 hash v DB.
 * Prefix (rk_live_ ali rk_test_) je shranjen za prikaz.
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Service role klient za API (brez user auth)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Generira nov API ključ.
 * Format: rk_live_<32 random hex znakov>
 */
export function generateApiKey(isTest = false): { key: string; prefix: string; hash: string } {
  const prefix = isTest ? 'rk_test_' : 'rk_live_'
  const random = crypto.randomBytes(32).toString('hex')
  const key = `${prefix}${random}`
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  return { key, prefix, hash }
}

/**
 * Validira API ključ iz Authorization headerja.
 * Vrne org_id če je ključ veljaven, null sicer.
 */
export async function validateApiKey(authHeader: string | null): Promise<{
  orgId: string | null
  error: string | null
}> {
  if (!authHeader) {
    return { orgId: null, error: 'Authorization header manjka' }
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { orgId: null, error: 'Neveljaven format. Uporabite: Authorization: Bearer rk_live_...' }
  }

  const key = authHeader.slice(7).trim()

  if (!key.startsWith('rk_live_') && !key.startsWith('rk_test_')) {
    return { orgId: null, error: 'Neveljaven API ključ. Ključ mora začeti z rk_live_ ali rk_test_' }
  }

  const hash = crypto.createHash('sha256').update(key).digest('hex')
  const supabase = getServiceClient()

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('org_id, is_active')
    .eq('key_hash', hash)
    .maybeSingle()

  if (!apiKey) {
    return { orgId: null, error: 'API ključ ni veljaven' }
  }

  if (!apiKey.is_active) {
    return { orgId: null, error: 'API ključ je deaktiviran' }
  }

  // Posodobi last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', hash)

  return { orgId: apiKey.org_id, error: null }
}

/**
 * Standardni API error response
 */
export function apiError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status })
}

/**
 * Standardni API success response
 */
export function apiSuccess(data: any, meta?: any) {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) })
}

export { getServiceClient }