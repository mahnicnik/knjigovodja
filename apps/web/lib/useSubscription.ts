import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type SubscriptionStatus = 'free' | 'pro' | 'pro_pos' | 'cancelled'

interface Subscription {
  status: SubscriptionStatus
  isPro: boolean
  isProPos: boolean
  isFree: boolean
  canSendEmail: boolean
  canUseFurs: boolean
  canUsePos: boolean
  invoiceLimit: number | null // null = neomejeno
  loading: boolean
}

const DEFAULT: Subscription = {
  status: 'free',
  isPro: false,
  isProPos: false,
  isFree: true,
  canSendEmail: false,
  canUseFurs: false,
  canUsePos: false,
  invoiceLimit: 5,
  loading: true,
}

export function useSubscription(): Subscription {
  const [sub, setSub] = useState<Subscription>(DEFAULT)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSub({ ...DEFAULT, loading: false })
        return
      }

      const { data: member } = await supabase
        .from('org_members')
        .select('organizations(subscription_status)')
        .eq('user_id', user.id)
        .maybeSingle()

      const status = (member as any)?.organizations?.subscription_status as SubscriptionStatus || 'free'

      const isPro = status === 'pro' || status === 'pro_pos'
      const isProPos = status === 'pro_pos'

      setSub({
        status,
        isPro,
        isProPos,
        isFree: status === 'free' || status === 'cancelled',
        canSendEmail: isPro,
        canUseFurs: isPro,
        canUsePos: isProPos,
        invoiceLimit: isPro ? null : 5,
        loading: false,
      })
    }

    load()
  }, [])

  return sub
}
