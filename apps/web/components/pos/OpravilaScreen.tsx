'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/pos-client'
import { lokalniDatum } from '@/lib/tax-constants'

/**
 * OPRAVILA IN SPOROČILA (26.8.2026)
 *
 * Tri stvari na enem zaslonu, ker odgovarjajo na isto vprasanje: "kaj moram
 * danes vedeti in narediti".
 *
 *   1. OPRAVILA po fazah izmene — odpiranje, med izmeno, zapiranje
 *   2. ODKLJUKANJE — kdo je kaj opravil in kdaj
 *   3. SPOROCILA lastnika osebju
 *
 * ZAKAJ SO ODKLJUKANJA V SVOJI TABELI: opravilo je ponavljajoce (vsak dan
 * isto), odkljukanje pa velja za EN dan. Ce bi "opravljeno" hranili na
 * opravilu, bi ga bilo treba vsako noc pobrisati - in ne bi vedeli, kdo je
 * kaj naredil prejsnji teden.
 */

const FAZE = [
  { id: 'open',  label: 'Odpiranje',   ikona: '🌅' },
  { id: 'shift', label: 'Med izmeno',  ikona: '⏱️' },
  { id: 'close', label: 'Zapiranje',   ikona: '🌙' },
] as const

/**
 * Hitri izbor najpogostejsih opravil (26.8.2026).
 *
 * Namen: prazen seznam je najvecja ovira - lastnik ga mora napolniti, preden
 * je funkcija sploh uporabna. Tole so opravila, ki so v gostinstvu in fitnesu
 * skoraj povsod enaka; klik jih doda, nato jih prilagodi.
 */
const PREDLOGE: Record<string, string[]> = {
  open: [
    'Prevzemi gotovino in odpri blagajno',
    'Preveri temperaturo hladilnikov',
    'Prižgi aparat za kavo in preveri vodo',
    'Preglej rezervacije za danes',
    'Pobriši šank in mize',
    'Preveri zalogo pijače v hladilniku',
    'Prezrači prostor',
    'Preveri čistočo garderob in sanitarij',
  ],
  shift: [
    'Dopolni hladilnik',
    'Preveri, ali so vsi termini označeni',
    'Preglej opomnike o karticah pred iztekom',
    'Odnesi steklenice v zabojnik',
    'Preveri papir v tiskalniku',
  ],
  close: [
    'Zaključi blagajno in preštej gotovino',
    'Natisni Z-poročilo',
    'Očisti aparat za kavo',
    'Pomij in pospravi kozarce',
    'Preveri, da so vsa okna zaprta',
    'Ugasni naprave in luči',
    'Preveri zaklenjenost vhoda',
    'Odnesi smeti',
  ],
}

