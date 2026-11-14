# RENTMASTER QA Report: Phases 1–5

Date: 2026-11-12. Scope: schema, RLS, business rules, finance ledger, frontend build, responsive public pages, finance screens against a mocked API.
**Verdict: Phases 1–5 pass all automated tests. The platform is NOT production-ready: reminders and announcements are in-app only, the Razorpay flow has not been exercised against Razorpay (Test Mode) and the Edge Functions have not been run in Deno, and nothing has been run against a live Supabase project.**

## How tests were run

| Layer | Method | Result |
|---|---|---|
| Database (RLS, triggers, RPCs) | `npm run test:sql`: all 10 migrations applied to a real Postgres (PGlite) with a small Supabase shim (roles, `auth.uid()`, `auth.users`, storage tables); 135 cases run as different roles | 135 / 135 pass |
| Validation and utilities | `npm test` (Vitest), including CSV formula-injection tests and Razorpay webhook signature verification (tampering, re-serialising, wrong secret, malformed signatures) | 46 / 46 pass |
| Types and build | `tsc -b`, `vite build` | clean |
| Responsive / routing | Playwright (Chromium) on 7 public routes at 375, 820 and 1440 px; guarded-route redirect check | no horizontal overflow, no page errors; `/owner`, `/tenant`, `/admin` redirect to `/login` when signed out |
| Finance screens | Playwright (Chromium) with a mocked Supabase API: 7 owner and 4 tenant finance routes, invoice detail modal, over-payment validation | no page errors, no horizontal overflow; over-payment blocked with a clear message |
| Phase 4 screens | Playwright (Chromium) with a mocked API and a stubbed Razorpay checkout: maintenance, documents, settings, Pay Rent | no page errors or overflow; request body carries only the invoice id; page shows “Confirming…” until the server records the payment; tenants get no owner controls |
| Phase 5 screens | Playwright (Chromium), mocked API: messages (desktop and 390 px phone), announcements, send reminders | no page errors or overflow; blank message blocked before sending; payload is only partner id and text |
| Phase 6 screens | Playwright (Chromium), mocked API: 5 admin pages, owner/tenant support (390 px phone for tenant), owner plan card, `/support` redirect, register notice, platform banner | no page errors or overflow; invalid plan limits and blank tickets blocked before sending; unlimited plan sends null limits; status and setting changes call the right RPCs |
| Phase 7 full sweep | Playwright (Chromium), mocked API returning empty data: all 44 panel routes at 390 px and 1280 px (88 loads) plus 5 cross-role access attempts | no page errors, crashes or horizontal overflow; each wrong-role URL lands on the user's own panel |

## Bugs found and fixed

| # | Severity | Bug | Fix | Retest |
|---|---|---|---|---|
| 1 | **Critical** | One trigger function was shared by `properties` and `property_units`; it compared the unit enum to `'archived'`, which is not a valid value, so **every unit status change failed** (assign tenant, end tenancy, transfer all broken). Found by `assign_tenant` test. | Split into `block_archive_property()` and `block_remove_unit()` | Pass |
| 2 | **High** | Tenants could read owner-private data: `tenant_profiles.notes`, `property_units.notes`, `properties.settings` (tenant read policies returned whole rows). Found in design review. | Removed `notes` from tenant profiles; removed tenant read policies on properties/units; added `my_tenancies()` safe projection | Pass (“my_tenancies returns safe fields only”, “tenant cannot read properties or units directly”) |
| 5 | **Medium** | Tenants could create a maintenance request with a repair cost, an assignee or a closing date already set (the insert policy only checked status). Found in design review. | Insert policy requires those fields empty; trigger also requires an active tenancy on the unit and derives `owner_id` from the tenant record | Pass |
| 6 | **High** | The original messaging policies let an owner insert a message addressed to **any** user id (not just their tenants), enabling unsolicited messages and notifications to strangers. Found in design review. | Direct inserts revoked; `send_message()` allows owner ↔ own tenants only, validates length, rate-limits | Pass |
| 7 | **High** | A new owner announcement could target another owner's property id (no integrity check). | `announcements_guard` trigger; audience/owner/property cannot change after posting | Pass |
| 8 | **Medium** | First draft of the reminder function failed on the lease-expiry loop (a SQL alias collided with a PL/pgSQL variable), so no reminders would have been sent. Found by the new tests before release. | Renamed variable and alias | Pass |
| 9 | **Medium** | `admin_list_webhook_events` selected a column that does not exist (`created_at`), so the gateway-events list would have failed. Found by the Phase 6 tests. | Uses `received_at` | Pass |
| 10 | **High** | Notifications page and tenant dashboard crashed: each screen opened a second realtime subscription to the same channel, which supabase-js rejects. Found by the Phase 7 sweep. | Only the shell's bell subscribes; other screens just read | Pass (sweep) |
| 11 | **Medium** | Anonymous visitors could execute every database function (PostgreSQL grants EXECUTE to everyone by default); each still checked the caller, but the surface was needlessly open. | `0010` revokes it; only `public_platform_info` stays public | Pass |
| 12 | **Low** | Subscriptions could be written directly by an admin session, bypassing the audited RPC. | Direct writes revoked | Pass |
| 13 | **Low** | The phone layout scrolled sideways on tables with an icon-only "Actions" column (hidden text escaped the scroll container). | Table wrapper is now a positioning context | Pass (sweep) |
| 14 | **Low** | Admin Transactions and the owner dashboard threw on an unexpected server response. | Defensive handling; the dashboard shows its loading state instead of crashing | Pass (sweep) |
| 15 | **Low** | Post-login redirect accepted any string in router state. | `safeRedirect()` allows same-site paths only (unit tested) | Pass |
| 3 | **Medium** | An owner could set `tenant_profiles.user_id` to any user id, granting that user tenant access to the owner's data. Found in design review. | `protect_tenant_user_link` trigger | Pass |
| 4 | **High** | Late fees were skipped for invoices created already past due (they became `overdue` at creation and the late-fee loop only looked at other statuses). Found by the finance test run. | Late-fee loop now covers pending, partially paid and overdue invoices and applies the fee once | Pass |

