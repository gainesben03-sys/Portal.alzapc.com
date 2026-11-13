// Remove a new hire from the tracker for good (added by mistake, a duplicate, or never moving forward).
// Ben, or an executive at the client. Signed documents already saved to Files stay there.
// POST { clientId, id }
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: { clientId?: string; id?: string };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  const id = String(b.id ?? "");
  if (!id || (!who.advisor && !who.execOf.includes(clientId))) return json({ ok: false, reason: "forbidden" }, 403);
  const { error } = await admin().from("hires").delete().eq("id", id).eq("client_id", clientId);
  if (error) return json({ ok: false, reason: "save_failed" }, 500);
  return json({ ok: true });
}
