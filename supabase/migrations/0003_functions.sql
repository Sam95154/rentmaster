-- RENTMASTER triggers, integrity rules and server-side business functions

-- ---------- updated_at ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at' loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- new auth user -> profile + role ----------
-- Role is NEVER taken from client-supplied metadata. A person whose email matches a tenant record that an owner
-- created becomes a tenant; everyone else who self-registers becomes an owner. Super admins are created with
-- public.bootstrap_super_admin() by someone with database access. Keep "Confirm email" ON in Supabase Auth.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_is_tenant boolean;
begin
  insert into public.users (id, email, full_name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'phone', ''));

  select exists (select 1 from public.tenant_profiles
                 where lower(email) = lower(new.email) and user_id is null and deleted_at is null) into v_is_tenant;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.bootstrap_super_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No user with that email. Register first.'; end if;
  delete from public.user_roles where user_id = v_id;
  insert into public.user_roles (user_id, role) values (v_id, 'super_admin');
end $$;
revoke execute on function public.bootstrap_super_admin(text) from public, anon, authenticated;

-- ---------- cross-owner integrity: a row can only reference parents owned by the same owner ----------
create or replace function public.check_owner_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;

  if tg_table_name = 'property_units' then
    if not exists (select 1 from properties where id = new.property_id and owner_id = new.owner_id) then
      raise exception 'Property does not belong to this owner';
    end if;
  elsif tg_table_name = 'tenant_assignments' then
    if not exists (select 1 from property_units where id = new.unit_id and owner_id = new.owner_id)
       or not exists (select 1 from tenant_profiles where id = new.tenant_id and owner_id = new.owner_id) then
      raise exception 'Unit or tenant does not belong to this owner';
    end if;
  elsif tg_table_name in ('rental_agreements','rent_invoices','security_deposits','maintenance_requests','payments') then
    if not exists (select 1 from tenant_profiles where id = new.tenant_id and owner_id = new.owner_id) then
      raise exception 'Tenant does not belong to this owner';
    end if;
  end if;

  if tg_table_name in ('rental_agreements','rent_invoices','maintenance_requests') then
    if not exists (select 1 from property_units where id = new.unit_id and owner_id = new.owner_id) then
      raise exception 'Unit does not belong to this owner';
    end if;
  elsif tg_table_name = 'expenses' then
    if not exists (select 1 from properties where id = new.property_id and owner_id = new.owner_id) then
      raise exception 'Property does not belong to this owner';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['property_units','tenant_assignments','rental_agreements','rent_invoices','security_deposits','maintenance_requests','payments','expenses','properties','tenant_profiles','documents']
  loop
    execute format('create trigger check_owner_integrity before insert or update on public.%I for each row execute function public.check_owner_integrity()', t);
  end loop;
end $$;

-- ---------- occupancy rules ----------
create or replace function public.check_unit_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_active boolean;
begin
  select exists (select 1 from tenant_assignments where unit_id = new.id and status = 'active') into v_active;
  if new.status = 'occupied' and not v_active then
    raise exception 'A unit can only be Occupied while it has an active tenant. Assign a tenant instead.';
  end if;
  if new.status <> 'occupied' and v_active then
    raise exception 'This unit has an active tenant. End the tenancy before changing its status.';
  end if;
  return new;
end $$;
create trigger check_unit_status before update of status on public.property_units for each row
  when (new.status is distinct from old.status) execute function public.check_unit_status();

create or replace function public.block_new_occupied_unit() returns trigger language plpgsql as $$
begin
  if new.status = 'occupied' then raise exception 'New units cannot start as Occupied. Assign a tenant after creating the unit.'; end if;
  return new;
end $$;
create trigger block_new_occupied_unit before insert on public.property_units for each row execute function public.block_new_occupied_unit();

-- One function per table: property_units.status is an enum without 'archived', so a shared body would fail to evaluate.
create or replace function public.block_archive_property() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.deleted_at is not null or new.status = 'archived') and old.deleted_at is null and old.status = 'active' then
    if exists (select 1 from tenant_assignments a join property_units u on u.id = a.unit_id
               where u.property_id = new.id and a.status = 'active') then
      raise exception 'This property still has active tenants. End their tenancies first.';
    end if;
  end if;
  return new;
end $$;
create trigger block_archive_property before update on public.properties for each row execute function public.block_archive_property();

