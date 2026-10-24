// Prototype data model for the Alza Client Portal.
// All people, clients and items below are fictional sample data.

export type Side = "client" | "alza";
export type Status =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "needs_revision"
  | "extension_requested"
  | "completed"
  | "blocked";
export type Kind = "approval" | "information" | "feedback" | "document";

export interface Person {
  name: string;
  role: string;
}

export interface Client {
  id: string;
  name: string;
  logo?: string;
  accent: string;
  pilot: boolean;
  engagement: string;
  escalation: Person;
  contacts: Person[];
}

export interface HistoryEntry {
  at: string; // ISO
  by: string;
  text: string;
}

export interface Attachment {
  name: string;
  from: string;
}

export interface Action {
  id: string;
  clientId: string;
  side: Side;
  kind: Kind;
  title: string;
  detail: string;
  impact?: string;
  owner: Person;
  due: string; // ISO date (yyyy-mm-dd)
  status: Status;
  projectId?: string;
  attachments: Attachment[];
  history: HistoryEntry[];
  extension?: { requested: string; reason: string };
  completedAt?: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  progress: number; // 0-100
  nextMilestone: string;
  milestoneDue: string;
}

export interface Rules {
  friendlyBefore: number; // business days before due
  dueDay: boolean;
  overdueNotice: number; // business days after due
  escalateAfter: number;
  blockerAfter: number;
}

export const DEFAULT_RULES: Rules = {
  friendlyBefore: 3,
  dueDay: true,
  overdueNotice: 1,
  escalateAfter: 3,
  blockerAfter: 7,
};

export const ADVISOR: Person = { name: "Ben Gaines", role: "Alza advisor" };

// ---------- date helpers (business days, local time) ----------

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** Signed business days from `a` to `b`. Positive means b is in the future. */
export function businessDiff(a: Date, b: Date): number {
  if (a.getTime() === b.getTime()) return 0;
  const forward = b > a;
  const d = new Date(a);
  let n = 0;
  while (forward ? d < b : d > b) {
    d.setDate(d.getDate() + (forward ? 1 : -1));
    if (!isWeekend(d)) n++;
  }
  return forward ? n : -n;
}

export function fmt(iso: string | Date): string {
  const d = typeof iso === "string" ? (iso.length === 10 ? parseDay(iso) : new Date(iso)) : iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------- status + reminder logic ----------

export type Urgency = "done" | "blocker" | "overdue" | "today" | "soon" | "later";

export function urgency(a: Action, rules: Rules): Urgency {
  if (a.status === "completed") return "done";
  const diff = businessDiff(today(), parseDay(a.due));
  if (diff <= -rules.blockerAfter) return "blocker";
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= rules.friendlyBefore) return "soon";
  return "later";
}

export function dueLabel(a: Action): string {
  if (a.status === "completed") return `Done ${a.completedAt ? fmt(a.completedAt) : ""}`.trim();
  const diff = businessDiff(today(), parseDay(a.due));
  if (diff === 0) return "Due today";
  if (diff < 0) return `${-diff} business day${diff === -1 ? "" : "s"} overdue`;
  if (diff === 1) return "Due tomorrow";
  return `Due ${fmt(a.due)}`;
}

export interface ReminderStep {
  label: string;
  date: Date;
  to: string;
  state: "sent" | "next" | "upcoming" | "skipped";
}

export function reminderPlan(a: Action, client: Client, rules: Rules): ReminderStep[] {
  const due = parseDay(a.due);
  const now = today();
  const steps: Omit<ReminderStep, "state">[] = [
    { label: "Friendly reminder", date: addBusinessDays(due, -rules.friendlyBefore), to: a.owner.name },
  ];
  if (rules.dueDay) steps.push({ label: "Due-date reminder", date: due, to: a.owner.name });
  steps.push(
    { label: "Overdue notice", date: addBusinessDays(due, rules.overdueNotice), to: a.owner.name },
    {
      label: "Escalation",
      date: addBusinessDays(due, rules.escalateAfter),
      to: escalationTarget(a, client),
    },
    { label: "Flagged as blocker on Alza console", date: addBusinessDays(due, rules.blockerAfter), to: "Ben" }
  );
  let nextMarked = false;
  return steps.map((s) => {
    if (a.status === "completed") return { ...s, state: s.date <= now ? "sent" : "skipped" };
    if (s.date <= now) return { ...s, state: "sent" };
    if (!nextMarked) {
      nextMarked = true;
      return { ...s, state: "next" };
    }
    return { ...s, state: "upcoming" };
  });
}

