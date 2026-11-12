// Offboarding: when someone resigns or is let go. A checklist, a goodbye email with what they need
// to know (and an optional exit survey), and they come off the team roster on their last day.
// Tracks steps and dates; it doesn't decide anything legal. Pure functions for the browser, API and daily job.
import type { Brand, OnboardingSettings } from "./hires";
import { esc, frameEmail, labelHtml, longDate, sectionHtml, signoffHtml, addDaysISO } from "./hires";
import { readableInk } from "./brand";

export type LeaveType = "resignation" | "termination" | "layoff" | "contract_end" | "retirement";
export const TYPE_LABEL: Record<LeaveType, string> = { resignation: "Resignation", termination: "Termination", layoff: "Layoff", contract_end: "End of contract", retirement: "Retirement" };
export const VOLUNTARY: LeaveType[] = ["resignation", "retirement"];

export interface DepartureTask { id: string; title: string; hint?: string; due?: string; done: boolean; doneAt?: string; doneBy?: string; group: "before" | "lastDay" | "after" }

export interface SurveyAnswer { q: string; a: string }

export interface Departure {
  id: string;
  clientId: string;
  status: "planned" | "departed" | "cancelled";
  personId?: string; // roster entry
  name: string;
  title?: string;
  department?: string;
  managerName?: string;
  type: LeaveType;
  noticeDate?: string; // when they gave notice / were told
  lastDay: string; // yyyy-mm-dd
  personalEmail?: string; // for the goodbye email, which arrives after work access ends
  workEmail?: string;
  rehire?: "yes" | "no" | "unsure";
  reason?: string; // private: Ben and executives only
  tasks: DepartureTask[];
  email: { auto: boolean; sentAt?: string; to?: string; extra?: string }; // extra: a personal note just for them
  survey?: { token: string; sentAt?: string; doneAt?: string; answers?: SurveyAnswer[] };
  rosterRemovedAt?: string;
  notes: { at: string; by: string; text: string }[];
  history: { at: string; by: string; text: string }[];
  createdAt: string;
  createdBy: string;
}

export interface InfoSection { id: string; title: string; text: string } // lines starting with "- " become a checklist
export interface OffboardSettings {
  thanks: string; // the opening message
  sections: InfoSection[];
  survey: boolean;
  sendDaysBefore: number; // goodbye email timing: 0 = on the last day
  autoSend: boolean;
  closing: string;
  extraTasks?: string[]; // the client's own checklist items
}

export const DEFAULT_OFFBOARD: OffboardSettings = {
  thanks: "Hi {first name},\n\nThank you for your time and work at {company}. We're grateful for everything you've contributed, and we wish you the very best in what comes next.\n\nHere's what you need to know as you wrap up. Your last day is {last day}.",
  sections: [
    { id: "pay", title: "Your final paycheck", text: "Your final pay, including any earned and unused vacation or PTO, will be paid as required by law. If you have direct deposit, it goes to the same account." },
    { id: "benefits", title: "Benefits", text: "Your health coverage information, including any options to continue coverage (COBRA), will be mailed to your home address. Watch for it in the next few weeks." },
    { id: "return", title: "Before you go", text: "- Return your laptop, keys, badge and any other company property\n- Save any personal files from your work devices\n- Make sure we have your current mailing address for your W-2" },
  ],
  survey: true,
  sendDaysBefore: 2,
  autoSend: true,
  closing: "Thank you, and keep in touch.",
};
export const offboardFor = (s?: Partial<OffboardSettings>): OffboardSettings => ({ ...DEFAULT_OFFBOARD, ...(s ?? {}), sections: s?.sections ?? DEFAULT_OFFBOARD.sections });

const tid = () => `t${Math.random().toString(36).slice(2, 8)}`;

/** The starting checklist. California items are reminders to check, not legal advice. */
export function tasksFor(d: Pick<Departure, "type" | "lastDay" | "noticeDate">, payroll: string, extra: string[] = []): DepartureTask[] {
  const vol = VOLUNTARY.includes(d.type);
  const t = (title: string, group: DepartureTask["group"], due: string, hint?: string): DepartureTask => ({ id: tid(), title, group, due, hint, done: false });
  const before = addDaysISO(d.lastDay, -2);
  return [
    t(vol ? "Get the resignation in writing (an email is fine)" : "Document the decision and the last day in writing", "before", d.noticeDate && d.noticeDate < before ? d.noticeDate : before),
    t(`Tell payroll (${payroll}) the last day`, "before", before),
    t("Plan the final paycheck, with accrued unused vacation or PTO", "before", before, vol ? "California: due on the last day if they gave 72+ hours' notice, otherwise within 72 hours of quitting." : "California: due at the time of termination or layoff, on the last day."),
    t("Plan the work handoff and who takes over their accounts", "before", before),
    t("Collect company property: laptop, phone, keys, badge, cards", "lastDay", d.lastDay),
    t("Turn off system access: email, software, building", "lastDay", d.lastDay, "Set up email forwarding or an auto-reply if needed."),
    ...(vol ? [] : [t('Give the EDD "For Your Benefit" pamphlet (DE 2320)', "lastDay", d.lastDay, "California: required when someone is discharged or laid off.")]),
    t("Give written notice of the change in employment status", "lastDay", d.lastDay, "California: required at separation. Include the date it takes effect."),
    t("Send the COBRA / Cal-COBRA and HIPP notices (or confirm the benefits provider does)", "after", addDaysISO(d.lastDay, 14)),
    t("Remove them from the portal and shared drives", "after", addDaysISO(d.lastDay, 1)),
    t("Review the exit survey", "after", addDaysISO(d.lastDay, 7)),
    ...extra.filter((x) => x.trim()).map((x) => t(x.trim(), "before" as const, before)),
  ];
}

