'use client'

/**
 * PRELET 331: urejevalnik logotipa pred nalaganjem.
 *
 *  - obrezovanje: povleci okvir (premik), vogale (velikost) ali nov okvir
 *  - "Samodejno obreži": odreze prazne (prozorne ali bele) robove
 *  - zasuk za 90°
 *  - "Belo ozadje naredi prozorno": bele piksle spremeni v prozorne
 *
 * Vse se zgodi v brskalniku (canvas); rezultat je PNG, pomanjsan na najvec
 * 1200 x 600 px, ki gre skozi obstojece nalaganje (/api/nastavitve/logotip).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type Okvir = { x: number; y: number; w: number; h: number }
type Vlek = { nacin: 'nov' | 'premik' | 'vogal'; vogal?: 0 | 1 | 2 | 3; zacX: number; zacY: number; okvir: Okvir } | null

const PLATNO_W = 560
const PLATNO_H = 320
const NAJVEC_VIR = 2400      // daljsa stranica za obdelavo
const IZHOD_W = 1200
const IZHOD_H = 600
const ROCAJ = 9

const jeBel = (r: number, g: number, b: number) => r > 242 && g > 242 && b > 242

export default function LogotipUrejevalnik({ vir, onPreklic, onShrani }: {
  vir: Blob
  onPreklic: () => void
  onShrani: (png: Blob) => Promise<void> | void
}) {
  const platno = useRef<HTMLCanvasElement>(null)
  const [slika, setSlika] = useState<HTMLImageElement | null>(null)
  const [zasuk, setZasuk] = useState(0)            // 0..3 x 90°
  const [brezBele, setBrezBele] = useState(false)
  const [baza, setBaza] = useState<HTMLCanvasElement | null>(null)
  const [okvir, setOkvir] = useState<Okvir | null>(null)
  const [vlek, setVlek] = useState<Vlek>(null)
  const [shranjujem, setShranjujem] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)

  // 1) Nalozi sliko
  useEffect(() => {
    const url = URL.createObjectURL(vir)
    const img = new Image()
    img.onload = () => setSlika(img)
    img.onerror = () => setNapaka('Slike ni mogoče odpreti.')
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [vir])

  // 2) Osnova: zasuk + (neobvezno) belo -> prozorno, pomanjsano na NAJVEC_VIR
  useEffect(() => {
    if (!slika) return
    const f = Math.min(1, NAJVEC_VIR / Math.max(slika.naturalWidth, slika.naturalHeight))
    const sw = Math.max(1, Math.round(slika.naturalWidth * f))
    const sh = Math.max(1, Math.round(slika.naturalHeight * f))
    const pokonci = zasuk % 2 === 1
    const c = document.createElement('canvas')
    c.width = pokonci ? sh : sw
    c.height = pokonci ? sw : sh
    const ctx = c.getContext('2d')!
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((zasuk * Math.PI) / 2)
    ctx.drawImage(slika, -sw / 2, -sh / 2, sw, sh)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (brezBele) {
      const d = ctx.getImageData(0, 0, c.width, c.height)
      const p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const min = Math.min(p[i], p[i + 1], p[i + 2])
        // mehak prehod: 230..250 postopoma prozorno (brez nazobcanih robov)
        if (min >= 250) p[i + 3] = 0
        else if (min > 230) p[i + 3] = Math.round(p[i + 3] * (250 - min) / 20)
      }
      ctx.putImageData(d, 0, 0)
    }
    setBaza(c)
    setOkvir(o => (o && o.x + o.w <= c.width && o.y + o.h <= c.height) ? o : { x: 0, y: 0, w: c.width, h: c.height })
  }, [slika, zasuk, brezBele])

  const merilo = baza ? Math.min(PLATNO_W / baza.width, PLATNO_H / baza.height, 1) : 1
  const odmikX = baza ? (PLATNO_W - baza.width * merilo) / 2 : 0
  const odmikY = baza ? (PLATNO_H - baza.height * merilo) / 2 : 0

  // 3) Izris
  useEffect(() => {
    const c = platno.current
    if (!c || !baza || !okvir) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, PLATNO_W, PLATNO_H)
    // sahovnica = prozorno
    for (let y = 0; y < PLATNO_H; y += 10) for (let x = 0; x < PLATNO_W; x += 10) {
      ctx.fillStyle = ((x + y) / 10) % 2 === 0 ? '#f2f2f2' : '#ffffff'
      ctx.fillRect(x, y, 10, 10)
    }
    ctx.drawImage(baza, odmikX, odmikY, baza.width * merilo, baza.height * merilo)
    // zaokrozeno - sicer med zatemnjenimi pasovi ostane svetla crta
    const ox = Math.round(odmikX + okvir.x * merilo), oy = Math.round(odmikY + okvir.y * merilo), ow = Math.round(okvir.w * merilo), oh = Math.round(okvir.h * merilo)
    ctx.fillStyle = 'rgba(13,31,18,0.45)'
    ctx.fillRect(0, 0, PLATNO_W, oy)
    ctx.fillRect(0, oy + oh, PLATNO_W, PLATNO_H - oy - oh)
    ctx.fillRect(0, oy, ox, oh)
    ctx.fillRect(ox + ow, oy, PLATNO_W - ox - ow, oh)
    ctx.strokeStyle = '#1D9E75'
    ctx.lineWidth = 2
    ctx.strokeRect(ox, oy, ow, oh)
    ctx.fillStyle = '#1D9E75'
    for (const [vx, vy] of [[ox, oy], [ox + ow, oy], [ox, oy + oh], [ox + ow, oy + oh]]) ctx.fillRect(vx - ROCAJ / 2, vy - ROCAJ / 2, ROCAJ, ROCAJ)
  }, [baza, okvir, merilo, odmikX, odmikY])

  const vSliko = useCallback((e: React.PointerEvent) => {
    const r = platno.current!.getBoundingClientRect()
    const px = (e.clientX - r.left) * (PLATNO_W / r.width)
    const py = (e.clientY - r.top) * (PLATNO_H / r.height)
    return { x: (px - odmikX) / merilo, y: (py - odmikY) / merilo, px, py }
  }, [merilo, odmikX, odmikY])

  const omeji = (o: Okvir): Okvir => {
    if (!baza) return o
    let { x, y, w, h } = o
    if (w < 0) { x += w; w = -w }
    if (h < 0) { y += h; h = -h }
    x = Math.max(0, Math.min(x, baza.width - 1)); y = Math.max(0, Math.min(y, baza.height - 1))
    w = Math.max(4, Math.min(w, baza.width - x)); h = Math.max(4, Math.min(h, baza.height - y))
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
  }

  function dol(e: React.PointerEvent) {
    if (!okvir) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const t = vSliko(e)
    const vogali: [number, number][] = [[okvir.x, okvir.y], [okvir.x + okvir.w, okvir.y], [okvir.x, okvir.y + okvir.h], [okvir.x + okvir.w, okvir.y + okvir.h]]
    const blizu = vogali.findIndex(([vx, vy]) => Math.abs(vx - t.x) * merilo < 12 && Math.abs(vy - t.y) * merilo < 12)
    if (blizu >= 0) setVlek({ nacin: 'vogal', vogal: blizu as 0 | 1 | 2 | 3, zacX: t.x, zacY: t.y, okvir })
    else if (t.x > okvir.x && t.x < okvir.x + okvir.w && t.y > okvir.y && t.y < okvir.y + okvir.h) setVlek({ nacin: 'premik', zacX: t.x, zacY: t.y, okvir })
    else setVlek({ nacin: 'nov', zacX: t.x, zacY: t.y, okvir: { x: t.x, y: t.y, w: 0, h: 0 } })
  }

  function premik(e: React.PointerEvent) {
    if (!vlek || !baza) return
    const t = vSliko(e)
    const dx = t.x - vlek.zacX, dy = t.y - vlek.zacY
    const o = vlek.okvir
    if (vlek.nacin === 'nov') setOkvir(omeji({ x: vlek.zacX, y: vlek.zacY, w: dx, h: dy }))
    else if (vlek.nacin === 'premik') setOkvir({
      ...o,
      x: Math.round(Math.max(0, Math.min(o.x + dx, baza.width - o.w))),
      y: Math.round(Math.max(0, Math.min(o.y + dy, baza.height - o.h))),
    })
    else {
      // nasprotni vogal ostane na mestu
      const x2 = o.x + o.w, y2 = o.y + o.h
      const levo = vlek.vogal === 0 || vlek.vogal === 2
      const gor = vlek.vogal === 0 || vlek.vogal === 1
      const nx = levo ? o.x + dx : o.x, ny = gor ? o.y + dy : o.y
      const nx2 = levo ? x2 : x2 + dx, ny2 = gor ? y2 : y2 + dy
      setOkvir(omeji({ x: nx, y: ny, w: nx2 - nx, h: ny2 - ny }))
    }
  }

  function samodejnoObrezi() {
    if (!baza) return
    const ctx = baza.getContext('2d')!
    const { data, width, height } = ctx.getImageData(0, 0, baza.width, baza.height)
    let x1 = width, y1 = height, x2 = -1, y2 = -1
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 16 || jeBel(data[i], data[i + 1], data[i + 2])) continue
      if (x < x1) x1 = x; if (x > x2) x2 = x
      if (y < y1) y1 = y; if (y > y2) y2 = y
    }
    if (x2 < 0) return
    const rob = Math.round(Math.max(x2 - x1, y2 - y1) * 0.02)   // 2 % zraka
    setOkvir(omeji({ x: x1 - rob, y: y1 - rob, w: x2 - x1 + 1 + 2 * rob, h: y2 - y1 + 1 + 2 * rob }))
  }

  async function shrani() {
    if (!baza || !okvir) return
    setShranjujem(true); setNapaka(null)
    try {
      let f = Math.min(1, IZHOD_W / okvir.w, IZHOD_H / okvir.h)
      for (let poskus = 0; poskus < 4; poskus++) {
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(okvir.w * f))
        c.height = Math.max(1, Math.round(okvir.h * f))
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(baza, okvir.x, okvir.y, okvir.w, okvir.h, 0, 0, c.width, c.height)
        const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/png'))
        if (!blob) throw new Error('Slike ni bilo mogoče pripraviti.')
        if (blob.size <= 1.9 * 1024 * 1024) { await onShrani(blob); return }
        f *= 0.7
      }
      setNapaka('Slika je tudi po pomanjšanju prevelika.')
    } catch (e: any) {
      setNapaka(e?.message || 'Shranjevanje ni uspelo.')
    } finally {
      setShranjujem(false)
    }
  }

  const gumb: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 620, maxHeight: '100%', overflow: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Uredi logotip</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Povlecite okvir ali njegove vogale, da logotip obrežete. Sivo območje ne bo na računu.</div>
        <canvas ref={platno} width={PLATNO_W} height={PLATNO_H}
          onPointerDown={dol} onPointerMove={premik} onPointerUp={() => setVlek(null)} onPointerCancel={() => setVlek(null)}
          style={{ width: '100%', height: 'auto', borderRadius: 10, border: '1px solid #eee', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 8px' }}>
          <button type="button" style={gumb} onClick={samodejnoObrezi}>✂️ Samodejno obreži robove</button>
          <button type="button" style={gumb} onClick={() => baza && setOkvir({ x: 0, y: 0, w: baza.width, h: baza.height })}>Celotna slika</button>
          <button type="button" style={gumb} onClick={() => { setOkvir(null); setZasuk(z => (z + 1) % 4) }}>↻ Zavrti</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#333', cursor: 'pointer' }}>
          <input type="checkbox" checked={brezBele} onChange={e => setBrezBele(e.target.checked)} />
          Belo ozadje naredi prozorno
        </label>
        {okvir && <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Izrez: {okvir.w} × {okvir.h} px</div>}
        {napaka && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 8 }}>{napaka}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" style={gumb} disabled={shranjujem} onClick={onPreklic}>Prekliči</button>
          <button type="button" disabled={shranjujem || !okvir} onClick={shrani}
            style={{ ...gumb, background: '#0D1F12', color: '#fff', border: 0, opacity: shranjujem ? 0.6 : 1 }}>
            {shranjujem ? 'Shranjujem…' : 'Shrani logotip'}
          </button>
        </div>
      </div>
    </div>
  )
}
