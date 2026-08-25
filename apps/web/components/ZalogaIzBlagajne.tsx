'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * ZALOGA IZ BLAGAJNE V PORTALU (25.8.2026)
 *
 * Portal in blagajna sta imela LOČENI zalogi — v portalu 1 artikel, v
 * blagajni 123. Ob koncu leta ni bilo od kod dobiti popisa za racunovodkinjo.
 *
 * Ta komponenta bere zalogo NEPOSREDNO iz blagajne (artikli + surovine),
 * torej se podatki ne podvajajo in ne moreta razhajati.
 *
 * POPIS je nekaj drugega od prikaza: racunovodkinja potrebuje stanje na
 * DOLOCEN DAN. Zaloga se spreminja z vsako prodajo, zato se ob izdelavi
 * popisa kolicine in cene PREPISEJO in zamrznejo — poznejse prodaje jih ne
 * spreminjajo vec.
 */

interface Vrstica {
  vir: 'item' | 'ingredient'
  id: string
  ime: string
  enota: string | null
  kolicina: number
  nabavna: number | null
  vrednost: number
  kategorija: string | null
}

export default function ZalogaIzBlagajne({ orgId, businessId }: { orgId: string; businessId: string }) {
  const [vrstice, setVrstice] = useState<Vrstica[]>([])
  const [nalagam, setNalagam] = useState(true)
  const [popisi, setPopisi] = useState<any[]>([])
  const [delam, setDelam] = useState(false)
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [sporocilo, setSporocilo] = useState<string | null>(null)

  async function nalozi() {
    const db = createClient()
    const [artRes, surRes, popRes] = await Promise.all([
      db.from('items')
        .select('id, name, unit, stock, cost_price, item_type')
        .eq('business_id', businessId).eq('archived', false),
      db.from('ingredients')
        .select('id, name, unit, stock_qty, cost_price')
        .eq('business_id', businessId),
      db.from('inventory_snapshots')
        .select('id, snapshot_date, total_value, line_count, note, created_at')
        .eq('org_id', orgId).order('snapshot_date', { ascending: false }).limit(10),
    ])

    const v: Vrstica[] = []

    for (const a of (artRes.data || [])) {
      // Artikli z NORMATIVOM nimajo lastne zaloge — odstevajo se njihove
      // sestavine, zato bi jih steli dvakrat.
      if (a.item_type === 'recipe') continue
      if (a.stock === null || a.stock === undefined) continue
      const kol = Number(a.stock)
      const cena = a.cost_price === null || a.cost_price === undefined ? null : Number(a.cost_price)
      v.push({
        vir: 'item', id: a.id, ime: a.name, enota: a.unit || 'kos',
        kolicina: kol, nabavna: cena,
        vrednost: cena !== null ? Math.round(kol * cena * 100) / 100 : 0,
        kategorija: 'Artikli',
      })
    }

    for (const s of (surRes.data || [])) {
      const kol = Number(s.stock_qty ?? 0)
      const cena = s.cost_price === null || s.cost_price === undefined ? null : Number(s.cost_price)
      v.push({
        vir: 'ingredient', id: s.id, ime: s.name, enota: s.unit || 'kos',
        kolicina: kol, nabavna: cena,
        vrednost: cena !== null ? Math.round(kol * cena * 100) / 100 : 0,
        kategorija: 'Surovine',
      })
    }

    v.sort((a, b) => (a.kategorija || '').localeCompare(b.kategorija || '') || a.ime.localeCompare(b.ime))
    setVrstice(v)
    setPopisi(popRes.data || [])
    setNalagam(false)
  }

  useEffect(() => { if (businessId) nalozi() }, [businessId])

  const skupaj = vrstice.reduce((s, r) => s + r.vrednost, 0)
  const brezCene = vrstice.filter(r => r.nabavna === null || r.nabavna === 0).length

  async function naredipopis() {
    if (vrstice.length === 0) { setSporocilo('Ni česa popisati.'); return }
    if (!confirm(
      `Naredim popis na dan ${new Date(datum).toLocaleDateString('sl-SI')}?\n\n`
      + `${vrstice.length} postavk, skupna vrednost ${eur(skupaj)}.\n\n`
      + 'Količine in cene se zamrznejo — poznejše prodaje jih ne spremenijo.'
    )) return

    setDelam(true); setSporocilo(null)
    const db = createClient()
    const { data: glava, error: gErr } = await db.from('inventory_snapshots').insert({
      org_id: orgId, business_id: businessId, snapshot_date: datum,
      total_value: Math.round(skupaj * 100) / 100, line_count: vrstice.length,
    }).select('id').single()

    if (gErr) { setSporocilo('Popisa ni bilo mogoče shraniti: ' + gErr.message); setDelam(false); return }

    const { error: lErr } = await db.from('inventory_snapshot_lines').insert(
      vrstice.map(r => ({
        snapshot_id: glava.id, source: r.vir, source_id: r.id,
        name: r.ime, unit: r.enota, quantity: r.kolicina,
        cost_price: r.nabavna, value: r.vrednost, category: r.kategorija,
      }))
    )
    if (lErr) {
      // Glava brez postavk je slabsa od nicesar - odstranimo jo.
      await db.from('inventory_snapshots').delete().eq('id', glava.id)
      setSporocilo('Postavk popisa ni bilo mogoče shraniti: ' + lErr.message)
      setDelam(false); return
    }

    setSporocilo(`✓ Popis na dan ${new Date(datum).toLocaleDateString('sl-SI')} je shranjen.`)
    setDelam(false)
    nalozi()
  }

  async function izvozi(popisId: string, datumPopisa: string) {
    const db = createClient()
    const { data } = await db.from('inventory_snapshot_lines')
      .select('name, unit, quantity, cost_price, value, category')
      .eq('snapshot_id', popisId).order('category').order('name')

    const glava = ['Kategorija', 'Naziv', 'Enota', 'Količina', 'Nabavna cena', 'Vrednost']
    const vrsticeCsv = (data || []).map(r => [
      r.category ?? '', r.name, r.unit ?? '',
      String(r.quantity ?? 0).replace('.', ','),
      r.cost_price === null ? '' : String(r.cost_price).replace('.', ','),
      String(r.value ?? 0).replace('.', ','),
    ])
    const skupajV = (data || []).reduce((s, r) => s + Number(r.value || 0), 0)
    vrsticeCsv.push(['', 'SKUPAJ', '', '', '', skupajV.toFixed(2).replace('.', ',')])

    // Podpicje in BOM, da se v Excelu odpre pravilno s sumniki.
    const csv = '\uFEFF' + [glava, ...vrsticeCsv]
      .map(v => v.map(p => `"${String(p).replace(/"/g, '""')}"`).join(';')).join('\n')

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `popis-zalog-${datumPopisa}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const eur = (n: number) => Number(n || 0).toFixed(2).replace('.', ',') + ' €'
  const dat = (d: string) => new Date(d).toLocaleDateString('sl-SI')

  if (nalagam) return <div style={{ color: '#888', fontSize: 13, padding: 16 }}>Nalagam zalogo iz blagajne…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12' }}>📦 Zaloga iz blagajne</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {vrstice.length} postavk · skupna vrednost <strong>{eur(skupaj)}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13 }}/>
          <button onClick={naredipopis} disabled={delam}
            style={{ padding: '9px 16px', borderRadius: 8, border: 0, background: '#0D1F12', color: '#fff', fontSize: 13, fontWeight: 600, cursor: delam ? 'wait' : 'pointer' }}>
            {delam ? 'Delam…' : 'Naredi popis'}
          </button>
        </div>
      </div>

      {brezCene > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(184,140,40,0.1)', border: '1px solid rgba(184,140,40,0.3)', fontSize: 12, lineHeight: 1.55, color: '#8A5A00', marginBottom: 14 }}>
          <strong>{brezCene}</strong> {brezCene === 1 ? 'postavka nima' : 'postavk nima'} nabavne cene, zato
          {brezCene === 1 ? ' se ne šteje' : ' se ne štejejo'} v vrednost zaloge. Dopolnite jih v blagajni,
          sicer bo popis prenizek.
        </div>
      )}

      {sporocilo && (
        <div style={{ padding: '10px 12px', borderRadius: 9, background: '#E1F5EE', color: '#0E5E3B', fontSize: 13, marginBottom: 14 }}>
          {sporocilo}
        </div>
      )}

      <div style={{ maxHeight: 320, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F7F6F2', position: 'sticky', top: 0 }}>
              <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 600 }}>Naziv</th>
              <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 600 }}>Količina</th>
              <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 600 }}>Nabavna</th>
              <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 600 }}>Vrednost</th>
            </tr>
          </thead>
          <tbody>
            {vrstice.map(r => (
              <tr key={r.vir + r.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '8px 12px' }}>
                  {r.ime}
                  <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>{r.kategorija}</span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {r.kolicina} {r.enota}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: r.nabavna ? '#0D1F12' : '#C08A00', fontVariantNumeric: 'tabular-nums' }}>
                  {r.nabavna ? eur(r.nabavna) : 'ni cene'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {eur(r.vrednost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popisi.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Shranjeni popisi</div>
          {popisi.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 9, background: '#F7F6F2', marginBottom: 6, fontSize: 12, gap: 10 }}>
              <span>
                <strong>{dat(p.snapshot_date)}</strong>
                <span style={{ color: '#888', marginLeft: 8 }}>{p.line_count} postavk · {eur(p.total_value)}</span>
              </span>
              <button onClick={() => izvozi(p.id, p.snapshot_date)}
                style={{ padding: '6px 12px', borderRadius: 7, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ Za računovodkinjo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
