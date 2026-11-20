// Video screening (the Alza Hub's simplified AlzaPitch): settings per role and what a candidate sends.
// Pure, shared by browser and server.

export interface PitchSettings {
  slug: string; // the public link: /pitch/<slug>
  open: boolean;
  prompts: string[]; // shown on screen while they record
  maxSeconds: number; // 60, 90 or 120
  intro: string; // a short welcome from the company
  allowUpload: boolean; // upload a video they already recorded
  allowAudio: boolean;
  allowWritten: boolean; // retired: candidates send video or audio only
  askResume: boolean;
  askLinkedin: boolean;
  review: "ben" | "client"; // Ben screens first, or straight to the client
  closesAt?: string; // yyyy-mm-dd
  createdAt: string;
  questions?: ScreenQ[]; // optional questions the candidate answers before recording
}

// ------------------------------------------------------------------ screening questions
export type QKind = "short" | "long" | "yesno" | "choice";
export interface ScreenQ {
  id: string;
  text: string;
  kind: QKind;
  options?: string[]; // choice only
  required: boolean;
  flagIf?: string; // an answer that gets flagged for the reviewer (yes/no and choice). Never auto-rejects.
}
/** A candidate's answer, with the question as it read when they answered. */
export interface ScreenA {
  id: string;
  q: string;
  a: string;
  flag?: boolean;
}
export const MAX_QUESTIONS = 10;
export const Q_KINDS: [QKind, string][] = [["short", "Short answer"], ["long", "Paragraph"], ["yesno", "Yes / No"], ["choice", "Multiple choice"]];

/** Common questions that are safe to ask in California. */
export const Q_PRESETS: Omit<ScreenQ, "id">[] = [
  { text: "Are you legally authorized to work in the United States?", kind: "yesno", required: true, flagIf: "No" },
  { text: "Will you now or in the future require visa sponsorship to work in the US?", kind: "yesno", required: true, flagIf: "Yes" },
  { text: "This role is on-site. Does that work for you?", kind: "yesno", required: true, flagIf: "No" },
  { text: "Can you work the schedule for this role, including evenings or weekends when needed?", kind: "yesno", required: true, flagIf: "No" },
  { text: "This role requires driving. Do you have a valid driver's license?", kind: "yesno", required: true, flagIf: "No" },
  { text: "When could you start?", kind: "short", required: true },
  { text: "What pay range are you looking for?", kind: "short", required: false },
  { text: "How many years of experience do you have in a similar role?", kind: "choice", options: ["Less than 1", "1 to 3", "3 to 5", "5+"], required: true },
  { text: "Anything else you'd like us to know?", kind: "long", required: false },
];

/** Flags questions that are illegal or risky to ask candidates (federal law and California). A warning, not a block. */
export function questionWarning(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  const rules: [RegExp, string][] = [
    [/salary history|current (salary|pay|wage|compensation)|(previous|prior|last|past) (salary|pay|wage|compensation)|what (do|did) you (make|earn)/, "California bans asking about pay history. Ask what pay range they're looking for instead."],
    [/criminal|convict|arrest|felon|background check|ever been charged/, "California's Fair Chance Act bars asking about conviction history before a conditional offer."],
    [/\bage\b|how old|birth|\bdob\b|graduat(e|ed|ion) (year|date)|what year did you/, "Don't ask about age, birth date or graduation years. For a minimum age, ask \"Are you at least 18?\""],
    [/married|marital|spouse|husband|wife|children|\bkids\b|pregnan|childcare|family plans|maiden name/, "Don't ask about marital status, children, pregnancy or family plans."],
    [/religio|church|sabbath|\bpray|faith/, "Don't ask about religion. Ask whether they can work the schedule instead."],
    [/citizen|born in|nationality|national origin|native (language|tongue)|first language|where are you from|ancestry/, "Don't ask about citizenship or national origin. Ask \"Are you legally authorized to work in the US?\" instead."],
    [/disab|medical|health condition|illness|medication|workers'? comp|injur|mental health/, "Don't ask about disabilities, health or injuries. Ask whether they can do the essential duties, with or without accommodation."],
    [/\bgender\b|\bsex\b|\brace\b|ethnic|sexual orientation|pronoun|transgender/, "Don't ask about gender, race, ethnicity or sexual orientation."],
    [/height|weight/, "Avoid height and weight unless it's a true job requirement."],
    [/military discharge|type of discharge|bankrupt|credit (score|history)|own (a|your) (home|car)/, "Avoid questions about discharge type, credit or what they own unless clearly job-related."],
  ];
  for (const [re, msg] of rules) if (re.test(t)) return msg;
  return null;
}

/** Tidy questions from the editor. */
export function cleanQuestions(raw: unknown): ScreenQ[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_QUESTIONS)
    .map((x): ScreenQ | null => {
      const q = (x ?? {}) as Partial<ScreenQ>;
      const text = String(q.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!text) return null;
      const kind: QKind = (["short", "long", "yesno", "choice"] as QKind[]).includes(q.kind as QKind) ? (q.kind as QKind) : "short";
      const options = kind === "choice" ? (q.options ?? []).map((o) => String(o).trim().slice(0, 100)).filter(Boolean).slice(0, 8) : undefined;
      if (kind === "choice" && (!options || options.length < 2)) return null;
      const allowed = kind === "yesno" ? ["Yes", "No"] : options ?? [];
      const flagIf = q.flagIf && allowed.includes(q.flagIf) ? q.flagIf : undefined;
      return { id: String(q.id || `q${Math.random().toString(36).slice(2, 8)}`).slice(0, 20), text, kind, options, required: !!q.required, flagIf };
    })
    .filter((x): x is ScreenQ => !!x);
}

