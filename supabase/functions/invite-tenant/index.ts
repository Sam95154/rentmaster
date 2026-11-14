// Supabase Edge Function: invite-tenant
// Verifies the caller owns the tenant record, then marks the tenant as invited (no email or link is sent).
// The service-role key stays on the server; it is never shipped to the browser.
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

  // Client acting as the caller: RLS decides whether they may see this tenant.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let tenantId: string | undefined
  try { tenantId = (await req.json()).tenantId } catch { /* handled below */ }
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return json({ error: 'tenantId is required' }, 400)

  const { data: tenant, error } = await userClient
    .from('tenant_profiles').select('id, owner_id, email, full_name, user_id')
    .eq('id', tenantId).eq('owner_id', userData.user.id).is('deleted_at', null).maybeSingle()
  if (error || !tenant) return json({ error: 'Tenant not found' }, 404)
  if (!tenant.email) return json({ error: 'Add an email address to this tenant first' }, 400)
  if (tenant.user_id) return json({ error: 'This tenant already has an account' }, 409)

  // No email or link is sent. The tenant registers on the site with this address and confirms it with a one-time code;
  // the signup trigger then links the new account to this tenant record.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  await admin.from('tenant_profiles').update({ status: 'invited' }).eq('id', tenant.id).is('user_id', null)
  return json({ ok: true })
})
