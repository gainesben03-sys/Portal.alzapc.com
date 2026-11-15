// The employee's side of a review: the self-assessment, or reading and signing off. No login: the link is the key.
// Nothing here acts on a plain page load except noting that the review was viewed.
import { NextResponse } from "next/server";
import { docOf, first, Lang, Review, SELF_Q } from "@/lib/perform";
import { loadCtx, log, putReview } from "@/lib/performserver";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

async function find(token: string) {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return null;
  const db = admin();
  const [a, b] = await Promise.all([
    db.from("perform_reviews").select("id, client_id, data").eq("data->self->>token", token).maybeSingle(),
    db.from("perform_reviews").select("id, client_id, data").eq("data->share->>token", token).maybeSingle(),
  ]);
  const row = a.data ?? b.data;
  if (!row) return null;
  const r = { ...(row.data as Review), id: row.id as string, clientId: row.client_id as string };
  if (r.status === "cancelled") return null;
  const x = await loadCtx(db, r.clientId);
  if (!x || !x.cfg.modules?.perform) return null;
  return { db, x, r, mode: (a.data ? "self" : "review") as "self" | "review" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await find((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  const { x, r, mode } = f;
  const base = { ok: true, mode, company: x.company, accent: x.cfg.accent || "#19283c", logo: x.cfg.logoEmail || x.cfg.logo || null, first: first(r.name), manager: first(r.managerName) };
  if (mode === "self") {
    // the self-assessment closes once the manager has finalized the review
    return json({ ...base, lang: r.self?.lang ?? r.lang, closed: r.status !== "open", done: !!r.self?.doneAt, answers: r.self?.answers ?? [], questions: SELF_Q });
  }
  if (r.status !== "shared" && r.status !== "done") return json({ ok: false, reason: "not_found" }, 404);
  if (!r.share?.viewedAt) await putReview(f.db, { ...r, share: { ...r.share!, viewedAt: new Date().toISOString() } });
  return json({ ...base, lang: r.lang, doc: docOf(r, x.company, r.lang), docOther: r.translated ? docOf(r, x.company, r.lang === "es" ? "en" : "es") : null, acked: !!r.share?.ackAt, signOff: x.s.signOff });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await find((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; answers?: string[]; lang?: string; submit?: boolean; comment?: string };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const { r, mode } = f;
  const at = new Date().toISOString();
  if (mode === "self" && b.action === "self") {
    if (r.status !== "open") return json({ ok: false, reason: "closed" }, 409);
    const lang: Lang = b.lang === "es" ? "es" : "en";
    const answers = SELF_Q.map((q, i) => ({ q: q[lang], a: String(b.answers?.[i] ?? "").replace(/\r/g, "").trim().slice(0, 3000) }));
    let next: Review = { ...r, self: { ...r.self!, lang, answers, ...(b.submit ? { doneAt: at } : {}) } };
    if (b.submit && !r.self?.doneAt) next = log(next, r.name, "Finished the self-assessment");
    await putReview(f.db, next);
    return json({ ok: true });
  }
  if (mode === "review" && b.action === "ack") {
    if (r.share?.ackAt) return json({ ok: true, already: true });
    const comment = String(b.comment ?? "").replace(/\r/g, "").trim().slice(0, 3000);
    const next = log({ ...r, status: "done", share: { ...r.share!, ackAt: at, ...(comment ? { comment } : {}) } }, r.name, comment ? "Signed off, with a comment" : "Signed off");
    await putReview(f.db, next);
    return json({ ok: true });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
