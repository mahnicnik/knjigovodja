/**
 * IZMENA BLAGAJNE NA TELEFONU (trznice, 17.10.2026)
 *
 * Odpri / vmesno stanje / zakljuci gre prek /api/pos/izmena, ki uporabi ISTO
 * logiko kot spletna blagajna (lib/cash-session.ts) - en izracun Z-porocila
 * za splet, Windows in telefon. Pri locenih izmenah po napravi velja za
 * izmeno naprave telefona.
 */
import { supabase } from './supabase';

const OSNOVA = 'https://xn--raunko-j2a.si';

export interface StanjeIzmene {
  poNapravi: boolean;
  izmena: { id: string; opened_at: string; cash_opening: number; device_id: string | null } | null;
  stats: {
    cash: number; card: number; bon: number; other: number; prep: number; totalRevenue: number;
    orderCount: number; refundTotal: number; cashRefundTotal: number; tips: number; cashExpected: number;
  } | null;
  prenos: number | null;
}

async function klic(orgId: string, pot: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Ni prijave');
  const res = await fetch(OSNOVA + pot, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'x-active-org': orgId,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Napaka strežnika (${res.status})`);
  return data;
}

export function stanjeIzmene(orgId: string, deviceId: string | null): Promise<StanjeIzmene> {
  return klic(orgId, '/api/pos/izmena' + (deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''));
}

export function odpriIzmeno(orgId: string, deviceId: string | null, gotovina: number, staffId?: string) {
  return klic(orgId, '/api/pos/izmena', { method: 'POST', body: JSON.stringify({ akcija: 'odpri', device_id: deviceId, gotovina, staff_id: staffId }) });
}

export function zakljuciIzmeno(orgId: string, deviceId: string | null, izmenaId: string, presteta: number, staffId?: string) {
  return klic(orgId, '/api/pos/izmena', { method: 'POST', body: JSON.stringify({ akcija: 'zakljuci', device_id: deviceId, izmena_id: izmenaId, presteta, staff_id: staffId }) }) as
    Promise<{ zReportNumber: number; razlika: number; stats: NonNullable<StanjeIzmene['stats']>; zakljuceno: string }>;
}

export const eur = (n: number | null | undefined) => (Number(n || 0)).toFixed(2).replace('.', ',') + ' €';
