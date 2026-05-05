'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'

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

  // 1. Vedno — uvod
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

  // 2. Storitveni računi (fizioterapija, fitnes)
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
        'Vsi fizioterapevtski obiski fakturirani',
        'Fitnes članarine za mesec izdane',
        'Zunanji računi uvoženi (če imaš drug sistem)',
        'Preveriti neplačane iz prejšnjega meseca',
      ],
    })
  }

  // 3. Blagajna — bar / gostilna
  if (profile.hasCashRegister) {
    steps.push({
      id: 'blagajna',
      icon: '🏪',
      title: 'Blagajna — dnevni zaključki',
      subtitle: 'Z-reporti in gotovinski promet bara',
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

  // 4. Kartični terminal
  if (profile.hasCardTerminal) {
    steps.push({
      id: 'kartice',
      icon: '💳',
      title: 'Kartični terminal — Worldline / SumUp',
      subtitle: 'Mesečni obračun kartičnih plačil',
      why: 'Worldline in SumUp pošljeta mesečni obračun — ta mora biti usklajen z bančnim izpiskom. Razlike pomenijo napako.',
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

  // 5. Bančni izpisek — vsi
  steps.push({
    id: 'banka',
    icon: '🏦',
    title: 'Bančni izpisek',
    subtitle: 'Uvoz in uskladitev transakcij',
    why: 'Bančni izpisek je osnova za KPO knjigo. Vsaka transakcija mora biti kategorizirana — prihodek ali odhodek.',
    required: true,
    href: '/banka',
    hrefLabel: 'Uvozi izpisek',
    checks: [
      `Prenesti izpisek za ${m} iz e-banke (CSV/XML)`,
      'Uvoziti v aplikacijo',
      'Kategorizirati vse transakcije',
      'Uskladiti z izdanimi računi',
      'Uskladiti s karticami in gotovino',
    ],
  })

  // 6. Prejeti stroški — vsi
  steps.push({
    id: 'stroski',
    icon: '🧾',
    title: 'Prejeti računi in stroški',
    subtitle: 'Dobavitelji, najemnine, režije',
    why: `Vsak evidentiran strošek zmanjša davčno osnovo. Za bar to pomeni: pijača, hrana, čistila. Za fitnes: oprema, najemnina. Za fizioterapijo: material, oprema.`,
    required: true,
    href: '/expenses',
    hrefLabel: '+ Dodaj strošek',
    checks: [
      profile.hasCashRegister ? 'Dobaviteljski računi bara (pijača, hrana)' : '',
      profile.hasDepreciation ? 'Računi za fitnes opremo / vzdrževanje' : '',
      'Najemnina poslovnega prostora',
      'Telefonski in internetni račun',
      'Elektrika, voda, komunala',
      'Računovodski in pravni stroški',
      'Ostali poslovni stroški',
    ].filter(Boolean),
  })

  // 7. Plače + REK-1
  if (profile.hasEmployees) {
    steps.push({
      id: 'place',
      icon: '👥',
      title: 'Plače in REK-1',
      subtitle: 'Izračun in izplačilo plač zaposlenim',
      why: 'REK-1 mora biti oddan na eDavki PREDEN nakaže plačo. To je zakonska zahteva — zamude pomenijo kazni in težave z inšpekcijo dela.',
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

    // Potni stroški
    steps.push({
      id: 'potni',
      icon: '✈️',
      title: 'Potni stroški zaposlenih',
      subtitle: 'Dnevnice, km, nočnine',
      why: 'Povračila stroškov zaposlenim so neobdavčena do zakonskega limita. Nad limitom je obdavčeno kot dohodek.',
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

  // 8. Prispevki s.p. — vsi
  steps.push({
    id: 'prispevki',
    icon: '💰',
    title: 'Prispevki s.p.',
    subtitle: 'ZPIZ + ZZZS — rok 15. v mesecu',
    why: 'Prispevki za socialno varnost so obvezni vsak mesec do 15. Ne plačevanje povzroči zakonske zamudne obresti in blokado.',
    urgent: `Rok: 15. ${m}`,
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

  // 9. Akontacija dohodnine — vsi
  steps.push({
    id: 'akontacija',
    icon: '📊',
    title: 'Akontacija dohodnine',
    subtitle: 'Mesečno predplačilo davka',
    why: 'Akontacija je mesečno predplačilo dohodnine ki ga določi FURS z odločbo. Ne plačevanje se sešteva in pride kot velik dolg ob letni napovedi.',
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

  // 10. DDV-O — samo DDV zavezanci, četrtletno
  if (profile.isVatRegistered) {
    const ddvMonths = [3, 6, 9, 0] // april=3, julij=6, oktober=9, januar=0
    const isDdvMonth = ddvMonths.includes(month)
    steps.push({
      id: 'ddv',
      icon: '🏛️',
      title: isDdvMonth ? 'DDV-O obračun — ODDATI!' : 'DDV evidenca',
      subtitle: isDdvMonth ? `Četrtletni DDV-O za Q${Math.ceil((month+1)/3)} — rok konec ${m}` : 'Sproti voditi DDV evidenco',
      why: 'Kot DDV zavezanec moraš voditi evidenco DDV vhoda in izhoda. Vsak račun mora biti pravilno knjižen. Četrtletno oddate DDV-O obrazec.',
      urgent: isDdvMonth ? `ODDATI DDV-O do konca ${m}!` : undefined,
      required: true,
      href: isDdvMonth ? '/ddv/evidenca' : '/ddv',
      hrefLabel: isDdvMonth ? 'Pripravi DDV-O' : 'DDV evidenca',
      checks: isDdvMonth ? [
        'Preveriti vse izhodne DDV račune',
        'Preveriti vse vhodne DDV račune',
        'Preveriti razliko DDV',
        'Oddati DDV-O na eDavki',
        'Nakazati DDV dolg (če pozitiven)',
      ] : [
        'Preveriti ali so vsi računi pravilno knjiženi',
        'Preveriti DDV stopnje (22% / 9.5% / 0%)',
      ],
    })
  }

  // 11. Zaloga — bar
  if (profile.hasInventory) {
    steps.push({
      id: 'zaloga',
      icon: '📦',
      title: 'Zaloga',
      subtitle: 'Popis in gibanje zaloge bara',
      why: 'Zaloga je sredstvo podjetja — njena vrednost vpliva na DDD. Mesečni popis pomaga odkriti razlike (krajo, pokvarjeno blago).',
      required: false,
      href: '/zaloga',
      hrefLabel: 'Evidenca zaloge',
      checks: [
        'Preveriti stanje pijače in hrane',
        'Vpisati nove nabave',
        'Preveriti razlike',
        'December: formalni popis 31.12.',
      ],
    })
  }

  // 12. Amortizacija — fitnes
  if (profile.hasDepreciation) {
    steps.push({
      id: 'amortizacija',
      icon: '⚙️',
      title: 'Amortizacija opreme',
      subtitle: 'Mesečno vrednotenje fitnes opreme',
      why: 'Fitnes oprema se amortizira letno (25% = 4 leta). To je odhodek ki zmanjša davčno osnovo brez dejanskega plačila.',
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

  // 13. Kilometrina
  if (profile.usesCar) {
    steps.push({
      id: 'kilometrina',
      icon: '🚗',
      title: 'Kilometrina in potni nalogi',
      subtitle: 'Prevoženi km za poslovne namene',
      why: 'Vsak km za poslovni namen = €0.21 odhodka. Na letni ravni se to hitro nabere.',
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

  // 14. Reprezentanca
  if (profile.hasRepresentanca) {
    steps.push({
      id: 'reprezentanca',
      icon: '🍽️',
      title: 'Reprezentanca',
      subtitle: 'Poslovni obroki in darila',
      why: '50% poslovnih obrokov je davčno priznavnih. Brez evidence = ni odbitka.',
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

  // 15. Opomniki za zamude
  steps.push({
    id: 'opomniki',
    icon: '⚠️',
    title: 'Opomniki za zamude',
    subtitle: 'Neplačani računi — pošlji opomnike',
    why: 'Vsak dan zamude = zakonske obresti (TOM+8%). Po 30 dneh pošljite 2. opomnik, po 60 dneh pa predajte izterjavi.',
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

  // 16. Zaključek
  steps.push({
    id: 'zakljucek',
    icon: '✅',
    title: `${m} ${year} — zaključen!`,
    subtitle: 'Povzetek meseca in naslednji roki',
    why: 'Čestitke! Mesec je računovodsko zaključen. Shranite povzetek za arhiv.',
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
  { key: 'hasServiceInvoices', label: 'Storitve / Fizioterapija / Svetovanje', sub: 'Fakturiraš stranke za storitve', icon: '📋' },
  { key: 'hasCashRegister', label: 'Bar / Gostilna / Maloprodaja', sub: 'Sprejemaš gotovinska plačila z blagajno', icon: '🏪' },
  { key: 'hasCardTerminal', label: 'Kartični terminal', sub: 'Worldline, SumUp ali podobno', icon: '💳' },
  { key: 'hasEmployees', label: 'Imam zaposlene', sub: 'En ali več delavcev', icon: '👥' },
  { key: 'isVatRegistered', label: 'DDV zavezanec', sub: 'Zaračunavam DDV na račune', icon: '🏛️' },
  { key: 'hasInventory', label: 'Vodim zalogo', sub: 'Bar, trgovina, zaloga blaga', icon: '📦' },
  { key: 'hasDepreciation', label: 'Imam drago opremo', sub: 'Fitnes, medicinska oprema, stroji', icon: '⚙️' },
  { key: 'usesCar', label: 'Uporabljam avto za posel', sub: 'Kilometrina, potni nalogi', icon: '🚗' },
  { key: 'hasRepresentanca', label: 'Imam poslovne obroke', sub: 'Sestanki, darila strankam', icon: '🍽️' },
]

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
  const [tempProfile, setTempProfile] = useState<Profile>({ ...profile })
  const supabase = createClient()
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  const storageKey = `vodic_${year}_${month}`

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      setProfile(prev => ({
        ...prev,
        isVatRegistered: o.vat_registered || false,
      }))
    }
    // Naloži profil iz localStorage
    const savedProfile = localStorage.getItem('vodic_profile')
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile))
    } else {
      setShowProfileSetup(true)
    }
    // Naloži napredek
    const savedProgress = localStorage.getItem(storageKey)
    if (savedProgress) {
      setCompleted(new Set(JSON.parse(savedProgress)))
    }
    setLoading(false)
  }

  function saveProfile(p: Profile) {
    localStorage.setItem('vodic_profile', JSON.stringify(p))
    setProfile(p)
    setShowProfileSetup(false)
  }

  function toggleCompleted(stepId: string) {
    const newSet = new Set(completed)
    if (newSet.has(stepId)) newSet.delete(stepId)
    else newSet.add(stepId)
    setCompleted(newSet)
    localStorage.setItem(storageKey, JSON.stringify([...newSet]))
  }

  const steps = org ? getSteps(profile, org, month, year) : []
  const step = steps[currentStep]
  const progress = steps.length > 0 ? Math.round((completed.size / steps.length) * 100) : 0
  const requiredSteps = steps.filter(s => s.required)
  const completedRequired = requiredSteps.filter(s => completed.has(s.id)).length

  if (loading) return (
    <AppLayout>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div style={{ fontSize:'14px', color:'#888' }}>Nalagam...</div>
      </div>
    </AppLayout>
  )

  // Profil setup
  if (showProfileSetup) {
    return (
      <AppLayout org={org}>
        <div style={{ maxWidth:'600px', margin:'0 auto', padding:'40px 24px' }}>
          <div style={{ marginBottom:'32px' }}>
            <div style={{ fontSize:'24px', fontWeight:'500', color:'#0D1F12', marginBottom:'8px' }}>
              Nastavi svoj profil
            </div>
            <div style={{ fontSize:'14px', color:'#888', lineHeight:1.6 }}>
              Enkrat nastavi kaj delaš — vodič bo vsak mesec pokazal samo korake ki so relevantni za tvoje podjetje.
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
              onClick={() => setShowProfileSetup(true)}
              style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.6)', fontSize:'11px', padding:'5px 10px', borderRadius:'20px', cursor:'pointer' }}>
              ⚙️ Profil
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height:'4px', background:'rgba(255,255,255,0.1)', borderRadius:'2px', marginBottom:'12px' }}>
          <div style={{ height:'4px', background:'#9FE1CB', borderRadius:'2px', width:`${progress}%`, transition:'width 0.4s' }} />
        </div>

        {/* Step dots */}
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

        {/* Step header */}
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

        {/* Urgent badge */}
        {step.urgent && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F7C1C1', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ fontSize:'14px' }}>⏰</span>
            <span style={{ fontSize:'12px', color:'#A32D2D', fontWeight:'500' }}>{step.urgent}</span>
          </div>
        )}

        {/* Zakaj box */}
        <div style={{ background:'#EAF3DE', borderRadius:'12px', padding:'14px 16px', marginBottom:'20px' }}>
          <div style={{ fontSize:'10px', color:'#3B6D11', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:'500', marginBottom:'4px' }}>Zakaj je to pomembno?</div>
          <div style={{ fontSize:'13px', color:'#27500A', lineHeight:1.6 }}>{step.why}</div>
        </div>

        {/* Action button */}
        {step.href && (
          <div style={{ marginBottom:'20px' }}>
            <Link href={step.href} style={{ textDecoration:'none' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'#0D1F12', color:'#fff', borderRadius:'10px', padding:'11px 20px', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                {step.hrefLabel} →
              </div>
            </Link>
          </div>
        )}

        {/* Checklist */}
        <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', marginBottom:'24px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)', fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>
            Kontrolni seznam
          </div>
          {step.checks.map((check, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 16px', borderBottom: i < step.checks.length-1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none' }}>
              <div style={{ width:'18px', height:'18px', borderRadius:'50%', border:'1.5px solid #ddd', flexShrink:0 }} />
              <div style={{ fontSize:'13px', color:'#0D1F12' }}>{check}</div>
            </div>
          ))}
        </div>

        {/* Footer navigation */}
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
      </div>
    </AppLayout>
  )
}