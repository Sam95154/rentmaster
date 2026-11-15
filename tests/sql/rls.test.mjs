// Runs the real migrations in an in-process Postgres (PGlite) with a minimal Supabase shim
// (roles, auth.users, auth.uid(), storage tables) and exercises RLS + business rules.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const MIG = new URL('../../supabase/migrations/', import.meta.url).pathname
const pg = new PGlite()

const shim = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`
await pg.exec(shim)
for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_functions.sql', '0004_storage.sql', '0005_tenant_views_notifications.sql', '0006_finance.sql', '0007_payments_maintenance_documents.sql', '0008_messages_announcements_reminders.sql', '0009_admin_platform.sql', '0010_security_hardening.sql', '0011_rental_agreements.sql']) {
  const sql = readFileSync(MIG + f, 'utf8').replace(/create extension if not exists pgcrypto;/, '')
  try { await pg.exec(sql); console.log('applied', f) } catch (e) { console.log('MIGRATION FAILED', f, e.message); process.exit(2) }
}

const q = async (sql, params) => (await pg.query(sql, params)).rows
const as = async (uid) => { await pg.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`) }
const asAnon = async () => { await pg.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub','',false);`) }
const asDb = async () => { await pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`) }

let pass = 0, fail = 0
const failures = []
async function t(name, fn) {
  try { await fn(); pass++; console.log('  PASS', name) } catch (e) { fail++; failures.push(`${name}: ${e.message}`); console.log('  FAIL', name, '->', e.message) }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
const ok = (c, m) => { if (!c) throw new Error(m ?? 'assertion failed') }
async function rejects(fn, re) {
  try { await fn() } catch (e) { if (re && !re.test(e.message)) throw new Error(`wrong error: ${e.message}`); return }
  throw new Error('expected an error but the statement succeeded')
}

async function mkUser(email, name, meta = {}) {
  await asDb()
  const r = await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify({ full_name: name, ...meta })])
  return r[0].id
}

// ---------------- fixtures ----------------
const A = await mkUser('ownerA@test.com', 'Owner A')
const B = await mkUser('ownerB@test.com', 'Owner B')
const ADMIN = await mkUser('admin@test.com', 'Admin')
await q(`select public.bootstrap_super_admin('admin@test.com')`)
await q(`insert into subscription_plans (name, price_monthly, max_properties, max_units) values ('TestPro', 0, 50, 500)`)
for (const o of [A, B]) await q(`insert into subscriptions (owner_id, plan_id, status) select $1, id, 'active' from subscription_plans where name='TestPro'`, [o])
const EVIL = await mkUser('evil@test.com', 'Evil', { role: 'super_admin' })

await as(A)
const propA = (await q(`insert into properties (owner_id,name,property_type,address_line,city,state,pincode,floors,total_units,amenities) values ($1,'Green Residency','apartment','12 MG Road','Rayachoty','AP','516270',3,5,'{Lift,Parking}') returning id`, [A]))[0].id
const u101 = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit,notes) values ($1,$2,'101',0,8000,16000,'PRIVATE owner note') returning id`, [propA, A]))[0].id
const u102 = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit) values ($1,$2,'102',0,9000,18000) returning id`, [propA, A]))[0].id
const u201 = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit) values ($1,$2,'201',1,9500,19000) returning id`, [propA, A]))[0].id
const t1 = (await q(`insert into tenant_profiles (owner_id,full_name,email,phone) values ($1,'Asha Rao','t1@test.com','9515475247') returning id`, [A]))[0].id
const t2 = (await q(`insert into tenant_profiles (owner_id,full_name) values ($1,'Ravi Kumar') returning id`, [A]))[0].id
await as(B)
const propB = (await q(`insert into properties (owner_id,name,property_type,address_line,city,state,pincode) values ($1,'Blue Towers','villa','7 Park St','Kadapa','AP','516001') returning id`, [B]))[0].id
const uB1 = (await q(`insert into property_units (property_id,owner_id,unit_number,monthly_rent) values ($1,$2,'B1',5000) returning id`, [propB, B]))[0].id
const tB = (await q(`insert into tenant_profiles (owner_id,full_name,email) values ($1,'Bela Tenant','tb@test.com') returning id`, [B]))[0].id
const T1 = await mkUser('t1@test.com', 'Asha Rao')       // signs up with the email the owner used
const TB = await mkUser('tb@test.com', 'Bela Tenant')

console.log('\n== Signup and roles ==')
await t('self-registered user becomes owner with owner_profile', async () => {
  await asDb(); eq((await q(`select role from user_roles where user_id=$1`, [A])).map(r => r.role), ['owner'])
  eq((await q(`select count(*)::int c from owner_profiles where user_id=$1`, [A]))[0].c, 1)
})
await t('role in signup metadata cannot create a super admin', async () => {
  await asDb(); eq((await q(`select role from user_roles where user_id=$1`, [EVIL])).map(r => r.role), ['owner'])
})
await t('email matching an owner-created tenant record becomes tenant and links', async () => {
  await asDb(); eq((await q(`select role from user_roles where user_id=$1`, [T1])).map(r => r.role), ['tenant'])
  const r = await q(`select user_id, status from tenant_profiles where id=$1`, [t1]); eq(r[0].user_id, T1); eq(r[0].status, 'active')
})
await t('bootstrap_super_admin is not callable by clients', async () => {
  await as(A); await rejects(() => q(`select public.bootstrap_super_admin('ownerA@test.com')`), /permission denied/)
})

console.log('\n== Cross-owner isolation (RLS) ==')
await t('owner B sees none of owner A data', async () => {
  await as(B)
  for (const tbl of ['properties', 'property_units', 'tenant_profiles']) {
    const ids = (await q(`select owner_id from ${tbl}`)).map(r => r.owner_id); ok(ids.every(i => i === B), `${tbl} leaked`)
  }
})
await t('owner B cannot update or delete owner A property', async () => {
  await as(B)
  eq((await q(`update properties set name='hacked' where id=$1 returning id`, [propA])).length, 0)
  eq((await q(`delete from properties where id=$1 returning id`, [propA])).length, 0)
})
await t('owner B cannot insert a property as owner A', async () => {
  await as(B); await rejects(() => q(`insert into properties (owner_id,name,address_line,city,state,pincode) values ($1,'x','12345 road','c','s','516270')`, [A]), /row-level security/)
})
await t('owner B cannot attach a unit to owner A property', async () => {
  await as(B); await rejects(() => q(`insert into property_units (property_id,owner_id,unit_number) values ($1,$2,'X1')`, [propA, B]), /does not belong/)
})
await t('owner cannot change owner_id of an existing row', async () => {
  await as(A); await rejects(() => q(`update properties set owner_id=$1 where id=$2`, [B, propA]), /row-level security|owner_id cannot be changed/)
})
await t('owner A cannot read owner B audit rows; sees only own', async () => {
  await as(A); const r = await q(`select actor_id from audit_logs`); ok(r.every(x => x.actor_id === A), 'saw another actor')
})
await t('anonymous cannot read any table', async () => {
  await asAnon(); await rejects(() => q(`select * from properties`), /permission denied/)
  await rejects(() => q(`select name from subscription_plans`), /permission denied/)
})

console.log('\n== Unit rules ==')
await t('duplicate unit number in a property is rejected (case-insensitive)', async () => {
  await as(A); await rejects(() => q(`insert into property_units (property_id,owner_id,unit_number) values ($1,$2,'101')`, [propA, A]), /property_units_unique_number/)
})
await t('a new unit cannot start as occupied', async () => {
  await as(A); await rejects(() => q(`insert into property_units (property_id,owner_id,unit_number,status) values ($1,$2,'Z9','occupied')`, [propA, A]), /cannot start as Occupied/)
})
await t('unit cannot be set occupied without a tenant', async () => {
  await as(A); await rejects(() => q(`update property_units set status='occupied' where id=$1`, [u201]), /active tenant/)
})
await t('negative rent and bad PIN are rejected by constraints', async () => {
  await as(A)
  await rejects(() => q(`insert into property_units (property_id,owner_id,unit_number,monthly_rent) values ($1,$2,'N1',-5)`, [propA, A]), /check constraint/)
  await rejects(() => q(`insert into properties (owner_id,name,address_line,city,state,pincode) values ($1,'p','12345 road','c','s','012345')`, [A]), /check constraint/)
})

console.log('\n== Tenancy workflows ==')
let asg1
await t('assign_tenant creates tenancy, deposit record and marks unit occupied', async () => {
  await as(A)
  asg1 = (await q(`select public.assign_tenant($1,$2,'2026-11-01',8000,16000,5,'monthly') id`, [t1, u101]))[0].id
  eq((await q(`select status from property_units where id=$1`, [u101]))[0].status, 'occupied')
  const d = await q(`select expected_amount, status from security_deposits where assignment_id=$1`, [asg1]); eq(Number(d[0].expected_amount), 16000); eq(d[0].status, 'pending')
})
await t('a second active tenant on the same unit is refused', async () => {
  await as(A); await rejects(() => q(`select public.assign_tenant($1,$2,'2026-11-02',8000,0,5)`, [t2, u101]), /not available/)
})
await t('cannot assign another owner tenant or unit', async () => {
  await as(A)
  await rejects(() => q(`select public.assign_tenant($1,$2,'2026-11-02',1,0,5)`, [tB, u102]), /Tenant not found/)
  await rejects(() => q(`select public.assign_tenant($1,$2,'2026-11-02',1,0,5)`, [t2, uB1]), /Unit not found/)
})
await t('occupied unit cannot be flipped to available while tenancy is active', async () => {
  await as(A); await rejects(() => q(`update property_units set status='available' where id=$1`, [u101]), /active tenant/)
})
await t('property with active tenant cannot be archived; unit cannot be removed', async () => {
  await as(A)
  await rejects(() => q(`update properties set status='archived' where id=$1`, [propA]), /active tenants/)
  await rejects(() => q(`update property_units set deleted_at=now() where id=$1`, [u101]), /active tenant/)
})
await t('tenant with active tenancy cannot be archived', async () => {
  await as(A); await rejects(() => q(`select public.archive_tenant($1)`, [t1]), /active tenancy/)
})
await t('tenancy start notification was created for the linked tenant', async () => {
  await as(T1); const n = await q(`select title from notifications`); eq(n.length, 1); eq(n[0].title, 'Tenancy started')
})
let asg2
await t('transfer_tenant moves tenant, frees old unit, keeps one deposit', async () => {
  await as(A)
  asg2 = (await q(`select public.transfer_tenant($1,$2,'2026-12-01',9500) id`, [asg1, u201]))[0].id
  eq((await q(`select status from property_units where id=$1`, [u101]))[0].status, 'available')
  eq((await q(`select status from property_units where id=$1`, [u201]))[0].status, 'occupied')
  eq((await q(`select status from tenant_assignments where id=$1`, [asg1]))[0].status, 'transferred')
  eq((await q(`select count(*)::int c from security_deposits where tenant_id=$1`, [t1]))[0].c, 1)
})
await t('end_tenancy frees the unit and records move-out; rejects bad date', async () => {
  await as(A)
  await rejects(() => q(`select public.end_tenancy($1,'2020-01-01')`, [asg2]), /before the move-in/)
  await q(`select public.end_tenancy($1,'2026-12-31','Moved out')`, [asg2])
  eq((await q(`select status from property_units where id=$1`, [u201]))[0].status, 'available')
  eq((await q(`select status, end_reason from tenant_assignments where id=$1`, [asg2]))[0].end_reason, 'Moved out')
})
await t('after tenancy ends the tenant can be archived', async () => {
  await as(A); await q(`select public.archive_tenant($1)`, [t1]); eq((await q(`select status from tenant_profiles where id=$1`, [t1]))[0].status, 'archived')
})
await t('owner cannot relink a tenant record to another login', async () => {
  await as(A); await rejects(() => q(`update tenant_profiles set user_id=$1 where id=$2`, [EVIL, t2]), /cannot be changed directly/)
})

