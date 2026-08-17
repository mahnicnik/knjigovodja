/**
 * Skupen slovenski zapis zneskov za PRIKAZ uporabniku (Prelet 16, 17.8.2026).
 *
 * POMEMBNO: uporabljaj SAMO za prikaz v UI (JSX besedilo). NIKOLI za:
 * - vrednosti, ki gredo v FURS XML (tam mora ostati "1234.56", pika)
 * - vrednosti, ki gredo v Stripe API
 * - vrednosti, shranjene v bazo ali uporabljene v nadaljnjih izračunih
 * Za te primere ostane Number(x.toFixed(2)) oz. .toFixed(2) kot doslej.
 *
 * Prej je bilo po kodi razpršenih ~30 lokalnih kopij `fmt()` z Intl.NumberFormat,
 * in vzporedno ~400 mest z golim `€${x.toFixed(2)}` (angleška oblika,
 * pika namesto vejice - "€1234.56" namesto "1.234,56 €"). To je ena
 * skupna implementacija, da se zapis ne razhaja med stranmi.
 */
export function formatEur(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(num)
}

/** Isto, brez simbola valute - kadar je € že izpisan posebej. */
export function formatEurNumber(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  return new Intl.NumberFormat('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
}
