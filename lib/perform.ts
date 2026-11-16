// Alza Perform: performance reviews and improvement plans.
// Simple for managers (about 10 minutes, phone or computer), easy for employees (a link, no login),
// and on schedule without anyone remembering. English and Spanish throughout.
// The AI only rewords, sorts and translates what the manager said. It never rates, never adds facts,
// never decides anything. The manager always has the final say.

export type Lang = "en" | "es";
export type L = { en: string; es: string };
const l = (en: string, es: string): L => ({ en, es });

// ---------- templates ----------
export type Part = { id: string; name: L; desc?: L; on: boolean };
export type TemplateKind = "review" | "pip";
export interface ReviewTemplate {
  id: string;
  name: string;
  blurb: string;
  kind: TemplateKind;
  scale: 3 | 5;
  rate: Part[]; // rating areas (empty = no ratings)
  ask: Part[]; // the guided questions the manager answers in their own words
  minutes: number;
  on: boolean;
  builtIn?: boolean;
}

const P = (id: string, en: string, es: string, dEn?: string, dEs?: string): Part => ({ id, name: l(en, es), ...(dEn ? { desc: l(dEn, dEs ?? dEn) } : {}), on: true });
const ASK_STD = [
  P("well", "What's going well?", "¿Qué va bien?", "Strengths, wins, things to keep doing", "Fortalezas, logros, lo que debe seguir haciendo"),
  P("work", "What should they work on?", "¿En qué debe mejorar?", "One or two things, with an example if you can", "Una o dos cosas, con un ejemplo si puede"),
  P("help", "How will you help?", "¿Cómo le va a apoyar?", "Training, time, tools or check-ins", "Capacitación, tiempo, herramientas o reuniones"),
];

export const BUILT_IN: ReviewTemplate[] = [
  {
    id: "scorecard", name: "Quick scorecard", blurb: "Tap a rating for each area, add a line or two. The fastest way to do a real review.", kind: "review", scale: 5, minutes: 10, on: true, builtIn: true,
    rate: [
      P("quality", "Quality of work", "Calidad del trabajo", "Accurate, careful, done right", "Preciso, cuidadoso, bien hecho"),
      P("comm", "Communication", "Comunicación", "Keeps people in the loop", "Mantiene a todos informados"),
      P("team", "Teamwork", "Trabajo en equipo", "Helps others, easy to work with", "Ayuda a otros, fácil de trabajar"),
      P("reliable", "Reliability", "Confiabilidad", "On time, follows through", "Puntual, cumple lo que dice"),
      P("know", "Job knowledge", "Conocimiento del trabajo", "Knows the systems and the work", "Conoce los sistemas y el trabajo"),
      P("init", "Initiative", "Iniciativa", "Sees what needs doing", "Ve lo que hay que hacer"),
    ],
    ask: ASK_STD,
  },
  {
    id: "frontline", name: "Frontline check", blurb: "Three-point scale and plain words. Built for hourly and field teams.", kind: "review", scale: 3, minutes: 6, on: true, builtIn: true,
    rate: [
      P("shows", "Shows up", "Se presenta", "On time, ready to work", "Puntual, listo para trabajar"),
      P("right", "Does it right", "Lo hace bien", "Quality and safety", "Calidad y seguridad"),
      P("others", "Works well with others", "Trabaja bien con otros", "Team and customers", "Equipo y clientes"),
      P("owns", "Takes ownership", "Es responsable", "Fixes problems, speaks up", "Resuelve problemas, habla a tiempo"),
    ],
    ask: [ASK_STD[0], ASK_STD[1]],
  },
  {
    id: "ssc", name: "Start, Stop, Continue", blurb: "Three questions. Great for first-time managers and quick, honest conversations.", kind: "review", scale: 5, minutes: 8, on: false, builtIn: true,
    rate: [],
    ask: [
      P("start", "Start: what should they begin doing?", "Empezar: ¿qué debe comenzar a hacer?"),
      P("stop", "Stop: what should they rethink?", "Dejar: ¿qué debe reconsiderar?"),
      P("continue", "Continue: what should they keep doing?", "Continuar: ¿qué debe seguir haciendo?"),
      P("standout", "One accomplishment from this period", "Un logro de este periodo"),
    ],
  },
  {
    id: "intro", name: "New hire review", blurb: "For new hires after their first months. Short ratings plus how the start is going.", kind: "review", scale: 5, minutes: 10, on: true, builtIn: true,
    rate: [
      P("quality", "Quality of work", "Calidad del trabajo", "Accurate, careful, done right", "Preciso, cuidadoso, bien hecho"),
      P("comm", "Communication", "Comunicación", "Keeps people in the loop", "Mantiene a todos informados"),
      P("team", "Teamwork", "Trabajo en equipo", "Helps others, easy to work with", "Ayuda a otros, fácil de trabajar"),
      P("reliable", "Reliability", "Confiabilidad", "On time, follows through", "Puntual, cumple lo que dice"),
      P("know", "Job knowledge", "Conocimiento del trabajo", "Learning the systems and the work", "Aprendiendo los sistemas y el trabajo"),
    ],
    ask: ASK_STD,
  },
  {
    id: "growth", name: "Growth and development", blurb: "Looks ahead: strengths, skills to build, career interests and support.", kind: "review", scale: 5, minutes: 15, on: false, builtIn: true,
    rate: [],
    ask: [
      P("wins", "Key accomplishments", "Logros principales"),
      P("strengths", "Biggest strengths", "Mayores fortalezas"),
      P("improve", "Areas to improve", "Áreas de mejora"),
      P("skills", "Skills to develop", "Habilidades a desarrollar"),
      P("career", "Career interests", "Intereses profesionales", "Optional", "Opcional"),
      P("support", "Support needed", "Apoyo necesario"),
    ],
  },
];

