// Discipline documentation. Executives at the company and HR only.
// POST { clientId, action, ... }:
//   list { personId? }                 records, newest first
//   draft { input, override? }         fairness check, then the draft (override: HR only, after a hold)
//   hold { input }                     save the facts for HR when the check stops the draft
//   revise { body, how }               shorter | warmer | formal | free text
//   spanish { body }
//   save { record }                    create or update a record
//   ack { id, ack }                    pending | signed | declined | none
//   upload { id, fileName }            a one-time link to upload the signed copy
//   file { id }                        a short-lived link to the signed copy
//   ben { id }                         ask HR to look (email, no details in it)
//   delete { id }                      HR only
import { NextResponse } from "next/server";
import { ClientConfig } from "@/lib/modules";
import { cleanDraft, cleanInput, DiscRecord, discFor, newDiscId } from "@/lib/discipline";
import { fairness, listRecords, makeDraft, revise, saveRecord, spanish, tableReady } from "@/lib/disciplineserver";
import { admin, caller, PORTAL_URL, sendEmail, SERVER_LIVE } from "@/lib/server";
import { logUsage, underLimit } from "@/lib/ai";
import { advisorEmails } from "@/lib/push";

export const maxDuration = 120;
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" });
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signed_out" }, 401);
  let b: D;
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  if (!(await tableReady(db))) return json({ ok: false, reason: "setup" }, 503);
  const { data: cl } = await db.from("clients").select("name, config").eq("id", clientId).maybeSingle();
  if (!cl) return json({ ok: false, reason: "not_found" }, 404);
  const levels = discFor((cl.config as ClientConfig)?.discipline).levels;
  const action = String(b.action ?? "");
  const now = new Date().toISOString();
  const get = async (): Promise<DiscRecord | null> => {
    const { data } = await db.from("discipline_records").select("id, client_id, data").eq("id", String(b.id ?? "")).eq("client_id", clientId).maybeSingle();
    return data ? ({ ...(data.data as DiscRecord), id: data.id as string, clientId }) : null;
  };

  try {
    if (action === "list") return json({ ok: true, records: await listRecords(db, clientId, b.personId ? String(b.personId) : undefined) });

    if (action === "draft" || action === "hold") {
      const input = cleanInput(b.input, levels);
      if (!input) return json({ ok: false, reason: "bad_request" }, 400);
      const check = await fairness(db, clientId, input);
      if (action === "hold") {
        const rec: DiscRecord = { ...input, id: newDiscId(), clientId, status: "review", hold: check.hold, ack: "none", createdBy: who.name, createdAt: now, updatedAt: now };
        await saveRecord(db, rec);
        await tellBen(db, clientId, cl.name, who.name, rec, "held");
        return json({ ok: true, record: { ...rec, hold: who.advisor ? rec.hold : check.shown } });
      }
      if (check.hold.length && !(who.advisor && b.override)) return json({ ok: false, reason: "hold", hold: who.advisor ? check.hold : check.shown });
      if (!who.advisor && !(await underLimit(db, who.email, "discipline"))) return json({ ok: false, reason: "limit" });
      const prior = input.personId ? await listRecords(db, clientId, input.personId) : [];
      const issuer = who.advisor ? String(b.issuer ?? "").slice(0, 120) || who.name : who.name;
      const r = await makeDraft(db, clientId, cl.name, issuer, input, prior);
      if (!r.ok) return json({ ok: false, reason: r.reason });
      if (!who.advisor) await logUsage(db, { email: who.email, clientId, kind: "discipline", ref: input.format });
      return json({ ok: true, draft: r.draft });
    }

    if (action === "revise" || action === "spanish") {
      const body = String(b.body ?? "");
      if (body.trim().length < 20) return json({ ok: false, reason: "bad_request" }, 400);
      if (!who.advisor && !(await underLimit(db, who.email, "discipline"))) return json({ ok: false, reason: "limit" });
      const r = action === "spanish" ? await spanish(body) : await revise(body, String(b.how ?? "shorter"));
      if (!r.ok) return json({ ok: false, reason: r.reason });
      if (!who.advisor) await logUsage(db, { email: who.email, clientId, kind: "discipline", ref: action });
      return json({ ok: true, body: r.body });
    }

    if (action === "save") {
      const raw = (b.record ?? {}) as D;
      const input = cleanInput(raw, levels);
      const draft = cleanDraft(raw.draft);
      if (!input || !draft) return json({ ok: false, reason: "bad_request" }, 400);
      const old = raw.id ? await (async () => { b.id = raw.id; return get(); })() : null;
      if (old?.signed && !who.advisor) return json({ ok: false, reason: "signed" }, 409);
      const rec: DiscRecord = {
        ...(old ?? { id: newDiscId(), clientId, createdBy: who.name, createdAt: now, ack: input.format === "writeup" ? "pending" : "none" }),
        ...input,
        status: "saved",
        hold: old?.hold,
        draft,
        updatedAt: now,
      } as DiscRecord;
      await saveRecord(db, rec);
      return json({ ok: true, record: rec });
    }

    const rec = await get();
    if (!rec) return json({ ok: false, reason: "not_found" }, 404);

    if (action === "ack") {
      const ack = ["pending", "signed", "declined", "none"].includes(String(b.ack)) ? (b.ack as DiscRecord["ack"]) : rec.ack;
      const next = { ...rec, ack, updatedAt: now };
      await saveRecord(db, next);
      return json({ ok: true, record: next });
    }
    if (action === "upload") {
      const name = String(b.fileName ?? "signed.pdf").replace(/[^\w.\- ]+/g, "").slice(-80) || "signed.pdf";
      const path = `${clientId}/discipline/${rec.id}/${Date.now().toString(36)}-${name.replace(/\s+/g, "_")}`;
      const { data, error } = await db.storage.from("client-files").createSignedUploadUrl(path);
      if (error || !data) return json({ ok: false, reason: "upload_failed" }, 500);
      return json({ ok: true, path, token: data.token });
    }
    if (action === "uploaded") {
      const path = String(b.path ?? "");
      if (!path.startsWith(`${clientId}/discipline/${rec.id}/`)) return json({ ok: false, reason: "bad_request" }, 400);
      const old = rec.signed?.path;
      const next: DiscRecord = { ...rec, ack: "signed", signed: { path, name: String(b.fileName ?? "Signed copy").slice(0, 120), at: now }, updatedAt: now };
      await saveRecord(db, next);
      if (old && old !== path) await db.storage.from("client-files").remove([old]);
      return json({ ok: true, record: next });
    }
    if (action === "file") {
      if (!rec.signed?.path) return json({ ok: false, reason: "not_found" }, 404);
      const { data } = await db.storage.from("client-files").createSignedUrl(rec.signed.path, 300);
      return json({ ok: true, url: data?.signedUrl ?? null });
    }
    if (action === "ben") {
      await tellBen(db, clientId, cl.name, who.name, rec, "look");
      return json({ ok: true });
    }
    if (action === "delete") {
      if (!who.advisor) return json({ ok: false, reason: "forbidden" }, 403);
      if (rec.signed?.path) await db.storage.from("client-files").remove([rec.signed.path]);
      await db.from("discipline_records").delete().eq("id", rec.id);
      return json({ ok: true });
    }
    return json({ ok: false, reason: "bad_request" }, 400);
  } catch {
    return json({ ok: false, reason: "error" }, 500);
  }
}

/** A heads-up to HR. No names or details in the email; he opens the record in the Alza Hub. */
async function tellBen(db: ReturnType<typeof admin>, clientId: string, company: string, from: string, rec: DiscRecord, why: "held" | "look") {
  const to = await advisorEmails(db);
  if (!to.length) return;
  const url = `${PORTAL_URL}/c/${clientId}/hub/ask/document?id=${rec.id}`;
  const line = why === "held" ? `${from} at ${company} started documenting an issue, and the fairness check paused it for you.` : `${from} at ${company} asked you to look over a discipline draft before it goes out.`;
  await sendEmail({
    to,
    subject: why === "held" ? `${company}: a discipline draft is waiting on you` : `${company}: please look over a discipline draft`,
    text: `${line}\n\nOpen it: ${url}`,
    html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#19283c">${line}</p><p style="font-family:Arial,sans-serif;font-size:15px"><a href="${url}">Open it in the Alza Hub</a></p>`,
    sensitive: true,
  }).catch(() => undefined);
}
