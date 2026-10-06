import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deflateRawSync } from 'zlib'
import {
  razcleniVrsticoPO, razcleniVrsticoDEJ, razcleniDatoteko, razcleniNaslov, izberiMedDvojniki,
  razpakirajPrvo, uvoziRegister, poisciPodjetje, poisciVies, VIRI_FURS, NAJMANJ_VRSTIC, VIES_URL,
  type Zavezanec,
} from '../lib/register-zavezancev'
import { berljivoIme, berljivNaslov } from '../lib/berljivo-ime'
import { soUradnoIme } from '../lib/upn-qr'

/**
 * REGISTER DAVČNIH ZAVEZANCEV (FURS) – razčlenjevanje, uvoz, iskanje (oktober 2026)
 *
 * Vrstice v fiksturi so DOBESEDNO iz FURS datotek 6.10.2026 (s šumniki).
 * Uvoz in iskanje tečeta z lažnim odjemalcem Supabase (brez baze in omrežja).
 *
 * Zagon: npx playwright test tests/register-zavezancev.spec.ts
 */

const V: Record<string, string> = JSON.parse(readFileSync(join(__dirname, 'fiksture', 'zavezanci-vrstice.json'), 'utf8'))

// ───────────────────────── razčlenjevanje ─────────────────────────

test('fikstura: vrstice imajo dolžino iz FURS datotek (stalna širina)', () => {
  expect(V.DEJ_10489568.length).toBe(424)
  expect(V.DEJ_89481372.length).toBe(424)
  expect(V.PO_10000658.length).toBe(259)
  expect(V.PO_10636200.length).toBe(268)
})

test('DEJ: s.p. s šumniki (10489568 – primer iz Nastavitev)', () => {
  expect(razcleniVrsticoDEJ(V.DEJ_10489568)).toEqual({
    davcna: '10489568', maticna: '8347905000',
    ime: 'HFP, IZOBRAŽEVANJE NA PODROČJU ŠPORTA, DOMEN KOCJAN S.P.',
    naslov: 'KRAIGHERJEVA ULICA 5', posta: '6230', kraj: 'POSTOJNA',
    skd: '85.510', vrsta: 'DEJ', ddv: null, fu: '13',
  })
})

test('DEJ: Ž, Š in kraj z dvema besedama', () => {
  const z = razcleniVrsticoDEJ(V.DEJ_89481372)!
  expect(z.ime).toBe('ZDRAVSTVENE IN DRUGE STORITVE, DOMEN ERŽEN S.P.')
  expect([z.naslov, z.posta, z.kraj, z.fu]).toEqual(['BLEGOŠKA ULICA 16', '4224', 'GORENJA VAS', '07'])
  const k = razcleniVrsticoDEJ(V.DEJ_10002561)!
  expect(k.ime).toBe('POSLOVNO SVETOVANJE, CVETKO KRIŽAN, S.P.')
  expect([k.naslov, k.posta, k.kraj]).toEqual(['CESTA BRATSTVA 4', '6000', 'KOPER - CAPODISTRIA'])
})

test('PO: d.o.o. z DDV, tuja oseba brez matične, član skupine za DDV (268 znakov)', () => {
  expect(razcleniVrsticoPO(V.PO_10000658)).toEqual({
    davcna: '10000658', maticna: '6311881000',
    ime: 'RONI NEPREMIČNINE, POSREDOVANJE IN SVETOVANJE V PROMETU Z NEPREMIČNINAMI, D.O.O.',
    naslov: 'HACQUETOVA ULICA 9', posta: '1000', kraj: 'LJUBLJANA',
    skd: '68.310', vrsta: 'PO', ddv: true, fu: '08',
  })
  const tuja = razcleniVrsticoPO(V.PO_10001514)!
  expect(tuja.ime).toBe('KW KRANWERKE GMBH')
  expect(tuja.ddv).toBe(false)
  expect(tuja.maticna).toBeNull()
  expect(tuja.naslov).toBe('CLAUS-VON STAUFFENBERG-STRAßE 11-15, 68163 MANNHEIM')
  expect(tuja.posta).toBeNull()
  const clan = razcleniVrsticoPO(V.PO_10636200)!
  expect(clan.davcna).toBe('10636200')
  expect(clan.ddv).toBe(true)
  expect([clan.naslov, clan.posta, clan.kraj, clan.fu]).toEqual(['GREGORČIČEVA ULICA 19', '5000', 'NOVA GORICA', '11'])
})