export const PIP_TEMPLATE: ReviewTemplate = { id: "pip", name: "Performance improvement plan", blurb: "A clear plan with expectations, support and check-ins.", kind: "pip", scale: 5, rate: [], ask: [], minutes: 20, on: true, builtIn: true };

export const SCALE: Record<3 | 5, L[]> = {
  5: [l("Needs significant improvement", "Necesita mejorar mucho"), l("Developing", "En desarrollo"), l("Meets expectations", "Cumple expectativas"), l("Exceeds expectations", "Supera expectativas"), l("Exceptional", "Excepcional")],
  3: [l("Working on it", "Mejorando"), l("Solid", "Sólido"), l("Standout", "Destacado")],
};
/** Below expectations: 1-2 on a 5-point scale, 1 on a 3-point scale. */
export const isNegative = (n: number | undefined, scale: 3 | 5) => !!n && (scale === 5 ? n <= 2 : n <= 1);

// ---------- settings ----------
export interface PerformSettings {
  cadence: "year" | "half" | "quarter" | "custom";
  customMonths?: number;
  basis: "company" | "anniversary";
  cycleDue: string; // MM-DD, the company-wide due date (and every 6 or 3 months from it)
  openDays: number; // how long before the due date a review opens
  minTenureDays: number; // people hired more recently skip the company cycle (their new hire review covers them)
  intro: { on: boolean; days: number; template: string };
  template: string; // the default template for regular reviews
  selfAssess: boolean;
  selfDaysBefore: number;
  signOff: boolean;
  ai: boolean;
  talk: boolean; // "Talk it through" on phones
  execRead: boolean; // executives can open full reviews (they always see team summaries)
  admins: string[]; // emails who see and manage every review, besides Ben
  remind: number[]; // days before the due date
  overdueWeekly: boolean;
  pipAfter: number; // below-expectations reviews before suggesting a plan
  templates: ReviewTemplate[]; // the client's versions of the built-ins plus their own
}

export const DEFAULT_PERFORM: PerformSettings = {
  cadence: "year", basis: "company", cycleDue: "12-15", openDays: 45, minTenureDays: 90,
  intro: { on: true, days: 90, template: "intro" }, template: "scorecard",
  selfAssess: true, selfDaysBefore: 14, signOff: true, ai: true, talk: true, execRead: false, admins: [],
  remind: [30, 14, 7, 0], overdueWeekly: true, pipAfter: 2, templates: [],
};

export function performFor(x?: Partial<PerformSettings>): PerformSettings {
  const s = { ...DEFAULT_PERFORM, ...(x ?? {}), intro: { ...DEFAULT_PERFORM.intro, ...(x?.intro ?? {}) } };
  return s;
}

/** All templates: built-ins with the client's changes, then their own. */
export function templatesFor(s: PerformSettings): ReviewTemplate[] {
  const mine = new Map(s.templates.map((t) => [t.id, t]));
  const out = BUILT_IN.map((b) => (mine.has(b.id) ? { ...b, ...mine.get(b.id)!, builtIn: true } : b));
  for (const t of s.templates) if (!BUILT_IN.some((b) => b.id === t.id)) out.push({ ...t, builtIn: false });
  return out;
}
export const templateById = (s: PerformSettings, id: string) => (id === "pip" ? PIP_TEMPLATE : templatesFor(s).find((t) => t.id === id) ?? templatesFor(s)[0]);

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const cleanL = (v: unknown, n: number): L => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<L>;
  return { en: str(o.en, n), es: str(o.es, n) };
};
const cleanParts = (v: unknown, max: number): Part[] =>
  (Array.isArray(v) ? v : []).slice(0, max).map((p, i) => {
    const o = (p ?? {}) as Partial<Part>;
    const id = /^[a-z0-9_-]{1,24}$/i.test(String(o.id ?? "")) ? String(o.id) : `p${i + 1}`;
    const name = cleanL(o.name, 90);
    return { id, name: { en: name.en || name.es || "Untitled", es: name.es || name.en || "Sin título" }, ...(o.desc ? { desc: cleanL(o.desc, 160) } : {}), on: o.on !== false };
  });

