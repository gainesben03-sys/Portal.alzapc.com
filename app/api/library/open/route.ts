// Open a library item (training, guide, template): a short-lived link to the file, or its web link.
// Ben can open anything; a client's people only what's been shared with their company.
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export async function GET(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const db = admin();
  const { data } = await db.from("resources").select("data").eq("id", id).maybeSingle();
  const r = data?.data as { url?: string; path?: string; fileName?: string; shares?: { clientId: string }[] } | undefined;
  if (!r) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const shared = (r.shares ?? []).some((s) => me.memberOf.includes(s.clientId));
  if (!me.advisor && !shared) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (r.path) {
    if (!r.path.startsWith("alza/library/")) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    const { data: u } = await db.storage.from("client-files").createSignedUrl(r.path, 3600);
    if (!u?.signedUrl) return NextResponse.json({ ok: false, reason: "missing" });
    return NextResponse.json({ ok: true, url: u.signedUrl });
  }
  if (r.url && /^https?:\/\//i.test(r.url)) return NextResponse.json({ ok: true, url: r.url });
  return NextResponse.json({ ok: false, reason: "no_file" });
}
