// Discipline documentation: an executive (or Ben) describes what happened, picks the level,
// and the Alza Hub words it as a write-up, email recap or file note from the company's handbook.
// The AI only words, formats and quotes policy. It never picks the level and never suggests termination.
// Records are private to executives and Ben. Employees and their managers never see them in the Alza Hub.

export const DEFAULT_LEVELS = ["Documented conversation", "Verbal warning", "Written warning", "Final written warning"];
export const ISSUES = ["Attendance", "Performance", "Conduct", "Policy", "Safety", "Other"] as const;
export type Issue = (typeof ISSUES)[number];
export type Format = "writeup" | "email" | "note";
export const FORMAT_LABEL: Record<Format, string> = { writeup: "Write-up", email: "Email recap", note: "File note" };
export type Ack = "pending" | "signed" | "declined" | "none";

export const SUGGEST_MONTHS = 12; // records older than this don't count toward the suggested level
export const FAIRNESS_MONTHS = 6; // how far back the fairness check looks

export interface DiscSettings {
  levels: string[];
}
export function discFor(s?: Partial<DiscSettings>): DiscSettings {
  const levels = (s?.levels ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 8);
  return { levels: levels.length ? levels : DEFAULT_LEVELS };
}

export interface DiscInput {
  personId: string;
  personName: string;
  personTitle?: string;
  date: string; // yyyy-mm-dd
  facts: string;
  witnesses?: string;
  issue: Issue;
  level: string;
  format: Format;
}

export interface DiscDraft {
  title: string;
  body: string; // light markdown, editable
  es?: string; // Spanish version, made on request
  leftOut: string[]; // opinions or loaded words left out of the draft
  missing: string[]; // short questions that would make it stronger
  cite?: { doc: string; section: string };
}

