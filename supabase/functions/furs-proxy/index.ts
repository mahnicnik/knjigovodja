import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FURS_TEST_URL = 'https://blagajne-test.fu.gov.si:9002/v1/cash_register/invoices'
const FURS_PROD_URL = 'https://blagajne.fu.gov.si:9002/v1/cash_register/invoices'

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { soapBody, isTest } = await req.json()
    if (!soapBody) {
      return new Response(JSON.stringify({ error: 'soapBody je obvezen' }), { status: 400, headers: corsHeaders })
    }
    const endpoint = isTest ? FURS_TEST_URL : FURS_PROD_URL
    const fursResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '""' },
      body: soapBody,
    })
    const responseText = await fursResponse.text()
    return new Response(JSON.stringify({ status: fursResponse.status, body: responseText, ok: fursResponse.ok }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
