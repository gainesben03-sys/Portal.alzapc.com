// New hire emails built from blocks: text, checklists, numbered steps, a details card, buttons,
// callouts, and "smart" sections filled in from the hire (first-day details, action items...).
// The welcome and first-day emails are templates like any other, and admins can add more,
// each with its own timing and CC list. Pure functions: used by the browser, the API and the daily job.
import type { Brand, Hire, OnboardingSettings } from "./hires";
import { esc, firstName, frameEmail, labelHtml, longDate, sectionHtml, shortDate, signoffHtml, addDaysISO } from "./hires";
import { readableInk } from "./brand";

export type AutoKey = "dayOne" | "actionItems" | "leaderQuote" | "video" | "mission" | "values" | "clocking";
export type Block =
  | { id: string; type: "text"; title?: string; text: string }
  | { id: string; type: "checklist"; title?: string; items: string[] }
  | { id: string; type: "steps"; title?: string; items: string[] }
  | { id: string; type: "details"; title?: string; rows: { label: string; value: string }[] }
  | { id: string; type: "callout"; title?: string; text: string }
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "divider" }
  | { id: string; type: "auto"; key: AutoKey };
export type BlockType = Block["type"];

export type When = { anchor: "signed"; days: number } | { anchor: "start"; days: number } | { anchor: "manual" };

export interface OnboardEmail {
  id: string; // "welcome", "firstDay", or a generated id
  name: string; // shown in the portal
  on: boolean;
  when: When;
  subject: string;
  kicker: string; // small line above the headline
  headline: string;
  intro: string;
  blocks: Block[];
  closing: string;
  cc: string[]; // extra addresses
  ccManager?: boolean;
  ccHr?: boolean;
}

export const AUTO_INFO: Record<AutoKey, { name: string; hint: string }> = {
  dayOne: { name: "First-day details", hint: "Start date, arrival time, where to go and who to ask for. Filled in from the hire." },
  actionItems: { name: "Action items", hint: "Anything you add on the hire page for this person. Hidden when there are none." },
  leaderQuote: { name: "Leader quote", hint: "From onboarding settings. Hidden when there isn't one." },
  video: { name: "Welcome video", hint: "A button to the welcome video in onboarding settings." },
  mission: { name: "Mission", hint: "From onboarding settings." },
  values: { name: "Values", hint: "From onboarding settings." },
  clocking: { name: "Clocking in and out", hint: "Meal and rest break rules. Only for non-exempt hires." },
};
export const BLOCK_NAME: Record<Exclude<BlockType, "auto">, string> = {
  text: "Text",
  checklist: "Checklist",
  steps: "Numbered steps",
  details: "Details card",
  callout: "Highlight box",
  button: "Button",
  divider: "Divider",
};

export const FILL = ["{first name}", "{full name}", "{job title}", "{manager}", "{company}", "{start date}", "{arrival time}", "{location}", "{HR name}", "{HR email}", "{payroll}", "{enroll days}", "{benefits note}"] as const;

const bid = () => `b${Math.random().toString(36).slice(2, 8)}`;
export const newEmailId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ---------------------------------------------------------------- the built-in emails, as blocks

export function builtInWelcome(s: Pick<OnboardingSettings, "orientation" | "emailTemplates">): OnboardEmail {
  const t = s.emailTemplates?.welcome ?? {};
  const steps = ["**Watch for an email from {payroll}** to start your onboarding. Check your spam folder too."];
  if (s.orientation) steps.push("**Join an HR orientation in your first week,** where we'll review important information, answer your questions, and help you settle in.");
  return {
    id: "welcome",
    name: "Welcome email",
    on: true,
    when: { anchor: "signed", days: 0 },
    subject: t.subject?.trim() || "Welcome to {company}, {first name}!",
    kicker: "Welcome aboard",
    headline: "Welcome, {first name}.",
    intro: "Your first day at {company} is {start date}.",
    blocks: [
      { id: "msg", type: "text", text: t.message?.trim() || "Hi {first name},\n\nI'm {HR name}, and I'm part of the HR team. We're excited to have you joining us and look forward to welcoming you on your first day.\n\nYour manager, {manager}, is looking forward to working with you. Here's what happens between now and then." },
      { id: "next", type: "steps", title: "What happens next", items: steps },
      { id: "acts", type: "auto", key: "actionItems" },
      { id: "know", type: "callout", title: "Good to know", text: "{benefits note}\n\nBefore your start date, we'll send your first-day details, and {manager} will reach out too." },
    ],
    closing: t.closing?.trim() || "We're excited to have you on the team.",
    cc: [],
  };
}

