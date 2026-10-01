/**
 * PRELET 360: JAVNA STRAN ZAHTEVKA ZA PLACILO (/placaj/[zeton]).
 *
 * Stranka pride iz e-poste ali s QR kode na zaslonu prodajalca. Vidi podjetje,
 * logotip, postavke in znesek ter gumb "Plačaj s kartico" (obrazec ->
 * /api/placaj/[zeton] -> Stripe Checkout). Placan, potekel ali preklican
 * zahtevek dobi stran z razlago - placila ni vec mogoce zaceti.
 */
import { adminSupabase } from '@/lib/stripe-connect'
import { jeVeljavenZeton, prikazanoStanje, type Postavka } from '@/lib/zahtevki'
import { logotipUrl } from '@/lib/logotip'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plačilo — Računko', robots: { index: false } }

const eur = (x: number) => x.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const kol = (k: number) => (Number.isInteger(k) ? String(k) : String(k).replace('.', ','))

function Okvir({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', background: '#F6F5F1', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1A1A1A' }}>
      <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 18, padding: '28px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginTop: 'min(6vh, 48px)' }}>
        {children}
      </div>
    </main>
  )
}

function Sporocilo({ ikona, naslov, besedilo, podjetje }: { ikona: string; naslov: string; besedilo: ReactNode; podjetje?: string | null }) {
  return (
    <Okvir>
      <div data-testid="placaj-stanje" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 46, marginBottom: 10 }}>{ikona}</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{naslov}</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.55, margin: 0 }}>{besedilo}</p>
        {podjetje && <p style={{ fontSize: 12, color: '#999', marginTop: 18 }}>{podjetje}</p>}
      </div>
    </Okvir>
  )
}

export default async function PlacajStran({ params, searchParams }: { params: Promise<{ zeton: string }>; searchParams: Promise<{ napaka?: string }> }) {
  const { zeton } = await params
  const { napaka } = await searchParams
  const nenajden = <Sporocilo ikona="🔎" naslov="Zahtevek ni najden" besedilo="Povezava ni pravilna ali je zahtevek izbrisan. Preverite povezavo v e-pošti ali se obrnite na prodajalca." />
  if (!jeVeljavenZeton(zeton)) return nenajden
  const admin = adminSupabase()
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('zeton', zeton).maybeSingle()
  if (!z) return nenajden
  const { data: org } = await admin.from('organizations').select('name, address, post_code, city, tax_number, logo_url, logo_nastavitve, email').eq('id', z.org_id).single()
  const podjetje = org?.name || ''
  const stanje = prikazanoStanje(z)

  if (stanje === 'placan') {
    return <Sporocilo ikona="✅" naslov="Zahtevek je plačan" podjetje={podjetje}
      besedilo={<>Hvala! Plačilo {eur(Number(z.znesek))} je prejeto. Davčno potrjen račun pošljemo na {z.stranka_email}.</>} />
  }
  if (stanje === 'potekel') {
    return <Sporocilo ikona="⌛" naslov="Zahtevek je potekel" podjetje={podjetje}
      besedilo={<>Rok za plačilo tega zahtevka je potekel {new Date(z.velja_do).toLocaleDateString('sl-SI')}. Če želite plačati, prosite {podjetje || 'prodajalca'} za nov zahtevek.</>} />
  }
  if (stanje === 'preklican') {
    return <Sporocilo ikona="🚫" naslov="Zahtevek je preklican" podjetje={podjetje}
      besedilo={<>{podjetje || 'Prodajalec'} je ta zahtevek preklical, zato plačilo ni več mogoče. Za vprašanja se obrnite neposredno nanj{org?.email ? <> ({org.email})</> : null}.</>} />
  }

  const logo = org ? logotipUrl(org) : null
  const postavke: Postavka[] = Array.isArray(z.postavke) ? z.postavke : []
  return (
    <Okvir>
      <div data-testid="placaj-zahtevek">
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          {logo && <img src={logo} alt={podjetje} style={{ maxWidth: 180, maxHeight: 64, objectFit: 'contain', marginBottom: 10 }} />}
          <div style={{ fontSize: 17, fontWeight: 700 }}>{podjetje}</div>
          {org?.address && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{org.address}{org.city ? `, ${org.post_code || ''} ${org.city}` : ''}</div>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888' }}>Zahtevek za plačilo{z.stevilka ? ` ${z.stevilka}` : ''}</div>
        <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>za {z.stranka_ime}</div>

        <div style={{ marginTop: 14, borderTop: '1px solid #eee' }}>
          {postavke.map((p, i) => {
            const znesek = p.quantity * p.unit_price * (1 - (p.discount_pct || 0) / 100) * (1 + p.vat_rate / 100)
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #f2f2f2' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{p.description}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {kol(p.quantity)} × {eur(p.unit_price)}{p.discount_pct ? ` · popust ${kol(p.discount_pct)} %` : ''}{p.vat_rate ? ` · DDV ${kol(p.vat_rate)} %` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{eur(Math.round(znesek * 100) / 100)}</div>
              </div>
            )
          })}
        </div>
        {Number(z.ddv) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginTop: 10 }}>
            <span>Osnova {eur(Number(z.znesek_neto))} · DDV</span><span>{eur(Number(z.ddv))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Za plačilo</span>
          <span data-testid="placaj-znesek" style={{ fontSize: 30, fontWeight: 800, color: '#1F6B3A', letterSpacing: '-0.02em' }}>{eur(Number(z.znesek))}</span>
        </div>

        {napaka && <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#FDECEC', color: '#A32D2D', fontSize: 13 }}>{napaka}</div>}

        <form method="POST" action={`/api/placaj/${encodeURIComponent(zeton)}`} style={{ marginTop: 18 }}>
          <button data-testid="placaj-s-kartico" type="submit" style={{ width: '100%', padding: '16px 12px', borderRadius: 12, border: 'none', background: '#1F6B3A', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Plačaj s kartico
          </button>
        </form>
        <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
          Kartica, Apple Pay ali Google Pay · varno plačilo prek Stripe.<br />
          Zahtevek velja do {new Date(z.velja_do).toLocaleDateString('sl-SI')}. Davčno potrjen račun prejmete po e-pošti takoj po plačilu.
        </div>
      </div>
    </Okvir>
  )
}
