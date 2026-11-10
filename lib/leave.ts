// Leave of Absence center: the case model, leave types with their typical timelines, tasks,
// return-to-work steps, reminders and reports.
// It helps HR track eligibility, notices, documents and dates. It never approves or denies leave
// or makes a legal call: every timeline here is a starting point HR confirms for the situation.

export type LeaveStatus = "requested" | "pending_docs" | "approved" | "active" | "extended" | "returned" | "closed" | "denied" | "withdrawn";
export type Schedule = "continuous" | "intermittent" | "reduced";
export type TaskKind = "notice" | "certification" | "designation" | "benefits" | "rtw" | "accommodation" | "followup" | "other";
export type Anchor = "requested" | "start" | "end" | "certSent";
export type Eligibility = "not_reviewed" | "likely" | "not_likely" | "n_a";

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  requested: "Requested",
  pending_docs: "Waiting on documents",
  approved: "Approved",
  active: "On leave",
  extended: "Extended",
  returned: "Returned",
  closed: "Closed",
  denied: "Not approved",
  withdrawn: "Withdrawn",
};
export const OPEN_STATUSES: LeaveStatus[] = ["requested", "pending_docs", "approved", "active", "extended", "returned"];
export const SCHEDULE_LABEL: Record<Schedule, string> = { continuous: "Continuous", intermittent: "Intermittent", reduced: "Reduced schedule" };

export interface TaskTemplate {
  key: string;
  title: string;
  kind: TaskKind;
  anchor: Anchor;
  days: number; // offset from the anchor
  business?: boolean; // count business days
  hint?: string;
}
export interface LeaveCategory {
  id: string;
  name: string;
  short: string;
  entitlement?: string; // plain-language reminder, e.g. "Up to 12 workweeks in 12 months"
  eligibility?: string; // what to check (HR decides)
  tasks: TaskTemplate[];
  custom?: boolean;
}

// Typical federal and California timelines. HR confirms what applies; clients can edit or add their own.
const notice = (title: string, hint?: string): TaskTemplate => ({ key: "notice", title, kind: "notice", anchor: "requested", days: 5, business: true, hint });
const certReq: TaskTemplate = { key: "certSent", title: "Send the medical certification request", kind: "certification", anchor: "requested", days: 5, business: true, hint: "Usually sent with the eligibility notice." };
const certDue: TaskTemplate = { key: "certDue", title: "Medical certification due back", kind: "certification", anchor: "certSent", days: 15, hint: "The employee generally gets at least 15 calendar days. Extend if they're trying in good faith." };
const designation: TaskTemplate = { key: "designation", title: "Send the designation notice", kind: "designation", anchor: "certSent", days: 20, hint: "Within 5 business days of having enough information to decide." };
const benefits: TaskTemplate = { key: "benefits", title: "Confirm health benefits continuation and premium payments", kind: "benefits", anchor: "start", days: 0 };

