'use client'
/**
 * NASTAVITVE → PLAČILA S KARTICO (STRIPE) (prelet 357)
 *
 * Povezava podjetja s Stripe Connect (Express). Stripe provizije zaračuna
 * neposredno podjetju, Računko ne zaračuna ničesar. Povezava velja za
 * blagajno (plačilo prek QR kode) in portal (zahtevek za plačilo).
 */
import { useEffect, useState } from 'react'
import { klicStripe, type StripePogoji } from '@/lib/stripe-connect-odjemalec'

type Stanje = {
  pogoji: StripePogoji
  povezava: {
    accountId: string | null
    chargesEnabled: boolean
    payoutsEnabled: boolean
    povezanoOb: string | null
    podrobnosti: { details_submitted?: boolean; requirements?: string[]; ime?: string | null; email?: string | null } | null
    testni: boolean
  }
  lahkoUreja: boolean
  napaka: string | null
}

const kartica: React.CSSProperties = { background: '#fff', border: '1px solid #E8E6E1', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }
const gumb = (barva = '#1F6B3A'): React.CSSProperties => ({ padding: '10px 18px', borderRadius: 9, border: 'none', background: barva, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
const gumbObroba: React.CSSProperties = { padding: '10px 18px', borderRadius: 9, border: '1px solid #D8D5CE', background: '#fff', color: '#333', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }

function Oznaka({ ok, da, ne }: { ok: boolean; da: string; ne: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: ok ? 'rgba(31,107,58,0.1)' : 'rgba(184,140,40,0.12)', color: ok ? '#1F6B3A' : '#8A5A00' }}>
      {ok ? '✓' : '•'} {ok ? da : ne}
    </span>
  )
}

