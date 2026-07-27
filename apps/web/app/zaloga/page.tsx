'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// POPRAVLJENO 26.7.2026 (audit portala K5): ta stran je prej hranila
// podatke SAMO v localStorage brskalnika (brez varnostne kopije, brez
// sinhronizacije med napravami). /zaloge (mnozinska, prava baza) pokriva
// isto funkcijo pravilno - ta stran je zdaj samo preusmeritev, da stari
// zaznamki/povezave ne pokazejo prazne/napacne strani.
export default function ZalogaRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/zaloge') }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
      Preusmerjam na Zaloge...
    </div>
  )
}
