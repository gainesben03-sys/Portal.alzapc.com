// Employee experience: an optional layer on top of onboarding.
//   Get to know you: the new hire answers a few questions (secure link, no login), adds a photo,
//   and approves exactly what's shared. The company intro goes out on day one.
//   Onboarding buddy: HR picks someone, they say yes first, then both get an intro and a couple of nudges.
//   Manager playbook: what to do and ask at each stage, from before day one to day 90.
// Every question, item, nudge and email is editable per client. Blank means the defaults below.
// Pure functions, used by the browser, the public pages and the daily email job.
import { addDaysISO, Brand, esc, firstName, frameEmail, Hire, longDate, sectionHtml } from "./hires";
import { readableInk } from "./brand";

export type XQuestion = { id: string; q: string; label?: string; private?: boolean };
export type XNudge = { id: string; days: number; text: string };
export type XStage = { id: string; label: string; days: number; items: string[]; asks: string[] };
export type Wording = { subject?: string; message?: string };

export interface ExperienceSettings {
  on?: boolean;
  introOn?: boolean;
  buddyOn?: boolean;
  playbookOn?: boolean;
  /** The new hire's page */
  pageTitle?: string;
  pageText?: string;
  questions?: XQuestion[];
  /** Email with the link. Goes out once the offer is signed. */
  linkEmail?: Wording;
  remind?: boolean;
  /** The company intro on day one */
  intro?: Wording & { closing?: string };
  audience?: "all" | "site";
  wall?: boolean;
  photos?: boolean;
  /** How the intro reads: a short list of their answers, or a few paragraphs the AI drafts from them */
  introStyle?: "list" | "story";
  /** HR gets the intro by email on the day and approves it before it goes to the team (on by default) */
  introReview?: boolean;
  /** Buddy */
  buddyAsk?: Wording;
  buddyIntro?: Wording;
  nudges?: XNudge[];
  /** Manager playbook */
  stages?: XStage[];
  /** Reminders to the manager: when the offer is signed, and when each playbook stage comes up (off: Monday email only) */
  mgrReminders?: boolean;
  mgrSigned?: Wording;
  mgrStage?: Wording;
  /** The day before someone starts: a short note to the executives (and anyone else listed) */
  execHeadsUp?: boolean;
  headsUpExtra?: string[];
  execWording?: Wording;
}

export type Audience = "all" | "site";

export interface HireXp {
  token?: string;
  linkSentAt?: string;
  remindedAt?: string;
  answers?: Record<string, string>;
  preferred?: string;
  /** Question ids the hire approved for the intro */
  share?: string[];
  photo?: string; // storage path
  sharePhoto?: boolean;
  submittedAt?: string;
  approvedAt?: string;
  intro?: {
    subject?: string; message?: string; closing?: string; audience?: Audience; wall?: boolean; on?: string; cancelled?: boolean; sentAt?: string; sentTo?: number; failed?: string;
    style?: "list" | "story"; story?: string;
    /** HR approval: the link in HR's email, when it went, and who said send */
    okToken?: string; reviewSentAt?: string; okAt?: string; okBy?: string;
  };
  buddy?: XBuddy;
  /** Manager playbook: "stageId:index" -> when ticked */
  plan?: Record<string, string>;
  /** HR closed the journey (left early, etc): nothing else sends. */
  closed?: boolean;
  /** Action items the new hire ticked off on their welcome page: index -> when */
  todos?: Record<string, string>;
  /** The manager's plan page (no login) and their private notes */
  planToken?: string;
  mgrNotes?: string;
  /** Manager reminders sent: "signed" or a stage id -> when */
  mgrSent?: Record<string, string>;
}

export interface XBuddy {
  personId?: string;
  name: string;
  email: string;
  token: string;
  status: "asked" | "yes" | "no";
  askedAt: string;
  answeredAt?: string;
  introSentAt?: string;
  /** Nudges: id -> when sent; "done:<id>" -> when the buddy ticked it */
  log?: Record<string, string>;
  note?: string;
}

// ---------------------------------------------------------------- defaults

export const PAGE_TITLE = "Before your first day, we'd love to get to know you.";
export const PAGE_TEXT = "A few quick questions to help introduce you to the team. Skip anything you like. Nothing is shared until you see it and say yes.";

