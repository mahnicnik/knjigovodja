'use client'
/**
 * PLAČILO S STRIPE V BLAGAJNI (prelet 357)
 * ═════════════════════════════════════════
 *
 * StripeIzbira    - gumb »Plačaj s Stripe« v oknu za plačilo z razlago, kadar
 *                   ni na voljo (brez interneta, brez FURS).
 * StripeQrZaslon  - velika QR koda (na telefonu čez cel zaslon), znesek,
 *                   »Čakam na plačilo …«, Prekliči. Stanje prek Supabase
 *                   Realtime, vsake 3 s še preverba prek strežnika (rezerva,
 *                   ki hkrati sproži zaključek, če webhook zamudi).
 *
 * Račun zaključi in davčno potrdi STREŽNIK (lib/pos-stripe.ts). Zaslon samo
 * počaka na rezultat in ga preda blagajni za izpis. Klicatelj ga izriše s
 * key={placilo.id}, da nova koda začne s svežim stanjem.
 */
import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase'
import { klicStripe, type StripePogoji } from '@/lib/stripe-connect-odjemalec'

type Barve = { accent: string; accentSoft: string; muted: string; danger: string; chipBg: string; line: string }

export function useStripePogoji(odprto: boolean) {
  const [pogoji, setPogoji] = useState<StripePogoji | null>(null)
  const [naSpletu, setNaSpletu] = useState(true)
  useEffect(() => {
    if (typeof navigator !== 'undefined') setNaSpletu(navigator.onLine !== false)
    const on = () => setNaSpletu(true)
    const off = () => setNaSpletu(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => {
    if (!odprto) return
    let velja = true
    klicStripe('/api/pos/stripe/povezava')
      .then(r => { if (velja && r.ok) setPogoji(r.data.pogoji) })
      .catch(() => {})
    return () => { velja = false }
  }, [odprto])
  const povezan = !!pogoji && pogoji.nastavljeno && pogoji.stripeAktiven && pogoji.paketPos
  return {
    pogoji,
    naSpletu,
    /** Gumb je viden: Stripe povezan + Pro + POS + FURS certifikat. */
    vidno: povezan && !!pogoji?.fursOk,
    /** Stripe je povezan, a manjka FURS - pokažemo razlago namesto gumba. */
    manjkaFurs: povezan && !pogoji?.fursOk,
  }
}

export function StripeIzbira({ izbrano, onIzberi, stanje, znesek, T }: {
  izbrano: boolean
  onIzberi: () => void
  stanje: ReturnType<typeof useStripePogoji>
  znesek: number
  T: Barve
}) {
  if (stanje.manjkaFurs) {
    return (
      <div data-testid="stripe-ni-furs" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, background: 'rgba(184,140,40,0.1)', color: '#8A5A00', fontSize: 12, lineHeight: 1.5 }}>
        Plačilo s Stripe ni na voljo: {stanje.pogoji?.fursRazlog || 'davčno potrjevanje ni nastavljeno.'}{' '}
        <a href="/nastavitve?razdelek=blagajna" style={{ color: T.accent, fontWeight: 700 }}>Nastavitve FURS →</a>
      </div>
    )
  }
  if (!stanje.vidno) return null
  const onemogoceno = !stanje.naSpletu
  return (
    <div style={{ marginTop: 6 }}>
      <button
        data-testid="placaj-s-stripe"
        onClick={onIzberi}
        disabled={onemogoceno}
        title={onemogoceno ? 'Brez interneta plačilo s Stripe ni mogoče' : undefined}
        style={{
          width: '100%', padding: '12px 8px', borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', gap: 8,
          fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: onemogoceno ? 'not-allowed' : 'pointer',
          background: izbrano ? T.accent : T.chipBg, color: izbrano ? '#fff' : 'inherit', opacity: onemogoceno ? 0.5 : 1,
        }}>
        <span style={{ fontSize: 20 }}>📱</span>Plačaj s Stripe <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.8 }}>(QR · kartica, Apple Pay, Google Pay)</span>
      </button>
      {onemogoceno && (
        <div style={{ marginTop: 6, fontSize: 12, color: T.danger, lineHeight: 1.45 }}>
          Brez interneta plačilo s Stripe ni mogoče — stranka ne more odpreti plačilne strani in plačila ni mogoče potrditi. Izberite gotovino ali terminal.
        </div>
      )}
      {izbrano && !onemogoceno && (
        <div style={{ marginTop: 10, padding: '14px 14px', borderRadius: 12, background: T.accentSoft }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Ko pritisnete <strong>Pokaži QR kodo</strong>, se na zaslonu prikaže koda. Stranka jo poslika s telefonom in plača s kartico, Apple Pay ali Google Pay.
            Račun se po plačilu samodejno zaključi in <strong>davčno potrdi</strong>.
          </div>
          {znesek < 10 && (
            <div data-testid="stripe-mala-provizija" style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
              Pri majhnih zneskih je Stripova provizija (1,5 % + 0,25 €) relativno visoka.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export type StripePlaciloStanje = {
  id: string
  status: 'cakanje' | 'placano' | 'poteklo' | 'preklicano' | 'vrnjeno'
  znesekCenti: number
  veljaDo: string | null
  url: string
  zakljuceno: boolean
  rezultat: any
  napaka: string | null
}

const eur = (c: number) => (c / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export function StripeQrZaslon({ placilo, onPlacano, onPreklici, onNovaKoda, T, osebjeId }: {
  placilo: StripePlaciloStanje
  /** PIN-prijavljeno osebje (pravica za vracilo preverja streznik, prelet 367). */
  osebjeId?: string | null
  onPlacano: (p: StripePlaciloStanje) => void
  onPreklici: () => void
  onNovaKoda: () => void
  T: Barve
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [stanje, setStanje] = useState<StripePlaciloStanje>(placilo)
  const [preklicujem, setPreklicujem] = useState(false)
  const [napaka, setNapaka] = useState<string | null>(null)
  const [zdaj, setZdaj] = useState(Date.now())
  const koncano = useRef(false)

  useEffect(() => {
    QRCode.toDataURL(placilo.url, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null))
  }, [placilo.url])

  // Ob zaključku predaj blagajni (enkrat).
  useEffect(() => {
    if (koncano.current) return
    if (stanje.status === 'placano' && stanje.zakljuceno) {
      koncano.current = true
      onPlacano(stanje)
    }
  }, [stanje])

  // Realtime + preverba vsake 3 s.
  useEffect(() => {
    let velja = true
    const sb = createClient()
    const kanal = sb.channel('pos-stripe-' + placilo.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_placila_stripe', filter: `id=eq.${placilo.id}` }, () => { preveri() })
      .subscribe()
    async function preveri() {
      try {
        const r = await klicStripe<StripePlaciloStanje>('/api/pos/stripe/placilo?id=' + placilo.id)
        if (velja && r.ok) setStanje(r.data)
      } catch {}
    }
    const t = setInterval(preveri, 3000)
    const u = setInterval(() => setZdaj(Date.now()), 1000)
    return () => { velja = false; clearInterval(t); clearInterval(u); sb.removeChannel(kanal) }
  }, [placilo.id])

  async function preklici() {
    setPreklicujem(true)
    setNapaka(null)
    const r = await klicStripe('/api/pos/stripe/preklic', { id: placilo.id })
    setPreklicujem(false)
    if (r.data?.status === 'placano') {
      setNapaka(r.data.error || 'Stranka je že plačala.')
      const s2 = await klicStripe<StripePlaciloStanje>('/api/pos/stripe/placilo?id=' + placilo.id)
      if (s2.ok) setStanje(s2.data)
      return
    }
    if (!r.ok) { setNapaka(r.data.error || 'Preklic ni uspel.'); return }
    onPreklici()
  }

  const preostalo = stanje.veljaDo ? Math.max(0, new Date(stanje.veljaDo).getTime() - zdaj) : null
  const mm = preostalo != null ? Math.floor(preostalo / 60000) : null
  const ss = preostalo != null ? Math.floor((preostalo % 60000) / 1000) : null
  const placano = stanje.status === 'placano'
  const vrnjeno = stanje.status === 'vrnjeno'
  const [vracam, setVracam] = useState(false)
  async function vrniDenar() {
    if (!confirm(`Vrnem ${eur(stanje.znesekCenti)} stranki na kartico?`)) return
    setVracam(true); setNapaka(null)
    const r = await klicStripe('/api/pos/stripe/vracilo', { id: placilo.id, staff_id: osebjeId || null })
    setVracam(false)
    if (!r.ok) { setNapaka(r.data.error || 'Vračilo ni uspelo.'); return }
    const s2 = await klicStripe<StripePlaciloStanje>('/api/pos/stripe/placilo?id=' + placilo.id)
    if (s2.ok) setStanje(s2.data)
  }
  const poteklo = stanje.status === 'poteklo' || (stanje.status === 'cakanje' && preostalo === 0)

  return (
    <div className="pos-stripe-qr" data-testid="stripe-qr-zaslon" role="dialog" aria-label="Plačilo s Stripe">
      <style>{`
        .pos-stripe-qr { position: fixed; inset: 0; z-index: 400; background: rgba(15,20,18,0.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .pos-stripe-qr__okno { background: #fff; border-radius: 18px; width: 440px; max-width: 100%; max-height: 100%; overflow: auto; padding: 24px 22px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .pos-stripe-qr__koda { width: min(320px, 78vw); height: min(320px, 78vw); min-width: 240px; min-height: 240px; image-rendering: pixelated; }
        @media (max-width: 767px) {
          .pos-stripe-qr { padding: 0; background: #fff; }
          .pos-stripe-qr__okno { width: 100%; height: 100%; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; justify-content: center; padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)); }
          .pos-stripe-qr__koda { width: min(86vw, 58vh); height: min(86vw, 58vh); }
        }
      `}</style>
      <div className="pos-stripe-qr__okno">
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted }}>Za plačilo</div>
        <div data-testid="stripe-znesek" style={{ fontSize: 44, fontWeight: 800, color: T.accent, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', margin: '2px 0 12px' }}>{eur(stanje.znesekCenti)}</div>

        {placano ? (
          <div data-testid="stripe-placano" style={{ padding: '36px 12px' }}>
            <div style={{ fontSize: 56 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.accent, marginTop: 8 }}>Plačano</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{stanje.zakljuceno ? 'Račun je zaključen.' : 'Izdajam in davčno potrjujem račun …'}</div>
            {stanje.napaka && !stanje.zakljuceno && <div data-testid="stripe-napaka" style={{ fontSize: 12, color: T.danger, marginTop: 10, lineHeight: 1.45 }}>{stanje.napaka}</div>}
            {napaka && <div style={{ fontSize: 12, color: T.danger, marginTop: 8 }}>{napaka}</div>}
            {/* PRELET 366 (H3a): placila ni mogoce zakljuciti - prodajalec ni ujet na zaslonu. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button data-testid="stripe-placano-zapri" onClick={onPreklici} style={{ flex: 1, padding: 13, borderRadius: 10, border: '1px solid ' + T.line, background: 'transparent', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Zapri</button>
              {stanje.napaka && !stanje.zakljuceno && (
                <button data-testid="stripe-vrni-denar" onClick={vrniDenar} disabled={vracam} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {vracam ? 'Vračam …' : 'Vrni denar'}
                </button>
              )}
            </div>
          </div>
        ) : vrnjeno ? (
          <div data-testid="stripe-vrnjeno" style={{ padding: '28px 12px' }}>
            <div style={{ fontSize: 44 }}>↩️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Plačilo vrnjeno stranki</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{stanje.napaka || 'Denar je vrnjen na kartico. Račun ni zaključen.'}</div>
            <button onClick={onPreklici} style={{ marginTop: 18, width: '100%', padding: 13, borderRadius: 10, border: '1px solid ' + T.line, background: 'transparent', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Zapri</button>
          </div>
        ) : poteklo ? (
          <div data-testid="stripe-poteklo" style={{ padding: '28px 12px' }}>
            <div style={{ fontSize: 44 }}>⌛</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Koda je potekla</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>Plačilo ni bilo izvedeno. Pripravite novo kodo ali izberite drug način plačila.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={onPreklici} style={{ flex: 1, padding: 13, borderRadius: 10, border: '1px solid ' + T.line, background: 'transparent', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Zapri</button>
              <button onClick={onNovaKoda} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Nova koda</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {qr
                ? <img data-testid="stripe-qr" className="pos-stripe-qr__koda" src={qr} alt="QR koda za plačilo" />
                : <div className="pos-stripe-qr__koda" style={{ background: T.chipBg, borderRadius: 12 }} />}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="pos-stripe-utrip" style={{ width: 9, height: 9, borderRadius: '50%', background: T.accent, display: 'inline-block', animation: 'posStripeUtrip 1.2s ease-in-out infinite' }} />
              Čakam na plačilo …
            </div>
            <style>{`@keyframes posStripeUtrip { 0%,100% { opacity: .25 } 50% { opacity: 1 } }`}</style>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.45 }}>
              Stranka kodo poslika s kamero telefona in plača s kartico, Apple Pay ali Google Pay.
              {mm != null && <> Koda velja še {mm}:{String(ss).padStart(2, '0')}.</>}
            </div>
            <a href={stanje.url} target="_blank" rel="noopener" style={{ display: 'block', fontSize: 11, color: T.muted, marginTop: 6, wordBreak: 'break-all' }}>{stanje.url.replace(/^https?:\/\//, '')}</a>
            {napaka && <div style={{ fontSize: 12, color: T.danger, marginTop: 10 }}>{napaka}</div>}
            <button data-testid="stripe-preklici" onClick={preklici} disabled={preklicujem}
              style={{ marginTop: 18, width: '100%', padding: 14, borderRadius: 10, border: '1px solid ' + T.line, background: 'transparent', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', color: T.danger }}>
              {preklicujem ? 'Preklicujem …' : 'Prekliči plačilo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
