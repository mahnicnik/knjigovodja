import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const certFile = formData.get('cert') as File
    const password = formData.get('password') as string

    if (!certFile || !password) {
      return NextResponse.json({ error: 'Manjka certifikat ali geslo' }, { status: 400 })
    }

    // Shrani .p12 začasno
    const tmpPath = join(tmpdir(), `furs_cert_${Date.now()}.p12`)
    const bytes = await certFile.arrayBuffer()
    writeFileSync(tmpPath, Buffer.from(bytes))

    let subject = ''
    let expiry = ''
    let certB64 = ''

    try {
      // Preveri certifikat z OpenSSL
      const result = execSync(
        `openssl pkcs12 -in "${tmpPath}" -nokeys -passin pass:${password} 2>&1`,
        { encoding: 'utf8', timeout: 10000 }
      )

      // Izvleci subject
      const subjectMatch = result.match(/subject=(.+)/i)
      if (subjectMatch) {
        subject = subjectMatch[1].trim()
          .replace('/C=SI', '')
          .replace('/O=state-institutions', '')
          .replace('/OU=DavPotRac', '')
          .replace('/OU=', 'DAV: ')
          .replace('/serialNumber=', '#')
          .replace('/CN=', ' · ')
          .trim()
      }

      // Izvleci datum veljavnosti
      try {
        const certPem = execSync(
          `openssl pkcs12 -in "${tmpPath}" -nokeys -passin pass:${password} -clcerts 2>/dev/null`,
          { encoding: 'utf8', timeout: 10000 }
        )
        const certOnly = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)
        if (certOnly) {
          const dates = execSync(
            `echo "${certOnly[0]}" | openssl x509 -noout -dates 2>/dev/null`,
            { encoding: 'utf8', timeout: 5000 }
          )
          const expiryMatch = dates.match(/notAfter=(.+)/i)
          if (expiryMatch) expiry = new Date(expiryMatch[1].trim()).toLocaleDateString('sl-SI')
        }
      } catch {}

      // Shrani certifikat kot base64 v env (Vercel env variable)
      certB64 = Buffer.from(bytes).toString('base64')

      // Shrani v Supabase businesses tabelo
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const authHeader = req.headers.get('cookie') || ''

      // Pridobi user iz cookie
      const { data: { user } } = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { cookie: authHeader } } }
      ).auth.getUser()

      if (user) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('furs_config')
          .eq('owner_user_id', user.id)
          .single()

        const existing = (biz?.furs_config as any) || {}
        await supabase
          .from('businesses')
          .update({
            furs_config: {
              ...existing,
              certB64,
              certPassword: password,
              certSubject: subject || 'FURS certifikat',
              certExpiry: expiry,
            }
          })
          .eq('owner_user_id', user.id)
      }

    } finally {
      try { unlinkSync(tmpPath) } catch {}
    }

    return NextResponse.json({
      success: true,
      subject: subject || 'FURS certifikat',
      expiry: expiry || 'Neznano',
    })

  } catch (e: any) {
    console.error('upload-cert error:', e)
    return NextResponse.json(
      { error: e.message || 'Napaka pri nalaganju certifikata' },
      { status: 500 }
    )
  }
}