export const DEFAULT_QUESTIONS: XQuestion[] = [
  { id: "say", q: "How do you say your name?", label: "Say it like" },
  { id: "from", q: "Where are you joining us from?", label: "Joining us from" },
  { id: "excited", q: "What are you most excited about?", label: "Looking forward to" },
  { id: "outside", q: "What do you enjoy outside of work?", label: "Outside of work" },
  { id: "fact", q: "Something surprising about you?", label: "Fun fact" },
  { id: "coffee", q: "Coffee, tea or something else?", label: "Order of choice" },
  { id: "spot", q: "A favorite food or local spot?", label: "Favorite spot" },
  { id: "feedback", q: "How do you like to get feedback or recognition?", private: true },
  { id: "easier", q: "Anything that would make your first weeks easier?", private: true },
];

export const DEFAULT_LINK_EMAIL: Required<Wording> = {
  subject: "Before your first day, {first name}",
  message: "We're so glad you're joining {company}!\n\nYour welcome page has everything for your first days: when and where to show up, your to-dos and your people. First up: a few quick questions so the team can get to know you.",
};

export const DEFAULT_INTRO = {
  subject: "Please welcome {preferred name} to the team!",
  message: "{preferred name} {last name} joins us today as {job title}, reporting to {manager}.",
  closing: "Say hello and help {preferred name} feel at home!",
};

export const DEFAULT_BUDDY_ASK: Required<Wording> = {
  subject: "Would you be {first name}'s onboarding buddy?",
  message: "{full name} starts {start date} as {job title}. Would you be their onboarding buddy for the first month?\n\nIt's simple. You're not training them. Just be a friendly face: say hi before day one, grab coffee or lunch their first week, and check in now and then.",
};

export const DEFAULT_BUDDY_INTRO: Required<Wording> = {
  subject: "{first name}, meet your onboarding buddy",
  message: "{first name}, meet {buddy}. {buddy first} is your go-to for the informal stuff: where things are, who to ask, and how things really work.\n\nFor your first chat: get to know each other, talk about the team, and find a time for coffee your first week.\n\nWelcome aboard, {first name}!",
};

export const DEFAULT_NUDGES: XNudge[] = [
  { id: "n1", days: -5, text: "{first name} starts {start date}. Take a minute to say hi and set up a coffee for their first week." },
  { id: "n2", days: 14, text: "Two weeks in. Check in with {first name}: how's it going, any questions, feeling connected to the team?" },
];

export const DEFAULT_STAGES: XStage[] = [
  {
    id: "prep", label: "Before day one", days: -7,
    items: ["Laptop, keys and workspace ready", "Email and software access set up", "First-day schedule on the calendar", "Write down 3 priorities for week one", "Pick who they should meet (Make Five Connections)", "Reread the job description and what good looks like"],
    asks: ["What does a great first week look like for this role?", "Who will they lean on most? Make sure those people know they're coming.", "What would you have wanted on your own first day?"],
  },
  {
    id: "day", label: "Day one", days: 0,
    items: ["Greet them yourself when they arrive", "Walk them around and introduce the team", "Share why the company exists and what we value", "Go over the role and this week's priorities", "How we communicate: text, email, when to call", "Where to get help, and who their buddy is"],
    asks: ["How are you feeling about today?", "What questions do you have so far?", "Anything you need that you don't have yet?"],
  },
  {
    id: "week", label: "First week", days: 4,
    items: ["Hold a one-on-one", "Explain how the team works and who does what", "Talk through what success looks like", "Check training and resources are in place", "Make Five Connections: someone on their team, someone from another team, a senior leader, someone who's been here a while, someone they'll work with often"],
    asks: ["How are you feeling about your first few days?", "Has anything surprised you?", "Do you have the tools and information you need?", "Is there anyone you haven't met yet?", "What haven't you had a chance to ask?"],
  },
  {
    id: "d30", label: "Day 30", days: 30,
    items: ["Review early progress", "Talk about what's been hard", "Give one piece of honest feedback", "Clear up anything unclear about the role"],
    asks: ["What is becoming clearer about your role?", "What has been your biggest learning?", "Are expectations clear?", "What could I do differently to support you?"],
  },
  {
    id: "d60", label: "Day 60", days: 60,
    items: ["Check confidence and workload", "Talk about training or development", "Recognize something they did well"],
    asks: ["How confident do you feel in your responsibilities?", "What is going particularly well?", "Where would more training help?", "Do you feel connected to the team?"],
  },
  {
    id: "d90", label: "Day 90", days: 90,
    items: ["Talk through accomplishments", "Set goals for the next 90 days", "Ask how onboarding could be better"],
    asks: ["What are you most proud of so far?", "What has been different from what you expected?", "What would you like to learn next?", "What should your next 90 days look like?"],
  },
];

