/**
 * Zahtevki za plačilo na portalu (prelet 357, DEL B). Obdelavo dopolni
 * naslednji prelet; do takrat webhook dogodkov zahtevkov ne obdeluje.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function obdelajPlacanZahtevek(
  _admin: SupabaseClient,
  _zahtevekId: string,
  _o: { sessionId: string; paymentIntentId: string | null; osnova: string },
): Promise<{ stanje: 'izdan' | 'ze' | 'napaka' | 'preskoceno'; napaka?: string }> {
  return { stanje: 'preskoceno' }
}

export async function oznaciZahtevekVrnjen(_admin: SupabaseClient, _paymentIntentId: string) {}
