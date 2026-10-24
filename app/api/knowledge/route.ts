// Documents Claude uses when drafting (Ben only).
//   GET    ?clientId=<id>|alza        list documents (no text)
//   POST   { id, clientId|null, kind, title, path, fileName, mime }  file already uploaded to storage; we read its text
//   DELETE ?id=<id>                   remove document and its file
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { extractText, letterheadImage } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "client-files";
const MAX_TEXT = 200_000;
const KINDS = ["handbook", "policy", "template", "letterhead", "other"];

async function guard(req: Request) {
  if (!SERVER_LIVE) return { error: NextResponse.json({ ok: false, reason: "demo" }) };
  const me = await caller(req);
  if (!me?.advisor) return { error: NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 }) };
  return { me };
}

export async function GET(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  const cid = new URL(req.url).searchParams.get("clientId") ?? "";
  let q = admin().from("knowledge").select("id, client_id, kind, title, file_name, path, mime, chars, created_at").order("created_at");
  q = cid === "alza" ? q.is("client_id", null) : q.eq("client_id", cid);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, docs: data });
}

export async function POST(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  let b: { id?: string; clientId?: string | null; kind?: string; title?: string; path?: string; fileName?: string; mime?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const id = String(b.id ?? "");
  const clientId = b.clientId ? String(b.clientId) : null;
  const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : "other";
  const path = String(b.path ?? "");
  const fileName = String(b.fileName ?? "file");
  const mime = String(b.mime ?? "");
  const folder = clientId ?? "alza";
  if (!id || !path.startsWith(`${folder}/knowledge/`)) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });

  const db = admin();
  const dl = await db.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const buf = Buffer.from(await dl.data.arrayBuffer());

  let storedPath = path;
  let storedMime = mime;
  let text = "";
  let warning = "";

  if (kind === "letterhead") {
    if (/\.docx$/i.test(fileName)) {
      const img = await letterheadImage(buf).catch(() => null);
      if (!img) return NextResponse.json({ ok: false, reason: "no_image", message: "Couldn't find a logo or header image in that Word file. Try uploading the letterhead as a PNG or JPG." });
      storedPath = `${folder}/knowledge/${id}/letterhead.${img.ext === "jpeg" ? "jpg" : img.ext}`;
      storedMime = img.ext === "png" ? "image/png" : img.ext === "gif" ? "image/gif" : "image/jpeg";
      const up = await db.storage.from(BUCKET).upload(storedPath, img.data, { contentType: storedMime, upsert: true });
      if (up.error) return NextResponse.json({ ok: false, reason: "upload_failed" }, { status: 500 });
    } else if (!/^image\/(png|jpe?g|gif)$/.test(mime)) {
      return NextResponse.json({ ok: false, reason: "bad_type", message: "Letterhead should be a PNG, JPG, or a Word file that contains it." });
    }
    // only one letterhead per client
    const { data: old } = await db.from("knowledge").select("id, path").eq("kind", "letterhead").filter("client_id", clientId ? "eq" : "is", clientId ?? null);
    for (const o of old ?? []) {
      await db.storage.from(BUCKET).remove([o.path]);
      await db.from("knowledge").delete().eq("id", o.id);
    }
  } else {
    try {
      text = (await extractText(buf, fileName, mime)).replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } catch {
      text = "";
    }
    if (!text) warning = /\.doc$/i.test(fileName) ? "Old .doc files can't be read. Save it as .docx or PDF and upload again." : "No readable text found. If it's a scanned PDF, upload a Word or text version.";
    if (text.length > MAX_TEXT) {
      text = text.slice(0, MAX_TEXT);
      warning = "Very long document, so only the first part will be used.";
    }
  }

  const row = { id, client_id: clientId, kind, title: String(b.title ?? fileName).slice(0, 140), file_name: fileName, path: storedPath, mime: storedMime, text, chars: text.length };
  const { error } = await db.from("knowledge").insert(row);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, doc: { ...row, text: undefined }, warning });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const db = admin();
  const { data } = await db.from("knowledge").select("path").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  await db.storage.from(BUCKET).remove([data.path]);
  await db.from("knowledge").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
