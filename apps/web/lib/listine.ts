import { createClient } from '@/lib/supabase'

/**
 * Hramba izvirnih listin v storage bucketu "listine" (17.8.2026).
 *
 * Zakaj obstaja: listine so se prej shranjevale v bazo kot base64 besedilo
 * (`receipts.attachment_base64`, `payslips.attachment_base64`). Ob 71 listinah
 * je to zneslo 21 MB V PODATKOVNI BAZI — base64 poveca datoteko za ~33 %, baza
 * ni namenjena hrambi datotek, in vsak `select *` po tabeli potegne vse skupaj
 * v pomnilnik (prav to pocne izvoz za racunovodjo).
 *
 * Bucket je ZASEBEN. Datoteke se odpirajo samo prek podpisanih povezav z
 * omejeno veljavnostjo, nikoli prek javnega URL-ja.
 *
 * Dogovor o poti: {org_id}/{vrsta}/{ime}
 * Prvi segment je org_id — na tem slonijo varnostna pravila bucketa.
 */

export type VrstaListine = 'racuni' | 'place' | 'banka' | 'kartice'

const BUCKET = 'listine'

/** Ocisti ime datoteke, da ne razbije poti v storage. */
function varnoIme(ime: string): string {
  return ime
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sumniki -> brez
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80) // omeji dolzino, ohrani koncnico
}

/** Pretvori data URL ali gol base64 niz v Blob za nalaganje. */
export function base64VBlob(base64: string, privzetiTip = 'application/pdf'): Blob {
  let tip = privzetiTip
  let podatki = base64

  const m = base64.match(/^data:([^;]+);base64,(.*)$/)
  if (m) {
    tip = m[1]
    podatki = m[2]
  }

  const binarno = atob(podatki)
  const bajti = new Uint8Array(binarno.length)
  for (let i = 0; i < binarno.length; i++) bajti[i] = binarno.charCodeAt(i)
  return new Blob([bajti], { type: tip })
}

/**
 * Nalozi listino v storage in vrne pot, ki jo shranimo v bazo.
 * Ob napaki vrne null — klicatelj naj zapis vseeno shrani (bolje zapis brez
 * listine kot izgubljen zapis), a naj uporabnika o tem obvesti.
 */
export async function naloziListino(
  orgId: string,
  vrsta: VrstaListine,
  datoteka: Blob,
  imeDatoteke: string,
): Promise<{ path: string | null; napaka: string | null }> {
  const supabase = createClient()
  const zigosano = `${Date.now()}-${varnoIme(imeDatoteke)}`
  const pot = `${orgId}/${vrsta}/${zigosano}`

  const { error } = await supabase.storage.from(BUCKET).upload(pot, datoteka, {
    contentType: datoteka.type || undefined,
    upsert: false,
  })

  if (error) return { path: null, napaka: error.message }
  return { path: pot, napaka: null }
}

/**
 * Podpisana povezava za ogled/prenos listine. Veljavna 1 uro.
 */
export async function povezavaDoListine(pot: string, sekund = 3600): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pot, sekund)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Odpre listino v novem zavihku — dela tako za NOVE zapise (attachment_path)
 * kot za STARE (attachment_base64), dokler preselitev ni koncana.
 */
export async function odpriListino(
  attachmentPath: string | null | undefined,
  attachmentBase64: string | null | undefined,
  attachmentType: string | null | undefined,
): Promise<boolean> {
  if (attachmentPath) {
    const url = await povezavaDoListine(attachmentPath)
    if (url) { window.open(url, '_blank'); return true }
    return false
  }

  if (attachmentBase64) {
    const tip = attachmentType === 'image' ? 'image/jpeg' : 'application/pdf'
    const blob = base64VBlob(attachmentBase64, tip)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    // sprosti sele cez cas, da uspe zavihek nalozi
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return true
  }

  return false
}
