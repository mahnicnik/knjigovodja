'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'
import { getActiveMembership } from '@/lib/active-org'

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

interface Profile {
  hasServiceInvoices: boolean
  hasCashRegister: boolean
  hasCardTerminal: boolean
  hasEmployees: boolean
  isVatRegistered: boolean
  hasInventory: boolean
  hasDepreciation: boolean
  usesCar: boolean
  hasRepresentanca: boolean
}

interface Step {
  id: string
  icon: string
  title: string
  subtitle: string
  why: string
  urgent?: string
  required: boolean
  href?: string
  hrefLabel?: string
  checks: string[]
}

function getSteps(profile: Profile, org: any, month: number, year: number): Step[] {
  const m = MONTHS[month]
  const steps: Step[] = []

  steps.push({
    id: 'uvod',
    icon: '📅',
    title: `Pregled ${m} ${year}`,
    subtitle: 'Kaj te čaka ta mesec',
    why: 'Preden začneš, preglejmo kaj je treba narediti in kateri roki so kritični. Ocenjeni čas: 20–40 minut.',
    required: true,
    checks: [
      'Preveriti vse roke ta mesec',
      'Pregledati neplačane račune',
      'Pripraviti dokumente za uvoz',
    ],
  })

  if (profile.hasServiceInvoices) {
    steps.push({
      id: 'racuni',
      icon: '📄',
      title: 'Izdani računi',
      subtitle: 'Storitveni računi strankam / pacientom',
      why: 'Vsak nefakturiran posel = denar ki ga nimaš. Preveri vse opravljene storitve tega meseca.',
      required: true,
      href: '/invoices/new',
      hrefLabel: '+ Nov račun',
      checks: [
        'Vsi računi za storitve fakturirani',
        'Zunanji računi uvoženi (če imaš drug sistem)',
        'Preveriti neplačane iz prejšnjega meseca',
      ],
    })
  }

  if (profile.hasCashRegister) {
    steps.push({
      id: 'blagajna',
      icon: '🏪',
      title: 'Blagajna — dnevni zaključki',
      subtitle: 'Z-reporti in gotovinski promet',
      why: 'FURS zahteva dnevno potrjevanje računov. Z-report je obvezen zaključek vsakega delovnega dne — brez tega so kazni do €50.000.',
      urgent: 'Dnevno — ne mesečno!',
      required: true,
      href: '/blagajna',
      hrefLabel: 'Odpri blagajno',
      checks: [
        'Vsi dnevni Z-reporti narejeni',
        `Skupni gotovinski promet ${m} zabeležen`,
        'Uskladitev gotovine v blagajni',
        'Morebitne razlike dokumentirane',
      ],
    })
  }

  if (profile.hasCardTerminal) {
    steps.push({
      id: 'kartice',
      icon: '💳',
      title: 'Kartični terminal — Worldline / SumUp',
      subtitle: 'Mesečni obračun kartičnih plačil',
      why: 'Worldline in SumUp pošljeta mesečni obračun — ta mora biti usklajen z bančnim izpiskom.',
      required: true,
      href: '/kartice',
      hrefLabel: 'Uvozi obračun',
      checks: [
        'Prejeli mesečni obračun od Worldline/SumUp',
        'Uvoziti CSV datoteko v aplikacijo',
        'Preveriti uskladitev z blagajno',
        'Preveriti provizije terminala',
      ],
    })
  }

  steps.push({
    id: 'banka',
    icon: '🏦',
    title: 'Bančni izpisek',
    subtitle: 'Uvoz in uskladitev transakcij',
    why: 'Bančni izpisek je osnova za KPO knjigo. Vsaka transakcija mora biti kategorizirana.',
    required: true,
    href: '/banka',
    hrefLabel: 'Uvozi izpisek',
    checks: [
      `Prenesti izpisek za ${m} iz e-banke (CSV/XML)`,
      'Uvoziti v aplikacijo',
      'Kategorizirati vse transakcije',
      'Uskladiti z izdanimi računi',
    ],
  })

  steps.push({
    id: 'stroski',
    icon: '🧾',
    title: 'Prejeti računi in stroški',
    subtitle: 'Dobavitelji, najemnine, režije',
    why: 'Vsak evidentiran strošek zmanjša davčno osnovo.',
    required: true,
    href: '/expenses',
    hrefLabel: '+ Dodaj strošek',
    checks: [
      'Najemnina poslovnega prostora',
      'Telefonski in internetni račun',
      'Elektrika, voda, komunala',
      'Računovodski in pravni stroški',
      'Ostali poslovni stroški',
    ],
  })

  if (profile.hasEmployees) {
    steps.push({
      id: 'place',
      icon: '👥',
      title: 'Plače in REK-1',
      subtitle: 'Izračun in izplačilo plač zaposlenim',
      why: 'REK-1 mora biti oddan na eDavki PREDEN nakažeš plačo. To je zakonska zahteva.',
      urgent: 'REK-1 PRED izplačilom!',
      required: true,
      href: '/place',
      hrefLabel: 'Obračun plač',
      checks: [
        'Preveriti ure za vsakega zaposlenega',
        'Vpisati nadure, nočno delo, praznike',
        'Izračunati bruto → neto',
        'Generirati plačilne liste',
        'Oddati REK-1 na eDavki',
        'Nakazati plačo na IBAN delavca',
        'Plačati prispevke delodajalca',
      ],
    })

    steps.push({
      id: 'potni',
      icon: '✈️',
      title: 'Potni stroški zaposlenih',
      subtitle: 'Dnevnice, km, nočnine',
      why: 'Povračila stroškov zaposlenim so neobdavčena do zakonskega limita.',
      required: false,
      href: '/potni-stroski',
      hrefLabel: 'Evidenca potnih stroškov',
      checks: [
        'Zbrati potne naloge od zaposlenih',
        'Preveriti km in dnevnice',
        'Odobriti in vpisati v sistem',
        'Vključiti v plačilno listo',
      ],
    })
  }

  steps.push({
    id: 'prispevki',
    icon: '💰',
    title: 'Prispevki s.p.',
    // POPRAVLJENO (18.8.2026): tu je pisalo 15., rok pa je 20. v NASLEDNJEM mesecu
    // (glej rokovnik/page.tsx, popravljeno 16.8.2026). Vodic je torej navajal
    // prezgodnji in napacen rok.
    subtitle: 'ZPIZ + ZZZS — rok 20. v naslednjem mesecu',
    why: 'Prispevki za socialno varnost se placajo do 20. v naslednjem mesecu.',
    urgent: `Rok: 20. ${m}`,
    required: true,
    href: '/prispevki',
    hrefLabel: 'Generiraj QR nalog',
    checks: [
      'Preveriti znesek prispevkov (razred)',
      'Plačati ZPIZ',
      'Plačati ZZZS',
      'Shraniti potrdila o plačilu',
    ],
  })

  steps.push({
    id: 'akontacija',
    icon: '📊',
    title: 'Akontacija dohodnine',
    subtitle: 'Mesečno predplačilo davka',
    why: 'Akontacija je mesečno predplačilo dohodnine ki ga določi FURS z odločbo.',
    urgent: `Rok: 15. ${m}`,
    required: true,
    href: '/dohodnina',
    hrefLabel: 'Preveriti znesek',
    checks: [
      'Preveriti znesek iz FURS odločbe',
      'Nakazati akontacijo',
      'Shraniti potrdilo o plačilu',
    ],
  })

  if (profile.isVatRegistered) {
    const ddvMonths = [3, 6, 9, 0]
    const isDdvMonth = ddvMonths.includes(month)
    steps.push({
      id: 'ddv',
      icon: '🏛️',
      title: isDdvMonth ? 'DDV-O obračun — ODDATI!' : 'DDV evidenca',
      subtitle: isDdvMonth ? `Četrtletni DDV-O — rok konec ${m}` : 'Sproti voditi DDV evidenco',
      why: 'Kot DDV zavezanec moraš voditi evidenco DDV vhoda in izhoda.',
      urgent: isDdvMonth ? `ODDATI DDV-O do konca ${m}!` : undefined,
      required: true,
      href: isDdvMonth ? '/ddv/evidenca' : '/ddv',
      hrefLabel: isDdvMonth ? 'Pripravi DDV-O' : 'DDV evidenca',
      checks: isDdvMonth ? [
        'Preveriti vse izhodne DDV račune',
        'Preveriti vse vhodne DDV račune',
        'Oddati DDV-O na eDavki',
        'Nakazati DDV dolg (če pozitiven)',
      ] : [
        'Preveriti ali so vsi računi pravilno knjiženi',
        'Preveriti DDV stopnje (22% / 9.5% / 0%)',
      ],
    })
  }

  if (profile.hasInventory) {
    steps.push({
      id: 'zaloga',
      icon: '📦',
      title: 'Zaloga',
      subtitle: 'Popis in gibanje zaloge',
      why: 'Zaloga je sredstvo podjetja — njena vrednost vpliva na davčno osnovo.',
      required: false,
      href: '/zaloge', // POPRAVLJENO 26.7.2026: /zaloga (localStorage) odstranjena, /zaloge je prava (baza)
      hrefLabel: 'Evidenca zaloge',
      checks: [
        'Preveriti stanje blaga',
        'Vpisati nove nabave',
        'Preveriti razlike',
      ],
    })
  }

  if (profile.hasDepreciation) {
    steps.push({
      id: 'amortizacija',
      icon: '⚙️',
      title: 'Amortizacija opreme',
      subtitle: 'Mesečno vrednotenje opreme',
      why: 'Oprema se amortizira letno — to je odhodek ki zmanjša davčno osnovo.',
      required: false,
      href: '/amortizacija',
      hrefLabel: 'Razpored amortizacije',
      checks: [
        'Preveriti razpored amortizacije',
        'Dodati novo opremo',
        'Preveriti skupni letni odhodek',
      ],
    })
  }

  if (profile.usesCar) {
    steps.push({
      id: 'kilometrina',
      icon: '🚗',
      title: 'Kilometrina in potni nalogi',
      subtitle: 'Prevoženi km za poslovne namene',
      why: 'Vsak km za poslovni namen = €0.21 odhodka.',
      required: false,
      href: '/kilometrina',
      hrefLabel: 'Vpiši km',
      checks: [
        'Vpisati vse poslovne vožnje tega meseca',
        'Generirati potne naloge',
        'Preveriti zasebno rabo (boniteta)',
      ],
    })
  }

  if (profile.hasRepresentanca) {
    steps.push({
      id: 'reprezentanca',
      icon: '🍽️',
      title: 'Reprezentanca',
      subtitle: 'Poslovni obroki in darila',
      why: '50% poslovnih obrokov je davčno priznavnih.',
      required: false,
      href: '/reprezentanca',
      hrefLabel: 'Evidenca reprezentance',
      checks: [
        'Vpisati vse poslovne obroke',
        'Preveriti 50% pravilo',
        'Zbrati račune z imeni prisotnih',
      ],
    })
  }

  steps.push({
    id: 'opomniki',
    icon: '⚠️',
    title: 'Opomniki za zamude',
    subtitle: 'Neplačani računi — pošlji opomnike',
    why: 'Vsak dan zamude = zakonske obresti (TOM+8%).',
    required: false,
    href: '/opomniki',
    hrefLabel: 'Poglej zamude',
    checks: [
      'Preveriti vse neplačane račune',
      'Poslati 1. opomnik (do 14 dni zamude)',
      'Poslati 2. opomnik (14–30 dni)',
      'Predati izterjavi (nad 30 dni)',
    ],
  })

  steps.push({
    id: 'zakljucek',
    icon: '✅',
    title: `${m} ${year} — zaključen!`,
    subtitle: 'Povzetek meseca in naslednji roki',
    why: 'Čestitke! Mesec je računovodsko zaključen.',
    required: true,
    checks: [
      'Arhivirati vse dokumente',
      'Preveriti naslednje roke',
      'Izvoziti mesečni povzetek PDF',
    ],
  })

  return steps
}

