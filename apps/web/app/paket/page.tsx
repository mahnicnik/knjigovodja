import Link from 'next/link'
import { potrebenPaket, IME_PAKETA, type Funkcija } from '@/lib/paket'

/**
 * FUNKCIJA NI V PAKETU (revizija paketov, 6.10.2026)
 *
 * Sem middleware PREPISE (rewrite, ne preusmeri) strani paketa, ki jih
 * organizacija nima: /pos, /zaloge, /ai, /scan, /banka. Naslov v brskalniku
 * ostane isti - namizna aplikacija vsako drugo pot vrne na /pos, zato bi
 * preusmeritev pomenila neskoncno zanko.
 *
 * Podatki se ne brisejo: racuni, KPO in dnevni zakljucki ostanejo dostopni.
 */

const OPIS: Partial<Record<Funkcija, string>> = {
  pos: 'Blagajna (mize, delitev računa, popusti, kuhinjski zaslon, člani in koledar)',
  zaloge: 'Zaloge, normativi in inventura',
  ai: 'AI računovodja',
  skener: 'Skener stroškov',
  uvoz_banke: 'Uvoz bančnega izpiska',
}

export default async function PaketPage({ searchParams }: { searchParams: Promise<{ funkcija?: string }> }) {
  const { funkcija: f } = await searchParams
  const funkcija = (f && f in OPIS ? f : 'pos') as Funkcija
  const paket = potrebenPaket(funkcija)
  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div data-testid="funkcija-ni-v-paketu" style={{ background: '#fff', borderRadius: 20, padding: 40, maxWidth: 440, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{paket === 'pro_pos' ? '🖥️' : '💼'}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0D1F12', marginBottom: 8 }}>{OPIS[funkcija]}</div>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>
          Ta funkcija je na voljo v paketu <strong>{IME_PAKETA[paket]}</strong>
          {paket === 'pro' ? ' (in Pro + POS)' : ''}. Vaši podatki in izdani računi ostanejo shranjeni in dostopni.
        </div>
        <Link href="/nastavitve?razdelek=plan" style={{ background: '#1D9E75', color: '#fff', padding: '12px 24px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
          Nastavitve → Naročnina
        </Link>
        <div style={{ marginTop: 16 }}>
          <Link href="/dashboard" style={{ fontSize: 13, color: '#888' }}>← Domov</Link>
        </div>
      </div>
    </div>
  )
}