// re-assign t2 so tenant privacy tests have data; t1 re-activated for a live tenancy
await as(A)
await q(`update tenant_profiles set status='active' where id=$1`, [t1])
const asg3 = (await q(`select public.assign_tenant($1,$2,'2027-01-01',8000,16000,5) id`, [t1, u101]))[0].id
const asg4 = (await q(`select public.assign_tenant($1,$2,'2027-01-01',9000,18000,5) id`, [t2, u102]))[0].id

console.log('\n== Tenant privacy ==')
await t('tenant cannot read properties or units directly', async () => {
  await as(T1); eq((await q(`select id from properties`)).length, 0); eq((await q(`select id from property_units`)).length, 0)
})
await t('my_tenancies returns safe fields only (no owner notes, no settings)', async () => {
  await as(T1); const v = (await q(`select public.my_tenancies() v`))[0].v
  eq(v.length, 1); eq(v[0].unit.unit_number, '101'); eq(v[0].property.name, 'Green Residency'); eq(v[0].owner.email, 'ownerA@test.com')
  ok(!JSON.stringify(v).includes('PRIVATE'), 'owner note leaked'); ok(!('settings' in v[0].property) && !('notes' in v[0].unit), 'unsafe field present')
})
await t('tenant sees only own profile and assignment', async () => {
  await as(T1)
  eq((await q(`select id from tenant_profiles`)).map(r => r.id), [t1])
  const a = await q(`select id, tenant_id from tenant_assignments`); eq(a.length, 3, 'own history only'); ok(a.every(x => x.tenant_id === t1) && a.some(x => x.id === asg3), 'foreign assignment visible')
})
await t('tenant from another owner sees nothing of owner A', async () => {
  await as(TB); eq((await q(`select id from tenant_profiles where id=$1`, [t1])).length, 0)
  eq((await q(`select id from tenant_assignments where id=$1`, [asg3])).length, 0); eq((await q(`select public.my_tenancies() v`))[0].v.length, 0)
})
await t('tenant cannot edit identity status, tenancy terms or other rows', async () => {
  await as(T1)
  eq((await q(`update tenant_profiles set identity_status='verified' where id=$1 returning id`, [t1])).length, 0)
  eq((await q(`update tenant_assignments set monthly_rent=1 where id=$1 returning id`, [asg3])).length, 0)
  await rejects(() => q(`insert into properties (owner_id,name,address_line,city,state,pincode) values ($1,'x','12345 road','c','s','516270')`, [A]), /row-level security/)
})
await t('tenant can update only permitted profile fields via RPC', async () => {
  await as(T1); await q(`select public.update_my_tenant_profile('Mom','9876543210','Old address')`)
  const r = (await q(`select emergency_contact_name, identity_status from tenant_profiles where id=$1`, [t1]))[0]; eq(r.emergency_contact_name, 'Mom'); eq(r.identity_status, 'unverified')
})
await t('tenant cannot call owner or admin functions', async () => {
  await as(T1)
  await rejects(() => q(`select public.owner_dashboard_stats()`), /Owners only/)
  await rejects(() => q(`select public.assign_tenant($1,$2,'2027-02-01',1,0,5)`, [t2, u201]), /Only owners/)
  await rejects(() => q(`select public.admin_platform_stats()`), /Not authorised/)
})
await t('tenant can read and mark own notifications read, but not edit them', async () => {
  await as(T1)
  const total = (await q(`select id from notifications`)).length; eq(total, 3, 'one per assignment')
  eq((await q(`update notifications set read_at=now() returning id`)).length, total)
  await rejects(() => q(`update notifications set title='x'`), /permission denied/)
})
await t('tenant can message own owner but not another owner (via send_message only)', async () => {
  await as(T1)
  await q(`select public.send_message($1, 'hello')`, [A])
  await rejects(() => q(`select public.send_message($1, 'hi')`, [B]), /only message your own owner/)
  await rejects(() => q(`insert into messages (owner_id,sender_id,recipient_id,body) values ($1,$2,$1,'direct')`, [A, T1]), /permission denied/)
})
await t('tenant can raise a maintenance request for own unit only', async () => {
  await as(T1)
  await q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title) values ($1,$2,$3,'Leak')`, [A, t1, u101])
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title) values ($1,$2,$3,'Leak')`, [A, t1, u102]), /row-level security|active tenancy/)
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title,status) values ($1,$2,$3,'Leak','closed')`, [A, t1, u101]), /row-level security/)
})

console.log('\n== Dashboard numbers ==')
await t('owner_dashboard_stats matches the data', async () => {
  await as(A); const s = (await q(`select public.owner_dashboard_stats() s`))[0].s
  eq(s.total_properties, 1); eq(s.total_units, 3); eq(s.occupied_units, 2); eq(s.vacant_units, 1)
  eq(Number(s.expected_rent), 17000); eq(s.open_maintenance, 1); eq(Number(s.collected_this_month), 0)
  eq(Number(s.pending_rent) + Number(s.overdue_rent), 0)
})
await t('owner_monthly_series returns 12 months', async () => { await as(A); eq((await q(`select * from owner_monthly_series(12)`)).length, 12) })
await t('owner_property_summary counts units', async () => { await as(A); const r = (await q(`select * from owner_property_summary()`))[0]; eq([Number(r.total_units), Number(r.occupied_units)], [3, 2]) })
await t('owner B dashboard shows only B data', async () => { await as(B); const s = (await q(`select public.owner_dashboard_stats() s`))[0].s; eq([s.total_properties, s.total_units, s.occupied_units], [1, 1, 0]) })

console.log('\n== Super admin ==')
await t('admin sees platform stats and all properties', async () => {
  await as(ADMIN); const s = (await q(`select public.admin_platform_stats() s`))[0].s
  eq(s.properties, 2); ok(s.owners >= 3); eq((await q(`select id from properties`)).length, 2)
})
await t('admin cannot read tenant documents, profiles or private notes directly', async () => {
  await as(ADMIN); eq((await q(`select id from tenant_profiles`)).length, 0); eq((await q(`select id from documents`)).length, 0)
  const l = await q(`select * from admin_list_tenants()`); ok(l.length >= 2); ok(!('permanent_address' in l[0]) && !('phone' in l[0]))
})
await t('admin can read audit logs, owners cannot read others', async () => {
  await as(ADMIN); ok((await q(`select id from audit_logs`)).length > 5)
})
await t('non-admin cannot use admin functions', async () => {
  await as(A)
  await rejects(() => q(`select public.admin_platform_stats()`), /Not authorised/)
  await rejects(() => q(`select * from admin_list_owners()`), /Not authorised/)
  await rejects(() => q(`select public.admin_set_user_status($1,'suspended')`, [B]), /Not authorised/)
})
await t('admin suspends an owner; suspended owner loses owner privileges', async () => {
  await as(ADMIN); await q(`select public.admin_set_user_status($1,'suspended')`, [B])
  await as(B); await rejects(() => q(`select public.owner_dashboard_stats()`), /Owners only/)
  eq((await q(`select id from properties`)).length, 0)
  await as(ADMIN); await q(`select public.admin_set_user_status($1,'active')`, [B])
  await as(B); eq((await q(`select id from properties`)).length, 1)
})
await t('admin cannot suspend self or another admin', async () => {
  await as(ADMIN); await rejects(() => q(`select public.admin_set_user_status($1,'suspended')`, [ADMIN]), /yourself|own status|Admin accounts/)
})

console.log('\n== Finance (Phase 3) ==')
await asDb()
const today = (await q(`select current_date::text d`))[0].d
const startFin = (await q(`select (date_trunc('month', current_date) - interval '2 months')::date::text d`))[0].d
const nextMonth1 = (await q(`select (date_trunc('month', current_date) + interval '1 month')::date::text d`))[0].d
await as(A)
const uF = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit) values ($1,$2,'F1',2,10000,20000) returning id`, [propA, A]))[0].id
const tF = (await q(`insert into tenant_profiles (owner_id,full_name,email) values ($1,'Fin Tenant','fin@test.com') returning id`, [A]))[0].id
const FT = await mkUser('fin@test.com', 'Fin Tenant')
await as(A)
await q(`update owner_profiles set late_fee_percent=5 where user_id=$1`, [A])
const asgF = (await q(`select public.assign_tenant($1,$2,$3,10000,20000,1,'monthly') id`, [tF, uF, startFin]))[0].id
let invs = []
const loadInvs = async () => { await as(A); invs = await q(`select id, invoice_number, status, amount, late_fee, discount, total_amount, paid_amount, due_date::text due from rent_invoices where assignment_id=$1 order by period_start`, [asgF]) }
const pay = (inv, amt, m = 'cash', when = 'now()') => q(`select public.record_payment($1,$2,$3,${when},'test') id`, [inv, amt, m])

await t('generate_my_invoices back-fills tenancy periods once; re-run creates none', async () => {
  const r1 = (await q(`select public.generate_my_invoices() r`))[0].r; eq(r1.created, 3)
  const r2 = (await q(`select public.generate_my_invoices() r`))[0].r; eq(r2.created, 0)
  await loadInvs(); eq(invs.length, 3); eq(invs.map(i => i.invoice_number), ['INV-000001', 'INV-000002', 'INV-000003'])
})
await t('late fee (5%) added once, only to invoices past due; totals derived by the database', async () => {
  await loadInvs()
  const past = invs.filter(i => i.due < today)
  eq(past.every(i => i.status === 'overdue' && Number(i.late_fee) === 500 && Number(i.total_amount) === 10500), true, 'overdue invoices')
  eq(invs.filter(i => i.due >= today).every(i => Number(i.late_fee) === 0), true, 'not-yet-due invoices')
  const n = (await q(`select count(*)::int c from rent_invoice_items where item_type='late_fee' and invoice_id = any($1)`, [invs.map(i => i.id)]))[0].c; eq(n, past.length)
  ok(invs.every(i => Number(i.total_amount) === Number(i.amount) + Number(i.late_fee) - Number(i.discount)), 'total formula')
})
await t('manual duplicate for the same tenancy and period is rejected', async () => {
  await as(A); await rejects(() => q(`select public.create_invoice($1,$2,'2030-01-31',$3,5,'dup')`, [asgF, invs[0].due.slice(0, 7) + '-01', today]), /already exists/)
})
await t('tenant was notified of new invoices', async () => {
  await as(FT); ok((await q(`select id from notifications where type='invoice'`)).length >= 3)
})

