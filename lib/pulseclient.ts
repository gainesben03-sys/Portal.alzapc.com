"use client";

// Alza Pulse in the browser. Live: every call goes to /api/pulse, which checks who's asking.
// Public demo: the same actions run in this browser with made-up surveys and answers.
import { addDays, iso, newId, newToken } from "./perform";
import {
  Analysis, cleanActions, cleanSurvey, fromTemplate, MIN_GROUP, PQ, PResponse, redact, summarize, Survey, templateById, TEMPLATES, today,
} from "./pulse";
import { authHeader, LIVE } from "./supabase";
import type { TeamMember } from "./team";

const KEY = "alza-demo-pulse-v2";
type Res = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type PulseDemo = { people: TeamMember[]; me: string };
type Store = { surveys: Survey[]; responses: PResponse[] };

// ---------- made-up answers for the demo ----------
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const COMMENTS: Record<string, string[]> = {
  best: ["The people. My crew has my back on every load-in.", "Great team culture, everyone pitches in.", "I like that no two events are the same.", "My manager actually listens.", "Flexible when family stuff comes up.", "We do work we're proud of."],
  change: [
    "I found out about the new schedule from a client before my manager told me.", "Tell us the why behind decisions, not just the what.", "We hear about changes after they happen.",
    "Peak season is brutal. We need more hands in October.", "Post the event calendar further out so we can plan.", "Water and snacks on long load-in days would go a long way.",
    "Out of pocket costs on the medical plan are high for families.", "More recognition for crews after big events.", "Leadership updates more often, even short ones.",
    "Different departments get different answers on the same question.", "Clearer path to move up from coordinator.", "Workload is uneven between teams.",
  ],
  p4: ["Share the calendar earlier.", "Shout out crews after big events.", "Fewer last minute changes.", "Better communication from leadership.", "More staff on weekend events."],
};
export function fakeResponses(sv: Survey, n: number, fav: Record<string, number>, seed: number, day: string): PResponse[] {
  const r = rng(seed);
  const out: PResponse[] = [];
  for (let i = 0; i < n; i++) {
    const answers: PResponse["answers"] = {};
    for (const q of sv.questions) {
      if (r() < 0.04) continue; // a few skips
      if (q.kind === "agree") {
        const p = (fav[q.cat ?? ""] ?? 0.65) + (r() - 0.5) * 0.08;
        answers[q.id] = r() < p ? (r() < 0.4 ? 5 : 4) : r() < 0.5 ? 3 : r() < 0.8 ? 2 : 1;
      } else if (q.kind === "scale10") {
        const e = (fav.Engagement ?? 0.7) - 0.6;
        const x = r();
        answers[q.id] = x < 0.25 + e ? 9 + Math.round(r()) : x < 0.75 ? 7 + Math.round(r()) : Math.floor(r() * 7);
      }
      else if (q.kind === "choice") answers[q.id] = q.options![Math.floor(r() * r() * q.options!.length)];
      else if (q.kind === "multi") answers[q.id] = [...new Set([0, 1, 2].map(() => q.options![Math.floor(r() * r() * q.options!.length)]))];
      else if (q.kind === "yesno") answers[q.id] = r() < 0.6 ? "Yes" : "No";
      else {
        const pool = COMMENTS[q.id] ?? COMMENTS.change;
        if (r() < 0.55) answers[q.id] = pool[Math.floor(r() * pool.length)];
      }
    }
    out.push({ id: newId(), surveyId: sv.id, day, lang: r() < 0.18 ? "es" : "en", answers });
  }
  return out;
}

