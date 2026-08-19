const fs = require('fs');
const path = require('path');

/**
 * Išče slovenska besedila v vmesniku, ki bi morala imeti šumnike (č, š, ž),
 * pa jih nimajo. Deluje na seznamu znanih besed.
 *
 * Namenoma NE pregleduje komentarjev (// in /* *\/), ker so ti v kodi
 * namenoma brez šumnikov.
 */

const BESEDE = [
  // beseda brez šumnika -> pravilna
  ['Clanarina', 'Članarina'], ['clanarina', 'članarina'],
  ['Claenarina', 'Članarina'],
  ['Casovna', 'Časovna'], ['casovna', 'časovna'],
  ['Predplacilo', 'Predplačilo'], ['predplacilo', 'predplačilo'],
  ['Racun', 'Račun'], ['racun', 'račun'],
  ['Racuni', 'Računi'], ['racuni', 'računi'],
  ['Storitve', null], // ok
  ['Zakljucek', 'Zaključek'], ['zakljucek', 'zaključek'],
  ['Zakljuci', 'Zaključi'], ['zakljuci', 'zaključi'],
  ['Porocilo', 'Poročilo'], ['porocilo', 'poročilo'],
  ['Porocila', 'Poročila'], ['porocila', 'poročila'],
  ['Stevilo', 'Število'], ['stevilo', 'število'],
  ['Stevilka', 'Številka'], ['stevilka', 'številka'],
  ['Kolicina', 'Količina'], ['kolicina', 'količina'],
  ['Uporabnisko', 'Uporabniško'],
  ['Placilo', 'Plačilo'], ['placilo', 'plačilo'],
  ['Placila', 'Plačila'], ['placila', 'plačila'],
  ['Placaj', 'Plačaj'], ['placaj', 'plačaj'],
  ['Popravljeno', null],
  ['Prekliči', null],
  ['Vracilo', 'Vračilo'], ['vracilo', 'vračilo'],
  ['Vracila', 'Vračila'], ['vracila', 'vračila'],
  ['Napacna', 'Napačna'], ['napacna', 'napačna'],
  ['Napacen', 'Napačen'], ['napacen', 'napačen'],
  ['Sifra', 'Šifra'], ['sifra', 'šifra'],
  ['Zaposleni', null],
  ['Nasa', 'Naša'],
  ['Dolzina', 'Dolžina'],
  ['Sluzbeni', 'Službeni'],
  ['Drzava', 'Država'],
  ['Zelim', 'Želim'],
  ['Kljuc', 'Ključ'],
  ['Obracun', 'Obračun'], ['obracun', 'obračun'],
  ['Prispevek', null],
  ['Dnevnica', null],
  ['Potrjeno', null],
  ['Prostor', null],
  ['Miza', null],
  ['Uspesno', 'Uspešno'], ['uspesno', 'uspešno'],
  ['Neuspesno', 'Neuspešno'],
  ['Prezivi', 'Preživi'],
  ['Kupec', null],
];

const parne = BESEDE.filter(b => b[1] !== null);

function najdi(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '.next' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) najdi(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

/** Odstrani komentarje, da jih ne pregledujemo. */
function brezKomentarjev(vrstica) {
  const i = vrstica.indexOf('//');
  let v = i >= 0 ? vrstica.slice(0, i) : vrstica;
  v = v.replace(/\/\*[\s\S]*?\*\//g, '');
  return v;
}

const najdbe = [];
for (const dat of najdi('apps/web')) {
  const vrstice = fs.readFileSync(dat, 'utf8').split('\n');
  vrstice.forEach((vrstica, i) => {
    const v = brezKomentarjev(vrstica);
    // Zanimajo nas samo nizi (v narekovajih) — to je besedilo za uporabnika.
    const nizi = v.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g) || [];
    for (const niz of nizi) {
      for (const [napak, prav] of parne) {
        // cela beseda
        const rx = new RegExp('\\b' + napak + '\\b');
        if (rx.test(niz)) {
          najdbe.push({ dat, vrstica: i + 1, napak, prav, kontekst: niz.slice(0, 70) });
        }
      }
    }
  });
}

if (najdbe.length === 0) {
  console.log('Ni najdenih besedil brez šumnikov.');
} else {
  console.log(`NAJDENIH ${najdbe.length} BESEDIL BREZ ŠUMNIKOV:\n`);
  const poDatoteki = {};
  najdbe.forEach(n => {
    (poDatoteki[n.dat] = poDatoteki[n.dat] || []).push(n);
  });
  for (const [dat, sez] of Object.entries(poDatoteki)) {
    console.log(`\n${dat}  (${sez.length})`);
    sez.slice(0, 12).forEach(n =>
      console.log(`   ${n.vrstica}: "${n.napak}" → "${n.prav}"   ${n.kontekst}`));
    if (sez.length > 12) console.log(`   … in še ${sez.length - 12}`);
  }
}