let P1, P2
await t('partial payment updates paid amount; status stays overdue; receipt number issued', async () => {
  await as(A); P1 = (await pay(invs[0].id, 4000))[0].id; await loadInvs()
  eq(Number(invs[0].paid_amount), 4000); ok(['overdue', 'partially_paid'].includes(invs[0].status))
  eq((await q(`select receipt_number r from payments where id=$1`, [P1]))[0].r, 'REC-000001')
})
await t('overpayment, zero, negative and future-dated payments are rejected', async () => {
  await as(A)
  await rejects(() => pay(invs[0].id, 99999), /exceeds the outstanding balance/)
  await rejects(() => pay(invs[0].id, 0), /greater than zero/)
  await rejects(() => pay(invs[0].id, -5), /greater than zero/)
  await rejects(() => pay(invs[0].id, 10, 'cash', `now() + interval '2 days'`), /future/)
  await rejects(() => pay(invs[0].id, 10.555), /2 decimals/)
})
await t('paying the balance marks the invoice paid; further payment refused', async () => {
  await as(A); P2 = (await pay(invs[0].id, 6500, 'upi'))[0].id; await loadInvs()
  eq(invs[0].status, 'paid'); eq(Number(invs[0].paid_amount), 10500)
  await rejects(() => pay(invs[0].id, 1), /exceeds the outstanding balance/)
})
let P3, P4
await t('adjustments: discount recalculates total; cannot push total below paid or below zero', async () => {
  await as(A); P3 = (await pay(invs[1].id, 2000))[0].id
  await rejects(() => q(`select public.add_invoice_adjustment($1,'discount',9000,'too big')`, [invs[1].id]), /would exceed the invoice total/)
  await rejects(() => q(`select public.add_invoice_adjustment($1,'discount',99999,'too big')`, [invs[1].id]), /Discounts cannot exceed|would exceed/)
  await q(`select public.add_invoice_adjustment($1,'discount',500,'Goodwill')`, [invs[1].id]); await loadInvs()
  eq(Number(invs[1].total_amount), 10000); eq(Number(invs[1].discount), 500)
  await rejects(() => q(`select public.add_invoice_adjustment($1,'bogus',5,'x')`, [invs[1].id]), /Unknown adjustment/)
})
await t('refund restores the balance and recalculates status; double refund refused; reason required', async () => {
  await as(A); P4 = (await pay(invs[1].id, 500))[0].id
  await rejects(() => q(`select public.refund_payment($1,'')`, [P1]), /reason/)
  await q(`select public.refund_payment($1,'Cheque bounced')`, [P1]); await loadInvs()
  eq(Number(invs[0].paid_amount), 6500); eq(invs[0].status, 'overdue')
  await rejects(() => q(`select public.refund_payment($1,'again')`, [P1]), /Only successful/)
  eq((await q(`select status from payments where id=$1`, [P1]))[0].status, 'refunded')
})
await t('cancel-on-refund blocked when other payments exist (and nothing changes)', async () => {
  await as(A); await rejects(() => q(`select public.refund_payment($1,'dup',true)`, [P3]), /Other payments exist/)
  eq((await q(`select status from payments where id=$1`, [P3]))[0].status, 'success')
})
await t('refund with cancel closes the invoice as refunded and blocks new payments/adjustments', async () => {
  await as(A); const p5 = (await pay(invs[2].id, 1000))[0].id
  await q(`select public.refund_payment($1,'Paid by mistake',true)`, [p5]); await loadInvs()
  eq(invs[2].status, 'refunded')
  await rejects(() => pay(invs[2].id, 10), /refunded/)
  await rejects(() => q(`select public.add_invoice_adjustment($1,'charge',5,'x')`, [invs[2].id]), /refunded/)
})
let invManual
await t('manual (custom-cycle) invoice, then waive: excluded from balances, blocks payment', async () => {
  await as(A)
  invManual = (await q(`select public.create_invoice($1,$2,$2::date + 5,$2::date + 10,5000,'Repair charge') id`, [asgF, today]))[0].id
  await q(`select public.waive_invoice($1,'Owner goodwill')`, [invManual])
  eq((await q(`select status from rent_invoices where id=$1`, [invManual]))[0].status, 'waived')
  await rejects(() => pay(invManual, 100), /waived/)
  await rejects(() => q(`select public.waive_invoice($1,'again')`, [invManual]), /cannot be waived/)
})
await t('advance payment auto-applies to oldest open invoices; credit tracked; allocated advance cannot be refunded', async () => {
  await as(A)
  const adv = (await q(`select public.record_advance($1,20000,'bank_transfer') id`, [tF]))[0].id; await loadInvs()
  eq([invs[0].status, invs[1].status], ['paid', 'paid'])
  eq(Number((await q(`select sum(amount) s from payment_allocations where payment_id=$1`, [adv]))[0].s), 11500)
  eq(Number((await q(`select public.advance_balance($1) b`, [tF]))[0].b), 8500)
  await rejects(() => q(`select public.refund_payment($1,'oops')`, [adv]), /already been applied/)
})
await t('an unapplied advance can be refunded and credit drops', async () => {
  await as(A); const a2 = (await q(`select public.record_advance($1,1000,'cash') id`, [tF]))[0].id
  eq(Number((await q(`select public.advance_balance($1) b`, [tF]))[0].b), 9500)
  await q(`select public.refund_payment($1,'Returned')`, [a2]); eq(Number((await q(`select public.advance_balance($1) b`, [tF]))[0].b), 8500)
})
await t('next-period invoice picks up remaining advance credit automatically', async () => {
  await as(A); const r = (await q(`select public.generate_my_invoices($1::date) r`, [nextMonth1]))[0].r; eq(r.created, 1)
  const n = (await q(`select total_amount, paid_amount, status from rent_invoices where assignment_id=$1 and period_start=$2`, [asgF, nextMonth1]))[0]
  eq([Number(n.total_amount), Number(n.paid_amount), n.status], [10000, 8500, 'partially_paid'])
  eq(Number((await q(`select public.advance_balance($1) b`, [tF]))[0].b), 0)
})
await t('rent_month_summary matches the invoice ledger for the month', async () => {
  await as(A); const m = (await q(`select public.rent_month_summary(current_date) s`))[0].s
  await asDb()
  const raw = (await q(`select coalesce(sum(total_amount),0) b, coalesce(sum(paid_amount),0) c, count(*)::int n from rent_invoices where owner_id=$1 and status not in ('waived','refunded') and date_trunc('month', due_date)=date_trunc('month', current_date)`, [A]))[0]
  eq([Number(m.billed), Number(m.collected), Number(m.outstanding)], [Number(raw.b), Number(raw.c), Number(raw.b) - Number(raw.c)])
  await as(B); eq((await q(`select public.rent_month_summary(current_date) s`))[0].s.invoices, 0)
})
await t('receipts: owner and the paying tenant only', async () => {
  await as(A); const r = (await q(`select public.get_receipt($1) r`, [P2]))[0].r
  eq([r.receipt_number, r.invoice_number, r.unit_number, r.tenant_name], ['REC-000002', invs[0].invoice_number, 'F1', 'Fin Tenant']); eq(r.property_name, 'Green Residency')
  await as(FT); eq((await q(`select public.get_receipt($1) r`, [P2]))[0].r.amount, 6500)
  await as(T1); await rejects(() => q(`select public.get_receipt($1)`, [P2]), /Receipt not found/)
  await as(B); await rejects(() => q(`select public.get_receipt($1)`, [P2]), /Receipt not found/)
})
await t('tenant sees own invoices/payments only; other tenant sees none', async () => {
  await as(FT); eq((await q(`select id from rent_invoices`)).length >= 4, true); ok((await q(`select tenant_id from payments`)).every(r => r.tenant_id === tF))
  ok((await q(`select id from rent_invoice_items`)).length >= 4)
  await as(T1); eq((await q(`select id from rent_invoices`)).length, 0); eq((await q(`select id from payments`)).length, 0)
})
await t('clients cannot write money tables or counters directly', async () => {
  await as(A)
  await rejects(() => q(`insert into payments (owner_id,tenant_id,amount) values ($1,$2,5)`, [A, tF]), /permission denied/)
  await rejects(() => q(`update rent_invoices set status='paid', paid_amount=99999 where id=$1`, [invs[1].id]), /permission denied/)
  await rejects(() => q(`update payments set amount=1 where id=$1`, [P2]), /permission denied/)
  await rejects(() => q(`delete from payments where id=$1`, [P2]), /permission denied/)
  await rejects(() => q(`update owner_profiles set next_invoice_no=1 where user_id=$1`, [A]), /permission denied/)
  await rejects(() => q(`insert into deposit_transactions (deposit_id,txn_type,amount) values (gen_random_uuid(),'received',1)`), /permission denied/)
})
await t('tenants and other owners cannot use owner finance functions', async () => {
  await as(FT); await rejects(() => pay(invs[1].id, 1), /Only owners/)
  await as(B)
  await rejects(() => pay(invs[1].id, 1), /Invoice not found/)
  await rejects(() => q(`select public.record_advance($1,5,'cash')`, [tF]), /Tenant not found/)
  await rejects(() => q(`select public.refund_payment($1,'x')`, [P2]), /Payment not found/)
  await rejects(() => q(`select public.add_invoice_adjustment($1,'discount',1,'x')`, [invs[1].id]), /Invoice not found/)
  await rejects(() => q(`select public.waive_invoice($1,'x')`, [invs[1].id]), /Invoice not found/)
  await rejects(() => q(`select public.create_invoice($1,'2030-01-01','2030-01-31','2030-01-05',5,'x')`, [asgF]), /Tenancy not found/)
})
await t('scheduled billing is not callable by clients; is idempotent when run by the database', async () => {
  await as(A); await rejects(() => q(`select public.run_scheduled_billing()`), /permission denied/)
  await asDb(); const before = (await q(`select count(*)::int c from rent_invoices`))[0].c
  ok((await q(`select public.run_scheduled_billing() n`))[0].n >= 2); eq((await q(`select count(*)::int c from rent_invoices`))[0].c, before)
})

console.log('\n== Security deposits ==')
let dep
await t('deposit ledger: received / damage / refund with balance and status transitions', async () => {
  await as(A); dep = (await q(`select deposit_id, expected, held, status from deposit_overview() where tenant_name='Fin Tenant'`))[0]
  eq([Number(dep.expected), Number(dep.held), dep.status], [20000, 0, 'pending'])
  await q(`select public.record_deposit_txn($1,'received',15000)`, [dep.deposit_id])
  await rejects(() => q(`select public.record_deposit_txn($1,'received',6000)`, [dep.deposit_id]), /exceed the expected deposit/)
  await q(`select public.record_deposit_txn($1,'damage',2000,current_date,'Wall repair')`, [dep.deposit_id])
  await rejects(() => q(`select public.record_deposit_txn($1,'refund',20000)`, [dep.deposit_id]), /exceeds the deposit balance/)
  let o = (await q(`select held, status from deposit_overview() where tenant_name='Fin Tenant'`))[0]; eq([Number(o.held), o.status], [13000, 'held'])
  await q(`select public.record_deposit_txn($1,'received',5000)`, [dep.deposit_id])
  await q(`select public.record_deposit_txn($1,'refund',5000)`, [dep.deposit_id])
  o = (await q(`select held, status from deposit_overview() where tenant_name='Fin Tenant'`))[0]; eq([Number(o.held), o.status], [13000, 'partially_refunded'])
  eq(Number((await q(`select public.owner_dashboard_stats() s`))[0].s.deposits_held), 13000, 'dashboard deposits_held')
  await q(`select public.record_deposit_txn($1,'refund',13000)`, [dep.deposit_id])
  o = (await q(`select held, status from deposit_overview() where tenant_name='Fin Tenant'`))[0]; eq([Number(o.held), o.status], [0, 'refunded'])
  await rejects(() => q(`select public.record_deposit_txn($1,'refund',1)`, [dep.deposit_id]), /exceeds the deposit balance/)
})
await t('deposits are never counted as rent income', async () => {
  await asDb(); const cash = Number((await q(`select coalesce(sum(amount),0) s from payments where owner_id=$1 and status='success' and date_trunc('month',paid_at)=date_trunc('month',now())`, [A]))[0].s)
  await as(A); const s = (await q(`select public.owner_dashboard_stats() s`))[0].s; eq(Number(s.collected_this_month), cash)
})
await t('settled deposit holds nothing; further receipts beyond expected are refused', async () => {
  await as(A); eq(Number((await q(`select public.owner_dashboard_stats() s`))[0].s.deposits_held), 0)
  await rejects(() => q(`select public.record_deposit_txn($1,'received',1)`, [dep.deposit_id]), /exceed the expected deposit/)
})
await t('tenant sees only own deposit and its receipts; others cannot', async () => {
  await as(FT); const o = await q(`select tenant_name, held, status from deposit_overview()`); eq(o.length, 1); eq([Number(o[0].held), o[0].status], [0, 'refunded'])
  const txn = (await q(`select id from deposit_transactions where txn_type='received' limit 1`))[0].id
  eq((await q(`select public.get_deposit_receipt($1) r`, [txn]))[0].r.kind, 'deposit')
  await as(T1); await rejects(() => q(`select public.get_deposit_receipt($1)`, [txn]), /Receipt not found/)
  await as(B); await rejects(() => q(`select public.record_deposit_txn($1,'received',1)`, [dep.deposit_id]), /Deposit not found/)
  await as(FT); await rejects(() => q(`select public.record_deposit_txn($1,'received',1)`, [dep.deposit_id]), /Only owners/)
})

