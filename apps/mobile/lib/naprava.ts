/**
 * DAVCNA NAPRAVA TELEFONA (16.10.2026)
 *
 * Na trznici prodaja vec telefonov hkrati. Vsak mora racune izdajati pod
 * SVOJO oznako elektronske naprave (FURS: PROSTOR-NAPRAVA-stevilka). Prej
 * telefon naprave ni povedal in streznik je vzel privzeto - vsi telefoni so
 * bili ista naprava.
 *
 * Izbira se hrani na telefonu (AsyncStorage) loceno po podjetju. Ce ima
 * podjetje eno samo napravo za blagajno, se izbere sama (brez vprasanja).
 * Brez naprav ostane obnasanje kot doslej (streznik izbere privzeto).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface Naprava {
  id: string;            // electronic_devices.id
  oznaka: string;        // electronic_devices.device_id, npr. TEL1
  prostorId: string;     // business_premises.id
  prostorOznaka: string; // business_premises.premise_id, npr. STOJ1
  opis: string;          // naslov/opis prostora ali tip premicnega
}

const kljuc = (orgId: string) => `rk_naprava_${orgId}`;

/** Naprave podjetja, ki se smejo uporabiti na blagajni (kanal pos ali both). */
export async function napraveBlagajne(orgId: string): Promise<Naprava[]> {
  const [{ data: naprave }, { data: prostori }] = await Promise.all([
    supabase.from('electronic_devices').select('id, device_id, premise_id, channel, is_active')
      .eq('org_id', orgId).eq('is_active', true),
    supabase.from('business_premises').select('*').eq('org_id', orgId).eq('is_active', true),
  ]);
  const poId = new Map((prostori ?? []).map((p: any) => [p.id, p]));
  return (naprave ?? [])
    .filter((d: any) => d.channel !== 'web' && poId.has(d.premise_id))
    .map((d: any) => {
      const p: any = poId.get(d.premise_id);
      const opis = p.premise_type === 'movable'
        ? `Premični prostor ${p.movable_type ?? ''}${p.address ? ' · ' + p.address : ''}`
        : [p.address, p.city].filter(Boolean).join(', ');
      return { id: d.id, oznaka: d.device_id, prostorId: p.id, prostorOznaka: p.premise_id, opis };
    })
    .sort((a, b) => (a.prostorOznaka + a.oznaka).localeCompare(b.prostorOznaka + b.oznaka));
}

export async function preberiNapravo(orgId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(kljuc(orgId)); } catch { return null; }
}

export async function shraniNapravo(orgId: string, napravaId: string): Promise<void> {
  try { await AsyncStorage.setItem(kljuc(orgId), napravaId); } catch {}
}

/**
 * Trenutna naprava telefona za podjetje:
 *  - { naprava } - izbrana (ali edina) veljavna naprava
 *  - { izbira: true } - vec naprav, izbira manjka ali ni vec veljavna
 *  - { naprava: null } - podjetje nima naprav za blagajno (kot doslej)
 */
export async function trenutnaNaprava(orgId: string): Promise<{ naprava: Naprava | null; izbira?: boolean; vse: Naprava[] }> {
  const vse = await napraveBlagajne(orgId);
  if (vse.length === 0) return { naprava: null, vse };
  if (vse.length === 1) return { naprava: vse[0], vse };
  const shranjena = await preberiNapravo(orgId);
  const n = vse.find((x) => x.id === shranjena) ?? null;
  return n ? { naprava: n, vse } : { naprava: null, izbira: true, vse };
}
