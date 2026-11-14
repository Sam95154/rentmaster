-- Phase 5: messaging, announcements, rent reminders and their scheduled job.
-- Channels: in-app notifications only. No email / SMS / WhatsApp delivery exists yet.

-- ---------- messages ----------
-- The original insert policies let an owner address ANY user id. Messages now go through send_message(), which only
-- allows owner <-> that owner's own tenants.
drop policy messages_owner_send on public.messages;
drop policy messages_tenant_send on public.messages;
revoke insert on public.messages from authenticated, anon;
alter table public.messages add constraint messages_body_len check (length(trim(body)) between 1 and 4000);
alter table public.messages add constraint messages_subject_len check (subject is null or length(subject) <= 150);
create index messages_pair_idx on public.messages (owner_id, created_at desc);

create or replace function public.send_message(p_partner uuid, p_body text, p_subject text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_body text := trim(coalesce(p_body, '')); v_name text; v_owner uuid; v_recipient uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if length(v_body) = 0 then raise exception 'Write a message first'; end if;
  if length(v_body) > 4000 then raise exception 'Messages can be at most 4000 characters'; end if;
  if (select count(*) from messages where sender_id = v_me and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a few minutes.';
  end if;

  if public.is_owner() then
    if not exists (select 1 from tenant_profiles where owner_id = v_me and user_id = p_partner and deleted_at is null) then
      raise exception 'You can only message your own tenants who have an account';
    end if;
    v_owner := v_me; v_recipient := p_partner;
    insert into notifications (user_id, type, title, body, link)
    values (p_partner, 'message', 'New message from your owner', left(v_body, 120), '/tenant/messages');
  elsif public.has_role('tenant') then
    if p_partner not in (select public.my_owner_ids()) then raise exception 'You can only message your own owner'; end if;
    v_owner := p_partner; v_recipient := p_partner;
    select full_name into v_name from users where id = v_me;
    insert into notifications (user_id, type, title, body, link)
    values (p_partner, 'message', 'New message from ' || coalesce(v_name, 'a tenant'), left(v_body, 120), '/owner/messages');
  else
    raise exception 'Messaging is not available for this account';
  end if;

  insert into messages (owner_id, sender_id, recipient_id, subject, body)
  values (v_owner, v_me, v_recipient, left(nullif(trim(p_subject), ''), 150), v_body) returning id into v_id;
  return v_id;
end $$;

-- One row per person you can talk to, with the latest message and your unread count.
create or replace function public.message_threads() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_out jsonb;
begin
  if public.is_owner() then
    select coalesce(jsonb_agg(x order by x.last_at desc nulls last, x.name), '[]'::jsonb) into v_out from (
      select p.partner_id, p.name,
        (select m.body from messages m where m.owner_id = v_me and (m.sender_id = p.partner_id or m.recipient_id = p.partner_id) order by m.created_at desc limit 1) as last_body,
        (select m.created_at from messages m where m.owner_id = v_me and (m.sender_id = p.partner_id or m.recipient_id = p.partner_id) order by m.created_at desc limit 1) as last_at,
        (select count(*) from messages m where m.recipient_id = v_me and m.sender_id = p.partner_id and m.read_at is null)::int as unread
      from (select t.user_id as partner_id, min(t.full_name) as name from tenant_profiles t where t.owner_id = v_me and t.user_id is not null and t.deleted_at is null group by t.user_id) p
    ) x;
  elsif public.has_role('tenant') then
    select coalesce(jsonb_agg(x order by x.last_at desc nulls last, x.name), '[]'::jsonb) into v_out from (
      select o.id as partner_id, o.full_name as name,
        (select m.body from messages m where m.owner_id = o.id and (m.sender_id = v_me or m.recipient_id = v_me) order by m.created_at desc limit 1) as last_body,
        (select m.created_at from messages m where m.owner_id = o.id and (m.sender_id = v_me or m.recipient_id = v_me) order by m.created_at desc limit 1) as last_at,
        (select count(*) from messages m where m.recipient_id = v_me and m.sender_id = o.id and m.read_at is null)::int as unread
      from users o where o.id in (select public.my_owner_ids())
    ) x;
  else
    v_out := '[]'::jsonb;
  end if;
  return v_out;
end $$;

create or replace function public.mark_thread_read(p_partner uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update messages set read_at = now() where recipient_id = auth.uid() and sender_id = p_partner and read_at is null;
  get diagnostics n = row_count; return n;
end $$;

grant execute on function public.send_message(uuid, text, text), public.message_threads(), public.mark_thread_read(uuid) to authenticated;
revoke execute on function public.send_message(uuid, text, text), public.message_threads(), public.mark_thread_read(uuid) from public, anon;

-- ---------- announcements ----------
alter table public.announcements add constraint announcements_len check (length(trim(title)) between 2 and 150 and length(trim(body)) between 1 and 5000);

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
  end if;
  return new;
end $$;
create trigger announcements_guard before insert or update on public.announcements for each row execute function public.announcements_guard();

-- Everyone an owner announcement targets gets an in-app notification (one per person, even with several tenancies).
create or replace function public.announcements_fanout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and new.deleted_at is null and new.audience in ('tenants','all') then
    insert into notifications (user_id, type, title, body, link)
    select distinct t.user_id, 'announcement', new.title, left(new.body, 140), '/tenant/announcements'
      from tenant_assignments a
      join tenant_profiles t on t.id = a.tenant_id
     where a.owner_id = new.owner_id and a.status = 'active' and t.user_id is not null
       and (new.property_id is null or a.unit_id in (select id from property_units where property_id = new.property_id));
  end if;
  return null;
end $$;
create trigger announcements_fanout after insert on public.announcements for each row execute function public.announcements_fanout();

-- ---------- reminders ----------
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  ref_id uuid not null,                  -- invoice id, or tenancy id for lease reminders
  kind text not null,
  created_at timestamptz not null default now(),
  unique (ref_id, kind)                  -- each reminder is sent at most once
);
alter table public.reminder_log enable row level security;
create policy reminder_log_owner_read on public.reminder_log for select using (owner_id = auth.uid() and public.is_owner());
revoke insert, update, delete on public.reminder_log from authenticated, anon;

-- Idempotent: running it any number of times on the same day sends nothing twice. If the job misses a day, the next
-- run still sends the most relevant reminder that has not been sent.
create or replace function public.send_rent_reminders(p_owner uuid, p_as_of date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_days int; inv record; lease record; v_bal numeric(12,2); v_d int; v_late int; v_kind text; v_id uuid;
  v_up int := 0; v_today int := 0; v_over int := 0; v_lease int := 0;
begin
  select coalesce(reminder_days_before, 3) into v_days from owner_profiles where user_id = p_owner;
  v_days := coalesce(v_days, 3);

  for inv in select i.id, i.tenant_id, i.invoice_number, i.due_date, i.total_amount, i.paid_amount
               from rent_invoices i where i.owner_id = p_owner and i.status in ('pending','partially_paid','overdue') loop
    v_bal := inv.total_amount - inv.paid_amount;
    continue when v_bal <= 0;
    v_d := inv.due_date - p_as_of; v_late := p_as_of - inv.due_date; v_kind := null;
    if v_late >= 30 then v_kind := 'overdue_30';
    elsif v_late >= 14 then v_kind := 'overdue_14';
    elsif v_late >= 7 then v_kind := 'overdue_7';
    elsif v_late >= 3 then v_kind := 'overdue_3';
    elsif v_late >= 1 then v_kind := 'overdue_1';
    elsif v_d = 0 then v_kind := 'due_today';
    elsif v_d > 0 and v_d <= v_days and v_days > 0 then v_kind := 'upcoming';
    end if;
    continue when v_kind is null;

    v_id := null;
    insert into reminder_log (owner_id, ref_id, kind) values (p_owner, inv.id, v_kind) on conflict (ref_id, kind) do nothing returning id into v_id;
    continue when v_id is null;

    if v_kind = 'upcoming' then
      perform notify_tenant(inv.tenant_id, 'reminder', 'Rent due soon', 'Invoice ' || inv.invoice_number || ' (₹' || v_bal || ') is due on ' || to_char(inv.due_date, 'DD Mon YYYY') || '.', '/tenant/pay'); v_up := v_up + 1;
    elsif v_kind = 'due_today' then
      perform notify_tenant(inv.tenant_id, 'reminder', 'Rent is due today', 'Invoice ' || inv.invoice_number || ' (₹' || v_bal || ') is due today.', '/tenant/pay'); v_today := v_today + 1;
    else
      perform notify_tenant(inv.tenant_id, 'reminder', 'Rent overdue', 'Invoice ' || inv.invoice_number || ' (₹' || v_bal || ') is ' || v_late || ' day(s) overdue.', '/tenant/pay'); v_over := v_over + 1;
    end if;
  end loop;

  -- Owner is told once when a tenancy is about to end.
  for lease in select ta.id as assignment_id, ta.end_date, tp.full_name from tenant_assignments ta join tenant_profiles tp on tp.id = ta.tenant_id
                where ta.owner_id = p_owner and ta.status = 'active' and ta.end_date is not null and ta.end_date >= p_as_of and ta.end_date <= p_as_of + 30 loop
    v_kind := case when lease.end_date - p_as_of <= 7 then 'lease_expiry_7' else 'lease_expiry_30' end;
    v_id := null;
    insert into reminder_log (owner_id, ref_id, kind) values (p_owner, lease.assignment_id, v_kind) on conflict (ref_id, kind) do nothing returning id into v_id;
    if v_id is not null then
      insert into notifications (user_id, type, title, body, link)
      values (p_owner, 'reminder', 'Tenancy ending soon', lease.full_name || '''s tenancy ends on ' || to_char(lease.end_date, 'DD Mon YYYY') || '.', '/owner/tenants');
      v_lease := v_lease + 1;
    end if;
  end loop;

  return jsonb_build_object('upcoming', v_up, 'due_today', v_today, 'overdue', v_over, 'lease_expiry', v_lease);
end $$;

create or replace function public.run_scheduled_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select u.id from users u join user_roles r on r.user_id = u.id and r.role = 'owner' where u.status = 'active' and u.deleted_at is null loop
    begin perform send_rent_reminders(o.id, current_date); n := n + 1;
    exception when others then raise warning 'send_rent_reminders failed for owner %: %', o.id, sqlerrm; end;
  end loop;
  return n;
end $$;

create or replace function public.run_my_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only owners can send reminders'; end if;
  return send_rent_reminders(auth.uid(), current_date);
end $$;

revoke execute on function public.send_rent_reminders(uuid, date), public.run_scheduled_reminders() from public, anon, authenticated;
revoke execute on function public.run_my_reminders() from public, anon;
grant execute on function public.run_my_reminders() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rentmaster-daily-reminders', '0 4 * * *', 'select public.run_scheduled_reminders()');   -- 04:00 UTC = 09:30 IST
  else
    raise notice 'pg_cron is not enabled: enable it, then run: select cron.schedule(''rentmaster-daily-reminders'', ''0 4 * * *'', ''select public.run_scheduled_reminders()'');';
  end if;
end $$;
