// HR Roadmap: the company's HR year. Setup answers become planned projects with checklists and dates;
// reminders go out before each one, it starts on its start date, and repeats next year when it's done.
// Shared by the browser and the server. No secrets here.
import { Person, Project, Subtask } from "./data";

export type Cat = "people" | "pay" | "compliance" | "talent";
export const CATS: { key: Cat; label: string; color: string }[] = [
  { key: "people", label: "People and culture", color: "#0f6e63" },
  { key: "pay", label: "Pay and benefits", color: "#b8862a" },
  { key: "compliance", label: "Compliance", color: "#b15a48" },
  { key: "talent", label: "Talent and workforce", color: "#4d63a8" },
];
export const catOf = (c: Cat) => CATS.find((x) => x.key === c)!;

export type Repeat = "yearly" | "quarterly" | "none";
export interface RoadmapMeta {
  tpl: string;
  cat: Cat;
  start: string; // yyyy-mm-dd
  end: string;
  repeat: Repeat;
  owner?: Person;
  sent?: string[]; // reminder keys already sent ("90", "30", "due", "late-2026-12-07")
  next?: string; // the project id of next year's copy
}
export type RoadmapProject = Project & { roadmap: RoadmapMeta };
export const isRoadmap = (p: Project): p is RoadmapProject => !!(p as RoadmapProject).roadmap;

export interface Tpl {
  id: string;
  cat: Cat;
  title: string;
  blurb: string;
  month: number; // recommended start month, 1-12
  day?: number; // recommended day of month
  days: number; // how long it runs
  repeat: Repeat;
  steps: [string, number][]; // text, days from the start (negative = before it starts)
  link?: { label: string; path: string }; // a part of the People Hub it opens
  must?: boolean; // a California must-do Alza adds by default
}