export default function PlacilaStripe() {
  const [s, setS] = useState<Stanje | null>(null)
  const [nalaganje, setNalaganje] = useState(true)
  const [dela, setDela] = useState<string | null>(null)
  const [sporocilo, setSporocilo] = useState<{ t: string; ok: boolean } | null>(null)

  async function nalozi() {
    setNalaganje(true)
    const r = await klicStripe<Stanje>('/api/pos/stripe/povezava?osvezi=1')
    if (r.ok) setS(r.data)
    else setSporocilo({ t: r.data.error || 'Stanja ni bilo mogoče naložiti.', ok: false })
    setNalaganje(false)
  }

  useEffect(() => {
    nalozi()
    const p = new URLSearchParams(window.location.search).get('stripe')
    if (p === 'vrnjen') setSporocilo({ t: 'Vrnili ste se iz Stripe. Če so vsi podatki vpisani, je povezava aktivna v nekaj trenutkih.', ok: true })
  }, [])

  async function akcija(a: 'povezi' | 'nadzorna' | 'prekini') {
    if (a === 'prekini' && !confirm('Prekinem povezavo s Stripe?\n\nBlagajna in portal ne bosta več ponujala plačila s kartico. Vaš račun pri Stripe in vsa pretekla plačila ostanejo nedotaknjeni.')) return
    setDela(a)
    setSporocilo(null)
    const r = await klicStripe('/api/pos/stripe/povezava', { akcija: a })
    setDela(null)
    if (!r.ok) { setSporocilo({ t: r.data.error || 'Napaka', ok: false }); return }
    if (r.data.url) {
      if (a === 'nadzorna') window.open(r.data.url, '_blank', 'noopener')
      else window.location.href = r.data.url
      return
    }
    setSporocilo({ t: 'Povezava s Stripe je prekinjena.', ok: true })
    nalozi()
  }

  if (nalaganje && !s) return <div style={{ padding: 20, color: '#888', fontSize: 14 }}>Nalagam…</div>

  const p = s?.pogoji
  const pov = s?.povezava
  const manjka = pov?.podrobnosti?.requirements || []

  return (
    <div data-testid="nastavitve-placila-stripe">
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Plačila s kartico (Stripe)</h2>
        <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.6 }}>
          Stranke plačajo s kartico, Apple Pay ali Google Pay — v blagajni prek QR kode ali na daljavo z zahtevkom za plačilo.
          Denar gre <strong>neposredno na vaš račun pri Stripe</strong>. Stripe provizijo (za evropske kartice 1,5 % + 0,25 €) zaračuna neposredno vam; Računko ne zaračuna ničesar.
        </p>
      </div>

      {sporocilo && (
        <div style={{ ...kartica, padding: '12px 16px', background: sporocilo.ok ? 'rgba(31,107,58,0.08)' : 'rgba(168,50,50,0.08)', color: sporocilo.ok ? '#1F6B3A' : '#A83232', fontSize: 13, fontWeight: 600 }}>
          {sporocilo.t}
        </div>
      )}

      {p && !p.nastavljeno && (
        <div style={{ ...kartica, background: 'rgba(184,140,40,0.08)', fontSize: 13, color: '#8A5A00' }}>
          Plačila s kartico na strežniku še niso vklopljena. Poskusite znova kasneje.
        </div>
      )}

      <div style={kartica}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Povezava s Stripe {pov?.testni && <span style={{ fontSize: 11, fontWeight: 700, color: '#8A5A00', background: 'rgba(184,140,40,0.14)', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>TESTNI NAČIN</span>}</div>
          {pov?.accountId
            ? <Oznaka ok={!!pov.chargesEnabled} da="Sprejema plačila" ne="Vpis pri Stripe ni končan" />
            : <Oznaka ok={false} da="" ne="Ni povezano" />}
        </div>

        {pov?.accountId ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14, fontSize: 13 }}>
              <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Račun</div><code style={{ fontSize: 12 }}>{pov.accountId}</code></div>
              <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Plačila</div>{pov.chargesEnabled ? 'Omogočena' : 'Še ne'}</div>
              <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Izplačila na TRR</div>{pov.payoutsEnabled ? 'Omogočena' : 'Še ne'}</div>
              {pov.podrobnosti?.ime && <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Ime pri Stripe</div>{pov.podrobnosti.ime}</div>}
            </div>
            {!pov.chargesEnabled && (
              <div style={{ fontSize: 13, color: '#8A5A00', background: 'rgba(184,140,40,0.08)', borderRadius: 9, padding: '10px 12px', marginBottom: 14, lineHeight: 1.5 }}>
                Stripe za sprejem plačil potrebuje še nekaj podatkov{manjka.length ? ` (${manjka.length})` : ''}. Kliknite »Nadaljuj vpis pri Stripe«.
              </div>
            )}
            {s?.lahkoUreja && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!pov.chargesEnabled && <button style={gumb()} disabled={!!dela} onClick={() => akcija('povezi')}>{dela === 'povezi' ? 'Odpiram…' : 'Nadaljuj vpis pri Stripe'}</button>}
                <button style={gumbObroba} disabled={!!dela} onClick={() => akcija('nadzorna')}>{dela === 'nadzorna' ? 'Odpiram…' : 'Stripe nadzorna plošča ↗'}</button>
                <button style={{ ...gumbObroba, color: '#A83232' }} disabled={!!dela} onClick={() => akcija('prekini')}>{dela === 'prekini' ? 'Prekinjam…' : 'Prekini povezavo'}</button>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#555', margin: '0 0 14px', lineHeight: 1.6 }}>
              Pri Stripe odprete brezplačen račun (Express) in vpišete podatke podjetja ter TRR za izplačila. Traja nekaj minut.
            </p>
            {s?.lahkoUreja
              ? <button style={gumb()} disabled={!!dela || !p?.nastavljeno} onClick={() => akcija('povezi')}>{dela === 'povezi' ? 'Odpiram Stripe…' : 'Poveži Stripe'}</button>
              : <div style={{ fontSize: 13, color: '#888' }}>Povezavo lahko uredi lastnik podjetja.</div>}
          </>
        )}
      </div>

      <div style={kartica}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Pogoji za plačila s kartico</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span>Davčno potrjevanje (FURS certifikat in poslovni prostor)</span>
            <Oznaka ok={!!p?.fursOk} da={p?.demo ? 'Predstavitev' : 'Urejeno'} ne="Manjka" />
          </div>
          {p && !p.fursOk && (
            <div style={{ fontSize: 12, color: '#8A5A00', lineHeight: 1.5 }}>
              {p.fursRazlog} Vsak račun, plačan s kartico, se vedno davčno potrdi. <a href="/nastavitve?razdelek=blagajna" style={{ color: '#1F6B3A', fontWeight: 600 }}>Nastavitve FURS →</a>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span>Blagajna — plačilo prek QR kode</span>
            <Oznaka ok={!!p?.paketPos} da="Paket Pro + POS" ne="Potreben paket Pro + POS" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span>Portal — zahtevek za plačilo</span>
            <Oznaka ok={!!p?.paketPortal} da="Na voljo" ne="Potreben paket Pro" />
          </div>
        </div>
      </div>

      {s?.napaka && <div style={{ fontSize: 12, color: '#A83232' }}>{s.napaka}</div>}
    </div>
  )
}
