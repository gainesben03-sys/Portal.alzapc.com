// Public exit survey: opened from the goodbye email. No login; the link is the key.
import { NextResponse } from "next/server";
import { Departure, SURVEY } from "@/lib/offboard";
import { admin, SERVER_LIVE } from "@/lib/server";
import type { ClientConfig } from "@/lib/modules";
import { notifyAdvisors } from "@/lib/exitnotify";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

async function find(token: string) {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return null;
  const db = admin();
  const { data } = await db.from("departures").select("id, client_id, data").eq("data->survey->>token", token).maybeSingle();
  if (!data) return null;
  const { data: cl } = await db.from("clients").select("name, config").eq("id", data.client_id).maybeSingle();
  return { db, id: data.id as string, clientId: data.client_id as string, d: data.data as Departure, company: cl?.name ?? "", cfg: (cl?.config ?? {}) as ClientConfig };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const x = await find((await params).token);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  return json({ ok: true, first: x.d.name.split(" ")[0], company: x.company, accent: x.cfg.accent || "#19283c", logo: x.cfg.logoEmail || x.cfg.logo || null, done: !!x.d.survey?.doneAt, questions: SURVEY });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const x = await find((await params).token);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  if (x.d.survey?.doneAt) return json({ ok: true, already: true });
  let b: { answers?: Record<string, unknown> };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const answers = SURVEY.map((q) => {
    const v = String(b.answers?.[q.id] ?? "").replace(/\r/g, "").trim().slice(0, 3000);
    if (q.kind === "scale" && v && !/^[1-5]$/.test(v)) return null;
    if (q.kind === "choice" && v && !q.options!.includes(v)) return null;
    return v ? { q: q.q, a: v } : null;
  }).filter((a): a is { q: string; a: string } => !!a);
  if (!answers.length) return json({ ok: false, reason: "empty" }, 400);
  const at = new Date().toISOString();
  const next: Departure = { ...x.d, survey: { ...x.d.survey!, doneAt: at, answers }, history: [...x.d.history, { at, by: x.d.name, text: "Completed the exit survey" }] };
  await x.db.from("departures").update({ data: next }).eq("id", x.id);
  await notifyAdvisors(x.db, x.clientId, x.company, next).catch(() => undefined);
  return json({ ok: true });
}
