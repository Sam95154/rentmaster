-- Public pricing: plan names/prices are not sensitive.
grant select on public.subscription_plans to anon;
create policy plans_public_read on public.subscription_plans for select to anon using (active);

-- Tenant-safe projection of their own tenancies (no owner-internal notes, no property settings).
create or replace function public.my_tenancies() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', a.id, 'tenant_id', a.tenant_id,
    'start_date', a.start_date, 'end_date', a.end_date,
    'monthly_rent', a.monthly_rent, 'security_deposit', a.security_deposit,
    'rent_due_day', a.rent_due_day, 'billing_cycle', a.billing_cycle,
    'unit', jsonb_build_object('id', u.id, 'unit_number', u.unit_number, 'floor_number', u.floor_number,
                               'bedrooms', u.bedrooms, 'bathrooms', u.bathrooms, 'area_sqft', u.area_sqft),
    'property', jsonb_build_object('id', p.id, 'name', p.name, 'building_name', p.building_name,
                               'property_type', p.property_type, 'address_line', p.address_line,
                               'city', p.city, 'state', p.state, 'pincode', p.pincode, 'amenities', p.amenities),
    'owner', jsonb_build_object('full_name', o.full_name, 'email', o.email, 'phone', o.phone)
  ) order by a.start_date desc), '[]'::jsonb)
  from tenant_assignments a
  join property_units u on u.id = a.unit_id
  join properties p on p.id = u.property_id
  join users o on o.id = a.owner_id
  where a.status = 'active' and public.has_role('tenant') and a.tenant_id in (select public.my_tenant_ids())
$$;

create or replace function public.my_rent_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'outstanding', coalesce(sum(i.total_amount - i.paid_amount) filter (where i.status in ('pending','partially_paid','overdue')), 0),
    'next_due_date', min(i.due_date) filter (where i.status in ('pending','partially_paid','overdue')),
    'open_invoices', count(*) filter (where i.status in ('pending','partially_paid','overdue')))
  from rent_invoices i
  where public.has_role('tenant') and i.tenant_id in (select public.my_tenant_ids())
$$;

-- Notify a tenant (if they already have a login) when a tenancy starts.
create or replace function public.notify_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_unit text;
begin
  select user_id into v_uid from tenant_profiles where id = new.tenant_id;
  if v_uid is not null then
    select unit_number into v_unit from property_units where id = new.unit_id;
    insert into notifications (user_id, type, title, body, link)
    values (v_uid, 'tenancy', 'Tenancy started', 'You have been assigned to unit ' || v_unit || '.', '/tenant/property');
  end if;
  return new;
end $$;
create trigger notify_assignment after insert on public.tenant_assignments for each row execute function public.notify_assignment();

-- Realtime for the notification bell (RLS still filters what each user receives).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null;
end $$;
