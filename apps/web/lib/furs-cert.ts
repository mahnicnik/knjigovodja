import { SupabaseClient } from '@supabase/supabase-js'

// Skupna pomozna funkcija za branje PRAVEGA FURS certifikata (26.7.2026)
//
// PREJ: vsi endpointi so brali "katerikoli aktiven" certifikat, brez
// locevanja test/produkcija - ista certifikat se je (napacno) uporabljal
// za oba nacina, kar je onemogocalo hkratno hrambo obeh.
//
// ZDAJ: prebere organizations.furs_test_mode, nato izbere UJEMAJOC
// certifikat (is_test = true/false). Ce ujemajoc certifikat ne obstaja,
// vrne null (namesto tihe uporabe napacnega certifikata) - klicatelj naj
// uporabnika jasno usmeri, naj naloži pravi certifikat za trenutni nacin.
export async function getFursCertificate(supabase: SupabaseClient, orgId: string) {
  const { data: org } = await supabase
    .from('organizations')
    .select('furs_test_mode')
    .eq('id', orgId)
    .maybeSingle()
  const isTest = org?.furs_test_mode ?? false

  const { data: cert } = await supabase
    .from('furs_certificates')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('is_test', isTest)
    .maybeSingle()

  return { cert, isTest }
}
