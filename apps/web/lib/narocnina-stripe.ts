/**
 * NAROČNINA RAČUNKA IZ STRIPA (revizija paketov, 6.10.2026)
 *
 * Odlocitev, kaj webhook zapise v organizations, je tu - brez Stripa in
 * brez baze, da jo lahko testiramo (tests/paketi.spec.ts).
 *
 * Napake, ki jih to odpravlja (api/stripe/webhook):
 *  1. `customer.subscription.updated` je paket dolocil samo iz cene, ne
 *     glede na `status` - narocnina v stanju `unpaid` (vsi poskusi placila
 *     so padli) ali `incomplete_expired` je ostala Pro za vedno.
 *  2. Podatek se je vzel iz dogodka. Stripe dogodkov ne posilja nujno po
 *     vrsti: zakasnel `updated` po `deleted` je vrnil Pro. Zdaj webhook
 *     narocnino vedno prebere SVEZO iz Stripa, zato isti dogodek dvakrat ali
 *     v napacnem vrstnem redu da isti rezultat.
 *  3. `deleted` za STARO narocnino je prepisal organizacijo, ki ima ze novo.
 *  4. `checkout.session.completed` ni pocistil `trial_ends_at`.
 */

export type CeneStripe = { pro: string[]; proPos: string[] }

export type NarocninaStripe = {
  id: string
  status: string
  priceId: string | null
  /** unix sekunde */
  konecObdobja: number | null
}

export type OrgStripe = { id: string; stripe_subscription_id: string | null }

export type Odlocitev =
  | { tip: 'posodobi'; polja: Record<string, string | null> }
  | { tip: 'preskoci'; razlog: string }
  | { tip: 'napaka'; razlog: string }

/** Stanja, v katerih ima stranka dostop. past_due = Stripe se poskusa placilo (grace). */
const AKTIVNA = new Set(['active', 'trialing', 'past_due'])
/** Stanja, v katerih dostopa ni vec. */
const KONCANA = new Set(['canceled', 'unpaid', 'incomplete_expired', 'paused'])

export function paketIzCene(priceId: string | null, cene: CeneStripe): 'pro' | 'pro_pos' | null {
  if (!priceId) return null
  if (cene.proPos.filter(Boolean).includes(priceId)) return 'pro_pos'
  if (cene.pro.filter(Boolean).includes(priceId)) return 'pro'
  return null
}

export function odlociONarocnini(org: OrgStripe, sub: NarocninaStripe, cene: CeneStripe): Odlocitev {
  // Dogodek stare narocnine, ko ima organizacija ze drugo: ne dotikamo se.
  const drugaNarocnina = !!org.stripe_subscription_id && org.stripe_subscription_id !== sub.id

  if (KONCANA.has(sub.status)) {
    if (drugaNarocnina) return { tip: 'preskoci', razlog: `stara narocnina ${sub.id} (${sub.status}), org ima ${org.stripe_subscription_id}` }
    return { tip: 'posodobi', polja: { subscription_status: 'free', stripe_subscription_id: null, plan_expires_at: null } }
  }

  if (!AKTIVNA.has(sub.status)) {
    // 'incomplete': prvo placilo se caka (npr. 3D Secure) - paketa se ne dodeli.
    return { tip: 'preskoci', razlog: `narocnina ${sub.id} v stanju ${sub.status}` }
  }

  const paket = paketIzCene(sub.priceId, cene)
  if (!paket) {
    // Neznane cene ne ugibamo (prelet 212): napaka -> Stripe dogodek ponovi.
    return { tip: 'napaka', razlog: `neznana cena "${sub.priceId}" za narocnino ${sub.id}` }
  }

  return {
    tip: 'posodobi',
    polja: {
      subscription_status: paket,
      stripe_subscription_id: sub.id,
      // Placilo konca preizkus (sicer bi ga nocno opravilo vrnilo na free).
      trial_ends_at: null,
      plan_expires_at: sub.konecObdobja ? new Date(sub.konecObdobja * 1000).toISOString() : null,
    },
  }
}

/** Stripe je `current_period_end` premaknil na postavko narocnine - beremo obe mesti. */
type SurovaNarocnina = {
  id: string
  status: string
  current_period_end?: number | null
  items?: { data?: { price?: { id?: string } | null; current_period_end?: number | null }[] }
}

export function izStripeNarocnine(sub: SurovaNarocnina): NarocninaStripe {
  return {
    id: sub.id,
    status: sub.status,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    konecObdobja: sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null,
  }
}
