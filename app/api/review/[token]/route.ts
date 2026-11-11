// Public, link-only: someone outside the portal reviews the candidates for one role.
// The long random token in the link is the only key. Ben creates, and can turn off, each link.
// They see every pitch for the role except ones Ben passed on or cleared (or, if Ben set the link
// that way, only ones he's shared with the client). They play each pitch and say yes or no.
//
// GET  -> the role, the candidates, and this reviewer's calls so far
// POST { action: "media", c, f: "media" | "resume" } -> a 10-minute private link to the file
// POST { action: "review", c, decision: "yes" | "no", note? }

import { NextResponse } from "next/server";
import { Candidate, ClientConfig } from "@/lib/modules";
import { OutsideReview, reviewerSees } from "@/lib/pitch";
import { roleByReviewToken } from "@/lib/pitchserver";
import { advisorEmails, pushTo } from "@/lib/push";
import { admin, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BUCKET = "client-files";
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: D, status = 200) => NextResponse.json(b, { status, headers: NO_STORE });

async function load(token: string) {
  const db = admin();
  const hit = await roleByReviewToken(db, token);
  if (!hit) return null;
  const { data: cl } = await db.from("clients").select("name, config").eq("id", hit.role.clientId).maybeSingle();
  const cfg = (cl?.config ?? {}) as ClientConfig;
  if (!cl || cfg.videoScreening === false || cfg.modules?.recruiting === false) return null;
  return { db, ...hit, company: cl.name as string, cfg };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const { token } = await params;
  const x = await load(token);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  const { data: rows } = await x.db.from("candidates").select("id, data").eq("client_id", x.role.clientId).eq("data->>roleId", x.role.id);
  const { data: mineRows } = await x.db.from("outside_reviews").select("candidate_id, data").eq("client_id", x.role.clientId).eq("data->>reviewerId", x.link.id);
  const mineBy = new Map((mineRows ?? []).map((r) => [r.candidate_id as string, r.data as OutsideReview]));
  const list = (rows ?? [])
    .map((r) => ({ ...(r.data as Candidate), id: r.id as string }))
    .filter((c) => reviewerSees(c, x.link.scope))
    .sort((a, b) => String(a.pitch?.submittedAt ?? a.sentAt ?? "").localeCompare(String(b.pitch?.submittedAt ?? b.sentAt ?? "")));
  return json({
    ok: true,
    company: x.company,
    accent: x.cfg.accent || "#19283c",
    logo: x.cfg.logoEmail || x.cfg.logo || null,
    reviewer: x.link.name,
    expiresAt: x.link.expiresAt ?? null,
    role: { title: x.role.title, location: x.role.location, type: x.role.type, dept: x.role.dept, criteria: x.role.criteria ?? [] },
    // only what a reviewer needs: no candidate email, phone, or other people's notes
    candidates: list.map((c) => {
      const mine = mineBy.get(c.id);
      return {
        id: c.id,
        name: c.name,
        headline: c.headline,
        summary: c.summary,
        strengths: c.strengths ?? [],
        assessment: c.assessment,
        brief: c.pitch ? c.brief ?? null : undefined,
        kind: c.pitch?.kind ?? null,
        seconds: c.pitch?.seconds ?? null,
        hasMedia: !!c.pitch?.mediaPath && !c.mediaDeletedAt,
        hasResume: !!c.pitch?.resumePath && !c.mediaDeletedAt,
        linkedin: c.pitch?.linkedin ?? null,
        at: c.pitch?.submittedAt ?? c.sentAt ?? null,
        mine: mine ? { decision: mine.decision, note: mine.note ?? "" } : null,
      };
    }),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const { token } = await params;
  let b: D;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const x = await load(token);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  const id = String(b.c ?? "");
  const { data: row } = await x.db.from("candidates").select("id, client_id, data").eq("id", id).maybeSingle();
  const c = row?.data as Candidate | undefined;
  // the candidate has to belong to this link's role and be one the client can see
  if (!row || !c || row.client_id !== x.role.clientId || c.roleId !== x.role.id || !reviewerSees(c, x.link.scope)) return json({ ok: false, reason: "not_found" }, 404);

  if (b.action === "media") {
    const path = b.f === "resume" ? c.pitch?.resumePath : c.pitch?.mediaPath;
    if (!path || c.mediaDeletedAt || !path.startsWith(`${row.client_id}/pitch/${id}/`)) return json({ ok: false, reason: "none" }, 404);
    const { data: s, error } = await x.db.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !s) return json({ ok: false, reason: "storage" }, 500);
    return json({ ok: true, url: s.signedUrl });
  }

  if (b.action === "review") {
    const decision = b.decision === "yes" ? "yes" : b.decision === "no" ? "no" : null;
    if (!decision) return json({ ok: false, reason: "bad_request" }, 400);
    const note = String(b.note ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
    const now = new Date().toISOString();
    const rid = `${id}:${x.link.id}`;
    const { data: old } = await x.db.from("outside_reviews").select("data").eq("id", rid).maybeSingle();
    const prev = old?.data as OutsideReview | undefined;
    const mine: OutsideReview & { candidateId: string; roleId: string } = { candidateId: id, roleId: x.role.id, reviewerId: x.link.id, name: x.link.name, decision, note: note || undefined, at: now };
    const { error } = await x.db.from("outside_reviews").upsert({ id: rid, client_id: x.role.clientId, candidate_id: id, data: mine, updated_at: now }, { onConflict: "id" });
    if (error) return json({ ok: false, reason: "save_failed" }, 500);

    // tell Ben, unless they only changed the note
    if (prev?.decision !== decision || (note && note !== prev?.note)) {
      const said = decision === "yes" ? "Yes" : "No";
      const href = `/c/${x.role.clientId}/recruiting`;
      const text = `${x.link.name} said ${said} to ${c.name} (${x.role.title})`;
      await x.db.from("notices").insert({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, client_id: x.role.clientId, created_by: "review@portal", data: { clientId: x.role.clientId, kind: "feedback", text, href, at: now, read: false } });
      await pushTo(x.db, await advisorEmails(x.db), "activity", { title: `${said} on ${c.name}`, body: `${x.link.name}, ${x.role.title} at ${x.company}`, url: href, tag: `review-${id}` });
      await sendEmail({
        to: [(process.env.NOTIFY_TO || "ben@alzapc.com").trim()],
        subject: `[Portal] ${x.link.name} said ${said} to ${c.name} (${x.company})`,
        text: `${text} at ${x.company}, through their reviewer link.${prev && prev.decision !== decision ? ` (Changed from ${prev.decision === "yes" ? "Yes" : "No"}.)` : ""}${note ? `\n\nNote: ${note}` : ""}\n\n${siteUrl(req)}${href}`,
      });
    }
    return json({ ok: true });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
