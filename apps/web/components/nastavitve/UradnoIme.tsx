'use client'
/**
 * Opozorilo, ko se ime podjetja v Računku razlikuje od uradnega v registru
 * (hotfix 5.10.2026).
 *
 * Banke od 9. 10. 2025 pred vsakim plačilom preverijo ime prejemnika
 * (Verification of Payee). Ime iz Nastavitev gre na račun in v UPN QR kodo;
 * če ni enako uradnemu, plačnik ob skeniranju vidi »Ni ujemanja« in plačilo
 * pogosto opusti. Primer: v Računku »Domen Kocjan s.p.«, v registru
 * »HFP, Domen Kocjan s.p.«.
 *
 * Uradno ime pride iz /api/company-lookup (isti vir kot samodejno
 * izpolnjevanje stranke na računu). Če iskanje ne uspe, opozorila ni.
 *
 * Oktober 2026: vir je register FURS, kjer so imena z VELIKIMI črkami.
 * Primerjava (soUradnoIme) ne loči velikih in malih črk, zato »Domen Kocjan
 * s.p.« ustreza »DOMEN KOCJAN S.P.«. Gumb ponudi berljiv zapis uradnega imena
 * (berljivoIme: besede iz trenutnega imena ohranijo zapis, s.p. ostane mali),
 * ki se z uradnim ujema.
 */
import { useEffect, useState } from 'react'
import { soUradnoIme } from '@/lib/upn-qr'
import { berljivoIme } from '@/lib/berljivo-ime'

export default function UradnoIme({ davcna, ime, onUporabi }: {
  davcna: string
  ime: string
  onUporabi: (uradno: string) => void
}) {
  // Rezultat si zapomnimo skupaj z davčno, za katero velja – ob spremembi
  // davčne se staro uradno ime ne pokaže (brez ponastavljanja v učinku).
  const [najdeno, setNajdeno] = useState<{ st: string; ime: string } | null>(null)
  const st = String(davcna || '').replace(/^SI/i, '').replace(/\s/g, '')

  useEffect(() => {
    if (!/^\d{8}$/.test(st)) return
    let preklicano = false
    fetch(`/api/company-lookup?tax=${st}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!preklicano && d?.dolgo_ime) setNajdeno({ st, ime: String(d.dolgo_ime).trim() }) })
      .catch(() => {})
    return () => { preklicano = true }
  }, [st])

  const uradno = najdeno?.st === st ? najdeno.ime : null
  if (!uradno || !ime.trim()) return null

  if (soUradnoIme(ime, uradno)) {
    return (
      <div data-testid="uradno-ime-ok" style={{ fontSize: 11, color: '#1F6B3A', marginTop: 5 }}>
        ✓ Ime se ujema z uradnim imenom v registru (banke ga preverjajo pri plačilih).
      </div>
    )
  }

  // Predlog je enak uradnemu imenu (razen velikih/malih črk); če ga zapis
  // kakor koli ne bi ohranil, ponudimo dobesedno uradno ime.
  const predlog = soUradnoIme(berljivoIme(uradno, ime), uradno) ? berljivoIme(uradno, ime) : uradno

  return (
    <div data-testid="uradno-ime-opozorilo" style={{ marginTop: 8, padding: '10px 12px', background: '#FFF7E6', border: '1px solid #F5D49A', borderRadius: 10, fontSize: 12, color: '#7A4B00', lineHeight: 1.55 }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>⚠ Ime se razlikuje od uradnega imena v registru</div>
      V registru: <strong>{uradno}</strong>. To ime je na vaših računih in v QR kodi za plačilo.
      Banke pred vsakim plačilom preverijo ime prejemnika – če se ne ujema z uradnim, plačnik ob
      skeniranju QR kode vidi opozorilo <strong>»Ni ujemanja«</strong>.
      <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" data-testid="uporabi-uradno-ime" onClick={() => onUporabi(predlog)}
          style={{ background: '#7A4B00', color: '#fff', border: 0, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Uporabi uradno ime
        </button>
        <span style={{ fontSize: 11 }}>Vpiše se <strong data-testid="predlog-uradnega-imena">{predlog}</strong>, nato kliknite <strong>Shrani</strong> zgoraj desno.</span>
      </div>
    </div>
  )
}
