// The employee's survey page: no login, the link is the key.
// A personal link (from their email) or the survey's shared link / QR code both work.
// GET: the questions. POST { answers, lang }: hand it in. Nothing changes on a plain page load.
// Anonymous answers are saved with no name, no link and no time of day, so they can't be traced back.
import { NextResponse } from "next/server";
import { emailLogoUrl } from "@/lib/brand";
import { newId } from "@/lib/perform";
import { isOpen, type PResponse, type Survey } from "@/lib/pulse";
import { getSurvey, loadCtx, putSurvey } from "@/lib/pulseserver";
import { admin, PORTAL_URL, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const OK = /^[A-Za-z0-9]{16,64}$/;

async function find(token: string) {
  if (!OK.test(token)) return null;
  const db = admin();
  const { data: inv } = await db.from("pulse_invites").select("token, survey_id, done, data").eq("token", token).maybeSingle();
  let s: Survey | null = null;
  if (inv) s = await getSurvey(db, inv.survey_id as string);
  else {
    const { data } = await db.from("pulse_surveys").select("id, client_id, data").eq("data->>openToken", token).maybeSingle();
    if (data) s = { ...(data.data as Survey), id: data.id as string, clientId: data.client_id as string };
  }
  if (!s) return null;
  const x = await loadCtx(db, s.clientId);
  if (!x || !x.cfg.modules?.pulse) return null;
  return { db, x, s, invite: inv ? { token: inv.token as string, done: !!inv.done, data: inv.data as { personId: string; name: string } } : null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await find((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  const { x, s, invite } = f;
  return json({
    ok: true,
    company: x.company,
    accent: x.cfg.accent || "#19283c",
    logo: emailLogoUrl(s.clientId, x.cfg.logo, x.cfg.logoEmail, PORTAL_URL) || null,
    title: s.title,
    intro: s.intro,
    privacy: s.privacy,
    open: isOpen(s),
    done: !!invite?.done,
    personal: !!invite,
    closesAt: s.closesAt,
    questions: s.questions.map(({ id, text, kind, options, max, required, cat, es }) => ({ id, text, kind, options, max, required, cat, es })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const f = await find((await params).token);
  if (!f) return json({ ok: false, reason: "not_found" }, 404);
  const { db, s, invite } = f;
  if (!isOpen(s)) return json({ ok: false, reason: "closed" });
  if (invite?.done) return json({ ok: true, duplicate: true });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const raw = (b.answers && typeof b.answers === "object" ? b.answers : {}) as Record<string, unknown>;
  const answers: PResponse["answers"] = {};
  for (const q of s.questions) {
    const v = raw[q.id];
    if (v === undefined || v === null || v === "") { if (q.required) return json({ ok: false, reason: "required", id: q.id }); continue; }
    if (q.kind === "agree") { const n = Number(v); if (n >= 1 && n <= 5) answers[q.id] = Math.round(n); }
    else if (q.kind === "scale10") { const n = Number(v); if (n >= 0 && n <= 10) answers[q.id] = Math.round(n); }
    else if (q.kind === "yesno") { if (v === "Yes" || v === "No") answers[q.id] = v; }
    else if (q.kind === "choice") { if ((q.options ?? []).includes(String(v))) answers[q.id] = String(v); }
    else if (q.kind === "multi") { const arr = (Array.isArray(v) ? v : []).map(String).filter((o) => (q.options ?? []).includes(o)); if (arr.length) answers[q.id] = [...new Set(arr)].slice(0, q.max ?? 3); }
    else { const t = String(v).replace(/\r/g, "").trim().slice(0, 2000); if (t) answers[q.id] = t; }
  }
  if (!Object.keys(answers).length) return json({ ok: false, reason: "empty" });
  // mark the invitation first, so a double tap can't count twice
  if (invite) {
    const { data: upd } = await db.from("pulse_invites").update({ done: true }).eq("token", invite.token).eq("done", false).select("token");
    if (!upd?.length) return json({ ok: true, duplicate: true });
  }
  const resp: Omit<PResponse, "id" | "surveyId" | "day"> = { lang: b.lang === "es" ? "es" : "en", answers };
  if (s.privacy === "confidential" && invite) Object.assign(resp, { personId: invite.data.personId, personName: invite.data.name });
  const { error } = await db.from("pulse_responses").insert({ id: newId() + newId(), survey_id: s.id, client_id: s.clientId, data: resp });
  if (error) {
    if (invite) await db.from("pulse_invites").update({ done: false }).eq("token", invite.token);
    return json({ ok: false, reason: "save_failed" }, 500);
  }
  // keep the count fresh (recounted, so two people answering at once can't undercount)
  const { count } = await db.from("pulse_responses").select("id", { count: "exact", head: true }).eq("survey_id", s.id);
  const fresh = await getSurvey(db, s.id);
  if (fresh) await putSurvey(db, { ...fresh, responded: count ?? (fresh.responded ?? 0) + 1 });
  return json({ ok: true });
}
