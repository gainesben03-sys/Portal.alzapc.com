// Server-only helpers for the manager tools (Ask HR, practice): one Claude call, a daily limit, JSON parsing.
import type { SupabaseClient } from "@supabase/supabase-js";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const clip = (s: unknown, n: number) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "..." : t;
};
export const noDash = (s: unknown) => String(s ?? "").replace(/\s*—\s*/g, ", ").replace(/ ,/g, ",").trim();

/** Strip em dashes from every string in a JSON answer. */
export function tidy<T>(v: T): T {
  if (typeof v === "string") return noDash(v) as T;
  if (Array.isArray(v)) return v.map(tidy) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tidy(x)])) as T;
  return v;
}

export type SysBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export async function claude(opts: { system: string | SysBlock[]; messages: { role: "user" | "assistant"; content: string | D[] }[]; maxTokens: number; temperature?: number }): Promise<{ ok: true; text: string } | { ok: false; reason: string; detail?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: opts.maxTokens, system: opts.system, messages: opts.messages }),
  });
  if (!r.ok) return { ok: false, reason: `api_${r.status}`, detail: clip(await r.text(), 300) };
  const j = await r.json();
  return { ok: true, text: (j.content ?? []).filter((c: D) => c.type === "text").map((c: D) => c.text).join("\n") };
}

export function parseJson<T = D>(text: string): T | null {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
  } catch {
    return null;
  }
}

/** Daily limits per person, so one curious manager can't run up the bill. Ben has no limit. */
export const DAILY: Record<string, number> = { askhr: 40, roleplay: 25, feedback: 25 };

/** true when this person is under today's limit. Fails open if the usage table isn't there yet. */
export async function underLimit(db: SupabaseClient, email: string, kind: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count, error } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("email", email).eq("kind", kind).gte("at", since);
  if (error) return true;
  return (count ?? 0) < (DAILY[kind] ?? 50);
}

/** Record that something was used. Only the kind, who and when: never the question or the conversation. */
export async function logUsage(db: SupabaseClient, row: { email: string; clientId: string; kind: string; ref?: string; meta?: D }) {
  await db.from("ai_usage").insert({ email: row.email, client_id: row.clientId, kind: row.kind, ref: row.ref ?? null, meta: row.meta ?? {} }).then(
    () => undefined,
    () => undefined,
  );
}

export type Chat = { role: "user" | "assistant"; text: string }[];

/** Clean up a conversation sent from the browser: alternating turns, trimmed, capped. */
export function cleanChat(raw: unknown, maxTurns: number, maxChars: number): Chat | null {
  if (!Array.isArray(raw)) return null;
  const out: Chat = [];
  for (const m of raw.slice(-maxTurns * 2)) {
    const role = (m as D)?.role === "assistant" ? "assistant" : "user";
    const text = clip(String((m as D)?.text ?? "").trim(), maxChars);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += "\n" + text;
    else out.push({ role, text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}
