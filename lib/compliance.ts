// Required training: California harassment prevention (CRD course), workplace violence prevention
// (the company's own plan), and anything else a client wants to track. One record per person per
// course per cycle. Shared by the server, the People Hub pages and the employee's link page.
import { addDays, iso, newId, newToken } from "./perform";
import type { TeamMember } from "./team";

export type Lang = "en" | "es";
export type Proof = "certificate" | "signoff";
export type Who = "all" | "supervisors" | "employees";

export interface Course {
  id: string;
  /** crd = the state's harassment course (picks the supervisor or employee version); plan = your own plan/policy with a sign-off; custom = a link and a certificate */
  kind: "crd" | "plan" | "custom";
  name: string;
  about: string;
  on: boolean;
  who: Who;
  /** how often, in months (24 = every 2 years) */
  everyMonths: number;
  /** new hires get this many days from their start date */
  newHireDays: number;
  proof: Proof;
  /** custom: where the course lives */
  link?: string;
  /** plan: the plan file people read (storage path), a video, and when the live Q&A is */
  planPath?: string;
  planName?: string;
  videoUrl?: string;
  qa?: string;
  /** plan: let people send a question to HR */
  questions?: boolean;
  minutes?: number;
}

export interface ComplianceSettings {
  courses: Course[];
  /** reminder emails this many days before the due date */
  remind: number[];
  overdueWeekly: boolean;
  /** clean certificates are approved without waiting for HR */
  autoApprove: boolean;
  /** who checks certificates and answers questions (besides HR and executives) */
  admins: string[];
  /** people added to or taken off the supervisor list by hand (roster ids) */
  supAdd: string[];
  supRemove: string[];
  /** when training was turned on; everyone already here gets catchUpDays from then */
  startedAt?: string;
  catchUpDays: number;
  /** emails only go out once HR presses Launch */
  live: boolean;
}

export const CRD_LANGS: { id: string; label: string }[] = [
  { id: "English", label: "English" },
  { id: "Spanish", label: "Español" },
  { id: "Chinese", label: "中文" },
  { id: "Korean", label: "한국어" },
  { id: "Vietnamese", label: "Tiếng Việt" },
  { id: "Tagalog", label: "Tagalog" },
];
/** The state's free course: https://calcivilrights.ca.gov/shpt/ */
export const crdLink = (variant: Variant, lang = "English") =>
  `https://sexual-harassment-prevention-training.calcivilrights.ca.gov/${variant === "supervisor" ? "Supervisory" : "NonSupervisory"}${CRD_LANGS.some((l) => l.id === lang) ? lang : "English"}/story.html`;
export const CRD_PAGE = "https://calcivilrights.ca.gov/shpt/";

export const CRD_COURSE: Course = {
  id: "ca-harassment", kind: "crd", name: "Harassment prevention", on: true, who: "all", everyMonths: 24, newHireDays: 180, proof: "certificate",
  about: "California SB 1343. Free course from the Civil Rights Department. Supervisors take the 2-hour version, everyone else 1 hour.",
};
export const WVP_COURSE: Course = {
  id: "ca-violence", kind: "plan", name: "Workplace violence prevention", on: false, who: "all", everyMonths: 12, newHireDays: 30, proof: "signoff", questions: true, minutes: 20,
  about: "California SB 553. Everyone reviews your prevention plan once a year and gets a chance to ask questions.",
};

export const defaults = (): ComplianceSettings => ({
  courses: [CRD_COURSE, WVP_COURSE], remind: [60, 30, 7], overdueWeekly: true, autoApprove: true, admins: [], supAdd: [], supRemove: [], catchUpDays: 60, live: false,
});

export function complianceFor(x?: Partial<ComplianceSettings>): ComplianceSettings {
  const d = defaults();
  const s = { ...d, ...(x ?? {}) } as ComplianceSettings;
  // presets always exist, even if an older save is missing one
  const have = new Set((s.courses ?? []).map((c) => c.id));
  s.courses = [...(s.courses ?? []), ...d.courses.filter((c) => !have.has(c.id))];
  return s;
}

const str = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
const int = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const url = (v: unknown) => { const s = str(v, 500); return /^https:\/\/[^\s]+$/i.test(s) ? s : ""; };

