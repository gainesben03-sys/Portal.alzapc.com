// Alza Pulse: employee surveys that end in an action plan.
// Shared by the server, the browser and the public survey page. No secrets here.
import { addDays, iso } from "./perform";

// ------------------------------------------------------------------ questions
export type PKind = "agree" | "scale10" | "choice" | "multi" | "yesno" | "text";
export interface PQ {
  id: string;
  text: string;
  kind: PKind;
  options?: string[]; // choice / multi
  max?: number; // multi: pick up to
  cat?: string; // the area it measures (Communication, Leadership...)
  required?: boolean; // default: people can skip
  enps?: boolean; // the 0-10 "recommend as a place to work" question
  es?: { text: string; options?: string[] };
}
export const KIND_LABEL: Record<PKind, string> = {
  agree: "Agree / disagree (1 to 5)",
  scale10: "0 to 10",
  choice: "Pick one",
  multi: "Pick several",
  yesno: "Yes / No",
  text: "Written answer",
};
export const AGREE = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
export const AGREE_ES = ["Muy en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Muy de acuerdo"];
export const YESNO_ES = ["Sí", "No"];

// ------------------------------------------------------------------ surveys
export type Privacy = "anonymous" | "confidential";
export type PStatus = "draft" | "open" | "closed";
export interface PAction {
  id: string;
  finding: string;
  action: string;
  owner: string;
  due?: string; // yyyy-mm-dd
  status: "planned" | "progress" | "done";
  priority: "high" | "med" | "low";
  metric?: string; // how we'll know
  notes?: string;
  doneAt?: string;
}
export interface Theme { name: string; count: number; sentiment: "positive" | "mixed" | "negative"; summary: string; quotes: string[] }
export interface Analysis {
  at: string;
  n: number;
  headline: string;
  says: string; // what the data says
  suggests: string; // what the comments suggest
  cantConclude: string; // what it can't confidently conclude
  consider: string; // what to consider doing
  strengths: string[];
  concerns: string[];
  themes: Theme[];
  quickWins: string[];
  actions: { priority: PAction["priority"]; finding: string; action: string; timing: string; metric: string }[];
  questions: string[]; // for leadership
  followUp: string;
}
export interface Survey {
  id: string;
  clientId: string;
  title: string;
  templateId?: string;
  intro: string;
  privacy: Privacy;
  questions: PQ[];
  status: PStatus;
  audience: { all: boolean; personIds?: string[] };
  openToken: string; // the shareable link / QR code
  closesAt: string; // yyyy-mm-dd, end of that day
  createdAt: string;
  createdBy: string;
  launchedAt?: string;
  closedAt?: string;
  invited: number;
  responded: number;
  reminded?: string[]; // days a reminder went out
  esReady?: boolean; // Spanish version written
  analysis?: Analysis;
  actions: PAction[];
  message?: string; // "you said, we did" draft
}
/** A response. Anonymous ones carry no name, no email and no time of day. */
export interface PResponse { id: string; surveyId: string; day: string; lang: "en" | "es"; answers: Record<string, string | number | string[]>; personId?: string; personName?: string }
/** One person's invitation. Kept apart from responses so an anonymous answer can't be traced back. */
export interface Invite { token: string; surveyId: string; clientId: string; personId: string; name: string; email?: string; done: boolean; sentAt?: string; remindedAt?: string }

export const MIN_GROUP = 5; // results stay hidden until this many people answer

// ------------------------------------------------------------------ the library
type T = { id: string; title: string; blurb: string; minutes: number; intro: string; questions: PQ[]; tag?: string };
const a = (id: string, cat: string, text: string): PQ => ({ id, cat, text, kind: "agree" });
const txt = (id: string, text: string, cat?: string): PQ => ({ id, text, kind: "text", cat });
const ENPS: PQ = { id: "enps", text: "How likely are you to recommend this company as a place to work?", kind: "scale10", enps: true, cat: "Engagement" };

