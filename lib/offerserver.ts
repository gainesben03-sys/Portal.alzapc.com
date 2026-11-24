// Offer requests, server side: each company's request link, signed approval links, and the emails.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { longDate, type Approval, type Hire } from "./hires";
import type { ClientConfig } from "./modules";
import { payText } from "./offerreq";
import { PORTAL_URL, sendEmail } from "./server";

const secret = () => process.env.ONE_CLICK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "alza";
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");
const short = (s: string) => mac(s).replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toLowerCase();

/** "harborlight-ab12cd34ef": the company's one link for offer requests. Nothing to store. */
export const requestToken = (clientId: string) => `${clientId}-${short(`offer-request:${clientId}`)}`;
export const requestUrl = (clientId: string, base = PORTAL_URL) => `${base}/request/${requestToken(clientId)}`;

export interface Co { id: string; name: string; accent: string; logo: string | null; approver: { name: string; email: string } | null; cfg: ClientConfig }
export async function clientById(db: SupabaseClient, id: string): Promise<Co | null> {
  const { data } = await db.from("clients").select("id, name, config").eq("id", id).maybeSingle();
  if (!data) return null;
  const cfg = (data.config ?? {}) as ClientConfig;
  const a = cfg.offerApprover;
  return { id: data.id, name: data.name, accent: cfg.accent || "#0d1a2e", logo: cfg.logoEmail || cfg.logo || null, approver: a?.email ? { name: a.name || a.email, email: a.email.toLowerCase() } : null, cfg };
}
export async function clientByRequestToken(db: SupabaseClient, token: string) {
  const m = /^([a-z0-9][a-z0-9-]{0,48})-([a-z0-9]{10})$/.exec(String(token || "").toLowerCase());
  if (!m || short(`offer-request:${m[1]}`) !== m[2]) return null;
  return clientById(db, m[1]);
}

/** A signed link for one person to decide one thing on one hire. Good for 21 days. */
export interface ApproveBody { h: string; c: string; k: "pre" | "letter"; e: string; x: number }
export function approveUrl(b: Omit<ApproveBody, "x">, base = PORTAL_URL) {
  const body = Buffer.from(JSON.stringify({ ...b, x: Date.now() + 21 * 864e5 })).toString("base64url");
  return `${base}/approve/${body}.${mac(`approve:${body}`)}`;
}
export function readApprove(token: string): ApproveBody | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(`approve:${body}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as ApproveBody;
    return v.h && v.c && (v.k === "pre" || v.k === "letter") && v.e ? v : null;
  } catch {
    return null;
  }
}

export async function getHire(db: SupabaseClient, id: string, clientId: string): Promise<Hire | null> {
  const { data } = await db.from("hires").select("data").eq("id", id).eq("client_id", clientId).maybeSingle();
  return (data?.data as Hire) ?? null;
}
export async function putHire(db: SupabaseClient, h: Hire, createdBy?: string) {
  if (createdBy) {
    const { error } = await db.from("hires").insert({ id: h.id, client_id: h.clientId, data: h, created_by: createdBy });
    return !error;
  }
  const { error } = await db.from("hires").update({ data: h }).eq("id", h.id);
  return !error;
}

// ---------------------------------------------------------------- emails
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mail(co: Co, title: string, paras: string[], button?: { label: string; url: string }, rows?: [string, string][]) {
  const a = co.accent;
  const html = `<div style="background:#f5f3ee;padding:28px 12px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e1d6"><div style="background:${a};color:#fff;padding:16px 24px;font-weight:bold">${esc(co.name)}</div><div style="padding:24px;color:#19283c;font-size:15px;line-height:1.55"><h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 14px;font-size:22px">${esc(title)}</h2>${paras.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("")}${rows ? `<table style="width:100%;border-collapse:collapse;margin:6px 0 10px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5b6b85;font-size:13px;width:38%;border-top:1px solid #eee">${esc(k)}</td><td style="padding:6px 0;border-top:1px solid #eee">${esc(v)}</td></tr>`).join("")}</table>` : ""}${button ? `<p style="margin:20px 0 4px"><a href="${button.url}" style="display:inline-block;background:${a};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(button.label)}</a></p>` : ""}</div></div><p style="text-align:center;color:#8a93a3;font-size:12px;margin:14px 0 0">Sent by the ${esc(co.name)} People Hub</p></div>`;
  const text = [title, "", ...paras, ...(rows ?? []).map(([k, v]) => `${k}: ${v}`), button ? `\n${button.label}: ${button.url}` : ""].join("\n");
  return { html, text };
}
export const summaryRows = (h: Hire): [string, string][] => [
  ["New hire", h.name], ["Job title", h.title], ["Reports to", h.managerName || "-"], ["Start date", h.startDate ? longDate(h.startDate) : "-"],
  ["Pay", `${payText({ payType: h.payType, payAmount: h.payAmount as number })}${h.exempt === "exempt" ? ", exempt" : ", non-exempt"}`],
  ["Type", h.request?.employment || "-"], ...(h.notes ? ([["Notes", h.notes]] as [string, string][]) : []),
];

