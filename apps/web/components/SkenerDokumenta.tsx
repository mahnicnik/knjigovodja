'use client'

import { useEffect, useRef, useState } from 'react'
import {
  homografija, preslikaj, urediKote, velikostIzKotov, obdelajDokument, vPdf,
  type Tocka,
} from '@/lib/skener'

/**
 * SKENER DOKUMENTA (19.8.2026)
 *
 * Prej se je fotografija poslala takšna, kot je nastala — pod kotom, s senco,
 * z mizo v ozadju. AI je slabše prebral podatke, listina v hrambi pa je bila
 * težko berljiva.
 *
 * Uporabnik povleče štiri kote čez rob računa, program pa dokument poravna,
 * kot bi bil slikan naravnost, odstrani senco in pobeli ozadje.
 */
export default function SkenerDokumenta({
  slikaDataUrl,
  onKoncano,
  onPreklic,
}: {
  slikaDataUrl: string
  /** Vrne obdelano sliko (JPEG dataURL) in PDF za hrambo. */
  onKoncano: (rezultat: { jpeg: string; pdf: Blob; sirina: number; visina: number }) => void
  onPreklic: () => void
}) {
  const platnoRef = useRef<HTMLCanvasElement>(null)
  const slikaRef = useRef<HTMLImageElement | null>(null)
  const [koti, setKoti] = useState<Tocka[]>([])
  const [vlecem, setVlecem] = useState<number | null>(null)
  const [obdelaj, setObdelaj] = useState(true)
  const [dela, setDela] = useState(false)
  const [napaka, setNapaka] = useState('')
  const [mere, setMere] = useState({ s: 0, v: 0, faktor: 1 })

  // Naloži sliko in postavi kote na privzeto lego (rahlo znotraj robov).
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      slikaRef.current = img
      const najvecjaSirina = Math.min(window.innerWidth - 32, 700)
      const faktor = Math.min(1, najvecjaSirina / img.width)
      const s = Math.round(img.width * faktor)
      const v = Math.round(img.height * faktor)
      setMere({ s, v, faktor })
      const o = Math.round(Math.min(s, v) * 0.06)
      setKoti([
        { x: o, y: o }, { x: s - o, y: o },
        { x: s - o, y: v - o }, { x: o, y: v - o },
      ])
    }
    img.onerror = () => setNapaka('Slike ni bilo mogoče naložiti.')
    img.src = slikaDataUrl
  }, [slikaDataUrl])

  // Izris slike s štirikotnikom in ročicami.
  useEffect(() => {
    const p = platnoRef.current
    const img = slikaRef.current
    if (!p || !img || koti.length !== 4) return
    const ctx = p.getContext('2d')
    if (!ctx) return

    p.width = mere.s
    p.height = mere.v
    ctx.drawImage(img, 0, 0, mere.s, mere.v)

    // Zatemni zunanjost izbora, da je jasno, kaj bo obrezano.
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.rect(0, 0, mere.s, mere.v)
    ctx.moveTo(koti[0].x, koti[0].y)
    for (let i = koti.length - 1; i >= 0; i--) ctx.lineTo(koti[i].x, koti[i].y)
    ctx.closePath()
    ctx.fill('evenodd')
    ctx.restore()

    ctx.strokeStyle = '#1D9E75'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(koti[0].x, koti[0].y)
    koti.slice(1).forEach(k => ctx.lineTo(k.x, k.y))
    ctx.closePath()
    ctx.stroke()

    koti.forEach(k => {
      ctx.beginPath()
      ctx.arc(k.x, k.y, 11, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = '#1D9E75'
      ctx.lineWidth = 3
      ctx.stroke()
    })
  }, [koti, mere])

  function lega(e: React.PointerEvent): Tocka {
    const r = platnoRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(mere.s, e.clientX - r.left)),
      y: Math.max(0, Math.min(mere.v, e.clientY - r.top)),
    }
  }

  function zacniVlecenje(e: React.PointerEvent) {
    const t = lega(e)
    let najblizji = 0, najmanj = Infinity
    koti.forEach((k, i) => {
      const d = Math.hypot(k.x - t.x, k.y - t.y)
      if (d < najmanj) { najmanj = d; najblizji = i }
    })
    // Prijemamo samo, če je klik blizu ročice — sicer bi vsak dotik premaknil kot.
    if (najmanj <= 40) {
      setVlecem(najblizji)
      platnoRef.current?.setPointerCapture(e.pointerId)
    }
  }

  function medVlecenjem(e: React.PointerEvent) {
    if (vlecem === null) return
    const t = lega(e)
    setKoti(prev => prev.map((k, i) => i === vlecem ? t : k))
  }

  async function potrdi() {
    const img = slikaRef.current
    if (!img) return
    setDela(true)
    setNapaka('')

    try {
      // Koti so v merilu prikaza — pretvorimo jih v merilo izvirne slike.
      const izvor = urediKote(koti).map(k => ({ x: k.x / mere.faktor, y: k.y / mere.faktor }))
      const { sirina, visina } = velikostIzKotov(izvor)

      // Omejimo velikost rezultata (AI in hramba ne rabita vec).
      const najvec = 1600
      const f = Math.min(1, najvec / Math.max(sirina, visina))
      const S = Math.max(1, Math.round(sirina * f))
      const V = Math.max(1, Math.round(visina * f))

      const cilj: Tocka[] = [{ x: 0, y: 0 }, { x: S, y: 0 }, { x: S, y: V }, { x: 0, y: V }]
      // Za vsak slikovni element rezultata potrebujemo OBRATNO preslikavo.
      const h = homografija(cilj, izvor)
      if (!h) {
        setNapaka('Kotov ni bilo mogoče uporabiti — premaknite jih tako, da tvorijo štirikotnik.')
        setDela(false)
        return
      }

      const vir = document.createElement('canvas')
      vir.width = img.width
      vir.height = img.height
      const vctx = vir.getContext('2d')!
      vctx.drawImage(img, 0, 0)
      const vhod = vctx.getImageData(0, 0, img.width, img.height)

      const izhod = document.createElement('canvas')
      izhod.width = S
      izhod.height = V
      const ictx = izhod.getContext('2d')!
      const rezultat = ictx.createImageData(S, V)

      for (let y = 0; y < V; y++) {
        for (let x = 0; x < S; x++) {
          const t = preslikaj(h, { x, y })
          const sx = Math.round(t.x), sy = Math.round(t.y)
          const ci = (y * S + x) * 4
          if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) {
            const vi = (sy * img.width + sx) * 4
            rezultat.data[ci] = vhod.data[vi]
            rezultat.data[ci + 1] = vhod.data[vi + 1]
            rezultat.data[ci + 2] = vhod.data[vi + 2]
            rezultat.data[ci + 3] = 255
          } else {
            rezultat.data[ci] = rezultat.data[ci + 1] = rezultat.data[ci + 2] = 255
            rezultat.data[ci + 3] = 255
          }
        }
      }

      if (obdelaj) obdelajDokument(rezultat.data, S, V)
      ictx.putImageData(rezultat, 0, 0)

      const jpeg = izhod.toDataURL('image/jpeg', 0.85)
      const pdf = await vPdf(jpeg, S, V)
      onKoncano({ jpeg, pdf, sirina: S, visina: V })
    } catch (e: any) {
      setNapaka('Obdelava ni uspela: ' + (e?.message || e))
    } finally {
      setDela(false)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #eee', padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Poravnaj račun</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.5 }}>
        Povlecite zelene točke na vogale računa. Vse zunaj bo odrezano.
      </div>

      <canvas
        ref={platnoRef}
        onPointerDown={zacniVlecenje}
        onPointerMove={medVlecenjem}
        onPointerUp={() => setVlecem(null)}
        style={{ width: '100%', maxWidth: mere.s, borderRadius: 10, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={obdelaj} onChange={e => setObdelaj(e.target.checked)} />
        Odstrani senco in pobeli ozadje
      </label>

      {napaka && (
        <div style={{ fontSize: 12, color: '#A32D2D', marginBottom: 10 }}>{napaka}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onPreklic} disabled={dela}
          style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Prekliči
        </button>
        <button onClick={potrdi} disabled={dela || koti.length !== 4}
          style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: '#0D1F12', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {dela ? 'Obdelujem…' : 'Skeniraj'}
        </button>
      </div>
    </div>
  )
}
