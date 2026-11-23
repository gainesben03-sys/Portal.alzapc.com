// Public: a hiring manager's offer request for one company. No sign-in.
// GET: the company's name and whether an approver signs off first. POST: send the request.
// The form can only send. It never reads anything back about people or pay.
import { NextResponse } from "next/server";
import { cleanRequest, hireFromRequest, OfferRequest, requestProblems } from "@/lib/offerreq";
import { clientByRequestToken, emailApprover, emailBenNew, emailRequester, putHire } from "@/lib/offerserver";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const recent = new Map<string, number[]>(); // a light brake on repeated sends

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const co = await clientByRequestToken(admin(), (await params).token);
  if (!co) return json({ ok: false, reason: "not_found" }, 404);
  return json({ ok: true, company: { name: co.name, accent: co.accent, logo: co.logo }, approver: co.approver ? co.approver.name : null });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const db = admin();
  const co = await clientByRequestToken(db, (await params).token);
  if (!co) return json({ ok: false, reason: "not_found" }, 404);
  const now = Date.now();
  const hits = (recent.get(co.id) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 20) return json({ ok: false, reason: "too_many" }, 429);
  let raw: Partial<OfferRequest>;
  try { raw = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const r = cleanRequest(raw);
  const missing = requestProblems(r, !!co.approver);
  if (missing.length) return json({ ok: false, reason: "missing", missing }, 400);
  const id = `h${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const h = hireFromRequest(r, co.id, id, co.approver);
  if (!(await putHire(db, h, r.requesterEmail))) return json({ ok: false, reason: "save_failed" }, 500);
  recent.set(co.id, [...hits, now]);
  const base = siteUrl(req);
  await Promise.all([co.approver ? emailApprover(co, h, base) : emailBenNew(co, h, base), emailRequester(co, h, "received")]);
  return json({ ok: true, approver: co.approver?.name ?? null });
}