export const DEFAULT_MGR_SIGNED: Required<Wording> = {
  subject: "{first name} said yes! Starts {start date}",
  message: "Good news: {full name} signed their offer and starts {start date} as {job title}.\n\nYour plan for their first 90 days is ready: what to get done before day one, what to cover in week one, and questions to ask along the way. You'll get a short reminder at each stage.",
};
export const DEFAULT_MGR_STAGE: Required<Wording> = {
  subject: "{stage}: your plan for {first name}",
  message: "Here's what's up next for {first name}.",
};
export const DEFAULT_EXEC: Required<Wording> = {
  subject: "Starting tomorrow: {names}",
  message: "A quick heads-up: {names} start{s} tomorrow. A short welcome note, or stopping by to say hi, goes a long way in someone's first week.",
};

export const XP_FILL_INS = ["{first name}", "{preferred name}", "{full name}", "{last name}", "{job title}", "{manager}", "{company}", "{start date}", "{buddy}"] as const;

// ---------------------------------------------------------------- reading settings

export const xpOn = (x?: ExperienceSettings) => !!x?.on;
export const introOn = (x?: ExperienceSettings) => !!x?.on && x.introOn !== false;
export const buddyOn = (x?: ExperienceSettings) => !!x?.on && x.buddyOn !== false;
export const playbookOn = (x?: ExperienceSettings) => !!x?.on && x.playbookOn !== false;

export const questionsFor = (x?: ExperienceSettings) => (x?.questions?.length ? x.questions : DEFAULT_QUESTIONS);
export const nudgesFor = (x?: ExperienceSettings) => (x?.nudges ? x.nudges : DEFAULT_NUDGES);
export const stagesFor = (x?: ExperienceSettings) => (x?.stages?.length ? x.stages : DEFAULT_STAGES);
const pick = (v: string | undefined, d: string) => (v && v.trim() ? v : d);
export const introStyleOf = (x?: ExperienceSettings, xp?: HireXp): "list" | "story" => xp?.intro?.style ?? x?.introStyle ?? "list";
export const reviewOn = (x?: ExperienceSettings) => introOn(x) && x?.introReview !== false;
export const mgrOn = (x?: ExperienceSettings) => playbookOn(x) && x?.mgrReminders !== false;
export const execOn = (x?: ExperienceSettings) => !!x?.on && x.execHeadsUp !== false;
export const linkWording = (x?: ExperienceSettings) => ({ subject: pick(x?.linkEmail?.subject, DEFAULT_LINK_EMAIL.subject), message: pick(x?.linkEmail?.message, DEFAULT_LINK_EMAIL.message) });
export const buddyAskWording = (x?: ExperienceSettings) => ({ subject: pick(x?.buddyAsk?.subject, DEFAULT_BUDDY_ASK.subject), message: pick(x?.buddyAsk?.message, DEFAULT_BUDDY_ASK.message) });
export const buddyIntroWording = (x?: ExperienceSettings) => ({ subject: pick(x?.buddyIntro?.subject, DEFAULT_BUDDY_INTRO.subject), message: pick(x?.buddyIntro?.message, DEFAULT_BUDDY_INTRO.message) });
/** The company intro: the hire's own edits, then the company's wording, then the defaults. */
export function introWording(x?: ExperienceSettings, xp?: HireXp) {
  return {
    subject: pick(xp?.intro?.subject, pick(x?.intro?.subject, DEFAULT_INTRO.subject)),
    message: pick(xp?.intro?.message, pick(x?.intro?.message, DEFAULT_INTRO.message)),
    closing: pick(xp?.intro?.closing, pick(x?.intro?.closing, DEFAULT_INTRO.closing)),
  };
}

// ---------------------------------------------------------------- cleaning what comes in

