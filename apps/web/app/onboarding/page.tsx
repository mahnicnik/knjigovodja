'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import posthog from 'posthog-js'

const ALL_STEPS = [
  {
    id: 'tip',
    title: 'Kakšna je vaša pravna oblika?',
    sub: 'To določi katere davčne obveznosti imate.',
    type: 'single' as const,
    showIf: (_a: any) => true,
    options: [
      { icon: '👤', label: 'Samostojni podjetnik (s.p.)', desc: 'Normirani ali dejanski stroški', value: 'sp' },
      { icon: '🏢', label: 'd.o.o. / d.n.o.', desc: 'Kapitalska družba', value: 'doo' },
      { icon: '🤝', label: 'Zavod / društvo', desc: 'Nepridobitna organizacija', value: 'zavod' },
    ],
  },
  {
    id: 'ddv',
    title: 'Ali ste DDV zavezanec?',
    sub: 'Zavezanec postanete pri obdavčljivem prometu nad 60.000 € v zadnjih 12 mesecih (velja od 1.1.2025) ali prostovoljno.',
    type: 'single' as const,
    showIf: (_a: any) => true,
    options: [
      { icon: '✅', label: 'Da, sem DDV zavezanec', desc: 'Oddajam DDV-O obrazce', value: 'yes' },
      { icon: '❌', label: 'Ne, nisem zavezanec', desc: 'Manjši promet ali normiranec', value: 'no' },
      { icon: '🔄', label: 'Bom kmalu postal', desc: 'Blizu mejnika 60.000 €', value: 'soon' },
    ],
  },
  {
    id: 'dejavnost',
    title: 'Katera področja pokriva vaše poslovanje?',
    sub: 'Izberite vse kar velja.',
    type: 'multi' as const,
    showIf: (_a: any) => true,
    options: [
      { icon: '💼', label: 'Storitve', desc: 'Svetovanje, IT, marketing, pravo...', value: 'storitve' },
      { icon: '🛍️', label: 'Prodaja blaga', desc: 'Maloprodaja, veleprodaja, splet', value: 'blago' },
      { icon: '🍽️', label: 'Gostinstvo / turizem', desc: 'Restavracija, hotel, catering', value: 'gostinstvo' },
      { icon: '🏗️', label: 'Gradbeništvo / obrt', desc: 'Gradbena dela, rokodelstvo', value: 'gradnja' },
      { icon: '🚗', label: 'Transport / dostava', desc: 'Prevozi, kurirska služba', value: 'transport' },
      { icon: '💻', label: 'Digitalni produkti', desc: 'SaaS, licence, aplikacije', value: 'digital' },
    ],
  },
  {
    id: 'zaposleni',
    title: 'Ali imate zaposlene?',
    sub: 'Modul za plače, REK-1 in dopust aktiviramo samo če jih potrebujete.',
    type: 'single' as const,
    showIf: (a: any) => {
      if (a.tip === 'doo' || a.tip === 'zavod') return true
      const d = (a.dejavnost as string[]) || []
      return d.includes('gostinstvo') || d.includes('gradnja') || d.includes('transport') || d.includes('blago')
    },
    options: [
      { icon: '👥', label: 'Da, imam zaposlene', desc: 'Potrebujem obračun plač in REK-1', value: 'yes' },
      { icon: '👤', label: 'Samo jaz (lastnik)', desc: 'Brez zaposlenih', value: 'solo' },
      { icon: '🔜', label: 'Načrtujem zaposlovanje', desc: 'V kratkem bom zaposlil', value: 'soon' },
    ],
  },
  {
    id: 'davcni_sistem',
    title: 'Kateri davčni sistem uporabljate?',
    sub: 'To določi izračun davkov in priznanih odhodkov.',
    type: 'single' as const,
    showIf: (a: any) => a.tip === 'sp',
    options: [
      { icon: '📊', label: 'Normirani 80%', desc: 'Prag 120.000 € (od 2026); 80% odhodkov priznanih do 60.000 € prihodkov, nad tem 0%', value: 'normirani_80' },
      { icon: '📈', label: 'Normirani 40%', desc: 'Priznani odhodki = 40% prihodkov (do 100.000 € letno)', value: 'normirani_40' },
      { icon: '📒', label: 'Dejanski stroški', desc: 'KPO knjiga z dejanskimi računi za odhodke', value: 'dejanski' },
    ],
  },
  {
    id: 'extras',
    title: 'Kaj še uporabljate?',
    sub: 'Aktiviramo samo module ki jih dejansko potrebujete.',
    type: 'multi' as const,
    showIf: (_a: any) => true,
    options: [
      { icon: '🚗', label: 'Službeni avto', desc: 'Kilometrina, stroški avta', value: 'avto' },
      { icon: '✈️', label: 'Potni stroški', desc: 'Dnevnice, potni nalogi', value: 'potni' },
      { icon: '📦', label: 'Zaloga', desc: 'Upravljanje zalog in artiklov', value: 'zaloga' },
      { icon: '📉', label: 'Osnovna sredstva', desc: 'Amortizacija opreme', value: 'amort' },
      { icon: '🏧', label: 'Blagajna / POS', desc: 'Fizična prodaja na blagajni', value: 'blagajna' },
      { icon: '🍷', label: 'Reprezentanca', desc: 'Poslovne gostitve', value: 'repr' },
    ],
  },
]