console.log('\n== Expenses and reports ==')
await t('expenses: owner CRUD, validated amounts, no cross-owner property', async () => {
  await as(A)
  const cat = (await q(`select id from expense_categories where owner_id is null and name='Plumbing'`))[0].id
  await q(`insert into expenses (owner_id,property_id,category_id,amount,expense_date,description,payment_method) values ($1,$2,$3,1500,current_date,'Tap repair','cash')`, [A, propA, cat])
  await rejects(() => q(`insert into expenses (owner_id,property_id,amount) values ($1,$2,0)`, [A, propA]), /check constraint/)
  await as(B); await rejects(() => q(`insert into expenses (owner_id,property_id,amount) values ($1,$2,10)`, [B, propA]), /does not belong/)
  eq((await q(`select id from expenses`)).length, 0)
})
await t('report_income_expense matches raw ledgers for the year', async () => {
  await as(A); const yr = Number(today.slice(0, 4)); const rows = await q(`select * from report_income_expense($1)`, [yr]); eq(rows.length, 12)
  const inc = rows.reduce((a, r) => a + Number(r.income), 0), exp = rows.reduce((a, r) => a + Number(r.expenses), 0)
  await asDb(); const raw = Number((await q(`select coalesce(sum(amount),0) s from payments where owner_id=$1 and status='success' and extract(year from paid_at)=$2`, [A, yr]))[0].s)
  eq(inc, raw); eq(exp, 1500)
})
await t('report_outstanding total equals dashboard pending + overdue; waived/refunded excluded', async () => {
  await as(A); const s = (await q(`select public.owner_dashboard_stats() s`))[0].s
  const rows = await q(`select * from report_outstanding()`); const sum = rows.reduce((a, r) => a + Number(r.balance), 0)
  eq(sum, Number(s.pending_rent) + Number(s.overdue_rent)); ok(rows.every(r => !['waived', 'refunded', 'paid'].includes(r.status)))
})
await t('other reports return scoped data', async () => {
  await as(A)
  const cats = await q(`select * from report_expenses_by_category(current_date - 30, current_date)`); eq([cats[0].category, Number(cats[0].total)], ['Plumbing', 1500])
  const pr = (await q(`select * from report_property_revenue(current_date - 400, current_date)`))[0]; eq(pr.property_name, 'Green Residency'); ok(Number(pr.income) > 0)
  ok((await q(`select * from report_vacant_units()`)).every(r => ['available', 'reserved'].includes(r.status)))
  const late = await q(`select * from report_late_payments(current_date - 400, current_date)`); ok(late.length >= 1 && late.every(r => r.days_late > 0))
  await as(B); eq((await q(`select * from report_property_revenue(current_date - 400, current_date)`)).every(r => r.property_name === 'Blue Towers'), true)
  await as(FT); eq((await q(`select * from report_vacant_units()`)).length, 0)
})
await t('admin platform total_collected equals sum of successful payments', async () => {
  await as(ADMIN); const s = (await q(`select public.admin_platform_stats() s`))[0].s
  await asDb(); eq(Number(s.total_collected), Number((await q(`select coalesce(sum(amount),0) s from payments where status='success'`))[0].s))
})

console.log('\n== Online payment (Razorpay) ==')
const asSvc = async () => { await pg.exec(`reset role; set role service_role; select set_config('request.jwt.claim.sub','',false);`) }
const tP = (await q(`insert into tenant_profiles (owner_id,full_name,email) values ($1,'Pay Tenant','pay@test.com') returning id`, [A]))[0].id
const PT = await mkUser('pay@test.com', 'Pay Tenant')
const uP = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit) values ($1,$2,'P1',1,5000,0) returning id`, [propA, A]))[0].id
await as(A)
const asgP = (await q(`select public.assign_tenant($1,$2,current_date - 40,5000,0,1,'monthly') id`, [tP, uP]))[0].id
const invP = (await q(`select public.create_invoice($1, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, current_date + 5, 5000, 'Test rent') id`, [asgP]))[0].id
const evt = (id, type, order, pid, paise, extra = {}) => JSON.stringify({ id, event: type, payload: { payment: { entity: { id: pid, order_id: order, amount: paise, currency: 'INR', method: 'upi', ...extra } } } })
const fire = async (id, type, order, pid, paise, extra) => { await asSvc(); const r = (await q(`select public.process_razorpay_event($1,$2,$3::jsonb) r`, [id, type, evt(id, type, order, pid, paise, extra)]))[0].r; return r }
const newOrder = async (gwId) => {
  await as(PT); const o = (await q(`select public.prepare_online_payment($1) o`, [invP]))[0].o
  await asSvc(); await q(`select public.attach_gateway_order($1,$2)`, [o.order_id, gwId]); return o
}

await t('online payment is refused until the owner opts in', async () => {
  await as(PT); await rejects(() => q(`select public.prepare_online_payment($1)`, [invP]), /not enabled online payments/)
  await as(PT); await rejects(() => q(`update owner_profiles set online_payments_enabled = true`), /permission denied|0 rows|row-level/).catch(() => {})
  await asDb(); eq((await q(`select online_payments_enabled e from owner_profiles where user_id=$1`, [A]))[0].e, false)
  await as(A); await q(`update owner_profiles set online_payments_enabled = true where user_id=$1`, [A])
})
await t('tenant prepares an order for the server-computed balance; others cannot', async () => {
  await as(PT); const o = (await q(`select public.prepare_online_payment($1) o`, [invP]))[0].o
  eq(Number(o.amount), 5000); eq(o.currency, 'INR')
  await as(T1); await rejects(() => q(`select public.prepare_online_payment($1)`, [invP]), /Invoice not found/)
  await as(A); await rejects(() => q(`select public.prepare_online_payment($1)`, [invP]), /Invoice not found/)
  await asAnon(); await rejects(() => q(`select public.prepare_online_payment($1)`, [invP]), /permission denied/)
  await asDb(); eq((await q(`select count(*)::int n from payment_orders where invoice_id=$1 and status='created'`, [invP]))[0].n, 1, 'earlier open order expires when a new one is made')
})
await t('only the service role can attach orders or process webhooks', async () => {
  for (const u of [PT, A, T1]) {
    await as(u)
    await rejects(() => q(`select public.process_razorpay_event('e1','payment.captured','{}'::jsonb)`), /permission denied/)
    await rejects(() => q(`select public.attach_gateway_order(gen_random_uuid(),'x')`), /permission denied/)
  }
  await asAnon(); await rejects(() => q(`select public.process_razorpay_event('e1','payment.captured','{}'::jsonb)`), /permission denied/)
})
await t('clients cannot write payment_orders or webhook events directly', async () => {
  await as(PT)
  await rejects(() => q(`insert into payment_orders (owner_id,tenant_id,invoice_id,amount) values ($1,$2,$3,1)`, [A, tP, invP]), /permission denied/)
  await rejects(() => q(`update payment_orders set status='paid'`), /permission denied/)
  await rejects(() => q(`insert into payment_webhook_events (provider,event_id,payload,signature_valid) values ('razorpay','x','{}',true)`), /permission denied/)
})
await t('tenant sees own orders only; owner sees orders for own tenants; other owner sees none', async () => {
  await as(PT); ok((await q(`select * from payment_orders`)).length >= 1)
  await as(T1); eq((await q(`select * from payment_orders`)).length, 0)
  await as(B); eq((await q(`select * from payment_orders`)).length, 0)
  await as(A); ok((await q(`select * from payment_orders`)).length >= 1)
})
await t('verified payment.captured marks the invoice paid, once', async () => {
  const o = await newOrder('order_OK1')
  eq(await fire('evt_ok1', 'payment.captured', 'order_OK1', 'pay_OK1', 500000), 'processed')
  await asDb()
  const inv = (await q(`select status, paid_amount from rent_invoices where id=$1`, [invP]))[0]
  eq([inv.status, Number(inv.paid_amount)], ['paid', 5000])
  const p = (await q(`select method, gateway, gateway_payment_id, receipt_number, status from payments where invoice_id=$1`, [invP]))[0]
  eq([p.method, p.gateway, p.gateway_payment_id, p.status], ['upi', 'razorpay', 'pay_OK1', 'success']); ok(/^REC-/.test(p.receipt_number))
  eq((await q(`select status from payment_orders where id=$1`, [o.order_id]))[0].status, 'paid')
  eq((await q(`select count(*)::int n from payment_transactions where gateway_payment_id='pay_OK1'`))[0].n, 1)
  ok((await q(`select 1 from notifications where user_id=$1 and title='Payment received'`, [PT])).length >= 1)
  ok((await q(`select 1 from notifications where user_id=$1 and title='Online rent payment received'`, [A])).length >= 1)
})
await t('replayed events and re-sent payments are not applied twice', async () => {
  eq(await fire('evt_ok1', 'payment.captured', 'order_OK1', 'pay_OK1', 500000), 'duplicate')
  eq(await fire('evt_ok1_again', 'payment.captured', 'order_OK1', 'pay_OK1', 500000), 'duplicate')
  await asDb(); eq((await q(`select count(*)::int n from payments where gateway_payment_id like 'pay_OK1%'`))[0].n, 1)
  eq(Number((await q(`select paid_amount p from rent_invoices where id=$1`, [invP]))[0].p), 5000)
})
// A second open invoice for further scenarios
await as(A)
const invP2 = (await q(`select public.create_invoice($1, (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) + interval '2 month - 1 day')::date, current_date + 40, 3000, 'Next') id`, [asgP]))[0].id
const order2 = async (gw) => { await as(PT); const o = (await q(`select public.prepare_online_payment($1) o`, [invP2]))[0].o; await asSvc(); await q(`select public.attach_gateway_order($1,$2)`, [o.order_id, gw]); return o }
await t('amount mismatch, unknown order, non-INR and malformed events never credit rent', async () => {
  await order2('order_MM')
  eq(await fire('evt_mm', 'payment.captured', 'order_MM', 'pay_MM', 100), 'failed')
  eq(await fire('evt_unk', 'payment.captured', 'order_NOPE', 'pay_UNK', 300000), 'ignored')
  eq(await fire('evt_usd', 'payment.captured', 'order_MM', 'pay_USD', 300000, { currency: 'USD' }), 'failed')
  eq(await fire('evt_bad', 'payment.captured', null, null, 300000), 'failed')
  await asDb()
  eq(Number((await q(`select paid_amount p from rent_invoices where id=$1`, [invP2]))[0].p), 0)
  eq((await q(`select status from payment_webhook_events where event_id='evt_mm'`))[0].status, 'failed')
  ok(/manual reconciliation/.test((await q(`select error from payment_webhook_events where event_id='evt_mm'`))[0].error))
})
await t('payment.failed marks the order failed and credits nothing; other events are ignored', async () => {
  await order2('order_F1')
  eq(await fire('evt_f1', 'payment.failed', 'order_F1', 'pay_F1', 300000, { error_description: 'Card declined' }), 'processed')
  await asDb(); const o = (await q(`select status, failure_reason from payment_orders where gateway_order_id='order_F1'`))[0]; eq([o.status, o.failure_reason], ['failed', 'Card declined'])
  eq(Number((await q(`select paid_amount p from rent_invoices where id=$1`, [invP2]))[0].p), 0)
  eq(await fire('evt_x', 'refund.created', 'order_F1', 'pay_F1', 300000), 'ignored')
})
await t('if the owner recorded cash meanwhile, the online money is kept as advance credit', async () => {
  await order2('order_RACE')
  await as(A); await q(`select public.record_payment($1, 3000, 'cash')`, [invP2])
  eq(await fire('evt_race', 'payment.captured', 'order_RACE', 'pay_RACE', 300000), 'processed')
  await asDb()
  const inv = (await q(`select status, paid_amount from rent_invoices where id=$1`, [invP2]))[0]; eq([inv.status, Number(inv.paid_amount)], ['paid', 3000])
  await as(PT); eq(Number((await q(`select public.advance_balance($1) b`, [tP]))[0].b), 3000)
})
await t('webhook events are readable by admin only', async () => {
  await as(ADMIN); ok((await q(`select * from payment_webhook_events`)).length >= 4)
  await as(A); eq((await q(`select * from payment_webhook_events`)).length, 0)
  await as(PT); eq((await q(`select * from payment_webhook_events`)).length, 0)
})
await t('payment attempts are rate limited', async () => {
  await as(A); const inv3 = (await q(`select public.create_invoice($1, (date_trunc('month', current_date) + interval '2 month')::date, (date_trunc('month', current_date) + interval '3 month - 1 day')::date, current_date + 70, 9000, 'RL') id`, [asgP]))[0].id
  await as(PT)
  let blocked = false
  let last = ''
  for (let i = 0; i < 8; i++) { try { await q(`select public.prepare_online_payment($1)`, [inv3]) } catch (e) { last = e.message; if (/Too many payment attempts/.test(e.message)) { blocked = true; break } } }
  ok(blocked, 'rate limit never triggered; last error: ' + last)
})

console.log('\n== Maintenance (Phase 4) ==')
let reqP
await t('tenant raises a request; owner is notified; cannot set cost/assignee/closed on create', async () => {
  await as(PT)
  reqP = (await q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title,category,urgency) values ($1,$2,$3,'  Leaking tap ','plumbing','high') returning id, title`, [A, tP, uP]))[0]
  eq(reqP.title, 'Leaking tap')
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title,repair_cost) values ($1,$2,$3,'Cost trick',1)`, [A, tP, uP]), /row-level security/)
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title,assigned_to) values ($1,$2,$3,'Assign trick','x')`, [A, tP, uP]), /row-level security/)
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title) values ($1,$2,$3,'x')`, [A, tP, uP]), /short title|row-level/)
  await asDb(); ok((await q(`select 1 from notifications where user_id=$1 and title='New maintenance request'`, [A])).length >= 1)
})
await t('a tenant cannot raise a request on another tenant\'s unit or as another owner', async () => {
  await as(PT)
  await rejects(() => q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title) values ($1,$2,$3,'Not mine')`, [A, tP, u101]), /row-level security|active tenancy/)
  // owner_id is derived from the tenant record: naming another owner cannot divert the request
  const diverted = (await q(`insert into maintenance_requests (owner_id,tenant_id,unit_id,title) values ($1,$2,$3,'Diversion attempt') returning owner_id`, [B, tP, uP]))[0]
  eq(diverted.owner_id, A)
  await as(B); eq((await q(`select * from maintenance_requests where title='Diversion attempt'`)).length, 0)
  await as(PT)
  const noOwner = (await q(`insert into maintenance_requests (tenant_id,unit_id,title) values ($1,$2,'No owner given') returning owner_id`, [tP, uP]))[0]; eq(noOwner.owner_id, A)
})
await t('tenant cannot edit a request; owner updates status, cost and assignee', async () => {
  await as(PT); eq((await q(`update maintenance_requests set status='resolved', repair_cost=0 where id=$1 returning id`, [reqP.id])).length, 0)
  await as(A)
  await q(`update maintenance_requests set status='assigned', assigned_to='Ramesh (plumber)' where id=$1`, [reqP.id])
  await q(`update maintenance_requests set status='resolved', repair_cost=450 where id=$1`, [reqP.id])
  const r = (await q(`select status, closed_at, repair_cost from maintenance_requests where id=$1`, [reqP.id]))[0]
  eq(r.status, 'resolved'); ok(r.closed_at !== null); eq(Number(r.repair_cost), 450)
  await q(`update maintenance_requests set status='in_progress' where id=$1`, [reqP.id])
  eq((await q(`select closed_at from maintenance_requests where id=$1`, [reqP.id]))[0].closed_at, null, 'reopening clears closed_at')
  await rejects(() => q(`update maintenance_requests set tenant_id=$1 where id=$2`, [tF, reqP.id]), /cannot be changed/)
  await asDb(); ok((await q(`select 1 from notifications where user_id=$1 and title='Maintenance update'`, [PT])).length >= 2)
})
await t('comments: both parties can post as themselves, not as someone else, and the other is notified', async () => {
  await as(PT); await q(`insert into maintenance_comments (request_id,author_id,body) values ($1,$2,'Still leaking')`, [reqP.id, PT])
  await rejects(() => q(`insert into maintenance_comments (request_id,author_id,body) values ($1,$2,'Impersonation')`, [reqP.id, A]), /row-level security/)
  await rejects(() => q(`insert into maintenance_comments (request_id,author_id,body) values ($1,$2,'   ')`, [reqP.id, PT]), /check constraint/)
  await as(A); await q(`insert into maintenance_comments (request_id,author_id,body) values ($1,$2,'Plumber coming tomorrow')`, [reqP.id, A])
  await asDb()
  ok((await q(`select 1 from notifications where user_id=$1 and title='Tenant replied on a request'`, [A])).length >= 1)
  ok((await q(`select 1 from notifications where user_id=$1 and title='New reply on your request'`, [PT])).length >= 1)
  await as(T1); eq((await q(`select * from maintenance_comments`)).length, 0)
  await as(B); eq((await q(`select * from maintenance_requests where id=$1`, [reqP.id])).length, 0)
})
await t('maintenance file storage: only the request parties may read or add', async () => {
  const path = `${A}/${reqP.id}/photo.jpg`
  await as(PT); await q(`insert into storage.objects (bucket_id,name) values ('maintenance-files',$1)`, [path])
  await as(A); eq((await q(`select * from storage.objects where bucket_id='maintenance-files'`)).length, 1)
  await as(T1); await rejects(() => q(`insert into storage.objects (bucket_id,name) values ('maintenance-files',$1)`, [path]), /row-level security/)
  eq((await q(`select * from storage.objects where bucket_id='maintenance-files'`)).length, 0)
  await as(B); eq((await q(`select * from storage.objects where bucket_id='maintenance-files'`)).length, 0)
})

