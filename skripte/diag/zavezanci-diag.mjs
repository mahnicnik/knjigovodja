// ZACASNO (6.10.2026): analiza FURS datotek davcnih zavezancev za dolocitev sirin stolpcev.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const t0 = Date.now()
for (const vrsta of ['PO', 'DEJ']) {
  execSync(`curl -sSL -m 120 -o ${vrsta}.zip http://datoteke.durs.gov.si/DURS_zavezanci_${vrsta}.zip && unzip -o -q ${vrsta}.zip -d ${vrsta}`)
  const datoteke = execSync(`ls ${vrsta}`).toString().trim().split('\n')
  console.log(`\n===== ${vrsta}: datoteke v zipu: ${datoteke.join(', ')} (zip ${execSync(`stat -c %s ${vrsta}.zip`).toString().trim()} B)`)
  const buf = readFileSync(`${vrsta}/${datoteke[0]}`)
  console.log('prvih 16 bajtov (hex):', buf.subarray(0, 16).toString('hex'), 'BOM:', buf[0] === 0xef)
  const besedilo = buf.toString('utf8')
  const vrstice = besedilo.split(/\r?\n/).filter(v => v.length)
  console.log('vrstic:', vrstice.length, 'CRLF:', besedilo.includes('\r\n'))
  const dolz = {}
  for (const v of vrstice) dolz[v.length] = (dolz[v.length] || 0) + 1
  console.log('dolzine vrstic (znaki):', JSON.stringify(Object.entries(dolz).sort((a, b) => b[1] - a[1]).slice(0, 10)))
  let n = 0; for (const v of vrstice) if (v.length > n) n = v.length
  const pr = new Array(n).fill(0)
  for (const v of vrstice) for (let i = 0; i < n; i++) if ((v[i] ?? ' ') === ' ') pr[i]++
  const vedno = pr.map((c, i) => c === vrstice.length ? i : -1).filter(i => i >= 0)
  const obseg = []; for (const i of vedno) { const z = obseg[obseg.length - 1]; if (z && z[1] === i - 1) z[1] = i; else obseg.push([i, i]) }
  console.log('stolpci, kjer je VEDNO presledek:', JSON.stringify(obseg))
  const ne = pr.map((c, i) => [i, vrstice.length - c]).filter(([, c]) => c > 0 && c < 50)
  console.log('skoraj vedno presledek (pozicija, st. ne-presledkov):', JSON.stringify(ne.slice(0, 60)))
  const zv = {}; for (const v of vrstice) { const z = v.slice(0, 4); zv[z] = (zv[z] || 0) + 1 }
  console.log('prvi 4 znaki (pogostost):', JSON.stringify(Object.entries(zv).sort((a, b) => b[1] - a[1]).slice(0, 8)))
  for (const v of vrstice.slice(0, 3)) console.log('VZOREC|' + v + '|')
  const dolge = vrstice.filter(v => v.length !== vrstice[0].length).slice(0, 4)
  for (const v of dolge) console.log('DRUGA DOLZINA ' + v.length + '|' + v + '|')
  const brezZv = vrstice.filter(v => v.slice(0, 4) !== vrstice[0].slice(0, 4)).slice(0, 3)
  for (const v of brezZv) console.log('DRUG ZACETEK|' + v + '|')
  for (const d of ['10489568', '89481372', '10000658']) { const v = vrstice.find(x => x.includes(d)); if (v) console.log(`NAJDENO ${d} (dolzina ${v.length})|` + v + '|') }
  const zadnja = {}; for (const v of vrstice) { const z = v.slice(-2); zadnja[z] = (zadnja[z] || 0) + 1 }
  console.log('zadnja 2 znaka:', JSON.stringify(Object.entries(zadnja).sort((a, b) => b[1] - a[1]).slice(0, 20)))
}
console.log(`\nCAS ${Date.now() - t0} ms, RSS ${Math.round(process.memoryUsage().rss / 1e6)} MB, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`)
// dodatno: 268-znakovne vrstice PO in vzorci z zvezdico / brez
