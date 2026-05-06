import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STATIC_UPDATES = [
  {
    title: 'Minimalna plača 2025: 1.253,90 € bruto',
    summary: 'Od 1. januarja 2025 je minimalna plača 1.253,90 € bruto mesečno. Za delodajalce pomeni višje stroške dela. Neto minimalna plača znaša približno 880 €.',
    source: 'MDDSZ',
    source_url: 'https://www.gov.si/teme/minimalna-placa/',
    category: 'zaposleni',
    severity: 'info',
    effective_date: '2025-01-01',
    expires_at: null,
  },
  {
    title: 'Prispevki s.p. 2025 — osnova se dviguje',
    summary: 'Minimalna osnova za prispevke s.p. v letu 2025 znaša 1.382,05 €. ZPIZ prispevek je 336,33 €, ZZZS pa 185,93 € mesečno. Skupaj 522,26 € za najnižji razred.',
    source: 'ZPIZ',
    source_url: 'https://www.zpiz.si/cms/content2.nsf/0/prispevki-sp',
    category: 'prispevki',
    severity: 'warning',
    effective_date: '2025-01-01',
    expires_at: null,
  },
  {
    title: 'Normirani s.p. — meja 60.000 € ostaja',
    summary: 'Normirani s.p. lahko ostanejo v normiranem sistemu do prometa 60.000 € letno (ali 300.000 € v 2 letih). Nad mejo je obvezna dejanska obdavčitev. Davčna stopnja ostaja 20%.',
    source: 'FURS',
    source_url: 'https://www.furs.gov.si/normiranci/',
    category: 'dohodnina',
    severity: 'info',
    effective_date: '2025-01-01',
    expires_at: null,
  },
  {
    title: 'DDV — obvezna registracija nad 50.000 €',
    summary: 'Podjetja z letnim prometom nad 50.000 € se morajo obvezno registrirati za DDV. Prostovoljna registracija je možna kadarkoli. DDV-O obrazec se oddaja četrtletno.',
    source: 'FURS',
    source_url: 'https://www.furs.gov.si/ddv/registracija/',
    category: 'ddv',
    severity: 'info',
    effective_date: '2025-01-01',
    expires_at: null,
  },
  {
    title: 'e-Računi: obvezni za B2G od 2025',
    summary: 'Vsa podjetja ki fakturirajo državnim organom morajo od 2025 pošiljati e-račune v formatu e-SLOG. Za B2B (med podjetji) e-račun ni obvezen, a priporočljiv.',
    source: 'FURS',
    source_url: 'https://www.furs.gov.si/eracun/',
    category: 'splosno',
    severity: 'warning',
    effective_date: '2025-01-01',
    expires_at: null,
  },
  {
    title: 'Akontacija dohodnine — rok 15. v mesecu',
    summary: 'Akontacija dohodnine se plačuje mesečno do 15. v mesecu na podlagi odločbe FURS. Za normirance je to 20% od 80% prihodkov. Zamuda pri plačilu pomeni zakonske obresti.',
    source: 'FURS',
    source_url: 'https://www.furs.gov.si/akontacija/',
    category: 'dohodnina',
    severity: 'info',
    effective_date: '2025-01-01',
    expires_at: null,
  },
]

export async function GET() {
  try {
    // Preveri ali so že novosti v bazi
    const { data: existing } = await supabase
      .from('legal_updates')
      .select('id')
      .limit(1)

    // Če že obstajajo, samo vrni uspeh
    if (existing && existing.length > 0) {
      // Počisti in osveži
      await supabase.from('legal_updates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    // Vstavi statične novosti
    const { error } = await supabase
      .from('legal_updates')
      .insert(STATIC_UPDATES)

    if (error) throw error

    return NextResponse.json({ message: 'Updated', count: STATIC_UPDATES.length })
  } catch (error: any) {
    console.error('Legal updates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}