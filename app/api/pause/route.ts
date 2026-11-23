// Signed in. Ben: read and save the months, see each company's link and the counts.
// Anyone signed in to a company: get that company's Pause link (for the Hub's Wellness tab).
import { NextResponse } from "next/server";
import { cleanRituals } from "@/lib/pause";
import { pauseStats, pauseUrl, readRituals, writeRituals } from "@/lib/pauseserver";
import { admin, caller, SERVER_LIVE, siteUrl } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  let b: { action?: string; clientId?: string; rituals?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 }); }
  const db = admin();
  const base = siteUrl(req);

  if (b.action === "link") {
    const id = String(b.clientId ?? "");
    if (!me.advisor && !me.memberOf.includes(id)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true, url: pauseUrl(id, base) });
  }
  if (!me.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  if (b.action === "list") {
    const [rituals, stats, cl] = await Promise.all([readRituals(db), pauseStats(db), db.from("clients").select("id, name").order("name")]);
    return NextResponse.json({ ok: true, rituals, stats: stats.rows, statsReady: stats.ready, links: (cl.data ?? []).map((c) => ({ id: c.id, name: c.name, url: pauseUrl(c.id, base) })) });
  }
  if (b.action === "save") {
    const list = cleanRituals(b.rituals);
    const ok = await writeRituals(db, list);
    return NextResponse.json(ok ? { ok: true, rituals: list } : { ok: false, reason: "save_failed" });
  }
  return NextResponse.json({ ok: false, reason: "bad_action" }, { status: 400 });
}