export function cleanPerform(x: unknown): PerformSettings {
  const o = (x && typeof x === "object" ? x : {}) as Partial<PerformSettings>;
  const n = (v: unknown, d: number, min: number, max: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : d);
  const templates = (Array.isArray(o.templates) ? o.templates : []).slice(0, 20).map((t, i) => {
    const tt = (t ?? {}) as Partial<ReviewTemplate>;
    return {
      id: /^[a-z0-9_-]{1,24}$/i.test(String(tt.id ?? "")) ? String(tt.id) : `t${i + 1}`,
      name: str(tt.name, 60) || "My template",
      blurb: str(tt.blurb, 200),
      kind: "review" as const,
      scale: tt.scale === 3 ? 3 : 5,
      rate: cleanParts(tt.rate, 10),
      ask: cleanParts(tt.ask, 8),
      minutes: n(tt.minutes, 10, 3, 60),
      on: tt.on !== false,
    } as ReviewTemplate;
  });
  return {
    cadence: ["year", "half", "quarter", "custom"].includes(String(o.cadence)) ? (o.cadence as PerformSettings["cadence"]) : "year",
    customMonths: n(o.customMonths, 12, 1, 24),
    basis: o.basis === "anniversary" ? "anniversary" : "company",
    cycleDue: /^\d{2}-\d{2}$/.test(String(o.cycleDue)) ? String(o.cycleDue) : DEFAULT_PERFORM.cycleDue,
    openDays: n(o.openDays, 45, 7, 120),
    minTenureDays: n(o.minTenureDays, 90, 0, 365),
    intro: { on: o.intro?.on !== false, days: n(o.intro?.days, 90, 14, 365), template: str(o.intro?.template, 24) || "intro" },
    template: str(o.template, 24) || "scorecard",
    selfAssess: o.selfAssess !== false,
    selfDaysBefore: n(o.selfDaysBefore, 14, 1, 60),
    signOff: o.signOff !== false,
    ai: o.ai !== false,
    talk: o.talk !== false,
    execRead: !!o.execRead,
    admins: (Array.isArray(o.admins) ? o.admins : []).map((e) => str(e, 200).toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 20),
    remind: (Array.isArray(o.remind) ? o.remind : DEFAULT_PERFORM.remind).map((d) => n(d, 0, 0, 90)).filter((d, i, a) => a.indexOf(d) === i).sort((a, b) => b - a),
    overdueWeekly: o.overdueWeekly !== false,
    pipAfter: n(o.pipAfter, 2, 1, 5),
    templates,
  };
}

// ---------- reviews ----------
export type GoalStatus = "not_started" | "in_progress" | "done" | "deferred" | "na";
export const GOAL_STATUS: Record<GoalStatus, L> = {
  not_started: l("Not started", "Sin empezar"),
  in_progress: l("In progress", "En progreso"),
  done: l("Done", "Completado"),
  deferred: l("Pushed back", "Pospuesto"),
  na: l("No longer needed", "Ya no aplica"),
};
export interface Goal { id: string; text: string; measure?: string; by?: string; status: GoalStatus; note?: string }

export interface PipIssue { id: string; what: string; expected: string; support: string }
export interface Pip {
  issues: PipIssue[];
  start: string; // yyyy-mm-dd
  length: 30 | 60 | 90;
  checkins: { date: string; note?: string; done?: boolean }[];
  outcome: string;
  hrReviewed?: boolean; // Ben or a review admin looked it over before it's shared
}
export const DEFAULT_PIP_OUTCOME = "If these expectations aren't met by the end of the plan, further action may follow, up to and including termination. Meeting them closes the plan.";

export type ReviewKind = "cycle" | "intro" | "pip" | "adhoc";
export type ReviewStatus = "open" | "final" | "shared" | "done" | "cancelled";
export interface Review {
  id: string;
  clientId: string;
  personId: string;
  name: string;
  title: string;
  department?: string;
  hireDate?: string;
  managerName: string;
  managerEmail: string; // lowercase
  kind: ReviewKind;
  template: ReviewTemplate; // a copy taken when the review starts, so later template edits don't change it
  periodStart: string;
  periodEnd: string;
  due: string; // yyyy-mm-dd
  status: ReviewStatus;
  ratings: Record<string, number>;
  rateNotes: Record<string, string>;
  overall?: number;
  answers: Record<string, string>; // the manager's own words
  written: Record<string, string>; // the version that goes in the review (theirs, or a suggestion they accepted)
  goals: Goal[];
  goalUpdates: Record<string, { status: GoalStatus; note?: string }>; // progress on last review's goals
  lang: Lang; // the language the employee reads it in
  translated?: { lang: Lang; src?: string; written: Record<string, string>; goals: { id: string; text: string; measure?: string }[]; pip?: { issues: PipIssue[]; outcome: string } };
  /** HR chose to skip the employee's self-assessment for this one */
  noSelf?: boolean;
  self?: { token: string; sentAt?: string; doneAt?: string; answers?: { q: string; a: string }[]; lang?: Lang };
  share?: { token?: string; how: "link" | "person"; at: string; viewedAt?: string; ackAt?: string; comment?: string; deliveredAt?: string };
  pip?: Pip;
  finalAt?: string;
  finalBy?: string;
  versions?: { at: string; by: string; note: string }[];
  history: { at: string; by: string; text: string }[];
  createdAt: string;
}

