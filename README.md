# Alza Client Portal (prototype)

Clickable prototype of the Alza client portal: the Master Console for Ben and a co-branded client workspace, piloted with Blueprint Studios. All people and items are fictional sample data. State lives in the browser, so there is no backend yet.

## What's in it

- **Sign-in screen** (`/`): magic-link style email sign-in (visual only) plus two demo shortcuts.
- **Master Console** (`/console`): overdue counts, everything waiting on clients sorted by urgency, a "You owe" list for Alza deliverables, extension requests, and the client roster.
- **Reminder rules** (`/console/rules`): edit the default policy. Changes flow through every screen immediately.
- **Client workspace** (`/c/blueprint`): Needs you / Your team / Alza is on it / Done, one-tap approve, and projects showing what's holding them up.
- **Action detail** (`/c/blueprint/a/[id]`): files, reminder timeline, activity log, comments, and a phone-friendly action bar (approve, upload, ask for more time, request changes).

Reminder logic (business days, configurable): friendly reminder 3 before, due-date reminder, overdue notice 1 after, escalation 3 after, blocker flag on the console 7 after. When a client requests changes, the item moves to Alza's side so the client is never shown as the holdup.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to portal.alzapc.com

1. In Vercel: **Add New Project** → import this GitHub repo → Deploy (defaults are fine).
2. In the project: **Settings → Domains** → add `portal.alzapc.com`.
3. In GoDaddy DNS for alzapc.com: add a **CNAME** record, name `portal`, value `cname.vercel-dns.com`.
4. Wait for Vercel to show the domain as valid (usually minutes).

## Connect it to alzapc.com

Add a "Client Login" link to the main site nav pointing to `https://portal.alzapc.com`. Nothing else on the main site needs to change.

## Path to production

1. Supabase auth (magic link) with invite-only accounts and single-use invite codes.
2. Tables for clients, contacts, actions, projects, files, history, with row-level security so each client only sees its own workspace.
3. Scheduled reminder job (Vercel Cron) sending email via Resend, using the same rules.
4. File storage in Supabase Storage or R2 with signed URLs.
5. Remove the demo shortcuts and sample data.