test('neveljavne vrstice so preskočene in preštete, CRLF deluje', () => {
  const r = razcleniDatoteko([V.PO_10000658, 'GLAVA ALI SMETI', '', V.PO_10636200, ''].join('\r\n'), 'PO')
  expect(r.zavezanci.map(z => z.davcna)).toEqual(['10000658', '10636200'])
  expect(r.preskoceno).toBe(1)
  expect(razcleniVrsticoDEJ(V.PO_10000658)).toBeNull()
})

test('naslov: slovenski razčlenjen, tuji ostane cel, prazen je null', () => {
  expect(razcleniNaslov('KRAIGHERJEVA ULICA 5 , 6230 POSTOJNA')).toEqual({ naslov: 'KRAIGHERJEVA ULICA 5', posta: '6230', kraj: 'POSTOJNA' })
  expect(razcleniNaslov('   ')).toEqual({ naslov: null, posta: null, kraj: null })
  expect(razcleniNaslov('RUE X 5 PARIS').posta).toBeNull()
})

test('dvojniki v DEJ: prednost ima registracija s S.P.', () => {
  const a = { ...razcleniVrsticoDEJ(V.DEJ_10489568)!, ime: 'DOMEN KOCJAN - SAMOZAPOSLEN V KULTURI' }
  const b = razcleniVrsticoDEJ(V.DEJ_10489568)!
  expect(izberiMedDvojniki(a, b)).toBe(b)
  expect(izberiMedDvojniki(b, a)).toBe(b)
  expect(izberiMedDvojniki(a, { ...a, maticna: 'x' })).toBe(a)
})

// ───────────────────────── berljiv zapis in uradno ime ─────────────────────────

test('berljivo ime: ujema se z uradnim (soUradnoIme), uporabnikov zapis ohranjen', () => {
  const uradno = 'HFP, IZOBRAŽEVANJE NA PODROČJU ŠPORTA, DOMEN KOCJAN S.P.'
  const b = berljivoIme(uradno, 'Domen Kocjan s.p.')
  expect(b).toBe('HFP, izobraževanje na področju športa, Domen Kocjan s.p.')
  expect(soUradnoIme(b, uradno)).toBe(true)
  // trenutno ime brez »HFP, …« se z uradnim NE ujema -> UradnoIme pokaže opozorilo
  expect(soUradnoIme('Domen Kocjan s.p.', uradno)).toBe(false)
  // velike črke same po sebi niso razlika
  expect(soUradnoIme('Zdravstvene in druge storitve, Domen Eržen s.p.', 'ZDRAVSTVENE IN DRUGE STORITVE, DOMEN ERŽEN S.P.')).toBe(true)
  expect(berljivoIme('RONI NEPREMIČNINE, D.O.O.')).toBe('Roni nepremičnine, d.o.o.')
  expect(berljivoIme('KW KRANWERKE GMBH')).toBe('KW kranwerke GmbH')
  // brez trenutnega imena: ime in priimek podjetnika z veliko začetnico
  expect(berljivoIme(uradno)).toBe('HFP, izobraževanje na področju športa, Domen Kocjan s.p.')
  expect(berljivoIme('POSLOVNO SVETOVANJE, CVETKO KRIŽAN, S.P.')).toBe('Poslovno svetovanje, Cvetko Križan, s.p.')
  expect(berljivoIme('ZDRAVSTVENE IN DRUGE STORITVE, DOMEN ERŽEN S.P.')).toBe('Zdravstvene in druge storitve, Domen Eržen s.p.')
})

test('berljiv naslov in kraj', () => {
  expect(berljivNaslov('KRAIGHERJEVA ULICA 5')).toBe('Kraigherjeva ulica 5')
  expect(berljivNaslov('GORENJA VAS', true)).toBe('Gorenja vas')
  expect(berljivNaslov('NOVA GORICA', true)).toBe('Nova Gorica')
  expect(berljivNaslov(null)).toBeNull()
})