export function builtInFirstDay(s: Pick<OnboardingSettings, "firstDayDaysBefore" | "emailTemplates" | "idNote">): OnboardEmail {
  const t = s.emailTemplates?.firstDay ?? {};
  return {
    id: "firstDay",
    name: "First-day email",
    on: true,
    when: { anchor: "start", days: -(s.firstDayDaysBefore || 7) },
    subject: t.subject?.trim() || "Your first day at {company}: {start date}",
    kicker: "You start soon",
    headline: "Welcome, {first name}.",
    intro: t.message?.trim() || "We're so glad you're joining us. Here's everything you need for a great first day.",
    blocks: [
      { id: "day", type: "auto", key: "dayOne" },
      { id: "quote", type: "auto", key: "leaderQuote" },
      { id: "video", type: "auto", key: "video" },
      { id: "mission", type: "auto", key: "mission" },
      { id: "values", type: "auto", key: "values" },
      { id: "before", type: "checklist", title: "Before day one", items: ["Find your {payroll} invite in your personal email. Check spam.", "Complete Section 1 of your Form I-9 in {payroll}.", "Gather your I-9 documents and bank info."] },
      { id: "bring", type: "checklist", title: "Bring on day one", items: [`**Original ID.** Unexpired, no photocopies. ${s.idNote}`.trim(), "**Bank details.** Account and routing number, or a voided check.", "**Emergency contact.** Name and phone number."] },
      { id: "on", type: "steps", title: "On day one", items: ["I-9 review with your manager and HR", "{payroll} setup: direct deposit, emergency contact, tax forms", "Handbook: review and acknowledge", "Time off: ask your manager how to request it and who to tell when you're sick"] },
      { id: "ben", type: "callout", title: "Don't miss this", text: "**You have {enroll days} days to enroll in benefits.** Make your elections within {enroll days} days of your start date." },
      { id: "clock", type: "auto", key: "clocking" },
    ],
    closing: t.closing?.trim() || "See you soon.",
    cc: [],
  };
}

/** Starter for a new email an admin adds. */
export function blankEmail(): OnboardEmail {
  return {
    id: newEmailId(),
    name: "New email",
    on: true,
    when: { anchor: "start", days: 7 },
    subject: "Checking in on your first week, {first name}",
    kicker: "{company}",
    headline: "How's it going, {first name}?",
    intro: "",
    blocks: [{ id: bid(), type: "text", text: "Hi {first name},\n\nWrite your message here." }],
    closing: "Glad you're here.",
    cc: [],
  };
}

export function newBlock(type: Exclude<BlockType, "auto">): Block {
  const id = bid();
  if (type === "text") return { id, type, text: "" };
  if (type === "checklist") return { id, type, title: "Checklist", items: [""] };
  if (type === "steps") return { id, type, title: "Next steps", items: [""] };
  if (type === "details") return { id, type, title: "Details", rows: [{ label: "", value: "" }] };
  if (type === "callout") return { id, type, title: "Good to know", text: "" };
  if (type === "button") return { id, type, label: "Open", url: "https://" };
  return { id, type: "divider" };
}

/** Every email for this account: the saved list, or the built-ins (with any older wording edits). */
export function emailsFor(s: OnboardingSettings): OnboardEmail[] {
  if (s.emails?.length) return s.emails;
  return [builtInWelcome(s), builtInFirstDay(s)];
}

