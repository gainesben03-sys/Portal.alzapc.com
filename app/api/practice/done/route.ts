// A manager finished a piece of practice. Records only who, which training, what and the score,
// so Ben can see who's practicing. POST { clientId, resourceId, kind: "quiz" | "sort", score, total }
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { logUsage } from "@/lib/ai";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: true });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId ?? "");
  if (me.advisor || !me.memberOf.includes(clientId)) return NextResponse.json({ ok: true });
  const kind = b.kind === "sort" ? "sort" : "quiz";
  await logUsage(admin(), { email: me.email, clientId, kind, ref: String(b.resourceId ?? "").slice(0, 80), meta: { score: Number(b.score) || 0, total: Number(b.total) || 0 } });
  return NextResponse.json({ ok: true });
}
