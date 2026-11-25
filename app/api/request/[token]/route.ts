// Public: a hiring manager's offer request for one company. No sign-in.
// GET: the company's name and whether an approver signs off first. POST: send the request.
// The form can only send. It never reads anything back about people or pay.
import { NextResponse } from "next/server";
import { asksHousing, asksPto, cleanRequest, hireFromRequest, OfferRequest, requestLocations, requestProblems } from "@/lib/offerreq";
import { clientByRequestToken, emailApprover, emailBenNew, emailRequester, putHire } from "@/lib/offerserver";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const recent = new Map<string, number[]>(); // a light brake on repeated sends

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const co = await clientByRequestToken(admin(), (await params).token);
  if (!co) return json({ ok: false, reason: "not_found" }, 404);
  return json({ ok: true, company: { name: co.name, accent: co.accent, logo: co.logo }, approver: co.approver ? co.approver.name : null, locations: requestLocations(co.cfg), pto: asksPto(co.cfg, co.id, co.name), housing: asksHousing(co.cfg, co.id, co.name) });
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
  const pto = asksPto(co.cfg, co.id, co.name);
  if (!pto) r.pto = "";
  if (!asksHousing(co.cfg, co.id, co.name)) r.housing = false;
  const missing = requestProblems(r, !!co.approver, pto);
  if (missing.length) return json({ ok: false, reason: "missing", missing }, 400);
  const id = `h${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const h = hireFromRequest(r, co.id, id, co.approver);
  if (!(await putHire(db, h, r.requesterEmail))) return json({ ok: false, reason: "save_failed" }, 500);
  recent.set(co.id, [...hits, now]);
  await saveLocation(db, co.id, r.location);
  const base = siteUrl(req);
  await Promise.all([co.approver ? emailApprover(co, h, base) : emailBenNew(co, h, base), emailRequester(co, h, "received")]);
  return json({ ok: true, approver: co.approver?.name ?? null });
}

/** A location typed in on the form joins the company's saved list, so it's in the dropdown next time. */
async function saveLocation(db: ReturnType<typeof admin>, clientId: string, loc: string) {
  if (!loc || loc.length > 120) return;
  const { data } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
  const cfg = (data?.config ?? {}) as Record<string, unknown> & { onboarding?: { officeLocations?: string } };
  if (requestLocations(cfg).some((x) => x.toLowerCase() === loc.toLowerCase())) return;
  const list = (cfg.onboarding?.officeLocations ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  if (list.length >= 40) return;
  await db.from("clients").update({ config: { ...cfg, onboarding: { ...(cfg.onboarding ?? {}), officeLocations: [...list, loc].join("\n") } } }).eq("id", clientId);
}
