// New hires: stages, checks and onboarding emails.
// Same flow as the Presidio Bay / The Main Post New Hire Console, made configurable per client.
// Pure functions, used by the browser and by the daily email job.
import { readableInk } from "./brand";

export const STAGES = ["Approved to hire", "Offer sent", "Offer signed", "Package ready", "First-day email sent", "Started"] as const;
export type Stage = (typeof STAGES)[number];

/** Short labels for the tracker. */
export const STAGE_SHORT: Record<Stage, string> = {
  "Approved to hire": "Approved",
  "Offer sent": "Offer sent",
  "Offer signed": "Signed",
  "Package ready": "Paperwork",
  "First-day email sent": "Day 1 set",
  Started: "Started",
};

export interface Hire {
  id: string;
  clientId: string;
  status: Stage;
  // role
  title: string;
  managerName: string;
  managerTitle: string;
  // person
  name: string;
  firstName?: string;
  personalEmail: string;
  cell?: string;
  // pay
  payType: "salary" | "hourly";
  payAmount: number | "";
  bonus?: number | "";
  exempt: "exempt" | "nonexempt";
  // day one
  startDate: string; // yyyy-mm-dd
  arrivalTime?: string;
  location?: string;
  // documents
  jd?: string;
  letterDate?: string;
  respondBy?: string;
  contingencies?: string;
  notes?: string;
  docs?: { kind: "offer" | "agreement" | "signed"; name: string; path?: string; at: string }[];
  // welcome email
  actionItems?: string;
  emails?: { welcome?: string; firstDay?: string; checkIn?: string }; // ISO sent times
  requestedBy?: string;
  createdAt: string;
  history: { at: string; by: string; text: string }[];
  tasksCreated?: boolean;
  /** One-off wording changes to this hire's emails. Blank means the standard text. */
  emailEdits?: { welcome?: EmailEdits; firstDay?: EmailEdits };
  /** For accounts with sister companies: which one is hiring (sets the name, logo and sender). */
  companyId?: string;
  /** Built-in e-signature requests, by document type. */
  esign?: { offer?: EsignState; agreement?: EsignState };
}

/** The signing link itself is never stored here: only the signer gets it. */
export interface EsignState {
  status: "sent" | "viewed" | "signed" | "declined";
  at: string;
  note?: string;
}

export interface EmailEdits {
  subject?: string;
  message?: string; // paragraphs separated by a blank line
  closing?: string;
}

/** Fill-ins a template can use. */
export const FILL_INS = ["{first name}", "{manager}", "{company}", "{start date}", "{HR name}"] as const;

/** Built-in wording, written as a template. */
export const BUILT_IN_TEMPLATES: Record<"welcome" | "firstDay", Required<EmailEdits>> = {
  welcome: {
    subject: "Welcome to {company}, {first name}!",
    message: "Hi {first name},\n\nI'm {HR name}, and I'm part of the HR team. We're excited to have you joining us and look forward to welcoming you on your first day.\n\nYour manager, {manager}, is looking forward to working with you. Here's what happens between now and then.",
    closing: "We're excited to have you on the team.",
  },
  firstDay: {
    subject: "Your first day at {company}: {start date}",
    message: "We're so glad you're joining us. Here's everything you need for a great first day.",
    closing: "See you soon.",
  },
};

/** The template in effect for this account (or sister company), falling back to the built-in wording. */
export function templateFor(kind: "welcome" | "firstDay", s: Pick<OnboardingSettings, "emailTemplates">): Required<EmailEdits> {
  const b = BUILT_IN_TEMPLATES[kind];
  const t = s.emailTemplates?.[kind] ?? {};
  return { subject: t.subject?.trim() || b.subject, message: t.message?.trim() || b.message, closing: t.closing?.trim() || b.closing };
}

function fillIn(t: string, h: Pick<Hire, "name" | "firstName" | "managerName" | "startDate">, s: Pick<OnboardingSettings, "hrName">, company: string, short = false) {
  const mgr = (h.managerName || "").split(/\s+/)[0];
  let out = t;
  // no manager yet: drop a sentence built around {manager} rather than leave a gap
  if (!mgr) out = out.replace(/[^.!?\n]*\{manager\}[^.!?\n]*[.!?]\s*/gi, "");
  return out
    .replace(/\{first name\}/gi, firstName(h))
    .replace(/\{manager\}/gi, mgr)
    .replace(/\{company\}/gi, company)
    .replace(/\{start date\}/gi, short ? shortDate(h.startDate) : longDate(h.startDate))
    .replace(/\{HR name\}/gi, s.hrName);
}