export const TEMPLATES: T[] = [
  {
    id: "culture", title: "Annual Culture & Engagement", minutes: 8, tag: "eNPS",
    blurb: "The full picture: leadership, trust, communication, belonging, recognition, growth, workload and engagement.",
    intro: "Once a year we ask everyone how things are really going. Be honest. It's how we decide what to work on next.",
    questions: [
      a("eng1", "Engagement", "I'm proud to work here."), a("eng2", "Engagement", "I see myself working here two years from now."), ENPS,
      a("lead1", "Leadership", "I trust the decisions leadership makes."), a("lead2", "Leadership", "Leadership shares what's coming before it happens."),
      a("com1", "Communication", "I understand the reasons behind decisions that affect my work."), a("com2", "Communication", "I get the information I need to do my job well."),
      a("mgr1", "My manager", "My manager gives me useful feedback."), a("mgr2", "My manager", "My manager cares about me as a person."),
      a("bel1", "Belonging", "I feel like I belong here."), a("bel2", "Belonging", "I can be myself at work."),
      a("rec1", "Recognition", "I'm recognized when I do good work."),
      a("grow1", "Growth", "I'm learning and growing here."), a("grow2", "Growth", "I can see a path forward for my career here."),
      a("work1", "Workload", "My workload is manageable most weeks."), a("work2", "Workload", "I can take time off without falling behind."),
      a("team1", "Teamwork", "People here help each other out."),
      txt("best", "What's the best thing about working here?"), txt("change", "If you could change one thing, what would it be?"),
    ],
  },
  {
    id: "benefits", title: "Benefits & Total Rewards", minutes: 5,
    blurb: "What people value, what they don't understand, and where the money isn't landing.",
    intro: "We're reviewing our benefits. Tell us what matters to you so we spend where it counts.",
    questions: [
      a("ben1", "Benefits", "Our benefits meet my needs."), a("ben2", "Benefits", "I understand what my benefits cover."), a("ben3", "Benefits", "Out-of-pocket costs are reasonable for me."),
      { id: "benval", kind: "multi", max: 3, cat: "Benefits", text: "Which benefits matter most to you?", options: ["Medical", "Dental", "Vision", "401(k) match", "Paid time off", "Flexible schedule", "Mental health support", "Life / disability insurance", "Wellness stipend", "Professional development"] },
      { id: "benuse", kind: "choice", cat: "Benefits", text: "How easy is it to use your benefits when you need them?", options: ["Very easy", "Somewhat easy", "Somewhat hard", "Very hard", "Haven't needed them"] },
      { id: "benwant", kind: "multi", max: 3, cat: "Benefits", text: "What would you add if you could?", options: ["Lower premiums", "More plan choices", "Better dependent coverage", "More PTO", "Commuter benefits", "Childcare help", "Student loan help", "Pet insurance"] },
      a("pay1", "Pay", "I'm paid fairly for the work I do."),
      txt("bencomment", "Anything else about benefits or pay we should know?"),
    ],
  },
  {
    id: "manager", title: "Manager Effectiveness", minutes: 4,
    blurb: "Communication, feedback, support, accountability and trust in direct supervisors.",
    intro: "Help us support our managers. Your answers are combined, and results by manager only show with 5 or more answers.",
    questions: [
      a("m1", "Communication", "My manager keeps me in the loop."), a("m2", "Feedback", "My manager gives me regular, useful feedback."), a("m3", "Support", "My manager helps me remove obstacles."),
      a("m4", "Accountability", "My manager holds everyone to the same standard."), a("m5", "Trust", "I trust my manager."), a("m6", "Growth", "My manager supports my growth."),
      a("m7", "Recognition", "My manager notices when I do good work."),
      txt("mstart", "What should your manager keep doing?"), txt("mstop", "What would make your manager even better?"),
    ],
  },
  {
    id: "newhire", title: "New Hire Check-in", minutes: 2,
    blurb: "Catch onboarding problems at 30, 60 and 90 days, before they turn into turnover.",
    intro: "You've been here a little while now. How's it going? Quick and honest is perfect.",
    questions: [
      a("nh1", "Onboarding", "The job is what I expected when I accepted the offer."), a("nh2", "Onboarding", "I have what I need to do my job."), a("nh3", "Onboarding", "I know what's expected of me."),
      a("nh4", "Belonging", "I feel welcome on my team."), a("nh5", "My manager", "I meet with my manager often enough."),
      { id: "nh6", kind: "choice", cat: "Onboarding", text: "How was your first week?", options: ["Great", "Good", "Okay", "Rough"] },
      txt("nh7", "What would have made your start better?"),
    ],
  },
  {
    id: "pulse", title: "Pulse Check", minutes: 1, tag: "Under 2 min",
    blurb: "Three to five quick questions on workload, morale or a change. Send it anytime.",
    intro: "Four quick questions. Under a minute.",
    questions: [
      { ...a("p1", "Morale", "I'm in a good place at work right now."), es: { text: "Me siento bien en el trabajo en este momento." } },
      { ...a("p2", "Workload", "My workload is manageable."), es: { text: "Mi carga de trabajo es manejable." } },
      { ...a("p3", "Communication", "I understand the reasons behind decisions that affect my work."), es: { text: "Entiendo las razones detrás de las decisiones que afectan mi trabajo." } },
      { ...txt("p4", "What's one thing we could do better right now?"), es: { text: "¿Qué es algo que podríamos hacer mejor ahora mismo?" } },
    ],
  },
  {
    id: "exit", title: "Exit & Retention", minutes: 3,
    blurb: "Why people leave and what would have kept them. Spot patterns early.",
    intro: "Thank you for your time here. Your honest answers help us keep good people.",
    questions: [
      { id: "x1", kind: "multi", max: 3, cat: "Retention", text: "What were the main reasons you decided to leave?", options: ["Pay", "Career growth", "My manager", "Workload", "Schedule or flexibility", "Commute or location", "Company direction", "Personal reasons", "A better offer"] },
      a("x2", "Retention", "I'd consider coming back someday."), a("x3", "My manager", "My manager supported me."), a("x4", "Growth", "I had chances to grow here."),
      { id: "x5", kind: "yesno", cat: "Retention", text: "Did you talk with anyone here about leaving before you decided?" },
      txt("x6", "What could we have done to keep you?"),
    ],
  },
  {
    id: "reviews", title: "Review Process Feedback", minutes: 1,
    blurb: "Three questions right after a review cycle: was it fair, useful and worth the time?",
    intro: "We just finished reviews. Tell us how the process felt so we can make it better.",
    questions: [a("r1", "Reviews", "My review was fair."), a("r2", "Reviews", "My review helped me know what to work on."), txt("r3", "How could we make reviews better?")],
  },
  {
    id: "workload", title: "Workload & Burnout", minutes: 2,
    blurb: "Find pressure points before people burn out.",
    intro: "We want to know how sustainable things feel. Quick and anonymous.",
    questions: [
      a("w1", "Workload", "My workload is manageable most weeks."), a("w2", "Workload", "I can disconnect after work."), a("w3", "Wellbeing", "I have energy left at the end of the day."),
      { id: "w4", kind: "choice", cat: "Workload", text: "How often do you work beyond your scheduled hours?", options: ["Rarely", "A few times a month", "Weekly", "Most days"] },
      txt("w5", "What takes up time that it shouldn't?"),
    ],
  },
  {
    id: "training", title: "Training & Development Needs", minutes: 3,
    blurb: "What skills people want to build and how they like to learn.",
    intro: "We're planning training for next year. What would help you most?",
    questions: [
      a("t1", "Growth", "I get the training I need to do my job well."),
      { id: "t2", kind: "multi", max: 3, cat: "Growth", text: "What would you like to learn more about?", options: ["Leadership", "Communication", "Technical skills for my role", "Customer service", "Software and tools", "Project management", "Safety", "Time management"] },
      { id: "t3", kind: "choice", cat: "Growth", text: "How do you like to learn?", options: ["Short videos", "Live sessions", "Hands-on practice", "Reading", "Mentoring"] },
      txt("t4", "Any specific training you'd like us to offer?"),
    ],
  },
  {
    id: "safety", title: "Psychological Safety", minutes: 2,
    blurb: "Can people speak up, admit mistakes and disagree without fear?",
    intro: "A few questions about how safe it feels to speak up here.",
    questions: [
      a("s1", "Safety", "I can speak up without fear of negative consequences."), a("s2", "Safety", "It's okay to make a mistake on my team."), a("s3", "Safety", "People here can disagree respectfully."),
      a("s4", "Safety", "If I raised a concern, it would be taken seriously."), txt("s5", "What would make it easier to speak up?"),
    ],
  },
  {
    id: "rto", title: "Return to Office", minutes: 3,
    blurb: "Understand concerns and preferences before a schedule change, without leading anyone.",
    intro: "We're thinking about office schedules and want your input before anything is decided.",
    questions: [
      a("o1", "Schedule", "My current schedule works well for me."),
      { id: "o2", kind: "choice", cat: "Schedule", text: "How many days in the office would work best for you?", options: ["0", "1", "2", "3", "4", "5"] },
      { id: "o3", kind: "multi", max: 3, cat: "Schedule", text: "What would make coming in easier?", options: ["Shorter commute options", "Parking or transit help", "Flexible start times", "Quiet space to focus", "Team days on the same day", "Childcare-friendly hours", "Nothing, it's fine"] },
      txt("o4", "What concerns, if any, do you have about changes to the office schedule?"),
    ],
  },
];
export const templateById = (id?: string) => TEMPLATES.find((t) => t.id === id);

