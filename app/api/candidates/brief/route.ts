// Write (or rewrite) the AI resume summaries on candidate cards.
// POST { clientId, ids?: string[] }  -> those candidates
// POST { clientId, missing: true }   -> pitch candidates that don't have one yet (up to 24 per call)
// Ben, or an executive at the client.
import { NextResponse } from "next/server";
import { writeBriefs } from "@/lib/candidatebrief";
import type { Candidate } from "@/lib/modules";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export const maxDuration = 60;
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: { clientId?: string; ids?: unknown; missing?: boolean };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const { data: rows } = await db.from("candidates").select("id, data").eq("client_id", clientId);
  const mine = (rows ?? []).map((r) => ({ ...(r.data as Candidate), id: r.id as string })).filter((c) => c.source === "pitch" && !c.cleared);
  let ids: string[];
  if (b.missing) ids = mine.filter((c) => !c.brief).map((c) => c.id);
  else ids = (Array.isArray(b.ids) ? b.ids.map(String) : []).filter((id) => mine.some((c) => c.id === id));
  const batch = ids.slice(0, 24);
  const briefs = await writeBriefs(db, batch);
  return json({ ok: true, briefs, left: ids.length - batch.length });
}
