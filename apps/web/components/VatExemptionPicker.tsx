'use client'

import { VAT_EXEMPTIONS, VAT_EXEMPTION_GROUPS, findVatExemption } from '@/lib/vat-exemptions'

/**
 * Izbirnik klavzule o neobračunanem DDV (19.8.2026).
 *
 * Zakaj: ZDDV-1 zahteva, da račun brez obračunanega DDV navaja RAZLOG
 * (sklic na člen). V blagajni je bilo mogoče nastaviti stopnjo 0 %, razloga
 * pa ni bilo kam zapisati — listek je ostal formalno pomanjkljiv.
 *
 * Uporablja se pri artiklu, storitvi in paketu. Prikaže se SAMO, kadar je
 * izbrana stopnja 0 % — pri 9,5 % in 22 % klavzula ni potrebna.
 */
export default function VatExemptionPicker({
  vatRate,
  code,
  customText,
  onCodeChange,
  onCustomTextChange,
  inputStyle,
}: {
  vatRate: number | string | null | undefined
  code: string | null | undefined
  customText: string | null | undefined
  onCodeChange: (c: string) => void
  onCustomTextChange: (t: string) => void
  inputStyle?: any
}) {
  // Prikaži samo pri 0 %. Prazna vrednost (še ni izbrana stopnja) ne šteje.
  if (vatRate === '' || vatRate === null || vatRate === undefined) return null
  if (Number(vatRate) !== 0) return null

  const izbrana = findVatExemption(code)
  const stil = inputStyle || {
    width: '100%', padding: '9px 11px', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.12)', fontFamily: 'inherit',
    fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '12px 14px', background: 'rgba(184,140,40,0.07)', border: '1px solid rgba(184,140,40,0.25)', borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Razlog za neobračunan DDV *</div>
      <div style={{ fontSize: 11, color: '#8A5A00', marginBottom: 10, lineHeight: 1.5 }}>
        Zakon zahteva, da račun brez DDV navaja razlog. Brez tega je račun formalno pomanjkljiv.
      </div>

      <select value={code || ''} onChange={e => onCodeChange(e.target.value)} style={stil}>
        <option value="">— izberite razlog —</option>
        {VAT_EXEMPTION_GROUPS.map(g => (
          <optgroup key={g} label={g}>
            {VAT_EXEMPTIONS.filter(e => e.group === g).map(e => (
              <option key={e.code} value={e.code}>{e.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {code && code !== 'custom' && izbrana && (
        <div style={{ marginTop: 9, padding: 9, background: '#fff', borderRadius: 7, fontSize: 11, lineHeight: 1.5 }}>
          <div style={{ marginBottom: 5 }}>{izbrana.text}</div>
          <div style={{ color: '#888' }}>{izbrana.hint}</div>
          {izbrana.priglasitev && (
            <div style={{ marginTop: 7, padding: 7, background: 'rgba(184,140,40,0.12)', borderRadius: 5, color: '#8A5A00' }}>
              Za to oprostitev je potrebna <strong>predhodna priglasitev pri FURS</strong> (43. člen ZDDV-1, prek eDavkov).
            </div>
          )}
        </div>
      )}

      {code === 'custom' && (
        <textarea
          value={customText || ''}
          onChange={e => onCustomTextChange(e.target.value)}
          placeholder="Besedilo, ki vam ga je svetoval računovodja..."
          rows={2}
          style={{ ...stil, marginTop: 9, resize: 'vertical' }}
        />
      )}

      {!code && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#A32D2D' }}>
          Razlog še ni izbran — na računu bo manjkala obvezna navedba.
        </div>
      )}
    </div>
  )
}