export const SURVEY: { id: string; q: string; kind: "scale" | "text" | "choice"; options?: string[] }[] = [
  { id: "overall", q: "Overall, how was your experience working here?", kind: "scale" },
  { id: "manager", q: "How supported did you feel by your manager?", kind: "scale" },
  { id: "why", q: "What's the main reason you're leaving?", kind: "choice", options: ["A new opportunity", "Pay or benefits", "My manager", "Growth or career path", "Workload or schedule", "Personal or family reasons", "Moving away", "Something else", "Prefer not to say"] },
  { id: "best", q: "What did you like most about working here?", kind: "text" },
  { id: "change", q: "What's one thing we should change?", kind: "text" },
  { id: "recommend", q: "Would you recommend us as a place to work?", kind: "choice", options: ["Yes", "Maybe", "No"] },
  { id: "else", q: "Anything else you'd like to share?", kind: "text" },
];

// ---------------------------------------------------------------- email

const first = (name: string) => (name || "").trim().split(/\s+/)[0] || "there";

function rich(t: string, accent: string) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color:${accent}">$1</a>`).replace(/\n/g, "<br>");
}
function paras(t: string, accent: string) {
  const ps = t.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return ps.map((p, i) => `<p style="margin:${i === ps.length - 1 ? "0" : "0 0 14px 0"}">${rich(p, accent)}</p>`).join("");
}

export function goodbyeEmail(d: Departure, o: OffboardSettings, s: OnboardingSettings, b: Brand, surveyUrl?: string) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  const F = (t: string) => t.replace(/\{first name\}/gi, first(d.name)).replace(/\{company\}/gi, brand.company).replace(/\{last day\}/gi, longDate(d.lastDay)).replace(/\{HR name\}/gi, s.hrName).replace(/\{HR email\}/gi, s.hrEmail);
  const sec = (x: InfoSection) => {
    const lines = F(x.text).split("\n");
    const items = lines.filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, ""));
    const prose = lines.filter((l) => !/^\s*-\s+/.test(l)).join("\n").trim();
    const list = items.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:2px solid ${brand.accent}">${items
          .map((it, i) => `<tr><td width="30" valign="top" style="padding:13px 0 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="16" height="16" style="width:16px;height:16px;border:2px solid ${brand.accent};border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table></td><td valign="top" style="padding:12px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;${i < items.length - 1 ? "border-bottom:1px solid #DDD5CA;" : ""}">${rich(it, brand.accent)}</td></tr>`)
          .join("")}</table>`
      : "";
    return sectionHtml("#F4F1EC", (x.title.trim() ? labelHtml(F(x.title), brand.accent) : "") + (prose ? `<div style="margin-top:10px">${paras(prose, brand.accent)}</div>` : "") + list);
  };
  const note = (d.email.extra ?? "").trim();
  const inner = `${labelHtml("Thank you", "#6B645E").replace("margin:0", "margin:40px 0 0 0")}
<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:40px;line-height:46px;color:#1C1A19">Thank you, <i>${esc(first(d.name))}.</i></p><!--HERO_END-->
${sectionHtml("#F4F1EC", paras(F(o.thanks), brand.accent))}
${note ? sectionHtml("#F4F1EC", paras(note, brand.accent)) : ""}
${o.sections.map(sec).join("\n")}
${surveyUrl ? sectionHtml("#EFECE8", labelHtml("Two minutes, if you have them", "#6B645E") + `<p style="margin:10px 0 14px 0;font-family:Georgia,serif;font-size:19px;line-height:27px">We'd value your honest feedback about working here. It goes to HR and helps us do better.</p><a href="${esc(surveyUrl)}" style="display:inline-block;background:${brand.accent};padding:13px 22px;border-radius:4px;color:#FFFFFF;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px">Take the exit survey</a>`) : ""}
${signoffHtml(s, brand.accent, F(o.closing))}`;
  const text = [
    F(o.thanks),
    note,
    ...o.sections.map((x) => `${F(x.title).toUpperCase()}\n${F(x.text)}`),
    surveyUrl ? `Exit survey (2 minutes): ${surveyUrl}` : "",
    `${F(o.closing)}\n${s.hrName}\n${s.hrEmail}`,
  ].filter((x) => x.trim()).join("\n\n");
  return { subject: `Thank you, ${first(d.name)}`, html: frameEmail(brand, inner), text };
}

/** The day the goodbye email goes out on its own. */
export const sendOn = (d: Pick<Departure, "lastDay">, o: Pick<OffboardSettings, "sendDaysBefore">) => addDaysISO(d.lastDay, -Math.max(0, o.sendDaysBefore || 0));

export const newToken = () => Array.from({ length: 32 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 55)]).join("");

// ---------------------------------------------------------------- safety for settings saved from the browser
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, n) : "");
export function cleanOffboard(x: unknown): OffboardSettings {
  const o = (x ?? {}) as Record<string, unknown>;
  return {
    thanks: str(o.thanks, 3000) || DEFAULT_OFFBOARD.thanks,
    sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 12).map((s: Record<string, unknown>, i: number) => ({ id: str(s?.id, 20).replace(/[^A-Za-z0-9_-]/g, "") || `s${i}`, title: str(s?.title, 80), text: str(s?.text, 3000) })),
    survey: o.survey !== false,
    sendDaysBefore: Math.max(0, Math.min(14, Math.round(Number(o.sendDaysBefore) || 0))),
    autoSend: o.autoSend !== false,
    closing: str(o.closing, 200) || DEFAULT_OFFBOARD.closing,
    extraTasks: (Array.isArray(o.extraTasks) ? o.extraTasks : []).map((t) => str(t, 140)).filter(Boolean).slice(0, 20),
  };
}
