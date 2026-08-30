'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * RAZVELJAVITEV MNOŽIČNE SPREMEMBE CEN (prelet 161)
 * ═════════════════════════════════════════════════
 *
 * Pokaže zadnjih pet potegov in dovoli vrnitev tistega, ki še ni bil
 * razveljavljen. Brez tega bi bila edina pot po napačnem potegu ročno
 * popravljanje vseh zadetih artiklov — pri stotih artiklih ura dela in
 * nova priložnost za napako.
 *
 * VRAČAMO SAMO ARTIKLE, KI SE OD POTEGA NISO SPREMENILI. Če je bila cena
 * med tem ročno popravljena, je novejši podatek uporabnikov in ga tiho
 * povoziti bi bilo hujše od nepopolne vrnitve — takega artikla ne
 * povrnemo in to izrecno povemo.
 */
export default function ZgodovinaCen({ posData, T }: { posData: any; T: any }) {
  const [serije, setSerije] = useState<any[]>([])
  const [delam, setDelam] = useState<string | null>(null)
  const [sporocilo, setSporocilo] = useState<string | null>(null)

  async function nalozi() {
    const { data } = await createClient()
      .from('price_change_batches')
      .select('*')
      .order('applied_at', { ascending: false })
      .limit(5)
    setSerije(data || [])
  }
  useEffect(() => { nalozi() }, [])

  async function razveljavi(serija: any) {
    if (!confirm(`Vrniti cene pred spremembo z dne ${new Date(serija.applied_at).toLocaleString('sl-SI')}?\n\n` +
                 `Zadetih je bilo ${serija.items_count} artiklov.`)) return
    setDelam(serija.id); setSporocilo(null)
    try {
      const db = createClient()
      const { data: vrstice, error } = await db
        .from('price_change_items').select('*').eq('batch_id', serija.id)
      if (error) throw new Error(error.message)

      let vrnjenih = 0, preskocenih = 0
      for (const v of (vrstice || [])) {
        // Vrnemo le, ce je cena se vedno tista, ki jo je postavil ta poteg.
        const { data: zadetek } = await db.from('items')
          .update({ price: v.old_price, updated_at: new Date().toISOString() })
          .eq('id', v.item_id).eq('price', v.new_price).select('id')
        if (zadetek && zadetek.length > 0) vrnjenih++; else preskocenih++
      }
      await db.from('price_change_batches')
        .update({ reverted_at: new Date().toISOString() }).eq('id', serija.id)

      setSporocilo(`Vrnjenih ${vrnjenih} cen.` +
        (preskocenih > 0
          ? ` ${preskocenih} artiklov ni bilo vrnjenih, ker je bila cena med tem ročno spremenjena — ta novejši podatek je ostal nedotaknjen.`
          : ''))
      await nalozi()
      posData.refresh()
    } catch (e: any) {
      setSporocilo('Razveljavitev ni uspela: ' + (e?.message || e))
    }
    setDelam(null)
  }

  if (serije.length === 0) return null

  return (
    <div style={{ marginTop: 22, padding: 16, background: T.surface, borderRadius: 12,
      border: '1px solid ' + T.line }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Zadnje spremembe cen</div>

      {sporocilo && (
        <div style={{ padding: '10px 12px', background: T.surface2, borderRadius: 8,
          fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 }}>{sporocilo}</div>
      )}

      {serije.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '9px 0', borderTop: '1px solid ' + T.line, fontSize: 12.5 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {s.change_type === 'percent'
                ? `${s.change_value > 0 ? '+' : ''}${s.change_value} %`
                : `${s.change_value > 0 ? '+' : ''}${Number(s.change_value).toFixed(2).replace('.', ',')} €`}
              {' · '}{s.scope_label} · {s.items_count} artiklov
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {new Date(s.applied_at).toLocaleString('sl-SI')}
              {s.reverted_at && ' · razveljavljeno ' + new Date(s.reverted_at).toLocaleString('sl-SI')}
            </div>
          </div>
          {!s.reverted_at && (
            <button onClick={() => razveljavi(s)} disabled={delam === s.id}
              style={{ padding: '6px 12px', borderRadius: 7, border: '0.5px solid ' + T.line,
                background: 'transparent', color: T.ink, fontSize: 11.5, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer' }}>
              {delam === s.id ? 'Vračam…' : 'Razveljavi'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
