# Alza Client Portal (prototype)

Clickable prototype of the Alza client portal: the Master Console for Ben and a co-branded client workspace, piloted with Blueprint Studios. All people and items are fictional sample data. State lives in the browser, so there is no backend yet.

## What's in it

- **Sign-in screen** (`/`): magic-link style email sign-in (visual only) plus two demo shortcuts.
- **Master Console** (`/console`): overdue counts, everything waiting on clients sorted by urgency, a "You owe" list for Alza deliverables, extension requests, and the client roster.
- **Reminder rules** (`/console/rules`): edit the default policy. Changes flow through every screen immediately.
- **Client workspace** (`/c/blueprint`): Needs you / Your team / Alza is on it / Done, one-tap approve, and projects showing what's holding them up.
- **Action detail** (`/c/blueprint/a/[id]`): files, reminder timeline, activity log, comments, and a phone-friendly action bar (approve, upload, ask for more time, request changes).

**Added in round 2**

- **Company switcher**: jump between All companies and any client's workspace from the top bar.
- **Projects** (`/c/[client]/projects`): In progress (checklists drive the %), HR roadmap by month, Completed.
- **Steps on tasks**: checklists inside a task drive its % complete. Approve/Complete unlocks once every step is checked.
- **Remind me**: email reminder 5 days before, 1 day before, the morning it's due, or a picked date (sent 8:00 AM).
- **Recruiting**: roles, candidate profiles with Alza assessment, Advance/Hold/Pass/Offer feedback, compare view, days waiting and offer-risk flags. Feedback checks off the matching step on the feedback task.
- **Resources**: client folders and search. Console **Library** with Share to client, flag as outdated, add new.
- **Wellness**: six pillars, included vs optional programs, announcements, "useful?" votes.
- **Note board**: clients post a Need, Question or Message (optionally time-sensitive). Ben gets an email; replies on both sides. Console **Notes** inbox.
- **Team** (client executives): invite by email or generate single-use invite codes (7-day expiry); join with a code from the sign-in page. Access levels: Executive, Manager, Hiring manager (recruiting only).
- **Client setup** (console): turn modules on or off, brand color, logo upload, users and access, escalation contact.

**Added in round 3**

- **HR Huddle** (`/console/huddle`): one recap email per client (weekly, every 2 weeks, or monthly, on a chosen weekday at 8 AM). Covers what needs them, project progress, wins, what Ben is working on, and what's coming. Skips quiet weeks, bundles friendly and due-date nudges, optional personal note, live preview, "Send me a test", per-person opt in from the client Home page.
- **Share with HR** (`/c/[client]/share`): clients upload documents, link them to a document Ben asked for, add a note, mark confidential. Ben gets an email (file names only, never attachments) and a bell notification.
- **Notification bell** in the console: uploads, notes, approvals, extension and change requests, recruiting feedback.
- **Files** inbox (`/console/files`) with mark reviewed.
- **Light and dark mode** toggle on every screen (remembers your choice, follows the phone setting by default).
- **HEX color** field in Client setup, with a readability warning for colors too light for white button text.

**Added in round 4**

- **Tiled client Home**: Needs you, Talk to Ben (booking link), Projects, Chat with Ben, Share with HR, Hiring, Coming up, Recent wins, Ben is working on, Resources, Wellness, HR Huddle email. Tiles respect modules and access level.
- **Customize**: each person can show, hide and reorder tiles. Ben sets the default layout per client by customizing while viewing their workspace.
- **Tasks page** (`/c/[client]/tasks`): the full tabbed task list that used to live on Home.
- **Booking link**: set once in Console → Clients; powers the Talk to Ben tile everywhere.
- **Quiet referral and add-on lines**: a low-key intro request at the bottom of the dashboard and in the first Huddle each month, plus a hiring line only when Recruiting is off. Toggle per client in Client setup → Growth.

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

## Email (Resend)

