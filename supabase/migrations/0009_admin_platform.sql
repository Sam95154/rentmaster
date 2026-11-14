-- Phase 6: Super Admin platform management.
-- Everything an admin changes goes through checked, audited functions; admins still cannot read tenant personal data.

-- ---------- platform settings ----------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select using (auth.uid() is not null);
revoke insert, update, delete on public.platform_settings from authenticated, anon;
insert into public.platform_settings (key, value) values
  ('signups_enabled', 'true'), ('platform_notice', '""'), ('support_email', '""'), ('support_phone', '""');

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  if p_key = 'signups_enabled' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'signups_enabled must be true or false'; end if;
  elsif p_key in ('platform_notice', 'support_email', 'support_phone') then
    if jsonb_typeof(p_value) <> 'string' then raise exception '% must be text', p_key; end if;
    v_text := trim(p_value #>> '{}');
    if length(v_text) > 300 then raise exception '% is too long (300 characters at most)', p_key; end if;
    if p_key = 'support_email' and v_text <> '' and v_text !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid support email'; end if;
    if p_key = 'support_phone' and v_text <> '' and v_text !~ '^[0-9+()\-\s]{6,20}$' then raise exception 'Enter a valid support phone number'; end if;
    p_value := to_jsonb(v_text);
  else
    raise exception 'Unknown setting';
  end if;
  update platform_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'UPDATE', 'platform_settings', p_key, jsonb_build_object('value', p_value));
end $$;

