-- RENTMASTER row level security. Every table is locked by default; access is granted per role below.

-- ---------- helper functions (SECURITY DEFINER avoids policy recursion) ----------
create or replace function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and u.status = 'active' and u.deleted_at is null
  )
$$;
create or replace function public.is_super_admin() returns boolean language sql stable as $$ select public.has_role('super_admin') $$;
create or replace function public.is_owner() returns boolean language sql stable as $$ select public.has_role('owner') $$;

create or replace function public.my_tenant_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.tenant_profiles where user_id = auth.uid() and deleted_at is null and status <> 'archived'
$$;
create or replace function public.my_unit_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.unit_id from public.tenant_assignments a
  where a.status = 'active' and a.tenant_id in (select public.my_tenant_ids())
$$;
create or replace function public.my_property_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.property_id from public.property_units u where u.id in (select public.my_unit_ids())
$$;
create or replace function public.my_owner_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct a.owner_id from public.tenant_assignments a
  where a.status = 'active' and a.tenant_id in (select public.my_tenant_ids())
$$;

-- ---------- enable RLS everywhere ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- privilege hardening: clients can never write these columns/tables directly ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.users from authenticated;
grant update (full_name, phone, avatar_url) on public.users to authenticated;
revoke insert, update, delete on public.user_roles from authenticated;
revoke insert, update, delete on public.payment_webhook_events, public.payment_transactions, public.audit_logs, public.user_sessions from authenticated;
revoke insert, update, delete on public.subscription_plans from authenticated;

-- ---------- users / roles ----------
create policy users_self_read on public.users for select using (id = auth.uid());
create policy users_self_update on public.users for update using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin_read on public.users for select using (public.is_super_admin());
create policy users_tenant_reads_owner on public.users for select using (id in (select public.my_owner_ids()));
create policy users_owner_reads_tenants on public.users for select using (
  public.is_owner() and id in (select user_id from public.tenant_profiles where owner_id = auth.uid() and user_id is not null)
);
-- admin may suspend / reactivate accounts through a function (see 0003); no direct policy.

create policy roles_self_read on public.user_roles for select using (user_id = auth.uid());
create policy roles_admin_read on public.user_roles for select using (public.is_super_admin());

create policy owner_profiles_self on public.owner_profiles for all using (user_id = auth.uid() and public.is_owner()) with check (user_id = auth.uid() and public.is_owner());
create policy owner_profiles_admin_read on public.owner_profiles for select using (public.is_super_admin());

-- ---------- tables owned by an owner: full access for that owner only ----------
do $$
declare t text;
begin
  foreach t in array array['tenant_profiles','properties','property_units','tenant_assignments','rental_agreements',
                           'rent_invoices','payments','security_deposits','expenses','maintenance_requests','documents']
  loop
    execute format($f$create policy owner_all on public.%I for all
      using (owner_id = auth.uid() and public.is_owner())
      with check (owner_id = auth.uid() and public.is_owner())$f$, t);
  end loop;
end $$;

-- ---------- tenant (read-mostly) policies ----------
create policy tenant_self_read on public.tenant_profiles for select using (user_id = auth.uid());
-- Tenants get NO direct access to properties / property_units (those rows hold owner-internal notes and settings).
-- They read a safe projection through public.my_tenancies() (see 0005).
create policy tenant_assignment_read on public.tenant_assignments for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_agreement_read on public.rental_agreements for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_invoice_read on public.rent_invoices for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_payment_read on public.payments for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_deposit_read on public.security_deposits for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_document_read on public.documents for select using (
  deleted_at is null and shared_with_tenant and tenant_id in (select public.my_tenant_ids())
);
create policy tenant_maintenance_read on public.maintenance_requests for select using (tenant_id in (select public.my_tenant_ids()));
create policy tenant_maintenance_insert on public.maintenance_requests for insert with check (
  tenant_id in (select public.my_tenant_ids())
  and unit_id in (select public.my_unit_ids())
  and owner_id in (select public.my_owner_ids())
  and status = 'new'
);

