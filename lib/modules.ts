// Prototype data for the add-on modules. All people, candidates and providers are fictional.

import { addBusinessDays, Person, today, toISO } from "./data";
import type { Hire } from "./hires";
import { SEED_PRACTICE } from "./practice";

export type ModuleKey = "recruiting" | "resources" | "wellness" | "board" | "hires" | "training" | "recognition" | "leave" | "offboarding" | "properties";

/** Which pages each access level can open. Executives see everything, including Team. */
export function canSee(access: Access | undefined, page: ModuleKey | "projects" | "team"): boolean {
  if (!access || access === "exec") return true;
  if (access === "hiring") return page === "recruiting" || page === "hires";
  return page !== "team"; // manager
}
export const MODULES: { key: ModuleKey; label: string; blurb: string }[] = [
  { key: "hires", label: "New hires", blurb: "Offer letters, onboarding emails and a tracker for every new hire" },
  { key: "recruiting", label: "Recruiting", blurb: "Open roles, candidates and hiring feedback" },
  { key: "resources", label: "Resources", blurb: "Templates, guides and deliverables shared by Alza" },
  { key: "wellness", label: "Wellness", blurb: "Benefits and wellbeing programs by pillar" },
  { key: "board", label: "Messages", blurb: "A message thread with Ben, under Ask Ben" },
  { key: "recognition", label: "Team Wall", blurb: "Shoutouts by QR code, text or the portal, plus birthdays, work anniversaries and new starters, on one wall everyone can react to. Every shoutout is screened first" },
  { key: "leave", label: "Leave center", blurb: "Leave of absence tracking for HR admins only: cases, deadlines, documents, reminders and return to work. Ben picks who the HR admins are" },
  { key: "properties", label: "Our Properties", blurb: "A card for each property: who leads it and who handles leasing, maintenance, facilities and accounting, with a map view. Fills itself from the roster's Location and Title columns" },
  { key: "offboarding", label: "Offboarding", blurb: "When someone leaves: a checklist, a thank-you email with what they need to know, an exit survey, and they come off the roster on their last day. Executives only" },
  { key: "training", label: "Training", blurb: "Their trainings to view, with practice: quick checks, role-plays with feedback and a planner. Execs see who's practiced" },
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
  /** Monthly snapshot to the same people, first week of the month (default on). */
  snapshot?: boolean;
  /** Monday email to each manager: their new hires, their week, recognize someone, a thought (default on). */
  managerWeekly?: boolean;
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
  path?: string; // where the file lives in private storage
  fromAdvisor?: boolean; // Ben shared it on a task (not part of his inbox)
}
export const FILE_CATEGORIES = ["Signed document", "Employee file", "Payroll or benefits", "Policy or handbook", "Other"];

export type NoticeKind = "upload" | "note" | "completed" | "extension" | "revision" | "feedback" | "hire" | "request" | "pitch";
export interface Notice {
  id: string;
  clientId: string;
  kind: NoticeKind;
  text: string;
  href: string;
  at: string;
  read: boolean;
}

export const TILES: { id: string; label: string; blurb: string; module?: ModuleKey; wide?: boolean }[] = [
  { id: "mylist", label: "My list", blurb: "Your private checklist, with due dates and email reminders. Only you see it" },
  { id: "projects", label: "Projects", blurb: "Progress on current work", wide: true },
  { id: "share", label: "Send files", blurb: "Upload documents securely" },
  { id: "recruiting", label: "Hiring", blurb: "Open roles and candidates waiting on you", module: "recruiting" },
  { id: "hires", label: "New hires", blurb: "Where each new hire is, start to day one", module: "hires", wide: true },
  { id: "upcoming", label: "Coming up", blurb: "Next items on your HR roadmap" },
  { id: "wins", label: "Recent wins", blurb: "What got done lately" },
  { id: "resources", label: "Resources", blurb: "Recently shared templates and guides", module: "resources" },
  { id: "wellness", label: "Wellness", blurb: "Latest benefits news", module: "wellness" },
  { id: "leave", label: "Leave of absence", blurb: "Who's out, who's coming back, and what's due (HR admins only)", module: "leave", wide: true },
  { id: "huddle", label: "HR Huddle email", blurb: "Turn your recap email on or off" },
];
/** A busy executive's Home: what needs me, people in motion, what Ben is on, and one way to reach him. The rest is opt-in under Customize. */
export const DEFAULT_TILES = ["projects", "mylist", "hires", "recruiting"];