console.log('\n== Documents (Phase 4) ==')
let docShared, docPrivate
await t('owner stores documents; sharing needs a tenant; paths and parents must be the owner\'s', async () => {
  await as(A)
  docShared = (await q(`insert into documents (owner_id,tenant_id,doc_type,title,storage_path,mime_type,size_bytes,shared_with_tenant) values ($1,$2,'agreement','Rental agreement',$3,'application/pdf',1000,true) returning id`, [A, tP, `${A}/doc1.pdf`]))[0].id
  docPrivate = (await q(`insert into documents (owner_id,tenant_id,doc_type,title,storage_path,mime_type,size_bytes,shared_with_tenant) values ($1,$2,'id_proof','Aadhaar copy',$3,'application/pdf',1000,false) returning id`, [A, tP, `${A}/doc2.pdf`]))[0].id
  await rejects(() => q(`insert into documents (owner_id,doc_type,title,storage_path,shared_with_tenant) values ($1,'notice','No tenant',$2,true)`, [A, `${A}/d3.pdf`]), /Choose a tenant/)
  await rejects(() => q(`insert into documents (owner_id,tenant_id,doc_type,title,storage_path) values ($1,$2,'other','Foreign tenant',$3)`, [A, 'ffffffff-ffff-4fff-8fff-ffffffffffff', `${A}/d4.pdf`]), /does not belong/)
  await rejects(() => q(`insert into documents (owner_id,doc_type,title,storage_path) values ($1,'other','Wrong folder',$2)`, [A, `${B}/d5.pdf`]), /Invalid file path/)
  await as(B); await rejects(() => q(`insert into documents (owner_id,tenant_id,doc_type,title,storage_path) values ($1,$2,'other','Cross owner',$3)`, [B, tP, `${B}/d6.pdf`]), /does not belong/)
})
await t('tenant sees only documents shared with them; no write access', async () => {
  await as(PT); const d = await q(`select id from documents`); eq(d.length, 1); eq(d[0].id, docShared)
  await rejects(() => q(`insert into documents (owner_id,tenant_id,doc_type,title,storage_path) values ($1,$2,'other','x',$3)`, [A, tP, `${A}/x.pdf`]), /row-level security/)
  eq((await q(`update documents set shared_with_tenant = true where id=$1 returning id`, [docPrivate])).length, 0)
  await as(T1); eq((await q(`select * from documents`)).length, 0)
  await as(B); eq((await q(`select * from documents`)).length, 0)
})
await t('document storage: owner folder, tenant read only for shared files', async () => {
  await as(A); await q(`insert into storage.objects (bucket_id,name) values ('documents',$1),('documents',$2)`, [`${A}/doc1.pdf`, `${A}/doc2.pdf`])
  await rejects(() => q(`insert into storage.objects (bucket_id,name) values ('documents',$1)`, [`${B}/doc.pdf`]), /row-level security/)
  await as(PT); const o = await q(`select name from storage.objects where bucket_id='documents'`); eq(o.map((x) => x.name), [`${A}/doc1.pdf`])
  await rejects(() => q(`insert into storage.objects (bucket_id,name) values ('documents',$1)`, [`${A}/evil.pdf`]), /row-level security/)
  await as(B); eq((await q(`select * from storage.objects where bucket_id='documents'`)).length, 0)
  await as(A); await q(`update documents set deleted_at = now() where id=$1`, [docShared])
  await as(PT); eq((await q(`select * from storage.objects where bucket_id='documents'`)).length, 0, 'soft-deleted share disappears')
})

