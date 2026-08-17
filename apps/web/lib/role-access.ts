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
  // RAZSIRJENO (17.8.2026): racunovodja je prej videl samo koncni izvoz, ne pa
  // posameznih postavk. Pri delu potrebuje vpogled v KPO knjigo, izdane racune
  // in stroske - tudi zato, ker se promet iz banke in kartic ne shranjuje
  // loceno, ampak se zapise prav v KPO.
  accountant: ['/racunovodja', '/izvoz', '/invite', '/profil', '/kpo', '/invoices', '/expenses'],
  cashier: ['/pos', '/invite', '/profil'],
  viewer: ['/racunovodja', '/izvoz', '/pos', '/invite', '/profil'],
}

/**
 * Poti, ki so vlogi IZRECNO prepovedane, tudi ce jih pokriva dovoljena predpona.
 *
 * Zakaj je to potrebno: dovoljenja delujejo po predponah, zato bi '/invoices'
 * samodejno odprl tudi '/invoices/new' in '/invoices/edit' - torej ustvarjanje
 * in spreminjanje racunov. Racunovodja potrebuje VPOGLED, ne pisanja.
 * Prepovedi se preverijo PRED dovoljenji.
 */
export const ROLE_DENIED_PREFIXES: Record<string, string[]> = {
  accountant: ['/invoices/new', '/invoices/edit'],
  viewer: ['/invoices/new', '/invoices/edit'],
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

  // Prepovedi imajo prednost pred dovoljenji (glej ROLE_DENIED_PREFIXES).
  const denied = ROLE_DENIED_PREFIXES[role] ?? []
  if (denied.some((p) => pathname.startsWith(p))) return false

  return allowed.some((p) => pathname.startsWith(p))
}
