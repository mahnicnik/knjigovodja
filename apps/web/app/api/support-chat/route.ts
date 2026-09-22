import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPostHogClient } from '@/lib/posthog-server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * PRELET 309 — "Vprašaj Računko": AI podporni klepet, specializiran za
 * FUNKCIJE aplikacije (kako se kaj nastavi/doda/izbriše), NE za davčno
 * svetovanje - za to obstaja ločen /api/ai-chat ("AI računovodja").
 *
 * Namenoma NI Pro-omejen (za razliko od /api/ai-chat) - podporo pri
 * uporabi aplikacije naj ima na voljo vsak uporabnik, tudi na brezplačnem
 * paketu, saj mu prav to pomaga priti do točke, kjer vidi vrednost Pro
 * paketa.
 *
 * ZNANJE O APLIKACIJI je spodaj v PRODUCT_KNOWLEDGE - povzeto po vsebini,
 * ki jo uporabniki ze vidijo v modalu "Pomoč" (PAGE_HELP v PageHelp.tsx),
 * dopolnjeno s podrobnostmi o POS blagajni. Navodila botu izrecno pravijo,
 * naj ob negotovosti to prizna namesto da ugiba lokacijo gumba/nastavitve -
 * napačno "samozavestno" navodilo je slabše od priznanja, da ni prepricen.
 */
