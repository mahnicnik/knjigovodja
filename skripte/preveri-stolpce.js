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

// ─── Dodatno: branje polj iz objektov, ki v tabeli ne obstajajo ────────
//
// Napaka, ki jo to lovi (21.8.2026): koda je pri artiklih brala `min_stock`,
// ta stolpec pa ima tabela `ingredients`, NE `items` (tam je `low_stock`).
// Vrednost je bila vedno undefined, zato pogoj `min_stock > 0` nikoli ni
// drzal in filter "Pod minimum" ni mogel vrniti nicesar - brez napake.
//
// Preverimo le nekaj znanih parov, kjer se imena med tabelami razlikujejo.
const SUMLJIVI_PARI = [
  { polje: 'min_stock',  obstaja_v: ['ingredients', 'inventory_items'], ne_v: 'items', namesto: 'low_stock' },
  { polje: 'current_stock', obstaja_v: ['inventory_items'],             ne_v: 'items', namesto: 'stock' },
];

const opozorila = [];
for (const dat of datoteke) {
  // Preverjamo SAMO blagajno: druge strani (npr. /zaloge) uporabljajo tabelo
  // `inventory_items`, ki `min_stock` in `current_stock` res ima - tam bi
  // opozorila bila lazna.
  if (!dat.includes('app/pos/')) continue;
  const vsebina = fs.readFileSync(dat, 'utf8');
  const vrstice = vsebina.split('\n');
  vrstice.forEach((v, i) => {
    if (v.trim().startsWith('//') || v.trim().startsWith('*')) return;
    for (const p of SUMLJIVI_PARI) {
      // isci vzorce tipa "it.min_stock" ali "item.min_stock"
      const rx = new RegExp('\\b(it|item|artikel|i)\\.' + p.polje + '\\b');
      if (rx.test(v)) {
        opozorila.push(`${dat}:${i + 1}  ".${p.polje}" — tabela "${p.ne_v}" tega stolpca NIMA (uporabite "${p.namesto}")`);
      }
    }
  });
}

if (opozorila.length > 0) {
  console.log(`\nOPOZORILA (${opozorila.length}) — preverite, na katero tabelo se nanaša:\n`);
  opozorila.forEach(o => console.log('  ! ' + o));
  console.log('\n  (Če gre za surovino ali inventuro, je uporaba pravilna — to je le opozorilo.)');
}

// ─── Nedefinirana imena v blagajni ────────────────────────────────────
//
// `app/pos/page.tsx` ima `@ts-nocheck`, zato prevajalnik NE javi nedefiniranih
// spremenljivk. To je 21.8.2026 povzročilo tri sesutja v produkciji:
// "brisCust is not defined" (rezervacije), "stats is not defined" (zaključek
// blagajne, bela stran) in "db is not defined" (tiskanje računa).
//
// Ta preverba začasno odstrani `@ts-nocheck` in poišče SAMO napake TS2304
// (neznano ime). Ostale tipske neskladnosti pusti pri miru — teh je še ~380
// in niso vzrok sesutij.
const { execSync } = require('child_process');
const posPot = 'apps/web/app/pos/page.tsx';

if (fs.existsSync(posPot)) {
  const izvirnik = fs.readFileSync(posPot, 'utf8');
  try {
    fs.writeFileSync(posPot, izvirnik.replace(/^\/\/ @ts-nocheck/, '// (preverjanje)'));
    let izpis = '';
    try {
      execSync('npx tsc --noEmit', { cwd: 'apps/web', stdio: 'pipe' });
    } catch (e) {
      izpis = (e.stdout || '').toString();
    }
    const neznana = izpis.split('\n').filter(v => v.includes('TS2304'));
    if (neznana.length > 0) {
      console.log(`\nNEDEFINIRANA IMENA V BLAGAJNI (${neznana.length}) — vsako je možno sesutje:\n`);
      neznana.forEach(v => console.log('  ✗ ' + v.trim()));
    } else {
      console.log('\nNedefiniranih imen v blagajni ni.');
    }
  } finally {
    fs.writeFileSync(posPot, izvirnik);   // vedno vrni izvirnik
  }
}