const str = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").slice(0, n);
const id8 = (v: unknown, i: number, p: string) => (/^[A-Za-z0-9_-]{1,24}$/.test(String(v ?? "")) ? String(v) : `${p}${i}`);
const lines = (v: unknown, max: number) => (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((l) => str(l, 300).trim()).filter(Boolean).slice(0, max);
const wording = (v: unknown, n = 3000): Wording | undefined => {
  const w = (v ?? {}) as Record<string, unknown>;
  const out: Wording = {};
  if (str(w.subject, 200).trim()) out.subject = str(w.subject, 200).trim();
  if (str(w.message, n).trim()) out.message = str(w.message, n).trim();
  return Object.keys(out).length ? out : undefined;
};

export function cleanExperience(v: unknown): ExperienceSettings {
  const x = (v ?? {}) as Record<string, unknown>;
  const b = (k: string) => (typeof x[k] === "boolean" ? (x[k] as boolean) : undefined);
  const out: ExperienceSettings = { on: !!x.on, introOn: b("introOn"), buddyOn: b("buddyOn"), playbookOn: b("playbookOn"), remind: b("remind"), wall: b("wall"), photos: b("photos") };
  if (x.audience === "site" || x.audience === "all") out.audience = x.audience;
  if (str(x.pageTitle, 200).trim()) out.pageTitle = str(x.pageTitle, 200).trim();
  if (str(x.pageText, 1000).trim()) out.pageText = str(x.pageText, 1000).trim();
  if (Array.isArray(x.questions)) {
    const qs = (x.questions as Record<string, unknown>[])
      .map((q, i) => ({ id: id8(q?.id, i, "q"), q: str(q?.q, 200).trim(), label: str(q?.label, 40).trim() || undefined, private: !!q?.private || undefined }))
      .filter((q) => q.q)
      .slice(0, 20);
    const seen = new Set<string>();
    out.questions = qs.map((q, i) => (seen.has(q.id) ? { ...q, id: `q${i}x` } : (seen.add(q.id), q)));
    if (!out.questions.length) delete out.questions;
  }
  out.linkEmail = wording(x.linkEmail);
  const intro = wording(x.intro, 1500) as ExperienceSettings["intro"];
  const closing = str((x.intro as Record<string, unknown>)?.closing, 300).trim();
  out.intro = intro || closing ? { ...(intro ?? {}), ...(closing ? { closing } : {}) } : undefined;
  out.buddyAsk = wording(x.buddyAsk);
  out.buddyIntro = wording(x.buddyIntro);
  if (Array.isArray(x.nudges))
    out.nudges = (x.nudges as Record<string, unknown>[])
      .map((n, i) => ({ id: id8(n?.id, i, "n"), days: Math.max(-60, Math.min(120, Math.round(Number(n?.days) || 0))), text: str(n?.text, 500).trim() }))
      .filter((n) => n.text)
      .slice(0, 8);
  if (Array.isArray(x.stages)) {
    out.stages = (x.stages as Record<string, unknown>[])
      .map((s, i) => ({ id: id8(s?.id, i, "s"), label: str(s?.label, 40).trim(), days: Math.max(-60, Math.min(365, Math.round(Number(s?.days) || 0))), items: lines(s?.items, 15), asks: lines(s?.asks, 10) }))
      .filter((s) => s.label && (s.items.length || s.asks.length))
      .slice(0, 10);
    if (!out.stages.length) delete out.stages;
  }
  out.mgrReminders = b("mgrReminders");
  out.introReview = b("introReview");
  if (x.introStyle === "story" || x.introStyle === "list") out.introStyle = x.introStyle;
  out.execHeadsUp = b("execHeadsUp");
  out.mgrSigned = wording(x.mgrSigned);
  out.mgrStage = wording(x.mgrStage);
  out.execWording = wording(x.execWording);
  if (Array.isArray(x.headsUpExtra)) out.headsUpExtra = (x.headsUpExtra as unknown[]).map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 10);
  (Object.keys(out) as (keyof ExperienceSettings)[]).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

// ---------------------------------------------------------------- filling in words

export type FillVals = { first: string; preferred: string; full: string; last: string; title: string; manager: string; company: string; start: string; buddy: string };

export function fillVals(h: Hire, company: string): FillVals {
  const first = firstName(h);
  const preferred = (h.xp?.preferred || "").trim() || first;
  const parts = (h.name || "").trim().split(/\s+/);
  return { first, preferred, full: (h.name || "").trim(), last: parts.length > 1 ? parts.slice(1).join(" ") : "", title: h.title || "our new team member", manager: h.managerName || "their manager", company, start: h.startDate ? longDate(h.startDate) : "soon", buddy: h.xp?.buddy?.name || "" };
}

export function fillXp(t: string, v: FillVals) {
  return t
    .replace(/\{first name\}/gi, v.first)
    .replace(/\{preferred name\}/gi, v.preferred)
    .replace(/\{full name\}/gi, v.full)
    .replace(/\{last name\}/gi, v.last)
    .replace(/\{job title\}/gi, v.title)
    .replace(/\{manager\}/gi, v.manager)
    .replace(/\{company\}/gi, v.company)
    .replace(/\{start date\}/gi, v.start)
    .replace(/\{buddy first\}/gi, v.buddy.split(" ")[0] || "your buddy")
    .replace(/\{buddy\}/gi, v.buddy || "your buddy")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1");
}

/** What the intro shows: only questions the hire approved, with an answer, that aren't manager-only. */
export function introLines(h: Hire, x?: ExperienceSettings): { label: string; text: string }[] {
  const share = new Set(h.xp?.share ?? []);
  return questionsFor(x)
    .filter((q) => !q.private && share.has(q.id) && (h.xp?.answers?.[q.id] || "").trim())
    .map((q) => ({ label: q.label || q.q.replace(/\?$/, ""), text: h.xp!.answers![q.id].trim() }));
}

/** Manager-only answers. */
export function privateAnswers(h: Hire, x?: ExperienceSettings): { q: string; a: string }[] {
  return questionsFor(x)
    .filter((q) => q.private && (h.xp?.answers?.[q.id] || "").trim())
    .map((q) => ({ q: q.q, a: h.xp!.answers![q.id].trim() }));
}

// ---------------------------------------------------------------- dates

export const introDay = (h: Hire) => h.xp?.intro?.on || h.startDate || "";
export const nudgeDay = (h: Hire, n: XNudge) => (h.startDate ? addDaysISO(h.startDate, n.days) : "");
export const stageDay = (h: Hire, s: XStage) => (h.startDate ? addDaysISO(h.startDate, s.days) : "");

/** The stage a manager is in now: the latest stage whose day has come, or the first. */
export function currentStage(h: Hire, x: ExperienceSettings | undefined, today: string): XStage {
  const st = stagesFor(x);
  let cur = st[0];
  for (const s of st) if (stageDay(h, s) && stageDay(h, s) <= today) cur = s;
  return cur;
}

export function stageProgress(h: Hire, s: XStage) {
  const done = s.items.filter((_, i) => h.xp?.plan?.[`${s.id}:${i}`]).length;
  return { done, total: s.items.length };
}

export function buddyNudgeDone(b: XBuddy | undefined, id: string) {
  return !!b?.log?.[`done:${id}`];
}

// ---------------------------------------------------------------- emails

const para = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#1C1A19">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
const btn = (label: string, url: string, color: string, ghost = false) =>
  `<a href="${esc(url)}" style="display:inline-block;margin:6px 8px 0 0;${ghost ? `border:2px solid #CFC7BC;color:#1C1A19;` : `background:${color};color:#FFFFFF;border:2px solid ${color};`}padding:11px 20px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:6px">${esc(label)}</a>`;
const heading = (t: string) => `<p style="margin:36px 0 14px 0;font-family:Georgia,serif;font-size:28px;line-height:34px;color:#1C1A19">${esc(t)}</p>`;

function wrap(b: Brand, title: string, body: string) {
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: readableInk(b.accent) };
  return { brand, html: frameEmail(brand, `${heading(title)}${body}<!--HERO_END-->`) };
}