## Test cases (summary; full list in `tests/sql/rls.test.mjs`)

| Area | Test case | Expected | Actual | Result | Sev. if failed |
|---|---|---|---|---|---|
| Auth | Self-registration | Owner role + owner profile | as expected | Pass | High |
| Auth | Signup metadata `role: super_admin` | Still owner | as expected | Pass | Critical |
| Auth | Email matches owner-created tenant | Tenant role, record linked | as expected | Pass | High |
| Auth | Client calls `bootstrap_super_admin` | Permission denied | as expected | Pass | Critical |
| Isolation | Owner B reads/updates/deletes/inserts as owner A | 0 rows / RLS error | as expected | Pass | Critical |
| Isolation | Attach unit to another owner's property; change `owner_id` | Rejected | as expected | Pass | Critical |
| Isolation | Anonymous reads private tables | Permission denied (plans readable) | as expected | Pass | Critical |
| Units | Duplicate number (case-insensitive); new unit as Occupied; Occupied without tenant; negative rent; bad PIN | Rejected | as expected | Pass | Medium |
| Tenancy | Assign: unit occupied + deposit record | Created | as expected | Pass | High |
| Tenancy | Second active tenant on a unit; other owner's tenant/unit | Refused | as expected | Pass | High |
| Tenancy | Flip occupied unit to Available; archive property/unit/tenant with active tenancy | Refused | as expected | Pass | High |
| Tenancy | Transfer / end tenancy / bad move-out date / archive after end | Correct states; bad date rejected | as expected | Pass | High |
| Tenant privacy | Tenant reads properties/units; other tenants; edits identity or rent | Blocked | as expected | Pass | Critical |
| Tenant privacy | Tenant calls owner/admin functions; messages another owner; request for another unit or with status `closed` | Blocked | as expected | Pass | High |
| Tenant | Update only permitted fields via RPC; mark notifications read but not edit them | Allowed / blocked correctly | as expected | Pass | Medium |
| Finance | Duplicate invoice same tenancy + period | Unique violation | as expected | Pass | Critical |
| Finance | Payment for another owner's tenant; amount ≤ 0 | Rejected | as expected | Pass | High |
| Finance | Webhook event replay; client write to webhook table | Duplicate rejected; client denied | as expected | Pass | Critical |
| Dashboard | Stats, 12-month series, property summary; owner B sees only B | Match seeded data | as expected | Pass | High |
| Admin | Stats; cannot read tenant profiles/documents; limited tenant list; non-admin blocked; suspend/reactivate; cannot suspend self | As specified | as expected | Pass | High |
| Hardening | Client edits own status/roles/plans; edits another user; uploads to another owner's storage folder | Denied | as expected | Pass | Critical |

### Phase 3 test cases (all pass; see "Finance", "Security deposits", "Expenses and reports" in `tests/sql/rls.test.mjs`)