const PROFILE_QUESTIONS = [
  { key: 'hasServiceInvoices', label: 'Storitve / Svetovanje', sub: 'Fakturiraš stranke za storitve', icon: '📋' },
  { key: 'hasCashRegister', label: 'Bar / Gostilna / Maloprodaja', sub: 'Sprejemaš gotovinska plačila z blagajno', icon: '🏪' },
  { key: 'hasCardTerminal', label: 'Kartični terminal', sub: 'Worldline, SumUp ali podobno', icon: '💳' },
  { key: 'hasEmployees', label: 'Imam zaposlene', sub: 'En ali več delavcev', icon: '👥' },
  { key: 'isVatRegistered', label: 'DDV zavezanec', sub: 'Zaračunavam DDV na račune', icon: '🏛️' },
  { key: 'hasInventory', label: 'Vodim zalogo', sub: 'Bar, trgovina, zaloga blaga', icon: '📦' },
  { key: 'hasDepreciation', label: 'Imam drago opremo', sub: 'Fitnes, medicinska oprema, stroji', icon: '⚙️' },
  { key: 'usesCar', label: 'Uporabljam avto za posel', sub: 'Kilometrina, potni nalogi', icon: '🚗' },
  { key: 'hasRepresentanca', label: 'Imam poslovne obroke', sub: 'Sestanki, darila strankam', icon: '🍽️' },
]

