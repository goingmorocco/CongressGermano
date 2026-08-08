# Congrès Germano-Marocain 2026 — Setup Guide

This package contains three files:

- **congress-landing.html** — the public landing page (FR/DE/Darija, pricing, sign-up form)
- **admin.html** — private dashboard to view and approve/reject sign-ups
- **send-confirmation.ts** — Supabase Edge Function that emails applicants automatically

Follow these steps in order on your **new** Supabase project and GitHub account.

---

## 1. Create the database table

In your new Supabase project → **SQL Editor** → run:

```sql
create table registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  language text,
  plan text,
  plan_price integer,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table registrations enable row level security;

-- Public sign-up form can insert, but not read or edit
create policy "Anyone can submit a registration"
on registrations for insert
to anon
with check (true);

-- Logged-in admins can view and update
create policy "Admins can view registrations"
on registrations for select
to authenticated
using (true);

create policy "Admins can update registrations"
on registrations for update
to authenticated
using (true)
with check (true);
```

## 2. Get your Supabase credentials

Project Settings → **API** → copy:
- **Project URL**
- **anon / public key** (not the `service_role` key — never expose that one)

## 3. Plug credentials into both HTML files

In **both** `congress-landing.html` and `admin.html`, find (near the bottom, in the `<script>` section):

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Replace with your real values from Step 2. Do this in **both files** — they each connect independently.

## 4. Create your admin login

Supabase Dashboard → **Authentication** → **Users** → **Add user** → enter your email + a password. This is what you'll use to log into `admin.html`.

## 5. Host the site

Push `congress-landing.html` (and optionally rename to `index.html`) to your new GitHub repo, enable GitHub Pages, done. Keep `admin.html` in the same repo but **don't link to it anywhere public** — it's protected by login, but there's no reason to advertise the URL.

## 6. Confirmation email (Resend + Edge Function)

**a. Create a free Resend account** at [resend.com](https://resend.com) → API Keys → create one → copy it (starts with `re_...`)

**b. Create the Edge Function**
Supabase Dashboard → **Edge Functions** → **New function** → name it exactly `send-confirmation` → paste in the contents of `send-confirmation.ts` → Deploy

**c. Add your Resend key as a secret**
Edge Functions → `send-confirmation` → **Secrets**:
- `RESEND_API_KEY` = your Resend key
- (optional, once you verify your own sending domain in Resend) `FROM_EMAIL` = `Karriere Bruecke <no-reply@yourdomain.com>`

**d. Trigger it on every sign-up**
Supabase Dashboard → **Database** → **Webhooks** → **Create a new webhook**:
- Table: `registrations` · Event: **Insert**
- Type: **Supabase Edge Functions** → select `send-confirmation`
- Save

## 7. Test everything

1. Open your live `congress-landing.html`, submit a test sign-up
2. Check Supabase → Table Editor → `registrations` — your row should appear
3. Check the test email inbox — confirmation email should arrive within seconds
4. Open `admin.html`, log in with your Step 4 credentials, confirm the sign-up appears and Approve/Reject buttons work

---

### Notes
- The **anon key** is safe to expose in client-side code by design — security comes from the RLS policies above, not from hiding the key.
- Never put the **service_role** key in either HTML file.
- Any Supabase Auth user on this project can view/manage all sign-ups via `admin.html` — fine for one admin, flag it if you'll need more restricted roles later.
- If you want a proper "from" address instead of Resend's shared test domain, verify your own domain in Resend (Resend Dashboard → Domains) — takes a few DNS records.
