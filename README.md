# RENTMASTER

Rental property and tenant management platform: Owner, Tenant and Super Admin panels on one secure backend.

**Stack:** Vite + React 18 + TypeScript, Tailwind, React Hook Form + Zod, TanStack Query, Recharts, Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Architecture, design system, auth, role-based shells and dashboards | **Done** |
| 2 | Properties, units, tenants, assign / transfer / end tenancy | **Done** |
| 3 | Invoices, payments, advances, refunds, deposits, expenses, receipts, reports | **Done** (CSV and print-to-PDF export; no true .xlsx yet) |
| 4 | Online rent payment (Razorpay), maintenance, documents | **Done in code; not yet run against live Razorpay or Supabase** |
| 5 | Messages, announcements, rent reminders, scheduled jobs | **Done (in-app only; no email/SMS/WhatsApp)** |
| 6 | Super Admin: owners, tenants, properties, audit logs, transactions, subscriptions and plan limits, support tickets, platform announcements, platform settings | **Done (account create/edit/delete, admin permission roles and notification templates not built)** |
| 7 | Security hardening and full QA | **Done** (see `QA_REPORT.md`; live-environment testing still required before launch) |

Pages for unbuilt modules show an honest “Not built yet” screen. Nothing pretends to save data.
**This is not production-ready yet:** reminders and announcements reach tenants only inside the app (no email, SMS or WhatsApp), the Razorpay flow has never been run against Razorpay itself, and nothing has been run against a live Supabase project.

## Setup

1. Create a Supabase project. In Auth settings keep **Confirm email ON** (tenant linking relies on verified emails).
2. In the SQL editor, run in order: `supabase/migrations/0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql` → `0004_storage.sql` → `0005_tenant_views_notifications.sql` → `0006_finance.sql` → `0007_payments_maintenance_documents.sql` → `0008_messages_announcements_reminders.sql` → `0009_admin_platform.sql` → `0010_security_hardening.sql`.
   - `0006` and `0008` schedule daily billing (00:30 UTC) and daily rent reminders (04:00 UTC = 09:30 IST) with **pg_cron** if the extension is enabled (Database → Extensions → pg_cron). Without it, owners can press **Generate invoices** on the Rent Collection page; the job is idempotent either way.
3. `cp .env.example .env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key only; never put the service-role key in the app).
4. Create your Super Admin: register normally in the app, then in the SQL editor run `select public.bootstrap_super_admin('you@example.com');`.
5. Deploy the Edge Functions:
   ```
   supabase functions deploy invite-tenant create-razorpay-order razorpay-webhook
   supabase secrets set SITE_URL=https://your-domain ALLOWED_ORIGIN=https://your-domain
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx
   ```
   `supabase/config.toml` turns JWT verification off for `razorpay-webhook` only (Razorpay cannot send a Supabase JWT; the request is authenticated by its HMAC signature).
   In the Razorpay dashboard add a webhook to `https://<project-ref>.functions.supabase.co/razorpay-webhook` with the **payment.captured** and **payment.failed** events and the same secret. **Start in Razorpay Test Mode** and run a test payment end to end before going live.
   Owners then switch on **Settings → Online rent payment**; the Pay Rent page works only for those owners' tenants.
   If you add a Content-Security-Policy header, allow `https://checkout.razorpay.com` (script, frame) and `https://api.razorpay.com`.
6. In Auth → URL configuration add your site URL and `/login`, `/reset-password` as redirect URLs.
7. `npm install && npm run dev`

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (unit) · `npm run test:sql` (runs all migrations in an in-process Postgres and tests RLS, triggers and workflows)

## Money rules (Phase 3)

- **The browser never writes money tables.** `rent_invoices`, `rent_invoice_items`, `payments`, `payment_allocations`, `security_deposits` and `deposit_transactions` have INSERT/UPDATE/DELETE revoked from clients. All changes go through security-definer functions that check ownership and amounts.
- Invoice total, paid amount and status are derived in the database from the item and payment ledgers. `paid_amount <= total_amount` is a check constraint; a tenancy cannot have two invoices for the same period (unique key).
- Payments are immutable; a refund marks the payment refunded and reopens the invoice. Advance payments are stored with no invoice and applied to invoices through allocations. Income is counted at the time cash is received.
- Security deposits are a separate ledger and never count as income. Deductions and refunds cannot exceed the amount held.
- Late fee: a one-time percentage of the invoice amount, applied once when an invoice goes past its due date (percentage is an owner setting).
- No proration: the first invoice is a full period. Custom billing cycles use **Custom invoice**.

## Messaging, announcements and reminders (Phase 5)

- Messages can only be created through `send_message()`: an owner can write only to their own tenants who have signed up, a tenant only to their own owner. Clients cannot insert into `messages` directly; messages cannot be edited or deleted; senders are rate limited (20 per 10 minutes). The conversation refreshes every 10 seconds (polling, not realtime).
- Announcements are owner-to-tenant (all tenants, or the tenants of one property). Each targeted tenant gets one in-app notification. An announcement's audience and property cannot be changed after posting; it can be removed.
- Reminders are sent by `run_scheduled_reminders()` (daily via pg_cron) or by the owner's **Send reminders** button on Rent Collection: *due soon* (within the owner's "remind days before" setting), *due today*, and *overdue* at 1, 3, 7, 14 and 30 days. Each stage is sent once per invoice (`reminder_log`), paid or waived invoices are never reminded, and the owner is told once when a tenancy end date is 30 and 7 days away. Re-running the job never double-sends.
- **Channel is in-app notification only.** Email, SMS and WhatsApp delivery are not built; they need a provider account and templates.

## Super Admin and platform controls (Phase 6)