export const TEMPLATES: Tpl[] = [
  // people and culture
  { id: "reviews", cat: "people", title: "Annual performance reviews", month: 1, day: 5, days: 25, repeat: "yearly", blurb: "Manager reviews, self-assessments, review conversations and documentation for everyone.", link: { label: "Launch reviews", path: "reviews" },
    steps: [["Finalize the review form", -35], ["Tell managers the timeline and what's expected", -21], ["Launch self-assessments", 0], ["Managers complete reviews", 18], ["Hold review conversations", 23], ["Finalize and file signed reviews", 25], ["Look at trends and training needs", 32]] },
  { id: "midyear", cat: "people", title: "Mid-year check-ins", month: 7, day: 6, days: 21, repeat: "yearly", blurb: "A lighter mid-year conversation on goals, progress and support.", link: { label: "Open Reviews", path: "reviews" },
    steps: [["Share the check-in guide with managers", -14], ["Managers hold check-ins", 0], ["Update goals", 18], ["Note who needs support", 21]] },
  { id: "survey", cat: "people", title: "Culture and engagement survey", month: 1, day: 12, days: 19, repeat: "yearly", blurb: "The yearly read on leadership, trust, communication, growth and workload.", link: { label: "Start the survey in Pulse", path: "pulse/library" },
    steps: [["Review last year's results and actions", -21], ["Tell employees it's coming and why", -5], ["Launch the survey", 0], ["Close and generate the insight", 19], ["Share results and the action plan", 33]] },
  { id: "pulse", cat: "people", title: "Quarterly pulse check", month: 3, day: 10, days: 7, repeat: "quarterly", blurb: "Four quick questions on morale, workload and communication.", link: { label: "Send a pulse in Pulse", path: "pulse/library" },
    steps: [["Pick the questions", -5], ["Send the pulse", 0], ["Review results", 8]] },
  { id: "mgrtraining", cat: "people", title: "Manager training series", month: 2, day: 10, days: 60, repeat: "yearly", blurb: "A short series for managers: feedback, tough conversations, leading change.", link: { label: "Open Training", path: "training" },
    steps: [["Pick the topics", -21], ["Schedule sessions", -14], ["Session 1", 0], ["Session 2", 30], ["Session 3", 60]] },
  { id: "appreciation", cat: "people", title: "Employee appreciation day", month: 3, day: 6, days: 1, repeat: "yearly", blurb: "Thank the team. Plan something people actually enjoy.", link: { label: "Open the Team Wall", path: "recognition" },
    steps: [["Choose what you'll do and the budget", -30], ["Order anything needed", -14], ["Announce it", -7], ["Appreciation day", 0]] },
  { id: "party", cat: "people", title: "Holiday party", month: 12, day: 12, days: 1, repeat: "yearly", blurb: "Date, venue, invites and a plan for the night.",
    steps: [["Set the date and budget", -75], ["Book the venue", -60], ["Send invites", -30], ["Confirm headcount and details", -10], ["Party", 0]] },
  { id: "retreat", cat: "people", title: "Company retreat or anniversary", month: 9, day: 15, days: 2, repeat: "yearly", blurb: "Plan the yearly get-together.",
    steps: [["Set goals and budget", -90], ["Book location", -75], ["Agenda", -30], ["Send details", -14], ["Event", 0]] },
  // pay and benefits
  { id: "comp", cat: "pay", title: "Compensation and merit review", month: 1, day: 15, days: 31, repeat: "yearly", blurb: "Set the budget, review pay against the market and roles, approve increases.",
    steps: [["Set the merit budget", -21], ["Pull current pay and market data", -14], ["Managers recommend increases", 7], ["Leadership approves", 21], ["Tell employees and update payroll", 31]] },
  { id: "enrollment", cat: "pay", title: "Benefits open enrollment", month: 11, day: 1, days: 30, repeat: "yearly", blurb: "Renewal, plan decisions, employee education and enrollment.",
    steps: [["Start the renewal with your broker", -90], ["Confirm plans and pricing", -60], ["Prepare communications", -45], ["Employee education session", -30], ["Open enrollment begins", 0], ["Reminder to anyone who hasn't enrolled", 16], ["Enrollment closes", 30], ["Audit enrollment records", 44]] },
  { id: "payequity", cat: "pay", title: "Pay equity check", month: 4, day: 1, days: 30, repeat: "yearly", blurb: "Look for pay gaps by role and fix what you find.",
    steps: [["Pull pay by role and level", 0], ["Review gaps", 14], ["Plan fixes", 30]] },
  // compliance
  { id: "posters", cat: "compliance", title: "Labor law posters", month: 1, day: 2, days: 14, repeat: "yearly", must: true, blurb: "Post the new year's required federal, California and local notices (and share them with remote staff).",
    steps: [["Order or download updated posters", -14], ["Post at each location and share with remote staff", 0]] },
  { id: "handbook", cat: "compliance", title: "Handbook review", month: 2, day: 1, days: 28, repeat: "yearly", blurb: "Update for new laws and how you actually work, then collect acknowledgments.", link: { label: "Open Resources", path: "resources" },
    steps: [["List law changes for the year", -7], ["Draft updates", 7], ["Leadership review", 18], ["Publish and collect acknowledgments", 28]] },
  { id: "harassment", cat: "compliance", title: "Harassment prevention training check", month: 1, day: 15, days: 14, repeat: "yearly", must: true, blurb: "Make sure everyone's training is current. Required training tracks renewals and reminders.", link: { label: "Open Required training", path: "training/required" },
    steps: [["Check who's due this year", 0], ["Send reminders", 3], ["Follow up on anyone late", 14]] },
  { id: "violence", cat: "compliance", title: "Workplace violence plan review", month: 7, day: 1, days: 30, repeat: "yearly", must: true, blurb: "California requires a yearly review of your workplace violence prevention plan and training.", link: { label: "Open Required training", path: "training/required" },
    steps: [["Review incidents and the log", 0], ["Update the plan", 14], ["Refresh training", 30]] },
  { id: "paydata", cat: "compliance", title: "California pay data report", month: 4, day: 1, days: 40, repeat: "yearly", blurb: "For 100+ employees: file with the Civil Rights Department, usually due in May.",
    steps: [["Confirm you're required to file", 0], ["Pull the data from payroll", 14], ["File the report", 35]] },
  { id: "i9", cat: "compliance", title: "I-9 and personnel file audit", month: 6, day: 1, days: 30, repeat: "yearly", blurb: "Check I-9s and personnel files are complete and stored correctly.",
    steps: [["Pull a sample of files", 0], ["Fix what's missing", 21], ["Note findings", 30]] },
  // talent and workforce
  { id: "jds", cat: "talent", title: "Job description review", month: 10, day: 1, days: 30, repeat: "yearly", blurb: "Keep job descriptions and pay ranges current (California pay transparency).",
    steps: [["List roles to review", 0], ["Managers update their roles", 14], ["Check pay ranges", 21], ["Finalize", 30]] },
  { id: "workforce", cat: "talent", title: "Workforce and hiring plan", month: 10, day: 15, days: 45, repeat: "yearly", blurb: "Next year's headcount, hiring priorities and budget.",
    steps: [["Gather each team's needs", 0], ["Draft the plan and budget", 21], ["Leadership approves", 45]] },
  { id: "succession", cat: "talent", title: "Succession planning", month: 9, day: 1, days: 30, repeat: "yearly", blurb: "Who could step into key roles, and what they need to get ready.",
    steps: [["List key roles", 0], ["Identify successors", 14], ["Development plans", 30]] },
];
export const tplById = (id: string) => TEMPLATES.find((t) => t.id === id);

