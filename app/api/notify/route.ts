// Portal notifications.
//   Default: an email to Ben (NOTIFY_TO). Any signed-in portal user can trigger it.
//   toMember: Ben emails one person at a client (for example a reply on the note board).
// In demo mode (no Supabase keys) it behaves like before: email to Ben if Resend is set up.
import { NextResponse } from "next/server";
import { admin, caller, sendEmail, SERVER_LIVE } from "@/lib/server";
import { pushTo } from "@/lib/push";

export async function POST(req: Request) {
  let b: { subject?: unknown; text?: unknown; toMember?: { clientId?: string; email?: string }; push?: { title?: string; url?: string } };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const subject = String(b.subject ?? "").slice(0, 200);
  const text = String(b.text ?? "").slice(0, 5000);
  if (!subject || !text) return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  const ben = process.env.NOTIFY_TO || "ben@alzapc.com";

  if (!SERVER_LIVE) {
    const r = await sendEmail({ to: [ben], subject: `[Portal] ${subject}`, text });
    return NextResponse.json({ sent: r.ok, reason: r.reason });
  }

  const me = await caller(req);
  if (!me) return NextResponse.json({ sent: false, reason: "signed_out" }, { status: 401 });

  if (b.toMember) {
    if (!me.advisor) return NextResponse.json({ sent: false, reason: "forbidden" }, { status: 403 });
    const email = String(b.toMember.email ?? "").toLowerCase();
    const { data } = await admin().from("members").select("email").eq("client_id", String(b.toMember.clientId ?? "")).eq("email", email).maybeSingle();
    if (!data) return NextResponse.json({ sent: false, reason: "not_a_member" }, { status: 400 });
    const r = await sendEmail({ to: [email], subject, text });
    const pushUrl = String(b.push?.url ?? "");
    await pushTo(admin(), [email], "replies", {
      title: String(b.push?.title ?? "Ben replied").slice(0, 80),
      body: subject,
      url: pushUrl.startsWith(`/c/${String(b.toMember.clientId ?? "")}/`) ? pushUrl : `/c/${String(b.toMember.clientId ?? "")}/board`,
      tag: b.push ? undefined : "reply",
    });
    return NextResponse.json({ sent: r.ok, reason: r.reason });
  }

  const r = await sendEmail({ to: [ben], subject: `[Portal] ${subject}`, text: `${text}\n\nSent by ${me.email}` });
  return NextResponse.json({ sent: r.ok, reason: r.reason });
}