/** To the new hire: the get-to-know-you link. */
export function linkEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, url: string, reminder = false) {
  const v = fillVals(h, b.company);
  const w = linkWording(x);
  const subject = (reminder ? "Reminder: " : "") + fillXp(w.subject, v);
  const msg = fillXp(w.message, v);
  const { html } = wrap(b, reminder ? `Still time, ${v.first}!` : `Hi ${v.first}!`, para(msg) + btn("Open your welcome page", url, brand0(b)));
  return { subject, html, text: `${msg}\n\nYour welcome page: ${url}` };
}
const brand0 = (b: Brand) => readableInk(b.accent);

/** To the buddy: would you? Yes / Not right now. */
export function buddyAskEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, buddyName: string, url: string) {
  const v = { ...fillVals(h, b.company), buddy: buddyName };
  const w = buddyAskWording(x);
  const subject = fillXp(w.subject, v);
  const msg = fillXp(w.message, v);
  const bf = buddyName.split(" ")[0];
  const body = para(msg) + btn("Yes, happy to", `${url}?a=yes`, brand0(b)) + btn("Not right now", `${url}?a=no`, brand0(b), true) + `<p style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:#6B645E">"Not right now" is totally fine. We'll ask someone else.</p>`;
  return { subject, html: wrap(b, `Hi ${bf},`, body).html, text: `Hi ${bf},\n\n${msg}\n\nYes, happy to: ${url}?a=yes\nNot right now: ${url}?a=no` };
}

/** To the hire and the buddy, once the buddy says yes. */
export function buddyIntroEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, buddyName: string) {
  const v = { ...fillVals(h, b.company), buddy: buddyName };
  const w = buddyIntroWording(x);
  const subject = fillXp(w.subject, v);
  const msg = fillXp(w.message, v);
  const hi = `Hi ${v.preferred} and ${buddyName.split(" ")[0]},`;
  return { subject, html: wrap(b, hi, para(msg)).html, text: `${hi}\n\n${msg}` };
}

