// Updates for leaders, built from the portal's own data:
// - peopleItems: the "People" section of the weekly HR Huddle (who starts, hires in progress, decisions waiting, last days)
// - buildSnapshot: the monthly snapshot for executives (the month at a glance)
// - buildManagerWeek: the Monday email for managers (their new hires, their week, recognize someone, a thought)
// Plain inline-styled tables so they render in Gmail, Outlook and phone mail apps.
import { addDaysISO, Hire } from "./hires";
import type { TeamLog, TeamMember } from "./team";
import { weekItems } from "./team";
import { bucket, progress, stepDone, stepsFor, TrackerStep } from "./tracker";
import type { Departure } from "./offboard";

const PORTAL = "https://portal.alzapc.com";
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayName = (iso: string, today: string) => {
  if (iso === today) return "today";
  if (iso === addDaysISO(today, 1)) return "tomorrow";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
};
const short = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD");
const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "";
const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

type Cand = { roleId: string; hidden?: boolean; cleared?: boolean; decision?: unknown };
type RoleLite = { id: string; clientId: string; title: string; status: string };
type Shout = { at: string; status: string; to?: { personId?: string; name?: string } };

export interface PeopleData {
  hires: Hire[];
  roles: RoleLite[];
  candidates: Cand[];
  departures: Departure[];
  roster: TeamMember[];
  shouts: Shout[];
  steps: TrackerStep[];
}

/** The next open tracker step for a hire, or null when every step is done. */
function nextStep(h: Hire, steps: TrackerStep[]) {
  return steps.find((s) => !stepDone(h, s.id)) ?? null;
}

const openRole = (r: RoleLite) => !/closed|filled|hold|cancel/i.test(r.status || "");
const waiting = (d: PeopleData, clientId: string) => {
  const ids = new Set(d.roles.filter((r) => r.clientId === clientId).map((r) => r.id));
  return d.candidates.filter((c) => ids.has(c.roleId) && !c.hidden && !c.cleared && !c.decision).length;
};

// ---------------------------------------------------------------- weekly Huddle: People

export type PeopleItem = { title: string; sub: string; href: string };

export function peopleItems(clientId: string, d: PeopleData, today: string): PeopleItem[] {
  const out: PeopleItem[] = [];
  const week = addDaysISO(today, 7);
  const base = `${PORTAL}/c/${clientId}`;
  const active = d.hires.filter((h) => h.clientId === clientId && bucket(h, d.steps) === "active");
  for (const h of active.filter((x) => x.startDate >= today && x.startDate <= week).sort((a, b) => a.startDate.localeCompare(b.startDate)))
    out.push({ title: `${h.name} starts ${dayName(h.startDate, today)}`, sub: [h.title, h.managerName && `reports to ${h.managerName}`].filter(Boolean).join(" · "), href: `${base}/hires?open=${h.id}` });
  for (const h of active.filter((x) => !(x.startDate >= today && x.startDate <= week)).sort((a, b) => (a.startDate || "9").localeCompare(b.startDate || "9")).slice(0, 6)) {
    const n = nextStep(h, d.steps);
    if (!n) continue;
    const due = n.days && h.startDate ? addDaysISO(h.startDate, n.days) : "";
    out.push({ title: `${h.name}: next is ${n.label.toLowerCase()}`, sub: due ? `Due ${short(due)}` : h.startDate > today ? `Starts ${short(h.startDate)}` : `Started ${short(h.startDate)}`, href: `${base}/hires?open=${h.id}` });
  }
  const w = waiting(d, clientId);
  if (w) out.push({ title: `${w} candidate${w === 1 ? "" : "s"} waiting on a yes or no`, sub: "Good people take other offers. A quick decision keeps them.", href: `${base}/recruiting` });
  for (const dep of d.departures.filter((x) => x.clientId === clientId && x.status === "planned" && x.lastDay >= today && x.lastDay <= week))
    out.push({ title: `${dep.name}'s last day is ${dayName(dep.lastDay, today)}`, sub: "The offboarding checklist is ready.", href: `${base}/offboarding/${dep.id}` });
  return out;
}