console.log('\n== Messaging (Phase 5) ==')
const BT = TB   // existing tenant of owner B
await t('only send_message can create messages; owner reaches only own linked tenants', async () => {
  await as(A)
  await rejects(() => q(`insert into messages (owner_id,sender_id,recipient_id,body) values ($1,$1,$2,'direct')`, [A, PT]), /permission denied/)
  await q(`select public.send_message($1, 'Welcome!', 'Hello')`, [PT])
  await rejects(() => q(`select public.send_message($1, 'spam')`, [BT]), /only message your own tenants/)
  await rejects(() => q(`select public.send_message($1, 'spam')`, [B]), /only message your own tenants/)
  await rejects(() => q(`select public.send_message($1, 'x')`, ['ffffffff-ffff-4fff-8fff-ffffffffffff']), /only message your own tenants/)
})
await t('blank, oversized and anonymous messages are refused', async () => {
  await as(A)
  await rejects(() => q(`select public.send_message($1, '   ')`, [PT]), /Write a message/)
  await rejects(() => q(`select public.send_message($1, $2)`, [PT, 'x'.repeat(4001)]), /at most 4000/)
  await asAnon(); await rejects(() => q(`select public.send_message($1, 'hi')`, [PT]), /permission denied/)
})
await t('tenant replies to own owner only; another owner\'s tenant cannot', async () => {
  await as(PT); await q(`select public.send_message($1, 'Thanks, got it')`, [A])
  await rejects(() => q(`select public.send_message($1, 'hi')`, [B]), /only message your own owner/)
  await rejects(() => q(`select public.send_message($1, 'hi')`, [PT]), /only message your own owner/)
  await as(BT); await rejects(() => q(`select public.send_message($1, 'hi')`, [A]), /only message your own owner/)
})
await t('threads show partner, last message and unread count; reading clears it', async () => {
  await as(PT); let th = (await q(`select public.message_threads() t`))[0].t
  eq(th.length, 1); eq(th[0].partner_id, A); eq(th[0].unread, 1); eq(th[0].last_body, 'Thanks, got it')
  eq((await q(`select public.mark_thread_read($1) n`, [A]))[0].n, 1)
  th = (await q(`select public.message_threads() t`))[0].t; eq(th[0].unread, 0)
  await as(A); th = (await q(`select public.message_threads() t`))[0].t
  const row = th.find((x) => x.partner_id === PT); eq([row.name, row.unread], ['Pay Tenant', 1])
  ok(th.every((x) => x.partner_id !== BT), 'other owner\'s tenant must not be listed')
  await as(BT); eq((await q(`select public.message_threads() t`))[0].t.some((x) => x.last_body !== null), false)
})
await t('messages are private to the two parties; read marking is for recipients only', async () => {
  await as(T1); ok((await q(`select * from messages`)).every((m) => m.sender_id === T1 || m.recipient_id === T1))
  await as(B); eq((await q(`select * from messages`)).length, 0)
  await as(BT); eq((await q(`select * from messages`)).length, 0)
  await as(PT); eq((await q(`select public.mark_thread_read($1) n`, [BT]))[0].n, 0)
  await as(A); await rejects(() => q(`update messages set body='edited'`), /permission denied/)
  await as(PT); await rejects(() => q(`delete from messages`), /permission denied|0 rows/).catch(() => {})
  await asDb(); ok((await q(`select 1 from notifications where user_id=$1 and title='New message from your owner'`, [PT])).length >= 1)
  ok((await q(`select 1 from notifications where user_id=$1 and title like 'New message from%' and type='message'`, [A])).length >= 1)
})
await t('message sending is rate limited', async () => {
  await as(A); let blocked = false
  for (let i = 0; i < 25; i++) { try { await q(`select public.send_message($1, 'ping ' || $2::text)`, [PT, i]) } catch (e) { if (/too quickly/.test(e.message)) { blocked = true; break } } }
  ok(blocked, 'rate limit not reached')
})

console.log('\n== Announcements (Phase 5) ==')
let annAll, annProp
await t('owner posts announcements; property must be theirs; tenants and other owners cannot post', async () => {
  await as(A)
  annAll = (await q(`insert into announcements (author_id,owner_id,title,body,audience) values ($1,$1,'Water cut','No water 10am-2pm tomorrow','tenants') returning id`, [A]))[0].id
  annProp = (await q(`insert into announcements (author_id,owner_id,property_id,title,body) values ($1,$1,$2,'Lift service','Lift closed Monday') returning id`, [A, propA]))[0].id
  await rejects(() => q(`insert into announcements (author_id,owner_id,property_id,title,body) values ($1,$1,$2,'Bad','x')`, [A, '00000000-0000-4000-8000-000000000000']), /does not belong|foreign key/)
  await rejects(() => q(`insert into announcements (author_id,owner_id,title,body,audience) values ($1,$1,'To owners','x','owners')`, [A]), /Owners can only address/)
  await rejects(() => q(`insert into announcements (author_id,owner_id,title,body) values ($1,$1,'a','')`, [A]), /check constraint/)
  await as(B); await rejects(() => q(`insert into announcements (author_id,owner_id,property_id,title,body) values ($1,$1,$2,'Hijack','x')`, [B, propA]), /does not belong/)
  await as(PT); await rejects(() => q(`insert into announcements (author_id,owner_id,title,body) values ($1,$2,'Fake','x')`, [PT, A]), /row-level security/)
})
await t('tenants of that owner are notified once each; other owners\' tenants are not', async () => {
  await asDb()
  eq((await q(`select count(*)::int n from notifications where user_id=$1 and type='announcement' and title='Water cut'`, [PT]))[0].n, 1)
  eq((await q(`select count(*)::int n from notifications where user_id=$1 and type='announcement'`, [BT]))[0].n, 0)
  eq((await q(`select count(*)::int n from notifications where user_id=$1 and type='announcement'`, [B]))[0].n, 0)
})
await t('tenants read their owner\'s announcements only; edits limited; removal hides it', async () => {
  await as(PT); eq((await q(`select id from announcements order by created_at`)).map((r) => r.id), [annAll, annProp])
  await as(BT); eq((await q(`select * from announcements`)).length, 0)
  await as(A)
  await rejects(() => q(`update announcements set audience='all' where id=$1`, [annAll]), /Only the title/)
  await rejects(() => q(`update announcements set owner_id=$1 where id=$2`, [B, annAll]), /Only the title|row-level/)
  await q(`update announcements set title='Water cut (updated)' where id=$1`, [annAll])
  await q(`update announcements set deleted_at=now() where id=$1`, [annProp])
  await as(PT); eq((await q(`select id from announcements`)).map((r) => r.id), [annAll])
  await as(B); eq((await q(`update announcements set deleted_at=now() where id=$1 returning id`, [annAll])).length, 0)
})