/** To the buddy: a scheduled nudge, with a link to tick it off. */
export function nudgeEmail(h: Hire, b: Brand, n: XNudge, buddyName: string, url: string) {
  const v = { ...fillVals(h, b.company), buddy: buddyName };
  const msg = fillXp(n.text, v);
  const subject = `Buddy check-in: ${v.preferred}`;
  return { subject, html: wrap(b, `Hi ${buddyName.split(" ")[0]},`, para(msg) + btn("Done, tick it off", `${url}?done=${encodeURIComponent(n.id)}`, brand0(b))).html, text: `Hi ${buddyName.split(" ")[0]},\n\n${msg}\n\nTick it off: ${url}?done=${encodeURIComponent(n.id)}` };
}

/** To the company, on day one. Only what the hire approved; the photo only if they said yes. */
export function introEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, photoUrl?: string, wallUrl?: string) {
  const v = fillVals(h, b.company);
  const w = introWording(x, h.xp);
  const subject = fillXp(w.subject, v);
  const opening = fillXp(w.message, v);
  const closing = fillXp(w.closing, v);
  const ls = introLines(h, x);
  const accent = brand0(b);
  const photo = photoUrl && h.xp?.sharePhoto !== false ? `<img src="${esc(photoUrl)}" width="96" height="96" alt="${esc(v.preferred)}" style="display:block;width:96px;height:96px;border-radius:48px;object-fit:cover;border:0;margin:0 0 14px 0">` : "";
  const facts = ls.length
    ? sectionHtml("#F4F1EC", ls.map((l) => `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px"><b>${esc(l.label)}:</b> ${esc(l.text)}</p>`).join(""))
    : "";
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent };
  const story = introStyleOf(x, h.xp) === "story" && h.xp?.intro?.story?.trim() ? h.xp.intro.story.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : null;
  const top = `${photo ? `<div style="margin-top:32px">${photo}</div>` : ""}${heading(subject).replace("margin:36px", photo ? "margin:0" : "margin:36px")}`;
  const foot = sectionHtml("#FFFFFF", para(closing) + (wallUrl ? btn("Say welcome on the Team Wall", wallUrl, accent) : ""));
  const inner = story
    ? `${top}${para(story[0])}<!--HERO_END-->${story.length > 1 ? sectionHtml("#F4F1EC", story.slice(1).map(para).join("")) : ""}${foot}`
    : `${top}${para(opening)}<!--HERO_END-->${facts}${foot}`;
  const text = story
    ? `${subject}\n\n${story.join("\n\n")}\n\n${closing}${wallUrl ? `\n\nSay welcome: ${wallUrl}` : ""}`
    : `${subject}\n\n${opening}\n\n${ls.map((l) => `${l.label}: ${l.text}`).join("\n")}\n\n${closing}${wallUrl ? `\n\nSay welcome: ${wallUrl}` : ""}`;
  return { subject, html: frameEmail(brand, inner), text, opening, closing, lines: ls };
}

// ---------------------------------------------------------------- the journey at a glance

export type JourneyStep = { label: string; sub: string; when: string; done: boolean; now?: boolean };

export function journey(h: Hire, x: ExperienceSettings | undefined, firstDayDaysBefore: number, today: string): JourneyStep[] {
  const xp = h.xp ?? {};
  const out: JourneyStep[] = [];
  const sd = h.startDate;
  const fmt = (iso?: string) => (iso ? new Date(iso.length > 10 ? iso : iso + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  out.push({ label: "Welcome email", sub: h.emails?.welcome ? "Sent" : "Goes out when the offer is signed", when: fmt(h.emails?.welcome), done: !!h.emails?.welcome });
  if (introOn(x)) {
    out.push({ label: "Get to know you", sub: xp.submittedAt ? "Answered" + (xp.photo ? " and added a photo" : "") : xp.linkSentAt ? "Link sent, not answered yet" : "Link goes out after the welcome email", when: fmt(xp.submittedAt || xp.linkSentAt), done: !!xp.submittedAt, now: !!xp.linkSentAt && !xp.submittedAt });
    out.push({ label: "Intro approved", sub: xp.approvedAt ? "They chose what to share" : "Waiting on them", when: fmt(xp.approvedAt), done: !!xp.approvedAt });
  }
  if (buddyOn(x)) {
    const b = xp.buddy;
    out.push({ label: "Buddy", sub: !b ? "Not picked yet" : b.status === "yes" ? `${b.name} said yes` : b.status === "no" ? `${b.name} can't right now. Pick someone else.` : `Waiting on ${b.name}`, when: fmt(b?.answeredAt || b?.askedAt), done: b?.status === "yes", now: !b || b.status !== "yes" });
  }
  if (sd) {
    out.push({ label: "First-day email", sub: "Arrival time, where to go, who to ask for", when: fmt(h.emails?.firstDay || addDaysISO(sd, -firstDayDaysBefore)), done: !!h.emails?.firstDay });
    if (introOn(x)) {
      const i = xp.intro;
      out.push({ label: "Company intro", sub: i?.sentAt ? `Sent${i.sentTo ? ` to ${i.sentTo} people` : ""}` : i?.cancelled ? "Not sending" : xp.approvedAt ? "Scheduled" : "Sends once they approve it", when: fmt(i?.sentAt || introDay(h)), done: !!i?.sentAt });
    }
    if (playbookOn(x)) {
      const st = stagesFor(x);
      const all = st.reduce((n, s) => n + s.items.length, 0);
      const doneAll = st.reduce((n, s) => n + stageProgress(h, s).done, 0);
      const cur = currentStage(h, x, today);
      const p = stageProgress(h, cur);
      const behind = st.some((s) => stageDay(h, s) && stageDay(h, s) < today && stageProgress(h, s).done < stageProgress(h, s).total && s.id !== cur.id);
      out.push({ label: "Manager playbook", sub: `Now: ${cur.label}, ${p.done} of ${p.total} done${behind ? ". Earlier stages have open items" : ""}`, when: `${doneAll}/${all}`, done: all > 0 && doneAll === all, now: behind });
    }
  }
  return out;
}

export const newToken = () => {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 56]).join("");
};
export const TOKEN_RE = /^[A-Za-z0-9]{24,64}$/;