export interface DiscRecord extends DiscInput {
  id: string;
  clientId: string;
  status: "review" | "saved"; // review = held for Ben before drafting
  hold?: string[]; // why it was held (shown to whoever can see the record)
  draft?: DiscDraft;
  ack: Ack;
  signed?: { path: string; name: string; at: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  benNote?: string;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const newDiscId = () => `dc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const fmtDay = (d: string) => (d ? new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** A first guess at the kind of issue, from the words used. The exec can change it. */
export function guessIssue(t: string): Issue {
  if (/\b(late|tardy|absent|no[- ]?show|call(ed)? out|clock(ed)? in|missed (a |his |her |their )?shift|attendance)\b/i.test(t)) return "Attendance";
  if (/\b(unsafe|safety|injur|forklift|ppe|hard hat|harness|ladder)\b/i.test(t)) return "Safety";
  if (/\b(yell|swore|cursed|rude|disrespect|threat|argu|insubordinat|refused)\b/i.test(t)) return "Conduct";
  if (/\b(quota|deadline|errors?|mistakes?|quality|missed (the )?target|performance|behind on)\b/i.test(t)) return "Performance";
  if (/\b(policy|phone use|dress code|cash handling|timecard|uniform)\b/i.test(t)) return "Policy";
  return "Other";
}

/**
 * The suggested level: one step past the highest level for the same issue in the last 12 months.
 * Only a suggestion; the exec always chooses.
 */
export function suggestLevel(levels: string[], history: DiscRecord[], issue: Issue): { level: string; why: string } {
  const since = monthsAgo(SUGGEST_MONTHS);
  const same = history.filter((r) => r.status === "saved" && r.issue === issue && r.date >= since);
  if (!same.length) return { level: levels[0], why: `No ${issue.toLowerCase()} records in the last ${SUGGEST_MONTHS} months, so this would be the first step.` };
  const top = same.reduce((a, r) => (Math.max(levels.indexOf(r.level), 0) > Math.max(levels.indexOf(a.level), 0) ? r : a));
  const i = Math.max(levels.indexOf(top.level), 0);
  if (i >= levels.length - 1) return { level: levels[levels.length - 1], why: `There's already a ${top.level.toLowerCase()} for ${issue.toLowerCase()} (${fmtDay(top.date)}). Talk to Ben before going further.` };
  return { level: levels[i + 1], why: `Same issue as the ${top.level.toLowerCase()} on ${fmtDay(top.date)}, so the next step is a ${levels[i + 1].toLowerCase()}.` };
}

// ---------- word checks on what the exec typed ----------

/** Opinions and loaded words that weaken a write-up. Shown as a gentle flag; the draft leaves them out. */
const LOADED: [RegExp, string][] = [
  [/\b(bad|poor|negative|terrible) attitude\b/i, "attitude"],
  [/\battitude problem\b/i, "attitude"],
  [/\blazy\b/i, "lazy"],
  [/\b(doesn'?t|does not|don'?t) (seem to )?care\b/i, "doesn't care"],
  [/\b(crazy|psycho|nuts|unstable)\b/i, "crazy"],
  [/\b(emotional|hormonal|dramatic|drama queen|hysterical)\b/i, "emotional"],
  [/\b(too old|old school|too young|millennial|boomer|gen z)\b/i, "age"],
  [/\b(not a (good )?(culture )?fit|bad fit)\b/i, "not a fit"],
  [/\b(stupid|idiot|incompetent|useless|worthless)\b/i, "name-calling"],
];
export function loadedWords(t: string): string[] {
  const out: string[] = [];
  for (const [re] of LOADED) {
    const m = t.match(re);
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/**
 * Things in the description that call for Ben before anything is drafted: the employee may have
 * done something the law protects, so discipline now could look like retaliation.
 */
const PROTECTED: [RegExp, string][] = [
  [/\b(complain(ed|t|ts|ing)?|grievance|went to hr|reported (a |his |her |their )?(manager|supervisor|boss))\b/i, "a recent complaint"],
  [/\b(harass\w*|discriminat\w*|hostile|retaliat\w*|racis\w*|sexis\w*)\b/i, "a harassment or discrimination concern"],
  [/\b(pregnan\w*|maternity|paternity|baby|expecting)\b/i, "a pregnancy"],
  [/\b(leave of absence|fmla|cfra|pfl|medical leave|bonding leave|on leave|time off for (surgery|treatment))\b/i, "a leave request"],
  [/\b(accommodat\w*|disabilit\w*|doctor'?s note|medical|diagnos\w*|therapy|surgery|condition)\b/i, "a medical issue or accommodation"],
  [/\b(injur\w*|workers'? comp|hurt (his|her|their|my) |got hurt)\b/i, "an injury or workers' comp"],
  [/\b(unsafe conditions|safety concern|osha|reported (a |the )?(hazard|safety))\b/i, "a safety report"],
  [/\b(unpaid|overtime pay|wage claim|labor board|paycheck (was )?short|union|organiz\w*)\b/i, "a pay or union issue"],
  [/\b(lawyer|attorney|eeoc|dfeh|crd|lawsuit|sue|whistle\w*)\b/i, "a legal claim"],
  [/\b(religio\w*|pray\w*|immigra\w*|visa|national origin)\b/i, "a protected personal trait"],
];
export function protectedHits(t: string): string[] {
  const out: string[] = [];
  for (const [re, why] of PROTECTED) if (re.test(t) && !out.includes(why)) out.push(why);
  return out;
}
/** Termination is out of scope here: it goes to Ben. */
export const TERMINATION = /\b(terminat\w*|fire[ds]?|firing|let (him|her|them) go|let go|separat\w*|lay ?off|dismiss\w*)\b/i;

// ---------- the document ----------

export function signatureBlock(format: Format, issuer: string): string {
  if (format !== "writeup") return "";
  return [
    "## Employee comments",
    "______________________________________________",
    "______________________________________________",
    "",
    "Signing below shows you received this notice. It does not mean you agree with it.",
    "",
    "Employee signature: ______________________    Date: __________",
    "",
    `${issuer}: ______________________    Date: __________`,
  ].join("\n");
}

/** Split light markdown into blocks for the on-screen letter. */
export type Block = { k: "h1" | "h2" | "p" | "quote" | "li" | "line"; t: string };
export function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    if (/^#\s+/.test(l)) out.push({ k: "h1", t: l.replace(/^#\s+/, "") });
    else if (/^#{2,3}\s+/.test(l)) out.push({ k: "h2", t: l.replace(/^#{2,3}\s+/, "") });
    else if (/^>\s?/.test(l)) out.push({ k: "quote", t: l.replace(/^>\s?/, "") });
    else if (/^\s*[-*•]\s+/.test(l)) out.push({ k: "li", t: l.replace(/^\s*[-*•]\s+/, "") });
    else if (/^_{6,}$/.test(l.trim())) out.push({ k: "line", t: "" });
    else out.push({ k: "p", t: l });
  }
  return out;
}

/** Clean what the browser sends, so a record never holds anything unexpected. */
export function cleanInput(raw: unknown, levels: string[]): DiscInput | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
  const facts = s(b.facts, 6000);
  const personName = s(b.personName, 120);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? String(b.date) : today();
  if (!facts || facts.length < 10 || !personName) return null;
  const issue = (ISSUES as readonly string[]).includes(String(b.issue)) ? (String(b.issue) as Issue) : "Other";
  const level = levels.includes(String(b.level)) ? String(b.level) : levels[0];
  const format: Format = b.format === "email" || b.format === "note" ? b.format : "writeup";
  return { personId: s(b.personId, 60), personName, personTitle: s(b.personTitle, 120) || undefined, date, facts, witnesses: s(b.witnesses, 400) || undefined, issue, level, format };
}

export function cleanDraft(raw: unknown): DiscDraft | undefined {
  const d = (raw ?? null) as Record<string, unknown> | null;
  if (!d || typeof d.body !== "string" || !d.body.trim()) return undefined;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, 8) : []);
  const c = d.cite as Record<string, unknown> | undefined;
  return {
    title: String(d.title ?? "").slice(0, 160) || "Documentation",
    body: d.body.slice(0, 20000),
    es: typeof d.es === "string" && d.es.trim() ? d.es.slice(0, 22000) : undefined,
    leftOut: arr(d.leftOut),
    missing: arr(d.missing),
    cite: c && c.doc ? { doc: String(c.doc).slice(0, 160), section: String(c.section ?? "").slice(0, 160) } : undefined,
  };
}