console.log('\n== Reminders (Phase 5) ==')
await asDb()
const tR = (await q(`insert into tenant_profiles (owner_id,full_name,email) values ($1,'Rem Tenant','rem@test.com') returning id`, [A]))[0].id
const RT = await mkUser('rem@test.com', 'Rem Tenant')
const uR = (await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent,security_deposit) values ($1,$2,'R1',2,4000,0) returning id`, [propA, A]))[0].id
await as(A)
const asgR = (await q(`select public.assign_tenant($1,$2,current_date,4000,0,1,'monthly') id`, [tR, uR]))[0].id
const mkInv = async (offsetDays, ym) => (await q(`select public.create_invoice($1, $2::date, ($2::date + 27), current_date + $3::int, 4000, 'R') id`, [asgR, ym, offsetDays]))[0].id
const iUp = await mkInv(3, '2031-01-01'), iToday = await mkInv(0, '2031-02-01'), iLate1 = await mkInv(-1, '2031-03-01'), iLate8 = await mkInv(-8, '2031-04-01'), iFar = await mkInv(20, '2031-05-01')
await asDb(); await q(`update tenant_assignments set end_date = current_date + 5 where id=$1`, [asgR])
const remCount = async (kind) => Number((await q(`select count(*)::int n from reminder_log where kind=$1`, [kind]))[0].n)
await t('reminders: right kind for each invoice, nothing for far-future or paid', async () => {
  await as(A); const r = (await q(`select public.run_my_reminders() r`))[0].r
  eq([r.upcoming, r.due_today, r.overdue, r.lease_expiry], [1, 1, 2, 1])
  await asDb()
  const kinds = (await q(`select ref_id, kind from reminder_log where owner_id=$1 and ref_id in ($2,$3,$4,$5,$6)`, [A, iUp, iToday, iLate1, iLate8, iFar])).reduce((m, r) => ({ ...m, [r.ref_id]: r.kind }), {})
  eq([kinds[iUp], kinds[iToday], kinds[iLate1], kinds[iLate8], kinds[iFar]], ['upcoming', 'due_today', 'overdue_1', 'overdue_7', undefined])
  ok((await q(`select 1 from notifications where user_id=$1 and title='Rent due soon'`, [RT])).length === 1)
  ok((await q(`select 1 from notifications where user_id=$1 and title='Rent overdue'`, [RT])).length === 2)
  ok((await q(`select 1 from notifications where user_id=$1 and title='Tenancy ending soon'`, [A])).length === 1)
})
await t('reminders are idempotent: running again sends nothing', async () => {
  const before = Number((await q(`select count(*)::int n from notifications where user_id=$1 and type='reminder'`, [RT]))[0].n)
  await as(A); const r = (await q(`select public.run_my_reminders() r`))[0].r
  eq([r.upcoming, r.due_today, r.overdue, r.lease_expiry], [0, 0, 0, 0])
  await asSvc(); await q(`select public.run_scheduled_reminders()`); await asDb()
  eq(Number((await q(`select count(*)::int n from notifications where user_id=$1 and type='reminder'`, [RT]))[0].n), before)
})
await t('overdue ladder escalates as days pass; paid invoices stop reminders', async () => {
  await asDb(); const later = (await q(`select (current_date + 16)::text d`))[0].d
  const r1 = (await q(`select public.send_rent_reminders($1, $2::date) r`, [A, later]))[0].r
  ok(r1.overdue >= 2, 'escalation reminders expected')
  ok((await remCount('overdue_14')) >= 1)
  await as(A); await q(`select public.record_payment($1, 4000, 'cash')`, [iLate8])
  await asDb(); const much = (await q(`select (current_date + 40)::text d`))[0].d
  await q(`select public.send_rent_reminders($1, $2::date)`, [A, much])
  eq((await q(`select count(*)::int n from reminder_log where ref_id=$1 and kind='overdue_30'`, [iLate8]))[0].n, 0, 'paid invoice must not be nagged')
})
await t('reminders: only the owner can trigger theirs; internals are service-only; other owners unaffected', async () => {
  await as(PT); await rejects(() => q(`select public.run_my_reminders()`), /Only owners/)
  await as(A); await rejects(() => q(`select public.send_rent_reminders($1, current_date)`, [A]), /permission denied/)
  await rejects(() => q(`select public.run_scheduled_reminders()`), /permission denied/)
  await asAnon(); await rejects(() => q(`select public.run_my_reminders()`), /permission denied/)
  await as(B); const r = (await q(`select public.run_my_reminders() r`))[0].r; eq(Object.values(r).reduce((a, b) => a + b, 0), 0)
  await as(B); eq((await q(`select * from reminder_log`)).length, 0)
  await as(RT); eq((await q(`select * from reminder_log`)).length, 0)
  await as(A); ok((await q(`select * from reminder_log`)).length > 0)
})

console.log('\n== Super Admin platform (Phase 6) ==')
await asDb()
const PLAN = { Starter: (await q(`select id from subscription_plans where name='Starter'`))[0].id, TestPro: (await q(`select id from subscription_plans where name='TestPro'`))[0].id }
await t('plan limits: a Starter-plan owner cannot exceed 2 properties or 10 units; paid plans lift it', async () => {
  const S = await mkUser('starter@test.com', 'Starter Owner'); await as(S)
  const p1 = (await q(`insert into properties (owner_id,name,property_type,address_line,city,state,pincode) values ($1,'S1','apartment','1 Rd','Pune','MH','411001') returning id`, [S]))[0].id
  await q(`insert into properties (owner_id,name,property_type,address_line,city,state,pincode) values ($1,'S2','apartment','1 Rd','Pune','MH','411001')`, [S])
  await rejects(() => q(`insert into properties (owner_id,name,property_type,address_line,city,state,pincode) values ($1,'S3','apartment','1 Rd','Pune','MH','411001')`, [S]), /plan allows 2 propert/)
  for (let i = 1; i <= 10; i++) await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent) values ($1,$2,$3,1,1000)`, [p1, S, 'U' + i])
  await rejects(() => q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent) values ($1,$2,'U11',1,1000)`, [p1, S]), /plan allows 10 unit/)
  eq((await q(`select public.my_subscription() s`))[0].s.plan_name, 'Starter')
  await as(ADMIN); await q(`select public.admin_set_owner_plan($1,$2,'active',null)`, [S, PLAN.TestPro])
  await as(S); await q(`insert into property_units (property_id,owner_id,unit_number,floor_number,monthly_rent) values ($1,$2,'U11',1,1000)`, [p1, S])
  const sub = (await q(`select public.my_subscription() s`))[0].s; eq([sub.plan_name, sub.status, Number(sub.units)], ['TestPro', 'active', 11])
  ok((await q(`select 1 from notifications where user_id=$1 and title='Your plan was updated'`, [S])).length === 1)
})
await t('cancelled or expired subscriptions fall back to Starter limits', async () => {
  await as(ADMIN); const S = (await q(`select id from users where email='starter@test.com'`))[0]?.id
  await asDb(); const S2 = (await q(`select id from users where email='starter@test.com'`))[0].id
  await as(ADMIN); await rejects(() => q(`select public.admin_set_owner_plan($1,$2,'active',null)`, [S2, PLAN.Starter]), /already has 11 units/)
  await q(`select public.admin_set_owner_plan($1,$2,'cancelled',null)`, [S2, PLAN.TestPro])
  await as(S2); eq((await q(`select public.my_subscription() s`))[0].s.plan_name, 'Starter')
  await as(ADMIN); await q(`select public.admin_set_owner_plan($1,$2,'active',(current_date - 1))`, [S2, PLAN.TestPro])
  await as(S2); eq((await q(`select public.my_subscription() s`))[0].s.plan_name, 'Starter', 'expired period')
})
await t('only the admin manages plans and subscriptions; invalid input rejected', async () => {
  for (const u of [A, PT]) {
    await as(u)
    await rejects(() => q(`select public.admin_upsert_plan(null,'Hack',0,null,null,'[]'::jsonb,true)`), /Not authorised/)
    await rejects(() => q(`select public.admin_set_owner_plan($1,$2,'active',null)`, [u, PLAN.Starter]), /Not authorised/)
    await rejects(() => q(`select public.admin_list_subscriptions()`), /Not authorised/)
    await rejects(() => q(`insert into subscriptions (owner_id,plan_id) select $1, id from subscription_plans limit 1`, [u]), /permission denied|row-level/)
  }
  await as(PT); await rejects(() => q(`select public.my_subscription()`), /Only owners/)
  await as(ADMIN)
  const id = (await q(`select public.admin_upsert_plan(null,'Gold',999,20,null,'["Priority support"]'::jsonb,true) id`))[0].id
  await rejects(() => q(`select public.admin_upsert_plan(null,'Gold',1,1,1,'[]'::jsonb,true)`), /already exists/)
  await rejects(() => q(`select public.admin_upsert_plan(null,'X',1,1,1,'[]'::jsonb,true)`), /2 to 40/)
  await rejects(() => q(`select public.admin_upsert_plan(null,'Neg',-1,1,1,'[]'::jsonb,true)`), /valid monthly price/)
  await rejects(() => q(`select public.admin_upsert_plan(null,'Zero',1,0,1,'[]'::jsonb,true)`), /at least 1/)
  await rejects(() => q(`select public.admin_upsert_plan(null,'Feat',1,1,1,'"str"'::jsonb,true)`), /Features/)
  await q(`select public.admin_upsert_plan($1,'Gold',1299,20,null,'["Priority support"]'::jsonb,false)`, [id])
  await rejects(() => q(`select public.admin_set_owner_plan($1,$2,'active',null)`, [A, id]), /not active/)
  await rejects(() => q(`select public.admin_set_owner_plan($1,$2,'weird',null)`, [A, id]), /Invalid status/)
  await rejects(() => q(`select public.admin_set_owner_plan($1,$2,'active',null)`, [PT, PLAN.Starter]), /Owner not found/)
  ok((await q(`select * from public.admin_list_subscriptions()`)).length >= 3)
  await asDb(); ok((await q(`select 1 from audit_logs where entity_type='subscriptions'`)).length >= 1)
})
await t('transactions monitor: admin only, paginated, no raw webhook payloads', async () => {
  await as(ADMIN)
  const all = (await q(`select public.admin_list_payments() r`))[0].r
  ok(all.total >= 5 && all.rows.length > 0); ok(all.rows.every((r) => !('notes' in r) && r.owner_name && r.tenant_name))
  const page = (await q(`select public.admin_list_payments(null,null,null,2,0) r`))[0].r; eq(page.rows.length, 2); eq(page.total, all.total)
  eq((await q(`select public.admin_list_payments('refunded') r`))[0].r.rows.every((r) => r.status === 'refunded'), true)
  eq((await q(`select public.admin_list_payments(null,null,null,9999,-5) r`))[0].r.rows.length <= 100, true)
  const sum = (await q(`select public.admin_payment_summary() s`))[0].s
  ok(Number(sum.collected_total) > 0 && Number(sum.online_total) >= 5000 && Number(sum.failed_events) >= 1)
  const ev = (await q(`select public.admin_list_webhook_events() e`))[0].e; ok(ev.length > 0 && ev.every((e) => !('payload' in e)))
  for (const u of [A, PT, B]) { await as(u); await rejects(() => q(`select public.admin_list_payments()`), /Not authorised/); await rejects(() => q(`select public.admin_payment_summary()`), /Not authorised/); await rejects(() => q(`select public.admin_list_webhook_events()`), /Not authorised/) }
  await asAnon(); await rejects(() => q(`select public.admin_list_payments()`), /permission denied/)
})
let tk
await t('support tickets: users raise and follow their own; others cannot see them; admins answer', async () => {
  await as(PT); tk = (await q(`select public.create_ticket('Receipt missing','I did not get a receipt for my payment','billing') id`))[0].id
  await rejects(() => q(`select public.create_ticket('x','body')`), /short subject/)
  await rejects(() => q(`select public.create_ticket('Valid subject','   ')`), /Describe the problem/)
  await rejects(() => q(`insert into support_tickets (user_id,subject,body) values ($1,'Direct','x')`, [PT]), /permission denied/)
  await rejects(() => q(`select public.create_ticket('Bad category','x','weird')`), /check constraint/)
  await as(ADMIN); await rejects(() => q(`select public.create_ticket('Admin ticket','x')`), /Admins do not raise/)
  eq((await q(`select * from support_tickets`)).length, 1)
  await as(A); eq((await q(`select * from support_tickets`)).length, 0)
  await rejects(() => q(`select public.reply_ticket($1,'snooping')`, [tk]), /Ticket not found/)
  await as(T1); eq((await q(`select * from support_replies`)).length, 0)
  await asDb(); ok((await q(`select 1 from notifications where user_id=$1 and title='New support ticket'`, [ADMIN])).length === 1)
})
await t('ticket workflow: reply, status, reopen on user reply, closed is final; admin list shows requester', async () => {
  await as(ADMIN); await q(`select public.reply_ticket($1,'Sorry, checking now')`, [tk])
  eq((await q(`select status from support_tickets where id=$1`, [tk]))[0].status, 'in_progress')
  await q(`select public.admin_set_ticket_status($1,'resolved')`, [tk])
  ok((await q(`select resolved_at from support_tickets where id=$1`, [tk]))[0].resolved_at !== null)
  await as(PT); await q(`select public.reply_ticket($1,'Still no receipt')`, [tk])
  const t2 = (await q(`select status, resolved_at from support_tickets where id=$1`, [tk]))[0]; eq([t2.status, t2.resolved_at], ['open', null])
  eq((await q(`select * from support_replies where ticket_id=$1`, [tk])).length, 2)
  await rejects(() => q(`select public.admin_set_ticket_status($1,'closed')`, [tk]), /Not authorised/)
  await as(ADMIN); await q(`select public.admin_set_ticket_status($1,'closed')`, [tk])
  await rejects(() => q(`select public.reply_ticket($1,'more')`, [tk]), /closed/)
  const list = (await q(`select public.admin_list_tickets() l`))[0].l; eq(list[0].requester_name, 'Pay Tenant'); ok(list[0].requester_role.includes('tenant'))
  await rejects(() => q(`select public.admin_set_ticket_status($1,'weird')`, [tk]), /Invalid status/)
  await as(A); await rejects(() => q(`select public.admin_list_tickets()`), /Not authorised/)
  await asDb(); ok((await q(`select 1 from notifications where user_id=$1 and title='Support replied to your ticket'`, [PT])).length === 1)
})
await t('platform announcements: only admin posts; audiences respected; fan-out per role', async () => {
  await as(ADMIN)
  const aOwners = (await q(`insert into announcements (author_id,owner_id,title,body,audience) values ($1,null,'Owners notice','Maintenance window tonight','owners') returning id`, [ADMIN]))[0].id
  const aAll = (await q(`insert into announcements (author_id,owner_id,title,body,audience) values ($1,null,'Everyone notice','New features','all') returning id`, [ADMIN]))[0].id
  await rejects(() => q(`insert into announcements (author_id,owner_id,property_id,title,body,audience) values ($1,null,$2,'x','x','all')`, [ADMIN, propA]), /not tied to a property/)
  for (const u of [A, PT]) { await as(u); await rejects(() => q(`insert into announcements (author_id,owner_id,title,body,audience) values ($1,null,'Fake platform','x','all')`, [u]), /row-level security|Only the platform admin/) }
  await as(A); ok((await q(`select id from announcements`)).some((r) => r.id === aOwners)); ok((await q(`select id from announcements`)).some((r) => r.id === aAll))
  await as(PT); const seen = (await q(`select id from announcements`)).map((r) => r.id); ok(!seen.includes(aOwners), 'tenant must not see owners-only notice'); ok(seen.includes(aAll))
  await asDb()
  const n = async (u, title) => Number((await q(`select count(*)::int n from notifications where user_id=$1 and title=$2`, [u, title]))[0].n)
  eq([await n(A, 'Owners notice'), await n(B, 'Owners notice'), await n(PT, 'Owners notice'), await n(ADMIN, 'Owners notice')], [1, 1, 0, 0])
  eq([await n(A, 'Everyone notice'), await n(PT, 'Everyone notice'), await n(T1, 'Everyone notice')], [1, 1, 1])
  await as(A); eq((await q(`update announcements set deleted_at=now() where id=$1 returning id`, [aAll])).length, 0)
})
await t('platform settings: readable by signed-in users, writable only by admin, validated', async () => {
  await as(A); ok((await q(`select * from platform_settings`)).length >= 4)
  await rejects(() => q(`update platform_settings set value='false'::jsonb where key='signups_enabled'`), /permission denied/)
  await rejects(() => q(`select public.admin_set_setting('platform_notice','"hi"'::jsonb)`), /Not authorised/)
  await asAnon(); eq(await q(`select * from platform_settings`).then((r) => r.length, () => 0), 0)   // RLS or privileges: anon sees nothing
  eq((await q(`select public.public_platform_info() i`))[0].i.signups_enabled, true)
  await as(ADMIN)
  await rejects(() => q(`select public.admin_set_setting('nope','1'::jsonb)`), /Unknown setting/)
  await rejects(() => q(`select public.admin_set_setting('signups_enabled','"yes"'::jsonb)`), /true or false/)
  await rejects(() => q(`select public.admin_set_setting('support_email','"not-an-email"'::jsonb)`), /valid support email/)
  await rejects(() => q(`select public.admin_set_setting('support_phone','"abc"'::jsonb)`), /valid support phone/)
  await rejects(() => q(`select public.admin_set_setting('platform_notice', $1::jsonb)`, [JSON.stringify('x'.repeat(301))]), /too long/)
  await q(`select public.admin_set_setting('support_email','"  help@rentmaster.example "'::jsonb)`)
  await q(`select public.admin_set_setting('platform_notice','"Planned downtime Sunday 2am"'::jsonb)`)
  await asAnon(); const info = (await q(`select public.public_platform_info() i`))[0].i; eq(info.support_email, 'help@rentmaster.example')
  await asDb(); ok((await q(`select 1 from audit_logs where entity_type='platform_settings'`)).length >= 2)
})
await t('closing registrations blocks new owners but not invited tenants', async () => {
  await as(ADMIN); await q(`select public.admin_set_setting('signups_enabled','false'::jsonb)`)
  await asDb()
  await rejects(() => mkUser('late-owner@test.com', 'Late Owner'), /Registrations are currently closed/)
  await q(`insert into tenant_profiles (owner_id,full_name,email) values ($1,'Invited Late','invited-late@test.com')`, [A])
  const inv = await mkUser('invited-late@test.com', 'Invited Late')
  eq((await q(`select role from user_roles where user_id=$1`, [inv]))[0].role, 'tenant')
  await q(`select public.admin_set_setting('signups_enabled','true'::jsonb)`).catch(() => {})
  await as(ADMIN); await q(`select public.admin_set_setting('signups_enabled','true'::jsonb)`)
  await asDb(); await mkUser('late-owner@test.com', 'Late Owner')
})

console.log('\n== Privilege hardening ==')
await t('clients cannot change their own status or roles', async () => {
  await as(A)
  await rejects(() => q(`update users set status='suspended' where id=$1`, [A]), /permission denied/)
  await rejects(() => q(`insert into user_roles (user_id,role) values ($1,'super_admin')`, [A]), /permission denied|row-level/)
  await rejects(() => q(`update subscription_plans set price_monthly=0`), /permission denied/)
})
await t('user can edit own name/phone only', async () => {
  await as(A); eq((await q(`update users set full_name='Owner A2', phone='9000000000' where id=$1 returning id`, [A])).length, 1)
  eq((await q(`update users set full_name='x' where id=$1 returning id`, [B])).length, 0)
})
await t('storage policy confines uploads to own folder', async () => {
  await as(A)
  await q(`insert into storage.objects (bucket_id,name) values ('property-media',$1)`, [`${A}/p/a.jpg`])
  await rejects(() => q(`insert into storage.objects (bucket_id,name) values ('property-media',$1)`, [`${B}/p/a.jpg`]), /row-level security/)
})


console.log('\n== Security audit (Phase 7) ==')
await t('every public table has row-level security enabled', async () => {
  await asDb(); eq(await q(`select relname from pg_class c join pg_namespace n on n.oid=relnamespace where nspname='public' and relkind in ('r','p') and not relrowsecurity`), [])
})
await t('every SECURITY DEFINER function pins its search_path', async () => {
  await asDb(); eq(await q(`select proname from pg_proc p join pg_namespace n on n.oid=pronamespace where nspname='public' and prosecdef and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))`), [])
})
await t('signed-out visitors can execute exactly one function', async () => {
  await asDb(); eq((await q(`select proname from pg_proc p join pg_namespace n on n.oid=pronamespace where nspname='public' and has_function_privilege('anon',p.oid,'execute') order by 1`)).map((r) => r.proname), ['public_platform_info'])
})
await t('signed-out visitors have no table or sequence privileges', async () => {
  await asDb(); eq(await q(`select table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public'`), [])
})
await t('no client role can TRUNCATE, or fire triggers, on any table', async () => {
  await asDb(); eq(await q(`select table_name, grantee from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`), [])
})
await t('trigger functions cannot be called by clients', async () => {
  await asDb(); eq(await q(`select proname from pg_proc p join pg_namespace n on n.oid=pronamespace where nspname='public' and prorettype='trigger'::regtype and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`), [])
  await as(A); await rejects(() => q(`select public.handle_new_user()`), /permission denied/)
})
await t('payment, gateway and scheduler internals are not callable by signed-in users', async () => {
  await asDb()
  eq(await q(`select proname from pg_proc p join pg_namespace n on n.oid=pronamespace where nspname='public' and has_function_privilege('authenticated',p.oid,'execute') and proname in ('process_razorpay_event','attach_gateway_order','run_scheduled_reminders','run_scheduled_billing','billing_run','run_reminders_for')`), [])
})
await t('money tables cannot be written directly by any client role', async () => {
  await asDb()
  eq(await q(`select table_name, privilege_type from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE') and table_name in ('rent_invoices','rent_payments','payment_allocations','payment_orders','payment_webhook_events','payment_transactions','security_deposits','deposit_transactions','invoice_adjustments','reminder_log','audit_logs','user_roles','support_tickets','support_replies','platform_settings')`), [])
})
await t('anonymous calls to private RPCs are refused before running', async () => {
  await asAnon()
  for (const fn of ['admin_list_owners()', 'owner_dashboard_stats()', 'my_tenancies()', `send_message('${A}','hi')`, 'admin_payment_summary()'])
    await rejects(() => q(`select * from public.${fn}`), /permission denied/)
})
await t('an owner cannot grant themselves a plan, a role or a notification', async () => {
  await as(A)
  await rejects(() => q(`insert into subscriptions (owner_id, plan_id, status) select $1, id, 'active' from subscription_plans limit 1`, [A]), /permission denied|row-level/)
  await rejects(() => q(`update subscriptions set status='active'`), /permission denied|row-level/)
  await rejects(() => q(`insert into notifications (user_id,type,title) values ($1,'x','spam')`, [B]), /permission denied/)
  await rejects(() => q(`select public.admin_set_owner_plan($1, (select id from subscription_plans limit 1), 'active', null)`, [A]), /./)
})
await t('audit log cannot be altered or deleted by a user', async () => {
  await as(A)
  await rejects(() => q(`update audit_logs set action='x'`), /permission denied/)
  await rejects(() => q(`delete from audit_logs`), /permission denied/)
})
await t('users cannot delete messages or notifications they received', async () => {
  await as(A)
  await rejects(() => q(`delete from messages`), /permission denied/)
  await rejects(() => q(`delete from notifications`), /permission denied/)
})
await t('a tenant cannot reach another tenant or the owner dataset through any table', async () => {
  await as(T1)
  for (const tbl of ['properties', 'property_units', 'expenses', 'subscriptions', 'owner_profiles', 'support_tickets', 'payment_orders', 'payment_webhook_events']) {
    const rows = await q(`select 1 from ${tbl}`).catch(() => [])
    ok(rows.length === 0, `${tbl} leaked ${rows.length} rows to a tenant`)
  }
  // the audit log shows a user only their own actions (by design), never anyone else's
  ok((await q(`select actor_id from audit_logs`)).every((r) => r.actor_id === T1), 'foreign audit rows visible')
})
await t('a tenant sees only their own payments', async () => {
  await as(T1); const rows = await q(`select tenant_id from payments`)
  ok(rows.every((r) => r.tenant_id === t1), 'foreign payment visible')
})


