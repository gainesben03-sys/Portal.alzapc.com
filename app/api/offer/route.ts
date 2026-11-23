// Signed in. link: a company's offer request link (its executives and Ben).
// letter: Ben sends the offer letter to the hiring manager to approve.
import { NextResponse } from "next/server";
import { clientById, emailLetterApproval, getHire, putHire, requestUrl } from "@/lib/offerserver";
import { admin, caller, SERVER_LIVE, siteUrl } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  let b: { action?: string; clientId?: string; hireId?: string; name?: string; email?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 }); }
  const clientId = String(b.clientId ?? "");
  const db = admin();
  const base = siteUrl(req);

  if (b.action === "link") {
    if (!me.advisor && !me.execOf.includes(clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true, url: requestUrl(clientId, base) });
  }
  if (b.action === "letter") {
    if (!me.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const [co, h] = await Promise.all([clientById(db, clientId), getHire(db, String(b.hireId ?? ""), clientId)]);
    if (!co || !h) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    const email = String(b.email || h.request?.email || "").trim().toLowerCase();
    const name = String(b.name || h.request?.name || email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, reason: "no_email" }, { status: 400 });
    if (!(h.docs ?? []).some((d) => d.kind === "offer" && d.path)) return NextResponse.json({ ok: false, reason: "no_letter" }, { status: 400 });
    const now = new Date().toISOString();
    const next = { ...h, letterApproval: { status: "waiting" as const, name, email, at: now }, history: [...h.history, { at: now, by: "Ben Gaines", text: `Offer letter sent to ${name} to approve` }] };
    if (!(await putHire(db, next))) return NextResponse.json({ ok: false, reason: "save_failed" }, { status: 500 });
    const r = await emailLetterApproval(co, next, base);
    return NextResponse.json({ ok: r.ok, hire: next, reason: r.reason });
  }
  return NextResponse.json({ ok: false, reason: "bad_action" }, { status: 400 });
}