// ───────────────────────── zip ─────────────────────────

/** Minimalen zip z eno datoteko (lokalna glava + osrednji imenik + EOCD), kot ga naredi FURS. */
function zip(ime: string, vsebina: Buffer, metoda: 0 | 8 = 8): Uint8Array {
  const podatki = metoda === 8 ? deflateRawSync(vsebina) : vsebina
  const imeB = Buffer.from(ime)
  const lok = Buffer.alloc(30)
  lok.writeUInt32LE(0x04034b50, 0); lok.writeUInt16LE(20, 4); lok.writeUInt16LE(metoda, 8)
  lok.writeUInt32LE(podatki.length, 18); lok.writeUInt32LE(vsebina.length, 22); lok.writeUInt16LE(imeB.length, 26)
  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(metoda, 10)
  cd.writeUInt32LE(podatki.length, 20); cd.writeUInt32LE(vsebina.length, 24); cd.writeUInt16LE(imeB.length, 28); cd.writeUInt32LE(0, 42)
  const cdZacetek = lok.length + imeB.length + podatki.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cd.length + imeB.length, 12); eocd.writeUInt32LE(cdZacetek, 16)
  return new Uint8Array(Buffer.concat([lok, imeB, podatki, cd, imeB, eocd]))
}

test('zip: razpakira stisnjeno in shranjeno datoteko, šumniki ostanejo', async () => {
  const besedilo = Buffer.from(V.DEJ_10489568 + '\r\n', 'utf8')
  for (const metoda of [8, 0] as const) {
    const r = await razpakirajPrvo(zip('DURS_zavezanci_DEJ.txt', besedilo, metoda))
    expect(r.ime).toBe('DURS_zavezanci_DEJ.txt')
    expect(new TextDecoder().decode(r.vsebina)).toContain('PODROČJU ŠPORTA')
  }
  await expect(razpakirajPrvo(new Uint8Array(100))).rejects.toThrow(/zip/)
})

// ───────────────────────── uvoz z lažnim Supabase ─────────────────────────

type Vrstica = Zavezanec & { osvezeno: string }

/** Lažni odjemalec: tabela v Map, podpira upsert, štetje (gte) in brisanje (lt). */
function lazniDb(zacetno: Vrstica[] = [], { napakaPriPaketu = -1 } = {}) {
  const tabela = new Map(zacetno.map(v => [v.davcna, v]))
  const klici = { upsert: 0, delete: 0 }
  const db = {
    from(ime: string) {
      expect(ime).toBe('register_zavezancev')
      return {
        async upsert(paket: Vrstica[], opt: any) {
          expect(opt).toEqual({ onConflict: 'davcna' })
          if (klici.upsert++ === napakaPriPaketu) return { error: { message: 'timeout' } }
          for (const v of paket) tabela.set(v.davcna, v)
          return { error: null }
        },
        select: () => ({ gte: async (_: string, t: string) => ({ count: [...tabela.values()].filter(v => v.osvezeno >= t).length, error: null }) }),
        delete: () => ({
          lt: async (_: string, t: string) => {
            klici.delete++
            let n = 0
            for (const [k, v] of tabela) if (v.osvezeno < t) { tabela.delete(k); n++ }
            return { count: n, error: null }
          },
        }),
      }
    },
  }
  return { db, tabela, klici }
}

/** FURS datoteka z n zavezanci: fikstura vrstica z zamenjano davčno. */
function datoteka(vrsta: 'PO' | 'DEJ', n: number, od: number) {
  const vzorec = vrsta === 'PO' ? V.PO_10000658 : V.DEJ_10489568
  const zac = vrsta === 'PO' ? 4 : 0
  const vrstice: string[] = []
  for (let i = 0; i < n; i++) vrstice.push(vzorec.slice(0, zac) + String(od + i) + vzorec.slice(zac + 8))
  return Buffer.from(vrstice.join('\r\n') + '\r\n', 'utf8')
}