/** The wording for this hire before any one-off edits: the account template, filled in. */
export function emailDefaults(kind: "welcome" | "firstDay", h: Pick<Hire, "name" | "firstName" | "managerName" | "startDate">, s: Pick<OnboardingSettings, "hrName" | "emailTemplates">, company: string): Required<EmailEdits> {
  const t = templateFor(kind, s);
  return { subject: fillIn(t.subject, h, s, company, true), message: fillIn(t.message, h, s, company), closing: fillIn(t.closing, h, s, company) };
}

/** Turn one hire's wording back into a template: their name, manager, dates become fill-ins. */
export function toTemplate(e: Required<EmailEdits>, h: Pick<Hire, "name" | "firstName" | "managerName" | "startDate">, s: Pick<OnboardingSettings, "hrName">, company: string): Required<EmailEdits> {
  const pairs: [string, string][] = [
    [h.name?.trim() ?? "", "{first name}"],
    [company, "{company}"],
    [shortDate(h.startDate), "{start date}"],
    [longDate(h.startDate), "{start date}"],
    [s.hrName, "{HR name}"],
    [(h.managerName || "").trim(), "{manager}"],
    [(h.managerName || "").split(/\s+/)[0], "{manager}"],
    [firstName(h), "{first name}"],
  ];
  const conv = (t: string) => {
    let out = t;
    for (const [from, to] of pairs.filter(([f]) => f && f.length > 1).sort((a, b) => b[0].length - a[0].length)) {
      out = out.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to);
    }
    return out;
  };
  return { subject: conv(e.subject), message: conv(e.message), closing: conv(e.closing) };
}

/** Standard text unless this hire has an edit. */
function wording(kind: "welcome" | "firstDay", h: Hire, s: OnboardingSettings, company: string): Required<EmailEdits> {
  const d = emailDefaults(kind, h, s, company);
  const e = h.emailEdits?.[kind] ?? {};
  return { subject: e.subject?.trim() || d.subject, message: e.message?.trim() || d.message, closing: e.closing?.trim() || d.closing };
}