/** The email as this hire will get it: their own edited copy, else the account's. */
export function emailForHire(id: string, h: Hire, s: OnboardingSettings): OnboardEmail | null {
  const own = h.emailCustom?.[id];
  if (own) return own;
  const base = emailsFor(s).find((e) => e.id === id);
  if (!base) return null;
  // older per-hire wording edits on the two built-in emails
  const old = id === "welcome" || id === "firstDay" ? h.emailEdits?.[id] : undefined;
  if (!old || (!old.subject && !old.message && !old.closing)) return base;
  const out: OnboardEmail = { ...base, subject: old.subject?.trim() || base.subject, closing: old.closing?.trim() || base.closing };
  if (old.message?.trim()) {
    if (id === "firstDay") out.intro = old.message.trim();
    else out.blocks = base.blocks.map((b) => (b.id === "msg" && b.type === "text" ? { ...b, text: old.message!.trim() } : b));
  }
  return out;
}

// ---------------------------------------------------------------- timing

export function whenLabel(w: When, firstDayDefault = 7) {
  if (w.anchor === "manual") return "Only when you send it";
  if (w.anchor === "signed") return w.days > 0 ? `${w.days} day${w.days === 1 ? "" : "s"} after the offer is signed` : "When the offer is signed";
  if (w.days === 0) return "On the start date";
  const n = Math.abs(w.days || firstDayDefault);
  return w.days < 0 ? `${n} day${n === 1 ? "" : "s"} before the start date` : `${n} day${n === 1 ? "" : "s"} after the start date`;
}

/** When the offer was signed: stored, or found in the hire's history. */
export function signedOn(h: Pick<Hire, "history" | "createdAt"> & { signedAt?: string }): string {
  const at = h.signedAt ?? [...(h.history ?? [])].reverse().find((x) => /^Offer signed/i.test(x.text))?.at ?? h.createdAt;
  return (at || new Date().toISOString()).slice(0, 10);
}

/** The day this email is due for this hire, or null for manual-only emails. */
export function dueOn(e: OnboardEmail, h: Pick<Hire, "startDate" | "history" | "createdAt"> & { signedAt?: string }): string | null {
  if (e.when.anchor === "manual" || !h.startDate) return null;
  if (e.when.anchor === "signed") return addDaysISO(signedOn(h), Math.max(0, e.when.days || 0));
  return addDaysISO(h.startDate, e.when.days || 0);
}

// ---------------------------------------------------------------- rendering

type Ctx = { h: Hire; s: OnboardingSettings; company: string };

function fill(t: string, c: Ctx, short = false): string {
  const mgr = (c.h.managerName || "").split(/\s+/)[0];
  let out = String(t ?? "");
  if (!mgr) out = out.replace(/[^.!?\n]*\{manager\}[^.!?\n]*[.!?]\s*/gi, "");
  const where = (c.h.location || c.s.hqAddress || "").trim();
  return out
    .replace(/\{first name\}/gi, firstName(c.h))
    .replace(/\{full name\}/gi, c.h.name || "")
    .replace(/\{job title\}/gi, c.h.title || "")
    .replace(/\{manager\}/gi, mgr)
    .replace(/\{company\}/gi, c.company)
    .replace(/\{start date\}/gi, c.h.startDate ? (short ? shortDate(c.h.startDate) : longDate(c.h.startDate)) : "your start date")
    .replace(/\{arrival time\}/gi, c.h.arrivalTime || c.s.defaultArrival)
    .replace(/\{location\}/gi, where || "the office")
    .replace(/\{HR name\}/gi, c.s.hrName)
    .replace(/\{HR email\}/gi, c.s.hrEmail)
    .replace(/\{payroll\}/gi, c.s.payroll)
    .replace(/\{enroll days\}/gi, String(c.s.enrollDays))
    .replace(/\{benefits note\}/gi, c.s.benefitsNote);
}

/** Escape, then allow **bold**, links and line breaks. */
function rich(t: string, accent: string) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color:${accent}">$1</a>`)
    .replace(/\n/g, "<br>");
}
function paras(t: string, accent: string, style = "margin:0 0 14px 0") {
  const ps = t.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return ps.map((p, i) => `<p style="${i === ps.length - 1 ? style.replace(/margin:[^;]+/, "margin:0") : style}">${rich(p, accent)}</p>`).join("");
}
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1");