function onboardingToProfile(a: any): Profile {
  const d = (a.dejavnost as string[]) || []
  const e = (a.extras as string[]) || []
  return {
    hasServiceInvoices: d.includes('storitve') || d.includes('digital') || d.includes('gradnja'),
    hasCashRegister: d.includes('gostinstvo') || e.includes('blagajna'),
    hasCardTerminal: d.includes('gostinstvo') || d.includes('blago'),
    hasEmployees: a.zaposleni === 'yes' || a.zaposleni === 'soon',
    isVatRegistered: a.ddv === 'yes' || a.ddv === 'soon',
    hasInventory: d.includes('blago') || d.includes('gostinstvo') || e.includes('zaloga'),
    hasDepreciation: e.includes('amort'),
    usesCar: e.includes('avto') || d.includes('transport'),
    hasRepresentanca: e.includes('repr'),
  }
}

export default function VodicPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showProfileSetup, setShowProfileSetup] = useState(false)
  const [profile, setProfile] = useState<Profile>({
    hasServiceInvoices: false,
    hasCashRegister: false,
    hasCardTerminal: false,
    hasEmployees: false,
    isVatRegistered: false,
    hasInventory: false,
    hasDepreciation: false,
    usesCar: false,
    hasRepresentanca: false,
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  // DODANO (18.8.2026): posamicne postavke kontrolnega seznama. Prej so bili
  // krogci le okras (navaden div brez klika) - odkljukati se je dalo samo cel
  // korak, kar je pomenilo vse ali nic. Kljuc je `${stepId}:${indeks}`.
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [tempProfile, setTempProfile] = useState<Profile>({ ...profile })
  const supabase = createClient()
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  // POPRAVLJENO (26.8.2026): kljuc ni bil vezan na ORGANIZACIJO - napredek se
  // je hranil pod `vodic_2026_7` za vse. Po brisanju ene organizacije in
  // ustvarjanju druge v istem brskalniku je nov profil podedoval stanje
  // starega: vodic je ob PRVEM odprtju kazal vse opravljeno.
  //
  // Drugod so kljuci ze vezani na organizacijo (`rokovnik_done_${org.id}`),
  // vodic je bil edina izjema.
  const storageKey = org?.id ? `vodic_${org.id}_${year}_${month}` : `vodic_nalagam_${year}_${month}`

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

    // `o` potrebujemo TUDI nize (za kljuc napredka), zato ga deklariramo
    // izven pogoja (26.8.2026).
    let o: any = null
    if (member) {
      o = (member as any).organizations
      setOrg(o)
    }

    // Preberi onboarding odgovore iz user_preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('onboarding_answers')
      .eq('user_id', user.id)
      .single()

    // POPRAVLJENO (17.8.2026): branje iz shrambe brskalnika brez varovalke -
    // pokvarjen zapis bi podrl celotno stran. Zdaj se ob napaki obnasa, kot da
    // profila ni, in ponudi ponovno nastavitev.
    const kljucProfila = o?.id ? `vodic_profile_${o.id}` : 'vodic_profile'
    const savedProfile = localStorage.getItem(kljucProfila)
    let profilPrebran = false
    if (savedProfile) {
      try { setProfile(JSON.parse(savedProfile)); profilPrebran = true }
      catch { localStorage.removeItem(kljucProfila) }
    }
    if (profilPrebran) {
      // profil je nalozen
    } else if (prefs?.onboarding_answers) {
      const derived = onboardingToProfile(prefs.onboarding_answers)
      setProfile(derived)
      localStorage.setItem(kljucProfila, JSON.stringify(derived))
    } else {
      setShowProfileSetup(true)
    }

    // Kljuc sestavimo iz `o.id` NEPOSREDNO: `org` v stanju tu se ni
    // posodobljen, zato bi `storageKey` uporabil nadomestno vrednost.
    const kljuc = o?.id ? `vodic_${o.id}_${year}_${month}` : null

    if (kljuc) {
      const savedProgress = localStorage.getItem(kljuc)
      if (savedProgress) {
        try { setCompleted(new Set(JSON.parse(savedProgress))) }
        catch { localStorage.removeItem(kljuc) }
      }
      const savedChecks = localStorage.getItem(`${kljuc}_checks`)
      if (savedChecks) {
        try { setCheckedItems(new Set(JSON.parse(savedChecks))) }
        catch { localStorage.removeItem(`${kljuc}_checks`) }
      }
    }

    // Enkratno ciscenje starih skupnih kljucev - prav ti so vzrok, da je nov
    // profil podedoval napredek prejsnjega.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && (/^vodic_\d{4}_\d{1,2}(_checks)?$/.test(k) || k === 'vodic_profile')) {
          localStorage.removeItem(k)
        }
      }
    } catch { /* brez shrambe ni kaj cistiti */ }
    setLoading(false)
  }

  function saveProfile(p: Profile) {
    localStorage.setItem(org?.id ? `vodic_profile_${org.id}` : 'vodic_profile', JSON.stringify(p))
    setProfile(p)
    setShowProfileSetup(false)
  }

  function toggleCheckItem(stepId: string, index: number, totalChecks: number) {
    const key = `${stepId}:${index}`
    const newSet = new Set(checkedItems)
    if (newSet.has(key)) newSet.delete(key)
    else newSet.add(key)
    setCheckedItems(newSet)
    localStorage.setItem(`${storageKey}_checks`, JSON.stringify([...newSet]))

    // Ko so odkljukane VSE postavke koraka, se korak sam oznaci kot opravljen -
    // in obratno, ce katero odkljukas nazaj.
    const vseOdkljukane = Array.from({ length: totalChecks }, (_, i) => `${stepId}:${i}`)
      .every(k => newSet.has(k))
    const novoOpravljeno = new Set(completed)
    if (vseOdkljukane) novoOpravljeno.add(stepId)
    else novoOpravljeno.delete(stepId)
    setCompleted(novoOpravljeno)
    localStorage.setItem(storageKey, JSON.stringify([...novoOpravljeno]))
  }

  function toggleCompleted(stepId: string) {
    const newSet = new Set(completed)
    if (newSet.has(stepId)) newSet.delete(stepId)
    else newSet.add(stepId)
    setCompleted(newSet)
    localStorage.setItem(storageKey, JSON.stringify([...newSet]))
  }

  if (loading) return (
    <AppLayout>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div style={{ fontSize:'14px', color:'#888' }}>Nalagam...</div>
      </div>
    </AppLayout>
  )

  if (!org) return (
    <AppLayout>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>⚠️</div>
          <div style={{ fontSize:'14px', color:'#888', marginBottom:'12px' }}>Organizacija ni najdena.</div>
          <a href="/onboarding" style={{ fontSize:'13px', color:'#1D9E75', textDecoration:'none' }}>Dokončaj registracijo →</a>
        </div>
      </div>
    </AppLayout>
  )

  const steps = getSteps(profile, org, month, year)
  const step = steps[currentStep]
  const progress = steps.length > 0 ? Math.round((completed.size / steps.length) * 100) : 0
  const requiredSteps = steps.filter(s => s.required)
  const completedRequired = requiredSteps.filter(s => completed.has(s.id)).length

  // Profil setup
  if (showProfileSetup) {
    return (
      <AppLayout org={org}>
        <div style={{ maxWidth:'600px', margin:'0 auto', padding:'40px 24px' }}>
          <div style={{ marginBottom:'32px' }}>
            <div style={{ fontSize:'24px', fontWeight:'500', color:'#0D1F12', marginBottom:'8px' }}>
              Nastavi profil mesečnega vodiča
            </div>
            <div style={{ fontSize:'14px', color:'#888', lineHeight:1.6 }}>
              Vodič bo vsak mesec pokazal samo korake ki so relevantni za tvoje podjetje.
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'32px' }}>
            {PROFILE_QUESTIONS.map(q => {
              const checked = (tempProfile as any)[q.key]
              return (
                <div key={q.key}
                  onClick={() => setTempProfile(p => ({ ...p, [q.key]: !checked }))}
                  style={{
                    background: checked ? '#0D1F12' : '#fff',
                    border: checked ? 'none' : '0.5px solid rgba(0,0,0,0.1)',
                    borderRadius:'12px', padding:'14px', cursor:'pointer',
                    transition:'all 0.15s',
                  }}>
                  <div style={{ fontSize:'20px', marginBottom:'6px' }}>{q.icon}</div>
                  <div style={{ fontSize:'13px', fontWeight:'500', color: checked ? '#fff' : '#0D1F12', marginBottom:'2px' }}>{q.label}</div>
                  <div style={{ fontSize:'11px', color: checked ? 'rgba(255,255,255,0.5)' : '#888' }}>{q.sub}</div>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => saveProfile(tempProfile)}
            style={{ width:'100%', background:'#0D1F12', color:'#fff', border:'none', borderRadius:'12px', padding:'14px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            Shrani profil in začni →
          </button>
        </div>
      </AppLayout>
    )
  }

  if (!step) return null

  return (
    <AppLayout org={org}>
      {/* Header s progress */}
      <div style={{ background:'#0D1F12', padding:'20px 28px', color:'#fff' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>
              Mesečni vodič
            </div>
            <div style={{ fontSize:'18px', fontWeight:'500' }}>
              {MONTHS[month]} {year} · {completedRequired}/{requiredSteps.length} obveznih
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)' }}>{progress}% opravljeno</div>
            <button
              onClick={() => { setTempProfile({...profile}); setShowProfileSetup(true) }}
              style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.6)', fontSize:'11px', padding:'5px 10px', borderRadius:'20px', cursor:'pointer' }}>
              ⚙️ Profil
            </button>
          </div>
        </div>

        <div style={{ height:'4px', background:'rgba(255,255,255,0.1)', borderRadius:'2px', marginBottom:'12px' }}>
          <div style={{ height:'4px', background:'#9FE1CB', borderRadius:'2px', width:`${progress}%`, transition:'width 0.4s' }} />
        </div>

        <div style={{ display:'flex', gap:'4px' }}>
          {steps.map((s, i) => (
            <div key={s.id}
              onClick={() => setCurrentStep(i)}
              title={s.title}
              style={{
                flex:1, height:'3px', borderRadius:'2px', cursor:'pointer',
                background: completed.has(s.id) ? '#9FE1CB' : i === currentStep ? '#fff' : 'rgba(255,255,255,0.15)',
              }} />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth:'700px', margin:'0 auto', padding:'28px 24px' }}>

        <div style={{ display:'flex', alignItems:'flex-start', gap:'16px', marginBottom:'20px' }}>
          <div style={{ fontSize:'36px', flexShrink:0 }}>{step.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px' }}>
              Korak {currentStep + 1} od {steps.length} · {step.required ? 'Obvezno' : 'Priporočeno'}
            </div>
            <div style={{ fontSize:'22px', fontWeight:'500', color:'#0D1F12', marginBottom:'4px' }}>{step.title}</div>
            <div style={{ fontSize:'13px', color:'#888' }}>{step.subtitle}</div>
          </div>
          {completed.has(step.id) && (
            <div style={{ background:'#EAF3DE', color:'#27500A', fontSize:'12px', padding:'5px 12px', borderRadius:'20px', fontWeight:'500', flexShrink:0 }}>
              ✓ Opravljeno
            </div>
          )}
        </div>

        {step.urgent && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F7C1C1', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ fontSize:'14px' }}>⏰</span>
            <span style={{ fontSize:'12px', color:'#A32D2D', fontWeight:'500' }}>{step.urgent}</span>
          </div>
        )}

        <div style={{ background:'#EAF3DE', borderRadius:'12px', padding:'14px 16px', marginBottom:'20px' }}>
          <div style={{ fontSize:'10px', color:'#3B6D11', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:'500', marginBottom:'4px' }}>Zakaj je to pomembno?</div>
          <div style={{ fontSize:'13px', color:'#27500A', lineHeight:1.6 }}>{step.why}</div>
        </div>

        {step.href && (
          <div style={{ marginBottom:'20px' }}>
            <Link href={step.href} style={{ textDecoration:'none' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'#0D1F12', color:'#fff', borderRadius:'10px', padding:'11px 20px', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                {step.hrefLabel} →
              </div>
            </Link>
          </div>
        )}

        <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', marginBottom:'24px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)', fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>
            Kontrolni seznam
          </div>
          {step.checks.map((check, i) => {
            const odkljukana = checkedItems.has(`${step.id}:${i}`)
            return (
              <div
                key={i}
                onClick={() => toggleCheckItem(step.id, i, step.checks.length)}
                style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 16px', cursor:'pointer', background: odkljukana ? '#F6FAF2' : 'transparent', borderBottom: i < step.checks.length-1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none' }}
              >
                <div style={{ width:'18px', height:'18px', borderRadius:'50%', border: odkljukana ? '1.5px solid #1D9E75' : '1.5px solid #ddd', background: odkljukana ? '#1D9E75' : 'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {odkljukana && <span style={{ color:'#fff', fontSize:'11px', lineHeight:1 }}>✓</span>}
                </div>
                <div style={{ fontSize:'13px', color: odkljukana ? '#7A8B7F' : '#0D1F12', textDecoration: odkljukana ? 'line-through' : 'none' }}>{check}</div>
              </div>
            )
          })}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:'16px', borderTop:'0.5px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={{ padding:'9px 20px', borderRadius:'8px', border:'0.5px solid rgba(0,0,0,0.1)', fontSize:'13px', cursor: currentStep === 0 ? 'not-allowed' : 'pointer', background:'#fff', color: currentStep === 0 ? '#ccc' : '#0D1F12', fontWeight:'500' }}>
            ← Nazaj
          </button>

          <button
            onClick={() => toggleCompleted(step.id)}
            style={{
              padding:'9px 20px', borderRadius:'8px', border:'none', fontSize:'13px', cursor:'pointer', fontWeight:'500',
              background: completed.has(step.id) ? '#F7F6F2' : '#EAF3DE',
              color: completed.has(step.id) ? '#888' : '#27500A',
            }}>
            {completed.has(step.id) ? 'Označi kot neizvedeno' : '✓ Označim kot opravljeno'}
          </button>

          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            disabled={currentStep === steps.length - 1}
            style={{ padding:'9px 20px', borderRadius:'8px', border:'none', fontSize:'13px', cursor: currentStep === steps.length - 1 ? 'not-allowed' : 'pointer', background: currentStep === steps.length - 1 ? '#ccc' : '#0D1F12', color:'#fff', fontWeight:'500' }}>
            Naprej →
          </button>
        </div>

        {/* DODANO (18.8.2026): pregled tega, kar se ostaja. Prej si lahko sel skozi
            vse korake in nikjer ni bilo vidno, kaj si preskocil. Zdaj so
            nedokoncane postavke zbrane na enem mestu; klik skoci na njihov korak. */}
        {(() => {
          const preostalo = steps.flatMap((st, stepIndex) =>
            st.checks
              .map((c, i) => ({ stepId: st.id, stepTitle: st.title, stepIndex, check: c, i, required: st.required }))
              .filter(x => !checkedItems.has(`${x.stepId}:${x.i}`))
          )
          if (preostalo.length === 0) {
            return (
              <div style={{ marginTop:'24px', background:'#EAF3DE', border:'0.5px solid #CFE3BC', borderRadius:'12px', padding:'16px 18px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#27500A' }}>Vse opravljeno za ta mesec.</div>
                <div style={{ fontSize:'12px', color:'#3B6D11', marginTop:'4px' }}>Nič ti ne ostaja na seznamu.</div>
              </div>
            )
          }
          return (
            <div style={{ marginTop:'24px', background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)', fontSize:'12px', fontWeight:600, color:'#0D1F12', display:'flex', justifyContent:'space-between' }}>
                <span>Še za postoriti</span>
                <span style={{ color:'#A32D2D' }}>{preostalo.length}</span>
              </div>
              {preostalo.slice(0, 20).map((x, idx) => (
                <div
                  key={`${x.stepId}-${x.i}`}
                  onClick={() => setCurrentStep(x.stepIndex)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 16px', cursor:'pointer', borderBottom: idx < Math.min(preostalo.length, 20) - 1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none' }}
                >
                  <div style={{ fontSize:'13px', color:'#0D1F12' }}>{x.check}</div>
                  <div style={{ fontSize:'11px', color:'#888', whiteSpace:'nowrap' }}>
                    {x.stepTitle}{x.required ? '' : ' · neobvezno'}
                  </div>
                </div>
              ))}
              {preostalo.length > 20 && (
                <div style={{ padding:'10px 16px', fontSize:'12px', color:'#888' }}>… in še {preostalo.length - 20}</div>
              )}
            </div>
          )
        })()}
      </div>
    </AppLayout>
  )
}