/** Server-side cleanup of settings sent from the browser. */
export function cleanCompliance(raw: unknown, prev?: ComplianceSettings): ComplianceSettings {
  const b = (raw ?? {}) as Partial<ComplianceSettings>;
  const base = complianceFor(prev);
  const courses = (Array.isArray(b.courses) ? b.courses : base.courses).slice(0, 30).map((c0): Course => {
    const c = c0 as Partial<Course>;
    const kind = c.kind === "crd" || c.kind === "plan" ? c.kind : "custom";
    const id = /^[a-z0-9-]{2,40}$/.test(String(c.id)) ? String(c.id) : `c-${newId()}`;
    return {
      id, kind, name: str(c.name, 80) || "Training", about: str(c.about, 400), on: !!c.on,
      who: c.who === "supervisors" || c.who === "employees" ? c.who : "all",
      everyMonths: kind === "crd" ? 24 : int(c.everyMonths, 0, 120, 12),
      newHireDays: int(c.newHireDays, 0, 365, kind === "crd" ? 180 : 30),
      proof: kind === "crd" ? "certificate" : c.proof === "signoff" ? "signoff" : "certificate",
      ...(kind === "custom" ? { link: url(c.link) } : {}),
      ...(kind === "plan" ? { planPath: str(c.planPath, 300), planName: str(c.planName, 120), videoUrl: url(c.videoUrl), qa: str(c.qa, 200), questions: c.questions !== false, minutes: int(c.minutes, 0, 600, 20) } : {}),
    };
  });
  const emails = (v: unknown) => (Array.isArray(v) ? v : []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 20);
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((x) => /^[\w-]{1,80}$/.test(x)).slice(0, 500);
  return {
    courses,
    remind: (Array.isArray(b.remind) ? b.remind : base.remind).map((n) => int(n, 0, 120, 30)).filter((n, i, a) => a.indexOf(n) === i).sort((a, c) => c - a).slice(0, 6),
    overdueWeekly: b.overdueWeekly !== undefined ? !!b.overdueWeekly : base.overdueWeekly,
    autoApprove: b.autoApprove !== undefined ? !!b.autoApprove : base.autoApprove,
    admins: b.admins !== undefined ? emails(b.admins) : base.admins,
    supAdd: b.supAdd !== undefined ? ids(b.supAdd) : base.supAdd,
    supRemove: b.supRemove !== undefined ? ids(b.supRemove) : base.supRemove,
    startedAt: base.startedAt ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.startedAt)) ? String(b.startedAt) : undefined),
    catchUpDays: int(b.catchUpDays ?? base.catchUpDays, 7, 365, 60),
    live: b.live !== undefined ? !!b.live : base.live,
  };
}

// ---------- records ----------
export type Variant = "supervisor" | "employee";
export type Status = "assigned" | "submitted" | "approved" | "sentback" | "cancelled";

export interface Question { id: string; q: string; at: string; anon?: boolean; answer?: string; answeredAt?: string; by?: string }
export interface AiRead { name?: string; course?: string; variant?: Variant | ""; date?: string; flags: string[] }

export interface TrainingRecord {
  id: string;
  clientId: string;
  personId: string;
  name: string;
  email?: string;
  title?: string;
  managerEmail: string;
  managerName: string;
  courseId: string;
  courseName: string;
  variant?: Variant;
  status: Status;
  due: string;
  /** why it was assigned: new hire, first round, renewal, new supervisor */
  reason: "new" | "start" | "renew" | "promoted" | "manual";
  /** the person's private link (shared across their records) */
  token: string;
  sentAt?: string;
  submittedAt?: string;
  /** the date on the certificate, or the sign-off date */
  completedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  file?: { path: string; name: string; mime: string };
  attest?: boolean;
  ai?: AiRead;
  note?: string;
  questions: Question[];
  /** reminders already sent, by key, so the daily run never repeats one */
  sent: Record<string, string>;
  history: { at: string; by: string; text: string }[];
}

export const logRec = (r: TrainingRecord, by: string, text: string): TrainingRecord => ({ ...r, history: [...r.history, { at: new Date().toISOString(), by, text }].slice(-60) });

/** Supervisors: anyone with direct reports on the roster, plus or minus HR's hand edits. */
export function supervisorIds(people: TeamMember[], s: ComplianceSettings): Set<string> {
  const bosses = new Set(people.filter((p) => p.active !== false).map((p) => (p.managerEmail || "").toLowerCase()).filter(Boolean));
  const out = new Set<string>();
  for (const p of people) if (p.active !== false && p.email && bosses.has(p.email.toLowerCase())) out.add(p.id);
  for (const id of s.supAdd) out.add(id);
  for (const id of s.supRemove) out.delete(id);
  return out;
}

export const appliesTo = (c: Course, sup: boolean) => c.who === "all" || (c.who === "supervisors" ? sup : !sup);
export const variantFor = (c: Course, sup: boolean): Variant | undefined => (c.kind === "crd" ? (sup ? "supervisor" : "employee") : undefined);
export const variantLabel = (v?: Variant, lang: Lang = "en") => (v === "supervisor" ? (lang === "es" ? "supervisores, 2 horas" : "supervisor, 2 hours") : v === "employee" ? (lang === "es" ? "empleados, 1 hora" : "employee, 1 hour") : "");

export const addMonths = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setMonth(d.getMonth() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);

