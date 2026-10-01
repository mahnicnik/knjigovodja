'use client'
/**
 * ZAHTEVEK ZA PLAČILO NA PORTALU (prelet 360)
 * ════════════════════════════════════════════
 *
 * VrstaDokumenta      - izbira na obrazcu »Nov račun«: Račun | Zahtevek za
 *                       plačilo (Stripe). Onemogočena z razlago in povezavo
 *                       do nastavitev, kadar Stripe ali FURS nista nastavljena.
 * ZahtevekPoShranitvi - po shranitvi tri možnosti: Pokaži QR zdaj, Pošlji po
 *                       e-pošti, Oboje.
 * ZahtevekQrZaslon    - QR koda do /placaj/[zeton] čez cel zaslon (tudi na
 *                       telefonu), znesek, stanje v živo (Realtime + preverba
 *                       vsake 3 s, kot v blagajni). Ko je plačano: »Plačano —
 *                       račun izdan« s povezavo do računa.
 *
 * Račun izda in davčno potrdi STREŽNIK po plačilu (lib/zahtevki.ts).
 */
import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase'
import { klicStripe } from '@/lib/stripe-connect-odjemalec'

export type ZahtevekPortal = {
  id: string
  stevilka: string | null
  stranka_ime: string
  stranka_email: string
  postavke: any[]
  znesek: number
  status: 'poslan' | 'placan' | 'potekel' | 'preklican'
  velja_do: string
  ustvarjeno: string
  poslano_ob: string | null
  opomnik_ob: string | null
  placano_ob: string | null
  vrnjeno_ob: string | null
  racun_poslan_ob: string | null
  napaka: string | null
  url: string
  racun: { id: string; invoice_number: string; eor: string | null; zoi: string | null; status: string } | null
}

export type Nedostopno = { razlog: string; povezava: string; gumb: string } | null

