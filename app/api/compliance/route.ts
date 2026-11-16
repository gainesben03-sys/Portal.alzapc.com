// Required training: everything HR, executives and managers do goes through here.
// POST { clientId, action, ... }:
//   list                             assignments you can see (admins: everyone; managers: their team)
//   settings { settings }            courses, reminders, who checks certificates (admins)
//   launch                           start emailing people their assignments (admins)
//   approve { id, date? }            accept a certificate or record (admins)
//   sendback { id, note }            ask the person to fix their upload (admins)
//   remind { id }                    email the person now (admins, or their manager)
//   answer { id, qid, text }         answer a question asked during training (admins)
//   record { personId, courseId, date, variant? }   log a completion done elsewhere, e.g. live training (admins)
//   file { id }                      a short-lived link to someone's certificate (admins)
//   planUpload { courseId, name, mime }   a signed upload for your workplace violence plan or policy (admins)
//   link { personId }                that person's private training link, to text or print (admins)
import { NextResponse } from "next/server";
import { cleanCompliance, complianceFor, Course, logRec, newRecord, supervisorIds, TrainingRecord, Variant } from "@/lib/compliance";
import {
  allRecords, answerEmail, tableReady, getRecord, linkFor, loadCtx, putRecord, reminderEmail, roleOf, saveSettings, send, sendAssignments, sentBackEmail, sync,
} from "@/lib/complianceserver";
import { daysBetween } from "@/lib/compliance";
import { iso, newToken } from "@/lib/perform";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.memberOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const x = await loadCtx(db, clientId);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  if (!x.cfg.modules?.compliance) return json({ ok: false, reason: "off" }, 403);
  const role = roleOf(who, x);
  const by = who.name || who.email;
  if (!(await tableReady(db))) return json({ ok: false, reason: "setup" }, 503);
  const action = String(b.action ?? "");
  const mine = async (id: unknown) => {
    const r = await getRecord(db, String(id ?? ""), clientId);
    return r && (role.admin || r.managerEmail === role.email) ? r : null;
  };

  if (action === "list") {
    const { records, people } = await sync(x);
    if (role.admin) await sendAssignments(x, records);
    const fresh = role.admin ? await allRecords(db, clientId) : records;
    const visible = fresh.filter((r) => r.status !== "cancelled" && (role.admin || r.managerEmail === role.email));
    const sups = supervisorIds(people, x.s);
    const ppl = people
      .filter((p) => p.active !== false && (role.admin || (p.managerEmail || "").toLowerCase() === role.email))
      .map((p) => ({ id: p.id, name: p.name, title: p.title, managerName: p.managerName, hasEmail: !!p.email, sup: sups.has(p.id), hireDate: p.hireDate }));
    // managers never see certificates or HR notes
    const strip = (r: TrainingRecord) => (role.admin ? r : { ...r, file: undefined, ai: undefined, note: undefined, questions: [], history: [], token: "" });
    return json({ ok: true, role: { admin: role.admin }, settings: role.admin ? x.s : { ...complianceFor(x.s), admins: [] }, records: visible.map(strip), people: ppl, today: iso(new Date()) });
  }

  if (!role.admin && action !== "remind") return json({ ok: false, reason: "forbidden" }, 403);

  if (action === "settings") {
    const next = cleanCompliance(b.settings, x.s);
    const launching = next.live && !x.s.live;
    await saveSettings(x, next);
    if (launching) {
      const { records } = await sync(x);
      await sendAssignments(x, records);
    }
    return json({ ok: true, settings: next });
  }

  if (action === "launch") {
    await saveSettings(x, { ...x.s, live: true });
    const { records } = await sync(x);
    const sent = await sendAssignments(x, records);
    return json({ ok: true, sent });
  }

  if (action === "approve") {
    const r = await mine(b.id);
    if (!r) return json({ ok: false, reason: "not_found" }, 404);
    const date = DAY.test(String(b.date)) ? String(b.date) : r.ai?.date || r.submittedAt?.slice(0, 10) || iso(new Date());
    const next = logRec({ ...r, status: "approved", completedAt: date, approvedAt: new Date().toISOString(), approvedBy: by, note: undefined }, by, `Approved, completed ${date}`);
    await putRecord(db, next);
    await sync(x); // opens the next cycle when it's close
    return json({ ok: true, record: next });
  }

  if (action === "sendback") {
    const r = await mine(b.id);
    if (!r) return json({ ok: false, reason: "not_found" }, 404);
    const note = s(b.note, 600) || "Please upload your certificate again.";
    const next = logRec({ ...r, status: "sentback", note }, by, "Sent back");
    await putRecord(db, next);
    const m = await send(x, r.email, sentBackEmail(x, next));
    return json({ ok: true, record: next, emailed: m.ok });
  }

  if (action === "remind") {
    const r = await mine(b.id);
    if (!r) return json({ ok: false, reason: "not_found" }, 404);
    const m = await send(x, r.email, reminderEmail(x, r, daysBetween(iso(new Date()), r.due)));
    if (m.ok) await putRecord(db, logRec({ ...r, sentAt: r.sentAt ?? new Date().toISOString() }, by, "Reminder sent"));
    return json({ ok: m.ok, reason: m.ok ? undefined : m.reason });
  }

  if (action === "answer") {
    const r = await mine(b.id);
    const text = s(b.text, 3000);
    if (!r || !text) return json({ ok: false, reason: "bad_request" }, 400);
    const q = r.questions.find((y) => y.id === b.qid);
    if (!q) return json({ ok: false, reason: "not_found" }, 404);
    const next = logRec({ ...r, questions: r.questions.map((y) => (y.id === q.id ? { ...y, answer: text, answeredAt: new Date().toISOString(), by } : y)) }, by, "Answered a question");
    await putRecord(db, next);
    const m = await send(x, r.email, answerEmail(x, r, q.q, text));
    return json({ ok: true, record: next, emailed: m.ok });
  }

  if (action === "record") {
    const c = x.s.courses.find((y) => y.id === b.courseId) as Course | undefined;
    const date = String(b.date ?? "");
    if (!c || !DAY.test(date) || date > iso(new Date())) return json({ ok: false, reason: "bad_request" }, 400);
    const { records, people } = await sync(x);
    const p = people.find((y) => y.id === b.personId);
    if (!p) return json({ ok: false, reason: "not_found" }, 404);
    const variant: Variant | undefined = c.kind === "crd" ? (b.variant === "supervisor" ? "supervisor" : b.variant === "employee" ? "employee" : supervisorIds(people, x.s).has(p.id) ? "supervisor" : "employee") : undefined;
    const open = records.find((r) => r.personId === p.id && r.courseId === c.id && ["assigned", "sentback", "submitted"].includes(r.status));
    const token = records.find((r) => r.personId === p.id)?.token ?? newToken();
    const base = open ?? newRecord(p, clientId, c, { due: date, reason: "manual", variant }, token);
    const next = logRec({ ...base, variant, status: "approved", completedAt: date, approvedAt: new Date().toISOString(), approvedBy: by, attest: true, note: s(b.note, 300) || undefined }, by, `Recorded by HR, completed ${date}`);
    await putRecord(db, next);
    await sync(x);
    return json({ ok: true, record: next });
  }

  if (action === "file") {
    const r = await mine(b.id);
    if (!r?.file) return json({ ok: false, reason: "not_found" }, 404);
    const { data } = await db.storage.from("client-files").createSignedUrl(r.file.path, 600);
    return json({ ok: !!data?.signedUrl, url: data?.signedUrl });
  }

  if (action === "planUpload") {
    const c = x.s.courses.find((y) => y.id === b.courseId);
    const mime = String(b.mime ?? "");
    if (!c || !/^(application\/pdf|image\/(png|jpeg|webp)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(mime)) return json({ ok: false, reason: "bad_request" }, 400);
    const ext = mime === "application/pdf" ? "pdf" : mime.endsWith("document") ? "docx" : mime.split("/")[1].replace("jpeg", "jpg");
    const path = `${clientId}/training/plans/${c.id}-${Date.now().toString(36)}.${ext}`;
    const { data, error } = await db.storage.from("client-files").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return json({ ok: false, reason: "storage" }, 500);
    return json({ ok: true, path, url: data.signedUrl });
  }

  if (action === "link") {
    const recs = await allRecords(db, clientId);
    const r = recs.find((y) => y.personId === b.personId && y.token);
    return r ? json({ ok: true, url: linkFor(r.token) }) : json({ ok: false, reason: "not_found" }, 404);
  }

  return json({ ok: false, reason: "bad_request" }, 400);
}
