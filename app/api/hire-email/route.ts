// Sends a new hire's welcome or first-day email, branded for their company.
// Ben or an executive at that client can send. The recipient is always the hire's
// personal email on file (or the sender, for a test), never an address from the browser.
import { NextResponse } from "next/server";
import { firstDayEmail, Hire, onboardingFor, welcomeEmail } from "@/lib/hires";
import { ClientConfig } from "@/lib/modules";
import { emailLogoUrl } from "@/lib/brand";
import { admin, caller, PORTAL_URL, sendEmail, SERVER_LIVE } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ sent: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ sent: false, reason: "signed_out" }, { status: 401 });
  let b: { hireId?: string; kind?: string; test?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const kind = b.kind === "firstDay" ? "firstDay" : "welcome";
  const db = admin();
  const { data: row } = await db.from("hires").select("id, client_id, data").eq("id", String(b.hireId ?? "")).maybeSingle();
  if (!row) return NextResponse.json({ sent: false, reason: "not_found" }, { status: 404 });
  if (!me.advisor && !me.execOf.includes(row.client_id)) return NextResponse.json({ sent: false, reason: "forbidden" }, { status: 403 });
  const { data: client } = await db.from("clients").select("name, config").eq("id", row.client_id).maybeSingle();
  if (!client) return NextResponse.json({ sent: false, reason: "no_client" }, { status: 404 });

  const hire = { ...(row.data as Hire), id: row.id, clientId: row.client_id };
  const cfg = (client.config ?? {}) as ClientConfig;
  const s = onboardingFor(cfg.onboarding);
  const brand = { company: client.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(row.client_id, cfg.logo, cfg.logoEmail, PORTAL_URL) };
  const to = b.test ? me.email : (hire.personalEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ sent: false, reason: "no_email" });
  const mail = kind === "welcome" ? welcomeEmail(hire, s, brand) : firstDayEmail(hire, s, brand);
  const r = await sendEmail({ to: [to], subject: b.test ? `[Test] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text });
  if (!r.ok) return NextResponse.json({ sent: false, reason: r.reason });

  if (!b.test) {
    const at = new Date().toISOString();
    const data = { ...(row.data as Hire) };
    data.emails = { ...(data.emails ?? {}), [kind]: at };
    data.history = [...(data.history ?? []), { at, by: me.name, text: kind === "welcome" ? `Welcome email sent to ${to}` : `First-day email sent to ${to}` }];
    if (kind === "firstDay" && ["Approved to hire", "Offer sent", "Offer signed", "Package ready"].includes(data.status)) data.status = "First-day email sent";
    await db.from("hires").update({ data }).eq("id", row.id);
  }
  return NextResponse.json({ sent: true, to });
}
