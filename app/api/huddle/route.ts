// Sends an HR Huddle email from the console (Ben only).
//   mode "test" -> only to Ben
//   mode "send" -> to that client's people who have the Huddle turned on
// The daily job (/api/cron/daily) sends Huddles automatically on schedule.
import { NextResponse } from "next/server";
import { admin, caller, sendEmail, SERVER_LIVE } from "@/lib/server";

function allowed(email: string): boolean {
  const list = (process.env.REMIND_ALLOWED || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const e = email.toLowerCase();
  return list.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}

export async function POST(req: Request) {
  let b: { mode?: unknown; subject?: unknown; html?: unknown; text?: unknown; to?: unknown; clientId?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: 0, reason: "bad_request" }, { status: 400 });
  }
  const subject = String(b.subject ?? "").slice(0, 200);
  const html = String(b.html ?? "");
  const text = String(b.text ?? "").slice(0, 20000);
  if (!subject || !html || html.length > 150000) return NextResponse.json({ sent: 0, reason: "bad_request" }, { status: 400 });
  const ben = process.env.NOTIFY_TO || "ben@alzapc.com";

  let to: string[];
  let skipped: string[] = [];
  if (SERVER_LIVE) {
    const me = await caller(req);
    if (!me?.advisor) return NextResponse.json({ sent: 0, reason: "forbidden" }, { status: 403 });
    if (b.mode === "test") to = [ben];
    else {
      const { data } = await admin().from("members").select("email").eq("client_id", String(b.clientId ?? "")).eq("huddle", true);
      to = (data ?? []).map((m) => m.email);
      if (!to.length) return NextResponse.json({ sent: 0, reason: "no_recipients" });
    }
  } else if (b.mode === "test") {
    to = [ben];
  } else {
    const list = Array.isArray(b.to) ? b.to.map(String).slice(0, 10) : [];
    to = list.filter(allowed);
    skipped = list.filter((x) => !allowed(x));
    if (!to.length) return NextResponse.json({ sent: 0, skipped, reason: "recipient_not_allowed" });
  }

  let sent = 0;
  let reason: string | undefined;
  for (const addr of to) {
    const r = await sendEmail({ to: [addr], subject: b.mode === "test" ? `[Test] ${subject}` : subject, html, text });
    if (r.ok) sent++;
    else reason = r.reason;
  }
  return NextResponse.json({ sent, skipped, reason: sent ? undefined : reason });
}
