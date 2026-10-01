'use client'
/**
 * PRELET 360: SEZNAM ZAHTEVKOV ZA PLAČILO (Računi → Zahtevki za plačilo).
 *
 * Stanja: poslan / plačan / potekel / preklican (potekle označi strežnik ob
 * branju). Gumbi: Pokaži QR, Pošlji (opomnik), Prekliči, povezava do
 * izdanega računa. Opozorilo, dokler račun iz zahtevka ni davčno potrjen.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'
import { getActiveMembership } from '@/lib/active-org'
import { klicStripe } from '@/lib/stripe-connect-odjemalec'
import { ZahtevekQrZaslon, eur, type ZahtevekPortal, type Nedostopno } from '@/components/zahtevki/Zahtevek'

const STANJA: Record<string, { label: string; color: string; bg: string }> = {
  poslan: { label: 'Čaka na plačilo', color: '#854F0B', bg: '#FAEEDA' },
  placan: { label: 'Plačan', color: '#27500A', bg: '#EAF3DE' },
  potekel: { label: 'Potekel', color: '#555', bg: '#eee' },
  preklican: { label: 'Preklican', color: '#A32D2D', bg: '#FCEBEB' },
}

export default function ZahtevkiStran() {
  const [org, setOrg] = useState<any>(null)
  const [vloga, setVloga] = useState('')
  const [zahtevki, setZahtevki] = useState<ZahtevekPortal[]>([])
  const [nedostopno, setNedostopno] = useState<Nedostopno>(null)
  const [nalaga, setNalaga] = useState(true)
  const [napaka, setNapaka] = useState<string | null>(null)
  const [obvestilo, setObvestilo] = useState<string | null>(null)
  const [dela, setDela] = useState('')
  const [qr, setQr] = useState<ZahtevekPortal | null>(null)
  const [filter, setFilter] = useState<'vsi' | 'poslan' | 'placan' | 'potekel' | 'preklican'>('vsi')

  async function nalozi() {
    const r = await klicStripe<{ zahtevki: ZahtevekPortal[]; nedostopno: Nedostopno }>('/api/zahtevki')
    if (r.ok) { setZahtevki(r.data.zahtevki); setNedostopno(r.data.nedostopno); setNapaka(null) } else setNapaka(r.data.error || 'Zahtevkov ni bilo mogoče naložiti.')
    setNalaga(false)
  }
  useEffect(() => {
    getActiveMembership().then((m: any) => { if (m) { setOrg(m.organizations); setVloga(String(m.role || '')) } })
    nalozi()
  }, [])

  async function akcija(z: ZahtevekPortal, kaj: 'poslji' | 'preklic' | 'potrdi') {
    if (kaj === 'preklic' && !confirm(`Prekličem zahtevek ${z.stevilka || ''} (${eur(z.znesek)})?\n\nPovezava za plačilo ne bo več delovala.`)) return
    setDela(kaj + z.id); setObvestilo(null); setNapaka(null)
    const r = await klicStripe<any>(`/api/zahtevki/${z.id}/${kaj}`, {})
    setDela('')
    if (!r.ok) setNapaka(r.data.error || 'Ni uspelo.')
    else if (kaj === 'poslji') setObvestilo(`${r.data.opomnik ? 'Opomnik' : 'Zahtevek'} poslan na ${z.stranka_email}.`)
    else if (kaj === 'preklic') setObvestilo(`Zahtevek ${z.stevilka || ''} je preklican.`)
    else if (kaj === 'potrdi') setObvestilo(r.data.izid?.napaka ? `Še vedno ni potrjeno: ${r.data.izid.napaka}` : 'Račun je davčno potrjen in poslan stranki.')
    await nalozi()
  }

  const lahkoUreja = !['accountant', 'viewer', 'cashier'].includes(vloga)
  const prikazani = zahtevki.filter(z => filter === 'vsi' || z.status === filter)
  const nepotrjeni = zahtevki.filter(z => z.status === 'placan' && z.racun && !z.racun.eor)
  const cakajo = zahtevki.filter(z => z.status === 'poslan')
  const gumb: CSSProperties = { padding: '7px 11px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }

  return (
    <AppLayout org={org}>
      <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <Link href="/invoices" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Računi</Link>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '2px 0 0', color: '#0D1F12' }}>Zahtevki za plačilo</h1>
          </div>
          {lahkoUreja && !nedostopno && (
            <Link data-testid="nov-zahtevek" href="/invoices/new?vrsta=zahtevek" style={{ background: '#0D1F12', color: '#fff', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>+ Nov zahtevek</Link>
          )}
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px' }}>
          {nedostopno && (
            <div data-testid="zahtevek-nedostopno" style={{ background: '#FFF6E5', color: '#8A5A00', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
              Novih zahtevkov ni mogoče ustvariti: {nedostopno.razlog} <a href={nedostopno.povezava} style={{ color: '#1F6B3A', fontWeight: 700 }}>{nedostopno.gumb} →</a>
            </div>
          )}
          {nepotrjeni.length > 0 && (
            <div data-testid="zahtevki-nepotrjeni" style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
              ⚠ {nepotrjeni.length === 1 ? 'En račun iz zahtevka še ni davčno potrjen' : `${nepotrjeni.length} računi iz zahtevkov še niso davčno potrjeni`} pri FURS.
              Potrdi se samodejno vsak dan ali z gumbom »Potrdi zdaj«. Stranka račun dobi po potrditvi.
            </div>
          )}
          {obvestilo && <div data-testid="zahtevki-obvestilo" style={{ background: '#EAF3DE', color: '#27500A', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{obvestilo}</div>}
          {napaka && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{napaka}</div>}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['vsi', 'poslan', 'placan', 'potekel', 'preklican'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ ...gumb, background: filter === f ? '#0D1F12' : '#fff', color: filter === f ? '#fff' : '#333', border: filter === f ? 'none' : '1px solid #ddd' }}>
                {f === 'vsi' ? `Vsi (${zahtevki.length})` : `${STANJA[f].label} (${zahtevki.filter(z => z.status === f).length})`}
              </button>
            ))}
          </div>
          {cakajo.length > 0 && filter === 'vsi' && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Čaka na plačilo: {eur(cakajo.reduce((s, z) => s + z.znesek, 0))}</div>
          )}

          {nalaga ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nalagam …</div>
          ) : prikazani.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, padding: '36px 20px', textAlign: 'center', color: '#888', fontSize: 14 }}>
              Ni zahtevkov. {lahkoUreja && !nedostopno && <Link href="/invoices/new?vrsta=zahtevek" style={{ color: '#1F6B3A', fontWeight: 600 }}>Ustvari prvega →</Link>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prikazani.map(z => {
                const st = STANJA[z.status] || STANJA.poslan
                return (
                  <div key={z.id} data-testid="zahtevek-vrstica" style={{ background: '#fff', borderRadius: 14, border: '1px solid #eee', padding: '14px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{z.stevilka}</span>
                          <span data-testid="zahtevek-stanje" style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 20 }}>{st.label}</span>
                          {z.vrnjeno_ob && <span style={{ fontSize: 11, fontWeight: 700, color: '#555', background: '#eee', padding: '2px 8px', borderRadius: 20 }}>Vrnjeno</span>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1F12', marginTop: 4, overflowWrap: 'anywhere' }}>{z.stranka_ime}</div>
                        <div style={{ fontSize: 12, color: '#888', overflowWrap: 'anywhere' }}>
                          {(z.postavke || []).map((p: any) => p.description).join(', ')}
                        </div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                          Ustvarjen {new Date(z.ustvarjeno).toLocaleDateString('sl-SI')}
                          {z.poslano_ob && <> · poslan {new Date(z.poslano_ob).toLocaleDateString('sl-SI')}</>}
                          {z.opomnik_ob && <> · opomnik {new Date(z.opomnik_ob).toLocaleDateString('sl-SI')}</>}
                          {z.status === 'poslan' && <> · velja do {new Date(z.velja_do).toLocaleDateString('sl-SI')}</>}
                          {z.placano_ob && <> · plačan {new Date(z.placano_ob).toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' })}</>}
                        </div>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F12', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{eur(z.znesek)}</div>
                    </div>

                    {z.racun && (
                      <div style={{ marginTop: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <a data-testid="zahtevek-racun" href={`/api/racunovodja/invoice-pdf?id=${z.racun.id}`} target="_blank" rel="noopener" style={{ color: '#1F6B3A', fontWeight: 700 }}>Račun {z.racun.invoice_number} →</a>
                        {z.racun.eor
                          ? <span style={{ color: '#27500A' }}>✓ davčno potrjen{z.racun.eor.startsWith('DEMO-') ? ' (predstavitev)' : ''}</span>
                          : <span style={{ color: '#A32D2D', fontWeight: 600 }}>⚠ ni davčno potrjen</span>}
                        {z.racun.status === 'cancelled' && <span style={{ color: '#555' }}>· storniran</span>}
                        {z.racun_poslan_ob && <span style={{ color: '#888' }}>· poslan stranki</span>}
                      </div>
                    )}
                    {z.napaka && <div style={{ marginTop: 8, fontSize: 12, color: '#8A5A00', background: '#FFF6E5', borderRadius: 8, padding: '6px 10px' }}>{z.napaka}</div>}

                    {lahkoUreja && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {z.status === 'poslan' && <>
                          <button data-testid="zahtevek-akcija-qr" style={gumb} onClick={() => setQr(z)}>📱 Pokaži QR</button>
                          <button data-testid="zahtevek-akcija-poslji" style={gumb} disabled={!!dela} onClick={() => akcija(z, 'poslji')}>
                            ✉️ {dela === 'poslji' + z.id ? 'Pošiljam …' : z.poslano_ob ? 'Pošlji opomnik' : 'Pošlji po e-pošti'}
                          </button>
                          <button data-testid="zahtevek-akcija-preklic" style={{ ...gumb, color: '#A32D2D' }} disabled={!!dela} onClick={() => akcija(z, 'preklic')}>
                            {dela === 'preklic' + z.id ? 'Preklicujem …' : 'Prekliči'}
                          </button>
                          <button style={gumb} onClick={() => { navigator.clipboard?.writeText(z.url); setObvestilo('Povezava za plačilo je kopirana.') }}>🔗 Kopiraj povezavo</button>
                        </>}
                        {z.status === 'placan' && (!z.racun || !z.racun.eor || !z.racun_poslan_ob) && z.racun?.status !== 'cancelled' && (
                          <button data-testid="zahtevek-akcija-potrdi" style={gumb} disabled={!!dela} onClick={() => akcija(z, 'potrdi')}>
                            {dela === 'potrdi' + z.id ? 'Potrjujem …' : z.racun && !z.racun.eor ? 'Potrdi zdaj' : 'Dokončaj'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {qr && <ZahtevekQrZaslon zahtevek={qr} onZapri={() => { setQr(null); nalozi() }} />}
    </AppLayout>
  )
}
