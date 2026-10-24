// Builds the HR Huddle recap email for one client.
// Plain inline-styled tables so it renders in Gmail, Outlook and phone mail apps.

import { Action, addBusinessDays, Client, fmt, parseDay, Project, projectProgress, today, urgency, Rules, businessDiff } from "./data";
import { HuddleSettings, SharedFile } from "./modules";

const PORTAL = "https://portal.alzapc.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface HuddleInput {
  client: Client;
  settings: HuddleSettings;
  actions: Action[];
  projects: Project[];
  files: SharedFile[];
  rules: Rules;
  sinceDays?: number;
  softAsks?: boolean;
}

export interface HuddleOutput {
  subject: string;
  html: string;
  text: string;
  quiet: boolean;
  counts: { needs: number; overdue: number; done: number; active: number };
}

export function buildHuddle({ client, settings, actions, projects, files, rules, sinceDays = 7, softAsks }: HuddleInput): HuddleOutput {
  const now = today();
  const since = new Date(now.getTime() - sinceDays * 86400000);
  const horizon = addBusinessDays(now, 5);
  const mine = actions.filter((a) => a.clientId === client.id);

  const needs = mine
    .filter((a) => a.side === "client" && a.status !== "completed" && parseDay(a.due) <= horizon)
    .sort((a, b) => a.due.localeCompare(b.due));
  const overdue = needs.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules)));
  const later = mine.filter((a) => a.side === "client" && a.status !== "completed" && parseDay(a.due) > horizon).length;
  const doneRecently = mine.filter((a) => a.status === "completed" && a.completedAt && new Date(a.completedAt) >= since);
  const alzaWorking = mine.filter((a) => a.side === "alza" && a.status !== "completed");
  const proj = projects.filter((p) => p.clientId === client.id);
  const active = proj.filter((p) => p.status === "active");
  const doneProjects = proj.filter((p) => p.status === "done" && parseDay(p.milestoneDue) >= since);
  const upcoming = proj
    .filter((p) => p.status === "planned" && parseDay(p.milestoneDue) <= new Date(now.getTime() + 45 * 86400000))
    .sort((a, b) => a.milestoneDue.localeCompare(b.milestoneDue));
  const received = files.filter((f) => f.clientId === client.id && new Date(f.at) >= since);

  const quiet = needs.length === 0 && doneRecently.length === 0 && doneProjects.length === 0 && received.length === 0 && !settings.personalNote.trim();

  const subject =
    overdue.length > 0
      ? `HR Huddle: ${overdue.length} item${overdue.length === 1 ? "" : "s"} overdue, ${needs.length - overdue.length} due this week`
      : needs.length > 0
      ? `HR Huddle: ${needs.length} item${needs.length === 1 ? "" : "s"} need you this week`
      : `HR Huddle: here's where things stand`;

  const accent = client.accent;
  const logo =
    client.logo && client.logo.startsWith("/")
      ? `<img src="${PORTAL}${client.logo}" alt="${esc(client.name)}" height="28" style="display:block;height:28px;border:0">`
      : `<span style="font:700 18px Arial,sans-serif;color:#16213a">${esc(client.name)}</span>`;

  const dueText = (a: Action) => {
    const d = businessDiff(now, parseDay(a.due));
    if (d < 0) return `<span style="color:#b42318;font-weight:700">${-d} business day${d === -1 ? "" : "s"} overdue</span>`;
    if (d === 0) return `<span style="color:#a15c07;font-weight:700">Due today</span>`;
    return `<span style="color:#5b6b85">Due ${fmt(a.due)}</span>`;
  };

  const section = (title: string, body: string) =>
    body
      ? `<tr><td style="padding:22px 24px 6px;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b85">${title}</td></tr><tr><td style="padding:0 24px">${body}</td></tr>`
      : "";

  const row = (main: string, sub: string, right = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #e3e8f0"><tr><td style="padding:10px 0;font:15px/1.4 Arial,sans-serif;color:#16213a">${main}<div style="font:13px/1.4 Arial,sans-serif;color:#5b6b85;margin-top:2px">${sub}</div></td>${right ? `<td align="right" style="padding:10px 0 10px 12px;font:13px Arial,sans-serif;white-space:nowrap;vertical-align:top">${right}</td>` : ""}</tr></table>`;

  const bar = (pct: number) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr><td style="background:#e6ebf3;border-radius:4px;height:6px;line-height:6px;font-size:0"><div style="width:${pct}%;background:${accent};height:6px;border-radius:4px"></div></td></tr></table>`;

  const needsHtml = needs
    .map((a) =>
      row(
        `<a href="${PORTAL}/c/${client.id}/a/${a.id}" style="color:#16213a;text-decoration:none;font-weight:700">${esc(a.title)}</a>`,
        `${esc(a.owner.name)}${a.subtasks?.length ? ` · ${a.subtasks.filter((x) => x.done).length} of ${a.subtasks.length} steps done` : ""}${a.impact ? `<br>${esc(a.impact)}` : ""}`,
        dueText(a)
      )
    )
    .join("");
  const needsFoot = later ? `<p style="font:13px Arial,sans-serif;color:#5b6b85;margin:8px 0 0">Plus ${later} more due later. Nothing needed on those yet.</p>` : "";

  const projHtml = active
    .map((p) => {
      const pct = projectProgress(p);
      return `<div style="padding:10px 0;border-bottom:1px solid #e3e8f0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 15px Arial,sans-serif;color:#16213a">${esc(p.name)}</td><td align="right" style="font:13px Arial,sans-serif;color:#5b6b85">${pct}%</td></tr></table>${bar(pct)}<div style="font:13px Arial,sans-serif;color:#5b6b85;margin-top:6px">Next: ${esc(p.nextMilestone)} · target ${fmt(p.milestoneDue)}</div></div>`;
    })
    .join("");

  const wins = [
    ...doneProjects.map((p) => `<li style="margin:4px 0"><b>${esc(p.name)}</b> wrapped up</li>`),
    ...doneRecently.map((a) => `<li style="margin:4px 0">${esc(a.title)}</li>`),
    ...received.map((f) => `<li style="margin:4px 0">We received ${esc(f.name)} from ${esc(f.by)}</li>`),
  ];
  const winsHtml = wins.length ? `<ul style="font:15px/1.4 Arial,sans-serif;color:#16213a;padding-left:18px;margin:4px 0">${wins.join("")}</ul>` : "";

  const alzaHtml = alzaWorking
    .map((a) => row(esc(a.title), a.status === "blocked" ? "Waiting on your team before Ben can finish this" : `Ben is on it · target ${fmt(a.due)}`))
    .join("");

  const roadmapHtml = upcoming.map((p) => row(esc(p.name), `Starts around ${fmt(p.milestoneDue)}`)).join("");

  const note = settings.personalNote.trim()
    ? `<tr><td style="padding:18px 24px 0"><div style="background:#f5f7fb;border-radius:10px;padding:12px 14px;font:15px/1.5 Arial,sans-serif;color:#16213a">${esc(settings.personalNote.trim()).replace(/\n/g, "<br>")}<div style="font:13px Arial,sans-serif;color:#5b6b85;margin-top:6px">Ben</div></div></td></tr>`
    : "";

  const intro =
    overdue.length > 0
      ? `${overdue.length} item${overdue.length === 1 ? " is" : "s are"} past due. Each one takes a minute or two from your phone.`
      : needs.length > 0
      ? `A few things need your team this week. Everything else is moving.`
      : `Nothing needs you this week. Here's a quick look at where things stand.`;

  // Quiet referral line: only in the first Huddle of each month, and only if Ben hasn't turned it off.
  const softAsk = softAsks !== false && now.getDate() <= 7;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#faf8f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="height:5px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:20px 24px 0"><table role="presentation" width="100%"><tr><td>${logo}</td><td align="right" style="font:12px Arial,sans-serif;color:#5b6b85">HR Huddle · ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td></tr></table></td></tr>
<tr><td style="padding:18px 24px 0;font:600 24px/1.3 Georgia,serif;color:#16213a">${overdue.length || needs.length ? "Your week in HR" : "All caught up"}</td></tr>
<tr><td style="padding:6px 24px 0;font:15px/1.5 Arial,sans-serif;color:#5b6b85">${intro}</td></tr>
${note}
${section("Needs your team", needsHtml ? needsHtml + needsFoot : "")}
${section("Projects", projHtml)}
${section("Done recently", winsHtml)}
${section("Ben is working on", alzaHtml)}
${section("Coming up", roadmapHtml)}
<tr><td style="padding:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${accent};border-radius:10px"><a href="${PORTAL}/c/${client.id}" style="display:inline-block;padding:12px 18px;font:700 15px Arial,sans-serif;color:#ffffff;text-decoration:none">Open your portal</a></td>
<td style="width:10px"></td>
<td style="border:1px solid #dbe2ee;border-radius:10px"><a href="${PORTAL}/c/${client.id}/share" style="display:inline-block;padding:11px 16px;font:700 15px Arial,sans-serif;color:#16213a;text-decoration:none">Share with HR</a></td>
</tr></table></td></tr>
${softAsk ? `<tr><td style="padding:0 24px 14px;font:13px/1.5 Arial,sans-serif;color:#5b6b85">Know a company that could use a hand with HR? Introductions are always welcome. <a href="${PORTAL}/c/${client.id}" style="color:#5b6b85">Make an intro</a></td></tr>` : ""}
<tr><td style="padding:0 24px 22px;font:12px/1.5 Arial,sans-serif;color:#8a97ad">You get this from AlzaHR ${settings.cadence === "weekly" ? "weekly" : settings.cadence === "biweekly" ? "every two weeks" : "monthly"}. Quiet weeks are skipped. <a href="${PORTAL}/c/${client.id}/team" style="color:#8a97ad">Change email settings</a></td></tr>
</table>
<p style="font:11px Arial,sans-serif;color:#8a97ad;margin:12px 0 0">Powered by <span style="font-family:Georgia,serif;font-weight:700;color:#19283c">Alza</span><span style="font-family:Georgia,serif;font-weight:700;color:#d9a046">HR</span></p>
</td></tr></table></body></html>`;

  const lines = (title: string, items: string[]) => (items.length ? `\n${title.toUpperCase()}\n${items.map((x) => `- ${x}`).join("\n")}\n` : "");
  const text =
    `HR Huddle for ${client.name}\n\n${intro}\n` +
    (settings.personalNote.trim() ? `\n${settings.personalNote.trim()}\n- Ben\n` : "") +
    lines("Needs your team", needs.map((a) => `${a.title} (${a.owner.name}), due ${fmt(a.due)}`)) +
    lines("Projects", active.map((p) => `${p.name}: ${projectProgress(p)}%, next ${p.nextMilestone}`)) +
    lines("Done recently", [...doneProjects.map((p) => p.name), ...doneRecently.map((a) => a.title)]) +
    lines("Ben is working on", alzaWorking.map((a) => a.title)) +
    lines("Coming up", upcoming.map((p) => `${p.name}, around ${fmt(p.milestoneDue)}`)) +
    `\nOpen your portal: ${PORTAL}/c/${client.id}\nShare with HR: ${PORTAL}/c/${client.id}/share\n`;

  return { subject, html, text, quiet, counts: { needs: needs.length, overdue: overdue.length, done: doneRecently.length + doneProjects.length, active: active.length } };
}