create or replace function public.block_remove_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (select 1 from tenant_assignments where unit_id = new.id and status = 'active') then
      raise exception 'This unit has an active tenant. End the tenancy first.';
    end if;
  end if;
  return new;
end $$;
create trigger block_remove_unit before update on public.property_units for each row execute function public.block_remove_unit();

-- ---------- audit log ----------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), tg_op, tg_table_name, v_row->>'id',
          jsonb_build_object('owner_id', v_row->>'owner_id', 'status', v_row->>'status'));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['properties','property_units','tenant_profiles','tenant_assignments','rental_agreements','rent_invoices','payments','security_deposits','expenses','users']
  loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ---------- tenancy workflows (run as the calling owner, so RLS still applies) ----------
create or replace function public.assign_tenant(
  p_tenant_id uuid, p_unit_id uuid, p_start_date date,
  p_monthly_rent numeric, p_security_deposit numeric, p_rent_due_day int,
  p_billing_cycle billing_cycle default 'monthly'
) returns uuid language plpgsql as $$
declare v_owner uuid := auth.uid(); v_unit public.property_units; v_id uuid;
begin
  if not public.is_owner() then raise exception 'Only owners can assign tenants'; end if;
  if p_monthly_rent is null or p_monthly_rent < 0 then raise exception 'Monthly rent must be zero or more'; end if;
  select * into v_unit from public.property_units where id = p_unit_id and owner_id = v_owner and deleted_at is null for update;
  if not found then raise exception 'Unit not found'; end if;
  if v_unit.status not in ('available','reserved') then raise exception 'Unit is not available (current status: %)', v_unit.status; end if;
  if not exists (select 1 from public.tenant_profiles where id = p_tenant_id and owner_id = v_owner and deleted_at is null) then
    raise exception 'Tenant not found';
  end if;

  insert into public.tenant_assignments (owner_id, tenant_id, unit_id, start_date, monthly_rent, security_deposit, rent_due_day, billing_cycle)
  values (v_owner, p_tenant_id, p_unit_id, p_start_date, p_monthly_rent, coalesce(p_security_deposit, 0), p_rent_due_day, p_billing_cycle)
  returning id into v_id;

  insert into public.security_deposits (owner_id, assignment_id, tenant_id, expected_amount)
  values (v_owner, v_id, p_tenant_id, coalesce(p_security_deposit, 0));

  update public.property_units set status = 'occupied' where id = p_unit_id;
  update public.tenant_profiles set status = 'active' where id = p_tenant_id and status = 'archived';
  return v_id;
end $$;

create or replace function public.end_tenancy(p_assignment_id uuid, p_end_date date, p_reason text default null)
returns void language plpgsql as $$
declare v_a public.tenant_assignments;
begin
  if not public.is_owner() then raise exception 'Only owners can end tenancies'; end if;
  select * into v_a from public.tenant_assignments where id = p_assignment_id and owner_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'Active tenancy not found'; end if;
  if p_end_date < v_a.start_date then raise exception 'Move-out date cannot be before the move-in date'; end if;

  update public.tenant_assignments set status = 'ended', end_date = p_end_date, end_reason = p_reason where id = p_assignment_id;
  update public.property_units set status = 'available' where id = v_a.unit_id;
end $$;

create or replace function public.transfer_tenant(
  p_assignment_id uuid, p_new_unit_id uuid, p_effective_date date,
  p_monthly_rent numeric default null
) returns uuid language plpgsql as $$
declare v_a public.tenant_assignments; v_new public.property_units; v_id uuid;
begin
  if not public.is_owner() then raise exception 'Only owners can transfer tenants'; end if;
  select * into v_a from public.tenant_assignments where id = p_assignment_id and owner_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'Active tenancy not found'; end if;
  if p_new_unit_id = v_a.unit_id then raise exception 'Choose a different unit'; end if;
  if p_effective_date < v_a.start_date then raise exception 'Transfer date cannot be before the move-in date'; end if;
  select * into v_new from public.property_units where id = p_new_unit_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Destination unit not found'; end if;
  if v_new.status not in ('available','reserved') then raise exception 'Destination unit is not available'; end if;

  update public.tenant_assignments set status = 'transferred', end_date = p_effective_date, end_reason = 'Transferred to unit ' || v_new.unit_number where id = p_assignment_id;
  update public.property_units set status = 'available' where id = v_a.unit_id;

  -- the existing security deposit stays on the original assignment's ledger (no second deposit row is created)
  insert into public.tenant_assignments (owner_id, tenant_id, unit_id, start_date, monthly_rent, security_deposit, rent_due_day, billing_cycle)
  values (v_a.owner_id, v_a.tenant_id, p_new_unit_id, p_effective_date, coalesce(p_monthly_rent, v_new.monthly_rent), v_a.security_deposit, v_a.rent_due_day, v_a.billing_cycle)
  returning id into v_id;
  update public.property_units set status = 'occupied' where id = p_new_unit_id;
  return v_id;
