// GET ?clientId=<id> → a short-lived link to the client's letterhead image, for anyone at that company.
// The letterhead itself isn't confidential; it goes on documents they print and send.
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  const clientId = new URL(req.url).searchParams.get("clientId") ?? "";
  if (!me || !clientId) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (!me.advisor && !me.memberOf.includes(clientId) && !me.execOf.includes(clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const db = admin();
  const { data } = await db.from("knowledge").select("path").eq("client_id", clientId).eq("kind", "letterhead").order("created_at", { ascending: false }).limit(1);
  const path = data?.[0]?.path as string | undefined;
  if (!path) return NextResponse.json({ ok: true, url: null });
  const { data: u } = await db.storage.from("client-files").createSignedUrl(path, 600);
  return NextResponse.json({ ok: true, url: u?.signedUrl ?? null, ext: path.split(".").pop()?.toLowerCase() ?? "png" });
}
