// Sends one of a new hire's onboarding emails (welcome, first day, or any the account added),
// branded for their company. Ben or an executive at that client can send. The recipient is always
// the hire's personal email on file (or the sender, for a test), never an address from the browser;
// CCs come from the email's own list, the manager and HR.
import { NextResponse } from "next/server";
import { forCompany, Hire, hireCompany, onboardingFor, senderFor, stageIndex } from "@/lib/hires";
import { ClientConfig } from "@/lib/modules";
import { emailLogoUrl } from "@/lib/brand";
import { cleanEmail, emailForHire, renderOnboard } from "@/lib/onboardemail";
import { ccFor } from "@/lib/hireemailserver";
import { admin, caller, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ sent: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ sent: false, reason: "signed_out" }, { status: 401 });
  let b: { hireId?: string; kind?: string; test?: boolean; custom?: unknown; reset?: boolean; fields?: Record<string, unknown>; saveOnly?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const kind = String(b.kind ?? "welcome").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || "welcome";
  const db = admin();
  const { data: row } = await db.from("hires").select("id, client_id, data").eq("id", String(b.hireId ?? "")).maybeSingle();
  if (!row) return NextResponse.json({ sent: false, reason: "not_found" }, { status: 404 });
  if (!me.advisor && !me.execOf.includes(row.client_id)) return NextResponse.json({ sent: false, reason: "forbidden" }, { status: 403 });
  const { data: client } = await db.from("clients").select("name, config").eq("id", row.client_id).maybeSingle();
  if (!client) return NextResponse.json({ sent: false, reason: "no_client" }, { status: 404 });

  // this hire's own copy of the email, and the per-hire details the email uses
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, n) : undefined);
  const prev = row.data as Hire;
  const changes: Partial<Hire> = {};
  if (b.reset) {
    const { [kind]: _drop, ...rest } = prev.emailCustom ?? {};
    void _drop;
    changes.emailCustom = rest;
    if (kind === "welcome" || kind === "firstDay") changes.emailEdits = { ...(prev.emailEdits ?? {}), [kind]: {} };
  } else if (b.custom) {
    const e = cleanEmail({ ...(b.custom as object), id: kind });
    if (e) changes.emailCustom = { ...(prev.emailCustom ?? {}), [kind]: e };
  }
  const f = b.fields && typeof b.fields === "object" ? b.fields : null;
  if (f) {
    if (f.actionItems !== undefined) changes.actionItems = str(f.actionItems, 2000) ?? "";
    if (f.arrivalTime !== undefined) changes.arrivalTime = str(f.arrivalTime, 60) ?? "";
    if (f.location !== undefined) changes.location = str(f.location, 300) ?? "";
  }
  const hire = { ...prev, ...changes, id: row.id, clientId: row.client_id };
  const cfg = (client.config ?? {}) as ClientConfig;
  const s0 = onboardingFor(cfg.onboarding);
  const co = hireCompany(hire, s0);
  const { s, brand } = forCompany(hire, s0, { company: client.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(row.client_id, cfg.logo, cfg.logoEmail, siteUrl(req)) }, co ? emailLogoUrl(row.client_id, co.logo, co.logoEmail, siteUrl(req), co.id) : undefined);
  const e = emailForHire(kind, hire, s);
  if (!e) return NextResponse.json({ sent: false, reason: "no_template" }, { status: 404 });

  if (b.saveOnly) {
    if (Object.keys(changes).length) await db.from("hires").update({ data: { ...prev, ...changes } }).eq("id", row.id);
    return NextResponse.json({ sent: false, saved: true });
  }

  const to = b.test ? me.email : (hire.personalEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ sent: false, reason: "no_email" });
  const mail = renderOnboard(e, hire, s, brand);
  const cc = b.test ? [] : await ccFor(db, row.client_id, e, hire, s);
  const r = await sendEmail({ to: [to], cc, subject: b.test ? `[Test] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text, ...senderFor(s, brand.company) });
  if (!r.ok) return NextResponse.json({ sent: false, reason: r.reason });

  const data = { ...prev, ...changes };
  if (!b.test) {
    const at = new Date().toISOString();
    data.emails = { ...(data.emails ?? {}), [kind]: at };
    data.history = [...(data.history ?? []), { at, by: me.name, text: `${e.name} sent to ${to}${cc.length ? ` (cc ${cc.join(", ")})` : ""}` }];
    if (kind === "firstDay" && stageIndex(data.status) < stageIndex("First-day email sent")) data.status = "First-day email sent";
  }
  if (!b.test || Object.keys(changes).length) await db.from("hires").update({ data }).eq("id", row.id);
  return NextResponse.json({ sent: true, to, cc });
}
