-- RENTMASTER schema (Phase 1-2 complete; finance/communication tables are created now so later phases need no restructuring)
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type app_role as enum ('super_admin', 'owner', 'tenant');
create type property_type as enum ('independent_house','apartment','residential_building','villa','commercial','shop','office','other');
create type unit_status as enum ('available','occupied','reserved','under_maintenance','inactive');
create type billing_cycle as enum ('monthly','quarterly','custom');
create type invoice_status as enum ('pending','partially_paid','paid','overdue','waived','refunded');
create type payment_status as enum ('pending','success','failed','refunded');
create type payment_method as enum ('cash','upi','card','netbanking','bank_transfer','cheque','other');
create type maintenance_status as enum ('new','pending','assigned','in_progress','resolved','rejected','closed');
create type urgency_level as enum ('low','medium','high','emergency');
create type deposit_txn_type as enum ('received','deduction','damage','refund');
create type assignment_status as enum ('active','ended','transferred');

-- ---------- identity ----------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','suspended','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index users_email_key on public.users (lower(email));

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.owner_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  business_name text,
  address text,
  rent_due_day int not null default 5 check (rent_due_day between 1 and 28),
  late_fee_percent numeric(5,2) not null default 0 check (late_fee_percent >= 0),
  reminder_days_before int not null default 3 check (reminder_days_before between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,   -- a person renting from several owners has one profile per owner
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  permanent_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_url text,
  identity_status text not null default 'unverified' check (identity_status in ('unverified','pending','verified','rejected')),
  status text not null default 'active' check (status in ('invited','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tenant_profiles_owner_idx on public.tenant_profiles (owner_id) where deleted_at is null;
create unique index tenant_profiles_owner_email_key on public.tenant_profiles (owner_id, lower(email)) where email is not null and deleted_at is null;

-- ---------- properties ----------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  name text not null,
  building_name text,
  property_type property_type not null default 'apartment',
  description text,
  address_line text not null,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  floors int check (floors is null or floors >= 0),
  total_units int check (total_units is null or total_units >= 0),
  amenities text[] not null default '{}',
  photo_paths text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index properties_owner_idx on public.properties (owner_id) where deleted_at is null;

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_id uuid not null references public.users(id) on delete restrict,
  unit_number text not null,
  floor_number int not null default 0,
  bedrooms int not null default 1 check (bedrooms >= 0),
  bathrooms int not null default 1 check (bathrooms >= 0),
  area_sqft numeric(10,2) check (area_sqft is null or area_sqft > 0),
  monthly_rent numeric(12,2) not null default 0 check (monthly_rent >= 0),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  status unit_status not null default 'available',
  utility_details jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index property_units_unique_number on public.property_units (property_id, lower(unit_number)) where deleted_at is null;
create index property_units_owner_idx on public.property_units (owner_id) where deleted_at is null;
create index property_units_property_idx on public.property_units (property_id) where deleted_at is null;

create table public.tenant_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  unit_id uuid not null references public.property_units(id) on delete restrict,
  start_date date not null,
  end_date date,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  rent_due_day int not null default 5 check (rent_due_day between 1 and 28),
  billing_cycle billing_cycle not null default 'monthly',
  status assignment_status not null default 'active',
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
-- a unit can have only one active tenancy
create unique index tenant_assignments_one_active_per_unit on public.tenant_assignments (unit_id) where status = 'active';
create index tenant_assignments_owner_idx on public.tenant_assignments (owner_id);
create index tenant_assignments_tenant_idx on public.tenant_assignments (tenant_id);

create table public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  assignment_id uuid not null references public.tenant_assignments(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  unit_id uuid not null references public.property_units(id) on delete restrict,
  start_date date not null,
  expiry_date date not null,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  notice_period_days int not null default 30,
  escalation_terms text,
  status text not null default 'active' check (status in ('draft','active','expired','terminated','renewed')),
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date >= start_date)
);
create index rental_agreements_owner_idx on public.rental_agreements (owner_id);
create index rental_agreements_expiry_idx on public.rental_agreements (expiry_date);

-- ---------- finance ----------
create table public.rent_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  assignment_id uuid not null references public.tenant_assignments(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  unit_id uuid not null references public.property_units(id) on delete restrict,
  invoice_number text not null,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  late_fee numeric(12,2) not null default 0 check (late_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status invoice_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, period_start),      -- never two invoices for the same tenancy and period
  unique (owner_id, invoice_number)
);
create index rent_invoices_owner_idx on public.rent_invoices (owner_id, due_date);
create index rent_invoices_tenant_idx on public.rent_invoices (tenant_id);

create table public.rent_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.rent_invoices(id) on delete cascade,
  item_type text not null default 'rent' check (item_type in ('rent','late_fee','adjustment','other')),
  description text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  invoice_id uuid references public.rent_invoices(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method payment_method not null default 'cash',
  status payment_status not null default 'success',
  paid_at timestamptz not null default now(),
  receipt_number text,
  gateway text,
  gateway_payment_id text unique,
  notes text,
  recorded_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_owner_idx on public.payments (owner_id, paid_at);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  gateway text not null,
  gateway_order_id text,
  gateway_payment_id text,
  status text not null,
  amount numeric(12,2) not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.security_deposits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  assignment_id uuid not null unique references public.tenant_assignments(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  expected_amount numeric(12,2) not null check (expected_amount >= 0),
  status text not null default 'pending' check (status in ('pending','held','partially_refunded','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.security_deposits(id) on delete cascade,
  txn_type deposit_txn_type not null,
  amount numeric(12,2) not null check (amount > 0),
  txn_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete cascade,   -- null = system category
  name text not null,
  created_at timestamptz not null default now()
);
create unique index expense_categories_name_key on public.expense_categories (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.property_units(id) on delete set null,
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  description text,
  payment_method payment_method,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index expenses_owner_idx on public.expenses (owner_id, expense_date) where deleted_at is null;

-- ---------- maintenance ----------
create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(id) on delete restrict,
  unit_id uuid not null references public.property_units(id) on delete restrict,
  title text not null,
  category text not null default 'other',
  description text,
  urgency urgency_level not null default 'medium',
  status maintenance_status not null default 'new',
  preferred_visit_at timestamptz,
  assigned_to text,
  repair_cost numeric(12,2) check (repair_cost is null or repair_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index maintenance_owner_idx on public.maintenance_requests (owner_id, status);

create table public.maintenance_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

-- ---------- documents / communication ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.property_units(id) on delete set null,
  tenant_id uuid references public.tenant_profiles(id) on delete set null,
  doc_type text not null default 'other',
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  shared_with_tenant boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index documents_owner_idx on public.documents (owner_id) where deleted_at is null;
alter table public.rental_agreements add constraint rental_agreements_document_fk foreign key (document_id) references public.documents(id) on delete set null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid references public.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.property_units(id) on delete set null,
  subject text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_recipient_idx on public.messages (recipient_id, created_at desc);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  owner_id uuid references public.users(id) on delete cascade,     -- null = platform-wide
  property_id uuid references public.properties(id) on delete cascade,
  title text not null,
  body text not null,
  audience text not null default 'tenants' check (audience in ('tenants','owners','all')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- platform ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_monthly numeric(12,2) not null default 0 check (price_monthly >= 0),
  max_properties int,
  max_units int,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('trialing','active','past_due','cancelled')),
  current_period_end date,
  created_at timestamptz not null default now()
);

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  signature_valid boolean not null,
  status text not null default 'received' check (status in ('received','processed','failed','ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)     -- idempotency: a replayed event is never processed twice
);

insert into public.expense_categories (owner_id, name)
select null, n from unnest(array['Electricity','Water','Building maintenance','Plumbing','Electrical repairs','Painting','Cleaning','Security','Property tax','Insurance','Other']) as n;

insert into public.subscription_plans (name, price_monthly, max_properties, max_units, features) values
  ('Starter', 0, 2, 10, '["Up to 2 properties","Up to 10 units"]'),
  ('Pro', 999, 15, 150, '["Up to 15 properties","Up to 150 units","Reports export"]'),
  ('Enterprise', 4999, null, null, '["Unlimited properties","Priority support"]');