-- Safe to call before login (register page).
create or replace function public.public_platform_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signups_enabled', coalesce((select (value)::boolean from platform_settings where key = 'signups_enabled'), true),
    'support_email', coalesce((select value #>> '{}' from platform_settings where key = 'support_email'), ''),
    'support_phone', coalesce((select value #>> '{}' from platform_settings where key = 'support_phone'), ''))
$$;
grant execute on function public.public_platform_info() to anon, authenticated;

-- Closing registrations still lets invited tenants (whose email an owner already added) sign up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_is_tenant boolean;
begin
  select exists (select 1 from public.tenant_profiles
                 where lower(email) = lower(new.email) and user_id is null and deleted_at is null) into v_is_tenant;
  if not v_is_tenant and not coalesce((select (value)::boolean from public.platform_settings where key = 'signups_enabled'), true) then
    raise exception 'Registrations are currently closed';
  end if;

  insert into public.users (id, email, full_name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'phone', ''));

  if v_is_tenant then
    update public.tenant_profiles set user_id = new.id, status = case when status = 'invited' then 'active' else status end
    where lower(email) = lower(new.email) and user_id is null and deleted_at is null;
    insert into public.user_roles (user_id, role) values (new.id, 'tenant');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
    insert into public.owner_profiles (user_id) values (new.id);
  end if;
  return new;
end $$;

-- ---------- subscriptions and plan limits ----------
create unique index subscriptions_owner_key on public.subscriptions (owner_id);
create trigger audit_row_change after insert or update or delete on public.subscriptions for each row execute function public.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.subscription_plans for each row execute function public.audit_row_change();

-- The plan that applies to an owner today: their active/trialing/past_due subscription, otherwise "Starter".
create or replace function public.owner_plan(p_owner uuid) returns public.subscription_plans
language plpgsql stable security definer set search_path = public as $$
declare pl subscription_plans;
begin
  select p.* into pl from subscriptions s join subscription_plans p on p.id = s.plan_id
   where s.owner_id = p_owner and s.status in ('trialing','active','past_due') and (s.current_period_end is null or s.current_period_end >= current_date);
  if found then return pl; end if;
  select * into pl from subscription_plans where name = 'Starter';
  return pl;       -- null record (unlimited) only if an admin deleted the Starter plan
end $$;
revoke execute on function public.owner_plan(uuid) from public, anon, authenticated;

create or replace function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl subscription_plans; n int;
begin
  pl := public.owner_plan(new.owner_id);
  if tg_table_name = 'properties' and pl.max_properties is not null then
    select count(*) into n from properties where owner_id = new.owner_id and deleted_at is null;
    if n >= pl.max_properties then raise exception 'Your % plan allows % propert%. Ask the platform admin to upgrade your plan.', pl.name, pl.max_properties, case when pl.max_properties = 1 then 'y' else 'ies' end; end if;
  elsif tg_table_name = 'property_units' and pl.max_units is not null then
    select count(*) into n from property_units where owner_id = new.owner_id and deleted_at is null;
    if n >= pl.max_units then raise exception 'Your % plan allows % unit(s). Ask the platform admin to upgrade your plan.', pl.name, pl.max_units; end if;
  end if;
  return new;
end $$;
create trigger enforce_plan_limits before insert on public.properties for each row execute function public.enforce_plan_limits();
create trigger enforce_plan_limits before insert on public.property_units for each row execute function public.enforce_plan_limits();

create or replace function public.my_subscription() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pl subscription_plans; s subscriptions;
begin
  if not public.is_owner() then raise exception 'Only owners have a plan'; end if;
  pl := public.owner_plan(auth.uid());
  select * into s from subscriptions where owner_id = auth.uid();
  return jsonb_build_object('plan_name', pl.name, 'price_monthly', pl.price_monthly, 'max_properties', pl.max_properties, 'max_units', pl.max_units, 'features', coalesce(pl.features, '[]'::jsonb),
    'status', coalesce(s.status, 'default'), 'period_end', s.current_period_end,
    'properties', (select count(*) from properties where owner_id = auth.uid() and deleted_at is null),
    'units', (select count(*) from property_units where owner_id = auth.uid() and deleted_at is null));
end $$;
grant execute on function public.my_subscription() to authenticated;
revoke execute on function public.my_subscription() from public, anon;

create or replace function public.admin_upsert_plan(p_id uuid, p_name text, p_price numeric, p_max_properties int, p_max_units int, p_features jsonb, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  if length(v_name) < 2 or length(v_name) > 40 then raise exception 'Plan name must be 2 to 40 characters'; end if;
  if p_price is null or p_price < 0 or p_price > 10000000 then raise exception 'Enter a valid monthly price'; end if;
  if p_max_properties is not null and (p_max_properties < 1 or p_max_properties > 100000) then raise exception 'Property limit must be at least 1 (or empty for unlimited)'; end if;
  if p_max_units is not null and (p_max_units < 1 or p_max_units > 1000000) then raise exception 'Unit limit must be at least 1 (or empty for unlimited)'; end if;
  if p_features is null or jsonb_typeof(p_features) <> 'array' or jsonb_array_length(p_features) > 10
     or exists (select 1 from jsonb_array_elements(p_features) f where jsonb_typeof(f) <> 'string' or length(f #>> '{}') > 100) then
    raise exception 'Features must be a list of up to 10 short texts';
  end if;
  if p_id is null then
    insert into subscription_plans (name, price_monthly, max_properties, max_units, features, active) values (v_name, p_price, p_max_properties, p_max_units, p_features, coalesce(p_active, true)) returning id into v_id;
  else
    update subscription_plans set name = v_name, price_monthly = p_price, max_properties = p_max_properties, max_units = p_max_units, features = p_features, active = coalesce(p_active, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Plan not found'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'A plan with that name already exists';
end $$;

create or replace function public.admin_set_owner_plan(p_owner uuid, p_plan uuid, p_status text, p_period_end date) returns void
language plpgsql security definer set search_path = public as $$
declare pl subscription_plans; v_props int; v_units int;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  if not exists (select 1 from user_roles where user_id = p_owner and role = 'owner') then raise exception 'Owner not found'; end if;
  if p_status not in ('trialing','active','past_due','cancelled') then raise exception 'Invalid status'; end if;
  select * into pl from subscription_plans where id = p_plan;
  if not found then raise exception 'Plan not found'; end if;
  if not pl.active and not exists (select 1 from subscriptions where owner_id = p_owner and plan_id = p_plan) then raise exception 'That plan is not active'; end if;
  if p_status <> 'cancelled' then
    select count(*) into v_props from properties where owner_id = p_owner and deleted_at is null;
    select count(*) into v_units from property_units where owner_id = p_owner and deleted_at is null;
    if pl.max_properties is not null and v_props > pl.max_properties then raise exception 'Owner already has % properties; the % plan allows %', v_props, pl.name, pl.max_properties; end if;
    if pl.max_units is not null and v_units > pl.max_units then raise exception 'Owner already has % units; the % plan allows %', v_units, pl.name, pl.max_units; end if;
  end if;
  insert into subscriptions (owner_id, plan_id, status, current_period_end) values (p_owner, p_plan, p_status, p_period_end)
  on conflict (owner_id) do update set plan_id = excluded.plan_id, status = excluded.status, current_period_end = excluded.current_period_end;
  insert into notifications (user_id, type, title, body, link)
  values (p_owner, 'subscription', 'Your plan was updated', 'You are now on the ' || pl.name || ' plan (' || p_status || ').', '/owner/settings');
end $$;

create or replace function public.admin_list_subscriptions()
returns table (owner_id uuid, owner_name text, owner_email text, plan_id uuid, plan_name text, status text, period_end date, properties bigint, units bigint, max_properties int, max_units int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return query
    select u.id, u.full_name, u.email, s.plan_id, (public.owner_plan(u.id)).name, coalesce(s.status, 'default'), s.current_period_end,
           (select count(*) from properties p where p.owner_id = u.id and p.deleted_at is null),
           (select count(*) from property_units pu where pu.owner_id = u.id and pu.deleted_at is null),
           (public.owner_plan(u.id)).max_properties, (public.owner_plan(u.id)).max_units
      from users u join user_roles r on r.user_id = u.id and r.role = 'owner'
      left join subscriptions s on s.owner_id = u.id
     where u.deleted_at is null order by u.created_at desc;
end $$;

-- ---------- transactions monitor ----------
create or replace function public.admin_list_payments(p_status text default null, p_from date default null, p_to date default null, p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb; v_total bigint;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100); p_offset := greatest(coalesce(p_offset, 0), 0);
  select count(*) into v_total from payments p where (p_status is null or p.status::text = p_status) and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at < p_to + 1);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_rows from (
    select p.id, p.receipt_number, p.paid_at, p.amount, p.method, p.status, p.gateway, p.gateway_payment_id,
           ou.full_name as owner_name, tp.full_name as tenant_name, i.invoice_number
      from payments p join users ou on ou.id = p.owner_id join tenant_profiles tp on tp.id = p.tenant_id left join rent_invoices i on i.id = p.invoice_id
     where (p_status is null or p.status::text = p_status) and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at < p_to + 1)
     order by p.paid_at desc limit p_limit offset p_offset) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_payment_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return jsonb_build_object(
    'collected_total', (select coalesce(sum(amount), 0) from payments where status = 'success'),
    'collected_30d', (select coalesce(sum(amount), 0) from payments where status = 'success' and paid_at >= now() - interval '30 days'),
    'online_total', (select coalesce(sum(amount), 0) from payments where status = 'success' and gateway = 'razorpay'),
    'manual_total', (select coalesce(sum(amount), 0) from payments where status = 'success' and gateway is distinct from 'razorpay'),
    'refunded_total', (select coalesce(sum(amount), 0) from payments where status = 'refunded'),
    'failed_events', (select count(*) from payment_webhook_events where status = 'failed'),
    'open_orders', (select count(*) from payment_orders where status = 'created' and created_at > now() - interval '1 day'));
end $$;

create or replace function public.admin_list_webhook_events(p_status text default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select event_id, event_type, status, error, received_at from payment_webhook_events
     where p_status is null or status = p_status order by received_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x);   -- no raw payloads
end $$;

-- ---------- support tickets / complaints ----------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (length(trim(subject)) between 3 and 150),
  body text not null check (length(trim(body)) between 1 and 4000),
  category text not null default 'other' check (category in ('billing','technical','account','property','other')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_replies_ticket_idx on public.support_replies (ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;
create policy tickets_read on public.support_tickets for select using (user_id = auth.uid() or public.is_super_admin());
create policy replies_read on public.support_replies for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id));
revoke insert, update, delete on public.support_tickets, public.support_replies from authenticated, anon;
create trigger audit_row_change after insert or update or delete on public.support_tickets for each row execute function public.audit_row_change();

create or replace function public.create_ticket(p_subject text, p_body text, p_category text default 'other') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_super_admin() then raise exception 'Admins do not raise tickets'; end if;
  if length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'Give the ticket a short subject'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Describe the problem'; end if;
  if (select count(*) from support_tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'You have raised several tickets recently. Please wait before sending another.'; end if;
  insert into support_tickets (user_id, subject, body, category) values (auth.uid(), trim(p_subject), trim(p_body), coalesce(p_category, 'other')) returning id into v_id;
  select full_name into v_name from users where id = auth.uid();
  insert into notifications (user_id, type, title, body, link)
  select r.user_id, 'support', 'New support ticket', left(coalesce(v_name, 'A user') || ': ' || trim(p_subject), 140), '/admin/complaints' from user_roles r where r.role = 'super_admin';
  return v_id;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t support_tickets; v_admin boolean := public.is_super_admin(); v_id uuid; v_body text := trim(coalesce(p_body, ''));
begin
  select * into t from support_tickets where id = p_ticket;
  if not found or (t.user_id <> auth.uid() and not v_admin) then raise exception 'Ticket not found'; end if;
  if length(v_body) = 0 then raise exception 'Write a reply first'; end if;
  if length(v_body) > 4000 then raise exception 'Replies can be at most 4000 characters'; end if;
  if t.status = 'closed' then raise exception 'This ticket is closed. Please open a new one.'; end if;
  insert into support_replies (ticket_id, author_id, body) values (p_ticket, auth.uid(), v_body) returning id into v_id;
  if v_admin then
    update support_tickets set updated_at = now(), status = case when status = 'open' then 'in_progress' else status end where id = p_ticket;
    insert into notifications (user_id, type, title, body, link) values (t.user_id, 'support', 'Support replied to your ticket', left(t.subject, 120), '/support');
  else
    update support_tickets set updated_at = now(), status = case when status = 'resolved' then 'open' else status end, resolved_at = case when status = 'resolved' then null else resolved_at end where id = p_ticket;
    insert into notifications (user_id, type, title, body, link)
    select r.user_id, 'support', 'Reply on a support ticket', left(t.subject, 120), '/admin/complaints' from user_roles r where r.role = 'super_admin';
  end if;
  return v_id;
end $$;

create or replace function public.admin_set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'Invalid status'; end if;
  update support_tickets set status = p_status, updated_at = now(), resolved_at = case when p_status in ('resolved','closed') then now() else null end where id = p_ticket returning * into t;
  if not found then raise exception 'Ticket not found'; end if;
  insert into notifications (user_id, type, title, body, link) values (t.user_id, 'support', 'Your ticket is ' || replace(p_status, '_', ' '), left(t.subject, 120), '/support');
end $$;

create or replace function public.admin_list_tickets(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return (select coalesce(jsonb_agg(x order by x.updated_at desc), '[]'::jsonb) from (
    select t.id, t.subject, t.body, t.category, t.status, t.created_at, t.updated_at, u.full_name as requester_name, u.email as requester_email,
           (select string_agg(r.role::text, ',') from user_roles r where r.user_id = u.id) as requester_role,
           (select count(*) from support_replies sr where sr.ticket_id = t.id) as replies
      from support_tickets t join users u on u.id = t.user_id where p_status is null or t.status = p_status limit 200) x);
end $$;

grant execute on function public.admin_set_setting(text, jsonb), public.admin_upsert_plan(uuid, text, numeric, int, int, jsonb, boolean), public.admin_set_owner_plan(uuid, uuid, text, date),
  public.admin_list_subscriptions(), public.admin_list_payments(text, date, date, int, int), public.admin_payment_summary(), public.admin_list_webhook_events(text, int),
  public.create_ticket(text, text, text), public.reply_ticket(uuid, text), public.admin_set_ticket_status(uuid, text), public.admin_list_tickets(text) to authenticated;
revoke execute on function public.admin_set_setting(text, jsonb), public.admin_upsert_plan(uuid, text, numeric, int, int, jsonb, boolean), public.admin_set_owner_plan(uuid, uuid, text, date),
  public.admin_list_subscriptions(), public.admin_list_payments(text, date, date, int, int), public.admin_payment_summary(), public.admin_list_webhook_events(text, int),
  public.create_ticket(text, text, text), public.reply_ticket(uuid, text), public.admin_set_ticket_status(uuid, text), public.admin_list_tickets(text) from public, anon;

-- ---------- platform announcements (admin to owners / tenants / everyone) ----------
drop policy if exists announcements_platform_read on public.announcements;
create policy announcements_platform_read on public.announcements for select using (
  owner_id is null and deleted_at is null
  and (audience = 'all' or (audience = 'owners' and public.is_owner()) or (audience = 'tenants' and public.has_role('tenant'))));

create or replace function public.announcements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id is distinct from old.owner_id or new.author_id is distinct from old.author_id
                           or new.property_id is distinct from old.property_id or new.audience is distinct from old.audience) then
    raise exception 'Only the title, text and removal of an announcement can be changed';
  end if;
  if new.owner_id is not null then
    if new.audience = 'owners' then raise exception 'Owners can only address their own tenants'; end if;
    if new.property_id is not null and not exists (select 1 from properties where id = new.property_id and owner_id = new.owner_id) then
      raise exception 'Property does not belong to this owner';
    end if;
  else
    if not exists (select 1 from user_roles where user_id = new.author_id and role = 'super_admin') then raise exception 'Only the platform admin can post platform announcements'; end if;
    if new.property_id is not null then raise exception 'Platform announcements are not tied to a property'; end if;
  end if;
  return new;
end $$;

create or replace function public.announcements_fanout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null then return null; end if;
  if new.owner_id is not null then
    if new.audience in ('tenants','all') then
      insert into notifications (user_id, type, title, body, link)
      select distinct t.user_id, 'announcement', new.title, left(new.body, 140), '/tenant/announcements'
        from tenant_assignments a join tenant_profiles t on t.id = a.tenant_id
       where a.owner_id = new.owner_id and a.status = 'active' and t.user_id is not null
         and (new.property_id is null or a.unit_id in (select id from property_units where property_id = new.property_id));
    end if;
  else
    insert into notifications (user_id, type, title, body, link)
    select distinct r.user_id, 'announcement', new.title, left(new.body, 140), case when r.role = 'owner' then '/owner/announcements' else '/tenant/announcements' end
      from user_roles r join users u on u.id = r.user_id
     where u.status = 'active' and u.deleted_at is null
       and ((new.audience in ('owners','all') and r.role = 'owner') or (new.audience in ('tenants','all') and r.role = 'tenant'));
  end if;
  return null;
end $$;