end $$;

create or replace function public.archive_tenant(p_tenant_id uuid) returns void language plpgsql as $$
begin
  if not public.is_owner() then raise exception 'Only owners can archive tenants'; end if;
  if exists (select 1 from public.tenant_assignments where tenant_id = p_tenant_id and status = 'active') then
    raise exception 'This tenant has an active tenancy. End it first.';
  end if;
  update public.tenant_profiles set status = 'archived' where id = p_tenant_id and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Tenant not found'; end if;
end $$;

-- ---------- owner analytics (all figures computed here, never in the browser) ----------
create or replace function public.owner_dashboard_stats() returns jsonb
language plpgsql stable as $$
declare v uuid := auth.uid(); r jsonb;
begin
  if not public.is_owner() then raise exception 'Owners only'; end if;
  select jsonb_build_object(
    'total_properties', (select count(*) from properties where owner_id = v and deleted_at is null and status = 'active'),
    'total_units', (select count(*) from property_units where owner_id = v and deleted_at is null),
    'occupied_units', (select count(*) from property_units where owner_id = v and deleted_at is null and status = 'occupied'),
    'vacant_units', (select count(*) from property_units where owner_id = v and deleted_at is null and status = 'available'),
    'total_tenants', (select count(*) from tenant_profiles where owner_id = v and deleted_at is null and status <> 'archived'),
    'expected_rent', (select coalesce(sum(monthly_rent), 0) from tenant_assignments where owner_id = v and status = 'active'),
    'collected_this_month', (select coalesce(sum(amount), 0) from payments where owner_id = v and status = 'success' and date_trunc('month', paid_at) = date_trunc('month', now())),
    'pending_rent', (select coalesce(sum(total_amount - paid_amount), 0) from rent_invoices where owner_id = v and status in ('pending','partially_paid') and due_date >= current_date),
    'overdue_rent', (select coalesce(sum(total_amount - paid_amount), 0) from rent_invoices where owner_id = v and (status = 'overdue' or (status in ('pending','partially_paid') and due_date < current_date))),
    'deposits_held', (select coalesce(sum(case when dt.txn_type = 'received' then dt.amount else -dt.amount end), 0)
                      from deposit_transactions dt join security_deposits d on d.id = dt.deposit_id where d.owner_id = v),
    'expenses_this_month', (select coalesce(sum(amount), 0) from expenses where owner_id = v and deleted_at is null and date_trunc('month', expense_date) = date_trunc('month', current_date)),
    'open_maintenance', (select count(*) from maintenance_requests where owner_id = v and status not in ('resolved','rejected','closed')),
    'upcoming_due', coalesce((select jsonb_agg(x) from (
        select i.id, i.invoice_number, i.due_date, (i.total_amount - i.paid_amount) as balance, t.full_name as tenant_name, u.unit_number
        from rent_invoices i join tenant_profiles t on t.id = i.tenant_id join property_units u on u.id = i.unit_id
        where i.owner_id = v and i.status in ('pending','partially_paid') and i.due_date between current_date and current_date + 14
        order by i.due_date limit 5) x), '[]'::jsonb),
    'recent_tenants', coalesce((select jsonb_agg(x) from (
        select id, full_name, created_at from tenant_profiles where owner_id = v and deleted_at is null order by created_at desc limit 5) x), '[]'::jsonb),
    'recent_transactions', coalesce((select jsonb_agg(x) from (
        select p.id, p.amount, p.method, p.paid_at, t.full_name as tenant_name
        from payments p join tenant_profiles t on t.id = p.tenant_id
        where p.owner_id = v and p.status = 'success' order by p.paid_at desc limit 5) x), '[]'::jsonb)
  ) into r;
  r := r || jsonb_build_object('net_income_month', (r->>'collected_this_month')::numeric - (r->>'expenses_this_month')::numeric);
  return r;
end $$;

