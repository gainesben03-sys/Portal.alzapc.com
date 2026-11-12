// Offboarding actions that need the server. Ben, or an executive at the client.
// POST { clientId, action: "send", id, test? }   -> the goodbye email (to their personal email, or you for a test)
// POST { clientId, action: "roster", id }        -> take them off the team roster now
// POST { clientId, action: "settings", settings } -> save the goodbye email wording and timing
import { NextResponse } from "next/server";
import { cleanOffboard, Departure } from "@/lib/offboard";
import { offRoster, sendGoodbye } from "@/lib/offboardserver";
import { admin, caller, SERVER_LIVE, siteUrl } from "@/lib/server";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: { clientId?: string; action?: string; id?: string; test?: boolean; settings?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();

  if (b.action === "settings") {
    const { data: cl } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
    if (!cl) return json({ ok: false, reason: "not_found" }, 404);
    const offboarding = cleanOffboard(b.settings);
    await db.from("clients").update({ config: { ...(cl.config ?? {}), offboarding } }).eq("id", clientId);
    return json({ ok: true, settings: offboarding });
  }

  const { data: row } = await db.from("departures").select("data").eq("id", String(b.id ?? "")).eq("client_id", clientId).maybeSingle();
  const d = row ? ({ ...(row.data as Departure), id: String(b.id) }) : null;
  if (!d) return json({ ok: false, reason: "not_found" }, 404);

  if (b.action === "send") {
    const r = await sendGoodbye(db, siteUrl(req), clientId, d, { test: b.test ? who.email : undefined, by: who.name });
    return json(r, r.ok ? 200 : 400);
  }

  if (b.action === "roster") {
    const r = await offRoster(db, clientId, d, who.name);
    return json({ ok: true, departure: r });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
