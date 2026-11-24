// Resend calls this when an email arrives at the People Hub's inbox address (the "email.received" webhook).
// Only HR's own addresses can create work. Anything else is dropped without a trace.
import { NextResponse } from "next/server";
import { addr, allowedSenders, fetchReceived, htmlToText, intake, passedChecks, tableReady, tellBen, verifySignature } from "@/lib/inboxserver";
import { admin, SERVER_LIVE } from "@/lib/server";

export const maxDuration = 60;
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false }, { status: 404 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers)) return NextResponse.json({ ok: false, reason: "signature" }, { status: 401 });
  let ev: { type?: string; data?: { email_id?: string; from?: string; subject?: string } };
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (ev.type !== "email.received" || !ev.data?.email_id) return ok();
  const db = admin();
  if (!(await tableReady(db))) return NextResponse.json({ ok: false, reason: "setup" }, { status: 503 });
  const from = addr(ev.data.from ?? "");
  if (!(await allowedSenders(db)).includes(from)) return ok(); // not HR: ignore quietly
  // the same email can be delivered twice; skip one already taken in
  const { data: seen } = await db.from("inbox_items").select("id").eq("data->>emailId", ev.data.email_id).maybeSingle();
  if (seen) return ok();
  const email = await fetchReceived(ev.data.email_id);
  if (!email) return NextResponse.json({ ok: false, reason: "fetch" }, { status: 502 }); // Resend will retry
  const text = (email.text && email.text.trim()) || htmlToText(email.html ?? "");
  const item = await intake(db, { via: "email", from, subject: email.subject ?? ev.data.subject ?? "", text, trusted: passedChecks(email.headers), emailId: ev.data.email_id });
  const { data: c } = item.clientId ? await db.from("clients").select("name").eq("id", item.clientId).maybeSingle() : { data: null };
  await tellBen(db, item, (c as { name?: string } | null)?.name);
  return ok();
}
