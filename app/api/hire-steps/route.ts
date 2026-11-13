// Save the new hire tracker's steps for one company. Ben, or an executive at the client.
// POST { clientId, steps: [{ id, label, days? }] }  (an empty list goes back to the defaults)
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { cleanSteps } from "@/lib/tracker";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: { clientId?: string; steps?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const { data: cl } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
  if (!cl) return json({ ok: false, reason: "not_found" }, 404);
  const steps = cleanSteps(b.steps);
  const cfg = (cl.config ?? {}) as { onboarding?: Record<string, unknown> };
  const onboarding = { ...(cfg.onboarding ?? {}), trackerSteps: steps.length ? steps : undefined };
  const { error } = await db.from("clients").update({ config: { ...cfg, onboarding } }).eq("id", clientId);
  if (error) return json({ ok: false, reason: "save_failed" }, 500);
  return json({ ok: true, onboarding });
}