export interface ClientConfig {
  onboarding?: Partial<import("./hires").OnboardingSettings>;
  tiles?: string[]; // default dashboard for everyone at this client (set by Ben)
  rosterColumns?: Record<string, string>; // the last roster upload's column matches, reused next time
  softAsks?: boolean; // show the quiet referral / add-on lines (default on)
  videoScreening?: boolean; // add-on: pitch links on Recruiting roles
  recognition?: import("./recognition").RecognitionSettings; // Shoutouts: QR link, values, texting number
  properties?: import("./properties").PropertySettings; // Our Properties: property details, slot overrides, hidden locations, contacts
  offboarding?: import("./offboard").OffboardSettings; // goodbye email wording, info sections, survey, timing
  leave?: import("./leave").LeaveSettings; // Leave center: types, reminder timing (who the HR admins are lives in its own table)
  askHr?: boolean; // Ask HR for managers (default on; answers come only from this client's handbook and policies)
  huddle: HuddleSettings;
  modules: Record<ModuleKey, boolean>;
  accent: string;
  logo?: string; // URL or data URL
  logoEmail?: string; // PNG copy of an SVG logo, for email apps
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
  advance: "Yes",
  hold: "Hold",
  pass: "No",
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
  pitch?: import("./pitch").PitchSettings; // video screening link
  reviewers?: import("./pitch").ReviewLink[]; // Ben's private links for people outside the portal
  description?: string; // the job description; the AI resume summaries compare against it
}

/** What the AI pulled from a candidate's resume, compared with the job. Describes; never scores or ranks. */
export interface CandidateBrief {
  status: "ok" | "no_resume" | "unreadable" | "error";
  now?: string; // current or most recent role, e.g. "Project coordinator at an exhibit firm"
  summary?: string; // two sentences
  points?: string[]; // experience related to this job
  gap?: string; // something the job needs that the resume doesn't show
  at: string;
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
  source?: "pitch";
  pitch?: import("./pitch").PitchSubmission;
  hidden?: boolean; // a pitch Ben hasn't shared with the client yet
  screened?: "shared" | "passed";
  decidedAt?: string; // when they said yes / no / offer
  cleared?: boolean; // Ben cleared them: off the client's list, video deleted
  clearedAt?: string;
  mediaDeletedAt?: string;
  reviews?: import("./pitch").OutsideReview[]; // yes/no from reviewer links
  brief?: CandidateBrief; // AI summary of the resume against the job
}

// ---------- resources ----------

