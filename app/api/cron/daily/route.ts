// Runs once every morning (Vercel Cron, see vercel.json).
//   1. Task reminders, overdue notices and escalations, following Ben's reminder rules.
//   2. HR Huddle recap emails for clients whose Huddle day is today.
// Each email is logged in email_log so a re-run never double-sends.
import { NextResponse } from "next/server";
import { Action, Client, DEFAULT_RULES, fmt, Project, reminderPlan, Rules, toISO, today } from "@/lib/data";
import { buildHuddle } from "@/lib/huddle";
import { ClientConfig, HuddleSettings, SharedFile } from "@/lib/modules";
import { admin, PORTAL_URL, sendEmail } from "@/lib/server";

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
          await once(key, () => sendEmail({ to: [ownerEmail], subject: subj, text: body, html: `<div style="font:15px/1.55 Arial,sans-serif;color:#16213a;max-width:520px">${esc(body).replace(/\n/g, "<br>").replace(esc(link), `<a href="${link}">${esc(link)}</a>`)}</div>` }));
        } else if (step.label === "Escalation") {
          const toEsc = client.escalation.email && client.escalation.email !== ownerEmail ? client.escalation.email : null;
          if (toEsc) {
            const body = `Hi ${client.escalation.name.split(" ")[0]},\n\nHeads up: "${a.title}" (owned by ${a.owner.name}) was due ${fmt(a.due)} and is still open.${a.impact ? `\n\nWhy it matters: ${a.impact}` : ""}\n\nDetails: ${link}\n\nBen`;
            await once(key, () => sendEmail({ to: [toEsc], subject: `Needs a nudge: ${a.title}`, text: body }));
          } else {
            await once(key, () => sendEmail({ to: [ben], subject: `[Portal] Check in with ${a.owner.name}: ${a.title}`, text: `"${a.title}" at ${c.name} is past due and ${a.owner.name} is the escalation contact. Worth a quick call.\n\n${link}` }));
          }
        } else if (step.label.startsWith("Flagged as blocker")) {
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

  return NextResponse.json({ ok: true, day, log });
}
