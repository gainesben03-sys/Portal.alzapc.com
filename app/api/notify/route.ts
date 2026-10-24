// Sends portal notifications to Ben via Resend.
// Recipient is fixed server-side (NOTIFY_TO), so this can't be used to email anyone else.
// Env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  required
//   NOTIFY_FROM     required, a sender on a domain verified in Resend, e.g. "Alza Portal <portal@alzapc.com>"
//   NOTIFY_TO       optional, defaults to ben@alzapc.com

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  const to = process.env.NOTIFY_TO || "ben@alzapc.com";
  if (!key || !from) return NextResponse.json({ sent: false, reason: "not_configured" });

  let body: { subject?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const subject = String(body.subject ?? "").slice(0, 200).replace(/[\r\n]+/g, " ");
  const text = String(body.text ?? "").slice(0, 5000);
  if (!subject || !text) return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `[Portal] ${subject}`, text }),
  });
  return NextResponse.json({ sent: r.ok, reason: r.ok ? undefined : `resend_${r.status}` });
}
