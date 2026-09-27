'use client'

/**
 * PRELET 330: nalaganje logotipa, ki se izpise na racunih (e-posta in PDF).
 * PRELET 331: urejevalnik (obrezovanje, zasuk, belo -> prozorno) in izbira,
 * kje in kako velik je logotip na racunu ter ali je tudi v e-posti.
 */
import { useRef, useState } from 'react'
import LogotipUrejevalnik from './LogotipUrejevalnik'

type Nastavitve = { polozaj: 'levo' | 'sredina' | 'desno'; velikost: 'majhen' | 'srednji' | 'velik'; vEposti: boolean }
const PRIVZETO: Nastavitve = { polozaj: 'levo', velikost: 'srednji', vEposti: true }
const VISINA_PREDOGLED = { majhen: 16, srednji: 24, velik: 34 }

function zacetne(n: any): Nastavitve {
  const o = n && typeof n === 'object' ? n : {}
  return {
    polozaj: ['levo', 'sredina', 'desno'].includes(o.polozaj) ? o.polozaj : PRIVZETO.polozaj,
    velikost: ['majhen', 'srednji', 'velik'].includes(o.velikost) ? o.velikost : PRIVZETO.velikost,
    vEposti: typeof o.vEposti === 'boolean' ? o.vEposti : PRIVZETO.vEposti,
  }
}

