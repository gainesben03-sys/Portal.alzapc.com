// Server-only: who gets copied on a new hire email.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hire, OnboardingSettings } from "./hires";
import { cleanCc, OnboardEmail } from "./onboardemail";

/** The hire's manager's email, found by name on the roster or the portal team. */
export async function managerEmail(db: SupabaseClient, clientId: string, h: Pick<Hire, "managerName">): Promise<string | null> {
  const name = (h.managerName || "").trim().toLowerCase();
  if (!name) return null;
  const { data: ppl } = await db.from("people").select("data").eq("client_id", clientId);
  const p = (ppl ?? []).map((r) => r.data as { name?: string; email?: string }).find((x) => (x.name || "").trim().toLowerCase() === name && x.email);
  if (p?.email) return p.email.toLowerCase();
  const { data: mem } = await db.from("members").select("email, name").eq("client_id", clientId);
  const m = (mem ?? []).find((x) => (x.name || "").trim().toLowerCase() === name);
  return m?.email?.toLowerCase() ?? null;
}

/** Everyone copied: the email's list, plus the manager and HR when switched on. Never the hire. */
export async function ccFor(db: SupabaseClient, clientId: string, e: Pick<OnboardEmail, "cc" | "ccManager" | "ccHr">, h: Hire, s: OnboardingSettings, extra?: string[]): Promise<string[]> {
  const out = new Set<string>(cleanCc([...(e.cc ?? []), ...(extra ?? [])]));
  if (e.ccManager) {
    const m = await managerEmail(db, clientId, h);
    if (m) out.add(m);
  }
  if (e.ccHr && s.hrEmail) out.add(s.hrEmail.toLowerCase());
  out.delete((h.personalEmail || "").trim().toLowerCase());
  return [...out].slice(0, 12);
}
