// Translate what people typed, for whoever is reading it in the other language.
// POST { texts: string[], to: "en" | "es" } -> { out: string[] } (same order; unchanged if already in that language)
// Signed-in people only. Results are cached per server so the same comment isn't translated twice.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { claude, logUsage, parseJson, underLimit } from "@/lib/ai";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const NAME = { en: "English", es: "Spanish (neutral Latin American)" } as const;
const cache = new Map<string, string>();
const key = (t: string, to: string) => createHash("sha1").update(`${to}\n${t}`).digest("base64url");

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" });
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signed_out" }, 401);
  let b: { texts?: unknown[]; to?: string };
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const to = b.to === "es" ? "es" : "en";
  const texts = (Array.isArray(b.texts) ? b.texts : []).slice(0, 40).map((t) => String(t ?? "").slice(0, 2000));
  const out = texts.map((t) => (t.trim() ? cache.get(key(t, to)) : t));
  const need = texts.map((t, i) => (out[i] === undefined ? i : -1)).filter((i) => i >= 0);
  if (need.length) {
    const db = admin();
    if (!(await underLimit(db, who.email, "translate"))) return json({ ok: false, reason: "limit" }, 429);
    const items = Object.fromEntries(need.map((i) => [String(i), texts[i]]));
    const r = await claude({
      system: `You translate short workplace messages into ${NAME[to]}. Same meaning and strength, nothing added or softened. Keep names. No em dashes. If a text is already in ${NAME[to]}, return it exactly as written. Reply with JSON only.`,
      maxTokens: 4000,
      messages: [{ role: "user", content: `Translate every value. Keep the keys.\n${JSON.stringify(items)}\nReturn {"t": {"<key>": "<text>"}}` }],
    });
    if (!r.ok) return json({ ok: false, reason: r.reason }, 502);
    const j = parseJson<{ t?: Record<string, string> }>(r.text);
    for (const i of need) {
      const v = typeof j?.t?.[String(i)] === "string" ? j!.t![String(i)].replace(/—/g, ", ") : texts[i];
      out[i] = v;
      cache.set(key(texts[i], to), v);
    }
    if (cache.size > 5000) cache.clear();
    await logUsage(db, { email: who.email, clientId: who.memberOf[0] ?? "", kind: "translate" });
  }
  return json({ ok: true, out });
}