const DEMO_ANALYSIS = (n: number): Analysis => ({
  at: new Date().toISOString(), n,
  headline: "Leadership confidence fell about 12 points, mostly over how decisions are explained.",
  says: "Engagement and eNPS are up from last year, but the two questions on understanding decisions and hearing what's coming dropped the most.",
  suggests: "People hear about changes after they happen, like the summer schedule change, and want the why. Workload comments center on peak season.",
  cantConclude: "Whether this is one team or company-wide. Team results stay hidden because no team has 5 or more answers.",
  consider: "A short monthly leadership update on priorities and the reasons behind decisions, then a 3-question pulse in 90 days to see if it's working.",
  strengths: ["People help each other out (teamwork is the top area)", "Pride in the work and plans to stay are up from last year", "Most feel their manager cares about them"],
  concerns: ["Understanding why decisions are made", "Peak-season workload, especially on the events team", "Recognition after big events is uneven"],
  themes: [
    { name: "Communication", count: 24, sentiment: "negative", summary: "People often learn about decisions after they're made and want to hear the reason. Several suggest a short monthly update.", quotes: ["I found out about the new schedule from a client before my manager told me.", "Tell us the why behind decisions, not just the what."] },
    { name: "Workload", count: 14, sentiment: "negative", summary: "Peak season stretches crews thin and work feels uneven between teams.", quotes: ["Peak season is brutal. We need more hands in October."] },
    { name: "Benefits", count: 9, sentiment: "mixed", summary: "The medical plan is appreciated, but out-of-pocket costs for families come up.", quotes: ["Out of pocket costs on the medical plan are high for families."] },
    { name: "Team culture", count: 12, sentiment: "positive", summary: "Crews feel supported by each other and proud of the work.", quotes: ["The people. My crew has my back on every load-in."] },
  ],
  quickWins: ["Post the event calendar a month out", "Water and snacks on long load-in days", "Shout out crews after big events on the Team Wall"],
  actions: [
    { priority: "high", finding: "Leadership confidence down 12", action: "Monthly leadership update on priorities and the why behind decisions", timing: "Start in 30 days", metric: "\"I understand why decisions are made\" back above 65%" },
    { priority: "high", finding: "Peak-season workload", action: "Review staffing for October and post the event calendar a month out", timing: "60 days", metric: "Workload up 5 points in the spring pulse" },
    { priority: "med", finding: "Benefits cost confusion", action: "Benefits education session before open enrollment", timing: "Before renewal", metric: "Fewer benefits questions to HR" },
    { priority: "med", finding: "Recognition after events", action: "Turn on Team Wall nudges after each major event", timing: "30 days", metric: "Shoutouts per month" },
  ],
  questions: ["Which recent decisions do we wish we'd explained sooner?", "Who owns the monthly update, and what's the format?", "What would it take to add help during peak season?"],
  followUp: "Run a 3-question pulse on communication and workload in 90 days.",
});

function seed(people: TeamMember[], clientId: string): Store {
  const d = today();
  const mk = (tid: string, title: string, closedDaysAgo: number | null, invited: number): Survey => {
    const s = fromTemplate(templateById(tid)!, clientId, "HR", newToken(), newId());
    const launched = addDays(d, (closedDaysAgo ?? -4) - 7);
    return { ...s, title, status: closedDaysAgo === null ? "open" : "closed", launchedAt: `${launched}T16:00:00Z`, closedAt: closedDaysAgo === null ? undefined : `${addDays(d, -closedDaysAgo)}T17:00:00Z`, closesAt: closedDaysAgo === null ? addDays(d, 3) : addDays(d, -closedDaysAgo), invited };
  };
  const y = new Date().getFullYear();
  const last = mk("culture", `${y - 1} Culture & Engagement`, 370, 46);
  const q3 = mk("pulse", "Q3 Pulse Check", 120, 48);
  const now = mk("culture", `${y} Culture & Engagement`, 3, 50);
  const open = mk("pulse", "November Pulse Check", null, 50);
  const base = { Engagement: 0.67, Leadership: 0.74, Communication: 0.64, "My manager": 0.74, Belonging: 0.72, Recognition: 0.6, Growth: 0.62, Workload: 0.5, Teamwork: 0.8, Morale: 0.6 };
  const rs = [
    ...fakeResponses(last, 38, base, 4, last.closesAt),
    ...fakeResponses(q3, 40, { ...base, Communication: 0.52, Workload: 0.48, Morale: 0.62 }, 23, q3.closesAt),
    ...fakeResponses(now, 41, { ...base, Engagement: 0.71, Leadership: 0.62, Communication: 0.5, Recognition: 0.65, Workload: 0.47 }, 50, now.closesAt),
    ...fakeResponses(open, 12, { Workload: 0.5, Morale: 0.62, Communication: 0.6 }, 41, d),
  ];
  const count = (s: Survey) => rs.filter((r) => r.surveyId === s.id).length;
  q3.actions = [
    { id: newId(), finding: "Communication low", action: "Monthly leadership update", owner: "Alex (CEO)", due: addDays(d, -60), status: "done", priority: "high", metric: "Communication up 10 points", doneAt: addDays(d, -62) },
    { id: newId(), finding: "Manager consistency", action: "Manager expectations training", owner: "HR", due: addDays(d, 20), status: "progress", priority: "high", metric: "My manager scores up" },
    { id: newId(), finding: "Benefits awareness", action: "Benefits education session", owner: "HR", due: addDays(d, 14), status: "planned", priority: "med" },
  ];
  for (const s of [last, q3, now, open]) s.responded = count(s);
  now.analysis = DEMO_ANALYSIS(now.responded);
  return { surveys: [open, now, q3, last], responses: rs };
}

