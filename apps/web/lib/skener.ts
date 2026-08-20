/**
 * SKENIRANJE DOKUMENTOV (19.8.2026)
 *
 * Doslej se je fotografija računa poslala takšna, kot je nastala: pod kotom,
 * s senco, z mizo v ozadju. To ima dve posledici — AI slabše prebere podatke,
 * listina v hrambi pa je težko berljiva.
 *
 * Tu so čisti izračuni (brez vmesnika), da so preverljivi s testi:
 *   1. `homografija`      — matrika preslikave iz štirih kotov v pravokotnik
 *   2. `popraviPerspektivo` — poravna dokument, kot bi bil slikan naravnost
 *   3. `obdelajDokument`  — odstrani senco, pobeli ozadje, poudari besedilo
 *   4. `vPdf`             — obdelano sliko zavije v PDF za hrambo
 *
 * ⚠️ PDF NI manjši od slike, ki jo vsebuje — le ovije jo. Prihranek pride iz
 * obdelave: sivinska slika z belim ozadjem se stisne bistveno bolje kot
 * fotografija mize. PDF je smiseln zato, ker je standard za hrambo listin in
 * ga računovodski programi pričakujejo.
 */

export type Tocka = { x: number; y: number }

/**
 * Reši sistem linearnih enačb z Gaussovo eliminacijo z delnim pivotiranjem.
 * Vrne null, če je sistem singularen (npr. koti ležijo na premici).
 */
export function resiSistem(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((v, i) => [...v, b[i]])

  for (let i = 0; i < n; i++) {
    let maxV = Math.abs(M[i][i]), maxR = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > maxV) { maxV = Math.abs(M[r][i]); maxR = r }
    }
    if (maxV < 1e-10) return null
    if (maxR !== i) { const t = M[i]; M[i] = M[maxR]; M[maxR] = t }

    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i]
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]
    x[i] = s / M[i][i]
  }
  return x
}

/**
 * Homografija: preslikava iz štirih izvornih točk v štiri ciljne.
 * Vrne 9 koeficientov (h8 = 1) ali null, če preslikave ni mogoče določiti.
 */
export function homografija(izvor: Tocka[], cilj: Tocka[]): number[] | null {
  if (izvor.length !== 4 || cilj.length !== 4) return null

  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = izvor[i]
    const { x: u, y: v } = cilj[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }

  const h = resiSistem(A, b)
  return h ? [...h, 1] : null
}

/** Uporabi homografijo na točki. */
export function preslikaj(h: number[], t: Tocka): Tocka {
  const d = h[6] * t.x + h[7] * t.y + h[8]
  if (Math.abs(d) < 1e-12) return { x: 0, y: 0 }
  return {
    x: (h[0] * t.x + h[1] * t.y + h[2]) / d,
    y: (h[3] * t.x + h[4] * t.y + h[5]) / d,
  }
}

/**
 * Razvrsti štiri kote v vrstni red: zgoraj-levo, zgoraj-desno,
 * spodaj-desno, spodaj-levo. Uporabnik jih lahko povleče v poljubnem
 * vrstnem redu, preslikava pa zahteva določenega.
 */
export function urediKote(t: Tocka[]): Tocka[] {
  if (t.length !== 4) return t
  const sredX = t.reduce((s, p) => s + p.x, 0) / 4
  const sredY = t.reduce((s, p) => s + p.y, 0) / 4
  const zgoraj = t.filter(p => p.y < sredY).sort((a, b) => a.x - b.x)
  const spodaj = t.filter(p => p.y >= sredY).sort((a, b) => a.x - b.x)
  // Če razdelitev ne uspe (npr. vse točke na isti višini), vrni po kotu.
  if (zgoraj.length !== 2 || spodaj.length !== 2) {
    return [...t].sort((a, b) =>
      Math.atan2(a.y - sredY, a.x - sredX) - Math.atan2(b.y - sredY, b.x - sredX))
  }
  return [zgoraj[0], zgoraj[1], spodaj[1], spodaj[0]]
}

/**
 * Predlagana velikost poravnanega dokumenta: povprečje nasprotnih stranic,
 * da se dokument ne raztegne ali stisne.
 */