/** Check a candidate's answers against the questions. Returns the cleaned answers, or the first question still missing. */
export function checkAnswers(qs: ScreenQ[] | undefined, raw: unknown): { answers: ScreenA[]; missing?: string } {
  const got = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const answers: ScreenA[] = [];
  for (const q of qs ?? []) {
    let a = String(got[q.id] ?? "").replace(/\r/g, "").trim().slice(0, q.kind === "long" ? 2000 : 300);
    if (q.kind === "yesno" && a && !["Yes", "No"].includes(a)) a = "";
    if (q.kind === "choice" && a && !(q.options ?? []).includes(a)) a = "";
    if (!a) {
      if (q.required) return { answers, missing: q.id };
      continue;
    }
    answers.push({ id: q.id, q: q.text, a, flag: q.flagIf ? a === q.flagIf : undefined });
  }
  return { answers };
}

export interface PitchSubmission {
  kind: "video" | "audio" | "written";
  mediaPath?: string;
  mime?: string;
  seconds?: number;
  text?: string;
  email: string;
  phone?: string;
  linkedin?: string;
  resumePath?: string;
  resumeName?: string;
  submittedAt: string;
  answers?: ScreenA[];
}

/** A private link Ben sends to someone outside the Alza Hub so they can watch pitches and say yes or no. */
export interface ReviewLink {
  id: string;
  token: string; // long random; the link is /review/<token>
  name: string; // who it's for, so their yes/no is labeled
  email?: string;
  createdAt: string;
  expiresAt?: string; // yyyy-mm-dd, last day it works
  revoked?: boolean;
  scope?: "all" | "shared"; // all pitches except ones Ben passed or cleared (default), or only ones shared with the client
}
/** Who a reviewer link shows. */
export const reviewerSees = (c: { hidden?: boolean; cleared?: boolean; screened?: string }, scope: ReviewLink["scope"]) => !c.cleared && c.screened !== "passed" && (scope !== "shared" || !c.hidden);
/** One outside reviewer's call on a candidate. */
export interface OutsideReview {
  reviewerId: string;
  name: string;
  decision: "yes" | "no";
  note?: string;
  at: string;
}

export function newReviewLink(name: string, email?: string, expiresAt?: string, scope: ReviewLink["scope"] = "all"): ReviewLink {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(28)), (b) => abc[b % abc.length]).join("");
  return { id: `rv${Date.now().toString(36)}`, token, name: name.trim(), email: email?.trim() || undefined, createdAt: new Date().toISOString(), expiresAt, scope };
}
export const reviewLinkLive = (l: ReviewLink) => !l.revoked && (!l.expiresAt || l.expiresAt >= new Date().toISOString().slice(0, 10));

export const DEFAULT_PROMPTS = ["Who you are and what you do best", "Why this role, and why now", "One result you're proud of"];

export function newPitch(title: string): PitchSettings {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "role";
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  return {
    slug: `${base}-${rand}`,
    open: true,
    prompts: [...DEFAULT_PROMPTS],
    maxSeconds: 90,
    intro: "Thanks for your interest. Instead of a cover letter, we'd love a short video so we can get to know you.",
    allowUpload: true,
    allowAudio: false,
    allowWritten: false,
    askResume: true,
    askLinkedin: true,
    review: "ben",
    createdAt: new Date().toISOString(),
  };
}

export const pitchOpen = (p?: PitchSettings) => !!p && p.open && (!p.closesAt || p.closesAt >= new Date().toISOString().slice(0, 10));

export const MAX_UPLOAD_MB = 50;

/** Pitch videos are kept until a week after the role's cutoff date, so the hiring team can look back while deciding. */
export const DELETE_AFTER_CUTOFF_DAYS = 7;
/** Without a cutoff date, videos are deleted this long after they were sent. */
export const DELETE_NO_CUTOFF_DAYS = 30;
/** Pitches Ben passed on before sharing go a week after he passed. */
export const DELETE_AFTER_PASS_DAYS = 7;

/** When this candidate's pitch video will be (or was due to be) deleted. Clearing a candidate deletes it right away. */
export function pitchDeleteOn(c: { decidedAt?: string; screened?: string; cleared?: boolean; clearedAt?: string; pitch?: { submittedAt: string } }, closesAt?: string): Date | null {
  if (!c.pitch) return null;
  if (c.cleared) return new Date(c.clearedAt ?? Date.now());
  const add = (from: string, days: number) => {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d;
  };
  if (c.screened === "passed" && c.decidedAt) return add(c.decidedAt, DELETE_AFTER_PASS_DAYS);
  if (closesAt) return add(`${closesAt}T23:59:00`, DELETE_AFTER_CUTOFF_DAYS);
  return add(c.pitch.submittedAt, DELETE_NO_CUTOFF_DAYS);
}
/** Past the role's cutoff date. */
export const pastCutoff = (closesAt?: string) => !!closesAt && closesAt < new Date().toISOString().slice(0, 10);
export const MAX_RESUME_MB = 10;