- Every admin function is `SECURITY DEFINER` and checks `is_super_admin()` itself. Admins see tenant and owner **names** in transactions, never tenant personal data, and never raw webhook payloads. Setting changes, plan edits and plan assignments are written to the audit log.
- **Plans and limits** are enforced by database triggers on `properties` and `property_units`, not by the UI. An owner without an active, in-period plan gets the *Starter* plan (2 properties, 10 units). An admin cannot move an owner to a plan whose limits they already exceed. Owners see usage in Settings → Your plan. Plans are assigned by the admin; there is no self-serve billing for the platform's own subscriptions.
- **Registrations toggle**: when closed, the signup trigger rejects new accounts unless the email belongs to a tenant an owner invited. Supabase Auth shows this as a generic sign-up error; the register page shows an explanatory notice using `public_platform_info()`.
- **Support**: owners and tenants raise tickets (rate limited, 5 per hour) and reply; admins reply and change status. Notification links to `/support` redirect to the user's own support page.
- **Platform announcements** go to owners, tenants or all (in-app notification each). Owner announcements are unaffected and remain deletable only by their author. A banner notice set in Platform Settings shows to every signed-in user.

## Online payment rules (Phase 4)

- The browser never marks rent paid. The tenant's browser asks `create-razorpay-order` to pay an invoice; the **database** fixes the amount (the invoice balance), checks the invoice is theirs and open, that the owner enabled online payment, and rate-limits attempts.
- Rent becomes paid only when `razorpay-webhook` receives a payment event whose **HMAC-SHA256 signature over the raw body** verifies. Forged requests are rejected before any database write.
- Processing is idempotent per Razorpay event id and per gateway payment id; replays and re-sends never double-credit. An amount that differs from our order, a non-INR payment or an unknown order never credits rent and is flagged in `payment_webhook_events` for manual reconciliation.
- If the owner recorded cash while the tenant was paying, the online money is kept as advance credit rather than lost.
- Maintenance requests: the owner is derived from the tenant record, tenants cannot set cost, assignee or closing date, and photos/documents live in private buckets with signed URLs. Documents are visible to a tenant only when the owner shares them.

## Security hardening (Phase 7)

- `0010_security_hardening.sql` removes access nobody needs: signed-out visitors can execute exactly one function (`public_platform_info`) and have no table access; trigger functions cannot be called through the API; nobody can TRUNCATE; subscriptions, notifications, messages, owner profiles and the audit log have no direct client writes beyond what the app uses.
- The SQL suite now checks the database catalog itself (RLS on every table, every SECURITY DEFINER function pins `search_path`, exact anonymous privileges, no client write grants on money tables), so a future migration that breaks these rules fails the tests.
- `public/_headers` carries a Content-Security-Policy (Razorpay and Supabase only), clickjacking protection, HSTS and no-sniff. It works on Netlify and Cloudflare Pages; on other hosts copy the same headers into the host's config. **Check the CSP in your own deployment**: it was written from the code, not tested against live Razorpay Checkout.
- Post-login redirects accept same-site paths only. The webhook rejects oversized bodies before reading them.
- Set `ALLOWED_ORIGIN` for the Edge Functions in production; unset, they allow any origin.
- `npm audit` reports advisories in `react-router` (open redirect with attacker-controlled link targets; SSR hydration, which this SPA does not use) and `zod` (memory use on very large arrays). No fix exists within react-router 6, and zod 4 is a breaking upgrade; the app never passes user-controlled URLs to navigation and validates only small forms. Plan a major-version upgrade after launch testing.

## How access control works

- Browser uses only the anon key. **Every table has RLS on**; each owner-owned table is `owner_id = auth.uid()`.
- Roles live in `user_roles` and can only be written by the signup trigger or `bootstrap_super_admin` (never from client metadata).
- Tenants cannot read `properties` / `property_units` directly (those hold owner-private notes and settings). They read a safe projection via `my_tenancies()`.
- Triggers enforce: cross-owner references, one active tenant per unit, unit status vs occupancy, no archiving a property/unit/tenant with an active tenancy, no relinking a tenant record to a login.
- Dashboard figures come from SQL functions (`owner_dashboard_stats`, `owner_monthly_series`, `owner_property_summary`), not browser math.
- Audit triggers record inserts/updates/deletes on core tables.

## Known limitations (be aware before launch)

- Supabase JS keeps the session in browser storage, not an HTTP-only cookie. A cookie-based session would need a server layer.
- Tenant invitation is by **email** only (SMS/mobile invite not built). Rate limiting relies on Supabase Auth's built-in limits.
- Unit photos and tenant profile photos are not in the UI yet (property photos are).
- Privacy Policy / Terms are template text and need legal review. Contact email is a placeholder.
- No true Excel (.xlsx) export: reports export as CSV (formula-injection safe) and print to PDF from the browser.
- **Online payments land in the platform's Razorpay account.** Paying that money out to each owner (for example Razorpay Route / linked accounts) is not built; settlement is arranged outside the app. Refunds of online payments are also not sent back through Razorpay: refund through the Razorpay dashboard, then mark the payment refunded here.
- Rental Agreements is still a placeholder.
- No message attachments, read receipts beyond "read", typing indicators or push notifications.
- Marking a payment refunded does not move money; the owner returns it outside the app.
- Super Admin can suspend/reactivate owners; create/edit/delete of owner accounts, admin permission roles and notification templates are not built. Support tickets have no attachments or email notifications.
- Not yet tested against a live Supabase project (see `QA_REPORT.md`). No penetration test or third-party security review has been done.
- `invite-tenant` has no app-level rate limit beyond Supabase Auth's email limits.
