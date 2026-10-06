// ZACASNO (6.10.2026): pomen oznak v FURS datotekah zavezancev.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const pogostost = (arr) => { const m = {}; for (const x of arr) m[x] = (m[x] || 0) + 1; return JSON.stringify(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25)) }
const preberi = (vrsta) => {
  execSync(`curl -sSL -m 120 -o ${vrsta}.zip http://datoteke.durs.gov.si/DURS_zavezanci_${vrsta}.zip && unzip -o -q ${vrsta}.zip -d ${vrsta}`)
  return readFileSync(`${vrsta}/DURS_zavezanci_${vrsta}.txt`, 'utf8').split(/\r?\n/).filter(Boolean)
}
const po = preberi('PO')
console.log('PO [0] x [2]:', pogostost(po.map(v => JSON.stringify(v[0] + v[2]))))
for (const z of ['O', 'P', 'Č', 'S']) for (const v of po.filter(x => x[0] === z).slice(0, 3)) console.log(`PO ${z}|${v.slice(0, 160).trimEnd()}| FU ${v.slice(257)}`)
console.log('PO brez * (3):'); for (const v of po.filter(x => x[2] !== '*').slice(3, 6)) console.log('|' + v.slice(0, 150).trimEnd())
console.log('PO prazna maticna:', po.filter(v => !v.slice(13, 23).trim()).length, 'prazen datum:', po.filter(v => !v.slice(24, 34).trim()).length)
console.log('PO naslovi brez ", NNNN ":', po.filter(v => !/,\s*\d{4}\s/.test(v.slice(143, 257))).length, 'primeri:', JSON.stringify(po.filter(v => !/,\s*\d{4}\s/.test(v.slice(143, 257))).slice(0, 5).map(v => v.slice(143, 257).trim())))
const dej = preberi('DEJ')
console.log('DEJ [259:264]:', pogostost(dej.map(v => JSON.stringify(v.slice(259, 264)))))
for (const v of dej.filter(x => x.slice(260, 264).trim()).slice(0, 4)) console.log('DEJ z [260:264]|' + v.slice(0, 60) + '…' + JSON.stringify(v.slice(250, 310)))
console.log('DEJ [264:308] ni prazno:', dej.filter(v => v.slice(264, 308).trim()).length, 'DEJ [27] presledek:', dej.filter(v => v[27] === ' ').length, '[307] ne-presledek:', dej.filter(v => v[307] !== ' ').length)
console.log('DEJ naslovi brez ", NNNN ":', dej.filter(v => !/,\s*\d{4}\s/.test(v.slice(308, 422))).length, JSON.stringify(dej.filter(v => !/,\s*\d{4}\s/.test(v.slice(308, 422))).slice(0, 5).map(v => v.slice(308, 422).trim())))
const ime = (v) => v.slice(27, 259).trim()
console.log('DEJ najdaljse ime:', Math.max(...dej.slice(0, 100000).map(v => ime(v).length)), 'PO najdaljse ime:', po.reduce((m, v) => Math.max(m, v.slice(42, 142).trim().length), 0))
console.log('PO podvojene davcne:', po.length - new Set(po.map(v => v.slice(4, 12))).size, 'DEJ podvojene:', dej.length - new Set(dej.map(v => v.slice(0, 8))).size, 'v obeh:', dej.filter(v => new Set(po.map(x => x.slice(4, 12))).has(v.slice(0, 8))).length)