// ------------------------------------------------------------------ results
export interface QStat {
  id: string;
  text: string;
  kind: PKind;
  cat?: string;
  n: number; // answered
  fav?: number; // agree: % agree or strongly agree
  avg?: number; // agree 1-5, scale 0-10
  dist: { label: string; count: number }[];
  enps?: number;
  prevFav?: number;
  comments?: string[];
}
export interface Summary {
  n: number;
  invited: number;
  hidden: boolean; // under MIN_GROUP on an anonymous survey
  qs: QStat[];
  cats: { name: string; fav: number; prev?: number }[];
  engagement?: number;
  enps?: number;
  prev?: { title: string; closedAt?: string; engagement?: number; enps?: number };
}
const pct = (x: number, n: number) => (n ? Math.round((100 * x) / n) : 0);

function statsFor(q: PQ, rs: PResponse[]): QStat {
  const vals = rs.map((r) => r.answers[q.id]).filter((v) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
  const s: QStat = { id: q.id, text: q.text, kind: q.kind, cat: q.cat, n: vals.length, dist: [] };
  if (q.kind === "agree") {
    const nums = vals.map(Number).filter((v) => v >= 1 && v <= 5);
    s.dist = AGREE.map((label, i) => ({ label, count: nums.filter((v) => v === i + 1).length }));
    s.fav = pct(nums.filter((v) => v >= 4).length, nums.length);
    s.avg = nums.length ? Math.round((10 * nums.reduce((x, y) => x + y, 0)) / nums.length) / 10 : undefined;
  } else if (q.kind === "scale10") {
    const nums = vals.map(Number).filter((v) => v >= 0 && v <= 10);
    s.dist = Array.from({ length: 11 }, (_, i) => ({ label: String(i), count: nums.filter((v) => v === i).length }));
    s.avg = nums.length ? Math.round((10 * nums.reduce((x, y) => x + y, 0)) / nums.length) / 10 : undefined;
    if (q.enps && nums.length) s.enps = pct(nums.filter((v) => v >= 9).length, nums.length) - pct(nums.filter((v) => v <= 6).length, nums.length);
  } else if (q.kind === "choice" || q.kind === "yesno" || q.kind === "multi") {
    const opts = q.kind === "yesno" ? ["Yes", "No"] : q.options ?? [];
    const flat = vals.flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
    s.dist = opts.map((label) => ({ label, count: flat.filter((v) => v === label).length }));
  } else {
    s.comments = vals.map((v) => String(v).trim()).filter(Boolean);
  }
  return s;
}

/** Crunch the numbers. `prev` is the last closed survey from the same template, for comparison. */
export function summarize(sv: Survey, rs: PResponse[], prev?: { sv: Survey; rs: PResponse[] }): Summary {
  const n = rs.length;
  const hidden = n < MIN_GROUP;
  const base: Summary = { n, invited: sv.invited, hidden, qs: [], cats: [] };
  if (hidden) return base;
  const qs = sv.questions.map((q) => statsFor(q, rs));
  const prevQs = prev && prev.rs.length >= MIN_GROUP ? prev.sv.questions.map((q) => statsFor(q, prev.rs)) : [];
  for (const q of qs) {
    const p = prevQs.find((x) => x.id === q.id && x.kind === "agree");
    if (p) q.prevFav = p.fav;
  }
  const catNames = [...new Set(qs.filter((q) => q.kind === "agree" && q.cat).map((q) => q.cat as string))];
  const avgFav = (list: QStat[]) => (list.length ? Math.round(list.reduce((x, q) => x + (q.fav ?? 0), 0) / list.length) : undefined);
  const cats = catNames.map((name) => {
    const fav = avgFav(qs.filter((q) => q.kind === "agree" && q.cat === name)) ?? 0;
    const pq = prevQs.filter((q) => q.kind === "agree" && q.cat === name);
    return { name, fav, prev: pq.length ? avgFav(pq) : undefined };
  });
  const engagement = cats.find((c) => c.name === "Engagement")?.fav;
  const enps = qs.find((q) => q.enps)?.enps;
  const prevCats = prevQs.length ? { engagement: avgFav(prevQs.filter((q) => q.kind === "agree" && q.cat === "Engagement")), enps: prevQs.find((q) => q.enps)?.enps } : undefined;
  return { ...base, qs, cats: cats.sort((x, y) => y.fav - x.fav), engagement, enps, prev: prev && prevCats ? { title: prev.sv.title, closedAt: prev.sv.closedAt, ...prevCats } : undefined };
}

/** Swap anyone's name on the roster for [name] in written comments. */
export function redact(text: string, names: string[]): string {
  let out = text;
  const parts = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((p) => p.length > 2))].sort((x, y) => y.length - x.length);
  for (const p of parts) out = out.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
  return out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone]");
}

