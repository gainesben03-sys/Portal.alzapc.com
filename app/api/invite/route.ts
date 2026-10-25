// Emails someone their invitation to a client workspace.
// Only Ben or an executive at that client can send one.
import { NextResponse } from "next/server";
import { admin, caller, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";

export async function POST(req: Request) {
  const base = siteUrl(req);
  if (!SERVER_LIVE) return NextResponse.json({ sent: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ sent: false, reason: "signed_out" }, { status: 401 });
  let b: { clientId?: string; email?: string; name?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!clientId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  if (!me.advisor && !me.execOf.includes(clientId)) return NextResponse.json({ sent: false, reason: "forbidden" }, { status: 403 });

  const { data: client } = await admin().from("clients").select("name").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ sent: false, reason: "no_client" }, { status: 404 });
  const first = String(b.name ?? "").trim().split(" ")[0] || "there";
  const inviter = me.advisor ? "Ben Gaines at AlzaHR" : me.name;
  const text = `Hi ${first},

${inviter} added you to the ${client.name} HR portal. It's where you'll see anything that needs your sign-off, where projects stand, and everything AlzaHR shares with your team.

To get in, go to ${base} and enter ${email}. We'll email you a one-time sign-in link, no password needed.

AlzaHR`;
  const html = `<div style="font:15px/1.55 Arial,sans-serif;color:#16213a;max-width:520px">
<p>Hi ${first.replace(/</g, "&lt;")},</p>
<p>${inviter.replace(/</g, "&lt;")} added you to the <b>${client.name.replace(/</g, "&lt;")}</b> HR portal. It's where you'll see anything that needs your sign-off, where projects stand, and everything AlzaHR shares with your team.</p>
<p><a href="${base}" style="display:inline-block;background:#19283c;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:700">Open the portal</a></p>
<p style="color:#5b6b85;font-size:13px">Sign in with ${email}. We'll email you a one-time link, no password needed.</p>
<p style="font-family:Georgia,serif;font-weight:700">Alza<span style="color:#d9a046">HR</span></p></div>`;
  const r = await sendEmail({ to: [email], subject: `You're invited to the ${client.name} HR portal`, text, html });
  return NextResponse.json({ sent: r.ok, reason: r.reason });
}
