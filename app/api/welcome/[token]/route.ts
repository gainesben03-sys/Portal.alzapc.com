// The new hire's get-to-know-you page. No login: the link from their email is the key.
// GET  -> their questions, answers so far, and what the intro would say
// POST { answers, preferred, share, sharePhoto, approve }  save; approve=false pulls the intro back
// POST { action: "photo", data } / { action: "removePhoto" }
import { NextResponse } from "next/server";
import { buddyOn, DEFAULT_INTRO, fillVals, introOn, introWording, PAGE_TEXT, PAGE_TITLE, questionsFor } from "@/lib/experience";
import { hireByToken, saveXp, signed } from "@/lib/experienceserver";
import { firstName, longDate } from "@/lib/hires";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await hireByToken(admin(), "token", (await params).token);
  if (!c || c.h.outcome || c.h.xp?.closed || !introOn(c.x)) return json({ ok: false, reason: "not_found" }, 404);
  const xp = c.h.xp ?? {};
  const v = fillVals(c.h, c.company);
  const w = introWording(c.x, xp);
  return json({
    ok: true,
    first: firstName(c.h),
    preferred: xp.preferred || "",
    last: v.last,
    title: c.h.title || "",
    manager: c.h.managerName || "",
    start: c.h.startDate ? longDate(c.h.startDate) : "",
    arrival: c.h.arrivalTime || c.s.defaultArrival,
    company: c.company,
    accent: c.cfg.accent || "#19283c",
    logo: c.cfg.logoEmail || c.cfg.logo || null,
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
    opening: w.message || DEFAULT_INTRO.message,
    closing: w.closing || DEFAULT_INTRO.closing,
    buddy: buddyOn(c.x) && xp.buddy?.status === "yes" ? xp.buddy.name : "",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const db = admin();
  const c = await hireByToken(db, "token", (await params).token);
  if (!c || c.h.outcome || c.h.xp?.closed || !introOn(c.x)) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; data?: string; answers?: Record<string, unknown>; preferred?: string; share?: unknown; sharePhoto?: boolean; approve?: boolean };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const who = c.h.name || "New hire";

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