const PO_ZIP = zip('DURS_zavezanci_PO.txt', datoteka('PO', NAJMANJ_VRSTIC, 20_000_000))
const DEJ_ZIP = zip('DURS_zavezanci_DEJ.txt', datoteka('DEJ', NAJMANJ_VRSTIC, 30_000_000))
const prenesiOk = async (url: string) => (url === VIRI_FURS.PO ? PO_ZIP : DEJ_ZIP)
const STARO: Vrstica = { ...razcleniVrsticoDEJ(V.DEJ_89481372)!, osvezeno: '2026-10-01T04:15:00.000Z' }

test('uvoz: upserta oba vira, šele nato izbriše vrstice, ki jih ni več', async () => {
  const { db, tabela, klici } = lazniDb([STARO])
  const izid = await uvoziRegister(db, prenesiOk, new Date('2026-10-07T04:15:00Z'))
  expect(izid.zapisano).toBe(2 * NAJMANJ_VRSTIC)
  expect(izid.po.vrstic).toBe(NAJMANJ_VRSTIC)
  expect(izid.izbrisano).toBe(1)
  expect(tabela.has('89481372')).toBe(false)
  expect(tabela.get('20000000')!.ime).toMatch(/RONI/)
  expect(klici.upsert).toBe(Math.ceil(2 * NAJMANJ_VRSTIC / 2000))
  expect(izid.pomnilnik_mb).toBeGreaterThan(0)
  expect(Object.keys(izid.trajanje_ms)).toContain('zapis')
})

test('uvoz: napaka pri prenosu DEJ -> nič se ne izbriše in nič ne zapiše', async () => {
  const { db, tabela, klici } = lazniDb([STARO])
  await expect(uvoziRegister(db, async (url) => {
    if (url === VIRI_FURS.DEJ) throw new Error('HTTP 503')
    return PO_ZIP
  })).rejects.toThrow('HTTP 503')
  expect(klici).toEqual({ upsert: 0, delete: 0 })
  expect(tabela.get('89481372')).toEqual(STARO)
})

test('uvoz: okrnjena datoteka ali spremenjena oblika -> prekinjen, stari podatki ostanejo', async () => {
  const majhen = zip('DURS_zavezanci_DEJ.txt', datoteka('DEJ', 50, 30_000_000))
  const { db, tabela, klici } = lazniDb([STARO])
  await expect(uvoziRegister(db, async (url) => (url === VIRI_FURS.PO ? PO_ZIP : majhen))).rejects.toThrow(/ni cela/)
  // dovolj vrstic, a 2 % se jih ne razčleni (premaknjeni stolpci) -> oblika se je spremenila
  const smeti = zip('DURS_zavezanci_PO.txt', Buffer.concat([datoteka('PO', NAJMANJ_VRSTIC, 20_000_000), Buffer.from(Array(2000).fill('X'.repeat(259)).join('\r\n'))]))
  await expect(uvoziRegister(db, async (url) => (url === VIRI_FURS.PO ? smeti : DEJ_ZIP))).rejects.toThrow(/oblika/)
  expect(klici.delete).toBe(0)
  expect(tabela.get('89481372')).toEqual(STARO)
})

test('uvoz: napaka pri zapisu paketa -> brez brisanja', async () => {
  const { db, tabela, klici } = lazniDb([STARO], { napakaPriPaketu: 50 })
  await expect(uvoziRegister(db, prenesiOk)).rejects.toThrow(/timeout/)
  expect(klici.delete).toBe(0)
  expect(tabela.get('89481372')).toEqual(STARO)
})

// ───────────────────────── iskanje (/api/company-lookup) ─────────────────────────

function lookupDb(vrstica: any, napaka: any = null) {
  const poizvedbe: any[] = []
  return {
    poizvedbe,
    db: {
      from: (t: string) => ({
        select: (stolpci: string) => ({
          eq: (s: string, v: string) => ({
            maybeSingle: async () => { poizvedbe.push({ t, stolpci, s, v }); return { data: napaka ? null : vrstica, error: napaka } },
          }),
        }),
      }),
    },
  }
}

const neKlici: typeof fetch = async () => { throw new Error('VIES se ne sme klicati') }

