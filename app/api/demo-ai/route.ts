// Public demo only: lets demo.alzapc.com show the real AI-written review draft with sample people.
// No data is stored. Rate limited per visitor and per day so it can't run up the bill.
import { NextResponse } from "next/server";
import { coachDraft } from "@/lib/performserver";

const hits = new Map<string, number[]>();
let day = "", today = 0;
const PER_HOUR = 12, PER_DAY = 400;

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_SITE !== "1") return NextResponse.json({ ok: false, reason: "not_demo" }, { status: 404 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  const now = Date.now();
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; today = 0; hits.clear(); }
  const mine = (hits.get(ip) ?? []).filter((t) => now - t < 3600e3);
  if (mine.length >= PER_HOUR || today >= PER_DAY) return NextResponse.json({ ok: false, reason: "limit" }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 }); }
  if (b.op !== "coachDraft") return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const asks = (Array.isArray(b.asks) ? b.asks : []).slice(0, 8).map((a: { id?: unknown; q?: unknown }) => ({ id: s(a?.id, 24), q: s(a?.q, 200) })).filter((a) => a.id);
  const said = Object.fromEntries(Object.entries((b.said as Record<string, unknown>) ?? {}).slice(0, 10).map(([k, v]) => [s(k, 24), s(v, 2500)]));
  hits.set(ip, [...mine, now]);
  today++;
  const out = await coachDraft({ firstName: s(b.firstName, 40) || "they", lang: b.lang === "es" ? "es" : "en", asks, said, goals: s(b.goals, 1500) });
  return NextResponse.json(out);
}
