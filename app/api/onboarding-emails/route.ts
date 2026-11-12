// Save a client's onboarding email templates. Ben, or an executive at the client.
// POST { clientId, emails: OnboardEmail[] }
import { NextResponse } from "next/server";
import type { ClientConfig } from "@/lib/modules";
import { cleanEmail, OnboardEmail } from "@/lib/onboardemail";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const who = await caller(req);
  if (!who) return NextResponse.json({ ok: false, reason: "signin" }, { status: 401 });
  let b: { clientId?: string; emails?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const emails = (Array.isArray(b.emails) ? b.emails : []).slice(0, 15).map(cleanEmail).filter((e): e is OnboardEmail => !!e);
  if (!emails.some((e) => e.id === "welcome") || !emails.some((e) => e.id === "firstDay")) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const db = admin();
  const { data: cl } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
  if (!cl) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const cfg = (cl.config ?? {}) as ClientConfig;
  const fd = emails.find((e) => e.id === "firstDay")!;
  const onboarding = { ...(cfg.onboarding ?? {}), emails, ...(fd.when.anchor === "start" && fd.when.days < 0 ? { firstDayDaysBefore: -fd.when.days } : {}) };
  await db.from("clients").update({ config: { ...cfg, onboarding } }).eq("id", clientId);
  return NextResponse.json({ ok: true, onboarding });
}
