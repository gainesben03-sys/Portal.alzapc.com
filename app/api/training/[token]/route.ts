// The employee's required-training page: no login, the private link is the key.
// GET: what's assigned and done. POST { action }:
//   upload { id, mime, size }        a signed upload for their certificate (photo or PDF)
//   submit { id, path, attest }      hand it in: we read it, and clean ones count right away if HR allows
//   signoff { id, attest }           finish a sign-off course (e.g. workplace violence)
//   question { id, text }            ask HR a question about the course
// Nothing changes on a plain page load.
import { NextResponse } from "next/server";
import { logUsage } from "@/lib/ai";
import { checkRead, courseLink, crdLink, CRD_LANGS, logRec, type TrainingRecord } from "@/lib/compliance";
import { newId } from "@/lib/perform";
import { byToken, certPath, hrInbox, loadCtx, putRecord, questionEmail, readCertificate, send, sync } from "@/lib/complianceserver";
import { iso } from "@/lib/perform";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const MIME = /^(application\/pdf|image\/(png|jpeg|webp|heic|heif))$/;

async function load(token: string) {
  const db = admin();
  const recs = (await byToken(db, token)).filter((r) => r.status !== "cancelled");
  if (!recs.length) return null;
  const x = await loadCtx(db, recs[0].clientId);
  if (!x || !x.cfg.modules?.compliance) return null;
  return { db, x, recs };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await load((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  const { db, x, recs } = f;
  const courses = new Map(x.s.courses.map((c) => [c.id, c]));
  // the newest record per course: what's open, or the latest finished one
  const latest = new Map<string, TrainingRecord>();
  for (const r of [...recs].sort((a, b) => (a.due < b.due ? 1 : -1))) if (!latest.has(r.courseId)) latest.set(r.courseId, r);
  const items = await Promise.all([...latest.values()].map(async (r) => {
    const c = courses.get(r.courseId);
    const plan = c?.kind === "plan" && c.planPath ? (await db.storage.from("client-files").createSignedUrl(c.planPath, 3600)).data?.signedUrl ?? null : null;
    return {
      id: r.id, course: r.courseName, about: c?.about ?? "", kind: c?.kind ?? "custom", proof: c?.proof ?? "certificate", variant: r.variant, status: r.status, due: r.due, completedAt: r.completedAt, note: r.status === "sentback" ? r.note : undefined,
      link: c ? courseLink(c, r.variant) : "", links: c?.kind === "crd" ? CRD_LANGS.map((l) => ({ id: l.id, label: l.label, url: crdLink(r.variant ?? "employee", l.id) })) : [],
      plan, planName: c?.planName ?? "", video: c?.videoUrl ?? "", qa: c?.qa ?? "", questions: c?.kind === "plan" ? c.questions !== false : false, minutes: c?.minutes ?? 0,
      asked: r.questions.map((q) => ({ q: q.q, answer: q.answer ?? "" })),
    };
  }));
  return json({ ok: true, company: x.company, accent: x.cfg.accent || "#19283c", logo: x.cfg.logoEmail || x.cfg.logo || null, first: (recs[0].name || "").split(" ")[0], items });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await load((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; id?: string; mime?: string; size?: number; path?: string; attest?: boolean; text?: string };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const { db, x } = f;
  const r = f.recs.find((y) => y.id === b.id);
  if (!r) return json({ ok: false, reason: "not_found" }, 404);
  const c = x.s.courses.find((y) => y.id === r.courseId);
  const open = r.status === "assigned" || r.status === "sentback";

  if (b.action === "upload") {
    if (!open) return json({ ok: false, reason: "closed" }, 409);
    const mime = String(b.mime ?? "");
    if (!MIME.test(mime) || Number(b.size) > 15 * 1024 * 1024) return json({ ok: false, reason: "file" }, 400);
    const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
    const path = certPath(r, ext);
    const { data, error } = await db.storage.from("client-files").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return json({ ok: false, reason: "storage" }, 500);
    return json({ ok: true, path, url: data.signedUrl });
  }

  if (b.action === "submit") {
    if (!open) return json({ ok: false, reason: "closed" }, 409);
    const path = String(b.path ?? "");
    if (!path.startsWith(`${r.clientId}/training/${r.personId}/${r.id}-`) || !b.attest) return json({ ok: false, reason: "bad_request" }, 400);
    const dl = await db.storage.from("client-files").download(path);
    if (!dl.data) return json({ ok: false, reason: "file" }, 400);
    const mime = dl.data.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const canRead = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(mime);
    const ai = canRead ? await readCertificate(await dl.data.arrayBuffer(), mime, r, c) : { flags: ["This photo format can't be read automatically. Please look at it."] };
    if (canRead) await logUsage(db, { email: r.email || "employee", clientId: r.clientId, kind: "training-cert", ref: r.id });
    const flags = checkRead(r, ai);
    const clean = !flags.length && x.s.autoApprove;
    const at = new Date().toISOString();
    let next: TrainingRecord = { ...r, file: { path, name: path.split("/").pop() ?? "certificate", mime }, attest: true, submittedAt: at, ai: { ...ai, flags }, note: undefined };
    next = clean
      ? logRec({ ...next, status: "approved", completedAt: ai.date, approvedAt: at, approvedBy: "Portal (certificate checked)" }, r.name, `Certificate added and approved, completed ${ai.date}`)
      : logRec({ ...next, status: "submitted" }, r.name, flags.length ? `Certificate added, flagged: ${flags.join(" ")}` : "Certificate added, waiting for HR");
    await putRecord(db, next);
    if (clean) await sync(x);
    return json({ ok: true, status: next.status, completedAt: next.completedAt });
  }

  if (b.action === "signoff") {
    if (!open || c?.proof !== "signoff" || !b.attest) return json({ ok: false, reason: "bad_request" }, 400);
    const today = iso(new Date());
    const next = logRec({ ...r, status: "approved", attest: true, submittedAt: new Date().toISOString(), completedAt: today, approvedAt: new Date().toISOString(), approvedBy: "Signed off" }, r.name, `Signed off ${today}`);
    await putRecord(db, next);
    await sync(x);
    return json({ ok: true, status: "approved", completedAt: today });
  }

  if (b.action === "question") {
    const text = String(b.text ?? "").replace(/\r/g, "").trim().slice(0, 2000);
    if (!text || r.questions.length >= 10) return json({ ok: false, reason: "bad_request" }, 400);
    const next = logRec({ ...r, questions: [...r.questions, { id: newId(), q: text, at: new Date().toISOString() }] }, r.name, "Asked a question");
    await putRecord(db, next);
    for (const to of hrInbox(x)) await send(x, to, questionEmail(x, r, text, false));
    return json({ ok: true });
  }

  return json({ ok: false, reason: "bad_request" }, 400);
}