export function reminderStage(a: Action, client: Client, rules: Rules): string {
  if (a.status === "completed") return "Closed, reminders stopped";
  const plan = reminderPlan(a, client, rules);
  const sent = plan.filter((s) => s.state === "sent");
  const next = plan.find((s) => s.state === "next");
  if (sent.length) return `${sent[sent.length - 1].label} sent ${fmt(sent[sent.length - 1].date)}`;
  if (next) return `${next.label} scheduled ${fmt(next.date)}`;
  return "";
}

/** Escalate to the client's escalation contact, or to a personal check-in from Ben when the owner IS that contact. */
export function escalationTarget(a: Action, client: Client): string {
  return a.owner.name === client.escalation.name
    ? "Ben (personal check-in call)"
    : `${client.escalation.name} (${client.escalation.role})`;
}

export const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  needs_revision: "Needs revision",
  extension_requested: "Extension requested",
  completed: "Completed",
  blocked: "Blocked",
};

// ---------- seed data ----------

export const CLIENTS: Client[] = [
  {
    id: "blueprint",
    name: "Blueprint Studios",
    logo: "/blueprint-logo.png",
    accent: "#2b3ff5",
    pilot: true,
    engagement: "Fractional HR + recruiting",
    escalation: { name: "Alex Rivera", role: "CEO" },
    contacts: [
      { name: "Alex Rivera", role: "CEO" },
      { name: "Priya Shah", role: "COO" },
      { name: "Marcus Cole", role: "Production Manager" },
      { name: "Dana Ortiz", role: "Office Manager" },
    ],
  },
  {
    id: "harbor",
    name: "Harbor Lane Coffee",
    accent: "#6b8c6b",
    pilot: false,
    engagement: "Handbook + compliance",
    escalation: { name: "Sam Patel", role: "Owner" },
    contacts: [{ name: "Sam Patel", role: "Owner" }],
  },
  {
    id: "northgate",
    name: "Northgate Health",
    accent: "#4a7ab5",
    pilot: false,
    engagement: "Performance program",
    escalation: { name: "Rae Kim", role: "Executive Director" },
    contacts: [
      { name: "Rae Kim", role: "Executive Director" },
      { name: "Luis Moreno", role: "Ops Lead" },
    ],
  },
  {
    id: "cedar",
    name: "Cedar & Finch",
    accent: "#8a6d3b",
    pilot: false,
    engagement: "Recruiting",
    escalation: { name: "Jo Bennett", role: "Managing Partner" },
    contacts: [{ name: "Jo Bennett", role: "Managing Partner" }],
  },
];

