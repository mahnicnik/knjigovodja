'use client'

/**
 * PRELET 330: nalaganje logotipa, ki se izpise v glavi PDF racunov.
 */
import { useRef, useState } from 'react'

export default function Logotip({ orgId, logoUrl, onSpremeni }: { orgId: string; logoUrl: string | null; onSpremeni?: (url: string | null) => void }) {
  const [url, setUrl] = useState<string | null>(logoUrl)
  const [dela, setDela] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)
  const vnos = useRef<HTMLInputElement>(null)

  async function nalozi(f: File) {
    setNapaka(null)
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setNapaka('Podprta sta formata PNG in JPG.'); return }
    if (f.size > 2 * 1024 * 1024) { setNapaka('Slika je prevelika (največ 2 MB).'); return }
    setDela(true)
    try {
      const fd = new FormData()
      fd.append('orgId', orgId)
      fd.append('datoteka', f)
      const res = await fetch('/api/nastavitve/logotip', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setNapaka(d.error || 'Nalaganje ni uspelo.'); return }
      setUrl(d.logo_url); onSpremeni?.(d.logo_url)
    } catch (e: any) {
      setNapaka('Povezava ni uspela: ' + (e?.message || e))
    } finally {
      setDela(false)
      if (vnos.current) vnos.current.value = ''
    }
  }

  async function odstrani() {
    if (!confirm('Odstranim logotip? Računi bodo spet brez njega.')) return
    setDela(true); setNapaka(null)
    try {
      const res = await fetch(`/api/nastavitve/logotip?orgId=${encodeURIComponent(orgId)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setNapaka(d.error || 'Odstranitev ni uspela.'); return }
      setUrl(null); onSpremeni?.(null)
    } finally {
      setDela(false)
    }
  }

  return (
    <div>
      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>Logotip na računih</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 160, height: 64, border: '1px dashed #ddd', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', overflow: 'hidden' }}>
          {url
            ? <img src={url} alt="Logotip" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 11, color: '#aaa' }}>Ni logotipa</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={dela} onClick={() => vnos.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#0D1F12', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: dela ? 0.6 : 1 }}>
            {dela ? 'Nalagam…' : url ? 'Zamenjaj' : 'Naloži logotip'}
          </button>
          {url && (
            <button type="button" disabled={dela} onClick={odstrani}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #eee', background: '#fff', color: '#DC2626', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Odstrani
            </button>
          )}
        </div>
        <input ref={vnos} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) nalozi(f) }} />
      </div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6, lineHeight: 1.5 }}>
        PNG ali JPG, največ 2 MB. Najlepše izgleda ležeč logotip s prozornim ozadjem (PNG). Izpiše se na vrhu računa, ki ga stranka prejme po e-pošti, in v glavi PDF računa (tudi Stripe, obročni računi in predračuni za podaljšanje).
      </div>
      {napaka && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 6 }}>{napaka}</div>}
    </div>
  )
}
