// Supabase Edge Function: razorpay-webhook
// The ONLY way rent becomes "paid" online. Flow: verify HMAC over the RAW body -> hand the event to the database,
// which is idempotent per event id and per gateway payment id. Forged requests are rejected before any database write.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyRazorpaySignature } from '../_shared/signature.ts'

const MAX_BODY = 256 * 1024
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(413, { error: 'Payload too large' })
  const raw = await req.text()                       // must be the untouched body: parsing first would break the signature
  if (raw.length > MAX_BODY) return reply(413, { error: 'Payload too large' })

  const ok = await verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), Deno.env.get('RAZORPAY_WEBHOOK_SECRET'))
  if (!ok) return reply(400, { error: 'Invalid signature' })

  const eventId = req.headers.get('x-razorpay-event-id')
  if (!eventId || eventId.length > 100) return reply(400, { error: 'Missing event id' })

  let payload: { event?: string }
  try { payload = JSON.parse(raw) } catch { return reply(400, { error: 'Invalid JSON' }) }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('process_razorpay_event', { p_event_id: eventId, p_event_type: payload.event ?? '', p_payload: payload })
  if (error) {
    console.error('process_razorpay_event failed', error.message)
    return reply(500, { error: 'Processing failed' })    // non-2xx makes Razorpay retry; the database rolled everything back
  }
  return reply(200, { result: data })                    // processed | duplicate | ignored | failed (all final: do not retry)
})
