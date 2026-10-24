// Schedules a "Remind me" email through Resend (scheduled_at, up to 30 days ahead).
// Recipients are limited so this route can't be used to email arbitrary addresses:
//   to: "advisor"  -> NOTIFY_TO (Ben)
//   to: an email   -> only if it matches REMIND_ALLOWED (comma-separated emails or @domains)
// Env: RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO, REMIND_ALLOWED
// The full build replaces the allowlist with real sign-in: users can only remind themselves.

import { NextResponse } from "next/server";

const MAX_DAYS = 30;

function allowed(email: string): boolean {
  const list = (process.env.REMIND_ALLOWED || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const e = email.toLowerCase();
  return list.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) return NextResponse.json({ scheduled: false, reason: "not_configured" });

  let b: { to?: unknown; subject?: unknown; text?: unknown; sendAt?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ scheduled: false, reason: "bad_request" }, { status: 400 });
  }
  const toRaw = String(b.to ?? "");
  const to = toRaw === "advisor" ? process.env.NOTIFY_TO || "ben@alzapc.com" : toRaw;
  if (toRaw !== "advisor" && !allowed(to)) return NextResponse.json({ scheduled: false, reason: "recipient_not_allowed" });

  const subject = String(b.subject ?? "").slice(0, 200).replace(/[\r\n]+/g, " ");
  const text = String(b.text ?? "").slice(0, 3000);
  const sendAt = new Date(String(b.sendAt ?? ""));
  const now = Date.now();
  if (!subject || !text || isNaN(sendAt.getTime())) return NextResponse.json({ scheduled: false, reason: "bad_request" }, { status: 400 });
  if (sendAt.getTime() <= now) return NextResponse.json({ scheduled: false, reason: "in_past" });
  if (sendAt.getTime() - now > MAX_DAYS * 86400000) return NextResponse.json({ scheduled: false, reason: "too_far" });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `Reminder: ${subject}`, text, scheduled_at: sendAt.toISOString() }),
  });
  return NextResponse.json({ scheduled: r.ok, reason: r.ok ? undefined : `resend_${r.status}` });
}
