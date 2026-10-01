export const dynamic = 'force-dynamic'
/**
 * PRELET 360: ZAHTEVKI ZA PLACILO NA PORTALU.
 *
 * GET  → seznam zahtevkov aktivne organizacije (+ izdani racuni). Potekle
 *        zahtevke oznaci ob branju.
 * POST → nov zahtevek iz obrazca racuna. Znesek, neto in DDV izracuna
 *        STREZNIK iz postavk (lib/zahtevki.ts). Zeton za /placaj/[zeton],
 *        veljavnost privzeto 14 dni. Racun se NE izda - sele po placilu.
 *        { posiljanje: 'email' } zahtevek takoj poslje stranki.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, preveriPogoje, javniUrl } from '@/lib/stripe-connect'
import {
  izracunajZahtevek, NeveljavenZahtevek, novZeton, jeVeljavenEmail, razlogNedostopnosti, klavzula,
  PRIVZETA_VELJAVNOST_DNI, BREZ_PRAVIC,
} from '@/lib/zahtevki'
import { oznaciPotekle, zaPortal } from '@/lib/zahtevki-streznik'
import { posljiZahtevek } from '@/lib/zahtevki-posta'

export const maxDuration = 60

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const admin = adminSupabase()
  await oznaciPotekle(admin, s.orgId)
  const [{ data: zahtevki }, pogoji] = await Promise.all([
    admin.from('placilni_zahtevki').select('*').eq('org_id', s.orgId).order('ustvarjeno', { ascending: false }).limit(300),
    preveriPogoje(admin, s.orgId),
  ])
  const idji = (zahtevki || []).map(z => z.invoice_id).filter(Boolean)
  const { data: racuni } = idji.length
    ? await admin.from('issued_invoices').select('id, invoice_number, eor, zoi, status').in('id', idji)
    : { data: [] as any[] }
  const poId = new Map((racuni || []).map(r => [r.id, r]))
  const osnova = javniUrl(req)
  return NextResponse.json({
    pogoji,
    nedostopno: razlogNedostopnosti(pogoji),
    zahtevki: (zahtevki || []).map(z => zaPortal(z, osnova, z.invoice_id ? poId.get(z.invoice_id) : null)),
  })
}

async function novaStevilka(admin: any, orgId: string) {
  const leto = new Date().getFullYear()
  const { data } = await admin.from('placilni_zahtevki').select('stevilka').eq('org_id', orgId).like('stevilka', `ZP-${leto}-%`)
  const vz = new RegExp(`^ZP-${leto}-(\\d+)$`)
  const max = (data || []).reduce((m: number, r: any) => { const x = vz.exec(String(r.stevilka || '')); return x ? Math.max(m, parseInt(x[1], 10)) : m }, 0)
  return `ZP-${leto}-${String(max + 1).padStart(3, '0')}`
}

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  if (BREZ_PRAVIC.includes(s.role)) return NextResponse.json({ error: 'Vaša vloga ne dovoli ustvarjanja zahtevkov.' }, { status: 403 })
  const admin = adminSupabase()
  const pogoji = await preveriPogoje(admin, s.orgId)
  const ovira = razlogNedostopnosti(pogoji)
  if (ovira) return NextResponse.json({ error: ovira.razlog, povezava: ovira.povezava }, { status: 400 })

  const b = await req.json().catch(() => ({}))
  const ime = String(b.stranka_ime || '').trim().slice(0, 200)
  const email = String(b.stranka_email || '').trim().toLowerCase().slice(0, 200)
  if (!ime) return NextResponse.json({ error: 'Vpišite ime stranke.' }, { status: 400 })
  if (!jeVeljavenEmail(email)) return NextResponse.json({ error: 'Vpišite veljaven e-poštni naslov stranke — nanj pošljemo račun po plačilu.' }, { status: 400 })

  const { data: org } = await admin.from('organizations').select('vat_registered').eq('id', s.orgId).single()
  let izracun
  try {
    izracun = izracunajZahtevek(b.postavke, { zavezanecDdv: !!org?.vat_registered })
  } catch (e: any) {
    if (e instanceof NeveljavenZahtevek) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
  const kl = klavzula(b.vat_exemption_code, b.vat_exemption_custom)
  if ((izracun.imaNicelno || !org?.vat_registered) && !kl.text) {
    return NextResponse.json({ error: 'Izberite razlog za neobračunan DDV — zakon ga zahteva na računu brez DDV.' }, { status: 400 })
  }
  const dni = Math.min(60, Math.max(1, Number(b.velja_dni) || PRIVZETA_VELJAVNOST_DNI))
  const datum = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

  let vrstica: any = null
  let napaka: any = null
  for (let poskus = 0; poskus < 3 && !vrstica; poskus++) {
    const { data, error } = await admin.from('placilni_zahtevki').insert({
      org_id: s.orgId,
      stevilka: await novaStevilka(admin, s.orgId),
      partner_id: typeof b.partner_id === 'string' && /^[0-9a-f-]{36}$/.test(b.partner_id) ? b.partner_id : null,
      stranka_ime: ime,
      stranka_email: email,
      stranka_naslov: String(b.stranka_naslov || '').trim().slice(0, 300) || null,
      stranka_davcna: String(b.stranka_davcna || '').trim().slice(0, 30) || null,
      postavke: izracun.postavke,
      znesek_neto: izracun.neto,
      ddv: izracun.ddv,
      znesek: izracun.skupaj,
      opomba: String(b.opomba || '').trim().slice(0, 2000) || null,
      vat_exemption_code: kl.code,
      vat_exemption_text: kl.text,
      service_date: datum(b.service_date),
      service_date_to: datum(b.service_date_to),
      header_text: String(b.header_text || '').trim().slice(0, 2000) || null,
      zeton: novZeton(),
      velja_do: new Date(Date.now() + dni * 24 * 3600_000).toISOString(),
      ustvaril: s.user.id,
    }).select('*').single()
    vrstica = data
    napaka = error
    if (error && error.code !== '23505') break
  }
  if (!vrstica) return NextResponse.json({ error: 'Zahtevka ni bilo mogoče shraniti: ' + (napaka?.message || '') }, { status: 500 })

  const osnova = javniUrl(req)
  let opozorilo: string | null = null
  if (b.posiljanje === 'email') {
    try { await posljiZahtevek(admin, vrstica.id, osnova) } catch (e: any) { opozorilo = e?.message || 'E-pošta ni bila poslana.' }
    const { data: sveza } = await admin.from('placilni_zahtevki').select('*').eq('id', vrstica.id).single()
    vrstica = sveza || vrstica
  }
  return NextResponse.json({ zahtevek: zaPortal(vrstica, osnova), opozorilo })
}
