'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/pos-client'
import { lokalniDatum } from '@/lib/tax-constants'

/**
 * SEZNAM OPRAVIL V OKNIH BLAGAJNE (26.8.2026)
 *
 * Isti seznam kot na zaslonu "Opravila", vendar prikazan TAM, KJER SE DELO
 * DEJANSKO ZGODI: ob odpiranju in ob zaključku blagajne.
 *
 * ZAKAJ: loceni zaslon je treba odpreti namenoma, in prav to je tisto, kar
 * se v gneci ne zgodi. Okno za odpiranje pa blagajnik odpre tako ali tako.
 *
 * NE BLOKIRA. Ce opravila niso koncana, na to opozorimo, zaklepanja pa ni -
 * blagajne ni mogoce ne odpreti ne zapreti zaradi nepobrisanega saka.
 */
export default function OpravilaVOknu({
  faza,
  T,
  auth,
  onStanje,
}: {
  faza: 'open' | 'close'
  T: any
  auth?: any
  onStanje?: (koncano: number, skupaj: number) => void
}) {
  const [opravila, setOpravila] = useState<any[]>([])
  const [opravljeno, setOpravljeno] = useState<Record<string, any>>({})
  const [nalagam, setNalagam] = useState(true)
  const danes = lokalniDatum(new Date())

  async function nalozi() {
    const db = createClient()
    const [t, c] = await Promise.all([
      db.from('pos_tasks').select('*')
        .eq('business_id', BUSINESS_ID).eq('active', true).eq('phase', faza).order('sort_order'),
      db.from('pos_task_completions').select('task_id, done_at')
        .eq('business_id', BUSINESS_ID).eq('shift_date', danes),
    ])
    const seznam = t.data || []
    const zemljevid: Record<string, any> = {}
    ;(c.data || []).forEach((x: any) => { zemljevid[x.task_id] = x })
    setOpravila(seznam)
    setOpravljeno(zemljevid)
    setNalagam(false)
    onStanje?.(seznam.filter(o => zemljevid[o.id]).length, seznam.length)
  }

  useEffect(() => { nalozi() }, [faza])

  async function preklopi(t: any) {
    // POPRAVLJENO (26.8.2026): napaka se je TIHO POZRLA - klik ni naredil nic
    // in ni povedal, zakaj. Vzrok je bila manjkajoca povezava med `done_by`
    // in `staff`, zaradi katere je padla poizvedba z `staff(name)`: vpis je
    // uspel, branje pa ne, zato je kvadratek ostal prazen.
    const db = createClient()
    const { error } = opravljeno[t.id]
      ? await db.from('pos_task_completions').delete().eq('task_id', t.id).eq('shift_date', danes)
      : await db.from('pos_task_completions').insert({
          task_id: t.id, business_id: BUSINESS_ID, shift_date: danes,
          done_by: auth?.user?.id ?? null,
        })
    if (error) { alert('Opravila ni bilo mogoče označiti: ' + error.message); return }
    nalozi()
  }

  if (nalagam) return null
  if (opravila.length === 0) return null   // brez opravil okna ne obremenjujemo

  const koncano = opravila.filter(o => opravljeno[o.id]).length
  const vsa = koncano === opravila.length

  return (
    <div style={{
      margin: '0 0 16px', padding: '12px 14px', borderRadius: 10,
      background: vsa ? 'rgba(31,107,58,0.06)' : 'rgba(184,140,40,0.08)',
      border: '1px solid ' + (vsa ? 'rgba(31,107,58,0.25)' : 'rgba(184,140,40,0.28)'),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: vsa ? T?.accent : '#8a6a1f', flex: 1 }}>
          {faza === 'open' ? '🌅 Ob odpiranju' : '🌙 Ob zapiranju'}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: vsa ? T?.accent : '#8a6a1f' }}>
          {koncano} / {opravila.length}
        </div>
      </div>

      {opravila.map(t => {
        const c = opravljeno[t.id]
        return (
          <div key={t.id} onClick={() => preklopi(t)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer',
          }}>
            <div style={{
              width: 19, height: 19, borderRadius: 5, flexShrink: 0,
              border: '2px solid ' + (c ? T?.accent : 'rgba(0,0,0,0.2)'),
              background: c ? T?.accent : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12, fontWeight: 800,
            }}>{c ? '✓' : ''}</div>
            <div style={{
              fontSize: 12.5, flex: 1, color: T?.ink,
              textDecoration: c ? 'line-through' : 'none',
              opacity: c ? 0.55 : 1,
            }}>{t.title}</div>
          </div>
        )
      })}

      {!vsa && (
        <div style={{ fontSize: 10.5, color: '#8a6a1f', marginTop: 8, lineHeight: 1.5 }}>
          Neopravljeno vas ne ustavi — seznam je opomnik, ne pogoj.
        </div>
      )}
    </div>
  )
}
