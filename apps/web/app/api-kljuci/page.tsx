'use client'

/**
 * Tanka ovojnica (19.8.2026).
 *
 * Vsebina se je preselila v components/nastavitve/ApiKljuci.tsx in se prikazuje ZNOTRAJ /nastavitve —
 * enako kot razdelka "DDV & prispevki" in "Bančni podatki". Prej je bil vsak
 * razdelek svoja stran z drugačno glavo, gumbom "Nazaj" in ponekod celo brez
 * stranskega menija.
 *
 * Stran ostaja, da stari zaznamki, povezave iz vodiča in e-poštna sporočila
 * še vedno delujejo — preusmeri na pravi razdelek nastavitev.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Preusmeritev() {
  const router = useRouter()
  useEffect(() => { router.replace('/nastavitve?razdelek=api') }, [router])
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
      Preusmerjam na Nastavitve…
    </div>
  )
}
