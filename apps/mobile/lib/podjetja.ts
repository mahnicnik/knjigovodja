/**
 * IZBIRA PODJETJA V MOBILNI BLAGAJNI (16.10.2026)
 *
 * NAPAKA: uporabnik, ki je clan vec organizacij (npr. lastnik svoje in admin
 * pri stranki), je po prijavi vedno pristal v isti blagajni. _layout.tsx je
 * clanstvo bral z `.limit(1).single()` - brez vrstnega reda in brez izbire.
 *
 * Pravila (enako kot splet, apps/web/lib/active-org.ts):
 *  - clanstva urejena po datumu (najstarejse prvo),
 *  - izbira se hrani lokalno (tu AsyncStorage, na spletu localStorage),
 *  - shranjena izbira, ki ni vec med clanstvi, se pobrise,
 *  - racunovodja nima dostopa do blagajne (apps/web/lib/role-access.ts), zato
 *    se njegova clanstva v izbiri ne pokazejo - razen ce drugih ni (takrat
 *    aplikacija dela kot doslej).
 *
 * Z enim clanstvom se ne spremeni nic: brez zaslona za izbiro.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrgContext } from './auth';

const KLJUC = 'rk_active_org_id';

export interface Clanstvo {
  org_id: string;
  role: string;
  organizations: {
    id: string;
    name: string | null;
    pos_business_id: string | null;
    address: string | null;
    city: string | null;
    post_code: string | null;
    tax_number: string | null;
    iban: string | null;
  } | null;
}

/** Vloge brez dostopa do blagajne (splet: role-access.ts nima /pos za racunovodjo). */
const BREZ_BLAGAJNE = new Set(['accountant']);

/** Clanstva, med katerimi uporabnik izbira v blagajni. */
export function clanstvaZaBlagajno(vsa: Clanstvo[]): Clanstvo[] {
  const zBlagajno = vsa.filter((c) => !BREZ_BLAGAJNE.has(c.role));
  return zBlagajno.length > 0 ? zBlagajno : vsa;
}

/** Katero clanstvo odpreti brez vprasanja: edino, ali shranjeno, ce je se veljavno. */
export function izberiSamodejno(clanstva: Clanstvo[], shranjenId: string | null): Clanstvo | null {
  if (clanstva.length === 1) return clanstva[0];
  if (shranjenId) return clanstva.find((c) => c.org_id === shranjenId) ?? null;
  return null;
}

export function vKontekst(userId: string, c: Clanstvo): OrgContext {
  const org = c.organizations;
  return {
    userId,
    orgId: c.org_id,
    businessId: org?.pos_business_id || c.org_id,
    orgName: org?.name || '',
    role: c.role,
    org: {
      name: org?.name || '',
      address: org?.address || '',
      city: org?.city || '',
      post_code: org?.post_code || '',
      tax_number: org?.tax_number || '',
      iban: org?.iban || '',
    },
  };
}

export const IME_VLOGE: Record<string, string> = {
  owner: 'Lastnik',
  admin: 'Admin',
  cashier: 'Blagajnik',
  viewer: 'Gledalec',
  accountant: 'Računovodja',
};

export function imeVloge(role: string): string {
  return IME_VLOGE[role] ?? role;
}

export async function preberiIzbiro(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KLJUC);
  } catch {
    return null;
  }
}

export async function shraniIzbiro(orgId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KLJUC, orgId);
  } catch {}
}

export async function pobrisiIzbiro(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KLJUC);
  } catch {}
}
