// Server-only helpers for API routes.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SERVER_LIVE = !!(url && anon);

/** Full-access client for scheduled jobs and checks. Never sent to the browser. */
export function admin(): SupabaseClient {
  if (!url || !service) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Caller {
  email: string;
  advisor: boolean;
  execOf: string[];
  memberOf: string[];
  name: string;
}

/** Who is calling this route? null when not signed in. */
export async function caller(req: Request): Promise<Caller | null> {
  if (!url || !anon) return null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();
  const db = admin();
  const [{ data: adv }, { data: mem }] = await Promise.all([
    db.from("advisors").select("email, name").eq("email", email).maybeSingle(),
    db.from("members").select("client_id, access, name").eq("email", email),
  ]);
  return {
    email,
    advisor: !!adv,
    execOf: (mem ?? []).filter((m) => m.access === "exec").map((m) => m.client_id),
    memberOf: (mem ?? []).map((m) => m.client_id),
    name: adv?.name ?? mem?.[0]?.name ?? email,
  };
}

export const PORTAL_URL = (process.env.PORTAL_URL || "https://portal.alzapc.com").replace(/\/$/, "");

export async function sendEmail(opts: { to: string[]; subject: string; text: string; html?: string; scheduledAt?: string }): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) return { ok: false, reason: "not_configured" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject.replace(/[\r\n]+/g, " ").slice(0, 200), text: opts.text, html: opts.html, scheduled_at: opts.scheduledAt }),
  });
  return r.ok ? { ok: true } : { ok: false, reason: `resend_${r.status}` };
}
