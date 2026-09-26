#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 313 — Nov zavihek "DDV po kategorijah (POS)" v Poslovnih poročilih
(apps/web/app/porocila/page.tsx).

KAJ: razčlenitev DDV izhoda POS blagajne po KATEGORIJAH ARTIKLOV (npr. Hrana
9,5 %, Pijača 22 %, Storitve...) za izbrano leto - bruto promet, davčna
osnova (neto), znesek DDV in delež posamezne kategorije v skupnem DDV
izhodu POS blagajne.

Zavihek je viden SAMO za organizacije, ki imajo povezano POS blagajno
(organizations.pos_business_id) IN so DDV zavezanci (org.vat_registered) -
za druge ni relevanten.

VIR PODATKOV: ista poizvedba (business_id + status='paid' + closed_at) kot
jo Z-poročilo v blagajni uporablja za svoj DDV izračun - vsota v tem
poročilu je zato vedno skladna z blagajniškim prometom. DDV na vrstico se
računa po ISTI formuli kot v `lib/pos-calc.ts` (razclenitevDdv): DDV stopnja
se bere z `?? 22`, NE z `|| 22`, ker bi bila sicer oproščena postavka (0 %)
napačno prešteta med 22-odstotne.

Kategorija posamezne vrstice izhaja iz kategorije artikla (item -> category);
vrstice brez artikla (storitve, service_id) so združene pod "Storitve",
ostalo pod "Ostalo".

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po tej spremembi vrne 0
napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napačen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet313.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet313.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/porocila/page.tsx',
     'apps/web/app/porocila/page.tsx: sprememba #1',
     "  const [org, setOrg] = useState<any>(null)\n  const [loading, setLoading] = useState(true)\n  const [year, setYear] = useState(new Date().getFullYear())\n  const [tab, setTab] = useState<'izkaz'|'mesecno'|'stranke'|'kategorije'>('izkaz')\n\n  const [monthlyData, setMonthlyData] = useState<MonthData[]>([])\n  const [clientData, setClientData] = useState<{ name: string; revenue: number; invoices: number }[]>([])\n  const [categoryData, setCategoryData] = useState<{ category: string; amount: number; count: number }[]>([])\n  const [totals, setTotals] = useState({ revenue: 0, expenses: 0, profit: 0, vatOut: 0, vatIn: 0, vatDue: 0 })\n\n  useEffect(() => {",
     '  const [org, setOrg] = useState<any>(null)\n  const [loading, setLoading] = useState(true)\n  const [year, setYear] = useState(new Date().getFullYear())\n  const [tab, setTab] = useState<\'izkaz\'|\'mesecno\'|\'stranke\'|\'kategorije\'|\'ddv-pos\'>(\'izkaz\')\n\n  const [monthlyData, setMonthlyData] = useState<MonthData[]>([])\n  const [clientData, setClientData] = useState<{ name: string; revenue: number; invoices: number }[]>([])\n  const [categoryData, setCategoryData] = useState<{ category: string; amount: number; count: number }[]>([])\n  // PRELET 313: DDV po kategorijah POS ARTIKLOV (za razliko od zgornje\n  // "categoryData", ki so kategorije STROŠKOV). "stopnje" hrani vse DDV\n  // stopnje, ki se pojavijo znotraj kategorije (obicajno ena, a ne vedno -\n  // npr. bar s hrano 9,5% in pijaco 22% v isti kategoriji "Pult").\n  const [posVatData, setPosVatData] = useState<{ kategorija: string; bruto: number; net: number; vat: number; stopnje: number[]; count: number }[]>([])\n  const [totals, setTotals] = useState({ revenue: 0, expenses: 0, profit: 0, vatOut: 0, vatIn: 0, vatDue: 0 })\n\n  useEffect(() => {'),
    ('apps/web/app/porocila/page.tsx',
     'apps/web/app/porocila/page.tsx: sprememba #2',
     '      })\n      setCategoryData(Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.amount - a.amount))\n\n      setLoading(false)\n    }\n    load()',
     "      })\n      setCategoryData(Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.amount - a.amount))\n\n      // PRELET 313: DDV po kategorijah POS artiklov. Ista poizvedba (business_id\n      // + status='paid' + closed_at) kot pri Z-poročilu v blagajni - tako je\n      // vsota tu vedno skladna z dejanskim blagajniškim prometom. Samo za\n      // organizacije, ki imajo povezano POS blagajno (pos_business_id).\n      if (orgData?.pos_business_id) {\n        const { data: posOrders } = await supabase\n          .from('orders')\n          .select('id, closed_at, order_lines(total, vat_rate, voided, item_id, service_id, items(category_id, categories(name)))')\n          .eq('business_id', orgData.pos_business_id)\n          .eq('status', 'paid')\n          .gte('closed_at', `${yearStart}T00:00:00`)\n          .lte('closed_at', `${yearEnd}T23:59:59`)\n\n        const posCatMap: Record<string, { bruto: number; net: number; vat: number; stopnje: Set<number>; count: number }> = {}\n        ;(posOrders ?? []).forEach((o: any) => {\n          ;(o.order_lines ?? []).forEach((l: any) => {\n            if (l.voided) return\n            const bruto = Number(l.total) || 0\n            if (bruto === 0) return\n            // OPOMBA: `?? 22`, NE `|| 22` - oproščena postavka (0%) bi bila\n            // sicer napacno prestejeta med 22% (glej razclenitevDdv v pos-calc.ts).\n            const stopnja = Number(l.vat_rate ?? 22)\n            const net = bruto / (1 + stopnja / 100)\n            const vat = bruto - net\n            const ime = l.items?.categories?.name ?? (l.service_id ? 'Storitve' : 'Ostalo')\n            if (!posCatMap[ime]) posCatMap[ime] = { bruto: 0, net: 0, vat: 0, stopnje: new Set(), count: 0 }\n            posCatMap[ime].bruto += bruto\n            posCatMap[ime].net += net\n            posCatMap[ime].vat += vat\n            posCatMap[ime].stopnje.add(stopnja)\n            posCatMap[ime].count += 1\n          })\n        })\n        setPosVatData(\n          Object.entries(posCatMap)\n            .map(([kategorija, d]) => ({ kategorija, bruto: d.bruto, net: d.net, vat: d.vat, stopnje: Array.from(d.stopnje).sort((a, b) => b - a), count: d.count }))\n            .sort((a, b) => b.vat - a.vat)\n        )\n      } else {\n        setPosVatData([])\n      }\n\n      setLoading(false)\n    }\n    load()"),
    ('apps/web/app/porocila/page.tsx',
     'apps/web/app/porocila/page.tsx: sprememba #3',
     '              {t.label}\n            </button>\n          ))}\n        </div>\n      </div>\n',
     '              {t.label}\n            </button>\n          ))}\n          {/* PRELET 313: samostojen gumb (ne del zgornjega seznama), da ni\n              treba spreminjati tipa polja "id" v "as const" seznamu zgoraj -\n              ta zavihek je na voljo samo pogojno (POS blagajna + DDV zavezanec). */}\n          {org?.pos_business_id && org?.vat_registered && (\n            <button onClick={() => setTab(\'ddv-pos\')} style={{ background: \'none\', border: 0, borderBottom: tab === \'ddv-pos\' ? \'2.5px solid #0D1F12\' : \'2.5px solid transparent\', padding: \'14px 20px\', fontSize: 13, fontWeight: tab === \'ddv-pos\' ? 600 : 400, color: tab === \'ddv-pos\' ? \'#0D1F12\' : \'#888\', cursor: \'pointer\' }}>\n              🧾 DDV po kategorijah (POS)\n            </button>\n          )}\n        </div>\n      </div>\n'),
    ('apps/web/app/porocila/page.tsx',
     'apps/web/app/porocila/page.tsx: sprememba #4',
     '            )}\n          </div>\n        )}\n      </div>\n    </div>\n    </AppLayout>',
     '            )}\n          </div>\n        )}\n\n        {/* PRELET 313: DDV PO KATEGORIJAH POS ARTIKLOV */}\n        {tab === \'ddv-pos\' && (() => {\n          const skupajVat = posVatData.reduce((s, c) => s + c.vat, 0)\n          return (\n            <div style={{ background: \'#fff\', borderRadius: 14, border: \'0.5px solid rgba(0,0,0,0.08)\', overflow: \'hidden\' }}>\n              {posVatData.length === 0 ? (\n                <div style={{ padding: 48, textAlign: \'center\', color: \'#aaa\', fontSize: 14 }}>Ni POS prodaje za {year}</div>\n              ) : (\n                <table style={{ width: \'100%\', borderCollapse: \'collapse\' }}>\n                  <thead>\n                    <tr style={{ background: \'#F7F6F2\', borderBottom: \'0.5px solid rgba(0,0,0,0.08)\' }}>\n                      {[\'Kategorija\', \'DDV stopnja\', \'Bruto promet\', \'Osnova (neto)\', \'DDV\', \'Delež DDV izhoda\'].map(h => (\n                        <th key={h} style={{ padding: \'10px 16px\', fontSize: 11, fontWeight: 700, color: \'#888\', textAlign: h === \'Kategorija\' || h === \'DDV stopnja\' ? \'left\' : \'right\', textTransform: \'uppercase\', letterSpacing: \'.04em\' }}>{h}</th>\n                      ))}\n                    </tr>\n                  </thead>\n                  <tbody>\n                    {posVatData.map((c, i) => {\n                      const pct = skupajVat > 0 ? (c.vat / skupajVat) * 100 : 0\n                      return (\n                        <tr key={i} style={{ borderBottom: \'0.5px solid rgba(0,0,0,0.05)\' }}>\n                          <td style={{ padding: \'12px 16px\', fontSize: 13, fontWeight: 500, color: \'#0D1F12\' }}>{c.kategorija}</td>\n                          <td style={{ padding: \'12px 16px\', fontSize: 12, color: \'#666\' }}>{c.stopnje.map(s => `${s}%`).join(\' + \')}</td>\n                          <td style={{ padding: \'12px 16px\', fontSize: 13, textAlign: \'right\', color: \'#666\' }}>{fmt(c.bruto)}</td>\n                          <td style={{ padding: \'12px 16px\', fontSize: 13, textAlign: \'right\', color: \'#666\' }}>{fmt(c.net)}</td>\n                          <td style={{ padding: \'12px 16px\', fontSize: 14, fontWeight: 700, color: \'#0D1F12\' }}>{fmt(c.vat)}</td>\n                          <td style={{ padding: \'12px 16px\', minWidth: 160 }}>\n                            <div style={{ display: \'flex\', alignItems: \'center\', gap: 8 }}>\n                              <div style={{ flex: 1, height: 6, background: \'#F7F6F2\', borderRadius: 3, overflow: \'hidden\' }}>\n                                <div style={{ width: `${pct}%`, height: \'100%\', background: \'#E8B547\', borderRadius: 3 }} />\n                              </div>\n                              <span style={{ fontSize: 12, color: \'#888\', width: 36, textAlign: \'right\' }}>{pct.toFixed(0)}%</span>\n                            </div>\n                          </td>\n                        </tr>\n                      )\n                    })}\n                  </tbody>\n                  <tfoot>\n                    <tr style={{ background: \'#0D1F12\', color: \'#fff\' }}>\n                      <td style={{ padding: \'12px 16px\', fontSize: 13, fontWeight: 700, color: \'#fff\' }}>SKUPAJ</td>\n                      <td />\n                      <td style={{ padding: \'12px 16px\', fontSize: 13, textAlign: \'right\', color: \'rgba(255,255,255,0.7)\' }}>{fmt(posVatData.reduce((s, c) => s + c.bruto, 0))}</td>\n                      <td style={{ padding: \'12px 16px\', fontSize: 13, textAlign: \'right\', color: \'rgba(255,255,255,0.7)\' }}>{fmt(posVatData.reduce((s, c) => s + c.net, 0))}</td>\n                      <td style={{ padding: \'12px 16px\', fontSize: 14, fontWeight: 700, color: \'#E8B547\' }}>{fmt(skupajVat)}</td>\n                      <td />\n                    </tr>\n                  </tfoot>\n                </table>\n              )}\n              <div style={{ padding: \'12px 20px\', fontSize: 11, color: \'#aaa\', borderTop: \'0.5px solid rgba(0,0,0,0.05)\' }}>\n                Samo plačani (zaključeni) POS računi za {year}. Kategorija izhaja iz kategorije artikla v Nastavitve → Kategorije & Artikli; postavke brez artikla (storitve) so združene pod "Storitve".\n              </div>\n            </div>\n          )\n        })()}\n      </div>\n    </div>\n    </AppLayout>'),

]


