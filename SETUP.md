# Going live: Supabase + Vercel setup

About 20 minutes. Until step 4 is done the site keeps running in demo mode, so nothing breaks in the meantime.

## 1. Create the database

1. In Supabase, click **New project**. Name it `alza-portal`, pick the region closest to your clients (West US), and save the database password somewhere safe.
2. When it's ready, open **SQL Editor → New query**.
3. Paste everything in `supabase/schema.sql` (in this repo) and click **Run**. You should see "Success. No rows returned."

This creates the tables, the security rules (each client sees only their own data), the private file storage bucket, and sets `ben@alzapc.com` as the advisor. To use a different email for your console, run:

```sql
insert into public.advisors (email, name) values ('you@example.com', 'Ben Gaines');
```

## 2. Sign-in settings

**Authentication → URL Configuration**
- Site URL: `https://portal.alzapc.com` (or your `.vercel.app` address until the domain is connected)
- Redirect URLs: add both `https://portal.alzapc.com` and your `https://<project>.vercel.app`

**Authentication → Emails → SMTP Settings** (needed before clients can sign in; Supabase's built-in sender is for testing only)
- Turn on custom SMTP
- Host `smtp.resend.com`, port `465`, username `resend`, password: your Resend API key
- Sender: `portal@alzapc.com` (the alzapc.com domain must be verified in Resend), name `AlzaHR`

Optional: under **Emails → Templates → Magic Link**, change the subject to "Your AlzaHR sign-in link".

## 3. Copy your keys

In Supabase, **Project Settings → API Keys**:
- Project URL
- Publishable key (also called the `anon` key)
- Secret key (also called the `service_role` key). This one is powerful: only ever paste it into Vercel, never anywhere else.

## 4. Add them to Vercel

Vercel → your project → **Settings → Environment Variables**. Add each for Production (and Preview if you like):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service_role key |
| `CRON_SECRET` | Any long random string (lets Vercel run the daily email job) |
| `RESEND_API_KEY` | Your Resend API key |
| `NOTIFY_FROM` | `AlzaHR Portal <portal@alzapc.com>` |
| `NOTIFY_TO` | `ben@alzapc.com` (where your alerts go) |
| `PORTAL_URL` | `https://portal.alzapc.com` |
| `ANTHROPIC_API_KEY` | From console.anthropic.com (turns on Claude drafting) |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5` |

Then **Deployments → ⋯ on the latest → Redeploy**.

## 5. First sign-in

1. Go to the portal, enter `ben@alzapc.com`, click the link in your email. You land in the console.
2. **Clients → Add client** (for example Blueprint Studios). Set modules, color and logo, then invite their team under **People with access**. Each person gets an invite email.
3. Create your first request with **New request**.

## What runs on its own

- **Every morning (about 8 AM Pacific):** task reminders, overdue notices, escalations, and HR Huddles for clients whose Huddle day it is. Quiet Huddles are skipped. Nothing is ever sent twice.
- **Instantly:** note board posts, uploads, approvals and replies email the right person.

On the Vercel Hobby plan the morning job can run any time between 8:00 and 8:59.
