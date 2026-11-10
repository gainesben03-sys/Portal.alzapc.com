// Signed in: give a shoutout from the portal, react, and (Ben and executives) review held ones.
// POST { clientId, action: "give", to, value?, message }
// POST { clientId, action: "react", id, emoji }
// POST { clientId, action: "review", id, approve }   Ben or an executive
// POST { clientId, action: "remove", id }            Ben, an executive, or the person's manager

import { NextResponse } from "next/server";
import { REACTIONS, Shoutout } from "@/lib/recognition";
import { Challenge, CHALLENGE_INFO } from "@/lib/challenges";
import { challengesFor, checkChainPass, checkGoals } from "@/lib/challengeserver";
import { Nudge, NudgeAudience, pickLine, waves } from "@/lib/nudge";
import { nudgeTargets, sendNudgeWave } from "@/lib/nudgeserver";
import { celebrateMail, createShout, rosterFor, tellThem, ShoutClient } from "@/lib/shoutserver";
import { admin, caller, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";
import type { ClientConfig } from "@/lib/modules";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  let b: D;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  if (!me.advisor && !me.memberOf.includes(clientId)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const db = admin();
  const { data: cl } = await db.from("clients").select("id, name, config").eq("id", clientId).maybeSingle();
  const cfg = (cl?.config ?? {}) as ClientConfig;
  if (!cl || !(cfg.modules as D | undefined)?.recognition || !cfg.recognition?.token) return NextResponse.json({ ok: false, reason: "off" });
  const c: ShoutClient = { id: cl.id, name: cl.name, config: cfg, rec: cfg.recognition };
  const { data: mem } = await db.from("members").select("name, access").eq("client_id", clientId).eq("email", me.email).maybeSingle();
  const exec = me.advisor || mem?.access === "exec";
  const myName = me.advisor ? "Ben Gaines" : (mem?.name as string) || me.email.split("@")[0];
  const roster = await rosterFor(db, clientId);

  // Ben: send himself a sample celebration email with the settings on screen (saved or not)
  if (b.action === "testEmail") {
    if (!me.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const kind = b.kind === "anniversary" ? "anniversary" : "birthday";
    const draft = { ...c, rec: { ...c.rec, ...(b.rec && typeof b.rec === "object" ? { templates: b.rec.templates, sender: b.rec.sender, celebrate: b.rec.celebrate } : {}) } };
    const m = await celebrateMail(draft, siteUrl(req), { id: "test", name: "Alex Sample", managerName: "Jordan Lee" }, kind, kind === "anniversary" ? 3 : undefined);
    const r = await sendEmail({ to: [me.email], subject: `[Test] ${m.subject}`, text: m.text, html: m.html, fromName: m.fromName, fromBox: m.fromBox });
    return NextResponse.json({ ok: r.ok, reason: r.reason, to: me.email });
  }

  const mine = roster.find((p) => p.email?.toLowerCase() === me.email.toLowerCase());
  const manages = roster.some((p) => (p.managerEmail || "").toLowerCase() === me.email.toLowerCase());

  if (b.action === "give") {
    const to = roster.find((p) => p.id === String(b.to ?? ""));
    if (!to) return NextResponse.json({ ok: false, reason: "who" }, { status: 400 });
    if ((to.email && to.email.toLowerCase() === me.email.toLowerCase()) || to.id === mine?.id) return NextResponse.json({ ok: false, reason: "self" }, { status: 400 });
    let chain: { challengeId: string; parentId: string; depth: number } | undefined;
    if (b.pass) {
      const ck = await checkChainPass(db, clientId, String(b.pass), to.id);
      if (!ck.ok) return NextResponse.json({ ok: false, reason: ck.reason }, { status: 400 });
      // only the person holding the baton (or Ben) passes it on
      if (!me.advisor && ck.parent.to.personId !== mine?.id) return NextResponse.json({ ok: false, reason: "not_yours" }, { status: 403 });
      chain = { challengeId: ck.challenge.id, parentId: ck.parent.id, depth: ck.depth };
    }
    const s = await createShout(db, siteUrl(req), c, { to, from: { name: myName, personId: mine?.id, email: me.email, verified: true }, value: b.value ? String(b.value) : undefined, message: String(b.message ?? ""), channel: "portal", ...chain });
    return NextResponse.json({ ok: true, status: s.status, shout: s });
  }

  // start a challenge: Ben, an executive, or anyone who manages people on the roster
  if (b.action === "startChallenge") {
    if (!exec && !manages) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const kind = b.kind === "goal" ? "goal" : b.kind === "welcome" ? "welcome" : "chain";
    const id = `ch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(String(b.endsAt ?? "")) ? String(b.endsAt) : undefined;
    const title = String(b.title ?? "").trim().slice(0, 80) || CHALLENGE_INFO[kind].name;
    const ch: Challenge = {
      id,
      clientId,
      kind,
      title,
      status: "active",
      startedAt: new Date().toISOString(),
      endsAt,
      createdBy: { name: myName, email: me.email },
      ...(kind === "chain" ? { chain: { windowDays: Math.min(14, Math.max(1, Number(b.windowDays) || 3)) } } : {}),
      ...(kind === "goal" ? { goal: { target: Math.min(5000, Math.max(5, Number(b.target) || 50)), reward: String(b.reward ?? "").trim().slice(0, 120) || undefined, value: b.value && c.rec.values.includes(String(b.value)) ? String(b.value) : undefined } } : {}),
      ...(kind === "welcome" ? { welcome: { target: Math.min(20, Math.max(1, Number(b.welcomeTarget) || 5)), days: Math.min(90, Math.max(7, Number(b.welcomeDays) || 30)) } } : {}),
    };
    if (kind === "welcome" && (await challengesFor(db, clientId)).some((x) => x.kind === "welcome")) return NextResponse.json({ ok: false, reason: "welcome_on" });
    let first: Shoutout | undefined;
    if (kind === "chain") {
      const to = roster.find((p) => p.id === String(b.to ?? ""));
      if (!to || String(b.message ?? "").trim().length < 3) return NextResponse.json({ ok: false, reason: "first_link" }, { status: 400 });
      if (to.id === mine?.id) return NextResponse.json({ ok: false, reason: "self" }, { status: 400 });
      const { error } = await db.from("challenges").insert({ id, client_id: clientId, data: ch });
      if (error) return NextResponse.json({ ok: false, reason: "save_failed" }, { status: 500 });
      first = await createShout(db, siteUrl(req), c, { to, from: { name: myName, personId: mine?.id, email: me.email, verified: true }, value: b.value ? String(b.value) : undefined, message: String(b.message), channel: "portal", challengeId: id, depth: 1 });
      await db.from("challenges").update({ data: { ...ch, chain: { ...ch.chain!, rootId: first.id } } }).eq("id", id);
    } else {
      const { error } = await db.from("challenges").insert({ id, client_id: clientId, data: ch });
      if (error) return NextResponse.json({ ok: false, reason: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, challenge: ch, first });
  }

  // a nudge to recognize someone: now, or in three waves across the week
  if (b.action === "nudge") {
    const raw = String(b.audience ?? "everyone");
    const audience = (raw === "managers" || raw === "mine" || raw === "everyone" || raw.startsWith("team:") ? raw : "everyone") as NudgeAudience;
    if (!exec && !(manages && audience === "mine")) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const targets = nudgeTargets(roster, audience, me.email);
    if (!targets.length) return NextResponse.json({ ok: false, reason: "nobody" });
    // no spamming: one nudge to the same group every 3 days
    const { data: recent } = await db.from("nudges").select("data").eq("client_id", clientId).gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString());
    if (!b.force && (recent ?? []).some((r) => (r.data as Nudge).audience === audience)) return NextResponse.json({ ok: false, reason: "recent" });
    const groups = Number(b.waves) === 3 && targets.length >= 6 ? waves(targets) : [targets];
    const now = Date.now();
    const n: Nudge = {
      id: `nu${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      clientId,
      audience,
      waves: groups.length === 3 ? 3 : 1,
      line: String(b.line ?? "").trim().slice(0, 140) || pickLine(),
      note: String(b.note ?? "").trim().slice(0, 500) || undefined,
      challengeId: b.challengeId ? String(b.challengeId) : undefined,
      by: { name: myName, email: me.email },
      createdAt: new Date(now).toISOString(),
      plan: groups.map((g, i) => ({ at: new Date(now + i * 2 * 864e5).toISOString(), ids: g.map((t) => t.id) })),
    };
    await db.from("nudges").insert({ id: n.id, client_id: clientId, data: n });
    const sent = await sendNudgeWave(db, siteUrl(req), c, n, 0);
    return NextResponse.json({ ok: true, sent, total: targets.length, waves: n.waves });
  }

  if (b.action === "endChallenge") {
    const { data: row } = await db.from("challenges").select("data").eq("id", String(b.id ?? "")).eq("client_id", clientId).maybeSingle();
    const ch = row?.data as Challenge | undefined;
    if (!ch) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    if (!exec && ch.createdBy.email?.toLowerCase() !== me.email.toLowerCase()) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const next = { ...ch, status: "ended" as const };
    await db.from("challenges").update({ data: next, updated_at: new Date().toISOString() }).eq("id", ch.id);
    return NextResponse.json({ ok: true, challenge: next });
  }

  const id = String(b.id ?? "");
  const { data: row } = await db.from("shoutouts").select("data").eq("id", id).eq("client_id", clientId).maybeSingle();
  const s = row?.data as Shoutout | undefined;
  if (!s) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  if (b.action === "react") {
    const emoji = String(b.emoji ?? "");
    if (s.status !== "live" || !(REACTIONS as readonly string[]).includes(emoji)) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
    const who = `e:${me.email.toLowerCase()}`;
    const { data: had } = await db.from("shout_reactions").select("emoji").eq("shout_id", id).eq("who", who).eq("emoji", emoji).maybeSingle();
    if (had) await db.from("shout_reactions").delete().eq("shout_id", id).eq("who", who).eq("emoji", emoji);
    else await db.from("shout_reactions").insert({ shout_id: id, client_id: clientId, who, emoji });
    return NextResponse.json({ ok: true, on: !had });
  }

  if (b.action === "review") {
    if (!exec) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const approve = !!b.approve;
    const next: Shoutout = { ...s, status: approve ? "live" : "removed", reviewedBy: myName, heldReason: approve ? undefined : s.heldReason };
    await db.from("shoutouts").update({ data: next }).eq("id", id);
    if (approve && s.status === "held" && !s.reviewedBy && !s.reports) await tellThem(db, siteUrl(req), c, next);
    if (approve) await checkGoals(db, siteUrl(req), clientId, c.name).catch(() => undefined);
    return NextResponse.json({ ok: true, shout: next });
  }

  if (b.action === "remove") {
    const manages = roster.find((p) => p.id === s.to.personId)?.managerEmail === me.email.toLowerCase();
    if (!exec && !manages) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    const next: Shoutout = { ...s, status: "removed", reviewedBy: myName };
    await db.from("shoutouts").update({ data: next }).eq("id", id);
    return NextResponse.json({ ok: true, shout: next });
  }
  return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
}
