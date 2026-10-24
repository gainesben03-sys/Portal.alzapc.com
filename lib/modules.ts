// Prototype data for the add-on modules. All people, candidates and providers are fictional.

import { addBusinessDays, Person, today, toISO } from "./data";

export type ModuleKey = "recruiting" | "resources" | "wellness" | "board";

/** Which pages each access level can open. Executives see everything, including Team. */
export function canSee(access: Access | undefined, page: ModuleKey | "projects" | "team"): boolean {
  if (!access || access === "exec") return true;
  if (access === "hiring") return page === "recruiting";
  return page !== "team"; // manager
}
export const MODULES: { key: ModuleKey; label: string; blurb: string }[] = [
  { key: "recruiting", label: "Recruiting", blurb: "Open roles, candidates and hiring feedback" },
  { key: "resources", label: "Resources", blurb: "Templates, guides and deliverables shared by Alza" },
  { key: "wellness", label: "Wellness", blurb: "Benefits and wellbeing programs by pillar" },
  { key: "board", label: "Note board", blurb: "Messages and requests that go straight to Ben" },
];

export type Access = "exec" | "manager" | "hiring";
export const ACCESS_LABEL: Record<Access, string> = {
  exec: "Executive (sees everything)",
  manager: "Manager",
  hiring: "Hiring manager (recruiting only)",
};

export interface PortalUser extends Person {
  email: string;
  access: Access;
  invited?: boolean; // invite sent, not yet signed in
  addedBy?: string;
}

export interface InviteCode {
  code: string;
  access: Access;
  expires: string; // ISO
  createdBy: string;
  usedBy?: string;
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "off";
export interface HuddleSettings {
  cadence: Cadence;
  day: number; // 1 = Monday ... 5 = Friday
  recipients: string[]; // user emails opted in
  skipIfQuiet: boolean; // don't send when nothing is due or changed
  bundleReminders: boolean; // fold friendly/due-date nudges into the Huddle
  personalNote: string;
  lastSent?: string;
}

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "First week of the month",
  off: "Off",
};