Set these in Vercel → Settings → Environment Variables, then redeploy:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Your Resend API key |
| `NOTIFY_FROM` | A sender on a domain verified in Resend, e.g. `Alza Portal <portal@alzapc.com>` |
| `NOTIFY_TO` | Where note-board alerts go (defaults to `ben@alzapc.com`) |
| `REMIND_ALLOWED` | Who can get "Remind me" emails during the pilot: comma-separated emails or domains, e.g. `ben@alzapc.com,@blueprintstudios.com` |

Notes: note-board alerts only ever go to `NOTIFY_TO`. Reminders can be scheduled up to 30 days ahead. Until the key is set, everything still saves and the app says email isn't connected.

## Going live (step 1 of the full build: done)

Real sign-in, a Supabase database with row-level security, private file storage and a daily email job are built in. See **SETUP.md** for the 20-minute setup. Without the Supabase keys the site runs in demo mode with sample data.

- `supabase/schema.sql`: tables, security rules, storage bucket, invite-code redemption
- `lib/live.ts`: loads from and saves to Supabase (only what changed)
- `app/api/cron/daily`: reminders, escalations and HR Huddles every morning (`vercel.json`)
- `app/api/invite`: invite emails

## Roadmap

1. ~~Foundation~~
2. ~~Claude drafting~~: "Draft reply" on client notes, "Draft with Claude" on tasks (attaches a Word file to the task) and on the console. Context comes only from that one client, loaded server-side. Ben approves everything. Needs `ANTHROPIC_API_KEY`.
   - **Documents for Claude**: upload each client's handbook, policies, templates and letterhead in Client setup, plus your default templates on the Clients page (`supabase/002_knowledge.sql`). Claude follows the client's documents first, then your templates, then best practice, and says which it used. Drafts download and attach as real Word files with the client's letterhead.
3. ~~Hire flow~~ (same flow as the Presidio Bay New Hire Console, per client; `supabase/003_hires.sql`):
   - **New hires** page per client with a pizza-tracker for each person: Approved → Offer sent → Signed → Paperwork → Day 1 set → Started, plus the start-date countdown. Also a Home tile and a console **New hires** view across all clients.
   - **New hire form** (Ben or a client executive; also "Start the hire" from a finalist marked Offer in Recruiting). Live checks: CA exempt minimum, hourly marked exempt, missing email, job description, first-day email timing.
   - **Offer letter and agreement**: Claude fills the client's own template from the hire's details, saved as Word with letterhead. "Ask [CEO] to approve" sends it as an approval task. Upload the signed copy.
   - **Offer signed** puts "Add them to payroll" on Ben's list (due 3 business days before start) and sends the client "Get ready for day one" (owned by the manager when they're on the portal).
   - **Emails in the client's colors**: welcome email when the offer is signed, first-day email N days before the start date (both automatic, or by hand), preview and "Send me a test". Started is set on the start date, and Ben gets a 30-day check-in reminder.
   - **Client setup → New hire onboarding**: payroll system, office address, contact, benefits line, mission, values, leadership note, video, timing.
   - **Built-in e-signature** (`supabase/004_esign.sql`, free, no outside service): "Send for e-signature" on an offer letter or agreement emails the new hire a private link in the client's colors. They read it on any device, agree to sign electronically, and type their name. The signed PDF (with a signature certificate: SHA-256 of the exact text, time, IP, browser, activity) goes on the hire and into Files, a copy is emailed to them, and Ben gets an email and a bell notice. A signed offer moves the hire to Signed, puts payroll setup on Ben's list, sends the client the first-day prep task, and sends the welcome email. Links expire in 30 days; resending cancels the old link; they can decline with a note.
   - Payroll integrations come later.
**Alerts (push notifications)** (`supabase/005_push.sql`): phone and computer alerts without an app store. The first time someone signs in they're asked once, kindly, to turn alerts on (on iPhone it shows how to add the portal to the Home Screen first). "Not now" asks once more two weeks later, then never on its own. The phone icon in the top bar turns alerts on or off per device and picks what to get. Ben: client activity, new hires, escalations. Clients: new requests and approvals, due date reminders, replies from Ben. Email still goes out either way.

4. AlzaPitch link
5. PEO and benefits calculator
6. Ask HR (answers only from each client's own policies)
