"use client";

// Monthly newsletters (Manager Minute, The Pause). Ben queues and edits them in the console,
// copies the HTML to send from the client's own mailbox, and saves them to the client's Library.
// Not part of the main store: issues are large and only loaded on the pages that use them.

import { LIVE, sb } from "./supabase";

export type NlKind = "manager-minute" | "the-pause" | "intro" | "other";
export type NlStatus = "draft" | "ready" | "sent";

export interface Newsletter {
  id: string;
  clientId: string;
  kind: NlKind;
  month: string; // yyyy-mm
  lang: string; // "en" | "en+es"
  subject: string;
  preview?: string;
  sendFrom?: string;
  html: string;
  originalHtml?: string;
  status: NlStatus;
  sentAt?: string;
  inLibrary: boolean;
  label?: string;
  createdAt: string;
  updatedAt: string;
}

export const KIND_LABEL: Record<NlKind, string> = {
  "manager-minute": "Manager Minute",
  "the-pause": "The Pause",
  intro: "Introduction",
  other: "Other",
};
export const KIND_AUDIENCE: Record<NlKind, string> = {
  "manager-minute": "Managers",
  "the-pause": "All staff",
  intro: "All staff",
  other: "",
};
export const STATUS_LABEL: Record<NlStatus, string> = { draft: "Draft", ready: "Ready", sent: "Sent" };

export function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
export function thisMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return thisMonth(d);
}
export const newNlId = () => `nl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ------------------------------------------------------------------ demo (no Supabase)

const DEMO_KEY = "alza-portal-demo-newsletters-v1";

function sampleHtml(company: string, accent: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const p = (t: string) => `<p style="margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:1.6;color:#2B2B2B;">${t}</p>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manager Minute</title></head>
<body style="margin:0;padding:0;background:#F4F4F4;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F4F4"><tr><td align="center" style="padding:28px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
<tr><td bgcolor="${accent}" style="background:${accent};padding:24px 40px 32px 40px;"><p style="margin:0;font-family:Georgia, serif;font-size:22px;color:#FFFFFF;">Manager Minute</p><p style="margin:4px 0 0 0;font-family:Arial, sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#FFFFFF;opacity:.8;">${esc(company)}</p><h1 style="margin:26px 0 0 0;font-family:Georgia, serif;font-size:32px;font-weight:normal;line-height:1.15;color:#FFFFFF;">Feedback that actually lands</h1></td></tr>
<tr><td style="padding:28px 40px 8px 40px;">${p("Someone on your team keeps missing the same detail. You've hinted twice. They haven't picked it up, and you're starting to get frustrated.")}${p("<b>What to say:</b> <i>&quot;Can I give you something specific? On the last two event sheets the load-in time was missing. Next time, check that line before it goes out.&quot;</i>")}</td></tr>
<tr><td style="padding:0 40px 30px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:2px solid ${accent};padding:20px 22px;"><p style="margin:0 0 6px 0;font-family:Arial, sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${accent};">Your 5-minute move</p><p style="margin:0;font-family:Georgia, serif;font-size:19px;line-height:1.5;color:#2B2B2B;">This week, give one piece of specific, same-day feedback. Name the moment, the impact, and what you want next time.</p></td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}

function demoLoad(clients: { id: string; name: string; accent: string }[]): Newsletter[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw) as Newsletter[];
  } catch {}
  const now = new Date().toISOString();
  const m = thisMonth();
  const seed: Newsletter[] = clients.slice(0, 2).map((c, i) => {
    const html = sampleHtml(c.name, c.accent || "#19283c");
    return { id: `demo-nl-${i}`, clientId: c.id, kind: "manager-minute", month: m, lang: "en", subject: "Manager Minute: Feedback that actually lands", preview: "One specific sentence beats three hints.", sendFrom: "", html, originalHtml: html, status: "ready", inLibrary: i === 0, createdAt: now, updatedAt: now };
  });
  demoSave(seed);
  return seed;
}
function demoSave(list: Newsletter[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
  } catch {}
}

// ------------------------------------------------------------------ load / save

type Row = { id: string; client_id: string; data: Omit<Newsletter, "id" | "clientId"> };
const fromRow = (r: Row): Newsletter => ({ ...(r.data as Newsletter), id: r.id, clientId: r.client_id });

const setupError = (m: string) => (/newsletters/.test(m) && /exist|schema cache/i.test(m) ? "setup" : m);
const LIGHT = "id, client_id, kind:data->>kind, month:data->>month, lang:data->>lang, subject:data->>subject, status:data->>status, inLibrary:data->inLibrary, sentAt:data->>sentAt, sendFrom:data->>sendFrom, updatedAt:data->>updatedAt, createdAt:data->>createdAt";

/** All issues Ben can see, or one client's Library (RLS hides the rest from clients). `light` skips the email itself. */
export async function loadNewsletters(opts: { clientId?: string; light?: boolean; demoClients?: { id: string; name: string; accent: string }[] } = {}): Promise<{ list: Newsletter[]; error?: string }> {
  if (!LIVE) {
    const all = demoLoad(opts.demoClients ?? []);
    return { list: opts.clientId ? all.filter((n) => n.clientId === opts.clientId) : all };
  }
  if (opts.light) {
    let q = sb().from("newsletters").select(LIGHT).order("created_at");
    if (opts.clientId) q = q.eq("client_id", opts.clientId);
    const { data, error } = await q;
    if (error) return { list: [], error: setupError(error.message) };
    return { list: ((data ?? []) as unknown as (Omit<Newsletter, "clientId" | "html"> & { client_id: string })[]).map(({ client_id, ...r }) => ({ ...r, clientId: client_id, html: "", inLibrary: !!r.inLibrary })) };
  }
  let q = sb().from("newsletters").select("id, client_id, data").order("created_at");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q;
  if (error) return { list: [], error: setupError(error.message) };
  return { list: ((data ?? []) as Row[]).map(fromRow) };
}

export async function getNewsletter(id: string): Promise<{ item?: Newsletter; error?: string }> {
  if (!LIVE) return { item: demoLoad([]).find((n) => n.id === id) };
  const { data, error } = await sb().from("newsletters").select("id, client_id, data").eq("id", id).maybeSingle();
  if (error) return { error: setupError(error.message) };
  return { item: data ? fromRow(data as Row) : undefined };
}

export async function saveNewsletter(n: Newsletter): Promise<string | null> {
  const next = { ...n, updatedAt: new Date().toISOString() };
  if (!LIVE) {
    const all = demoLoad([]);
    const i = all.findIndex((x) => x.id === n.id);
    if (i >= 0) all[i] = next;
    else all.push(next);
    demoSave(all);
    return null;
  }
  const { id, clientId, ...data } = next;
  const { error } = await sb().from("newsletters").upsert({ id, client_id: clientId, data: { ...data, clientId } }, { onConflict: "id" });
  return error ? error.message : null;
}

export async function deleteNewsletter(id: string): Promise<string | null> {
  if (!LIVE) {
    demoSave(demoLoad([]).filter((x) => x.id !== id));
    return null;
  }
  const { error } = await sb().from("newsletters").delete().eq("id", id);
  return error ? error.message : null;
}

// ------------------------------------------------------------------ copying

/** Copy the email so it pastes formatted into Gmail or Outlook. Falls back to selecting it in the preview. */
export async function copyRich(html: string, frame?: HTMLIFrameElement | null): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
      const text = body.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|h\d|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([body], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return true;
    }
  } catch {}
  try {
    const doc = frame?.contentDocument;
    if (!doc) return false;
    const sel = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = doc.execCommand("copy");
    sel?.removeAllRanges();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
