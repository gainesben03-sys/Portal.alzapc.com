// Opens a candidate's pitch video or resume through a short-lived private link.
// Ben always; client team members only once Ben has shared the candidate.
import { NextResponse } from "next/server";
import { Candidate } from "@/lib/modules";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export async function GET(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  const u = new URL(req.url);
  const id = String(u.searchParams.get("c") ?? "");
  const what = u.searchParams.get("f") === "resume" ? "resume" : "media";
  const db = admin();
  const { data } = await db.from("candidates").select("client_id, data").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const c = data.data as Candidate;
  const allowed = me.advisor || (me.memberOf.includes(data.client_id) && !c.hidden);
  if (!allowed) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const path = what === "resume" ? c.pitch?.resumePath : c.pitch?.mediaPath;
  if (!path || !path.startsWith(`${data.client_id}/pitch/${id}/`)) return NextResponse.json({ ok: false, reason: "none" }, { status: 404 });
  const { data: s, error } = await db.storage.from("client-files").createSignedUrl(path, 3600);
  if (error || !s) return NextResponse.json({ ok: false, reason: "storage" }, { status: 500 });
  return NextResponse.json({ ok: true, url: s.signedUrl });
}