function blockHtml(b: Block, c: Ctx, accent: string): { html: string; text: string } {
  const F = (t: string) => fill(t, c);
  const title = (t?: string, color = accent) => (t?.trim() ? labelHtml(F(t), color) : "");
  const gap = (t?: string) => (t?.trim() ? "margin-top:10px;" : "");
  switch (b.type) {
    case "text": {
      const t = F(b.text);
      if (!t.trim() && !b.title) return { html: "", text: "" };
      return { html: sectionHtml("#F4F1EC", title(b.title) + `<div style="${gap(b.title)}">${paras(t, accent)}</div>`), text: `${b.title ? `${F(b.title).toUpperCase()}\n` : ""}${plain(t)}` };
    }
    case "checklist":
    case "steps": {
      const items = b.items.map(F).filter((x) => x.trim());
      if (!items.length) return { html: "", text: "" };
      const rows = items
        .map((it, i) => {
          const mark =
            b.type === "checklist"
              ? `<td width="30" valign="top" style="padding:13px 0 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="16" height="16" style="width:16px;height:16px;border:2px solid ${accent};border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`
              : `<td width="36" valign="top" style="padding:12px 0;font-family:Georgia,serif;font-size:24px;line-height:24px;color:${accent}">${i + 1}</td>`;
          return `<tr>${mark}<td valign="top" style="padding:12px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;${i < items.length - 1 ? "border-bottom:1px solid #DDD5CA;" : ""}">${rich(it, accent)}</td></tr>`;
        })
        .join("");
      return {
        html: sectionHtml("#F4F1EC", title(b.title) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:2px solid ${accent}">${rows}</table>`),
        text: `${b.title ? `${F(b.title).toUpperCase()}\n` : ""}${items.map((x, i) => `${b.type === "checklist" ? "[ ]" : `${i + 1}.`} ${plain(x)}`).join("\n")}`,
      };
    }
    case "details": {
      const rows = b.rows.map((r) => ({ label: F(r.label), value: F(r.value) })).filter((r) => r.label.trim() || r.value.trim());
      if (!rows.length) return { html: "", text: "" };
      return { html: sectionHtml("#F4F1EC", title(b.title) + detailsGrid(rows, accent, !!b.title?.trim())), text: `${b.title ? `${F(b.title).toUpperCase()}\n` : ""}${rows.map((r) => `${r.label}: ${r.value}`).join("\n")}` };
    }
    case "callout": {
      const t = F(b.text);
      if (!t.trim()) return { html: "", text: "" };
      return {
        html: sectionHtml("#EFECE8", title(b.title, "#6B645E") + `<div style="${gap(b.title)}font-family:Georgia,serif;font-size:19px;line-height:27px">${paras(t, accent, "margin:0 0 10px 0")}</div>`),
        text: `${b.title ? `${F(b.title).toUpperCase()}\n` : ""}${plain(t)}`,
      };
    }
    case "button": {
      const url = F(b.url).trim();
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) return { html: "", text: "" };
      return { html: sectionHtml("#F4F1EC", `<a href="${esc(url)}" style="display:inline-block;background:${accent};padding:13px 22px;border-radius:4px;color:#FFFFFF;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px">${esc(F(b.label) || "Open")}</a>`), text: `${F(b.label)}: ${url}` };
    }
    case "divider":
      return { html: sectionHtml("#F4F1EC", `<div style="border-top:1px solid #DDD5CA;font-size:0;line-height:0">&nbsp;</div>`), text: "" };
    case "auto":
      return autoHtml(b.key, c, accent);
  }
}