export function seed(): { actions: Action[]; projects: Project[] } {
  const t = today();
  const due = (n: number) => toISO(addBusinessDays(t, n));
  const at = (n: number, h = 10) => {
    const d = addBusinessDays(t, n);
    d.setHours(h, 15);
    return d.toISOString();
  };
  const bp = CLIENTS[0].contacts;

  const actions: Action[] = [
    {
      id: "bp-1",
      clientId: "blueprint",
      side: "client",
      kind: "approval",
      title: "Approve revised job descriptions",
      detail:
        "Review the four updated job descriptions for the production team and approve them, or flag anything that needs another pass.",
      impact: "The org structure refresh is on hold until these are approved.",
      owner: bp[0],
      due: due(-4),
      status: "not_started",
      projectId: "bp-p1",
      attachments: [
        { name: "Production JDs v3.pdf", from: "Ben Gaines" },
        { name: "JD change summary.pdf", from: "Ben Gaines" },
      ],
      history: [
        { at: at(-9), by: "Ben Gaines", text: "Request created and assigned to Alex Rivera" },
        { at: at(-7), by: "Ben Gaines", text: "Shared Production JDs v3.pdf" },
        { at: at(-1, 9), by: "Alza", text: "Overdue notice sent to Alex Rivera" },
      ],
    },
    {
      id: "bp-2",
      clientId: "blueprint",
      side: "client",
      kind: "feedback",
      title: "Interview feedback: Senior Producer finalists",
      detail:
        "Share a quick advance, hold or pass on each of the three finalists. A sentence or two each is plenty.",
      impact: "Two finalists have other offers in play. Waiting longer risks losing them.",
      owner: bp[2],
      due: due(0),
      status: "in_progress",
      projectId: "bp-p2",
      attachments: [{ name: "Finalist summaries.pdf", from: "Ben Gaines" }],
      history: [
        { at: at(-5), by: "Ben Gaines", text: "Request created and assigned to Marcus Cole" },
        { at: at(-2, 14), by: "Marcus Cole", text: "Feedback started for candidate 1 of 3" },
        { at: at(0, 8), by: "Alza", text: "Due-date reminder sent to Marcus Cole" },
      ],
    },
    {
      id: "bp-3",
      clientId: "blueprint",
      side: "client",
      kind: "information",
      title: "Send current PTO balances",
      detail: "Export PTO balances by employee from payroll so the new policy can be set up correctly.",
      impact: "Needed before the new PTO policy can go live.",
      owner: bp[3],
      due: due(2),
      status: "not_started",
      projectId: "bp-p3",
      attachments: [],
      history: [{ at: at(-3), by: "Ben Gaines", text: "Request created and assigned to Dana Ortiz" }],
    },
    {
      id: "bp-4",
      clientId: "blueprint",
      side: "client",
      kind: "approval",
      title: "Sign off on manager training dates",
      detail: "Confirm the two proposed dates for the manager training session.",
      owner: bp[1],
      due: due(6),
      status: "not_started",
      attachments: [{ name: "Training outline.pdf", from: "Ben Gaines" }],
      history: [{ at: at(-1), by: "Ben Gaines", text: "Request created and assigned to Priya Shah" }],
    },
    {
      id: "bp-5",
      clientId: "blueprint",
      side: "client",
      kind: "approval",
      title: "Approve updated offer letter template",
      detail: "Final review of the offer letter template.",
      owner: bp[1],
      due: due(-6),
      status: "completed",
      completedAt: at(-6, 16),
      attachments: [{ name: "Offer letter template.docx", from: "Ben Gaines" }],
      history: [
        { at: at(-10), by: "Ben Gaines", text: "Request created and assigned to Priya Shah" },
        { at: at(-6, 16), by: "Priya Shah", text: "Approved" },
      ],
    },
    {
      id: "bp-a1",
      clientId: "blueprint",
      side: "alza",
      kind: "document",
      title: "Draft new PTO policy",
      detail: "Ben drafts the updated PTO policy for leadership review.",
      owner: ADVISOR,
      due: due(4),
      status: "in_progress",
      projectId: "bp-p3",
      attachments: [],
      history: [{ at: at(-3), by: "Ben Gaines", text: "Started drafting" }],
    },
    {
      id: "bp-a2",
      clientId: "blueprint",
      side: "alza",
      kind: "document",
      title: "Senior Producer offer recommendation",
      detail: "Ben sends a recommendation and comp range once interview feedback is in.",
      owner: ADVISOR,
      due: due(3),
      status: "blocked",
      projectId: "bp-p2",
      attachments: [],
      history: [{ at: at(-2), by: "Ben Gaines", text: "Waiting on interview feedback" }],
    },
    // other clients (fictional)
    {
      id: "hl-1",
      clientId: "harbor",
      side: "client",
      kind: "approval",
      title: "Approve handbook final draft",
      detail: "",
      owner: { name: "Sam Patel", role: "Owner" },
      due: due(-8),
      status: "not_started",
      attachments: [],
      history: [],
    },
    {
      id: "ng-1",
      clientId: "northgate",
      side: "client",
      kind: "document",
      title: "Upload signed review forms",
      detail: "",
      owner: { name: "Luis Moreno", role: "Ops Lead" },
      due: due(-1),
      status: "in_progress",
      attachments: [],
      history: [],
    },
    {
      id: "ng-2",
      clientId: "northgate",
      side: "client",
      kind: "approval",
      title: "Approve rating scale",
      detail: "",
      owner: { name: "Rae Kim", role: "Executive Director" },
      due: due(1),
      status: "not_started",
      attachments: [],
      history: [],
    },
    {
      id: "cf-1",
      clientId: "cedar",
      side: "client",
      kind: "feedback",
      title: "Feedback on Project Architect candidates",
      detail: "",
      owner: { name: "Jo Bennett", role: "Managing Partner" },
      due: due(2),
      status: "not_started",
      attachments: [],
      history: [],
    },
    {
      id: "cf-a1",
      clientId: "cedar",
      side: "alza",
      kind: "document",
      title: "Send second candidate slate",
      detail: "",
      owner: ADVISOR,
      due: due(-1),
      status: "in_progress",
      attachments: [],
      history: [],
    },
  ];

  const projects: Project[] = [
    {
      id: "bp-p1",
      clientId: "blueprint",
      name: "Org structure refresh",
      progress: 60,
      nextMilestone: "Finalize org chart",
      milestoneDue: due(5),
    },
    {
      id: "bp-p2",
      clientId: "blueprint",
      name: "Senior Producer search",
      progress: 75,
      nextMilestone: "Offer extended",
      milestoneDue: due(4),
    },
    {
      id: "bp-p3",
      clientId: "blueprint",
      name: "PTO policy update",
      progress: 30,
      nextMilestone: "Policy approved",
      milestoneDue: due(10),
    },
  ];

  return { actions, projects };
}
