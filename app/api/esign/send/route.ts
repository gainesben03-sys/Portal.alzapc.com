// Sends an offer letter or agreement for e-signature. Ben or a client executive can send.
// The text signed is read from the stored file on the server, and the link goes only to
// the hire's personal email on file.
import { NextResponse } from "next/server";
import { loadClient, loadHire, newToken, saveHire, sha256 } from "@/lib/esign";
import { extractText } from "@/lib/extract";
import { signRequestEmail, stageIndex } from "@/lib/hires";
import { admin, caller, PORTAL_URL, sendEmail, SERVER_LIVE } from "@/lib/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  let b: { hireId?: string; path?: string; kind?: string; void?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const h = await loadHire(db, String(b.hireId ?? ""));
  if (!h) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (!me.advisor && !me.execOf.includes(h.clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const kind = b.kind === "agreement" ? "agreement" : "offer";
  const now = new Date().toISOString();

  // cancel what's out for signature for this document type
  const { data: open } = await db.from("signatures").select("id, events").eq("hire_id", h.id).eq("doc_kind", kind).in("status", ["sent", "viewed"]);
  for (const o of open ?? []) await db.from("signatures").update({ status: "voided", events: [...(o.events ?? []), { at: now, what: `Cancelled by ${me.name}` }] }).eq("id", o.id);
  if (b.void) {
    h.esign = { ...(h.esign ?? {}), [kind]: undefined };
    h.history = [...h.history, { at: now, by: me.name, text: `Cancelled the ${kind === "offer" ? "offer letter" : "agreement"} signing request` }];
    await saveHire(db, h);
    return NextResponse.json({ ok: true });
  }

  const doc = (h.docs ?? []).find((d) => d.path === b.path && d.kind === kind);
  if (!doc?.path || !doc.path.startsWith(`${h.clientId}/`)) return NextResponse.json({ ok: false, reason: "no_document" }, { status: 400 });
  const to = (h.personalEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ ok: false, reason: "no_email" });

  const { data: blob, error: dlErr } = await db.storage.from("client-files").download(doc.path);
  if (!blob || dlErr) return NextResponse.json({ ok: false, reason: "file_missing" });
  const body = (await extractText(Buffer.from(await blob.arrayBuffer()), doc.name, blob.type || "")).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (body.length < 40) return NextResponse.json({ ok: false, reason: "unreadable" });

  const c = await loadClient(db, h.clientId);
  if (!c) return NextResponse.json({ ok: false, reason: "no_client" }, { status: 404 });
  const title = kind === "offer" ? "Offer Letter" : "Employment Agreement";
  const id = newToken();
  const expires = new Date(Date.now() + 30 * 864e5).toISOString();
  const { error } = await db.from("signatures").insert({
    id, client_id: h.clientId, hire_id: h.id, doc_kind: kind, title, body, doc_hash: sha256(body), source_path: doc.path,
    signer_name: h.name, signer_email: to, sent_by: me.name, expires_at: expires,
    events: [{ at: now, what: `Sent by ${me.name} to ${to}` }],
  });
  if (error) return NextResponse.json({ ok: false, reason: /signatures/.test(error.message) ? "no_table" : "save_failed", detail: error.message });

  const link = `${PORTAL_URL}/sign/${id}`;
  const mail = signRequestEmail(h, title, link, c.s, c.brand, expires.slice(0, 10));
  const r = await sendEmail({ to: [to], subject: mail.subject, html: mail.html, text: mail.text, replyTo: c.s.hrEmail });
  if (!r.ok) {
    await db.from("signatures").update({ status: "voided" }).eq("id", id);
    return NextResponse.json({ ok: false, reason: r.reason });
  }

  h.esign = { ...(h.esign ?? {}), [kind]: { status: "sent", at: now } };
  if (kind === "offer" && stageIndex(h.status) < 1) h.status = "Offer sent";
  h.history = [...h.history, { at: now, by: me.name, text: `${title} sent for e-signature to ${to}` }];
  await saveHire(db, h);
  return NextResponse.json({ ok: true, to });
}
