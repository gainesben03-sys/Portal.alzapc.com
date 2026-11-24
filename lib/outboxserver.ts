// Server side of the Outbox: decides whether an email waits for approval, keeps it, and sends it later.
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOLD_DAYS, OutboxMode, OutMail, outboxMode } from "./outbox";
import type { MailOpts } from "./server";

type DB = SupabaseClient;

/** Code running on a schedule (the daily cron) marks its emails as automatic. */
const ctx = new AsyncLocalStorage<{ auto: boolean }>();
export const runAutomatic = <T>(fn: () => Promise<T>) => ctx.run({ auto: true }, fn);
export const isAutomatic = () => !!ctx.getStore()?.auto;

// small caches so a run of emails doesn't hit the database every time
let cache: { at: number; clients: Map<string, { mode: string }>; advisors: Set<string>; benDigest: boolean; ready: boolean } | null = null;
async function facts(db: DB) {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const [cl, adv, st, probe] = await Promise.all([
    db.from("clients").select("id"),
    db.from("advisors").select("email"),
    db.from("app_settings").select("data").eq("key", "outbox").maybeSingle(),
    db.from("outbox").select("id").limit(1),
  ]);
  const set = (st.data?.data ?? {}) as OutboxSettings;
  const clients = new Map<string, { mode: string }>();
  for (const c of cl.data ?? []) clients.set(String(c.id), { mode: outboxMode(set.modes?.[String(c.id)]) });
  const advisors = new Set<string>([...(adv.data ?? []).map((a) => String(a.email).toLowerCase()), ...(process.env.NOTIFY_TO ? [process.env.NOTIFY_TO.toLowerCase()] : [])]);
  const benDigest = !!set.benDigest;
  cache = { at: Date.now(), clients, advisors, benDigest, ready: !probe.error };
  return cache;
}
export const clearOutboxCache = () => { cache = null; };

/** Kept in app_settings (key "outbox"), not the company config, so console saves never overwrite it. */
export interface OutboxSettings { benDigest?: boolean; modes?: Record<string, OutboxMode> }
export async function readSettings(db: DB): Promise<OutboxSettings> {
  const { data } = await db.from("app_settings").select("data").eq("key", "outbox").maybeSingle();
  return (data?.data ?? {}) as OutboxSettings;
}
export async function writeSettings(db: DB, next: OutboxSettings) {
  const { error } = await db.from("app_settings").upsert({ key: "outbox", data: next });
  clearOutboxCache();
  return !error;
}

