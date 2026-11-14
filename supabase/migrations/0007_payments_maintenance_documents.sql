-- Phase 4: online rent payment (Razorpay), maintenance workflow, document sharing.
--
-- Payment design: the browser and the Razorpay checkout callback can NEVER mark rent as paid.
-- Only the razorpay-webhook Edge Function (after HMAC verification of the raw body) calls process_razorpay_event(),
-- which is executable by service_role only. Amounts come from our own payment_orders row, never from the client.

-- ---------- owner opt-in ----------
alter table public.owner_profiles add column if not exists online_payments_enabled boolean not null default false;
grant update (online_payments_enabled) on public.owner_profiles to authenticated;

-- ---------- payment orders ----------
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  invoice_id uuid not null references public.rent_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  gateway text not null default 'razorpay',
  gateway_order_id text unique,
  status text not null default 'created' check (status in ('created','paid','failed','expired')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_orders_tenant_idx on public.payment_orders (tenant_id, created_at desc);
create index payment_orders_invoice_idx on public.payment_orders (invoice_id);
alter table public.payment_orders enable row level security;
create policy porders_owner_read on public.payment_orders for select using (owner_id = auth.uid() and public.is_owner());
create policy porders_tenant_read on public.payment_orders for select using (tenant_id in (select public.my_tenant_ids()));
revoke insert, update, delete on public.payment_orders from authenticated, anon;

-- Tenant starts a payment. The amount is the invoice balance computed here, not anything the browser sends.
create or replace function public.prepare_online_payment(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv rent_invoices; v_bal numeric(12,2); o payment_orders;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into inv from rent_invoices where id = p_invoice_id and tenant_id in (select public.my_tenant_ids()) for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status not in ('pending','partially_paid','overdue') then raise exception 'This invoice cannot be paid online (status: %)', inv.status; end if;
  v_bal := inv.total_amount - inv.paid_amount;
  if v_bal <= 0 then raise exception 'Nothing is due on this invoice'; end if;
  if not coalesce((select online_payments_enabled from owner_profiles where user_id = inv.owner_id), false) then
    raise exception 'Your owner has not enabled online payments. Please pay them directly.';
  end if;
  if (select count(*) from payment_orders where tenant_id = inv.tenant_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many payment attempts. Please wait a few minutes and try again.';
  end if;
  update payment_orders set status = 'expired', updated_at = now() where invoice_id = inv.id and status = 'created';
  insert into payment_orders (owner_id, tenant_id, invoice_id, amount) values (inv.owner_id, inv.tenant_id, inv.id, v_bal) returning * into o;
  return jsonb_build_object('order_id', o.id, 'amount', v_bal, 'currency', 'INR', 'invoice_number', inv.invoice_number);
end $$;

-- Edge Function (service role) records the Razorpay order id once the gateway has created it.
create or replace function public.attach_gateway_order(p_order_id uuid, p_gateway_order_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payment_orders set gateway_order_id = p_gateway_order_id, updated_at = now()
   where id = p_order_id and status = 'created' and gateway_order_id is null;
  if not found then raise exception 'Order not found or already attached'; end if;
end $$;

-- Applies a VERIFIED Razorpay webhook. Idempotent per event id and per gateway payment id.
create or replace function public.process_razorpay_event(p_event_id text, p_event_type text, p_payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ev uuid; ent jsonb; o payment_orders; inv rent_invoices;
  v_pid text; v_oid text; v_amt numeric(12,2); v_bal numeric(12,2); v_apply numeric(12,2); v_rest numeric(12,2);
  v_method payment_method; v_no bigint; v_pay uuid; v_inv_no text;
begin
  if p_event_id is null or length(p_event_id) = 0 then raise exception 'Missing event id'; end if;
  insert into payment_webhook_events (provider, event_id, event_type, payload, signature_valid, status)
  values ('razorpay', p_event_id, p_event_type, p_payload, true, 'received')
  on conflict (provider, event_id) do nothing returning id into v_ev;
  if v_ev is null then return 'duplicate'; end if;

  ent := p_payload -> 'payload' -> 'payment' -> 'entity';

  if p_event_type = 'payment.failed' then
    update payment_orders set status = 'failed', failure_reason = left(coalesce(ent ->> 'error_description', 'Payment failed'), 200), updated_at = now()
     where gateway_order_id = ent ->> 'order_id' and status = 'created' returning * into o;
    if found then perform notify_tenant(o.tenant_id, 'payment', 'Payment failed', 'Your online payment did not go through. You have not been charged.', '/tenant/rent'); end if;
    update payment_webhook_events set status = 'processed', processed_at = now() where id = v_ev;
    return 'processed';
  end if;

  if p_event_type <> 'payment.captured' then
    update payment_webhook_events set status = 'ignored', processed_at = now() where id = v_ev;
    return 'ignored';
  end if;

  v_pid := ent ->> 'id'; v_oid := ent ->> 'order_id';
  if v_pid is null or v_oid is null or (ent ->> 'amount') is null or coalesce(ent ->> 'currency', '') <> 'INR' then
    update payment_webhook_events set status = 'failed', error = 'Malformed or non-INR payment', processed_at = now() where id = v_ev;
    return 'failed';
  end if;
  v_amt := ((ent ->> 'amount')::numeric / 100)::numeric(12,2);

  select * into o from payment_orders where gateway_order_id = v_oid for update;
  if not found then
    update payment_webhook_events set status = 'ignored', error = 'Unknown order', processed_at = now() where id = v_ev;
    return 'ignored';
  end if;
  if exists (select 1 from payments where gateway = 'razorpay' and gateway_payment_id in (v_pid, v_pid || '#adv')) then
    update payment_webhook_events set status = 'ignored', error = 'Payment already recorded', processed_at = now() where id = v_ev;
    return 'duplicate';
  end if;
  if v_amt <> o.amount then
    update payment_orders set status = 'failed', failure_reason = 'Amount mismatch', updated_at = now() where id = o.id;
    update payment_webhook_events set status = 'failed', error = format('Amount mismatch: captured %s, order %s. Needs manual reconciliation.', v_amt, o.amount), processed_at = now() where id = v_ev;
    return 'failed';
  end if;

  v_method := case when ent ->> 'method' in ('card','upi','netbanking') then (ent ->> 'method')::payment_method else 'other'::payment_method end;
  select * into inv from rent_invoices where id = o.invoice_id for update;
  v_bal := case when inv.status in ('pending','partially_paid','overdue') then greatest(0, inv.total_amount - inv.paid_amount) else 0 end;
  v_apply := least(v_amt, v_bal);
  v_rest := v_amt - v_apply;

  if v_apply > 0 then
    v_no := next_number(o.owner_id, 'receipt');
    insert into payments (owner_id, invoice_id, tenant_id, amount, method, status, paid_at, receipt_number, gateway, gateway_payment_id, notes)
    values (o.owner_id, inv.id, o.tenant_id, v_apply, v_method, 'success', now(), 'REC-' || lpad(v_no::text, 6, '0'), 'razorpay', v_pid, 'Paid online')
    returning id into v_pay;
  end if;
  if v_rest > 0 then
    -- Money was received but the invoice no longer needs it (e.g. the owner recorded cash meanwhile): keep it as advance credit.
    v_no := next_number(o.owner_id, 'receipt');
    insert into payments (owner_id, invoice_id, tenant_id, amount, method, status, paid_at, receipt_number, gateway, gateway_payment_id, notes)
    values (o.owner_id, null, o.tenant_id, v_rest, v_method, 'success', now(), 'REC-' || lpad(v_no::text, 6, '0'), 'razorpay',
            case when v_apply > 0 then v_pid || '#adv' else v_pid end, 'Paid online (kept as advance credit)')
    returning id into v_pay;
    for inv in select id from rent_invoices where tenant_id = o.tenant_id and owner_id = o.owner_id and status in ('pending','partially_paid','overdue') order by due_date loop
      perform apply_advance_credit(inv.id);
    end loop;
  end if;

  update payment_orders set status = 'paid', updated_at = now() where id = o.id;
  insert into payment_transactions (payment_id, gateway, gateway_order_id, gateway_payment_id, status, amount, raw) values (v_pay, 'razorpay', v_oid, v_pid, 'success', v_amt, p_payload);
  select invoice_number into v_inv_no from rent_invoices where id = o.invoice_id;
  perform notify_tenant(o.tenant_id, 'payment', 'Payment received', 'Your online payment of ₹' || v_amt || ' was received. Thank you!', '/tenant/payments');
  insert into notifications (user_id, type, title, body, link)
  values (o.owner_id, 'payment', 'Online rent payment received', '₹' || v_amt || ' paid online for invoice ' || coalesce(v_inv_no, ''), '/owner/payments');
  update payment_webhook_events set status = 'processed', processed_at = now() where id = v_ev;
  return 'processed';
end $$;

revoke execute on function public.attach_gateway_order(uuid, text), public.process_razorpay_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.attach_gateway_order(uuid, text), public.process_razorpay_event(text, text, jsonb) to service_role;
revoke execute on function public.prepare_online_payment(uuid) from public, anon;
grant execute on function public.prepare_online_payment(uuid) to authenticated;

-- ---------- maintenance ----------
-- Tenants may only raise a plain request: no assignee, cost or closing date, and the unit must be theirs and active.
drop policy tenant_maintenance_insert on public.maintenance_requests;
create policy tenant_maintenance_insert on public.maintenance_requests for insert with check (
  tenant_id in (select public.my_tenant_ids())
  and unit_id in (select public.my_unit_ids())
  and owner_id in (select public.my_owner_ids())
  and status = 'new' and assigned_to is null and repair_cost is null and closed_at is null
);

create or replace function public.maintenance_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- The owner is always derived from the tenant record, so a client can neither omit nor forge it.
    new.owner_id := (select owner_id from tenant_profiles where id = new.tenant_id);
    if new.owner_id is null then raise exception 'Tenant not found'; end if;
    if not exists (select 1 from tenant_assignments where tenant_id = new.tenant_id and unit_id = new.unit_id and owner_id = new.owner_id and status = 'active') then
      raise exception 'The tenant does not have an active tenancy on this unit';
    end if;
    new.title := left(trim(new.title), 120);
    if length(new.title) < 3 then raise exception 'Give the request a short title'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id or new.unit_id is distinct from old.unit_id then raise exception 'Tenant and unit cannot be changed'; end if;
    if new.status in ('resolved','closed','rejected') and old.status not in ('resolved','closed','rejected') then new.closed_at := now(); end if;
    if new.status not in ('resolved','closed','rejected') then new.closed_at := null; end if;
  end if;
  return new;
end $$;
-- Named a_* so it runs before check_owner_integrity (triggers fire alphabetically) and fills owner_id first.
create trigger a_maintenance_before before insert or update on public.maintenance_requests for each row execute function public.maintenance_before();

create or replace function public.maintenance_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, type, title, body, link)
    values (new.owner_id, 'maintenance', 'New maintenance request', new.title, '/owner/maintenance');
  elsif new.status is distinct from old.status then
    perform notify_tenant(new.tenant_id, 'maintenance', 'Maintenance update', '"' || new.title || '" is now ' || replace(new.status::text, '_', ' ') || '.', '/tenant/maintenance');
  end if;
  return null;
end $$;
create trigger maintenance_after after insert or update on public.maintenance_requests for each row execute function public.maintenance_after();

create or replace function public.maintenance_comment_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare r maintenance_requests;
begin
  select * into r from maintenance_requests where id = new.request_id;
  if new.author_id = r.owner_id then
    perform notify_tenant(r.tenant_id, 'maintenance', 'New reply on your request', left(new.body, 120), '/tenant/maintenance');
  else
    insert into notifications (user_id, type, title, body, link) values (r.owner_id, 'maintenance', 'Tenant replied on a request', left(new.body, 120), '/owner/maintenance');
  end if;
  return null;
end $$;
create trigger maintenance_comment_after after insert on public.maintenance_comments for each row execute function public.maintenance_comment_after();
-- Comments are plain text of bounded length.
alter table public.maintenance_comments add constraint maintenance_comments_len check (length(trim(body)) between 1 and 2000);

-- ---------- documents ----------
create or replace function public.documents_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is not null and not exists (select 1 from tenant_profiles where id = new.tenant_id and owner_id = new.owner_id) then raise exception 'Tenant does not belong to this owner'; end if;
  if new.property_id is not null and not exists (select 1 from properties where id = new.property_id and owner_id = new.owner_id) then raise exception 'Property does not belong to this owner'; end if;
  if new.unit_id is not null and not exists (select 1 from property_units where id = new.unit_id and owner_id = new.owner_id) then raise exception 'Unit does not belong to this owner'; end if;
  if new.shared_with_tenant and new.tenant_id is null then raise exception 'Choose a tenant to share this document with'; end if;
  if split_part(new.storage_path, '/', 1) <> new.owner_id::text then raise exception 'Invalid file path'; end if;
  return new;
end $$;
create trigger documents_integrity before insert or update on public.documents for each row execute function public.documents_integrity();
create trigger audit_row_change after insert or update or delete on public.documents for each row execute function public.audit_row_change();

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];
create policy "owner reads own documents" on storage.objects for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner uploads own documents" on storage.objects for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
create policy "owner deletes own documents" on storage.objects for delete using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
create policy "tenant reads shared documents" on storage.objects for select using (
  bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = name and d.deleted_at is null and d.shared_with_tenant and d.tenant_id in (select public.my_tenant_ids())));

-- maintenance photos: path "<owner_id>/<request_id>/<file>"; owner and the request's tenant can read and add.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maintenance-files', 'maintenance-files', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create policy "parties read maintenance files" on storage.objects for select using (
  bucket_id = 'maintenance-files' and exists (select 1 from public.maintenance_requests r where r.id::text = (storage.foldername(name))[2] and r.owner_id::text = (storage.foldername(name))[1]));
create policy "parties add maintenance files" on storage.objects for insert with check (
  bucket_id = 'maintenance-files' and exists (select 1 from public.maintenance_requests r where r.id::text = (storage.foldername(name))[2] and r.owner_id::text = (storage.foldername(name))[1]));