export const eur = (x: number) => Number(x || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

/** Ali so zahtevki na voljo (Stripe + FURS + paket) - iz /api/zahtevki. */
export function useZahtevkiNaVoljo() {
  const [stanje, setStanje] = useState<{ nalaga: boolean; nedostopno: Nedostopno }>({ nalaga: true, nedostopno: null })
  useEffect(() => {
    let velja = true
    klicStripe('/api/zahtevki').then(r => {
      if (!velja) return
      if (r.ok) setStanje({ nalaga: false, nedostopno: r.data.nedostopno ?? null })
      else setStanje({ nalaga: false, nedostopno: { razlog: r.data.error || 'Zahtevkov trenutno ni mogoče ustvariti.', povezava: '/nastavitve?razdelek=placila', gumb: 'Nastavitve' } })
    }).catch(() => velja && setStanje({ nalaga: false, nedostopno: { razlog: 'Povezava s strežnikom ni uspela.', povezava: '/nastavitve?razdelek=placila', gumb: 'Nastavitve' } }))
    return () => { velja = false }
  }, [])
  return stanje
}

export function VrstaDokumenta({ vrsta, onVrsta, naVoljo }: {
  vrsta: 'racun' | 'zahtevek'
  onVrsta: (v: 'racun' | 'zahtevek') => void
  naVoljo: ReturnType<typeof useZahtevkiNaVoljo>
}) {
  const onemogoceno = !naVoljo.nalaga && !!naVoljo.nedostopno
  const gumb = (aktiven: boolean, dis = false): React.CSSProperties => ({
    flex: 1, padding: '10px 10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    cursor: dis ? 'not-allowed' : 'pointer', background: aktiven ? '#0D1F12' : 'transparent', color: aktiven ? '#fff' : dis ? '#aaa' : '#333',
  })
  return (
    <div data-testid="vrsta-dokumenta" style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', padding: 6 }}>
      <div style={{ display: 'flex', gap: 4, background: '#F3F2EE', borderRadius: 10, padding: 3 }}>
        <button type="button" style={gumb(vrsta === 'racun')} onClick={() => onVrsta('racun')}>📄 Račun</button>
        <button type="button" data-testid="vrsta-zahtevek" disabled={onemogoceno} style={gumb(vrsta === 'zahtevek', onemogoceno)} onClick={() => !onemogoceno && onVrsta('zahtevek')}>
          💳 Zahtevek za plačilo (Stripe)
        </button>
      </div>
      {onemogoceno && naVoljo.nedostopno && (
        <div data-testid="zahtevek-nedostopno" style={{ margin: '8px 6px 4px', fontSize: 12, color: '#8A5A00', lineHeight: 1.5 }}>
          Zahtevek za plačilo s kartico ni na voljo: {naVoljo.nedostopno.razlog}{' '}
          <a href={naVoljo.nedostopno.povezava} style={{ color: '#1F6B3A', fontWeight: 700 }}>{naVoljo.nedostopno.gumb} →</a>
        </div>
      )}
      {vrsta === 'zahtevek' && (
        <div style={{ margin: '8px 6px 4px', fontSize: 12, color: '#555', lineHeight: 1.55 }}>
          Stranka plača s kartico prek Stripe — takoj s QR kodo na zaslonu ali kasneje po e-pošti.
          <strong> Račun se izda šele po plačilu</strong>, se vedno davčno potrdi in pošlje stranki na e-pošto.
        </div>
      )}
    </div>
  )
}

export function ZahtevekPoShranitvi({ zahtevek, onQr, onKonec }: {
  zahtevek: ZahtevekPortal
  onQr: (z: ZahtevekPortal) => void
  onKonec: () => void
}) {
  const [posiljam, setPosiljam] = useState(false)
  const [poslano, setPoslano] = useState<string | null>(zahtevek.poslano_ob ? zahtevek.stranka_email : null)
  const [napaka, setNapaka] = useState<string | null>(null)

  async function poslji(): Promise<ZahtevekPortal | null> {
    setPosiljam(true); setNapaka(null)
    const r = await klicStripe<{ zahtevek: ZahtevekPortal }>(`/api/zahtevki/${zahtevek.id}/poslji`, {})
    setPosiljam(false)
    if (!r.ok) { setNapaka(r.data.error || 'E-pošta ni bila poslana.'); return null }
    setPoslano(zahtevek.stranka_email)
    return r.data.zahtevek
  }

  const velik: React.CSSProperties = { width: '100%', padding: '14px 12px', borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
  return (
    <div data-testid="zahtevek-shranjen" role="dialog" aria-label="Zahtevek shranjen" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,20,18,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: 420, maxWidth: '100%', maxHeight: '100%', overflow: 'auto', padding: '24px 20px' }}>
        <div style={{ fontSize: 12, color: '#888', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Zahtevek {zahtevek.stevilka} shranjen</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#1F6B3A', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{eur(zahtevek.znesek)}</div>
        <div style={{ fontSize: 13, color: '#666' }}>{zahtevek.stranka_ime} · {zahtevek.stranka_email}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 8, lineHeight: 1.5 }}>Račun se izda, davčno potrdi in pošlje stranki šele po plačilu. Zahtevek velja do {new Date(zahtevek.velja_do).toLocaleDateString('sl-SI')}.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          <button data-testid="zahtevek-pokazi-qr" style={{ ...velik, border: 'none', background: '#0D1F12', color: '#fff' }} onClick={() => onQr(zahtevek)}>📱 Pokaži QR zdaj</button>
          <button data-testid="zahtevek-poslji" disabled={posiljam || !!poslano} style={{ ...velik, border: '1px solid #0D1F12', background: '#fff', color: '#0D1F12', opacity: poslano ? 0.6 : 1 }} onClick={() => poslji()}>
            ✉️ {poslano ? 'Poslano po e-pošti' : posiljam ? 'Pošiljam …' : 'Pošlji po e-pošti'}
          </button>
          <button data-testid="zahtevek-oboje" disabled={posiljam} style={{ ...velik, border: '1px solid #0D1F12', background: '#fff', color: '#0D1F12' }}
            onClick={async () => { const z = poslano ? zahtevek : await poslji(); if (z) onQr({ ...zahtevek, ...z }) }}>
            📱 + ✉️ Oboje
          </button>
        </div>
        {poslano && <div data-testid="zahtevek-poslano" style={{ marginTop: 10, fontSize: 13, color: '#1F6B3A' }}>✓ Zahtevek je poslan na {poslano}.</div>}
        {napaka && <div style={{ marginTop: 10, fontSize: 13, color: '#A32D2D' }}>{napaka}</div>}
        <div style={{ marginTop: 12, fontSize: 11, color: '#999', wordBreak: 'break-all' }}>
          Povezava za plačilo: <a data-testid="zahtevek-povezava" href={zahtevek.url} target="_blank" rel="noopener" style={{ color: '#666' }}>{zahtevek.url}</a>
        </div>
        <button onClick={onKonec} style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#F3F2EE', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Zahtevki za plačilo →</button>
      </div>
    </div>
  )
}

