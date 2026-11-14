-- RENTMASTER Phase 3: financial management.
-- Design rule: money tables are NEVER written by the browser. Invoices, payments, allocations and deposit
-- ledgers change only through the SECURITY DEFINER functions below, which validate ownership and amounts.
-- Totals and statuses are derived by the database (recalc_invoice), never trusted from the client.

-- ---------- columns, constraints, privileges ----------
alter table public.owner_profiles
  add column next_invoice_no bigint not null default 1,
  add column next_receipt_no bigint not null default 1;
alter table public.payments add column refunded_at timestamptz, add column refund_reason text;
alter table public.deposit_transactions add column receipt_number text;
alter table public.rent_invoices add constraint rent_invoices_paid_le_total check (paid_amount <= total_amount);
create unique index payments_owner_receipt_key on public.payments (owner_id, receipt_number) where receipt_number is not null;

-- Advance payments are applied to invoices through allocations (payments stay immutable; income is counted when cash is received).
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  invoice_id uuid not null references public.rent_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
alter table public.payment_allocations enable row level security;
create policy alloc_owner_read on public.payment_allocations for select using (owner_id = auth.uid() and public.is_owner());
create policy alloc_tenant_read on public.payment_allocations for select using (
  exists (select 1 from public.rent_invoices i where i.id = invoice_id and i.tenant_id in (select public.my_tenant_ids())));

revoke update on public.owner_profiles from authenticated;
grant update (business_name, address, rent_due_day, late_fee_percent, reminder_days_before) on public.owner_profiles to authenticated;
revoke insert, update, delete on public.rent_invoices, public.rent_invoice_items, public.payments, public.payment_allocations,
  public.security_deposits, public.deposit_transactions from authenticated;

-- ---------- internal helpers (not callable by clients) ----------
create or replace function public.next_number(p_owner uuid, p_kind text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_kind = 'invoice' then
    update owner_profiles set next_invoice_no = next_invoice_no + 1 where user_id = p_owner returning next_invoice_no - 1 into v;
  else
    update owner_profiles set next_receipt_no = next_receipt_no + 1 where user_id = p_owner returning next_receipt_no - 1 into v;
  end if;
  if v is null then raise exception 'Owner profile not found'; end if;
  return v;
end $$;

create or replace function public.notify_tenant(p_tenant_id uuid, p_type text, p_title text, p_body text, p_link text default '/tenant/rent') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select user_id, p_type, p_title, p_body, p_link from tenant_profiles where id = p_tenant_id and user_id is not null;
end $$;

-- Derives amount / late_fee / discount / paid_amount / status from the item and payment ledgers.
create or replace function public.recalc_invoice(p_invoice_id uuid, p_as_of date default current_date) returns void
language plpgsql security definer set search_path = public as $$
declare v rent_invoices; v_paid numeric(12,2); v_alloc numeric(12,2); v_amount numeric(12,2); v_late numeric(12,2); v_disc numeric(12,2); v_total numeric(12,2); v_status invoice_status;
begin
  select * into v from rent_invoices where id = p_invoice_id for update;
  if not found then return; end if;
  select coalesce(sum(amount) filter (where item_type in ('rent','other') or (item_type = 'adjustment' and amount > 0)), 0),
         coalesce(sum(amount) filter (where item_type = 'late_fee'), 0),
         coalesce(-sum(amount) filter (where item_type = 'adjustment' and amount < 0), 0)
    into v_amount, v_late, v_disc from rent_invoice_items where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice_id and status = 'success';
  select coalesce(sum(amount), 0) into v_alloc from payment_allocations where invoice_id = p_invoice_id;
  v_paid := v_paid + v_alloc;
  v_total := v_amount + v_late - v_disc;
  if v_total < 0 then raise exception 'Discounts cannot exceed the invoice total'; end if;
  if v_paid > v_total then raise exception 'Payments (%) would exceed the invoice total (%)', v_paid, v_total; end if;
  v_status := (case when v.status in ('waived','refunded') then v.status::text
                    when v_paid >= v_total then 'paid'
                    when v.due_date < p_as_of then 'overdue'
                    when v_paid > 0 then 'partially_paid'
                    else 'pending' end)::invoice_status;
  update rent_invoices set amount = v_amount, late_fee = v_late, discount = v_disc, paid_amount = v_paid, status = v_status where id = p_invoice_id;
end $$;

create or replace function public.invoice_compute_total() returns trigger language plpgsql as $$
begin new.total_amount := new.amount + new.late_fee - new.discount; return new; end $$;
create trigger invoice_compute_total before insert or update on public.rent_invoices for each row execute function public.invoice_compute_total();

create or replace function public.payments_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.invoice_id is not null then perform recalc_invoice(new.invoice_id); end if;
  if tg_op in ('UPDATE','DELETE') and old.invoice_id is not null and (tg_op = 'DELETE' or old.invoice_id is distinct from new.invoice_id) then
    perform recalc_invoice(old.invoice_id);
  end if;
  return null;
end $$;
create trigger payments_after_change after insert or update or delete on public.payments for each row execute function public.payments_after_change();

create or replace function public.allocations_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform recalc_invoice(coalesce(new.invoice_id, old.invoice_id)); return null; end $$;
create trigger allocations_after_change after insert or delete on public.payment_allocations for each row execute function public.allocations_after_change();

-- Applies any unspent advance payments of the tenant to this invoice, oldest first.
create or replace function public.apply_advance_credit(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv rent_invoices; adv record; v_bal numeric(12,2); v_apply numeric(12,2);
begin
  select * into inv from rent_invoices where id = p_invoice_id for update;
  if not found or inv.status in ('waived','refunded') then return; end if;
  v_bal := inv.total_amount - inv.paid_amount;
  for adv in
    select p.id, p.amount - coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = p.id), 0) as avail
      from payments p
     where p.owner_id = inv.owner_id and p.tenant_id = inv.tenant_id and p.invoice_id is null and p.status = 'success'
     order by p.paid_at, p.created_at for update of p
  loop
    exit when v_bal <= 0;
    continue when adv.avail <= 0;
    v_apply := least(adv.avail, v_bal);
    insert into payment_allocations (owner_id, payment_id, invoice_id, amount) values (inv.owner_id, adv.id, inv.id, v_apply);
    v_bal := v_bal - v_apply;
  end loop;
