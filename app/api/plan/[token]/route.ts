// The manager's plan page for one new hire. No login: the link in their reminder emails is the key.
// Shows the playbook (checklist and questions by stage), the new hire's "just for your manager" answers, and the manager's own notes.
// GET -> plan      POST { action: "tick", key, on } | { action: "note", text }
import { NextResponse } from "next/server";
import { currentStage, fillVals, fillXp, pageOpen, playbookOn, privateAnswers, stageDay, stagesFor } from "@/lib/experience";
import { hireByToken, saveXp, XpCtx } from "@/lib/experienceserver";
import { longDate } from "@/lib/hires";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });
const todayISO = () => new Date(Date.now() - 8 * 3600_000).toISOString().slice(0, 10);
const open = (c: XpCtx) => playbookOn(c.x) && !c.h.outcome && !c.h.imported && !c.h.xp?.closed && pageOpen(c.h, todayISO());

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await hireByToken(admin(), "plan", (await params).token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  if (!open(c)) return json({ ok: false, reason: "closed" }, 404);
  const v = { ...fillVals(c.h, c.company), buddy: c.h.xp?.buddy?.status === "yes" ? c.h.xp.buddy.name : "" };
  const cur = currentStage(c.h, c.x, todayISO());
  return json({
    ok: true,
    company: c.company,
    accent: c.cfg.accent || "#19283c",
    manager: c.h.managerName || "",
    name: `${v.preferred} ${v.last}`.trim(),
    first: v.preferred,
    title: c.h.title || "",
    start: c.h.startDate ? longDate(c.h.startDate) : "",
    buddy: v.buddy,
    current: cur.id,
    stages: stagesFor(c.x).map((s) => ({ id: s.id, label: s.label, on: stageDay(c.h, s), items: s.items.map((t, i) => ({ text: fillXp(t, v), done: !!c.h.xp?.plan?.[`${s.id}:${i}`] })), asks: s.asks.map((q) => fillXp(q, v)) })),
    answers: privateAnswers(c.h, c.x),
    notes: c.h.xp?.mgrNotes || "",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await hireByToken(admin(), "plan", (await params).token);
  if (!c || !open(c)) return json({ ok: false, reason: "not_found" }, 404);
  let b: { action?: string; key?: string; on?: boolean; text?: string };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const by = c.h.managerName || "Manager";
  if (b.action === "tick") {
    const key = String(b.key ?? "");
    const m = /^([A-Za-z0-9_-]{1,24}):(\d{1,2})$/.exec(key);
    const st = m && stagesFor(c.x).find((s) => s.id === m[1]);
    if (!m || !st || Number(m[2]) >= st.items.length) return json({ ok: false, reason: "bad_request" }, 400);
    await saveXp(c, (xp) => {
      const plan = { ...(xp.plan ?? {}) };
      if (b.on) plan[key] = new Date().toISOString();
      else delete plan[key];
      return { ...xp, plan };
    }, b.on ? { by, text: `Playbook: ${fillXp(st.items[Number(m[2])], fillVals(c.h, c.company)).slice(0, 80)}` } : undefined);
    return json({ ok: true });
  }
  if (b.action === "note") {
    const text = String(b.text ?? "").replace(/\r/g, "").trim().slice(0, 4000);
    await saveXp(c, (xp) => ({ ...xp, mgrNotes: text || undefined }));
    return json({ ok: true });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
