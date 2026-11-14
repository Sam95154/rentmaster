-- Phase 7: least-privilege hardening. Defence in depth: row-level security and the checks inside each
-- function remain the primary controls; this migration removes access that was never needed.

-- 1. Functions. Postgres grants EXECUTE to PUBLIC by default, so anonymous visitors could call every
--    SECURITY DEFINER function through the API. Remove that, then allow only what signed-out visitors need.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.public_platform_info() to anon;

-- Trigger functions run because of the trigger, not because a client calls them.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Functions created later do not get PUBLIC/anon execute automatically.
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. Tables. Signed-out visitors get no table access at all (the app has no public data tables).
--    This also stops anonymous requests from evaluating RLS policies that call helper functions.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
drop policy if exists plans_public_read on public.subscription_plans;

-- Nobody needs TRUNCATE, TRIGGER or REFERENCES through the API; TRUNCATE ignores row-level security.
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;

-- Writes that no policy or RPC allows anyway: remove the grant so the denial does not depend on RLS alone.
revoke insert, delete on public.notifications from authenticated;   -- created by triggers/RPCs; users may only mark read
revoke delete on public.messages from authenticated;               -- messages are immutable
revoke delete, insert on public.owner_profiles from authenticated; -- created by the signup trigger

-- 3. Audit trail is append-only for everyone except the table owner.
revoke update, delete on public.audit_logs from authenticated;

-- 4. Subscriptions change only through admin_set_owner_plan (audited, validated), never by direct writes.
revoke insert, update, delete on public.subscriptions from authenticated;