// ---------------------------------------------------------------- shared email shell

type Shell = { accent: string; logo: string; kicker: string; title: string; intro: string; body: string; cta?: { label: string; url: string }; footer: string };
function shell(s: Shell) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#faf8f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="height:5px;background:${s.accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:20px 24px 0"><table role="presentation" width="100%"><tr><td>${s.logo}</td><td align="right" style="font:12px Arial,sans-serif;color:#5b6b85">${esc(s.kicker)}</td></tr></table></td></tr>
<tr><td style="padding:18px 24px 0;font:600 24px/1.3 Georgia,serif;color:#16213a">${esc(s.title)}</td></tr>
<tr><td style="padding:6px 24px 0;font:15px/1.5 Arial,sans-serif;color:#5b6b85">${s.intro}</td></tr>
${s.body}
${s.cta ? `<tr><td style="padding:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${s.accent};border-radius:10px"><a href="${s.cta.url}" style="display:inline-block;padding:12px 18px;font:700 15px Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(s.cta.label)}</a></td></tr></table></td></tr>` : ""}
<tr><td style="padding:0 24px 22px;font:12px/1.5 Arial,sans-serif;color:#8a97ad">${s.footer}</td></tr>
</table>
<p style="font:11px Arial,sans-serif;color:#8a97ad;margin:12px 0 0">Powered by <span style="font-family:Georgia,serif;font-weight:700;color:#19283c">Alza</span><span style="font-family:Georgia,serif;font-weight:700;color:#d9a046">HR</span></p>
</td></tr></table></body></html>`;
}
const section = (title: string, body: string) =>
  body ? `<tr><td style="padding:22px 24px 6px;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b85">${esc(title)}</td></tr><tr><td style="padding:0 24px">${body}</td></tr>` : "";
const row = (main: string, sub: string, href?: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #e3e8f0"><tr><td style="padding:10px 0;font:15px/1.4 Arial,sans-serif;color:#16213a">${href ? `<a href="${href}" style="color:#16213a;text-decoration:none;font-weight:700">${esc(main)}</a>` : `<b>${esc(main)}</b>`}${sub ? `<div style="font:13px/1.4 Arial,sans-serif;color:#5b6b85;margin-top:2px">${esc(sub)}</div>` : ""}</td></tr></table>`;
export const peopleRows = (items: PeopleItem[]) => items.map((i) => row(i.title, i.sub, i.href)).join("");
export const logoHtml = (name: string, logo?: string) =>
  logo && logo.startsWith("/") ? `<img src="${PORTAL}${logo}" alt="${esc(name)}" height="28" style="display:block;height:28px;border:0">` : `<span style="font:700 18px Arial,sans-serif;color:#16213a">${esc(name)}</span>`;

// ---------------------------------------------------------------- monthly snapshot (executives)

export interface SnapshotInput {
  client: { id: string; name: string; accent: string; logo?: string };
  data: PeopleData;
  actionsDone: number;
  projectsDone: number;
  today: string; // the send date; the snapshot covers the month before it
}

type Tile = { n: string; label: string; note?: string };