/** Plain text to email paragraphs: blank line = new paragraph, single line break kept. */
function paras(t: string, style = "margin:0 0 14px 0") {
  const ps = t.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return ps.map((p, i) => `<p style="${i === ps.length - 1 ? style.replace(/margin:[^;]+/, "margin:0") : style}">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** A sister company on the same account (e.g. Presidio Bay and The Main Post). */
export interface HireCompany {
  id: string;
  name: string;
  logo?: string; // data URL shown in the portal
  logoEmail?: string; // PNG copy for email apps
  color?: string;
  hrName?: string;
  hrEmail?: string;
  hrPhone?: string;
  /** Sending address before the @, e.g. "tmphr" -> tmphr@alzapc.com */
  senderBox?: string;
  /** Its own email wording, if it differs from the main account's. */
  emailTemplates?: { welcome?: EmailEdits; firstDay?: EmailEdits };
}

export interface OnboardingSettings {
  payroll: string; // "ADP", "Rippling", "TriNet"...
  hqAddress: string;
  defaultArrival: string;
  hrName: string;
  hrEmail: string;
  hrPhone: string;
  benefitsNote: string; // "Your benefits start on day one." etc.
  enrollDays: number; // benefits election window
  orientation: boolean; // mention HR orientation in week one
  firstDayDaysBefore: number; // first-day email timing
  autoSend: boolean; // send welcome + first-day emails automatically
  videoUrl?: string;
  leaderQuote?: string;
  leaderNames?: string;
  mission?: string;
  values?: string; // one per line
  clockingSection: boolean; // add clocking in/out rules for non-exempt
  idNote: string; // accepted ID line
  /** Sister companies. When set, each hire picks one. */
  companies?: HireCompany[];
  /** What candidates and new hires see as the sender: name, and the part before the @. */
  senderName?: string;
  senderBox?: string;
  /** This account's own wording for the welcome and first-day emails (with fill-ins). */
  emailTemplates?: { welcome?: EmailEdits; firstDay?: EmailEdits };
  /** Places new hires report to, one per line. */
  officeLocations?: string;
}

export function hireCompany(h: Pick<Hire, "companyId">, s: Pick<OnboardingSettings, "companies">): HireCompany | undefined {
  return h.companyId ? (s.companies ?? []).find((c) => c.id === h.companyId && c.name.trim()) : undefined;
}

/** Brand and contact details for one hire's emails: the sister company's when one is picked. */
export function forCompany(h: Pick<Hire, "companyId">, s: OnboardingSettings, brand: Brand, logoUrl?: string): { s: OnboardingSettings; brand: Brand; company?: HireCompany } {
  const co = hireCompany(h, s);
  if (!co) return { s, brand };
  return {
    company: co,
    s: { ...s, hrName: co.hrName?.trim() || s.hrName, hrEmail: co.hrEmail?.trim() || s.hrEmail, hrPhone: co.hrPhone?.trim() || s.hrPhone, senderName: `${co.name.trim()} HR`, senderBox: co.senderBox, emailTemplates: { welcome: co.emailTemplates?.welcome ?? s.emailTemplates?.welcome, firstDay: co.emailTemplates?.firstDay ?? s.emailTemplates?.firstDay } },
    brand: { company: co.name.trim(), accent: co.color || brand.accent, logoUrl },
  };
}

/** Clean the part before the @ to letters, numbers, dots, dashes. */
export const cleanBox = (v: string) => v.toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "").slice(0, 40);

/** e.g. "Students Run LA" -> "srlahr", "The Main Post" -> "tmphr", "Hensley" -> "hensleyhr" */
export function suggestBox(name?: string) {
  const words = (name ?? "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const base = words.length > 1 ? words.map((w) => (/^[A-Z]{2,4}$/.test(w) ? w : w[0])).join("") : words[0]; // "LA" stays whole: srla
  return cleanBox(base + "hr");
}

/** Sender for candidate and new hire emails: "Students Run LA HR <slrahr@alzapc.com>". Replies go to the HR email. */
export function senderFor(s: Pick<OnboardingSettings, "senderName" | "senderBox" | "hrEmail">, company: string) {
  return { fromName: s.senderName?.trim() || `${company} HR`, fromBox: cleanBox(s.senderBox ?? "") || suggestBox(company) || undefined, replyTo: s.hrEmail };
}

export function officeList(s: Pick<OnboardingSettings, "officeLocations">): string[] {
  return (s.officeLocations ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

export function defaultOnboarding(): OnboardingSettings {
  return {
    payroll: "your payroll system",
    hqAddress: "",
    defaultArrival: "9:00 AM",
    hrName: "Ben",
    hrEmail: "ben@alzapc.com",
    hrPhone: "",
    benefitsNote: "Your benefits information will come from your payroll and benefits portal.",
    enrollDays: 30,
    orientation: true,
    firstDayDaysBefore: 7,
    autoSend: true,
    clockingSection: true,
    idNote: "Accepted ID: a U.S. passport, or a driver's license plus a Social Security card or birth certificate.",
  };
}

export function onboardingFor(partial?: Partial<OnboardingSettings>): OnboardingSettings {
  const d = defaultOnboarding();
  const o = { ...d, ...(partial ?? {}) };
  (Object.keys(d) as (keyof OnboardingSettings)[]).forEach((k) => {
    if (o[k] === undefined || o[k] === null || (typeof d[k] === "string" && o[k] === "" && k !== "hqAddress" && k !== "hrPhone")) (o as Record<string, unknown>)[k] = d[k];
  });
  return o;
}

// California exempt salary minimum: 2 x state minimum wage ($16.90 in 2026) x 2080 hours
export const CA_EXEMPT_MIN_2026 = 70304;

const daysUntil = (iso: string, now = new Date()) => {
  const [y, m, d] = iso.split("-").map(Number);
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - a.getTime()) / 864e5);
};
export { daysUntil };

export function addDaysISO(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function firstName(h: Pick<Hire, "firstName" | "name">) {
  return (h.firstName || "").trim() || (h.name || "").trim().split(/\s+/)[0] || "";
}

const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th");
export function longDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  return `${t.toLocaleDateString("en-US", { weekday: "long" })}, ${t.toLocaleDateString("en-US", { month: "long" })} ${ord(d)}`;
}
export function shortDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short" })} ${ord(d)}`;
}

export type Flag = [string, "warn" | "info"];

/** Ready checks and flags (same rules as the Presidio Bay console). */
export function analyze(h: Partial<Hire>, s: OnboardingSettings) {
  const has = (k: keyof Hire) => h[k] !== undefined && String(h[k]).trim() !== "";
  const flags: Flag[] = [];
  const offer = (["name", "title", "managerName", "managerTitle", "payAmount", "startDate"] as (keyof Hire)[]).every(has);
  const agreement = offer && has("jd");
  const welcome = (["name", "startDate", "managerName", "personalEmail"] as (keyof Hire)[]).every(has);
  const firstDay = welcome && has("arrivalTime") && (has("location") || !!s.hqAddress);
  const amt = Number(h.payAmount);
  if (h.payType === "hourly" && h.exempt === "exempt") flags.push(["Hourly pay is marked exempt. Hourly roles are non-exempt.", "warn"]);
  if (h.payType === "salary" && h.exempt === "exempt" && amt && amt < CA_EXEMPT_MIN_2026)
    flags.push([`Salary is under California's 2026 exempt minimum of $${CA_EXEMPT_MIN_2026.toLocaleString()}. Check the rule for this state.`, "warn"]);
  if (h.payType === "hourly" && amt > 200) flags.push(["That hourly rate looks like an annual salary. Check the pay type.", "warn"]);
  if (h.payType === "salary" && amt && amt < 1000) flags.push(["That salary looks like an hourly rate. Check the pay type.", "warn"]);
  if (h.exempt === "nonexempt" && s.clockingSection) flags.push(["Non-exempt: the first-day email includes the clocking in and out section.", "info"]);
  if (has("startDate")) {
    const n = daysUntil(h.startDate!);
    if (n < 0) flags.push(["The start date has passed.", "info"]);
    else if (n < s.firstDayDaysBefore) flags.push([`Starts in ${n} day${n === 1 ? "" : "s"}. The first-day email is already due.`, "warn"]);
    else flags.push([`First-day email goes out ${new Date(addDaysISO(h.startDate!, -s.firstDayDaysBefore) + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.`, "info"]);
  }
  if (!has("personalEmail")) flags.push(["No personal email yet. The welcome and first-day emails need it.", "warn"]);
  if (!has("cell")) flags.push(["No cell phone yet. Add it as an action item for the welcome email if you need it.", "info"]);
  if (!has("jd") && has("title")) flags.push(["No job description yet. The agreement needs one.", "warn"]);
  return { offer, agreement, welcome, firstDay, flags };
}

export function stageIndex(s: Stage) {
  return Math.max(0, STAGES.indexOf(s));
}

/** Pay line for documents and the tracker. */
export function payLine(h: Partial<Hire>) {
  const a = Number(h.payAmount);
  if (!a) return "";
  return h.payType === "hourly" ? `$${a.toFixed(2)} per hour` : `$${a.toLocaleString("en-US")} per year`;
}

// ------------------------------------------------------------------ emails

export interface Brand {
  company: string;
  accent: string;
  bar?: string; // exact brand color for the top stripe (accent is the readable text version)
  logoUrl?: string; // only http(s) logos are used in email
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function frame(brand: Brand, inner: string) {
  const logo = brand.logoUrl && /^(https?:\/\/|data:image\/|\/)/.test(brand.logoUrl)
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.company)}" height="40" style="display:block;border:0;height:40px;width:auto">`
    : `<span style="font-family:Georgia,serif;font-size:22px;color:#1C1A19">${esc(brand.company)}</span>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EAE5DE">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAE5DE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td height="6" bgcolor="${brand.bar ?? brand.accent}" style="background:${brand.bar ?? brand.accent};height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:32px 40px 36px 40px">${logo}${inner.split("<!--HERO_END-->")[0]}</td></tr>
${inner.split("<!--HERO_END-->")[1] ?? ""}
<tr><td align="center" style="padding:18px 40px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B645E">${esc(brand.company)}</td></tr>
</table></td></tr></table></body></html>`;
}