console.log('\n== Rental agreements ==')
await as(A)
const agId = (await q(`insert into rental_agreements (owner_id,assignment_id,tenant_id,unit_id,start_date,expiry_date,monthly_rent,security_deposit) values ($1,$2,$3,$4,current_date - 100,current_date + 5,4000,0) returning id`, [A, asgR, tR, uR]))[0].id
await t('owner records an agreement; only one active per tenancy', async () => {
  ok(agId, 'not created')
  await rejects(() => q(`insert into rental_agreements (owner_id,assignment_id,tenant_id,unit_id,start_date,expiry_date,monthly_rent) values ($1,$2,$3,$4,current_date,current_date + 30,1)`, [A, asgR, tR, uR]), /duplicate|unique/)
})
await t('agreement must match its tenancy and owner', async () => {
  await as(A)
  await rejects(() => q(`insert into rental_agreements (owner_id,assignment_id,tenant_id,unit_id,start_date,expiry_date,monthly_rent,status) values ($1,$2,$3,$4,current_date,current_date + 30,1,'draft')`, [A, asgR, t1, uR]), /./)
  await as(B)
  await rejects(() => q(`insert into rental_agreements (owner_id,assignment_id,tenant_id,unit_id,start_date,expiry_date,monthly_rent) values ($1,$2,$3,$4,current_date,current_date + 30,1)`, [B, asgR, tR, uR]), /./)
  await as(A)
  await rejects(() => q(`update rental_agreements set tenant_id=$1 where id=$2`, [t1, agId]), /./)
  await rejects(() => q(`insert into rental_agreements (owner_id,assignment_id,tenant_id,unit_id,start_date,expiry_date,monthly_rent,status,document_id) values ($1,$2,$3,$4,current_date,current_date + 30,1,'draft','00000000-0000-0000-0000-000000000001')`, [A, asgR, tR, uR]), /./)
})
await t('tenant reads only their own agreement and cannot change it', async () => {
  await as(RT); eq((await q(`select id from rental_agreements`)).map((r) => r.id), [agId])
  await rejects(() => q(`update rental_agreements set monthly_rent=1 where id=$1`, [agId]).then((r) => { if (!r.length) throw new Error('no row') }), /./)
  await as(T1); eq((await q(`select id from rental_agreements`)).length, 0, 'other tenant sees agreement')
  await as(B); eq((await q(`select id from rental_agreements`)).length, 0, 'other owner sees agreement')
})
await t('agreement reminders fire once, then expiry marks the agreement expired', async () => {
  await as(A); const r1 = (await q(`select public.run_my_reminders() r`))[0].r
  eq(r1.agreements_expiring_7, 1)
  const r2 = (await q(`select public.run_my_reminders() r`))[0].r
  eq(r2.agreements_expiring_7, 0, 'sent twice')
  await asDb(); await q(`update rental_agreements set expiry_date = current_date - 1 where id=$1`, [agId])
  await as(A); const r3 = (await q(`select public.run_my_reminders() r`))[0].r
  eq(r3.agreements_expired, 1)
  eq((await q(`select status from rental_agreements where id=$1`, [agId]))[0].status, 'expired')
})
await t('renewing: only the owner, only active, new one starts the day after', async () => {
  await asDb(); await q(`update rental_agreements set status='active', expiry_date = current_date + 20 where id=$1`, [agId])
  await as(B); await rejects(() => q(`select public.renew_agreement($1, current_date + 400)`, [agId]), /not found/i)
  await as(RT); await rejects(() => q(`select public.renew_agreement($1, current_date + 400)`, [agId]), /Only owners/)
  await as(A); await rejects(() => q(`select public.renew_agreement($1, current_date + 10)`, [agId]), /must be after/)
  const nid = (await q(`select public.renew_agreement($1, current_date + 385, 4500) id`, [agId]))[0].id
  const rows = await q(`select id,status,monthly_rent::numeric,(start_date - current_date) s from rental_agreements where assignment_id=$1 order by start_date`, [asgR])
  eq(rows.map((x) => x.status), ['renewed', 'active'])
  eq(Number(rows[1].monthly_rent), 4500); eq(rows[1].s, 21)
  await rejects(() => q(`select public.renew_agreement($1, current_date + 800)`, [agId]), /active/)
  ok(nid)
})
await t('anonymous visitors cannot call the agreement functions', async () => {
  await asAnon()
  await rejects(() => q(`select public.renew_agreement($1, current_date + 400)`, [agId]), /permission denied/)
})

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) { console.log('\nFAILURES:\n' + failures.join('\n')); process.exit(1) }
