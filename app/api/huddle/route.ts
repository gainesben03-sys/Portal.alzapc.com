// Sends an HR Huddle email.
//   mode "test" -> only to NOTIFY_TO (Ben), so he can preview it in a real inbox
//   mode "send" -> to client recipients, each of which must match REMIND_ALLOWED during the pilot
// The full build runs this on a schedule (Vercel Cron) from server-side data instead of the browser.

import { NextResponse } from "next/server";

function allowed(email: string): boolean {
  const list = (process.env.REMIND_ALLOWED || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const e = email.toLowerCase();
  return list.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) return NextResponse.json({ sent: 0, reason: "not_configured" });

  let b: { mode?: unknown; subject?: unknown; html?: unknown; text?: unknown; to?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: 0, reason: "bad_request" }, { status: 400 });
  }
  const subject = String(b.subject ?? "").slice(0, 200).replace(/[\r\n]+/g, " ");
  const html = String(b.html ?? "");
  const text = String(b.text ?? "").slice(0, 20000);
  if (!subject || !html || html.length > 150000) return NextResponse.json({ sent: 0, reason: "bad_request" }, { status: 400 });

  let to: string[];
  let skipped: string[] = [];
  if (b.mode === "test") {
    to = [process.env.NOTIFY_TO || "ben@alzapc.com"];
  } else {
    const list = Array.isArray(b.to) ? b.to.map(String).slice(0, 10) : [];
    to = list.filter(allowed);
    skipped = list.filter((x) => !allowed(x));
    if (!to.length) return NextResponse.json({ sent: 0, skipped, reason: "recipient_not_allowed" });
  }

  let sent = 0;
  for (const addr of to) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [addr], subject: b.mode === "test" ? `[Test] ${subject}` : subject, html, text }),
    });
    if (r.ok) sent++;
  }
  return NextResponse.json({ sent, skipped });
}
