// The onboarding buddy's page. No login: the link from their email is the key.
// It shows only what a buddy needs: who's starting, when, the intro they approved, and the buddy's own to-dos.
// GET  -> details     POST { action: "yes" | "no" | "done" | "undo" | "note", id?, text? }
import { NextResponse } from "next/server";
import { buddyNudgeDone, fillVals, fillXp, introLines, nudgeDay, nudgesFor } from "@/lib/experience";
import { buddyNo, buddyYes, hireByToken, saveXp } from "@/lib/experienceserver";
import { longDate } from "@/lib/hires";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

async function find(token: string) {
  const c = await hireByToken(admin(), "buddy", token);
  if (!c || c.h.outcome || c.h.xp?.closed || !c.x.on || c.x.buddyOn === false || !c.h.xp?.buddy) return null;
  return c;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await find((await params).token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  const b = c.h.xp!.buddy!;
  const v = { ...fillVals(c.h, c.company), buddy: b.name };
  return json({
    ok: true,
    buddy: b.name.split(" ")[0],
    status: b.status,
    name: v.preferred + (v.last ? ` ${v.last}` : ""),
    first: v.preferred,
    title: c.h.title || "",
    manager: c.h.managerName || "",
    start: c.h.startDate ? longDate(c.h.startDate) : "",
    company: c.company,
    accent: c.cfg.accent || "#19283c",
    logo: c.cfg.logoEmail || c.cfg.logo || null,
    about: c.h.xp?.approvedAt ? introLines(c.h, c.x) : [],
    note: b.note || "",
    todos: nudgesFor(c.x).map((n) => ({ id: n.id, text: fillXp(n.text, v), on: nudgeDay(c.h, n), done: buddyNudgeDone(b, n.id) })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await find((await params).token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  let body: { action?: string; id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const b = c.h.xp!.buddy!;
  if (body.action === "yes") {
    if (b.status !== "yes") await buddyYes(c, b.name);
    return json({ ok: true, status: "yes" });
  }
  if (body.action === "no") {
    if (b.status === "asked") await buddyNo(c, b.name);
    return json({ ok: true, status: c.h.xp?.buddy?.status ?? b.status });
  }
  if (b.status !== "yes") return json({ ok: false, reason: "not_yet" }, 409);
  if (body.action === "done" || body.action === "undo") {
    const id = String(body.id ?? "");
    const n = nudgesFor(c.x).find((x) => x.id === id);
    if (!n) return json({ ok: false, reason: "bad_request" }, 400);
    await saveXp(c, (xp) => {
      const log = { ...(xp.buddy?.log ?? {}) };
      if (body.action === "done") log[`done:${id}`] = new Date().toISOString();
      else delete log[`done:${id}`];
      return { ...xp, buddy: { ...xp.buddy!, log } };
    }, body.action === "done" ? { by: b.name, text: `Buddy check-in done: ${fillXp(n.text, { ...fillVals(c.h, c.company), buddy: b.name }).slice(0, 80)}` } : undefined);
    return json({ ok: true });
  }
  if (body.action === "note") {
    const text = String(body.text ?? "").replace(/\r/g, "").trim().slice(0, 1500);
    await saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, note: text || undefined } }), text ? { by: b.name, text: "Buddy left a note for HR" } : undefined);
    return json({ ok: true });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