// ------------------------------------------------------------------ helpers
export const today = () => iso(new Date());
export const isOpen = (sv: Survey, day = today()) => sv.status === "open" && sv.closesAt >= day;
export const surveyLink = (origin: string, token: string) => `${origin}/s/${token}`;
export const rate = (sv: Survey) => (sv.invited ? Math.round((100 * sv.responded) / sv.invited) : 0);
export function fmtDay(d?: string) {
  if (!d) return "";
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function fromTemplate(t: T, clientId: string, by: string, token: string, id: string): Survey {
  return {
    id, clientId, title: `${new Date().getFullYear()} ${t.title}`.replace(/^\d{4} (Pulse Check|New Hire Check-in|Exit & Retention|Review Process Feedback)$/, "$1"),
    templateId: t.id, intro: t.intro, privacy: "anonymous", questions: t.questions.map((q) => ({ ...q })),
    status: "draft", audience: { all: true }, openToken: token, closesAt: addDays(today(), 7), createdAt: new Date().toISOString(), createdBy: by,
    invited: 0, responded: 0, actions: [], esReady: t.questions.every((q) => q.es),
  };
}

/** Tidy a survey coming from the editor. Keeps the server's own fields. */
export function cleanSurvey(raw: Partial<Survey>, keep: Survey): Survey {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
  const kinds: PKind[] = ["agree", "scale10", "choice", "multi", "yesno", "text"];
  const questions = (Array.isArray(raw.questions) ? raw.questions : keep.questions).slice(0, 60).map((q): PQ | null => {
    const text = s(q?.text, 300);
    if (!text) return null;
    const kind = kinds.includes(q.kind as PKind) ? (q.kind as PKind) : "agree";
    const options = kind === "choice" || kind === "multi" ? (q.options ?? []).map((o) => s(o, 100)).filter(Boolean).slice(0, 12) : undefined;
    if (options && options.length < 2) return null;
    const same = keep.questions.find((k) => k.id === q.id);
    const es = same && same.text === text && JSON.stringify(same.options) === JSON.stringify(options) ? same.es : q.es && q.es.text ? { text: s(q.es.text, 400), options: q.es.options?.map((o) => s(o, 120)) } : undefined;
    return { id: s(q.id, 24) || Math.random().toString(36).slice(2, 8), text, kind, options, max: kind === "multi" ? Math.max(1, Math.min(Number(q.max) || 3, options?.length ?? 3)) : undefined, cat: s(q.cat, 40) || undefined, required: !!q.required, enps: kind === "scale10" && !!q.enps, es };
  }).filter((q): q is PQ => !!q);
  const ids = new Set<string>();
  for (const q of questions) { while (ids.has(q.id)) q.id += "x"; ids.add(q.id); }
  return {
    ...keep,
    title: s(raw.title, 120) || keep.title,
    intro: s(raw.intro, 600),
    privacy: raw.privacy === "confidential" ? "confidential" : "anonymous",
    questions,
    audience: raw.audience?.all === false ? { all: false, personIds: (raw.audience.personIds ?? []).map(String).slice(0, 2000) } : { all: true },
    closesAt: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.closesAt)) ? String(raw.closesAt) : keep.closesAt,
    esReady: questions.every((q) => q.es),
  };
}
export function cleanActions(raw: unknown): PAction[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
  return raw.slice(0, 40).map((x) => {
    const r = (x ?? {}) as Partial<PAction>;
    const status = (["planned", "progress", "done"] as const).includes(r.status as PAction["status"]) ? (r.status as PAction["status"]) : "planned";
    return {
      id: s(r.id, 24) || Math.random().toString(36).slice(2, 10), finding: s(r.finding, 200), action: s(r.action, 300), owner: s(r.owner, 80),
      due: /^\d{4}-\d{2}-\d{2}$/.test(String(r.due)) ? String(r.due) : undefined, status, priority: (["high", "med", "low"] as const).includes(r.priority as PAction["priority"]) ? (r.priority as PAction["priority"]) : "med",
      metric: s(r.metric, 200) || undefined, notes: s(r.notes, 600) || undefined, doneAt: status === "done" ? r.doneAt || today() : undefined,
    };
  }).filter((r) => r.action);
}