function load(people: TeamMember[], clientId: string): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {}
  const s = seed(people, clientId);
  save(s);
  return s;
}
function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

/** For the public survey page in the demo. */
export function demoSurveyByToken(token: string): { s: Survey; submit: (answers: PResponse["answers"], lang: "en" | "es") => void } | null {
  let st: Store;
  try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  const s = st?.surveys.find((x) => x.openToken === token);
  if (!s) return null;
  return {
    s,
    submit: (answers, lang) => {
      st.responses.push({ id: newId(), surveyId: s.id, day: today(), lang, answers });
      const sv = st.surveys.find((x) => x.id === s.id);
      if (sv) sv.responded = st.responses.filter((r) => r.surveyId === s.id).length;
      save(st);
    },
  };
}

const RTO_DRAFT = (prompt: string) => ({
  title: /office|rto|hybrid|remote/i.test(prompt) ? "Return to office" : "Your feedback",
  intro: "We'd like your input before we make any decisions. It's anonymous and takes about 3 minutes.",
  questions: [
    { id: "q1", kind: "agree", cat: "Schedule", text: "My current schedule works well for me." },
    { id: "q2", kind: "choice", cat: "Schedule", text: "How many days in the office would work best for you?", options: ["0", "1", "2", "3", "4", "5"] },
    { id: "q3", kind: "multi", max: 3, cat: "Schedule", text: "What would make coming into the office easier?", options: ["Shorter commute options", "Parking or transit help", "Flexible start times", "Quiet space to focus", "Team days on the same day", "Nothing, it's fine"] },
    { id: "q4", kind: "agree", cat: "Teamwork", text: "Do you agree that working together in person improves teamwork and communication?" },
    { id: "q5", kind: "agree", cat: "Focus", text: "I can focus well where I work now." },
    { id: "q6", kind: "choice", cat: "Commute", text: "How long is your commute to the office, one way?", options: ["Under 15 minutes", "15 to 30 minutes", "30 to 60 minutes", "Over an hour"] },
    { id: "q7", kind: "text", text: "What concerns, if any, do you have about a change to the office schedule?" },
    { id: "q8", kind: "text", text: "What would make an office day worth the trip?" },
  ] as PQ[],
});

function demoBias(qs: PQ[]) {
  const out: { id: string; issue: string; suggestion: string }[] = [];
  for (const q of qs) {
    if (/\bdo you agree\b|\bdon't you\b|\bisn't it\b/i.test(q.text)) out.push({ id: q.id, issue: "Leading: it tells people the answer you expect.", suggestion: q.text.replace(/^do you agree that\s*/i, "").replace(/\?$/, ".").replace(/^./, (c) => c.toUpperCase()) });
    if (/\band\b/i.test(q.text) && q.kind !== "text" && /\b(and)\b.*\b(communication|teamwork|pay|benefits|support)\b/i.test(q.text)) out.push({ id: q.id, issue: "Double-barreled: two ideas in one question, so you can't tell which one they're answering.", suggestion: "Split it into two questions, one for each idea." });
  }
  if (qs.length > 25) out.push({ id: "length", issue: `${qs.length} questions is long for this kind of survey. Response rates drop after about 8 minutes.`, suggestion: "Cut to the questions you'll act on." });
  return out;
}

