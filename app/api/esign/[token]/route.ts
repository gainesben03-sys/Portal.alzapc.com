// Public signing endpoint. The long random token in the link is the only key: no sign-in.
// GET: what to show the signer. POST: sign or decline.
import { NextResponse } from "next/server";
import { buildSignedPdf, headerImage, loadClient, loadHire, saveHire, SigEvent, SigRow, who } from "@/lib/esign";
import { afterSignedTasks, safeFileName } from "@/lib/esign-after";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";

export const maxDuration = 60;

async function getRow(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await admin().from("signatures").select("*").eq("id", token).maybeSingle();
  return (data as SigRow | null) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const { token } = await params;
  const row = await getRow(token);
  if (!row) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const db = admin();
  const c = await loadClient(db, row.client_id);
  const expired = new Date(row.expires_at) < new Date() && row.status !== "signed";
  const base = { ok: true, status: expired ? "expired" : row.status, company: c?.client.name ?? "", accent: c?.client.accent ?? "#19283c", logo: c?.logo ?? null, hrEmail: c?.s.hrEmail ?? "", title: row.title, signer: row.signer_name };
  if (row.status === "voided" || expired) return NextResponse.json(base);
  if (row.status === "signed") {
    const { data: u } = row.signed_path ? await db.storage.from("client-files").createSignedUrl(row.signed_path, 3600) : { data: null };
    return NextResponse.json({ ...base, signedAt: row.signed_at, download: u?.signedUrl ?? null });
  }
  if (row.status === "sent") {
    const now = new Date().toISOString();
    const { ip } = who(req);
    await db.from("signatures").update({ status: "viewed", viewed_at: now, events: [...row.events, { at: now, what: "Opened the signing link", ip }] }).eq("id", row.id);
    const h = await loadHire(db, row.hire_id);
    if (h) {
      h.esign = { ...(h.esign ?? {}), [row.doc_kind]: { status: "viewed", at: now } };
      h.history = [...h.history, { at: now, by: row.signer_name, text: `Opened the ${row.title.toLowerCase()}` }];
      await saveHire(db, h);
    }
  }
  return NextResponse.json({ ...base, status: row.status === "declined" ? "declined" : "open", body: row.body });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const { token } = await params;
  const row = await getRow(token);
  if (!row) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (!["sent", "viewed"].includes(row.status)) return NextResponse.json({ ok: false, reason: row.status });
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ ok: false, reason: "expired" });
  let b: { action?: string; name?: string; agree?: boolean; reason?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const now = new Date().toISOString();
  const { ip, agent } = who(req);
  const h = await loadHire(db, row.hire_id);
  const c = await loadClient(db, row.client_id, siteUrl(req));
  if (!h || !c) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  if (b.action === "decline") {
    const reason = String(b.reason ?? "").trim().slice(0, 1000);
    const events: SigEvent[] = [...row.events, { at: now, what: `Declined to sign${reason ? `: ${reason}` : ""}`, ip, agent }];
    await db.from("signatures").update({ status: "declined", decline_reason: reason || null, events }).eq("id", row.id);
    h.esign = { ...(h.esign ?? {}), [row.doc_kind]: { status: "declined", at: now, note: reason || undefined } };
    h.history = [...h.history, { at: now, by: h.name, text: `Declined to sign the ${row.title.toLowerCase()}${reason ? `: "${reason}"` : ""}` }];
    await saveHire(db, h);
    await afterSignedTasks.notify(db, c, h, `${h.name} declined to sign the ${row.title.toLowerCase()}`, reason ? `Their note: "${reason}"` : "No note left.");
    return NextResponse.json({ ok: true, status: "declined" });
  }

  const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!b.agree) return NextResponse.json({ ok: false, reason: "consent" });
  if (name.length < 2) return NextResponse.json({ ok: false, reason: "name" });

  const events: SigEvent[] = [
    ...row.events,
    { at: now, what: "Agreed to sign electronically and receive documents electronically", ip },
    { at: now, what: `Signed as "${name}"`, ip, agent },
  ];
  const header = await headerImage(db, row.client_id, c.logo);
  const pdf = await buildSignedPdf({ row, company: c.client.name, header, signedName: name, signedAt: now, ip, agent, events });
  const fileId = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const fileName = safeFileName(`Signed ${row.title} - ${row.signer_name}.pdf`);
  const path = `${row.client_id}/${fileId}/${fileName}`;
  const up = await db.storage.from("client-files").upload(path, new Blob([pdf as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
  if (up.error) return NextResponse.json({ ok: false, reason: "storage" }, { status: 500 });

  // The signature is recorded first; everything after is follow-through.
  await db.from("signatures").update({ status: "signed", signed_at: now, signed_name: name, signed_ip: ip || null, signed_agent: agent || null, signed_path: path, events: [...events, { at: now, what: "Signed PDF created" }] }).eq("id", row.id);
  await afterSignedTasks.run(db, c, h, row, { name, now, path, fileId, fileName, size: pdf.byteLength, pdf });

  const { data: u } = await db.storage.from("client-files").createSignedUrl(path, 3600);
  return NextResponse.json({ ok: true, status: "signed", signedAt: now, download: u?.signedUrl ?? null });
}
