// Public, from an email link: approve an offer request (the company's approver) or an offer letter
// (the hiring manager). The link is signed for one person and one hire. GET shows it; POST decides.
import { NextResponse } from "next/server";
import type { Approval } from "@/lib/hires";
import { clientById, emailBenDecision, emailRequester, getHire, putHire, readApprove, summaryRows } from "@/lib/offerserver";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

async function load(token: string) {
  const t = readApprove(token);
  if (!t) return { err: "not_found" as const };
  if (t.x < Date.now()) return { err: "expired" as const };
  const db = admin();
  const [co, h] = await Promise.all([clientById(db, t.c), getHire(db, t.h, t.c)]);
  if (!co || !h) return { err: "not_found" as const };
  const a = t.k === "pre" ? h.preApproval : h.letterApproval;
  if (!a || a.email !== t.e) return { err: "not_found" as const }; // a newer request went to someone else
  return { t, db, co, h, a };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const x = await load((await params).token);
  if ("err" in x) return json({ ok: false, reason: x.err }, 404);
  const { t, db, co, h, a } = x;
  let letter: { name: string; url: string } | null = null;
  if (t.k === "letter") {
    const d = [...(h.docs ?? [])].reverse().find((d) => d.kind === "offer" && d.path);
    const u = d?.path ? (await db.storage.from("client-files").createSignedUrl(d.path, 3600)).data?.signedUrl : null;
    if (d && u) letter = { name: d.name, url: u };
  }
  return json({ ok: true, kind: t.k, company: { name: co.name, accent: co.accent, logo: co.logo }, who: a.name, status: a.status, note: a.note ?? "", requester: h.request?.name ?? "", rows: summaryRows(h), letter, first: h.name.split(" ")[0] });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const x = await load((await params).token);
  if ("err" in x) return json({ ok: false, reason: x.err }, 404);
  const { t, db, co, h, a } = x;
  if (a.status !== "waiting") return json({ ok: true, status: a.status, already: true });
  let b: { decision?: string; note?: string };
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const ok = b.decision === "approve";
  const note = String(b.note ?? "").trim().slice(0, 1000);
  if (!ok && !note) return json({ ok: false, reason: "note_needed" }, 400);
  const now = new Date().toISOString();
  const done: Approval = { ...a, status: ok ? "approved" : "sent_back", at: now, note: note || undefined };
  const what = t.k === "pre" ? (ok ? "approved the offer request" : "sent the offer request back") : ok ? "approved the offer letter" : "asked for changes to the offer letter";
  const next = { ...h, [t.k === "pre" ? "preApproval" : "letterApproval"]: done, history: [...h.history, { at: now, by: a.name, text: `${a.name} ${what}${note ? `: "${note}"` : ""}` }] };
  if (!(await putHire(db, next))) return json({ ok: false, reason: "save_failed" }, 500);
  const base = siteUrl(req);
  await emailBenDecision(co, next, done, t.k, base);
  if (t.k === "pre" && !ok) await emailRequester(co, next, "sent_back");
  return json({ ok: true, status: done.status });
}