export function ZahtevekQrZaslon({ zahtevek, onZapri }: { zahtevek: ZahtevekPortal; onZapri: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [z, setZ] = useState<ZahtevekPortal>(zahtevek)
  const ziv = useRef(true)

  useEffect(() => {
    QRCode.toDataURL(zahtevek.url, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null))
  }, [zahtevek.url])

  // Realtime + preverba vsake 3 s (rezerva, ki hkrati sproži izdajo, če webhook zamudi).
  useEffect(() => {
    ziv.current = true
    const sb = createClient()
    async function preveri() {
      try {
        const r = await klicStripe<{ zahtevek: ZahtevekPortal }>(`/api/zahtevki/${zahtevek.id}`)
        if (ziv.current && r.ok) setZ(r.data.zahtevek)
      } catch {}
    }
    const kanal = sb.channel('zahtevek-' + zahtevek.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'placilni_zahtevki', filter: `id=eq.${zahtevek.id}` }, () => { preveri() })
      .subscribe()
    const t = setInterval(() => {
      // Ko je račun izdan in poslan (ali čaka na FURS), ni več kaj čakati.
      preveri()
    }, 3000)
    return () => { ziv.current = false; clearInterval(t); sb.removeChannel(kanal) }
  }, [zahtevek.id])

  const placano = z.status === 'placan'
  const izdan = placano && !!z.racun
  return (
    <div className="zahtevek-qr" data-testid="zahtevek-qr-zaslon" role="dialog" aria-label="Plačilo zahtevka">
      <style>{`
        .zahtevek-qr { position: fixed; inset: 0; z-index: 400; background: rgba(15,20,18,0.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .zahtevek-qr__okno { background: #fff; border-radius: 18px; width: 460px; max-width: 100%; max-height: 100%; overflow: auto; padding: 24px 22px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); font-family: inherit; }
        .zahtevek-qr__koda { width: min(340px, 78vw); height: min(340px, 78vw); min-width: 220px; min-height: 220px; image-rendering: pixelated; }
        @media (max-width: 767px) {
          .zahtevek-qr { padding: 0; background: #fff; }
          .zahtevek-qr__okno { width: 100%; height: 100%; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; justify-content: center; padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)); }
          .zahtevek-qr__koda { width: min(86vw, 54vh); height: min(86vw, 54vh); }
        }
        @keyframes zahtevekUtrip { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
      `}</style>
      <div className="zahtevek-qr__okno">
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888' }}>
          {placano ? 'Plačano' : 'Za plačilo'}{z.stevilka ? ` · ${z.stevilka}` : ''}
        </div>
        <div data-testid="zahtevek-znesek" style={{ fontSize: 44, fontWeight: 800, color: '#1F6B3A', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', margin: '2px 0 4px' }}>{eur(z.znesek)}</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>{z.stranka_ime}</div>

        {placano ? (
          <div data-testid="zahtevek-placano" style={{ padding: '28px 8px' }}>
            <div style={{ fontSize: 56 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1F6B3A', marginTop: 8 }}>{izdan ? 'Plačano — račun izdan' : 'Plačano'}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6, lineHeight: 1.5 }}>
              {!izdan
                ? 'Izdajam in davčno potrjujem račun …'
                : z.racun?.eor
                  ? <>Račun <strong>{z.racun.invoice_number}</strong> je davčno potrjen{z.racun_poslan_ob ? <> in poslan na {z.stranka_email}</> : ''}.</>
                  : <>Račun <strong>{z.racun?.invoice_number}</strong> je izdan, davčna potrditev še čaka.</>}
            </div>
            {z.napaka && <div data-testid="zahtevek-opozorilo" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#FFF6E5', color: '#8A5A00', fontSize: 12, lineHeight: 1.45 }}>⚠ {z.napaka}</div>}
            {izdan && (
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <a data-testid="zahtevek-racun" href={`/api/racunovodja/invoice-pdf?id=${z.racun!.id}`} target="_blank" rel="noopener" style={{ flex: 1, minWidth: 140, padding: 13, borderRadius: 10, background: '#0D1F12', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Odpri račun (PDF)</a>
                <a href="/invoices" style={{ flex: 1, minWidth: 140, padding: 13, borderRadius: 10, border: '1px solid #ddd', color: '#0D1F12', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>Računi</a>
              </div>
            )}
          </div>
        ) : z.status === 'poslan' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {qr
                ? <img data-testid="zahtevek-qr" className="zahtevek-qr__koda" src={qr} alt="QR koda za plačilo" />
                : <div className="zahtevek-qr__koda" style={{ background: '#F3F2EE', borderRadius: 12 }} />}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1F6B3A', display: 'inline-block', animation: 'zahtevekUtrip 1.2s ease-in-out infinite' }} />
              Čakam na plačilo …
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6, lineHeight: 1.45 }}>
              Stranka kodo poslika s kamero telefona in plača s kartico, Apple Pay ali Google Pay.
            </div>
            <a href={z.url} target="_blank" rel="noopener" style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 6, wordBreak: 'break-all' }}>{z.url.replace(/^https?:\/\//, '')}</a>
          </>
        ) : (
          <div data-testid="zahtevek-ne-velja" style={{ padding: '28px 8px', fontSize: 15, color: '#666' }}>
            Zahtevek je {z.status === 'potekel' ? 'potekel' : 'preklican'} — plačilo ni več mogoče.
          </div>
        )}
        <button data-testid="zahtevek-qr-zapri" onClick={onZapri} style={{ marginTop: 16, width: '100%', padding: 13, borderRadius: 10, border: '1px solid #ddd', background: 'transparent', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
          {placano ? 'Zapri' : 'Zapri (zahtevek ostane odprt)'}
        </button>
      </div>
    </div>
  )
}