/** Give the hire a welcome page link if the experience is on and they don't have one yet. */
export function withPage<T extends Hire>(h: T, x?: ExperienceSettings): T {
  if (!x?.on || h.xp?.token || h.imported || h.outcome) return h;
  return { ...h, xp: { ...(h.xp ?? {}), token: newToken() } };
}

/** The welcome page works until 90 days after the start. */
export const pageOpen = (h: Hire, today: string) => !h.startDate || today <= addDaysISO(h.startDate, 90);

// ---------------------------------------------------------------- the manager's reminders and the executives' heads-up

const bullets = (items: string[]) =>
  items.length ? `<ul style="margin:0 0 14px 0;padding-left:20px;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#1C1A19">${items.map((i) => `<li style="margin:0 0 4px 0">${esc(i)}</li>`).join("")}</ul>` : "";
const label = (t: string) => `<p style="margin:18px 0 6px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#6B645E">${esc(t)}</p>`;

/** When the offer is signed: they said yes, here's your plan. */
export function mgrSignedEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, planUrl: string) {
  const v = fillVals(h, b.company);
  const w = { subject: pick(x?.mgrSigned?.subject, DEFAULT_MGR_SIGNED.subject), message: pick(x?.mgrSigned?.message, DEFAULT_MGR_SIGNED.message) };
  const subject = fillXp(w.subject, v);
  const msg = fillXp(w.message, v);
  const mgr = (h.managerName || "").split(" ")[0] || "there";
  return { subject, html: wrap(b, `Hi ${mgr},`, para(msg) + btn(`Open your plan for ${v.preferred}`, planUrl, brand0(b))).html, text: `Hi ${mgr},\n\n${msg}\n\nYour plan: ${planUrl}` };
}

/** When a playbook stage comes up. Day one's goes out the day before ("starts tomorrow"). */
export function mgrStageEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, st: XStage, planUrl: string, arrival?: string) {
  const v = fillVals(h, b.company);
  const tomorrow = st.days === 0;
  const w = { subject: pick(x?.mgrStage?.subject, DEFAULT_MGR_STAGE.subject), message: pick(x?.mgrStage?.message, DEFAULT_MGR_STAGE.message) };
  const subject = tomorrow ? `${v.preferred} starts tomorrow${arrival ? ` at ${arrival}` : ""}` : fillXp(w.subject.replace(/\{stage\}/gi, st.label), v);
  const opening = tomorrow
    ? `${v.preferred} starts tomorrow${arrival ? ` at ${arrival}` : ""}${h.location ? `, ${h.location.split(",")[0]}` : ""}.${h.xp?.buddy?.status === "yes" ? ` Their buddy is ${h.xp.buddy.name}.` : ""}`
    : fillXp(w.message.replace(/\{stage\}/gi, st.label), v);
  const items = st.items.map((i) => fillXp(i, v)).filter((i, k) => !h.xp?.plan?.[`${st.id}:${k}`] && i);
  const asks = st.asks.map((q) => fillXp(q, v));
  const mgr = (h.managerName || "").split(" ")[0] || "there";
  const body = para(opening) + (items.length ? label(tomorrow ? "Tomorrow" : "To do") + bullets(items) : "") + (asks.length ? label("Questions to ask") + bullets(asks) : "") + btn("Open your plan", planUrl, brand0(b));
  const text = `Hi ${mgr},\n\n${opening}\n\n${items.map((i) => `- ${i}`).join("\n")}\n\nQuestions to ask:\n${asks.map((q) => `- ${q}`).join("\n")}\n\nYour plan: ${planUrl}`;
  return { subject, html: wrap(b, `Hi ${mgr},`, body).html, text };
}

