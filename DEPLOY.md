# Deploying RENTMASTER

You need three things: a Supabase project (database, login, files, functions), a static host for the app, and a Razorpay account if you want online rent payment. Use **test mode** for everything first.

## 1. Supabase (about 15 minutes)

1. Create a project at supabase.com. Note the project URL, the `anon` key and the project ref.
2. Optional but do it first: Database → Extensions → enable `pg_cron`, so migrations 0006 and 0008 schedule the daily billing and reminder jobs. Without it, owners use the Generate invoices and Send reminders buttons.
3. SQL Editor: run `supabase/migrations/0001` to `0010` in order, one file at a time. Stop on any error and fix it before continuing.
4. Authentication → URL Configuration: set Site URL to your app address, and add it to Redirect URLs.
5. Create your Super Admin: sign up in the app with your own email, then run `select public.bootstrap_super_admin('you@example.com');` in the SQL Editor.
6. Install the Supabase CLI, then:
   ```
   supabase login
   supabase link --project-ref YOUR-REF
   supabase secrets set SITE_URL=https://your-app-domain ALLOWED_ORIGIN=https://your-app-domain
   supabase functions deploy invite-tenant create-razorpay-order razorpay-webhook
   ```

## 2. Razorpay (only for online payment)

1. In Razorpay (test mode) copy the Key Id and Key Secret.
2. `supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=choose-a-long-random-string`
3. Razorpay Dashboard → Webhooks: URL `https://YOUR-REF.supabase.co/functions/v1/razorpay-webhook`, the same secret, events `payment.captured` and `payment.failed` (the only two the app handles; refunds are recorded by the owner in the app).
4. In the app, each owner turns on online payment in Settings.

Payments go to the Razorpay account you configure here. Paying owners out is not built.

## 3. Host the app

**Render:** the repository has a `render.yaml` Blueprint. In Render choose New → Blueprint, pick the GitHub repository, and enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when asked. Page refresh routing and security headers are already in the file. After the first deploy, put the Render address (for example `https://rentmaster.onrender.com`) into Supabase Site URL and Redirect URLs and into the `SITE_URL` and `ALLOWED_ORIGIN` secrets.

**Netlify, Cloudflare Pages or Vercel:**

- Build command `npm run build`, output folder `dist`.
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key only, never the service-role key).
- `public/_redirects` makes page refreshes work, and `public/_headers` sets the security headers on Netlify and Cloudflare Pages. On Vercel, add the same headers in `vercel.json`.

## 4. Check it works

Sign in as Super Admin, create an owner account, add a property and a unit, invite a tenant, generate an invoice and record a payment. Then try a test-mode online payment and confirm the webhook shows in Admin → Transactions. Then work through the "Not tested yet" list in `QA_REPORT.md`.