| Area | Test case | Expected | Result | Sev. if failed |
|---|---|---|---|---|
| Billing | Generate invoices twice; back-fill; quarterly cycle | No duplicates; at most 12 months back-filled | Pass | Critical |
| Billing | Late fee on overdue invoice, run repeatedly | Applied once | Pass | High |
| Payments | Partial, full, over-payment, zero, future date, decimals | Correct status; over/zero/future rejected | Pass | Critical |
| Payments | Refund, refund + cancel invoice, waive, discount below paid | Ledger and status recalculated; bad input rejected | Pass | High |
| Advance | Advance with no invoice; credit applied to current and next-period invoices | Allocations correct; payments immutable | Pass | High |
| Security | Direct INSERT/UPDATE/DELETE on money tables from owner and tenant; another owner's invoice or tenant | Denied | Pass | Critical |
| Receipts | Owner and paying tenant can open; others cannot | As specified | Pass | High |
| Deposits | Receive, deduct, damage, refund; refund above held; over-receive | Over-limit refused; held balance correct | Pass | High |
| Reports | Month summary, income/expense, outstanding, late, property, category, vacant | Match seeded ledger; owner B sees nothing of A | Pass | High |
| Scheduling | Scheduled billing run across owners | Per-owner failure does not stop others | Pass | Medium |

### Phase 4 test cases (all pass; "Online payment", "Maintenance" and "Documents" sections of `tests/sql/rls.test.mjs`)

| Area | Test case | Expected | Result | Sev. if failed |
|---|---|---|---|---|
| Payment | Tenant starts payment before the owner opts in; another tenant, the owner or anonymous tries | Refused | Pass | High |
| Payment | Amount comes from the invoice balance; older open order expires; 5+ attempts in 10 min | Server-computed; rate limited | Pass | High |
| Payment | Tenant, owner or anonymous call the webhook processor or attach an order; direct writes to orders and webhook events | Permission denied | Pass | Critical |
| Webhook | Verified `payment.captured` | Invoice paid, receipt created, both parties notified | Pass | Critical |
| Webhook | Replayed event id; same payment under a new event id | Not applied twice | Pass | Critical |
| Webhook | Amount mismatch, unknown order, non-INR, malformed | Rent never credited; flagged for reconciliation | Pass | Critical |
| Webhook | Owner recorded cash while tenant paid online | Online money kept as advance credit | Pass | High |
| Webhook | `payment.failed`; unrelated event types | Order failed, nothing credited; ignored | Pass | Medium |
| Signature | Tampered or re-serialised body, wrong secret, missing/odd/short/non-hex signature, unset secret | Rejected | Pass | Critical |
| Maintenance | Tenant sets cost/assignee; request on another unit; naming another owner; edits a request | Blocked; owner derived from tenant | Pass | High |
| Maintenance | Owner updates status/cost; closing and reopening; notifications; comments (impersonation, blank) | Correct state and notices | Pass | Medium |
| Files | Maintenance photos and documents: other owner, other tenant, unshared or deleted document | No access | Pass | Critical |

### Phase 5 test cases (all pass; "Messaging", "Announcements", "Reminders" in `tests/sql/rls.test.mjs`)

| Area | Test case | Expected | Result | Sev. if failed |
|---|---|---|---|---|
| Messages | Direct insert; owner messages another owner's tenant, a non-tenant or unknown id; tenant messages another owner | Refused | Pass | Critical |
| Messages | Blank, over 4000 characters, anonymous; 20+ in 10 minutes | Refused / rate limited | Pass | Medium |
| Messages | Threads: partner list, last message, unread counts, mark read; another owner's tenant listed? | Correct; never listed | Pass | High |
| Messages | Third parties read; edit or delete messages; mark someone else's read | No access | Pass | Critical |
| Announcements | Foreign property; audience "owners"; empty body; tenant or other owner posts or deletes | Refused | Pass | High |
| Announcements | Fan-out | One notification per targeted tenant; none to other owners' tenants | Pass | High |
| Announcements | Tenants see only their owner's, not removed ones; audience edit | Correct; edit refused | Pass | High |
| Reminders | Due-soon, due-today, overdue 1/7 days, far-future ignored, lease expiry | Correct stage each | Pass | High |
| Reminders | Re-run same day and via scheduler | Nothing sent twice | Pass | Critical |
| Reminders | Escalation to 14/30 days; paid invoice | Escalates; paid never nagged | Pass | High |
| Reminders | Tenant/anonymous trigger; internal functions; other owner | Denied; unaffected | Pass | High |