/** Which company an email belongs to: its Alza Hub links first, then who it's going to. */
async function clientOf(db: DB, o: MailOpts, known: Map<string, unknown>): Promise<string | null> {
  if (o.clientId && known.has(o.clientId)) return o.clientId;
  const body = `${o.html ?? ""} ${o.text}`;
  for (const m of body.matchAll(/\/c\/([a-z0-9][a-z0-9-]{1,48})(?=[/?"'#\s<]|$)/gi)) if (known.has(m[1])) return m[1];
  const m2 = /[?&]clientId=([a-z0-9-]{2,48})/i.exec(body);
  if (m2 && known.has(m2[1])) return m2[1];
  const to = o.to.map((e) => e.toLowerCase());
  const { data: mem } = await db.from("members").select("client_id").in("email", to).limit(1);
  if (mem?.[0]) return String(mem[0].client_id);
  const { data: ppl } = await db.from("people").select("client_id").in("data->>email", to).limit(1);
  if (ppl?.[0]) return String(ppl[0].client_id);
  return null;
}

const SENSITIVE = /\/(leave|hub\/ask\/document)\b|leave case|leave of absence|improvement plan|written warning|final warning/i;

/**
 * Keep the email instead of sending it, when the company's Outbox setting says so,
 * or when it's a note to HR and he asked for one daily summary. Returns null to send now.
 */
export async function maybeHold(db: DB, o: MailOpts): Promise<{ ok: true; id: string; held: true } | null> {
  if (/^\[Test\]/.test(o.subject)) return null; // test sends go to the person who asked, right away
  const f = await facts(db);
  if (!f.ready) return null;
  const to = o.to.map((e) => e.toLowerCase());
  const sensitive = !!o.sensitive || SENSITIVE.test(`${o.subject} ${o.html ?? o.text}`);
  const toBen = to.length > 0 && to.every((e) => f.advisors.has(e));
  let clientId: string | null = null;
  let status: OutMail["status"] | null = null;
  if (toBen) {
    if (f.benDigest && !sensitive) status = "digest"; // write-ups and leave still come right away
  } else {
    clientId = await clientOf(db, o, f.clients);
    const mode = clientId ? f.clients.get(clientId)?.mode : "off";
    if (mode === "all" || (mode === "auto" && isAutomatic())) status = "held";
  }
  if (!status) return null;
  const now = new Date().toISOString();
  const id = `ob${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const mail: OutMail = {
    id, clientId, to: o.to, cc: o.cc, subject: o.subject, text: o.text, html: o.html, scheduledAt: o.scheduledAt,
    attachments: o.attachments, replyTo: o.replyTo, fromName: o.fromName, fromBox: o.fromBox,
    auto: isAutomatic(), audience: toBen ? "ben" : await audienceOf(db, clientId, to), sensitive,
    status, createdAt: now,
  };
  const { id: _i, clientId: _c, ...data } = mail; // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error } = await db.from("outbox").insert({ id, client_id: clientId, status, data });
  if (error) return null; // never lose an email: if it can't be kept, it goes out
  return { ok: true, id, held: true };
}

async function audienceOf(db: DB, clientId: string | null, to: string[]): Promise<OutMail["audience"]> {
  if (!clientId) return "employee";
  const { data } = await db.from("members").select("email").eq("client_id", clientId).in("email", to).limit(1);
  return data?.length ? "leader" : "employee";
}

export async function loadMail(db: DB, ids: string[]): Promise<OutMail[]> {
  const { data } = await db.from("outbox").select("id, client_id, status, data").in("id", ids);
  return (data ?? []).map((r) => ({ ...(r.data as OutMail), id: r.id as string, clientId: (r.client_id as string) ?? null, status: r.status as OutMail["status"] }));
}

export async function setStatus(db: DB, m: OutMail, status: OutMail["status"], by: string, error?: string) {
  const { id, clientId, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  await db.from("outbox").update({ status, data: { ...rest, status, doneAt: new Date().toISOString(), doneBy: by, error } }).eq("id", id);
}

/** Send held emails now. A scheduled send time that has passed goes out right away. */
export async function release(db: DB, ms: OutMail[], by: string, deliver: (o: MailOpts) => Promise<{ ok: boolean; reason?: string }>) {
  let sent = 0, failed = 0;
  for (const m of ms) {
    if (m.status !== "held") continue;
    const later = m.scheduledAt && new Date(m.scheduledAt).getTime() > Date.now() + 120_000 ? m.scheduledAt : undefined;
    const r = await deliver({ to: m.to, cc: m.cc, subject: m.subject, text: m.text, html: m.html, scheduledAt: later, attachments: m.attachments, replyTo: m.replyTo, fromName: m.fromName, fromBox: m.fromBox, bypassHold: true });
    if (r.ok) { sent++; await setStatus(db, m, "sent", by); } else { failed++; await setStatus(db, m, "failed", by, r.reason); }
  }
  return { sent, failed };
}

/**
 * Daily: skip what's gone stale, send HR his one summary of notes, and tell whoever approves
 * that emails are waiting. Runs inside the cron; its own emails skip the Outbox.
 */
export async function outboxCron(db: DB, deliver: (o: MailOpts) => Promise<{ ok: boolean }>, portal: string, log: string[]) {
  const f = await facts(db);
  if (!f.ready) return;
  const stale = new Date(Date.now() - HOLD_DAYS * 864e5).toISOString();
  const { data: old } = await db.from("outbox").select("id, client_id, status, data").eq("status", "held").lt("created_at", stale).limit(500);
  for (const r of old ?? []) await setStatus(db, { ...(r.data as OutMail), id: r.id as string, clientId: r.client_id as string }, "skipped", `Skipped after ${HOLD_DAYS} days`);
  if (old?.length) log.push(`outbox: skipped ${old.length} stale`);

  // HR's one daily summary
  const { data: dig } = await db.from("outbox").select("id, client_id, status, data").eq("status", "digest").order("created_at").limit(200);
  if (dig?.length) {
    const ms = dig.map((r) => ({ ...(r.data as OutMail), id: r.id as string, clientId: r.client_id as string }));
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<div style="font-family:Arial,sans-serif;color:#19283c;max-width:640px"><h2 style="font-family:Georgia,serif">Your daily summary</h2><p style="color:#5b6b85">${ms.length} update${ms.length === 1 ? "" : "s"} from the Alza Hub since yesterday.</p>${ms.map((m) => `<div style="border-top:1px solid #e6e1d6;padding:14px 0"><b>${esc(m.subject)}</b><div style="font-size:14px;line-height:1.5;color:#3a4553;white-space:pre-wrap;margin-top:6px">${esc(m.text.slice(0, 900))}${m.text.length > 900 ? "…" : ""}</div></div>`).join("")}</div>`;
    const text = ms.map((m) => `${m.subject}\n${m.text.slice(0, 900)}`).join("\n\n----\n\n");
    const to = [...new Set(ms.flatMap((m) => m.to))];
    const r = await deliver({ to, subject: `Alza Hub summary: ${ms.length} update${ms.length === 1 ? "" : "s"}`, text, html, bypassHold: true });
    if (r.ok) for (const m of ms) await setStatus(db, m, "sent", "Daily summary");
    log.push(`outbox: HR's summary with ${ms.length}`);
  }

  // waiting for approval: one note to HR across all companies
  const { data: held } = await db.from("outbox").select("client_id").eq("status", "held").limit(2000);
  if (held?.length) {
    const by = new Map<string, number>();
    for (const r of held) by.set(String(r.client_id ?? ""), (by.get(String(r.client_id ?? "")) ?? 0) + 1);
    const { data: cl } = await db.from("clients").select("id, name");
    const names = new Map((cl ?? []).map((c) => [String(c.id), String(c.name)]));
    const lines = [...by].map(([id, n]) => `${names.get(id) ?? "Other"}: ${n}`);
    const to = [...f.advisors].slice(0, 5);
    if (to.length)
      await deliver({
        to,
        subject: `${held.length} email${held.length === 1 ? " is" : "s are"} waiting for your OK`,
        text: `${lines.join("\n")}\n\nReview them: ${portal}/console/outbox`,
        html: `<div style="font-family:Arial,sans-serif;color:#19283c"><p>${held.length} email${held.length === 1 ? " is" : "s are"} waiting for your OK.</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><p><a href="${portal}/console/outbox">Review them in the Outbox</a></p></div>`,
        bypassHold: true,
      });
    log.push(`outbox: ${held.length} waiting`);
  }
}