export type ResourceType = "Training" | "Template" | "Guide" | "Checklist" | "Policy" | "Video" | "Link";
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
  url?: string; // a web link (YouTube, Loom, Vimeo, Google Drive...)
  path?: string; // an uploaded file in storage (alza/library/...)
  fileName?: string;
  size?: number;
  practice?: import("./practice").Practice; // optional practice built from a training
}
export const FOLDERS = ["Trainings", "Manager toolkit", "Policies", "Recruiting", "Project deliverables"];

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
      recognition: { token: "DemoShoutoutLink000000", values: ["Teamwork", "Safety first", "Above and beyond", "Customer first", "Ownership"], smsNumber: "+14155550123", notifyManagers: true, showWall: true },
      modules: { recruiting: true, resources: true, wellness: true, board: true, hires: true, training: true, recognition: true, leave: true, offboarding: true, properties: false },
      videoScreening: true,
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
      modules: { recruiting: false, resources: true, wellness: false, board: true, hires: true, training: false, recognition: false, leave: false, offboarding: false, properties: false },
      accent: "#6b8c6b",
      codes: [],
      escalationEmail: "sam@example.com",
      users: [{ name: "Sam Patel", role: "Owner", email: "sam@example.com", access: "exec" }],
    },
    northgate: {
      huddle: { cadence: "weekly", day: 1, recipients: ["rae@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: false, resources: true, wellness: true, board: true, hires: true, training: false, recognition: false, leave: false, offboarding: false, properties: false },
      accent: "#4a7ab5",
      codes: [],
      escalationEmail: "rae@example.com",
      users: [
        { name: "Rae Kim", role: "Executive Director", email: "rae@example.com", access: "exec" },
        { name: "Luis Moreno", role: "Ops Lead", email: "luis@example.com", access: "manager" },
      ],
    },
    bayside: {
      huddle: { cadence: "weekly", day: 1, recipients: ["morgan@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: true, resources: true, wellness: false, board: true, hires: true, training: false, recognition: false, leave: false, offboarding: false, properties: true },
      accent: "#1d4f7a",
      codes: [],
      escalationEmail: "morgan@example.com",
      users: [{ name: "Morgan Hayes", role: "Managing Director", email: "morgan@example.com", access: "exec" }],
      properties: {
        items: [
          { key: "harbor view apartments", name: "Harbor View Apartments", city: "San Francisco · Marina", note: "Garage gate vendor changes Jan 1. Gate issues go to Priya until then." },
          { key: "1450 market lofts", name: "1450 Market Lofts", city: "San Francisco · SoMa" },
          { key: "mission terrace", name: "Mission Terrace", status: "Transition", city: "Oakland · Lake Merritt" },
          { key: "the alder", name: "The Alder", city: "San Mateo" },
          { key: "bayview commons", name: "Bayview Commons", status: "Acquisition", city: "San Francisco · Bayview", manual: true },
        ],
        hidden: [],
      },
    },
    cedar: {
      huddle: { cadence: "weekly", day: 1, recipients: ["jo@example.com"], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
      modules: { recruiting: true, resources: false, wellness: false, board: true, hires: true, training: false, recognition: false, leave: false, offboarding: false, properties: false },
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
      reviewers: [{ id: "rv-demo", token: "DemoReviewerLink0000000000000", name: "Pat Morgan", email: "pat@example.com", createdAt: at(-2), expiresAt: d(21) }],
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
      pitch: { slug: "warehouse-coordinator-k7m2", open: true, prompts: ["Who you are and what you do best", "Why this role, and why now", "One result you're proud of"], maxSeconds: 90, intro: "Thanks for your interest. Instead of a cover letter, we'd love a short video so we can get to know you.", allowUpload: true, allowAudio: true, allowWritten: true, askResume: true, askLinkedin: true, review: "ben", createdAt: at(-5) },
    },
  ];

  const candidates: Candidate[] = [
    {
      id: "c1",
      roleId: "r-producer",
      reviews: [{ reviewerId: "rv-demo", name: "Pat Morgan", decision: "yes", note: "Best answer on budgets.", at: at(-1, 15) }],
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
    { id: "c-pitch1", roleId: "r-coord", name: "Riley Santos", headline: "Video pitch, 74s", summary: "", strengths: [], assessment: "", scores: [], stage: "Pitch received", sentAt: d(-1), source: "pitch", hidden: true, pitch: { kind: "video", seconds: 74, email: "riley@example.com", phone: "(415) 555-0199", linkedin: "https://linkedin.com/in/example", resumeName: "Riley Santos Resume.pdf", resumePath: "demo", mediaPath: "demo", submittedAt: at(-1, 15) }, brief: { status: "ok", now: "Warehouse lead, event rental company", summary: "Four years in warehouse operations for an event rental company, the last two as lead. Strong on receiving, inventory counts and scheduling crews for load-outs.", points: ["Leads a crew of 5 on receiving and load-outs", "Runs weekly inventory counts in Asset Panda", "Schedules trucks for 20+ events a month"], gap: "No NetSuite experience listed", at: at(-1, 15) } },
    { id: "c-pitch2", roleId: "r-coord", name: "Avery Brooks", headline: "Written intro", summary: "", strengths: [], assessment: "", scores: [], stage: "Pitch received", sentAt: d(0), source: "pitch", hidden: true, pitch: { kind: "written", text: "I've run receiving and inventory for a 40,000 sq ft event rental warehouse for four years. I'm forklift certified, I know Asset Panda and NetSuite, and I'm the person who stays until the last truck is checked in. I'd love to bring that to Blueprint.", email: "avery@example.com", submittedAt: at(0, 9) }, brief: { status: "no_resume", at: at(0, 9) } },
  ];

  const resources: Resource[] = [
    { id: "res1", title: "Manager 1:1 guide", type: "Guide", category: "Leadership", desc: "Agenda, questions and a cadence that works for busy managers.", updated: d(-30), shares: [{ clientId: "blueprint", folder: "Manager toolkit", at: at(-20) }] },
    { id: "res2", title: "Documenting performance concerns", type: "Checklist", category: "Performance", desc: "What to write down, when, and how to keep it factual.", updated: d(-12), shares: [{ clientId: "blueprint", folder: "Manager toolkit", at: at(-10) }, { clientId: "northgate", folder: "Manager toolkit", at: at(-8) }] },
    { id: "res3", title: "Structured interview scorecard", type: "Template", category: "Recruiting", desc: "Score every candidate on the same criteria.", updated: d(-6), shares: [{ clientId: "blueprint", folder: "Recruiting", at: at(-5) }] },
    { id: "res4", title: "Offer letter template", type: "Template", category: "Recruiting", desc: "California-ready offer letter with at-will language.", updated: d(-40), outdated: true, shares: [] },
    { id: "res5", title: "Remote work policy example", type: "Policy", category: "Policies", desc: "A short, plain-English remote and hybrid policy.", updated: d(-25), shares: [] },
    { id: "res6", title: "New manager onboarding checklist", type: "Checklist", category: "Leadership", desc: "First 30 days for someone stepping into management.", updated: d(-15), shares: [] },
    { id: "res-t1", title: "Session 1: Job requisitions and the ideal candidate", type: "Training", category: "Manager training", desc: "Define what you need before you post. 45 minutes, with the worksheet.", updated: d(-12), url: "https://www.example.com/training-1", shares: [{ clientId: "blueprint", folder: "Trainings", at: at(-12) }] },
    { id: "res-t2", title: "Session 2: Reviewing resumes fast and fairly", type: "Training", category: "Manager training", desc: "A 10-minute screen that keeps bias out. Slides and recording.", updated: d(-5), url: "https://www.example.com/training-2", shares: [{ clientId: "blueprint", folder: "Trainings", at: at(-5) }] },
    { id: "res-t0", title: "Manager Essentials: Say it. Don't avoid it.", type: "Training", category: "Manager training", desc: "Difficult conversations with the CLEAR framework. Bilingual slides, with practice.", updated: d(-2), url: "/demo/say-it-slides.pdf", practice: SEED_PRACTICE, shares: [{ clientId: "blueprint", folder: "Trainings", at: at(-2) }] },
    { id: "res-t3", title: "Hard conversations: a one-page guide", type: "Guide", category: "Manager toolkit", desc: "What to say, what to write down, when to call Ben.", updated: d(-20), url: "https://www.example.com/guide", shares: [{ clientId: "blueprint", folder: "Manager toolkit", at: at(-20) }] },
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

  const now = new Date().toISOString();
  const hires: Hire[] = [
    { id: "h1", clientId: "blueprint", status: "Offer signed", title: "Senior Producer", managerName: "Marcus Cole", managerTitle: "Production Manager", name: "Morgan Lee", personalEmail: "morgan.lee@example.com", cell: "", payType: "salary", payAmount: 128000, bonus: 10, exempt: "exempt", startDate: d(9), arrivalTime: "9:00 AM", location: "", jd: "Lead production on large corporate events\nOwn event budgets", emails: { welcome: at(-1, 10) }, createdAt: now, history: [{ at: at(-4), by: "Ben Gaines", text: "Hire started" }, { at: at(-1, 10), by: "Alex Rivera", text: "Offer signed" }] },
    { id: "h2", clientId: "blueprint", status: "Offer sent", title: "Warehouse Coordinator", managerName: "Dana Ortiz", managerTitle: "Office Manager", name: "Jordan Kim", personalEmail: "jordan@example.com", payType: "hourly", payAmount: 30, exempt: "nonexempt", startDate: d(15), arrivalTime: "7:30 AM", location: "", docs: [{ kind: "offer", name: "Offer Letter - Jordan Kim.docx", at: at(-2) }], createdAt: now, history: [{ at: at(-2), by: "Ben Gaines", text: "Hire started" }] },
    { id: "h3", clientId: "blueprint", status: "Started", title: "CAD Designer", managerName: "Priya Shah", managerTitle: "COO", name: "Kevin Tran", personalEmail: "kevin.t@example.com", payType: "hourly", payAmount: 38, exempt: "nonexempt", startDate: d(-3), location: "LV", track: { bg: d(-12), drug: d(-10), payroll: d(-5) }, remarks: [{ at: d(-3), by: "Priya Shah", text: "Started. Orientation Friday" }], emails: { welcome: at(-14), firstDay: at(-8) }, createdAt: now, history: [{ at: at(-20), by: "Ben Gaines", text: "Hire started" }] },
    { id: "h4", clientId: "blueprint", status: "Offer signed", title: "Shipping Associate", managerName: "Dana Ortiz", managerTitle: "Office Manager", name: "Andrea Molina", personalEmail: "andrea.m@example.com", payType: "hourly", payAmount: 24, exempt: "nonexempt", startDate: d(4), location: "LV", track: { bg: d(-6), payroll: d(-2) }, remarks: [{ at: d(-6), by: "Dana Ortiz", text: "Pending drug test" }], emails: { welcome: at(-10) }, createdAt: now, history: [{ at: at(-12), by: "Ben Gaines", text: "Hire started" }] },
    { id: "h5", clientId: "blueprint", status: "Started", title: "Production Associate", managerName: "Marcus Cole", managerTitle: "Production Manager", name: "Riley Chen", personalEmail: "riley.c@example.com", payType: "hourly", payAmount: 26, exempt: "nonexempt", startDate: d(-29), location: "SF", track: { bg: d(-40), drug: d(-38), payroll: d(-31), orient: d(-27) }, remarks: [{ at: d(-27), by: "Marcus Cole", text: "Orientation done, settling in well" }], emails: { welcome: at(-45), firstDay: at(-36) }, createdAt: now, history: [{ at: at(-50), by: "Ben Gaines", text: "Hire started" }] },
    { id: "h6", clientId: "blueprint", status: "Offer signed", title: "Field Ops Driver/Installer", managerName: "Marcus Cole", managerTitle: "Production Manager", name: "Tyler Brooks", personalEmail: "tyler.b@example.com", payType: "hourly", payAmount: 25, exempt: "nonexempt", startDate: d(2), location: "SF", outcome: "declined", remarks: [{ at: d(-4), by: "Dana Ortiz", text: "Declined, took another offer" }], createdAt: now, history: [{ at: at(-15), by: "Ben Gaines", text: "Hire started" }] },
    { id: "h7", clientId: "blueprint", status: "Started", title: "Upholsterer", managerName: "Marcus Cole", managerTitle: "Production Manager", name: "Sofia Ramos", personalEmail: "sofia.r@example.com", payType: "hourly", payAmount: 29, exempt: "nonexempt", startDate: d(-40), location: "SF", track: { bg: d(-52), drug: d(-50), payroll: d(-42), orient: d(-38), day30: d(-9) }, remarks: [{ at: d(-9), by: "Marcus Cole", text: "30-day check-in done. Doing great" }], emails: { welcome: at(-55), firstDay: at(-47) }, createdAt: now, history: [{ at: at(-60), by: "Ben Gaines", text: "Hire started" }] },
  ];
  config.blueprint.onboarding = { payroll: "Rippling", hqAddress: "1500 Folsom St, San Francisco, CA 94103", hrPhone: "(415) 555-0142", benefitsNote: "Your medical, dental and vision benefits start on the first of the month after your start date.", leaderQuote: "We make big moments happen. That starts with the people on our team.", leaderNames: "Alex Rivera, CEO" };

  // ---------- Manager Hub sample team (fictional)
  const md = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return `${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const yearsAgo = (y: number, n = 0) => { const x = new Date(); x.setFullYear(x.getFullYear() - y); x.setDate(x.getDate() + n); return toISO(x); };
  const daysAgo = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return toISO(x); };
  const mgr = { managerEmail: "dana@example.com", managerName: "Dana Ortiz" };
  const people = [
    { id: "pp1", clientId: "blueprint", name: "Jamie Lopez", title: "Warehouse Lead", email: "jamie@example.com", ...mgr, hireDate: yearsAgo(3, 2), birthday: md(40), department: "Warehouse", location: "San Francisco", active: true },
    { id: "pp2", clientId: "blueprint", name: "Sam Patel", title: "Inventory Coordinator", email: "sam.p@example.com", ...mgr, hireDate: yearsAgo(1, 70), birthday: md(3), department: "Warehouse", location: "San Francisco", active: true },
    { id: "pp3", clientId: "blueprint", name: "Rosa Diaz", title: "Driver", email: "rosa@example.com", ...mgr, hireDate: daysAgo(26), birthday: md(120), department: "Logistics", location: "San Francisco", active: true },
    { id: "pp4", clientId: "blueprint", name: "Chris Wu", title: "Warehouse Associate", email: "chris.w@example.com", ...mgr, hireDate: yearsAgo(2, 150), birthday: md(200), department: "Warehouse", location: "Las Vegas", active: true },
    { id: "bp1", clientId: "bayside", name: "Maria Chen", title: "Regional Manager", email: "maria@example.com", managerEmail: "morgan@example.com", managerName: "Morgan Hayes", hireDate: yearsAgo(1, 0), birthday: md(11), department: "Operations", location: "Corporate", active: true },
    { id: "bp2", clientId: "bayside", name: "Lena Brooks", title: "Controller", email: "lena@example.com", managerEmail: "morgan@example.com", managerName: "Morgan Hayes", hireDate: yearsAgo(2, 17), birthday: md(40), department: "Finance", location: "Corporate", active: true },
    { id: "bp3", clientId: "bayside", name: "Priya Raman", title: "Facilities Lead", email: "priya.r@example.com", managerEmail: "maria@example.com", managerName: "Maria Chen", hireDate: yearsAgo(3, 34), birthday: md(69), department: "Operations", location: "Corporate", active: true },
    { id: "bp4", clientId: "bayside", name: "Jordan Ellis", title: "Property Manager", email: "jordan@example.com", managerEmail: "maria@example.com", managerName: "Maria Chen", hireDate: yearsAgo(4, 51), birthday: md(98), department: "Operations", location: "Harbor View Apartments; The Alder", active: true },
    { id: "bp5", clientId: "bayside", name: "Sam Okafor", title: "Leasing Manager", email: "sam.o@example.com", managerEmail: "jordan@example.com", managerName: "Jordan Ellis", hireDate: yearsAgo(1, 68), birthday: md(127), department: "Leasing", location: "Harbor View Apartments; The Alder", active: true },
    { id: "bp6", clientId: "bayside", name: "Rosa Medina", title: "Maintenance Technician", email: "rosa.m@example.com", managerEmail: "jordan@example.com", managerName: "Jordan Ellis", hireDate: yearsAgo(2, 85), birthday: md(156), department: "Maintenance", location: "Harbor View Apartments", active: true },
    { id: "bp7", clientId: "bayside", name: "Tasha Greene", title: "Property Manager", email: "tasha@example.com", managerEmail: "maria@example.com", managerName: "Maria Chen", hireDate: yearsAgo(3, 102), birthday: md(185), department: "Operations", location: "1450 Market Lofts; Mission Terrace", active: true },
    { id: "bp8", clientId: "bayside", name: "Devon Hart", title: "Leasing Agent", email: "devon@example.com", managerEmail: "tasha@example.com", managerName: "Tasha Greene", hireDate: yearsAgo(4, 119), birthday: md(214), department: "Leasing", location: "1450 Market Lofts; Mission Terrace", active: true },
    { id: "bp9", clientId: "bayside", name: "Luis Vega", title: "Maintenance Technician", email: "luis.v@example.com", managerEmail: "tasha@example.com", managerName: "Tasha Greene", hireDate: yearsAgo(1, 136), birthday: md(243), department: "Maintenance", location: "1450 Market Lofts", active: true },
    { id: "bp10", clientId: "bayside", name: "Ana Ruiz", title: "Porter", email: "ana.r@example.com", managerEmail: "tasha@example.com", managerName: "Tasha Greene", hireDate: yearsAgo(2, 153), birthday: md(272), department: "Maintenance", location: "Mission Terrace", active: true },
    { id: "bp11", clientId: "bayside", name: "Kim Tran", title: "Assistant Property Manager", email: "kim.t@example.com", managerEmail: "tasha@example.com", managerName: "Tasha Greene", hireDate: yearsAgo(3, 170), birthday: md(301), department: "Operations", location: "Mission Terrace", active: true },
    { id: "pp5", clientId: "blueprint", name: "Dana Ortiz", title: "Office Manager", email: "dana@example.com", managerEmail: "alex@example.com", managerName: "Alex Rivera", hireDate: yearsAgo(4, 5), birthday: md(60), department: "Operations", location: "San Francisco", active: true },
  ];
  const checkins = [
    { id: "ck1", clientId: "blueprint", personId: "pp1", managerEmail: "dana@example.com", kind: "checkin" as const, date: daysAgo(9), notes: "Busy season planning. Wants to train Chris on the new scanner.", commitments: [{ id: "c1", text: "Book scanner training for Chris", done: false }], by: "Dana Ortiz", at: new Date().toISOString() },
    { id: "ck2", clientId: "blueprint", personId: "pp1", managerEmail: "dana@example.com", kind: "recognition" as const, date: daysAgo(12), notes: "Stayed late to get the gala load-out done on time. Thanked him at the team huddle.", by: "Dana Ortiz", at: new Date().toISOString() },
    { id: "ck3", clientId: "blueprint", personId: "pp4", managerEmail: "dana@example.com", kind: "checkin" as const, date: daysAgo(21), notes: "Interested in a lead role next year.", commitments: [], by: "Dana Ortiz", at: new Date().toISOString() },
  ];
  return { config, roles, candidates, resources, benefits, announcements, notes, files, notices, hires, people, checkins };
}

export const DAY_MS = 86400000;
export function daysSince(iso: string): number {
  const [y, m, dd] = iso.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.round((today().getTime() - new Date(y, m - 1, dd).getTime()) / DAY_MS));
}