export type Stage = "current" | "due_soon" | "late" | "checking" | "sent_back" | "assigned" | "new_hire";
export function stageOf(r: TrainingRecord, today = iso(new Date())): Stage {
  if (r.status === "approved") return "current";
  if (r.status === "submitted") return "checking";
  if (r.status === "sentback") return r.due < today ? "late" : "sent_back";
  if (r.due < today) return "late";
  if (r.reason === "new") return "new_hire";
  return daysBetween(today, r.due) <= 60 ? "due_soon" : "assigned";
}
export const STAGE_LABEL: Record<Stage, { en: string; es: string }> = {
  current: { en: "Current", es: "Al día" },
  due_soon: { en: "Due soon", es: "Vence pronto" },
  late: { en: "Late", es: "Atrasada" },
  checking: { en: "HR checking", es: "RR. HH. revisando" },
  sent_back: { en: "Needs a fix", es: "Hay que corregir" },
  assigned: { en: "Assigned", es: "Asignada" },
  new_hire: { en: "New hire", es: "Nuevo ingreso" },
};

/** When someone is next due for a course, given their history. null = nothing to open yet. */
export function nextAssignment(p: TeamMember, c: Course, sup: boolean, recs: TrainingRecord[], s: ComplianceSettings, today = iso(new Date())): { due: string; reason: TrainingRecord["reason"]; variant?: Variant } | null {
  const variant = variantFor(c, sup);
  const done = recs.filter((r) => r.status === "approved" && r.completedAt).sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));
  const last = done[0];
  const start = s.startedAt ?? today;
  if (!last) {
    const recentHire = p.hireDate && p.hireDate >= addDays(start, -c.newHireDays);
    if (recentHire) return { due: addDays(p.hireDate!, c.newHireDays), reason: "new", variant };
    return { due: addDays(start, s.catchUpDays), reason: "start", variant };
  }
  // newly a supervisor: the 2-hour course within 6 months
  if (c.kind === "crd" && sup && last.variant === "employee") return { due: addDays(today, c.newHireDays), reason: "promoted", variant };
  if (!c.everyMonths) return null;
  const expires = addMonths(last.completedAt!, c.everyMonths);
  if (daysBetween(today, expires) > Math.max(90, ...s.remind)) return null;
  return { due: expires, reason: "renew", variant };
}

export function newRecord(p: TeamMember, clientId: string, c: Course, a: { due: string; reason: TrainingRecord["reason"]; variant?: Variant }, token: string): TrainingRecord {
  return {
    id: `tr-${newId()}`, clientId, personId: p.id, name: p.name, email: p.email?.toLowerCase(), title: p.title, managerEmail: (p.managerEmail || "").toLowerCase(), managerName: p.managerName || "",
    courseId: c.id, courseName: c.name, variant: a.variant, status: "assigned", due: a.due, reason: a.reason, token, questions: [], sent: {}, history: [{ at: new Date().toISOString(), by: "People Hub", text: `Assigned, due ${a.due}` }],
  };
}
export { newToken };

/** The course's link for this person, in their language when the course offers it. */
export function courseLink(c: Course, v?: Variant, lang = "English") {
  if (c.kind === "crd") return crdLink(v ?? "employee", lang);
  return c.link || "";
}

export const fmtDate = (d?: string, lang: Lang = "en") => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** First name + last name, loosely: used to compare the name on a certificate with the roster. */
export function sameName(a?: string, b?: string) {
  const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const x = norm(a), y = norm(b);
  if (!x.length || !y.length) return false;
  const firstOk = x[0] === y[0] || x[0].startsWith(y[0]) || y[0].startsWith(x[0]);
  const lastOk = x[x.length - 1] === y[y.length - 1];
  return firstOk && lastOk;
}

/** What to flag about an uploaded certificate before it counts. Empty = clean. */
export function checkRead(r: TrainingRecord, ai: AiRead, today = iso(new Date())): string[] {
  const flags = [...ai.flags];
  if (!ai.name) flags.push("Couldn't read a name.");
  else if (!sameName(ai.name, r.name)) flags.push(`Name on the certificate is "${ai.name}", roster says ${r.name}.`);
  if (r.variant && ai.variant && ai.variant !== r.variant) flags.push(r.variant === "supervisor" ? "This is the 1-hour employee course. Supervisors need the 2-hour course." : "This is the supervisor course. That's fine, it covers the employee course too.");
  if (!ai.date) flags.push("Couldn't read a completion date.");
  else if (ai.date > today) flags.push("The completion date is in the future.");
  else if (daysBetween(ai.date, today) > 365) flags.push("The completion date is more than a year ago.");
  // a supervisor certificate for an employee is fine; drop that note from blocking
  return flags.filter((f) => !f.startsWith("This is the supervisor course"));
}
