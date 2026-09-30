import s from './landing.module.css'

/** Znak Računka (isti kot favicon in prejsnja zacetna stran). */
export default function Znak() {
  return (
    <svg className={s.logoZnak} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M82 50 C 82 28, 66 14, 46 14 C 26 14, 14 30, 14 50 C 14 70, 28 84, 46 84 C 50 84, 54 83, 58 82 L 64 92 L 64 78 C 76 72, 82 62, 82 50 Z" fill="#0E5E3B" />
      <circle cx="36" cy="46" r="5" fill="#FFFFFF" />
      <circle cx="56" cy="46" r="5" fill="#E8B547" />
      <path d="M30 60 Q 46 72, 62 60" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}
