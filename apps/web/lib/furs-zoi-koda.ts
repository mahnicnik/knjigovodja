/**
 * 60-MESTNA KODA IZ ZOI — vsebina QR kode na računu (prelet 158)
 * ═══════════════════════════════════════════════════════════════
 *
 * Pravilnik o izvajanju ZDavPR in FURS "Postopki potrjevanja" predpisujeta,
 * da QR koda na računu vsebuje 60 numeričnih mest:
 *
 *   1) ZOI, pretvorjen iz šestnajstiškega v desetiški zapis,
 *      z vodilnimi ničlami dopolnjen na 39 mest,
 *   2) davčna številka zavezanca — 8 mest,
 *   3) datum in čas izdaje računa v obliki LLMMDDUUMMSS — 12 mest
 *      (LL = zadnji dve števki leta),
 *   4) kontrolni znak — vsota vseh 59 številk po modulu 10.
 *
 * QR koda se izriše z ravnjo odprave napak "L". FURS-ova mobilna aplikacija
 * "Preveri račun" zna prebrati SAMO to kodo — ne EOR-ja in ne spletne
 * povezave, kar je blagajna QR-irala doslej.
 */

/** ZOI (32 šestnajstiških znakov) → desetiški zapis na točno 39 mestih. */
export function zoiVDesetiskem(zoiHex: string): string {
  const cist = String(zoiHex || '').toLowerCase().replace(/[^0-9a-f]/g, '')
  if (cist.length !== 32) {
    throw new Error('ZOI mora imeti 32 šestnajstiških znakov, ima ' + cist.length)
  }
  return BigInt('0x' + cist).toString(10).padStart(39, '0')
}

/** Celotna 60-mestna koda za QR/PDF417/Code128 po Pravilniku. */
export function zoi60(zoiHex: string, davcnaStevilka: string | number, casIzdaje: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const d = casIzdaje
  const datum =
    p(d.getFullYear() % 100) + p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())

  const davcna = String(davcnaStevilka).replace(/\D/g, '')
  if (davcna.length !== 8) {
    throw new Error('Davčna številka mora imeti 8 števk (brez predpone SI): "' + davcna + '"')
  }

  const osnova = zoiVDesetiskem(zoiHex) + davcna + datum
  let vsota = 0
  for (const znak of osnova) vsota += znak.charCodeAt(0) - 48
  return osnova + String(vsota % 10)
}
