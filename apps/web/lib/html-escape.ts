/**
 * Ubezanje posebnih znakov pri gradnji HTML.
 *
 * DODANO (17.8.2026): na 44 mestih se je uporabnikov vnos - ime artikla, naziv
 * podjetja, razlog storna, ime stranke - vstavljal v HTML brez ubezanja.
 *
 * Posledici sta dve. Prva je vsakdanja: ime artikla, ki vsebuje znak "<" ali
 * "&", pokvari oblikovanje racuna. Druga je resnejsa: vnos, ki vsebuje HTML,
 * se izvede v oknu za tiskanje.
 */
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