### Phase 6 test cases (all pass; "Super Admin platform (Phase 6)" in `tests/sql/rls.test.mjs`)

| Area | Test case | Expected | Result | Sev. if failed |
|---|---|---|---|---|
| Admin access | Owner, tenant, anonymous call any `admin_*` function | Denied | Pass | Critical |
| Settings | Non-admin writes; invalid values; anon reads settings; `public_platform_info` | Refused; anon sees only the public fields | Pass | High |
| Signups | Registration closed: new owner vs invited tenant | Owner rejected; invited tenant allowed | Pass | High |
| Plans | Create/edit with invalid limits; assign a plan below current usage | Refused | Pass | High |
| Limits | Add property or unit beyond plan; expired plan falls back to Starter | Refused | Pass | Critical |
| Transactions | Listing is capped and returns names only; summary figures; webhook list has no payload | Correct | Pass | High |
| Tickets | Create (rate limit, blank, admin cannot), reply, other users read, status change, direct writes | Correct; foreign access denied | Pass | High |
| Platform announcements | Non-admin posts; audience targeting; fan-out | Refused; only the targeted audience notified | Pass | High |

Test note: fixtures give owners A and B a "TestPro" plan so the default Starter limits do not interfere with older tests.

### Phase 7 security checks (all pass; "Privilege hardening" and "Security audit (Phase 7)" in `tests/sql/rls.test.mjs`, `tests/functions/redirect.test.ts`)

| Area | Check | Expected | Result | Sev. if failed |
|---|---|---|---|---|
| Catalog | RLS enabled on every public table | None without | Pass | Critical |
| Catalog | Every SECURITY DEFINER function pins `search_path` | None unpinned | Pass | High |
| Catalog | Functions callable by signed-out visitors | Only `public_platform_info` | Pass | High |
| Catalog | Anonymous table/sequence grants; TRUNCATE/TRIGGER/REFERENCES grants; trigger functions callable | None | Pass | High |
| Catalog | Direct write grants on invoices, payments and other money tables | None | Pass | Critical |
| Internals | Payment, gateway and scheduler functions called by a signed-in user | Denied | Pass | Critical |
| Abuse | Anonymous call to private RPCs; self-granted plan, role or notification; edit or delete audit log or messages | Refused | Pass | Critical |
| Isolation | A tenant reads other tables (including support, orders, webhook events); audit log shows only own actions | Nothing foreign | Pass | Critical |
| Redirect | `//host`, `/\host`, `https://`, `javascript:`, blanks, non-strings | Sent to `/app` | Pass | Medium |
| Dependencies | `npm audit` | 3 advisories, accepted with reasons (see README) | Documented | Medium |

## Not tested yet (needed before any launch)

- **Security review by a person other than the author, and a penetration test.** Everything above was written and checked by the same team that built it.
- **Content-Security-Policy and security headers** in a real deployment (written, not tested against live Razorpay Checkout).
- **Reminder channels**: only in-app notifications exist. Email/SMS/WhatsApp delivery is not built, so a tenant who never opens the app is not reached.
- Messaging uses 10-second polling, not Supabase Realtime; not load tested.

- **Razorpay itself**: order creation, Checkout, real webhook delivery and signatures from Razorpay (use Test Mode), the webhook URL and secret configuration, and a refund/settlement process. The Edge Functions (`create-razorpay-order`, `razorpay-webhook`) have not been executed in Deno; only their database logic and signature check are tested.

- **Live Supabase**: real Auth (email confirmation, password reset, session expiry), Storage signed URLs and size/MIME limits, Realtime delivery, `invite-tenant` Edge Function.
- **Authenticated UI end-to-end** (forms, modals, dialogs, charts with data) in a browser; keyboard and screen-reader audit; accessibility contrast check.
- Malicious file upload tests beyond the bucket MIME/size limits; rate-limit behaviour.
- **pg_cron** scheduling on a real Supabase project (the job is registered only if the extension is enabled; it was not exercised outside the test database).
- Finance screens were exercised against a mocked API, not live data; bill upload to Storage, signed bill URLs and the browser print dialog were not tested.
- Print layout was not visually checked in a PDF.
- **Not built yet:** admin account create/edit/delete, admin permission roles, notification templates, email/SMS/WhatsApp delivery, Rental Agreements, `.xlsx` export, paying collected money out to owners.
