// Ben's email inbox: what came in by forward or paste, and what it became. Advisors only.
// POST { action, ... }:
//   list                               everything, newest first
//   paste { subject, text, clientId? } run an email through the same steps as a forward
//   update { id, patch }               fix the client, type, title, due date, steps or checklist
//   add { id }                         make the task or project now (after a review, or to un-private one)
//   dismiss { id } / delete { id }
//   file { id, path }                  a short-lived link to an attachment
import { NextResponse } from "next/server";
import { InboxItem, stepsFor, WorkType } from "@/lib/inbox";
import { intake, makeWork, saveItem, tableReady } from "@/lib/inboxserver";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { logUsage, underLimit } from "@/lib/ai";

export const maxDuration = 60;
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const TYPES: WorkType[] = ["offer", "termination", "newhire", "jd", "investigation", "leave", "policy", "other"];

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who?.advisor) return json({ ok: false, reason: "forbidden" }, 403);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const db = admin();
  if (!(await tableReady(db))) return json({ ok: false, reason: "setup" }, 503);
  const action = String(b.action ?? "");
  const get = async (): Promise<InboxItem | null> => {
    const { data } = await db.from("inbox_items").select("id, data").eq("id", String(b.id ?? "")).maybeSingle();
    return data ? ({ ...(data.data as InboxItem), id: data.id as string }) : null;
  };
  try {
    if (action === "list") {
      const { data } = await db.from("inbox_items").select("id, data").order("created_at", { ascending: false }).limit(300);
      return json({ ok: true, items: (data ?? []).map((r) => ({ ...(r.data as InboxItem), id: r.id as string })) });
    }
    if (action === "paste") {
      const text = String(b.text ?? "").replace(/\r/g, "").trim().slice(0, 30000);
      if (text.length < 10) return json({ ok: false, reason: "bad_request" }, 400);
      if (!(await underLimit(db, who.email, "inbox"))) return json({ ok: false, reason: "limit" }, 429);
      const item = await intake(db, { via: "paste", from: who.email, subject: String(b.subject ?? "").slice(0, 300), text, trusted: true, clientHint: typeof b.clientId === "string" && b.clientId ? b.clientId : undefined });
      await logUsage(db, { email: who.email, clientId: item.clientId ?? "", kind: "inbox", ref: item.id });
      return json({ ok: true, item });
    }
    const it = await get();
    if (!it) return json({ ok: false, reason: "not_found" }, 404);
    if (action === "update") {
      const p = (b.patch ?? {}) as Partial<InboxItem>;
      const next: InboxItem = { ...it };
      if (typeof p.clientId === "string") next.clientId = p.clientId || undefined;
      if (TYPES.includes(p.type as WorkType) && p.type !== it.type) { next.type = p.type as WorkType; if (it.status !== "created") next.steps = stepsFor(next.type); }
      if (typeof p.title === "string" && p.title.trim()) next.title = p.title.trim().slice(0, 140);
      if (typeof p.summary === "string") next.summary = p.summary.slice(0, 1000);
      if (p.due === null || p.due === "" ) next.due = undefined; else if (typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due)) next.due = p.due;
      if (typeof p.sensitive === "boolean") next.sensitive = p.sensitive;
      if (Array.isArray(p.steps)) next.steps = p.steps.slice(0, 30).map((s, i) => ({ id: String(s.id || `s${i + 1}`), text: String(s.text ?? "").slice(0, 300), who: (s.who === "client" ? "client" : "ben") as "client" | "ben", done: !!s.done, doneAt: s.done ? s.doneAt || new Date().toISOString() : undefined })).filter((s) => s.text);
      if (next.status === "unsorted" && next.clientId) { next.status = next.sensitive ? "private" : "review"; next.why = next.sensitive ? undefined : "Ready to add."; }
      await saveItem(db, next);
      return json({ ok: true, item: next });
    }
    if (action === "add") {
      if (!it.clientId) return json({ ok: false, reason: "client" }, 400);
      if (it.status === "created") return json({ ok: true, item: it });
      const next = await makeWork(db, { ...it, sensitive: false, why: undefined });
      await saveItem(db, next);
      return json({ ok: true, item: next });
    }
    if (action === "dismiss") {
      const next = { ...it, status: "dismissed" as const };
      await saveItem(db, next);
      return json({ ok: true, item: next });
    }
    if (action === "delete") {
      const paths = it.attachments.map((a) => a.path).filter(Boolean) as string[];
      if (paths.length) await db.storage.from("client-files").remove(paths);
      await db.from("inbox_items").delete().eq("id", it.id);
      return json({ ok: true });
    }
    if (action === "file") {
      const a = it.attachments.find((x) => x.path && x.path === b.path);
      if (!a?.path) return json({ ok: false, reason: "not_found" }, 404);
      const { data } = await db.storage.from("client-files").createSignedUrl(a.path, 600);
      return json({ ok: !!data?.signedUrl, url: data?.signedUrl });
    }
  } catch (e) {
    return json({ ok: false, reason: e instanceof Error && e.message === "save_failed" ? "save_failed" : "error" }, 500);
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