end $$;

-- Creates one invoice; returns NULL (no error) when that tenancy + period already has one.
create or replace function public.make_invoice(p_owner uuid, p_assignment uuid, p_period_start date, p_period_end date, p_due date, p_amount numeric, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a tenant_assignments; v_id uuid; v_no bigint;
begin
  select * into a from tenant_assignments where id = p_assignment and owner_id = p_owner;
  if not found then raise exception 'Tenancy not found'; end if;
  if exists (select 1 from rent_invoices where assignment_id = p_assignment and period_start = p_period_start) then return null; end if;
  v_no := next_number(p_owner, 'invoice');
  insert into rent_invoices (owner_id, assignment_id, tenant_id, unit_id, invoice_number, period_start, period_end, due_date, amount, total_amount)
  values (p_owner, a.id, a.tenant_id, a.unit_id, 'INV-' || lpad(v_no::text, 6, '0'), p_period_start, p_period_end, p_due, p_amount, p_amount)
  on conflict (assignment_id, period_start) do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  insert into rent_invoice_items (invoice_id, item_type, description, amount) values (v_id, 'rent', p_description, p_amount);
  perform apply_advance_credit(v_id);
  perform recalc_invoice(v_id);
  perform notify_tenant(a.tenant_id, 'invoice', 'New rent invoice', 'Invoice INV-' || lpad(v_no::text, 6, '0') || ' is due on ' || to_char(p_due, 'DD Mon YYYY') || '.');
  return v_id;
end $$;

-- Core billing run (used by the owner button and by the scheduled job). Idempotent: safe to re-run.
create or replace function public.billing_run(p_owner uuid, p_as_of date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; inv record; v_pct numeric; v_step int; v_ps date; v_pe date; v_due date; v_floor date;
        v_created int := 0; v_late int := 0; v_over int := 0; v_fee numeric(12,2);
begin
  select late_fee_percent into v_pct from owner_profiles where user_id = p_owner;
  v_floor := (date_trunc('month', p_as_of) - interval '12 months')::date;   -- never back-fill more than 12 months
  for a in select * from tenant_assignments where owner_id = p_owner and status = 'active' and billing_cycle in ('monthly','quarterly') loop
    v_step := case when a.billing_cycle = 'quarterly' then 3 else 1 end;
    v_ps := date_trunc('month', a.start_date)::date;
    while v_ps <= p_as_of loop
      v_pe := (v_ps + make_interval(months => v_step))::date - 1;
      if v_ps >= v_floor and v_pe >= a.start_date and (a.end_date is null or a.end_date >= v_ps) then
        v_due := greatest(v_ps + (a.rent_due_day - 1), a.start_date);
        if make_invoice(p_owner, a.id, v_ps, v_pe, v_due, a.monthly_rent * v_step,
             'Rent ' || to_char(v_ps, 'Mon YYYY') || case when v_step = 3 then ' to ' || to_char(v_pe, 'Mon YYYY') else '' end) is not null then
          v_created := v_created + 1;
        end if;
      end if;
      v_ps := (v_ps + make_interval(months => v_step))::date;
    end loop;
  end loop;

  -- Includes invoices that were created already past due (recalc_invoice marks those overdue immediately).
  for inv in select id, tenant_id, amount, invoice_number, status from rent_invoices
              where owner_id = p_owner and status in ('pending','partially_paid','overdue') and due_date < p_as_of loop
    v_fee := 0;
    if coalesce(v_pct, 0) > 0 and not exists (select 1 from rent_invoice_items where invoice_id = inv.id and item_type = 'late_fee') then
      v_fee := round(inv.amount * v_pct / 100, 2);
      if v_fee > 0 then
        insert into rent_invoice_items (invoice_id, item_type, description, amount) values (inv.id, 'late_fee', 'Late fee (' || v_pct || '%)', v_fee);
        v_late := v_late + 1;
      end if;
    end if;
    perform recalc_invoice(inv.id, p_as_of);
    -- notify only on the transition to overdue or when a late fee was just added, never on every daily run
    if inv.status <> 'overdue' or v_fee > 0 then
      perform notify_tenant(inv.tenant_id, 'overdue', 'Rent overdue', 'Invoice ' || inv.invoice_number || ' is past its due date' || case when v_fee > 0 then ' and a late fee was added.' else '.' end);
      v_over := v_over + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'late_fees_added', v_late, 'marked_overdue', v_over);
end $$;

create or replace function public.run_scheduled_billing() returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select u.id from users u join user_roles r on r.user_id = u.id and r.role = 'owner' where u.status = 'active' and u.deleted_at is null loop
    begin perform billing_run(o.id, current_date); n := n + 1;
    exception when others then raise warning 'billing_run failed for owner %: %', o.id, sqlerrm; end;   -- one owner's failure never blocks the rest
  end loop;
  return n;
end $$;

create or replace function public.deposit_refresh(p_deposit_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_recv numeric; v_out numeric; v_ref numeric; v_status text;
begin
  select coalesce(sum(amount) filter (where txn_type = 'received'), 0),
         coalesce(sum(amount) filter (where txn_type <> 'received'), 0),
         coalesce(sum(amount) filter (where txn_type = 'refund'), 0)
    into v_recv, v_out, v_ref from deposit_transactions where deposit_id = p_deposit_id;
  v_status := case when v_recv = 0 then 'pending' when v_recv - v_out = 0 then 'refunded' when v_ref > 0 then 'partially_refunded' else 'held' end;
  update security_deposits set status = v_status where id = p_deposit_id;
end $$;

revoke execute on function public.next_number(uuid, text), public.notify_tenant(uuid, text, text, text, text), public.recalc_invoice(uuid, date),
  public.apply_advance_credit(uuid), public.make_invoice(uuid, uuid, date, date, date, numeric, text), public.billing_run(uuid, date),
  public.run_scheduled_billing(), public.deposit_refresh(uuid), public.payments_after_change(), public.allocations_after_change()
  from public, anon, authenticated;

-- assign_tenant now runs with definer rights because clients can no longer insert into security_deposits.
-- Every statement stays scoped to auth.uid() and the ownership checks are unchanged.
create or replace function public.assign_tenant(
  p_tenant_id uuid, p_unit_id uuid, p_start_date date,
  p_monthly_rent numeric, p_security_deposit numeric, p_rent_due_day int,
  p_billing_cycle billing_cycle default 'monthly'
) returns uuid language plpgsql security definer set search_path = public as $$
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

-- ---------- owner-facing finance functions ----------
create or replace function public.generate_my_invoices(p_as_of date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only owners can generate invoices'; end if;
  if p_as_of > current_date + 31 then raise exception 'Choose a date no more than a month ahead'; end if;
  return billing_run(auth.uid(), p_as_of);
end $$;

-- Manual invoice, mainly for the "custom" billing cycle.
create or replace function public.create_invoice(p_assignment_id uuid, p_period_start date, p_period_end date, p_due_date date, p_amount numeric, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_owner() then raise exception 'Only owners can create invoices'; end if;
  if p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then raise exception 'Enter a valid amount (up to 2 decimals)'; end if;
  if p_period_end < p_period_start then raise exception 'The period end cannot be before its start'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Enter a description'; end if;
  v_id := make_invoice(auth.uid(), p_assignment_id, p_period_start, p_period_end, p_due_date, p_amount, left(trim(p_description), 200));
  if v_id is null then raise exception 'An invoice already exists for this tenancy and billing period'; end if;
  return v_id;
end $$;

create or replace function public.record_payment(p_invoice_id uuid, p_amount numeric, p_method payment_method, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); inv rent_invoices; v_id uuid; v_no bigint; v_bal numeric(12,2);
begin
  if not public.is_owner() then raise exception 'Only owners can record payments'; end if;
  select * into inv from rent_invoices where id = p_invoice_id and owner_id = v_owner for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status in ('waived','refunded') then raise exception 'This invoice is %, so payments cannot be recorded', inv.status; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Amounts can have at most 2 decimals'; end if;
  v_bal := inv.total_amount - inv.paid_amount;
  if p_amount > v_bal then raise exception 'The amount exceeds the outstanding balance of %. Record any extra as an advance payment.', v_bal; end if;
  if p_paid_at > now() + interval '5 minutes' then raise exception 'The payment date cannot be in the future'; end if;
  v_no := next_number(v_owner, 'receipt');
  insert into payments (owner_id, invoice_id, tenant_id, amount, method, status, paid_at, receipt_number, notes, recorded_by)
  values (v_owner, inv.id, inv.tenant_id, p_amount, p_method, 'success', p_paid_at, 'REC-' || lpad(v_no::text, 6, '0'), left(nullif(trim(p_notes), ''), 300), v_owner)
  returning id into v_id;
  perform notify_tenant(inv.tenant_id, 'payment', 'Payment received', 'We recorded a payment against invoice ' || inv.invoice_number || '.', '/tenant/payments');
  return v_id;
end $$;

create or replace function public.record_advance(p_tenant_id uuid, p_amount numeric, p_method payment_method, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); v_id uuid; v_no bigint; inv record;
begin
  if not public.is_owner() then raise exception 'Only owners can record payments'; end if;
  if not exists (select 1 from tenant_profiles where id = p_tenant_id and owner_id = v_owner and deleted_at is null) then raise exception 'Tenant not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Amounts can have at most 2 decimals'; end if;
  if p_paid_at > now() + interval '5 minutes' then raise exception 'The payment date cannot be in the future'; end if;
  v_no := next_number(v_owner, 'receipt');
  insert into payments (owner_id, invoice_id, tenant_id, amount, method, status, paid_at, receipt_number, notes, recorded_by)
  values (v_owner, null, p_tenant_id, p_amount, p_method, 'success', p_paid_at, 'REC-' || lpad(v_no::text, 6, '0'), left(nullif(trim(p_notes), ''), 300), v_owner)
  returning id into v_id;
  for inv in select id from rent_invoices where tenant_id = p_tenant_id and owner_id = v_owner and status in ('pending','partially_paid','overdue') order by due_date loop
    perform apply_advance_credit(inv.id);
  end loop;
  perform notify_tenant(p_tenant_id, 'payment', 'Advance payment received', 'We recorded an advance payment. It is applied to your rent automatically.', '/tenant/payments');
  return v_id;
end $$;

create or replace function public.refund_payment(p_payment_id uuid, p_reason text, p_cancel_invoice boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare p payments; v_paid numeric;
begin
  if not public.is_owner() then raise exception 'Only owners can refund payments'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for the refund'; end if;
  select * into p from payments where id = p_payment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status <> 'success' then raise exception 'Only successful payments can be refunded'; end if;
  if p.invoice_id is null and exists (select 1 from payment_allocations where payment_id = p.id) then
    raise exception 'This advance payment has already been applied to invoices';
  end if;
  update payments set status = 'refunded', refunded_at = now(), refund_reason = left(trim(p_reason), 300) where id = p.id;
  if p_cancel_invoice and p.invoice_id is not null then
    select paid_amount into v_paid from rent_invoices where id = p.invoice_id;
    if v_paid > 0 then raise exception 'Other payments exist on this invoice, so it cannot be cancelled'; end if;
    update rent_invoices set status = 'refunded' where id = p.invoice_id;
  end if;
  perform notify_tenant(p.tenant_id, 'payment', 'Payment refunded', 'A payment of ' || p.amount || ' was refunded.', '/tenant/payments');
end $$;

create or replace function public.waive_invoice(p_invoice_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare inv rent_invoices;
begin
  if not public.is_owner() then raise exception 'Only owners can waive invoices'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason'; end if;
  select * into inv from rent_invoices where id = p_invoice_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status in ('waived','refunded','paid') then raise exception 'A % invoice cannot be waived', inv.status; end if;
  insert into rent_invoice_items (invoice_id, item_type, description, amount) values (inv.id, 'other', 'Waived: ' || left(trim(p_reason), 180), 0);
  update rent_invoices set status = 'waived' where id = inv.id;
  perform notify_tenant(inv.tenant_id, 'invoice', 'Invoice waived', 'Invoice ' || inv.invoice_number || ' was waived by your owner.');
end $$;

create or replace function public.add_invoice_adjustment(p_invoice_id uuid, p_kind text, p_amount numeric, p_description text) returns void
language plpgsql security definer set search_path = public as $$
declare inv rent_invoices;
begin
  if not public.is_owner() then raise exception 'Only owners can adjust invoices'; end if;
  if p_kind not in ('discount','late_fee','charge') then raise exception 'Unknown adjustment type'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Enter an amount greater than zero (up to 2 decimals)'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Enter a description'; end if;
  select * into inv from rent_invoices where id = p_invoice_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status in ('waived','refunded') then raise exception 'This invoice is %, so it cannot be adjusted', inv.status; end if;
  insert into rent_invoice_items (invoice_id, item_type, description, amount)
  values (inv.id, case p_kind when 'late_fee' then 'late_fee' when 'discount' then 'adjustment' else 'other' end, left(trim(p_description), 200),
          case when p_kind = 'discount' then -p_amount else p_amount end);
  perform recalc_invoice(inv.id);
end $$;

create or replace function public.record_deposit_txn(p_deposit_id uuid, p_type deposit_txn_type, p_amount numeric, p_date date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); d security_deposits; v_recv numeric; v_out numeric; v_id uuid; v_no bigint;
begin
  if not public.is_owner() then raise exception 'Only owners can record deposit transactions'; end if;
  select * into d from security_deposits where id = p_deposit_id and owner_id = v_owner for update;
  if not found then raise exception 'Deposit not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Amounts can have at most 2 decimals'; end if;
  if p_date > current_date then raise exception 'The date cannot be in the future'; end if;
  select coalesce(sum(amount) filter (where txn_type = 'received'), 0), coalesce(sum(amount) filter (where txn_type <> 'received'), 0)
    into v_recv, v_out from deposit_transactions where deposit_id = d.id;
  if p_type = 'received' then
    if v_recv + p_amount > d.expected_amount then raise exception 'Total received would exceed the expected deposit of %', d.expected_amount; end if;
  elsif p_amount > v_recv - v_out then
    raise exception 'The amount exceeds the deposit balance of %', v_recv - v_out;
  end if;
  v_no := case when p_type in ('received','refund') then next_number(v_owner, 'receipt') end;
  insert into deposit_transactions (deposit_id, txn_type, amount, txn_date, note, receipt_number)
  values (d.id, p_type, p_amount, p_date, left(nullif(trim(p_note), ''), 300), case when v_no is not null then 'DEP-' || lpad(v_no::text, 6, '0') end)
  returning id into v_id;
  perform deposit_refresh(d.id);
  perform notify_tenant(d.tenant_id, 'deposit', 'Security deposit updated', 'A ' || p_type || ' of ' || p_amount || ' was recorded on your deposit.', '/tenant/deposit');
  return v_id;
end $$;

-- One row per deposit with computed balances; works for the owner and for the tenant (each sees only their own).
create or replace function public.deposit_overview()
returns table (deposit_id uuid, assignment_id uuid, tenant_id uuid, tenant_name text, property_name text, unit_number text,
               expected numeric, received numeric, deducted numeric, refunded numeric, held numeric, status text, tenancy_status text)
language sql stable security definer set search_path = public as $$
  select d.id, d.assignment_id, d.tenant_id, t.full_name, p.name, u.unit_number, d.expected_amount,
    coalesce(sum(x.amount) filter (where x.txn_type = 'received'), 0),
    coalesce(sum(x.amount) filter (where x.txn_type in ('deduction','damage')), 0),
    coalesce(sum(x.amount) filter (where x.txn_type = 'refund'), 0),
    coalesce(sum(x.amount) filter (where x.txn_type = 'received'), 0) - coalesce(sum(x.amount) filter (where x.txn_type <> 'received'), 0),
    d.status, a.status::text
  from security_deposits d
  join tenant_assignments a on a.id = d.assignment_id
  join tenant_profiles t on t.id = d.tenant_id
  join property_units u on u.id = a.unit_id
  join properties p on p.id = u.property_id
  left join deposit_transactions x on x.deposit_id = d.id
  where (d.owner_id = auth.uid() and public.is_owner()) or (d.tenant_id in (select public.my_tenant_ids()))
  group by d.id, d.assignment_id, d.tenant_id, t.full_name, p.name, u.unit_number, d.expected_amount, d.status, a.status
  order by max(d.created_at) desc
$$;

create or replace function public.advance_balance(p_tenant_id uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if not ((public.is_owner() and exists (select 1 from tenant_profiles where id = p_tenant_id and owner_id = auth.uid()))
          or p_tenant_id in (select public.my_tenant_ids())) then raise exception 'Not allowed'; end if;
  return coalesce((select sum(amount) from payments where tenant_id = p_tenant_id and invoice_id is null and status = 'success'), 0)
       - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where p.tenant_id = p_tenant_id), 0);
end $$;

-- ---------- receipts (owner or the paying tenant only) ----------
create or replace function public.get_receipt(p_payment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p payments; r jsonb;
begin
  select * into p from payments where id = p_payment_id;
  if not found or not ((p.owner_id = auth.uid() and public.is_owner()) or p.tenant_id in (select public.my_tenant_ids())) then
    raise exception 'Receipt not found';
  end if;
  select jsonb_build_object(
    'kind', 'rent', 'receipt_number', p.receipt_number, 'amount', p.amount, 'method', p.method, 'status', p.status,
    'paid_at', p.paid_at, 'notes', p.notes, 'refunded_at', p.refunded_at, 'refund_reason', p.refund_reason,
    'tenant_name', t.full_name, 'owner_name', coalesce(nullif(op.business_name, ''), o.full_name), 'owner_address', op.address, 'owner_phone', o.phone,
    'invoice_number', i.invoice_number, 'period_start', i.period_start, 'period_end', i.period_end,
    'property_name', pr.name, 'unit_number', u.unit_number)
  into r
  from tenant_profiles t
  join users o on o.id = p.owner_id
  left join owner_profiles op on op.user_id = p.owner_id
  left join rent_invoices i on i.id = p.invoice_id
  left join property_units u on u.id = i.unit_id
  left join properties pr on pr.id = u.property_id
  where t.id = p.tenant_id;
  return r;
end $$;

create or replace function public.get_deposit_receipt(p_txn_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare x deposit_transactions; d security_deposits; r jsonb;
begin
  select * into x from deposit_transactions where id = p_txn_id;
  if found then select * into d from security_deposits where id = x.deposit_id; end if;
  if not found or not ((d.owner_id = auth.uid() and public.is_owner()) or d.tenant_id in (select public.my_tenant_ids())) then
    raise exception 'Receipt not found';
  end if;
  select jsonb_build_object(
    'kind', 'deposit', 'receipt_number', x.receipt_number, 'txn_type', x.txn_type, 'amount', x.amount, 'paid_at', x.txn_date, 'notes', x.note,
    'tenant_name', t.full_name, 'owner_name', coalesce(nullif(op.business_name, ''), o.full_name), 'owner_address', op.address, 'owner_phone', o.phone,
    'property_name', pr.name, 'unit_number', u.unit_number)
  into r
  from tenant_profiles t
  join users o on o.id = d.owner_id
  left join owner_profiles op on op.user_id = d.owner_id
  join tenant_assignments a on a.id = d.assignment_id
  join property_units u on u.id = a.unit_id
  join properties pr on pr.id = u.property_id
  where t.id = d.tenant_id;
  return r;
end $$;

-- ---------- tenant rent summary (adds advance credit) ----------
create or replace function public.my_rent_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'outstanding', coalesce(sum(i.total_amount - i.paid_amount) filter (where i.status in ('pending','partially_paid','overdue')), 0),
    'next_due_date', min(i.due_date) filter (where i.status in ('pending','partially_paid','overdue')),
    'open_invoices', count(*) filter (where i.status in ('pending','partially_paid','overdue')),
    'credit', coalesce((select sum(p.amount) from payments p where p.tenant_id in (select public.my_tenant_ids()) and p.invoice_id is null and p.status = 'success'), 0)
            - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where p.tenant_id in (select public.my_tenant_ids())), 0))
  from rent_invoices i
  where public.has_role('tenant') and i.tenant_id in (select public.my_tenant_ids())
$$;

-- Billed chart should ignore refunded (cancelled) invoices as well as waived ones.
create or replace function public.owner_monthly_series(p_months int default 12)
returns table (month date, income numeric, expenses numeric, billed numeric)
language sql stable as $$
  select m::date,
    coalesce((select sum(p.amount) from payments p where p.owner_id = auth.uid() and p.status = 'success' and date_trunc('month', p.paid_at) = date_trunc('month', m)), 0),
    coalesce((select sum(e.amount) from expenses e where e.owner_id = auth.uid() and e.deleted_at is null and date_trunc('month', e.expense_date::timestamptz) = date_trunc('month', m)), 0),
    coalesce((select sum(i.total_amount) from rent_invoices i where i.owner_id = auth.uid() and i.status not in ('waived','refunded') and date_trunc('month', i.due_date::timestamptz) = date_trunc('month', m)), 0)
  from generate_series(date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1), date_trunc('month', now()), interval '1 month') m
  where public.is_owner()
  order by 1
$$;

-- ---------- reports (invoker functions: RLS limits every row to the calling owner) ----------
create or replace function public.report_income_expense(p_year int)
returns table (month date, income numeric, expenses numeric, net numeric)
language sql stable as $$
  select m::date, i.v, e.v, i.v - e.v
  from generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') m
  cross join lateral (select coalesce(sum(p.amount), 0) v from payments p where p.owner_id = auth.uid() and p.status = 'success' and date_trunc('month', p.paid_at) = date_trunc('month', m)) i
  cross join lateral (select coalesce(sum(x.amount), 0) v from expenses x where x.owner_id = auth.uid() and x.deleted_at is null and date_trunc('month', x.expense_date::timestamptz) = date_trunc('month', m)) e
  where public.is_owner()
  order by 1
$$;

create or replace function public.report_outstanding(p_as_of date default current_date)
returns table (invoice_id uuid, invoice_number text, tenant_name text, property_name text, unit_number text, due_date date, total numeric, paid numeric, balance numeric, days_overdue int, status text)
language sql stable as $$
  select i.id, i.invoice_number, t.full_name, p.name, u.unit_number, i.due_date, i.total_amount, i.paid_amount, i.total_amount - i.paid_amount,
         greatest(0, p_as_of - i.due_date), i.status::text
  from rent_invoices i join tenant_profiles t on t.id = i.tenant_id join property_units u on u.id = i.unit_id join properties p on p.id = u.property_id
  where i.owner_id = auth.uid() and public.is_owner() and i.status in ('pending','partially_paid','overdue') and i.total_amount - i.paid_amount > 0
  order by i.due_date, t.full_name
$$;

create or replace function public.report_late_payments(p_from date, p_to date)
returns table (invoice_number text, tenant_name text, unit_number text, due_date date, total numeric, last_paid date, days_late int, status text)
language sql stable as $$
  select i.invoice_number, t.full_name, u.unit_number, i.due_date, i.total_amount, lp.d, (coalesce(lp.d, current_date) - i.due_date)::int, i.status::text
  from rent_invoices i join tenant_profiles t on t.id = i.tenant_id join property_units u on u.id = i.unit_id
  left join lateral (select max(p.paid_at)::date d from payments p where p.invoice_id = i.id and p.status = 'success') lp on true
  where i.owner_id = auth.uid() and public.is_owner() and i.due_date between p_from and p_to and i.status not in ('waived','refunded')
    and (coalesce(lp.d, current_date) > i.due_date) and not (i.status in ('pending','partially_paid') and i.due_date >= current_date)
  order by i.due_date desc
$$;

create or replace function public.report_property_revenue(p_from date, p_to date)
returns table (property_id uuid, property_name text, total_units bigint, occupied_units bigint, income numeric, expenses numeric, net numeric)
language sql stable as $$
  select p.id, p.name,
    (select count(*) from property_units u where u.property_id = p.id and u.deleted_at is null),
    (select count(*) from property_units u where u.property_id = p.id and u.deleted_at is null and u.status = 'occupied'),
    inc.v, exp.v, inc.v - exp.v
  from properties p
  cross join lateral (select coalesce(sum(pay.amount), 0) v from payments pay join rent_invoices i on i.id = pay.invoice_id join property_units u on u.id = i.unit_id
                      where u.property_id = p.id and pay.status = 'success' and pay.paid_at::date between p_from and p_to) inc
  cross join lateral (select coalesce(sum(x.amount), 0) v from expenses x where x.property_id = p.id and x.deleted_at is null and x.expense_date between p_from and p_to) exp
  where p.owner_id = auth.uid() and public.is_owner() and p.deleted_at is null
  order by p.name
$$;

create or replace function public.report_expenses_by_category(p_from date, p_to date)
returns table (category text, entries bigint, total numeric)
language sql stable as $$
  select coalesce(c.name, 'Uncategorised'), count(*), sum(x.amount)
  from expenses x left join expense_categories c on c.id = x.category_id
  where x.owner_id = auth.uid() and public.is_owner() and x.deleted_at is null and x.expense_date between p_from and p_to
  group by 1 order by 3 desc
$$;

create or replace function public.report_vacant_units()
returns table (property_name text, unit_number text, floor_number int, bedrooms int, monthly_rent numeric, status text)
language sql stable as $$
  select p.name, u.unit_number, u.floor_number, u.bedrooms, u.monthly_rent, u.status::text
  from property_units u join properties p on p.id = u.property_id
  where u.owner_id = auth.uid() and public.is_owner() and u.deleted_at is null and p.deleted_at is null and u.status in ('available','reserved')
  order by p.name, u.unit_number
$$;

-- Month summary for the Rent Collection page (invoices due in the month of p_month).
create or replace function public.rent_month_summary(p_month date) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'invoices', count(*),
    'billed', coalesce(sum(total_amount) filter (where status not in ('waived','refunded')), 0),
    'collected', coalesce(sum(paid_amount) filter (where status not in ('waived','refunded')), 0),
    'outstanding', coalesce(sum(total_amount - paid_amount) filter (where status not in ('waived','refunded')), 0),
    'overdue', count(*) filter (where status = 'overdue'),
    'paid', count(*) filter (where status = 'paid'))
  from rent_invoices
  where owner_id = auth.uid() and public.is_owner()
    and due_date >= date_trunc('month', p_month)::date and due_date < (date_trunc('month', p_month) + interval '1 month')::date
$$;

-- ---------- storage for expense bills ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-bills', 'expense-bills', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];
create policy "owner reads own bills" on storage.objects for select using (bucket_id = 'expense-bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner uploads own bills" on storage.objects for insert with check (bucket_id = 'expense-bills' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
create policy "owner deletes own bills" on storage.objects for delete using (bucket_id = 'expense-bills' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- scheduled daily billing (needs the pg_cron extension; enable it in Supabase Dashboard > Database > Extensions) ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rentmaster-daily-billing', '30 0 * * *', 'select public.run_scheduled_billing()');
  else
    raise notice 'pg_cron is not enabled: enable it, then run: select cron.schedule(''rentmaster-daily-billing'', ''30 0 * * *'', ''select public.run_scheduled_billing()'');';
  end if;
end $$;
