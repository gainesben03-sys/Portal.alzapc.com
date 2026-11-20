"use client";

// Alza Perform in the browser. Live: every call goes to /api/perform, which checks who's asking.
// Public demo: the same actions run in this browser with made-up reviews, so the flow can be tried end to end.
import {
  addDays, daysUntil, docOf, iso, Lang, negativeReviews, newId, newReview, newToken, nextDue, PerformSettings, performFor, PIP_TEMPLATE,
  Review, SELF_Q, stageOf, templateById,
} from "./perform";
import { authHeader, LIVE } from "./supabase";
import type { TeamLog, TeamMember } from "./team";

const KEY = "alza-demo-perform-v1";
export type ListData = {
  role: { admin: boolean; exec: boolean; ben: boolean; email: string };
  settings: PerformSettings;
  reviews: Review[];
  upcoming: { personId: string; kind: "cycle" | "intro"; due: string; name: string; title: string; managerName: string }[];
  people: { id: string; name: string; title: string; managerName: string; managerEmail: string; hireDate?: string; department?: string; hasEmail: boolean }[];
  insight: { manager: string; total: number; done: number; overdue: number; waiting: number; below: number; meets: number; above: number }[];
  pipFlags: string[];
  users: { name: string; email: string; access: string }[];
};
export type GetData = { review: Review; canEdit: boolean; admin: boolean; notes: { date: string; notes: string }[]; prevGoals: Review["goals"]; past: { id: string; kind: string; due: string; overall?: number; scale: 3 | 5 }[]; negatives: number; hasEmail: boolean; company: string };
type Demo = { people: TeamMember[]; checkins: TeamLog[]; settings?: Partial<PerformSettings>; me: { email: string; name: string; advisor: boolean; exec: boolean }; company: string; users?: { name: string; email: string; access: string }[]; saveSettings: (s: PerformSettings) => void };
type Res = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function seed(people: TeamMember[], clientId: string): Review[] {
  const s = performFor({});
  const today = iso(new Date());
  const find = (id: string) => people.find((p) => p.id === id);
  const out: Review[] = [];
  const mk = (pid: string, kind: Review["kind"], due: string, f: (r: Review) => Review) => {
    const p = find(pid);
    if (!p) return;
    const t = kind === "pip" ? PIP_TEMPLATE : templateById(s, kind === "intro" ? "intro" : "scorecard");
    out.push(f(newReview({ ...p, active: true }, clientId, { kind, due, periodStart: p.hireDate && p.hireDate > addDays(due, -365) ? p.hireDate : addDays(due, -365), periodEnd: due }, t, "Alza")));
  };
  mk("pp2", "cycle", addDays(today, 9), (r) => ({ ...r, id: "rv-demo-1", self: { token: newToken(), sentAt: addDays(today, -4) + "T16:00:00Z", doneAt: addDays(today, -2) + "T18:00:00Z", lang: "en", answers: [
    { q: SELF_Q[0].en, a: "Getting the new inventory counts down to one day instead of three." },
    { q: SELF_Q[1].en, a: "Keeping up when two big events load out the same week." },
    { q: SELF_Q[2].en, a: "Planning ahead for the busy season. I want to learn the forecasting sheet." },
    { q: SELF_Q[3].en, a: "A little more notice when orders change." },
  ] } }));
  mk("pp1", "cycle", addDays(today, 20), (r) => ({ ...r, id: "rv-demo-2", ratings: { quality: 4, comm: 3, team: 5 }, answers: { well: "crew trusts him, trains new people without being asked" } }));
  mk("pp4", "cycle", addDays(today, -400), (r) => ({ ...r, id: "rv-demo-0", status: "done", overall: 2, ratings: { quality: 2, comm: 2, team: 3, reliable: 2, know: 3, init: 2 }, written: { well: "Chris is friendly with customers and helps on install days.", work: "Several late arrivals this year and two orders went out incomplete. Chris needs to arrive on time and double-check orders before they leave.", help: "Dana will check in weekly." }, finalAt: addDays(today, -398) + "T17:00:00Z", share: { how: "person", at: addDays(today, -398) + "T17:00:00Z", deliveredAt: addDays(today, -396) + "T17:00:00Z" } }));
  mk("pp4", "cycle", addDays(today, -12), (r) => ({ ...r, id: "rv-demo-3", status: "shared", overall: 2, ratings: { quality: 2, comm: 3, team: 3, reliable: 1, know: 3, init: 2 }, written: { well: "Chris is great with customers on site.", work: "Arrived late 6 times since August and missed the start of two installs. Orders still go out without a final check.", help: "Dana will meet with Chris every Monday to plan the week." }, goals: [{ id: "g1", text: "On time for every scheduled shift", measure: "Time clock", by: "Ongoing", status: "not_started" }], finalAt: addDays(today, -10) + "T17:00:00Z", share: { how: "link", token: newToken(), at: addDays(today, -10) + "T17:00:00Z", viewedAt: addDays(today, -9) + "T15:00:00Z" } }));
  mk("pp5", "cycle", addDays(today, -330), (r) => ({ ...r, id: "rv-demo-4", status: "done", overall: 4, ratings: { quality: 4, comm: 5, team: 4, reliable: 4, know: 4, init: 4 }, written: { well: "Dana keeps the office running and the team calm on busy days.", work: "Delegate more of the scheduling so there's time for planning.", help: "Alex will cover vendor calls on Fridays." }, finalAt: addDays(today, -332) + "T17:00:00Z", share: { how: "link", token: newToken(), at: addDays(today, -332) + "T17:00:00Z", ackAt: addDays(today, -331) + "T17:00:00Z" } }));
  return out;
}
function getAll(people: TeamMember[], clientId: string): Review[] {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return (JSON.parse(s) as Review[]);
  } catch {}
  const r = seed(people, clientId);
  putAll(r);
  return r;
}
function putAll(l: Review[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {}
}

// a light cleanup for the demo, since the writing help needs the live portal
const tidy = (t: string) => t.trim().replace(/\s+/g, " ").replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, "I").replace(/([^.!?])$/, "$1.");
// The demo can't call the writing model, so it shapes notes into a review with simple rules.
// The live portal writes a real narrative from the same notes.
const BE: Record<string, string> = { is: "are", has: "have", was: "were", does: "do", "doesn't": "don't", "isn't": "aren't", "hasn't": "haven't", "wasn't": "weren't" };
function toYou(pt: string, name: string, voice: string) {
  let x = pt.trim().replace(/[.!?]+$/, "");
  if (!x) return "";
  const nm = new RegExp(`\\b${name}\\b`, "gi");
  if (voice === "about") {
    x = x.replace(/\b(he|she)\b/gi, name).replace(/\b(him|her)\b/gi, name).replace(/\b(his|hers)\b/gi, `${name}'s`);
    const w = x.split(" ")[0].toLowerCase();
    if (/^[a-z]+s$/.test(w) && !/(ss|us)$/.test(w) && !["is", "has", "was"].includes(w) || ["is", "has", "was"].includes(w)) x = `${name} ${x[0].toLowerCase()}${x.slice(1)}`;
    return x;
  }
  x = x.replace(nm, "you").replace(/\b(he|she)\s+(\w+)/gi, (_m, _p, v: string) => `you ${BE[v.toLowerCase()] ?? v.replace(/([^s])s$/, "$1").replace(/ie$/, "y")}`).replace(/\b(him|her)\b/gi, "you").replace(/\b(his)\b/gi, "your");
  const w = x.split(" ")[0].toLowerCase();
  if (BE[w]) x = `you ${BE[w]}${x.slice(w.length)}`;
  else if (/^[a-z]+s$/.test(w) && !/(ss|us)$/.test(w)) x = `you ${w.replace(/ies$/, "y").replace(/([^s])s$/, "$1")}${x.slice(w.length)}`;
  return x;
}
const joinPts = (pts: string[]) => (pts.length <= 1 ? pts.join("") : `${pts.slice(0, -1).join(", ")} and ${pts[pts.length - 1]}`);
function demoNarrative(id: string, notes: string, fullName: string, voice: string, tone: string) {
  const name = fullName.split(" ")[0] || "they";
  const pts = notes.split(/(?<=[.!?])\s+|,\s*|;\s*|\s+and\s+|\n+/i).map((p) => toYou(p, name, voice)).filter(Boolean);
  if (!pts.length) return "";
  const you = voice !== "about";
  const lead = (p: string) => p.replace(/^(crew|team|staff|office|warehouse)\b/i, "the $1").replace(/^you\b/, "You").replace(/^./, (c) => c.toUpperCase());
  const body = joinPts(pts);
  const strengths = ["well", "strengths", "wins", "continue", "standout"];
  const grow = ["work", "improve", "skills", "start", "stop"];
  const help = ["help", "support"];
  let out: string;
  if (strengths.includes(id)) {
    out = you ? `You've had a strong period, ${name}. ${lead(body)}.` : `${name} has had a strong period. ${lead(body)}.`;
    if (tone !== "shorter") out += you ? " Keep doing this. It makes a real difference." : ` ${name} should keep doing this. It makes a real difference.`;
    if (tone === "warmer") out += you ? " I appreciate the work you put in." : ` The work ${name} puts in is appreciated.`;
  } else if (grow.includes(id)) {
    out = you ? `The main area to focus on next is this: ${body}.` : `The main area for ${name} to focus on next: ${body}.`;
    if (tone !== "shorter") out += you ? " Let's make this the focus between now and your next review, and we'll check progress along the way." : " This will be the focus before the next review, with progress checked along the way.";
  } else if (help.includes(id)) {
    const VERB = /^(pair|walk|train|meet|check|give|set|schedule|cover|show|send|help|coach|review|provide|make|get|find|sign|teach|shadow|introduce|share|talk|sit|book|add|take|buy|order)\b/i;
    const acts = pts.map((p) => (p.startsWith("you ") ? p.replace(/^you/, you ? "you" : name) : VERB.test(p) ? `I'll ${p}` : `we'll set up ${p}`));
    out = `Here's how I'll support ${you ? "you" : name}: ${joinPts(acts)}.`;
    if (tone !== "shorter") out += you ? " If something isn't working, tell me and we'll adjust." : ` If something isn't working, ${name} can raise it and we'll adjust.`;
  } else out = `${lead(body)}.`;
  return out.replace(/\.\./g, ".").replace(/\s+/g, " ").trim();
}

