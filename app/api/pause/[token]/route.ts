// Public: The Pause for one company. No sign-in. Shows the month's words and counts opens, starts
// and finishes (never who). GET ?month=yyyy-mm   POST { month, event: "visit" | "start" | "complete" }
import { NextResponse } from "next/server";
import { published } from "@/lib/pause";
import { clientByPauseToken, logEvent, readRituals } from "@/lib/pauseserver";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const { token } = await params;
  const db = admin();
  const c = await clientByPauseToken(db, token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  const list = published(await readRituals(db));
  return json({ ok: true, company: { name: c.name, accent: c.accent, logo: c.logo }, rituals: list });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const { token } = await params;
  let b: { month?: string; event?: string };
  try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const db = admin();
  const c = await clientByPauseToken(db, token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  const list = published(await readRituals(db));
  if (!list.some((r) => r.month === b.month)) return json({ ok: false }, 400);
  await logEvent(db, c.id, String(b.month), b.event as "visit");
  return json({ ok: true });
}