type Answers = Record<string, string | string[]>

function getVisibleSteps(answers: Answers) {
  return ALL_STEPS.filter(s => s.showIf(answers))
}

function computeHiddenNav(answers: Answers): string[] {
  const hidden: string[] = []
  const d = (answers.dejavnost as string[]) || []
  const e = (answers.extras as string[]) || []
  const tip = answers.tip as string
  const ddv = answers.ddv as string
  const zap = answers.zaposleni as string

  if (!e.includes('zaloga') && !d.includes('blago') && !d.includes('gostinstvo')) hidden.push('/zaloga')
  if (!e.includes('amort')) hidden.push('/amortizacija')
  if (!e.includes('avto') && !d.includes('transport')) { hidden.push('/kilometrina'); hidden.push('/avto') }
  if (!e.includes('potni')) hidden.push('/potni-stroski')
  if (!e.includes('repr')) hidden.push('/reprezentanca')
  if (!e.includes('blagajna') && !d.includes('gostinstvo')) hidden.push('/blagajna')
  if (zap !== 'yes' && zap !== 'soon') { hidden.push('/place'); hidden.push('/rek1'); hidden.push('/dopust') }
  if (ddv !== 'yes' && ddv !== 'soon') { hidden.push('/ddv'); hidden.push('/ddv/evidenca') }
  if (tip !== 'sp') { hidden.push('/normirani'); hidden.push('/prispevki'); hidden.push('/kpo') }
  if (!d.includes('storitve') && !d.includes('digital')) hidden.push('/eslog')
  return hidden
}

function computeQuickActions(answers: Answers): string[] {
  const d = (answers.dejavnost as string[]) || []
  const e = (answers.extras as string[]) || []
  const ddv = answers.ddv as string
  const tip = answers.tip as string
  const qa = ['/invoices/new', '/expenses']
  if (d.includes('blago') || d.includes('gostinstvo') || e.includes('blagajna')) qa.push('/blagajna')
  if (ddv === 'yes' || ddv === 'soon') qa.push('/ddv')
  if (tip === 'sp') qa.push('/prispevki')
  qa.push('/scan')
  if (d.includes('storitve') || d.includes('digital')) qa.push('/ai')
  return qa.slice(0, 6)
}

