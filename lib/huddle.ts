// The People Brief: the weekly email for a client's leaders.
// A short briefing, not a task list: what needs them, what's happening with their people,
// where the important HR work stands, what's coming, and what got done.
// Rules: no empty sections, nothing made up to fill space, every item appears once,
// and only things a busy CEO or COO would be glad someone told them.
// Plain inline-styled tables so it renders in Gmail, Outlook and phone mail apps.

import { Action, businessDiff, Client, parseDay, Project, projectProgress, Rules, today } from "./data";
import { addDaysISO } from "./hires";
import { HuddleSettings, SharedFile } from "./modules";
import { PeopleData } from "./peopleupdates";
import { isRoadmap } from "./roadmap";
import { weekLine } from "./quotes";
import { bucket, stepDone } from "./tracker";

const PORTAL = "https://portal.alzapc.com";
/** Who the Brief comes from: The People Brief <peoplebrief@alzapc.com>. Replies go to Ben. */
export const BRIEF_SENDER = { fromName: "The People Brief", fromBox: "peoplebrief", replyTo: process.env.NOTIFY_TO || "ben@alzapc.com" };
const MAX = { attention: 5, people: 6, priorities: 5, upcoming: 6, wins: 4 };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** "Mon, Nov 24": always a real date, never "around". */
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export interface HuddleInput {
  client: Client;
  settings: HuddleSettings;
  actions: Action[];
  projects: Project[];
  files: SharedFile[];
  rules: Rules;
  sinceDays?: number;
  softAsks?: boolean; // kept for callers; the Brief carries no referral line
  /** Hires, roles, candidates, departures and the roster, for Your People. */
  people?: PeopleData;
}

export interface HuddleOutput {
  subject: string;
  html: string;
  text: string;
  quiet: boolean;
  counts: { needs: number; overdue: number; done: number; active: number };
}

type Tone = "red" | "amber" | "green" | "gray";
const TONE: Record<Tone, string> = { red: "#b42318", amber: "#a15c07", green: "#2f6b3a", gray: "#5b6b85" };

type Att = { title: string; who: string; when: string; tone: Tone; why: string; href: string; label: string; rank: number };
type Line = { html: string; text: string; href?: string; label?: string; date?: string };
type Prio = { p: Project; status: "Delayed" | "At risk" | "On track"; tone: Tone; pct: number | null; next: string; target: string; blocker: string; rank: number };

const WHY: Record<Action["kind"], string> = {
  approval: "Work is on hold until this is approved.",
  information: "HR needs this to finish the work.",
  feedback: "Your input shapes the final version.",
  document: "HR needs this document to keep things moving.",
  todo: "It's holding up the next step.",
};

