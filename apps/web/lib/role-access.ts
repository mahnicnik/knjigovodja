/**
 * Pravice po vlogah — EN sam vir resnice (Prelet 18, 17.8.2026).
 *
 * Zakaj obstaja: middleware.ts je pravilno omejeval, kam sme posamezna vloga,
 * AppLayout (stranski meni) pa tega ni upostevalo. Racunovodja je zato videl
 * CEL lastnikov meni - Blagajna, Nastavitve, Place, DDV - klik pa ga je vrgel
 * nazaj na /racunovodja. Videti je bilo kot pokvarjena aplikacija.
 *
 * Zdaj oba - middleware in meni - uporabljata te iste tabele.
 */

/** Predpone poti, ki jih sme obiskati posamezna vloga. */
export const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  accountant: ['/racunovodja', '/izvoz', '/invite', '/profil'],
  cashier: ['/pos', '/invite', '/profil'],
  viewer: ['/racunovodja', '/izvoz', '/pos', '/invite', '/profil'],
}

/** Kam preusmeriti vlogo, ce poskusa dostopati do poti, ki ji ni dovoljena. */
export const ROLE_HOME: Record<string, string> = {
  accountant: '/racunovodja',
  cashier: '/pos',
  viewer: '/racunovodja',
}

/**
 * Ali sme dana vloga na dano pot?
 * Vloge, ki niso navedene (owner, admin), smejo povsod.
 */
export function isPathAllowedForRole(pathname: string, role: string | null | undefined): boolean {
  if (!role) return true
  const allowed = ROLE_ALLOWED_PREFIXES[role]
  if (!allowed) return true // owner / admin — brez omejitev
  return allowed.some((p) => pathname.startsWith(p))
}