export default function OpravilaScreen({ posData, auth }: any) {
  const T = posData?.T
  const [faza, setFaza] = useState<string>('open')
  const [zavihek, setZavihek] = useState<'opravila' | 'sporocila'>('opravila')
  const [opravila, setOpravila] = useState<any[]>([])
  const [opravljeno, setOpravljeno] = useState<Record<string, any>>({})
  const [sporocila, setSporocila] = useState<any[]>([])
  const [nalagam, setNalagam] = useState(true)
  const [novo, setNovo] = useState('')
  const [novoSporocilo, setNovoSporocilo] = useState('')
  // DODANO (26.8.2026): datum poteka in pripetost ze ob objavi. Polji v bazi
  // sta obstajali, obrazec ju ni ponujal.
  const [veljaDo, setVeljaDo] = useState('')
  const [pomembno, setPomembno] = useState(false)
  const [prikaziPredloge, setPrikaziPredloge] = useState(false)

  const danes = lokalniDatum(new Date())
  const jeLastnik = ['owner', 'lastnik', 'admin', 'manager']
    .includes(String(auth?.user?.role || '').toLowerCase())

  async function nalozi() {
    const db = createClient()
    const [t, c, m] = await Promise.all([
      db.from('pos_tasks').select('*').eq('business_id', BUSINESS_ID).eq('active', true).order('sort_order'),
      db.from('pos_task_completions').select('*, staff(name)').eq('business_id', BUSINESS_ID).eq('shift_date', danes),
      db.from('pos_messages').select('*').eq('business_id', BUSINESS_ID)
        .or(`expires_on.is.null,expires_on.gte.${danes}`)
        .order('pinned', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setOpravila(t.data || [])
    const zemljevid: Record<string, any> = {}
    ;(c.data || []).forEach((x: any) => { zemljevid[x.task_id] = x })
    setOpravljeno(zemljevid)
    setSporocila(m.data || [])
    setNalagam(false)
  }

  useEffect(() => { nalozi() }, [])

  async function preklopi(t: any) {
    const db = createClient()
    if (opravljeno[t.id]) {
      await db.from('pos_task_completions').delete().eq('task_id', t.id).eq('shift_date', danes)
    } else {
      await db.from('pos_task_completions').insert({
        task_id: t.id, business_id: BUSINESS_ID, shift_date: danes,
        done_by: auth?.user?.id ?? null,
      })
    }
    nalozi()
  }

  async function dodaj(naslov: string) {
    const besedilo = naslov.trim()
    if (!besedilo) return
    await createClient().from('pos_tasks').insert({
      business_id: BUSINESS_ID, title: besedilo, phase: faza,
      sort_order: opravila.filter(o => o.phase === faza).length,
      created_by: auth?.user?.id ?? null,
    })
    setNovo('')
    nalozi()
  }

  async function odstrani(id: string) {
    if (!confirm('Odstranim to opravilo?')) return
    await createClient().from('pos_tasks').update({ active: false }).eq('id', id)
    nalozi()
  }

  async function objavi() {
    const besedilo = novoSporocilo.trim()
    if (!besedilo) return
    await createClient().from('pos_messages').insert({
      business_id: BUSINESS_ID, body: besedilo,
      pinned: pomembno,
      expires_on: veljaDo || null,
      author_id: auth?.user?.id ?? null,
      author_name: auth?.user?.name ?? null,
    })
    setNovoSporocilo(''); setVeljaDo(''); setPomembno(false)
    nalozi()
  }

  async function pripni(m: any) {
    await createClient().from('pos_messages').update({ pinned: !m.pinned }).eq('id', m.id)
    nalozi()
  }

  async function izbrisiSporocilo(id: string) {
    if (!confirm('Izbrišem to sporočilo?')) return
    await createClient().from('pos_messages').delete().eq('id', id)
    nalozi()
  }

  const vFazi = opravila.filter(o => o.phase === faza)
  const koncanih = vFazi.filter(o => opravljeno[o.id]).length
  const ze = (id: string) => PREDLOGE[faza].filter(p => !opravila.some(o => o.title === p))

  if (nalagam) return <div style={{ padding: 24, color: T?.muted }}>Nalagam…</div>

  return (
    <div style={{ padding: '20px 24px', maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['opravila', 'sporocila'] as const).map(z => (
          <button key={z} onClick={() => setZavihek(z)} style={{
            padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
            border: '1px solid ' + (zavihek === z ? T?.accent : T?.line),
            background: zavihek === z ? T?.accentSoft : 'transparent',
            color: zavihek === z ? T?.accent : T?.ink,
          }}>
            {z === 'opravila' ? 'Opravila' : `Sporočila${sporocila.length ? ` (${sporocila.length})` : ''}`}
          </button>
        ))}
      </div>

      {zavihek === 'opravila' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {FAZE.map(f => {
              const vsa = opravila.filter(o => o.phase === f.id)
              const done = vsa.filter(o => opravljeno[o.id]).length
              const aktivna = faza === f.id
              return (
                <button key={f.id} onClick={() => setFaza(f.id)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid ' + (aktivna ? T?.accent : T?.line),
                  background: aktivna ? T?.accentSoft : T?.surface,
                  color: aktivna ? T?.accent : T?.ink, textAlign: 'left',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{f.ikona} {f.label}</div>
                  <div style={{ fontSize: 11, color: T?.muted, marginTop: 2 }}>
                    {vsa.length === 0 ? 'ni opravil' : `${done} / ${vsa.length}`}
                  </div>
                </button>
              )
            })}
          </div>

          {vFazi.length > 0 && (
            <div style={{ height: 5, borderRadius: 3, background: T?.surface3, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(koncanih / vFazi.length) * 100}%`,
                background: koncanih === vFazi.length ? T?.accent : T?.warn, transition: 'width .2s',
              }}/>
            </div>
          )}

          {vFazi.map(t => {
            const c = opravljeno[t.id]
            return (
              <div key={t.id} onClick={() => preklopi(t)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                background: c ? T?.accentSoft : T?.surface,
                border: '1px solid ' + (c ? T?.accent : T?.line),
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: '2px solid ' + (c ? T?.accent : T?.line),
                  background: c ? T?.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 800,
                }}>{c ? '✓' : ''}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500,
                    textDecoration: c ? 'line-through' : 'none',
                    opacity: c ? 0.6 : 1,
                  }}>{t.title}</div>
                  {c && (
                    <div style={{ fontSize: 11, color: T?.muted, marginTop: 2 }}>
                      {c.staff?.name || 'neznano'} · {new Date(c.done_at).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                {jeLastnik && (
                  <button onClick={e => { e.stopPropagation(); odstrani(t.id) }} style={{
                    background: 'none', border: 0, color: T?.muted, cursor: 'pointer', fontSize: 16, padding: 4,
                  }}>×</button>
                )}
              </div>
            )
          })}

          {vFazi.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', color: T?.muted, fontSize: 13 }}>
              Za to fazo ni opravil.
            </div>
          )}

          {jeLastnik && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid ' + T?.line }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={novo} onChange={e => setNovo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') dodaj(novo) }}
                  placeholder="Novo opravilo…"
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 13,
                    border: '1px solid ' + T?.line, fontFamily: 'inherit', background: T?.inputBg,
                  }}/>
                <button onClick={() => dodaj(novo)} style={{
                  padding: '9px 16px', borderRadius: 9, border: 0, cursor: 'pointer',
                  background: T?.brand, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}>Dodaj</button>
              </div>

              <button onClick={() => setPrikaziPredloge(!prikaziPredloge)} style={{
                background: 'none', border: 0, color: T?.accent, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit',
              }}>
                {prikaziPredloge ? '− Skrij pogosta opravila' : '+ Pogosta opravila za to fazo'}
              </button>

              {prikaziPredloge && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {ze(faza).length === 0
                    ? <div style={{ fontSize: 12, color: T?.muted }}>Vsa pogosta opravila so že dodana.</div>
                    : ze(faza).map(p => (
                      <button key={p} onClick={() => dodaj(p)} style={{
                        padding: '6px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                        border: '1px solid ' + T?.line, background: T?.surface, color: T?.ink,
                        fontFamily: 'inherit',
                      }}>+ {p}</button>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {zavihek === 'sporocila' && (
        <>
          {jeLastnik && (
            <div style={{ marginBottom: 18 }}>
              <textarea value={novoSporocilo} onChange={e => setNovoSporocilo(e.target.value)} rows={3}
                placeholder="Sporočilo za osebje…"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 13,
                  border: '1px solid ' + T?.line, fontFamily: 'inherit', boxSizing: 'border-box',
                  resize: 'vertical', background: T?.inputBg,
                }}/>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:10, flexWrap:'wrap' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', color:T?.ink }}>
                  <input type="checkbox" checked={pomembno} onChange={e=>setPomembno(e.target.checked)}/>
                  📌 Pomembno (na vrh)
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T?.muted }}>
                  Velja do
                  <input type="date" value={veljaDo} onChange={e=>setVeljaDo(e.target.value)}
                    style={{ padding:'4px 8px', borderRadius:7, border:'1px solid '+T?.line, fontSize:12, fontFamily:'inherit' }}/>
                </label>
              </div>
              <button onClick={objavi} disabled={!novoSporocilo.trim()} style={{
                marginTop: 8, padding: '9px 16px', borderRadius: 9, border: 0,
                cursor: novoSporocilo.trim() ? 'pointer' : 'default',
                background: T?.brand, color: '#fff', fontSize: 13, fontWeight: 600,
                opacity: novoSporocilo.trim() ? 1 : 0.5, fontFamily: 'inherit',
              }}>Objavi</button>
            </div>
          )}

          {sporocila.map(m => (
            <div key={m.id} style={{
              position: 'relative',
              padding: '18px 20px 14px',
              borderRadius: 14,
              marginBottom: 12,
              background: m.pinned ? '#FFF9EC' : T?.surface,
              border: '1px solid ' + (m.pinned ? 'rgba(184,140,40,0.35)' : T?.line),
              // Pripeto sporocilo dobi barvni rob na levi, da ga je mogoce
              // opaziti z drugega konca sanka (26.8.2026).
              borderLeft: m.pinned ? '4px solid #b88c28' : '1px solid ' + T?.line,
              boxShadow: m.pinned ? '0 2px 10px rgba(184,140,40,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {m.pinned && (
                <div style={{
                  position: 'absolute', top: -9, left: 16,
                  background: '#b88c28', color: '#fff',
                  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                  padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase',
                }}>📌 Pomembno</div>
              )}

              <div style={{
                fontSize: m.pinned ? 15.5 : 14.5,
                fontWeight: m.pinned ? 600 : 400,
                lineHeight: 1.65, whiteSpace: 'pre-wrap',
                color: T?.ink,
              }}>{m.body}</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: m.pinned ? '#b88c28' : T?.accent,
                  color: '#fff', fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {(m.author_name || 'L').trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: 11.5, color: T?.muted, flex: 1 }}>
                  <strong style={{ color: T?.ink }}>{m.author_name || 'Lastnik'}</strong>
                  {' · '}
                  {new Date(m.created_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' })}
                  {m.expires_on && ` · velja do ${new Date(m.expires_on).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short' })}`}
                </div>
                {jeLastnik && (
                  <>
                    <button onClick={() => pripni(m)} style={{
                      background: 'none', border: 0, cursor: 'pointer', fontSize: 11,
                      color: T?.accent, fontWeight: 600, fontFamily: 'inherit',
                    }}>{m.pinned ? 'Odpni' : 'Pripni'}</button>
                    <button onClick={() => izbrisiSporocilo(m.id)} style={{
                      background: 'none', border: 0, cursor: 'pointer', fontSize: 11,
                      color: T?.danger, fontWeight: 600, fontFamily: 'inherit',
                    }}>Izbriši</button>
                  </>
                )}
              </div>
            </div>
          ))}

          {sporocila.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', color: T?.muted, fontSize: 13 }}>
              Ni sporočil.
            </div>
          )}
        </>
      )}
    </div>
  )
}