function detailsGrid(rows: { label: string; value: string }[], accent: string, titled: boolean) {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    out.push(`<tr>${rows.slice(i, i + 2).map((r) => `<td width="50%" valign="top" style="padding:14px 10px 10px 0">${labelHtml(r.label, accent)}<p style="margin:6px 0 0 0;font-family:Georgia,serif;font-size:19px;line-height:25px">${esc(r.value)}</p></td>`).join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${titled ? "margin-top:10px;" : ""}border-top:2px solid ${accent}">${out.join("")}</table>`;
}

function autoHtml(key: AutoKey, c: Ctx, accent: string): { html: string; text: string } {
  const { h, s } = c;
  if (key === "dayOne") {
    const where = (h.location || s.hqAddress || "").trim() || "Your manager will confirm";
    const rows = [
      { label: "Start date", value: h.startDate ? longDate(h.startDate) : "To be confirmed" },
      { label: "Arrive by", value: h.arrivalTime || s.defaultArrival },
      { label: "Where", value: where },
      { label: "Ask for", value: h.managerName || "Your manager" },
    ];
    return { html: sectionHtml("#F4F1EC", detailsGrid(rows, accent, false)), text: rows.map((r) => `${r.label}: ${r.value}`).join("\n") };
  }
  if (key === "actionItems") {
    const items = (h.actionItems || "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (!items.length) return { html: "", text: "" };
    return blockHtml({ id: "ai", type: "checklist", title: items.length === 1 ? "Action item" : "Action items", items }, c, accent);
  }
  if (key === "leaderQuote") {
    if (!s.leaderQuote) return { html: "", text: "" };
    return { html: sectionHtml("#F4F1EC", `<p style="margin:0;font-family:Georgia,serif;font-size:22px;font-style:italic;line-height:30px">&ldquo;${esc(s.leaderQuote)}&rdquo;</p>${s.leaderNames ? `<p style="margin:8px 0 0 0;font-size:13px;color:#6B645E">${esc(s.leaderNames)}</p>` : ""}`), text: `"${s.leaderQuote}"${s.leaderNames ? ` ${s.leaderNames}` : ""}` };
  }
  if (key === "video") {
    if (!s.videoUrl) return { html: "", text: "" };
    return { html: sectionHtml("#F4F1EC", `<a href="${esc(s.videoUrl)}" style="display:inline-block;border:2px solid ${accent};padding:12px 20px;color:${accent};text-decoration:none;font-weight:bold">Watch the welcome video</a>`), text: `Welcome video: ${s.videoUrl}` };
  }
  if (key === "mission") {
    if (!s.mission) return { html: "", text: "" };
    return { html: sectionHtml("#EFECE8", labelHtml("Our mission", "#6B645E") + `<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:19px;line-height:27px">${esc(s.mission)}</p>`), text: `Our mission: ${s.mission}` };
  }
  if (key === "values") {
    const values = (s.values || "").split("\n").map((v) => v.trim()).filter(Boolean);
    if (!values.length) return { html: "", text: "" };
    return { html: sectionHtml("#EFECE8", labelHtml("What we stand for", "#6B645E") + `<p style="margin:10px 0 0 0;line-height:26px">${values.map((v, i) => `${String(i + 1).padStart(2, "0")}&nbsp;&nbsp;${esc(v)}`).join("<br>")}</p>`), text: `What we stand for:\n${values.join("\n")}` };
  }
  // clocking
  if (h.exempt !== "nonexempt" || !s.clockingSection) return { html: "", text: "" };
  return blockHtml({ id: "clk", type: "checklist", title: "Clocking in and out", items: ["Clock in when you start work and out when you finish.", "Take your unpaid 30-minute meal break before the end of your 5th hour of work.", "Take a paid 10-minute rest break for every 4 hours worked.", "Overtime must be approved in advance by your manager.", "Missed a punch? Tell your manager the same day."] }, c, accent);
}

/** The finished email for one hire. */
export function renderOnboard(e: OnboardEmail, h: Hire, s: OnboardingSettings, b: Brand): { subject: string; html: string; text: string } {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const c: Ctx = { h, s, company: brand.company };
  const F = (t: string) => fill(t, c);
  // the hire's first name in italics in the headline, the house style
  const headline = esc(F(e.headline.replace(/\{first name\}/gi, "\u0001"))).replace(/\u0001/g, `<i>${esc(firstName(h))}</i>`);
  const intro = F(e.intro);
  const parts = e.blocks.map((x) => blockHtml(x, c, brand.accent));
  const inner = `${e.kicker.trim() ? labelHtml(F(e.kicker), "#6B645E").replace("margin:0", "margin:40px 0 0 0") : ""}
<p style="margin:${e.kicker.trim() ? "10px" : "40px"} 0 0 0;font-family:Georgia,serif;font-size:44px;line-height:50px;color:#1C1A19">${headline}</p>
${intro.trim() ? `<div style="margin:14px 0 0 0">${paras(intro, brand.accent, "margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#4A4441")}</div>` : ""}<!--HERO_END-->
${parts.map((p) => p.html).join("\n")}
${signoffHtml(s, brand.accent, F(e.closing))}`;
  const text = [`${plain(F(e.headline))}`, plain(intro), ...parts.map((p) => p.text), `${F(e.closing)}\n${s.hrName}\n${s.hrEmail}`].filter((x) => x.trim()).join("\n\n");
  return { subject: fill(e.subject, c, true).replace(/\s+/g, " ").trim() || `${brand.company}`, html: frameEmail(brand, inner), text };
}

// ---------------------------------------------------------------- safety for anything saved or sent from the browser

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, n) : "");
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;
export const cleanCc = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)).map((x) => String(x).trim().toLowerCase()).filter((x) => EMAIL.test(x)).slice(0, 10);
const AUTO: AutoKey[] = ["dayOne", "actionItems", "leaderQuote", "video", "mission", "values", "clocking"];

