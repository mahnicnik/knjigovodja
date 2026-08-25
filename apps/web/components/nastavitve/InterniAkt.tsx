'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sestaviInterniAkt, SLOG_AKTA, PodatkiAkta } from '@/lib/interni-akt'

/**
 * INTERNI AKT (25.8.2026)
 *
 * Zavezanec mora akt na zahtevo predloziti davcnemu organu. Ob nadzoru v
 * lokalu to pomeni, da ga mora imeti PRI ROKI - zato je dosegljiv tudi v
 * blagajni.
 *
 * Akt se ob sprejetju ZAMRZNE: velja v obliki, v kateri je bil sprejet. Ce se
 * pozneje spremeni poslovni prostor ali naprava, se sprejme NOVA razlicica.
 * Sicer ob nadzoru ni mogoce dokazati, kaj je veljalo takrat, ko je bil racun
 * izdan.
 */
export default function InterniAkt({ orgId }: { orgId: string }) {
  const [akt, setAkt] = useState<any>(null)
  const [nalagam, setNalagam] = useState(true)
  const [predogled, setPredogled] = useState<string | null>(null)
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [oddan, setOddan] = useState('')

  // POPRAVLJENO (25.8.2026): zastopnik, stevilcne vrste in program so bili
  // TRDO ZAPISANI v kodi. Za d.o.o. je zastopnik druga oseba kot naziv, kdor
  // Stripa ne uporablja pa je v aktu dobil stevilcno vrsto, ki je nima.
  // Akt je pravni dokument zavezanca — vsebino dolocа ON, ne aplikacija.
  const [zastopnik, setZastopnik] = useState('')
  const [program, setProgram] = useState('Računko (računko.si)')
  const [vrste, setVrste] = useState<Array<{ vzorec: string; opis: string; primer: string }>>([])
  const [delam, setDelam] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)

  async function nalozi() {
    const db = createClient()
    const { data } = await db.from('internal_acts')
      .select('*').eq('org_id', orgId).is('superseded_at', null).maybeSingle()
    setAkt(data || null)
    setOddan(data?.submitted_at || '')

    // Ce akt ze obstaja, prevzamemo njegove vrednosti; sicer PREDLAGAMO
    // razumne, ki jih uporabnik lahko popravi ali izbrise.
    const prej = (data?.snapshot ?? {}) as any
    const db2 = createClient()
    const { data: org } = await db2.from('organizations').select('name').eq('id', orgId).maybeSingle()

    // POPRAVLJENO (25.8.2026): polji sta bili PREDNAPOLNJENI. Zastopnik = naziv
    // podjetja je dal nesmiseln stavek „test s.p. …, ki jo zastopa test s.p."
    // in podpisni blok dvakrat isto. Program je bil vpisan, ceprav je
    // neobvezen. Zdaj sta prazna — placeholder pove, kaj sodi vanju.
    setZastopnik(prej.zastopnik || '')
    setProgram(prej.program || '')
    setVrste(Array.isArray(prej.negotovinske) && prej.negotovinske.length > 0
      ? prej.negotovinske
      : [{ vzorec: 'LLLL-NNN', opis: 'računi, izdani ročno oziroma na podlagi opravljene storitve ali dobave', primer: '2026-001' }])

    setNalagam(false)
  }

  useEffect(() => { if (orgId) nalozi() }, [orgId])

  /** Zbere podatke iz aplikacije in sestavi besedilo. */
  async function zberiPodatke(): Promise<PodatkiAkta | null> {
    const db = createClient()
    const [orgRes, prosRes, napRes] = await Promise.all([
      db.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      db.from('business_premises').select('*').eq('org_id', orgId),
      db.from('electronic_devices').select('*').eq('org_id', orgId),
    ])
    const org = orgRes.data
    if (!org) { setNapaka('Podatkov podjetja ni bilo mogoče prebrati.'); return null }

    const prostori = (prosRes.data || [])
    const naprave = (napRes.data || [])
    if (prostori.length === 0) {
      setNapaka('Najprej vnesite vsaj en poslovni prostor v nastavitvah davčne blagajne.')
      return null
    }
    if (naprave.length === 0) {
      setNapaka('Najprej vnesite vsaj eno elektronsko napravo.')
      return null
    }
    if (!zastopnik.trim()) {
      setNapaka('Vpišite zastopnika — osebo, ki akt podpiše.')
      return null
    }

    // `electronic_devices.premise_id` kaze na `business_premises.id`,
    // `business_premises.premise_id` pa je OZNAKA (npr. SIRBFB01).
    const poId: Record<string, string> = {}
    for (const pr of prostori) poId[pr.id] = pr.premise_id || ''

    return {
      naziv: org.name || '',
      naslov: [org.address, [org.post_code, org.city].filter(Boolean).join(' ')]
        .filter(Boolean).join(', '),
      davcna: org.tax_number || '',
      zastopnik: zastopnik.trim(),
      prostori: prostori.map((pr: any) => ({
        oznaka: pr.premise_id || '',
        naslov: [pr.address, [pr.postal_code, pr.city].filter(Boolean).join(' ')]
          .filter(Boolean).join(', '),
        katastrska: pr.cadastral_number ?? null,
        stavba: pr.building_number ?? null,
        delStavbe: pr.building_section_number ?? null,
      })),
      naprave: naprave.map((n: any) => ({
        prostorOznaka: poId[n.premise_id] || '',
        oznaka: n.device_id || '',
      })),
      // Stevilcne vrste vnese uporabnik — vsak posluje drugace.
      negotovinske: vrste.filter(v => v.vzorec.trim()),
      program: program.trim() || undefined,
      datumSprejetja: datum,
    }
  }

  async function pripravi() {
    setNapaka(null); setDelam(true)
    const p = await zberiPodatke()
    if (p) {
      setPredogled(sestaviInterniAkt(p))
      // POPRAVLJENO (25.8.2026): predogled se je izrisal DALEC pod gumbom,
      // izven vidnega polja - klik ni dal nobenega odziva in je bil videti,
      // kot da gumb ne dela.
      setTimeout(() => {
        document.getElementById('predogled-akta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    }
    setDelam(false)
  }

  async function sprejmi() {
    setNapaka(null)
    const p = await zberiPodatke()
    if (!p) return
    const besedilo = sestaviInterniAkt(p)

    if (!confirm(
      `Sprejmem interni akt z dnem ${new Date(datum).toLocaleDateString('sl-SI')}?\n\n`
      + 'Vsebina se zamrzne. Če se pozneje spremeni poslovni prostor ali naprava, '
      + 'sprejmete NOVO različico — te ne popravljate.'
    )) return

    setDelam(true)
    const db = createClient()

    // Obstojeco razlicico oznacimo za nadomesceno, sicer bi krsili pravilo
    // "ena veljavna naenkrat".
    if (akt) {
      const { error } = await db.from('internal_acts')
        .update({ superseded_at: datum }).eq('id', akt.id)
      if (error) { setNapaka('Prejšnje različice ni bilo mogoče zapreti: ' + error.message); setDelam(false); return }
    }

    const { error: nErr } = await db.from('internal_acts').insert({
      org_id: orgId,
      version: (akt?.version ?? 0) + 1,
      adopted_date: datum,
      valid_from: datum,
      content_html: besedilo,
      snapshot: p as any,
    })
    if (nErr) { setNapaka('Akta ni bilo mogoče shraniti: ' + nErr.message); setDelam(false); return }

    setPredogled(null)
    setDelam(false)
    nalozi()
  }

  async function shraniOddajo() {
    if (!akt) return
    setDelam(true)
    const { error } = await createClient().from('internal_acts')
      .update({ submitted_at: oddan || null }).eq('id', akt.id)
    if (error) setNapaka('Datuma oddaje ni bilo mogoče shraniti: ' + error.message)
    setDelam(false)
    nalozi()
  }

  function natisni(html: string) {
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8">
      <title>Interni akt</title><style>${SLOG_AKTA}
      body{margin:0;padding:32px;background:#fff}
      .vrh{position:sticky;top:0;background:#0D1F12;padding:10px;display:flex;gap:8px;justify-content:center;margin:-32px -32px 24px}
      .vrh button{padding:9px 20px;border:0;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer}
      </style></head><body>
      <div class="vrh noprint">
        <button onclick="window.print()" style="background:#fff;color:#0D1F12">Natisni</button>
        <button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)">Zapri</button>
      </div>${html}</body></html>`)
    w.document.close()
  }

  const gumb: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 8, border: 0, fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  }

  if (nalagam) return <div style={{ fontSize: 13, color: '#888' }}>Nalagam…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginTop: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12', marginBottom: 4 }}>📜 Interni akt</div>
      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 16 }}>
        Akt o popisu poslovnih prostorov in številčenju računov. Sestavi se iz
        podatkov, ki so že vneseni zgoraj. Ob nadzoru je dosegljiv tudi v blagajni.
      </div>

      {napaka && (
        <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(163,45,45,0.08)', color: '#A32D2D', fontSize: 13, marginBottom: 14 }}>
          {napaka}
        </div>
      )}

      {akt ? (
        <>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#E1F5EE', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#0E5E3B', fontWeight: 600 }}>
              Različica {akt.version} · sprejet {new Date(akt.adopted_date).toLocaleDateString('sl-SI')}
            </div>
            <div style={{ fontSize: 12, color: '#0E5E3B', marginTop: 3 }}>
              {akt.submitted_at
                ? `Oddan v eDavke ${new Date(akt.submitted_at).toLocaleDateString('sl-SI')}.`
                : 'Še ni označen kot oddan v eDavke.'}
            </div>
          </div>

          {!akt.submitted_at && (
            <div style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(184,140,40,0.1)', border: '1px solid rgba(184,140,40,0.3)', fontSize: 12, lineHeight: 1.55, color: '#8A5A00', marginBottom: 14 }}>
              <strong>Akta ni dovolj hraniti pri sebi.</strong> Oddati ga je treba
              elektronsko prek eDavkov, in sicer <strong>pred izdajo prvega računa</strong>.
              Ko to storite, vpišite datum spodaj.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <button onClick={() => natisni(akt.content_html)} style={{ ...gumb, background: '#0D1F12', color: '#fff' }}>
              Odpri in natisni
            </button>
            <span style={{ fontSize: 12, color: '#888' }}>Oddan v eDavke:</span>
            <input type="date" value={oddan} onChange={e => setOddan(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13 }}/>
            <button onClick={shraniOddajo} disabled={delam}
              style={{ ...gumb, background: '#F7F6F2', color: '#0D1F12', border: '0.5px solid rgba(0,0,0,0.15)' }}>
              Shrani
            </button>
          </div>

          <details>
            <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer' }}>
              Sprejmi novo različico (ob spremembi prostora ali naprave)
            </summary>

      {/* OBRAZEC (25.8.2026): vsebino akta dolocа ZAVEZANEC, ne aplikacija.
          Vrednosti so le PREDLAGANE — uporabnik jih popravi ali izbrise. */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Zastopnik (kdor akt podpiše)
          </label>
          <input value={zastopnik} onChange={e => setZastopnik(e.target.value)}
            placeholder="Ime in priimek"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box' }}/>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
            Pri s.p. običajno nosilec dejavnosti, pri d.o.o. direktor.
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Programska oprema (neobvezno)
          </label>
          <input value={program} onChange={e => setProgram(e.target.value)}
            placeholder="npr. Računko (računko.si)"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box' }}/>
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Številčne vrste za negotovinske račune
          </label>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, lineHeight: 1.5 }}>
            Računi, ki niso plačani z gotovino in ne zapadejo pod davčno potrjevanje.
            Vpišite samo tiste, ki jih dejansko uporabljate — če jih nimate, vrstice izbrišite.
          </div>
          {vrste.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input value={v.vzorec} placeholder="LLLL-NNN"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, vzorec: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, fontFamily: 'monospace', minWidth: 0 }}/>
              <input value={v.opis} placeholder="opis vrste"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, opis: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, minWidth: 0 }}/>
              <input value={v.primer} placeholder="2026-001"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, primer: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, fontFamily: 'monospace', minWidth: 0 }}/>
              <button onClick={() => setVrste(p => p.filter((_, j) => j !== i))}
                title="Odstrani vrsto"
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#A32D2D', fontSize: 12, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ))}
          <button onClick={() => setVrste(p => [...p, { vzorec: '', opis: '', primer: '' }])}
            style={{ padding: '7px 12px', borderRadius: 7, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            + Dodaj vrsto
          </button>
        </div>
      </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13 }}/>
              <button onClick={pripravi} disabled={delam} style={{ ...gumb, background: '#F7F6F2', color: '#0D1F12', border: '0.5px solid rgba(0,0,0,0.15)' }}>
                Predogled
              </button>
              <button onClick={sprejmi} disabled={delam} style={{ ...gumb, background: '#0D1F12', color: '#fff' }}>
                Sprejmi različico {(akt.version ?? 0) + 1}
              </button>
            </div>
          </details>
        </>
      ) : (
        <>
          <div style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(184,140,40,0.1)', border: '1px solid rgba(184,140,40,0.3)', fontSize: 12, lineHeight: 1.55, color: '#8A5A00', marginBottom: 14 }}>
            <strong>Interni akt še ni sprejet.</strong> Zavezanec ga mora sprejeti
            in oddati v eDavke pred izdajo prvega računa iz davčne blagajne.
          </div>

      {/* OBRAZEC (25.8.2026): vsebino akta dolocа ZAVEZANEC, ne aplikacija.
          Vrednosti so le PREDLAGANE — uporabnik jih popravi ali izbrise. */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Zastopnik (kdor akt podpiše)
          </label>
          <input value={zastopnik} onChange={e => setZastopnik(e.target.value)}
            placeholder="Ime in priimek"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box' }}/>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
            Pri s.p. običajno nosilec dejavnosti, pri d.o.o. direktor.
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Programska oprema (neobvezno)
          </label>
          <input value={program} onChange={e => setProgram(e.target.value)}
            placeholder="npr. Računko (računko.si)"
            style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box' }}/>
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
            Številčne vrste za negotovinske račune
          </label>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, lineHeight: 1.5 }}>
            Računi, ki niso plačani z gotovino in ne zapadejo pod davčno potrjevanje.
            Vpišite samo tiste, ki jih dejansko uporabljate — če jih nimate, vrstice izbrišite.
          </div>
          {vrste.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input value={v.vzorec} placeholder="LLLL-NNN"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, vzorec: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, fontFamily: 'monospace', minWidth: 0 }}/>
              <input value={v.opis} placeholder="opis vrste"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, opis: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, minWidth: 0 }}/>
              <input value={v.primer} placeholder="2026-001"
                onChange={e => setVrste(p => p.map((x, j) => j === i ? { ...x, primer: e.target.value } : x))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, fontFamily: 'monospace', minWidth: 0 }}/>
              <button onClick={() => setVrste(p => p.filter((_, j) => j !== i))}
                title="Odstrani vrsto"
                style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#A32D2D', fontSize: 12, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ))}
          <button onClick={() => setVrste(p => [...p, { vzorec: '', opis: '', primer: '' }])}
            style={{ padding: '7px 12px', borderRadius: 7, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            + Dodaj vrsto
          </button>
        </div>
      </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#888' }}>Datum sprejetja:</span>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13 }}/>
            <button onClick={pripravi} disabled={delam} style={{ ...gumb, background: '#F7F6F2', color: '#0D1F12', border: '0.5px solid rgba(0,0,0,0.15)' }}>
              {delam ? 'Pripravljam…' : 'Predogled'}
            </button>
            <button onClick={sprejmi} disabled={delam} style={{ ...gumb, background: '#0D1F12', color: '#fff' }}>
              Sprejmi akt
            </button>
          </div>
        </>
      )}

      {predogled && (
        <div id="predogled-akta" style={{ marginTop: 18, border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: 18, maxHeight: 420, overflowY: 'auto', background: '#fff', scrollMarginTop: 16 }}>
          <style>{SLOG_AKTA}</style>
          <div dangerouslySetInnerHTML={{ __html: predogled }} />
        </div>
      )}
    </div>
  )
}
