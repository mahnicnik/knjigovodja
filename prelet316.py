#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRELET 316 — Stran "Računi" (portal, /invoices) privzeto pokaže "Ta mesec"
namesto "Vse".

KONTEKST: stran je prej privzeto prikazovala VSE izdane račune (ne "To
leto", kot je bilo omenjeno v pogovoru - v kodi je bilo dejansko 'all').
To je bilo namensko, z izrecnim komentarjem: zgornji seznam sešteva
"Neplačano" iz VSEH računov s statusom sent/overdue, zato bi ožji privzet
filter star neplačan račun tiho skril iz pogleda in bi ostal brez opomina.

POPRAVEK, dve spremembi skupaj:
1. Privzeto obdobje je zdaj 'month' ("Ta mesec") - seznam ob odprtju strani
   ne kaže več računov vseh let.
2. Da prvotni razlog za "Vse" ne odpade: NEPLAČANI/ZAPADLI računi (status
   sent/overdue) se v seznamu VEDNO prikažejo, ne glede na izbrano obdobje -
   dodatno poizvedujemo zanje in jih vključimo v seznam, tudi če njihov
   `issue_date` pade izven meseca. Nič se torej ne izgubi izpred oči, seznam
   pa je ob vsakem odprtju krajši in hitrejši za pregled.

PREVERJENO: `npx tsc --noEmit` na celotnem projektu po tej spremembi vrne
0 napak (build ima `typescript: { ignoreBuildErrors: false }`, torej bi
napačen TypeScript sicer podrl CELOTEN produkcijski build).

Uporaba:
    python3 prelet316.py --preveri /pot/do/repozitorija   # samo preveri
    python3 prelet316.py /pot/do/repozitorija              # dejansko aplicira
"""
import sys
import os

ZAMENJAVE = [
    ('apps/web/app/invoices/page.tsx',
     'apps/web/app/invoices/page.tsx: sprememba #1',
     '\n  // DODANO (Prelet 17, 17.8.2026): izbirnik obdobja za hitrejsi pregled,\n  // ko racunov postane veliko. Glej lib/period-filter.ts.\n  // POMEMBNO: privzeto \'all\' (kot doslej) - NE \'month\'. Zgornji seznam\n  // sesteva "Neplacano" iz vseh racunov s statusom sent/overdue; ce bi bil\n  // privzet ozji filter, bi stari neplacan racun tiho izginil iz pogleda\n  // in bi ostal brez opomina. Filter je na voljo za hiter pregled, a ga\n  // mora oseba izbrati sama.\n  const [periodMode, setPeriodMode] = useState<PeriodMode>(\'all\')\n  const [customFrom, setCustomFrom] = useState(\'\')\n  const [customTo, setCustomTo] = useState(\'\')\n',
     '\n  // DODANO (Prelet 17, 17.8.2026): izbirnik obdobja za hitrejsi pregled,\n  // ko racunov postane veliko. Glej lib/period-filter.ts.\n  //\n  // PRELET 316 (23.9.2026): privzeto je zdaj \'month\' ("Ta mesec") namesto\n  // \'all\' ("Vse") - seznam ob vsakem odprtju strani ne kaze vec racunov\n  // vseh let. Prvotni razlog za \'all\' (glej spodaj `load()`) ostaja\n  // resen: NEPLACANI/ZAPADLI racuni (status sent/overdue) se v seznamu\n  // VEDNO prikazejo, ne glede na izbrano obdobje - torej star neplacan\n  // racun ne more tiho izginiti iz pogleda, tudi ko je privzet filter\n  // ozji. Glej komentar v `load()`.\n  const [periodMode, setPeriodMode] = useState<PeriodMode>(\'month\')\n  const [customFrom, setCustomFrom] = useState(\'\')\n  const [customTo, setCustomTo] = useState(\'\')\n'),
    ('apps/web/app/invoices/page.tsx',
     'apps/web/app/invoices/page.tsx: sprememba #2',
     "      if (from) query = query.gte('issue_date', from)\n      if (to) query = query.lte('issue_date', to)\n      const { data: inv } = await query.order('issue_date', { ascending: false })\n      setInvoices(inv || [])\n    }\n    setLoading(false)\n  }",
     '      if (from) query = query.gte(\'issue_date\', from)\n      if (to) query = query.lte(\'issue_date\', to)\n      const { data: inv } = await query.order(\'issue_date\', { ascending: false })\n      let vsi = inv || []\n      // PRELET 316: ce je izbrano obdobje OZJE od "Vse" (torej `from`/`to`\n      // dejansko omejujeta poizvedbo), poleg tega obdobja vedno dodatno\n      // povlecemo SE VSE NEPLACANE/ZAPADLE racune ne glede na datum izdaje.\n      // Zgornji seznam ("Neplacano" v glavi strani) sesteva racune s\n      // statusom sent/overdue - ce bi ostali izven privzetega ozjega\n      // filtra, bi star neplacan racun tiho izginil iz pogleda in ostal\n      // brez opomina (natanko razlog, zaradi katerega je privzeto obdobje\n      // prej moralo ostati "Vse").\n      if (from || to) {\n        const { data: nepl } = await supabase.from(\'issued_invoices\').select(\'*\')\n          .eq(\'org_id\', o.id).in(\'status\', [\'sent\', \'overdue\'])\n        if (nepl && nepl.length > 0) {\n          const znaniIdji = new Set(vsi.map((x: any) => x.id))\n          const dodatni = nepl.filter((x: any) => !znaniIdji.has(x.id))\n          if (dodatni.length > 0) {\n            vsi = [...vsi, ...dodatni].sort((a: any, b: any) => (b.issue_date || \'\').localeCompare(a.issue_date || \'\'))\n          }\n        }\n      }\n      setInvoices(vsi)\n    }\n    setLoading(false)\n  }'),

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
        print(f"PRELET 316 uspesno apliciran ({stevilo}/{len(ZAMENJAVE)} zamenjav).")
        if stevilo != len(ZAMENJAVE):
            sys.exit(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    preveri = '--preveri' in args
    args = [a for a in args if a != '--preveri']
    if not args:
        print("Uporaba: python3 prelet316.py [--preveri] /pot/do/repozitorija")
        sys.exit(1)
    aplic(args[0], preveri=preveri)
