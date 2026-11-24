// Outbox: emails waiting for an OK. HR sees every company; executives see their own company.
// Leave and write-up emails are HR-only: executives see how many, not what.
// POST { action, clientId?, ... }:
//   count                    how many are waiting (nav badge)
//   list                     held emails, recent history, and the settings this person can change
//   view { id }              one email, as it will look
//   send { ids }             send now
//   skip { ids }             don't send
//   mode { clientId, mode }  off | auto | all
//   digest { on }            HR only: his own notifications as one daily summary
import { NextResponse } from "next/server";
import { admin, caller, deliver, SERVER_LIVE } from "@/lib/server";
import { loadMail, readSettings, release, setStatus, writeSettings } from "@/lib/outboxserver";
import { OutMail, OutRow, outboxMode } from "@/lib/outbox";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

const row = (m: OutMail): OutRow => {
  const { attachments, text, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, html: undefined, attachments: attachments?.map((a) => a.filename) };
};

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" });
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signed_out" }, 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const db = admin();
  const probe = await db.from("outbox").select("id").limit(1);
  if (probe.error) return json({ ok: false, reason: "setup" }, 503);
  const clientId = b.clientId ? String(b.clientId) : "";
  if (!who.advisor && (!clientId || !who.execOf.includes(clientId))) return json({ ok: false, reason: "forbidden" }, 403);
  // what this person may see: HR everything, an executive their company's non-sensitive emails
  const mayAct = (m: OutMail) => who.advisor || (m.clientId === clientId && who.execOf.includes(clientId) && !m.sensitive && m.audience !== "ben");
  const action = String(b.action ?? "");

  if (action === "count") {
    let q = db.from("outbox").select("client_id, sensitive:data->sensitive, audience:data->>audience").eq("status", "held");
    if (clientId) q = q.eq("client_id", clientId);
    const { data } = await q.limit(2000);
    const n = (data ?? []).filter((r) => who.advisor || (r.sensitive !== true && r.audience !== "ben")).length;
    return json({ ok: true, count: n });
  }

  if (action === "list") {
    let q = db.from("outbox").select("id, client_id, status, data, created_at").order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    const { data: heldR } = await q.in("status", ["held", "digest"]).limit(500);
    let h = db.from("outbox").select("id, client_id, status, data").in("status", ["sent", "skipped", "failed"]).gte("updated_at", new Date(Date.now() - 14 * 864e5).toISOString()).order("updated_at", { ascending: false });
    if (clientId) h = h.eq("client_id", clientId);
    const { data: histR } = await h.limit(60);
    const toMail = (r: { id: unknown; client_id: unknown; status: unknown; data: unknown }) => ({ ...(r.data as OutMail), id: String(r.id), clientId: (r.client_id as string) ?? null, status: r.status as OutMail["status"] });
    const all = (heldR ?? []).map(toMail);
    const held = all.filter((m) => m.status === "held");
    const mine = held.filter(mayAct);
    const set = await readSettings(db);
    let companies: { id: string; name: string; mode: string }[] = [];
    if (who.advisor) {
      const { data: cl } = await db.from("clients").select("id, name").order("name");
      companies = (cl ?? []).map((c) => ({ id: String(c.id), name: String(c.name), mode: outboxMode(set.modes?.[String(c.id)]) }));
    } else {
      const { data: c } = await db.from("clients").select("id, name").eq("id", clientId).maybeSingle();
      if (c) companies = [{ id: String(c.id), name: String(c.name), mode: outboxMode(set.modes?.[clientId]) }];
    }
    return json({
      ok: true,
      held: mine.map(row),
      hiddenCount: held.length - mine.length, // leave and write-up emails only HR can open
      digest: who.advisor ? all.filter((m) => m.status === "digest").map(row) : [],
      history: (histR ?? []).map(toMail).filter(mayAct).map(row),
      companies,
      benDigest: who.advisor ? !!set.benDigest : undefined,
    });
  }

  if (action === "view") {
    const [m] = await loadMail(db, [String(b.id ?? "")]);
    if (!m || !mayAct(m)) return json({ ok: false, reason: "not_found" }, 404);
    return json({ ok: true, mail: { ...row(m), html: m.html, text: m.text } });
  }

  if (action === "send" || action === "skip") {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 200);
    const ms = (await loadMail(db, ids)).filter((m) => mayAct(m) && m.status === "held");
    if (action === "skip") {
      for (const m of ms) await setStatus(db, m, "skipped", who.name);
      return json({ ok: true, skipped: ms.length });
    }
    const r = await release(db, ms, who.name, deliver);
    return json({ ok: true, ...r });
  }

  if (action === "mode") {
    const mode = outboxMode(String(b.mode ?? ""));
    if (!clientId) return json({ ok: false, reason: "bad_request" }, 400);
    const set = await readSettings(db);
    const ok = await writeSettings(db, { ...set, modes: { ...(set.modes ?? {}), [clientId]: mode } });
    return json({ ok, mode });
  }

  if (action === "digest") {
    if (!who.advisor) return json({ ok: false, reason: "forbidden" }, 403);
    const set = await readSettings(db);
    const on = !!b.on;
    const ok = await writeSettings(db, { ...set, benDigest: on });
    // turning it off: anything saved for the summary goes out now
    if (ok && !on) {
      const { data } = await db.from("outbox").select("id").eq("status", "digest").limit(200);
      const ms = await loadMail(db, (data ?? []).map((r) => String(r.id)));
      for (const m of ms) await setStatus(db, { ...m, status: "held" }, "held", who.name);
      await release(db, ms.map((m) => ({ ...m, status: "held" as const })), who.name, deliver);
    }
    return json({ ok, benDigest: on });
  }

  return json({ ok: false, reason: "bad_request" }, 400);
}
