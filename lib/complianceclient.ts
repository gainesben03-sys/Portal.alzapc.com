"use client";

// Required training in the browser. Live: every call goes to /api/compliance, which checks who's asking.
// Public demo: the same actions run in this browser with made-up records, so the flow can be tried end to end.
import {
  addMonths, cleanCompliance, ComplianceSettings, complianceFor, logRec, newRecord, nextAssignment, supervisorIds, appliesTo, TrainingRecord, Variant,
} from "./compliance";
import { addDays, iso, newId, newToken } from "./perform";
import { authHeader, LIVE } from "./supabase";
import type { TeamMember } from "./team";

const KEY = "alza-demo-training-v1";
export type Person = { id: string; name: string; title: string; managerName: string; hasEmail: boolean; sup: boolean; hireDate?: string };
export type ListData = { ok: true; role: { admin: boolean }; settings: ComplianceSettings; records: TrainingRecord[]; people: Person[]; today: string };
type Res = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Demo = { people: TeamMember[]; me: { email: string; admin: boolean } };

type Store = { settings: ComplianceSettings; records: TrainingRecord[] };

function seed(people: TeamMember[], clientId: string): Store {
  const today = iso(new Date());
  const s: ComplianceSettings = { ...complianceFor({}), startedAt: addDays(today, -400), live: true };
  s.courses = s.courses.map((c) => (c.id === "ca-violence" ? { ...c, on: true, planName: "Harborlight Workplace Violence Prevention Plan.pdf", qa: "Thursday, Jan 8 at 12:00 on video", videoUrl: "" } : c));
  const sups = supervisorIds(people, s);
  const records: TrainingRecord[] = [];
  const active = people.filter((p) => p.active !== false);
  active.forEach((p, i) => {
    const token = newToken();
    for (const c of s.courses) {
      const sup = sups.has(p.id);
      const v: Variant | undefined = c.kind === "crd" ? (sup ? "supervisor" : "employee") : undefined;
      const r = newRecord(p, clientId, c, { due: addDays(today, 200), reason: "start", variant: v }, token);
      const k = (i + (c.kind === "plan" ? 2 : 0)) % 7;
      const done = (d: string): TrainingRecord => ({ ...r, status: "approved", completedAt: d, approvedAt: d + "T18:00:00Z", approvedBy: "People Hub (certificate checked)", due: d, attest: true, sentAt: d + "T10:00:00Z" });
      if (k === 0 || k === 3 || k === 5) records.push(done(addDays(today, -120 - i * 9)));
      else if (k === 1) records.push(done(c.everyMonths ? addDays(addMonths(today, -c.everyMonths), 40) : addDays(today, -60)));
      else if (k === 2) records.push({ ...r, due: addDays(today, -12), sentAt: addDays(today, -70) + "T10:00:00Z" });
      else if (k === 4 && c.kind === "crd") records.push({ ...r, status: "submitted", submittedAt: addDays(today, -1) + "T20:00:00Z", file: { path: "demo", name: "IMG_4417.jpg", mime: "image/jpeg" }, attest: true, sentAt: addDays(today, -30) + "T10:00:00Z", due: addDays(today, 30),
        ai: { name: p.name, course: sup ? "Sexual Harassment Prevention Training for Nonsupervisory Employees" : "Sexual Harassment Prevention Training", variant: "employee", date: addDays(today, -1), flags: sup ? ["This is the 1-hour employee course. Supervisors need the 2-hour course."] : ["The bottom of the page is cut off. Please check the date."] } });
      else if (k === 6 && c.kind === "plan") records.push({ ...r, due: addDays(today, 24), sentAt: addDays(today, -8) + "T10:00:00Z", questions: [{ id: newId(), q: "If a customer gets aggressive at an event after hours, do I call the lead or 911 first?", at: addDays(today, -1) + "T22:00:00Z" }] });
      else records.push(done(addDays(today, -30 - i * 5)));
    }
  });
  return { settings: s, records };
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

/** Same sync the server runs, for the demo. */
function demoSync(st: Store, people: TeamMember[], clientId: string) {
  const today = iso(new Date());
  const sups = supervisorIds(people, st.settings);
  for (const p of people) {
    const mine = st.records.filter((r) => r.personId === p.id);
    const token = mine.find((r) => r.token)?.token ?? newToken();
    for (const c of st.settings.courses) {
      const list = mine.filter((r) => r.courseId === c.id);
      const live = p.active !== false && c.on && appliesTo(c, sups.has(p.id));
      const open = list.find((r) => ["assigned", "sentback", "submitted"].includes(r.status));
      if (!live) { if (open && open.status !== "submitted") open.status = "cancelled"; continue; }
      if (open) continue;
      const a = nextAssignment(p, c, sups.has(p.id), list, st.settings, today);
      if (a) st.records.push({ ...newRecord(p, clientId, c, a, token), sentAt: st.settings.live ? new Date().toISOString() : undefined });
    }
  }
}

export async function trainingApi(clientId: string, body: Res, demo?: Demo): Promise<Res> {
  if (LIVE) {
    try {
      const r = await fetch("/api/compliance", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ ...body, clientId }) });
      return await r.json();
    } catch {
      return { ok: false, reason: "network" };
    }
  }
  if (!demo) return { ok: false, reason: "demo" };
  const people = demo.people.filter((p) => p.clientId === clientId);
  const st = load(people, clientId);
  const admin = demo.me.admin;
  const by = admin ? "HR" : "Manager";
  const find = (id: unknown) => st.records.find((r) => r.id === id);
  const done = (out: Res) => { save(st); return { ok: true, demo: true, ...out }; };
  const a = String(body.action);

  if (a === "list") {
    demoSync(st, people, clientId);
    save(st);
    const sups = supervisorIds(people, st.settings);
    const me = demo.me.email.toLowerCase();
    const mine = (p: TeamMember) => admin || (p.managerEmail || "").toLowerCase() === me;
    return {
      ok: true, demo: true, role: { admin }, settings: st.settings, today: iso(new Date()),
      records: st.records.filter((r) => r.status !== "cancelled" && (admin || r.managerEmail === me)),
      people: people.filter((p) => p.active !== false && mine(p)).map((p) => ({ id: p.id, name: p.name, title: p.title, managerName: p.managerName, hasEmail: !!p.email, sup: sups.has(p.id), hireDate: p.hireDate })),
    };
  }
  if (!admin && a !== "remind") return { ok: false, reason: "forbidden" };
  if (a === "settings") { st.settings = cleanCompliance(body.settings, st.settings); return done({ settings: st.settings }); }
  if (a === "launch") { st.settings.live = true; demoSync(st, people, clientId); return done({ sent: new Set(st.records.filter((r) => r.status === "assigned").map((r) => r.personId)).size }); }
  if (a === "approve") {
    const r = find(body.id); if (!r) return { ok: false, reason: "not_found" };
    Object.assign(r, logRec({ ...r, status: "approved", completedAt: String(body.date || r.ai?.date || iso(new Date())), approvedAt: new Date().toISOString(), approvedBy: by, note: undefined }, by, "Approved"));
    demoSync(st, people, clientId);
    return done({ record: r });
  }
  if (a === "sendback") { const r = find(body.id); if (!r) return { ok: false }; Object.assign(r, logRec({ ...r, status: "sentback", note: String(body.note || "Please upload it again.") }, by, "Sent back")); return done({ record: r, emailed: true }); }
  if (a === "remind") return done({});
  if (a === "answer") {
    const r = find(body.id); if (!r) return { ok: false };
    r.questions = r.questions.map((q) => (q.id === body.qid ? { ...q, answer: String(body.text), answeredAt: new Date().toISOString(), by } : q));
    return done({ record: r, emailed: true });
  }
  if (a === "record") {
    const c = st.settings.courses.find((y) => y.id === body.courseId); const p = people.find((y) => y.id === body.personId);
    if (!c || !p) return { ok: false, reason: "bad_request" };
    const open = st.records.find((r) => r.personId === p.id && r.courseId === c.id && ["assigned", "sentback", "submitted"].includes(r.status));
    const token = st.records.find((r) => r.personId === p.id)?.token ?? newToken();
    const base = open ?? newRecord(p, clientId, c, { due: String(body.date), reason: "manual", variant: c.kind === "crd" ? (body.variant as Variant) || "employee" : undefined }, token);
    const next = logRec({ ...base, status: "approved", completedAt: String(body.date), approvedAt: new Date().toISOString(), approvedBy: by, attest: true }, by, "Recorded by HR");
    if (open) Object.assign(open, next); else st.records.push(next);
    demoSync(st, people, clientId);
    return done({ record: next });
  }
  if (a === "link") return done({ url: `${location.origin}/training/demo` });
  if (a === "file") return { ok: false, reason: "demo" };
  if (a === "planUpload") return { ok: false, reason: "demo" };
  return { ok: false, reason: "bad_request" };
}
