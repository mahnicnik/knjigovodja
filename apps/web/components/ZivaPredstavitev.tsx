"use client"

/**
 * PRAVA APLIKACIJA NA ZACETNI STRANI (prelet 264)
 * ═══════════════════════════════════════════════
 *
 * ZAKAJ PRAVA IN NE POSNEMANA: prelet 261 je bil priblizek, narisan po
 * spominu. Priblizek izda sam sebe - razmiki so drugacni, pisave tudi, in
 * obiskovalec zacuti, da gleda skico. To je slabse od negibne slike.
 *
 * Tu tece PRAVA aplikacija v predstavitvenem podjetju "Kavarna Lipa", z
 * njenim cenikom, mizami in 155 racuni prometa. Obiskovalec klika po njej,
 * kot bi bila njegova - ker je res ista koda.
 *
 * HITROST: okvir se NE nalozi ob prikazu strani, ampak sele ob kliku.
 * Aplikacija je velika in bi zamaknila prvo, kar obiskovalec vidi - prav to
 * pa iskalniki merijo. Do klika stoji negiben posnetek.
 *
 * POMANJSAVA: aplikacija je zasnovana za sirino okoli 1400 pik. V okvir jo
 * spravimo s `transform: scale`, sirino pa vnaprej povecamo, da po pomanjsavi
 * zapolni prostor. Brez tega bi se v ozkem okvirju prelomila kot na telefonu.
 *
 * VAROVALKA: racuni v tem podjetju dobijo LAZNE kode (DEMO-) in se NE
 * prijavijo pri FURS - to je urejeno v bazi, ne tukaj.
 */

import { useState } from 'react'

export default function ZivaPredstavitev() {
  const [tece, setTece] = useState(false)

  return (
    <div style={{ marginTop:40 }}>
      <div style={{
        borderRadius:16, overflow:'hidden', background:'#0B1A10',
        boxShadow:'0 40px 80px -30px rgba(14,61,42,0.45)',
      }}>
        {/* Naslovna vrstica brskalnika — enaka v obeh stanjih, da ob kliku
            ne skoci. */}
        <div style={{ height:38, background:'#091410', display:'flex', alignItems:'center',
                      padding:'0 14px', position:'relative', flexShrink:0 }}>
          <div style={{ display:'inline-flex', gap:6 }}>
            {[0,1,2].map(i => (
              <i key={i} style={{ width:11, height:11, borderRadius:'50%',
                                  background:'rgba(255,255,255,0.16)' }}/>
            ))}
          </div>
          <div style={{ position:'absolute', left:'50%', transform:'translateX(-50%)',
                        fontFamily:"'JetBrains Mono',monospace", fontSize:'0.7rem',
                        color:'rgba(244,239,230,0.5)' }}>
            računko.si/pos
          </div>
        </div>

        <div style={{ position:'relative', height:560, background:'#F4EFE6' }}>
          {tece ? (
            <iframe
              src="/demo?kam=pos"
              title="Živa predstavitev Računka"
              style={{
                // Aplikacija je zasnovana za ~1400 pik. Narisemo jo v tej
                // sirini in pomanjsamo, da se ne prelomi v ozek razpored.
                width:'1400px',
                height:'800px',
                border:'none',
                transform:'scale(0.7)',
                transformOrigin:'top left',
                // 1400 * 0.7 = 980; okvir zapolnimo s sirino nadrejenega.
                position:'absolute',
                top:0, left:0,
              }}
            />
          ) : (
            <button onClick={() => setTece(true)}
              style={{
                width:'100%', height:'100%', border:'none', cursor:'pointer',
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', gap:16, fontFamily:'inherit',
                background:'linear-gradient(160deg,#F4EFE6 0%,#E8E1D2 100%)',
              }}>
              <div style={{
                width:64, height:64, borderRadius:'50%', background:'#0E3D2A',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 8px 24px rgba(14,61,42,0.3)',
              }}>
                <svg width="22" height="24" viewBox="0 0 22 24" fill="#F4EFE6">
                  <path d="M21 12L0 24V0z"/>
                </svg>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:'1.5rem',
                              color:'#0C2A1E', marginBottom:5 }}>
                  Zaženi živo predstavitev
                </div>
                <div style={{ fontSize:'0.9rem', color:'#3A4A40', maxWidth:400, lineHeight:1.6 }}>
                  Prava aplikacija s podatki izmišljene kavarne.
                  Brez registracije, brez e-pošte.
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      <p style={{ textAlign:'center', fontSize:'0.85rem', color:'#3A4A40', marginTop:14 }}>
        {tece ? (
          <>
            Klikajte po meniju levo — vse deluje.{' '}
            <a href="/demo?kam=pos" target="_blank" rel="noopener"
               style={{ color:'#0E3D2A', fontWeight:600 }}>Odpri v novem oknu →</a>
          </>
        ) : (
          <>Računi v predstavitvi niso davčno potrjeni. Podatki se vsako noč povrnejo.</>
        )}
      </p>
    </div>
  )
}