export const KIND_LABEL: Record<ReviewKind, L> = {
  cycle: l("Review", "Evaluación"),
  intro: l("New hire review", "Evaluación de nuevo ingreso"),
  pip: l("Improvement plan", "Plan de mejora"),
  adhoc: l("Review", "Evaluación"),
};

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
export const addMonths = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); const m = d.getMonth() + n; d.setMonth(m); return iso(d); };
export const daysUntil = (day: string, today = iso(new Date())) => Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 864e5);
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export function newToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint32Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

/** What a manager and HR see as the status. Finished means signed off, delivered in person, or shared when sign-off is off. */
export type Stage = "upcoming" | "not_started" | "in_progress" | "ready" | "waiting" | "done" | "overdue" | "cancelled";
export const STAGE_LABEL: Record<Stage, L> = {
  upcoming: l("Coming up", "Próxima"),
  not_started: l("Not started", "Sin empezar"),
  in_progress: l("In progress", "En progreso"),
  ready: l("Ready to share", "Lista para compartir"),
  waiting: l("Waiting on sign-off", "Esperando confirmación"),
  done: l("Done", "Completada"),
  overdue: l("Overdue", "Atrasada"),
  cancelled: l("Cancelled", "Cancelada"),
};
export function stageOf(r: Review, s: PerformSettings, today = iso(new Date())): Stage {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "done") return "done";
  if (r.status === "shared") {
    if (r.share?.how === "person") return r.share.deliveredAt ? "done" : "waiting";
    return !s.signOff || r.share?.ackAt ? "done" : "waiting";
  }
  if (r.status === "final") return "ready";
  if (r.due < today) return "overdue";
  return started(r) ? "in_progress" : "not_started";
}
export const started = (r: Review) => Object.keys(r.ratings).length > 0 || Object.values(r.answers).some(Boolean) || r.goals.length > 0 || !!r.pip?.issues.some((i) => i.what);
export const isFinished = (r: Review, s: PerformSettings) => stageOf(r, s) === "done";

/** Steps of the guided review, from the template. */
export type StepId = "look" | "rate" | "words" | "goals" | "concerns" | "timeline" | "share";
export function stepsFor(r: Review): StepId[] {
  if (r.kind === "pip") return ["look", "concerns", "timeline", "share"];
  const t = r.template;
  return ["look", ...(t.rate.some((p) => p.on) ? (["rate"] as StepId[]) : []), ...(t.ask.some((p) => p.on) ? (["words"] as StepId[]) : []), "goals", "share"];
}

