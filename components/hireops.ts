"use client";

// What happens when a new hire moves forward: emails, client tasks, documents.
import { newId } from "@/lib/hiretasks";
import { Hire, Stage } from "@/lib/hires";
import { SharedFile } from "@/lib/modules";
import { authHeader, LIVE, uploadToStorage } from "@/lib/supabase";

const EMAIL_REASONS: Record<string, string> = {
  no_email: "There's no personal email on file for this hire yet.",
  forbidden: "Only Ben or an executive can send this.",
  not_found: "This hire hasn't finished saving yet. Try again in a few seconds.",
  signed_out: "You're signed out. Sign in again and retry.",
  no_key: "Email isn't connected yet (RESEND_API_KEY in Vercel).",
};

/** Plain-language reasons for email provider (Resend) errors. */
export function explainEmail(reason: string) {
  if (/^resend_401|api key is invalid/i.test(reason)) return "Didn't send: the email service rejected the key. In Vercel, replace RESEND_API_KEY with a current key from resend.com, then redeploy.";
  if (/^resend_403/i.test(reason)) return "Didn't send: the sender isn't allowed. NOTIFY_FROM must use a domain verified in Resend (alzapc.com).";
  if (/^resend_422/i.test(reason)) return `Didn't send: ${reason.replace(/^resend_422:?\s*/, "") || "the email service didn't accept the message"}.`;
  if (/^resend_429/i.test(reason)) return "Didn't send: too many emails at once. Try again in a minute.";
  if (reason === "not_configured") return "Email isn't set up yet: add RESEND_API_KEY and NOTIFY_FROM in Vercel, then redeploy.";
  return `Didn't send (${reason}). Try again.`;
}

export async function sendHireEmail(hireId: string, kind: "welcome" | "firstDay", test: boolean, edits?: Record<string, string>): Promise<{ sent: boolean; to?: string; msg: string }> {
  if (!LIVE) return { sent: false, msg: "Demo mode: emails go out once the portal is live." };
  try {
    const r = await fetch("/api/hire-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ hireId, kind, test, edits }),
    });
    const j = await r.json();
    if (j.sent) return { sent: true, to: j.to, msg: test ? `Test sent to ${j.to}` : `Sent to ${j.to}` };
    return { sent: false, msg: EMAIL_REASONS[j.reason] ?? explainEmail(String(j.reason ?? r.status)) };
  } catch {
    return { sent: false, msg: "Couldn't reach the server. Try again." };
  }
}

const SIGN_REASONS: Record<string, string> = {
  no_email: "There's no personal email on file for this hire.",
  no_document: "That document isn't saved yet. Wait a few seconds and try again.",
  file_missing: "Couldn't find the stored file. Draft or upload it again.",
  unreadable: "Couldn't read text from that file. Use the Word version Claude drafted, or upload a .docx or text-based PDF.",
  no_table: "E-signature isn't set up yet: run supabase/004_esign.sql in the Supabase SQL Editor.",
  forbidden: "Only Ben or an executive can send this.",
  not_found: "This hire hasn't finished saving yet. Try again in a few seconds.",
};

export async function requestSignature(hireId: string, path: string, kind: "offer" | "agreement", cancel = false): Promise<{ ok: boolean; reason?: string; msg: string }> {
  try {
    const r = await fetch("/api/esign/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ hireId, path, kind, void: cancel }),
    });
    const j = await r.json();
    if (j.ok) return { ok: true, msg: "Sent" };
    return { ok: false, reason: j.reason, msg: SIGN_REASONS[j.reason] ?? explainEmail(String(j.reason ?? r.status)) };
  } catch {
    return { ok: false, reason: "network", msg: "Couldn't reach the server. Try again." };
  }
}

/** What the server writes after a real send, mirrored locally so the next save keeps it. */
export function afterSend(h: Hire, kind: "welcome" | "firstDay", at: string): Partial<Hire> {
  const status: Stage = kind === "firstDay" && ["Approved to hire", "Offer sent", "Offer signed", "Package ready"].includes(h.status) ? "First-day email sent" : h.status;
  return { emails: { ...(h.emails ?? {}), [kind]: at }, status };
}

/** Store a hire document privately and return the file record (clients can open it; it stays out of Ben's inbox when he adds it). */
export async function storeHireFile(h: Hire, file: File, by: string, fromAdvisor: boolean, note: string): Promise<SharedFile> {
  const id = newId("f");
  let path: string | undefined;
  if (LIVE) path = await uploadToStorage(h.clientId, id, file);
  return {
    id,
    clientId: h.clientId,
    name: file.name,
    size: file.size,
    type: file.type,
    category: fromAdvisor ? "From Ben" : "Other",
    note,
    confidential: false,
    by,
    at: new Date().toISOString(),
    reviewed: fromAdvisor,
    path,
    fromAdvisor: fromAdvisor || undefined,
  };
}

export { newId, signedTasks, approvalTask } from "@/lib/hiretasks";