function recommendPlan(answers: Answers): { plan: 'pro' | 'pro_pos', reason: string } {
  const dejavnost = (answers.dejavnost as string[]) || []
  const needsPos = dejavnost.includes('gostinstvo') || dejavnost.includes('blago')
  const hasFitness = dejavnost.includes('storitve') && answers.tip === 'sp'

  if (needsPos) {
    return { plan: 'pro_pos', reason: 'Gostinstvo in prodaja blaga zahtevata POS blagajno.' }
  }
  if (answers.extras && (answers.extras as string[]).includes('blagajna')) {
    return { plan: 'pro_pos', reason: 'Izbrali ste POS blagajno.' }
  }
  return { plan: 'pro', reason: 'Za vaše poslovanje zadostuje Pro paket.' }
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showNameStep, setShowNameStep] = useState(true)

  const visibleSteps = getVisibleSteps(answers)
  const totalDots = visibleSteps.length + 2
  const currentDot = showNameStep ? 0 : step + 1
  const isResult = !showNameStep && step >= visibleSteps.length

  function getSelected(stepId: string): string[] {
    const s = visibleSteps[step]
    if (!s) return []
    if (s.type === 'single') return answers[stepId] ? [answers[stepId] as string] : []
    return (answers[stepId] as string[]) || []
  }

  function toggleOption(stepId: string, value: string, type: 'single' | 'multi') {
    if (type === 'single') {
      setAnswers(prev => ({ ...prev, [stepId]: value }))
    } else {
      const cur = (answers[stepId] as string[]) || []
      setAnswers(prev => ({
        ...prev,
        [stepId]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value],
      }))
    }
  }

  function canNext(): boolean {
    if (showNameStep) return orgName.trim().length > 2
    const s = visibleSteps[step]
    if (!s) return true
    if (s.type === 'single') return getSelected(s.id).length > 0
    return true
  }

  async function finish() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Niste prijavljeni. Prosimo prijavite se.')
        setSaving(false)
        return
      }

      const finalAnswers = { ...answers }
      if (!finalAnswers.zaposleni) finalAnswers.zaposleni = 'solo'
      if (!finalAnswers.extras) finalAnswers.extras = []

      // Pridobi obstoječi org (ki ga je ustvaril trigger ob registraciji)
      const { data: member, error: memberFetchErr } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (memberFetchErr || !member) {
        setError('Organizacija ni najdena. Prosimo poskusite se znova prijaviti.')
        setSaving(false)
        return
      }

      // Določi tax_system na podlagi pravne oblike
      const taxSystem = finalAnswers.tip === 'sp'
        ? (finalAnswers.davcni_sistem || 'normirani_80')
        : finalAnswers.tip === 'doo'
          ? 'doo_obdavcitev'
          : null

      // Posodobi org z imenom, DDV statusom in davčnim sistemom
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .update({
          name: orgName,
          vat_registered: finalAnswers.ddv === 'yes',
          tax_system: taxSystem,
        })
        .eq('id', member.org_id)
        .select()
        .single()

      if (orgError) {
        setError(`Napaka pri posodabljanju organizacije: ${orgError.message}`)
        setSaving(false)
        return
      }

      // Shrani preferences
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          nav_hidden: computeHiddenNav(finalAnswers),
          nav_order: ['Pregled', 'Poslovanje', 'Davki', 'Zaposleni', 'Evidenca', 'Blagajna'],
          quick_actions: computeQuickActions(finalAnswers),
          onboarding_answers: finalAnswers,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (prefError) {
        // Preferences napaka ni kritična — gremo naprej
        console.error('Preferences error:', prefError)
      }

      posthog.identify(user.id, { email: user.email })
      posthog.capture('onboarding_completed', {
        org_name: orgName,
        business_type: finalAnswers.tip,
        tax_system: taxSystem,
        vat_registered: finalAnswers.ddv === 'yes',
        has_employees: finalAnswers.zaposleni === 'yes',
        industries: finalAnswers.dejavnost,
        active_modules: 18 - computeHiddenNav(finalAnswers).length,
      })

      router.push('/dobrodosli')

    } catch (e: any) {
      setError(`Nepričakovana napaka: ${e.message}`)
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '18px', fontWeight: '500', color: '#0D1F12' }}>Računko</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Nastavimo vašo aplikacijo</div>
        </div>

        <div style={{ display: 'flex', gap: '5px', marginBottom: '28px' }}>
          {Array.from({ length: totalDots }).map((_, i) => (
            <div key={i} style={{
              height: '3px', flex: 1, borderRadius: '2px',
              background: i < currentDot ? '#1D9E75' : i === currentDot ? '#0D1F12' : 'rgba(0,0,0,0.12)',
              transition: 'background .3s',
            }} />
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid rgba(0,0,0,0.08)', padding: '28px 24px' }}>

          {/* IME */}
          {showNameStep && (
            <div>
              <div style={{ fontSize: '11px', color: '#888', letterSpacing: '.05em', marginBottom: '8px' }}>KORAK 1</div>
              <div style={{ fontSize: '22px', fontWeight: '500', color: '#0D1F12', marginBottom: '6px', lineHeight: 1.3 }}>
                Kako se imenuje vaše podjetje?
              </div>
              <div style={{ fontSize: '13px', color: '#888', marginBottom: '24px', lineHeight: 1.5 }}>
                To ime bo prikazano v aplikaciji in na računih.
              </div>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="npr. Kovač Consulting s.p."
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px',
                  border: '0.5px solid rgba(0,0,0,0.15)', fontSize: '14px',
                  outline: 'none', color: '#0D1F12', background: '#fff',
                }}
                onKeyDown={e => { if (e.key === 'Enter' && canNext()) setShowNameStep(false) }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowNameStep(false)} disabled={!canNext()} style={{
                  background: '#0D1F12', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '10px 24px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                  opacity: canNext() ? 1 : 0.4,
                }}>Naprej →</button>
              </div>
            </div>
          )}

          {/* VPRAŠANJA */}
          {!showNameStep && !isResult && (() => {
            const s = visibleSteps[step]
            if (!s) return null
            const selected = getSelected(s.id)
            return (
              <div>
                <div style={{ fontSize: '11px', color: '#888', letterSpacing: '.05em', marginBottom: '8px' }}>
                  KORAK {step + 2} OD {visibleSteps.length + 2}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#0D1F12', marginBottom: '6px', lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ fontSize: '13px', color: '#888', marginBottom: s.type === 'multi' ? '8px' : '20px', lineHeight: 1.5 }}>{s.sub}</div>
                {s.type === 'multi' && (
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>Izberite vse kar velja — lahko tudi nič</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {s.options.map(o => (
                    <div key={o.value} onClick={() => toggleOption(s.id, o.value, s.type)} style={{
                      border: selected.includes(o.value) ? '2px solid #1D9E75' : '0.5px solid rgba(0,0,0,0.12)',
                      borderRadius: '10px', padding: '11px 14px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: selected.includes(o.value) ? '#E1F5EE' : '#fff',
                      transition: 'all .15s',
                    }}>
                      <span style={{ fontSize: '20px', flexShrink: 0, width: '28px', textAlign: 'center' }}>{o.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>{o.label}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{o.desc}</div>
                      </div>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: selected.includes(o.value) ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
                        background: selected.includes(o.value) ? '#1D9E75' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', color: '#fff',
                      }}>{selected.includes(o.value) ? '✓' : ''}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                  <button onClick={() => step === 0 ? setShowNameStep(true) : setStep(s => s - 1)} style={{
                    background: 'none', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: '8px',
                    padding: '9px 18px', fontSize: '13px', color: '#666', cursor: 'pointer',
                  }}>← Nazaj</button>
                  <button
                    onClick={() => { if (canNext()) setStep(s => s + 1) }}
                    disabled={!canNext()}
                    style={{
                      background: '#0D1F12', color: '#fff', border: 'none', borderRadius: '8px',
                      padding: '10px 24px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                      opacity: canNext() ? 1 : 0.4,
                    }}>
                    {step === visibleSteps.length - 1 ? 'Prikaži rezultat →' : 'Naprej →'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* REZULTAT */}
          {isResult && (() => {
            const finalAnswers = { ...answers }
            if (!finalAnswers.zaposleni) finalAnswers.zaposleni = 'solo'
            if (!finalAnswers.extras) finalAnswers.extras = []
            const hidden = computeHiddenNav(finalAnswers)
            const activeCount = 18 - hidden.length
            const taxSystemLabel = finalAnswers.davcni_sistem === 'normirani_80' ? 'Normirani 80%'
              : finalAnswers.davcni_sistem === 'normirani_40' ? 'Normirani 40%'
              : finalAnswers.davcni_sistem === 'dejanski' ? 'Dejanski stroški'
              : finalAnswers.tip === 'doo' ? 'd.o.o. obdavčitev'
              : '—'
            return (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: '#0D1F12' }}>Aplikacija je pripravljena!</div>
                  <div style={{ fontSize: '13px', color: '#888', marginTop: '6px' }}>
                    Aktivirali smo <strong>{activeCount} modulov</strong> ki ustrezajo vašemu poslovanju.
                  </div>
                </div>

                <div style={{ background: '#F7F6F2', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#888', marginBottom: '10px', letterSpacing: '.04em' }}>VAŠA KONFIGURACIJA</div>
                  {[
                    { label: 'Ime podjetja', value: orgName },
                    { label: 'Pravna oblika', value: answers.tip === 'sp' ? 'Samostojni podjetnik' : answers.tip === 'doo' ? 'd.o.o.' : 'Zavod/društvo' },
                    { label: 'Davčni sistem', value: taxSystemLabel },
                    { label: 'DDV', value: answers.ddv === 'yes' ? 'Zavezanec' : answers.ddv === 'soon' ? 'Kmalu zavezanec' : 'Ni zavezanec' },
                    { label: 'Zaposleni', value: finalAnswers.zaposleni === 'yes' ? 'Da' : finalAnswers.zaposleni === 'soon' ? 'Kmalu' : 'Ne' },
                    { label: 'Aktivni moduli', value: `${activeCount} od 18` },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: '13px' }}>
                      <span style={{ color: '#666' }}>{item.label}</span>
                      <span style={{ fontWeight: '500', color: '#0D1F12' }}>{item.value}</span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div style={{ background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#A32D2D' }}>
                    {error}
                  </div>
                )}

                {(() => {
                  const rec = recommendPlan(finalAnswers)
                  const isPos = rec.plan === 'pro_pos'
                  return (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', marginBottom: '4px' }}>
                        💡 Priporočeni paket: {isPos ? 'Pro + POS (€24.99/mes)' : 'Pro (€9.99/mes)'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#166534' }}>{rec.reason}</div>
                      <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '6px' }}>Paket izberete po registraciji v Nastavitvah.</div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(visibleSteps.length - 1)} style={{
                    background: 'none', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: '8px',
                    padding: '9px 18px', fontSize: '13px', color: '#666', cursor: 'pointer',
                  }}>← Nazaj</button>
                  <button onClick={finish} disabled={saving} style={{
                    background: '#1D9E75', color: '#fff', border: 'none', borderRadius: '8px',
                    padding: '10px 28px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}>{saving ? 'Shranjujem...' : 'Začnimo! →'}</button>
                </div>
              </div>
            )
          })()}
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: '#aaa' }}>
          Nastavitve lahko kadarkoli spremenite v aplikaciji
        </div>
      </div>
    </div>
  )
}
