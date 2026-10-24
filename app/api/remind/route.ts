// "Remind me": schedules an email (via Resend, up to 30 days ahead) to the signed-in person only.
// Demo mode keeps the old allowlist behavior (REMIND_ALLOWED).
import { NextResponse } from "next/server";
import { caller, sendEmail, SERVER_LIVE } from "@/lib/server";

const MAX_DAYS = 30;

function allowed(email: string): boolean {
  const list = (process.env.REMIND_ALLOWED || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const e = email.toLowerCase();
  return list.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}

export async function POST(req: Request) {
  let b: { to?: unknown; subject?: unknown; text?: unknown; sendAt?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ scheduled: false, reason: "bad_request" }, { status: 400 });
  }
  let to: string;
  if (SERVER_LIVE) {
    const me = await caller(req);
    if (!me) return NextResponse.json({ scheduled: false, reason: "signed_out" }, { status: 401 });
    to = me.email;
  } else {
    const raw = String(b.to ?? "");
    to = raw === "advisor" ? process.env.NOTIFY_TO || "ben@alzapc.com" : raw;
    if (raw !== "advisor" && !allowed(to)) return NextResponse.json({ scheduled: false, reason: "recipient_not_allowed" });
  }
  const subject = String(b.subject ?? "").slice(0, 200);
  const text = String(b.text ?? "").slice(0, 3000);
  const sendAt = new Date(String(b.sendAt ?? ""));
  const now = Date.now();
  if (!subject || !text || isNaN(sendAt.getTime())) return NextResponse.json({ scheduled: false, reason: "bad_request" }, { status: 400 });
  if (sendAt.getTime() <= now) return NextResponse.json({ scheduled: false, reason: "in_past" });
  if (sendAt.getTime() - now > MAX_DAYS * 86400000) return NextResponse.json({ scheduled: false, reason: "too_far" });
  const r = await sendEmail({ to: [to], subject: `Reminder: ${subject}`, text, scheduledAt: sendAt.toISOString() });
  return NextResponse.json({ scheduled: r.ok, reason: r.reason });
}