export function velikostIzKotov(koti: Tocka[]): { sirina: number; visina: number } {
  const d = (a: Tocka, b: Tocka) => Math.hypot(a.x - b.x, a.y - b.y)
  const [zl, zd, sd, sl] = koti
  const sirina = Math.round((d(zl, zd) + d(sl, sd)) / 2)
  const visina = Math.round((d(zl, sl) + d(zd, sd)) / 2)
  return { sirina: Math.max(1, sirina), visina: Math.max(1, visina) }
}

/**
 * Obdelava dokumenta: odstrani senco in pobeli ozadje.
 *
 * Deluje po načelu lokalnega praga — vsak slikovni element se primerja s
 * povprečjem svoje okolice, ne s celotno sliko. Zato senca čez polovico
 * računa ne potemni besedila, kar bi se pri navadnem pragu zgodilo.
 *
 * `podatki` so surovi RGBA (kot iz ImageData), spremenijo se na mestu.
 */
export function obdelajDokument(
  podatki: Uint8ClampedArray,
  sirina: number,
  visina: number,
  jakost = 1,
): void {
  const n = sirina * visina
  const siva = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const p = i * 4
    siva[i] = 0.299 * podatki[p] + 0.587 * podatki[p + 1] + 0.114 * podatki[p + 2]
  }

  // Povprečje okolice prek integralne slike (hitro, ne glede na polmer).
  const integral = new Float64Array((sirina + 1) * (visina + 1))
  for (let y = 0; y < visina; y++) {
    let vrsta = 0
    for (let x = 0; x < sirina; x++) {
      vrsta += siva[y * sirina + x]
      integral[(y + 1) * (sirina + 1) + (x + 1)] = integral[y * (sirina + 1) + (x + 1)] + vrsta
    }
  }

  const polmer = Math.max(8, Math.floor(Math.min(sirina, visina) / 16))

  for (let y = 0; y < visina; y++) {
    for (let x = 0; x < sirina; x++) {
      const x1 = Math.max(0, x - polmer), y1 = Math.max(0, y - polmer)
      const x2 = Math.min(sirina - 1, x + polmer), y2 = Math.min(visina - 1, y + polmer)
      const stEl = (x2 - x1 + 1) * (y2 - y1 + 1)
      const vsota =
        integral[(y2 + 1) * (sirina + 1) + (x2 + 1)]
        - integral[y1 * (sirina + 1) + (x2 + 1)]
        - integral[(y2 + 1) * (sirina + 1) + x1]
        + integral[y1 * (sirina + 1) + x1]
      const povprecje = vsota / stEl

      const v = siva[y * sirina + x]
      // Nad okolico -> ozadje (belo), pod njo -> besedilo (temno).
      // Mehak prehod, da ne nastanejo raztrgani robovi crk.
      const razlika = v - povprecje * (1 - 0.02 * jakost)
      let out = razlika > 0 ? 255 : Math.max(0, Math.min(255, 128 + razlika * 2.2))

      const p = (y * sirina + x) * 4
      podatki[p] = podatki[p + 1] = podatki[p + 2] = out
      podatki[p + 3] = 255
    }
  }
}

/**
 * Zavije JPEG (dataURL) v PDF ene strani formata A4.
 *
 * Uporablja `jspdf`, ki je ze med odvisnostmi in preizkusen. Prva razlicica
 * je PDF sestavljala rocno (xref tabela, DCTDecode objekt) - to je delovalo,
 * a je bilo tveganje, ki ga brez pregledovalnika ni bilo mogoce preveriti.
 * Pri listinah za davcno hrambo se to ne splaca.
 *
 * ⚠️ PDF NI manjsi od slike, ki jo vsebuje - le ovije jo. Prihranek pride iz
 * obdelave: sivinska slika z belim ozadjem se stisne bistveno bolje kot
 * fotografija mize.
 */
export async function vPdf(jpegDataUrl: string, sirinaPx: number, visinaPx: number): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const A4_S = 595.28, A4_V = 841.89
  const rob = 20

  const razmerje = Math.min((A4_S - 2 * rob) / sirinaPx, (A4_V - 2 * rob) / visinaPx)
  const s = sirinaPx * razmerje
  const v = visinaPx * razmerje

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  doc.addImage(jpegDataUrl, 'JPEG', (A4_S - s) / 2, (A4_V - v) / 2, s, v)
  return doc.output('blob')
}
