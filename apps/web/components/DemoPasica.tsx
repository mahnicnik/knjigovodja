"use client"

/**
 * PASICA PREDSTAVITVENEGA NACINA (prelet 258)
 * ═══════════════════════════════════════════
 *
 * Obiskovalec mora VES CAS vedeti, da je v predstavitvi - sicer bo mislil,
 * da je odprl svoj racun, in se bo cudil, od kod tuji podatki.
 *
 * Pasica je hkrati poziv k dejanju: kdor je ravno videl, kako blagajna dela,
 * je najbolj pripravljen odpreti svoj racun. Gumb mora biti tam, ne dve
 * strani stran.
 *
 * Prikaze se SAMO predstavitvenemu uporabniku - preverjamo po e-naslovu, ne
 * po nastavitvi, ker mora biti to neodvisno od tega, kaj kdo nastavi.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function DemoPasica() {
  const [vidna, setVidna] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const e = data?.user?.email || ''
      setVidna(e.startsWith('demo@'))
    }).catch(() => {})
  }, [])

  if (!vidna) return null

  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
      background:'#0E3D2A', color:'#F7F6F2',
      padding:'10px 16px', display:'flex', alignItems:'center',
      justifyContent:'center', gap:14, flexWrap:'wrap',
      fontSize:13.5, boxShadow:'0 -2px 12px rgba(0,0,0,0.18)',
    }}>
      <span>
        <strong>Predstavitveni način.</strong>{' '}
        <span style={{ color:'#B9CFC3' }}>
          Računi niso davčno potrjeni. Podatki se vsako noč povrnejo.
        </span>
      </span>
      <a href="/register" style={{
        padding:'7px 16px', borderRadius:8, background:'#D89328',
        color:'#1A1A16', textDecoration:'none', fontWeight:700, fontSize:13,
      }}>Odpri svoj račun →</a>
    </div>
  )
}