/** Average of the ratings, shown only for reference. Never used as the overall rating. */
export function average(r: Review): number | null {
  const v = r.template.rate.filter((p) => p.on).map((p) => r.ratings[p.id]).filter((n): n is number => !!n);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

// ---------- scheduling ----------
type Person = { id: string; name: string; title: string; department?: string; hireDate?: string; managerName: string; managerEmail: string; email?: string; active: boolean };
export type Due = { personId: string; kind: "cycle" | "intro"; due: string; periodStart: string; periodEnd: string; template: string };

const stepMonths = (s: PerformSettings) => (s.cadence === "half" ? 6 : s.cadence === "quarter" ? 3 : s.cadence === "custom" ? s.customMonths ?? 12 : 12);

/** The company-wide due dates around a day: every 12, 6 or 3 months from the yearly anchor. */
function companyDues(s: PerformSettings, today: string, count = 3): string[] {
  const step = stepMonths(s);
  const y = Number(today.slice(0, 4));
  let d = `${y - 1}-${s.cycleDue}`;
  const out: string[] = [];
  for (let i = 0; i < 40 && out.length < count; i++) {
    if (d >= addDays(today, -1)) out.push(d);
    d = addMonths(d, step);
  }
  return out;
}

/** Next regular reviews (and the new hire review) for one person, today or later. Never more than one regular review in a window. */
export function nextDue(p: Person, s: PerformSettings, today = iso(new Date()), count = 2): Due[] {
  if (!p.active) return [];
  const out: Due[] = [];
  const step = stepMonths(s);
  if (s.intro.on && p.hireDate) {
    const due = addDays(p.hireDate, s.intro.days);
    if (due >= addDays(today, -30)) out.push({ personId: p.id, kind: "intro", due, periodStart: p.hireDate, periodEnd: due, template: s.intro.template });
  }
  if (s.basis === "company") {
    for (const due of companyDues(s, today, count)) {
      if (p.hireDate && daysUntil(due, p.hireDate) < s.minTenureDays) continue; // too new: the new hire review covers them
      const start = addMonths(due, -step);
      out.push({ personId: p.id, kind: "cycle", due, periodStart: p.hireDate && p.hireDate > start ? p.hireDate : start, periodEnd: due, template: s.template });
    }
  } else if (p.hireDate) {
    let due = addMonths(p.hireDate, step);
    for (let i = 0; i < 200 && due < addDays(today, -1); i++) due = addMonths(due, step);
    for (let i = 0; i < count; i++) {
      out.push({ personId: p.id, kind: "cycle", due, periodStart: p.hireDate && p.hireDate > addMonths(due, -step) ? p.hireDate : addMonths(due, -step), periodEnd: due, template: s.template });
      due = addMonths(due, step);
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

/** A review starts as a fresh draft for this person. */
export function newReview(p: Person, clientId: string, d: { kind: ReviewKind; due: string; periodStart: string; periodEnd: string }, t: ReviewTemplate, by: string, lang: Lang = "en"): Review {
  const at = new Date().toISOString();
  return {
    id: `rv-${newId()}`, clientId, personId: p.id, name: p.name, title: p.title, department: p.department, hireDate: p.hireDate,
    managerName: p.managerName, managerEmail: (p.managerEmail || "").toLowerCase(), kind: d.kind,
    template: { ...t, rate: t.rate.filter((x) => x.on), ask: t.ask.filter((x) => x.on) },
    periodStart: d.periodStart, periodEnd: d.periodEnd, due: d.due, status: "open",
    ratings: {}, rateNotes: {}, answers: {}, written: {}, goals: [], goalUpdates: {}, lang,
    ...(d.kind === "pip" ? { pip: { issues: [{ id: newId(), what: "", expected: "", support: "" }], start: iso(new Date()), length: 60, checkins: pipCheckins(iso(new Date()), 60), outcome: DEFAULT_PIP_OUTCOME } } : {}),
    history: [{ at, by, text: "Review started" }], createdAt: at,
  };
}

/** Check-in dates for a plan: every 2 weeks for 30 days, otherwise every 30 days, ending on the last day. */
export function pipCheckins(start: string, length: 30 | 60 | 90): { date: string }[] {
  const every = length === 30 ? 14 : 30;
  const out: { date: string }[] = [];
  for (let d = every; d < length; d += every) out.push({ date: addDays(start, d) });
  out.push({ date: addDays(start, length) });
  return out;
}

/** Below-expectations reviews this person has had, newest first. */
export const negativeReviews = (all: Review[], personId: string) =>
  all.filter((r) => r.personId === personId && r.kind !== "pip" && ["shared", "done", "final"].includes(r.status) && isNegative(r.overall, r.template.scale)).sort((a, b) => (a.due < b.due ? 1 : -1));

// ---------- words ----------
/** The interface in English or Spanish. */
export const T = {
  en: {
    reviews: "Reviews", needsYou: "Needs you", comingUp: "Coming up", doneYear: "Done", start: "Start review", cont: "Continue", remind: "Send a reminder", view: "View",
    about: (m: number) => `About ${m} minutes`, minLeft: (m: number) => `About ${m} min left`, saved: "Saved", saving: "Saving…", back: "Back", next: "Next", step: (a: number, b: number) => `Step ${a} of ${b}`,
    look: "Look back", rate: "Ratings", words: "In your words", goals: "Goals", share: "Share", concerns: "Concerns", timeline: "Timeline",
    lookH: "Look back before you write", lookP: "Everything you need is here. Skim it, then move on.",
    selfH: (n: string) => `${n}'s self-assessment`, selfNone: (n: string) => `${n} hasn't filled it out yet.`, selfOff: "Self-assessment is off for this company.", sendSelf: "Send it now",
    notesH: "Your check-in notes", notesSub: "Only you and HR see these", notesNone: "No check-in notes in this period.",
    lastGoals: "Goals from last time", lastNone: (n: string) => `None yet. This is ${n}'s first review.`,
    rateH: (n: string) => `How is ${n} doing?`, rateP: "Tap a rating for each. A note is optional, but an example helps.", addNote: "Add a note", overall: "Overall", overallP: (a: string) => `Your call. The average of your ratings is ${a}, shown for reference only.`, notRated: "Not rated yet",
    wordsH: "Say it the way you'd say it", wordsP: "Short notes are fine. We'll help you put it into words.", polish: "Help me put it into words", polishing: "Working on it…", draft: "Draft", draftSub: "Built from your notes. Make it yours.", useThis: "Use this", keepMine: "Keep mine", shorter: "Shorter", warmer: "Warmer", specific: "More specific", example: "Want to add an example?",
    talk: "Talk it through", talkP: "Just talk. We'll help sort your thoughts.", listening: "Listening…", done: "I'm done", heard: "Here's what we heard", heardP: "Fix anything that came out wrong, like a name.", sortIt: "Sort my thoughts", addMore: "Add more", type: "I'd rather type", talkNo: "Talking isn't available in this browser. Tap the mic on your keyboard instead.", talkPrivacy: "Uses your phone's speech-to-text.",
    goalsH: "Goals for the next review", goalsP: "One or two is plenty. They carry into the next review.", goal: "Goal", measure: "How we'll know", by: "By", addGoal: "+ Add a goal", progress: "How did last time's goals go?",
    shareH: "Look it over and share", how: (n: string) => `How should ${n} get it?`, viaLink: (n: string) => `Send ${n} a link`, viaLinkSub: "They read it, can comment, and sign off. No login.", inPerson: "I'll go over it in person", inPersonSub: "Download it, then mark when you delivered it.",
    readsIn: (n: string) => `${n} reads it in`, translate: "Translate", translating: "Translating…", checkTr: "Check the translation. You can change anything.",
    finalize: "Finalize and share", finalNote: "Once finalized it's locked. Any change later is saved as a new version with a note.", doneH: "Done. Nice work.", markDelivered: "Mark delivered",
    pdf: "PDF", word: "Word",
    pipSuggest: (n: string, c: number) => `${n} has had ${c} reviews below expectations. A performance improvement plan can make expectations and support clear.`, buildPip: "Build a plan",
    concernsH: "What needs to change", concernsP: "For each concern: what's happening, what's expected, and the support you'll give.", issue: "What's happening", expected: "What's expected", support: "Support we'll give", addIssue: "+ Add a concern",
    timelineH: "How long, and when you'll check in", startDate: "Starts", length: "Length", days: (n: number) => `${n} days`, checkins: "Check-ins", outcome: "What happens at the end", hrReviewed: "HR has reviewed this plan", hrNeeded: "HR needs to review the plan before it's shared.",
    english: "English", spanish: "Español",
  },
  es: {
    reviews: "Evaluaciones", needsYou: "Pendientes", comingUp: "Próximas", doneYear: "Completadas", start: "Empezar evaluación", cont: "Continuar", remind: "Enviar recordatorio", view: "Ver",
    about: (m: number) => `Unos ${m} minutos`, minLeft: (m: number) => `Faltan unos ${m} min`, saved: "Guardado", saving: "Guardando…", back: "Atrás", next: "Siguiente", step: (a: number, b: number) => `Paso ${a} de ${b}`,
    look: "Repaso", rate: "Calificaciones", words: "En sus palabras", goals: "Metas", share: "Compartir", concerns: "Inquietudes", timeline: "Plazos",
    lookH: "Repase antes de escribir", lookP: "Todo lo que necesita está aquí. Léalo rápido y continúe.",
    selfH: (n: string) => `Autoevaluación de ${n}`, selfNone: (n: string) => `${n} todavía no la ha llenado.`, selfOff: "La autoevaluación está apagada para esta empresa.", sendSelf: "Enviarla ahora",
    notesH: "Sus notas de reuniones", notesSub: "Solo usted y RR. HH. las ven", notesNone: "No hay notas en este periodo.",
    lastGoals: "Metas de la vez anterior", lastNone: (n: string) => `Ninguna. Es la primera evaluación de ${n}.`,
    rateH: (n: string) => `¿Cómo le va a ${n}?`, rateP: "Elija una calificación para cada área. La nota es opcional, pero un ejemplo ayuda.", addNote: "Agregar nota", overall: "General", overallP: (a: string) => `Usted decide. El promedio de sus calificaciones es ${a}, solo como referencia.`, notRated: "Sin calificar",
    wordsH: "Dígalo como lo diría", wordsP: "Notas cortas están bien. Le ayudamos a ponerlo en palabras.", polish: "Ayúdeme a redactarlo", polishing: "Trabajando…", draft: "Borrador", draftSub: "Hecho con sus notas. Cámbielo a su gusto.", useThis: "Usar esto", keepMine: "Dejar el mío", shorter: "Más corto", warmer: "Más cálido", specific: "Más específico", example: "¿Quiere agregar un ejemplo?",
    talk: "Dígalo en voz alta", talkP: "Solo hable. Le ayudamos a ordenar sus ideas.", listening: "Escuchando…", done: "Terminé", heard: "Esto es lo que escuchamos", heardP: "Corrija lo que haya salido mal, como un nombre.", sortIt: "Ordenar mis ideas", addMore: "Agregar más", type: "Prefiero escribir", talkNo: "Hablar no está disponible en este navegador. Use el micrófono del teclado.", talkPrivacy: "Usa el dictado de su teléfono.",
    goalsH: "Metas para la próxima evaluación", goalsP: "Una o dos es suficiente. Pasan a la próxima evaluación.", goal: "Meta", measure: "Cómo lo sabremos", by: "Para", addGoal: "+ Agregar meta", progress: "¿Cómo les fue con las metas anteriores?",
    shareH: "Revise y comparta", how: (n: string) => `¿Cómo la recibe ${n}?`, viaLink: (n: string) => `Enviar un enlace a ${n}`, viaLinkSub: "La lee, puede comentar y confirma. Sin contraseña.", inPerson: "La reviso en persona", inPersonSub: "Descárguela y marque cuando la entregó.",
    readsIn: (n: string) => `${n} la lee en`, translate: "Traducir", translating: "Traduciendo…", checkTr: "Revise la traducción. Puede cambiar lo que quiera.",
    finalize: "Finalizar y compartir", finalNote: "Al finalizar se bloquea. Un cambio después se guarda como nueva versión con una nota.", doneH: "Listo. Buen trabajo.", markDelivered: "Marcar entregada",
    pdf: "PDF", word: "Word",
    pipSuggest: (n: string, c: number) => `${n} ha tenido ${c} evaluaciones por debajo de lo esperado. Un plan de mejora aclara expectativas y apoyo.`, buildPip: "Crear un plan",
    concernsH: "Qué necesita cambiar", concernsP: "Para cada inquietud: qué pasa, qué se espera y el apoyo que dará.", issue: "Qué está pasando", expected: "Qué se espera", support: "Apoyo que daremos", addIssue: "+ Agregar inquietud",
    timelineH: "Duración y reuniones de seguimiento", startDate: "Empieza", length: "Duración", days: (n: number) => `${n} días`, checkins: "Seguimiento", outcome: "Qué pasa al final", hrReviewed: "RR. HH. revisó este plan", hrNeeded: "RR. HH. debe revisar el plan antes de compartirlo.",
    english: "English", spanish: "Español",
  },
};

/** What the employee answers, in their language. */
export const SELF_Q: L[] = [
  l("What are you most proud of from this period?", "¿De qué está más orgulloso/a en este periodo?"),
  l("What's been hard?", "¿Qué ha sido difícil?"),
  l("What do you want to get better at?", "¿En qué quiere mejorar?"),
  l("What would help you do your best work?", "¿Qué le ayudaría a hacer su mejor trabajo?"),
];

export const ACK_TEXT: L = l(
  "I acknowledge that I have received and had the opportunity to discuss this performance review. My acknowledgment confirms receipt and does not necessarily indicate agreement with all assessments or comments.",
  "Confirmo que recibí esta evaluación de desempeño y tuve la oportunidad de hablar sobre ella. Mi confirmación indica que la recibí y no necesariamente que estoy de acuerdo con todas las evaluaciones o comentarios."
);
export const ACK_TEXT_PIP: L = l(
  "I acknowledge that I have received and had the opportunity to discuss this performance improvement plan. My acknowledgment confirms receipt and does not necessarily indicate agreement.",
  "Confirmo que recibí este plan de mejora y tuve la oportunidad de hablar sobre él. Mi confirmación indica que lo recibí y no necesariamente que estoy de acuerdo."
);

export const fmtDay = (day: string, lang: Lang = "en") => (day ? new Date(`${day}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Everything the manager wrote, keyed for translation. */
export function trFields(r: Review): Record<string, string> {
  const f: Record<string, string> = {};
  for (const p of r.template.ask) { const v = (r.written[p.id] ?? r.answers[p.id] ?? "").trim(); if (v) f[`a.${p.id}`] = v; }
  for (const p of r.template.rate) if (r.rateNotes[p.id]?.trim()) f[`n.${p.id}`] = r.rateNotes[p.id];
  r.goals.forEach((x) => { if (x.text) f[`g.${x.id}`] = x.text; if (x.measure) f[`m.${x.id}`] = x.measure; });
  r.pip?.issues.forEach((x) => { if (x.what) f[`pw.${x.id}`] = x.what; if (x.expected) f[`pe.${x.id}`] = x.expected; if (x.support) f[`ps.${x.id}`] = x.support; });
  if (r.pip?.outcome) f.outcome = r.pip.outcome;
  return f;
}
/** A short fingerprint of that text, so a translation can tell when it's out of date. */
export function trSrc(r: Review) {
  const s = JSON.stringify(trFields(r));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}.${(h >>> 0).toString(36)}`;
}

/** The finished review as plain sections, in the employee's language. Used by the page, the PDF view and the Word file. */
export function docOf(r: Review, company: string, lang: Lang = r.lang) {
  const tr = r.translated && r.translated.lang === lang && (!r.translated.src || r.translated.src === trSrc(r)) ? r.translated : null;
  const t = r.template;
  const scale = SCALE[t.scale];
  const rated = t.rate.filter((p) => r.ratings[p.id]).map((p) => ({ name: p.name[lang], value: r.ratings[p.id], label: scale[r.ratings[p.id] - 1]?.[lang] ?? "", note: tr?.written[`n.${p.id}`] ?? r.rateNotes[p.id] ?? "" }));
  const written = t.ask.map((p) => ({ q: p.name[lang], a: (tr?.written[p.id] ?? r.written[p.id] ?? r.answers[p.id] ?? "").trim() })).filter((x) => x.a);
  const goals = r.goals.map((g) => {
    const x = tr?.goals.find((y) => y.id === g.id);
    return { text: x?.text ?? g.text, measure: x?.measure ?? g.measure ?? "", by: g.by ?? "" };
  });
  const pip = r.pip ? { ...r.pip, checkins: r.pip.checkins.length ? r.pip.checkins : pipCheckins(r.pip.start, r.pip.length), issues: tr?.pip?.issues ?? r.pip.issues, outcome: tr?.pip?.outcome ?? r.pip.outcome } : null;
  const title = r.kind === "pip" ? (lang === "es" ? "Plan de mejora de desempeño" : "Performance Improvement Plan") : r.kind === "intro" ? KIND_LABEL.intro[lang] : lang === "es" ? "Evaluación de desempeño" : "Performance Review";
  return {
    title, company, name: r.name, jobTitle: r.title, department: r.department ?? "", manager: r.managerName, hireDate: r.hireDate ?? "",
    period: `${fmtDay(r.periodStart, lang)} – ${fmtDay(r.periodEnd, lang)}`, date: fmtDay((r.finalAt ?? new Date().toISOString()).slice(0, 10), lang),
    format: r.kind === "pip" ? "" : t.name, rated, overall: r.overall ? { value: r.overall, label: scale[r.overall - 1]?.[lang] ?? "" } : null,
    written, goals, pip,
    comment: r.share?.comment ?? "",
    ack: r.share?.ackAt ? fmtDay(r.share.ackAt.slice(0, 10), lang) : r.share?.deliveredAt ? fmtDay(r.share.deliveredAt.slice(0, 10), lang) : "",
    ackHow: r.share?.how ?? "link",
    managerDone: r.finalAt ? fmtDay(r.finalAt.slice(0, 10), lang) : "",
    ackText: (r.kind === "pip" ? ACK_TEXT_PIP : ACK_TEXT)[lang],
    lang,
  };
}
export type Doc = ReturnType<typeof docOf>;

/** The same review as light markdown for the Word file. */
export function docText(d: Doc): string {
  const es = d.lang === "es";
  const L2 = (en: string, s: string) => (es ? s : en);
  const lines = [
    `# ${d.title}`,
    `**${L2("Employee", "Empleado/a")}:** ${d.name}${d.jobTitle ? `, ${d.jobTitle}` : ""}`,
    d.department ? `**${L2("Department", "Departamento")}:** ${d.department}` : "",
    `**${L2("Manager", "Gerente")}:** ${d.manager}`,
    d.hireDate ? `**${L2("Hire date", "Fecha de ingreso")}:** ${fmtDay(d.hireDate, d.lang)}` : "",
    `**${L2("Review period", "Periodo")}:** ${d.period}`,
    `**${L2("Date", "Fecha")}:** ${d.date}`,
    d.format ? `**${L2("Format", "Formato")}:** ${d.format}` : "",
  ];
  if (d.rated.length) {
    lines.push(`## ${L2("Ratings", "Calificaciones")}`);
    for (const x of d.rated) lines.push(`- **${x.name}:** ${x.value} · ${x.label}${x.note ? `. ${x.note}` : ""}`);
  }
  if (d.overall) lines.push(`**${L2("Overall", "General")}:** ${d.overall.value} · ${d.overall.label}`);
  for (const w of d.written) lines.push(`## ${w.q}`, w.a);
  if (d.pip) {
    lines.push(`## ${L2("What needs to change", "Qué necesita cambiar")}`);
    d.pip.issues.forEach((i, k) => lines.push(`${k + 1}. **${i.what}**`, `- ${L2("Expected", "Se espera")}: ${i.expected}`, `- ${L2("Support", "Apoyo")}: ${i.support}`));
    lines.push(`## ${L2("Timeline", "Plazos")}`, `${L2("Starts", "Empieza")} ${fmtDay(d.pip.start, d.lang)}, ${d.pip.length} ${L2("days", "días")}.`, ...d.pip.checkins.map((c) => `- ${L2("Check-in", "Seguimiento")}: ${fmtDay(c.date, d.lang)}`), `## ${L2("At the end of the plan", "Al final del plan")}`, d.pip.outcome);
  }
  if (d.goals.length) {
    lines.push(`## ${L2("Goals for the next review", "Metas para la próxima evaluación")}`);
    for (const g of d.goals) lines.push(`- ${g.text}${g.measure ? ` (${g.measure})` : ""}${g.by ? `, ${L2("by", "para")} ${g.by}` : ""}`);
  }
  if (d.comment) lines.push(`## ${L2("Employee comments", "Comentarios del empleado/a")}`, d.comment);
  lines.push(`## ${L2("Acknowledgment", "Confirmación")}`, d.ackText, `${L2("Manager completed", "Gerente completó")}: ${d.managerDone || "________"}`, `${L2("Employee acknowledged", "Empleado/a confirmó")}: ${d.ack || "________"}`);
  return lines.filter(Boolean).join("\n");
}