// ------------------------------------------------------------------ Alza recommends
export interface Reco { id: string; title: string; why: string; templateId: string; cta: string }
/** What to send next, from what's already happened. Plain rules, no AI. */
export function recommend(surveys: Survey[], ctx: { newHires30: number; reviewsClosedDays?: number; day?: string }): Reco[] {
  const day = ctx.day ?? today();
  const last = (tid: string) => surveys.filter((s) => s.templateId === tid && s.status !== "draft").map((s) => s.launchedAt ?? s.createdAt).sort().pop();
  const monthsSince = (d?: string) => (d ? Math.floor((Date.parse(day) - Date.parse(d)) / (30.4 * 864e5)) : 99);
  const open = (tid: string) => surveys.some((s) => s.templateId === tid && (s.status === "open" || s.status === "draft"));
  const out: Reco[] = [];
  const c = monthsSince(last("culture"));
  if (c >= 11 && !open("culture")) out.push({ id: "culture", templateId: "culture", title: "Annual Culture & Engagement", why: c >= 99 ? "You haven't run one yet. It's the baseline everything else is measured against." : `It's been ${c} months since your last culture survey.`, cta: "Review and launch" });
  const month = Number(day.slice(5, 7));
  if (monthsSince(last("benefits")) >= 11 && !open("benefits") && [8, 9, 10].includes(month)) out.push({ id: "benefits", templateId: "benefits", title: "Benefits & Total Rewards", why: "Open enrollment is usually coming up. Learn what people value before renewal.", cta: "Review and launch" });
  if (ctx.reviewsClosedDays !== undefined && ctx.reviewsClosedDays <= 30 && monthsSince(last("reviews")) >= 3 && !open("reviews")) out.push({ id: "reviews", templateId: "reviews", title: "Review process feedback", why: "Your review cycle just wrapped. Three questions on how it felt.", cta: "Review and launch" });
  if (ctx.newHires30 > 0 && !open("newhire")) out.push({ id: "newhire", templateId: "newhire", title: "New hire check-in", why: `${ctx.newHires30} ${ctx.newHires30 === 1 ? "person is" : "people are"} around 30 days in. Catch onboarding issues early.`, cta: "Review and send" });
  const followUp = surveys.filter((s) => s.status === "closed" && s.actions.some((x) => x.status === "done") && monthsSince(s.closedAt) >= 3).sort((x, y) => (y.closedAt ?? "").localeCompare(x.closedAt ?? ""))[0];
  if (followUp && !open("pulse")) out.push({ id: "follow", templateId: "pulse", title: "Follow-up pulse", why: `You've finished actions from "${followUp.title}". A short pulse shows whether they worked.`, cta: "Review and launch" });
  if (!out.length && monthsSince(surveys.map((s) => s.launchedAt ?? "").sort().pop()) >= 3) out.push({ id: "pulse", templateId: "pulse", title: "Pulse check", why: "No survey in the last 3 months. A 4-question check keeps a read on morale.", cta: "Review and launch" });
  return out.slice(0, 3);
}