export function buildSnapshot({ client, data, actionsDone, projectsDone, today }: SnapshotInput) {
  const t = new Date(`${today}T12:00:00`);
  const startD = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const endD = new Date(t.getFullYear(), t.getMonth(), 0);
  const from = isoOf(startD);
  const to = isoOf(endD);
  const month = startD.toLocaleDateString("en-US", { month: "long" });
  const inM = (iso?: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const cid = client.id;
  const hires = data.hires.filter((h) => h.clientId === cid);
  const roster = data.roster.filter((p) => p.clientId === cid && p.active !== false);
  const started = hires.filter((h) => !h.outcome && inM(h.startDate));
  const noStart = hires.filter((h) => h.outcome && inM(h.startDate));
  const inFlight = hires.filter((h) => bucket(h, data.steps) === "active" && h.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const left = data.departures.filter((d) => d.clientId === cid && d.status !== "cancelled" && inM(d.lastDay));
  const vol = left.filter((d) => d.type === "resignation" || d.type === "retirement").length;
  const day30 = data.steps.find((s) => s.days === 30) ?? data.steps.find((s) => s.days);
  const due30 = day30 ? hires.filter((h) => !h.outcome && h.startDate && inM(addDaysISO(h.startDate, day30.days!))) : [];
  const done30 = day30 ? due30.filter((h) => stepDone(h, day30.id)).length : 0;
  const roles = data.roles.filter((r) => r.clientId === cid && openRole(r));
  const w = waiting(data, cid);
  const shouts = data.shouts.filter((s) => s.status === "live" && inM(s.at));
  const recognized = new Set(shouts.map((s) => s.to?.personId || s.to?.name).filter(Boolean)).size;

  const tiles: Tile[] = [
    { n: String(roster.length), label: "on the team", note: `Net ${started.length - left.length >= 0 ? "+" : ""}${started.length - left.length} in ${month}` },
    { n: String(started.length), label: `started in ${month}`, note: noStart.length ? `${noStart.length} didn't start` : inFlight.length ? `${inFlight.length} more on the way` : undefined },
    { n: String(left.length), label: `left in ${month}`, note: left.length ? `${vol} by choice · ${left.length - vol} not` : undefined },
    { n: String(roles.length), label: "open roles", note: w ? `${w} candidate${w === 1 ? "" : "s"} waiting on you` : undefined },
  ];
  if (day30 && due30.length) tiles.push({ n: `${done30} of ${due30.length}`, label: `${day30.label.toLowerCase()}s done`, note: done30 < due30.length ? "Worth a quick follow-up" : "Nice follow-through" });
  if (data.shouts.length || shouts.length) tiles.push({ n: String(shouts.length), label: "shoutouts", note: roster.length ? `${recognized} of ${roster.length} people recognized` : `${recognized} people recognized` });
  if (actionsDone || projectsDone) tiles.push({ n: String(actionsDone + projectsDone), label: "HR items wrapped up", note: projectsDone ? `${projectsDone} project${projectsDone === 1 ? "" : "s"} finished` : undefined });

  const cell = (x?: Tile) =>
    x
      ? `<td width="50%" valign="top" style="padding:6px"><div style="border:1px solid #e3e8f0;border-radius:12px;padding:14px 16px"><div style="font:700 26px/1.1 Georgia,serif;color:#16213a">${esc(x.n)}</div><div style="font:600 13px/1.4 Arial,sans-serif;color:#16213a;margin-top:4px">${esc(x.label)}</div>${x.note ? `<div style="font:12px/1.4 Arial,sans-serif;color:#5b6b85;margin-top:2px">${esc(x.note)}</div>` : ""}</div></td>`
      : `<td width="50%"></td>`;
  let grid = "";
  for (let i = 0; i < tiles.length; i += 2) grid += `<tr>${cell(tiles[i])}${cell(tiles[i + 1])}</tr>`;
  const tilesHtml = `<tr><td style="padding:14px 18px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${grid}</table></td></tr>`;

  const watch: string[] = [];
  if (w) watch.push(`${w} candidate${w === 1 ? " is" : "s are"} waiting on a decision.`);
  if (day30 && due30.length > done30) watch.push(`${due30.length - done30} ${day30.label.toLowerCase()}${due30.length - done30 === 1 ? "" : "s"} from ${month} still open.`);
  if (left.length >= 2 && roster.length && left.length / (roster.length + left.length) >= 0.05) watch.push(`${left.length} departures in one month is worth a conversation about why.`);
  if (roster.length >= 8 && shouts.length && recognized / roster.length < 0.25) watch.push("Recognition reached under a quarter of the team. A nudge to managers helps.");
  const coming = inFlight.slice(0, 5).map((h) => row(`${h.name} starts ${short(h.startDate)}`, [h.title, h.managerName && `reports to ${h.managerName}`].filter(Boolean).join(" · "), `${PORTAL}/c/${cid}/hires?open=${h.id}`)).join("");

  const body =
    tilesHtml +
    section("Worth a look", watch.map((x) => `<p style="margin:8px 0;font:15px/1.5 Arial,sans-serif;color:#16213a">${esc(x)}</p>`).join("")) +
    section("Coming up", coming);
  const subject = `${month} at a glance: ${started.length} joined, ${left.length} left${roles.length ? `, ${roles.length} open role${roles.length === 1 ? "" : "s"}` : ""}`;
  const html = shell({
    accent: client.accent,
    logo: logoHtml(client.name, client.logo),
    kicker: `Monthly snapshot · ${month}`,
    title: `${month} at a glance`,
    intro: `Your team in one screen: who joined, who left, hiring, and how new people are settling in.`,
    body,
    cta: { label: "Open your portal", url: `${PORTAL}/c/${cid}` },
    footer: `You get this from AlzaHR in the first week of each month.`,
  });
  const text =
    `${month} at a glance for ${client.name}\n\n` +
    tiles.map((x) => `${x.n} ${x.label}${x.note ? ` (${x.note})` : ""}`).join("\n") +
    (watch.length ? `\n\nWORTH A LOOK\n${watch.map((x) => `- ${x}`).join("\n")}` : "") +
    (inFlight.length ? `\n\nCOMING UP\n${inFlight.slice(0, 5).map((h) => `- ${h.name} starts ${short(h.startDate)}`).join("\n")}` : "") +
    `\n\nOpen your portal: ${PORTAL}/c/${cid}\n`;
  return { subject, html, text };
}

// ---------------------------------------------------------------- Monday email for managers

export const MANAGER_TIPS: { title: string; body: string; tryThis: string }[] = [
  { title: "Ask, then wait", body: "Most managers answer their own questions. After you ask how something is going, count to five before you say anything else.", tryThis: "In your next 1:1, ask one open question and let the silence do the work." },
  { title: "Specific beats nice", body: "\"Great job\" fades by lunch. \"The way you walked the client through the delay kept them calm\" sticks, and tells them what to repeat.", tryThis: "Thank one person this week for something specific they did." },
  { title: "Clear is kind", body: "Vague expectations feel easier in the moment and cost more later. People can only hit a target they can see.", tryThis: "Pick one task you delegated and confirm what done looks like, and by when." },
  { title: "The first 30 days", body: "New people decide early whether they made the right call. Short, frequent check-ins matter more than one long one.", tryThis: "Ask a newer team member: what's been harder than you expected?" },
  { title: "Fix it while it's small", body: "Most performance problems start as a pattern nobody named. A calm, early conversation is easier on everyone than a formal one later.", tryThis: "If something has bugged you twice, mention it this week, privately and plainly." },
  { title: "Stay interviews", body: "Exit interviews tell you why people left. Asking now tells you what keeps them.", tryThis: "Ask one solid performer: what would make you think about leaving?" },
  { title: "Write it down", body: "If a conversation about performance, pay or a policy issue matters, a short note the same day protects you and the employee.", tryThis: "After your next important conversation, jot three lines: date, what was said, next step." },
  { title: "Breaks are not optional", body: "In many states, California especially, meal and rest breaks are the law, not a perk. Missed breaks add up fast, in penalties and in burnout.", tryThis: "Check that your team's schedules this week leave room for every break." },
  { title: "Your mood is contagious", body: "Your team reads your face before your words. A stressed manager makes a tense team, even when nothing is said.", tryThis: "Before your next team meeting, take one minute to reset before you walk in." },
  { title: "Delegate the outcome", body: "Handing off steps keeps you in the middle. Handing off the result builds people who can run without you.", tryThis: "Give someone a problem to solve this week instead of a task to complete." },
  { title: "Recognition is a habit", body: "Teams that hear thanks often hold up better when things get hard. It works best weekly, not yearly.", tryThis: "Put a 5-minute reminder on Friday: who made the week better?" },
  { title: "Listen for the second answer", body: "\"It's fine\" is often the first answer, not the real one. A follow-up shows you actually want to know.", tryThis: "When you hear \"it's fine\" this week, try: what would make it better?" },
  { title: "Consistency builds trust", body: "People watch whether rules apply to everyone. Treating one person differently, even with good intent, gets noticed.", tryThis: "Think of one rule you've bent lately. Would you bend it for anyone on the team?" },
  { title: "Bad news travels better early", body: "People can handle hard news. What damages trust is hearing it late or secondhand.", tryThis: "If a change is coming, tell your team what you know now and when you'll know more." },
  { title: "Ask what gets in the way", body: "Your team often knows exactly what slows them down and assumes you can't fix it. Sometimes you can.", tryThis: "Ask: what's one thing that wastes your time every week?" },
  { title: "Growth is part of the job", body: "People stay where they're learning. That doesn't need a promotion; it needs a stretch.", tryThis: "Ask one person what skill they'd like to build this quarter." },
  { title: "Make 1:1s theirs", body: "When a 1:1 becomes a status update, people stop bringing what matters. Let them set the agenda.", tryThis: "Open your next 1:1 with: what's on your mind?" },
  { title: "Be the calm in a mistake", body: "How you react to the first mistake decides whether people tell you about the next one.", tryThis: "When something goes wrong this week, start with: what happened, and what do we need now?" },
  { title: "Say no to protect yes", body: "A team that takes on everything finishes nothing well. Part of your job is deciding what not to do.", tryThis: "Pick one request this week you can push back, pause or hand off." },
  { title: "Notice the quiet ones", body: "The loudest people get the most attention. Steady, quiet contributors are the easiest to lose without noticing.", tryThis: "Check in with the person on your team you've talked to least this month." },
  { title: "Set the tone on day one", body: "A new hire's first day sets the story they tell about the job. A ready desk, a lunch plan and your time say: we were expecting you.", tryThis: "For your next new hire, block 30 minutes with them on day one." },
  { title: "Feedback is a gift, if it's timely", body: "Feedback about something from three months ago feels like an ambush. Same week feels like help.", tryThis: "Give one piece of feedback within 48 hours of seeing it." },
  { title: "Ask about the person, not just the work", body: "You don't need to be friends, but people work harder for someone who knows them a little.", tryThis: "Ask someone about something outside work they mentioned before." },
  { title: "Own the miss", body: "When a manager says \"that one's on me,\" the team relaxes and starts solving. Blame makes people hide problems.", tryThis: "Next time something slips, name your part first." },
];

export function tipFor(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start.getTime()) / (7 * 864e5));
  return MANAGER_TIPS[(week + d.getFullYear()) % MANAGER_TIPS.length];
}