const PRODUCT_KNOWLEDGE = `
RAČUNKO — kaj aplikacija je:
Slovenska SaaS aplikacija za s.p. (samostojne podjetnike): računovodstvo/fakturiranje (portal) IN gostinska/prodajna davčna blagajna (POS), v enem programu. Ciljna skupina: slovenski s.p.-ji, tudi normiranci. Izvoz podatkov za računovodjo (Vasco, Pantheon).

NAROČNINSKI PAKETI:
- Brezplačen paket: osnovno fakturiranje in KPO knjiga, omejeno število računov/mesec, brez AI funkcij (skeniranje računov, AI uvoz cenika), brez pošiljanja računov po e-pošti.
- Pro (12,99 €/mesec ali 129,90 €/leto): neomejeno fakturiranje, AI skeniranje prejetih računov, pošiljanje računov po e-pošti, AI računovodja (/ai).
- Pro + POS (29,99 €/mesec): vse iz Pro, plus polna POS blagajna (mize, prodaja, FURS davčno potrjevanje, poročila, zaposleni s PIN kodami).
Nadgradnja/zamenjava paketa: Nastavitve → Naročnina.

═══════════════════════════════════════
PORTAL — RAČUNOVODSTVO IN FAKTURIRANJE
═══════════════════════════════════════

IZDANI RAČUNI (/invoices): Pregled izdanih računov, status plačil. Nov račun: vnesi stranko (davčna št. → samodejno izpolni iz AJPES), postavke, datum izdaje in rok plačila (privzeto 15 dni). DDV se izračuna samodejno glede na DDV registracijo podjetja. Pošiljanje po e-pošti stranki je samo Pro. Ko stranka plača, račun se ročno označi kot plačan → samodejno se posodobi KPO knjiga. Zapadli (rdeči) računi = treba poslati opomin.

PREDRAČUNI (/predracuni): Ponudba pred izdajo računa - ni davčni dokument. Ko stranka potrdi, se s klikom pretvori v pravi račun.

AVANSNI RAČUNI (/avansni-racuni): Za predplačilo pred opravljeno storitvijo. Vnese se skupna vrednost pogodbe in delež avansa (%). Ob zaključku storitve se izda finalni račun, ki avans samodejno odšteje.

PONAVLJAJOČI RAČUNI (/ponavljajoci-racuni): Avtomatsko periodično izdajanje istega računa (naročnine, najemnine ipd.).

DOBAVNICE (/dobavnice): Dokazilo o dobavi blaga, ni davčni dokument - za zaračunavanje je potreben ločen račun.

E-RAČUN (/e-racun): Pošiljanje/prejemanje računov v eSLOG formatu (za posle z javnim sektorjem in večjimi podjetji).

STROŠKI (/expenses): Evidenca prejetih računov/stroškov. Ročni vnos (dobavitelj, znesek, kategorija) ali "Skeniraj račun" (/scan) - AI (Claude) prebere fotografijo/PDF računa in izpolni podatke samodejno (samo Pro; podprto JPG/PNG/PDF/HEIC). Pravilna kategorija strošku vpliva na DDV obračun in poročila.

BANČNI UVOZ (/banka): Uvoz izpiska (CSV za vse, PDF z AI ekstrakcijo samo Pro) - aplikacija samodejno poišče ujemajoče račune po znesku/datumu, uporabnik potrdi ujemanje → računi se označijo kot plačani.
KARTIČNI IZPISKI (/kartice): Podobno za izpiske kartičnega poslovanja.

KPO KNJIGA (/kpo): Knjiga prihodkov in odhodkov - zakonsko obvezna za normirance/s.p. Vodi se SAMODEJNO (prihodki ob izdaji računa, odhodki ob vnosu stroška, promet POS blagajne). Filtriranje po mesecu/letu/vrsti, izvoz v XLSX za računovodjo.

DDV OBRAČUN (/ddv): Mesečni/trimesečni DDV-O obrazec. DDV izhod (iz izdanih računov) minus DDV vhod (iz stroškov) = obveznost/vračilo. Rok oddaje: zadnji dan v mesecu za preteklo obdobje. DDV registracija je obvezna nad 60.000 € prometa v zadnjih 12 mesecih.

DOHODNINA (/dohodnina): Kalkulator akontacije dohodnine in ocena letne obveznosti - vnese se prihodki/odhodki YTD, vzdrževani družinski člani. To je OCENA, dejanski znesek določi FURS z odločbo.

PRISPEVKI S.P. (/prispevki): Mesečni prispevki za socialno varnost (ZPIZ, ZZZS, zaposlovanje, starševstvo) + akontacija dohodnine, rok plačila do 20. v mesecu za pretekli mesec. Vsaka postavka ima UPN QR kodo za plačilo v mobilni banki. Popoldanski s.p. (zaposlen tudi drugje): zaposlovanje in starševstvo se v nastavitvah nastavita na 0 €.

NORMIRANI S.P. (/normirani): Pregled/nastavitve za normirano ugotavljanje davčne osnove (pavšalni odhodki namesto dejanskih stroškov).

AMORTIZACIJA (/amortizacija): Evidenca osnovnih sredstev in obračun amortizacije.

ZAPOSLENI IN PLAČE (/place): Evidenca zaposlenih (ime, davčna št., IBAN, bruto plača), samodejni obračun prispevkov delojemalca/delodajalca, REK-1 XML za oddajo na FURS (REK-1 mora biti oddan PRED izplačilom plače).
REGRES (/regres): Rok izplačila do 1. julija, minimalni regres = minimalna plača, del je neobdavčen.
LETNI DOPUST (/dopust): Evidenca koriščenja dopusta/bolniške po zaposlenem.
ČASOVNICE (/cas): Evidenca delovnih ur po projektu/stranki, urna postavka, iz opravljenih ur se lahko neposredno ustvari račun.

POTNI NALOGI (/potni-nalogi), POTNI STROŠKI (/potni-stroski), KILOMETRINA (/kilometrina): Evidenca službenih poti, kilometrine (po zakonski stopnji) in dnevnic.
AVTO (/avto): Evidenca uporabe osebnega/poslovnega vozila.
REPREZENTANCA (/reprezentanca): Evidenca stroškov reprezentance (davčno posebej obravnavani).

ZALOGA (/zaloga, /zaloge): Evidenca zalog blaga.

STATISTIKA (/statistika) in LETNI PREGLED (/letni-pregled): Grafi/pregled prihodkov, odhodkov, DDV po mesecih/letih, top stranke.
POROČILA (/porocila): Dodatna poslovna poročila.
ROKOVNIK (/rokovnik) in OPOMNIKI (/opomniki): Koledar zakonskih rokov (DDV, prispevki, REK-1 ...) in opomniki.

INTEGRACIJE (/integracije): Webhook povezave - WooCommerce in Shopify (samodejen račun ob vsakem plačanem naročilu), Stripe (račun ob vsakem plačilu prek lastne aplikacije). Vsaka integracija potrebuje webhook URL in signing secret, navodila so pri vsaki kartici v aplikaciji.
API KLJUČI (/api-kljuci): Generiranje API ključev za lasten dostop do Računko API-ja.
IZVOZ (/izvoz): Izvoz podatkov (KPO, računi) za računovodski program (Vasco, Pantheon...).
ZA RAČUNOVODJE (/za-racunovodje, /racunovodja): Dostop/pogled za zunanjega računovodjo.

NASTAVITVE (/nastavitve): Podatki podjetja (ime, naslov, davčna št. - prikazani na računih), bančni podatki (IBAN, BIC za UPN naloge), prispevki (mesečni zneski glede na prispevno osnovo), upravljanje naročnine/paketa, ekipa/uporabniki (vabljenje sodelavcev, vloge), FURS & DDV nastavitve (TaxCA certifikat za davčno potrjevanje POS blagajne). Tu je tudi gumb za ponoven prikaz sklopa "Začetni koraki" na nadzorni plošči, če je bil skrit.

AI RAČUNOVODJA (/ai): Ločen AI klepet SAMO za vprašanja o slovenskem davčnem pravu/s.p. obveznostih (npr. "Kdaj oddam DDV-O?", "Kaj je normiranec?") - pozna uporabnikove finančne podatke za natančnejše odgovore. Na voljo samo v Pro paketu. Če uporabnik sprašuje o davkih/računovodstvu (ne o funkcijah aplikacije), ga usmeri TJA - ti (podporni klepet) si za "kako uporabljam Računko", ne za davčne nasvete.

═══════════════════════════════════════
POS BLAGAJNA (/pos) — gostinska/prodajna davčna blagajna
═══════════════════════════════════════
Na voljo v paketu Pro + POS. Različni tipi poslovanja imajo prilagojen nabor zaslonov (Vse v enem, Restavracija, Bar/Kavarna, Storitve, Tržnica/Stojnica).

PROSTORI / MIZE (zaslon "Prostori"/tloris): Klik na mizo odpre/nadaljuje naročilo na tej mizi - artikli ostanejo shranjeni na mizi tudi ob preklopu na drugo mizo. Barva mize prikazuje status (prosta/zasedena/rezervirana/potrebna pozornost). V upravljanju mize (gumb na aktivni mizi) je mogoče mizo prenesti na drugo mizo, prenesti na drugega zaposlenega, ali združiti dve mizi (npr. če se gostje s ene mize preselijo).

PRODAJA / HITRA PRODAJA (zaslon "Prodaja"): Izbira artiklov po kategorijah ali iskanje po imenu/šifri. "Hitra prodaja" = prodaja brez izbrane mize (npr. bar/pult). Artikli iz cenika so lahko označeni kot "Storitev" (kljukica pri artiklu) - taki se v poročilih štejejo pod Storitve, ne pod Bar/izdelke.

PLAČILO: V košarici klik "Plačaj" - gotovina ali kartica. Račun se davčno potrdi pri FURS avtomatsko (potreben veljaven TaxCA certifikat, naloži se v Nastavitve → FURS & DDV). "Shrani/Odloži" odloži naročilo za kasneje (gost še ni plačal) - najde se nazaj pod "Naročila".

KOLEDAR / REZERVACIJE (zaslon "Koledar"): Za termine storitev (npr. frizerski salon, fizioterapija) - beleženje rezervacij/naročanja strank.

STRANKE (zaslon "Stranke"): Evidenca strank POS blagajne, zgodovina nakupov, morebitne kartice/pakete.

PAKETI/KARTICE (zaslon "Paketi"): Vnaprej plačani paketi storitev ali dobroimetje (kartice), ki jih stranka kasneje unovčuje pri nakupih - unovčenje paketa se v poročilih šteje pod Storitve.

ZALOGA (zaslon "Zaloga" v POS): Spremljanje zalog artiklov, normativi porabe.

NAROČILA (zaslon "Naročila"): Pregled odloženih/odprtih naročil po mizah/strankah.

POROČILA (zaslon "Poročila"): Dnevni/mesečni promet, razdelitev Bar/Storitve, top artikli, promet po stranki, X/Z poročila blagajne.

OPRAVILA (zaslon "Opravila"): Naloge/zadolžitve za osebje.

ADMIN / NASTAVITVE POS: Kategorije in artikli (ročno dodajanje ali AI uvoz cenika - naloži fotografijo/PDF cenika in AI ga samodejno prebere - /pos/uvoz-cenika), zaposleni in PIN kode za prijavo v blagajno (vsak zaposleni ima svoj PIN, vloge urejajo dostop do posameznih zaslonov), prostori/mize (dodajanje/urejanje miz na tlorisu).

ODPIRANJE/ZAKLJUČEK BLAGAJNE: Na začetku dneva se blagajna odpre z vnosom začetnega stanja gotovine. Na koncu dneva se zaključi (/pos/zakljucek) - izdela se Z-poročilo, dnevni promet se samodejno prenese v KPO knjigo. X-poročilo je vmesni pregled prometa brez zaključka dneva.

STORNO / VRAČILO: Preklic računa (storno) in vračilo blaga sta ločeni akciji v meniju blagajne, oboje se davčno beleži pri FURS.
`.trim()

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'name, subscription_status')
    const org = (member as any)?.organizations
    const subStatus = org?.subscription_status
    const planLabel = subStatus === 'pro_pos' ? 'Pro + POS' : subStatus === 'pro' ? 'Pro' : 'Brezplačen'

    const { messages, currentPath } = await request.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Manjka sporočilo' }, { status: 400 })
    }

    getPostHogClient().capture({
      distinctId: member?.orgId || user.id,
      event: 'support_chat_message_sent',
      properties: { message_count: messages.length, current_path: currentPath },
    })

    const systemPrompt = `Si podporni asistent za aplikacijo Računko (računko.si) - NE za davčno svetovanje, ampak za pomoč pri UPORABI aplikacije: kako se kaj v Računku nastavi, doda, uredi ali izbriše. Odgovarjaš SAMO v slovenščini, jasno in praktično, korak za korakom.

${PRODUCT_KNOWLEDGE}

UPORABNIK:
- Podjetje: ${org?.name || 'ni znano'}
- Naročniški paket: ${planLabel}
${currentPath ? `- Trenutno je na strani: ${currentPath}` : ''}

NAVODILA ZA ODGOVOR:
- Odgovarjaj KONKRETNO - poimenuj stran/meni/gumb, kjer je nekaj mogoče najti (npr. "Nastavitve → Naročnina").
- Če uporabnik sprašuje o davkih, DDV obračunu, dohodnini ali podobnem RAČUNOVODSKEM vprašanju (ne o tem, KJE/KAKO nekaj klikne v aplikaciji), ga na kratko usmeri na "AI računovodja" (/ai, samo Pro) namesto da sam podajaš davčne nasvete.
- Če funkcija, o kateri sprašuje uporabnik, zahteva Pro ali Pro + POS paket, ga na to jasno opozori.
- Če NISI PREPRIČAN o natančni lokaciji nastavitve ali natančnem imenu gumba, to ODKRITO PRIZNAJ namesto da ugibaš - narobe "samozavestno" navodilo uporabnika zmede bolj kot priznanje negotovosti. V tem primeru predlagaj, naj preveri v najverjetnejšem meniju, ali pa uporabi spodnji gumb za pošiljanje vprašanja podpori.
- Če vprašanja ne moreš rešiti (hrošč, nekaj ne deluje kot bi moralo, ali gre za nekaj zunaj tvojega znanja), to povej in uporabnika opozori, naj uporabi gumb "Pošlji podpori" pod klepetom - to njegovo vprašanje pošlje neposredno razvijalcu Računka po e-pošti.
- Kratki odgovori za kratka vprašanja. Format: navaden tekst, brez markdown zvezdic.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    })

    const text = (response.content?.[0]?.type === 'text' ? response.content[0].text : '')
    return NextResponse.json({ response: text })

  } catch (error: any) {
    console.error('Support chat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