export default function Logotip({ orgId, logoUrl, logoNastavitve, imePodjetja, onSpremeni }: {
  orgId: string
  logoUrl: string | null
  logoNastavitve?: any
  imePodjetja?: string
  onSpremeni?: (url: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(logoUrl)
  const [nast, setNast] = useState<Nastavitve>(zacetne(logoNastavitve))
  const [urejam, setUrejam] = useState<Blob | null>(null)
  const [dela, setDela] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)
  const [shranjeno, setShranjeno] = useState(false)
  const vnos = useRef<HTMLInputElement>(null)

  function izberi(f: File) {
    setNapaka(null)
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setNapaka('Podprta sta formata PNG in JPG.'); return }
    if (f.size > 15 * 1024 * 1024) { setNapaka('Slika je prevelika (največ 15 MB pred urejanjem).'); return }
    setUrejam(f)   // najprej urejevalnik - tam se tudi pomanjsa pod 2 MB
    if (vnos.current) vnos.current.value = ''
  }

  async function urediObstojecega() {
    setNapaka(null); setDela(true)
    try {
      const res = await fetch(`/api/nastavitve/logotip?orgId=${encodeURIComponent(orgId)}`)
      if (!res.ok) { setNapaka('Logotipa ni bilo mogoče odpreti.'); return }
      setUrejam(await res.blob())
    } finally {
      setDela(false)
    }
  }

  async function nalozi(png: Blob) {
    const fd = new FormData()
    fd.append('orgId', orgId)
    fd.append('datoteka', new File([png], 'logotip.png', { type: 'image/png' }))
    const res = await fetch('/api/nastavitve/logotip', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Nalaganje ni uspelo.')
    setUrl(d.logo_url); onSpremeni?.(d.logo_url)
    setUrejam(null)
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

  async function spremeni(sprememba: Partial<Nastavitve>) {
    const nova = { ...nast, ...sprememba }
    const prej = nast
    setNast(nova); setNapaka(null)
    const res = await fetch('/api/nastavitve/logotip', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, nastavitve: nova }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setNast(prej)
      const d = res ? await res.json().catch(() => ({})) : {}
      setNapaka((d as any).error || 'Nastavitve ni bilo mogoče shraniti.')
      return
    }
    setShranjeno(true); setTimeout(() => setShranjeno(false), 1500)
  }

  const gumb: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid #eee', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
  const izbira = (aktivno: boolean): React.CSSProperties => ({
    padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 0,
    background: aktivno ? '#0D1F12' : 'transparent', color: aktivno ? '#fff' : '#333', borderRadius: 7,
  })
  const skupina: React.CSSProperties = { display: 'inline-flex', gap: 2, padding: 3, background: '#F3F3F0', borderRadius: 9 }

  const logoPredogled = url && (
    <img src={url} alt="" style={{ height: VISINA_PREDOGLED[nast.velikost], maxWidth: nast.velikost === 'velik' ? 110 : 80, objectFit: 'contain', display: 'block' }} />
  )

  return (
    <div>
      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>Logotip na računih</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 160, height: 64, border: '1px dashed #ddd', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', overflow: 'hidden' }}>
          {url
            ? <img src={url} alt="Logotip" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 11, color: '#aaa' }}>Ni logotipa</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={dela} onClick={() => vnos.current?.click()}
            style={{ ...gumb, border: 0, background: '#0D1F12', color: '#fff', opacity: dela ? 0.6 : 1 }}>
            {url ? 'Zamenjaj' : 'Naloži logotip'}
          </button>
          {url && <button type="button" disabled={dela} onClick={urediObstojecega} style={gumb}>✂️ Uredi / obreži</button>}
          {url && <button type="button" disabled={dela} onClick={odstrani} style={{ ...gumb, color: '#DC2626' }}>Odstrani</button>}
        </div>
        <input ref={vnos} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) izberi(f) }} />
      </div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6, lineHeight: 1.5 }}>
        PNG ali JPG. Pred shranjevanjem ga lahko obrežete, zavrtite in odstranite belo ozadje.
      </div>

      {url && (
        <div style={{ marginTop: 14, padding: 14, border: '1px solid #f0f0f0', borderRadius: 12, background: '#FCFCFA' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Položaj na računu</div>
                <div style={skupina}>
                  {([['levo', 'Levo'], ['sredina', 'Na sredini'], ['desno', 'Desno']] as const).map(([v, t]) => (
                    <button key={v} type="button" style={izbira(nast.polozaj === v)} onClick={() => spremeni({ polozaj: v })}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Velikost</div>
                <div style={skupina}>
                  {([['majhen', 'Majhen'], ['srednji', 'Srednji'], ['velik', 'Velik']] as const).map(([v, t]) => (
                    <button key={v} type="button" style={izbira(nast.velikost === v)} onClick={() => spremeni({ velikost: v })}>{t}</button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#333', cursor: 'pointer' }}>
                <input type="checkbox" checked={nast.vEposti} onChange={e => spremeni({ vEposti: e.target.checked })} />
                Pokaži tudi na računu v e-pošti
              </label>
              {shranjeno && <div style={{ fontSize: 11, color: '#0E5E3B' }}>✓ Shranjeno</div>}
            </div>

            {/* Predogled glave racuna (pomanjsano) */}
            <div aria-label="Predogled računa" style={{ flex: '1 1 220px', minWidth: 220, maxWidth: 320, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              {nast.polozaj === 'sredina' && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{logoPredogled}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  {nast.polozaj === 'levo' && <div style={{ marginBottom: 6 }}>{logoPredogled}</div>}
                  <div style={{ fontSize: 9, fontWeight: 700 }}>{imePodjetja || 'Vaše podjetje'}</div>
                  <div style={{ width: 70, height: 3, background: '#eee', marginTop: 4 }} />
                  <div style={{ width: 55, height: 3, background: '#eee', marginTop: 3 }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  {nast.polozaj === 'desno' && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>{logoPredogled}</div>}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>RAČUN</div>
                  <div style={{ width: 50, height: 3, background: '#eee', marginTop: 4, marginLeft: 'auto' }} />
                </div>
              </div>
              <div style={{ height: 1, background: '#f0f0f0', margin: '10px 0' }} />
              <div style={{ width: '60%', height: 3, background: '#f0f0f0' }} />
              <div style={{ width: '40%', height: 3, background: '#f0f0f0', marginTop: 3 }} />
            </div>
          </div>
        </div>
      )}

      {napaka && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 6 }}>{napaka}</div>}
      {urejam && (
        <LogotipUrejevalnik vir={urejam} onPreklic={() => setUrejam(null)} onShrani={nalozi} />
      )}
    </div>
  )
}
