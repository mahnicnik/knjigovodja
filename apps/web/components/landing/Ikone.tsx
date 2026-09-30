export function Kljukica({ className, velikost = 16 }: { className?: string; velikost?: number }) {
  return (
    <svg className={className} width={velikost} height={velikost} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 4.5 6.5 11 3 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Ura({ velikost = 18 }: { velikost?: number }) {
  return (
    <svg width={velikost} height={velikost} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 6v4.2l2.8 1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