export function buildHuddle({ client, settings, actions, projects, rules, sinceDays = 7, people }: HuddleInput): HuddleOutput {
  const now = today();
  const todayIso = isoOf(now);
  const since = addDaysISO(todayIso, -sinceDays);
  const in7 = addDaysISO(todayIso, 7);
  const in14 = addDaysISO(todayIso, 14);
  const base = `${PORTAL}/c/${client.id}`;
  const mine = actions.filter((a) => a.clientId === client.id);
  const proj = projects.filter((p) => p.clientId === client.id);

  // ---------- A. Needs your attention: escalation-worthy only, never every overdue task
  const att: Att[] = [];
  for (const a of mine.filter((x) => x.side === "client" && x.status !== "completed")) {
    const diff = businessDiff(now, parseDay(a.due)); // negative = overdue
    const late = -diff;
    const decision = a.kind === "approval";
    if (late >= rules.escalateAfter) {
      att.push({ title: a.title, who: a.owner.name, when: `${plural(late, "business day")} overdue`, tone: "red", why: a.impact || WHY[a.kind], href: `${base}/a/${a.id}`, label: decision ? "Review and approve" : "Open it", rank: 1000 + late });
    } else if (decision && diff <= 3) {
      att.push({ title: a.title, who: a.owner.name, when: diff < 0 ? `${plural(late, "business day")} overdue` : diff === 0 ? "Decision needed today" : `Decision needed by ${day(a.due)}`, tone: diff < 0 ? "red" : "amber", why: a.impact || WHY.approval, href: `${base}/a/${a.id}`, label: "Review and approve", rank: diff < 0 ? 900 + late : 500 - diff });
    }
  }
  if (people) {
    const roles = people.roles.filter((r) => r.clientId === client.id);
    for (const r of roles) {
      const waiting = people.candidates.filter((c) => c.roleId === r.id && !c.hidden && !c.cleared && !c.decision && c.sentAt && c.sentAt.slice(0, 10) <= addDaysISO(todayIso, -3));
      if (!waiting.length) continue;
      const oldest = waiting.map((c) => c.sentAt!.slice(0, 10)).sort()[0];
      const days = Math.round((parseDay(todayIso).getTime() - parseDay(oldest).getTime()) / 864e5);
      att.push({
        title: `Hiring decision: ${r.title}`,
        who: r.hiringManager?.name || "Hiring team",
        when: `${plural(waiting.length, "candidate")} waiting ${days} days`,
        tone: days >= 7 ? "red" : "amber",
        why: "Candidates are waiting on a yes or no.",
        href: `${base}/recruiting`,
        label: "Review candidates",
        rank: 400 + days,
      });
    }
  }
  att.sort((a, b) => b.rank - a.rank);
  const attShown = att.slice(0, MAX.attention);

  // ---------- B. Your people: summarized, names where they matter
  const ppl: Line[] = [];
  if (people) {
    const hires = people.hires.filter((h) => h.clientId === client.id && !h.outcome);
    const active = hires.filter((h) => bucket(h, people.steps) === "active");
    const starting = active.filter((h) => h.startDate && h.startDate >= todayIso && h.startDate <= in14).sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (starting.length > 3) {
      ppl.push({ html: `<b>${plural(starting.length, "person", "people")} start in the next two weeks:</b> ${esc(list(starting.map((h) => `${h.name} (${day(h.startDate)})`)))}`, text: `${starting.length} people start in the next two weeks: ${list(starting.map((h) => `${h.name} (${day(h.startDate)})`))}`, href: `${base}/hires`, label: "See new hires" });
    } else {
      for (const h of starting)
        ppl.push({ html: `<b>${esc(h.name)}</b> starts ${day(h.startDate)}<div style="${SUB}">${esc([h.title, h.managerName && `reports to ${h.managerName}`].filter(Boolean).join(" · "))}</div>`, text: `${h.name} starts ${day(h.startDate)} (${h.title})` });
    }
    const started = hires.filter((h) => h.startDate && h.startDate < todayIso && h.startDate >= since);
    if (started.length) ppl.push({ html: `<b>${esc(list(started.map((h) => h.name)))}</b> started this week`, text: `${list(started.map((h) => h.name))} started this week` });
    // onboarding: only what's behind, rolled into one line
    const behind = active.filter((h) => h.startDate && people.steps.some((s) => !stepDone(h, s.id) && s.days != null && addDaysISO(h.startDate, s.days) < todayIso));
    if (behind.length) ppl.push({ html: `<b>${plural(behind.length, "new hire")}</b> ${behind.length === 1 ? "has" : "have"} onboarding steps past due<div style="${SUB}">${esc(list(behind.slice(0, 4).map((h) => h.name)))}${behind.length > 4 ? ` and ${behind.length - 4} more` : ""}</div>`, text: `${plural(behind.length, "new hire")} with onboarding steps past due: ${list(behind.map((h) => h.name))}`, href: `${base}/hires`, label: "See onboarding" });
    // departures: newly recorded, or last day coming up
    const deps = people.departures.filter((d) => d.clientId === client.id && d.status === "planned" && ((d.createdAt && d.createdAt.slice(0, 10) >= since) || (d.lastDay >= todayIso && d.lastDay <= in14)));
    for (const d of deps.sort((a, b) => a.lastDay.localeCompare(b.lastDay))) {
      const how = d.type === "resignation" ? "resigned" : d.type === "retirement" ? "is retiring" : "is leaving";
      ppl.push({ html: `<b>${esc(d.name)}</b> ${how}<div style="${SUB}">${esc([d.title, `Last day ${day(d.lastDay)}`].filter(Boolean).join(" · "))}</div>`, text: `${d.name} ${how}, last day ${day(d.lastDay)}` });
    }
    // milestone anniversaries this week
    const MILE = [1, 5, 10, 15, 20, 25, 30, 35, 40];
    for (const m of people.roster.filter((x) => x.clientId === client.id && x.active && x.hireDate)) {
      for (let i = 0; i <= 7; i++) {
        const d = addDaysISO(todayIso, i);
        if (d.slice(5) !== m.hireDate!.slice(5)) continue;
        const yrs = Number(d.slice(0, 4)) - Number(m.hireDate!.slice(0, 4));
        if (MILE.includes(yrs)) ppl.push({ html: `<b>${esc(m.name)}</b> marks ${plural(yrs, "year")} on ${day(d)}<div style="${SUB}">${esc(m.title)}</div>`, text: `${m.name} marks ${yrs} years on ${day(d)}` });
      }
    }
  }
  const pplShown = ppl.slice(0, MAX.people);

  // ---------- C. HR priorities: the important active work, with honest status
  const prios: Prio[] = proj
    .filter((p) => p.status === "active")
    .map((p) => {
      const target = isRoadmap(p) ? p.roadmap.end : p.milestoneDue;
      const open = p.steps.filter((s) => !s.done);
      const late = open.filter((s) => s.due && s.due < todayIso).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
      const linkedLate = mine.filter((a) => a.projectId === p.id && a.status !== "completed" && a.due < todayIso);
      const pct = p.steps.length >= 3 ? projectProgress(p) : null;
      let expectedBehind = false;
      if (pct !== null && p.startedAt && target) {
        const span = parseDay(target).getTime() - new Date(p.startedAt).getTime();
        const used = now.getTime() - new Date(p.startedAt).getTime();
        if (span > 0 && used / span - pct / 100 > 0.3) expectedBehind = true;
      }
      const delayed = !!target && target < todayIso;
      const risk = !delayed && (late.length > 0 || linkedLate.length > 0 || expectedBehind);
      const b = late[0];
      const blocker = b ? `${b.text}${b.owner?.name ? `, waiting on ${b.owner.name}` : ""} since ${day(b.due!)}` : linkedLate[0] ? `${linkedLate[0].title}, waiting on ${linkedLate[0].owner.name} since ${day(linkedLate[0].due)}` : "";
      return {
        p,
        status: delayed ? "Delayed" : risk ? "At risk" : "On track",
        tone: delayed ? "red" : risk ? "amber" : "green",
        pct,
        next: b && open[0] === b ? "" : open[0]?.text || p.nextMilestone || "",
        target,
        blocker,
        rank: (delayed ? 2000 : risk ? 1000 : 0) - (target ? parseDay(target).getTime() / 864e5 / 1e5 : 0),
      } as Prio;
    })
    .sort((a, b) => b.rank - a.rank || (a.target || "9").localeCompare(b.target || "9"));
  const prioShown = prios.slice(0, MAX.priorities);
  const shownIds = new Set(prioShown.map((x) => x.p.id));

  // ---------- D. Coming up: the next two weeks, real dates only, nothing already shown
  const up: Line[] = [];
  for (const p of proj) {
    if (shownIds.has(p.id)) continue;
    if (p.status === "planned") {
      const start = isRoadmap(p) ? p.roadmap.start : p.milestoneDue;
      if (start && start >= todayIso && start <= in14) up.push({ html: `<b>${esc(p.name)}</b> begins`, text: `${p.name} begins ${day(start)}`, date: start });
    } else if (p.status === "active") {
      const t = isRoadmap(p) ? p.roadmap.end : p.milestoneDue;
      if (t && t >= todayIso && t <= in14) up.push({ html: `<b>${esc(p.name)}</b> wraps up`, text: `${p.name} wraps up ${day(t)}`, date: t });
    }
  }
  up.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const upShown = up.slice(0, MAX.upcoming);

  // ---------- E. Wins: meaningful only
  const wins: Line[] = [];
  for (const p of proj.filter((x) => x.status === "done" && x.milestoneDue >= since && x.milestoneDue <= todayIso))
    wins.push({ html: `<b>${esc(p.name)}</b> is complete`, text: `${p.name} is complete` });
  if (people) {
    const roles = people.roles.filter((r) => r.clientId === client.id);
    for (const c of people.candidates.filter((x) => x.decision === "offer" && x.decidedAt && x.decidedAt.slice(0, 10) >= since)) {
      const r = roles.find((x) => x.id === c.roleId);
      if (r) wins.push({ html: `<b>${esc(r.title)}</b>: ${c.name ? `${esc(c.name)} chosen, ` : ""}offer under way`, text: `${r.title}: ${c.name ? `${c.name} chosen, ` : ""}offer under way` });
    }
  }
  const winsShown = wins.slice(0, MAX.wins);

  const note = settings.personalNote.trim();
  const quiet = !attShown.length && !pplShown.length && !prioShown.length && !upShown.length && !winsShown.length && !note;
  const overdueCount = att.filter((a) => a.tone === "red").length;

  // ---------- render
  const dateLong = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const lede = attShown.length
    ? `${att.length === 1 ? "One thing needs" : `${att.length} things need`} your attention this week.`
    : "Nothing needs your attention this week. Here's where things stand.";

  const pill = (label: string, tone: Tone) => `<span style="display:inline-block;font:600 11px/1 Arial,sans-serif;color:${TONE[tone]};border:1px solid ${TONE[tone]}33;background:${TONE[tone]}0f;border-radius:99px;padding:4px 8px;white-space:nowrap">${esc(label)}</span>`;
  const link = (href: string, label: string) => `<a href="${href}" style="color:#1f4e8c;text-decoration:none;font:600 13px Arial,sans-serif">${esc(label)} &rsaquo;</a>`;
  const section = (title: string, body: string, more?: { n: number; href: string; label: string }) =>
    body
      ? `<tr><td style="padding:26px 28px 0"><div style="border-top:1px solid #e6e1d6;padding-top:20px;font:700 16px Georgia,serif;color:#16213a">${title}</div>${body}${more && more.n > 0 ? `<div style="padding-top:10px">${link(more.href, more.label)}</div>` : ""}</td></tr>`
      : "";
  const item = (inner: string, last: boolean) => `<div style="padding:12px 0;${last ? "" : "border-bottom:1px solid #f0ece4;"}font:15px/1.45 Arial,sans-serif;color:#16213a">${inner}</div>`;

  const attHtml = attShown
    .map((a, i) =>
      item(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:10px;vertical-align:top;padding-top:6px"><div style="width:7px;height:7px;border-radius:7px;background:${TONE[a.tone]}"></div></td><td style="padding-left:8px"><b>${esc(a.title)}</b><div style="${SUB}">${esc(a.who)} · <span style="color:${TONE[a.tone]};font-weight:600">${esc(a.when)}</span></div><div style="${SUB}">${esc(a.why)}</div><div style="padding-top:6px">${link(a.href, a.label)}</div></td></tr></table>`,
        i === attShown.length - 1,
      ),
    )
    .join("");

  const lineHtml = (xs: Line[], dated = false) =>
    xs.map((x, i) => item(`${dated && x.date ? `<span style="display:inline-block;min-width:92px;color:#5b6b85;font-size:13px">${day(x.date)}</span>` : ""}${x.html}${x.href && x.label ? `<div style="padding-top:4px">${link(x.href, x.label)}</div>` : ""}`, i === xs.length - 1)).join("");

  const bar = (pct: number, tone: Tone) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:120px;display:inline-table;vertical-align:middle"><tr><td style="background:#ebe7df;border-radius:4px;height:5px;line-height:5px;font-size:0"><div style="width:${pct}%;background:${tone === "green" ? "#19283c" : TONE[tone]};height:5px;border-radius:4px"></div></td></tr></table> <span style="font:12px Arial,sans-serif;color:#5b6b85">${pct}%</span>`;
  const prioHtml = prioShown
    .map((x, i) =>
      item(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><b>${esc(x.p.name)}</b></td><td align="right" style="vertical-align:top">${pill(x.status, x.tone)}</td></tr></table>${x.pct !== null ? `<div style="padding-top:6px">${bar(x.pct, x.tone)}</div>` : ""}<div style="${SUB}">${[x.next && `Next: ${esc(x.next)}`, x.target && `Target ${day(x.target)}`].filter(Boolean).join(" · ")}</div>${x.blocker ? `<div style="${SUB};color:${TONE[x.tone]}">Stuck: ${esc(x.blocker)}</div>` : ""}`,
        i === prioShown.length - 1,
      ),
    )
    .join("");

  const SUBHEAD = `font:13px/1.5 Arial,sans-serif;color:#5b6b85`;
  const thought = weekLine(now);
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f6f3ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="padding:26px 28px 0">
<div style="font:600 12px Arial,sans-serif;color:#5b6b85;letter-spacing:.02em">${esc(client.name)} · ${dateLong}</div>
<div style="font:600 26px/1.25 Georgia,serif;color:#16213a;padding-top:6px">The People Brief</div>
<div style="${SUBHEAD};padding-top:4px">Your weekly view of what&rsquo;s happening across your people and priorities.</div>
<div style="font:15px/1.5 Arial,sans-serif;color:#16213a;padding-top:14px">${esc(lede)}</div>
</td></tr>
${note ? `<tr><td style="padding:14px 28px 0"><div style="border-left:3px solid #d9c9a3;padding:2px 0 2px 12px;font:14px/1.55 Arial,sans-serif;color:#16213a">${esc(note).replace(/\n/g, "<br>")}<div style="${SUBHEAD}">Ben Gaines</div></div></td></tr>` : ""}
${section("Needs your attention", attHtml, { n: att.length - attShown.length, href: `${base}/projects`, label: `See ${att.length - attShown.length} more` })}
${section("Your people", lineHtml(pplShown), { n: ppl.length - pplShown.length, href: `${base}/hires`, label: "See everyone" })}
${section("HR priorities", prioHtml, { n: prios.length - prioShown.length, href: `${base}/projects`, label: `View all ${prios.length} projects` })}
${section("Coming up", lineHtml(upShown, true))}
${section("Wins &amp; progress", lineHtml(winsShown))}
<tr><td style="padding:26px 28px 0"><div style="border-top:1px solid #e6e1d6;padding-top:20px;font:italic 16px/1.55 Georgia,serif;color:#16213a">&ldquo;${esc(thought)}&rdquo;</div><div style="${SUBHEAD};padding-top:4px">A thought for the week</div></td></tr>
<tr><td style="padding:28px 28px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#19283c;border-radius:8px"><a href="${base}" style="display:inline-block;padding:12px 20px;font:700 14px Arial,sans-serif;color:#ffffff;text-decoration:none">Open Your AlzaHR Portal</a></td></tr></table></td></tr>
<tr><td style="padding:16px 28px 24px;font:12px/1.6 Arial,sans-serif;color:#8a8577">Prepared by Alza People &amp; Operations · <a href="${base}" style="color:#8a8577">portal.alzapc.com</a><br>You get this ${settings.cadence === "biweekly" ? "every two weeks" : settings.cadence === "monthly" ? "monthly" : "weekly"}. Quiet weeks are skipped. <a href="${base}/team" style="color:#8a8577">Email preferences</a></td></tr>
</table></td></tr></table></body></html>`;

  const block = (title: string, rows: string[]) => (rows.length ? `\n${title.toUpperCase()}\n${rows.map((r) => `- ${r}`).join("\n")}\n` : "");
  const text =
    `The People Brief | ${client.name} | ${dateLong}\n\n${lede}\n` +
    (note ? `\n${note}\n- Ben Gaines\n` : "") +
    block("Needs your attention", attShown.map((a) => `${a.title} (${a.who}, ${a.when}). ${a.why} ${a.href}`)) +
    block("Your people", pplShown.map((x) => x.text)) +
    block("HR priorities", prioShown.map((x) => `${x.p.name}: ${x.status}${x.pct !== null ? `, ${x.pct}%` : ""}${x.next ? `. Next: ${x.next}` : ""}${x.target ? `. Target ${day(x.target)}` : ""}${x.blocker ? `. Stuck: ${x.blocker}` : ""}`)) +
    block("Coming up", upShown.map((x) => x.text)) +
    block("Wins & progress", winsShown.map((x) => x.text)) +
    `\nA thought for the week: "${thought}"\n` +
    `\nOpen your AlzaHR portal: ${base}\n\nPrepared by Alza People & Operations\n`;

  const subject = `The People Brief | ${client.name} | ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return { subject, html, text, quiet, counts: { needs: att.length, overdue: overdueCount, done: wins.length, active: prios.length } };
}

const SUB = "font:13px/1.45 Arial,sans-serif;color:#5b6b85;margin-top:2px";
