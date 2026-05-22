import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const tax = req.nextUrl.searchParams.get('tax')
  if (!tax) return NextResponse.json({ error: 'Manjka davcna stevilka' }, { status: 400 })
  try {
    const res = await fetch(`https://slo-podjetja-api.eu/api?search=${tax}&limit=1`, {
      headers: { 'User-Agent': 'Racunko/1.0' },
      next: { revalidate: 3600 }
    })
    if (!res.ok) return NextResponse.json({ error: 'API napaka' }, { status: 500 })
    const data = await res.json()
    if (!data || data.length === 0) return NextResponse.json({ error: 'Ni najdeno' }, { status: 404 })
    return NextResponse.json(data[0])
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
