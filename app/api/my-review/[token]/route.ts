// The employee's side of a review: the self-assessment, or reading and signing off. No login: the link is the key.
// Nothing here acts on a plain page load except noting that the review was viewed.
import { NextResponse } from "next/server";
import { docOf, first, hasTranslation, Lang, Review, reviewFileName, SELF_Q, translatedFrom, trFields } from "@/lib/perform";
import { loadCtx, log, putReview, translate } from "@/lib/performserver";
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
  const other: Lang = r.lang === "es" ? "en" : "es";
  // letterhead for their printed copy
  const { data: lhRow } = await f.db.from("knowledge").select("path").eq("client_id", r.clientId).eq("kind", "letterhead").order("created_at", { ascending: false }).limit(1);
  const lhPath = lhRow?.[0]?.path as string | undefined;
  const letterhead = lhPath ? (await f.db.storage.from("client-files").createSignedUrl(lhPath, 3600)).data?.signedUrl ?? null : null;
  return json({
    ...base, lang: r.lang, fileName: reviewFileName(r), letterhead,
    doc: docOf(r, x.company, r.lang),
    // the other language: headings always, the manager's text once it's been translated
    // if the manager shared a translation, the other language is their original wording
    docOther: docOf(r, x.company, other), otherReady: hasTranslation(r, other) || hasTranslation(r, r.lang), otherOriginal: hasTranslation(r, r.lang) && !hasTranslation(r, other), canTranslate: x.s.ai,
    acked: !!r.share?.ackAt, signOff: x.s.signOff,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await find((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; answers?: string[]; lang?: string; submit?: boolean; comment?: string; to?: string };
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
  // the employee wants to read it in the other language: translate once, keep it on the review
  if (mode === "review" && b.action === "translate") {
    if (r.status !== "shared" && r.status !== "done") return json({ ok: false, reason: "not_found" }, 404);
    const to: Lang = b.to === "es" ? "es" : "en";
    if (hasTranslation(r, to) || (to !== r.lang && hasTranslation(r, r.lang))) return json({ ok: true, doc: docOf(r, f.x.company, to) });
    if (!f.x.s.ai) return json({ ok: false, reason: "off" }, 403);
    const out = await translate(trFields(r), to);
    if (!out.ok) return json({ ok: false, reason: out.reason }, 502);
    const next = { ...r, translatedAlt: translatedFrom(r, to, out.fields) };
    await putReview(f.db, next);
    return json({ ok: true, doc: docOf(next, f.x.company, to) });
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