/** Next send time at 8:00 AM local for the given settings. */
export function nextHuddle(h: HuddleSettings, from = new Date()): Date | null {
  if (h.cadence === "off") return null;
  const d = new Date(from);
  d.setHours(8, 0, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  for (let i = 0; i < 70; i++) {
    const ok =
      d.getDay() === h.day &&
      (h.cadence !== "monthly" || d.getDate() <= 7) &&
      (h.cadence !== "biweekly" || !h.lastSent || d.getTime() - new Date(h.lastSent).getTime() >= 13 * 86400000);
    if (ok) return d;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

export interface SharedFile {
  id: string;
  clientId: string;
  name: string;
  size: number;
  type: string;
  category: string;
  note: string;
  confidential: boolean;
  by: string;
  at: string;
  reviewed: boolean;
  requestId?: string; // the document request it answers
}
export const FILE_CATEGORIES = ["Signed document", "Employee file", "Payroll or benefits", "Policy or handbook", "Other"];

export type NoticeKind = "upload" | "note" | "completed" | "extension" | "revision" | "feedback";
export interface Notice {
  id: string;
  clientId: string;
  kind: NoticeKind;
  text: string;
  href: string;
  at: string;
  read: boolean;
}

export interface ClientConfig {
  huddle: HuddleSettings;
  modules: Record<ModuleKey, boolean>;
  accent: string;
  logo?: string; // URL or data URL
  escalationEmail: string;
  users: PortalUser[];
  codes: InviteCode[];
}

export function newCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (const n of buf) c += chars[n % chars.length];
  return c;
}

// ---------- recruiting ----------

export type Decision = "advance" | "hold" | "pass" | "offer";
export const DECISION_LABEL: Record<Decision, string> = {
  advance: "Advance",
  hold: "Hold",
  pass: "Pass",
  offer: "Make offer",
};

export interface Role {
  id: string;
  clientId: string;
  title: string;
  dept: string;
  location: string;
  type: string;
  compRange: string;
  hiringManager: Person;
  status: string;
  criteria: string[];
  feedbackActionId?: string;
}

export interface Candidate {
  id: string;
  roleId: string;
  name: string;
  headline: string;
  summary: string;
  strengths: string[];
  assessment: string;
  scores: number[]; // Alza rating 1-5 per role criterion
  stage: string;
  sentAt: string; // ISO date shared with client
  otherOffers?: boolean;
  decision?: Decision;
  feedback?: string;
  feedbackBy?: string;
  feedbackAt?: string;
}

// ---------- resources ----------

export type ResourceType = "Template" | "Guide" | "Checklist" | "Policy" | "Video" | "Link";
export interface Share {
  clientId: string;
  folder: string;
  at: string;
}
export interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  category: string;
  desc: string;
  updated: string; // ISO date
  outdated?: boolean;
  clientOnly?: string; // a client-specific deliverable rather than library item
  shares: Share[];
}
export const FOLDERS = ["Manager toolkit", "Policies", "Recruiting", "Project deliverables"];

// ---------- wellness ----------

export interface Pillar {
  id: string;
  name: string;
  blurb: string;
}
export interface Benefit {
  id: string;
  pillar: string;
  name: string;
  provider: string;
  desc: string;
  howTo: string;
  included: boolean;
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
}

export const PILLARS: Pillar[] = [
  { id: "physical", name: "Physical", blurb: "Fitness, movement and preventive care" },
  { id: "mental", name: "Mental & emotional", blurb: "Support, stress and mindfulness" },
  { id: "nutrition", name: "Nutrition", blurb: "Healthy habits and education" },
  { id: "social", name: "Connection", blurb: "Team activities and belonging" },
  { id: "financial", name: "Financial", blurb: "Planning, education and retirement" },
  { id: "career", name: "Career & purpose", blurb: "Learning, mentoring and growth" },
];

// ---------- note board ----------

export type NoteKind = "Message" | "Need" | "Question";
export interface Note {
  id: string;
  clientId: string;
  author: Person;
  kind: NoteKind;
  text: string;
  urgent: boolean;
  at: string;
  status: "new" | "seen" | "done";
  replies: { by: string; text: string; at: string }[];
  emailed?: boolean;
}

// ---------- seed ----------

export function seedModules() {
  const t = today();
  const d = (n: number) => toISO(addBusinessDays(t, n));
  const at = (n: number, h = 11) => {
    const x = addBusinessDays(t, n);
    x.setHours(h, 5);
    return x.toISOString();
  };

  const config: Record<string, ClientConfig> = {
    blueprint: {
      huddle: { cadence: "weekly", day: 1, recipients: ["alex@example.com", "priya@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: true, resources: true, wellness: true, board: true },
      accent: "#2b3ff5",
      logo: "/blueprint-logo.png",
      codes: [],
      escalationEmail: "alex@example.com",
      users: [
        { name: "Alex Rivera", role: "CEO", email: "alex@example.com", access: "exec" },
        { name: "Priya Shah", role: "COO", email: "priya@example.com", access: "exec" },
        { name: "Marcus Cole", role: "Production Manager", email: "marcus@example.com", access: "hiring" },
        { name: "Dana Ortiz", role: "Office Manager", email: "dana@example.com", access: "manager" },
      ],
    },
    harbor: {
      huddle: { cadence: "weekly", day: 1, recipients: ["sam@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: false, resources: true, wellness: false, board: true },
      accent: "#6b8c6b",
      codes: [],
      escalationEmail: "sam@example.com",
      users: [{ name: "Sam Patel", role: "Owner", email: "sam@example.com", access: "exec" }],
    },
    northgate: {
      huddle: { cadence: "weekly", day: 1, recipients: ["rae@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: false, resources: true, wellness: true, board: true },
      accent: "#4a7ab5",
      codes: [],
      escalationEmail: "rae@example.com",
      users: [
        { name: "Rae Kim", role: "Executive Director", email: "rae@example.com", access: "exec" },
        { name: "Luis Moreno", role: "Ops Lead", email: "luis@example.com", access: "manager" },
      ],
    },
    cedar: {
      huddle: { cadence: "weekly", day: 1, recipients: ["jo@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: true, resources: false, wellness: false, board: true },
      accent: "#8a6d3b",
      codes: [],
      escalationEmail: "jo@example.com",
      users: [{ name: "Jo Bennett", role: "Managing Partner", email: "jo@example.com", access: "exec" }],
    },
  };

  const roles: Role[] = [
    {
      id: "r-producer",
      clientId: "blueprint",
      title: "Senior Producer",
      dept: "Production",
      location: "San Francisco, hybrid",
      type: "Full-time",
      compRange: "$115k to $135k",
      hiringManager: { name: "Marcus Cole", role: "Production Manager" },
      status: "Finalists with client",
      criteria: ["Event production scale", "Client management", "Budget ownership", "Team leadership"],
      feedbackActionId: "bp-2",
    },
    {
      id: "r-coord",
      clientId: "blueprint",
      title: "Warehouse Coordinator",
      dept: "Operations",
      location: "San Francisco, onsite",
      type: "Full-time",
      compRange: "$28 to $32/hr",
      hiringManager: { name: "Dana Ortiz", role: "Office Manager" },
      status: "Sourcing",
      criteria: ["Inventory systems", "Forklift certified", "Reliability"],
    },
  ];

  const candidates: Candidate[] = [
    {
      id: "c1",
      roleId: "r-producer",
      name: "Jamie Torres",
      headline: "Senior Producer, large-format corporate events",
      summary: "9 years producing 1,000+ guest corporate events and brand activations. Led a 6-person production team.",
      strengths: ["Large-scale logistics", "Calm with demanding clients", "Owns P&L per event"],
      assessment: "Strongest operator of the three. Ready on day one. Comp expectation sits at the top of the range.",
      scores: [5, 4, 5, 4],
      stage: "Final interview done",
      sentAt: d(-5),
      otherOffers: true,
    },
    {
      id: "c2",
      roleId: "r-producer",
      name: "Morgan Lee",
      headline: "Producer, luxury weddings and private events",
      summary: "6 years in high-touch private events. Excellent vendor network across the Bay Area.",
      strengths: ["Client relationships", "Design sense", "Vendor network"],
      assessment: "Best client-facing presence. Less experience with corporate budgets above $500k.",
      scores: [3, 5, 3, 3],
      stage: "Final interview done",
      sentAt: d(-5),
      decision: "advance",
      feedback: "Loved her with clients. Want to see a budget walkthrough before deciding.",
      feedbackBy: "Marcus Cole",
      feedbackAt: at(-2, 14),
    },
    {
      id: "c3",
      roleId: "r-producer",
      name: "Chris Okafor",
      headline: "Production Manager, touring and live shows",
      summary: "8 years in touring production. Strong technical depth, newer to corporate clients.",
      strengths: ["Technical production", "Crew leadership", "Crisis handling"],
      assessment: "Great leader of crews. Would need support on client-side communication.",
      scores: [4, 3, 4, 5],
      stage: "Final interview done",
      sentAt: d(-5),
      otherOffers: true,
    },
  ];

  const resources: Resource[] = [
    { id: "res1", title: "Manager 1:1 guide", type: "Guide", category: "Leadership", desc: "Agenda, questions and a cadence that works for busy managers.", updated: d(-30), shares: [{ clientId: "blueprint", folder: "Manager toolkit", at: at(-20) }] },
    { id: "res2", title: "Documenting performance concerns", type: "Checklist", category: "Performance", desc: "What to write down, when, and how to keep it factual.", updated: d(-12), shares: [{ clientId: "blueprint", folder: "Manager toolkit", at: at(-10) }, { clientId: "northgate", folder: "Manager toolkit", at: at(-8) }] },
    { id: "res3", title: "Structured interview scorecard", type: "Template", category: "Recruiting", desc: "Score every candidate on the same criteria.", updated: d(-6), shares: [{ clientId: "blueprint", folder: "Recruiting", at: at(-5) }] },
    { id: "res4", title: "Offer letter template", type: "Template", category: "Recruiting", desc: "California-ready offer letter with at-will language.", updated: d(-40), outdated: true, shares: [] },
    { id: "res5", title: "Remote work policy example", type: "Policy", category: "Policies", desc: "A short, plain-English remote and hybrid policy.", updated: d(-25), shares: [] },
    { id: "res6", title: "New manager onboarding checklist", type: "Checklist", category: "Leadership", desc: "First 30 days for someone stepping into management.", updated: d(-15), shares: [] },
    { id: "res7", title: "Feedback conversations (12 min video)", type: "Video", category: "Leadership", desc: "How to give feedback that lands without drama.", updated: d(-18), shares: [] },
    { id: "res8", title: "Org structure refresh: proposal v2", type: "Template", category: "Deliverable", desc: "Proposed reporting lines and role changes.", updated: d(-7), clientOnly: "blueprint", shares: [{ clientId: "blueprint", folder: "Project deliverables", at: at(-7) }] },
  ];

  const benefits: Benefit[] = [
    { id: "w1", pillar: "physical", name: "Gym and studio discount", provider: "Partner fitness network", desc: "Discounted memberships at participating gyms and studios.", howTo: "Sign up with your work email for the member rate.", included: true },
    { id: "w2", pillar: "physical", name: "Quarterly step challenge", provider: "Alza wellness", desc: "Friendly team challenge with small prizes.", howTo: "Join from the announcement when it opens.", included: true },
    { id: "w3", pillar: "mental", name: "Employee assistance program", provider: "EAP partner", desc: "Free, confidential short-term counseling for you and your household.", howTo: "Call the 24/7 line or book online. Your employer never sees who uses it.", included: true },
    { id: "w4", pillar: "mental", name: "Mindfulness app", provider: "Meditation app partner", desc: "Guided sessions for stress and sleep.", howTo: "Redeem the company code inside the app.", included: false },
    { id: "w5", pillar: "nutrition", name: "Nutrition coaching", provider: "Registered dietitian partner", desc: "Two free coaching sessions per year.", howTo: "Book a session from the provider page.", included: false },
    { id: "w6", pillar: "social", name: "Team volunteer day", provider: "Alza wellness", desc: "One paid day a year to volunteer together.", howTo: "Your manager will share dates.", included: true },
    { id: "w7", pillar: "financial", name: "Financial planning sessions", provider: "Fee-only planner partner", desc: "One-on-one sessions on budgeting, debt and retirement.", howTo: "Book directly, no sales pitch.", included: true },
    { id: "w8", pillar: "career", name: "Learning stipend", provider: "Company benefit", desc: "Annual stipend for courses, books and conferences.", howTo: "Submit receipts to the office manager.", included: true },
  ];

  const announcements: Announcement[] = [
    { id: "an1", title: "Open enrollment starts next month", body: "Watch for a short session from Alza on what's changing and how to pick a plan.", date: d(-1) },
    { id: "an2", title: "New: financial planning sessions", body: "Free one-on-one sessions are now available to every employee.", date: d(-6) },
  ];

  const notes: Note[] = [
    {
      id: "n1",
      clientId: "blueprint",
      author: { name: "Priya Shah", role: "COO" },
      kind: "Need",
      text: "Can we get a quick template for documenting a no-call no-show? Had one this week.",
      urgent: false,
      at: at(-2, 16),
      status: "done",
      replies: [{ by: "Ben Gaines", text: "Added one to your Manager toolkit folder. Happy to walk through it.", at: at(-1, 9) }],
    },
    {
      id: "n2",
      clientId: "blueprint",
      author: { name: "Dana Ortiz", role: "Office Manager" },
      kind: "Question",
      text: "Do part-time warehouse staff accrue PTO under the new policy?",
      urgent: false,
      at: at(0, 9),
      status: "new",
      replies: [],
    },
  ];

  const files: SharedFile[] = [
    { id: "f1", clientId: "blueprint", name: "Signed offer - M. Diaz.pdf", size: 184000, type: "application/pdf", category: "Signed document", note: "Signed copy for the file.", confidential: true, by: "Priya Shah", at: at(-3, 15), reviewed: true },
  ];
  const notices: Notice[] = [
    { id: "x1", clientId: "blueprint", kind: "note", text: "Dana Ortiz asked a question on the note board", href: "/console/board", at: at(0, 9), read: false },
    { id: "x2", clientId: "blueprint", kind: "feedback", text: "Marcus Cole advanced Morgan Lee (Senior Producer)", href: "/c/blueprint/recruiting", at: at(-2, 14), read: true },
  ];

  return { config, roles, candidates, resources, benefits, announcements, notes, files, notices };
}

export const DAY_MS = 86400000;
export function daysSince(iso: string): number {
  const [y, m, dd] = iso.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.round((today().getTime() - new Date(y, m - 1, dd).getTime()) / DAY_MS));
}