export interface ManagerWeekInput {
  client: { id: string; name: string; accent: string; logo?: string };
  manager: { name: string; email: string };
  team: TeamMember[];
  logs: TeamLog[];
  hires: Hire[]; // this client's hires; filtered to this manager here
  steps: TrackerStep[];
  recognitionOn: boolean;
  trainingOn: boolean;
  today: string;
}

/** Null when there's nothing for this manager at all (no team, no hires). */
export function buildManagerWeek(i: ManagerWeekInput) {
  const { client, manager, today } = i;
  const base = `${PORTAL}/c/${client.id}`;
  const fn = first(manager.name);
  const mine = i.hires.filter((h) => h.clientId === client.id && same(h.managerName, manager.name) && bucket(h, i.steps) === "active");
  if (!i.team.length && !mine.length) return null;
  const d = new Date(`${today}T12:00:00`);
  const hireRows = mine
    .sort((a, b) => (a.startDate || "9").localeCompare(b.startDate || "9"))
    .map((h) => {
      const n = nextStep(h, i.steps);
      const p = progress(h, i.steps);
      const starting = h.startDate >= today && h.startDate <= addDaysISO(today, 7);
      const title = starting ? `${h.name} starts ${dayName(h.startDate, today)}` : h.startDate > today ? `${h.name} starts ${short(h.startDate)}` : `${h.name}, ${Math.round((d.getTime() - new Date(`${h.startDate}T12:00:00`).getTime()) / 864e5)} days in`;
      const sub = n?.days && h.startDate ? `${n.label} due ${short(addDaysISO(h.startDate, n.days))}. Block 20 minutes: how's it going, what's unclear, what do they need?` : starting ? "Be there to greet them, and plan lunch on day one." : n ? `Next: ${n.label.toLowerCase()} (${p.done} of ${p.total} steps done)` : "";
      return row(title, sub, `${base}/hires?open=${h.id}`);
    })
    .join("");
  const top = weekItems(i.team, i.logs.filter((l) => l.clientId === client.id), d).slice(0, 3);
  const topRows = top.map((x) => row(x.title, x.why)).join("");
  const rec = top.find((x) => x.kind === "recognize") ?? weekItems(i.team, i.logs, d).find((x) => x.kind === "recognize");
  const recogHtml = `<p style="margin:6px 0 0;font:15px/1.5 Arial,sans-serif;color:#16213a">${rec ? `${esc(rec.title)}? ` : ""}Who on your team made the week better? A two-line shoutout takes a minute and people remember it.</p>${i.recognitionOn ? `<p style="margin:10px 0 0"><a href="${base}/recognition" style="font:700 14px Arial,sans-serif;color:${i.client.accent}">Give a shoutout</a></p>` : ""}`;
  const tip = tipFor(d);
  const tipHtml = `<div style="background:#f5f7fb;border-radius:10px;padding:14px 16px;margin-top:6px"><div style="font:700 16px Georgia,serif;color:#16213a">${esc(tip.title)}</div><p style="margin:6px 0 0;font:15px/1.5 Arial,sans-serif;color:#16213a">${esc(tip.body)}</p><p style="margin:8px 0 0;font:14px/1.5 Arial,sans-serif;color:#5b6b85"><b style="color:#16213a">Try this:</b> ${esc(tip.tryThis)}</p>${i.trainingOn ? `<p style="margin:10px 0 0"><a href="${base}/training" style="font:13px Arial,sans-serif;color:#5b6b85">Want a refresher? Your trainings are in the portal.</a></p>` : ""}</div>`;
  const body = section("Your new hires", hireRows) + section("Your team this week", topRows) + section("Recognize someone", recogHtml) + section("A thought for the week", tipHtml);
  const lead = mine.find((h) => h.startDate >= today && h.startDate <= addDaysISO(today, 7));
  const subject = lead ? `Your week: ${first(lead.name)} starts ${dayName(lead.startDate, today)}` : top[0] ? `Your week: ${top[0].title}${top.length > 1 ? ` and ${top.length - 1} more` : ""}` : `Your week: ${tip.title}`;
  const html = shell({
    accent: client.accent,
    logo: logoHtml(client.name, client.logo),
    kicker: `For managers · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    title: `Good morning, ${fn}`,
    intro: mine.length || top.length ? "A few minutes on these and your team will notice." : "A quiet week. Here's one thing worth trying.",
    body,
    cta: { label: "Open your Team Hub", url: `${base}/hub` },
    footer: `You get this on Mondays because you lead people at ${esc(client.name)}.`,
  });
  const text =
    `Good morning, ${fn}\n` +
    (mine.length ? `\nYOUR NEW HIRES\n${mine.map((h) => `- ${h.name}, starts ${short(h.startDate)}`).join("\n")}\n` : "") +
    (top.length ? `\nYOUR TEAM THIS WEEK\n${top.map((x) => `- ${x.title}: ${x.why}`).join("\n")}\n` : "") +
    `\nRECOGNIZE SOMEONE\nWho on your team made the week better? A two-line shoutout takes a minute.${i.recognitionOn ? `\n${base}/recognition` : ""}\n` +
    `\nA THOUGHT FOR THE WEEK\n${tip.title}. ${tip.body}\nTry this: ${tip.tryThis}\n` +
    `\nOpen your Team Hub: ${base}/hub\n`;
  return { subject, html, text };
}

export { stepsFor };