create or replace function public.owner_monthly_series(p_months int default 12)
returns table (month date, income numeric, expenses numeric, billed numeric)
language sql stable as $$
  select m::date,
    coalesce((select sum(p.amount) from payments p where p.owner_id = auth.uid() and p.status = 'success' and date_trunc('month', p.paid_at) = date_trunc('month', m)), 0),
    coalesce((select sum(e.amount) from expenses e where e.owner_id = auth.uid() and e.deleted_at is null and date_trunc('month', e.expense_date::timestamptz) = date_trunc('month', m)), 0),
    coalesce((select sum(i.total_amount) from rent_invoices i where i.owner_id = auth.uid() and i.status <> 'waived' and date_trunc('month', i.due_date::timestamptz) = date_trunc('month', m)), 0)
  from generate_series(date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1), date_trunc('month', now()), interval '1 month') m
  where public.is_owner()
  order by 1
$$;

create or replace function public.owner_property_summary()
returns table (property_id uuid, name text, total_units bigint, occupied_units bigint, income_12m numeric)
language sql stable as $$
  select p.id, p.name,
    (select count(*) from property_units u where u.property_id = p.id and u.deleted_at is null),
    (select count(*) from property_units u where u.property_id = p.id and u.deleted_at is null and u.status = 'occupied'),
    coalesce((select sum(pay.amount) from payments pay join rent_invoices i on i.id = pay.invoice_id join property_units u on u.id = i.unit_id
              where u.property_id = p.id and pay.status = 'success' and pay.paid_at >= now() - interval '12 months'), 0)
  from properties p
  where p.owner_id = auth.uid() and p.deleted_at is null and p.status = 'active' and public.is_owner()
  order by p.name
$$;

-- ---------- tenant self-service (only permitted fields; identity and tenancy data stay owner/admin-controlled) ----------
create or replace function public.update_my_tenant_profile(p_emergency_name text, p_emergency_phone text, p_permanent_address text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('tenant') then raise exception 'Tenants only'; end if;
  update public.tenant_profiles
     set emergency_contact_name = nullif(trim(p_emergency_name), ''),
         emergency_contact_phone = nullif(trim(p_emergency_phone), ''),
         permanent_address = nullif(trim(p_permanent_address), '')
   where user_id = auth.uid() and deleted_at is null;
end $$;

-- ---------- super admin (platform-level data only) ----------
create or replace function public.admin_platform_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return jsonb_build_object(
    'owners', (select count(*) from user_roles where role = 'owner'),
    'tenants', (select count(*) from user_roles where role = 'tenant'),
    'suspended_users', (select count(*) from users where status = 'suspended'),
    'properties', (select count(*) from properties where deleted_at is null),
    'units', (select count(*) from property_units where deleted_at is null),
    'occupied_units', (select count(*) from property_units where deleted_at is null and status = 'occupied'),
    'total_collected', (select coalesce(sum(amount), 0) from payments where status = 'success'),
    'open_maintenance', (select count(*) from maintenance_requests where status not in ('resolved','rejected','closed'))
  );
end $$;

create or replace function public.admin_list_owners()
returns table (id uuid, full_name text, email text, status text, created_at timestamptz, properties bigint, units bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return query
    select u.id, u.full_name, u.email, u.status, u.created_at,
      (select count(*) from properties p where p.owner_id = u.id and p.deleted_at is null),
      (select count(*) from property_units pu where pu.owner_id = u.id and pu.deleted_at is null)
    from users u join user_roles r on r.user_id = u.id and r.role = 'owner'
    where u.deleted_at is null order by u.created_at desc;
end $$;

-- deliberately limited columns: no addresses, DOB, documents or emergency contacts
create or replace function public.admin_list_tenants()
returns table (id uuid, full_name text, email text, status text, owner_name text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return query
    select t.id, t.full_name, t.email, t.status, o.full_name, t.created_at
    from tenant_profiles t join users o on o.id = t.owner_id
    where t.deleted_at is null order by t.created_at desc limit 500;
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own status'; end if;
  if exists (select 1 from user_roles where user_id = p_user_id and role = 'super_admin') then
    raise exception 'Admin accounts cannot be suspended here';
  end if;
  update users set status = p_status where id = p_user_id;
end $$;

-- ---------- a client can never (re)link a tenant record to a login; only the signup trigger / service role does ----------
create or replace function public.protect_tenant_user_link() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id else null end) then
    raise exception 'The login link of a tenant record cannot be changed directly';
  end if;
  return new;
end $$;
create trigger protect_tenant_user_link before insert or update on public.tenant_profiles
  for each row execute function public.protect_tenant_user_link();