export async function pulseApi(clientId: string, body: Res, demo?: PulseDemo): Promise<Res> {
  if (LIVE) {
    try {
      const r = await fetch("/api/pulse", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ ...body, clientId }) });
      return await r.json();
    } catch {
      return { ok: false, reason: "network" };
    }
  }
  if (!demo) return { ok: false, reason: "demo" };
  const people = demo.people.filter((p) => p.clientId === clientId && p.active !== false);
  const st = load(people, clientId);
  const a = String(body.action);
  const find = () => st.surveys.find((s) => s.id === body.id);
  const done = (out: Res) => { save(st); return { ok: true, demo: true, ...out }; };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // close anything past its date, like the daily job does
  for (const s of st.surveys) if (s.status === "open" && s.closesAt < today()) Object.assign(s, { status: "closed", closedAt: new Date().toISOString() });

  if (a === "list") return done({ surveys: st.surveys, today: today() });
  if (a === "create") {
    const t = templateById(String(body.templateId ?? ""));
    const base = fromTemplate(t ?? { id: "", title: "New survey", blurb: "", minutes: 3, intro: "", questions: [] }, clientId, demo.me, newToken(), newId());
    const s = t ? base : cleanSurvey(body.survey ?? {}, { ...base, templateId: undefined });
    st.surveys.unshift(s);
    return done({ survey: s });
  }
  if (a === "save") {
    const cur = st.surveys.find((s) => s.id === body.survey?.id);
    if (!cur) return { ok: false, reason: "not_found" };
    const c = cleanSurvey(body.survey, cur);
    Object.assign(cur, cur.status === "draft" ? c : { title: c.title, closesAt: c.closesAt });
    return done({ survey: cur });
  }
  if (a === "ai") {
    await wait(1100);
    if (body.op === "build") return { ok: true, demo: true, draft: RTO_DRAFT(String(body.prompt ?? "")) };
    if (body.op === "bias") return { ok: true, demo: true, issues: demoBias(body.questions ?? []) };
    if (body.op === "message") {
      const s = find();
      return { ok: true, demo: true, message: `Thank you to the ${s?.responded ?? 0} of you who shared feedback in "${s?.title ?? "our survey"}".\n\nWhat's going well: you told us this is a team that has each other's back, and more of you are proud to work here than last year.\n\nWhat we heard: you want to hear the why behind decisions sooner, peak season stretches crews thin, and recognition after big events is uneven.\n\nWhat we're doing:\n• Starting next month, a short monthly update from leadership on what's coming and why.\n• Reviewing October staffing and posting the event calendar a month out.\n• Team Wall shoutouts after every major event.\n\nWe'll check in with a short pulse in the spring to see if it's working.\n\nThe leadership team` };
    }
    return { ok: false, reason: "bad_request" };
  }
  const s = find();
  if (!s) return { ok: false, reason: "not_found" };
  if (a === "delete") { st.surveys = st.surveys.filter((x) => x !== s); st.responses = st.responses.filter((r) => r.surveyId !== s.id); return done({}); }
  if (a === "launch") {
    const who = s.audience.all ? people : people.filter((p) => s.audience.personIds?.includes(p.id));
    // the live Alza Hub writes the Spanish version with AI at launch; the demo only has it for surveys that ship with it
    Object.assign(s, { status: "open", launchedAt: new Date().toISOString(), invited: who.length });
    return done({ survey: s, sent: who.filter((p) => p.email).length, noEmail: who.filter((p) => !p.email).length });
  }
  if (a === "remind") { s.reminded = [...(s.reminded ?? []), today()]; return done({ sent: Math.max(0, s.invited - s.responded) }); }
  if (a === "close") { Object.assign(s, { status: "closed", closedAt: new Date().toISOString() }); return done({ survey: s }); }
  if (a === "reopen") { Object.assign(s, { status: "open", closedAt: undefined, closesAt: String(body.closesAt || addDays(today(), 3)) }); return done({ survey: s }); }
  if (a === "results") {
    const rs = st.responses.filter((r) => r.surveyId === s.id);
    const prevSv = st.surveys.filter((y) => y.id !== s.id && y.templateId === s.templateId && y.status === "closed" && (y.closedAt ?? "") < (s.closedAt ?? s.launchedAt ?? "9")).sort((p, q) => (q.closedAt ?? "").localeCompare(p.closedAt ?? ""))[0];
    const summary = summarize(s, rs, prevSv ? { sv: prevSv, rs: st.responses.filter((r) => r.surveyId === prevSv.id) } : undefined);
    const names = people.map((p) => p.name);
    for (const q of summary.qs) if (q.comments) q.comments = q.comments.map((c) => redact(c, names));
    return { ok: true, demo: true, summary };
  }
  if (a === "analyze") {
    await wait(1500);
    const n = st.responses.filter((r) => r.surveyId === s.id).length;
    if (n < MIN_GROUP) return { ok: false, reason: "too_few" };
    s.analysis = DEMO_ANALYSIS(n);
    return done({ survey: s });
  }
  if (a === "actions") { s.actions = cleanActions(body.actions); return done({ survey: s }); }
  if (a === "message") { s.message = String(body.message ?? ""); return done({ survey: s }); }
  return { ok: false, reason: "bad_request" };
}

export { TEMPLATES, iso };
