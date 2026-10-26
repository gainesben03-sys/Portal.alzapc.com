// Runs once every morning (Vercel Cron, see vercel.json).
//   1. Task reminders, overdue notices and escalations, following Ben's reminder rules.
//   2. HR Huddle recap emails for clients whose Huddle day is today.
// Each email is logged in email_log so a re-run never double-sends.
import { NextResponse } from "next/server";
import { Action, Client, DEFAULT_RULES, fmt, Project, reminderPlan, Rules, toISO, today } from "@/lib/data";
import { buildHuddle } from "@/lib/huddle";
import { Candidate, ClientConfig, HuddleSettings, SharedFile } from "@/lib/modules";
import { pitchDeleteOn } from "@/lib/pitch";
import { addDaysISO, firstDayEmail, forCompany, Hire, hireCompany, onboardingFor, senderFor, stageIndex, welcomeEmail } from "@/lib/hires";
import { emailLogoUrl } from "@/lib/brand";
import { admin, PORTAL_URL, sendEmail } from "@/lib/server";
import { advisorEmails, pushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      const out = buildHuddle({ client, settings: huddle, actions, projects, files, rules, softAsks: cfg.softAsks });
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
    const to = (h.personalEmail || "").trim().toLowerCase();
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
    if (signed && day >= h.startDate && data.status !== "Started") {
      data.status = "Started";
      note("Started");
    }
    if (day === addDaysISO(h.startDate, 30) && !h.emails?.checkIn) {
      await once(`hire:checkin:${h.id}`, async () => {
        const r = await sendEmail({ to: [ben], subject: `[Portal] 30-day check-in: ${h.name} at ${c.name}`, text: `${h.name} (${h.title}) hit 30 days at ${c.name} today. A good time to check in with them and ${h.managerName}.\n\n${PORTAL_URL}/c/${c.id}/hires/${h.id}` });
        if (r.ok) {
          data.emails = { ...(data.emails ?? {}), checkIn: new Date().toISOString() };
          note("30-day check-in reminder sent to Ben");
        }
        return r;
      });
    }
    if (changed) await db.from("hires").update({ data }).eq("id", row.id);
  }

  // ---------- 4. Pitch videos: delete a week after a decision (30 days if nobody decides)
  const candR = await db.from("candidates").select("id, client_id, data").eq("data->>source", "pitch");
  for (const row of candR.data ?? []) {
    const c = row.data as Candidate;
    if (!c.pitch?.mediaPath || c.mediaDeletedAt) continue;
    const due = pitchDeleteOn(c);
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

  return NextResponse.json({ ok: true, day, log });
}
