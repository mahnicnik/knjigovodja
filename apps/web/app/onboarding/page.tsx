'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    name: '',
    tax_number: '',
    vat_registered: false,
    iban: '',
    address: '',
    city: '',
    post_code: '',
  })
  const router = useRouter()
  const supabase = createClient()

  async function handleFinish() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('Niste prijavljeni.')
      setLoading(false)
      return
    }
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: data.name,
        tax_number: data.tax_number,
        vat_registered: data.vat_registered,
        iban: data.iban,
        address: data.address,
        city: data.city,
        post_code: data.post_code,
      })
      .select()
      .single()
    if (orgError) {
      alert('Napaka: ' + orgError.message)
      setLoading(false)
      return
    }
    await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
    })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="flex gap-2 mb-8">
          {[1,2,3].map(i => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-gray-900' : 'bg-gray-100'}`} />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Podatki s.p.</h2>
            <p className="text-gray-500 text-sm mb-6">Osnovni podatki vašega podjetja</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Ime s.p.</label>
                <input type="text" placeholder="Ana Kovač s.p." value={data.name}
                  onChange={e => setData({...data, name: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Davčna številka</label>
                <input type="text" placeholder="12345678" value={data.tax_number}
                  onChange={e => setData({...data, tax_number: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer"
                onClick={() => setData({...data, vat_registered: !data.vat_registered})}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${data.vat_registered ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                  {data.vat_registered && <span className="text-white text-xs">✓</span>}
                </div>
                <div>
                  <div className="text-sm font-medium">DDV zavezanec</div>
                  <div className="text-xs text-gray-500">Imam ID za DDV (SI...)</div>
                </div>
              </div>
            </div>
            <button onClick={() => setStep(2)} disabled={!data.name || !data.tax_number}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium mt-6 disabled:opacity-40">
              Naprej →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Naslov in banka</h2>
            <p className="text-gray-500 text-sm mb-6">Za UPN naloge in račune</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Naslov</label>
                <input type="text" placeholder="Dunajska cesta 5" value={data.address}
                  onChange={e => setData({...data, address: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Poštna</label>
                  <input type="text" placeholder="1000" value={data.post_code}
                    onChange={e => setData({...data, post_code: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Kraj</label>
                  <input type="text" placeholder="Ljubljana" value={data.city}
                    onChange={e => setData({...data, city: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">IBAN (TRR)</label>
                <input type="text" placeholder="SI56 1234 5678 9012 345" value={data.iban}
                  onChange={e => setData({...data, iban: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">← Nazaj</button>
              <button onClick={() => setStep(3)} className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium">Naprej →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold mb-1">Vse je pripravljeno!</h2>
            <p className="text-gray-500 text-sm mb-6">Preverite vaše podatke</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ime s.p.</span>
                <span className="font-medium">{data.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Davčna št.</span>
                <span className="font-medium">{data.tax_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">DDV</span>
                <span className="font-medium">{data.vat_registered ? 'Zavezanec' : 'Ni zavezanec'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Kraj</span>
                <span className="font-medium">{data.city || '—'}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">← Nazaj</button>
              <button onClick={handleFinish} disabled={loading}
                className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50">
                {loading ? 'Shranjujem...' : 'Začnimo! 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}