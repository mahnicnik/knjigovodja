'use client'

import { useState } from 'react'
import type { DdvRezultat } from '@/lib/ddv'
import { razclenitevDdv, type StranDdv } from '@/lib/ddv-razclenitev'
import { formatEurNumber } from '@/lib/format'

/**
 * Ploščica "DDV dolg" z razčlenitvijo (deli jo /kpo in /letni-pregled).
 *
 * Vrne DVA otroka mreže: ploščico in (ko je odprta) razčlenitev, ki se
 * raztegne čez celo širino (col-span-full). Starš mora biti `grid` — tako na
 * ozkem zaslonu razčlenitev ne stisne ploščic v vrstici, ampak gre pod njih.
 *
 * Vse številke so iz `ddv` (izracunajDdv, lib/ddv.ts) — tu se nič ne računa.
 *
 * Razčlenitev je PRIVZETO ODPRTA: zaprta za majhno povezavo jo je uporabnik
 * spregledal. Izhodni (+) in vhodni (−) DDV sta poleg tega vedno vidna tudi
 * na sami ploščici.
 */
export default function DdvDolgPloscica({ ddv, nalagam, napaka, naslov = 'DDV dolg', oznakaObdobja, privzetoOdprto = true }: {
  ddv: DdvRezultat | null
  nalagam?: boolean
  napaka?: string | null
  naslov?: string
  /** Človeku berljivo obdobje, npr. "Q3 2026" — enako kot za glavno številko. */
  oznakaObdobja: string
  privzetoOdprto?: boolean
}) {
  const [odprto, setOdprto] = useState(privzetoOdprto)
  const r = ddv ? razclenitevDdv(ddv) : null
  const datumi = ddv ? `${fmtDatum(ddv.od)} – ${fmtDatum(ddv.do)}` : ''

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 min-w-0">
        <div className="text-xs text-gray-500 mb-1">{naslov}</div>
        <div className="text-xl font-semibold text-orange-500">
          {ddv ? `€${formatEurNumber(ddv.obveznost)}` : nalagam ? '…' : '—'}
        </div>
        {ddv && ddv.obveznost < 0 && <div className="text-xs text-green-600 mt-1">Negativno = vračilo DDV</div>}
        {r && (
          <div className="mt-1.5 space-y-0.5 text-xs tabular-nums">
            <div className="flex justify-between gap-2"><span className="text-gray-500">Izhodni</span><span className="text-orange-600">+ €{formatEurNumber(r.izstopni.skupaj)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">Vhodni</span><span className="text-emerald-600">− €{formatEurNumber(r.vstopni.skupaj)}</span></div>
          </div>
        )}
        {napaka && <div className="text-xs text-red-500 mt-1">{napaka}</div>}
        {ddv && (
          <button type="button" onClick={() => setOdprto(o => !o)} aria-expanded={odprto}
            className="mt-2 text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2 inline-flex items-center gap-1">
            {odprto ? 'Skrij razčlenitev' : 'Pokaži razčlenitev'}
            <span aria-hidden className={`inline-block transition-transform text-[10px] ${odprto ? 'rotate-180' : ''}`}>▼</span>
          </button>
        )}
      </div>

      {odprto && ddv && r && (
        <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <div className="text-sm font-semibold text-gray-900">Razčlenitev DDV</div>
            <div className="text-xs text-gray-500">
              Obdobje: <span className="font-medium text-gray-700">{oznakaObdobja}</span> · {datumi}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Stran naslov="Izhodni DDV" podnaslov="DDV, ki si ga obračunal — povečuje obveznost"
              znak="+" barva="text-orange-600" ozadje="bg-orange-50" stran={r.izstopni} />
            <Stran naslov="Vhodni DDV" podnaslov="DDV, ki so ti ga obračunali — odbiješ ga"
              znak="−" barva="text-emerald-600" ozadje="bg-emerald-50" stran={r.vstopni} />
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="text-xs text-gray-500">
              DDV obveznost = izhodni <span className="text-orange-600">€{formatEurNumber(r.izstopni.skupaj)}</span>
              {' '}− vhodni <span className="text-emerald-600">€{formatEurNumber(r.vstopni.skupaj)}</span>
            </div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums">
              = €{formatEurNumber(r.obveznost)}{r.obveznost < 0 ? ' (vračilo)' : ''}
            </div>
          </div>
          {/* Kontrola (lib/ddv-razclenitev.ts): vsota virov se mora ujemati z
              glavno številko na ploščici. Če se ne, raje to povemo. */}
          {!r.ujemanje && (
            <div className="mt-2 text-xs text-red-600">
              Opozorilo: vsota razčlenitve se ne ujema z obveznostjo na ploščici. Prosimo, sporočite podpori.
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Stran({ naslov, podnaslov, znak, barva, ozadje, stran }: {
  naslov: string; podnaslov: string; znak: '+' | '−'; barva: string; ozadje: string; stran: StranDdv
}) {
  return (
    <div className={`rounded-xl ${ozadje} p-3 sm:p-4 min-w-0`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">{naslov}</div>
        <div className={`text-base font-semibold tabular-nums ${barva}`}>{znak} €{formatEurNumber(stran.skupaj)}</div>
      </div>
      <div className="text-xs text-gray-500 mb-3">{podnaslov}</div>
      <ul className="space-y-2.5">
        {stran.viri.map(v => {
          const prazen = v.ddv === 0 && v.osnova === 0
          return (
            <li key={v.kljuc} className={prazen ? 'opacity-50' : ''}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-gray-800 font-medium min-w-0">{v.oznaka}</span>
                <span className={`tabular-nums font-medium shrink-0 ${prazen ? 'text-gray-400' : barva}`}>{znak} €{formatEurNumber(v.ddv)}</span>
              </div>
              <div className="text-[11px] text-gray-400 leading-tight">{v.opis}</div>
              {v.poStopnjah.length > 0 && (
                <ul className="mt-1 pl-3 border-l border-gray-200 space-y-0.5">
                  {v.poStopnjah.map(s => (
                    <li key={s.stopnja} className="flex items-baseline justify-between gap-2 text-[11px] text-gray-500">
                      <span className="min-w-0">{s.oznaka} <span className="text-gray-400">· osnova €{formatEurNumber(s.osnova)}</span></span>
                      <span className="tabular-nums shrink-0">€{formatEurNumber(s.ddv)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function fmtDatum(d: string) {
  const [l, m, dan] = d.split('-').map(Number)
  return `${dan}. ${m}. ${l}`
}
