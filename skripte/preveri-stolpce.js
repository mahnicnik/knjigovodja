const fs = require('fs');
const path = require('path');

const shema = JSON.parse(fs.readFileSync(path.join(__dirname, 'shema-baze.json'), 'utf8'));
const stolpci = {};
for (const [t, c] of Object.entries(shema)) stolpci[t] = new Set(c.split(','));

// Zberi vse .ts/.tsx datoteke
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

const datoteke = najdi('apps/web');
const napake = [];

for (const dat of datoteke) {
  const vsebina = fs.readFileSync(dat, 'utf8');
  const vrstice = vsebina.split('\n');

  // Poišči .from('tabela') in nato v naslednjih ~8 vrsticah preveri
  // .eq('stolpec', ...), .order('stolpec'), .gte/.lte/.lt/.gt/.neq/.is/.in
  for (let i = 0; i < vrstice.length; i++) {
    const m = vrstice[i].match(/\.from\(['"](\w+)['"]\)/);
    if (!m) continue;
    const tabela = m[1];
    if (!stolpci[tabela]) continue; // tabele ne poznamo (view ipd.)

    const okno = vrstice.slice(i, Math.min(i + 10, vrstice.length)).join('\n');
    // ustavi se ob naslednjem .from(
    const naslednji = okno.indexOf('.from(', 20);
    const odsek = naslednji > 0 ? okno.slice(0, naslednji) : okno;

    const re = /\.(eq|neq|gt|gte|lt|lte|is|in|order|like|ilike)\(\s*['"]([\w.]+)['"]/g;
    let mm;
    while ((mm = re.exec(odsek)) !== null) {
      const metoda = mm[1];
      let stolpec = mm[2];
      // preskoci vgnezdene reference tipa "orders.status"
      if (stolpec.includes('.')) {
        const [tab, col] = stolpec.split('.');
        if (stolpci[tab] && !stolpci[tab].has(col)) {
          napake.push(`${dat}:${i + 1}  ${tabela} → .${metoda}('${stolpec}')  — stolpec "${col}" NE OBSTAJA v "${tab}"`);
        }
        continue;
      }
      if (!stolpci[tabela].has(stolpec)) {
        napake.push(`${dat}:${i + 1}  ${tabela} → .${metoda}('${stolpec}')  — stolpec NE OBSTAJA`);
      }
    }
  }
}

if (napake.length === 0) {
  console.log('Ni najdenih neobstoječih stolpcev v filtrih/razvrščanju.');
} else {
  console.log(`NAJDENIH ${napake.length} SUMLJIVIH MEST:\n`);
  napake.forEach(n => console.log(' • ' + n));
}