const ben = () => process.env.NOTIFY_TO || "ben@alzapc.com";

export async function emailApprover(co: Co, h: Hire, base: string) {
  const a = h.preApproval!;
  const url = approveUrl({ h: h.id, c: co.id, k: "pre", e: a.email }, base);
  const m = mail(co, `Approve an offer for ${h.name}?`, [`${h.request?.name ?? "A hiring manager"} wants to make an offer. Take a look and approve it or send it back. No sign-in needed.`], { label: "Review the offer", url }, summaryRows(h));
  return sendEmail({ to: [a.email], subject: `Approve an offer: ${h.name}, ${h.title}`, ...m, clientId: co.id, sensitive: false });
}
export async function emailBenNew(co: Co, h: Hire, base: string) {
  const m = mail(co, `New offer to write: ${h.name}`, [`${h.request?.name} requested an offer${h.preApproval ? `, approved by ${h.preApproval.name}` : h.request?.approvedBy ? `, approved by ${h.request.approvedBy}` : ""}. The hire page is set up with everything below.`], { label: "Open the hire", url: `${base}/c/${co.id}/hires/${h.id}` }, summaryRows(h));
  return sendEmail({ to: [ben()], subject: `${co.name}: offer to write for ${h.name}`, ...m, bypassHold: true });
}
export async function emailRequester(co: Co, h: Hire, what: "received" | "sent_back") {
  const r = h.request;
  if (!r?.email) return;
  const m = what === "received"
    ? mail(co, "Got it", [h.preApproval ? `Your offer request for ${h.name} went to ${h.preApproval.name} to approve. Once it's approved, HR writes the offer letter and sends it to you to look over before it goes out.` : `Your offer request for ${h.name} is with HR. He'll write the offer letter and send it to you to look over before it goes out.`], undefined, summaryRows(h))
    : mail(co, "Your offer request was sent back", [`${h.preApproval?.name} sent back the offer request for ${h.name}.`, h.preApproval?.note ? `Their note: "${h.preApproval.note}"` : "Check in with them, then send a new request."]);
  return sendEmail({ to: [r.email], subject: what === "received" ? `Offer request received: ${h.name}` : `Offer request sent back: ${h.name}`, ...m, clientId: co.id });
}
export async function emailLetterApproval(co: Co, h: Hire, base: string) {
  const a = h.letterApproval!;
  const url = approveUrl({ h: h.id, c: co.id, k: "letter", e: a.email }, base);
  const m = mail(co, `Look over ${h.name}'s offer letter`, [`HR wrote the offer letter for ${h.name}. Open it, then approve it or ask for changes. Once you approve, HR sends it to ${h.name.split(" ")[0]} to sign.`], { label: "Review the offer letter", url }, summaryRows(h));
  return sendEmail({ to: [a.email], subject: `Approve the offer letter: ${h.name}`, ...m, clientId: co.id });
}
export async function emailBenDecision(co: Co, h: Hire, a: Approval, kind: "pre" | "letter", base: string) {
  const ok = a.status === "approved";
  const title = kind === "pre" ? (ok ? `${a.name} approved the offer for ${h.name}` : `${a.name} sent back the offer request for ${h.name}`) : ok ? `${a.name} approved ${h.name}'s offer letter` : `${a.name} wants changes to ${h.name}'s offer letter`;
  const next = kind === "pre" ? (ok ? "Next: write the offer letter." : "No offer letter needed unless they send a new request.") : ok ? "Next: send it for signature." : "Next: update the letter and send it back to them.";
  const m = mail(co, title, [a.note ? `Their note: "${a.note}"` : "", next].filter(Boolean), { label: "Open the hire", url: `${base}/c/${co.id}/hires/${h.id}` }, kind === "pre" && ok ? summaryRows(h) : undefined);
  return sendEmail({ to: [ben()], subject: `${co.name}: ${title}`, ...m, bypassHold: true });
}
