// Runs once every morning (Vercel Cron, see vercel.json).
//   1. Task reminders, overdue notices and escalations, following Ben's reminder rules.
//   2. HR Huddle recap emails for clients whose Huddle day is today.
// Each email is logged in email_log so a re-run never double-sends.
import { celebrateSender, celebrations } from "@/lib/recognition";
import { Challenge, chainStats, challengeLive } from "@/lib/challenges";
import { shoutsSince } from "@/lib/challengeserver";
import type { Nudge } from "@/lib/nudge";
import { sendNudgeWave } from "@/lib/nudgeserver";
import { celebrateMail, localToday } from "@/lib/shoutserver";
import { NextResponse } from "next/server";
import { Action, Client, DEFAULT_RULES, fmt, Project, reminderPlan, Rules, toISO, today } from "@/lib/data";
import { buildHuddle } from "@/lib/huddle";
import { Candidate, ClientConfig, HuddleSettings, SharedFile } from "@/lib/modules";
import { pitchDeleteOn } from "@/lib/pitch";
import { addDaysISO, firstDayEmail, forCompany, Hire, hireCompany, listEmail, onboardingFor, senderFor, stageIndex, welcomeEmail } from "@/lib/hires";
import { anniversary, cleanCell, nextYearly, TeamLog, TeamMember, teamFor, weekItems } from "@/lib/team";
import { emailLogoUrl } from "@/lib/brand";
import { dueReminders, stepsFor } from "@/lib/tracker";
import { buddyNudgeDone, buddyOn, HireXp, introDay, introEmail, introOn, linkEmail, newToken, nudgeDay, nudgeEmail, nudgesFor, xpOn } from "@/lib/experience";
import { buildManagerWeek, buildSnapshot, PeopleData, peopleItems } from "@/lib/peopleupdates";
import { managerEmail } from "@/lib/hireemailserver";
import { admin, PORTAL_URL, sendEmail } from "@/lib/server";
import { advisorEmails, pushTo } from "@/lib/push";
import { ListRow, syncReminder } from "@/lib/mylistserver";
import { Departure, offboardFor, sendOn } from "@/lib/offboard";
import { offRoster, sendGoodbye } from "@/lib/offboardserver";
import { DEFAULT_SETTINGS as LEAVE_DEFAULTS, dueItems, Due, fmtDay, LeaveCase, LeaveSettings, OPEN_STATUSES } from "@/lib/leave";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Member = { client_id: string; email: string; name: string; role: string; access: string; huddle: boolean };
type Row = { id: string; client_id: string; data: Record<string, unknown> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function huddleDue(h: HuddleSettings, day: Date): boolean {
  if (h.cadence === "off" || day.getDay() !== h.day) return false;
  if (h.cadence === "monthly") return day.getDate() <= 7;
  if (h.cadence === "biweekly") return !h.lastSent || day.getTime() - new Date(h.lastSent).getTime() >= 13 * 86400000;
  return true;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = admin();
  const ben = process.env.NOTIFY_TO || "ben@alzapc.com";
  const benPush = await advisorEmails(db).catch(() => [ben]);
  const now = today();
  const day = toISO(now);
  const log: string[] = [];

  const [clientsR, membersR, actionsR, projectsR, filesR, settingsR] = await Promise.all([
    db.from("clients").select("*"),
    db.from("members").select("*"),
    db.from("actions").select("id, client_id, data"),
    db.from("projects").select("id, client_id, data"),
    db.from("files").select("id, client_id, data"),
    db.from("app_settings").select("*").eq("key", "global").maybeSingle(),
  ]);
  if (clientsR.error || membersR.error || actionsR.error) {
    return NextResponse.json({ ok: false, error: clientsR.error?.message || membersR.error?.message || actionsR.error?.message }, { status: 500 });
  }
  const rules: Rules = { ...DEFAULT_RULES, ...((settingsR.data?.data as { rules?: Rules })?.rules ?? {}) };

  // people data for the Huddle's People section, the monthly snapshot and the managers' Monday email
  const [pHires, pRoles, pCands, pDeps, pPeople, pShouts] = await Promise.all([
    db.from("hires").select("id, client_id, data"),
    db.from("roles").select("id, client_id, data"),
    db.from("candidates").select("id, data"),
    db.from("departures").select("id, client_id, data"),
    db.from("people").select("id, client_id, data"),
    db.from("shoutouts").select("client_id, data").gte("created_at", new Date(Date.now() - 70 * 864e5).toISOString()),
  ]);
  const prow = <T,>(r: { data: { id?: string; client_id?: string; data: unknown }[] | null; error: unknown }) => (r.error ? [] : (r.data ?? []).map((x) => ({ ...(x.data as object), ...(x.id ? { id: x.id } : {}), ...(x.client_id ? { clientId: x.client_id } : {}) }) as T));
  const peopleData = (cfg: Partial<ClientConfig>): PeopleData => ({
    hires: prow<Hire>(pHires),
    roles: prow<PeopleData["roles"][number]>(pRoles),
    candidates: prow<PeopleData["candidates"][number]>(pCands),
    departures: prow<Departure>(pDeps),
    roster: prow<TeamMember>(pPeople),
    shouts: (pShouts.error ? [] : pShouts.data ?? []).map((x) => x.data as PeopleData["shouts"][number]),
    steps: stepsFor(onboardingFor(cfg.onboarding)),
  });
  const members = (membersR.data ?? []) as Member[];
  const rows = (r: { data: Row[] | null }) => (r.data ?? []).map((x) => ({ ...x.data, id: x.id, clientId: x.client_id }));
  const actions = rows(actionsR) as unknown as Action[];
  const projects = rows(projectsR) as unknown as Project[];
  const files = rows(filesR) as unknown as SharedFile[];

  // send once per key
  const once = async (key: string, send: () => Promise<{ ok: boolean; reason?: string }>) => {
    const { error } = await db.from("email_log").insert({ key });
    if (error) return; // already sent
    const r = await send();
    if (!r.ok) {
      await db.from("email_log").delete().eq("key", key); // let tomorrow's run retry
      log.push(`failed ${key}: ${r.reason}`);
    } else log.push(`sent ${key}`);
  };

  for (const c of clientsR.data ?? []) {
    const cfg = (c.config ?? {}) as Partial<ClientConfig>;
    const team = members.filter((m) => m.client_id === c.id);
    const escM = team.find((m) => m.email === (cfg.escalationEmail || "").toLowerCase());
    const client: Client = {
      id: c.id,
      name: c.name,
      engagement: c.engagement,
      pilot: c.pilot,
      accent: cfg.accent || "#19283c",
      logo: cfg.logo && !cfg.logo.startsWith("data:") ? cfg.logo : undefined,
      escalation: escM ? { name: escM.name, role: escM.role, email: escM.email } : { name: "", role: "" },
      contacts: team.map((m) => ({ name: m.name, role: m.role, email: m.email })),
    };
    const huddle: HuddleSettings = { cadence: "weekly", day: 1, skipIfQuiet: true, bundleReminders: true, personalNote: "", ...(cfg.huddle ?? {}), recipients: team.filter((m) => m.huddle).map((m) => m.email) };
    const bundled = huddle.bundleReminders && huddle.cadence !== "off";

    // ---------- 1. task reminders
    for (const a of actions.filter((x) => x.clientId === c.id && x.side === "client" && x.status !== "completed")) {
      const ownerEmail = (a.owner.email || team.find((m) => m.name === a.owner.name)?.email || "").toLowerCase();
      const link = `${PORTAL_URL}/c/${c.id}/a/${a.id}`;
      for (const step of reminderPlan(a, client, rules, bundled)) {
        if (toISO(step.date) !== day) continue;
        const key = `rem:${a.id}:${step.label}:${day}`;
        const first = a.owner.name.split(" ")[0];
        if (step.label.includes("(in HR Huddle)")) continue; // rides along in the Huddle instead
        if (step.label.startsWith("Friendly") || step.label.startsWith("Due-date") || step.label.startsWith("Overdue")) {
          if (!ownerEmail) continue;
          const subj =
            step.label.startsWith("Friendly") ? `Coming up: ${a.title} (due ${fmt(a.due)})` : step.label.startsWith("Due-date") ? `Due today: ${a.title}` : `Overdue: ${a.title}`;
          const body = `Hi ${first},\n\n${step.label.startsWith("Overdue") ? `"${a.title}" was due ${fmt(a.due)} and is still open.` : `Quick reminder: "${a.title}" is due ${fmt(a.due)}.`}${a.impact ? `\n\nWhy it matters: ${a.impact}` : ""}\n\nIt takes a minute from your phone: ${link}\n\nNeed more time? Tap "More time" on that page.\n\nBen`;
          if (!step.label.startsWith("Friendly")) await once(`push:${key}`, async () => {
            await pushTo(db, [ownerEmail], "reminders", { title: subj.replace(/:.*$/, ""), body: a.title, url: `/c/${c.id}/a/${a.id}`, tag: `rem-${a.id}` });
            return { ok: true };
          });
          await once(key, () => sendEmail({ to: [ownerEmail], subject: subj, text: body, html: `<div style="font:15px/1.55 Arial,sans-serif;color:#16213a;max-width:520px">${esc(body).replace(/\n/g, "<br>").replace(esc(link), `<a href="${link}">${esc(link)}</a>`)}</div>` }));
        } else if (step.label === "Escalation") {
          const toEsc = client.escalation.email && client.escalation.email !== ownerEmail ? client.escalation.email : null;
          if (toEsc) {
            const body = `Hi ${client.escalation.name.split(" ")[0]},\n\nHeads up: "${a.title}" (owned by ${a.owner.name}) was due ${fmt(a.due)} and is still open.${a.impact ? `\n\nWhy it matters: ${a.impact}` : ""}\n\nDetails: ${link}\n\nBen`;
            await once(`push:${key}`, async () => {
              await pushTo(db, [toEsc], "reminders", { title: "Needs a nudge", body: `${a.title} (${a.owner.name}) is past due`, url: `/c/${c.id}/a/${a.id}`, tag: `esc-${a.id}` });
              return { ok: true };
            });
            await once(key, () => sendEmail({ to: [toEsc], subject: `Needs a nudge: ${a.title}`, text: body }));
          } else {
            await once(`push:${key}`, async () => {
              await pushTo(db, benPush, "reminders", { title: `Check in with ${a.owner.name}`, body: `${a.title} at ${c.name} is past due`, url: `/c/${c.id}/a/${a.id}`, tag: `esc-${a.id}` });
              return { ok: true };
            });
            await once(key, () => sendEmail({ to: [ben], subject: `[Portal] Check in with ${a.owner.name}: ${a.title}`, text: `"${a.title}" at ${c.name} is past due and ${a.owner.name} is the escalation contact. Worth a quick call.\n\n${link}` }));
          }
        } else if (step.label.startsWith("Flagged as blocker")) {
          await once(`push:${key}`, async () => {
            await pushTo(db, benPush, "reminders", { title: `Blocker at ${c.name}`, body: `${a.title} (${a.owner.name})`, url: `/c/${c.id}/a/${a.id}`, tag: `blk-${a.id}` });
            return { ok: true };
          });
          await once(key, () => sendEmail({ to: [ben], subject: `[Portal] Blocker at ${c.name}: ${a.title}`, text: `"${a.title}" (${a.owner.name}) is ${rules.blockerAfter} business days overdue.\n\n${link}` }));
        }
      }
    }

    // ---------- 2. HR Huddle
    if (huddleDue(huddle, now) && huddle.recipients.length) {
      const people = cfg.modules?.hires || cfg.modules?.recruiting || cfg.modules?.offboarding ? peopleItems(c.id, peopleData(cfg), day) : [];
      const out = buildHuddle({ client, settings: huddle, actions, projects, files, rules, softAsks: cfg.softAsks, people });
      if (out.quiet && huddle.skipIfQuiet) {
        log.push(`huddle skipped (quiet) ${c.id}`);
      } else {
        let sent = 0;
        for (const to of huddle.recipients) {
          await once(`huddle:${c.id}:${to}:${day}`, async () => {
            const r = await sendEmail({ to: [to], subject: out.subject, html: out.html, text: out.text });
            if (r.ok) sent++;
            return r;
          });
        }
        if (sent) {
          const nextCfg = { ...cfg, huddle: { ...(cfg.huddle ?? {}), lastSent: new Date().toISOString(), personalNote: "" } };
          await db.from("clients").update({ config: nextCfg }).eq("id", c.id);
        }
      }
    }
  }

  // ---------- 2b. Monthly snapshot for executives: first week of the month, on the Huddle's day (same people)
  for (const c of clientsR.data ?? []) {
    const cfg = (c.config ?? {}) as Partial<ClientConfig>;
    const h = { day: 1, ...(cfg.huddle ?? {}) } as HuddleSettings;
    if (h.snapshot === false) continue;
    const jsDay = new Date(`${day}T12:00:00`);
    if (jsDay.getDate() > 7 || jsDay.getDay() !== (h.day || 1)) continue;
    const to = members.filter((m) => m.client_id === c.id && m.huddle).map((m) => m.email);
    if (!to.length) continue;
    const ym = day.slice(0, 7);
    const lastMonth = (iso?: string) => {
      if (!iso) return false;
      const d = new Date(`${ym}-01T12:00:00`);
      d.setMonth(d.getMonth() - 1);
      return iso.slice(0, 7) === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const acts = actions.filter((a) => a.clientId === c.id && a.status === "completed" && lastMonth(a.completedAt)).length;
    const projs = (rows(projectsR) as unknown as Project[]).filter((p) => p.clientId === c.id && p.status === "done" && lastMonth(p.milestoneDue)).length;
    const snap = buildSnapshot({ client: { id: c.id, name: c.name, accent: cfg.accent || "#19283c", logo: cfg.logo && !cfg.logo.startsWith("data:") ? cfg.logo : undefined }, data: peopleData(cfg), actionsDone: acts, projectsDone: projs, today: day });
    for (const r of to) await once(`snapshot:${c.id}:${r}:${ym}`, () => sendEmail({ to: [r], subject: snap.subject, html: snap.html, text: snap.text }));
  }

  // ---------- 3. New hires: welcome email, first-day email, start, 30-day check-in
  const hiresR = await db.from("hires").select("id, client_id, data");
  for (const row of hiresR.data ?? []) {
    const c = (clientsR.data ?? []).find((x) => x.id === row.client_id);
    if (!c) continue;
    const cfg = (c.config ?? {}) as Partial<ClientConfig>;
    const h = { ...(row.data as Hire), id: row.id, clientId: row.client_id };
    const s0 = onboardingFor(cfg.onboarding);
    const co = hireCompany(h, s0);
    const { s, brand } = forCompany(h, s0, { company: c.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(c.id, cfg.logo, cfg.logoEmail, PORTAL_URL) }, co ? emailLogoUrl(c.id, co.logo, co.logoEmail, PORTAL_URL, co.id) : undefined);
    const sender = senderFor(s, brand.company);
    if (!h.startDate) continue;
    const data = { ...(row.data as Hire) };
    let changed = false;
    const note = (text: string) => {
      data.history = [...(data.history ?? []), { at: new Date().toISOString(), by: "AlzaHR", text }];
      changed = true;
    };
    const signed = stageIndex(h.status) >= 2;
    const to = h.imported || h.outcome ? "" : (h.personalEmail || "").trim().toLowerCase();
    if (s.autoSend && signed && to && !h.emails?.welcome) {
      const m = welcomeEmail(h, s, brand);
      await once(`hire:welcome:${h.id}`, async () => {
        const r = await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...sender });
        if (r.ok) {
          data.emails = { ...(data.emails ?? {}), welcome: new Date().toISOString() };
          note(`Welcome email sent to ${to}`);
        }
        return r;
      });
    }
    if (s.autoSend && signed && to && !h.emails?.firstDay && day >= addDaysISO(h.startDate, -s.firstDayDaysBefore) && day <= h.startDate) {
      const m = firstDayEmail(h, s, brand);
      await once(`hire:firstday:${h.id}`, async () => {
        const r = await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...sender });
        if (r.ok) {
          data.emails = { ...(data.emails ?? {}), firstDay: new Date().toISOString() };
          if (stageIndex(data.status) < 4) data.status = "First-day email sent";
          note(`First-day email sent to ${to}`);
        }
        return r;
      });
    }
    if (signed && !h.outcome && day >= h.startDate && data.status !== "Started") {
      data.status = "Started";
      note("Started");
    }
    // on (or after) the start date: add them to the team roster, so shoutouts, celebrations
    // and the Welcome Wagon pick them up. Matches an existing roster entry by name instead of duplicating.
    if (signed && !h.imported && !h.outcome && day >= h.startDate && !h.rosterId && h.name?.trim()) {
      const { data: ppl } = await db.from("people").select("id, data").eq("client_id", c.id);
      const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
      const hit = (ppl ?? []).find((r) => same((r.data as TeamMember).name, h.name));
      const mgr = (ppl ?? []).map((r) => r.data as TeamMember).find((p) => same(p.name, h.managerName));
      if (hit) {
        const p = hit.data as TeamMember;
        if (!p.hireDate || !p.active || (!p.email && h.workEmail) || (!p.birthday && h.birthday)) await db.from("people").update({ data: { ...p, hireDate: p.hireDate || h.startDate, email: p.email || h.workEmail || undefined, birthday: p.birthday || h.birthday || undefined, active: true } }).eq("id", hit.id);
        data.rosterId = hit.id as string;
        note("Already on the team roster");
      } else {
        const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const person: Omit<TeamMember, "id" | "clientId"> = {
          name: h.name.trim(),
          title: h.title || "",
          email: h.workEmail?.trim().toLowerCase() || undefined,
          birthday: /^\d{2}-\d{2}$/.test(h.birthday || "") ? h.birthday : undefined,
          managerName: h.managerName || "",
          managerEmail: (mgr?.email || "").toLowerCase(),
          hireDate: h.startDate,
          location: h.location || undefined,
          department: mgr?.department || undefined,
          cell: cleanCell(h.cell || "") || undefined,
          active: true,
        };
        const { error } = await db.from("people").insert({ id, client_id: c.id, data: person });
        if (!error) {
          data.rosterId = id;
          note("Added to the team roster");
        }
      }
      changed = true;
    }
    // added before the work email or birthday was known: fill them in later
    if (h.rosterId && (h.workEmail || h.birthday)) {
      const { data: pr } = await db.from("people").select("data").eq("id", h.rosterId).maybeSingle();
      const p = pr?.data as TeamMember | undefined;
      if (p && ((!p.email && h.workEmail) || (!p.birthday && h.birthday))) await db.from("people").update({ data: { ...p, email: p.email || h.workEmail?.toLowerCase(), birthday: p.birthday || h.birthday } }).eq("id", h.rosterId);
    }
    // employee experience: the get-to-know-you link and reminder, the company intro on day one, buddy nudges
    const x = s0.experience;
    if (xpOn(x) && !h.imported && !h.outcome && !h.xp?.closed) {
      const xp: HireXp = { ...(data.xp ?? {}) };
      let xpChanged = false;
      const xnote = (text: string) => {
        note(text);
        xpChanged = true;
      };
      if (introOn(x) && s.autoSend && signed && to && h.emails?.welcome && !xp.linkSentAt && day < h.startDate) {
        if (!xp.token) {
          xp.token = newToken();
          xpChanged = true;
        }
        const m = linkEmail(h, x, brand, `${PORTAL_URL}/welcome/${xp.token}`);
        await once(`xp:link:${h.id}`, async () => {
          const r = await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...sender });
          if (r.ok) {
            xp.linkSentAt = new Date().toISOString();
            xnote(`Get-to-know-you link sent to ${to}`);
          }
          return r;
        });
      }
      if (introOn(x) && x?.remind !== false && to && xp.token && xp.linkSentAt && !xp.submittedAt && !xp.remindedAt && day < h.startDate && day >= addDaysISO(xp.linkSentAt.slice(0, 10), 3)) {
        const m = linkEmail(h, x, brand, `${PORTAL_URL}/welcome/${xp.token}`, true);
        await once(`xp:remind:${h.id}`, async () => {
          const r = await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...sender });
          if (r.ok) {
            xp.remindedAt = new Date().toISOString();
            xnote(`Get-to-know-you reminder sent to ${to}`);
          }
          return r;
        });
      }
      // the company intro: only once they approved it, on their day (or up to 3 days late), never twice
      const iday = introDay({ ...h, xp });
      if (introOn(x) && xp.approvedAt && !xp.intro?.sentAt && !xp.intro?.cancelled && iday && day >= iday && day <= addDaysISO(iday, 3)) {
        const { data: ppl } = await db.from("people").select("id, data").eq("client_id", c.id);
        const roster = (ppl ?? []).map((r) => ({ ...(r.data as TeamMember), id: r.id as string }));
        const audience = xp.intro?.audience ?? x?.audience ?? "all";
        const norm = (v?: string) => (v || "").trim().toLowerCase();
        const me = roster.find((p) => p.id === data.rosterId);
        const site = norm(me?.location || h.location);
        const emails = [
          ...new Set(
            roster
              .filter((p) => p.active !== false && p.email && p.id !== data.rosterId && norm(p.name) !== norm(h.name))
              .filter((p) => audience === "all" || (!!site && (norm(p.location) === site || norm(p.location).includes(site) || site.includes(norm(p.location) || "\u0000"))) || norm(p.name) === norm(h.managerName))
              .map((p) => norm(p.email))
              .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== to)
          ),
        ];
        const photoOk = x?.photos !== false && xp.sharePhoto !== false && !!xp.photo && /^hires\//.test(xp.photo);
        const photoUrl = photoOk ? (await db.storage.from("client-files").createSignedUrl(xp.photo!, 60 * 60 * 24 * 30)).data?.signedUrl : undefined;
        const wantWall = (xp.intro?.wall ?? x?.wall ?? true) && !!cfg.modules?.recognition;
        const rec = (cfg as { recognition?: { token?: string } }).recognition;
        const wallUrl = wantWall && rec?.token ? `${PORTAL_URL}/shout/${rec.token}` : undefined;
        const m = introEmail({ ...h, xp }, x, brand, photoUrl, wallUrl);
        if (emails.length)
          await once(`xp:intro:${h.id}`, async () => {
            let sent = 0;
            let fail = "";
            for (let k = 0; k < emails.length; k += 8) {
              const rs = await Promise.all(emails.slice(k, k + 8).map((e) => sendEmail({ to: [e], subject: m.subject, html: m.html, text: m.text, ...sender })));
              rs.forEach((r) => (r.ok ? sent++ : (fail = r.reason || "failed")));
            }
            if (!sent) return { ok: false, reason: fail };
            xp.intro = { ...(xp.intro ?? {}), sentAt: new Date().toISOString(), sentTo: sent, failed: fail ? `${emails.length - sent} didn't go through (${fail})` : undefined };
            xnote(`Company intro sent to ${sent} ${sent === 1 ? "person" : "people"}${fail ? `; ${emails.length - sent} didn't go through` : ""}`);
            return { ok: true };
          });
        else if (!xp.intro?.failed) {
          xp.intro = { ...(xp.intro ?? {}), failed: "No one on the roster has an email to send it to" };
          xnote("Company intro not sent: no one on the roster has an email yet");
        }
        // and on the Team Wall, from the company
        if (wantWall && data.rosterId && xp.intro?.sentAt) {
          await once(`xp:wall:${h.id}`, async () => {
            const id = `so${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
            const lines = m.lines.slice(0, 2).map((l) => `${l.label}: ${l.text}`).join(". ");
            const message = `${m.subject.replace(/!$/, "")}! ${lines}`.replace(/\s+/g, " ").trim().slice(0, 280);
            const shout = { id, clientId: c.id, to: { personId: data.rosterId!, name: h.name, department: me?.department, location: me?.location || h.location }, from: { name: `${c.name}`, verified: true }, message, channel: "portal", status: "live", at: new Date().toISOString() };
            const { error } = await db.from("shoutouts").insert({ id, client_id: c.id, data: shout });
            return error ? { ok: false, reason: error.message } : { ok: true };
          });
        }
      }
      // buddy nudges, on their day (or up to 3 days late), unless the buddy already ticked them off
      const b = xp.buddy;
      if (buddyOn(x) && b?.status === "yes" && b.token)
        for (const n of nudgesFor(x)) {
          const nd = nudgeDay(h, n);
          if (!nd || day < nd || day > addDaysISO(nd, 3) || b.log?.[n.id] || buddyNudgeDone(b, n.id)) continue;
          const m = nudgeEmail({ ...h, xp }, brand, n, b.name, `${PORTAL_URL}/buddy/${b.token}`);
          await once(`xp:nudge:${h.id}:${n.id}`, async () => {
            const r = await sendEmail({ to: [b.email], subject: m.subject, html: m.html, text: m.text, ...sender });
            if (r.ok) {
              xp.buddy = { ...xp.buddy!, log: { ...(xp.buddy!.log ?? {}), [n.id]: new Date().toISOString() } };
              xnote(`Buddy check-in sent to ${b.name}`);
            }
            return r;
          });
        }
      if (xpChanged) {
        data.xp = xp;
        changed = true;
      }
    }
    // tracker steps with a day count (the 30-day check-in by default): remind HR and the manager, copy Ben
    for (const st of dueReminders(h, stepsFor(s0), day)) {
      if (st.id === "day30" && h.emails?.checkIn) continue; // sent by the older 30-day reminder
      if (h.emails?.[`step:${st.id}`]) continue;
      const hr = (s0.hrEmail || "").trim().toLowerCase();
      const mgr = await managerEmail(db, c.id, h).catch(() => null);
      const toList = [...new Set([hr, mgr].filter((x): x is string => !!x))];
      const cc = toList.includes(ben.toLowerCase()) ? [] : [ben];
      const first = (h.firstName || h.name || "").split(" ")[0];
      const isCheck = /check|review/i.test(st.label);
      const link = `${PORTAL_URL}/c/${c.id}/hires?open=${h.id}`;
      const subject = isCheck ? `${h.name} is at ${st.days} days: time for a quick check-in` : `${h.name}, ${st.days} days in: ${st.label}`;
      const text = isCheck
        ? `${h.name} (${h.title || "new hire"}) is at ${st.days} days${c.name ? ` at ${c.name}` : ""}.\n\nA good time for a quick review with ${first}: how they're settling in, what's going well, and anything they need${h.managerName ? `. ${h.managerName.split(" ")[0]}, a short 1:1 this week works well` : ""}.\n\nMark it done in the new hire tracker once you've met:\n${link}`
        : `${h.name} (${h.title || "new hire"}) is at ${st.days} days and "${st.label}" isn't marked done yet.\n\nUpdate the new hire tracker here:\n${link}`;
      await once(`hire:step:${h.id}:${st.id}`, async () => {
        const r = await sendEmail({ to: toList.length ? toList : [ben], cc: toList.length ? cc : undefined, subject, text });
        if (r.ok) {
          data.emails = { ...(data.emails ?? {}), [`step:${st.id}`]: new Date().toISOString() };
          note(`${st.label} reminder sent to ${toList.length ? toList.join(", ") : "Ben"}`);
        }
        return r;
      });
    }
    if (changed) await db.from("hires").update({ data }).eq("id", row.id);
  }

  // ---------- 4. Pitch videos: delete a week after the role's cutoff (30 days after sending if no cutoff), or when Ben clears them
  const [candR, rolesR] = await Promise.all([db.from("candidates").select("id, client_id, data").eq("data->>source", "pitch"), db.from("roles").select("id, data")]);
  const cutoff = new Map((rolesR.data ?? []).map((r) => [r.id as string, (r.data as { pitch?: { closesAt?: string } })?.pitch?.closesAt]));
  for (const row of candR.data ?? []) {
    const c = row.data as Candidate;
    if (!c.pitch?.mediaPath || c.mediaDeletedAt) continue;
    const due = pitchDeleteOn(c, cutoff.get(c.roleId));
    if (!due || due > new Date()) continue;
    const path = c.pitch.mediaPath;
    if (!path.startsWith(`${row.client_id}/pitch/${row.id}/`)) continue;
    const { error } = await db.storage.from("client-files").remove([path]);
    if (error) {
      log.push(`pitch delete failed ${row.id}: ${error.message}`);
      continue;
    }
    const data = { ...c, mediaDeletedAt: new Date().toISOString(), pitch: { ...c.pitch, mediaPath: undefined } };
    await db.from("candidates").update({ data }).eq("id", row.id);
    log.push(`pitch video deleted ${row.id}`);
  }

  // ---------- 5. Manager Hub: birthdays, work anniversaries, new starters, and the Monday list
  const [peopleR, logsR] = await Promise.all([db.from("people").select("id, client_id, data"), db.from("checkins").select("id, client_id, data")]);
  if (!peopleR.error) {
    const people = rows(peopleR) as unknown as TeamMember[];
    const logs = (logsR.error ? [] : rows(logsR)) as unknown as TeamLog[];
    const jsNow = new Date(`${day}T12:00:00`);
    const monday = jsNow.getDay() === 1;
    for (const c of clientsR.data ?? []) {
      const cfg = (c.config ?? {}) as Partial<ClientConfig>;
      const s = onboardingFor(cfg.onboarding);
      const brand = { company: c.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(c.id, cfg.logo, cfg.logoEmail, PORTAL_URL) };
      const hubUrl = `${PORTAL_URL}/c/${c.id}/hub`;
      const roster = people.filter((p) => p.clientId === c.id && p.active !== false);
      // managers: anyone with people reporting to them, plus anyone named as a new hire's manager
      const hireMgrs = prow<Hire>(pHires).filter((h) => h.clientId === c.id && !h.outcome && h.managerName).map((h) => h.managerName.trim().toLowerCase());
      const byName = members.filter((x) => x.client_id === c.id && hireMgrs.includes((x.name || "").trim().toLowerCase())).map((x) => x.email.toLowerCase());
      const mgrs = Array.from(new Set([...roster.map((p) => (p.managerEmail || "").toLowerCase()), ...byName].filter(Boolean)));
      for (const mgr of mgrs) {
        // only people who can sign in get reminders
        const m = members.find((x) => x.client_id === c.id && x.email.toLowerCase() === mgr);
        if (!m) continue;
        const team = teamFor(people, c.id, mgr);
        const first = m.name.split(" ")[0];
        // dated events: 3 days ahead and the day of
        const events: { key: string; title: string; why: string }[] = [];
        for (const p of team) {
          const pf = p.name.split(" ")[0];
          const b = p.birthday ? nextYearly(p.birthday, jsNow) : null;
          if (b && (b.days === 3 || b.days === 0)) events.push({ key: `bd:${p.id}:${b.days}:${day}`, title: b.days === 0 ? `It's ${pf}'s birthday today` : `${pf}'s birthday is ${b.date.toLocaleDateString("en-US", { weekday: "long" })}`, why: b.days === 0 ? "A quick message or a card from you goes a long way." : "Plan something small: a card, a shout-out, a treat." });
          const a = p.hireDate ? anniversary(p.hireDate, jsNow) : null;
          if (a && (a.days === 3 || a.days === 0)) events.push({ key: `an:${p.id}:${a.days}:${day}`, title: a.days === 0 ? `${pf}'s ${a.years}-year work anniversary is today` : `${pf}'s ${a.years}-year work anniversary is ${a.date.toLocaleDateString("en-US", { weekday: "long" })}`, why: `Recognize ${a.years === 1 ? "their first year" : `${a.years} years`} in front of the team.` });
          if (p.hireDate && p.hireDate === addDaysISO(day, 1)) events.push({ key: `st:${p.id}:${day}`, title: `${pf} starts tomorrow`, why: "Be there to greet them, and block time for a first-day check-in." });
        }
        if (events.length) {
          const mail = listEmail(brand, "Your team", events.length === 1 ? events[0].title : `${events.length} things for your team`, `Hi ${first}, a heads-up from your Manager Hub.`, events, { label: "Open your Manager Hub", url: hubUrl });
          await once(`team:${c.id}:${mgr}:${day}`, () => sendEmail({ to: [mgr], subject: events.length === 1 ? events[0].title : `${events.length} things for your team this week`, html: mail.html, text: mail.text, ...senderFor(s, c.name) }));
          await once(`team-push:${c.id}:${mgr}:${day}`, async () => {
            await pushTo(db, [mgr], "team", { title: events[0].title, body: events.length > 1 ? `+${events.length - 1} more for your team` : events[0].why, url: `/c/${c.id}/hub`, tag: `team-${c.id}-${day}` });
            return { ok: true };
          });
        }
        // Monday: the managers' weekly email (their new hires, their week, recognize someone, a thought)
        if (monday && cfg.huddle?.managerWeekly !== false) {
          const mw = buildManagerWeek({ client: { id: c.id, name: c.name, accent: cfg.accent || "#19283c", logo: cfg.logo && !cfg.logo.startsWith("data:") ? cfg.logo : undefined }, manager: { name: m.name, email: mgr }, team, logs, hires: prow<Hire>(pHires), steps: stepsFor(s), recognitionOn: !!cfg.modules?.recognition, trainingOn: !!cfg.modules?.training, today: day, experience: s.experience });
          if (mw) {
            await once(`team-week:${c.id}:${mgr}:${day}`, () => sendEmail({ to: [mgr], subject: mw.subject, html: mw.html, text: mw.text, ...senderFor(s, c.name) }));
            await once(`team-week-push:${c.id}:${mgr}:${day}`, async () => {
              await pushTo(db, [mgr], "team", { title: "Your week", body: mw.subject.replace(/^Your week: /, ""), url: `/c/${c.id}/hub`, tag: `team-week-${c.id}` });
              return { ok: true };
            });
          }
        }
      }
    }
  }

  // ---------- 6. Celebration emails: birthdays and work anniversaries, if the client turned them on
  if (!peopleR.error) {
    const people = rows(peopleR) as unknown as TeamMember[];
    const today = localToday();
    for (const c of clientsR.data ?? []) {
      const cfg = (c.config ?? {}) as ClientConfig;
      const rec = cfg.recognition;
      if (!(cfg.modules as Record<string, boolean> | undefined)?.recognition || !rec?.token || !(rec.autoEmail?.birthday || rec.autoEmail?.anniversary)) continue;
      const sc = { id: c.id, name: c.name, config: cfg, rec };
      // celebrations() already skips anyone who opted out or has left
      for (const cel of celebrations(people.filter((p) => p.clientId === c.id), today, 0)) {
        if (cel.kind === "new" || (cel.kind === "birthday" && !rec.autoEmail?.birthday) || (cel.kind === "anniversary" && !rec.autoEmail?.anniversary)) continue;
        const p = people.find((x) => x.id === cel.personId);
        if (!p?.email) continue;
        const m = await celebrateMail(sc, PORTAL_URL, p, cel.kind, cel.years);
        await once(`cel:${cel.kind}:${c.id}:${p.id}:${day}`, () => sendEmail({ to: [p.email!], subject: m.subject, text: m.text, html: m.html, fromName: m.fromName, fromBox: m.fromBox }));
      }
    }
  }

  // ---------- 7. Appreciation Chain: remind whoever holds the baton when about half their time is left
  {
    const chR = await db.from("challenges").select("id, client_id, data");
    if (!chR.error) {
      for (const row of chR.data ?? []) {
        const ch = row.data as Challenge;
        if (ch.kind !== "chain" || !challengeLive(ch)) continue;
        const cl = (clientsR.data ?? []).find((x) => x.id === row.client_id);
        const cfg = (cl?.config ?? {}) as ClientConfig;
        if (!cl || !cfg.recognition?.token || !(cfg.modules as Record<string, boolean> | undefined)?.recognition) continue;
        const shouts = await shoutsSince(db, cl.id, ch.startedAt);
        const people = rows(peopleR) as unknown as TeamMember[];
        const win = ch.chain?.windowDays ?? 3;
        for (const b of chainStats(ch, shouts).open) {
          const left = b.daysLeft;
          if (left !== Math.max(1, Math.floor(win / 2))) continue;
          const p = people.find((x) => x.id === b.personId);
          if (!p?.email) continue;
          const url = `${PORTAL_URL}/shout/${cfg.recognition.token}?pass=${b.shoutId}`;
          await once(`chain:${b.shoutId}:remind`, () =>
            sendEmail({
              to: [p.email!],
              subject: `🔗 ${left === 1 ? "1 day" : `${left} days`} left to pass on the ${ch.title}`,
              text: `Hi ${p.name.split(" ")[0]},\n\nYou're holding link #${b.link} in the ${ch.title}. Don't let the chain of recognition end with you: recognize someone in the next ${left === 1 ? "day" : `${left} days`}.\n\nPass it on: ${url}`,
              ...celebrateSender(cfg.recognition, cl.name),
            })
          );
        }
      }
    }
  }

  // ---------- 8. Nudges: send waves 2 and 3 when their day comes
  {
    const nR = await db.from("nudges").select("id, client_id, data").gte("created_at", new Date(Date.now() - 10 * 864e5).toISOString());
    for (const row of nR.error ? [] : nR.data ?? []) {
      const n = row.data as Nudge;
      const cl = (clientsR.data ?? []).find((x) => x.id === row.client_id);
      const cfg = (cl?.config ?? {}) as ClientConfig;
      if (!cl || !cfg.recognition?.token || !(cfg.modules as Record<string, boolean> | undefined)?.recognition) continue;
      for (let i = 1; i < n.plan.length; i++) {
        if (n.plan[i].sentAt || new Date(n.plan[i].at).getTime() > Date.now() + 3 * 3600e3) continue;
        const sent = await sendNudgeWave(db, PORTAL_URL, { id: cl.id, name: cl.name, config: cfg, rec: cfg.recognition }, n, i);
        log.push(`nudge ${n.id} wave ${i + 1}: ${sent} sent`);
        break; // one wave per nudge per day
      }
    }
  }

  // ---------- 9. Leave center: one reminder email a day per HR admin, case number and first name only
  {
    const lR = await db.from("leave_cases").select("client_id, data");
    const aR = await db.from("leave_admins").select("client_id, email");
    const lt = localToday();
    const leaveToday = `${lt.getFullYear()}-${String(lt.getMonth() + 1).padStart(2, "0")}-${String(lt.getDate()).padStart(2, "0")}`;
    const monday = new Date(`${leaveToday}T12:00:00`).getDay() === 1;
    for (const cl of clientsR.data ?? []) {
      const cfg = (cl.config ?? {}) as ClientConfig;
      if (!(cfg.modules as Record<string, boolean> | undefined)?.leave) continue;
      const set: LeaveSettings & typeof LEAVE_DEFAULTS = { ...LEAVE_DEFAULTS, ...(cfg.leave ?? {}) };
      const cases = (lR.error ? [] : lR.data ?? []).filter((r) => r.client_id === cl.id).map((r) => r.data as LeaveCase).filter((c) => OPEN_STATUSES.includes(c.status));
      if (!cases.length) continue;
      const hr = (aR.error ? [] : aR.data ?? []).filter((r) => r.client_id === cl.id).map((r) => String(r.email).toLowerCase());
      const remind = (d: Due) =>
        d.kind === "return" ? d.days === set.returnDays || d.days === 7 || d.days === 1 || d.days === 0 :
        d.kind === "followup" || d.kind === "extension" ? monday || d.days === 0 :
        d.days < 0 ? d.days === -1 || (-d.days) % 7 === 0 :
        set.remindDays.includes(d.days);
      const byWho = new Map<string, { line: string; days: number }[]>();
      const short = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0]; };
      for (const c of cases) {
        const items = dueItems([c], set, leaveToday).filter(remind);
        if (!items.length) continue;
        const owner = c.assignedTo?.email?.toLowerCase();
        const to = new Set([...(owner && (hr.includes(owner) || benPush.includes(owner)) ? [owner] : hr), ...benPush, ...(set.notify ?? [])]);
        for (const d of items) {
          const when = d.days < 0 ? `${-d.days} day${d.days === -1 ? "" : "s"} overdue` : d.days === 0 ? "today" : `in ${d.days} day${d.days === 1 ? "" : "s"} (${fmtDay(d.due)})`;
          const line = `${c.number} · ${short(c.employee.name)}: ${d.kind === "return" ? "expected back" : d.title} ${when}`;
          for (const e of to) byWho.set(e, [...(byWho.get(e) ?? []), { line, days: d.days }]);
        }
      }
      const brand = { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(cl.id, cfg.logo, cfg.logoEmail, PORTAL_URL) };
      const url = `${PORTAL_URL}/c/${cl.id}/leave?tab=tasks`;
      for (const [email, list] of byWho) {
        const sorted = list.sort((a, b) => a.days - b.days);
        const late = sorted.filter((x) => x.days < 0).length;
        await once(`leave:${cl.id}:${email}:${leaveToday}`, () => {
          const m = listEmail(brand, "Leave center", `${sorted.length} leave item${sorted.length === 1 ? "" : "s"} need${sorted.length === 1 ? "s" : ""} attention`, late ? `${late} ${late === 1 ? "is" : "are"} overdue. Details are in the portal.` : "Here's what's coming up. Details are in the portal.", sorted.map((x) => ({ title: x.line, why: "" })), { label: "Open the leave center", url });
          return sendEmail({ to: [email], subject: `${cl.name}: ${sorted.length} leave item${sorted.length === 1 ? "" : "s"} ${late ? `(${late} overdue)` : "coming up"}`, text: `${sorted.map((x) => `- ${x.line}`).join("\n")}\n\nOpen the leave center: ${url}`, html: m.html });
        });
      }
      if (byWho.size) await pushTo(db, [...byWho.keys()], "reminders", { title: `${cl.name}: leave items due`, body: "Open the leave center for details.", url: `/c/${cl.id}/leave?tab=tasks`, tag: `leave-${cl.id}` }).catch(() => 0);
    }
  }

  // ---------- 10. Offboarding: goodbye email on schedule, off the roster on the last day
  {
    const dR = await db.from("departures").select("id, client_id, data");
    const offToday = (() => { const t = localToday(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; })();
    for (const row of dR.error ? [] : dR.data ?? []) {
      const c = (clientsR.data ?? []).find((x) => x.id === row.client_id);
      if (!c) continue;
      const cfg = (c.config ?? {}) as ClientConfig;
      if (!(cfg.modules as Record<string, boolean> | undefined)?.offboarding) continue;
      let d = { ...(row.data as Departure), id: row.id as string };
      if (d.status === "cancelled" || !d.lastDay) continue;
      const o = offboardFor(cfg.offboarding);
      if (o.autoSend && d.email?.auto !== false && !d.email?.sentAt && offToday >= sendOn(d, o) && offToday <= addDaysISO(d.lastDay, 3)) {
        await once(`offboard:goodbye:${d.id}`, async () => {
          const r = await sendGoodbye(db, PORTAL_URL, c.id, d, { by: "AlzaHR" });
          if (r.ok && r.departure) d = r.departure;
          return { ok: r.ok, reason: r.reason };
        });
      }
      if (offToday > d.lastDay && !d.rosterRemovedAt) {
        d = await offRoster(db, c.id, d, "AlzaHR");
        if (d.status === "planned") {
          d = { ...d, status: "departed", history: [...d.history, { at: new Date().toISOString(), by: "AlzaHR", text: "Last day passed" }] };
          await db.from("departures").update({ data: d }).eq("id", d.id);
        }
      }
    }
  }

  // ---------- 11. My list: schedule reminder emails that are now within two days
  {
    const soon = new Date(Date.now() + 48 * 3600e3).toISOString();
    const { data: due, error } = await db.from("my_list").select("*").eq("done", false).is("reminded_at", null).not("remind_at", "is", null).lte("remind_at", soon).limit(500);
    if (!error) for (const row of due ?? []) await syncReminder(db, row as ListRow);
  }

  return NextResponse.json({ ok: true, day, log });
}
