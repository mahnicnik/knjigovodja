'use client'

import React, { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/pos-client'

/**
 * MNOŽIČNA SPREMEMBA PRODAJNIH CEN (prelet 161)
 * ═════════════════════════════════════════════
 *
 * ZAKAJ OBSTAJA
 * ─────────────
 * Ob podražitvi dobavitelja je bilo treba odpreti vsak artikel posebej in
 * ročno vpisati novo ceno. Pri stotih artiklih to ni le zamudno — tam
 * nastanejo tipkarske napake, ki jih nihče ne opazi, dokler ne pride
 * napačen račun.
 *
 * ZAKAJ PREDOGLED IN NE TAKOJŠNJE PISANJE
 * ───────────────────────────────────────
 * Sprememba cene je nepovraten poseg v cenik, ki takoj vpliva na račune.
 * Zato se najprej izriše tabela "stara → nova" in šele nato potrdi. Mejni
 * primeri (najcenejši in najdražji artikel) so vidni, preden se karkoli
 * zapiše.
 *
 * ZAOKROŽEVANJE
 * ─────────────
 * Brez njega bi kava za 1,80 € po petih odstotkih stala 1,89 €. Zato so na
 * voljo cent, 5 centov, 10 centov in "lepa cena" (končnica ,90 ali ,50).
 *
 * RAZVELJAVITEV
 * ─────────────
 * Vsak poteg je ena serija v `price_change_batches`, vsak zadet artikel pa
 * vrstica s staro in novo ceno. Napačen poteg se zato vrne z enim klikom —
 * sicer bi bila edina pot ročno popravljanje vseh artiklov.
 */

type Artikel = {
  id: string; name: string; price: number
  vat_rate?: number; category_id?: string; archived?: boolean
}

const ZAOKROZEVANJA = [
  { id: 'cent',   label: 'Na cent (0,01)' },
  { id: 'r05',    label: 'Na 5 centov' },
  { id: 'r10',    label: 'Na 10 centov' },
  { id: 'lepa',   label: 'Lepa cena (,90 ali ,50)' },
]

function zaokrozi(cena: number, nacin: string): number {
  if (cena <= 0) return 0
  if (nacin === 'r05')  return Math.round(cena * 20) / 20
  if (nacin === 'r10')  return Math.round(cena * 10) / 10
  if (nacin === 'lepa') {
    // Navzgor na najbližjo končnico ,50 ali ,90 — v lokalu je to cena,
    // ki jo gost pričakuje, in olajša vračanje drobiža.
    const cel = Math.floor(cena)
    const ost = cena - cel
    if (ost <= 0.50) return cel + 0.50
    if (ost <= 0.90) return cel + 0.90
    return cel + 1.50
  }
  return Math.round(cena * 100) / 100
}

export default function MnozicneCene({
  posData, T, onClose, cashierId,
}: { posData: any; T: any; onClose: () => void; cashierId?: string | null }) {
  const [obseg, setObseg] = useState<'vsi' | 'kategorija'>('vsi')
  const [kategorija, setKategorija] = useState<string>('')
  const [vrsta, setVrsta] = useState<'odstotek' | 'znesek'>('odstotek')
  const [vrednost, setVrednost] = useState('')
  const [nacinZaokr, setNacinZaokr] = useState('cent')
  const [brezOproscenih, setBrezOproscenih] = useState(true)
  const [delam, setDelam] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)
  const [uspeh, setUspeh] = useState<string | null>(null)

  const kategorije = (posData.categories || []).filter((c: any) => c.id !== 'all')

  const predogled = useMemo(() => {
    const v = parseFloat(String(vrednost).replace(',', '.'))
    if (isNaN(v) || v === 0) return []
    const izbrani = (posData.items || []).filter((it: Artikel) => {
      if (it.archived) return false
      if (obseg === 'kategorija' && it.category_id !== kategorija) return false
      if (brezOproscenih && Number(it.vat_rate ?? 22) === 0) return false
      return true
    })
    return izbrani.map((it: Artikel) => {
      const stara = Number(it.price || 0)
      const surova = vrsta === 'odstotek' ? stara * (1 + v / 100) : stara + v
      const nova = Math.max(0, zaokrozi(surova, nacinZaokr))
      return { ...it, stara, nova, razlika: Math.round((nova - stara) * 100) / 100 }
    }).filter((r: any) => r.nova !== r.stara)
  }, [posData.items, obseg, kategorija, vrsta, vrednost, nacinZaokr, brezOproscenih])

  const skupnaRazlika = predogled.reduce((s: number, r: any) => s + r.razlika, 0)

  async function uveljavi() {
    if (predogled.length === 0) return
    setDelam(true); setNapaka(null)
    try {
      const db = createClient()
      // BUSINESS_ID je ziva vezava, ki jo resolveBusinessId() nastavi glede
      // na aktivno organizacijo - zanesljivejse od branja iz prvega artikla,
      // ki bi ob praznem seznamu dalo undefined.
      const v = parseFloat(String(vrednost).replace(',', '.'))

      // 1) Serija NAJPREJ — če se kasneje kaj zalomi, je vsaj zapisano,
      //    kaj se je poskušalo spremeniti.
      const { data: serija, error: sErr } = await db
        .from('price_change_batches')
        .insert({
          business_id: BUSINESS_ID,
          applied_by: cashierId ?? null,
          scope: obseg,
          scope_label: obseg === 'kategorija'
            ? (kategorije.find((c: any) => c.id === kategorija)?.name || 'kategorija')
            : 'vsi aktivni artikli',
          change_type: vrsta === 'odstotek' ? 'percent' : 'amount',
          change_value: v,
          rounding: nacinZaokr,
          items_count: predogled.length,
        })
        .select('id')
        .single()
      if (sErr) throw new Error('Serije ni bilo mogoče zapisati: ' + sErr.message)

      const { error: vErr } = await db.from('price_change_items').insert(
        predogled.map((r: any) => ({
          batch_id: serija.id, item_id: r.id, item_name: r.name,
          old_price: r.stara, new_price: r.nova,
        }))
      )
      if (vErr) throw new Error('Starih cen ni bilo mogoče zabeležiti: ' + vErr.message)

      // 2) Šele zdaj same cene. Vsak artikel svoj zapis — ena poizvedba za
      //    vse ni mogoča, ker ima vsak svojo ceno.
      const napake: string[] = []
      for (const r of predogled) {
        const { error } = await db.from('items')
          .update({ price: r.nova, updated_at: new Date().toISOString() })
          .eq('id', r.id)
        if (error) napake.push(r.name + ': ' + error.message)
      }
      if (napake.length > 0) {
        throw new Error(`Spremenjenih ${predogled.length - napake.length} od ${predogled.length}. ` +
          `Ni uspelo: ${napake.slice(0, 3).join('; ')}`)
      }

      setUspeh(`Spremenjenih ${predogled.length} cen. Poteg lahko razveljavite v zavihku Artikli.`)
      posData.refresh()
    } catch (e: any) {
      setNapaka(e?.message || 'Napaka pri spremembi cen')
    }
    setDelam(false)
  }

  const vnos: any = {
    width: '100%', padding: '9px 11px', borderRadius: 8,
    border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, fontFamily: 'inherit',
  }
  const oznaka: any = { fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: 22, maxHeight: '78vh', overflowY: 'auto' }}>
      {uspeh ? (
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{uspeh}</div>
          <button onClick={onClose} style={{ marginTop: 14, padding: '10px 22px', borderRadius: 9,
            border: 0, background: T.accent, color: '#fff', fontWeight: 700, fontSize: 13,
            fontFamily: 'inherit', cursor: 'pointer' }}>Zapri</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={oznaka}>Kateri artikli</label>
              <select value={obseg} onChange={e => setObseg(e.target.value as any)} style={vnos}>
                <option value="vsi">Vsi aktivni artikli</option>
                <option value="kategorija">Samo ena kategorija</option>
              </select>
            </div>
            <div>
              <label style={oznaka}>Kategorija</label>
              <select value={kategorija} disabled={obseg !== 'kategorija'}
                onChange={e => setKategorija(e.target.value)}
                style={{ ...vnos, opacity: obseg === 'kategorija' ? 1 : 0.5 }}>
                <option value="">— izberite —</option>
                {kategorije.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={oznaka}>Način</label>
              <select value={vrsta} onChange={e => setVrsta(e.target.value as any)} style={vnos}>
                <option value="odstotek">Odstotek (%)</option>
                <option value="znesek">Znesek (€)</option>
              </select>
            </div>
            <div>
              <label style={oznaka}>Za koliko {vrsta === 'odstotek' ? '(npr. 5 ali −3)' : '(npr. 0,10)'}</label>
              <input value={vrednost} onChange={e => setVrednost(e.target.value)}
                placeholder={vrsta === 'odstotek' ? '5' : '0,10'} style={vnos} inputMode="decimal"/>
            </div>
            <div>
              <label style={oznaka}>Zaokroži</label>
              <select value={nacinZaokr} onChange={e => setNacinZaokr(e.target.value)} style={vnos}>
                {ZAOKROZEVANJA.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
            color: T.ink, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={brezOproscenih}
              onChange={e => setBrezOproscenih(e.target.checked)}/>
            Izpusti artikle z 0 % DDV (oproščene storitve)
          </label>

          {/* PREDOGLED — brez njega bi bila potrditev ugibanje. */}
          {predogled.length > 0 ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                Predogled: {predogled.length} artiklov
                <span style={{ color: T.muted, fontWeight: 500 }}>
                  {' '}· skupna razlika {skupnaRazlika >= 0 ? '+' : ''}
                  {skupnaRazlika.toFixed(2).replace('.', ',')} € na kos vseh artiklov
                </span>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid ' + T.line,
                borderRadius: 9, marginBottom: 16 }}>
                {predogled.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 12px', borderBottom: '1px solid ' + T.line, fontSize: 12.5 }}>
                    <div style={{ flex: 1 }}>{r.name}</div>
                    <div style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {r.stara.toFixed(2).replace('.', ',')} €
                    </div>
                    <div style={{ opacity: 0.4 }}>→</div>
                    <div style={{ fontWeight: 700, minWidth: 58, textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums' }}>
                      {r.nova.toFixed(2).replace('.', ',')} €
                    </div>
                    <div style={{ minWidth: 54, textAlign: 'right', fontSize: 11.5,
                      color: r.razlika >= 0 ? '#1f6b3a' : '#A83232', fontVariantNumeric: 'tabular-nums' }}>
                      {r.razlika >= 0 ? '+' : ''}{r.razlika.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '18px 14px', background: T.surface2, borderRadius: 9,
              fontSize: 12.5, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Vnesite spremembo — spodaj se bo izpisalo, katere cene se bodo spremenile in kako.
              Dokler tega ne potrdite, se v ceniku ne spremeni nič.
            </div>
          )}

          {napaka && (
            <div style={{ padding: '10px 12px', background: 'rgba(168,50,50,0.08)', color: '#A83232',
              borderRadius: 8, fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>{napaka}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={delam} style={{ padding: '10px 18px', borderRadius: 9,
              border: '0.5px solid ' + T.line, background: 'transparent', color: T.ink,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              Prekliči
            </button>
            <button onClick={uveljavi} disabled={delam || predogled.length === 0}
              style={{ padding: '10px 18px', borderRadius: 9, border: 0,
                background: predogled.length ? T.accent : T.line, color: '#fff',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: predogled.length ? 'pointer' : 'default', opacity: delam ? 0.6 : 1 }}>
              {delam ? 'Spreminjam…' : `Spremeni ${predogled.length} cen`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