function demoSort(transcript: string, asks: { id: string }[]) {
  const parts = transcript.split(/(?<=[.!?])\s+|,\s+(?:but|though|and also)\s+/i).map((x) => x.trim()).filter(Boolean);
  const out: Record<string, string[]> = Object.fromEntries(asks.map((a) => [a.id, []]));
  const ids = asks.map((a) => a.id);
  for (const p of parts) {
    const k = /\b(i'?ll|i will|gonna|going to|pair|help|train|support)\b/i.test(p) && ids.includes("help") ? "help" : /\b(need|needs|should|wrong|late|miss|but|though|waits|work on)\b/i.test(p) && ids.includes("work") ? "work" : ids[0];
    out[k].push(p);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length ? tidy(v.join(" ")) : ""]));
}

export async function performApi(clientId: string, body: Res, demo?: Demo): Promise<Res> {
  if (LIVE) {
    const r = await fetch("/api/perform", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, ...body }) });
    return r.json().catch(() => ({ ok: false, reason: "error" }));
  }
  if (!demo) return { ok: false, reason: "demo" };
  const s = performFor({ admins: ["alex@example.com"], ...(demo.settings ?? {}) });
  const people = demo.people.filter((p) => p.clientId === clientId);
  let all = getAll(people, clientId);
  const role = { admin: demo.me.advisor || s.admins.includes(demo.me.email), exec: demo.me.exec, ben: demo.me.advisor, email: demo.me.email };
  const save = (r: Review) => { all = all.some((x) => x.id === r.id) ? all.map((x) => (x.id === r.id ? r : x)) : [r, ...all]; putAll(all); return r; };
  const log = (r: Review, text: string): Review => ({ ...r, history: [...r.history, { at: new Date().toISOString(), by: demo.me.name, text }] });
  const today = iso(new Date());
  const a = body.action;
  if (a === "settings") { demo.saveSettings(body.settings); return { ok: true, settings: body.settings }; }
  if (a === "list") {
    const visiblePeople = role.admin ? people.filter((p) => p.active !== false) : people.filter((p) => p.managerEmail?.toLowerCase() === role.email);
    const reviews = all.filter((r) => role.admin || r.managerEmail === role.email || (role.exec && s.execRead));
    const upcoming = visiblePeople.flatMap((p) => nextDue({ ...p, active: true }, s, today, 1).filter((d) => daysUntil(d.due, today) <= 150 && !all.some((r) => r.personId === p.id && r.kind === d.kind && Math.abs(daysUntil(r.due, d.due)) < 45)).map((d) => ({ ...d, name: p.name, title: p.title, managerName: p.managerName })));
    const byMgr: ListData["insight"] = [];
    for (const r of all.filter((x) => x.status !== "cancelled" && x.kind !== "pip" && x.due >= addDays(today, -365))) {
      let m = byMgr.find((x) => x.manager === r.managerName);
      if (!m) byMgr.push((m = { manager: r.managerName, total: 0, done: 0, overdue: 0, waiting: 0, below: 0, meets: 0, above: 0 }));
      m.total++;
      const st = stageOf(r, s);
      if (st === "done") m.done++;
      if (st === "overdue") m.overdue++;
      if (st === "waiting") m.waiting++;
      if (r.overall && ["final", "shared", "done"].includes(r.status)) { const mid = r.template.scale === 5 ? 3 : 2; if (r.overall < mid) m.below++; else if (r.overall === mid) m.meets++; else m.above++; }
    }
    const pipFlags = role.admin ? [...new Set(all.map((r) => r.personId))].filter((pid) => { const n = negativeReviews(all, pid); return n.length >= s.pipAfter && !all.some((r) => r.personId === pid && r.kind === "pip" && r.status !== "cancelled" && r.createdAt > n[0].createdAt); }) : [];
    return { ok: true, role, settings: s, reviews, upcoming, people: visiblePeople.map((p) => ({ id: p.id, name: p.name, title: p.title, managerName: p.managerName, managerEmail: p.managerEmail?.toLowerCase(), hireDate: p.hireDate, department: p.department, hasEmail: !!p.email })), insight: byMgr, pipFlags, users: role.admin ? demo.users ?? [] : [] };
  }
  if (a === "launch") {
    if (!role.admin) return { ok: false, reason: "forbidden" };
    const ids = new Set((body.personIds as string[]) ?? []);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due ?? "")) ? String(body.due) : addDays(today, 30);
    const t = templateById(s, String(body.template ?? "") || s.template);
    let created = 0, selfSent = 0;
    const skipped: { name: string; why: string }[] = [];
    const mgrs = new Set<string>();
    for (const p of people) {
      if (!ids.has(p.id)) continue;
      if (!p.managerEmail) { skipped.push({ name: p.name, why: "no manager on the roster" }); continue; }
      if (all.some((r) => r.personId === p.id && r.status === "open" && r.kind !== "pip")) { skipped.push({ name: p.name, why: "already has a review open" }); continue; }
      let r = newReview({ ...p, active: true }, clientId, { kind: "cycle", due, periodStart: p.hireDate && p.hireDate > addDays(due, -365) ? p.hireDate : addDays(due, -365), periodEnd: due }, t, demo.me.name);
      r = log({ ...r, ...(body.self === "skip" ? { noSelf: true } : {}), ...(body.self === "now" ? { self: { token: newToken(), sentAt: new Date().toISOString(), lang: r.lang } } : {}) }, "Launched by HR");
      if (body.self === "now") selfSent++;
      save(r); // save() already adds it to the list
      created++;
      mgrs.add(r.managerEmail);
    }
    return { ok: true, created, skipped, selfSent, managers: body.notify === false ? 0 : mgrs.size, demo: true };
  }
  if (a === "remindAll") {
    const open = all.filter((r) => r.status === "open" && ["not_started", "in_progress", "overdue"].includes(stageOf(r, s)));
    return { ok: true, managers: new Set(open.map((r) => r.managerEmail)).size, reviews: open.length, demo: true };
  }
  if (a === "start") {
    const p = people.find((q) => q.id === body.personId);
    if (!p) return { ok: false, reason: "not_found" };
    const kind = body.kind === "pip" ? "pip" : body.kind === "intro" ? "intro" : "adhoc";
    const t = kind === "pip" ? PIP_TEMPLATE : templateById(s, kind === "intro" ? s.intro.template : s.template);
    const last = all.filter((r) => r.personId === p.id && ["final", "shared", "done"].includes(r.status)).sort((x, y) => (x.due < y.due ? 1 : -1))[0];
    let r = newReview({ ...p, active: true }, clientId, { kind, due: kind === "pip" ? today : addDays(today, 14), periodStart: last?.periodEnd ?? p.hireDate ?? addDays(today, -365), periodEnd: today }, t, demo.me.name);
    if (kind === "pip" && last) { const w = (last.written.work || last.answers.work || "").trim(); if (w) r = { ...r, pip: { ...r.pip!, issues: [{ id: newId(), what: w, expected: "", support: "" }] } }; }
    return { ok: true, review: save(r) };
  }
  const r = all.find((x) => x.id === body.id);
  if (!r) return { ok: false, reason: "not_found" };
  if (a === "get") {
    const past = all.filter((q) => q.personId === r.personId && q.id !== r.id && ["final", "shared", "done"].includes(q.status)).sort((x, y) => (x.due < y.due ? 1 : -1));
    const notes = demo.checkins.filter((c) => c.personId === r.personId && c.kind === "checkin" && c.notes?.trim()).map((c) => ({ date: c.date, notes: c.notes }));
    const demoNotes = notes.length ? notes : r.personId === "pp2" ? [{ date: addDays(today, -60), notes: "Counts are way faster since the new process. Asked about learning the forecasting sheet." }, { date: addDays(today, -21), notes: "Two event orders changed last minute. Sam handled it but was stressed." }] : [];
    return { ok: true, review: r, canEdit: role.admin || r.managerEmail === role.email, admin: role.admin, notes: demoNotes, prevGoals: past[0]?.goals ?? [], past: past.map((q) => ({ id: q.id, kind: q.kind, due: q.due, overall: q.overall, scale: q.template.scale })), negatives: negativeReviews(all, r.personId).length, hasEmail: true, company: demo.company };
  }
  if (a === "save") {
    if (r.status !== "open") return { ok: false, reason: "locked" };
    const p = body.patch as Partial<Review>;
    const next = { ...r, ...p, pip: p.pip ? { ...p.pip, hrReviewed: role.admin ? p.pip.hrReviewed : r.pip?.hrReviewed } : r.pip } as Review;
    return { ok: true, review: save(next) };
  }
  if (a === "ai") {
    if (body.op === "polish") {
      const written: Record<string, string> = {};
      for (const [k, v] of Object.entries((body.answers ?? r.answers) as Record<string, string>)) if (v?.trim()) written[k] = demoNarrative(k, v, r.name, String(body.voice ?? "you"), String(body.tone ?? ""));
      return { ok: true, written, vague: [], demo: true };
    }
    if (body.op === "sort") return { ok: true, answers: demoSort(String(body.transcript ?? ""), r.template.ask), vague: [], demo: true };
    if (body.op === "translate") return { ok: true, fields: body.fields, demo: true };
    if (body.op === "goals") {
      // demo: turn each "work on" point into a goal; the live portal writes these with AI from the same notes
      const src = [r.answers.work, r.answers.improve, r.answers.start, r.answers.skills].filter(Boolean).join(". ");
      if (!src.trim() && !Object.values(r.answers).some((v) => v?.trim())) return { ok: false, reason: "empty" };
      const pts = (src || Object.values(r.answers).join(". ")).split(/(?<=[.!?])\s+|;\s*|\n+/).map((x) => x.trim().replace(/[.!?]+$/, "")).filter((x) => x.length > 6).slice(0, 3);
      const es = body.lang === "es";
      const goals = pts.map((x) => ({ text: (es ? "Mejorar: " : "Get better at: ") + x.replace(/^(needs to|need to|should|has to)\s+/i, ""), measure: es ? "El gerente ve avance constante en los seguimientos" : "Steady progress the manager can see at check-ins", by: es ? "Para la próxima evaluación" : "By the next review" }));
      return { ok: true, goals, demo: true };
    }
  }
  if (a === "finalize") {
    if (r.kind === "pip" && !r.pip?.hrReviewed) return { ok: false, reason: "hr_review" };
    const at = new Date().toISOString();
    const how = body.how === "person" ? "person" : "link";
    const next = log({ ...r, status: "shared", finalAt: at, finalBy: demo.me.name, share: { how, at, ...(how === "link" ? { token: newToken() } : {}) } }, how === "link" ? "Finalized and sent" : "Finalized, to go over in person");
    return { ok: true, review: save(next), doc: docOf(next, demo.company) };
  }
  if (a === "delivered") return { ok: true, review: save(log({ ...r, status: "done", share: { ...r.share!, deliveredAt: new Date().toISOString() } }, "Delivered in person")) };
  if (a === "amend") return { ok: true, review: save(log({ ...r, status: "open", share: undefined, versions: [...(r.versions ?? []), { at: new Date().toISOString(), by: demo.me.name, note: body.note || "Reopened" }] }, "Reopened as a new version")) };
  if (a === "remind") return { ok: true };
  if (a === "sendSelf") return { ok: true, review: save(log({ ...r, self: { ...(r.self ?? {}), token: r.self?.token ?? newToken(), sentAt: new Date().toISOString(), lang: r.lang } }, "Self-assessment sent")) };
  if (a === "cancel") return { ok: true, review: save(log({ ...r, status: "cancelled" }, "Cancelled")) };
  return { ok: false, reason: "bad_request" };
}

export const demoStart = { reset: () => { try { localStorage.removeItem(KEY); } catch {} } };
export type { Lang };
