// HR Roadmap settings: setup answers, reminder timing and who gets reminders.
// Executives at the company and Ben can change them. POST { clientId, settings }.
// (The roadmap items themselves are projects, saved like any other project.)
import { NextResponse } from "next/server";
import type { ClientConfig } from "@/lib/modules";
import { cleanSettings, roadmapFor } from "@/lib/roadmap";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const who = await caller(req);
  if (!who) return NextResponse.json({ ok: false, reason: "signin" }, { status: 401 });
  let b: { clientId?: string; settings?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 }); }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const db = admin();
  const { data } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const cfg = (data.config ?? {}) as ClientConfig;
  const next = cleanSettings(b.settings, roadmapFor(cfg.roadmap));
  const { error } = await db.from("clients").update({ config: { ...cfg, roadmap: next } }).eq("id", clientId);
  if (error) return NextResponse.json({ ok: false, reason: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, settings: next });
}
