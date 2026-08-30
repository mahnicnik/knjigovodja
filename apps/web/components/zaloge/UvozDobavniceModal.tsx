'use client'

import React, { useState } from 'react'

/**
 * UVOZ DOBAVNICE V ZALOGO PORTALA (26.8.2026)
 *
 * DVA KORAKA, ne eden. Dokument razclenimo in pokazemo PREDLOG, ki ga
 * uporabnik potrdi.
 *
 * ZAKAJ: dobavnice se berejo napacno pogosteje, kot bi si clovek mislil -
 * zlite vrstice, popusti v drugem stolpcu, cene z DDV in brez. Tiho
 * spreminjanje zaloge bi bilo tezko opaziti, napacna zaloga pa se ob koncu
 * leta prenese v knjige.
 */
export default function UvozDobavniceModal({ orgId, onClose, onDone }: any) {
  const [korak, setKorak] = useState<'izbira' | 'berem' | 'predlog' | 'uvazam'>('izbira')
  const [napaka, setNapaka] = useState<string | null>(null)
  const [podatki, setPodatki] = useState<any>(null)
  const [izbrani, setIzbrani] = useState<Record<number, boolean>>({})

  async function naloziDatoteko(f: File) {
    setNapaka(null)
    setKorak('berem')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1])
        r.onerror = () => rej(new Error('Datoteke ni bilo mogoče prebrati.'))
        r.readAsDataURL(f)
      })

      const res = await fetch('/api/zaloge/uvoz-dobavnice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, fileBase64: base64, mediaType: f.type }),
      })
      const d = await res.json()
      if (!res.ok) { setNapaka(d?.error || 'Dokumenta ni bilo mogoče obdelati.'); setKorak('izbira'); return }

      setPodatki(d)
      // Privzeto so izbrani VSI - uporabnik odznaci tiste, ki jih noce.
      const zac: Record<number, boolean> = {}
      d.artikli.forEach((_: any, i: number) => { zac[i] = true })
      setIzbrani(zac)
      setKorak('predlog')
    } catch (e: any) {
      setNapaka(e?.message || 'Napaka pri branju datoteke.')
      setKorak('izbira')
    }
  }

  async function uvozi() {
    setKorak('uvazam')
    setNapaka(null)
    const zaUvoz = podatki.artikli.filter((_: any, i: number) => izbrani[i])
    try {
      const res = await fetch('/api/zaloge/uvoz-dobavnice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, potrdi: true, artikli: zaUvoz }),
      })
      const d = await res.json()
      if (!res.ok) { setNapaka(d?.error || 'Uvoz ni uspel.'); setKorak('predlog'); return }
      onDone(d)
    } catch (e: any) {
      setNapaka(e?.message || 'Uvoz ni uspel.')
      setKorak('predlog')
    }
  }

  const stIzbranih = Object.values(izbrani).filter(Boolean).length

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,20,18,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 720,
        maxHeight: '85vh', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, flex: 1, color: '#0D1F12' }}>📄 Uvoz dobavnice</div>
          <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {napaka && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FDECEC', color: '#A83232', fontSize: 13, marginBottom: 14 }}>
            {napaka}
          </div>
        )}

        {korak === 'izbira' && (
          <>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.65, marginBottom: 16 }}>
              Naložite dobavnico ali račun dobavitelja. Podprti sta <strong>datoteka PDF</strong> in
              <strong> fotografija</strong> — dobavnico na papirju lahko preprosto slikate.
              Artikle bomo prebrali in vam jih pokazali v potrditev.
            </div>
            <label style={{
              display: 'block', padding: '28px 20px', borderRadius: 12, textAlign: 'center',
              border: '2px dashed rgba(0,0,0,0.15)', cursor: 'pointer', background: '#FAFAF8',
            }}>
              <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) naloziDatoteko(f) }}/>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📎</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>Izberite datoteko</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>PDF ali slika</div>
            </label>
          </>
        )}

        {korak === 'berem' && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#666', fontSize: 14 }}>
            Berem dokument…
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>To lahko traja nekaj sekund.</div>
          </div>
        )}

        {korak === 'predlog' && podatki && (
          <>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>
              {podatki.dobavitelj && <><strong>{podatki.dobavitelj}</strong>{' · '}</>}
              {podatki.stevilka && <>{podatki.stevilka}{' · '}</>}
              {podatki.datum}
              <div style={{ marginTop: 6 }}>
                Preverite podatke, preden potrdite. Odznačite artikle, ki jih ne želite uvoziti.
              </div>
            </div>

            <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              {podatki.artikli.map((a: any, i: number) => (
                <div key={i} onClick={() => setIzbrani(p => ({ ...p, [i]: !p[i] }))} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  background: izbrani[i] ? '#fff' : '#F7F7F5', opacity: izbrani[i] ? 1 : 0.55,
                }}>
                  <input type="checkbox" checked={!!izbrani[i]} readOnly style={{ pointerEvents: 'none' }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{a.naziv}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {a.kolicina} {a.enota || 'kos'}
                      {a.neto_cena_brez_ddv != null && ` · ${Number(a.neto_cena_brez_ddv).toFixed(4)} €/enoto`}
                      {a.sku && ` · ${a.sku}`}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
                    background: a.obstaja ? '#E1F5EE' : '#FFF4E0',
                    color: a.obstaja ? '#0E5E3B' : '#8a6a1f',
                  }}>
                    {a.obstaja ? `+${a.kolicina} (ima ${a.trenutna_zaloga})` : 'NOV'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={uvozi} disabled={stIzbranih === 0} style={{
                background: '#1D9E75', color: '#fff', border: 0, padding: '10px 18px',
                borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: stIzbranih ? 'pointer' : 'default', opacity: stIzbranih ? 1 : 0.5,
              }}>
                Uvozi {stIzbranih} {stIzbranih === 1 ? 'artikel' : stIzbranih === 2 ? 'artikla' : stIzbranih <= 4 ? 'artikle' : 'artiklov'}
              </button>
              <button onClick={onClose} style={{
                background: 'none', border: '1px solid rgba(0,0,0,0.12)', padding: '10px 16px',
                borderRadius: 9, fontSize: 13, cursor: 'pointer', color: '#666',
              }}>Prekliči</button>
            </div>
          </>
        )}

        {korak === 'uvazam' && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#666', fontSize: 14 }}>
            Uvažam…
          </div>
        )}
      </div>
    </div>
  )
}