const label = (t: string, color: string) => `<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${color}">${esc(t)}</p>`;
const section = (bg: string, html: string) => `<tr><td bgcolor="${bg}" style="background:${bg};padding:28px 40px;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#1C1A19">${html}</td></tr>`;
const big = (t: string) => `<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:44px;line-height:50px;color:#1C1A19">${t}</p>`;

function signoff(s: OnboardingSettings, accent: string, close: string) {
  return section(
    "#FFFFFF",
    `<p style="margin:0;font-family:Georgia,serif;font-size:26px;font-style:italic;line-height:32px">${esc(close)}</p>
<p style="margin:16px 0 0 0;font-family:Georgia,serif;font-size:19px">${esc(s.hrName)}</p>
<p style="margin:2px 0 16px 0;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6B645E">HR${s.hrPhone ? ` &middot; ${esc(s.hrPhone)}` : ""}</p>
<a href="mailto:${esc(s.hrEmail)}" style="display:inline-block;border:2px solid ${accent};padding:10px 20px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${accent};text-decoration:none">Email HR</a>`
  );
}

function numbered(items: [string, string][], accent: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:2px solid ${accent}">${items
    .map(
      ([when, what], i) =>
        `<tr><td width="36" valign="top" style="padding:14px 0;font-family:Georgia,serif;font-size:24px;color:${accent}">${i + 1}</td><td valign="top" style="padding:14px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;${i < items.length - 1 ? "border-bottom:1px solid #DDD5CA;" : ""}">${when ? `<span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B645E">${esc(when)}</span><br>` : ""}${what}</td></tr>`
    )
    .join("")}</table>`;
}

/** Welcome email: goes out once the offer is signed. */
export function welcomeEmail(h: Hire, s: OnboardingSettings, b: Brand) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const first = firstName(h);
  const mgr = (h.managerName || "").split(/\s+/)[0];
  const steps: [string, string][] = [
    ["In the next few business days", `<b>Watch for an email from ${esc(s.payroll)}</b> to start your onboarding. Check your spam folder too.`],
  ];
  if (s.orientation) steps.push(["Your first week", "<b>Join an HR orientation,</b> where we'll review important information, answer your questions, and help you settle in."]);
  const actions = (h.actionItems || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const w = wording("welcome", h, s, brand.company);
  const inner = `${label("Welcome aboard", "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
${big(`Welcome, <i>${esc(first)}.</i>`)}
<p style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441">Your first day at ${esc(brand.company)} is ${esc(longDate(h.startDate))}.</p><!--HERO_END-->
${section("#F4F1EC", paras(w.message))}
${section("#F4F1EC", label("What happens next", brand.accent) + numbered(steps, brand.accent))}
${actions.length ? section("#F4F1EC", label(actions.length === 1 ? "Action item" : "Action items", brand.accent) + `<ul style="margin:10px 0 0 0;padding-left:18px">${actions.map((a) => `<li style="margin:4px 0">${esc(a)}</li>`).join("")}</ul>`) : ""}
${section("#EFECE8", label("Good to know", "#6B645E") + `<p style="margin:12px 0 0 0">${esc(s.benefitsNote)}</p><p style="margin:10px 0 0 0">Before your start date, we'll send your first-day details${mgr ? `, and ${esc(mgr)} will reach out too` : ""}.</p>`)}
${signoff(s, brand.accent, w.closing)}`;
  return { subject: w.subject, html: frame(brand, inner), text: `${w.message.trim()}\n\nYour first day at ${brand.company} is ${longDate(h.startDate)}.\n\nIn the next few business days, watch for an email from ${s.payroll} to start your onboarding (check spam).${s.orientation ? "\nIn your first week, you'll join an HR orientation." : ""}${actions.length ? `\n\nAction items:\n${actions.map((a) => `- ${a}`).join("\n")}` : ""}\n\n${s.benefitsNote}\n\nQuestions? Reply or email ${s.hrEmail}.\n\n${w.closing}\n${s.hrName}` };
}

/** First-day email: goes out N days before the start date. */
export function firstDayEmail(h: Hire, s: OnboardingSettings, b: Brand) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const first = firstName(h);
  const where = (h.location || s.hqAddress || "").trim();
  const w = wording("firstDay", h, s, brand.company);
  const grid = (pairs: [string, string][]) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${brand.accent}">${[0, 2]
      .map((i) => `<tr>${pairs.slice(i, i + 2).map(([k, v]) => `<td width="50%" valign="top" style="padding:14px 10px 10px 0">${label(k, brand.accent)}<p style="margin:6px 0 0 0;font-family:Georgia,serif;font-size:19px;line-height:25px">${esc(v)}</p></td>`).join("")}</tr>`)
      .join("")}</table>`;
  const values = (s.values || "").split("\n").map((v) => v.trim()).filter(Boolean);
  const before: [string, string][] = [
    ["", `Find your ${esc(s.payroll)} invite in your personal email. Check spam.`],
    ["", `Complete Section 1 of your Form I-9 in ${esc(s.payroll)}.`],
    ["", "Gather your I-9 documents and bank info."],
  ];
  const clocking =
    h.exempt === "nonexempt" && s.clockingSection
      ? section("#F4F1EC", label("Clocking in and out", brand.accent) + `<ul style="margin:10px 0 0 0;padding-left:18px"><li>Clock in when you start work and out when you finish.</li><li>Take your unpaid 30-minute meal break before the end of your 5th hour of work.</li><li>Take a paid 10-minute rest break for every 4 hours worked.</li><li>Overtime must be approved in advance by your manager.</li><li>Missed a punch? Tell your manager the same day.</li></ul>`)
      : "";
  const inner = `${label("You start soon", "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
${big(`Welcome, <i>${esc(first)}.</i>`)}
<div style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441">${paras(w.message, "margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441")}</div><!--HERO_END-->
${section("#F4F1EC", grid([["Start date", longDate(h.startDate)], ["Arrive by", h.arrivalTime || s.defaultArrival], ["Where", where || "Your manager will confirm"], ["Ask for", h.managerName || "Your manager"]]))}
${s.leaderQuote ? section("#F4F1EC", `<p style="margin:0;font-family:Georgia,serif;font-size:22px;font-style:italic;line-height:30px">&ldquo;${esc(s.leaderQuote)}&rdquo;</p>${s.leaderNames ? `<p style="margin:8px 0 0 0;font-size:13px;color:#6B645E">${esc(s.leaderNames)}</p>` : ""}`) : ""}
${s.videoUrl ? section("#F4F1EC", `<a href="${esc(s.videoUrl)}" style="display:inline-block;border:2px solid ${brand.accent};padding:12px 20px;color:${brand.accent};text-decoration:none;font-weight:bold">Watch the welcome video</a>`) : ""}
${s.mission ? section("#EFECE8", label("Our mission", "#6B645E") + `<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:19px;line-height:27px">${esc(s.mission)}</p>`) : ""}
${values.length ? section("#EFECE8", label("What we stand for", "#6B645E") + `<p style="margin:10px 0 0 0;line-height:26px">${values.map((v, i) => `${String(i + 1).padStart(2, "0")}&nbsp;&nbsp;${esc(v)}`).join("<br>")}</p>`) : ""}
${section("#F4F1EC", label("Before day one", brand.accent) + numbered(before, brand.accent))}
${section("#F4F1EC", label("Bring on day one", brand.accent) + `<ul style="margin:10px 0 0 0;padding-left:18px"><li><b>Original ID.</b> Unexpired. No photocopies.</li><li><b>Bank details.</b> Account and routing number, or a voided check.</li><li><b>Emergency contact.</b> Name and phone number.</li></ul><p style="margin:10px 0 0 0;font-size:13px;color:#6B645E">${esc(s.idNote)}</p>`)}
${section("#F4F1EC", label("On day one", brand.accent) + `<ul style="margin:10px 0 0 0;padding-left:18px"><li>I-9 review with your manager and HR</li><li>${esc(s.payroll)} setup: direct deposit, emergency contact, tax forms</li><li>Handbook: review and acknowledge</li><li>Time off: ask your manager how to request it and who to tell when you're sick</li></ul>`)}
${section("#EFECE8", label("Don't miss this", "#6B645E") + `<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:20px">You have ${s.enrollDays} days to enroll in benefits.</p><p style="margin:6px 0 0 0">Make your elections within ${s.enrollDays} days of your start date.</p>`)}
${clocking}
${signoff(s, brand.accent, w.closing)}`;
  return {
    subject: w.subject,
    html: frame(brand, inner),
    text: `Hi ${first},\n\n${w.message.trim()}\n\nYour first day at ${brand.company} is ${longDate(h.startDate)}.\nArrive by: ${h.arrivalTime || s.defaultArrival}\nWhere: ${where}\nAsk for: ${h.managerName}\n\nBefore day one:\n- Find your ${s.payroll} invite (check spam)\n- Complete Section 1 of your I-9\n- Gather your I-9 documents and bank info\n\nBring: original unexpired ID, bank details, emergency contact.\n\nYou have ${s.enrollDays} days to enroll in benefits.\n\n${w.closing}\n${s.hrName}`,
  };
}

/** Signing request: "your offer is ready to review and sign". */
export function signRequestEmail(h: Pick<Hire, "name" | "firstName" | "title">, docTitle: string, link: string, s: OnboardingSettings, b: Brand, expires: string) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const first = firstName(h);
  const inner = `${label("Ready to sign", "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
${big(`${esc(first)}, it's <i>official.</i>`)}
<p style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441">Your ${esc(docTitle.toLowerCase())} from ${esc(brand.company)} is ready to review and sign.</p><!--HERO_END-->
${section("#F4F1EC", `<p style="margin:0 0 18px 0">Hi ${esc(first)},</p><p style="margin:0 0 22px 0">Open the link below to read your ${esc(docTitle.toLowerCase())}${h.title ? ` for the ${esc(h.title)} role` : ""} and sign it online. It takes about two minutes, and you'll get a signed PDF copy by email.</p>
<a href="${esc(link)}" style="display:inline-block;background:${brand.bar};padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;border-radius:4px">Review and sign</a>
<p style="margin:22px 0 0 0;font-size:13px;color:#6B645E">This link is just for you. It expires ${esc(longDate(expires))}. Questions about the offer? Reply to ${esc(s.hrEmail)}.</p>`)}
${signoff(s, brand.accent, "We hope you'll join us.")}`;
  return {
    subject: `Your ${docTitle.toLowerCase()} from ${brand.company}`,
    html: frame(brand, inner),
    text: `Hi ${first},\n\nYour ${docTitle.toLowerCase()} from ${brand.company} is ready to review and sign:\n${link}\n\nIt takes about two minutes, and you'll get a signed PDF copy by email. The link expires ${longDate(expires)}.\n\nQuestions? Email ${s.hrEmail}.\n\n${s.hrName}`,
  };
}

/** Sent with the signed PDF attached. */
export function signedCopyEmail(h: Pick<Hire, "name" | "firstName">, docTitle: string, s: OnboardingSettings, b: Brand) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const first = firstName(h);
  const inner = `${label("Signed", "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
${big(`Thank you, <i>${esc(first)}.</i>`)}
<p style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441">Your signed ${esc(docTitle.toLowerCase())} is attached for your records.</p><!--HERO_END-->
${signoff(s, brand.accent, "We're so glad you're joining us.")}`;
  return { subject: `Signed: your ${docTitle.toLowerCase()} from ${brand.company}`, html: frame(brand, inner), text: `Hi ${first},\n\nThank you for signing. Your signed ${docTitle.toLowerCase()} is attached for your records.\n\n${s.hrName}` };
}

/** A short branded note (used for candidate confirmations). Paragraphs are plain text. */
export function noticeEmail(b: Brand, kicker: string, headlineHtml: string, paragraphs: string[]) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const inner = `${label(kicker, "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
${big(headlineHtml.replace(/<(?!\/?i>)[^>]*>/g, ""))}<!--HERO_END-->
${section("#F4F1EC", paragraphs.map((p) => `<p style="margin:0 0 12px 0">${esc(p)}</p>`).join(""))}`;
  return { html: frame(brand, inner), text: paragraphs.join("\n\n") };
}
