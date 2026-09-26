'use client'

/**
 * PRELET 326: Stripe - kljuc za branje, preverba nastavitve, uskladitev in
 * knjiga placil (katero placilo ima racun, katero ne in zakaj).
 *
 * Namen: da placilo brez racuna ni vec nevidno. Vsako placilo, ki ga
 * Racunko pozna, je tu - z racunom, s preskokom in razlogom, ali oznaceno
 * za pregled.
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Vrstica = {
  kljuc: string
  znesek_centi: number
  valuta: string
  vrnjeno_centi: number
  placano_ob: string | null
  kupec_ime: string | null
  kupec_email: string | null
  opis: string | null
  stanje: string
  razlog: string | null
  racun_id: string | null
  spor: boolean
  issued_invoices?: { invoice_number: string } | null
}

const RAZLOGI: Record<string, string> = {
  amount_zero_or_negative: 'Znesek 0 € (npr. brezplačni preizkus) — račun ni potreben',
  ni_placano: 'Plačilo ni zaključeno',
  woocommerce_order_invoiced_by_woocommerce: 'Račun izda WooCommerce integracija',
  v_celoti_vrnjeno_pred_racunom: 'V celoti vrnjeno, preden je bil izdan račun — odločite ročno',
  invoice_number_conflict: 'Trk številke računa — ponovni poskus sledi samodejno',
  knjiga_placil_nedostopna: 'Začasna napaka baze — ponovni poskus sledi samodejno',
  pred_zacetkom_samodejne_izdaje: 'Plačilo pred povezavo ključa — preverite, ali ste račun že izdali ročno; če ne, kliknite "Izdaj račun"',
  placano_izven_stripe_ali_dobroimetje: 'Stripe račun je označen kot plačan brez plačila prek Stripa (gotovina, nakazilo, dobroimetje) — preverite in po potrebi izdajte račun',
  kljuc_za_branje_ne_deluje: 'Ključ za branje ne deluje (preklican ali brez dovoljenj) — popravite ključ, nato "Poskusi znova"',
  kljuc_drugega_stripe_racuna: 'Ključ pripada drugemu Stripe računu kot webhook — vpišite ključ istega računa',
  kpo_manjka: 'Račun izdan, a vnos v KPO ni uspel — "Poskusi znova" ga dopolni',
  furs_ni_potrjen: 'Račun izdan, a še ni potrjen pri FURS — "Poskusi znova" ali potrdite v Računih',
  racun_ne_obstaja: 'Povezani račun ne obstaja več — "Poskusi znova"',
}
const razlogBesedilo = (r: string | null) => {
  if (!r) return ''
  if (r.startsWith('tuja_valuta_')) return `Plačilo v tuji valuti (${r.slice(12).toUpperCase()}) — račun izdajte ročno v EUR`
  return RAZLOGI[r] ?? r
}
const eur = (c: number, v = 'eur') => (c / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (v === 'eur' ? ' €' : ' ' + v.toUpperCase())

const gumb: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, cursor: 'pointer', background: '#fff', fontFamily: 'inherit' }
const gumbTemen: React.CSSProperties = { ...gumb, background: '#0D1F12', color: '#fff', border: 0 }

export default function StripePlacila({ orgId, zadnji4, zadnjaUskladitev }: { orgId: string; zadnji4: string | null; zadnjaUskladitev: string | null }) {
  const supabase = createClient()
  const [kljuc, setKljuc] = useState('')
  const [imaKljuc, setImaKljuc] = useState<string | null>(zadnji4)
  const [dela, setDela] = useState<string | null>(null)
  const [sporocilo, setSporocilo] = useState<{ ok: boolean; besedilo: string } | null>(null)
  const [preverbe, setPreverbe] = useState<{ ok: boolean; naslov: string; opis: string }[] | null>(null)
  const [vrstice, setVrstice] = useState<Vrstica[]>([])
  const [vracilaZaPregled, setVracilaZaPregled] = useState(0)

  const nalozi = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase.from('stripe_placila')
        .select('kljuc, znesek_centi, valuta, vrnjeno_centi, placano_ob, kupec_ime, kupec_email, opis, stanje, razlog, racun_id, spor, issued_invoices(invoice_number)')
        .eq('org_id', orgId).order('placano_ob', { ascending: false }).limit(40),
      supabase.from('stripe_vracila').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('stanje', ['pregled', 'napaka']),
    ])
    setVrstice((data as any) || [])
    setVracilaZaPregled(count || 0)
  }, [orgId, supabase])

  useEffect(() => { nalozi() }, [nalozi])

  async function klici(akcija: string, telo: Record<string, any> = {}) {
    setDela(akcija); setSporocilo(null)
    try {
      const res = await fetch('/api/integracije/stripe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, akcija, ...telo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSporocilo({ ok: false, besedilo: data.error || 'Napaka' }); return null }
      return data
    } catch (e: any) {
      setSporocilo({ ok: false, besedilo: 'Povezava ni uspela: ' + (e?.message || e) })
      return null
    } finally {
      setDela(null)
    }
  }

  async function shraniKljuc() {
    const d = await klici('shrani-kljuc', { kljuc })
    if (!d) return
    setImaKljuc(d.zadnji4); setKljuc(''); setPreverbe(d.preverbe || null)
    setSporocilo({ ok: true, besedilo: d.testni ? 'Ključ shranjen — POZOR: to je TESTNI ključ, prava plačila ne bodo vidna.' : 'Ključ shranjen. Kliknite "Uskladi zadnjih 30 dni" — plačila pred današnjim dnem gredo v pregled (ne dobijo računa samodejno), da ne nastanejo dvojniki.' })
  }

  async function uskladi() {
    const d = await klici('uskladi', { dni: 30 })
    if (!d) return
    setSporocilo({
      ok: d.napak === 0,
      besedilo: `Pregledanih ${d.pregledanih} plačil: novih računov ${d.novihRacunov}, dobropisov ${d.dobropisov}, za pregled ${d.zaPregled}` +
        (d.napak ? `, napak ${d.napak} (${(d.napake || []).slice(0, 2).join('; ')})` : '') + '.',
    })
    nalozi()
  }

  async function ponovi(k: string, akcija: 'ponovi' | 'izdaj' = 'ponovi') {
    if (akcija === 'izdaj' && !confirm('Izdam račun za to plačilo? Preverite, da zanj računa niste že izdali ročno — sicer nastane dvojnik.')) return
    const d = await klici(akcija, { kljuc: k })
    if (d) setSporocilo({
      ok: d.stanje === 'izdan' && !d.razlog,
      besedilo: d.stanje === 'izdan'
        ? (d.razlog ? `Račun je izdan, a: ${razlogBesedilo(d.razlog)}` : 'Račun je izdan.')
        : `Stanje: ${d.stanje}${d.razlog ? ' — ' + razlogBesedilo(d.razlog) : ''}`,
    })
    nalozi()
  }

  const potrebujePozornost = (v: Vrstica) => v.stanje === 'pregled' || v.stanje === 'napaka' || v.stanje === 'caka' || (v.stanje === 'izdan' && !!v.razlog)
  const brezRacuna = vrstice.filter(potrebujePozornost).length

  return (
    <div style={{ marginTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12', marginBottom: 6 }}>Ključ za branje (priporočeno)</div>
      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 10 }}>
        S ključem Računko vsako noč sam preveri <strong>vsa</strong> plačila v vašem Stripu in izda račun za vsako, ki ga še nima —
        tudi če webhook zgreši dogodek. Vračila samodejno dobijo dobropis.<br />
        Ustvarite ga v Stripe: <strong>Developers → API keys → Create restricted key</strong>, dovoljenja <em>Read</em> za:
        PaymentIntents, Charges and Refunds, Invoices, Checkout Sessions, Webhook Endpoints (ostalo None).
      </div>
      {imaKljuc ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', background: '#E1F5EE', color: '#0E5E3B', padding: '6px 10px', borderRadius: 6 }}>✓ rk_…{imaKljuc}</span>
          <button style={gumb} disabled={!!dela} onClick={async () => { const d = await klici('preveri'); if (d) setPreverbe(d.preverbe) }}>{dela === 'preveri' ? 'Preverjam…' : 'Preveri nastavitev'}</button>
          <button style={gumbTemen} disabled={!!dela} onClick={uskladi}>{dela === 'uskladi' ? 'Usklajujem…' : 'Uskladi zadnjih 30 dni'}</button>
          <button style={{ ...gumb, color: '#DC2626' }} disabled={!!dela} onClick={async () => { if (confirm('Odstranim ključ? Nočna uskladitev se ustavi.')) { const d = await klici('odstrani-kljuc'); if (d) setImaKljuc(null) } }}>Odstrani</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={kljuc} onChange={e => setKljuc(e.target.value)} placeholder="rk_live_…" autoComplete="off"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 12, fontFamily: 'monospace' }} />
          <button style={gumbTemen} disabled={!!dela || !kljuc.trim()} onClick={shraniKljuc}>{dela === 'shrani-kljuc' ? 'Preverjam…' : 'Shrani ključ'}</button>
        </div>
      )}
      {zadnjaUskladitev && imaKljuc && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Zadnja uskladitev: {new Date(zadnjaUskladitev).toLocaleString('sl-SI')}</div>
      )}
      {sporocilo && (
        <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 10, background: sporocilo.ok ? '#E1F5EE' : '#FEF3C7', color: sporocilo.ok ? '#0E5E3B' : '#92400E' }}>{sporocilo.besedilo}</div>
      )}
      {preverbe && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {preverbe.map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: '#0D1F12' }}>{p.ok ? '✅' : '⚠️'} <strong>{p.naslov}:</strong> {p.opis}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>Stripe plačila</div>
        {brezRacuna > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 10 }}>{brezRacuna} za pregled</span>}
        {vracilaZaPregled > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 10 }}>{vracilaZaPregled} vračil za pregled</span>}
      </div>
      {vrstice.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888' }}>Še ni zabeleženih plačil.{imaKljuc ? ' Kliknite "Uskladi zadnjih 30 dni".' : ''}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {vrstice.map(v => (
            <div key={v.kljuc} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#F7F6F2', borderRadius: 8, fontSize: 12 }}>
              <span>{v.stanje === 'izdan' && !v.razlog ? '✅' : v.stanje === 'preskoceno' ? '⏭️' : '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: '#0D1F12', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.kupec_ime || v.kupec_email || 'Neznan kupec'}{v.opis ? ` · ${v.opis}` : ''}
                </div>
                <div style={{ color: '#888', fontSize: 11 }}>
                  {v.placano_ob ? new Date(v.placano_ob).toLocaleString('sl-SI') : ''}
                  {v.stanje === 'izdan' && v.issued_invoices?.invoice_number ? ` · račun ${v.issued_invoices.invoice_number}` : ''}
                  {v.razlog ? ` · ${razlogBesedilo(v.razlog)}` : ''}
                  {v.vrnjeno_centi > 0 ? ` · vrnjeno ${eur(v.vrnjeno_centi, v.valuta)}` : ''}
                  {v.spor ? ' · ⚠️ spor (chargeback)' : ''}
                </div>
              </div>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{eur(v.znesek_centi, v.valuta)}</div>
              {imaKljuc && potrebujePozornost(v) && (
                <button style={gumb} disabled={!!dela} onClick={() => ponovi(v.kljuc)}>Poskusi znova</button>
              )}
              {/* Placila, ki cakajo na ODLOCITEV uporabnika (ne na popravek): rocna potrditev izdaje. */}
              {imaKljuc && v.stanje === 'pregled' && !v.racun_id && (
                <button style={gumbTemen} disabled={!!dela} onClick={() => ponovi(v.kljuc, 'izdaj')}>Izdaj račun</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