def aplic(repo, preveri=False):
    print(f"Repozitorij: {repo}\n")
    stevilo = 0
    for pot, opis, staro, novo in ZAMENJAVE:
        polna_pot = os.path.join(repo, pot)
        if not os.path.exists(polna_pot):
            print(f"  ! MANJKA DATOTEKA: {pot}")
            continue
        with open(polna_pot, encoding='utf-8') as f:
            vsebina = f.read()
        stevilo_pojavitev = vsebina.count(staro)
        if stevilo_pojavitev == 0:
            print(f"  ! sidro NI najdeno: {opis}")
            continue
        if stevilo_pojavitev > 1:
            print(f"  ! sidro NI EDINSTVENO ({stevilo_pojavitev}x): {opis}")
            continue
        if preveri:
            print(f"  v sidro OK: {opis}")
            stevilo += 1
            continue
        nova_vsebina = vsebina.replace(staro, novo)
        with open(polna_pot, 'w', encoding='utf-8') as f:
            f.write(nova_vsebina)
        print(f"  + aplicirano: {opis}")
        stevilo += 1

    print()
    if preveri:
        print(f"Nacin --preveri: nic ni bilo spremenjeno. ({stevilo}/{len(ZAMENJAVE)} sider OK)")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)
    else:
        print(f"PRELET 313 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet313.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
