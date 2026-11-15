-- Rental agreements: records, expiry tracking, renewal and reminders.
-- The table, row-level security (owner full access, tenant read own) and audit trigger already exist from 0001-0003.
-- This adds consistency checks, renewal, and scheduled expiry handling.

-- At most one live agreement per tenancy; a renewal supersedes the old one.
create unique index rental_agreements_one_active on public.rental_agreements (assignment_id) where status = 'active';

alter table public.rental_agreements add constraint rental_agreements_notice_ck check (notice_period_days between 0 and 365);
alter table public.rental_agreements add constraint rental_agreements_terms_len check (escalation_terms is null or length(escalation_terms) <= 2000);

create or replace function public.agreements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare a tenant_assignments;
begin
  select * into a from tenant_assignments where id = new.assignment_id;
  if not found or a.owner_id <> new.owner_id then raise exception 'Tenancy does not belong to this owner'; end if;
  if a.tenant_id <> new.tenant_id or a.unit_id <> new.unit_id then raise exception 'Agreement must match the tenant and unit of the tenancy'; end if;
  if tg_op = 'UPDATE' and (new.assignment_id <> old.assignment_id or new.tenant_id <> old.tenant_id or new.unit_id <> old.unit_id or new.owner_id <> old.owner_id) then
    raise exception 'The tenancy of an agreement cannot be changed';
  end if;
  if new.document_id is not null and not exists (select 1 from documents where id = new.document_id and owner_id = new.owner_id and deleted_at is null) then
    raise exception 'Document does not belong to this owner';
  end if;
  return new;
end $$;
create trigger agreements_guard before insert or update on public.rental_agreements for each row execute function public.agreements_guard();
revoke execute on function public.agreements_guard() from public, anon, authenticated;

-- Renew: closes the current agreement as "renewed" and creates the next one starting the day after it ends.
create or replace function public.renew_agreement(p_id uuid, p_new_expiry date, p_monthly_rent numeric default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o rental_agreements; v_id uuid; v_start date;
begin
  if not public.is_owner() then raise exception 'Only owners can renew agreements'; end if;
  select * into o from rental_agreements where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Agreement not found'; end if;
  if o.status <> 'active' then raise exception 'Only an active agreement can be renewed'; end if;
  v_start := o.expiry_date + 1;
  if p_new_expiry is null or p_new_expiry <= v_start then raise exception 'The new end date must be after %', to_char(v_start, 'DD Mon YYYY'); end if;
  if p_monthly_rent is not null and (p_monthly_rent < 0 or p_monthly_rent > 100000000) then raise exception 'Enter a valid monthly rent'; end if;
  update rental_agreements set status = 'renewed' where id = o.id;
  insert into rental_agreements (owner_id, assignment_id, tenant_id, unit_id, start_date, expiry_date, monthly_rent, security_deposit, notice_period_days, escalation_terms, status)
  values (o.owner_id, o.assignment_id, o.tenant_id, o.unit_id, v_start, p_new_expiry, coalesce(p_monthly_rent, o.monthly_rent), o.security_deposit, o.notice_period_days,
          coalesce(nullif(trim(p_notes), ''), o.escalation_terms), 'active')
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.renew_agreement(uuid, date, numeric, text) to authenticated;
revoke execute on function public.renew_agreement(uuid, date, numeric, text) from public, anon;

-- Expiry handling. Idempotent (reminder_log makes each reminder fire once).
create or replace function public.send_agreement_reminders(p_owner uuid, p_as_of date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ag record; v_kind text; v_id uuid; v_expired int := 0; v_30 int := 0; v_7 int := 0; v_label text;
begin
  for ag in select r.id, r.expiry_date, tp.full_name, pu.unit_number
              from rental_agreements r join tenant_profiles tp on tp.id = r.tenant_id join property_units pu on pu.id = r.unit_id
             where r.owner_id = p_owner and r.status = 'active' and r.expiry_date <= p_as_of + 30 loop
    v_label := ag.full_name || ' (unit ' || ag.unit_number || ')';
    if ag.expiry_date < p_as_of then
      update rental_agreements set status = 'expired' where id = ag.id;
      v_kind := 'agreement_expired';
    elsif ag.expiry_date - p_as_of <= 7 then v_kind := 'agreement_expiry_7';
    else v_kind := 'agreement_expiry_30';
    end if;
    v_id := null;
    insert into reminder_log (owner_id, ref_id, kind) values (p_owner, ag.id, v_kind) on conflict (ref_id, kind) do nothing returning id into v_id;
    continue when v_id is null;
    insert into notifications (user_id, type, title, body, link)
    values (p_owner, 'reminder',
            case v_kind when 'agreement_expired' then 'Agreement expired' else 'Agreement ending soon' end,
            case v_kind when 'agreement_expired' then 'The agreement for ' || v_label || ' ended on ' || to_char(ag.expiry_date, 'DD Mon YYYY') || '. Renew it or record the tenancy as ended.'
                        else 'The agreement for ' || v_label || ' ends on ' || to_char(ag.expiry_date, 'DD Mon YYYY') || '.' end,
            '/owner/agreements');
    if v_kind = 'agreement_expired' then v_expired := v_expired + 1; elsif v_kind = 'agreement_expiry_7' then v_7 := v_7 + 1; else v_30 := v_30 + 1; end if;
  end loop;
  -- Agreements already past their end date that were never reminded still get marked expired.
  update rental_agreements set status = 'expired' where owner_id = p_owner and status = 'active' and expiry_date < p_as_of;
  return jsonb_build_object('agreements_expiring_30', v_30, 'agreements_expiring_7', v_7, 'agreements_expired', v_expired);
end $$;
revoke execute on function public.send_agreement_reminders(uuid, date) from public, anon, authenticated;

-- The daily job and the owner's "send reminders now" button now cover agreements too.
create or replace function public.run_scheduled_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select u.id from users u join user_roles r on r.user_id = u.id and r.role = 'owner' where u.status = 'active' and u.deleted_at is null loop
    begin perform send_rent_reminders(o.id, current_date); perform send_agreement_reminders(o.id, current_date); n := n + 1;
    exception when others then raise warning 'reminders failed for owner %: %', o.id, sqlerrm; end;
  end loop;
  return n;
end $$;

create or replace function public.run_my_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only owners can send reminders'; end if;
  return send_rent_reminders(auth.uid(), current_date) || send_agreement_reminders(auth.uid(), current_date);
end $$;
revoke execute on function public.run_scheduled_reminders() from public, anon, authenticated;
revoke execute on function public.run_my_reminders() from public, anon;
grant execute on function public.run_my_reminders() to authenticated;
