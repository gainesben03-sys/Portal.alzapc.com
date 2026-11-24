// The Pause, server side: each company's no-sign-in link, the months HR has written, and counts.
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanPartner, cleanRituals, PAUSE_EVENTS, PAUSE_SEED, PauseEvent, PausePartner, PauseRitual } from "./pause";
import { PORTAL_URL } from "./server";
import type { ClientConfig } from "./modules";

const secret = () => process.env.ONE_CLICK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "alza";
const sig = (clientId: string) => createHmac("sha256", secret()).update(`pause:${clientId}`).digest("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();

/** "harborlight-k3j9d2xq": readable, and can't be guessed from the company name alone. Nothing to store. */
export const pauseToken = (clientId: string) => `${clientId}-${sig(clientId)}`;
export const pauseUrl = (clientId: string, base = PORTAL_URL) => `${base}/pause/${pauseToken(clientId)}`;

export interface PauseClient { id: string; name: string; accent: string; logo: string | null; spanish: boolean }

export async function clientByPauseToken(db: SupabaseClient, token: string): Promise<PauseClient | null> {
  const m = /^([a-z0-9][a-z0-9-]{0,48})-([a-z0-9]{8})$/.exec(String(token || "").toLowerCase());
  if (!m || sig(m[1]) !== m[2]) return null;
  const { data } = await db.from("clients").select("id, name, config").eq("id", m[1]).maybeSingle();
  if (!data) return null;
  const cfg = (data.config ?? {}) as ClientConfig & Record<string, unknown>;
  return { id: data.id, name: data.name, accent: (cfg.accent as string) || "#0d1a2e", logo: (cfg.logoEmail as string) || (cfg.logo as string) || null, spanish: true };
}

/** Saved months (or the starting set until HR saves his own) and the financial coach. */
export async function readPause(db: SupabaseClient): Promise<{ rituals: PauseRitual[]; partner: PausePartner }> {
  const { data } = await db.from("app_settings").select("data").eq("key", "pause").maybeSingle();
  const d = (data?.data ?? {}) as { rituals?: unknown; partner?: unknown };
  const saved = cleanRituals(d.rituals);
  return { rituals: saved.length ? saved : PAUSE_SEED, partner: cleanPartner(d.partner) };
}
export const readRituals = async (db: SupabaseClient) => (await readPause(db)).rituals;
export async function writePause(db: SupabaseClient, rituals: PauseRitual[], partner: PausePartner) {
  const { error } = await db.from("app_settings").upsert({ key: "pause", data: { rituals: cleanRituals(rituals), partner: cleanPartner(partner) } });
  return !error;
}

export async function logEvent(db: SupabaseClient, clientId: string, month: string, kind: PauseEvent) {
  if (!PAUSE_EVENTS.includes(kind) || !/^\d{4}-\d{2}$/.test(month)) return;
  await db.from("pause_events").insert({ client_id: clientId, month, kind });
}

/** Counts only: visits, starts, finished, per company per month. Nothing about any person. */
export async function pauseStats(db: SupabaseClient): Promise<{ ready: boolean; rows: { clientId: string; month: string; visit: number; start: number; complete: number; coach: number }[] }> {
  const { data, error } = await db.from("pause_events").select("client_id, month, kind").gte("at", new Date(Date.now() - 400 * 864e5).toISOString()).limit(50000);
  if (error) return { ready: false, rows: [] };
  const m = new Map<string, { clientId: string; month: string; visit: number; start: number; complete: number; coach: number }>();
  for (const r of data ?? []) {
    const k = `${r.client_id}|${r.month}`;
    const row = m.get(k) ?? { clientId: String(r.client_id), month: String(r.month), visit: 0, start: 0, complete: 0, coach: 0 };
    if (PAUSE_EVENTS.includes(r.kind as PauseEvent)) row[r.kind as PauseEvent]++;
    m.set(k, row);
  }
  return { ready: true, rows: [...m.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}
