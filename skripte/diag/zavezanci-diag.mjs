// ZACASNO (6.10.2026): dvojniki davcnih v DEJ.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
execSync('curl -sSL -m 120 -o DEJ.zip http://datoteke.durs.gov.si/DURS_zavezanci_DEJ.zip && unzip -o -q DEJ.zip -d DEJ')
const dej = readFileSync('DEJ/DURS_zavezanci_DEJ.txt', 'utf8').split(/\r?\n/).filter(Boolean)
const po = new Map(); dej.forEach((v, i) => { const d = v.slice(0, 8); (po.get(d) || po.set(d, []).get(d)).push(i) })
const dv = [...po.entries()].filter(([, ix]) => ix.length > 1)
console.log('dvojnikov:', dv.length, 'najvec ponovitev:', Math.max(...dv.map(([, ix]) => ix.length)), 'zaporedni:', dv.filter(([, ix]) => ix[ix.length - 1] - ix[0] === ix.length - 1).length)
for (const [d, ix] of dv.slice(0, 6)) { console.log('--', d); for (const i of ix) console.log(`  #${i} |${dej[i].slice(0, 120).trimEnd()}|${dej[i].slice(308, 380).trimEnd()}|${dej[i].slice(422)}`) }
const enaka = dv.filter(([, ix]) => new Set(ix.map(i => dej[i])).size === 1).length
const enakoIme = dv.filter(([, ix]) => new Set(ix.map(i => dej[i].slice(27, 264).trim())).size === 1).length
console.log('popolnoma enake vrstice:', enaka, 'enako ime:', enakoIme)
