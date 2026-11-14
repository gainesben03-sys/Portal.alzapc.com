// Employee experience, for Ben and executives (and the hire's own manager, for their playbook).
// GET  ?clientId=&hireId=       -> the hire's latest journey and a short-lived photo link
// POST { clientId, action, ... }:
//   settings { experience }     save the company's setup (questions, wording, nudges, playbook)
//   sendLink                    email the get-to-know-you link to the new hire
//   askBuddy { personId }       ask someone on the roster to be the buddy (their email is looked up here)
//   buddyYes / buddyNo / clearBuddy
//   intro { intro }             this hire's intro: wording, who it goes to, the day, or don't send
//   plan { key, on }            tick a playbook item (the manager can too)
//   close { closed }            stop everything for this hire (left early, etc)
import { NextResponse } from "next/server";
import { cleanExperience, HireXp } from "@/lib/experience";
import { askBuddy, buddyNo, buddyYes, loadHire, saveXp, sendLink, signed } from "@/lib/experienceserver";
import { managerEmail } from "@/lib/hireemailserver";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import type { TeamMember } from "@/lib/team";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

async function access(req: Request, clientId: string, hireId?: string) {
  const who = await caller(req);
  if (!who) return { err: json({ ok: false, reason: "signin" }, 401) };
  const hr = who.advisor || who.execOf.includes(clientId);
  if (!hireId) return hr ? { who, hr } : { err: json({ ok: false, reason: "forbidden" }, 403) };
  const db = admin();
  const c = await loadHire(db, hireId);
  if (!c || c.clientId !== clientId) return { err: json({ ok: false, reason: "not_found" }, 404) };
  let manager = false;
  if (!hr && who.memberOf.includes(clientId)) {
    const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    manager = same(who.name, c.h.managerName) || same(who.email, (await managerEmail(db, clientId, c.h).catch(() => null)) ?? "");
  }
  if (!hr && !manager) return { err: json({ ok: false, reason: "forbidden" }, 403) };
  return { who, hr, manager, c };
}

export async function GET(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const u = new URL(req.url);
  const a = await access(req, u.searchParams.get("clientId") || "", u.searchParams.get("hireId") || "");
  if (a.err) return a.err;
  const { c } = a;
  return json({ ok: true, xp: c!.h.xp ?? {}, history: c!.h.history ?? [], photo: await signed(c!.db, c!.h.xp?.photo) });
}

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  let b: { clientId?: string; hireId?: string; action?: string; experience?: unknown; personId?: string; intro?: Record<string, unknown>; key?: string; on?: boolean; closed?: boolean };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");

  if (b.action === "settings") {
    const a = await access(req, clientId);
    if (a.err) return a.err;
    const db = admin();
    const { data: cl } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
    if (!cl) return json({ ok: false, reason: "not_found" }, 404);
    const cfg = (cl.config ?? {}) as { onboarding?: Record<string, unknown> };
    const onboarding = { ...(cfg.onboarding ?? {}), experience: cleanExperience(b.experience) };
    const { error } = await db.from("clients").update({ config: { ...cfg, onboarding } }).eq("id", clientId);
    if (error) return json({ ok: false, reason: "save_failed" }, 500);
    return json({ ok: true, onboarding });
  }

  const a = await access(req, clientId, String(b.hireId ?? ""));
  if (a.err) return a.err;
  const { who, hr, c } = a as Required<typeof a>;
  const by = who.name || who.email;
  const done = (photo?: string) => json({ ok: true, hire: c.h, photo });

  try {
    if (b.action === "plan") {
      const key = String(b.key ?? "");
      if (!/^[A-Za-z0-9_-]{1,24}:\d{1,2}$/.test(key)) return json({ ok: false, reason: "bad_request" }, 400);
      await saveXp(c, (xp) => {
        const plan = { ...(xp.plan ?? {}) };
        if (b.on) plan[key] = new Date().toISOString();
        else delete plan[key];
        return { ...xp, plan };
      });
      return done();
    }
    if (!hr) return json({ ok: false, reason: "forbidden" }, 403);

    if (b.action === "sendLink") {
      const r = await sendLink(c, by);
      if (!r.ok) return json({ ok: false, reason: r.reason }, r.reason === "no_email" ? 400 : 502);
      return done();
    }
    if (b.action === "askBuddy") {
      const { data: p } = await c.db.from("people").select("id, data").eq("id", String(b.personId ?? "")).eq("client_id", clientId).maybeSingle();
      const person = p?.data as TeamMember | undefined;
      const email = (person?.email || "").trim().toLowerCase();
      if (!person) return json({ ok: false, reason: "not_found" }, 404);
      if (!email) return json({ ok: false, reason: "no_email" }, 400);
      const r = await askBuddy(c, by, { personId: p!.id, name: person.name, email });
      if (!r.ok) return json({ ok: false, reason: r.reason }, 502);
      return done();
    }
    if (b.action === "buddyYes") {
      await buddyYes(c, by);
      return done();
    }
    if (b.action === "buddyNo") {
      await buddyNo(c, "HR");
      return done();
    }
    if (b.action === "clearBuddy") {
      await saveXp(c, (xp) => {
        const { buddy: _b, ...rest } = xp;
        void _b;
        return rest;
      }, c.h.xp?.buddy ? { by, text: `Took ${c.h.xp.buddy.name} off as buddy` } : undefined);
      return done();
    }
    if (b.action === "intro") {
      const i = b.intro ?? {};
      const str = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n) || undefined;
      const on = /^\d{4}-\d{2}-\d{2}$/.test(String(i.on ?? "")) ? String(i.on) : undefined;
      await saveXp(c, (xp) => {
        if (xp.intro?.sentAt) return xp; // already out
        const intro: NonNullable<HireXp["intro"]> = {
          subject: str(i.subject, 200),
          message: str(i.message, 1500),
          closing: str(i.closing, 300),
          audience: i.audience === "site" || i.audience === "all" ? i.audience : undefined,
          wall: typeof i.wall === "boolean" ? i.wall : undefined,
          on,
          cancelled: !!i.cancelled || undefined,
        };
        (Object.keys(intro) as (keyof typeof intro)[]).forEach((k) => intro[k] === undefined && delete intro[k]);
        return { ...xp, intro };
      }, { by, text: i.cancelled ? "Company intro won't be sent" : "Company intro updated" });
      return done();
    }
    if (b.action === "close") {
      await saveXp(c, (xp) => ({ ...xp, closed: !!b.closed || undefined }), { by, text: b.closed ? "Closed the employee experience journey: nothing else will send" : "Reopened the employee experience journey" });
      return done();
    }
    return json({ ok: false, reason: "bad_request" }, 400);
  } catch {
    return json({ ok: false, reason: "save_failed" }, 500);
  }
}