test('lookup: najden v registru FURS -> oblika kot prej + matična, DDV, vir, osveženo', async () => {
  const z = razcleniVrsticoDEJ(V.DEJ_10489568)!
  const { db, poizvedbe } = lookupDb({ ...z, osvezeno: '2026-10-07T04:15:00+00:00' })
  const r = await poisciPodjetje('10489568', { db, fetchFn: neKlici })
  expect(poizvedbe[0]).toMatchObject({ t: 'register_zavezancev', s: 'davcna', v: '10489568' })
  expect(r).toEqual({
    davcna: '10489568',
    dolgo_ime: 'HFP, IZOBRAŽEVANJE NA PODROČJU ŠPORTA, DOMEN KOCJAN S.P.',
    ime_berljivo: 'HFP, izobraževanje na področju športa, Domen Kocjan s.p.',
    naslov: 'Kraigherjeva ulica 5',
    'pošta': '6230 Postojna',
    transakcijski_računi: null,
    maticna: '8347905000',
    ddv: null,
    vir: 'FURS',
    osvezeno: '2026-10-07T04:15:00+00:00',
  })
})

test('lookup: ni v registru -> VIES (5 s omejitev), veljaven zavezanec za DDV', async () => {
  const { db } = lookupDb(null)
  let klic: any
  const fetchFn: typeof fetch = async (url, init) => {
    klic = { url, init }
    return new Response(JSON.stringify({ isValid: true, name: 'NOVO PODJETJE D.O.O.', address: 'DUNAJSKA CESTA 1\n1000 LJUBLJANA' }))
  }
  const r = await poisciPodjetje('12345678', { db, fetchFn })
  expect(klic.url).toBe(VIES_URL('12345678'))
  expect(klic.init.signal).toBeInstanceOf(AbortSignal)
  expect(r).toMatchObject({ dolgo_ime: 'NOVO PODJETJE D.O.O.', naslov: 'Dunajska cesta 1', 'pošta': '1000 Ljubljana', vir: 'VIES', ddv: true, transakcijski_računi: null })
})

test('lookup: VIES neveljaven, napaka ali ne odgovori -> null (404), brez izjeme', async () => {
  const { db } = lookupDb(null)
  expect(await poisciPodjetje('12345678', { db, fetchFn: async () => new Response(JSON.stringify({ isValid: false, name: '---' })) })).toBeNull()
  expect(await poisciPodjetje('12345678', { db, fetchFn: async () => new Response('x', { status: 500 }) })).toBeNull()
})

test('lookup: VIES ne odgovori -> odneha po 5 s in vrne null', async () => {
  test.setTimeout(15_000)
  const visi: typeof fetch = (_u, init) => new Promise<Response>((_, zavrni) => {
    init!.signal!.addEventListener('abort', () => zavrni(init!.signal!.reason))
  })
  const zacetek = Date.now()
  expect(await poisciVies('12345678', visi)).toBeNull()
  const trajanje = Date.now() - zacetek
  expect(trajanje).toBeGreaterThanOrEqual(4900)
  expect(trajanje).toBeLessThan(7000)
})

test('lookup: napaka baze se vrže (API vrne 500), VIES se ne kliče', async () => {
  const { db } = lookupDb(null, { message: 'permission denied' })
  await expect(poisciPodjetje('10489568', { db, fetchFn: neKlici })).rejects.toThrow(/permission denied/)
})

test('API ne kliče več slo-podjetja-api, cron je v vercel.json', () => {
  const koren = join(__dirname, '..')
  const api = readFileSync(join(koren, 'app/api/company-lookup/route.ts'), 'utf8')
  expect(api).not.toMatch(/https:\/\/slo-podjetja-api/)
  expect(api).toMatch(/Niste prijavljeni/)
  expect(api).toMatch(/\^\\d\{8\}\$/)
  const cron = readFileSync(join(koren, 'app/api/cron/register-zavezancev/route.ts'), 'utf8')
  expect(cron).toMatch(/Bearer \$\{secret\}/)
  const vercel = JSON.parse(readFileSync(join(koren, 'vercel.json'), 'utf8'))
  expect(vercel.crons.map((c: any) => c.path)).toContain('/api/cron/register-zavezancev')
})