export const DEFAULT_CATEGORIES: LeaveCategory[] = [
  { id: "fmla", name: "FMLA", short: "FMLA", entitlement: "Up to 12 workweeks in a 12-month period (26 for military caregiver).", eligibility: "Employer has 50+ employees within 75 miles; employee worked 12 months and 1,250 hours in the last 12 months.", tasks: [notice("Send the eligibility and rights notice", "Federal form WH-381 is commonly used."), certReq, certDue, designation, benefits] },
  { id: "cfra", name: "CFRA", short: "CFRA", entitlement: "Up to 12 workweeks in a 12-month period.", eligibility: "California employer with 5+ employees; employee worked 12 months and 1,250 hours in the last 12 months.", tasks: [notice("Send the CFRA eligibility and rights notice"), certReq, certDue, designation, benefits] },
  { id: "pdl", name: "Pregnancy Disability Leave", short: "PDL", entitlement: "Up to 4 months per pregnancy, while disabled by pregnancy.", eligibility: "California employer with 5+ employees. No length-of-service requirement.", tasks: [{ ...notice("Give the PDL rights notice"), key: "pdlNotice" }, { ...certReq, title: "Request the health care provider certification (if needed)" }, certDue, benefits] },
  { id: "medical", name: "Medical Leave", short: "Medical", tasks: [{ key: "approve", title: "Confirm dates and approval in writing", kind: "designation", anchor: "requested", days: 5, business: true }, certReq, certDue] },
  { id: "bonding", name: "Parental / Bonding Leave", short: "Bonding", entitlement: "Usually taken under FMLA/CFRA within one year of birth or placement.", tasks: [notice("Send the eligibility and rights notice"), { key: "proof", title: "Get proof of birth, adoption or placement (if requested)", kind: "certification", anchor: "requested", days: 15 }, designation, benefits] },
  { id: "family", name: "Family Care Leave", short: "Family care", entitlement: "Usually taken under FMLA/CFRA.", tasks: [notice("Send the eligibility and rights notice"), certReq, certDue, designation, benefits] },
  { id: "military", name: "Military Leave", short: "Military", entitlement: "USERRA: up to 5 years cumulative service, with reemployment rights.", tasks: [{ key: "orders", title: "Keep a copy of orders or notice of service (if provided)", kind: "certification", anchor: "requested", days: 5 }, { ...benefits, title: "Offer continued health coverage election" }, { key: "reemploy", title: "Plan reemployment (timing depends on length of service)", kind: "rtw", anchor: "end", days: -7 }] },
  { id: "bereavement", name: "Bereavement Leave", short: "Bereavement", entitlement: "California: up to 5 days, completed within 3 months of the death (5+ employees).", tasks: [{ key: "proof", title: "Get documentation if requested (within 30 days of the first day)", kind: "certification", anchor: "start", days: 30 }] },
  { id: "wc", name: "Workers' Compensation", short: "Workers' comp", tasks: [{ key: "dwc1", title: "Give the claim form (DWC-1)", kind: "notice", anchor: "requested", days: 1, business: true, hint: "California: within one working day of learning about the injury." }, { key: "carrier", title: "Report the claim to the insurance carrier", kind: "notice", anchor: "requested", days: 5 }, { key: "duty", title: "Get work status / restrictions from the treating doctor", kind: "certification", anchor: "start", days: 7 }] },
  { id: "personal", name: "Personal Leave", short: "Personal", tasks: [{ key: "approve", title: "Confirm dates, pay status and approval in writing", kind: "designation", anchor: "requested", days: 5, business: true }, benefits] },
  { id: "accommodation", name: "ADA / FEHA Accommodation", short: "Accommodation", eligibility: "Start the interactive process promptly and in good faith.", tasks: [{ key: "meet", title: "Hold the interactive process meeting", kind: "accommodation", anchor: "requested", days: 7 }, { key: "medinfo", title: "Request supporting medical information (if needed)", kind: "certification", anchor: "requested", days: 7 }, { key: "decision", title: "Document the accommodation decision and share it", kind: "accommodation", anchor: "requested", days: 21 }, { key: "review", title: "Check in on how the accommodation is working", kind: "followup", anchor: "start", days: 30 }] },
  { id: "local", name: "Other State or Local Leave", short: "Other", tasks: [{ key: "review", title: "Review which state or local rules apply", kind: "notice", anchor: "requested", days: 5, business: true }] },
];

export const RTW_STEPS = [
  { key: "confirm", title: "Confirm the return date with the employee" },
  { key: "docs", title: "Get return-to-work documentation (fitness for duty or work status), if applicable" },
  { key: "accommodation", title: "Review any accommodation needs" },
  { key: "notify", title: "Let the manager and payroll know" },
  { key: "payroll", title: "Restart payroll and benefits deductions" },
  { key: "actual", title: "Record the actual return date" },
  { key: "close", title: "Close the case, or extend it" },
] as const;

export type DocKind = "medical" | "notice" | "designation" | "rtw" | "request" | "other";
export const DOC_KIND: Record<DocKind, string> = { medical: "Medical / certification", notice: "Notice to employee", designation: "Designation / approval", rtw: "Return to work", request: "Leave request", other: "Other" };

export interface CaseTask { id: string; key?: string; title: string; kind: TaskKind; due?: string; done: boolean; doneAt?: string; doneBy?: string; category?: string; note?: string; hint?: string }
export interface CaseDoc { id: string; name: string; path: string; kind: DocKind; medical: boolean; size?: number; at: string; by: string }
export interface CaseNote { id: string; at: string; by: string; text: string }
export interface IntermittentEntry { id: string; date: string; hours: number; note?: string }
export interface Extension { id: string; requestedAt: string; newEnd: string; status: "requested" | "approved" | "not_approved"; note?: string }

