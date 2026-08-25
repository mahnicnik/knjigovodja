'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * PREUSMERITEV (24.8.2026)
 *
 * Integracije so postale razdelek NASTAVITEV, tako kot Ekipa, API kljuci in
 * E-mail skeniranje. Vsebina zivi v `components/nastavitve/Integracije.tsx`.
 *
 * Ta stran ostaja, ker naslov `/integracije` ze obstaja v zaznamkih, v
 * povezavah na Dashboardu in v navodilih za Stripe. Namesto napake 404
 * uporabnika pelje na pravo mesto.
 */
export default function IntegracijePreusmeritev() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/nastavitve?razdelek=integracije')
  }, [router])

  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888', fontSize: 14 }}>
      Odpiram nastavitve…
    </div>
  )
}