// ---------- setup questions ----------
export interface Q { tpl: string; ask: string; also?: { tpl: string; ask: string } }
export const STEPS: { key: string; label: string; qs: Q[] }[] = [
  { key: "people", label: "People and performance", qs: [
    { tpl: "reviews", ask: "When do you do annual performance reviews?", also: { tpl: "midyear", ask: "Also do a mid-year check-in?" } },
    { tpl: "survey", ask: "When do you run an employee engagement survey?", also: { tpl: "pulse", ask: "Add a short quarterly pulse?" } },
    { tpl: "mgrtraining", ask: "When do you train managers?" },
  ] },
  { key: "pay", label: "Pay and benefits", qs: [
    { tpl: "comp", ask: "When do you review pay and give merit increases?" },
    { tpl: "enrollment", ask: "When does benefits open enrollment start?" },
    { tpl: "payequity", ask: "When would you check for pay gaps?" },
  ] },
  { key: "compliance", label: "Compliance", qs: [
    { tpl: "handbook", ask: "When do you update the employee handbook?" },
    { tpl: "i9", ask: "When should I-9s and personnel files be audited?" },
    { tpl: "paydata", ask: "California pay data report (only if you have 100+ employees)" },
  ] },
  { key: "culture", label: "Culture and events", qs: [
    { tpl: "appreciation", ask: "Employee appreciation day?" },
    { tpl: "party", ask: "Holiday party?" },
    { tpl: "retreat", ask: "Company retreat or anniversary?" },
  ] },
  { key: "talent", label: "Talent and planning", qs: [
    { tpl: "jds", ask: "When do you review job descriptions?" },
    { tpl: "workforce", ask: "When do you plan next year's hiring?" },
    { tpl: "succession", ask: "When would you do succession planning?" },
  ] },
];
/** One answer: a month, exact dates, or off. */
export interface Ans { month?: number; start?: string; end?: string; off?: boolean; rec?: boolean }

// ---------- settings ----------
export interface RoadmapSettings {
  setupAt?: string;
  setupBy?: string;
  answers: Record<string, Ans>;
  remind: number[]; // days before start
  dueDay: boolean;
  overdueWeekly: boolean;
  toOwner: boolean;
  toBen: boolean;
  toExecs: boolean;
  extra: string[]; // more emails
}
export const DEFAULT_SETTINGS: RoadmapSettings = { answers: {}, remind: [90, 60, 30, 14, 7], dueDay: true, overdueWeekly: true, toOwner: true, toBen: true, toExecs: false, extra: [] };
export const REMIND_CHOICES = [90, 60, 30, 14, 7, 3, 1];
export const roadmapFor = (r: Partial<RoadmapSettings> | undefined): RoadmapSettings => ({ ...DEFAULT_SETTINGS, ...(r ?? {}), answers: { ...(r?.answers ?? {}) } });

export function cleanSettings(raw: unknown, keep: RoadmapSettings): RoadmapSettings {
  const r = (raw ?? {}) as Partial<RoadmapSettings>;
  const answers: Record<string, Ans> = {};
  for (const [k, v] of Object.entries(r.answers ?? keep.answers)) {
    if (!tplById(k)) continue;
    const a = v as Ans;
    answers[k] = { rec: !!a.rec || undefined, month: a.month && a.month >= 1 && a.month <= 12 ? Math.round(a.month) : undefined, start: DAY.test(String(a.start)) ? a.start : undefined, end: DAY.test(String(a.end)) ? a.end : undefined, off: !!a.off };
  }
  return {
    ...keep,
    answers,
    remind: Array.isArray(r.remind) ? [...new Set(r.remind.map(Number).filter((n) => n > 0 && n <= 365))].sort((a, b) => b - a).slice(0, 8) : keep.remind,
    dueDay: r.dueDay ?? keep.dueDay,
    overdueWeekly: r.overdueWeekly ?? keep.overdueWeekly,
    toOwner: r.toOwner ?? keep.toOwner,
    toBen: r.toBen ?? keep.toBen,
    toExecs: r.toExecs ?? keep.toExecs,
    extra: Array.isArray(r.extra) ? r.extra.map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 10) : keep.extra,
    setupAt: r.setupAt ?? keep.setupAt,
    setupBy: r.setupBy ?? keep.setupBy,
  };
}

// ---------- dates ----------
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayISO = () => iso(new Date());
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export const daysUntil = (day: string, from = todayISO()) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5);
/** The next time this month/day comes around, today or later. */
export function nextDate(month: number, day = 1, from = todayISO()): string {
  const y = Number(from.slice(0, 4));
  const d = iso(new Date(y, month - 1, Math.min(day, 28)));
  return d >= from ? d : iso(new Date(y + 1, month - 1, Math.min(day, 28)));
}

