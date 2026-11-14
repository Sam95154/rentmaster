// Supabase Edge Function: create-razorpay-order
// A signed-in tenant asks to pay an invoice. The database decides the amount (invoice balance) and enforces
// ownership, opt-in and rate limits; this function only talks to Razorpay. Rent is NOT marked paid here:
// only the verified webhook does that.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)
  const keyId = Deno.env.get('RAZORPAY_KEY_ID'); const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return json({ error: 'Online payment is not configured' }, 503)

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: u, error: uErr } = await userClient.auth.getUser()
  if (uErr || !u.user) return json({ error: 'Unauthorized' }, 401)

  let invoiceId: string | undefined
  try { invoiceId = (await req.json()).invoiceId } catch { /* handled below */ }
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) return json({ error: 'invoiceId is required' }, 400)

  // Runs as the tenant: the function itself checks the invoice is theirs and open, and fixes the amount.
  const { data: prep, error: prepErr } = await userClient.rpc('prepare_online_payment', { p_invoice_id: invoiceId })
  if (prepErr) return json({ error: prepErr.message }, 400)
  const paise = Math.round(Number(prep.amount) * 100)
  if (!Number.isInteger(paise) || paise < 100) return json({ error: 'Invalid amount' }, 400)

  const rz = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`) },
    body: JSON.stringify({ amount: paise, currency: 'INR', receipt: String(prep.order_id).slice(0, 40), notes: { payment_order_id: prep.order_id, invoice: prep.invoice_number } }),
  })
  if (!rz.ok) { console.error('Razorpay order failed', rz.status); return json({ error: 'Could not start the payment. Please try again.' }, 502) }
  const order = await rz.json()
  if (!order?.id || order.amount !== paise) return json({ error: 'Unexpected response from the payment provider' }, 502)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { error: attachErr } = await admin.rpc('attach_gateway_order', { p_order_id: prep.order_id, p_gateway_order_id: order.id })
  if (attachErr) { console.error('attach failed', attachErr.message); return json({ error: 'Could not start the payment. Please try again.' }, 500) }

  // key_id is the PUBLIC key; the secret never leaves this function.
  return json({ keyId, orderId: order.id, amount: paise, currency: 'INR', invoiceNumber: prep.invoice_number })
})
