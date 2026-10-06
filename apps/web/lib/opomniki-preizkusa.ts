/**
 * OPOMNIKI PRED IZTEKOM PREIZKUSA (revizija paketov, migracija 182)
 *
 * Samo za preizkuse NOVIH organizacij (obstojeca_pravila = false - preizkus
 * se je zacel po objavi). Dva opomnika na organizacijo:
 *   '3d' - 3 dni pred iztekom (ce nocni cron izpade, se poslje do 1 dneva pred iztekom)
 *   '0d' - na dan izteka (okno 24 h pred in 24 h po izteku)
 * Vsak se poslje najvec enkrat (preizkus_opomnik_3d_ob / _0d_ob).
 */

const DAN = 86_400_000

export type OrgZaOpomnik = {
  id: string
  name: string | null
  trial_ends_at: string | null
  stripe_subscription_id: string | null
  obstojeca_pravila: boolean | null
  preizkus_opomnik_3d_ob: string | null
  preizkus_opomnik_0d_ob: string | null
}

export type Opomnik = '3d' | '0d'

export function opomnikZaOrg(o: OrgZaOpomnik, zdaj: Date = new Date()): Opomnik | null {
  if (o.obstojeca_pravila !== false) return null      // obstojece organizacije: nic novega
  if (!o.trial_ends_at || o.stripe_subscription_id) return null
  const doIzteka = new Date(o.trial_ends_at).getTime() - zdaj.getTime()
  if (!o.preizkus_opomnik_0d_ob && doIzteka <= DAN && doIzteka > -DAN) return '0d'
  if (!o.preizkus_opomnik_3d_ob && !o.preizkus_opomnik_0d_ob && doIzteka <= 3 * DAN && doIzteka > DAN) return '3d'
  return null
}

export function besediloOpomnika(o: Pick<OrgZaOpomnik, 'name' | 'trial_ends_at'>, vrsta: Opomnik, appUrl: string) {
  const konec = new Date(o.trial_ends_at!).toLocaleString('sl-SI', {
    timeZone: 'Europe/Ljubljana', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const zadeva = vrsta === '3d'
    ? 'Vaš brezplačni preizkus Računka se izteče čez 3 dni'
    : 'Vaš brezplačni preizkus Računka: danes je dan izteka'
  const besedilo = [
    `Pozdravljeni${o.name ? `, ${o.name}` : ''}!`,
    '',
    `Brezplačni preizkus paketa Pro + POS se izteče ${konec}.`,
    'Po izteku vaš račun preide na brezplačni paket: funkcije paketa se zaklenejo, vsi podatki in izdani računi pa ostanejo shranjeni in dostopni.',
    '',
    `Paket izberete v Nastavitve → Naročnina: ${appUrl}/nastavitve?razdelek=plan`,
    // Stripe Checkout odlozi placilo samo, ce je do izteka vec kot 48 ur.
    ...(vrsta === '3d' ? ['Če paket izberete vsaj 2 dni pred iztekom, se plačilo zaračuna šele ob izteku preizkusa.'] : []),
    '',
    'Ekipa Računko',
  ].join('\n')
  return { zadeva, besedilo }
}