-- ---------- admin (platform-level, never tenant documents or private tenant data) ----------
create policy admin_properties_read on public.properties for select using (public.is_super_admin());
create policy admin_units_read on public.property_units for select using (public.is_super_admin());
create policy admin_invoices_read on public.rent_invoices for select using (public.is_super_admin());
create policy admin_payments_read on public.payments for select using (public.is_super_admin());
create policy admin_maintenance_read on public.maintenance_requests for select using (public.is_super_admin());

-- ---------- child tables: visibility follows the parent row's own RLS ----------
create policy items_read on public.rent_invoice_items for select using (exists (select 1 from public.rent_invoices i where i.id = invoice_id));
create policy items_owner_write on public.rent_invoice_items for all
  using (exists (select 1 from public.rent_invoices i where i.id = invoice_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.rent_invoices i where i.id = invoice_id and i.owner_id = auth.uid()));

create policy ptx_read on public.payment_transactions for select using (payment_id is not null and exists (select 1 from public.payments p where p.id = payment_id));

create policy dtx_read on public.deposit_transactions for select using (exists (select 1 from public.security_deposits d where d.id = deposit_id));
create policy dtx_owner_write on public.deposit_transactions for all
  using (exists (select 1 from public.security_deposits d where d.id = deposit_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.security_deposits d where d.id = deposit_id and d.owner_id = auth.uid()));

create policy mcomments_read on public.maintenance_comments for select using (exists (select 1 from public.maintenance_requests r where r.id = request_id));
create policy mcomments_insert on public.maintenance_comments for insert with check (
  author_id = auth.uid() and exists (select 1 from public.maintenance_requests r where r.id = request_id)
);
create policy mattach_read on public.maintenance_attachments for select using (exists (select 1 from public.maintenance_requests r where r.id = request_id));
create policy mattach_insert on public.maintenance_attachments for insert with check (
  uploaded_by = auth.uid() and exists (select 1 from public.maintenance_requests r where r.id = request_id)
);

-- ---------- categories ----------
create policy categories_read on public.expense_categories for select using (owner_id is null or owner_id = auth.uid());
create policy categories_owner_write on public.expense_categories for all
  using (owner_id = auth.uid() and public.is_owner()) with check (owner_id = auth.uid() and public.is_owner());

-- ---------- notifications ----------
create policy notifications_self_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_self_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- messages ----------
create policy messages_read on public.messages for select using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy messages_owner_send on public.messages for insert with check (
  sender_id = auth.uid() and owner_id = auth.uid() and public.is_owner()
);
create policy messages_tenant_send on public.messages for insert with check (
  sender_id = auth.uid() and recipient_id = owner_id and owner_id in (select public.my_owner_ids())
);
create policy messages_recipient_mark_read on public.messages for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;
create policy mattachments_read on public.message_attachments for select using (exists (select 1 from public.messages m where m.id = message_id));

-- ---------- announcements ----------
create policy announcements_owner_all on public.announcements for all
  using (owner_id = auth.uid() and public.is_owner()) with check (owner_id = auth.uid() and author_id = auth.uid() and public.is_owner());
create policy announcements_tenant_read on public.announcements for select using (
  deleted_at is null and audience in ('tenants','all') and owner_id in (select public.my_owner_ids())
  and (property_id is null or property_id in (select public.my_property_ids()))
);
create policy announcements_admin_all on public.announcements for all
  using (public.is_super_admin()) with check (public.is_super_admin() and author_id = auth.uid());
create policy announcements_platform_read on public.announcements for select using (deleted_at is null and owner_id is null and audience in ('all') );

-- ---------- platform tables ----------
create policy audit_admin_read on public.audit_logs for select using (public.is_super_admin());
create policy audit_owner_read on public.audit_logs for select using (actor_id = auth.uid());
create policy plans_read on public.subscription_plans for select using (active or public.is_super_admin());
create policy plans_admin_write on public.subscription_plans for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy subs_owner_read on public.subscriptions for select using (owner_id = auth.uid());
create policy subs_admin_all on public.subscriptions for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy sessions_self_read on public.user_sessions for select using (user_id = auth.uid());
create policy sessions_admin_read on public.user_sessions for select using (public.is_super_admin());
create policy webhook_admin_read on public.payment_webhook_events for select using (public.is_super_admin());