export function cleanBlock(x: unknown): Block | null {
  const b = (x ?? {}) as Record<string, unknown>;
  const id = str(b.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || bid();
  const title = str(b.title, 120) || undefined;
  const list = (v: unknown, n = 30) => (Array.isArray(v) ? v.map((i) => str(i, 400)).slice(0, n) : []);
  switch (b.type) {
    case "text":
      return { id, type: "text", title, text: str(b.text, 6000) };
    case "checklist":
    case "steps":
      return { id, type: b.type, title, items: list(b.items) };
    case "details":
      return { id, type: "details", title, rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, 12).map((r: Record<string, unknown>) => ({ label: str(r?.label, 60), value: str(r?.value, 200) })) };
    case "callout":
      return { id, type: "callout", title, text: str(b.text, 2000) };
    case "button": {
      const url = str(b.url, 600).trim();
      return { id, type: "button", label: str(b.label, 60), url: /^https:\/\//i.test(url) || url.includes("{") ? url : "" };
    }
    case "divider":
      return { id, type: "divider" };
    case "auto":
      return AUTO.includes(b.key as AutoKey) ? { id, type: "auto", key: b.key as AutoKey } : null;
  }
  return null;
}

export function cleanEmail(x: unknown): OnboardEmail | null {
  const e = (x ?? {}) as Record<string, unknown>;
  const id = str(e.id, 30).replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) return null;
  const w = (e.when ?? {}) as Record<string, unknown>;
  const days = Math.max(-90, Math.min(365, Math.round(Number(w.days) || 0)));
  const when: When = w.anchor === "manual" ? { anchor: "manual" } : w.anchor === "signed" ? { anchor: "signed", days: Math.max(0, days) } : { anchor: "start", days };
  return {
    id,
    name: str(e.name, 60) || "Email",
    on: e.on !== false,
    when,
    subject: str(e.subject, 200),
    kicker: str(e.kicker, 80),
    headline: str(e.headline, 120),
    intro: str(e.intro, 2000),
    blocks: (Array.isArray(e.blocks) ? e.blocks : []).slice(0, 40).map(cleanBlock).filter((b): b is Block => !!b),
    closing: str(e.closing, 200),
    cc: cleanCc(e.cc),
    ccManager: !!e.ccManager,
    ccHr: !!e.ccHr,
  };
}

export const shortWhen = (e: OnboardEmail, h: Pick<Hire, "startDate" | "history" | "createdAt">) => {
  const d = dueOn(e, h);
  return d ? shortDate(d) : null;
};