export interface LeaveCase {
  id: string;
  clientId: string;
  number: string; // LOA-0007
  status: LeaveStatus;
  employee: { personId?: string; name: string; title?: string; department?: string; manager?: string; managerEmail?: string; email?: string };
  categories: string[];
  schedule: Schedule;
  scheduleNote?: string; // e.g. "Up to 2 days a month for flare-ups"
  requestedAt: string; // yyyy-mm-dd
  expectedStart?: string;
  expectedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  assignedTo?: { name: string; email: string };
  eligibility: Record<string, Eligibility>;
  eligibilityNote?: string;
  entitlement: Record<string, { available?: number; used?: number }>; // weeks
  benefits?: { continuing?: boolean; premiums?: string; note?: string };
  accommodation?: { considered?: boolean; note?: string };
  tasks: CaseTask[];
  rtw: Record<string, boolean>;
  docs: CaseDoc[];
  notes: CaseNote[];
  intermittent: IntermittentEntry[];
  extensions: Extension[];
  emails: { at: string; by: string; to: string; subject: string }[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface LeaveSettings {
  categories?: LeaveCategory[]; // overrides and custom types; anything missing falls back to the defaults
  hidden?: string[]; // default types this client doesn't use
  remindDays?: number[]; // days before a deadline to remind, e.g. [7, 3, 1, 0]
  returnDays?: number; // remind this many days before an expected return
  followupDays?: number; // flag cases with no activity for this many days
  notify?: string[]; // extra emails for reminders (HR admins and Ben always get them)
  retainYears?: number; // closed cases are flagged for deletion after this many years
}
export const DEFAULT_SETTINGS: Required<Omit<LeaveSettings, "categories" | "hidden" | "notify">> = { remindDays: [7, 3, 1, 0], returnDays: 14, followupDays: 21, retainYears: 5 };

export function categoriesFor(s?: LeaveSettings): LeaveCategory[] {
  const over = new Map((s?.categories ?? []).map((c) => [c.id, c]));
  const base = DEFAULT_CATEGORIES.filter((c) => !(s?.hidden ?? []).includes(c.id)).map((c) => over.get(c.id) ?? c);
  return [...base, ...(s?.categories ?? []).filter((c) => c.custom && !DEFAULT_CATEGORIES.some((d) => d.id === c.id))];
}

// ---------- dates ----------
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toDate = (s: string) => new Date(`${s}T12:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function addDays(s: string, n: number, business = false): string {
  const d = toDate(s);
  if (!business) {
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return iso(d);
}
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5);
export const fmtDay = (s?: string) => (s ? toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: toDate(s).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "");
export const weeksBetween = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round(((daysBetween(a, b) + 1) / 7) * 10) / 10) : 0);

/** The starting task list for a case, from its leave types (no duplicates). */
export function tasksFor(c: Pick<LeaveCase, "categories" | "requestedAt" | "expectedStart" | "expectedEnd">, cats: LeaveCategory[]): CaseTask[] {
  const seen = new Set<string>();
  const out: CaseTask[] = [];
  const anchorDate = (a: Anchor, certSent?: string) => (a === "requested" ? c.requestedAt : a === "start" ? c.expectedStart || c.requestedAt : a === "end" ? c.expectedEnd || c.expectedStart || c.requestedAt : certSent || addDays(c.requestedAt, 5, true));
  for (const id of c.categories) {
    const cat = cats.find((x) => x.id === id);
    if (!cat) continue;
    for (const t of cat.tasks) {
      const k = `${t.key}:${t.title}`;
      if (seen.has(t.key) && t.key !== "approve") continue; // one eligibility notice, one cert request, etc. across overlapping protections
      seen.add(t.key);
      seen.add(k);
      const certSent = out.find((x) => x.key === "certSent")?.due;
      out.push({ id: `t${out.length + 1}${Math.random().toString(36).slice(2, 6)}`, key: t.key, title: t.title, kind: t.kind, due: addDays(anchorDate(t.anchor, certSent), t.days, t.business), done: false, category: cat.short, hint: t.hint });
    }
  }
  return out;
}

// ---------- what needs attention ----------
export type Due = { taskId?: string; caseId: string; number: string; who: string; title: string; due: string; days: number; kind: TaskKind | "return" | "followup" | "extension"; status: LeaveStatus };

/** Everything with a date on it, soonest first. Overdue items have negative days. */
export function dueItems(cases: LeaveCase[], s?: LeaveSettings, on = today()): Due[] {
  const set = { ...DEFAULT_SETTINGS, ...s };
  const out: Due[] = [];
  for (const c of cases) {
    if (!OPEN_STATUSES.includes(c.status)) continue;
    const who = c.employee.name;
    for (const t of c.tasks) if (!t.done && t.due) out.push({ taskId: t.id, caseId: c.id, number: c.number, who, title: t.title, due: t.due, days: daysBetween(on, t.due), kind: t.kind, status: c.status });
    const back = c.extensions.filter((e) => e.status === "approved").map((e) => e.newEnd).sort().pop() || c.expectedEnd;
    if (back && !c.actualEnd && ["approved", "active", "extended"].includes(c.status)) {
      const d = daysBetween(on, back);
      if (d <= set.returnDays) out.push({ caseId: c.id, number: c.number, who, title: d < 0 ? "Expected return date has passed" : "Expected to return", due: back, days: d, kind: "return", status: c.status });
    }
    for (const e of c.extensions) if (e.status === "requested") out.push({ caseId: c.id, number: c.number, who, title: "Extension requested: review it", due: e.requestedAt, days: daysBetween(on, e.requestedAt), kind: "extension", status: c.status });
    if (c.status === "returned" && c.actualEnd && daysBetween(c.actualEnd, on) >= 7) out.push({ caseId: c.id, number: c.number, who, title: "Back at work: finish return-to-work steps and close the case", due: addDays(c.actualEnd, 7), days: daysBetween(on, addDays(c.actualEnd, 7)), kind: "followup", status: c.status });
    else if (daysBetween(c.updatedAt.slice(0, 10), on) >= set.followupDays) out.push({ caseId: c.id, number: c.number, who, title: `No activity in ${set.followupDays}+ days: check in`, due: addDays(c.updatedAt.slice(0, 10), set.followupDays), days: 0, kind: "followup", status: c.status });
  }
  return out.sort((a, b) => a.days - b.days);
}

export type Dash = { active: number; pending: number; waitingDocs: number; deadlines: Due[]; returning: Due[]; overdue: Due[] };
export function dashboard(cases: LeaveCase[], s?: LeaveSettings, on = today()): Dash {
  const items = dueItems(cases, s, on);
  return {
    active: cases.filter((c) => ["approved", "active", "extended"].includes(c.status)).length,
    pending: cases.filter((c) => c.status === "requested").length,
    waitingDocs: cases.filter((c) => c.status === "pending_docs" || c.tasks.some((t) => !t.done && t.kind === "certification" && t.due && t.due <= addDays(on, 14))).length,
    deadlines: items.filter((d) => d.days >= 0 && d.days <= 14 && d.kind !== "return"),
    returning: items.filter((d) => d.kind === "return" && d.days >= 0),
    overdue: items.filter((d) => d.days < 0),
  };
}

// ---------- reports ----------
export function report(cases: LeaveCase[], cats: LeaveCategory[], on = today()) {
  const name = (id: string) => cats.find((c) => c.id === id)?.short ?? id;
  const byType = new Map<string, number>();
  for (const c of cases) for (const id of c.categories) byType.set(name(id), (byType.get(name(id)) ?? 0) + 1);
  const durations = cases
    .map((c) => {
      const a = c.actualStart || c.expectedStart;
      const b = c.actualEnd || (c.status === "closed" || c.status === "returned" ? c.expectedEnd : undefined);
      return a && b ? daysBetween(a, b) + 1 : null;
    })
    .filter((x): x is number => x != null && x > 0);
  const byStatus = new Map<string, number>();
  for (const c of cases) byStatus.set(STATUS_LABEL[c.status], (byStatus.get(STATUS_LABEL[c.status]) ?? 0) + 1);
  const intermittent = cases.filter((c) => c.schedule === "intermittent");
  const items = dueItems(cases, undefined, on);
  return {
    open: cases.filter((c) => OPEN_STATUSES.includes(c.status)).length,
    total: cases.length,
    byType: [...byType.entries()].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n),
    byStatus: [...byStatus.entries()].map(([status, n]) => ({ status, n })),
    avgDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    intermittent: { cases: intermittent.length, hours: intermittent.reduce((h, c) => h + c.intermittent.reduce((x, e) => x + (e.hours || 0), 0), 0), entries: intermittent.reduce((n, c) => n + c.intermittent.length, 0) },
    upcoming: items.filter((d) => d.days >= 0 && d.days <= 30).length,
    overdue: items.filter((d) => d.days < 0).length,
    outstandingDocs: cases.filter((c) => OPEN_STATUSES.includes(c.status)).flatMap((c) => c.tasks.filter((t) => !t.done && (t.kind === "certification" || t.kind === "notice" || t.kind === "designation")).map((t) => ({ number: c.number, who: c.employee.name, title: t.title, due: t.due }))),
  };
}

export function casesCsv(cases: LeaveCase[], cats: LeaveCategory[]): string {
  const name = (id: string) => cats.find((c) => c.id === id)?.short ?? id;
  const head = ["Case", "Employee", "Department", "Manager", "Leave types", "Schedule", "Status", "Requested", "Expected start", "Expected end", "Actual start", "Actual end", "Open tasks", "Assigned to"];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head, ...cases.map((c) => [c.number, c.employee.name, c.employee.department, c.employee.manager, c.categories.map(name).join("; "), SCHEDULE_LABEL[c.schedule], STATUS_LABEL[c.status], c.requestedAt, c.expectedStart, c.expectedEnd, c.actualStart, c.actualEnd, c.tasks.filter((t) => !t.done).length, c.assignedTo?.name])].map((r) => r.map(q).join(",")).join("\n");
}

// ---------- emails to the employee ----------
export const LEAVE_FILL_INS = ["{first name}", "{company}", "{case number}", "{start date}", "{return date}", "{due date}", "{HR name}"] as const;
export type LeaveEmail = { id: string; name: string; subject: string; body: string };
export const LEAVE_EMAILS: LeaveEmail[] = [
  { id: "received", name: "Request received", subject: "We received your leave request", body: "Hi {first name},\n\nThanks for letting us know. We've received your leave request and opened case {case number}.\n\nOver the next few days I'll send you information about your rights and anything we need from you. If anything changes in the meantime, just reply to this email.\n\nTake care,\n{HR name}" },
  { id: "certification", name: "Certification request", subject: "Paperwork needed for your leave", body: "Hi {first name},\n\nTo support your leave, please have your health care provider complete the attached certification form and return it to me by {due date}.\n\nIf you need more time, let me know before then and we'll work with you.\n\nThank you,\n{HR name}" },
  { id: "cert-reminder", name: "Certification reminder", subject: "Reminder: your leave paperwork is due {due date}", body: "Hi {first name},\n\nA friendly reminder that the certification for your leave is due {due date}. If your provider needs more time, please let me know so we can note it.\n\nThank you,\n{HR name}" },
  { id: "designation", name: "Leave approved / designated", subject: "Your leave: next steps", body: "Hi {first name},\n\nYour leave has been reviewed. Please see the attached notice for the details, including your leave dates ({start date} to {return date}).\n\nIf you have questions, reply here any time.\n\nBest,\n{HR name}" },
  { id: "extension", name: "Extension request received", subject: "We received your request to extend your leave", body: "Hi {first name},\n\nWe've received your request to extend your leave. I'll review it and follow up shortly. Please send any updated paperwork from your provider when you have it.\n\nThank you,\n{HR name}" },
  { id: "rtw", name: "Return-to-work check-in", subject: "Getting ready for your return on {return date}", body: "Hi {first name},\n\nWe're looking forward to having you back on {return date}. Before then, please confirm that date still works and send any return-to-work note from your provider.\n\nIf you'll need any adjustments when you return, let me know and we'll talk it through.\n\nWelcome back,\n{HR name}" },
];
export function fillLeave(text: string, v: { first: string; company: string; number: string; start?: string; back?: string; due?: string; hr: string }) {
  return text
    .replace(/\{first name\}/gi, v.first)
    .replace(/\{company\}/gi, v.company)
    .replace(/\{case number\}/gi, v.number)
    .replace(/\{start date\}/gi, fmtDay(v.start) || "your start date")
    .replace(/\{return date\}/gi, fmtDay(v.back) || "your return date")
    .replace(/\{due date\}/gi, fmtDay(v.due) || "the due date")
    .replace(/\{HR name\}/gi, v.hr);
}

export function newCase(clientId: string, n: number, by: { name: string; email: string }): LeaveCase {
  const now = new Date().toISOString();
  return { id: `loa${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, clientId, number: `LOA-${String(n).padStart(4, "0")}`, status: "requested", employee: { name: "" }, categories: [], schedule: "continuous", requestedAt: today(), assignedTo: by, eligibility: {}, entitlement: {}, tasks: [], rtw: {}, docs: [], notes: [], intermittent: [], extensions: [], emails: [], createdAt: now, updatedAt: now };
}
