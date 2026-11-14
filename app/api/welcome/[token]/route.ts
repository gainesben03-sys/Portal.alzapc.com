// The new hire's get-to-know-you page. No login: the link from their email is the key.
// GET  -> their questions, answers so far, and what the intro would say
// POST { answers, preferred, share, sharePhoto, approve }  save; approve=false pulls the intro back
// POST { action: "photo", data } / { action: "removePhoto" }
import { NextResponse } from "next/server";
import { buddyOn, DEFAULT_INTRO, fillVals, introDay, introOn, introWording, PAGE_TEXT, PAGE_TITLE, pageOpen, questionsFor } from "@/lib/experience";
import { brandAndSender, hireByToken, saveXp, signed, XpCtx } from "@/lib/experienceserver";
import { managerEmail } from "@/lib/hireemailserver";
import { firstName, longDate, stageIndex } from "@/lib/hires";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const todayISO = () => new Date(Date.now() - 8 * 3600_000).toISOString().slice(0, 10);
/** The page works while the experience is on, the journey isn't closed, and for 90 days after the start. */
const open = (c: XpCtx) => !!c.x.on && !c.h.outcome && !c.h.imported && !c.h.xp?.closed && pageOpen(c.h, todayISO());

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const db = admin();
  const c = await hireByToken(db, "token", (await params).token);
  if (!c || !open(c)) return json({ ok: false, reason: "not_found" }, 404);
  const xp = c.h.xp ?? {};
  const v = fillVals(c.h, c.company);
  const w = introWording(c.x, xp);
  const { brand, s } = brandAndSender(c);
  const mgrEmail = c.h.managerName ? await managerEmail(db, c.clientId, c.h).catch(() => null) : null;
  const items = (c.h.actionItems || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const b = buddyOn(c.x) && xp.buddy?.status === "yes" ? xp.buddy : undefined;
  return json({
    ok: true,
    first: firstName(c.h),
    preferred: xp.preferred || "",
    last: v.last,
    title: c.h.title || "",
    manager: c.h.managerName || "",
    managerEmail: mgrEmail || "",
    startISO: c.h.startDate || "",
    start: c.h.startDate ? longDate(c.h.startDate) : "",
    arrival: c.h.arrivalTime || s.defaultArrival,
    where: (c.h.location || s.hqAddress || "").trim(),
    bring: s.idNote || "",
    company: brand.company,
    accent: brand.bar || c.cfg.accent || "#19283c",
    logo: brand.logoUrl || null,
    hr: { name: s.hrName || "", email: s.hrEmail || "", phone: s.hrPhone || "" },
    mission: s.mission || "",
    values: (s.values || "").split("\n").map((x) => x.trim()).filter(Boolean),
    video: s.videoUrl || "",
    signed: stageIndex(c.h.status) >= 2,
    todos: items.map((text, i) => ({ text, done: !!xp.todos?.[String(i)] })),
    intro: introOn(c.x),
    pageTitle: c.x.pageTitle || PAGE_TITLE,
    pageText: c.x.pageText || PAGE_TEXT,
    questions: questionsFor(c.x),
    answers: xp.answers ?? {},
    share: xp.share ?? null,
    sharePhoto: xp.sharePhoto !== false,
    photos: c.x.photos !== false,
    photo: await signed(c.db, xp.photo),
    submitted: !!xp.submittedAt,
    approved: !!xp.approvedAt,
    sent: !!xp.intro?.sentAt,
    introDay: introDay(c.h),
    opening: w.message || DEFAULT_INTRO.message,
    closing: w.closing || DEFAULT_INTRO.closing,
    subject: w.subject || DEFAULT_INTRO.subject,
    buddy: b?.name || "",
    buddyEmail: b?.email || "",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const db = admin();
  const c = await hireByToken(db, "token", (await params).token);
  if (!c || !open(c)) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; i?: number; done?: boolean; data?: string; answers?: Record<string, unknown>; preferred?: string; share?: unknown; sharePhoto?: boolean; approve?: boolean };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const who = c.h.name || "New hire";

  // tick an action item off
  if (b.action === "todo") {
    const items = (c.h.actionItems || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const i = Math.floor(Number(b.i));
    if (!(i >= 0 && i < items.length)) return json({ ok: false, reason: "bad_request" }, 400);
    await saveXp(c, (xp) => {
      const todos = { ...(xp.todos ?? {}) };
      if (b.done) todos[String(i)] = new Date().toISOString();
      else delete todos[String(i)];
      return { ...xp, todos };
    }, b.done ? { by: who, text: `Done: ${items[i].slice(0, 80)}` } : undefined);
    return json({ ok: true });
  }
  if (!introOn(c.x)) return json({ ok: false, reason: "off" }, 403);

  if (b.action === "photo" || b.action === "removePhoto") {
    if (c.x.photos === false) return json({ ok: false, reason: "off" }, 403);
    let path: string | undefined;
    if (b.action === "photo") {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data ?? ""));
      if (!m) return json({ ok: false, reason: "bad_image" }, 400);
      const bytes = Buffer.from(m[1], "base64");
      if (bytes.length > 1_500_000) return json({ ok: false, reason: "too_big" }, 413);
      path = `hires/${c.clientId.replace(/[^A-Za-z0-9_-]/g, "")}/${c.id.replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now().toString(36)}.jpg`;
      const up = await db.storage.from("client-files").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (up.error) return json({ ok: false, reason: "upload_failed" }, 500);
    }
    const old = c.h.xp?.photo;
    await saveXp(c, (xp) => ({ ...xp, photo: path }), { by: who, text: path ? "Added a photo" : "Removed their photo" });
    if (old) await db.storage.from("client-files").remove([old]).catch(() => undefined);
    return json({ ok: true, photo: await signed(db, path) });
  }

  if (c.h.xp?.intro?.sentAt && b.approve === false) return json({ ok: false, reason: "sent" }, 409);
  const qs = questionsFor(c.x);
  const answers: Record<string, string> = {};
  for (const q of qs) {
    const v = String(b.answers?.[q.id] ?? "").replace(/\r/g, "").trim().slice(0, 600);
    if (v) answers[q.id] = v;
  }
  const shareable = new Set(qs.filter((q) => !q.private).map((q) => q.id));
  const share = Array.isArray(b.share) ? (b.share as unknown[]).map(String).filter((id) => shareable.has(id)) : undefined;
  const preferred = String(b.preferred ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 40);
  const at = new Date().toISOString();
  const was = c.h.xp ?? {};
  const text = b.approve ? (was.approvedAt ? "Updated their approved intro" : "Approved their company intro") : was.approvedAt && b.approve === false ? "Pulled back their intro approval" : was.submittedAt ? "Updated their answers" : "Answered the get-to-know-you questions";
  await saveXp(c, (xp) => ({
    ...xp,
    answers,
    preferred: preferred || undefined,
    share: share ?? xp.share,
    sharePhoto: typeof b.sharePhoto === "boolean" ? b.sharePhoto : xp.sharePhoto,
    submittedAt: xp.submittedAt || at,
    approvedAt: b.approve ? at : b.approve === false ? undefined : xp.approvedAt,
  }), { by: who, text });
  return json({ ok: true });
}