// ---------- building the year ----------
const nid = () => `rm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function makeItem(t: Tpl, clientId: string, start: string, end: string, owner: Person | undefined, by?: Person): RoadmapProject {
  const steps: Subtask[] = t.steps.map(([text, off], i) => ({ id: `s${i + 1}`, text, done: false, due: addDays(start, off) }));
  return {
    id: nid(), clientId, name: t.title, status: "planned", summary: t.blurb, steps, nextMilestone: steps[0]?.text ?? "", milestoneDue: start,
    createdBy: by, roadmap: { tpl: t.id, cat: t.cat, start, end, repeat: t.repeat, owner },
  };
}

/** Everything the answers (plus the must-dos) put on the next 12 months. Skips what's already there. */
export function buildYear(s: RoadmapSettings, clientId: string, existing: Project[], owner?: Person, by?: Person, opts?: { compliance?: boolean; from?: string }): RoadmapProject[] {
  const from = opts?.from ?? todayISO();
  const have = existing.filter((p) => p.clientId === clientId && isRoadmap(p) && p.status !== "done") as RoadmapProject[];
  const out: RoadmapProject[] = [];
  const add = (t: Tpl, start: string, end: string) => {
    if (have.some((p) => p.roadmap.tpl === t.id && Math.abs(daysUntil(p.roadmap.start, start)) < 45) || out.some((p) => p.roadmap.tpl === t.id && p.roadmap.start === start)) return;
    out.push(makeItem(t, clientId, start, end, owner, by));
  };
  for (const t of TEMPLATES) {
    const a = s.answers[t.id];
    const on = a ? !a.off && (a.month || a.start) : t.must && (t.id !== "harassment" || opts?.compliance !== false);
    if (!on) continue;
    if (a?.start && a.start >= from) { add(t, a.start, a.end && a.end >= a.start ? a.end : addDays(a.start, t.days)); continue; }
    const month = a?.month ?? (a?.start ? Number(a.start.slice(5, 7)) : t.month);
    const day = a?.start ? Number(a.start.slice(8, 10)) : t.day ?? 1;
    const len = a?.start && a.end ? Math.max(0, daysUntil(a.end, a.start)) : t.days;
    if (t.repeat === "quarterly") {
      for (let q = 0; q < 4; q++) { const st = nextDate(((month - 1 + q * 3) % 12) + 1, day, from); add(t, st, addDays(st, len)); }
    } else {
      const st = nextDate(month, day, from);
      add(t, st, addDays(st, len));
    }
  }
  return out;
}

/** Next year's copy of a finished item, same checklist and owner. */
export function nextCopy(p: RoadmapProject): RoadmapProject | null {
  if (p.roadmap.repeat === "none") return null;
  const t = tplById(p.roadmap.tpl);
  const gap = p.roadmap.repeat === "quarterly" ? 3 : 12;
  const s = new Date(`${p.roadmap.start}T12:00:00`);
  s.setMonth(s.getMonth() + gap);
  let start = iso(s);
  while (start < todayISO()) { const d = new Date(`${start}T12:00:00`); d.setMonth(d.getMonth() + gap); start = iso(d); }
  const len = Math.max(0, daysUntil(p.roadmap.end, p.roadmap.start));
  const shift = daysUntil(start, p.roadmap.start);
  const steps: Subtask[] = p.steps.map((x) => ({ id: x.id, text: x.text, done: false, due: x.due ? addDays(x.due, shift) : undefined }));
  return {
    id: nid(), clientId: p.clientId, name: p.name, status: "planned", summary: p.summary || t?.blurb || "", steps, nextMilestone: steps[0]?.text ?? "", milestoneDue: start,
    createdBy: p.createdBy, roadmap: { tpl: p.roadmap.tpl, cat: p.roadmap.cat, start, end: addDays(start, len), repeat: p.roadmap.repeat, owner: p.roadmap.owner },
  };
}

export type Phase = "done" | "overdue" | "active" | "soon" | "planned";
export function phaseOf(p: RoadmapProject, day = todayISO()): Phase {
  if (p.status === "done") return "done";
  if (p.roadmap.end < day) return "overdue";
  if (p.status === "active" || p.roadmap.start <= day) return "active";
  if (daysUntil(p.roadmap.start, day) <= 30) return "soon";
  return "planned";
}
export const PHASE_LABEL: Record<Phase, string> = { done: "Done", overdue: "Overdue", active: "Underway", soon: "Coming up", planned: "Planned" };
export const fmtShort = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtRange = (a: string, b: string) => (a === b ? fmtShort(a) : `${fmtShort(a)} to ${fmtShort(b)}`);