/** The day before: everyone starting tomorrow, for the executives. */
export function execHeadsUpEmail(list: { h: Hire; wallUrl?: string }[], x: ExperienceSettings | undefined, b: Brand, arrivalFor: (h: Hire) => string, wallUrl?: string) {
  const names = list.map(({ h }) => fillVals(h, b.company).preferred + " " + fillVals(h, b.company).last).map((n) => n.trim());
  const joined = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const w = { subject: pick(x?.execWording?.subject, DEFAULT_EXEC.subject), message: pick(x?.execWording?.message, DEFAULT_EXEC.message) };
  const f = (t: string) => t.replace(/\{names\}/gi, joined).replace(/\{s\}/g, names.length === 1 ? "s" : "").replace(/\{company\}/gi, b.company);
  const subject = f(w.subject);
  const msg = f(w.message);
  const rows = list
    .map(({ h }) => {
      const v = fillVals(h, b.company);
      const bits = [v.title, h.managerName ? `with ${h.managerName}` : "", arrivalFor(h), h.location ? h.location.split(",")[0] : ""].filter(Boolean).join(" · ");
      return `<p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#1C1A19"><b>${esc(v.preferred)} ${esc(v.last)}</b><br><span style="color:#6B645E">${esc(bits)}</span></p>`;
    })
    .join("");
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent: brand0(b) };
  const html = frameEmail(brand, `${heading("Starting tomorrow")}${para(msg)}<!--HERO_END-->${sectionHtml("#F4F1EC", rows + (wallUrl ? `<div style="margin-top:6px">${btn("Say welcome on the Team Wall", wallUrl, brand0(b))}</div>` : ""))}`);
  const text = `${msg}\n\n${list.map(({ h }) => `- ${fillVals(h, b.company).preferred} ${fillVals(h, b.company).last}, ${h.title || ""}`).join("\n")}${wallUrl ? `\n\nSay welcome: ${wallUrl}` : ""}`;
  return { subject, html, text };
}

/** The day each manager reminder goes out. */
export const mgrStageSendDay = (h: Hire, st: XStage) => (h.startDate ? addDaysISO(h.startDate, st.days === 0 ? -1 : st.days) : "");

/** To HR on the intro day: here's the intro, approve and send (or change it first). */
export function introReviewEmail(h: Hire, x: ExperienceSettings | undefined, b: Brand, okUrl: string, hireUrl: string, audienceText: string) {
  const v = fillVals(h, b.company);
  const w = introWording(x, h.xp);
  const subject = `Ready to send: ${v.preferred}'s welcome to the team`;
  const accent = brand0(b);
  const brand: Brand = { ...b, bar: b.bar ?? b.accent, accent };
  const story = introStyleOf(x, h.xp) === "story" && h.xp?.intro?.story?.trim() ? h.xp.intro.story.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : null;
  const ls = introLines(h, x);
  const preview =
    `<p style="margin:0 0 12px 0;font-family:Georgia,serif;font-size:22px;line-height:28px;color:#1C1A19">${esc(fillXp(w.subject, v))}</p>` +
    (story ? story.map(para).join("") : para(fillXp(w.message, v)) + ls.map((l) => `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;line-height:22px"><b>${esc(l.label)}:</b> ${esc(l.text)}</p>`).join("")) +
    para(fillXp(w.closing, v));
  const body = `${heading(`${v.preferred}'s intro is ready`)}${para(`It goes to ${audienceText} once you approve it. Read it below, then send it. Or open it in the portal to change the wording, who gets it, or the day.`)}${btn("Approve and send", okUrl, accent)}${btn("Change it first", hireUrl, accent, true)}<!--HERO_END-->${sectionHtml("#EAE5DE", `<p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#6B645E">Preview</p><div style="background:#ffffff;border-radius:8px;padding:18px 20px">${preview}</div>`)}`;
  return { subject, html: frameEmail(brand, body), text: `${v.preferred}'s intro is ready to go to ${audienceText}.\n\nApprove and send: ${okUrl}\nChange it first: ${hireUrl}` };
}
